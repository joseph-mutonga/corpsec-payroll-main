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

