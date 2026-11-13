import datetime
from application.backend.app.core.database import SessionLocal
from application.backend.app.models.call_center import PhoneNumber, CallQueue, QueueMember, AgentStatus, CallerContact, CallLog
from application.backend.app.models.user import User, UserRole

def seed_call_center():
    db = SessionLocal()
    try:
        # 1. Queues
        q1 = db.query(CallQueue).filter(CallQueue.name == "Emergency Guard Dispatch").first()
        if not q1:
            q1 = CallQueue(
                name="Emergency Guard Dispatch",
                description="Priority 1 line for security incident escalations and rapid field unit dispatch.",
                strategy="RING_ALL",
                max_wait_time_seconds=180,
                wrap_up_time_seconds=15,
                welcome_greeting="Thank you for calling CorpSec Emergency Dispatch. Connecting you to an on-duty operations controller immediately.",
                is_active=True
            )
            db.add(q1)

        q2 = db.query(CallQueue).filter(CallQueue.name == "General Client Services").first()
        if not q2:
            q2 = CallQueue(
                name="General Client Services",
                description="Customer service, billing inquiries, and guard patrol schedule requests.",
                strategy="ROUND_ROBIN",
                max_wait_time_seconds=300,
                wrap_up_time_seconds=30,
                welcome_greeting="Welcome to CorpSec Security Services. Please hold while we connect you to the next available agent.",
                is_active=True
            )
            db.add(q2)
        db.commit()

        # 2. Virtual Phone Numbers
        p1 = db.query(PhoneNumber).filter(PhoneNumber.phone_number == "+254 20 790 0000").first()
        if not p1:
            p1 = PhoneNumber(
                phone_number="+254 20 790 0000",
                friendly_name="HQ 24/7 Emergency Dispatch",
                provider="Twilio Voice",
                assigned_queue_id=q1.id,
                record_calls=True,
                voicemail_enabled=True,
                ivr_greeting="CorpSec Security Operations Command. For emergency dispatch press 1. For general inquiries press 2.",
                status="ACTIVE"
            )
            db.add(p1)

        p2 = db.query(PhoneNumber).filter(PhoneNumber.phone_number == "+254 700 800 900").first()
        if not p2:
            p2 = PhoneNumber(
                phone_number="+254 700 800 900",
                friendly_name="Client Support & Inquiries Hotline",
                provider="Africa's Talking",
                assigned_queue_id=q2.id,
                record_calls=True,
                voicemail_enabled=True,
                ivr_greeting="Welcome to CorpSec Client Support. Connecting your call to our service team.",
                status="ACTIVE"
            )
            db.add(p2)
        db.commit()

        # 3. Caller Contacts
        c1 = db.query(CallerContact).filter(CallerContact.phone_number == "+254 712 345 678").first()
        if not c1:
            c1 = CallerContact(
                phone_number="+254 712 345 678",
                full_name="James Mwangi",
                company_or_site="Westlands Mall Facility Directorate",
                email="j.mwangi@westlandsmall.co.ke",
                vip_level="VIP",
                notes="Primary client liaison for Westlands Shopping Mall security contract.",
                total_calls=4
            )
            db.add(c1)

        c2 = db.query(CallerContact).filter(CallerContact.phone_number == "+254 722 987 654").first()
        if not c2:
            c2 = CallerContact(
                phone_number="+254 722 987 654",
                full_name="Sarah Ochieng",
                company_or_site="KICC Event Security Secretariat",
                email="sochieng@kicc.go.ke",
                vip_level="VIP",
                notes="Security coordinator for international conferences and events.",
                total_calls=2
            )
            db.add(c2)

        c3 = db.query(CallerContact).filter(CallerContact.phone_number == "+254 733 112 233").first()
        if not c3:
            c3 = CallerContact(
                phone_number="+254 733 112 233",
                full_name="Capt. David Kiprono",
                company_or_site="Mombasa Port Container Terminal",
                email="dkiprono@kpa.co.ke",
                vip_level="EMERGENCY",
                notes="Port safety manager. Immediate escalation on perimeter alerts.",
                total_calls=6
            )
            db.add(c3)
        db.commit()

        # 4. Map active agents to queues and statuses
        agents = db.query(User).filter(User.role.in_([UserRole.ADMIN.value, UserRole.SUPERVISOR.value, UserRole.STAFF.value, UserRole.HR.value])).all()
        for ag in agents:
            st = db.query(AgentStatus).filter(AgentStatus.user_id == ag.id).first()
            if not st:
                st = AgentStatus(
                    user_id=ag.id,
                    status="AVAILABLE",
                    calls_taken_today=3 if ag.role == "ADMIN" else 1,
                    total_talk_time_seconds=420 if ag.role == "ADMIN" else 180,
                    device_channel="WebRTC"
                )
                db.add(st)
            
            qm = db.query(QueueMember).filter(QueueMember.queue_id == q1.id, QueueMember.user_id == ag.id).first()
            if not qm:
                qm = QueueMember(queue_id=q1.id, user_id=ag.id, priority=1, calls_handled=2)
                db.add(qm)
        db.commit()

        # 5. Seed some initial recent call logs
        admin_user = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
        cl_count = db.query(CallLog).count()
        if cl_count == 0:
            logs = [
                CallLog(
                    call_sid="CA-20261112-001",
                    direction="INBOUND",
                    caller_number="+254 712 345 678",
                    caller_name="James Mwangi",
                    recipient_number="+254 20 790 0000",
                    queue_id=q1.id,
                    agent_id=admin_user.id if admin_user else None,
                    status="COMPLETED",
                    duration_seconds=142,
                    wait_time_seconds=12,
                    recording_url="/static/audio/sample_call_recording.mp3",
                    disposition="Resolved",
                    notes="Requested two additional perimeter night guards for Westlands Mall gate 3 this weekend.",
                    created_at=datetime.datetime.now() - datetime.timedelta(minutes=45),
                    ended_at=datetime.datetime.now() - datetime.timedelta(minutes=42)
                ),
                CallLog(
                    call_sid="CA-20261112-002",
                    direction="INBOUND",
                    caller_number="+254 733 112 233",
                    caller_name="Capt. David Kiprono",
                    recipient_number="+254 20 790 0000",
                    queue_id=q1.id,
                    agent_id=admin_user.id if admin_user else None,
                    status="COMPLETED",
                    duration_seconds=210,
                    wait_time_seconds=8,
                    recording_url="/static/audio/sample_call_recording.mp3",
                    disposition="Guard Dispatched",
                    notes="Reported malfunctioning CCTV camera at Berth 4. Notified Supervisor for field inspection.",
                    created_at=datetime.datetime.now() - datetime.timedelta(minutes=25),
                    ended_at=datetime.datetime.now() - datetime.timedelta(minutes=21)
                ),
                CallLog(
                    call_sid="CA-20261112-003",
                    direction="INBOUND",
                    caller_number="+254 722 987 654",
                    caller_name="Sarah Ochieng",
                    recipient_number="+254 700 800 900",
                    queue_id=q2.id,
                    agent_id=None,
                    status="MISSED",
                    duration_seconds=0,
                    wait_time_seconds=45,
                    disposition="Follow-up Required",
                    notes="Caller disconnected before agent pickup. Scheduled callback required.",
                    created_at=datetime.datetime.now() - datetime.timedelta(minutes=15)
                ),
                CallLog(
                    call_sid="CA-20261112-004",
                    direction="OUTBOUND",
                    caller_number="+254 20 790 0000",
                    caller_name="CorpSec Dispatch",
                    recipient_number="+254 711 000 999",
                    queue_id=None,
                    agent_id=admin_user.id if admin_user else None,
                    status="COMPLETED",
                    duration_seconds=95,
                    wait_time_seconds=0,
                    recording_url="/static/audio/sample_call_recording.mp3",
                    disposition="Resolved",
                    notes="Outbound radio check and shift briefing with Site Super Guard at Chap Chap branch.",
                    created_at=datetime.datetime.now() - datetime.timedelta(minutes=5),
                    ended_at=datetime.datetime.now() - datetime.timedelta(minutes=3)
                )
            ]
            db.add_all(logs)
            db.commit()

        print("Initial Call Centre data seeded successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    seed_call_center()

