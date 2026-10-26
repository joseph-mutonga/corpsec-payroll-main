import io
from typing import List, Dict, Any
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


def generate_bank_schedule_excel(items: List[Dict[str, Any]], period_name: str) -> bytes:
    """
    Generates CorpSec Bank Payment Schedule formatted Excel workbook matching Screen 14.
    Approved Columns: Guard ID | Full Name | Bank Name | Account Number | Net Amount (KES) | Reference | Status
    """
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


def generate_mpesa_schedule_excel(items: List[Dict[str, Any]], period_name: str) -> bytes:
    """
    Generates CorpSec M-Pesa Payment Schedule formatted Excel workbook matching Screen 15.
    Approved Columns: Guard ID | Full Name | Phone Number | Net Amount (KES) | Reference | Status
    """
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
