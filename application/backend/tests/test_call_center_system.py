import pytest
from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.call_center import (
    CallQueue, PhoneNumber, QueueMember, AgentStatus, CallLog, CallerContact, CallNote
)


def get_or_create_user(db, email: str, role: UserRole, full_name: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            phone=f"+25470000{abs(hash(email)) % 10000:04d}",
            password_hash=get_password_hash("TestPass123!"),
            full_name=full_name,
            role=role.value,
            status=UserStatus.ACTIVE.value
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def test_call_center_overview_and_agent_status(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Overview KPIs
    res = client.get("/api/v1/call-center/overview", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_calls_today" in data
    assert "avg_wait_time_seconds" in data
    assert "active_agents_count" in data
    assert "missed_today" in data

    # 2. Get Agent Status (defaults to AVAILABLE if not set)
    res_status = client.get("/api/v1/call-center/agent-status", headers=headers)
    assert res_status.status_code == 200
    assert res_status.json()["status"] in ["AVAILABLE", "ON_CALL", "BREAK", "OFFLINE"]

    # 3. Update Agent Status to BREAK
    res_update = client.put(
        "/api/v1/call-center/agent-status",
        headers=headers,
        json={"status": "BREAK"}
    )
    assert res_update.status_code == 200
    assert res_update.json()["agent_status"] == "BREAK"

    # Reset back to AVAILABLE
    client.put("/api/v1/call-center/agent-status", headers=headers, json={"status": "AVAILABLE"})

    # Verify listing of all agents
    res_agents = client.get("/api/v1/call-center/agents", headers=headers)
    assert res_agents.status_code == 200
    agents = res_agents.json()
    assert len(agents) >= 1
    assert any(a["user_id"] == admin.id for a in agents)


def test_call_queues_and_virtual_numbers(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a Call Queue
    queue_payload = {
        "name": "Rapid Armed Response",
        "description": "High priority emergency dispatch queue",
        "strategy": "LONGEST_IDLE",
        "hold_music_url": "/static/audio/hold_music.mp3",
        "max_wait_time_seconds": 120
    }
    res_q = client.post("/api/v1/call-center/queues", headers=headers, json=queue_payload)
    assert res_q.status_code == 200
    queue = res_q.json()
    assert queue["name"] == "Rapid Armed Response"
    assert queue["strategy"] == "LONGEST_IDLE"
    queue_id = queue["id"]

    # 2. List Queues
    res_q_list = client.get("/api/v1/call-center/queues", headers=headers)
    assert res_q_list.status_code == 200
    queues = res_q_list.json()
    assert any(q["id"] == queue_id for q in queues)

    # 3. Create a Virtual Phone Number mapped to this queue
    number_payload = {
        "phone_number": "+254207909999",
        "friendly_name": "Armed Response HotLine",
        "provider": "Twilio",
        "assigned_queue_id": queue_id,
        "record_calls": True,
        "voicemail_enabled": True
    }
    res_num = client.post("/api/v1/call-center/numbers", headers=headers, json=number_payload)
    assert res_num.status_code == 200
    num_data = res_num.json()
    assert num_data["phone_number"] == "+254207909999"
    assert num_data["assigned_queue_id"] == queue_id

    # 4. List Numbers
    res_num_list = client.get("/api/v1/call-center/numbers", headers=headers)
    assert res_num_list.status_code == 200
    nums = res_num_list.json()
    assert any(n["phone_number"] == "+254207909999" for n in nums)


def test_caller_contacts_and_lookup(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a caller contact
    contact_payload = {
        "full_name": "Grace Mutua",
        "phone_number": "+254722334455",
        "email": "gmutua@safarihotel.ke",
        "company_or_site": "Safari Grand Hotel",
        "notes": "Operations Director",
        "vip_level": "VIP"
    }
    res = client.post("/api/v1/call-center/contacts", headers=headers, json=contact_payload)
    assert res.status_code == 200
    contact = res.json()
    assert contact["full_name"] == "Grace Mutua"
    assert contact["vip_level"] == "VIP"

    # 2. Search contacts
    res_search = client.get("/api/v1/call-center/contacts?search=Mutua", headers=headers)
    assert res_search.status_code == 200
    contacts = res_search.json()
    assert len(contacts) >= 1
    assert contacts[0]["phone_number"] == "+254722334455"

    # 3. Lookup contact by phone number
    res_lookup = client.get("/api/v1/call-center/contacts/lookup?phone=+254722334455", headers=headers)
    assert res_lookup.status_code == 200
    lookup_data = res_lookup.json()
    assert lookup_data["found"] is True
    assert lookup_data["full_name"] == "Grace Mutua"


def test_call_lifecycle_dial_answer_hold_transfer_hangup(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # Set agent to AVAILABLE
    client.put("/api/v1/call-center/agent-status", headers=headers, json={"status": "AVAILABLE"})

    # 1. Dial Outbound Call
    dial_res = client.post(
        "/api/v1/call-center/calls/dial",
        headers=headers,
        json={"destination_number": "+254711223344"}
    )
    assert dial_res.status_code == 200
    call_info = dial_res.json()
    call_id = call_info["call_id"]
    assert call_info["status"] == "connected"

    # 2. Answer Call
    ans_res = client.post(f"/api/v1/call-center/calls/{call_id}/answer", headers=headers)
    assert ans_res.status_code == 200
    assert ans_res.json()["status"] == "in_progress"

    # 3. Toggle Call on Hold (becomes ON_HOLD)
    hold_res = client.post(f"/api/v1/call-center/calls/{call_id}/hold", headers=headers)
    assert hold_res.status_code == 200
    assert hold_res.json()["status"] == "ON_HOLD"

    # 4. Toggle Call Hold again (resumes to IN_PROGRESS)
    resume_res = client.post(f"/api/v1/call-center/calls/{call_id}/hold", headers=headers)
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "IN_PROGRESS"

    # 5. Add Call Notes
    note_res = client.post(
        f"/api/v1/call-center/calls/{call_id}/notes",
        headers=headers,
        json={"note": "Guard reported CCTV sensor malfunction"}
    )
    assert note_res.status_code == 200
    assert note_res.json()["status"] == "success"

    # 6. Hangup Call with Disposition
    hangup_res = client.post(
        f"/api/v1/call-center/calls/{call_id}/hangup",
        headers=headers,
        json={"disposition": "RESOLVED", "notes": "Maintenance ticket #902 opened"}
    )
    assert hangup_res.status_code == 200
    assert hangup_res.json()["status"] == "completed"


def test_simulate_inbound_call_and_routing(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # Ensure agent is available
    client.put("/api/v1/call-center/agent-status", headers=headers, json={"status": "AVAILABLE"})

    # Create a test queue
    q_res = client.post(
        "/api/v1/call-center/queues",
        headers=headers,
        json={"name": "Night Dispatch", "strategy": "ROUND_ROBIN"}
    )
    queue_id = q_res.json()["id"]

    # Assign agent to queue
    db.add(QueueMember(queue_id=queue_id, user_id=admin.id, priority=1))
    db.commit()

    # Simulate Incoming Call
    sim_res = client.post(
        "/api/v1/call-center/calls/simulate-incoming",
        headers=headers,
        json={
            "caller_name": "Sergeant Omondi",
            "caller_number": "+254733123456",
            "queue_id": queue_id
        }
    )
    assert sim_res.status_code == 200
    sim_call = sim_res.json()
    assert sim_call["caller_name"] == "Sergeant Omondi"
    assert sim_call["status"] == "ringing"
    assert sim_call["call_id"] is not None


def test_call_history_recordings_and_missed_endpoints(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Call logs listing
    res_calls = client.get("/api/v1/call-center/calls", headers=headers)
    assert res_calls.status_code == 200
    assert isinstance(res_calls.json(), list)

    # 2. Recordings listing
    res_rec = client.get("/api/v1/call-center/recordings", headers=headers)
    assert res_rec.status_code == 200
    assert isinstance(res_rec.json(), list)

    # 3. Missed calls listing
    res_missed = client.get("/api/v1/call-center/missed", headers=headers)
    assert res_missed.status_code == 200
    assert isinstance(res_missed.json(), list)

    # 4. WebRTC Token endpoint
    res_token = client.get("/api/v1/call-center/webrtc/token", headers=headers)
    assert res_token.status_code == 200
    token_data = res_token.json()
    assert "token" in token_data
    assert "identity" in token_data
