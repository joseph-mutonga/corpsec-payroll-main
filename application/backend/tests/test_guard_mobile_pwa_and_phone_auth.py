import json
import os
from datetime import date

import pytest

from application.backend.app.core.phone import (
    kenyan_phone_variants,
    normalize_kenyan_phone,
    validate_kenyan_phone,
)
from application.backend.app.core.security import get_password_hash, verify_password
from application.backend.app.models.guard import Guard
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.services.guard_auth_migration import initialize_guard_phone_credentials


def _admin_headers(client):
    resp = client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@corpsec.co.ke",
            "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!"),
        },
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# =====================================================================
# PART 1: GUARD MOBILE PORTAL PWA, ASSETS, CACHING & SECURITY TESTS
# =====================================================================


def test_guard_portal_dedicated_manifest_and_admin_pwa_intact(client):
    """Guard Portal uses dedicated /portal-manifest.json without breaking Admin /manifest.json."""
    portal_html = client.get("/portal")
    assert portal_html.status_code == 200
    html = portal_html.text

    assert 'href="/portal-manifest.json"' in html
    assert 'href="/manifest.json"' not in html
    assert "apple-mobile-web-app-capable" in html
    assert "viewport-fit=cover" in html

    guard_mf = client.get("/portal-manifest.json")
    assert guard_mf.status_code == 200
    gdata = guard_mf.json()
    assert gdata["start_url"] == "/portal"
    assert gdata["scope"] == "/portal"
    assert gdata["display"] == "standalone"
    assert gdata["background_color"] == "#000000"
    assert gdata["theme_color"] == "#000000"
    assert any("guard_pwa_192.png" in i["src"] for i in gdata["icons"])
    assert any("guard_pwa_512_maskable.png" in i["src"] and i.get("purpose") == "maskable" for i in gdata["icons"])

    # Admin manifest remains untouched
    admin_mf = client.get("/manifest.json")
    assert admin_mf.status_code == 200
    adata = admin_mf.json()
    assert adata["start_url"] == "/"
    assert adata["short_name"] == "CorpSec ERP"


def test_guard_portal_inline_svg_splash_and_gzip_and_responsive_admin(client):
    """Verify /portal cold-start SVG splash, GZip compression, and full-app responsive setup."""
    html = client.get("/portal").text
    assert 'id="guard-launch-splash"' in html
    assert "#F67426" in html and "#00AEEA" in html and "#313596" in html
    assert "guard_splash_seen" in html
    assert "guard_apple_touch_icon.png" in html
    assert 'content="#000000"' in html
    assert "clamp(104px, 34vw, 160px)" in html
    assert "prefers-reduced-motion: reduce" in html

    # GZipMiddleware compresses responses cleanly
    gz_resp = client.get("/static/js/portal.js?v=20261128_v2", headers={"Accept-Encoding": "gzip"})
    assert gz_resp.status_code == 200
    assert gz_resp.headers.get("content-encoding") == "gzip"

    # Main admin index & styles responsive upgrades
    idx = client.get("/").text
    assert "viewport-fit=cover" in idx
    assert 'id="mobile-bottom-nav"' in idx
    assert "defer" in idx

    css = client.get("/static/css/styles.css?v=20261128_v2").text
    assert "100dvh" in css
    assert "@media (min-width: 1025px)" in css
    assert "@media (max-width: 639px)" in css


def test_guard_portal_has_no_corpsec_logo_image_and_no_admin_assets(client):
    """Guard Portal UI and SW must not include CorpSec logo images or heavy admin bundles."""
    html = client.get("/portal").text
    assert "corpsec_logo_badge" not in html
    assert "corpsec_logo_full" not in html
    assert "silent-updater.js" not in html
    assert "/static/js/app.js" not in html
    assert "portal-login-section" in html
    assert "portal-force-password-section" in html
    assert "portal-forgot-box" not in html
    assert "togglePortalForgotBox" not in html
    assert "download-launcher" not in html
    assert "Windows PC Launcher" not in html

    sw_resp = client.get("/guard-sw.js")
    assert sw_resp.status_code == 200
    assert sw_resp.headers.get("Service-Worker-Allowed") == "/portal"
    assert "no-cache" in sw_resp.headers.get("Cache-Control", "")
    sw_text = sw_resp.text
    for forbidden in ("corpsec_logo_badge", "corpsec_logo_full", "/static/js/app.js", "call-center", "ai-assistant"):
        assert forbidden not in sw_text
    assert "url.pathname.startsWith('/api/')" in sw_text


def test_guard_portal_versioned_static_asset_caching_headers(client):
    """Versioned guard JS/CSS support caching while HTML/SW stay revalidated."""
    js_resp = client.get("/static/js/portal.js?v=20261128_v2")
    css_resp = client.get("/static/css/portal.css?v=20261128_v2")
    assert js_resp.status_code == 200
    assert css_resp.status_code == 200
    assert "max-age=" in js_resp.headers.get("Cache-Control", "")
    assert "max-age=" in css_resp.headers.get("Cache-Control", "")

    assert "/guard-sw.js" in js_resp.text
    assert "scope: '/portal'" in js_resp.text
    assert "window.location.href = '/'" not in js_resp.text
    assert "window.location.replace('/')" not in js_resp.text


def test_guard_portal_mobile_css_responsiveness_rules(client):
    """Verify border-box sizing, responsive tables/modals, and mobile input/button sizing."""
    css = client.get("/static/css/portal.css?v=20261128_v1").text
    assert "box-sizing: border-box" in css
    assert ("overflow-x: clip" in css or "overflow-x: hidden" in css)
    assert "overscroll-behavior: none" not in css
    assert ".table-responsive" in css
    assert "font-size: 16px" in css
    assert "safe-area-inset-bottom" in css


# =====================================================================
# PART 2: KENYAN PHONE NORMALIZATION & GUARD PHONE LOGIN WORKFLOW
# =====================================================================


def test_kenyan_phone_normalization_and_validation():
    assert normalize_kenyan_phone("0712345678") == "0712345678"
    assert normalize_kenyan_phone("+254712345678") == "0712345678"
    assert normalize_kenyan_phone("254712345678") == "0712345678"
    assert normalize_kenyan_phone("+254 712 345-678") == "0712345678"
    assert normalize_kenyan_phone("+254112345678") == "0112345678"

    for bad in ("", "12345", "07123456789", "+25471234abcd", "0812345678", "+15551234567"):
        ok, _, err = validate_kenyan_phone(bad)
        assert not ok
        assert err

    variants = kenyan_phone_variants("+254712345678")
    assert set(["0712345678", "254712345678", "+254712345678"]).issubset(set(variants))


def test_new_guard_phone_login_normalization_and_forced_password_change(client, db):
    """
    Create guard with +254799112233 -> normalizes to 0799112233, sets initial password = 0799112233
    (hashed + must_change_password=True), accepts 07/+254/254 formats, blocks Guard Portal APIs
    until password changed, and persists new password even after guard profile update.
    """
    headers = _admin_headers(client)

    # 1. Invalid Kenyan phone rejected
    bad_resp = client.post(
        "/api/v1/guards",
        json={
            "full_name": "Invalid Phone Guard",
            "national_id": "99887701",
            "phone": "07123",
            "hire_date": str(date.today()),
        },
        headers=headers,
    )
    assert bad_resp.status_code == 400

    # 2. Valid +254 phone normalizes to 0799112233
    create_resp = client.post(
        "/api/v1/guards",
        json={
            "full_name": "Phone Login Guard",
            "national_id": "99887702",
            "phone": "+254799112233",
            "hire_date": str(date.today()),
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["phone"] == "0799112233"

    # Never expose plaintext password in response
    assert "0799112233" not in json.dumps({k: v for k, v in created.items() if k != "phone"})

    # 3. Duplicate guard in another Kenyan format (254...) rejected
    dup_resp = client.post(
        "/api/v1/guards",
        json={
            "full_name": "Duplicate Phone Guard",
            "national_id": "99887703",
            "phone": "254799112233",
            "hire_date": str(date.today()),
        },
        headers=headers,
    )
    assert dup_resp.status_code == 400

    # Verify non-plaintext password hash in DB
    user = db.query(User).filter(User.guard_id == created["id"]).first()
    assert user is not None
    assert user.id != created["id"]  # confirm we don't assume guard_id == user_id
    assert user.password_hash != "0799112233"
    assert verify_password("0799112233", user.password_hash)
    assert user.must_change_password is True

    # 4. Guard can log in using all equivalent Kenyan formats (+254, 254, 07)
    for fmt in ("+254799112233", "254799112233", "0799112233"):
        login_resp = client.post(
            "/api/v1/auth/login/guard",
            json={"phone": fmt, "password": fmt},
        )
        assert login_resp.status_code == 200
        ldata = login_resp.json()
        assert ldata["guard_id"] == created["id"]
        assert ldata["user_id"] == user.id
        assert ldata["must_change_password"] is True

    token = login_resp.json()["access_token"]
    g_headers = {"Authorization": f"Bearer {token}"}

    # 5. Guard cannot access protected Guard Portal API until password is changed
    dash_blocked = client.get("/api/v1/guard-portal/dashboard", headers=g_headers)
    assert dash_blocked.status_code == 403
    assert dash_blocked.headers.get("X-Password-Change-Required") == "true"

    # Cannot change password back to phone number
    same_pw_resp = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "0799112233",
            "new_password": "+254799112233",
            "confirm_password": "+254799112233",
        },
        headers=g_headers,
    )
    assert same_pw_resp.status_code == 400

    # 6. Change password -> succeeds -> dashboard unlocked -> old phone password no longer works
    chg_resp = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "0799112233",
            "new_password": "MyNewGuardPass!26",
            "confirm_password": "MyNewGuardPass!26",
        },
        headers=g_headers,
    )
    assert chg_resp.status_code == 200

    dash_ok = client.get("/api/v1/guard-portal/dashboard", headers=g_headers)
    assert dash_ok.status_code == 200
    assert dash_ok.json()["guard_id"] == created["id"]

    old_pw_fail = client.post(
        "/api/v1/auth/login/guard",
        json={"phone": "0799112233", "password": "0799112233"},
    )
    assert old_pw_fail.status_code == 401

    new_pw_ok = client.post(
        "/api/v1/auth/login/guard",
        json={"phone": "+254799112233", "password": "MyNewGuardPass!26"},
    )
    assert new_pw_ok.status_code == 200
    assert new_pw_ok.json()["must_change_password"] is False

    # 7. Editing guard profile does NOT reset changed password back to phone number
    upd_resp = client.put(
        f"/api/v1/guards/{created['id']}",
        json={"full_name": "Phone Login Guard Updated"},
        headers=headers,
    )
    assert upd_resp.status_code == 200
    still_custom = client.post(
        "/api/v1/auth/login/guard",
        json={"phone": "0799112233", "password": "MyNewGuardPass!26"},
    )
    assert still_custom.status_code == 200

    # 8. Admin/HR password reset restores initial phone password + requires change again
    reset_resp = client.post(f"/api/v1/guards/{created['id']}/reset-password", headers=headers)
    assert reset_resp.status_code == 200
    assert "0799112233" not in json.dumps(reset_resp.json())

    post_reset_login = client.post(
        "/api/v1/auth/login/guard",
        json={"phone": "254799112233", "password": "0799112233"},
    )
    assert post_reset_login.status_code == 200
    assert post_reset_login.json()["must_change_password"] is True

    # 9. Admin sets a specific custom password -> persisted directly in database
    custom_reset = client.post(
        f"/api/v1/guards/{created['id']}/reset-password",
        json={
            "new_password": "AdminAssigned#2026",
            "confirm_password": "AdminAssigned#2026",
            "must_change_password": False,
        },
        headers=headers,
    )
    assert custom_reset.status_code == 200
    assert custom_reset.json()["custom_password_set"] is True
    assert "AdminAssigned#2026" not in json.dumps(custom_reset.json())

    db.expire_all()
    saved_user = db.query(User).filter(User.guard_id == created["id"]).first()
    assert saved_user is not None
    assert verify_password("AdminAssigned#2026", saved_user.password_hash)
    assert saved_user.must_change_password is False

    old_phone_rejected = client.post(
        "/api/v1/auth/login/guard",
        json={"phone": "0799112233", "password": "0799112233"},
    )
    assert old_phone_rejected.status_code == 401

    custom_login = client.post(
        "/api/v1/auth/login/guard",
        json={"phone": "+254799112233", "password": "AdminAssigned#2026"},
    )
    assert custom_login.status_code == 200
    assert custom_login.json()["must_change_password"] is False


def test_migration_preserves_custom_passwords_and_non_guard_accounts(db):
    """Existing guard migration normalizes phones safely without resetting Admin/HR/Supervisor or custom guard passwords."""
    admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    admin_hash_before = admin.password_hash

    hr_user = User(
        full_name="HR Test",
        email="hr.safe@corpsec.co.ke",
        phone="0700111222",
        password_hash=get_password_hash("HrSecret@2026"),
        role=UserRole.HR.value,
        status=UserStatus.ACTIVE.value,
    )
    db.add(hr_user)

    # Guard with unlinked record and +254 phone
    unlinked_guard = Guard(
        employee_number="CS-88001",
        full_name="Unlinked Migration Guard",
        national_id="88001122",
        phone="+254788112233",
        hire_date=date.today(),
        status="ACTIVE",
    )
    db.add(unlinked_guard)

    # Guard with already-customized password
    custom_guard = Guard(
        employee_number="CS-88002",
        full_name="Custom Password Guard",
        national_id="88002233",
        phone="254788223344",
        hire_date=date.today(),
        status="ACTIVE",
    )
    db.add(custom_guard)
    db.flush()
    custom_user = User(
        full_name="Custom Password Guard",
        email="custom.pw@corpsec.co.ke",
        phone="254788223344",
        password_hash=get_password_hash("CustomGuardSecret#9"),
        role=UserRole.GUARD.value,
        status=UserStatus.ACTIVE.value,
        must_change_password=False,
        guard_id=custom_guard.id,
    )
    db.add(custom_user)
    db.commit()

    summary = initialize_guard_phone_credentials(db, dry_run=False, overwrite_custom_passwords=False)
    assert summary["users_created"] >= 1
    assert summary["phones_normalized"] >= 2

    db.refresh(admin)
    db.refresh(hr_user)
    db.refresh(unlinked_guard)
    db.refresh(custom_guard)
    db.refresh(custom_user)

    # Admin & HR untouched
    assert admin.password_hash == admin_hash_before
    assert verify_password("HrSecret@2026", hr_user.password_hash)

    # Unlinked guard got normalized phone + User account + initial password = 0788112233
    assert unlinked_guard.phone == "0788112233"
    linked_user = db.query(User).filter(User.guard_id == unlinked_guard.id).first()
    assert linked_user is not None
    assert linked_user.phone == "0788112233"
    assert verify_password("0788112233", linked_user.password_hash)
    assert linked_user.must_change_password is True

    # Custom guard password NOT overwritten
    assert custom_guard.phone == "0788223344"
    assert custom_user.phone == "0788223344"
    assert verify_password("CustomGuardSecret#9", custom_user.password_hash)
    assert custom_user.must_change_password is False


def test_management_vs_guard_login_page_separation(client, db):
    """Ensure `/` is Management-Only (Admin/HR/Staff/Supervisors) and `/portal` is Guard-Only."""
    mgmt_html = client.get("/").text
    assert "Management Portal" in mgmt_html
    assert "Log in to your account" in mgmt_html
    assert 'href="/portal"' in mgmt_html

    guard_html = client.get("/portal").text
    assert "Guards Only" in guard_html
    assert "Log in to your account" in guard_html
    assert 'href="/"' in guard_html

    # 1. Management endpoint allows Admin & rejects Guard with 403
    adm_resp = client.post(
        "/api/v1/auth/login/management",
        json={
            "email": "admin@corpsec.co.ke",
            "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!"),
            "portal": "management",
        },
    )
    assert adm_resp.status_code == 200
    assert adm_resp.json()["role"] == "ADMIN"

    guard_blocked_on_mgmt = client.post(
        "/api/v1/auth/login/management",
        json={"email": "peter.otieno@corpsec.co.ke", "password": "Guard@123456", "portal": "management"},
    )
    assert guard_blocked_on_mgmt.status_code == 403
    assert "/portal" in guard_blocked_on_mgmt.json()["detail"]

    # 2. Guard endpoint allows Guard & rejects Admin with 401
    guard_ok = client.post(
        "/api/v1/auth/login/guard",
        json={"phone": "0713345678", "password": "Guard@123456"},
    )
    assert guard_ok.status_code == 200
    assert guard_ok.json()["role"] == "GUARD"

    adm_blocked_on_guard = client.post(
        "/api/v1/auth/login/guard",
        json={"phone": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")},
    )
    assert adm_blocked_on_guard.status_code == 401

    app_js = client.get("/static/js/app.js?v=20261128_v5").text
    assert "/auth/login/management" in app_js
    assert "if (res.status === 404)" in app_js
    assert "(data.role || '').toUpperCase() === 'GUARD'" in app_js
