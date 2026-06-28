"""GST reports — GSTR-1 (outward) and GSTR-3B (summary)."""
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from db import db
from auth import require_company

router = APIRouter(prefix="/api/gst", tags=["gst"])


def _is_intra(buyer_gstin: str, seller_state: str) -> bool:
    state_code_map = {
        "Andhra Pradesh": "37", "Arunachal Pradesh": "12", "Assam": "18", "Bihar": "10",
        "Chhattisgarh": "22", "Delhi": "07", "Goa": "30", "Gujarat": "24",
        "Haryana": "06", "Himachal Pradesh": "02", "Jammu and Kashmir": "01",
        "Jharkhand": "20", "Karnataka": "29", "Kerala": "32", "Madhya Pradesh": "23",
        "Maharashtra": "27", "Manipur": "14", "Meghalaya": "17", "Mizoram": "15",
        "Nagaland": "13", "Odisha": "21", "Punjab": "03", "Rajasthan": "08",
        "Sikkim": "11", "Tamil Nadu": "33", "Telangana": "36", "Tripura": "16",
        "Uttar Pradesh": "09", "Uttarakhand": "05", "West Bengal": "19",
    }
    code = state_code_map.get(seller_state or "", "")
    if not code or not buyer_gstin or len(buyer_gstin) < 2:
        return True  # default to intra-state (CGST+SGST) if can't determine
    return code == buyer_gstin[:2]


async def _company(cid: str) -> dict:
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    return c or {}


@router.get("/gstr1")
async def gstr1(month: str = Query(..., description="YYYY-MM"), ctx=Depends(require_company)):
    """GSTR-1 outward supplies for a given month."""
    _, cid = ctx
    company = await _company(cid)
    seller_state = company.get("state", "")

    start = f"{month}-01"
    end = f"{month}-31"
    cur = db.invoices.find(
        {
            "company_id": cid,
            "invoice_date": {"$gte": start, "$lte": end},
            "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos", "credit_note"]},
        },
        {"_id": 0},
    )
    invoices = await cur.to_list(5000)

    b2b = []
    b2c = []
    hsn_summary = defaultdict(lambda: {"hsn_code": "", "description": "", "uqc": "PCS", "total_qty": 0, "total_value": 0, "taxable_value": 0, "igst": 0, "cgst": 0, "sgst": 0})

    total_taxable = 0
    total_igst = 0
    total_cgst = 0
    total_sgst = 0

    for inv in invoices:
        if inv.get("invoice_type") == "credit_note":
            sign = -1
        else:
            sign = 1
        intra = _is_intra(inv.get("party_gstin"), seller_state)
        taxable = inv.get("subtotal", 0) * sign
        gst_total = inv.get("gst_total", 0) * sign
        if intra:
            cgst = gst_total / 2.0; sgst = gst_total / 2.0; igst = 0
        else:
            cgst = 0; sgst = 0; igst = gst_total

        total_taxable += taxable
        total_cgst += cgst; total_sgst += sgst; total_igst += igst

        entry = {
            "invoice_number": inv.get("invoice_number"),
            "invoice_date": inv.get("invoice_date"),
            "party_name": inv.get("party_name"),
            "party_gstin": inv.get("party_gstin"),
            "place_of_supply": inv.get("party_gstin", "")[:2] if inv.get("party_gstin") else "",
            "invoice_value": round(inv.get("grand_total", 0) * sign, 2),
            "taxable_value": round(taxable, 2),
            "igst": round(igst, 2),
            "cgst": round(cgst, 2),
            "sgst": round(sgst, 2),
            "invoice_type": inv.get("invoice_type"),
        }
        if inv.get("party_gstin"):
            b2b.append(entry)
        else:
            b2c.append(entry)

        # HSN summary
        for it in inv.get("items", []):
            key = (it.get("hsn_code") or "UNCLASSIFIED", it.get("gst_rate", 0))
            row = hsn_summary[key]
            row["hsn_code"] = it.get("hsn_code") or "UNCLASSIFIED"
            row["description"] = it.get("name", "")
            row["uqc"] = it.get("unit", "PCS")
            row["total_qty"] += it.get("quantity", 0) * sign
            row["total_value"] += it.get("total", 0) * sign
            row["taxable_value"] += it.get("amount", 0) * sign
            g = it.get("gst_amount", 0) * sign
            if intra:
                row["cgst"] += g / 2.0
                row["sgst"] += g / 2.0
            else:
                row["igst"] += g

    return {
        "report": "GSTR-1",
        "period": month,
        "company": {"name": company.get("name"), "gstin": company.get("gstin"), "state": seller_state},
        "summary": {
            "total_invoices": len(invoices),
            "b2b_count": len(b2b),
            "b2c_count": len(b2c),
            "total_taxable_value": round(total_taxable, 2),
            "total_igst": round(total_igst, 2),
            "total_cgst": round(total_cgst, 2),
            "total_sgst": round(total_sgst, 2),
            "total_tax": round(total_igst + total_cgst + total_sgst, 2),
        },
        "b2b": b2b,
        "b2c": b2c,
        "hsn_summary": [
            {**v, "total_qty": round(v["total_qty"], 2),
             "total_value": round(v["total_value"], 2),
             "taxable_value": round(v["taxable_value"], 2),
             "igst": round(v["igst"], 2), "cgst": round(v["cgst"], 2), "sgst": round(v["sgst"], 2)}
            for v in hsn_summary.values()
        ],
    }


@router.get("/gstr3b")
async def gstr3b(month: str = Query(..., description="YYYY-MM"), ctx=Depends(require_company)):
    """GSTR-3B simplified summary."""
    _, cid = ctx
    company = await _company(cid)
    seller_state = company.get("state", "")
    start = f"{month}-01"; end = f"{month}-31"

    # Outward
    invs = await db.invoices.find({
        "company_id": cid,
        "invoice_date": {"$gte": start, "$lte": end},
        "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos", "credit_note"]},
    }, {"_id": 0}).to_list(5000)
    out_taxable = 0; out_igst = 0; out_cgst = 0; out_sgst = 0
    for inv in invs:
        sign = -1 if inv.get("invoice_type") == "credit_note" else 1
        intra = _is_intra(inv.get("party_gstin"), seller_state)
        out_taxable += inv.get("subtotal", 0) * sign
        gst = inv.get("gst_total", 0) * sign
        if intra: out_cgst += gst/2; out_sgst += gst/2
        else: out_igst += gst

    # Inward (ITC)
    purs = await db.purchases.find({
        "company_id": cid,
        "bill_date": {"$gte": start, "$lte": end},
        "purchase_type": "purchase_invoice",
    }, {"_id": 0}).to_list(5000)
    in_taxable = 0; in_igst = 0; in_cgst = 0; in_sgst = 0
    for p in purs:
        intra = _is_intra(p.get("supplier_gstin"), seller_state)
        in_taxable += p.get("subtotal", 0)
        gst = p.get("gst_total", 0)
        if intra: in_cgst += gst/2; in_sgst += gst/2
        else: in_igst += gst

    net_igst = round(out_igst - in_igst, 2)
    net_cgst = round(out_cgst - in_cgst, 2)
    net_sgst = round(out_sgst - in_sgst, 2)

    return {
        "report": "GSTR-3B",
        "period": month,
        "company": {"name": company.get("name"), "gstin": company.get("gstin"), "state": seller_state},
        "section_3_1_outward_supplies": {
            "taxable_value": round(out_taxable, 2),
            "igst": round(out_igst, 2),
            "cgst": round(out_cgst, 2),
            "sgst": round(out_sgst, 2),
        },
        "section_4_eligible_itc": {
            "taxable_value": round(in_taxable, 2),
            "igst": round(in_igst, 2),
            "cgst": round(in_cgst, 2),
            "sgst": round(in_sgst, 2),
        },
        "net_tax_payable": {
            "igst": max(net_igst, 0),
            "cgst": max(net_cgst, 0),
            "sgst": max(net_sgst, 0),
            "total": round(max(net_igst, 0) + max(net_cgst, 0) + max(net_sgst, 0), 2),
        },
    }
