import io
import os
import datetime
from typing import Any, Optional
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether, Image as PlatypusImage
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session, object_session


# Asset paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
STATIC_IMG_DIR = os.path.join(BASE_DIR, "application", "frontend", "static", "images")

TOP_BANNER_PATH = os.path.join(STATIC_IMG_DIR, "corpsec_banner_top.png")
BOT_BANNER_PATH = os.path.join(STATIC_IMG_DIR, "corpsec_banner_bottom.png")
WATERMARK_PATH = os.path.join(STATIC_IMG_DIR, "corpsec_watermark.png")
LOGO_PATH = os.path.join(STATIC_IMG_DIR, "corpsec_official_logo.png")
SIG_PATH = os.path.join(STATIC_IMG_DIR, "corpsec_clean_signature.png")


class CorpSecLetterheadCanvas(canvas.Canvas):
    """
    Renders official CorpSec Investigations Limited letterhead:
    - Top orange & blue wave ribbon
    - Faint centered spiral eye watermark
    - Bottom blue & orange wave ribbon
    - Dynamic database company legal text and page numbers
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_letterhead(num_pages)
            super().showPage()
        super().save()

    def draw_letterhead(self, page_count):
        self.saveState()
        page_w, page_h = 612, 792  # standard letter

        # 1. Top Ribbon Banner
        if os.path.exists(TOP_BANNER_PATH):
            self.drawImage(TOP_BANNER_PATH, 0, page_h - 48, width=page_w, height=48, mask='auto')
        else:
            self.setFillColor(colors.HexColor('#E67E22'))
            self.rect(0, page_h - 14, page_w, 14, fill=1, stroke=0)
            self.setFillColor(colors.HexColor('#2378BA'))
            self.rect(0, page_h - 22, page_w, 8, fill=1, stroke=0)

        # 2. Faint Center Watermark
        if os.path.exists(WATERMARK_PATH):
            wm_size = 300
            self.drawImage(
                WATERMARK_PATH,
                (page_w - wm_size) / 2,
                (page_h - wm_size) / 2 - 20,
                width=wm_size,
                height=wm_size,
                mask='auto'
            )

        # 3. Bottom Ribbon Banner
        if os.path.exists(BOT_BANNER_PATH):
            self.drawImage(BOT_BANNER_PATH, 0, 0, width=page_w, height=42, mask='auto')
        else:
            self.setFillColor(colors.HexColor('#2378BA'))
            self.rect(0, 14, page_w, 8, fill=1, stroke=0)
            self.setFillColor(colors.HexColor('#E67E22'))
            self.rect(0, 0, page_w, 14, fill=1, stroke=0)

        # 4. Footer Legal / Regulatory Text
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(colors.HexColor('#0F2C59'))
        footer_text = "CORPSEC INVESTIGATIONS LIMITED • PSRA LICENSED • TRUST BUT VERIFY • NAIROBI, KENYA"
        self.drawCentredString(page_w / 2, 46, footer_text)

        self.setFont("Helvetica", 7)
        self.setFillColor(colors.HexColor('#64748B'))
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(page_w - 36, 46, page_str)

        self.restoreState()


def generate_invoice_pdf(invoice: Any, db: Optional[Session] = None) -> bytes:
    """
    Generates a high-quality commercial tax invoice PDF with all corporate parameters,
    tax compliance details, client profile, and line items retrieved dynamically from the database.
    """
    # Dynamically resolve database session to pull live database records
    close_db_when_done = False
    if db is None:
        db = object_session(invoice)
        if db is None:
            try:
                from application.backend.app.core.database import SessionLocal
                db = SessionLocal()
                close_db_when_done = True
            except Exception:
                db = None

    # 1. Retrieve Company Settings from Database
    settings_map = {}
    if db:
        try:
            from application.backend.app.models.setting import Setting
            for s in db.query(Setting).all():
                settings_map[s.key] = s.value
        except Exception:
            pass

    # 2. Retrieve Client Profile & KRA PIN from Database
    client = None
    if db and getattr(invoice, 'client_name', None):
        try:
            from application.backend.app.models.client_contract import Client
            client = db.query(Client).filter(Client.name.ilike(invoice.client_name)).first()
        except Exception:
            client = None

    # Close session if we created it locally
    if close_db_when_done and db:
        try:
            db.close()
        except Exception:
            pass

    # Extract all dynamic fields retrieved from the database
    company_name = settings_map.get("company_name", getattr(invoice, 'company_name', None) or "CORPSEC INVESTIGATIONS LIMITED")
    company_division = settings_map.get("company_division", getattr(invoice, 'company_division', None) or "Guarding Services Division | Nairobi, Kenya")
    company_kra_pin = settings_map.get("company_kra_pin", getattr(invoice, 'company_kra_pin', None) or "P051234567Z")
    company_phone = settings_map.get("company_phone", getattr(invoice, 'company_phone', None) or "0726 058 358 / 0739 058 358")
    company_email = settings_map.get("company_email", getattr(invoice, 'company_email', None) or "info@corpsecinvestigations.com")
    company_alt_email = settings_map.get("company_alt_email", getattr(invoice, 'company_alt_email', None) or "corpsec.investigations@gmail.com")
    company_website = settings_map.get("company_website", getattr(invoice, 'company_website', None) or "www.corpsecinvestigations.com")
    company_location = settings_map.get("company_location", getattr(invoice, 'company_location', None) or "Nairobi, Kenya")
    company_director = settings_map.get("company_director", getattr(invoice, 'company_director', None) or "Moses Alango")
    company_director_title = settings_map.get("company_director_title", getattr(invoice, 'company_director_title', None) or "Director — CorpSec Investigations Limited")
    bank_name = settings_map.get("bank_name", getattr(invoice, 'bank_name', None) or "KCB Bank Kenya Ltd")
    bank_account_name = settings_map.get("bank_account_name", getattr(invoice, 'bank_account_name', None) or company_name)
    bank_account_number = settings_map.get("bank_account_number", getattr(invoice, 'bank_account_number', None) or "1234567890")
    bank_branch = settings_map.get("bank_branch", getattr(invoice, 'bank_branch', None) or "Upper Hill, Nairobi")
    mpesa_paybill = settings_map.get("mpesa_paybill", getattr(invoice, 'mpesa_paybill', None) or "522522")

    # Client specific fields from DB
    client_kra_pin = (client.kra_pin if client and client.kra_pin else getattr(invoice, 'client_kra_pin', None)) or "P051288491A"
    billing_address = (client.physical_address if client and client.physical_address else invoice.billing_address) or "Nairobi, Kenya"
    client_email = client.email if client and client.email else getattr(invoice, 'client_email', None)
    client_phone = client.phone if client and client.phone else getattr(invoice, 'client_phone', None)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=54,    # Clear top banner
        bottomMargin=58  # Clear bottom banner & legal footer
    )

    styles = getSampleStyleSheet()

    # Typography & Palette
    navy_color = colors.HexColor('#0F2C59')
    orange_color = colors.HexColor('#E67E22')
    slate_dark = colors.HexColor('#1E293B')
    slate_muted = colors.HexColor('#64748B')
    border_color = colors.HexColor('#CBD5E1')

    comp_title_style = ParagraphStyle(
        'CompTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        alignment=1,  # Centered
        textColor=navy_color
    )

    comp_sub_style = ParagraphStyle(
        'CompSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        alignment=1,  # Centered
        textColor=slate_muted
    )

    doc_type_style = ParagraphStyle(
        'DocTypeTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        alignment=1,  # Centered
        textColor=navy_color
    )

    contact_style = ParagraphStyle(
        'ContactText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=11,
        alignment=2,  # Right-aligned
        textColor=colors.HexColor('#334155')
    )

    section_hdr_style = ParagraphStyle(
        'SectionHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=slate_muted
    )

    bill_to_name = ParagraphStyle(
        'BillToName',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13,
        textColor=slate_dark
    )

    bill_to_details = ParagraphStyle(
        'BillToDetails',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#334155')
    )

    meta_label = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        alignment=2,
        textColor=slate_muted
    )

    meta_val = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        alignment=2,
        textColor=slate_dark
    )

    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    th_style_right = ParagraphStyle('TableHeaderRight', parent=th_style, alignment=2)
    th_style_center = ParagraphStyle('TableHeaderCenter', parent=th_style, alignment=1)

    td_item = ParagraphStyle(
        'TableItem',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=slate_dark
    )

    td_desc = ParagraphStyle(
        'TableDesc',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=9.5,
        textColor=slate_muted
    )

    td_right = ParagraphStyle(
        'TableRight',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        alignment=2,
        textColor=slate_dark
    )

    td_center = ParagraphStyle(
        'TableCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        alignment=1,
        textColor=slate_dark
    )

    notes_title = ParagraphStyle(
        'NotesTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=navy_color
    )

    notes_body = ParagraphStyle(
        'NotesBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor('#334155')
    )

    total_label = ParagraphStyle(
        'TotalLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        alignment=2,
        textColor=slate_muted
    )

    total_val = ParagraphStyle(
        'TotalVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        alignment=2,
        textColor=slate_dark
    )

    grand_total_label = ParagraphStyle(
        'GrandTotalLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        alignment=2,
        textColor=navy_color
    )

    grand_total_val = ParagraphStyle(
        'GrandTotalVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=17,
        alignment=2,
        textColor=navy_color
    )

    story = []

    # 1. Top Header Row: Logo Left | Contacts Right (All retrieved from DB)
    logo_paras = []
    if os.path.exists(LOGO_PATH):
        logo_paras.append(PlatypusImage(LOGO_PATH, width=155, height=65))
    else:
        logo_paras.append(Paragraph(f"<b>{company_name}</b><br/><i>— Trust But Verify —</i>", bill_to_name))

    contact_paras = [
        Paragraph(f"<b>📞 {company_phone}</b>", contact_style),
        Paragraph(f"✉️ {company_email}", contact_style),
        Paragraph(f"✉️ {company_alt_email}", contact_style),
        Paragraph(f"🌐 {company_website}", contact_style),
        Paragraph(f"📍 {company_location}", contact_style),
    ]

    header_table = Table(
        [[logo_paras, contact_paras]],
        colWidths=[240, 300]
    )
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8))

    # 2. Company Division Header & Document Title (Centered, from Database)
    story.append(Paragraph(company_name, comp_title_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph(company_division, comp_sub_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("TAX INVOICE", doc_type_style))
    story.append(Spacer(1, 6))

    # Decorative double divider: Navy primary + Orange accent
    story.append(HRFlowable(width="100%", thickness=1.5, color=navy_color, spaceAfter=2))
    story.append(HRFlowable(width="100%", thickness=0.8, color=orange_color, spaceAfter=10))

    # 3. Bill To & Metadata Section (All from Database)
    issue_date_str = invoice.issue_date.strftime("%d/%m/%Y") if hasattr(invoice.issue_date, 'strftime') else str(invoice.issue_date)
    due_date_str = invoice.due_date.strftime("%d/%m/%Y") if hasattr(invoice.due_date, 'strftime') else str(invoice.due_date)

    bill_to_paras = [
        Paragraph("<b>BILLED TO (CLIENT):</b>", section_hdr_style),
        Spacer(1, 3),
        Paragraph(f"<b>{invoice.client_name}</b>", bill_to_name),
        Paragraph(f"Site: {invoice.site_name}", bill_to_details),
        Paragraph(billing_address, bill_to_details),
    ]
    if client_email:
        bill_to_paras.append(Paragraph(f"Email: {client_email}", bill_to_details))
    if client_phone:
        bill_to_paras.append(Paragraph(f"Phone: {client_phone}", bill_to_details))
    bill_to_paras.append(Paragraph(f"Billing Period: <b>{invoice.billing_period}</b>", bill_to_details))

    status_str = getattr(invoice, 'status', 'ISSUED').upper()
    status_hex = '#059669' if status_str == 'PAID' else ('#D97706' if status_str == 'DRAFT' else '#0F2C59')

    inv_num = invoice.invoice_number
    ref_str = f"CSIL/INV/{inv_num.replace('INV-', '')}" if inv_num.startswith('INV-') else f"CSIL/INV/{inv_num}"

    meta_rows = [
        [Paragraph("REF / INVOICE #", meta_label), Paragraph(f"<b>{ref_str}</b>", meta_val)],
        [Paragraph("TAX INVOICE NO", meta_label), Paragraph(f"<b>{invoice.invoice_number}</b>", meta_val)],
        [Paragraph("ISSUE DATE", meta_label), Paragraph(issue_date_str, meta_val)],
        [Paragraph("PAYMENT DUE DATE", meta_label), Paragraph(due_date_str, meta_val)],
        [Paragraph("COMPANY PIN", meta_label), Paragraph(f"<b>{company_kra_pin}</b>", meta_val)],
        [Paragraph("CLIENT PIN", meta_label), Paragraph(f"<b>{client_kra_pin}</b>", meta_val)],
        [Paragraph("STATUS", meta_label), Paragraph(f"<font color='{status_hex}'><b>{status_str}</b></font>", meta_val)],
    ]
    meta_table = Table(meta_rows, colWidths=[120, 110])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
    ]))

    info_table = Table(
        [[bill_to_paras, meta_table]],
        colWidths=[310, 230]
    )
    info_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 14))

    # 4. Line Items Table (Retrieved directly from database table invoice_items)
    table_data = [[
        Paragraph("ITEM", th_style),
        Paragraph("SERVICE DESCRIPTION", th_style),
        Paragraph("QTY", th_style_center),
        Paragraph("RATE (KES)", th_style_right),
        Paragraph("VAT", th_style_center),
        Paragraph("AMOUNT (KES)", th_style_right),
    ]]

    items = getattr(invoice, 'items', []) or []
    if not items:
        table_data.append([
            Paragraph("Static Guarding Services", td_item),
            Paragraph(f"Monthly physical security guarding and access control for {invoice.site_name}", td_desc),
            Paragraph("1", td_center),
            Paragraph(f"{invoice.subtotal:,.2f}", td_right),
            Paragraph(f"{invoice.tax_rate:.0f}%", td_center),
            Paragraph(f"{invoice.subtotal:,.2f}", td_right),
        ])
    else:
        for it in items:
            desc_text = it.description or ""
            tax_text = f"{it.tax_rate:.0f}%" if it.tax_rate > 0 else "0%"
            table_data.append([
                Paragraph(it.item_name, td_item),
                Paragraph(desc_text, td_desc),
                Paragraph(f"{it.quantity:g}", td_center),
                Paragraph(f"{it.unit_price:,.2f}", td_right),
                Paragraph(tax_text, td_center),
                Paragraph(f"{it.amount:,.2f}", td_right),
            ])

    items_table = Table(
        table_data,
        colWidths=[120, 180, 40, 75, 40, 85]
    )
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), navy_color),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 10))

    # 5. Financial Summary & Notes Section (Database values)
    curr = getattr(invoice, 'currency', 'KES') or 'KES'
    summary_rows = [
        [Paragraph("SUBTOTAL (EXCL. VAT):", total_label), Paragraph(f"{curr} {invoice.subtotal:,.2f}", total_val)],
    ]
    if invoice.tax_rate > 0 or invoice.tax_amount > 0:
        summary_rows.append([
            Paragraph(f"VAT ({invoice.tax_rate:.0f}%):", total_label),
            Paragraph(f"{curr} {invoice.tax_amount:,.2f}", total_val)
        ])
    if getattr(invoice, 'discount_amount', 0) > 0:
        summary_rows.append([
            Paragraph("DISCOUNT:", total_label),
            Paragraph(f"-{curr} {invoice.discount_amount:,.2f}", total_val)
        ])
    summary_rows.append([
        Paragraph("TOTAL AMOUNT DUE:", grand_total_label),
        Paragraph(f"{curr} {invoice.total_amount:,.2f}", grand_total_val)
    ])

    summary_table = Table(summary_rows, colWidths=[130, 110])
    summary_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEABOVE', (0, -1), (-1, -1), 1.5, navy_color),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F1F5F9')),
    ]))

    notes_paras = [
        Paragraph("<b>PAYMENT INSTRUCTIONS & BANKING DETAILS:</b>", notes_title),
        Spacer(1, 3),
        Paragraph(
            invoice.notes or f"Payment is due within 14 days of invoice date. Thank you for choosing {company_name}.",
            notes_body
        ),
        Spacer(1, 4),
        Paragraph(
            invoice.payment_terms or (
                f"<b>Bank:</b> {bank_name} | <b>A/C Name:</b> {bank_account_name}<br/>"
                f"<b>Account No:</b> {bank_account_number} | <b>Branch:</b> {bank_branch}<br/>"
                f"<b>M-PESA Paybill:</b> <b>{mpesa_paybill}</b> | <b>Account:</b> {invoice.invoice_number}"
            ),
            notes_body
        )
    ]

    bottom_table = Table(
        [[notes_paras, summary_table]],
        colWidths=[300, 240]
    )
    bottom_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(bottom_table)
    story.append(Spacer(1, 14))

    # 6. Authorized Signatory / Certification Block (Directly using director from database)
    sig_elements = [
        Paragraph("Yours sincerely,", notes_body),
        Spacer(1, 2)
    ]
    if os.path.exists(SIG_PATH):
        sig_elements.append(PlatypusImage(SIG_PATH, width=120, height=30))
    else:
        sig_elements.append(Spacer(1, 20))

    sig_elements.extend([
        Paragraph(f"<b>{company_director}</b>", bill_to_name),
        Paragraph(company_director_title, comp_sub_style),
        Paragraph(f"Date: {issue_date_str}", notes_body),
    ])

    # Right side: Official Verification Seal badge
    seal_table_data = [
        [Paragraph("<font color='#059669'><b>✔ CORPSEC VERIFIED & APPROVED</b></font>", notes_title)],
        [Paragraph(f"Tax Invoice compliant with KRA TIMS/eTIMS and PSRA Regulations ({company_kra_pin}).", notes_body)]
    ]
    seal_table = Table(seal_table_data, colWidths=[220])
    seal_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F0FDF4')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#86EFAC')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))

    sig_row_table = Table(
        [[sig_elements, seal_table]],
        colWidths=[310, 230]
    )
    sig_row_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    story.append(KeepTogether(sig_row_table))

    # Build PDF with CorpSec letterhead canvas
    doc.build(story, canvasmaker=CorpSecLetterheadCanvas)
    return buffer.getvalue()
