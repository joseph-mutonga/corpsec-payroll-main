import uuid
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, get_current_user
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
    CallCenterOverviewResponse
)
from application.backend.app.services.voice_service import ws_manager, voice_service

router = APIRouter(prefix="/call-center", tags=["Call Centre System"])


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
    avg_wait = int(sum(c.wait_time_seconds for c in completed_calls) / len(completed_calls)) if completed_calls else 12
    avg_dur = int(sum(c.duration_seconds for c in completed_calls) / len(completed_calls)) if completed_calls else 145

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

    result = []
    for l in logs:
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
            "recording_url": l.recording_url,
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
    limit: int = Query(30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns calls that have an attached audio recording for playback."""
    q = db.query(CallLog).options(
        joinedload(CallLog.queue),
        joinedload(CallLog.agent)
    ).filter(CallLog.recording_url.isnot(None))

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (CallLog.caller_number.like(s)) |
            (CallLog.caller_name.like(s)) |
            (CallLog.disposition.like(s))
        )

    records = q.order_by(CallLog.created_at.desc()).limit(limit).all()
    result = []
    for r in records:
        result.append({
            "id": r.id,
            "call_sid": r.call_sid,
            "direction": r.direction,
            "caller_number": r.caller_number,
            "caller_name": r.caller_name or "Client",
            "recipient_number": r.recipient_number,
            "agent_name": r.agent.full_name or r.agent.email if r.agent else "General Dispatch",
            "duration_seconds": r.duration_seconds,
            "recording_url": r.recording_url,
            "disposition": r.disposition or "Completed Call",
            "created_at": r.created_at.isoformat()
        })
    return result


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
    """
    dest = payload.destination_number.strip()
    caller_id = payload.caller_id_number or "+254 20 790 0000"

    # Lookup contact
    contact = db.query(CallerContact).filter(CallerContact.phone_number == dest).first()
    caller_name = contact.full_name if contact else "Outbound Destination"

    sid = f"CA-OUT-{uuid.uuid4().hex[:10].upper()}"

    log = CallLog(
        call_sid=sid,
        direction="OUTBOUND",
        caller_number=caller_id,
        caller_name=current_user.full_name or "CorpSec Agent",
        recipient_number=dest,
        queue_id=None,
        agent_id=current_user.id,
        status="IN_PROGRESS",
        duration_seconds=0,
        wait_time_seconds=0,
        recording_url="/static/audio/sample_call_recording.mp3",
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
        "recipient": dest,
        "recipient_name": caller_name,
        "webrtc_session": f"sess_{uuid.uuid4().hex[:12]}"
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
        if payload.notes:
            call.notes = payload.notes
            note_rec = CallNote(call_id=call.id, agent_id=current_user.id, note=payload.notes)
            db.add(note_rec)

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
