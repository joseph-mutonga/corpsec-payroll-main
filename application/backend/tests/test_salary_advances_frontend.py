import pytest
from fastapi.testclient import TestClient


def test_salary_advances_html_elements_and_tables(client: TestClient):
    """Verify that Salary Advances panel, modals, and tables exist in index.html."""
    res = client.get("/")
    assert res.status_code == 200
    html = res.text

    # 1. Nav item
    assert "switchTab('salary-advances')" in html
    assert "💵 Salary Advances" in html

    # 2. Main panel & KPIs
    assert 'id="panel-salary-advances"' in html
    assert 'id="adv-kpi-disbursed"' in html
    assert 'id="adv-kpi-deducted"' in html
    assert 'id="adv-kpi-pending"' in html
    assert 'id="adv-kpi-count"' in html

    # 3. Filters & Table
    assert 'id="adv-filter-type"' in html
    assert 'id="adv-filter-status"' in html
    assert 'id="adv-filter-search"' in html
    assert 'id="salary-advances-table-body"' in html

    # 4. Issue Advance Modal
    assert 'id="modal-issue-advance"' in html
    assert 'id="form-issue-salary-advance"' in html
    assert 'name="adv_recipient_type"' in html
    assert 'id="adv-guard-id"' in html
    assert 'id="adv-staff-id"' in html
    assert 'id="adv-amount"' in html
    assert 'id="adv-date"' in html
    assert 'id="adv-payment-method"' in html
    assert 'id="adv-ref-number"' in html
    assert 'id="adv-reason"' in html

    # 5. Staff File Modal Salary Advances section
    assert 'id="staff-advances-table-body"' in html
    assert "openStaffIssueAdvanceModal()" in html

    # 6. Payroll Review Table has new columns
    assert "Days Worked" in html
    assert "Off-Day / Absent" in html
    assert "Advance (KES)" in html


def test_salary_advances_js_functions(client: TestClient):
    """Verify that app.js serves all salary advance management and rendering functions."""
    res = client.get("/static/js/app.js")
    assert res.status_code == 200
    js = res.text

    assert "loadSalaryAdvances" in js
    assert "renderSalaryAdvancesTable" in js
    assert "filterSalaryAdvances" in js
    assert "toggleAdvanceRecipientType" in js
    assert "openIssueSalaryAdvanceModal" in js
    assert "closeIssueSalaryAdvanceModal" in js
    assert "handleIssueSalaryAdvanceSubmit" in js
    assert "deleteSalaryAdvance" in js
    assert "renderGuardAdvancesRows" in js
    assert "openStaffIssueAdvanceModal" in js

