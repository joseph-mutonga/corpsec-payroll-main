import os
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "http://127.0.0.1:8000"
OUTPUT_DIR = r"C:\Users\Public\app\neema\corpsec-payroll-main\docs\screenshots"
os.makedirs(OUTPUT_DIR, exist_ok=True)

chrome_options = Options()
chrome_options.binary_location = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
chrome_options.add_argument("--headless=new")
chrome_options.add_argument("--window-size=1600,1050")
chrome_options.add_argument("--disable-gpu")
chrome_options.add_argument("--no-sandbox")
chrome_options.add_argument("--disable-dev-shm-usage")

driver = webdriver.Chrome(options=chrome_options)
driver.set_window_size(1600, 1050)

def snap(filename, delay=1.0):
    time.sleep(delay)
    path = os.path.join(OUTPUT_DIR, filename)
    driver.save_screenshot(path)
    print(f"[CAPTURED] {filename} ({os.path.getsize(path):,} bytes)")

try:
    # 1. Login Screen
    print("Navigating to login page...")
    driver.get(BASE_URL)
    time.sleep(2)
    snap("01_login_portal.png", delay=1.0)

    # Perform Login as Administrator
    print("Logging in as Admin...")
    user_input = driver.find_element(By.ID, "unified-login-id")
    pass_input = driver.find_element(By.ID, "unified-login-password")
    btn = driver.find_element(By.ID, "unified-login-btn")
    
    user_input.clear()
    user_input.send_keys("admin@corpsec.co.ke")
    pass_input.clear()
    pass_input.send_keys("Admin@CorpSec2026!")
    btn.click()
    time.sleep(3)

    # 2. Operations Dashboard
    print("Capturing Dashboard...")
    driver.execute_script("if (typeof switchTab === 'function') switchTab('dashboard');")
    time.sleep(2)
    snap("02_dashboard_kpis.png", delay=1.5)

    # 3. Guard Directory
    print("Capturing Guard Directory...")
    driver.execute_script("switchTab('guards');")
    time.sleep(2)
    snap("03_guard_directory.png", delay=1.5)

    # 4. Guard Personnel File (Open first guard file or detail)
    print("Capturing Guard Personnel File...")
    try:
        # Check if viewGuardDetails exists or click first view button
        guard_btn = driver.find_elements(By.CSS_SELECTOR, "#guards-table tbody tr button")
        if guard_btn:
            guard_btn[0].click()
            time.sleep(2)
        else:
            driver.execute_script("if (typeof viewGuardDetails === 'function') viewGuardDetails(1);")
            time.sleep(2)
        snap("04_guard_personnel_file.png", delay=1.0)
        # Close guard file if open or modal
        driver.execute_script("if (typeof closeGuardDetailsModal === 'function') closeGuardDetailsModal();")
        driver.execute_script("if (typeof closeGuardView === 'function') closeGuardView();")
        driver.execute_script("var m = document.getElementById('modal-guard-file'); if (m) m.style.display='none';")
    except Exception as e:
        print("Guard file capture fallback:", e)
        snap("04_guard_personnel_file.png", delay=0.5)

    # 5. Client Sites & Rates
    print("Capturing Client Sites...")
    driver.execute_script("switchTab('sites');")
    time.sleep(2)
    snap("05_client_sites_geofence.png", delay=1.5)

    # 6. Site Geofence & Super Guard Modal
    print("Capturing Site Geofence Modal...")
    try:
        site_edit_btns = driver.find_elements(By.CSS_SELECTOR, "#sites-table tbody tr button")
        if site_edit_btns:
            site_edit_btns[0].click()
            time.sleep(2)
        else:
            driver.execute_script("if (typeof openSiteModal === 'function') openSiteModal(1);")
            time.sleep(1)
        snap("06_site_geofence_modal.png", delay=1.0)
        # Close site modal
        driver.execute_script("var m = document.getElementById('modal-amend-site') || document.getElementById('site-modal'); if (m) m.style.display='none';")
    except Exception as e:
        print("Site modal fallback:", e)

    # 7. Shift Roster & Deployments
    print("Capturing Shift Roster...")
    driver.execute_script("switchTab('shifts');")
    time.sleep(2)
    snap("08_shift_roster_calendar.png", delay=1.5)

    # 8. Attendance & Overtime Geofencing
    print("Capturing Attendance & Overtime...")
    driver.execute_script("switchTab('attendance');")
    time.sleep(2)
    snap("09_attendance_geofence.png", delay=1.5)

    # 9. Mid-Month Salary Advances
    print("Capturing Salary Advances...")
    driver.execute_script("switchTab('salary-advances');")
    time.sleep(2)
    snap("10_salary_advances.png", delay=1.5)

    # 10. Guided Payroll Engine
    print("Capturing Payroll Engine...")
    driver.execute_script("switchTab('payroll');")
    time.sleep(2)
    snap("11_payroll_engine.png", delay=1.5)

    # 11. Payment Schedules (Bank EFT & M-Pesa Bulk)
    print("Capturing Payment Schedules...")
    driver.execute_script("switchTab('payments');")
    time.sleep(2)
    snap("12_payment_schedules.png", delay=1.5)

    # 12. Firm Expenses & Petty Cash
    print("Capturing Expenses & Petty Cash...")
    driver.execute_script("switchTab('expenses');")
    time.sleep(2)
    snap("13_expenses_petty_cash.png", delay=1.5)

    # 13. Site Invoices & Accounts Receivable
    print("Capturing Site Invoices...")
    driver.execute_script("switchTab('invoices');")
    time.sleep(2)
    snap("14_site_invoices.png", delay=1.5)

    # 14. Official CorpSec Letterhead Invoice Modal
    print("Capturing CorpSec Letterhead Invoice...")
    try:
        inv_view_btns = driver.find_elements(By.CSS_SELECTOR, "#invoices-table tbody tr button")
        if inv_view_btns:
            inv_view_btns[0].click()
            time.sleep(2)
        else:
            driver.execute_script("if (typeof openViewInvoiceModal === 'function') openViewInvoiceModal(1);")
            time.sleep(1)
        snap("15_corpsec_letterhead_invoice.png", delay=1.5)
        # Close invoice modal
        driver.execute_script("var m = document.getElementById('modal-view-invoice'); if (m) m.style.display='none';")
    except Exception as e:
        print("Invoice modal fallback:", e)

    # 15. Clients & Contracts CRM
    print("Capturing Clients CRM...")
    driver.execute_script("switchTab('clients');")
    time.sleep(2)
    snap("16_client_crm.png", delay=1.5)

    # 16. Security Assets & Uniform Inventory
    print("Capturing Assets Inventory...")
    driver.execute_script("switchTab('assets');")
    time.sleep(2)
    snap("17_asset_inventory.png", delay=1.5)

    # 17. Incident Reports & Occurrence Book
    print("Capturing Incident Reports...")
    driver.execute_script("switchTab('incidents');")
    time.sleep(2)
    snap("18_incident_reports.png", delay=1.5)

    # 18. Leave Requests
    print("Capturing Leave Requests...")
    driver.execute_script("switchTab('leave');")
    time.sleep(2)
    snap("19_leave_management.png", delay=1.5)

    # 19. Company Profile & PSRA History
    print("Capturing Company Profile...")
    driver.execute_script("switchTab('company-history');")
    time.sleep(2)
    snap("20_company_profile.png", delay=1.5)

    # 20. Analytics & Executive Reporting
    print("Capturing Analytics Reports...")
    driver.execute_script("switchTab('reports');")
    time.sleep(2)
    snap("21_analytics_reports.png", delay=1.5)

    # 21. Audit Trail
    print("Capturing Audit Trail...")
    driver.execute_script("switchTab('audit');")
    time.sleep(2)
    snap("22_audit_trail.png", delay=1.5)

    # 22. Kenyan Statutory Tax Configuration
    print("Capturing Statutory Rates...")
    driver.execute_script("switchTab('statutory');")
    time.sleep(2)
    snap("23_statutory_rates.png", delay=1.5)

    # 23. Mobile Super Guard Portal
    print("Capturing Mobile Super Guard Portal...")
    driver.get(f"{BASE_URL}/portal.html")
    driver.set_window_size(480, 880)
    time.sleep(2)
    snap("07_super_guard_mobile_portal.png", delay=1.5)

    print("All screenshots successfully captured!")

finally:
    driver.quit()

