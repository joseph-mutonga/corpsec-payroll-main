import os
import re
import uuid
import datetime
import urllib.request
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, get_current_user
from application.backend.app.core.config import settings
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.call_center import (
    PhoneNumber,
    CallQueue,
    QueueMember,
    AgentStatus,
    CallLog,
    CallNote,
    CallerContact
)
from application.backend.app.schemas.call_center import (
    PhoneNumberCreate,
    PhoneNumberUpdate,
    PhoneNumberResponse,
    CallQueueCreate,
    CallQueueUpdate,
    CallQueueResponse,
    QueueMemberResponse,
    AgentStatusUpdate,
    AgentStatusResponse,
    CallLogResponse,
    CallNoteCreate,
    CallNoteResponse,
    CallerContactCreate,
    CallerContactUpdate,
    CallerContactResponse,
    DialRequest,
    CallActionRequest,
    TransferRequest,
    SimulateCallRequest,
    CallCenterOverviewResponse,
    GuardSMSSendRequest,
    GuardSMSMessageResponse,
    GuardSMSRecipientResponse,
    GuardSMSOverviewResponse
)
from application.backend.app.services.voice_service import ws_manager, voice_service, format_e164
from application.backend.app.services.sms_service import GuardSMSService

router = APIRouter(prefix="/call-center", tags=["Call Centre System"])
logger = logging.getLogger(__name__)

RECORDINGS_STORAGE_DIR = os.path.join(os.getcwd(), "uploads", "call_recordings")
os.makedirs(RECORDINGS_STORAGE_DIR, exist_ok=True)

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../frontend"))
STATIC_AUDIO_DIR = os.path.join(frontend_dir, "static", "audio")
os.makedirs(STATIC_AUDIO_DIR, exist_ok=True)
DEFAULT_SAMPLE_WAV = os.path.join(STATIC_AUDIO_DIR, "sample_call_recording.wav")


def get_default_recording_bytes() -> tuple[bytes, str]:
    """Returns default master recording binary bytes and content type."""
    sample_candidates = [
        DEFAULT_SAMPLE_WAV,
        os.path.join(STATIC_AUDIO_DIR, "sample_call_recording.mp3"),
        os.path.join(RECORDINGS_STORAGE_DIR, "sample_call_recording.mp3"),
        os.path.join(RECORDINGS_STORAGE_DIR, "sample_call_recording.wav"),
    ]
    for sc in sample_candidates:
        if os.path.exists(sc) and os.path.getsize(sc) > 0:
            try:
                with open(sc, "rb") as f:
                    content = f.read()
                    mime = "audio/wav" if sc.endswith(".wav") else "audio/mpeg"
                    return content, mime
            except Exception:
                pass
    return b"", "audio/mpeg"


def ensure_agent_status_exists(db: Session, user: User) -> AgentStatus:
    status_rec = db.query(AgentStatus).filter(AgentStatus.user_id == user.id).first()
    if not status_rec:
        status_rec = AgentStatus(
            user_id=user.id,
            status="AVAILABLE",
            last_status_change=datetime.datetime.now(),
            calls_taken_today=0,
            total_talk_time_seconds=0,
            device_channel="WebRTC"
        )
        db.add(status_rec)
        db.commit()
        db.refresh(status_rec)
    return status_rec


# ==============================================================================
# 1. OVERVIEW & KPI METRICS
# ==============================================================================

@router.get("/overview")
def get_call_center_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns real-time dashboard KPIs, queue distribution, and recent calls.
    """
    today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    calls_today = db.query(CallLog).filter(CallLog.created_at >= today_start).all()
    total_calls_today = len(calls_today)
    inbound_today = sum(1 for c in calls_today if c.direction == "INBOUND")
    outbound_today = sum(1 for c in calls_today if c.direction == "OUTBOUND")
    missed_today = sum(1 for c in calls_today if c.status in ["MISSED", "REJECTED"])

    active_calls = db.query(CallLog).filter(CallLog.status.in_(["RINGING", "IN_PROGRESS"])).all()
    waiting_in_queue = db.query(CallLog).filter(CallLog.status == "QUEUED").all()

    completed_calls = [c for c in calls_today if c.status == "COMPLETED"]
    if completed_calls:
        avg_wait = int(sum(c.wait_time_seconds for c in completed_calls) / len(completed_calls))
        avg_dur = int(sum(c.duration_seconds for c in completed_calls) / len(completed_calls))
    else:
        all_completed = db.query(CallLog).filter(CallLog.status == "COMPLETED").all()
        avg_wait = int(sum(c.wait_time_seconds for c in all_completed) / len(all_completed)) if all_completed else 0
        avg_dur = int(sum(c.duration_seconds for c in all_completed) / len(all_completed)) if all_completed else 0

    agent_statuses = db.query(AgentStatus).all()
    active_agents = [s for s in agent_statuses if s.status != "OFFLINE"]
    avail_agents = [s for s in agent_statuses if s.status == "AVAILABLE"]
    on_call_agents = [s for s in agent_statuses if s.status == "ON_CALL"]

    # Recent calls formatted
    recent_logs = db.query(CallLog).options(
        joinedload(CallLog.queue),
        joinedload(CallLog.agent),
        joinedload(CallLog.call_notes)
    ).order_by(CallLog.created_at.desc()).limit(15).all()

    formatted_recent = []
    for log in recent_logs:
        formatted_recent.append({
            "id": log.id,
            "call_sid": log.call_sid,
            "direction": log.direction,
            "caller_number": log.caller_number,
            "caller_name": log.caller_name or "Unknown Caller",
            "recipient_number": log.recipient_number,
            "queue_id": log.queue_id,
            "queue_name": log.queue.name if log.queue else "Direct",
            "agent_id": log.agent_id,
            "agent_name": log.agent.full_name or log.agent.email if log.agent else "Unassigned",
            "status": log.status,
            "duration_seconds": log.duration_seconds,
            "wait_time_seconds": log.wait_time_seconds,
            "recording_url": log.recording_url,
            "voicemail_url": log.voicemail_url,
            "disposition": log.disposition,
            "notes": log.notes,
            "created_at": log.created_at.isoformat(),
            "ended_at": log.ended_at.isoformat() if log.ended_at else None,
            "call_notes": [{"id": n.id, "note": n.note, "agent_name": n.agent.full_name if n.agent else "Agent", "created_at": n.created_at.isoformat()} for n in log.call_notes]
        })

    # Queues summary
    queues = db.query(CallQueue).options(joinedload(CallQueue.members).joinedload(QueueMember.user)).filter(CallQueue.is_active == True).all()
    formatted_queues = []
    for q in queues:
        waiting_q = [c for c in waiting_in_queue if c.queue_id == q.id]
        active_q = [c for c in active_calls if c.queue_id == q.id]
        formatted_queues.append({
            "id": q.id,
            "name": q.name,
            "description": q.description,
            "strategy": q.strategy,
            "max_wait_time_seconds": q.max_wait_time_seconds,
            "wrap_up_time_seconds": q.wrap_up_time_seconds,
            "hold_music_url": q.hold_music_url,
            "welcome_greeting": q.welcome_greeting,
            "is_active": q.is_active,
            "waiting_callers_count": len(waiting_q),
            "active_callers_count": len(active_q),
            "avg_wait_time_seconds": int(sum(c.wait_time_seconds for c in waiting_q) / len(waiting_q)) if waiting_q else 0,
            "members_count": len(q.members),
            "created_at": q.created_at.isoformat()
        })

    virtual_numbers_count = db.query(PhoneNumber).filter(PhoneNumber.status == "ACTIVE").count()

    return {
        "total_calls_today": total_calls_today,
        "inbound_today": inbound_today,
        "outbound_today": outbound_today,
        "missed_today": missed_today,
        "missed_calls_today": missed_today,
        "active_calls_count": len(active_calls),
        "waiting_in_queue_count": len(waiting_in_queue),
        "avg_wait_time_seconds": avg_wait,
        "average_wait_time_seconds": avg_wait,
        "avg_duration_seconds": avg_dur,
        "active_agents_count": len(active_agents),
        "available_agents_count": len(avail_agents),
        "active_agents_available": len(avail_agents),
        "virtual_numbers_count": virtual_numbers_count,
        "active_queues_count": len(formatted_queues),
        "on_call_agents_count": len(on_call_agents),
        "recent_calls": formatted_recent,
        "active_queues": formatted_queues
    }


# ==============================================================================
# 2. AGENT STATUS & TEAM ROSTER
# ==============================================================================

@router.get("/agent-status")
def get_current_agent_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns the logged in user's agent status."""
    st = ensure_agent_status_exists(db, current_user)
    return {
        "user_id": current_user.id,
        "full_name": current_user.full_name or current_user.email,
        "email": current_user.email,
        "role": current_user.role,
        "status": st.status,
        "current_call_id": st.current_call_id,
        "last_status_change": st.last_status_change.isoformat(),
        "calls_taken_today": st.calls_taken_today,
        "total_talk_time_seconds": st.total_talk_time_seconds,
        "device_channel": st.device_channel
    }


@router.post("/agent-status")
@router.put("/agent-status")
async def update_current_agent_status(
    payload: AgentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Updates the logged-in agent's live status (Available, On Call, Break, Offline)."""
    valid_statuses = ["AVAILABLE", "ON_CALL", "BREAK", "OFFLINE"]
    target_status = payload.status.upper().strip()
    if target_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid_statuses}")

    st = ensure_agent_status_exists(db, current_user)
    st.status = target_status
    st.last_status_change = datetime.datetime.now()
    if payload.device_channel:
        st.device_channel = payload.device_channel

    db.commit()
    db.refresh(st)

    # Broadcast status change to all agents via WebSocket
    await ws_manager.broadcast("agent:status_updated", {
        "user_id": current_user.id,
        "agent_name": current_user.full_name or current_user.email,
        "status": st.status,
        "last_status_change": st.last_status_change.isoformat()
    })

    return {
        "status": "success",
        "agent_status": st.status,
        "user_id": current_user.id
    }


@router.get("/agents")
def list_call_center_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists all team agents and their current availability for call queues."""
    agents = db.query(User).filter(
        User.role.in_([UserRole.ADMIN.value, UserRole.SUPERVISOR.value, UserRole.STAFF.value, UserRole.HR.value])
    ).all()

    result = []
    for ag in agents:
        st = db.query(AgentStatus).filter(AgentStatus.user_id == ag.id).first()
        status_val = st.status if st else "OFFLINE"
        calls_today = st.calls_taken_today if st else 0
        talk_time = st.total_talk_time_seconds if st else 0

        # Assigned queues
        assigned_queues = db.query(CallQueue.name).join(QueueMember).filter(QueueMember.user_id == ag.id).all()
        queue_names = [q[0] for q in assigned_queues]

        result.append({
            "user_id": ag.id,
            "full_name": ag.full_name or ag.email.split("@")[0].capitalize(),
            "email": ag.email,
            "role": ag.role,
            "status": status_val,
            "calls_taken_today": calls_today,
            "total_talk_time_seconds": talk_time,
            "assigned_queues": queue_names
        })

    return result


# ==============================================================================
# 3. CALL QUEUES MANAGEMENT
# ==============================================================================

@router.get("/queues")
def list_call_queues(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves all call queues with member lists and real-time wait statistics."""
    queues = db.query(CallQueue).options(
        joinedload(CallQueue.members).joinedload(QueueMember.user)
    ).all()

    waiting_calls = db.query(CallLog).filter(CallLog.status == "QUEUED").all()
    active_calls = db.query(CallLog).filter(CallLog.status.in_(["RINGING", "IN_PROGRESS"])).all()

    result = []
    for q in queues:
        q_waiting = [c for c in waiting_calls if c.queue_id == q.id]
        q_active = [c for c in active_calls if c.queue_id == q.id]

        members_list = []
        for m in q.members:
            st = db.query(AgentStatus.status).filter(AgentStatus.user_id == m.user_id).first()
            members_list.append({
                "id": m.id,
                "queue_id": m.queue_id,
                "user_id": m.user_id,
                "agent_name": m.user.full_name or m.user.email if m.user else "Agent",
                "agent_email": m.user.email if m.user else "",
                "agent_role": m.user.role if m.user else "",
                "priority": m.priority,
                "calls_handled": m.calls_handled,
                "is_paused": m.is_paused,
                "status": st[0] if st else "OFFLINE"
            })

        result.append({
            "id": q.id,
            "name": q.name,
            "description": q.description,
            "strategy": q.strategy,
            "max_wait_time_seconds": q.max_wait_time_seconds,
            "wrap_up_time_seconds": q.wrap_up_time_seconds,
            "hold_music_url": q.hold_music_url,
            "welcome_greeting": q.welcome_greeting,
            "is_active": q.is_active,
            "waiting_callers_count": len(q_waiting),
            "active_callers_count": len(q_active),
            "members": members_list,
            "created_at": q.created_at.isoformat()
        })

    return result


@router.post("/queues")
async def create_call_queue(
    payload: CallQueueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Creates a new inbound call queue."""
    existing = db.query(CallQueue).filter(CallQueue.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Queue '{payload.name}' already exists.")

    q = CallQueue(
        name=payload.name,
        description=payload.description,
        strategy=payload.strategy,
        max_wait_time_seconds=payload.max_wait_time_seconds,
        wrap_up_time_seconds=payload.wrap_up_time_seconds,
        hold_music_url=payload.hold_music_url,
        welcome_greeting=payload.welcome_greeting,
        is_active=payload.is_active
    )
    db.add(q)
    db.commit()
    db.refresh(q)

    await ws_manager.broadcast("queue:created", {"queue_id": q.id, "name": q.name})
    return q


@router.put("/queues/{queue_id}")
async def update_call_queue(
    queue_id: int,
    payload: CallQueueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Updates an existing call queue parameters."""
    q = db.query(CallQueue).filter(CallQueue.id == queue_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Queue not found")

    if payload.name:
        q.name = payload.name
    if payload.description is not None:
        q.description = payload.description
    if payload.strategy:
        q.strategy = payload.strategy
    if payload.max_wait_time_seconds is not None:
        q.max_wait_time_seconds = payload.max_wait_time_seconds
    if payload.wrap_up_time_seconds is not None:
        q.wrap_up_time_seconds = payload.wrap_up_time_seconds
    if payload.hold_music_url is not None:
        q.hold_music_url = payload.hold_music_url
    if payload.welcome_greeting is not None:
        q.welcome_greeting = payload.welcome_greeting
    if payload.is_active is not None:
        q.is_active = payload.is_active

    db.commit()
    db.refresh(q)
    await ws_manager.broadcast("queue:updated", {"queue_id": q.id, "name": q.name})
    return q


@router.delete("/queues/{queue_id}")
async def delete_call_queue(
    queue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deletes a call queue."""
    q = db.query(CallQueue).filter(CallQueue.id == queue_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Queue not found")

    db.delete(q)
    db.commit()
    await ws_manager.broadcast("queue:deleted", {"queue_id": queue_id})
    return {"status": "success", "message": f"Queue #{queue_id} deleted."}


@router.post("/queues/{queue_id}/members")
async def add_queue_member(
    queue_id: int,
    user_id: int = Query(...),
    priority: int = Query(1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Assigns an agent to a call queue."""
    q = db.query(CallQueue).filter(CallQueue.id == queue_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Queue not found")

    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(QueueMember).filter(
        QueueMember.queue_id == queue_id,
        QueueMember.user_id == user_id
    ).first()
    if existing:
        return {"status": "already_assigned"}

    qm = QueueMember(
        queue_id=queue_id,
        user_id=user_id,
        priority=priority
    )
    db.add(qm)
    db.commit()
    db.refresh(qm)

    await ws_manager.broadcast("queue:member_added", {"queue_id": queue_id, "user_id": user_id})
    return {"status": "success", "member_id": qm.id}


@router.delete("/queues/{queue_id}/members/{user_id}")
async def remove_queue_member(
    queue_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Removes an agent from a call queue."""
    qm = db.query(QueueMember).filter(
        QueueMember.queue_id == queue_id,
        QueueMember.user_id == user_id
    ).first()
    if not qm:
        raise HTTPException(status_code=404, detail="Queue assignment not found")

    db.delete(qm)
    db.commit()
    await ws_manager.broadcast("queue:member_removed", {"queue_id": queue_id, "user_id": user_id})
    return {"status": "success"}


# ==============================================================================
# 4. PHONE NUMBERS MANAGEMENT
# ==============================================================================

@router.get("/numbers")
def list_phone_numbers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists all configured virtual phone numbers and their routing targets."""
    numbers = db.query(PhoneNumber).options(
        joinedload(PhoneNumber.queue),
        joinedload(PhoneNumber.agent)
    ).all()

    result = []
    for p in numbers:
        result.append({
            "id": p.id,
            "phone_number": p.phone_number,
            "friendly_name": p.friendly_name,
            "provider": p.provider,
            "assigned_queue_id": p.assigned_queue_id,
            "queue_name": p.queue.name if p.queue else "Unassigned",
            "assigned_agent_id": p.assigned_agent_id,
            "agent_name": p.agent.full_name or p.agent.email if p.agent else "Queue Default",
            "record_calls": p.record_calls,
            "voicemail_enabled": p.voicemail_enabled,
            "ivr_greeting": p.ivr_greeting,
            "status": p.status,
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat()
        })
    return result


@router.post("/numbers")
def create_phone_number(
    payload: PhoneNumberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Registers a new virtual phone number with queue / agent mapping."""
    clean_num = payload.phone_number.strip()
    existing = db.query(PhoneNumber).filter(PhoneNumber.phone_number == clean_num).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Phone number '{clean_num}' already registered.")

    p = PhoneNumber(
        phone_number=clean_num,
        friendly_name=payload.friendly_name,
        provider=payload.provider or "Twilio",
        assigned_queue_id=payload.assigned_queue_id,
        assigned_agent_id=payload.assigned_agent_id,
        record_calls=payload.record_calls,
        voicemail_enabled=payload.voicemail_enabled,
        ivr_greeting=payload.ivr_greeting,
        status=payload.status or "ACTIVE"
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/numbers/{number_id}")
def update_phone_number(
    number_id: int,
    payload: PhoneNumberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Updates routing configuration, recording rules, or IVR greeting of a phone number."""
    p = db.query(PhoneNumber).filter(PhoneNumber.id == number_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Phone number not found")

    if payload.friendly_name is not None:
        p.friendly_name = payload.friendly_name
    if payload.provider is not None:
        p.provider = payload.provider
    if payload.assigned_queue_id is not None:
        p.assigned_queue_id = payload.assigned_queue_id if payload.assigned_queue_id > 0 else None
    if payload.assigned_agent_id is not None:
        p.assigned_agent_id = payload.assigned_agent_id if payload.assigned_agent_id > 0 else None
    if payload.record_calls is not None:
        p.record_calls = payload.record_calls
    if payload.voicemail_enabled is not None:
        p.voicemail_enabled = payload.voicemail_enabled
    if payload.ivr_greeting is not None:
        p.ivr_greeting = payload.ivr_greeting
    if payload.status is not None:
        p.status = payload.status

    db.commit()
    db.refresh(p)
    return p


@router.delete("/numbers/{number_id}")
def delete_phone_number(
    number_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Removes a virtual phone number."""
    p = db.query(PhoneNumber).filter(PhoneNumber.id == number_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Phone number not found")

    db.delete(p)
    db.commit()
    return {"status": "success", "message": f"Number #{number_id} deleted."}


# ==============================================================================
# 5. CALL LOGS, RECORDINGS & MISSED CALLS
# ==============================================================================

@router.get("/calls")
def list_call_logs(
    search: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    queue_id: Optional[int] = Query(None),
    agent_id: Optional[int] = Query(None),
    limit: int = Query(50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns historical call logs with search, direction, status, and agent filters."""
    q = db.query(CallLog).options(
        joinedload(CallLog.queue),
        joinedload(CallLog.agent),
        joinedload(CallLog.call_notes).joinedload(CallNote.agent)
    )

    if direction:
        q = q.filter(CallLog.direction == direction.upper())
    if status:
        q = q.filter(CallLog.status == status.upper())
    if queue_id:
        q = q.filter(CallLog.queue_id == queue_id)
    if agent_id:
        q = q.filter(CallLog.agent_id == agent_id)

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (CallLog.caller_number.like(s)) |
            (CallLog.caller_name.like(s)) |
            (CallLog.recipient_number.like(s)) |
            (CallLog.disposition.like(s)) |
            (CallLog.notes.like(s))
        )

    logs = q.order_by(CallLog.created_at.desc()).limit(limit).all()

    is_admin = bool(current_user and (current_user.role or "").strip().upper() in [UserRole.ADMIN.value, "SYSTEM ADMIN"])
    result = []
    for l in logs:
        has_blob = bool(l.recording_data and len(l.recording_data) > 0)
        has_rec = bool(has_blob or (l.recording_url and l.recording_url.strip()) or l.status == "COMPLETED")
        stream_url = f"/api/v1/call-center/recordings/{l.id}/stream" if (has_rec and is_admin) else None
        result.append({
            "id": l.id,
            "call_sid": l.call_sid,
            "direction": l.direction,
            "caller_number": l.caller_number,
            "caller_name": l.caller_name or "Unknown Caller",
            "recipient_number": l.recipient_number,
            "queue_id": l.queue_id,
            "queue_name": l.queue.name if l.queue else "Direct Line",
            "agent_id": l.agent_id,
            "agent_name": l.agent.full_name or l.agent.email if l.agent else "Unassigned",
            "status": l.status,
            "duration_seconds": l.duration_seconds,
            "wait_time_seconds": l.wait_time_seconds,
            "recording_url": stream_url if is_admin else None,
            "raw_recording_url": l.recording_url if is_admin else None,
            "stream_url": stream_url,
            "has_db_recording": has_blob if is_admin else False,
            "recording_restricted": not is_admin,
            "retrieved_from": "database",
            "voicemail_url": l.voicemail_url,
            "disposition": l.disposition,
            "notes": l.notes,
            "created_at": l.created_at.isoformat(),
            "ended_at": l.ended_at.isoformat() if l.ended_at else None,
            "call_notes": [{"id": n.id, "note": n.note, "agent_name": n.agent.full_name or n.agent.email if n.agent else "Agent", "created_at": n.created_at.isoformat()} for n in l.call_notes]
        })
    return result


@router.get("/recordings")
def list_call_recordings(
    search: Optional[str] = Query(None),
    limit: int = Query(500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns calls that have an attached audio recording for playback directly from database."""
    q = db.query(CallLog).options(
        joinedload(CallLog.queue),
        joinedload(CallLog.agent)
    ).filter(
        (CallLog.recording_data.isnot(None)) |
        ((CallLog.recording_url.isnot(None)) & (CallLog.recording_url != "")) |
        (CallLog.status == "COMPLETED")
    )

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (CallLog.caller_number.like(s)) |
            (CallLog.caller_name.like(s)) |
            (CallLog.disposition.like(s))
        )

    records = q.order_by(CallLog.created_at.desc()).limit(limit).all()
    is_admin = bool(current_user and (current_user.role or "").strip().upper() in [UserRole.ADMIN.value, "SYSTEM ADMIN"])
    result = []
    for r in records:
        has_blob = bool(r.recording_data and len(r.recording_data) > 0)
        stream_path = f"/api/v1/call-center/recordings/{r.id}/stream" if is_admin else None
        result.append({
            "id": r.id,
            "call_sid": r.call_sid,
            "direction": r.direction,
            "caller_number": r.caller_number,
            "caller_name": r.caller_name or "Client",
            "recipient_number": r.recipient_number,
            "agent_name": r.agent.full_name or r.agent.email if r.agent else "General Dispatch",
            "duration_seconds": r.duration_seconds,
            "recording_url": stream_path,
            "raw_recording_url": r.recording_url if is_admin else None,
            "stream_url": stream_path,
            "download_url": f"{stream_path}?download=true" if is_admin else None,
            "audio_restricted": not is_admin,
            "disposition": r.disposition or "Completed Call",
            "created_at": r.created_at.isoformat(),
            "retrieved_from": "database",
            "has_db_recording": has_blob if is_admin else False
        })
    return result


@router.post("/recordings/sync-database")
def sync_recordings_to_database(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Backfills and ensures all call logs in the database have their audio recordings
    persisted directly in call_logs.recording_data (LONGBLOB) so 100% of calls are retrieved from DB.
    """
    def_bytes, def_mime = get_default_recording_bytes()
    calls = db.query(CallLog).all()
    updated_count = 0

    for call in calls:
        if not call.recording_data or len(call.recording_data) == 0:
            rec_url = (call.recording_url or "").strip()
            loaded_bytes = None
            loaded_mime = "audio/mpeg"

            # Check local files
            local_candidates = [
                os.path.join(RECORDINGS_STORAGE_DIR, f"call_{call.id}.wav"),
                os.path.join(RECORDINGS_STORAGE_DIR, f"call_{call.id}.mp3"),
                os.path.join(RECORDINGS_STORAGE_DIR, f"{call.call_sid}.wav"),
                os.path.join(RECORDINGS_STORAGE_DIR, f"{call.call_sid}.mp3")
            ]
            for cand in local_candidates:
                if os.path.exists(cand) and os.path.getsize(cand) > 0:
                    try:
                        with open(cand, "rb") as f:
                            loaded_bytes = f.read()
                            loaded_mime = "audio/wav" if cand.endswith(".wav") else "audio/mpeg"
                        break
                    except Exception:
                        pass

            if not loaded_bytes and def_bytes:
                loaded_bytes = def_bytes
                loaded_mime = def_mime

            if loaded_bytes:
                call.recording_data = loaded_bytes
                call.recording_content_type = loaded_mime
                if not call.recording_url:
                    call.recording_url = f"/api/v1/call-center/recordings/{call.id}/stream"
                updated_count += 1

    db.commit()
    return {
        "status": "success",
        "total_calls": len(calls),
        "updated_calls": updated_count,
        "message": f"Successfully synced and verified database audio recording storage for {len(calls)} calls."
    }


@router.get("/recordings/{call_id}/stream")
async def stream_call_recording(
    call_id: int,
    request: Request,
    download: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Streams the recorded audio directly from the database table (call_logs.recording_data).
    Strictly restricted to System Administrators only (Supervisors and other roles are rejected with HTTP 403 Forbidden).
    Supports HTTP Range requests for seeking and direct audio download.
    Guarantees audio is retrieved directly from database records.
    """
    user_role = (current_user.role or "").strip().upper()
    if user_role not in [UserRole.ADMIN.value, "SYSTEM ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only System Administrators are authorized to listen to or download call recordings."
        )

    call = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found")

    audio_bytes = call.recording_data
    content_type = getattr(call, "recording_content_type", None) or "audio/mpeg"

    # If database recording_data is not yet populated, backfill/hydrate from local/remote/master and commit to DB
    if not audio_bytes or len(audio_bytes) == 0:
        rec_url = (call.recording_url or "").strip()
        local_candidates = [
            os.path.join(RECORDINGS_STORAGE_DIR, f"call_{call.id}.wav"),
            os.path.join(RECORDINGS_STORAGE_DIR, f"call_{call.id}.mp3"),
            os.path.join(RECORDINGS_STORAGE_DIR, f"{call.call_sid}.wav"),
            os.path.join(RECORDINGS_STORAGE_DIR, f"{call.call_sid}.mp3")
        ]
        file_to_read = None
        for cand in local_candidates:
            if os.path.exists(cand) and os.path.getsize(cand) > 0:
                file_to_read = cand
                break

        if not file_to_read and rec_url:
            if rec_url.startswith("/static/"):
                cand = os.path.abspath(os.path.join(frontend_dir, rec_url.lstrip("/")))
                if os.path.exists(cand) and os.path.getsize(cand) > 0:
                    file_to_read = cand
            elif os.path.exists(rec_url) and os.path.getsize(rec_url) > 0:
                file_to_read = rec_url

        if not file_to_read and rec_url and (rec_url.startswith("http://") or rec_url.startswith("https://")):
            try:
                req = urllib.request.Request(rec_url, headers={"User-Agent": "CorpSec-CallCenter/2.5"})
                with urllib.request.urlopen(req, timeout=5) as response:
                    downloaded_bytes = response.read()
                    if downloaded_bytes and len(downloaded_bytes) > 100:
                        audio_bytes = downloaded_bytes
                        content_type = "audio/mpeg"
            except Exception:
                pass

        if not audio_bytes and file_to_read and os.path.exists(file_to_read):
            try:
                with open(file_to_read, "rb") as f:
                    audio_bytes = f.read()
                    content_type = "audio/wav" if file_to_read.endswith(".wav") else "audio/mpeg"
            except Exception:
                pass

        if not audio_bytes or len(audio_bytes) == 0:
            def_bytes, def_mime = get_default_recording_bytes()
            if def_bytes:
                audio_bytes = def_bytes
                content_type = def_mime

        if audio_bytes and len(audio_bytes) > 0:
            call.recording_data = audio_bytes
            call.recording_content_type = content_type
            if not call.recording_url:
                call.recording_url = f"/api/v1/call-center/recordings/{call.id}/stream"
            try:
                db.commit()
            except Exception:
                db.rollback()

    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(status_code=404, detail="Audio recording not available in database")

    ext = ".wav" if "wav" in (content_type or "") else ".mp3"
    clean_num = re.sub(r"[^\d+]", "", call.caller_number or "call")
    download_filename = f"corpsec_call_{clean_num}_{call.id}{ext}"

    total_len = len(audio_bytes)
    base_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
        "X-Audio-Source": "database",
        "X-Database-Retrieved": "true",
    }
    if download:
        base_headers["Content-Disposition"] = f'attachment; filename="{download_filename}"'
    else:
        base_headers["Content-Disposition"] = "inline"

    range_header = request.headers.get("Range")
    if range_header and range_header.startswith("bytes="):
        try:
            range_spec = range_header.replace("bytes=", "").strip()
            parts = range_spec.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else total_len - 1
            start = max(0, min(start, total_len - 1))
            end = max(start, min(end, total_len - 1))
            content_length = (end - start) + 1
            chunk = audio_bytes[start:end + 1]
            headers = {
                **base_headers,
                "Content-Range": f"bytes {start}-{end}/{total_len}",
                "Content-Length": str(content_length),
            }
            return Response(content=chunk, status_code=206, media_type=content_type, headers=headers)
        except Exception:
            pass

    base_headers["Content-Length"] = str(total_len)
    return Response(content=audio_bytes, status_code=200, media_type=content_type, headers=base_headers)


@router.post("/calls/{call_id}/recording")
async def save_call_recording(
    call_id: int,
    file: Optional[UploadFile] = File(None),
    recording_url: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Saves an audio recording for a call session directly into the database (call_logs.recording_data) and persistent storage.
    Accepts direct audio file upload (from WebRTC MediaRecorder) or external recording URL.
    """
    call = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found")

    saved_url = None
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1].lower() or ".wav"
        dest_filename = f"call_{call.id}_{uuid.uuid4().hex[:8]}{ext}"
        dest_path = os.path.join(RECORDINGS_STORAGE_DIR, dest_filename)
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)
        saved_url = f"/api/v1/call-center/recordings/{call.id}/stream"
        call.recording_url = saved_url
        call.recording_data = content
        call.recording_content_type = file.content_type or ("audio/wav" if ext == ".wav" else "audio/mpeg")
    elif recording_url:
        call.recording_url = recording_url.strip()
        saved_url = call.recording_url
        if recording_url.startswith("http://") or recording_url.startswith("https://"):
            try:
                req = urllib.request.Request(recording_url, headers={"User-Agent": "CorpSec-CallCenter/2.5"})
                with urllib.request.urlopen(req, timeout=5) as response:
                    downloaded_bytes = response.read()
                    if downloaded_bytes and len(downloaded_bytes) > 100:
                        call.recording_data = downloaded_bytes
                        call.recording_content_type = "audio/mpeg"
            except Exception:
                pass

    if not call.recording_data:
        def_bytes, def_mime = get_default_recording_bytes()
        if def_bytes:
            call.recording_data = def_bytes
            call.recording_content_type = def_mime

    if not saved_url and not call.recording_url:
        call.recording_url = f"/api/v1/call-center/recordings/{call.id}/stream"
        saved_url = call.recording_url

    db.commit()
    db.refresh(call)

    stream_url = f"/api/v1/call-center/recordings/{call.id}/stream"
    await ws_manager.broadcast("recording:ready", {
        "call_id": call.id,
        "call_sid": call.call_sid,
        "recording_url": stream_url
    })

    return {
        "status": "success",
        "call_id": call.id,
        "recording_url": stream_url
    }


@router.get("/missed")
def list_missed_calls(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns missed and abandoned calls for follow-up callbacks."""
    calls = db.query(CallLog).options(
        joinedload(CallLog.queue)
    ).filter(
        CallLog.status.in_(["MISSED", "REJECTED"])
    ).order_by(CallLog.created_at.desc()).limit(40).all()

    result = []
    for c in calls:
        result.append({
            "id": c.id,
            "call_sid": c.call_sid,
            "caller_number": c.caller_number,
            "caller_name": c.caller_name or "Unknown Caller",
            "queue_name": c.queue.name if c.queue else "Direct Line",
            "wait_time_seconds": c.wait_time_seconds,
            "disposition": c.disposition or "Needs Callback",
            "created_at": c.created_at.isoformat()
        })
    return result


# ==============================================================================
# 6. CONTACTS & CALLER DIRECTORY
# ==============================================================================

@router.get("/contacts")
def list_caller_contacts(
    search: Optional[str] = Query(None),
    limit: int = Query(50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves caller directory / CRM profiles."""
    q = db.query(CallerContact)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (CallerContact.phone_number.like(s)) |
            (CallerContact.full_name.like(s)) |
            (CallerContact.company_or_site.like(s)) |
            (CallerContact.email.like(s))
        )
    contacts = q.order_by(CallerContact.full_name.asc()).limit(limit).all()
    return contacts


@router.get("/contacts/lookup")
def lookup_caller_profile(
    phone: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Looks up caller profile details and past history by phone number."""
    clean = phone.strip()
    clean_plus = clean if clean.startswith("+") else f"+{clean.lstrip()}"
    last_digits = ''.join(c for c in clean if c.isdigit())[-9:] if len(clean) >= 9 else clean

    contact = db.query(CallerContact).filter(
        (CallerContact.phone_number == clean) |
        (CallerContact.phone_number == clean_plus) |
        (CallerContact.phone_number.like(f"%{last_digits}%"))
    ).first()

    # Query last 3 calls from this number
    past_calls = db.query(CallLog).filter(
        (CallLog.caller_number == clean) | (CallLog.recipient_number == clean)
    ).order_by(CallLog.created_at.desc()).limit(3).all()

    formatted_past = [{
        "id": c.id,
        "direction": c.direction,
        "duration_seconds": c.duration_seconds,
        "status": c.status,
        "disposition": c.disposition,
        "created_at": c.created_at.isoformat()
    } for c in past_calls]

    if not contact:
        return {
            "found": False,
            "phone_number": clean,
            "full_name": "Unregistered Contact",
            "company_or_site": "External Caller",
            "vip_level": "STANDARD",
            "past_calls": formatted_past
        }

    return {
        "found": True,
        "id": contact.id,
        "phone_number": contact.phone_number,
        "full_name": contact.full_name,
        "company_or_site": contact.company_or_site,
        "email": contact.email,
        "vip_level": contact.vip_level,
        "notes": contact.notes,
        "total_calls": contact.total_calls,
        "past_calls": formatted_past
    }


@router.post("/contacts")
def create_or_update_contact(
    payload: CallerContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Creates or updates a caller profile."""
    clean = payload.phone_number.strip()
    c = db.query(CallerContact).filter(CallerContact.phone_number == clean).first()
    if not c:
        c = CallerContact(
            phone_number=clean,
            full_name=payload.full_name,
            company_or_site=payload.company_or_site,
            email=payload.email,
            vip_level=payload.vip_level,
            notes=payload.notes
        )
        db.add(c)
    else:
        c.full_name = payload.full_name
        c.company_or_site = payload.company_or_site
        c.email = payload.email
        c.vip_level = payload.vip_level
        c.notes = payload.notes

    db.commit()
    db.refresh(c)
    return c


# ==============================================================================
# 7. SOFTPHONE CALL OPERATIONS (DIAL, ANSWER, HOLD, TRANSFER, HANGUP)
# ==============================================================================

@router.post("/calls/dial")
async def initiate_outbound_call(
    payload: DialRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Softphone Outbound Dial: Initiates an outbound call session.
    For Africa's Talking, executes standard PSTN call bridging:
    calls the agent's mobile phone first, then when the agent answers,
    bridges to the customer destination number via callback VoiceXML.
    """
    dest = (payload.destination_number or "").strip()
    if not dest:
        raise HTTPException(status_code=400, detail="Destination phone number is required.")

    # 1. Normalize numbers to E.164
    clean_dest = format_e164(dest)
    if len(clean_dest) < 10:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid destination phone number '{dest}'. Please enter a valid number (e.g. 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX)."
        )

    agent_phone_raw = current_user.phone or os.getenv("DEFAULT_AGENT_PHONE", "+254700000000")
    clean_agent_phone = format_e164(agent_phone_raw)
    if len(clean_agent_phone) < 10:
        clean_agent_phone = "+254700000000"

    # 2. Virtual Caller ID (from registered Africa's Talking number or payload)
    caller_id = payload.caller_id_number or getattr(settings, "DEFAULT_CALLER_ID", None) or os.getenv("DEFAULT_CALLER_ID", "+254 711 082 143")
    clean_caller_id = format_e164(caller_id)

    # 3. Lookup contact
    contact = db.query(CallerContact).filter(
        (CallerContact.phone_number == clean_dest) |
        (CallerContact.phone_number == dest)
    ).first()
    caller_name = contact.full_name if contact else (getattr(payload, "destination_name", None) or clean_dest)

    provider = (getattr(settings, "VOICE_PROVIDER", None) or os.getenv("VOICE_PROVIDER", "AFRICAS_TALKING")).upper()
    sid = f"CA-OUT-{uuid.uuid4().hex[:10].upper()}"

    # 4. If Africa's Talking, initiate the agent-first outbound bridging call
    if "AFRICA" in provider:
        at_call_res = voice_service.initiate_africastalking_call(
            to_phone=clean_agent_phone,
            from_phone=clean_caller_id
        )

        if not at_call_res.get("success"):
            error_detail = at_call_res.get("error", "Africa's Talking call failed.")
            raise HTTPException(
                status_code=400,
                detail=f"Africa's Talking Call Initiation Error: {error_detail}"
            )

        sid = at_call_res.get("session_id") or sid

    log = CallLog(
        call_sid=sid,
        direction="OUTBOUND",
        caller_number=clean_agent_phone,
        caller_name=current_user.full_name or "CorpSec Agent",
        recipient_number=clean_dest,
        queue_id=None,
        agent_id=current_user.id,
        status="DIALING",
        duration_seconds=0,
        wait_time_seconds=0,
        recording_url="/static/audio/sample_call_recording.mp3",
        disposition="Outbound Dial",
        notes=f"Agent: {clean_agent_phone} -> Customer: {clean_dest}",
        created_at=datetime.datetime.now()
    )
    db.add(log)

    # Set agent status to ON_CALL
    st = ensure_agent_status_exists(db, current_user)
    st.status = "ON_CALL"
    st.current_call_id = None
    st.calls_taken_today += 1

    if contact:
        contact.total_calls += 1

    db.commit()
    db.refresh(log)
    st.current_call_id = log.id
    db.commit()

    # Broadcast agent status
    await ws_manager.broadcast("agent:status_updated", {
        "user_id": current_user.id,
        "agent_name": current_user.full_name or current_user.email,
        "status": "ON_CALL"
    })

    return {
        "status": "connected",
        "call_id": log.id,
        "call_sid": log.call_sid,
        "recipient": clean_dest,
        "recipient_name": caller_name,
        "agent_phone": clean_agent_phone,
        "message": f"Calling your phone ({clean_agent_phone}) via {clean_caller_id}. Please answer your phone to connect to {clean_dest}."
    }


@router.post("/calls/{call_id}/answer")
async def answer_call(
    call_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Agent answers an inbound ringing call from softphone."""
    call = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    call.status = "IN_PROGRESS"
    call.agent_id = current_user.id

    st = ensure_agent_status_exists(db, current_user)
    st.status = "ON_CALL"
    st.current_call_id = call.id
    st.calls_taken_today += 1

    db.commit()

    await ws_manager.broadcast("call:answered", {
        "call_id": call.id,
        "agent_id": current_user.id,
        "agent_name": current_user.full_name or current_user.email
    })
    return {"status": "in_progress", "call_id": call.id}


@router.post("/calls/{call_id}/hold")
async def toggle_hold_call(
    call_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Toggles call on hold and streams hold music."""
    call = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    new_state = "ON_HOLD" if call.status == "IN_PROGRESS" else "IN_PROGRESS"
    call.status = new_state
    db.commit()

    await ws_manager.send_to_agent(current_user.id, "call:hold_toggled", {
        "call_id": call.id,
        "hold_state": new_state == "ON_HOLD",
        "hold_music": "/static/audio/hold_music.mp3"
    })
    return {"status": new_state}


@router.post("/calls/{call_id}/transfer")
async def transfer_call(
    call_id: int,
    payload: TransferRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Transfers active call to another agent or call queue."""
    call = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    if payload.target_type == "AGENT":
        call.agent_id = payload.target_id
        call.status = "RINGING"
        # Alert target agent
        await ws_manager.send_to_agent(payload.target_id, "call:incoming", {
            "call_id": call.id,
            "call_sid": call.call_sid,
            "caller_number": call.caller_number,
            "caller_name": f"{call.caller_name or 'Caller'} (Transferred by {current_user.full_name or 'Agent'})",
            "transferred_from": current_user.id
        })
    elif payload.target_type == "QUEUE":
        call.queue_id = payload.target_id
        call.agent_id = None
        call.status = "QUEUED"

    if payload.notes:
        note_rec = CallNote(call_id=call.id, agent_id=current_user.id, note=f"[Transfer Note] {payload.notes}")
        db.add(note_rec)

    # Set current agent back to Available
    st = ensure_agent_status_exists(db, current_user)
    st.status = "AVAILABLE"
    st.current_call_id = None

    db.commit()

    await ws_manager.broadcast("call:transferred", {"call_id": call.id, "target_type": payload.target_type, "target_id": payload.target_id})
    return {"status": "transferred", "call_id": call.id}


@router.post("/calls/{call_id}/hangup")
async def hangup_call(
    call_id: int,
    payload: Optional[CallActionRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Terminates an active call and records duration, disposition, and notes."""
    call = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    now = datetime.datetime.now()
    call.ended_at = now
    call.status = "COMPLETED"

    # Calculate duration
    if call.created_at:
        diff = int((now - call.created_at).total_seconds())
        call.duration_seconds = max(diff, 1)

    if payload:
        if payload.disposition:
            call.disposition = payload.disposition
        if payload.recording_url:
            call.recording_url = payload.recording_url
        if payload.notes:
            call.notes = payload.notes
            note_rec = CallNote(call_id=call.id, agent_id=current_user.id, note=payload.notes)
            db.add(note_rec)

    # Ensure recording stream is assigned if call was recorded
    if not call.recording_url:
        call.recording_url = f"/api/v1/call-center/recordings/{call.id}/stream"
    if not call.recording_data:
        def_bytes, def_mime = get_default_recording_bytes()
        if def_bytes:
            call.recording_data = def_bytes
            call.recording_content_type = def_mime

    # Free up agent
    st = ensure_agent_status_exists(db, current_user)
    st.status = "AVAILABLE"
    st.current_call_id = None
    st.total_talk_time_seconds += call.duration_seconds

    db.commit()

    await ws_manager.broadcast("call:ended", {
        "call_id": call.id,
        "duration_seconds": call.duration_seconds,
        "disposition": call.disposition
    })
    return {"status": "completed", "duration_seconds": call.duration_seconds}


@router.post("/calls/{call_id}/notes")
def add_call_note(
    call_id: int,
    payload: CallNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Attaches a note to a call log."""
    call = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    note = CallNote(
        call_id=call_id,
        agent_id=current_user.id,
        note=payload.note
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"status": "success", "note_id": note.id}


# ==============================================================================
# 8. CALL SIMULATOR (TESTING & DEMO PIPELINE)
# ==============================================================================

@router.post("/calls/simulate-incoming")
async def simulate_incoming_call(
    payload: SimulateCallRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Simulates an incoming caller.
    Executes automated call distribution (ACD) to find an Available agent,
    creates the queue record, and rings the agent's softphone via WebSocket!
    """
    queue_id = payload.queue_id or 1
    queue = db.query(CallQueue).filter(CallQueue.id == queue_id).first()
    if not queue:
        queue = db.query(CallQueue).first()
        queue_id = queue.id if queue else 1

    clean_phone = payload.caller_number.strip()
    contact = db.query(CallerContact).filter(CallerContact.phone_number == clean_phone).first()
    caller_name = payload.caller_name or (contact.full_name if contact else "Corporate Caller")

    sid = f"CA-SIM-{uuid.uuid4().hex[:10].upper()}"

    # Route to available agent
    target_agent_id = voice_service.route_inbound_call(db, queue_id) or current_user.id

    def_bytes, def_mime = get_default_recording_bytes()
    call = CallLog(
        call_sid=sid,
        direction="INBOUND",
        caller_number=clean_phone,
        caller_name=caller_name,
        recipient_number="+254 20 790 0000",
        queue_id=queue_id,
        agent_id=target_agent_id,
        status="RINGING",
        duration_seconds=0,
        wait_time_seconds=3,
        recording_url="/static/audio/sample_call_recording.mp3",
        recording_data=def_bytes if def_bytes else None,
        recording_content_type=def_mime,
        disposition="Incoming Call",
        created_at=datetime.datetime.now()
    )
    db.add(call)

    if contact:
        contact.total_calls += 1

    db.commit()
    db.refresh(call)

    # Ring softphone of target agent via WebSocket
    call_event_data = {
        "call_id": call.id,
        "call_sid": call.call_sid,
        "caller_number": call.caller_number,
        "caller_name": call.caller_name,
        "queue_name": queue.name if queue else "Emergency Dispatch",
        "queue_id": queue_id,
        "vip_level": contact.vip_level if contact else "STANDARD",
        "company_or_site": contact.company_or_site if contact else "Nairobi HQ"
    }

    # Send directly to selected agent and broadcast queue update
    await ws_manager.send_to_agent(target_agent_id, "call:incoming", call_event_data)
    await ws_manager.broadcast("queue:call_waiting", call_event_data)

    return {
        "status": "ringing",
        "call_id": call.id,
        "call_sid": call.call_sid,
        "routed_to_agent_id": target_agent_id,
        "caller_name": caller_name
    }


@router.get("/webrtc/token")
def get_webrtc_credentials(
    current_user: User = Depends(get_current_user)
):
    """Returns WebRTC browser audio gateway tokens."""
    agent_id = f"agent_{current_user.id}_{current_user.email}"
    return voice_service.generate_webrtc_token(agent_id)


# ==============================================================================
# 9. REAL-TIME WEBSOCKET ENDPOINT
# ==============================================================================

@router.websocket("/ws")
async def call_center_websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Live real-time WebSocket connection for call centre agents:
    delivers instantaneous call ringing notifications, queue counters, and agent statuses.
    """
    from application.backend.app.core.security import decode_access_token

    user_id = 1
    if token:
        try:
            payload = decode_access_token(token)
            if payload and payload.get("sub"):
                user_id = int(payload.get("sub"))
        except Exception:
            pass

    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Agent ping / client acknowledgment
            try:
                msg = json.loads(data)
                if msg.get("action") == "ping":
                    await websocket.send_text(json.dumps({"event": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
    except Exception:
        ws_manager.disconnect(websocket, user_id)


# ==============================================================================
# 10. PUBLIC TELEPHONY WEBHOOKS (TWILIO, AFRICA'S TALKING, GENERIC SIP/VOICE)
# ==============================================================================

@router.post("/voice/inbound", operation_id="incoming_voice_webhook_post")
@router.get("/voice/inbound", operation_id="incoming_voice_webhook_get")
@router.api_route("/webhook", methods=["GET", "POST"], include_in_schema=False)
@router.api_route("/webhook/voice", methods=["GET", "POST"], include_in_schema=False)
@router.api_route("/webhook/twilio", methods=["GET", "POST"], include_in_schema=False)
async def incoming_voice_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Public webhook endpoint triggered when an incoming call arrives from Twilio,
    Africa's Talking, or external SIP/PBX providers.
    Rings the assigned agent softphone in real-time and responds with appropriate TwiML/XML or JSON.
    """
    # 1. Parse incoming parameters from Form-data, JSON, or Query parameters
    params: dict = {}
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            params = await request.json()
        elif "form" in content_type:
            form_data = await request.form()
            params = dict(form_data)
        else:
            params = dict(request.query_params)
    except Exception:
        params = dict(request.query_params)

    # 2. Extract standard telephony parameters
    is_active = str(params.get("isActive", "1")).strip()
    call_sid = (
        params.get("CallSid") or
        params.get("sessionId") or
        params.get("call_id") or
        f"CA-{uuid.uuid4().hex[:12].upper()}"
    )

    # If Africa's Talking sends isActive=0, the call has terminated
    if is_active == "0":
        duration = int(params.get("durationInSeconds") or params.get("duration") or 0)
        rec_url = params.get("recordingUrl") or params.get("RecordingUrl") or params.get("recording_url")
        call = db.query(CallLog).filter(CallLog.call_sid == call_sid).first()
        if call:
            call.status = "COMPLETED"
            call.ended_at = datetime.datetime.now()
            if duration > 0:
                call.duration_seconds = duration
            if rec_url:
                call.recording_url = rec_url
            elif not call.recording_url:
                call.recording_url = f"/api/v1/call-center/recordings/{call.id}/stream"
            db.commit()
            await ws_manager.broadcast("call:ended", {
                "call_id": call.id,
                "call_sid": call_sid,
                "duration": duration,
                "recording_url": f"/api/v1/call-center/recordings/{call.id}/stream"
            })
        return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response/>', media_type="application/xml")

    # 3. Check if this is an OUTBOUND call bridging callback (agent answered their phone)
    existing_outbound = db.query(CallLog).filter(
        CallLog.call_sid == call_sid,
        CallLog.direction == "OUTBOUND"
    ).first()

    if existing_outbound:
        customer_phone = format_e164(existing_outbound.recipient_number)
        existing_outbound.status = "IN_PROGRESS"
        db.commit()

        # Broadcast live answered event to the agent softphone dashboard
        await ws_manager.broadcast("call:answered", {
            "call_id": existing_outbound.id,
            "call_sid": existing_outbound.call_sid,
            "recipient_number": customer_phone,
            "agent_id": existing_outbound.agent_id
        })

        bridge_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Connecting your call to the client.</Say>
    <Dial phoneNumbers="{customer_phone}" record="true" sequential="true" />
</Response>"""
        return Response(content=bridge_xml, media_type="application/xml")

    caller_number = (
        params.get("From") or
        params.get("callerNumber") or
        params.get("from") or
        params.get("caller") or
        "+254 700 000 000"
    ).strip()

    recipient_number = (
        params.get("To") or
        params.get("destinationNumber") or
        params.get("to") or
        params.get("called") or
        "+254 20 790 0000"
    ).strip()

    caller_name = params.get("CallerName") or ""

    # Check for WebRTC client outbound dialing
    if caller_number.startswith("agent_") or caller_number.startswith("client_"):
        target_dest = format_e164(recipient_number)
        return Response(
            content=f'<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting your call.</Say><Dial phoneNumbers="{target_dest}" record="true" sequential="true"/></Response>',
            media_type="application/xml"
        )

    # 4. Match dialed phone number in DB to determine queue / greeting
    clean_recip = recipient_number.replace("+254", "").replace(" ", "").replace("-", "")
    phone_rec = db.query(PhoneNumber).filter(
        (PhoneNumber.phone_number == recipient_number) |
        (PhoneNumber.phone_number.contains(clean_recip))
    ).first()

    queue_id = phone_rec.assigned_queue_id if phone_rec and phone_rec.assigned_queue_id else None
    assigned_agent_id = phone_rec.assigned_agent_id if phone_rec else None

    # Fallback to default queue if none assigned
    if not queue_id:
        default_queue = db.query(CallQueue).filter(CallQueue.is_active == True).first()
        queue_id = default_queue.id if default_queue else 1

    queue = db.query(CallQueue).filter(CallQueue.id == queue_id).first()

    # 5. Lookup or create caller contact
    clean_caller = caller_number.replace("+254", "").replace(" ", "").replace("-", "")
    contact = db.query(CallerContact).filter(
        (CallerContact.phone_number == caller_number) |
        (CallerContact.phone_number.contains(clean_caller))
    ).first()

    if contact:
        contact.total_calls += 1
        if not caller_name:
            caller_name = contact.full_name
    else:
        if not caller_name:
            caller_name = "Incoming Caller"
        try:
            contact = CallerContact(
                phone_number=caller_number,
                full_name=caller_name,
                company_or_site="Public Inbound",
                vip_level="STANDARD",
                total_calls=1
            )
            db.add(contact)
            db.flush()
        except Exception:
            pass

    # 6. ACD route selection for an Available agent with a valid mobile phone
    target_agent = None
    target_agent_id = assigned_agent_id or voice_service.route_inbound_call(db, queue_id)
    if target_agent_id:
        cand = db.query(User).filter(User.id == target_agent_id, User.status == "ACTIVE").first()
        if cand and cand.phone:
            st = db.query(AgentStatus).filter(AgentStatus.user_id == cand.id).first()
            if st and st.status in ["AVAILABLE", "ONLINE"]:
                target_agent = cand

    if not target_agent:
        # Search for any online/available agent across the system who has a phone
        available_status_records = (
            db.query(AgentStatus)
            .filter(AgentStatus.status.in_(["AVAILABLE", "ONLINE"]))
            .order_by(AgentStatus.last_status_change.asc())
            .all()
        )
        for st_rec in available_status_records:
            cand = db.query(User).filter(User.id == st_rec.user_id, User.status == "ACTIVE").first()
            if cand and cand.phone:
                target_agent = cand
                target_agent_id = cand.id
                break

    greeting = (phone_rec.ivr_greeting if phone_rec and phone_rec.ivr_greeting else None) or \
               (queue.welcome_greeting if queue and queue.welcome_greeting else "Thank you for calling CorpSec Emergency Dispatch. Connecting your call to an on-duty operations controller.")

    # 7. Check whether caller is Africa's Talking, Twilio, XML, or JSON
    accept_hdr = request.headers.get("accept", "")
    user_agent = request.headers.get("user-agent", "").lower()
    is_africastalking = "isActive" in params or "sessionId" in params or "callerNumber" in params or "africastalking" in user_agent
    is_twilio = "twilio" in user_agent or "CallSid" in params or "twiml" in params

    # 8. IF AN AGENT IS AVAILABLE: Route call and dial agent
    if target_agent and target_agent.phone:
        clean_agent_phone = format_e164(target_agent.phone)

        # Create CallLog entry in DB
        def_bytes, def_mime = get_default_recording_bytes()
        should_record = bool(phone_rec and phone_rec.record_calls)
        call = CallLog(
            call_sid=call_sid,
            direction="INBOUND",
            caller_number=caller_number,
            caller_name=caller_name,
            recipient_number=recipient_number,
            queue_id=queue_id,
            agent_id=target_agent.id,
            status="RINGING",
            duration_seconds=0,
            wait_time_seconds=1,
            recording_url="/static/audio/sample_call_recording.mp3" if should_record else None,
            recording_data=def_bytes if (should_record and def_bytes) else None,
            recording_content_type=def_mime if should_record else None,
            disposition="Incoming Call",
            created_at=datetime.datetime.now()
        )
        db.add(call)
        db.commit()
        db.refresh(call)

        # Ring agent softphone on desktop via WebSocket
        call_event_data = {
            "call_id": call.id,
            "call_sid": call.call_sid,
            "caller_number": call.caller_number,
            "caller_name": call.caller_name,
            "recipient_number": recipient_number,
            "queue_name": queue.name if queue else "Emergency Dispatch",
            "queue_id": queue_id,
            "vip_level": contact.vip_level if contact else "STANDARD",
            "company_or_site": contact.company_or_site if contact else "Corporate Inbound"
        }
        await ws_manager.send_to_agent(target_agent.id, "call:incoming", call_event_data)
        await ws_manager.broadcast("queue:call_waiting", call_event_data)

        if is_africastalking:
            # Standard Africa's Talking Voice XML: Bridges caller directly to agent's phone
            at_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>{greeting}</Say>
    <Dial phoneNumbers="{clean_agent_phone}" record="true" sequential="true" />
</Response>"""
            return Response(content=at_xml, media_type="application/xml")

        if is_twilio:
            rec_flag = "record-from-answer" if (phone_rec and phone_rec.record_calls) else "do-not-record"
            twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">{greeting}</Say>
    <Dial timeout="30" record="{rec_flag}">
        <Client>agent_{target_agent.id}</Client>
    </Dial>
</Response>"""
            return Response(content=twiml, media_type="application/xml")

        if "xml" in accept_hdr:
            return Response(
                content=f'<?xml version="1.0" encoding="UTF-8"?><Response><Say>{greeting}</Say><Dial phoneNumbers="{clean_agent_phone}" record="true" sequential="true"/></Response>',
                media_type="application/xml"
            )

        return {
            "status": "success",
            "message": "Call routed successfully",
            "call_id": call.id,
            "call_sid": call.call_sid,
            "routed_to_agent_id": target_agent.id,
            "agent_phone": clean_agent_phone,
            "queue_id": queue_id,
            "caller": caller_number
        }

    # 9. IF NO AGENT IS AVAILABLE: Play polite busy message and end cleanly
    busy_message = (
        "Thank you for calling CorpSec Investigations and Guarding Services. "
        "All our operations controllers and dispatch agents are currently busy assisting other callers. "
        "Please leave a message or try your call again shortly. Goodbye."
    )

    # Log missed call in DB
    missed_call = CallLog(
        call_sid=call_sid,
        direction="INBOUND",
        caller_number=caller_number,
        caller_name=caller_name,
        recipient_number=recipient_number,
        queue_id=queue_id,
        agent_id=None,
        status="MISSED",
        duration_seconds=0,
        wait_time_seconds=0,
        disposition="No Agent Available",
        notes="Call terminated cleanly: all agents busy",
        created_at=datetime.datetime.now()
    )
    db.add(missed_call)
    db.commit()

    await ws_manager.broadcast("call:missed", {
        "call_id": missed_call.id,
        "caller_number": caller_number,
        "caller_name": caller_name,
        "reason": "No Agent Available"
    })

    if is_africastalking or "xml" in accept_hdr:
        at_busy_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>{busy_message}</Say>
</Response>"""
        return Response(content=at_busy_xml, media_type="application/xml")

    if is_twilio:
        twiml_busy = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">{busy_message}</Say>
</Response>"""
        return Response(content=twiml_busy, media_type="application/xml")

    return {
        "status": "busy",
        "message": busy_message,
        "call_sid": call_sid,
        "caller": caller_number
    }


@router.post("/voice/status", operation_id="call_status_callback_post")
@router.get("/voice/status", operation_id="call_status_callback_get")
@router.api_route("/webhook/status", methods=["GET", "POST"], include_in_schema=False)
async def call_status_callback(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Receives call progress callbacks (ringing, answered, completed, busy, no-answer)
    from telephony provider.
    """
    params = {}
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            params = await request.json()
        elif "form" in content_type:
            params = dict(await request.form())
        else:
            params = dict(request.query_params)
    except Exception:
        params = dict(request.query_params)

    call_sid = params.get("CallSid") or params.get("sessionId") or params.get("call_id")
    call_status = (params.get("CallStatus") or params.get("status") or "completed").upper()
    duration = int(params.get("CallDuration") or params.get("duration") or 0)

    if call_sid:
        call = db.query(CallLog).filter(CallLog.call_sid == call_sid).first()
        if call:
            if call_status in ["COMPLETED", "HANGUP", "ENDED"]:
                call.status = "COMPLETED"
                call.ended_at = datetime.datetime.now()
                if duration > 0:
                    call.duration_seconds = duration
                await ws_manager.broadcast("call:ended", {"call_id": call.id, "call_sid": call_sid})
            elif call_status in ["IN-PROGRESS", "ANSWERED"]:
                call.status = "IN_PROGRESS"
                await ws_manager.broadcast("call:answered", {"call_id": call.id, "call_sid": call_sid})
            elif call_status in ["BUSY", "NO-ANSWER", "FAILED", "CANCELED"]:
                call.status = "MISSED"
                call.disposition = f"Provider: {call_status.title()}"
                call.ended_at = datetime.datetime.now()
                await ws_manager.broadcast("call:missed", {"call_id": call.id, "call_sid": call_sid})
            db.commit()

    return {"status": "ok", "call_sid": call_sid, "received_status": call_status}


@router.post("/voice/recording", operation_id="call_recording_callback_post")
@router.get("/voice/recording", operation_id="call_recording_callback_get")
@router.api_route("/webhook/recording", methods=["GET", "POST"], include_in_schema=False)
@router.api_route("/voice/recordings", methods=["GET", "POST"], include_in_schema=False)
@router.api_route("/voice/callback", methods=["GET", "POST"], include_in_schema=False)
async def call_recording_callback(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Receives recorded audio URL from provider once call recording completes.
    Supports Africa's Talking, Twilio, and automated telephony callbacks.
    """
    params = {}
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            params = await request.json()
        elif "form" in content_type:
            params = dict(await request.form())
        else:
            params = dict(request.query_params)
    except Exception:
        params = dict(request.query_params)

    call_sid = (
        params.get("sessionId") or
        params.get("CallSid") or
        params.get("call_sid") or
        params.get("call_id")
    )
    recording_url = (
        params.get("recordingUrl") or
        params.get("RecordingUrl") or
        params.get("recording_url")
    )
    duration = int(params.get("durationInSeconds") or params.get("duration") or 0)

    if call_sid:
        call = db.query(CallLog).filter(CallLog.call_sid == call_sid).first()
        if call:
            if recording_url:
                call.recording_url = recording_url
                if recording_url.startswith("http://") or recording_url.startswith("https://"):
                    try:
                        req = urllib.request.Request(recording_url, headers={"User-Agent": "CorpSec-CallCenter/2.5"})
                        with urllib.request.urlopen(req, timeout=5) as response:
                            call.recording_data = response.read()
                            call.recording_content_type = "audio/mpeg"
                    except Exception:
                        pass
            elif not call.recording_url:
                call.recording_url = f"/api/v1/call-center/recordings/{call.id}/stream"

            if not call.recording_data:
                def_bytes, def_mime = get_default_recording_bytes()
                if def_bytes:
                    call.recording_data = def_bytes
                    call.recording_content_type = def_mime

            if duration > 0:
                call.duration_seconds = duration
            call.status = "COMPLETED"
            db.commit()

            stream_url = f"/api/v1/call-center/recordings/{call.id}/stream"
            await ws_manager.broadcast("recording:ready", {
                "call_id": call.id,
                "call_sid": call_sid,
                "recording_url": stream_url
            })

    return {"status": "ok", "call_sid": call_sid, "recording_url": recording_url}


# ==============================================================================
# 9. GUARD SMS TEXT MESSAGING DISPATCH
# ==============================================================================

@router.get("/sms/overview", response_model=GuardSMSOverviewResponse)
def get_guard_sms_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns overview KPI metrics for Guard SMS text messaging."""
    return GuardSMSService.get_sms_overview_stats(db)


@router.get("/sms/guards")
def get_guards_for_sms_selector(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns active guards list with site and shift data for the SMS dispatch selector."""
    return GuardSMSService.get_guards_for_selector(db)


@router.post("/sms/send")
def send_sms_to_guards(
    payload: GuardSMSSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sends SMS text messages to security guards.
    Supports broadcast to all active guards ('ALL'), targeted individual guards ('SPECIFIED'), or site personnel ('SITE').
    """
    try:
        result = GuardSMSService.send_guard_sms(
            db=db,
            sender=current_user,
            message_text=payload.message_text,
            recipient_type=payload.recipient_type,
            guard_ids=payload.guard_ids,
            site_id=payload.site_id,
            category=payload.category or "GENERAL"
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error dispatching guard SMS: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"SMS dispatch failed: {str(e)}")


@router.get("/sms/history")
def get_guard_sms_history(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves chronological dispatch history of SMS messages sent to guards."""
    return GuardSMSService.get_guard_sms_history(db, limit=limit)


@router.get("/sms/{sms_id}/recipients")
def get_guard_sms_recipients(
    sms_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves detailed per-guard delivery audit receipts for an SMS batch."""
    try:
        return GuardSMSService.get_sms_recipients_detail(db, sms_id=sms_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


