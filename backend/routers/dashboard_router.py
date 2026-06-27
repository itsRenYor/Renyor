"""Dashboard KPIs."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from db import db
from auth import require_company

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


@router.get("/kpis")
async def kpis(ctx=Depends(require_company)):
    _, cid = ctx
    today = _today_iso()

    # Sales today
    sales_today_cur = db.invoices.aggregate(
        [
            {
                "$match": {
                    "company_id": cid,
                    "invoice_date": today,
                    "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]},
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$grand_total"}, "count": {"$sum": 1}}},
        ]
    )
    s_today = await sales_today_cur.to_list(1)
    sales_today = s_today[0]["total"] if s_today else 0
    sales_today_count = s_today[0]["count"] if s_today else 0

    # Receipts today (payment_mode != credit, paid_amount today)
    receipts_cur = db.invoices.aggregate(
        [
            {"$match": {"company_id": cid, "invoice_date": today}},
            {"$group": {"_id": None, "total": {"$sum": "$paid_amount"}}},
        ]
    )
    r = await receipts_cur.to_list(1)
    receipts_today = r[0]["total"] if r else 0

    # Outstanding receivables
    recv_cur = db.invoices.aggregate(
        [
            {
                "$match": {
                    "company_id": cid,
                    "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]},
                    "balance_due": {"$gt": 0},
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$balance_due"}}},
        ]
    )
    rv = await recv_cur.to_list(1)
    receivables = rv[0]["total"] if rv else 0

    # Outstanding payables
    pay_cur = db.purchases.aggregate(
        [
            {
                "$match": {
                    "company_id": cid,
                    "purchase_type": "purchase_invoice",
                    "balance_due": {"$gt": 0},
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$balance_due"}}},
        ]
    )
    p = await pay_cur.to_list(1)
    payables = p[0]["total"] if p else 0

    # Inventory value (sum of current_stock * purchase_price)
    inv_cur = db.products.aggregate(
        [
            {"$match": {"company_id": cid}},
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": {"$multiply": ["$current_stock", "$purchase_price"]}},
                }
            },
        ]
    )
    iv = await inv_cur.to_list(1)
    inventory_value = iv[0]["total"] if iv else 0

    # Low stock count
    low_stock = await db.products.count_documents(
        {"company_id": cid, "$expr": {"$lt": ["$current_stock", "$min_stock"]}}
    )

    # Total sales (lifetime) & total expenses
    all_sales_cur = db.invoices.aggregate(
        [
            {
                "$match": {
                    "company_id": cid,
                    "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]},
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$grand_total"}}},
        ]
    )
    a_s = await all_sales_cur.to_list(1)
    total_sales = a_s[0]["total"] if a_s else 0

    all_pur_cur = db.purchases.aggregate(
        [
            {"$match": {"company_id": cid, "purchase_type": "purchase_invoice"}},
            {"$group": {"_id": None, "total": {"$sum": "$grand_total"}}},
        ]
    )
    a_p = await all_pur_cur.to_list(1)
    total_purchases = a_p[0]["total"] if a_p else 0

    profit = total_sales - total_purchases

    # Counts
    customers_count = await db.parties.count_documents(
        {"company_id": cid, "party_type": "customer"}
    )
    suppliers_count = await db.parties.count_documents(
        {"company_id": cid, "party_type": "supplier"}
    )
    products_count = await db.products.count_documents({"company_id": cid})

    return {
        "sales_today": round(sales_today, 2),
        "sales_today_count": sales_today_count,
        "receipts_today": round(receipts_today, 2),
        "receivables": round(receivables, 2),
        "payables": round(payables, 2),
        "inventory_value": round(inventory_value, 2),
        "low_stock_count": low_stock,
        "total_sales": round(total_sales, 2),
        "total_purchases": round(total_purchases, 2),
        "profit": round(profit, 2),
        "customers_count": customers_count,
        "suppliers_count": suppliers_count,
        "products_count": products_count,
    }


@router.get("/revenue-trend")
async def revenue_trend(days: int = 30, ctx=Depends(require_company)):
    """Daily revenue for last N days."""
    _, cid = ctx
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

    cur = db.invoices.aggregate(
        [
            {
                "$match": {
                    "company_id": cid,
                    "invoice_date": {"$gte": cutoff},
                    "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]},
                }
            },
            {
                "$group": {
                    "_id": "$invoice_date",
                    "revenue": {"$sum": "$grand_total"},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    )
    rows = await cur.to_list(days)
    return [{"date": r["_id"], "revenue": round(r["revenue"], 2)} for r in rows]


@router.get("/top-customers")
async def top_customers(limit: int = 5, ctx=Depends(require_company)):
    _, cid = ctx
    cur = db.invoices.aggregate(
        [
            {
                "$match": {
                    "company_id": cid,
                    "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]},
                    "party_id": {"$ne": None},
                }
            },
            {
                "$group": {
                    "_id": "$party_name",
                    "total": {"$sum": "$grand_total"},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"total": -1}},
            {"$limit": limit},
        ]
    )
    rows = await cur.to_list(limit)
    return [
        {"name": r["_id"], "total": round(r["total"], 2), "invoices": r["count"]} for r in rows
    ]
