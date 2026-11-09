import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml import parse_xml

# ==============================================================================
# CORPSEC COLOR PALETTE & CONSTANTS
# ==============================================================================
COLOR_PRIMARY_NAVY = RGBColor(15, 44, 89)      # #0F2C59 - Deep CorpSec Navy
COLOR_SECONDARY_BLUE = RGBColor(30, 58, 138)   # #1E3A8A - Royal Blue
COLOR_ACCENT_GOLD = RGBColor(230, 126, 34)     # #E67E22 - Safety Orange / Gold
COLOR_ACCENT_AMBER = RGBColor(217, 119, 6)     # #D97706 - Amber
COLOR_EMERALD_GREEN = RGBColor(5, 150, 105)    # #059669 - Compliance Green
COLOR_DARK_TEXT = RGBColor(15, 23, 42)         # #0F172A - Charcoal Slate
COLOR_MUTED_TEXT = RGBColor(100, 116, 139)     # #64748B - Muted Slate
COLOR_LIGHT_BG = RGBColor(248, 250, 252)       # #F8FAFC - Off White
COLOR_CARD_BORDER = RGBColor(226, 232, 240)    # #E2E8F0 - Light Border
COLOR_WHITE = RGBColor(255, 255, 255)

SCREENSHOTS_DIR = r"C:\Users\Public\app\neema\corpsec-payroll-main\docs\screenshots"
OUTPUT_PPTX_PATH = r"C:\Users\Public\app\neema\corpsec-payroll-main\docs\CorpSec_System_User_Guide.pptx"
COPY_PPTX_PATH = r"C:\Users\Public\app\neema\crystal-project-main\CorpSec_System_User_Guide.pptx"

# Initialize Presentation in 16:9 Widescreen
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank_layout = prs.slide_layouts[6]

def apply_transition(slide, t_type="fade"):
    """Injects OpenXML transition animation into slide."""
    xml_map = {
        "fade": '<p:transition xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" spd="med"><p:fade/></p:transition>',
        "push_right": '<p:transition xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" spd="med"><p:push dir="r"/></p:transition>',
        "push_left": '<p:transition xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" spd="med"><p:push dir="l"/></p:transition>',
        "wipe": '<p:transition xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" spd="med"><p:wipe dir="r"/></p:transition>'
    }
    xml_str = xml_map.get(t_type, xml_map["fade"])
    try:
        slide._element.append(parse_xml(xml_str))
    except Exception as e:
        print(f"Warning transition: {e}")

def add_header(slide, module_code, title_text, subtitle_text):
    """Adds a standard executive header to a slide."""
    # Top decorative brand stripe
    stripe = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.12))
    stripe.fill.solid()
    stripe.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    stripe.line.color.rgb = COLOR_PRIMARY_NAVY

    gold_stripe = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0.12), Inches(3.5), Inches(0.04))
    gold_stripe.fill.solid()
    gold_stripe.fill.fore_color.rgb = COLOR_ACCENT_GOLD
    gold_stripe.line.color.rgb = COLOR_ACCENT_GOLD

    # Module Badge Pill
    badge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.35), Inches(2.2), Inches(0.32))
    badge.fill.solid()
    badge.fill.fore_color.rgb = RGBColor(238, 242, 246)
    badge.line.color.rgb = RGBColor(203, 213, 225)
    tf_badge = badge.text_frame
    tf_badge.word_wrap = False
    p_b = tf_badge.paragraphs[0]
    p_b.text = module_code.upper()
    p_b.font.size = Pt(9.5)
    p_b.font.bold = True
    p_b.font.color.rgb = COLOR_PRIMARY_NAVY
    p_b.alignment = PP_ALIGN.CENTER

    # Title & Subtitle Box
    tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.72), Inches(11.8), Inches(0.95))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    
    p_t = tf.paragraphs[0]
    p_t.text = title_text
    p_t.font.size = Pt(22)
    p_t.font.bold = True
    p_t.font.color.rgb = COLOR_PRIMARY_NAVY
    p_t.space_after = Pt(2)

    p_s = tf.add_paragraph()
    p_s.text = subtitle_text
    p_s.font.size = Pt(11)
    p_s.font.color.rgb = COLOR_MUTED_TEXT

def create_card(slide, left, top, width, height, bg_color=COLOR_WHITE, border_color=COLOR_CARD_BORDER):
    """Draws a rounded card box as container."""
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = bg_color
    card.line.color.rgb = border_color
    card.line.width = Pt(1)
    return card

def add_instruction_card(slide, left, top, width, height, role_text, steps, pro_tip):
    """Draws left-hand instructional panel with steps and pro-tip."""
    card = create_card(slide, left, top, width, height, COLOR_WHITE, COLOR_CARD_BORDER)
    
    tb = slide.shapes.add_textbox(left + Inches(0.2), top + Inches(0.18), width - Inches(0.4), height - Inches(0.36))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

    # Role Indicator
    p_role = tf.paragraphs[0]
    p_role.text = f"👤 AUTHORIZED ROLE: {role_text.upper()}"
    p_role.font.size = Pt(9.5)
    p_role.font.bold = True
    p_role.font.color.rgb = COLOR_ACCENT_GOLD
    p_role.space_after = Pt(10)

    # Step by Step Instructions
    for i, (title, desc) in enumerate(steps, 1):
        p_step = tf.add_paragraph()
        run_num = p_step.add_run()
        run_num.text = f"Step {i} — {title}: "
        run_num.font.bold = True
        run_num.font.size = Pt(10.5)
        run_num.font.color.rgb = COLOR_PRIMARY_NAVY

        run_desc = p_step.add_run()
        run_desc.text = desc
        run_desc.font.size = Pt(10)
        run_desc.font.color.rgb = COLOR_DARK_TEXT
        p_step.space_after = Pt(7)

    # Pro-Tip Alert Box
    if pro_tip:
        tip_box = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            left + Inches(0.15),
            top + height - Inches(1.15),
            width - Inches(0.3),
            Inches(0.95)
        )
        tip_box.fill.solid()
        tip_box.fill.fore_color.rgb = RGBColor(254, 243, 199) # Light amber
        tip_box.line.color.rgb = RGBColor(245, 158, 11)
        tip_box.line.width = Pt(1)
        
        tf_tip = tip_box.text_frame
        tf_tip.word_wrap = True
        tf_tip.margin_left = tf_tip.margin_right = Inches(0.15)
        tf_tip.margin_top = Inches(0.1)
        
        p_tip = tf_tip.paragraphs[0]
        run_tip_h = p_tip.add_run()
        run_tip_h.text = "💡 Operational Tip / Compliance Rule: "
        run_tip_h.font.bold = True
        run_tip_h.font.size = Pt(9.5)
        run_tip_h.font.color.rgb = RGBColor(180, 83, 9)
        
        run_tip_b = p_tip.add_run()
        run_tip_b.text = pro_tip
        run_tip_b.font.size = Pt(9)
        run_tip_b.font.color.rgb = RGBColor(120, 53, 15)

def add_screenshot_panel(slide, left, top, width, height, img_filename, caption_text):
    """Draws right-hand screenshot with frame and caption."""
    img_path = os.path.join(SCREENSHOTS_DIR, img_filename)
    if not os.path.exists(img_path):
        print(f"Warning: image {img_filename} not found!")
        return

    # Frame Card
    card = create_card(slide, left, top, width, height, COLOR_WHITE, COLOR_CARD_BORDER)

    # Image placement inside card
    img_padding = Inches(0.15)
    img_w = width - (img_padding * 2)
    img_h = height - Inches(0.85) # Leave space for caption bar
    
    slide.shapes.add_picture(
        img_path,
        left + img_padding,
        top + img_padding,
        width=img_w,
        height=img_h
    )

    # Caption Bar
    caption_box = slide.shapes.add_textbox(
        left + img_padding,
        top + height - Inches(0.65),
        img_w,
        Inches(0.55)
    )
    tf_c = caption_box.text_frame
    tf_c.word_wrap = True
    tf_c.margin_left = tf_c.margin_top = tf_c.margin_right = tf_c.margin_bottom = 0
    p_c = tf_c.paragraphs[0]
    
    run_icon = p_c.add_run()
    run_icon.text = "📸 Live System Screenshot: "
    run_icon.font.bold = True
    run_icon.font.size = Pt(9.5)
    run_icon.font.color.rgb = COLOR_PRIMARY_NAVY
    
    run_text = p_c.add_run()
    run_text.text = caption_text
    run_text.font.size = Pt(9)
    run_text.font.color.rgb = COLOR_MUTED_TEXT

print("Building presentation slides...")

# ==============================================================================
# SLIDE 1: TITLE COVER SLIDE
# ==============================================================================
slide1 = prs.slides.add_slide(blank_layout)
apply_transition(slide1, "fade")

# Background Cover Fill
bg_cover = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
bg_cover.fill.solid()
bg_cover.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
bg_cover.line.color.rgb = COLOR_PRIMARY_NAVY

# Gold accent geometry bar
gold_bar = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(7.2), Inches(13.333), Inches(0.3))
gold_bar.fill.solid()
gold_bar.fill.fore_color.rgb = COLOR_ACCENT_GOLD
gold_bar.line.color.rgb = COLOR_ACCENT_GOLD

# Cover Title Box
tb_cov = slide1.shapes.add_textbox(Inches(1.2), Inches(1.5), Inches(11.0), Inches(4.5))
tf_cov = tb_cov.text_frame
tf_cov.word_wrap = True

p_pre = tf_cov.paragraphs[0]
p_pre.text = "CORPSEC INVESTIGATIONS LIMITED  |  GUARDING SERVICES DIVISION"
p_pre.font.size = Pt(13)
p_pre.font.bold = True
p_pre.font.color.rgb = COLOR_ACCENT_GOLD
p_pre.space_after = Pt(16)

p_main = tf_cov.add_paragraph()
p_main.text = "Enterprise Payroll & Guard\nWorkforce Management System"
p_main.font.size = Pt(36)
p_main.font.bold = True
p_main.font.color.rgb = COLOR_WHITE
p_main.space_after = Pt(14)

p_sub = tf_cov.add_paragraph()
p_sub.text = "Comprehensive End-to-End Operational Manual & Step-by-Step System Guide for Company Users"
p_sub.font.size = Pt(15)
p_sub.font.color.rgb = RGBColor(203, 213, 225)
p_sub.space_after = Pt(28)

p_meta = tf_cov.add_paragraph()
p_meta.text = "• Version 2026.1 Enterprise Edition   • 100% Kenyan Statutory & PSRA Compliant   • Real-Time Geofence Operations"
p_meta.font.size = Pt(11)
p_meta.font.bold = True
p_meta.font.color.rgb = RGBColor(148, 163, 184)
p_meta.space_after = Pt(14)

p_auth = tf_cov.add_paragraph()
p_auth.text = "Approved by: Moses Alango, Director  |  Headquarters: Upper Hill, Nairobi, Kenya  |  Trust But Verify"
p_auth.font.size = Pt(11)
p_auth.font.color.rgb = COLOR_ACCENT_AMBER

# ==============================================================================
# SLIDE 2: SYSTEM ARCHITECTURE & ROLE MATRIX
# ==============================================================================
slide2 = prs.slides.add_slide(blank_layout)
apply_transition(slide2, "push_right")
add_header(slide2, "SYSTEM ARCHITECTURE", "Platform Ecosystem & User Access Roles", 
           "High-level structural breakdown of the CorpSec platform, user responsibilities, and data synchronization.")

roles_data = [
    ("Managing Director & System Admin", 
     "Full administrative authority over payroll approvals, official letterhead invoices, bank EFT disbursement schedules, system settings, and immutable audit trails.",
     "admin@corpsec.co.ke", RGBColor(15, 44, 89)),
    ("HR & Payroll Specialist", 
     "Manages active & historical guard personnel files, PSRA compliance certifications, mid-month salary advance disbursements, and guided Kenyan statutory payroll runs.",
     "Payroll & HR Hub", RGBColor(30, 58, 138)),
    ("Operations Manager & Supervisors", 
     "Supervises client sites, configures 200m GPS geofencing radius, schedules day/night shift rosters, manages asset & uniform custody, and reviews incident occurrence books.",
     "Operations Hub", RGBColor(180, 83, 9)),
    ("Super Guards & Site Commanders", 
     "Armed with mobile shift portal to clock in/out their shift and mandated to clock in/out field guards who do not own smartphones directly at client premises within 200m.",
     "Mobile PWA Portal", RGBColor(5, 150, 105))
]

for idx, (r_title, r_desc, r_badge, r_color) in enumerate(roles_data):
    col_w = Inches(2.78)
    col_gap = Inches(0.24)
    c_left = Inches(0.8) + idx * (col_w + col_gap)
    c_top = Inches(1.8)
    c_h = Inches(5.0)
    
    card = create_card(slide2, c_left, c_top, col_w, c_h, COLOR_WHITE, COLOR_CARD_BORDER)
    
    # Top banner in card
    top_bar = slide2.shapes.add_shape(MSO_SHAPE.RECTANGLE, c_left, c_top, col_w, Inches(0.1))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = r_color
    top_bar.line.color.rgb = r_color
    
    tb = slide2.shapes.add_textbox(c_left + Inches(0.18), c_top + Inches(0.25), col_w - Inches(0.36), c_h - Inches(0.4))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    
    p1 = tf.paragraphs[0]
    p1.text = f"ROLE {idx+1}"
    p1.font.size = Pt(10)
    p1.font.bold = True
    p1.font.color.rgb = r_color
    p1.space_after = Pt(4)
    
    p2 = tf.add_paragraph()
    p2.text = r_title
    p2.font.size = Pt(13)
    p2.font.bold = True
    p2.font.color.rgb = COLOR_DARK_TEXT
    p2.space_after = Pt(10)
    
    p3 = tf.add_paragraph()
    p3.text = r_desc
    p3.font.size = Pt(10)
    p3.font.color.rgb = COLOR_MUTED_TEXT
    p3.space_after = Pt(14)
    
    p4 = tf.add_paragraph()
    p4.text = f"Primary Access: {r_badge}"
    p4.font.size = Pt(9.5)
    p4.font.bold = True
    p4.font.color.rgb = COLOR_PRIMARY_NAVY

# ==============================================================================
# MODULE SLIDES CONFIGURATION (ALL 23 MODULES)
# ==============================================================================
modules = [
    {
        "code": "MODULE 01 | AUTHENTICATION",
        "title": "Unified Login Portal & Role-Based Quick Dispatch",
        "subtitle": "Secure multi-factor entrance with role detection and 1-click credential switching for administrators and guards.",
        "role": "All Company Personnel (Administrators, HR, Field Supervisors, Guards)",
        "steps": [
            ("Launch System & Enter Credentials", "Navigate to the CorpSec URL. Enter your corporate email (or employee badge ID) and password."),
            ("Role-Based Auto Dispatch", "The security engine verifies bcrypt password hash and automatically routes Admins to the Management Hub, and Guards to the Mobile Portal."),
            ("1-Click Quick Fill Demo", "For testing or shift handovers, use the pre-configured quick buttons: 'Admin / HR', 'Super Guard', or 'Guard'."),
            ("Session Persistence", "Authorized JWT token is safely cached in session storage, preserving state across browser restarts.")
        ],
        "tip": "Passwords must be at least 8 characters. Any failed login attempt is recorded in the immutable audit trail with originating IP.",
        "img": "01_login_portal.png",
        "caption": "Unified login portal displaying bcrypt encrypted authentication, automatic role dispatch, and 1-click quick-fill buttons."
    },
    {
        "code": "MODULE 02 | OPERATIONS HUB",
        "title": "Executive Operations Command Center & Live KPIs",
        "subtitle": "Real-time visibility into workforce metrics, active guarding shifts, imprest float, and monthly financial summaries.",
        "role": "Managing Director, Operations Director & HR Management",
        "steps": [
            ("Review 8 Real-Time KPI Cards", "Inspect total active guards, current site deployments, active day/night shifts, and live attendance metrics at a single glance."),
            ("Monitor Petty Cash Imprest Health", "Track YTD operational outflows and verify the current petty cash float against the KES 25,000 regulatory cap."),
            ("Track Active Billing & Invoices", "View issued commercial invoices, collected receivables, and pending client settlements."),
            ("Execute 1-Click Operations", "Use top-right quick action buttons to instantly run monthly payroll or access the mobile app download portal.")
        ],
        "tip": "KPI cards update dynamically upon database changes without requiring manual full-page browser reloads.",
        "img": "02_dashboard_kpis.png",
        "caption": "Executive Operations Dashboard featuring 8 pastel KPI cards, live shift metrics, and KES 211,850 YTD expenditure summary."
    },
    {
        "code": "MODULE 03 | PERSONNEL MGMT",
        "title": "Active Guard Directory & Personnel Roster",
        "subtitle": "Central registry of all security personnel with badges, contact numbers, PSRA credentials, and operational status.",
        "role": "HR Manager, Recruitment Officer & Chief Operations Supervisor",
        "steps": [
            ("Search & Filter Roster", "Filter guards by operational status (Active vs Inactive) or use the live search bar to find guards by name or badge ID CS-XXXXX."),
            ("Identify Relievers & Super Guards", "Look for the amber 'SUPER GUARD' badge and 'RELIEVER' indicators indicating mobile site mandate authority."),
            ("Open Personnel File", "Click 'View File' on any guard row to inspect full personal records, qualifications, and banking information."),
            ("Deactivate or Relocate Guard", "Use the 1-click 'Deactivate' action to safely transfer guards to inactive archives without deleting historical payroll records.")
        ],
        "tip": "Never delete a guard profile with past attendance or payroll records; use 'Deactivate' to preserve tax compliance history.",
        "img": "03_guard_directory.png",
        "caption": "Guard Directory showing active guard roster, employee badges, phone numbers, and direct access to personal files."
    },
    {
        "code": "MODULE 04 | GUARD DOSSIER",
        "title": "Full Guard Personnel Dossier & Super Guard Mandate",
        "subtitle": "In-depth digital personnel file containing academic qualifications, emergency contacts, bank details, and mandate status.",
        "role": "HR Director, Personnel Auditor & System Administrator",
        "steps": [
            ("Examine Statutory Credentials", "Verify Guard National ID, KRA PIN, PSRA registration certificate number, and valid date of enlistment."),
            ("Review Next of Kin & Contacts", "Inspect verified emergency contact names, primary phone numbers, and residential location for rapid field dispatch."),
            ("Inspect Banking & M-Pesa Setup", "Ensure guard bank name, account number, or Safaricom M-Pesa registered name are validated for bulk payroll disbursement."),
            ("Toggle Super Guard Status", "Grant or revoke Super Guard site command authority with a single click. When revoked, site mandates are instantly cleared.")
        ],
        "tip": "Revoking a Super Guard from their profile automatically strips their authority from any assigned client site geofence.",
        "img": "04_guard_personnel_file.png",
        "caption": "Personnel file view detailing national ID, PSRA license, emergency contacts, academic history, and Super Guard mandate controls."
    },
    {
        "code": "MODULE 05 | CLIENT SITES",
        "title": "Client Sites & Guard Billing Deployment Rates",
        "subtitle": "Site registry tracking commercial guarding contracts, required guard strength, day/night shifts, and daily billing rates.",
        "role": "Business Development Manager, Operations Director & Commercial Billing Officer",
        "steps": [
            ("Review Client Deployments", "View all contracted client facilities (e.g. Westlands Mall, Karen Residence, Upper Hill Commercial Hub)."),
            ("Check Deployment Strength", "Verify required day guards, night guards, and contracted daily billing rate per deployed security officer."),
            ("Confirm Assigned Super Guard", "See which Super Guard holds operational site command for clocking in non-smartphone field guards."),
            ("Access 1-Click Billing & Editing", "Click 'Site' to adjust coordinates and radius, or click 'Bill' to instantly generate a monthly tax invoice.")
        ],
        "tip": "Daily rates automatically populate invoice line items when generating commercial billings for that client site.",
        "img": "05_client_sites_geofence.png",
        "caption": "Client Sites directory displaying deployed guard counts, contracted daily rates, and assigned Super Guard commanders."
    },
    {
        "code": "MODULE 06 | GEOFENCE MGMT",
        "title": "Site GPS Geofence & Super Guard Mandate Setup",
        "subtitle": "Interactive site editor to configure precision GPS coordinates, 200m circular geofence boundary, and site supervisors.",
        "role": "Chief Operations Officer, Field Systems Engineer & Operations Manager",
        "steps": [
            ("Input GPS Coordinates", "Enter the exact decimal Latitude and Longitude of the client site (e.g., -1.2675, 36.8045 for Westlands Mall)."),
            ("Configure Geofence Radius", "Standardize geofence boundary to 200 meters to ensure guards can only clock in when physically on the client perimeter."),
            ("Assign Site Super Guard", "Select an authorized Super Guard from the dropdown to grant them proxy clock-in mandates for that location."),
            ("Save & Broadcast to Mobile", "Click 'Save Amendments'. Geofence parameters immediately sync to field guards' mobile devices via PWA.")
        ],
        "tip": "Setting radius below 50m may trigger false rejections due to civilian GPS device drift; 200m is the industry gold standard.",
        "img": "06_site_geofence_modal.png",
        "caption": "Site configuration modal showing GPS latitude/longitude inputs, 200-meter radius threshold, and Super Guard mandate binding."
    },
    {
        "code": "MODULE 07 | MOBILE SHIFT PORTAL",
        "title": "Mobile Super Guard Shift Portal & Mandate Clocking",
        "subtitle": "Mobile-first PWA interface enabling site commanders to clock their shift and record attendance for smartphone-less guards.",
        "role": "Super Guards, Field Shift Leaders & Site Security Commanders",
        "steps": [
            ("Access Mobile Portal on Phone", "Open the mobile web portal on any smartphone. The system prompts to install as a native home-screen app."),
            ("Personal GPS Clock In/Out", "Tap 'Clock In Shift'. The device fetches current GPS coordinates; if inside 200m of assigned site, check-in succeeds."),
            ("Open Super Guard Register", "Tap the blue 'Open Super Guard Register' button to access the authorized roster for non-smartphone guards."),
            ("Execute Proxy Clocking", "Select the guard on duty, select their shift (Day/Night), and tap 'Clock In on Behalf' with GPS tamper-proofing.")
        ],
        "tip": "If a guard is outside the 200m boundary, the system displays exact distance away and blocks attendance recording.",
        "img": "07_super_guard_mobile_portal.png",
        "caption": "Mobile Guard Portal showing active shift status, GPS coordinate tracking, and 1-click Super Guard mandate register access."
    },
    {
        "code": "MODULE 08 | SHIFT ROSTERING",
        "title": "Monthly Shift Roster & Tactical Deployments",
        "subtitle": "Interactive calendar deployment matrix managing day shifts, night shifts, relief coverage, and mandatory rest days.",
        "role": "Operations Roster Manager & Field Duty Dispatcher",
        "steps": [
            ("Select Deployment Month", "Choose target calendar month and year to view or populate guard deployment schedules."),
            ("Assign Guard to Site & Shift", "Select guard, designate Day Shift (06:00 - 18:00) or Night Shift (18:00 - 06:00), and assign client post."),
            ("Allocate Relievers for Rest Days", "Ensure guards receive statutory rest days without leaving client sites unmanned by slotting in floating relievers."),
            ("Publish & Sync to Roster", "Click 'Publish Shift Roster'. Shifts immediately reflect on mobile portals and attendance monitoring dashboards.")
        ],
        "tip": "CorpSec system flags fatigue warnings if a guard is scheduled for back-to-back night and day shifts without 12-hour rest.",
        "img": "08_shift_roster_calendar.png",
        "caption": "Shift roster view displaying scheduled guard deployments across client sites with day and night rotation indicators."
    },
    {
        "code": "MODULE 09 | ATTENDANCE ENGINE",
        "title": "Real-Time Attendance Engine & 200m Geofence Audit",
        "subtitle": "Live shift verification logging exact GPS coordinates, geofence status (Inside/Outside/Flagged), and overtime hours.",
        "role": "Operations Controller, HR Auditor & Shift Supervisor",
        "steps": [
            ("Review Daily Roll Call", "Inspect clock-ins across all client sites in real time, with exact clock-in timestamp and site matching."),
            ("Audit Geofence Badges", "Green 'INSIDE (200m)' indicates verified perimeter attendance; Red 'OUTSIDE GEOFENCE' flags potential proxy fraud."),
            ("Inspect Overtime Hours", "Guards serving beyond scheduled 12-hour shifts automatically accrue overtime hours logged for payroll computation."),
            ("Export Attendance Register", "Click 'Export Attendance' to download tamper-proof attendance registers for client SLA reporting.")
        ],
        "tip": "Every attendance record stores device latitude, longitude, and device user-agent for forensic proof during client billing audits.",
        "img": "09_attendance_geofence.png",
        "caption": "Attendance logs showing GPS geofence compliance within 200m, clock-in timestamps, and automated overtime tracking."
    },
    {
        "code": "MODULE 10 | SALARY ADVANCES",
        "title": "Mid-Month Salary Advance Management",
        "subtitle": "Controlled advance request workflow with eligibility checking, supervisor approvals, and automatic payroll deduction linking.",
        "role": "HR Manager, Financial Controller & Managing Director",
        "steps": [
            ("Record Advance Application", "Select guard or staff member, enter requested advance amount, and document reason (e.g. medical, school fees)."),
            ("Automated Eligibility Check", "System checks current accrued monthly earnings to ensure advance does not exceed statutory 50% cap."),
            ("Approve & Disburse via M-Pesa", "Authorized manager approves request; advance status transitions to 'DISBURSED' with reference code."),
            ("Automated Payroll Sync", "Approved advances automatically lock and feed into the upcoming month's payroll deductions column.")
        ],
        "tip": "Once disbursed, advances cannot be deleted and automatically reduce final net pay, preventing accidental double disbursement.",
        "img": "10_salary_advances.png",
        "caption": "Salary Advance portal showing advance requests, remaining balances, approval statuses, and direct links to payroll deduction."
    },
    {
        "code": "MODULE 11 | PAYROLL ENGINE",
        "title": "Guided Kenyan Statutory Payroll Engine",
        "subtitle": "Fully compliant calculation engine executing KRA PAYE bands, NSSF Tier I & II, SHIF 2.75%, and Housing Levy 1.5%.",
        "role": "Head of Payroll, Senior Accountant & Managing Director",
        "steps": [
            ("Select Billing Period", "Choose the active payroll cycle (e.g. November 2026) and click 'Calculate Monthly Payroll'."),
            ("Inspect Statutory Deductions", "Verify automated computations: NSSF (Tier I KES 420 + Tier II), SHIF (2.75% of gross), Housing Levy (1.5%), and PAYE."),
            ("Apply Personal Relief", "Kenya standard monthly personal relief of KES 2,400 is automatically credited against gross tax payable."),
            ("Review Net Pay & Commit", "Audit net salaries after factoring in mid-month salary advances and unexcused absent days before final commitment.")
        ],
        "tip": "Calculations comply strictly with Kenya Finance Act 2023/2024 regulations, preventing KRA non-compliance penalties.",
        "img": "11_payroll_engine.png",
        "caption": "Payroll engine interface detailing gross pay, NSSF Tier I/II, SHIF 2.75%, Housing Levy 1.5%, PAYE bands, and net disbursements."
    },
    {
        "code": "MODULE 12 | PAYMENT DISBURSEMENT",
        "title": "Bank EFT & Safaricom M-Pesa Bulk Payment Schedules",
        "subtitle": "Automated disbursement batch generator formatting standard bank EFT spreadsheets and Safaricom B2C bulk payment files.",
        "role": "Finance Director, Treasury Manager & Managing Director",
        "steps": [
            ("Select Committed Payroll Run", "Select the finalized payroll period to generate dual disbursement channels (Bank vs M-Pesa)."),
            ("Generate Bank EFT Schedule", "Click 'Export Bank EFT File' to produce standardized CSV containing Account Name, Bank Code, Account Number, and Net Pay."),
            ("Generate Safaricom M-Pesa B2C File", "Click 'Export M-Pesa Bulk File' to produce bulk payout sheets formatted for direct upload to Safaricom Daraja/Portal."),
            ("Mark Disbursed & Archive", "Upon bank execution, toggle batch status to 'PAID' to lock records and trigger automated digital payslips.")
        ],
        "tip": "M-Pesa numbers are pre-validated to ensure 2547XXXXXXXX Kenyan Safaricom format, preventing transaction rejections.",
        "img": "12_payment_schedules.png",
        "caption": "Payment schedules view showing bank account details, M-Pesa mobile numbers, net amounts, and 1-click batch export buttons."
    },
    {
        "code": "MODULE 13 | EXPENSES & FLOAT",
        "title": "Firm Operational Expenses & Petty Cash Float",
        "subtitle": "Comprehensive ledger tracking company expenditures, recurring obligations, and KES 25,000 petty cash imprest health.",
        "role": "Petty Cash Custodian, Finance Officer & Managing Director",
        "steps": [
            ("Log Expenditure Voucher", "Click 'Record Expense', select category (Shop Supplies, Fuel, Compliance), payee/vendor, and amount."),
            ("Enforce 30-Second Duplicate Guard", "System features built-in protection blocking duplicate submissions within 30 seconds to prevent accidental double entries."),
            ("Monitor KES 25,000 Float Cap", "The visual float tracker flags warnings if petty cash float exceeds KES 25,000 ceiling, prompting reconciliation."),
            ("Track Recurring Obligations", "Review standing monthly costs such as PSRA operator fees, radio license renewals, and office rent.")
        ],
        "tip": "Always enter vendor voucher receipt numbers for audit traceability; petty cash vouchers link directly to accounting ledgers.",
        "img": "13_expenses_petty_cash.png",
        "caption": "Expenses view displaying KES 211,850 YTD outflow, KES 27,850 float tracking, vendor vouchers, and duplicate safeguards."
    },
    {
        "code": "MODULE 14 | SITE INVOICING",
        "title": "Commercial Site Invoicing & Accounts Receivable",
        "subtitle": "Commercial billing hub generating monthly client invoices with 16% VAT, payment terms, and settlement tracking.",
        "role": "Commercial Billing Manager, Finance Accountant & Managing Director",
        "steps": [
            ("Generate Monthly Invoice", "Click 'Create Site Invoice', select client site, and choose billing period. Guard deployment counts pre-populate automatically."),
            ("Review Subtotal & 16% VAT", "The system calculates contracted guard subtotal and applies mandatory 16% Value Added Tax in accordance with KRA guidelines."),
            ("Track Payment Statuses", "Monitor live status badges: 'DRAFT', 'ISSUED', 'PARTIALLY PAID', and 'SETTLED' with due date aging alerts."),
            ("Open Official Letterhead Preview", "Click 'View Invoice' to open the scrollable official CorpSec Investigations letterhead preview modal.")
        ],
        "tip": "Invoices generate a unique sequential tax reference (e.g. CSIL/INV/2026-0001) that matches the M-Pesa Paybill account number.",
        "img": "14_site_invoices.png",
        "caption": "Commercial site invoices table displaying client names, subtotal, 16% VAT, total amounts, and payment settlement badges."
    },
    {
        "code": "MODULE 15 | OFFICIAL INVOICE",
        "title": "Official CorpSec Letterhead Invoice & PDF Export",
        "subtitle": "High-fidelity corporate billing document featuring dual curved brand ribbons, Moses Alango signature, and banking details.",
        "role": "Managing Director, Accounts Receivable & Client Relations",
        "steps": [
            ("Inspect Letterhead Ribbons", "Verify top curved brand banner, high-resolution CorpSec logo, and PSRA licensed credentials in the header."),
            ("Confirm Database-Driven Data", "Client KRA PIN, company PIN (P051234567Z), and banking instructions are pulled live from the database."),
            ("Review Scrollable Modal Layout", "Scroll smoothly through the document using the dedicated scroll body, with action buttons pinned at the bottom."),
            ("Print or Download Official PDF", "Click '🖨️ Print Invoice' for direct browser printing or '📄 Download Official PDF' to dispatch to corporate clients.")
        ],
        "tip": "The invoice features an authorized digital signature by Director Moses Alango and official KCB Bank Upper Hill bank details.",
        "img": "15_corpsec_letterhead_invoice.png",
        "caption": "Official CorpSec letterhead invoice modal with dual-tier brand ribbons, KCB bank details, Paybill 522522, and Director signature."
    },
    {
        "code": "MODULE 16 | CLIENT CRM",
        "title": "Corporate Clients & Security Contracts CRM",
        "subtitle": "Comprehensive customer relationship registry tracking corporate client accounts, primary contacts, and multi-site contracts.",
        "role": "Client Relations Manager, Business Development & Legal Counsel",
        "steps": [
            ("Register New Client Entity", "Click 'Add Client'. Enter corporate name, KRA PIN, billing address, and designated primary contact person."),
            ("Attach Security Contracts", "Define contract commencement date, annual renewal terms, notice periods, and agreed service level agreements (SLAs)."),
            ("Link Guarded Sites", "Associate multiple physical sites under a single corporate parent account for unified billing and consolidated reporting."),
            ("Review Account Health", "Track total guards deployed per client, monthly contracted revenue, and contract compliance history.")
        ],
        "tip": "A single client can have 10+ distinct guarding sites with different guard counts and shift billing rates under one unified profile.",
        "img": "16_client_crm.png",
        "caption": "Clients & Contracts CRM view displaying corporate entities, registered KRA PINs, contact persons, and multi-site bindings."
    },
    {
        "code": "MODULE 17 | ASSET INVENTORY",
        "title": "Security Assets, Tactical Gear & Uniform Custody",
        "subtitle": "Equipment tracking system monitoring batons, hand-held radios, metal detectors, torches, and uniform issuances.",
        "role": "Quartermaster, Logistics Officer & Field Equipment Supervisor",
        "steps": [
            ("Catalog Security Assets", "Register equipment serial numbers, asset categories (Uniforms, Patrol Radios, Tactical Gear), and acquisition values."),
            ("Issue Gear to Guards", "Assign assets to specific guards with digital custody logs documenting date of issuance and condition at handover."),
            ("Track Return & Maintenance", "Log equipment returns, report damaged or lost gear, and automatically link replacement costs to payroll if negligent."),
            ("Audit Inventory Stock Levels", "View real-time stock balances across headquarters stores and client site security armories.")
        ],
        "tip": "Guards must clear all issued equipment with the Quartermaster before final dues are disbursed upon contract termination.",
        "img": "17_asset_inventory.png",
        "caption": "Assets & Inventory register tracking patrol equipment, tactical gear, uniform allocations, and guard custody status."
    },
    {
        "code": "MODULE 18 | INCIDENT LOGGING",
        "title": "Digital Occurrence Book (OB) & Incident Reporting",
        "subtitle": "PSRA-compliant incident management logging security breaches, emergency responses, and investigation resolution notes.",
        "role": "Field Duty Officer, Investigations Specialist & Chief Security Officer",
        "steps": [
            ("Record Incident Occurrence", "Field guards or supervisors log incidents specifying Date/Time, Client Site, Incident Type, and OB Number."),
            ("Assign Severity & Priority", "Categorize severity (Minor Infraction, Trespass, Forced Entry, Fire Alarm, Medical Emergency)."),
            ("Document Witness Statements", "Record statements, officer actions taken, police involvement, and evidence collected at the scene."),
            ("Track Resolution & Sign-Off", "Investigations team updates status to 'INVESTIGATING' or 'RESOLVED' with director-level closing remarks.")
        ],
        "tip": "Digital OB entries cannot be altered retroactively; all edits append timestamped revision notes preserving evidentiary integrity.",
        "img": "18_incident_reports.png",
        "caption": "Incident Reports and digital Occurrence Book (OB) logging security events, site locations, priority levels, and action logs."
    },
    {
        "code": "MODULE 19 | LEAVE MANAGEMENT",
        "title": "Guard Leave Requests & Rest Day Allocation",
        "subtitle": "Leave workflow regulating annual leave quotas, sick off authorizations, compassionate days, and shift coverage.",
        "role": "HR Leave Officer & Operations Roster Coordinator",
        "steps": [
            ("Submit Leave Application", "Guard submits request via mobile portal or supervisor logs request in management hub with start/end dates."),
            ("Verify Leave Entitlement", "System verifies available annual leave balance (standard 21 statutory days per annum) and past absence records."),
            ("Assign Reliever Coverage", "Operations assigns a qualified relief guard to cover the post during the leave period to maintain contract SLA."),
            ("Approve & Update Roster", "Supervisor approves leave. The shift roster automatically reflects the leave badge and prevents double scheduling.")
        ],
        "tip": "Approved sick leave requires uploading medical certificate documentation to maintain compliance during labor audits.",
        "img": "19_leave_management.png",
        "caption": "Leave management pipeline displaying guard leave applications, leave categories, date ranges, and approval controls."
    },
    {
        "code": "MODULE 20 | COMPANY GOVERNANCE",
        "title": "Corporate Profile, History & PSRA Compliance Standing",
        "subtitle": "Institutional credentials repository displaying corporate governance, PSRA licensing records, and founding milestones.",
        "role": "Managing Director, Compliance Auditor & General Public/Clients",
        "steps": [
            ("Inspect PSRA Licensing Details", "Review official Private Security Regulatory Authority operator license number, validity, and regulatory status."),
            ("Examine Leadership Structure", "Review board governance, executive leadership under Director Moses Alango, and divisional management tiers."),
            ("Review Company Milestones", "Access historical records detailing CorpSec's expansion across Nairobi, Kiambu, and national guarding operations."),
            ("Generate Compliance Summary", "Export corporate profile dossier for inclusion in public and private commercial security tenders.")
        ],
        "tip": "Maintaining up-to-date PSRA credentials on the platform ensures automated watermarks on commercial invoices remain fully valid.",
        "img": "20_company_profile.png",
        "caption": "Company Profile and History view displaying corporate milestones, leadership credentials, and PSRA regulatory standing."
    },
    {
        "code": "MODULE 21 | EXECUTIVE ANALYTICS",
        "title": "Operations Analytics & Executive Reporting",
        "subtitle": "High-level visual reporting on workforce attendance rates, overtime expenditure distributions, and client profitability.",
        "role": "Executive Board, Financial Analyst & Chief Operations Officer",
        "steps": [
            ("Analyze Attendance Reliability", "Evaluate percentage of shifts manned on time vs tardy clock-ins across all client installations."),
            ("Audit Overtime Cost Trends", "Identify client sites generating disproportionate overtime expenses to optimize guard roster rotations."),
            ("Review Gross Profit Margins", "Compare monthly client billing revenues against deployed guard payroll costs to measure account profitability."),
            ("Export Executive Summaries", "Generate presentation-ready PDF/Excel summaries for quarterly board meetings and client business reviews.")
        ],
        "tip": "Target an attendance reliability rate above 98.5% to exceed corporate client SLA contractual benchmarks.",
        "img": "21_analytics_reports.png",
        "caption": "Analytics & Reporting center featuring visual charts, overtime trend lines, attendance breakdowns, and operational metrics."
    },
    {
        "code": "MODULE 22 | AUDIT TRAIL",
        "title": "Immutable System Audit Trail & Tamper Detection",
        "subtitle": "Cryptographically sequenced log recording every administrative modification, payroll edit, and authorization event.",
        "role": "System Administrator, Internal Auditor & Legal Compliance",
        "steps": [
            ("Track Every User Action", "Every click resulting in data creation, amendment, or deletion is recorded with millisecond precision."),
            ("Inspect Originating IP & Timestamp", "Review user email, action category, originating IP address, and browser agent string for forensic audit."),
            ("Filter by Audit Category", "Filter logs by 'PAYROLL', 'INVOICE', 'GEOFENCE', 'SUPER_GUARD', or 'SECURITY' for focused investigations."),
            ("Immutable Architecture", "Logs cannot be deleted or modified even by System Administrators, satisfying international ISO security audits.")
        ],
        "tip": "Audit logs serve as admissible legal evidence in labor dispute tribunals and client contractual arbitration proceedings.",
        "img": "22_audit_trail.png",
        "caption": "Audit Trail table displaying immutable event logs, timestamps, user email accounts, IP addresses, and detailed actions taken."
    },
    {
        "code": "MODULE 23 | STATUTORY CONFIG",
        "title": "Kenyan Statutory Tax Configuration Engine",
        "subtitle": "Centralized parameter engine managing KRA PAYE brackets, NSSF contribution limits, SHIF rates, and Housing Levy rules.",
        "role": "Chief Financial Officer, Lead Tax Consultant & System Administrator",
        "steps": [
            ("Review PAYE Tax Brackets", "Inspect current KRA graduated tax brackets: 10% (first KES 24,000), 25% (next KES 8,333), 30%, 32.5%, and 35%."),
            ("Verify NSSF Tier I & Tier II Limits", "Confirm Lower Earnings Limit (LEL KES 7,000) and Upper Earnings Limit (UEL KES 36,000) contribution formulas."),
            ("Confirm SHIF 2.75% & Housing Levy 1.5%", "Verify Social Health Insurance Fund (SHIF 2.75%) and Affordable Housing Levy (1.5% employee + 1.5% employer)."),
            ("Update Rates for New Finance Acts", "When Kenyan Parliament enacts new Finance legislation, update tax thresholds here without modifying source code.")
        ],
        "tip": "Changes to statutory rates apply dynamically to all subsequent payroll calculations while preserving historical payroll runs unchanged.",
        "img": "23_statutory_rates.png",
        "caption": "Statutory rates configuration showing KRA PAYE tax bands, NSSF Tier I/II ceilings, SHIF 2.75%, and Housing Levy percentages."
    }
]

# Generate each module slide
for mod in modules:
    s = prs.slides.add_slide(blank_layout)
    apply_transition(s, "wipe")
    add_header(s, mod["code"], mod["title"], mod["subtitle"])
    
    # Left Instruction Card
    add_instruction_card(
        s,
        left=Inches(0.8),
        top=Inches(1.8),
        width=Inches(5.3),
        height=Inches(5.2),
        role_text=mod["role"],
        steps=mod["steps"],
        pro_tip=mod["tip"]
    )
    
    # Right Screenshot Card
    add_screenshot_panel(
        s,
        left=Inches(6.35),
        top=Inches(1.8),
        width=Inches(6.25),
        height=Inches(5.2),
        img_filename=mod["img"],
        caption_text=mod["caption"]
    )

# ==============================================================================
# SLIDE 26: MONTHLY OPERATIONS LIFECYCLE WORKFLOW
# ==============================================================================
slide26 = prs.slides.add_slide(blank_layout)
apply_transition(slide26, "push_left")
add_header(slide26, "OPERATIONAL LIFECYCLE", "End-to-End Monthly Operations & Payroll Workflow",
           "Chronological workflow connecting daily guard attendance, mid-month advances, payroll computation, and client invoicing.")

lifecycle_phases = [
    ("PHASE 1 (Day 1)", "Deployment & Geofencing", 
     "• Finalize client site contracts\n• Configure 200m GPS geofence\n• Assign authorized Super Guards\n• Publish monthly shift roster",
     RGBColor(15, 44, 89)),
    ("PHASE 2 (Days 1–30)", "Attendance & Guarding", 
     "• Daily 200m GPS clock-in\n• Super Guard mandate clocking\n• Live overtime hours tracking\n• Digital OB incident logging",
     RGBColor(30, 58, 138)),
    ("PHASE 3 (Day 15)", "Salary Advances Window", 
     "• Receive guard advance requests\n• Verify 50% accrued pay cap\n• Disburse via Safaricom M-Pesa\n• Lock deductions to payroll",
     RGBColor(180, 83, 9)),
    ("PHASE 4 (Days 25–28)", "Statutory Payroll Execution", 
     "• Calculate NSSF, SHIF, Housing Levy\n• Apply KRA PAYE & KES 2,400 relief\n• Generate Bank EFT CSV\n• Generate M-Pesa B2C file",
     RGBColor(5, 150, 105)),
    ("PHASE 5 (Day 30)", "Client Invoicing & Close", 
     "• Generate commercial invoices\n• Apply 16% VAT & payment terms\n• Issue Moses Alango letterhead\n• Review immutable audit trail",
     RGBColor(15, 23, 42))
]

for idx, (p_num, p_title, p_items, p_col) in enumerate(lifecycle_phases):
    col_w = Inches(2.2)
    col_gap = Inches(0.18)
    c_left = Inches(0.8) + idx * (col_w + col_gap)
    c_top = Inches(1.8)
    c_h = Inches(5.0)
    
    card = create_card(slide26, c_left, c_top, col_w, c_h, COLOR_WHITE, COLOR_CARD_BORDER)
    
    # Top banner
    b_top = slide26.shapes.add_shape(MSO_SHAPE.RECTANGLE, c_left, c_top, col_w, Inches(0.12))
    b_top.fill.solid()
    b_top.fill.fore_color.rgb = p_col
    b_top.line.color.rgb = p_col
    
    tb = slide26.shapes.add_textbox(c_left + Inches(0.12), c_top + Inches(0.25), col_w - Inches(0.24), c_h - Inches(0.4))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    
    p1 = tf.paragraphs[0]
    p1.text = p_num
    p1.font.size = Pt(9.5)
    p1.font.bold = True
    p1.font.color.rgb = p_col
    p1.space_after = Pt(4)
    
    p2 = tf.add_paragraph()
    p2.text = p_title
    p2.font.size = Pt(12)
    p2.font.bold = True
    p2.font.color.rgb = COLOR_DARK_TEXT
    p2.space_after = Pt(14)
    
    p3 = tf.add_paragraph()
    p3.text = p_items
    p3.font.size = Pt(10)
    p3.font.color.rgb = COLOR_DARK_TEXT

# ==============================================================================
# SLIDE 27: COMPLIANCE, SECURITY & DATA INTEGRITY
# ==============================================================================
slide27 = prs.slides.add_slide(blank_layout)
apply_transition(slide27, "wipe")
add_header(slide27, "REGULATORY COMPLIANCE", "Statutory Compliance, Security & Data Integrity Framework",
           "How the CorpSec system guarantees 100% legal compliance, fraud elimination, and operational security.")

pillars = [
    ("PSRA Regulatory Alignment", 
     "Strict adherence to Private Security Regulatory Authority mandates: standardized guard ID numbers, mandatory minimum wage compliance, background vetting records, and transparent occurrence book logging.",
     "🛡️ PSRA Kenya Certified", RGBColor(15, 44, 89)),
    ("Kenyan Tax & Labor Laws", 
     "Automated compliance with KRA Finance Act 2024: NSSF Tier I & Tier II, SHIF 2.75%, Affordable Housing Levy 1.5%, PAYE brackets, and monthly KES 2,400 personal tax relief with zero manual spreadsheet errors.",
     "⚖️ 100% KRA & Labor Compliant", RGBColor(5, 150, 105)),
    ("200m GPS Geofence Anti-Spoofing", 
     "Eliminates phantom guard deployments through dual-tier satellite coordinate verification. Attendance is strictly restricted to a 200m perimeter around client installations with spoofing detection.",
     "📍 Precision GPS Perimeter", RGBColor(180, 83, 9)),
    ("Immutable Audit Trail & Cryptography", 
     "Bcrypt password encryption, JWT bearer session verification, and tamper-proof immutable audit logging. Every financial adjustment and status change is forever archived with user ID and IP address.",
     "🔒 Bank-Grade Security", RGBColor(30, 58, 138))
]

for idx, (p_title, p_desc, p_badge, p_col) in enumerate(pillars):
    col_w = Inches(2.78)
    col_gap = Inches(0.24)
    c_left = Inches(0.8) + idx * (col_w + col_gap)
    c_top = Inches(1.8)
    c_h = Inches(5.0)
    
    card = create_card(slide27, c_left, c_top, col_w, c_h, COLOR_WHITE, COLOR_CARD_BORDER)
    
    b_top = slide27.shapes.add_shape(MSO_SHAPE.RECTANGLE, c_left, c_top, col_w, Inches(0.1))
    b_top.fill.solid()
    b_top.fill.fore_color.rgb = p_col
    b_top.line.color.rgb = p_col
    
    tb = slide27.shapes.add_textbox(c_left + Inches(0.18), c_top + Inches(0.25), col_w - Inches(0.36), c_h - Inches(0.4))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    
    p1 = tf.paragraphs[0]
    p1.text = p_badge
    p1.font.size = Pt(10)
    p1.font.bold = True
    p1.font.color.rgb = p_col
    p1.space_after = Pt(6)
    
    p2 = tf.add_paragraph()
    p2.text = p_title
    p2.font.size = Pt(13)
    p2.font.bold = True
    p2.font.color.rgb = COLOR_DARK_TEXT
    p2.space_after = Pt(12)
    
    p3 = tf.add_paragraph()
    p3.text = p_desc
    p3.font.size = Pt(10.5)
    p3.font.color.rgb = COLOR_MUTED_TEXT

# ==============================================================================
# SLIDE 28: SALES CLOSING & STRATEGIC VALUE SLIDE
# ==============================================================================
slide28 = prs.slides.add_slide(blank_layout)
apply_transition(slide28, "fade")

# Background Cover Fill
bg_close = slide28.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
bg_close.fill.solid()
bg_close.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
bg_close.line.color.rgb = COLOR_PRIMARY_NAVY

# Gold accent bar
gold_close = slide28.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(7.2), Inches(13.333), Inches(0.3))
gold_close.fill.solid()
gold_close.fill.fore_color.rgb = COLOR_ACCENT_GOLD
gold_close.line.color.rgb = COLOR_ACCENT_GOLD

# Inner Card Box for the Sales Closing Question
inner_card = create_card(slide28, Inches(1.2), Inches(1.0), Inches(10.933), Inches(5.8), RGBColor(15, 23, 42), COLOR_ACCENT_GOLD)
inner_card.line.width = Pt(2)

tb_c = slide28.shapes.add_textbox(Inches(1.6), Inches(1.3), Inches(10.133), Inches(5.2))
tf_c = tb_c.text_frame
tf_c.word_wrap = True

p_c1 = tf_c.paragraphs[0]
p_c1.text = "THE STRATEGIC CONVERSATION  |  EXECUTIVE VALUE PROPOSITION"
p_c1.font.size = Pt(12)
p_c1.font.bold = True
p_c1.font.color.rgb = COLOR_ACCENT_GOLD
p_c1.space_after = Pt(16)

p_c2 = tf_c.add_paragraph()
p_c2.text = "The Ultimate Sales & Operations Closing Question:"
p_c2.font.size = Pt(20)
p_c2.font.bold = True
p_c2.font.color.rgb = COLOR_WHITE
p_c2.space_after = Pt(14)

p_q = tf_c.add_paragraph()
p_q.text = (
    "\"In a security market where corporate clients demand bulletproof accountability and zero regulatory liability, "
    "what is it worth to your clients to know—with 100% mathematical certainty—that every single guard on their perimeter "
    "is GPS-verified within 200 meters, fully compensated without dispute, and backed by instantaneous, immutable audit records?\"\n\n"
    "\"When you present a commercial security proposal, are you offering mere promises—or are you delivering an airtight, "
    "PSRA-compliant digital fortress that makes choosing CorpSec Investigations the only defensible decision for their board?\""
)
p_q.font.size = Pt(13)
p_q.font.italic = True
p_q.font.color.rgb = RGBColor(241, 245, 249)
p_q.space_after = Pt(20)

p_cta = tf_c.add_paragraph()
p_cta.text = "✨ CorpSec Investigations Limited — Precision Technology. Proven Integrity. Trust But Verify."
p_cta.font.size = Pt(12.5)
p_cta.font.bold = True
p_cta.font.color.rgb = COLOR_ACCENT_GOLD
p_cta.space_after = Pt(12)

p_sign = tf_c.add_paragraph()
p_sign.text = (
    "Moses Alango, Director  |  Upper Hill, Nairobi, Kenya\n"
    "Phone: 0726 058 358 / 0739 058 358  |  Email: info@corpsecinvestigations.com  |  Web: www.corpsecinvestigations.com"
)
p_sign.font.size = Pt(10.5)
p_sign.font.color.rgb = RGBColor(148, 163, 184)

# ==============================================================================
# SAVE PRESENTATION
# ==============================================================================
os.makedirs(os.path.dirname(OUTPUT_PPTX_PATH), exist_ok=True)
prs.save(OUTPUT_PPTX_PATH)
print(f"[SUCCESS] Presentation saved to: {OUTPUT_PPTX_PATH} ({os.path.getsize(OUTPUT_PPTX_PATH):,} bytes)")

# Also copy to crystal-project-main so it is accessible from both project directories
try:
    prs.save(COPY_PPTX_PATH)
    print(f"[SUCCESS] Copy also saved to: {COPY_PPTX_PATH} ({os.path.getsize(COPY_PPTX_PATH):,} bytes)")
except Exception as e:
    print(f"Notice on copy: {e}")

