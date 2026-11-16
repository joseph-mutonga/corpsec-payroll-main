import os
import re
import json
import uuid
import datetime
import urllib.request
import urllib.parse
import urllib.error
from typing import Dict, List, Optional, Any
from fastapi import WebSocket
from sqlalchemy.orm import Session

from application.backend.app.core.config import settings
from application.backend.app.models.call_center import (
    CallQueue,
    QueueMember,
    AgentStatus,
    CallLog,
    PhoneNumber,
    CallerContact
)
from application.backend.app.models.user import User


class CallCenterWebSocketManager:
    """
    Manages active WebSocket connections from call centre agents.
    Provides targeted agent messaging (incoming call alert) and broad channel broadcasts (queue updates).
    """
    def __init__(self):
        # Maps user_id -> List[WebSocket]
        self.active_agents: Dict[int, List[WebSocket]] = {}
        # All connected sockets for broadcast
        self.all_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_agents:
            self.active_agents[user_id] = []
        self.active_agents[user_id].append(websocket)
        self.all_connections.append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_agents:
            if websocket in self.active_agents[user_id]:
                self.active_agents[user_id].remove(websocket)
            if not self.active_agents[user_id]:
                del self.active_agents[user_id]
        if websocket in self.all_connections:
            self.all_connections.remove(websocket)

    async def send_to_agent(self, user_id: int, event: str, data: Any):
        """Send message specifically to all open tabs of an agent."""
        if user_id in self.active_agents:
            payload = json.dumps({"event": event, "data": data})
            dead_sockets = []
            for ws in self.active_agents[user_id]:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead_sockets.append(ws)
            for ws in dead_sockets:
                self.disconnect(ws, user_id)

    async def broadcast(self, event: str, data: Any):
        """Broadcast message to all connected call centre clients."""
        payload = json.dumps({"event": event, "data": data})
        dead_sockets = []
        for ws in self.all_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead_sockets.append(ws)
        for ws in dead_sockets:
            if ws in self.all_connections:
                self.all_connections.remove(ws)


ws_manager = CallCenterWebSocketManager()


def format_e164(phone: str) -> str:
    """
    Normalizes a phone number to standard E.164 format (+254...).
    Accepts: '0741630443', '0113346350', '+254 741 630 443', '254741630443', etc.
    """
    if not phone:
        return ""
    clean = re.sub(r"[^\d+]", "", str(phone).strip())
    if clean.startswith("+"):
        return clean
    if clean.startswith("254"):
        return f"+{clean}"
    if clean.startswith("0") and len(clean) >= 10:
        return f"+254{clean[1:]}"
    return f"+254{clean}"


class VoiceProviderService:
    """
    Programmable Voice Abstraction supporting Twilio, Africa's Talking,
    WebRTC in-browser audio, and standalone simulated PBX.
    """
    def __init__(self):
        # Environment configuration placeholders
        self.provider = getattr(settings, "VOICE_PROVIDER", None) or os.getenv("VOICE_PROVIDER", "AFRICAS_TALKING")  # TWILIO, AFRICAS_TALKING, WEBRTC_SIMULATOR
        self.twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID", "AC_placeholder_corpsec_callcenter")
        self.twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN", "auth_placeholder_corpsec")
        self.twilio_twiml_app_sid = os.getenv("TWILIO_TWIML_APP_SID", "AP_placeholder_twiml")

    @property
    def at_username(self) -> str:
        return getattr(settings, "AT_USERNAME", None) or os.getenv("AT_USERNAME", "corpsec")

    @property
    def at_api_key(self) -> str:
        return getattr(settings, "AT_API_KEY", None) or os.getenv("AT_API_KEY", "")

    @property
    def default_caller_id(self) -> str:
        return getattr(settings, "DEFAULT_CALLER_ID", None) or os.getenv("DEFAULT_CALLER_ID", "+254 711 082 143")

    def initiate_africastalking_call(self, to_phone: str, from_phone: Optional[str] = None) -> Dict[str, Any]:
        """
        Calls Africa's Talking Voice API to place an outbound call.
        Returns dict with success status, sessionId, and any error message.
        """
        username = self.at_username
        api_key = self.at_api_key
        caller_id = format_e164(from_phone or self.default_caller_id)
        destination = format_e164(to_phone)

        if not api_key:
            return {"success": False, "error": "Africa's Talking API key (AT_API_KEY) is not configured in .env"}

        url = "https://voice.africastalking.com/call"
        payload = urllib.parse.urlencode({
            "username": username,
            "from": caller_id,
            "to": destination
        }).encode("utf-8")

        headers = {
            "apiKey": api_key,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
        }

        req = urllib.request.Request(url, data=payload, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                body = res.read().decode("utf-8")
                data = json.loads(body)
                error_msg = data.get("errorMessage")
                if error_msg and error_msg != "None":
                    return {"success": False, "error": error_msg, "raw": data}
                entries = data.get("entries", [])
                if entries:
                    entry = entries[0]
                    entry_status = entry.get("status", "")
                    if entry_status.lower() in ["queued", "success"]:
                        return {
                            "success": True,
                            "session_id": entry.get("sessionId"),
                            "status": entry_status,
                            "phone_number": entry.get("phoneNumber"),
                            "raw": data
                        }
                    else:
                        return {"success": False, "error": f"Call entry status: {entry_status}", "raw": data}
                return {"success": False, "error": "No entries returned from Africa's Talking", "raw": data}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            try:
                err_json = json.loads(err_body)
                detail = err_json.get("errorMessage") or err_json.get("detail") or err_body
            except Exception:
                detail = err_body
            return {"success": False, "error": f"Africa's Talking HTTP {e.code}: {detail}"}
        except Exception as ex:
            return {"success": False, "error": f"Failed to connect to Africa's Talking: {str(ex)}"}

    def generate_webrtc_token(self, agent_identity: str, phone_number: Optional[str] = None) -> Dict[str, Any]:
        """
        Generates client credentials/token for in-browser WebRTC softphone voice streaming.
        If provider is AFRICAS_TALKING, requests a real capability token from Africa's Talking.
        """
        provider = os.getenv("VOICE_PROVIDER", "AFRICAS_TALKING").upper()
        if "AFRICA" in provider and self.at_api_key:
            caller_num = format_e164(phone_number or self.default_caller_id)
            url = "https://webrtc.africastalking.com/capability-token/request"
            payload = json.dumps({
                "username": self.at_username,
                "clientName": agent_identity.replace("@", "_").replace(".", "_"),
                "phoneNumber": caller_num,
                "incoming": True,
                "outgoing": True
            }).encode("utf-8")
            headers = {
                "apiKey": self.at_api_key,
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            try:
                req = urllib.request.Request(url, data=payload, headers=headers)
                with urllib.request.urlopen(req, timeout=10) as res:
                    data = json.loads(res.read().decode("utf-8"))
                    return {
                        "token": data.get("token"),
                        "client_name": data.get("clientName", agent_identity),
                        "life_time_sec": data.get("lifeTimeSec", 86400),
                        "provider": "AFRICAS_TALKING",
                        "incoming": data.get("incoming", True),
                        "outgoing": data.get("outgoing", True),
                        "phone_number": caller_num
                    }
            except Exception:
                pass

        token_id = f"vtoken_{uuid.uuid4().hex[:16]}"
        return {
            "token": token_id,
            "identity": agent_identity,
            "provider": self.provider,
            "webrtc_gateway": "wss://voice.corpsec.co.ke/webrtc",
            "ice_servers": [
                {"urls": ["stun:stun.l.google.com:19302"]},
                {"urls": ["stun:global.stun.twilio.com:3478"]}
            ],
            "expires_in_seconds": 3600
        }

    def route_inbound_call(self, db: Session, queue_id: int) -> Optional[int]:
        """
        ACD (Automated Call Distribution) Logic:
        Finds the most eligible Available agent assigned to the specified queue.
        Supports ROUND_ROBIN and LONGEST_IDLE strategies.
        """
        queue = db.query(CallQueue).filter(CallQueue.id == queue_id).first()
        if not queue:
            return None

        # Get queue members who are not paused
        members = db.query(QueueMember).filter(
            QueueMember.queue_id == queue_id,
            QueueMember.is_paused == False
        ).order_by(QueueMember.priority.asc()).all()

        if not members:
            return None

        member_user_ids = [m.user_id for m in members]

        # Query available agents
        available_statuses = db.query(AgentStatus).filter(
            AgentStatus.user_id.in_(member_user_ids),
            AgentStatus.status == "AVAILABLE"
        ).all()

        if not available_statuses:
            return None

        avail_dict = {s.user_id: s for s in available_statuses}

        # Strategy Selection
        if queue.strategy == "LONGEST_IDLE":
            # Agent who has been in AVAILABLE status the longest
            selected = min(available_statuses, key=lambda x: x.last_status_change)
            return selected.user_id
        elif queue.strategy == "ROUND_ROBIN":
            # Agent who has handled the least calls today among queue members
            selected = min(available_statuses, key=lambda x: x.calls_taken_today)
            return selected.user_id
        else:
            # RING_ALL / First available
            return available_statuses[0].user_id


voice_service = VoiceProviderService()

