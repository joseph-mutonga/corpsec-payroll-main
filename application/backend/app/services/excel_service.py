import io
from typing import List, Dict, Any
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


def generate_bank_schedule_excel(items: List[Dict[str, Any]], period_name: str) -> bytes:
    """
    Generates CorpSec Bank Payment Schedule formatted Excel workbook matching Screen 14.
    Approved Columns: Guard ID | Full Name | Bank Name | Account Number | Net Amount (KES) | Reference | Status
    Hard Guarantee: Excludes any employee whose salary is on hold.
    """
    # Strict fail-safe: exclude any employee whose salary is currently on hold
    items = [it for it in items if not it.get("is_on_hold") and it.get("status") != "ON_HOLD"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Bank Payment Schedule"

    # Header styling
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color="1E3A8A")
    bold_font = Font(name="Calibri", size=11, bold=True)
    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'),
        right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'),
        bottom=Side(style='thin', color='D1D5DB')
    )

    ws.append(["CORPSEC PAYROLL — BANK PAYMENT SCHEDULE"])
    ws.append([f"Pay Period: {period_name}"])
    ws.append([])

    ws.cell(row=1, column=1).font = title_font
    ws.cell(row=2, column=1).font = Font(name="Calibri", size=10, italic=True)

    headers = ["Guard ID", "Full Name", "Bank Name", "Account Number", "Net Amount (KES)", "Reference", "Status"]
    ws.append(headers)

    header_row_idx = 4
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=header_row_idx, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="right" if col_idx == 5 else "left", vertical="center")

    # Freeze panes below header row
    ws.freeze_panes = "A5"

    total_amount = 0.0
    start_data_row = 5

    for item in items:
        amt = float(item.get("amount", 0.0))
        total_amount += amt
        row = [
            item.get("employee_number", ""),
            item.get("guard_name", ""),
            item.get("bank_name", "N/A"),
            item.get("bank_account", "N/A"),
            amt,
            item.get("reference_number", ""),
            item.get("status", "READY")
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.cell(row=curr_row, column=5).number_format = '#,##0.00'
        for col_i in range(1, len(headers) + 1):
            ws.cell(row=curr_row, column=col_i).border = thin_border

    end_data_row = ws.max_row

    # Total Summary Row using Excel SUM formula
    if items:
        formula_str = f"=SUM(E{start_data_row}:E{end_data_row})"
    else:
        formula_str = 0.0

    summary_row = ["TOTAL", "", "", "", formula_str, "", ""]
    ws.append(summary_row)
    last_row = ws.max_row

    ws.cell(row=last_row, column=1).font = bold_font
    total_cell = ws.cell(row=last_row, column=5)
    total_cell.font = bold_font
    total_cell.number_format = '#,##0.00'
    total_cell.value = total_amount  # Set numeric explicit fallback value for compatibility

    # Top/Bottom double border for summary row
    double_bottom_border = Border(
        top=Side(style='thin', color='000000'),
        bottom=Side(style='double', color='000000')
    )
    for col_i in range(1, len(headers) + 1):
        ws.cell(row=last_row, column=col_i).border = double_bottom_border

    # Auto-fit columns
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_statutory_payroll_template_excel(records_data: List[Dict[str, Any]], period_name: str = "") -> bytes:
    """
    Generates Kenya Official Statutory NHIF/SHIF Payroll Template (.xlsx) matching User Reference Image 1.
    Columns: PAYROLL NUMBER | FIRSTNAME | LASTNAME | IDENTITY TYPE | ID NO | KRA PIN | NHIF NO | CONTRIBUTION AMOUNT | PHONE
    Includes DataValidation dropdown on IDENTITY TYPE column: Refugee ID, National ID, Alien ID, Passport Number
    """
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    headers = [
        "PAYROLL NUMBER",
        "FIRSTNAME",
        "LASTNAME",
        "IDENTITY TYPE",
        "ID NO",
        "KRA PIN",
        "NHIF NO",
        "CONTRIBUTION AMOUNT",
        "PHONE"
    ]
    ws.append(headers)

    header_font = Font(name="Calibri", size=11, bold=True, color="000000")
    header_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='000000'),
        bottom=Side(style='thin', color='000000')
    )

    for col_i in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_i)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="right" if col_i == 8 else "left", vertical="center")

    # Add Data Validation for IDENTITY TYPE (Col D) matching Image 1
    dv = DataValidation(type="list", formula1='"Refugee ID,National ID,Alien ID,Passport Number"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("D2:D500")

    # Populate rows if records provided
    for rec in records_data:
        full_name = (rec.get("guard_name") or rec.get("full_name") or "").strip()
        name_parts = full_name.split() if full_name else []
        firstname = name_parts[0] if len(name_parts) > 0 else ""
        lastname = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

        amount = float(rec.get("shif_deduction") or rec.get("nhif_deduction") or rec.get("contribution_amount") or 0.0)

        row = [
            rec.get("employee_number") or rec.get("payroll_number") or "",
            firstname,
            lastname,
            rec.get("identity_type") or "National ID",
            rec.get("national_id") or rec.get("id_no") or "",
            rec.get("kra_pin") or "",
            rec.get("shif_number") or rec.get("nhif_no") or "",
            amount,
            rec.get("phone") or ""
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.cell(row=curr_row, column=8).number_format = '#,##0.00'
        for col_i in range(1, len(headers) + 1):
            ws.cell(row=curr_row, column=col_i).border = thin_border

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 5, 14)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_im_salary_batch_excel(
    items: List[Dict[str, Any]], 
    period_name: str, 
    execution_date: str = None, 
    account_to_debit: str = "01201982736450"
) -> bytes:
    """
    Generates Corporate I&M Bank Salary Batch Excel (.xlsx) matching User Reference Image 2.
    Header: Logo banner, Version V1.0.0, Salary Batch, Metadata grid (File Name, Account to Debit, Execution Date, Currency, Total Amount, No. of Records, Validate File button)
    Table Headers (Row 8): Employee Number | *Employee Name | Account Number | Bank Name or Bank Code | Amount | Payment Description (Max 50 character | Payment Mode | Branch Name or Code
    """
    # Strict fail-safe: exclude any employee whose salary is currently on hold
    items = [it for it in items if not it.get("is_on_hold") and it.get("status") != "ON_HOLD"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Template"

    brand_blue = "0B3056"
    btn_blue = "002060"
    table_header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    bold_title_font = Font(name="Calibri", size=16, bold=True, color=brand_blue)
    meta_label_font = Font(name="Calibri", size=9, bold=True, color="333333")
    meta_val_font = Font(name="Calibri", size=9, color="000000")
    table_header_font = Font(name="Calibri", size=10, bold=True, color="000000")

    thin_border = Border(
        left=Side(style='thin', color='B0C4DE'),
        right=Side(style='thin', color='B0C4DE'),
        top=Side(style='thin', color='B0C4DE'),
        bottom=Side(style='thin', color='B0C4DE')
    )
    meta_border = Border(
        left=Side(style='thin', color='808080'),
        right=Side(style='thin', color='808080'),
        top=Side(style='thin', color='808080'),
        bottom=Side(style='thin', color='808080')
    )

    # Title & Version matching Image 2
    ws["B2"] = "Version V1.0.0"
    ws["B2"].font = Font(name="Calibri", size=9, italic=True, color="666666")
    ws["B3"] = "Salary\nBatch"
    ws["B3"].font = bold_title_font
    ws["B3"].alignment = Alignment(wrap_text=True, vertical="center")

    total_amount = round(sum(float(it.get("amount", 0.0)) for it in items), 2)
    record_count = len(items)
    file_name = f"CorpSec_Salary_Batch_{period_name.replace(' ', '_')}"
    exec_date = execution_date or period_name

    meta_grid = [
        (2, "File Name", file_name, "Currency", "KES"),
        (3, "Account to Debit", account_to_debit, "Total Amount", total_amount),
        (4, "Execution Date", exec_date, "No. of Records", record_count),
        (5, "Who to Pay Charges", "OUR", None, None),
        (6, "Account to Pay Charges", account_to_debit, None, None),
    ]

    for row_idx, lbl1, val1, lbl2, val2 in meta_grid:
        ws.cell(row=row_idx, column=3, value=lbl1).font = meta_label_font
        c_val1 = ws.cell(row=row_idx, column=4, value=val1)
        c_val1.font = meta_val_font
        ws.cell(row=row_idx, column=3).border = meta_border
        c_val1.border = meta_border
        if lbl2 is not None:
            ws.cell(row=row_idx, column=6, value=lbl2).font = meta_label_font
            c_val2 = ws.cell(row=row_idx, column=7, value=val2)
            c_val2.font = meta_val_font
            ws.cell(row=row_idx, column=6).border = meta_border
            c_val2.border = meta_border
            if lbl2 == "Total Amount":
                c_val2.number_format = '#,##0.00'

    # Validate File Button (Row 5-6, Col F-G)
    ws.merge_cells("F5:G6")
    btn_cell = ws["F5"]
    btn_cell.value = "Validate File"
    btn_cell.fill = PatternFill(start_color=btn_blue, end_color=btn_blue, fill_type="solid")
    btn_cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    btn_cell.alignment = Alignment(horizontal="center", vertical="center")

    # Table Headers on Row 8 matching Image 2
    headers = [
        "Employee Number",
        "*Employee Name",
        "Account Number",
        "Bank Name or Bank Code",
        "Amount",
        "Payment Description (Max 50 character",
        "Payment Mode",
        "Branch Name or Code"
    ]
    for col_i, h in enumerate(headers, start=1):
        cell = ws.cell(row=8, column=col_i, value=h)
        cell.fill = table_header_fill
        cell.font = table_header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="right" if col_i == 5 else "left", vertical="center")

    ws.freeze_panes = "A9"

    for item in items:
        amt = float(item.get("amount", 0.0))
        row = [
            item.get("employee_number", ""),
            item.get("guard_name", ""),
            item.get("bank_account", ""),
            item.get("bank_name", ""),
            amt,
            f"{period_name} Salary",
            "EFT",
            item.get("branch_name", "Head Office")
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.cell(row=curr_row, column=5).number_format = '#,##0.00'
        for col_i in range(1, len(headers) + 1):
            ws.cell(row=curr_row, column=col_i).border = thin_border

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_im_mobile_money_excel(
    items: List[Dict[str, Any]], 
    period_name: str, 
    execution_date: str = None, 
    account_to_debit: str = "01201982736450"
) -> bytes:
    """
    Generates Corporate I&M Mobile Money (M-Pesa) Payments Excel (.xlsx) matching User Reference Image 3.
    Header: Logo banner, Version V1.0.0, Mobile Money Payments, Metadata grid (File Name, Account to Debit, Execution Date, Telco Name, Currency, Total Amount, No. of Records, Validate File button)
    Table Headers (Row 8): Employee Number | *Employee Name | Phone Number | Amount | Payment Description (Max 50 characters)
    """
    # Strict fail-safe: exclude any employee whose salary is currently on hold
    items = [it for it in items if not it.get("is_on_hold") and it.get("status") != "ON_HOLD"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Template"

    brand_blue = "0B3056"
    btn_blue = "002060"
    table_header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    bold_title_font = Font(name="Calibri", size=15, bold=True, color=brand_blue)
    meta_label_font = Font(name="Calibri", size=9, bold=True, color="333333")
    meta_val_font = Font(name="Calibri", size=9, color="000000")
    table_header_font = Font(name="Calibri", size=10, bold=True, color="000000")

    thin_border = Border(
        left=Side(style='thin', color='B0C4DE'),
        right=Side(style='thin', color='B0C4DE'),
        top=Side(style='thin', color='B0C4DE'),
        bottom=Side(style='thin', color='B0C4DE')
    )
    meta_border = Border(
        left=Side(style='thin', color='808080'),
        right=Side(style='thin', color='808080'),
        top=Side(style='thin', color='808080'),
        bottom=Side(style='thin', color='808080')
    )

    ws["B2"] = "Version V1.0.0"
    ws["B2"].font = Font(name="Calibri", size=9, italic=True, color="666666")
    ws["B3"] = "Mobile Money\nPayments"
    ws["B3"].font = bold_title_font
    ws["B3"].alignment = Alignment(wrap_text=True, vertical="center")

    ws["A6"] = "Enable Macros to Proceed"
    ws["A6"].font = Font(name="Calibri", size=9, bold=True, italic=True, color="C00000")

    total_amount = round(sum(float(it.get("amount", 0.0)) for it in items), 2)
    record_count = len(items)
    file_name = f"CorpSec_Mpesa_Batch_{period_name.replace(' ', '_')}"
    exec_date = execution_date or period_name

    meta_grid = [
        (2, "File Name", file_name, "Telco Name", "Mpesa"),
        (3, "Account to Debit", account_to_debit, "Currency", "KES"),
        (4, "Execution Date", exec_date, "Total Amount", total_amount),
        (5, "Account to Pay Charges", account_to_debit, "No. of Records", record_count),
    ]

    for row_idx, lbl1, val1, lbl2, val2 in meta_grid:
        ws.cell(row=row_idx, column=3, value=lbl1).font = meta_label_font
        c_val1 = ws.cell(row=row_idx, column=4, value=val1)
        c_val1.font = meta_val_font
        ws.cell(row=row_idx, column=3).border = meta_border
        c_val1.border = meta_border
        if lbl2 is not None:
            ws.cell(row=row_idx, column=5, value=lbl2).font = meta_label_font
            c_val2 = ws.cell(row=row_idx, column=6, value=val2)
            c_val2.font = meta_val_font
            ws.cell(row=row_idx, column=5).border = meta_border
            c_val2.border = meta_border
            if lbl2 == "Total Amount":
                c_val2.number_format = '#,##0.00'

    ws.merge_cells("E6:F6")
    btn_cell = ws["E6"]
    btn_cell.value = "Validate File"
    btn_cell.fill = PatternFill(start_color=btn_blue, end_color=btn_blue, fill_type="solid")
    btn_cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    btn_cell.alignment = Alignment(horizontal="center", vertical="center")

    headers = [
        "Employee Number",
        "*Employee Name",
        "Phone Number",
        "Amount",
        "Payment Description (Max 50 characters)"
    ]
    for col_i, h in enumerate(headers, start=1):
        cell = ws.cell(row=8, column=col_i, value=h)
        cell.fill = table_header_fill
        cell.font = table_header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="right" if col_i == 4 else "left", vertical="center")

    ws.freeze_panes = "A9"

    for item in items:
        amt = float(item.get("amount", 0.0))
        phone = item.get("mpesa_number") or item.get("phone") or item.get("account_number") or ""
        row = [
            item.get("employee_number", ""),
            item.get("guard_name", ""),
            phone,
            amt,
            f"{period_name} Salary"
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.cell(row=curr_row, column=4).number_format = '#,##0.00'
        for col_i in range(1, len(headers) + 1):
            ws.cell(row=curr_row, column=col_i).border = thin_border

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 16)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()



def generate_mpesa_schedule_excel(items: List[Dict[str, Any]], period_name: str) -> bytes:
    """
    Generates CorpSec M-Pesa Payment Schedule formatted Excel workbook matching Screen 15.
    Approved Columns: Guard ID | Full Name | Phone Number | Net Amount (KES) | Reference | Status
    """
    # Strict fail-safe: Held employees must NEVER be exported in payment schedules
    items = [it for it in items if not it.get("is_on_hold") and it.get("status") != "ON_HOLD"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "M-Pesa Payment Schedule"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color="166534")
    bold_font = Font(name="Calibri", size=11, bold=True)
    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'),
        right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'),
        bottom=Side(style='thin', color='D1D5DB')
    )

    ws.append(["CORPSEC PAYROLL — M-PESA PAYMENT SCHEDULE"])
    ws.append([f"Pay Period: {period_name}"])
    ws.append([])

    ws.cell(row=1, column=1).font = title_font
    ws.cell(row=2, column=1).font = Font(name="Calibri", size=10, italic=True)

    headers = ["Guard ID", "Full Name", "Phone Number", "Net Amount (KES)", "Reference", "Status"]
    ws.append(headers)

    header_row_idx = 4
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=header_row_idx, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="right" if col_idx == 4 else "left", vertical="center")

    # Freeze panes below header row
    ws.freeze_panes = "A5"

    total_amount = 0.0
    for item in items:
        amt = float(item.get("amount", 0.0))
        total_amount += amt
        row = [
            item.get("employee_number", ""),
            item.get("guard_name", ""),
            item.get("mpesa_number", ""),
            amt,
            item.get("reference_number", ""),
            item.get("status", "READY")
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.cell(row=curr_row, column=4).number_format = '#,##0.00'
        for col_i in range(1, len(headers) + 1):
            ws.cell(row=curr_row, column=col_i).border = thin_border

    # Summary Row
    summary_row = ["TOTAL", "", "", total_amount, "", ""]
    ws.append(summary_row)
    last_row = ws.max_row

    ws.cell(row=last_row, column=1).font = bold_font
    total_cell = ws.cell(row=last_row, column=4)
    total_cell.font = bold_font
    total_cell.number_format = '#,##0.00'

    double_bottom_border = Border(
        top=Side(style='thin', color='000000'),
        bottom=Side(style='double', color='000000')
    )
    for col_i in range(1, len(headers) + 1):
        ws.cell(row=last_row, column=col_i).border = double_bottom_border

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_statutory_payroll_template_excel(records_data: List[Dict[str, Any]], period_name: str = "") -> bytes:
    """
    Generates Kenya Official Statutory NHIF/SHIF Payroll Template (.xlsx) matching User Reference Image 1.
    Columns: PAYROLL NUMBER | FIRSTNAME | LASTNAME | IDENTITY TYPE | ID NO | KRA PIN | NHIF NO | CONTRIBUTION AMOUNT | PHONE
    Includes DataValidation dropdown on IDENTITY TYPE column: Refugee ID, National ID, Alien ID, Passport Number
    """
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    headers = [
        "PAYROLL NUMBER",
        "FIRSTNAME",
        "LASTNAME",
        "IDENTITY TYPE",
        "ID NO",
        "KRA PIN",
        "NHIF NO",
        "CONTRIBUTION AMOUNT",
        "PHONE"
    ]
    ws.append(headers)

    header_font = Font(name="Calibri", size=11, bold=True, color="000000")
    header_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='000000'),
        bottom=Side(style='thin', color='000000')
    )

    for col_i in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_i)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="right" if col_i == 8 else "left", vertical="center")

    # Add Data Validation for IDENTITY TYPE (Col D) matching Image 1
    dv = DataValidation(type="list", formula1='"Refugee ID,National ID,Alien ID,Passport Number"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("D2:D500")

    # Populate rows if records provided
    for rec in records_data:
        full_name = (rec.get("guard_name") or rec.get("full_name") or "").strip()
        name_parts = full_name.split() if full_name else []
        firstname = name_parts[0] if len(name_parts) > 0 else ""
        lastname = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

        amount = float(rec.get("shif_deduction") or rec.get("nhif_deduction") or rec.get("contribution_amount") or 0.0)

        row = [
            rec.get("employee_number") or rec.get("payroll_number") or "",
            firstname,
            lastname,
            rec.get("identity_type") or "National ID",
            rec.get("national_id") or rec.get("id_no") or "",
            rec.get("kra_pin") or "",
            rec.get("shif_number") or rec.get("nhif_no") or "",
            amount,
            rec.get("phone") or ""
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.cell(row=curr_row, column=8).number_format = '#,##0.00'
        for col_i in range(1, len(headers) + 1):
            ws.cell(row=curr_row, column=col_i).border = thin_border

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 5, 14)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_im_salary_batch_excel(
    items: List[Dict[str, Any]], 
    period_name: str, 
    execution_date: str = None, 
    account_to_debit: str = "01201982736450"
) -> bytes:
    """
    Generates Corporate I&M Bank Salary Batch Excel (.xlsx) matching User Reference Image 2.
    Header: Logo banner, Version V1.0.0, Salary Batch, Metadata grid (File Name, Account to Debit, Execution Date, Currency, Total Amount, No. of Records, Validate File button)
    Table Headers (Row 8): Employee Number | *Employee Name | Account Number | Bank Name or Bank Code | Amount | Payment Description (Max 50 character | Payment Mode | Branch Name or Code
    """
    # Strict fail-safe: exclude any employee whose salary is currently on hold
    items = [it for it in items if not it.get("is_on_hold") and it.get("status") != "ON_HOLD"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Template"

    brand_blue = "0B3056"
    btn_blue = "002060"
    table_header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    bold_title_font = Font(name="Calibri", size=16, bold=True, color=brand_blue)
    meta_label_font = Font(name="Calibri", size=9, bold=True, color="333333")
    meta_val_font = Font(name="Calibri", size=9, color="000000")
    table_header_font = Font(name="Calibri", size=10, bold=True, color="000000")

    thin_border = Border(
        left=Side(style='thin', color='B0C4DE'),
        right=Side(style='thin', color='B0C4DE'),
        top=Side(style='thin', color='B0C4DE'),
        bottom=Side(style='thin', color='B0C4DE')
    )
    meta_border = Border(
        left=Side(style='thin', color='808080'),
        right=Side(style='thin', color='808080'),
        top=Side(style='thin', color='808080'),
        bottom=Side(style='thin', color='808080')
    )

    # Title & Version matching Image 2
    ws["B2"] = "Version V1.0.0"
    ws["B2"].font = Font(name="Calibri", size=9, italic=True, color="666666")
    ws["B3"] = "Salary\nBatch"
    ws["B3"].font = bold_title_font
    ws["B3"].alignment = Alignment(wrap_text=True, vertical="center")

    total_amount = round(sum(float(it.get("amount", 0.0)) for it in items), 2)
    record_count = len(items)
    file_name = f"CorpSec_Salary_Batch_{period_name.replace(' ', '_')}"
    exec_date = execution_date or period_name

    meta_grid = [
        (2, "File Name", file_name, "Currency", "KES"),
        (3, "Account to Debit", account_to_debit, "Total Amount", total_amount),
        (4, "Execution Date", exec_date, "No. of Records", record_count),
        (5, "Who to Pay Charges", "OUR", None, None),
        (6, "Account to Pay Charges", account_to_debit, None, None),
    ]

    for row_idx, lbl1, val1, lbl2, val2 in meta_grid:
        ws.cell(row=row_idx, column=3, value=lbl1).font = meta_label_font
        c_val1 = ws.cell(row=row_idx, column=4, value=val1)
        c_val1.font = meta_val_font
        ws.cell(row=row_idx, column=3).border = meta_border
        c_val1.border = meta_border
        if lbl2 is not None:
            ws.cell(row=row_idx, column=6, value=lbl2).font = meta_label_font
            c_val2 = ws.cell(row=row_idx, column=7, value=val2)
            c_val2.font = meta_val_font
            ws.cell(row=row_idx, column=6).border = meta_border
            c_val2.border = meta_border
            if lbl2 == "Total Amount":
                c_val2.number_format = '#,##0.00'

    # Validate File Button (Row 5-6, Col F-G)
    ws.merge_cells("F5:G6")
    btn_cell = ws["F5"]
    btn_cell.value = "Validate File"
    btn_cell.fill = PatternFill(start_color=btn_blue, end_color=btn_blue, fill_type="solid")
    btn_cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    btn_cell.alignment = Alignment(horizontal="center", vertical="center")

    # Table Headers on Row 8 matching Image 2
    headers = [
        "Employee Number",
        "*Employee Name",
        "Account Number",
        "Bank Name or Bank Code",
        "Amount",
        "Payment Description (Max 50 character",
        "Payment Mode",
        "Branch Name or Code"
    ]
    for col_i, h in enumerate(headers, start=1):
        cell = ws.cell(row=8, column=col_i, value=h)
        cell.fill = table_header_fill
        cell.font = table_header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="right" if col_i == 5 else "left", vertical="center")

    ws.freeze_panes = "A9"

    for item in items:
        amt = float(item.get("amount", 0.0))
        row = [
            item.get("employee_number", ""),
            item.get("guard_name", ""),
            item.get("bank_account", ""),
            item.get("bank_name", ""),
            amt,
            f"{period_name} Salary",
            "EFT",
            item.get("branch_name", "Head Office")
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.cell(row=curr_row, column=5).number_format = '#,##0.00'
        for col_i in range(1, len(headers) + 1):
            ws.cell(row=curr_row, column=col_i).border = thin_border

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_im_mobile_money_excel(
    items: List[Dict[str, Any]], 
    period_name: str, 
    execution_date: str = None, 
    account_to_debit: str = "01201982736450"
) -> bytes:
    """
    Generates Corporate I&M Mobile Money (M-Pesa) Payments Excel (.xlsx) matching User Reference Image 3.
    Header: Logo banner, Version V1.0.0, Mobile Money Payments, Metadata grid (File Name, Account to Debit, Execution Date, Telco Name, Currency, Total Amount, No. of Records, Validate File button)
    Table Headers (Row 8): Employee Number | *Employee Name | Phone Number | Amount | Payment Description (Max 50 characters)
    """
    # Strict fail-safe: exclude any employee whose salary is currently on hold
    items = [it for it in items if not it.get("is_on_hold") and it.get("status") != "ON_HOLD"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Template"

    brand_blue = "0B3056"
    btn_blue = "002060"
    table_header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    bold_title_font = Font(name="Calibri", size=15, bold=True, color=brand_blue)
    meta_label_font = Font(name="Calibri", size=9, bold=True, color="333333")
    meta_val_font = Font(name="Calibri", size=9, color="000000")
    table_header_font = Font(name="Calibri", size=10, bold=True, color="000000")

    thin_border = Border(
        left=Side(style='thin', color='B0C4DE'),
        right=Side(style='thin', color='B0C4DE'),
        top=Side(style='thin', color='B0C4DE'),
        bottom=Side(style='thin', color='B0C4DE')
    )
    meta_border = Border(
        left=Side(style='thin', color='808080'),
        right=Side(style='thin', color='808080'),
        top=Side(style='thin', color='808080'),
        bottom=Side(style='thin', color='808080')
    )

    ws["B2"] = "Version V1.0.0"
    ws["B2"].font = Font(name="Calibri", size=9, italic=True, color="666666")
    ws["B3"] = "Mobile Money\nPayments"
    ws["B3"].font = bold_title_font
    ws["B3"].alignment = Alignment(wrap_text=True, vertical="center")

    ws["A6"] = "Enable Macros to Proceed"
    ws["A6"].font = Font(name="Calibri", size=9, bold=True, italic=True, color="C00000")

    total_amount = round(sum(float(it.get("amount", 0.0)) for it in items), 2)
    record_count = len(items)
    file_name = f"CorpSec_Mpesa_Batch_{period_name.replace(' ', '_')}"
    exec_date = execution_date or period_name

    meta_grid = [
        (2, "File Name", file_name, "Telco Name", "Mpesa"),
        (3, "Account to Debit", account_to_debit, "Currency", "KES"),
        (4, "Execution Date", exec_date, "Total Amount", total_amount),
        (5, "Account to Pay Charges", account_to_debit, "No. of Records", record_count),
    ]

    for row_idx, lbl1, val1, lbl2, val2 in meta_grid:
        ws.cell(row=row_idx, column=3, value=lbl1).font = meta_label_font
        c_val1 = ws.cell(row=row_idx, column=4, value=val1)
        c_val1.font = meta_val_font
        ws.cell(row=row_idx, column=3).border = meta_border
        c_val1.border = meta_border
        if lbl2 is not None:
            ws.cell(row=row_idx, column=5, value=lbl2).font = meta_label_font
            c_val2 = ws.cell(row=row_idx, column=6, value=val2)
            c_val2.font = meta_val_font
            ws.cell(row=row_idx, column=5).border = meta_border
            c_val2.border = meta_border
            if lbl2 == "Total Amount":
                c_val2.number_format = '#,##0.00'

    ws.merge_cells("E6:F6")
    btn_cell = ws["E6"]
    btn_cell.value = "Validate File"
    btn_cell.fill = PatternFill(start_color=btn_blue, end_color=btn_blue, fill_type="solid")
    btn_cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    btn_cell.alignment = Alignment(horizontal="center", vertical="center")

    headers = [
        "Employee Number",
        "*Employee Name",
        "Phone Number",
        "Amount",
        "Payment Description (Max 50 characters)"
    ]
    for col_i, h in enumerate(headers, start=1):
        cell = ws.cell(row=8, column=col_i, value=h)
        cell.fill = table_header_fill
        cell.font = table_header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="right" if col_i == 4 else "left", vertical="center")

    ws.freeze_panes = "A9"

    for item in items:
        amt = float(item.get("amount", 0.0))
        phone = item.get("mpesa_number") or item.get("phone") or item.get("account_number") or ""
        row = [
            item.get("employee_number", ""),
            item.get("guard_name", ""),
            phone,
            amt,
            f"{period_name} Salary"
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.cell(row=curr_row, column=4).number_format = '#,##0.00'
        for col_i in range(1, len(headers) + 1):
            ws.cell(row=curr_row, column=col_i).border = thin_border

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 16)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()

