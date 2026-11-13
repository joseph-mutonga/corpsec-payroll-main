import os
import json
import uuid
import datetime
from typing import Dict, List, Optional, Any
from fastapi import WebSocket
from sqlalchemy.orm import Session

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


class VoiceProviderService:
    """
    Programmable Voice Abstraction supporting Twilio, Africa's Talking,
    WebRTC in-browser audio, and standalone simulated PBX.
    """
    def __init__(self):
        # Environment configuration placeholders
        self.provider = os.getenv("VOICE_PROVIDER", "TWILIO")  # TWILIO, AFRICAS_TALKING, WEBRTC_SIMULATOR
        self.twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID", "AC_placeholder_corpsec_callcenter")
        self.twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN", "auth_placeholder_corpsec")
        self.twilio_twiml_app_sid = os.getenv("TWILIO_TWIML_APP_SID", "AP_placeholder_twiml")
        self.africastalking_username = os.getenv("AT_USERNAME", "corpsec_voice")
        self.africastalking_api_key = os.getenv("AT_API_KEY", "at_placeholder_api_key")
        self.default_caller_id = os.getenv("DEFAULT_CALLER_ID", "+254 20 790 0000")

    def generate_webrtc_token(self, agent_identity: str) -> Dict[str, Any]:
        """
        Generates client credentials/token for in-browser WebRTC softphone voice streaming.
        """
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

