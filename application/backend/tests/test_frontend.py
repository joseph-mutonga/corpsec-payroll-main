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



