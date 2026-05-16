from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import re
import uuid
import base64
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_FROM = os.environ.get("TWILIO_FROM_NUMBER")
SARVAM_KEY = os.environ.get("SARVAM_API_KEY")
SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"

# Hard-locked user identity (per system prompt: "built exclusively for Karim")
LOCKED_USER = "karim"

JARVIS_SYSTEM_PROMPT = """You are JARVIS — a personal AI assistant built exclusively for Karim.

IDENTITY:
- You speak in a calm, direct, human tone. No filler. No corporate language.
- You address the user as "sir" or by name (Karim), never formally.
- You remember context within the session and act on it.

CAPABILITIES YOU HAVE ACCESS TO:
- Send SMS
- Make phone calls
- Open any app
- Read notifications
- Set alarms and reminders
- Search the web and summarize results
- Read and compose emails
- Control device settings (WiFi, Bluetooth, volume, brightness)
- Execute any task the user delegates verbally

BEHAVIOR RULES:
1. When the user gives a command, extract the ACTION and PARAMETERS immediately.
2. Return a JSON action block alongside your spoken response.
3. If a task needs clarification, ask ONE question only.
4. Never explain what you're about to do — just do it and confirm after.
5. If a task is outside current capability, say exactly what's missing to enable it.
6. Keep spoken responses under 2 sentences unless asked to elaborate.

OUTPUT FORMAT — EVERY reply MUST be a single valid JSON object, nothing else, no markdown fences:
{
  "speak": "Done. Message sent to Rakib.",
  "action": {
    "type": "send_sms",
    "to": "+919876543210",
    "message": "..."
  }
}

CONTACT RESOLUTION RULE (CRITICAL):
- For send_sms and make_call actions, the "to" field MUST be a phone number in E.164 format (e.g. +919876543210), NEVER a contact name.
- If the user mentions a person by name and that name appears in the [Contacts known to JARVIS] block, you MUST substitute the matching phone number into "to".
- If the name is NOT in the contacts block, ask one clarifying question for the number (do not invent one).

If there is no action to execute, set action to null:
{
  "speak": "Your response here.",
  "action": null
}

ACTION TYPES you may emit: send_sms, make_call, open_app, read_notifications, set_alarm, set_reminder, web_search, read_email, compose_email, control_device, custom.
For control_device include a "setting" (wifi|bluetooth|volume|brightness) and a "value".

PERSONALITY:
- Efficient, loyal, slightly dry humor when appropriate.
- Never repetitive. Never apologetic without cause.
- Confirm after acting, not before.

Respond ONLY with the JSON object — no preamble, no code fences, no commentary."""


# ---------- Models ----------
class ChatRequest(BaseModel):
    text: str
    session_id: Optional[str] = None


class ActionBlock(BaseModel):
    type: str
    # arbitrary parameters
    params: Dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    id: str
    session_id: str
    speak: str
    action: Optional[Dict[str, Any]] = None
    raw: Optional[str] = None
    timestamp: str


class MessageRecord(BaseModel):
    id: str
    session_id: str
    role: str  # "user" | "jarvis"
    text: str
    action: Optional[Dict[str, Any]] = None
    timestamp: str


# ---------- App ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_json(raw: str) -> Dict[str, Any]:
    """Pull the first JSON object from a model response, tolerating fences."""
    if not raw:
        return {"speak": "", "action": None}
    # Strip code fences
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    # Try direct parse
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    # Find first {...} block
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    # Fallback: treat the whole thing as speech
    return {"speak": cleaned, "action": None}


@api_router.get("/")
async def root():
    return {"service": "jarvis", "user": LOCKED_USER, "status": "online"}


@api_router.post("/jarvis/chat", response_model=ChatResponse)
async def jarvis_chat(req: ChatRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    session_id = req.session_id or f"{LOCKED_USER}-default"
    user_text = (req.text or "").strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="empty message")

    # Persist user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "user",
        "text": user_text,
        "action": None,
        "timestamp": _now_iso(),
    }
    await db.jarvis_messages.insert_one(dict(user_msg))

    # Load prior history (last 30) for memory
    prior_cursor = db.jarvis_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("timestamp", 1)
    prior = await prior_cursor.to_list(200)
    # Exclude the just-inserted user message from replay since LlmChat will send it now
    prior_excl = [m for m in prior if m["id"] != user_msg["id"]]

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=JARVIS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    # Pull contacts so JARVIS can resolve names -> numbers in action JSON
    contacts = await db.jarvis_contacts.find({}, {"_id": 0}).to_list(200)
    contacts_block = ""
    if contacts:
        lines = [f"- {c['name']}: {c['phone']}" for c in contacts]
        contacts_block = "\n[Contacts known to JARVIS]\n" + "\n".join(lines) + "\n"

    # Replay history so JARVIS has context. emergentintegrations LlmChat
    # does not expose a direct messages-array constructor, so we feed the
    # most recent user turn and rely on the system prompt + on-the-wire
    # history embedded in the latest user message for compactness.
    if prior_excl:
        # Build a compact transcript summary appended to user text
        transcript_lines = []
        for m in prior_excl[-20:]:
            who = "Karim" if m["role"] == "user" else "JARVIS"
            line = f"{who}: {m['text']}"
            transcript_lines.append(line)
        compact = "\n".join(transcript_lines)
        prompt_text = (
            f"{contacts_block}"
            f"[Prior session transcript for memory — do not repeat]\n{compact}\n\n"
            f"[Current message from Karim]\n{user_text}"
        )
    else:
        prompt_text = (contacts_block + "\n" if contacts_block else "") + user_text

    try:
        raw_response = await chat.send_message(UserMessage(text=prompt_text))
    except Exception as e:
        logging.exception("LLM error")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    parsed = _extract_json(raw_response if isinstance(raw_response, str) else str(raw_response))
    speak = str(parsed.get("speak") or "").strip() or "Acknowledged."
    action = parsed.get("action")
    if action is not None and not isinstance(action, dict):
        action = None

    jarvis_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "jarvis",
        "text": speak,
        "action": action,
        "timestamp": _now_iso(),
    }
    await db.jarvis_messages.insert_one(dict(jarvis_msg))

    return ChatResponse(
        id=jarvis_msg["id"],
        session_id=session_id,
        speak=speak,
        action=action,
        raw=raw_response if isinstance(raw_response, str) else None,
        timestamp=jarvis_msg["timestamp"],
    )


@api_router.get("/jarvis/history", response_model=List[MessageRecord])
async def jarvis_history(session_id: Optional[str] = None):
    sid = session_id or f"{LOCKED_USER}-default"
    cur = db.jarvis_messages.find({"session_id": sid}, {"_id": 0}).sort("timestamp", 1)
    rows = await cur.to_list(500)
    return [MessageRecord(**r) for r in rows]


@api_router.delete("/jarvis/history")
async def clear_history(session_id: Optional[str] = None):
    sid = session_id or f"{LOCKED_USER}-default"
    res = await db.jarvis_messages.delete_many({"session_id": sid})
    return {"deleted": res.deleted_count, "session_id": sid}


@api_router.get("/jarvis/identity")
async def jarvis_identity():
    return {
        "user": "Karim",
        "assistant": "JARVIS",
        "model": "claude-sonnet-4-5-20250929",
        "capabilities": [
            "send_sms",
            "make_call",
            "open_app",
            "read_notifications",
            "set_alarm",
            "set_reminder",
            "web_search",
            "read_email",
            "compose_email",
            "control_device",
        ],
    }


# ============================================================
# Contacts (so JARVIS can resolve "send Rakib an SMS" -> phone)
# ============================================================
class ContactIn(BaseModel):
    name: str
    phone: str


class ContactRecord(BaseModel):
    id: str
    name: str
    phone: str


@api_router.get("/jarvis/contacts", response_model=List[ContactRecord])
async def list_contacts():
    rows = await db.jarvis_contacts.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return [ContactRecord(**r) for r in rows]


@api_router.post("/jarvis/contacts", response_model=ContactRecord)
async def add_contact(c: ContactIn):
    name = c.name.strip()
    phone = c.phone.strip()
    if not name or not phone:
        raise HTTPException(status_code=400, detail="name and phone are required")
    if not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="phone must be E.164 (e.g. +91...)")
    doc = {"id": str(uuid.uuid4()), "name": name, "phone": phone}
    await db.jarvis_contacts.insert_one(dict(doc))
    return ContactRecord(**doc)


@api_router.delete("/jarvis/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    res = await db.jarvis_contacts.delete_one({"id": contact_id})
    return {"deleted": res.deleted_count}


# ============================================================
# Twilio — real SMS + voice calls
# ============================================================
def _twilio_client() -> TwilioClient:
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM):
        raise HTTPException(status_code=500, detail="Twilio credentials not configured")
    return TwilioClient(TWILIO_SID, TWILIO_TOKEN)


class SmsIn(BaseModel):
    to: str
    message: str


class CallIn(BaseModel):
    to: str
    message: Optional[str] = "Hello sir. This is JARVIS, calling on Karim's behalf."


@api_router.post("/jarvis/twilio/sms")
async def twilio_send_sms(req: SmsIn):
    to = req.to.strip()
    if not to.startswith("+"):
        raise HTTPException(status_code=400, detail="'to' must be in E.164 format (+91...)")
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="empty message")
    twc = _twilio_client()
    try:
        msg = twc.messages.create(body=req.message, from_=TWILIO_FROM, to=to)
        return {"sid": msg.sid, "status": msg.status, "to": to}
    except TwilioRestException as e:
        raise HTTPException(status_code=400, detail=f"twilio: {e.msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/jarvis/twilio/call")
async def twilio_make_call(req: CallIn):
    to = req.to.strip()
    if not to.startswith("+"):
        raise HTTPException(status_code=400, detail="'to' must be in E.164 format (+91...)")
    twc = _twilio_client()
    say_text = (req.message or "").strip() or "Hello."
    # Escape minimal XML
    safe = (
        say_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    twiml = f'<Response><Say voice="alice">{safe}</Say></Response>'
    try:
        call = twc.calls.create(twiml=twiml, from_=TWILIO_FROM, to=to)
        return {"sid": call.sid, "status": call.status, "to": to}
    except TwilioRestException as e:
        raise HTTPException(status_code=400, detail=f"twilio: {e.msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Sarvam AI TTS — premium voice (Indian languages + en-IN)
# ============================================================
class TtsIn(BaseModel):
    text: str
    language: Optional[str] = "en-IN"  # en-IN | bn-IN | hi-IN | ...
    speaker: Optional[str] = "anushka"
    model: Optional[str] = "bulbul:v2"


@api_router.post("/jarvis/tts")
async def sarvam_tts(req: TtsIn):
    if not SARVAM_KEY:
        raise HTTPException(status_code=500, detail="SARVAM_API_KEY not configured")
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    # Sarvam REST limit is ~500 chars per request for v2 (safe trim)
    if len(text) > 1500:
        text = text[:1500]

    payload = {
        "text": text,
        "target_language_code": req.language or "en-IN",
        "speaker": req.speaker or "anushka",
        "model": req.model or "bulbul:v2",
        "pitch": 0,
        "pace": 1.0,
        "loudness": 1.2,
        "speech_sample_rate": 22050,
        "enable_preprocessing": True,
    }
    headers = {"api-subscription-key": SARVAM_KEY, "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=30) as cli:
            r = await cli.post(SARVAM_TTS_URL, json=payload, headers=headers)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"sarvam: {r.status_code} {r.text[:200]}")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"sarvam error: {e}")

    audios = data.get("audios") or []
    if not audios:
        raise HTTPException(status_code=502, detail="sarvam returned no audio")
    # Concatenate (rare multi-chunk) — return as data URL for direct <audio> use
    audio_b64 = audios[0]
    return {
        "audio_base64": audio_b64,
        "mime": "audio/wav",
        "data_url": f"data:audio/wav;base64,{audio_b64}",
        "language": payload["target_language_code"],
        "speaker": payload["speaker"],
    }




# Mount router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
