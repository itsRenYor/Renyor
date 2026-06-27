"""Sales: Invoices, Quotations, Credit Notes, POS."""
from fastapi import APIRouter, HTTPException, Depends, Query
from db import db
from models import InvoiceIn, _id, _now
from auth import require_company

router = APIRouter(prefix="/api/sales", tags=["sales"])


PREFIX_BY_TYPE = {
    "quotation": "QT",
    "tax_invoice": "INV",
    "retail_invoice": "RET",
    "credit_note": "CN",
    "pos": "POS",
}


async def _next_invoice_number(company_id: str, inv_type: str) -> str:
    prefix = PREFIX_BY_TYPE.get(inv_type, "INV")
    count = await db.invoices.count_documents(
        {"company_id": company_id, "invoice_type": inv_type}
    )
    return f"{prefix}-{(count + 1):05d}"


def _compute_totals(items: list, discount_total: float, shipping: float):
    subtotal = 0.0
    gst_total = 0.0
    for it in items:
        line_amount = it["quantity"] * it["rate"]
        disc = line_amount * (it.get("discount_pct", 0) / 100.0)
        net = line_amount - disc
        gst = net * (it.get("gst_rate", 0) / 100.0)
        it["amount"] = round(net, 2)
        it["gst_amount"] = round(gst, 2)
        it["total"] = round(net + gst, 2)
        subtotal += net
        gst_total += gst
    grand = subtotal + gst_total - discount_total + shipping
    return round(subtotal, 2), round(gst_total, 2), round(grand, 2)


async def _apply_stock_for_invoice(company_id: str, invoice_id: str, items: list, sign: int):
    """sign = -1 for sale (out), +1 for credit note (in/return)."""
    for it in items:
        pid = it.get("product_id")
        if not pid:
            continue
        delta = sign * it["quantity"]
        await db.products.update_one(
            {"id": pid, "company_id": company_id}, {"$inc": {"current_stock": delta}}
        )
        await db.stock_movements.insert_one(
            {
                "id": _id(),
                "company_id": company_id,
                "product_id": pid,
                "product_name": it["name"],
                "movement_type": "out" if sign < 0 else "in",
                "quantity": abs(delta),
                "reference_type": "invoice",
                "reference_id": invoice_id,
                "notes": None,
                "created_at": _now(),
            }
        )


@router.get("")
async def list_invoices(
    invoice_type: str = Query(None),
    status: str = Query(None),
    search: str = Query(""),
    ctx=Depends(require_company),
):
    _, cid = ctx
    q = {"company_id": cid}
    if invoice_type:
        q["invoice_type"] = invoice_type
    if status:
        q["status"] = status
    if search:
        q["$or"] = [
            {"invoice_number": {"$regex": search, "$options": "i"}},
            {"party_name": {"$regex": search, "$options": "i"}},
        ]
    items = await db.invoices.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.get("/{iid}")
async def get_invoice(iid: str, ctx=Depends(require_company)):
    _, cid = ctx
    inv = await db.invoices.find_one({"id": iid, "company_id": cid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Not found")
    return inv


@router.post("")
async def create_invoice(body: InvoiceIn, ctx=Depends(require_company)):
    user, cid = ctx
    items = [i.model_dump() for i in body.items]
    if not items:
        raise HTTPException(400, "At least one item required")
    subtotal, gst_total, grand = _compute_totals(items, body.discount_total, body.shipping)

    iid = _id()
    inv_num = await _next_invoice_number(cid, body.invoice_type)
    balance_due = grand - body.paid_amount
    status = "paid" if balance_due <= 0 else ("partial" if body.paid_amount > 0 else "sent")
    if body.invoice_type == "quotation":
        status = "draft"

    doc = body.model_dump()
    doc["items"] = items
    doc.update(
        {
            "id": iid,
            "company_id": cid,
            "invoice_number": inv_num,
            "subtotal": subtotal,
            "gst_total": gst_total,
            "grand_total": round(grand, 2),
            "balance_due": round(balance_due, 2),
            "status": status,
            "created_by": user["id"],
            "created_at": _now(),
        }
    )
    await db.invoices.insert_one(doc)

    # Update party balance & stock for actual invoices (not quotations)
    if body.invoice_type in ("tax_invoice", "retail_invoice", "pos"):
        await _apply_stock_for_invoice(cid, iid, items, sign=-1)
        if body.party_id and balance_due > 0:
            await db.parties.update_one(
                {"id": body.party_id, "company_id": cid},
                {"$inc": {"current_balance": balance_due}},
            )
    elif body.invoice_type == "credit_note":
        await _apply_stock_for_invoice(cid, iid, items, sign=+1)
        if body.party_id:
            await db.parties.update_one(
                {"id": body.party_id, "company_id": cid},
                {"$inc": {"current_balance": -grand}},
            )

    doc.pop("_id", None)
    return doc


@router.delete("/{iid}")
async def delete_invoice(iid: str, ctx=Depends(require_company)):
    _, cid = ctx
    inv = await db.invoices.find_one({"id": iid, "company_id": cid})
    if not inv:
        raise HTTPException(404, "Not found")
    # reverse stock if applicable
    if inv["invoice_type"] in ("tax_invoice", "retail_invoice", "pos"):
        await _apply_stock_for_invoice(cid, iid, inv["items"], sign=+1)
    elif inv["invoice_type"] == "credit_note":
        await _apply_stock_for_invoice(cid, iid, inv["items"], sign=-1)
    await db.invoices.delete_one({"id": iid, "company_id": cid})
    return {"ok": True}


@router.post("/{iid}/record-payment")
async def record_payment(iid: str, amount: float, mode: str = "cash", ctx=Depends(require_company)):
    _, cid = ctx
    inv = await db.invoices.find_one({"id": iid, "company_id": cid})
    if not inv:
        raise HTTPException(404, "Not found")
    paid = inv.get("paid_amount", 0) + amount
    balance = inv["grand_total"] - paid
    status = "paid" if balance <= 0 else "partial"
    await db.invoices.update_one(
        {"id": iid},
        {"$set": {"paid_amount": paid, "balance_due": round(balance, 2), "status": status}},
    )
    if inv.get("party_id"):
        await db.parties.update_one(
            {"id": inv["party_id"]}, {"$inc": {"current_balance": -amount}}
        )
    await db.payments.insert_one(
        {
            "id": _id(),
            "company_id": cid,
            "invoice_id": iid,
            "party_id": inv.get("party_id"),
            "amount": amount,
            "mode": mode,
            "created_at": _now(),
        }
    )
    return {"ok": True, "balance_due": round(balance, 2), "status": status}
