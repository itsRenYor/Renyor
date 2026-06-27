"""Purchases: PO, Purchase Invoice, Return."""
from fastapi import APIRouter, HTTPException, Depends, Query
from db import db
from models import PurchaseIn, _id, _now
from auth import require_company
from routers.sales_router import _compute_totals

router = APIRouter(prefix="/api/purchases", tags=["purchases"])


PREFIX_BY_TYPE = {"po": "PO", "purchase_invoice": "PUR", "return": "PRT"}


async def _next_voucher(company_id: str, ptype: str) -> str:
    prefix = PREFIX_BY_TYPE.get(ptype, "PUR")
    count = await db.purchases.count_documents(
        {"company_id": company_id, "purchase_type": ptype}
    )
    return f"{prefix}-{(count + 1):05d}"


async def _apply_stock_for_purchase(cid: str, pid: str, items: list, sign: int):
    for it in items:
        prod_id = it.get("product_id")
        if not prod_id:
            continue
        delta = sign * it["quantity"]
        await db.products.update_one(
            {"id": prod_id, "company_id": cid}, {"$inc": {"current_stock": delta}}
        )
        await db.stock_movements.insert_one(
            {
                "id": _id(),
                "company_id": cid,
                "product_id": prod_id,
                "product_name": it["name"],
                "movement_type": "in" if sign > 0 else "out",
                "quantity": abs(delta),
                "reference_type": "purchase",
                "reference_id": pid,
                "notes": None,
                "created_at": _now(),
            }
        )


@router.get("")
async def list_purchases(
    purchase_type: str = Query(None),
    search: str = Query(""),
    ctx=Depends(require_company),
):
    _, cid = ctx
    q = {"company_id": cid}
    if purchase_type:
        q["purchase_type"] = purchase_type
    if search:
        q["$or"] = [
            {"voucher_number": {"$regex": search, "$options": "i"}},
            {"supplier_name": {"$regex": search, "$options": "i"}},
        ]
    items = await db.purchases.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.get("/{pid}")
async def get_purchase(pid: str, ctx=Depends(require_company)):
    _, cid = ctx
    p = await db.purchases.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    return p


@router.post("")
async def create_purchase(body: PurchaseIn, ctx=Depends(require_company)):
    user, cid = ctx
    items = [i.model_dump() for i in body.items]
    if not items:
        raise HTTPException(400, "At least one item required")
    subtotal, gst_total, grand = _compute_totals(items, 0.0, 0.0)
    pid = _id()
    voucher = await _next_voucher(cid, body.purchase_type)
    balance_due = grand - body.paid_amount
    status = "paid" if balance_due <= 0 else ("partial" if body.paid_amount > 0 else "open")

    doc = body.model_dump()
    doc["items"] = items
    doc.update(
        {
            "id": pid,
            "company_id": cid,
            "voucher_number": voucher,
            "subtotal": subtotal,
            "gst_total": gst_total,
            "grand_total": round(grand, 2),
            "balance_due": round(balance_due, 2),
            "status": status,
            "created_by": user["id"],
            "created_at": _now(),
        }
    )
    await db.purchases.insert_one(doc)

    if body.purchase_type == "purchase_invoice":
        await _apply_stock_for_purchase(cid, pid, items, sign=+1)
        if body.supplier_id and balance_due > 0:
            await db.parties.update_one(
                {"id": body.supplier_id, "company_id": cid},
                {"$inc": {"current_balance": balance_due}},
            )
    elif body.purchase_type == "return":
        await _apply_stock_for_purchase(cid, pid, items, sign=-1)

    doc.pop("_id", None)
    return doc


@router.delete("/{pid}")
async def delete_purchase(pid: str, ctx=Depends(require_company)):
    _, cid = ctx
    p = await db.purchases.find_one({"id": pid, "company_id": cid})
    if not p:
        raise HTTPException(404, "Not found")
    if p["purchase_type"] == "purchase_invoice":
        await _apply_stock_for_purchase(cid, pid, p["items"], sign=-1)
    elif p["purchase_type"] == "return":
        await _apply_stock_for_purchase(cid, pid, p["items"], sign=+1)
    await db.purchases.delete_one({"id": pid, "company_id": cid})
    return {"ok": True}
