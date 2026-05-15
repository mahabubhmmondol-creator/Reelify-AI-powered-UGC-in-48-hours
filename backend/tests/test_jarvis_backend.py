"""JARVIS backend API tests."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Frontend env not always available to backend env; fallback to reading frontend/.env
if not BASE_URL:
    from pathlib import Path
    fenv = Path("/app/frontend/.env").read_text()
    for line in fenv.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session_id():
    return f"test-{uuid.uuid4().hex[:8]}"


@pytest.fixture(autouse=True, scope="session")
def _cleanup(session_id):
    yield
    try:
        requests.delete(f"{API}/jarvis/history", params={"session_id": session_id}, timeout=10)
    except Exception:
        pass


# ---------- Identity ----------
def test_identity():
    r = requests.get(f"{API}/jarvis/identity", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["user"] == "Karim"
    assert d["model"] == "claude-sonnet-4-5-20250929"
    assert isinstance(d["capabilities"], list) and len(d["capabilities"]) >= 5
    for cap in ["send_sms", "set_alarm", "web_search"]:
        assert cap in d["capabilities"]


# ---------- Chat: empty ----------
def test_chat_empty_returns_400():
    r = requests.post(f"{API}/jarvis/chat", json={"text": "", "session_id": "x"}, timeout=15)
    assert r.status_code == 400


# ---------- Chat: SMS action ----------
def test_chat_send_sms(session_id):
    sid = session_id + "-sms"
    r = requests.post(f"{API}/jarvis/chat",
                      json={"text": "Send Rakib an SMS that I will be late", "session_id": sid},
                      timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["speak"]
    # <= 2 sentences (heuristic: count . ! ?)
    sentences = [s for s in d["speak"].replace("!", ".").replace("?", ".").split(".") if s.strip()]
    assert len(sentences) <= 3  # tolerate trailing
    assert d["action"] is not None
    assert d["action"].get("type") == "send_sms"
    # 'to' and 'message' params (may be top-level on action dict)
    action = d["action"]
    to_val = action.get("to") or action.get("params", {}).get("to")
    msg_val = action.get("message") or action.get("params", {}).get("message")
    assert to_val and "rakib" in str(to_val).lower()
    assert msg_val
    # cleanup
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)


# ---------- Chat: set alarm ----------
def test_chat_set_alarm(session_id):
    sid = session_id + "-alarm"
    r = requests.post(f"{API}/jarvis/chat",
                      json={"text": "Set an alarm for 6:30 AM", "session_id": sid},
                      timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["action"] is not None
    assert d["action"].get("type") == "set_alarm"
    action_str = str(d["action"]).lower()
    assert "6:30" in action_str or "6 30" in action_str or "06:30" in action_str
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)


# ---------- Chat: web search ----------
def test_chat_web_search(session_id):
    sid = session_id + "-search"
    r = requests.post(f"{API}/jarvis/chat",
                      json={"text": "Search the web for weather in Dhaka", "session_id": sid},
                      timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["action"] is not None
    assert d["action"].get("type") == "web_search"
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)


# ---------- Chat: identity Q ----------
def test_chat_identity_question(session_id):
    sid = session_id + "-id"
    r = requests.post(f"{API}/jarvis/chat",
                      json={"text": "What is your name?", "session_id": sid},
                      timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    spk = d["speak"].lower()
    assert any(k in spk for k in ["jarvis", "karim", "sir"])
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)


# ---------- History persistence ----------
def test_history_persistence_and_clear(session_id):
    sid = session_id + "-hist"
    requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)
    r1 = requests.post(f"{API}/jarvis/chat",
                       json={"text": "Remember my favourite color is blue.", "session_id": sid},
                       timeout=60)
    assert r1.status_code == 200
    r2 = requests.post(f"{API}/jarvis/chat",
                       json={"text": "What is my favourite color?", "session_id": sid},
                       timeout=60)
    assert r2.status_code == 200
    # Memory check
    assert "blue" in r2.json()["speak"].lower()

    h = requests.get(f"{API}/jarvis/history", params={"session_id": sid}, timeout=15)
    assert h.status_code == 200
    rows = h.json()
    assert len(rows) == 4
    roles = [r["role"] for r in rows]
    assert roles == ["user", "jarvis", "user", "jarvis"]

    # clear
    d = requests.delete(f"{API}/jarvis/history", params={"session_id": sid}, timeout=10)
    assert d.status_code == 200
    assert d.json()["deleted"] == 4
    h2 = requests.get(f"{API}/jarvis/history", params={"session_id": sid}, timeout=15).json()
    assert h2 == []
