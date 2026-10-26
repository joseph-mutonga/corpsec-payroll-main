import io
from typing import Dict, Any
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def generate_payslip_pdf(data: Dict[str, Any]) -> bytes:
    """
    Generates a high-quality PDF payslip matching CorpSec Payroll design specifications.
    Returns: PDF file bytes
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#1E293B')
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748B')
    )
    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#475569')
    )
    value_style = ParagraphStyle(
        'ValueStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0F172A')
    )
    net_pay_label = ParagraphStyle(
        'NetPayLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#3B5EDB')
    )
    net_pay_val = ParagraphStyle(
        'NetPayVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#3B5EDB'),
        alignment=2 # Right align
    )

    story = []

    # Header section
    story.append(Paragraph("CORPSEC PAYROLL", title_style))
    story.append(Paragraph(f"Official Payslip — {data.get('period_name', 'Pay Period')}", subtitle_style))
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceAfter=15))

    # Employee Details Grid
    days_worked_val = data.get('days_worked', 0)
    has_real_attendance = data.get('has_real_attendance', False)
    unpaid_days = data.get('unpaid_leave_days', 0)

    days_emp_val = data.get('days_employed', 30)
    days_in_month_val = data.get('days_in_month', 30)

    if has_real_attendance:
        days_label = "Days Worked:"
        days_val = f"{days_worked_val} days<br/>Days employed: {days_emp_val} of {days_in_month_val}"
    else:
        days_label = "Days Summary:"
        emp_line = f"Days employed: {days_emp_val} of {days_in_month_val}"
        if unpaid_days > 0:
            days_val = f"{emp_line}<br/>Unpaid leave days: {unpaid_days}"
        else:
            days_val = emp_line

    emp_details = [
        [
            Paragraph("Guard Name:", label_style), Paragraph(str(data.get('guard_name', '')), value_style),
            Paragraph("Employee Number:", label_style), Paragraph(str(data.get('employee_number', '')), value_style),
        ],
        [
            Paragraph("Assigned Site:", label_style), Paragraph(str(data.get('site_name', '')), value_style),
            Paragraph("Payment Method:", label_style), Paragraph(str(data.get('payment_method', '')), value_style),
        ],
        [
            Paragraph(days_label, label_style), Paragraph(days_val, value_style),
            Paragraph("NSSF / SHIF Number:", label_style), Paragraph(f"{data.get('nssf_number', 'N/A')} / {data.get('shif_number', 'N/A')}", value_style),
        ],
    ]

    t_emp = Table(emp_details, colWidths=[110, 160, 120, 140])
    t_emp.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_emp)
    story.append(Spacer(1, 15))

    # Earnings & Deductions Tables
    story.append(Paragraph("<b>EARNINGS</b>", label_style))
    story.append(Spacer(1, 5))

    earnings_table_data = [
        [Paragraph("Item", label_style), Paragraph("Amount (KES)", label_style)],
        [Paragraph("Basic Salary", value_style), Paragraph(f"{data.get('basic_pay', 0.0):,.2f}", value_style)],
        [Paragraph(f"Overtime Pay ({data.get('overtime_hours', 0.0)}h @ 1.5x)", value_style), Paragraph(f"{data.get('overtime_pay', 0.0):,.2f}", value_style)],
        [Paragraph("Allowances (Night / Transport / Housing)", value_style), Paragraph(f"{data.get('allowances', 0.0):,.2f}", value_style)],
        [Paragraph("<b>Gross Pay</b>", label_style), Paragraph(f"<b>{data.get('gross_pay', 0.0):,.2f}</b>", label_style)],
    ]

    t_earnings = Table(earnings_table_data, colWidths=[380, 150])
    t_earnings.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F8FAFC')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
    ]))
    story.append(t_earnings)
    story.append(Spacer(1, 15))

    unpaid_leave_val = data.get('unpaid_leave_deduction', 0.0)
    deductions_table_data = [
        [Paragraph("Statutory / Policy Item", label_style), Paragraph("Amount (KES)", label_style)],
        [Paragraph("NSSF (6%)", value_style), Paragraph(f"{data.get('nssf_deduction', 0.0):,.2f}", value_style)],
        [Paragraph("SHIF (2.75% / KES 300 Floor)", value_style), Paragraph(f"{data.get('shif_deduction', 0.0):,.2f}", value_style)],
        [Paragraph("Housing Levy (1.5%)", value_style), Paragraph(f"{data.get('housing_levy_deduction', 0.0):,.2f}", value_style)],
        [Paragraph("PAYE (Income Tax)", value_style), Paragraph(f"{data.get('paye_deduction', 0.0):,.2f}", value_style)],
    ]
    if unpaid_leave_val > 0:
        deductions_table_data.append(
            [Paragraph("<b>Unpaid Leave Deduction</b>", label_style), Paragraph(f"<b>{unpaid_leave_val:,.2f}</b>", label_style)]
        )
    deductions_table_data.extend([
        [Paragraph("Other Deductions", value_style), Paragraph(f"{data.get('other_deductions', 0.0):,.2f}", value_style)],
        [Paragraph("<b>Total Deductions</b>", label_style), Paragraph(f"<b>{data.get('total_deductions', 0.0):,.2f}</b>", label_style)],
    ])

    t_deductions = Table(deductions_table_data, colWidths=[380, 150])
    t_deductions.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F8FAFC')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
    ]))
    story.append(t_deductions)
    story.append(Spacer(1, 15))

    # PAYE Audit Breakdown Section (Strictly uses payroll engine payload without duplicated tax logic)
    story.append(Paragraph("<b>PAYE TAX CALCULATION AUDIT BREAKDOWN</b>", label_style))
    story.append(Spacer(1, 5))

    gross_val = data.get('gross_pay', 0.0)
    nssf_val = data.get('nssf_deduction', 0.0)
    pb = data.get('paye_breakdown')

    if not pb or not isinstance(pb, dict):
        taxable_val = max(0.0, gross_val - nssf_val)
        gross_tax_str = "N/A"
        relief_applied_str = "N/A"
        paye_val_str = f"KES {data.get('paye_deduction', 0.0):,.2f}"
        which_band = "N/A (Historical record missing breakdown data)"
        paye_status_note = ""
    else:
        taxable_val = pb.get('taxable_income', pb.get('taxable_pay', max(0.0, gross_val - nssf_val)))
        gross_tax_val = pb.get('gross_tax_before_relief', pb.get('tax_before_relief', 0.0))
        relief_applied_val = pb.get('personal_relief_applied', 0.0)
        paye_val = pb.get('final_paye', pb.get('net_paye', data.get('paye_deduction', 0.0)))
        which_band = pb.get('which_band', '10% (0–24,000)')
        
        gross_tax_str = f"KES {gross_tax_val:,.2f}"
        relief_applied_str = f"- KES {relief_applied_val:,.2f}"
        paye_val_str = f"KES {paye_val:,.2f}"
        relief_val = pb.get('personal_relief', 2400.0)
        paye_status_note = " (Relief exceeds tax owed)" if paye_val == 0.0 and gross_tax_val <= relief_val else ""

    paye_audit_table_data = [
        [Paragraph("Calculation Step", label_style), Paragraph("Value / Detail", label_style)],
        [Paragraph("Gross Pay", value_style), Paragraph(f"KES {gross_val:,.2f}", value_style)],
        [Paragraph("Less: Statutory NSSF Deduction", value_style), Paragraph(f"- KES {nssf_val:,.2f}", value_style)],
        [Paragraph("<b>Taxable Income</b>", label_style), Paragraph(f"<b>KES {taxable_val:,.2f}</b>", label_style)],
        [Paragraph("Tax Band(s) Applied", value_style), Paragraph(str(which_band), value_style)],
        [Paragraph("Tax Before Relief (Gross Tax)", value_style), Paragraph(gross_tax_str, value_style)],
        [Paragraph("Less: Personal Relief Applied", value_style), Paragraph(relief_applied_str, value_style)],
        [Paragraph("<b>Final PAYE Tax Payable</b>", label_style), Paragraph(f"<b>{paye_val_str}{paye_status_note}</b>", label_style)],
    ]

    t_paye_audit = Table(paye_audit_table_data, colWidths=[240, 290])
    t_paye_audit.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
    ]))
    story.append(t_paye_audit)
    story.append(Spacer(1, 15))

    # Net Pay Callout Box
    net_pay_table_data = [
        [Paragraph("NET PAY (TAKE HOME)", net_pay_label), Paragraph(f"KES {data.get('net_pay', 0.0):,.2f}", net_pay_val)]
    ]
    t_net = Table(net_pay_table_data, colWidths=[250, 280])
    t_net.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#EEF2FF')),
        ('PADDING', (0, 0), (-1, -1), 12),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor('#3B5EDB')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_net)

    story.append(Spacer(1, 30))
    story.append(Paragraph("<i>This is a system-generated payslip issued by CorpSec Payroll. For queries contact Payroll Administrator.</i>", subtitle_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

