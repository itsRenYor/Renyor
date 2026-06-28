"""Indian GST Tax Invoice PDF generator using reportlab."""
import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER


PRIMARY = colors.HexColor("#0A5C36")  # AITAX deep forest
MUTED = colors.HexColor("#6B7280")
BORDER = colors.HexColor("#E5E7EB")
BG = colors.HexColor("#F9FAFB")


def _fmt_inr(n: float) -> str:
    n = float(n or 0)
    sign = "-" if n < 0 else ""
    n = abs(n)
    s = f"{n:.2f}"
    int_part, dec = s.split(".")
    if len(int_part) <= 3:
        return f"{sign}₹{int_part}.{dec}"
    last3 = int_part[-3:]
    rest = int_part[:-3]
    rest = ",".join([rest[max(i-2, 0):i] for i in range(len(rest), 0, -2)][::-1])
    return f"{sign}₹{rest},{last3}.{dec}"


def _num_to_words(n: float) -> str:
    n = int(round(float(n)))
    if n == 0:
        return "Zero Rupees Only"
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def two(n):
        if n < 20: return ones[n]
        return tens[n // 10] + (" " + ones[n % 10] if n % 10 else "")

    def three(n):
        h, r = divmod(n, 100)
        out = []
        if h: out.append(ones[h] + " Hundred")
        if r: out.append(two(r))
        return " ".join(out)

    parts = []
    crore, n = divmod(n, 10000000)
    lakh, n = divmod(n, 100000)
    thousand, n = divmod(n, 1000)
    rest = n
    if crore: parts.append(two(crore) + " Crore")
    if lakh: parts.append(two(lakh) + " Lakh")
    if thousand: parts.append(two(thousand) + " Thousand")
    if rest: parts.append(three(rest))
    return " ".join(parts) + " Rupees Only"


def _is_interstate(seller_state: str, buyer_gstin: str) -> bool:
    """Approx: if seller state code != first 2 chars of buyer GSTIN, it's interstate (IGST)."""
    if not seller_state or not buyer_gstin or len(buyer_gstin) < 2:
        return False
    # Common Indian state codes
    state_code = {
        "Andhra Pradesh": "37", "Arunachal Pradesh": "12", "Assam": "18", "Bihar": "10",
        "Chhattisgarh": "22", "Delhi": "07", "Goa": "30", "Gujarat": "24",
        "Haryana": "06", "Himachal Pradesh": "02", "Jammu and Kashmir": "01",
        "Jharkhand": "20", "Karnataka": "29", "Kerala": "32", "Madhya Pradesh": "23",
        "Maharashtra": "27", "Manipur": "14", "Meghalaya": "17", "Mizoram": "15",
        "Nagaland": "13", "Odisha": "21", "Punjab": "03", "Rajasthan": "08",
        "Sikkim": "11", "Tamil Nadu": "33", "Telangana": "36", "Tripura": "16",
        "Uttar Pradesh": "09", "Uttarakhand": "05", "West Bengal": "19",
    }.get(seller_state)
    return bool(state_code) and state_code != buyer_gstin[:2]


def build_invoice_pdf(invoice: dict, company: dict) -> bytes:
    """Returns PDF bytes for a single invoice."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=12 * mm, bottomMargin=12 * mm,
        title=f"Invoice {invoice.get('invoice_number','')}",
    )

    styles = getSampleStyleSheet()
    h_title = ParagraphStyle("h_title", parent=styles["Normal"], fontName="Helvetica-Bold",
                             fontSize=18, textColor=PRIMARY, leading=22)
    label = ParagraphStyle("label", parent=styles["Normal"], fontSize=7.5,
                           textColor=MUTED, leading=9, alignment=TA_LEFT)
    value = ParagraphStyle("value", parent=styles["Normal"], fontSize=9.5, leading=12)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, leading=10, textColor=MUTED)
    big_right = ParagraphStyle("big_right", parent=styles["Normal"], fontName="Helvetica-Bold",
                               fontSize=14, alignment=TA_RIGHT, textColor=PRIMARY)
    bold = ParagraphStyle("bold", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9.5)

    invoice_type_label = {
        "tax_invoice": "TAX INVOICE",
        "retail_invoice": "RETAIL INVOICE",
        "quotation": "QUOTATION",
        "credit_note": "CREDIT NOTE",
        "pos": "POS BILL",
    }.get(invoice.get("invoice_type", "tax_invoice"), "INVOICE")

    elements = []

    # --- Header ---
    header_data = [[
        Paragraph(f"<b>{company.get('name','Company')}</b>", h_title),
        Paragraph(invoice_type_label, big_right),
    ], [
        Paragraph(
            f"{company.get('address','') or ''}<br/>"
            f"{company.get('city','')}, {company.get('state','')} {company.get('pincode','') or ''}<br/>"
            f"{('GSTIN: ' + company['gstin']) if company.get('gstin') else ''}"
            f"{(' · PAN: ' + company['pan']) if company.get('pan') else ''}<br/>"
            f"{('Phone: ' + company['phone']) if company.get('phone') else ''}"
            f"{(' · Email: ' + company['email']) if company.get('email') else ''}",
            small
        ),
        Paragraph(
            f"<b>#{invoice.get('invoice_number','')}</b><br/>"
            f"Date: {invoice.get('invoice_date','')}<br/>"
            f"{('Due: ' + invoice['due_date']) if invoice.get('due_date') else ''}",
            ParagraphStyle("hdr_r", parent=small, alignment=TA_RIGHT)
        ),
    ]]
    t = Table(header_data, colWidths=[110 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6 * mm))

    # --- Bill To ---
    bill_to_block = [
        [Paragraph("BILL TO", label)],
        [Paragraph(f"<b>{invoice.get('party_name','')}</b>", value)],
    ]
    if invoice.get("party_gstin"):
        bill_to_block.append([Paragraph(f"GSTIN: {invoice['party_gstin']}", small)])

    bt = Table(bill_to_block, colWidths=[180 * mm])
    bt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG),
        ("BOX", (0, 0), (-1, -1), 0.25, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(bt)
    elements.append(Spacer(1, 4 * mm))

    # --- Items table ---
    interstate = _is_interstate(company.get("state"), invoice.get("party_gstin"))
    if interstate:
        item_header = ["#", "Item / HSN", "Qty", "Rate", "Amount", "IGST", "Total"]
        col_widths = [10 * mm, 60 * mm, 16 * mm, 22 * mm, 26 * mm, 22 * mm, 26 * mm]
    else:
        item_header = ["#", "Item / HSN", "Qty", "Rate", "Amount", "CGST", "SGST", "Total"]
        col_widths = [9 * mm, 50 * mm, 13 * mm, 20 * mm, 24 * mm, 20 * mm, 20 * mm, 24 * mm]

    rows = [item_header]
    for i, it in enumerate(invoice.get("items", []), start=1):
        amount = it.get("amount", 0)
        gst_amt = it.get("gst_amount", 0)
        total = it.get("total", 0)
        item_cell = Paragraph(
            f"<b>{it.get('name','')}</b><br/>"
            f"<font size=7 color='#6B7280'>HSN: {it.get('hsn_code') or '—'} · GST {it.get('gst_rate',0)}%</font>",
            ParagraphStyle("itm", parent=value, leading=11)
        )
        qty = f"{it.get('quantity',0)} {it.get('unit','')}"
        if interstate:
            rows.append([str(i), item_cell, qty, _fmt_inr(it.get("rate", 0)),
                         _fmt_inr(amount), _fmt_inr(gst_amt), _fmt_inr(total)])
        else:
            half = gst_amt / 2.0
            rows.append([str(i), item_cell, qty, _fmt_inr(it.get("rate", 0)),
                         _fmt_inr(amount), _fmt_inr(half), _fmt_inr(half), _fmt_inr(total)])

    items_t = Table(rows, colWidths=col_widths, repeatRows=1)
    items_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 1), (-1, -1), 8.5),
        ("LINEBELOW", (0, 0), (-1, 0), 0.25, BORDER),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(items_t)
    elements.append(Spacer(1, 5 * mm))

    # --- Totals + amount in words ---
    grand = invoice.get("grand_total", 0)
    totals_rows = [
        ["Subtotal", _fmt_inr(invoice.get("subtotal", 0))],
    ]
    if interstate:
        totals_rows.append(["IGST", _fmt_inr(invoice.get("gst_total", 0))])
    else:
        half = invoice.get("gst_total", 0) / 2.0
        totals_rows.append(["CGST", _fmt_inr(half)])
        totals_rows.append(["SGST", _fmt_inr(half)])
    if invoice.get("discount_total"):
        totals_rows.append(["Discount", "- " + _fmt_inr(invoice.get("discount_total", 0))])
    if invoice.get("shipping"):
        totals_rows.append(["Shipping", _fmt_inr(invoice.get("shipping", 0))])
    totals_rows.append(["Grand Total", _fmt_inr(grand)])
    if invoice.get("paid_amount"):
        totals_rows.append(["Paid", _fmt_inr(invoice.get("paid_amount", 0))])
        totals_rows.append(["Balance Due", _fmt_inr(invoice.get("balance_due", 0))])

    totals_t = Table(totals_rows, colWidths=[40 * mm, 30 * mm])
    style = [
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BACKGROUND", (0, len(totals_rows) - (3 if invoice.get("paid_amount") else 1)), (-1, len(totals_rows) - (3 if invoice.get("paid_amount") else 1)), BG),
        ("FONTNAME", (0, len(totals_rows) - (3 if invoice.get("paid_amount") else 1)), (-1, len(totals_rows) - (3 if invoice.get("paid_amount") else 1)), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, len(totals_rows) - (3 if invoice.get("paid_amount") else 1)), (-1, len(totals_rows) - (3 if invoice.get("paid_amount") else 1)), PRIMARY),
        ("FONTSIZE", (0, len(totals_rows) - (3 if invoice.get("paid_amount") else 1)), (-1, len(totals_rows) - (3 if invoice.get("paid_amount") else 1)), 11),
    ]
    totals_t.setStyle(TableStyle(style))

    words_para = Paragraph(
        f"<b>Amount in words:</b><br/>{_num_to_words(grand)}",
        ParagraphStyle("words", parent=small, fontSize=9, leading=12)
    )
    bottom = Table([[words_para, totals_t]], colWidths=[110 * mm, 70 * mm])
    bottom.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(bottom)
    elements.append(Spacer(1, 8 * mm))

    # --- Notes & Terms ---
    if invoice.get("notes"):
        elements.append(Paragraph("<b>Notes</b>", bold))
        elements.append(Paragraph(invoice["notes"], small))
        elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph(
        "<b>Terms & Conditions</b><br/>"
        "1. Goods once sold will not be taken back.<br/>"
        "2. Interest @ 18% p.a. will be charged on overdue payments.<br/>"
        "3. Subject to local jurisdiction.",
        small
    ))
    elements.append(Spacer(1, 10 * mm))

    # --- Signature ---
    sig = Table(
        [[Paragraph(f"<b>For {company.get('name','')}</b><br/><br/><br/>Authorised Signatory", small)]],
        colWidths=[180 * mm],
    )
    sig.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
    elements.append(sig)

    elements.append(Spacer(1, 6 * mm))
    elements.append(Paragraph(
        "Generated by <b>AITAX</b> · aitax.in",
        ParagraphStyle("foot", parent=small, alignment=TA_CENTER, textColor=MUTED)
    ))

    doc.build(elements)
    buf.seek(0)
    return buf.read()
