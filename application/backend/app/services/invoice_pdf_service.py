import io
import datetime
from typing import Any
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    """Adds professional page numbering and top accent band to all pages."""
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
            self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, page_count):
        # 1. Top Teal Header Accent Band
        self.saveState()
        self.setFillColor(colors.HexColor('#0D7682'))
        self.rect(0, 792 - 10, 612, 10, fill=1, stroke=0)

        # 2. Bottom Footer
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#94A3B8'))
        footer_text = "CorpSec Security Services Ltd • PSRA Registered • info@corpsec.co.ke • +254 700 000 000"
        self.drawString(36, 24, footer_text)
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 36, 24, page_str)
        
        # Subtle footer divider
        self.setStrokeColor(colors.HexColor('#E2E8F0'))
        self.setLineWidth(0.5)
        self.line(36, 36, 612 - 36, 36)
        self.restoreState()


def generate_invoice_pdf(invoice: Any) -> bytes:
    """
    Generates a high-quality commercial site invoice PDF matching
    the CorpSec design standards and the user's reference specification.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=26,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    # Custom Paragraph Styles
    title_style = ParagraphStyle(
        'InvoiceTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=28,
        leading=32,
        textColor=colors.HexColor('#0F172A')
    )

    comp_name_style = ParagraphStyle(
        'CompName',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        alignment=2,  # Right align
        textColor=colors.HexColor('#0F172A')
    )

    comp_details_style = ParagraphStyle(
        'CompDetails',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        alignment=2,  # Right align
        textColor=colors.HexColor('#64748B')
    )

    section_hdr_style = ParagraphStyle(
        'SectionHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#64748B')
    )

    bill_to_name = ParagraphStyle(
        'BillToName',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#0F172A')
    )

    bill_to_details = ParagraphStyle(
        'BillToDetails',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#334155')
    )

    meta_label = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        alignment=2,
        textColor=colors.HexColor('#64748B')
    )

    meta_val = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        alignment=2,
        textColor=colors.HexColor('#0F172A')
    )

    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#475569')
    )

    th_style_right = ParagraphStyle(
        'TableHeaderRight',
        parent=th_style,
        alignment=2
    )

    th_style_center = ParagraphStyle(
        'TableHeaderCenter',
        parent=th_style,
        alignment=1
    )

    td_item = ParagraphStyle(
        'TableItem',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#0F172A')
    )

    td_desc = ParagraphStyle(
        'TableDesc',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor('#64748B')
    )

    td_right = ParagraphStyle(
        'TableRight',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        alignment=2,
        textColor=colors.HexColor('#0F172A')
    )

    td_center = ParagraphStyle(
        'TableCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        alignment=1,
        textColor=colors.HexColor('#0F172A')
    )

    notes_title = ParagraphStyle(
        'NotesTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#475569')
    )

    notes_body = ParagraphStyle(
        'NotesBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#475569')
    )

    total_label = ParagraphStyle(
        'TotalLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        alignment=2,
        textColor=colors.HexColor('#64748B')
    )

    total_val = ParagraphStyle(
        'TotalVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        alignment=2,
        textColor=colors.HexColor('#0F172A')
    )

    grand_total_label = ParagraphStyle(
        'GrandTotalLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        alignment=2,
        textColor=colors.HexColor('#0F172A')
    )

    grand_total_val = ParagraphStyle(
        'GrandTotalVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=19,
        alignment=2,
        textColor=colors.HexColor('#0D7682')
    )

    story = []

    # 1. Header Row (Logo & "Invoice" left | Company details right)
    header_left = [
        Paragraph("Invoice", title_style)
    ]
    header_right = [
        Paragraph("CORPSEC SECURITY SERVICES LTD", comp_name_style),
        Paragraph("Upper Hill Financial District, Cathedral Rd", comp_details_style),
        Paragraph("P.O. Box 45123 - 00100, Nairobi, Kenya", comp_details_style),
        Paragraph("Tel: +254 700 000 000 | billing@corpsec.co.ke", comp_details_style),
        Paragraph("KRA PIN: P051234567X", comp_details_style),
    ]

    header_table = Table(
        [[header_left, header_right]],
        colWidths=[200, 340]
    )
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 14))

    # Clean divider line
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceAfter=14))

    # 2. Bill To & Metadata Row
    issue_date_str = invoice.issue_date.strftime("%d/%m/%Y") if hasattr(invoice.issue_date, 'strftime') else str(invoice.issue_date)
    due_date_str = invoice.due_date.strftime("%d/%m/%Y") if hasattr(invoice.due_date, 'strftime') else str(invoice.due_date)

    bill_to_paras = [
        Paragraph("BILL TO:", section_hdr_style),
        Spacer(1, 3),
        Paragraph(f"<b>{invoice.client_name}</b>", bill_to_name),
        Paragraph(f"Site: {invoice.site_name}", bill_to_details),
    ]
    if getattr(invoice, 'billing_address', None):
        bill_to_paras.append(Paragraph(invoice.billing_address, bill_to_details))
    if getattr(invoice, 'client_email', None):
        bill_to_paras.append(Paragraph(f"Email: {invoice.client_email}", bill_to_details))
    if getattr(invoice, 'client_phone', None):
        bill_to_paras.append(Paragraph(f"Phone: {invoice.client_phone}", bill_to_details))
    bill_to_paras.append(Paragraph(f"Billing Period: <b>{invoice.billing_period}</b>", bill_to_details))

    # Status color badge
    status_str = getattr(invoice, 'status', 'ISSUED').upper()
    status_hex = '#10B981' if status_str == 'PAID' else ('#D97706' if status_str == 'DRAFT' else '#0D7682')

    meta_rows = [
        [Paragraph("INVOICE #", meta_label), Paragraph(f"<b>{invoice.invoice_number}</b>", meta_val)],
        [Paragraph("DATE", meta_label), Paragraph(issue_date_str, meta_val)],
        [Paragraph("INVOICE DUE DATE", meta_label), Paragraph(due_date_str, meta_val)],
        [Paragraph("STATUS", meta_label), Paragraph(f"<font color='{status_hex}'><b>{status_str}</b></font>", meta_val)],
    ]
    meta_table = Table(meta_rows, colWidths=[110, 110])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    info_table = Table(
        [[bill_to_paras, meta_table]],
        colWidths=[320, 220]
    )
    info_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 20))

    # 3. Line Items Table
    # Columns: ITEMS (130), DESCRIPTION (170), QUANTITY (45), PRICE (70), TAX (40), AMOUNT (85) = 540 total
    table_data = [[
        Paragraph("ITEMS", th_style),
        Paragraph("DESCRIPTION", th_style),
        Paragraph("QUANTITY", th_style_center),
        Paragraph("PRICE (KES)", th_style_right),
        Paragraph("TAX", th_style_center),
        Paragraph("AMOUNT (KES)", th_style_right),
    ]]

    items = getattr(invoice, 'items', []) or []
    if not items:
        # Default placeholder item if invoice has no line items yet
        table_data.append([
            Paragraph("Security Guarding Services", td_item),
            Paragraph(f"Standard monthly security guarding services for {invoice.site_name}", td_desc),
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
        colWidths=[125, 175, 45, 75, 40, 80]
    )
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F8FAFC')),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor('#F1F5F9')),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 16))

    # 4. Summary & Notes Section
    # Left: Notes & Bank info | Right: Subtotal, VAT, Total
    notes_paras = [
        Paragraph("NOTES / PAYMENT INSTRUCTIONS:", notes_title),
        Spacer(1, 4),
        Paragraph(
            invoice.notes or "Payment is due within 14 days of invoice date. Thank you for your continued partnership.",
            notes_body
        ),
        Spacer(1, 6),
        Paragraph(
            invoice.payment_terms or (
                "<b>Banking Details:</b> KCB Bank Kenya Ltd<br/>"
                "Account Name: CorpSec Security Services Ltd | A/C: 1234567890 | Branch: Upper Hill<br/>"
                "<b>M-PESA Paybill:</b> 522522 | Account: " + invoice.invoice_number
            ),
            notes_body
        )
    ]

    curr = getattr(invoice, 'currency', 'KES') or 'KES'
    summary_rows = [
        [Paragraph("SUBTOTAL:", total_label), Paragraph(f"{curr} {invoice.subtotal:,.2f}", total_val)],
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
        Paragraph("TOTAL:", grand_total_label),
        Paragraph(f"{curr} {invoice.total_amount:,.2f}", grand_total_val)
    ])

    summary_table = Table(summary_rows, colWidths=[100, 130])
    summary_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#0D7682')),
    ]))

    bottom_table = Table(
        [[notes_paras, summary_table]],
        colWidths=[300, 240]
    )
    bottom_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    story.append(KeepTogether(bottom_table))

    # Build PDF using NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()

