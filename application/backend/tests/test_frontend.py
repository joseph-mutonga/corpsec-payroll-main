import pytest


def test_serve_frontend_index_and_static(client):
    # Test index.html endpoint
    response = client.get("/")
    assert response.status_code == 200
    assert "CORPSEC PAYROLL" in response.text
    assert "Guard Directory" in response.text

    # Test static CSS endpoint
    css_resp = client.get("/static/css/styles.css")
    assert css_resp.status_code == 200
    assert "--color-primary" in css_resp.text

    # Test static JS endpoint
    js_resp = client.get("/static/js/app.js")
    assert js_resp.status_code == 200
    assert "switchTab" in js_resp.text


def test_top_bar_buttons_and_modals_existence(client):
    response = client.get("/")
    assert response.status_code == 200
    html = response.text

    # Check top bar buttons
    assert 'onclick="toggleSearchModal()"' in html
    assert 'onclick="toggleNotificationsDropdown(event)"' in html
    assert 'onclick="toggleProfileDropdown(event)"' in html
    assert 'onclick="openRunPayrollModal()"' in html

    # Check modals exist in HTML
    assert 'id="modal-search"' in html
    assert 'id="modal-profile"' in html
    assert 'id="modal-confirm-payroll"' in html
    assert 'id="modal-import-csv"' in html
    assert 'id="modal-export-returns"' in html


def test_guard_deactivation_and_archive_ui(client):
    response = client.get("/")
    assert response.status_code == 200
    html = response.text

    # Verify sub-tabs for active roster and deactivated archive
    assert 'id="guard-tab-btn-active"' in html
    assert 'id="guard-tab-btn-inactive"' in html
    assert 'id="guards-subview-active"' in html
    assert 'id="guards-subview-inactive"' in html

    # Verify tables
    assert 'id="guards-table-body"' in html
    assert 'id="inactive-guards-table-body"' in html
    assert 'id="active-guards-tab-badge"' in html
    assert 'id="inactive-guards-tab-badge"' in html

    # Verify modals
    assert 'id="modal-deactivate-guard"' in html
    assert 'id="modal-reactivate-guard"' in html
    assert 'id="deact-guard-reason"' in html

    # Verify JS static app.js exports
    js_resp = client.get("/static/js/app.js")
    assert js_resp.status_code == 200
    js_text = js_resp.text
    assert "switchGuardSubTab" in js_text
    assert "openDeactivateGuardModal" in js_text
    assert "submitDeactivateGuard" in js_text
    assert "openReactivateGuardModal" in js_text
    assert "submitReactivateGuard" in js_text
    assert "filterInactiveGuardsTable" in js_text


def test_site_edit_and_supervisor_assignment_ui(client):
    response = client.get("/")
    assert response.status_code == 200
    html = response.text

    # Verify Edit Site modal & elements exist
    assert 'id="modal-edit-site"' in html
    assert 'id="edit-site-name"' in html
    assert 'id="edit-site-supervisor-select"' in html
    assert 'id="edit-site-daily-rate"' in html
    assert 'id="new-site-supervisor-select"' in html

    # Verify Supervisor Site Allocation Panel exists
    assert 'id="supervisor-assign-sites-panel"' in html
    assert 'id="supervisor-assign-sites-list"' in html
    assert 'saveSupervisorSiteAssignments()' in html

    # Verify JS exports
    js_resp = client.get("/static/js/app.js")
    assert js_resp.status_code == 200
    js_text = js_resp.text
    assert "openEditSiteModal" in js_text
    assert "closeEditSiteModal" in js_text
    assert "handleEditSiteSubmit" in js_text
    assert "openSupervisorAssignSitesPanel" in js_text
    assert "closeSupervisorAssignSitesPanel" in js_text
    assert "saveSupervisorSiteAssignments" in js_text


def test_guards_directory_download_application_section(client):
    response = client.get("/")
    assert response.status_code == 200
    html = response.text

    # Verify download subtab in Guards Directory
    assert 'id="guard-tab-btn-download"' in html
    assert 'switchGuardSubTab(\'download\')' in html
    assert 'id="guards-subview-download"' in html

    # Verify download links and launcher actions inside guards directory
    assert '/api/v1/desktop/download-launcher' in html
    assert '/api/v1/desktop/download-package' in html
    assert 'id="guards-detected-machine-os"' in html
    assert 'id="guard-directory-portal-url"' in html
    assert 'copyGuardPortalUrl()' in html
    assert 'shareGuardPortalWhatsApp()' in html
    assert 'shareGuardPortalSMS()' in html

    # Verify JS exports in app.js
    js_resp = client.get("/static/js/app.js")
    assert js_resp.status_code == 200
    js_text = js_resp.text
    assert "initGuardDirectoryDownloadSection" in js_text
    assert "copyGuardPortalUrl" in js_text
    assert "shareGuardPortalWhatsApp" in js_text
    assert "shareGuardPortalSMS" in js_text

    # Verify Guard Portal (portal.html) download and install section
    portal_resp = client.get("/portal")
    assert portal_resp.status_code == 200
    p_html = portal_resp.text
    assert "Download &amp; Install Guard App" in p_html
    assert "triggerPortalPwaInstall()" in p_html


def test_guard_pwa_manifest_and_service_worker_routes(client):
    # Dedicated Guard PWA manifest
    manifest_resp = client.get("/portal-manifest.json")
    assert manifest_resp.status_code == 200
    assert "application/manifest+json" in manifest_resp.headers.get("content-type", "")
    assert "no-cache" in manifest_resp.headers.get("cache-control", "").lower()
    manifest_data = manifest_resp.json()
    assert manifest_data["start_url"] == "/portal"
    assert manifest_data["scope"] == "/portal"
    assert len(manifest_data.get("icons", [])) >= 2

    # Dedicated Guard PWA service worker
    sw_resp = client.get("/guard-sw.js")
    assert sw_resp.status_code == 200
    assert "javascript" in sw_resp.headers.get("content-type", "")
    assert sw_resp.headers.get("service-worker-allowed") == "/portal"
    assert "no-cache" in sw_resp.headers.get("cache-control", "").lower()
    assert "GUARD_SW_VERSION" in sw_resp.text
    assert "__ASSET_VERSION__" not in sw_resp.text

    # Central ASSET_VERSION injection & HTTP caching policy
    from application.backend.app.core.config import settings
    portal_resp = client.get("/portal")
    assert portal_resp.status_code == 200
    assert f"?v={settings.ASSET_VERSION}" in portal_resp.text
    assert "__ASSET_VERSION__" not in portal_resp.text
    assert "no-store" in portal_resp.headers.get("cache-control", "").lower()

    versioned_css = client.get(f"/static/css/portal.css?v={settings.ASSET_VERSION}")
    assert versioned_css.status_code == 200
    assert "immutable" in versioned_css.headers.get("cache-control", "").lower()

    legacy_versioned_css = client.get("/static/css/portal.css?v=legacy_hardcoded_tag")
    assert legacy_versioned_css.status_code == 200
    assert "immutable" not in legacy_versioned_css.headers.get("cache-control", "").lower()

    unversioned_css = client.get("/static/css/portal.css")
    assert unversioned_css.status_code == 200
    assert "no-store" in unversioned_css.headers.get("cache-control", "").lower()

    api_health = client.get("/api/health")
    assert api_health.status_code == 200
    assert "no-store" in api_health.headers.get("cache-control", "").lower()





