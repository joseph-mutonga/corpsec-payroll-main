import html
import os
import re
import secrets
import mimetypes
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc, func

from application.backend.app.api.deps import get_db, authorize_chart_analytics
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.site import Site
from application.backend.app.models.guard import Guard
from application.backend.app.models.team_message import TeamMessage, TeamChatRead
from application.backend.app.schemas.team_message import (
    TeamMessageCreate,
    TeamMessageResponse,
    ChatAttachmentUploadResponse,
    MarkReadRequest,
)

router = APIRouter(prefix="/team-chat", tags=["Team Operations Chat"])

CHAT_ATTACHMENTS_DIR = os.path.join(os.getcwd(), "uploads", "team_chat")
os.makedirs(CHAT_ATTACHMENTS_DIR, exist_ok=True)


def format_chat_last_message(
    msg: Optional[TeamMessage],
    default_text: str = "",
    current_user_id: Optional[int] = None,
    is_group: bool = False
) -> str:
    if not msg:
        return default_text
    txt = (msg.message or "").strip()
    prefix = ""
    if current_user_id is not None:
        if msg.user_id == current_user_id:
            prefix = "You: "
        elif is_group and msg.sender_name:
            sname = (msg.sender_name.split('@')[0] or "").replace('.', ' ').strip().title()
            if sname:
                prefix = f"{sname}: "

    body = ""
    if txt:
        if msg.attachment_url:
            if msg.attachment_type and msg.attachment_type.startswith("image/"):
                body = f"📷 {txt}"
            else:
                body = f"📎 {txt}"
        else:
            body = txt
    elif msg.attachment_url:
        if msg.attachment_type and msg.attachment_type.startswith("image/"):
            body = "📷 Photo"
        else:
            body = f"📎 {msg.attachment_name or 'Attachment'}"
    else:
        return default_text

    return f"{prefix}{body}"


@router.get("/contacts")
def getChatContacts(
    current_user: User = Depends(authorize_chart_analytics),
    db: Session = Depends(get_db)
):
    """
    WhatsApp-Style Contacts & Channel Directory:
    1. '🏢 Operations Team Group' (All Admin, HR, Staff & Supervisors - strictly excludes Guards)
    2. Direct contacts for every Supervisor, HR, and Staff member, listed by their official EMAIL address.
    Includes live unread message counts for each conversation and overall total.
    """
    eligible_roles = [
        UserRole.ADMIN.value,
        "System Admin",
        "admin",
        UserRole.HR.value,
        "HR",
        UserRole.SUPERVISOR.value,
        "Supervisor",
        UserRole.STAFF.value,
        "Staff"
    ]

    # 1. Group / Operations Team Channel (Admin, HR, Staff, Supervisors)
    last_group_msg = (
        db.query(TeamMessage)
        .filter(TeamMessage.receiver_id.is_(None))
        .order_by(desc(TeamMessage.created_at))
        .first()
    )

    # Check last read message for group
    group_read_record = (
        db.query(TeamChatRead)
        .filter(TeamChatRead.user_id == current_user.id, TeamChatRead.channel == "group_operations")
        .first()
    )
    last_group_read_id = group_read_record.last_read_message_id if group_read_record else 0

    group_unread_count = (
        db.query(TeamMessage)
        .filter(
            TeamMessage.receiver_id.is_(None),
            TeamMessage.user_id != current_user.id,
            TeamMessage.id > last_group_read_id
        )
        .count()
    )

    contacts = [
        {
            "id": "group_operations",
            "is_group": True,
            "category": "channels",
            "name": "🏢 Operations Team Group",
            "display_name": "Operations Team",
            "email": "operations-group@corpsec.co.ke",
            "subtitle": "Group • All Supervisors, HR & Staff (Guards Excluded)",
            "role": "GROUP",
            "avatar": "👥",
            "avatar_initials": "OP",
            "avatar_bg": "#0F766E",
            "last_message": format_chat_last_message(last_group_msg, "No messages yet in Operations Team", current_user.id, is_group=True),
            "last_time": last_group_msg.created_at.isoformat() if last_group_msg else None,
            "user_id": None,
            "unread_count": group_unread_count
        }
    ]

    # 2. Individual contacts listed by email/name with assigned sites and workforce data
    users = (
        db.query(User)
        .filter(
            User.role.in_(eligible_roles),
            User.role.notin_(["GUARD", "Guard"]),
            User.id != current_user.id
        )
        .order_by(User.role.asc(), User.email.asc())
        .all()
    )

    for u in users:
        # Check last direct message between current_user and this user
        last_dm = (
            db.query(TeamMessage)
            .filter(
                or_(
                    and_(TeamMessage.user_id == current_user.id, TeamMessage.receiver_id == u.id),
                    and_(TeamMessage.user_id == u.id, TeamMessage.receiver_id == current_user.id)
                )
            )
            .order_by(desc(TeamMessage.created_at))
            .first()
        )

        # Unread messages sent by this user to current_user
        dm_unread_count = (
            db.query(TeamMessage)
            .filter(
                TeamMessage.user_id == u.id,
                TeamMessage.receiver_id == current_user.id,
                TeamMessage.is_read.is_(False)
            )
            .count()
        )

        role_display = {
            "ADMIN": "System Admin",
            "admin": "System Admin",
            "System Admin": "System Admin",
            "HR": "HR Manager",
            "SUPERVISOR": "Field Supervisor",
            "Supervisor": "Field Supervisor",
            "STAFF": "Corporate Staff",
            "Staff": "Corporate Staff"
        }.get(u.role, u.role)

        avatar_icon = {
            "ADMIN": "🛡️",
            "admin": "🛡️",
            "HR": "💼",
            "SUPERVISOR": "👨‍💼",
            "Supervisor": "👨‍💼",
            "STAFF": "👤",
            "Staff": "👤"
        }.get(u.role, "👤")

        # Category mapping for organized sidebar sections
        is_sup = str(u.role).upper() in ["SUPERVISOR", "SUPERVISORS"]
        is_admin_or_hr = str(u.role).upper() in ["ADMIN", "SYSTEM ADMIN", "HR", "STAFF"]
        contact_category = "supervisors" if is_sup else ("admin_hr" if is_admin_or_hr else "staff")

        # Database retrieval: Assigned sites & guards count
        assigned_sites = []
        assigned_guards_count = 0
        if is_sup:
            sites_q = db.query(Site).filter(Site.supervisor_id == u.id).all()
            assigned_sites = [s.site_name for s in sites_q]
            assigned_guards_count = db.query(Guard).filter(Guard.supervisor_id == u.id).count()

        # Generate avatar initials
        name_parts = (u.full_name or u.email.split('@')[0]).replace('.', ' ').split()
        if len(name_parts) >= 2:
            initials = f"{name_parts[0][0]}{name_parts[1][0]}".upper()
        elif len(name_parts) == 1 and name_parts[0]:
            initials = name_parts[0][:2].upper()
        else:
            initials = (u.email or "U")[:2].upper()

        avatar_bg = {
            "ADMIN": "#2563EB",
            "admin": "#2563EB",
            "HR": "#059669",
            "SUPERVISOR": "#D97706",
            "Supervisor": "#D97706",
            "STAFF": "#0891B2"
        }.get(u.role, "#475569")

        # Build clean subtitle
        if is_sup:
            if assigned_sites:
                sites_snippet = ", ".join(assigned_sites[:2])
                if len(assigned_sites) > 2:
                    sites_snippet += f" +{len(assigned_sites) - 2}"
                extra_info = f"Supervisor • {sites_snippet}"
            elif assigned_guards_count > 0:
                extra_info = f"Supervisor • {assigned_guards_count} Guards"
            else:
                extra_info = "Field Supervisor • General Roster"
        else:
            extra_info = f"{role_display}" + (f" ({u.full_name})" if u.full_name else "")

        display_name = u.full_name if (u.full_name and u.full_name.strip()) else u.email

        contacts.append({
            "id": f"dm_{u.id}",
            "is_group": False,
            "category": contact_category,
            "display_name": display_name,
            "name": display_name,
            "email": u.email,
            "phone": u.phone or "",
            "full_name": u.full_name or "",
            "subtitle": extra_info,
            "role": u.role,
            "role_display": role_display,
            "assigned_sites": assigned_sites,
            "assigned_sites_str": ", ".join(assigned_sites) if assigned_sites else "None assigned",
            "assigned_guards_count": assigned_guards_count,
            "avatar": avatar_icon,
            "avatar_initials": initials,
            "avatar_bg": avatar_bg,
            "last_message": format_chat_last_message(last_dm, "", current_user.id, is_group=False),
            "last_time": last_dm.created_at.isoformat() if last_dm else None,
            "user_id": u.id,
            "unread_count": dm_unread_count
        })

    # WhatsApp-Style Dynamic Contact Sorting:
    # 1. Unread conversations float to the very top (highest immediate priority).
    # 2. Chronological by newest message timestamp (last_time descending) so whoever texted floats to the top.
    # 3. Contacts with no message history are placed neatly below in the team directory, sorted alphabetically.
    active_contacts = [c for c in contacts if c.get("last_time") or (c.get("unread_count") or 0) > 0]
    active_contacts.sort(
        key=lambda c: (
            1 if (c.get("unread_count") or 0) > 0 else 0,
            c.get("last_time") or ""
        ),
        reverse=True
    )

    inactive_contacts = [c for c in contacts if not c.get("last_time") and (c.get("unread_count") or 0) == 0]
    inactive_contacts.sort(
        key=lambda c: (
            0 if c.get("is_group") else 1,
            c.get("role", ""),
            (c.get("display_name") or c.get("name") or "").lower()
        )
    )

    contacts = active_contacts + inactive_contacts

    total_unread = sum(c["unread_count"] for c in contacts)

    channels_count = len([c for c in contacts if c.get("category") == "channels"])
    supervisors_count = len([c for c in contacts if c.get("category") == "supervisors"])
    admin_hr_count = len([c for c in contacts if c.get("category") in ["admin_hr", "staff"]])

    return {
        "status": "success",
        "current_user": {
            "id": current_user.id,
            "name": current_user.full_name or current_user.email,
            "email": current_user.email,
            "role": current_user.role,
            "phone": current_user.phone
        },
        "counts": {
            "all": len(contacts),
            "channels": channels_count,
            "supervisors": supervisors_count,
            "admin_hr": admin_hr_count,
            "unread": total_unread
        },
        "total_unread": total_unread,
        "contacts": contacts
    }


@router.get("/unread-count")
def getUnreadCount(
    current_user: User = Depends(authorize_chart_analytics),
    db: Session = Depends(get_db)
):
    """
    Returns the total count of unread messages across all channels and direct chats.
    """
    group_read_record = (
        db.query(TeamChatRead)
        .filter(TeamChatRead.user_id == current_user.id, TeamChatRead.channel == "group_operations")
        .first()
    )
    last_group_read_id = group_read_record.last_read_message_id if group_read_record else 0

    group_unread = (
        db.query(TeamMessage)
        .filter(
            TeamMessage.receiver_id.is_(None),
            TeamMessage.user_id != current_user.id,
            TeamMessage.id > last_group_read_id
        )
        .count()
    )

    dm_unread = (
        db.query(TeamMessage)
        .filter(
            TeamMessage.receiver_id == current_user.id,
            TeamMessage.is_read.is_(False)
        )
        .count()
    )

    return {
        "status": "success",
        "total_unread": group_unread + dm_unread,
        "group_unread": group_unread,
        "dm_unread": dm_unread
    }


@router.post("/mark-read")
def markMessagesAsRead(
    payload: MarkReadRequest,
    current_user: User = Depends(authorize_chart_analytics),
    db: Session = Depends(get_db)
):
    """
    Marks messages as read for a given channel or direct chat contact.
    """
    if payload.contact_id == "group_operations" or payload.user_id is None:
        max_id = db.query(func.max(TeamMessage.id)).filter(TeamMessage.receiver_id.is_(None)).scalar() or 0
        read_record = (
            db.query(TeamChatRead)
            .filter(TeamChatRead.user_id == current_user.id, TeamChatRead.channel == "group_operations")
            .first()
        )
        if not read_record:
            read_record = TeamChatRead(
                user_id=current_user.id,
                channel="group_operations",
                last_read_message_id=max_id
            )
            db.add(read_record)
        else:
            if max_id > read_record.last_read_message_id:
                read_record.last_read_message_id = max_id
        db.commit()
    else:
        db.query(TeamMessage).filter(
            TeamMessage.user_id == payload.user_id,
            TeamMessage.receiver_id == current_user.id,
            TeamMessage.is_read.is_(False)
        ).update({"is_read": True}, synchronize_session=False)
        db.commit()

    return {"status": "success", "marked_read": True}


@router.get("/messages", response_model=List[TeamMessageResponse])
def getTeamMessages(
    receiver_id: Optional[int] = Query(None, description="Optional target user ID for 1-on-1 direct messages; None for group"),
    limit: int = 100,
    auto_mark_read: bool = Query(True, description="Automatically mark incoming messages as read"),
    current_user: User = Depends(authorize_chart_analytics),
    db: Session = Depends(get_db)
):
    """
    Retrieves messages for either:
    - Group Operations Channel (receiver_id is None)
    - Direct 1-on-1 Conversation between current_user and receiver_id
    Automatically marks incoming messages as read so the other participant sees blue ticks.
    """
    if receiver_id is None:
        messages = (
            db.query(TeamMessage)
            .filter(TeamMessage.receiver_id.is_(None))
            .order_by(desc(TeamMessage.created_at))
            .limit(limit)
            .all()
        )
        if auto_mark_read and messages:
            max_id = max(m.id for m in messages)
            read_record = (
                db.query(TeamChatRead)
                .filter(TeamChatRead.user_id == current_user.id, TeamChatRead.channel == "group_operations")
                .first()
            )
            if not read_record:
                read_record = TeamChatRead(
                    user_id=current_user.id,
                    channel="group_operations",
                    last_read_message_id=max_id
                )
                db.add(read_record)
            else:
                if max_id > read_record.last_read_message_id:
                    read_record.last_read_message_id = max_id
            db.commit()
    else:
        messages = (
            db.query(TeamMessage)
            .filter(
                or_(
                    and_(TeamMessage.user_id == current_user.id, TeamMessage.receiver_id == receiver_id),
                    and_(TeamMessage.user_id == receiver_id, TeamMessage.receiver_id == current_user.id)
                )
            )
            .order_by(desc(TeamMessage.created_at))
            .limit(limit)
            .all()
        )
        if auto_mark_read:
            updated = (
                db.query(TeamMessage)
                .filter(
                    TeamMessage.user_id == receiver_id,
                    TeamMessage.receiver_id == current_user.id,
                    TeamMessage.is_read.is_(False)
                )
                .update({"is_read": True}, synchronize_session=False)
            )
            if updated:
                db.commit()

    # Return chronological order (oldest to newest)
    messages.reverse()
    return messages


@router.post("/upload", response_model=ChatAttachmentUploadResponse)
async def uploadChatAttachment(
    file: UploadFile = File(...),
    current_user: User = Depends(authorize_chart_analytics),
):
    """
    Upload an attachment (image, photo, PDF, spreadsheet, document) for Team Chat.
    Max file size: 25 MB.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file was provided."
        )

    original_name = os.path.basename(file.filename).strip()
    ext = os.path.splitext(original_name)[1].lower()
    allowed_exts = {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv",
        ".txt", ".zip", ".tar", ".gz"
    }
    if ext not in allowed_exts and not (file.content_type and file.content_type.startswith("image/")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{ext}' is not supported. Supported: images, PDF, Word, Excel, CSV, text."
        )

    content = await file.read()
    file_size = len(content)
    if file_size > 25 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Attachment exceeds maximum file limit of 25MB."
        )

    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    rand_token = secrets.token_hex(4)
    safe_basename = re.sub(r'[^a-zA-Z0-9_\.-]', '_', original_name)
    stored_filename = f"{timestamp_str}_{rand_token}_{safe_basename}"
    stored_path = os.path.join(CHAT_ATTACHMENTS_DIR, stored_filename)

    with open(stored_path, "wb") as f:
        f.write(content)

    mime_type = file.content_type or "application/octet-stream"
    file_url = f"/api/v1/team-chat/attachments/{stored_filename}"

    return ChatAttachmentUploadResponse(
        status="success",
        file_url=file_url,
        file_name=original_name,
        file_type=mime_type,
        file_size=file_size
    )


@router.get("/attachments/{file_name}")
def getChatAttachment(
    file_name: str,
    download: bool = Query(False),
    current_user: User = Depends(authorize_chart_analytics)
):
    """
    Serves a team chat attachment securely.
    Supports viewing in browser (images, PDFs) or downloading.
    """
    clean_name = os.path.basename(file_name)
    file_path = os.path.join(CHAT_ATTACHMENTS_DIR, clean_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file not found.")

    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "application/octet-stream"

    disposition = "attachment" if download else "inline"
    return FileResponse(
        path=file_path,
        media_type=mime_type,
        filename=clean_name,
        headers={"Content-Disposition": f'{disposition}; filename="{clean_name}"'}
    )


@router.post("/messages", response_model=TeamMessageResponse, status_code=status.HTTP_201_CREATED)
def postTeamMessage(
    payload: TeamMessageCreate,
    current_user: User = Depends(authorize_chart_analytics),
    db: Session = Depends(get_db)
):
    """
    Sends a message to the Group (all supervisors, HR & staff) or directly to a selected user.
    Supports optional file attachments (photos, documents, spreadsheets).
    """
    clean_msg = (payload.message or "").strip()
    has_attachment = bool(payload.attachment_url and payload.attachment_url.strip())

    if not clean_msg and not has_attachment:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message content or attachment cannot be blank."
        )

    sanitized = html.escape(clean_msg) if clean_msg else ""
    display_name = current_user.email

    new_msg = TeamMessage(
        user_id=current_user.id,
        receiver_id=payload.receiver_id,
        channel=payload.channel or ("operations" if payload.receiver_id is None else "direct"),
        sender_name=display_name,
        sender_role=current_user.role,
        message=sanitized,
        attachment_url=payload.attachment_url.strip() if payload.attachment_url else None,
        attachment_name=payload.attachment_name.strip() if payload.attachment_name else None,
        attachment_type=payload.attachment_type.strip() if payload.attachment_type else None,
        attachment_size=payload.attachment_size,
        is_read=False
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    return new_msg


@router.delete("/messages/{message_id}", status_code=status.HTTP_200_OK)
def deleteTeamMessage(
    message_id: int,
    current_user: User = Depends(authorize_chart_analytics),
    db: Session = Depends(get_db)
):
    """
    Deletes a message.
    """
    msg = db.query(TeamMessage).filter(TeamMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")

    is_admin = current_user.role in [UserRole.ADMIN.value, "System Admin", "admin"]
    is_author = msg.user_id == current_user.id

    if not (is_admin or is_author):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own messages unless you are a System Admin."
        )

    db.delete(msg)
    db.commit()
    return {"status": "success", "message": "Message deleted."}


@router.post("/messages/{message_id}/pin")
def togglePinMessage(
    message_id: int,
    current_user: User = Depends(authorize_chart_analytics),
    db: Session = Depends(get_db)
):
    """
    Pins or unpins a message in the Team Chat channel.
    """
    msg = db.query(TeamMessage).filter(TeamMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")

    msg.is_pinned = not getattr(msg, "is_pinned", False)
    db.commit()
    db.refresh(msg)
    return {
        "status": "success",
        "id": msg.id,
        "is_pinned": msg.is_pinned,
        "message": "Message pinned successfully." if msg.is_pinned else "Message unpinned successfully."
    }


@router.get("/pinned-messages", response_model=List[TeamMessageResponse])
def getPinnedMessages(
    receiver_id: Optional[int] = Query(None, description="Optional target user ID for direct messages; None for group"),
    current_user: User = Depends(authorize_chart_analytics),
    db: Session = Depends(get_db)
):
    """
    Retrieves all pinned messages for the active conversation (Group Operations or 1-on-1 DM).
    """
    if receiver_id is None:
        pinned = (
            db.query(TeamMessage)
            .filter(TeamMessage.receiver_id.is_(None), TeamMessage.is_pinned.is_(True))
            .order_by(desc(TeamMessage.created_at))
            .all()
        )
    else:
        pinned = (
            db.query(TeamMessage)
            .filter(
                or_(
                    and_(TeamMessage.user_id == current_user.id, TeamMessage.receiver_id == receiver_id),
                    and_(TeamMessage.user_id == receiver_id, TeamMessage.receiver_id == current_user.id)
                ),
                TeamMessage.is_pinned.is_(True)
            )
            .order_by(desc(TeamMessage.created_at))
            .all()
        )
    return pinned
