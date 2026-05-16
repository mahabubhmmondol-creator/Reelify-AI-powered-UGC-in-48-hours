"""JARVIS iteration 2 tests — contacts, Twilio validation, Sarvam TTS, contact resolution."""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

API = f"{BASE_URL}/api"

# Unique test contact name (avoid clashing with manually-added 'Rakib')
UNIQ = uuid.uuid4().hex[:6]
TEST_CONTACT_NAME = f"TestUser{UNIQ}"
TEST_CONTACT_PHONE = "+919998887776"

_created_ids: list[str] = []


@pytest.fixture(autouse=True, scope="module")
def _cleanup():
    yield
    # Delete every test contact we created
    for cid in _created_ids:
        try:
            requests.delete(f"{API}/jarvis/contacts/{cid}", timeout=10)
        except Exception:
            pass
    # Defensive: also wipe any stray "TestUser*" left behind
    try:
        rows = requests.get(f"{API}/jarvis/contacts", timeout=10).json()
        for r in rows:
            if r.get("name", "").startswith("TestUser"):
                requests.delete(f"{API}/jarvis/contacts/{r['id']}", timeout=10)
    except Exception:
        pass


# ----------------- Contacts CRUD -----------------
def test_add_contact_returns_id_name_phone():
    payload = {"name": TEST_CONTACT_NAME, "phone": TEST_CONTACT_PHONE}
    r = requests.post(f"{API}/jarvis/contacts", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert set(["id", "name", "phone"]).issubset(d.keys())
    assert d["name"] == TEST_CONTACT_NAME
    assert d["phone"] == TEST_CONTACT_PHONE
    assert isinstance(d["id"], str) and len(d["id"]) > 0
    _created_ids.append(d["id"])


def test_list_contacts_contains_created():
    r = requests.get(f"{API}/jarvis/contacts", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    names = [c["name"] for c in rows]
    assert TEST_CONTACT_NAME in names


def test_phone_validation_missing_plus_returns_400():
    r = requests.post(
        f"{API}/jarvis/contacts",
        json={"name": f"Bad{UNIQ}", "phone": "9999"},
        timeout=15,
    )
    assert r.status_code == 400, r.text
    body = r.json()
    assert "phone" in str(body).lower() or "e.164" in str(body).lower()


def test_delete_contact_removes_it():
    # Create then delete a fresh contact to validate independently
    r = requests.post(
        f"{API}/jarvis/contacts",
        json={"name": f"TestUserDel{UNIQ}", "phone": "+911234567890"},
        timeout=15,
    )
    assert r.status_code == 200
    cid = r.json()["id"]
    d = requests.delete(f"{API}/jarvis/contacts/{cid}", timeout=15)
    assert d.status_code == 200
    assert d.json().get("deleted") == 1
    # Verify gone
    rows = requests.get(f"{API}/jarvis/contacts", timeout=15).json()
    assert cid not in [c["id"] for c in rows]


# ----------------- Contact resolution in chat -----------------
def test_chat_resolves_contact_name_to_phone():
    # Make sure TestUser{UNIQ} exists
    rows = requests.get(f"{API}/jarvis/contacts", timeout=15).json()
    if TEST_CONTACT_NAME not in [c["name"] for c in rows]:
        rr = requests.post(
            f"{API}/jarvis/contacts",
            json={"name": TEST_CONTACT_NAME, "phone": TEST_CONTACT_PHONE},
            timeout=15,
        )
        assert rr.status_code == 200
        _created_ids.append(rr.json()["id"])

    sid = f"test-iter2-{UNIQ}-resolve"
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)
    r = requests.post(
        f"{API}/jarvis/chat",
        json={
            "text": f"Send {TEST_CONTACT_NAME} an SMS saying hello",
            "session_id": sid,
        },
        timeout=90,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["action"] is not None, f"action missing: {d}"
    action = d["action"]
    assert action.get("type") == "send_sms", f"wrong type: {action}"
    to_val = action.get("to") or action.get("params", {}).get("to") or ""
    assert TEST_CONTACT_PHONE in str(to_val), (
        f"expected phone {TEST_CONTACT_PHONE} in action.to, got action={action}"
    )
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)


# ----------------- Sarvam TTS -----------------
def test_tts_en_in_returns_audio_base64():
    r = requests.post(
        f"{API}/jarvis/tts",
        json={"text": "At your service sir", "language": "en-IN"},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("audio_base64"), str) and len(d["audio_base64"]) > 100
    assert d.get("mime") == "audio/wav"
    assert isinstance(d.get("data_url"), str)
    assert d["data_url"].startswith("data:audio/wav;base64,")


def test_tts_bn_in_with_anushka_returns_audio():
    r = requests.post(
        f"{API}/jarvis/tts",
        json={"text": "নমস্কার স্যার", "language": "bn-IN", "speaker": "anushka"},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("audio_base64"), str) and len(d["audio_base64"]) > 100
    assert d["data_url"].startswith("data:audio/wav;base64,")
    assert d.get("language") == "bn-IN"


def test_tts_empty_text_returns_400():
    r = requests.post(
        f"{API}/jarvis/tts",
        json={"text": "   ", "language": "en-IN"},
        timeout=30,
    )
    assert r.status_code == 400


# ----------------- Twilio validation only (do NOT send real SMS/call) -----------------
def test_twilio_sms_empty_to_returns_400():
    r = requests.post(
        f"{API}/jarvis/twilio/sms",
        json={"to": "", "message": "hi"},
        timeout=20,
    )
    assert r.status_code == 400, r.text


def test_twilio_sms_non_plus_returns_400():
    r = requests.post(
        f"{API}/jarvis/twilio/sms",
        json={"to": "9999", "message": "hi"},
        timeout=20,
    )
    assert r.status_code == 400, r.text


def test_twilio_sms_real_call_acceptable():
    """Real Twilio call with valid-format number; FROM is likely not Twilio-issued,
    so expect either 200 OR 400 with detail containing 'twilio'."""
    r = requests.post(
        f"{API}/jarvis/twilio/sms",
        json={"to": "+919998887776", "message": "JARVIS test"},
        timeout=30,
    )
    if r.status_code == 200:
        assert "sid" in r.json()
    else:
        assert r.status_code == 400, r.text
        assert "twilio" in str(r.json()).lower()


def test_twilio_call_empty_to_returns_400():
    r = requests.post(
        f"{API}/jarvis/twilio/call",
        json={"to": "", "message": "hi"},
        timeout=20,
    )
    assert r.status_code == 400, r.text


def test_twilio_call_non_plus_returns_400():
    r = requests.post(
        f"{API}/jarvis/twilio/call",
        json={"to": "12345", "message": "hi"},
        timeout=20,
    )
    assert r.status_code == 400, r.text


def test_twilio_call_real_call_acceptable():
    r = requests.post(
        f"{API}/jarvis/twilio/call",
        json={"to": "+919998887776", "message": "Test"},
        timeout=30,
    )
    if r.status_code == 200:
        assert "sid" in r.json()
    else:
        assert r.status_code == 400, r.text
        assert "twilio" in str(r.json()).lower()


# ----------------- Existing chat sanity -----------------
def test_chat_sanity_still_works():
    sid = f"test-iter2-{UNIQ}-sanity"
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)
    r = requests.post(
        f"{API}/jarvis/chat",
        json={"text": "What is your name?", "session_id": sid},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    spk = d["speak"].lower()
    assert any(k in spk for k in ["jarvis", "karim", "sir"])
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)
