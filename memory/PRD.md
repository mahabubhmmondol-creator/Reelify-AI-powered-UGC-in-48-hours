# JARVIS — Personal AI Assistant for Karim

## Original Problem Statement
Build a JARVIS-style personal AI assistant exclusively for Karim. Calm, direct, "sir"-addressing, JSON action-block output, simulated actions (SMS, calls, alarms, search, email, device control), persistent memory, voice in/out.

## Architecture
- **Brain**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via emergentintegrations LlmChat, EMERGENT_LLM_KEY
- **Backend**: FastAPI + MongoDB (`jarvis_messages` collection). Endpoints: `/api/jarvis/chat`, `/api/jarvis/history` (GET/DELETE), `/api/jarvis/identity`
- **Frontend**: React single-page tactical console. Web Speech API for voice in (SpeechRecognition) + voice out (SpeechSynthesis). State machine: IDLE → LISTENING → PROCESSING → SPEAKING
- **Memory**: Persistent in MongoDB, session_id=`karim-default`, compact transcript replayed in prompt

## User Personas
- Karim — single owner; system prompt is hard-locked to him

## Core Requirements (Static)
- JSON `{speak, action}` on every reply
- Address as "sir" / Karim only
- ≤ 2 sentence spoken responses
- One clarifying question max
- Confirm after acting, not before

## What's Implemented (2026-02)
- ✅ JARVIS persona + system prompt locked to Karim
- ✅ Action extraction for: send_sms, make_call, open_app, read_notifications, set_alarm, set_reminder, web_search, read_email, compose_email, control_device
- ✅ Persistent MongoDB memory + clear-memory button
- ✅ Web Speech API mic input + TTS output (toggleable)
- ✅ Tactical-minimalism UI: system status, capability grid, action cards, waveform indicator, typewriter effect
- ✅ Backend 100%, frontend 100% on testing subagent (iteration_1)

## Backlog
- **P1**: Real integrations (Twilio SMS/calls — requires user's Twilio creds)
- **P1**: Higher-quality voice via OpenAI TTS (more natural than browser TTS)
- **P2**: Wake-word ("Hey JARVIS") continuous listening
- **P2**: Multi-session support, action history filter
- **P2**: Optional user auth so the assistant is truly private
- **P3**: Action replay — re-execute prior action cards with one click
