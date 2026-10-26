import io
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from sqlalchemy.orm import Session
from sqlalchemy import extract

from application.backend.app.models.guard import Guard
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.services.payroll_engine import calculate_nssf, calculate_paye


def build_p9_data(db: Session, guard_id: int, year: int) -> Dict[str, Any]:
    guard = db.query(Guard).filter(Guard.id == guard_id).first()
    if not guard:
        return {}

    months = ["January", "February", "March", "April", "May", "June", 
              "July", "August", "September", "October", "November", "December"]
    
    monthly_rows = []
    total_gross = 0.0
    total_nssf = 0.0
    total_taxable = 0.0
    total_tax_charged = 0.0
    total_relief = 0.0
    total_paye = 0.0

    for m_idx in range(1, 13):
        m_name = months[m_idx - 1]
        
        # Find record for this month
        rec = db.query(PayrollRecord).join(PayrollPeriod).filter(
            PayrollRecord.guard_id == guard.id,
            PayrollPeriod.year == year,
            PayrollPeriod.month == m_idx
        ).first()

        if rec:
            basic = rec.basic_pay
            gross = rec.gross_pay
            nssf = rec.nssf_deduction
            taxable = max(0.0, gross - nssf)
            # Calculate tax charged before relief
            tax_charged = round(taxable * 0.10, 2) if taxable <= 24000 else round(2400.0 + (taxable - 24000) * 0.25, 2)
            relief = 2400.0 if gross > 0 else 0.0
            paye = rec.paye_deduction
        else:
            basic = 0.0
            gross = 0.0
            nssf = 0.0
            taxable = 0.0
            tax_charged = 0.0
            relief = 0.0
            paye = 0.0

        monthly_rows.append({
            "month": m_name,
            "basic_salary": basic,
            "gross_pay": gross,
            "nssf": nssf,
            "taxable_pay": taxable,
            "tax_charged": tax_charged,
            "personal_relief": relief,
            "paye": paye
        })

        total_gross += gross
        total_nssf += nssf
        total_taxable += taxable
        total_tax_charged += tax_charged
        total_relief += relief
        total_paye += paye

    return {
        "year": year,
        "employee_number": guard.employee_number,
        "guard_name": guard.full_name,
        "kra_pin": guard.kra_pin or "A000000000Z",
        "national_id": guard.national_id,
        "monthly_rows": monthly_rows,
        "totals": {
            "gross_pay": round(total_gross, 2),
            "nssf": round(total_nssf, 2),
            "taxable_pay": round(total_taxable, 2),
            "tax_charged": round(total_tax_charged, 2),
            "personal_relief": round(total_relief, 2),
            "paye": round(total_paye, 2)
        }
    }


def generate_p9_pdf(p9_data: Dict[str, Any]) -> bytes:
    """Generates KRA P9 Tax Deduction Card PDF matching Screen 24."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=30,
        leftMargin=30,
        topMargin=30,
        bottomMargin=30
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#1E293B')
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748B')
    )
    cell_head = ParagraphStyle('CellHead', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10)
    cell_val = ParagraphStyle('CellVal', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10)

    story = []
    story.append(Paragraph("KENYA REVENUE AUTHORITY — P9 TAX DEDUCTION CARD", title_style))
    story.append(Paragraph(f"Tax Year: {p9_data.get('year', 2026)} | Employer: CorpSec Kenya Ltd | PIN: P051234567Z", subtitle_style))
    story.append(Spacer(1, 10))

    meta_table = [
        [
            Paragraph(f"<b>Employee Name:</b> {p9_data.get('guard_name')}", cell_val),
            Paragraph(f"<b>Employee No:</b> {p9_data.get('employee_number')}", cell_val),
            Paragraph(f"<b>KRA PIN:</b> {p9_data.get('kra_pin')}", cell_val),
            Paragraph(f"<b>National ID:</b> {p9_data.get('national_id')}", cell_val),
        ]
    ]
    t_meta = Table(meta_table, colWidths=[200, 160, 180, 180])
    t_meta.setStyle(TableStyle([('BOTTOMPADDING', (0,0), (-1,-1), 4)]))
    story.append(t_meta)
    story.append(Spacer(1, 10))

    headers = [
        "Month", "Basic Salary (A)", "Gross Pay (D)", "NSSF (E)", "Taxable Pay (F)", "Tax Charged (G)", "Relief (H)", "PAYE Tax (I)"
    ]
    table_data = [[Paragraph(h, cell_head) for h in headers]]

    for row in p9_data.get("monthly_rows", []):
        table_data.append([
            Paragraph(row["month"], cell_val),
            Paragraph(f"{row['basic_salary']:,.2f}", cell_val),
            Paragraph(f"{row['gross_pay']:,.2f}", cell_val),
            Paragraph(f"{row['nssf']:,.2f}", cell_val),
            Paragraph(f"{row['taxable_pay']:,.2f}", cell_val),
            Paragraph(f"{row['tax_charged']:,.2f}", cell_val),
            Paragraph(f"{row['personal_relief']:,.2f}", cell_val),
            Paragraph(f"{row['paye']:,.2f}", cell_val),
        ])

    totals = p9_data.get("totals", {})
    table_data.append([
        Paragraph("<b>TOTALS</b>", cell_head),
        Paragraph(f"<b>{totals.get('gross_pay', 0.0):,.2f}</b>", cell_head),
        Paragraph(f"<b>{totals.get('gross_pay', 0.0):,.2f}</b>", cell_head),
        Paragraph(f"<b>{totals.get('nssf', 0.0):,.2f}</b>", cell_head),
        Paragraph(f"<b>{totals.get('taxable_pay', 0.0):,.2f}</b>", cell_head),
        Paragraph(f"<b>{totals.get('tax_charged', 0.0):,.2f}</b>", cell_head),
        Paragraph(f"<b>{totals.get('personal_relief', 0.0):,.2f}</b>", cell_head),
        Paragraph(f"<b>{totals.get('paye', 0.0):,.2f}</b>", cell_head),
    ])

    t_p9 = Table(table_data, colWidths=[80, 90, 95, 90, 95, 95, 85, 90])
    t_p9.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_p9)

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
