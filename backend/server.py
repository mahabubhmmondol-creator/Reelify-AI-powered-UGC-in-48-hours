from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import re
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

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
    "to": "Rakib",
    "message": "..."
  }
}

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
            f"[Prior session transcript for memory — do not repeat]\n{compact}\n\n"
            f"[Current message from Karim]\n{user_text}"
        )
    else:
        prompt_text = user_text

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
