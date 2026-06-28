"""Accounting engine: P&L, Balance Sheet, Trial Balance, General Ledger, Expenses.

Built as an aggregation layer over existing invoices/purchases/payments + a new
expenses collection. Avoids a separate ledger_entries table — derives all reports
from source documents. This keeps the system simple while delivering the
required financial statements.
"""
from datetime import datetime, timezone
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from db import db
from auth import require_company
from models import _id, _now

router = APIRouter(prefix="/api/accounting", tags=["accounting"])


# ===================== EXPENSES =====================
class ExpenseIn(BaseModel):
    category: str = Field(..., description="Rent, Salary, Utilities, Travel, etc.")
    description: str = ""
    amount: float
    expense_date: str  # YYYY-MM-DD
    payment_mode: str = "cash"  # cash|bank|upi
    vendor: str = ""
    bill_number: str = ""


@router.get("/expenses")
async def list_expenses(ctx=Depends(require_company)):
    _, cid = ctx
    items = await db.expenses.find({"company_id": cid}, {"_id": 0}).sort("expense_date", -1).to_list(500)
    return items


@router.post("/expenses")
async def create_expense(body: ExpenseIn, ctx=Depends(require_company)):
    _, cid = ctx
    doc = body.model_dump()
    doc.update({"id": _id(), "company_id": cid, "created_at": _now()})
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/expenses/{eid}")
async def delete_expense(eid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.expenses.delete_one({"id": eid, "company_id": cid})
    return {"ok": True}


# ===================== REPORT HELPERS =====================
def _date_filter(start: str = None, end: str = None, field: str = "invoice_date"):
    q = {}
    if start:
        q.setdefault(field, {})["$gte"] = start
    if end:
        q.setdefault(field, {})["$lte"] = end
    return q


async def _sum(coll, match, field):
    cur = coll.aggregate([{"$match": match}, {"$group": {"_id": None, "t": {"$sum": f"${field}"}}}])
    rows = await cur.to_list(1)
    return rows[0]["t"] if rows else 0


# ===================== P&L =====================
@router.get("/profit-loss")
async def profit_loss(start: str = Query(None), end: str = Query(None), ctx=Depends(require_company)):
    _, cid = ctx
    inv_q = {"company_id": cid, "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]}}
    inv_q.update(_date_filter(start, end, "invoice_date"))
    cn_q = {"company_id": cid, "invoice_type": "credit_note"}
    cn_q.update(_date_filter(start, end, "invoice_date"))

    pur_q = {"company_id": cid, "purchase_type": "purchase_invoice"}
    pur_q.update(_date_filter(start, end, "bill_date"))

    exp_q = {"company_id": cid}
    exp_q.update(_date_filter(start, end, "expense_date"))

    gross_sales = await _sum(db.invoices, inv_q, "subtotal")
    sales_returns = await _sum(db.invoices, cn_q, "subtotal")
    net_sales = gross_sales - sales_returns

    gross_purchases = await _sum(db.purchases, pur_q, "subtotal")

    # Expense breakdown by category
    exp_cur = db.expenses.aggregate([
        {"$match": exp_q},
        {"$group": {"_id": "$category", "amount": {"$sum": "$amount"}}},
        {"$sort": {"amount": -1}},
    ])
    expense_rows = [{"category": r["_id"] or "Uncategorized", "amount": round(r["amount"], 2)} async for r in exp_cur]
    total_expenses = sum(r["amount"] for r in expense_rows)

    gross_profit = net_sales - gross_purchases
    net_profit = gross_profit - total_expenses

    return {
        "period": {"start": start, "end": end},
        "income": {
            "gross_sales": round(gross_sales, 2),
            "sales_returns": round(sales_returns, 2),
            "net_sales": round(net_sales, 2),
        },
        "cost_of_goods": {
            "purchases": round(gross_purchases, 2),
        },
        "gross_profit": round(gross_profit, 2),
        "expenses": expense_rows,
        "total_expenses": round(total_expenses, 2),
        "net_profit": round(net_profit, 2),
    }


# ===================== Balance Sheet =====================
@router.get("/balance-sheet")
async def balance_sheet(as_on: str = Query(None), ctx=Depends(require_company)):
    """Balance Sheet 'as on' a date (defaults to today)."""
    _, cid = ctx
    if not as_on:
        as_on = datetime.now(timezone.utc).date().isoformat()

    # Assets
    inventory_cur = db.products.aggregate([
        {"$match": {"company_id": cid}},
        {"$group": {"_id": None, "t": {"$sum": {"$multiply": ["$current_stock", "$purchase_price"]}}}},
    ])
    iv = await inventory_cur.to_list(1)
    inventory = iv[0]["t"] if iv else 0

    # Sundry Debtors = sum of positive party balances (customers)
    debtors_cur = db.parties.aggregate([
        {"$match": {"company_id": cid, "party_type": "customer", "current_balance": {"$gt": 0}}},
        {"$group": {"_id": None, "t": {"$sum": "$current_balance"}}},
    ])
    dr = await debtors_cur.to_list(1)
    debtors = dr[0]["t"] if dr else 0

    # Sundry Creditors = sum of positive party balances (suppliers)
    creditors_cur = db.parties.aggregate([
        {"$match": {"company_id": cid, "party_type": "supplier", "current_balance": {"$gt": 0}}},
        {"$group": {"_id": None, "t": {"$sum": "$current_balance"}}},
    ])
    cr = await creditors_cur.to_list(1)
    creditors = cr[0]["t"] if cr else 0

    # GST Liability (output - input)
    gst_out = await _sum(db.invoices, {"company_id": cid, "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]}}, "gst_total")
    gst_in = await _sum(db.purchases, {"company_id": cid, "purchase_type": "purchase_invoice"}, "gst_total")
    gst_payable = max(gst_out - gst_in, 0)

    # Cash & Bank — derived from net (paid_amount on invoices - paid_amount on purchases - expenses)
    cash_in = await _sum(db.invoices, {"company_id": cid, "payment_mode": {"$in": ["cash", "upi", "bank"]}}, "paid_amount")
    cash_out_pur = await _sum(db.purchases, {"company_id": cid, "payment_mode": {"$in": ["cash", "upi", "bank"]}}, "paid_amount")
    cash_out_exp = await _sum(db.expenses, {"company_id": cid, "payment_mode": {"$in": ["cash", "upi", "bank"]}}, "amount")
    cash_and_bank = cash_in - cash_out_pur - cash_out_exp

    total_assets = inventory + debtors + cash_and_bank

    # Liabilities
    total_liabilities = creditors + gst_payable

    # Equity is plug — Total Assets - Total Liabilities (book value)
    capital_and_reserves = total_assets - total_liabilities

    return {
        "as_on": as_on,
        "assets": {
            "current_assets": {
                "cash_and_bank": round(cash_and_bank, 2),
                "sundry_debtors": round(debtors, 2),
                "inventory": round(inventory, 2),
            },
            "total_assets": round(total_assets, 2),
        },
        "liabilities": {
            "current_liabilities": {
                "sundry_creditors": round(creditors, 2),
                "gst_payable": round(gst_payable, 2),
            },
            "total_liabilities": round(total_liabilities, 2),
        },
        "equity": {
            "capital_and_reserves": round(capital_and_reserves, 2),
        },
        "totals_match": abs(total_assets - (total_liabilities + capital_and_reserves)) < 0.01,
    }


# ===================== Trial Balance =====================
@router.get("/trial-balance")
async def trial_balance(ctx=Depends(require_company)):
    _, cid = ctx
    # Build summary balances for system accounts
    accounts = []

    # Sales (credit)
    sales = await _sum(db.invoices, {"company_id": cid, "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]}}, "subtotal")
    accounts.append({"account": "Sales", "type": "income", "debit": 0, "credit": sales})

    # Sales Returns (debit)
    returns = await _sum(db.invoices, {"company_id": cid, "invoice_type": "credit_note"}, "subtotal")
    if returns:
        accounts.append({"account": "Sales Returns", "type": "income", "debit": returns, "credit": 0})

    # Purchases (debit)
    purchases = await _sum(db.purchases, {"company_id": cid, "purchase_type": "purchase_invoice"}, "subtotal")
    accounts.append({"account": "Purchases", "type": "expense", "debit": purchases, "credit": 0})

    # Output GST (credit)
    gst_out = await _sum(db.invoices, {"company_id": cid, "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]}}, "gst_total")
    accounts.append({"account": "Output GST", "type": "liability", "debit": 0, "credit": gst_out})

    # Input GST (debit)
    gst_in = await _sum(db.purchases, {"company_id": cid, "purchase_type": "purchase_invoice"}, "gst_total")
    accounts.append({"account": "Input GST", "type": "asset", "debit": gst_in, "credit": 0})

    # Expense categories
    exp_cur = db.expenses.aggregate([
        {"$match": {"company_id": cid}},
        {"$group": {"_id": "$category", "amount": {"$sum": "$amount"}}},
    ])
    async for r in exp_cur:
        accounts.append({"account": r["_id"] or "Misc Expenses", "type": "expense", "debit": round(r["amount"], 2), "credit": 0})

    # Sundry Debtors (asset, debit)
    debtors_cur = db.parties.aggregate([
        {"$match": {"company_id": cid, "party_type": "customer", "current_balance": {"$ne": 0}}},
        {"$group": {"_id": None, "t": {"$sum": "$current_balance"}}},
    ])
    dr = await debtors_cur.to_list(1)
    if dr and dr[0]["t"] > 0:
        accounts.append({"account": "Sundry Debtors", "type": "asset", "debit": round(dr[0]["t"], 2), "credit": 0})

    # Sundry Creditors (liability, credit)
    cred_cur = db.parties.aggregate([
        {"$match": {"company_id": cid, "party_type": "supplier", "current_balance": {"$ne": 0}}},
        {"$group": {"_id": None, "t": {"$sum": "$current_balance"}}},
    ])
    cr = await cred_cur.to_list(1)
    if cr and cr[0]["t"] > 0:
        accounts.append({"account": "Sundry Creditors", "type": "liability", "debit": 0, "credit": round(cr[0]["t"], 2)})

    total_debit = sum(a["debit"] for a in accounts)
    total_credit = sum(a["credit"] for a in accounts)

    return {
        "accounts": [{"account": a["account"], "type": a["type"],
                      "debit": round(a["debit"], 2), "credit": round(a["credit"], 2)} for a in accounts],
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "difference": round(total_debit - total_credit, 2),
    }


# ===================== General Ledger (per party) =====================
@router.get("/ledger/party/{party_id}")
async def party_ledger(party_id: str, ctx=Depends(require_company)):
    _, cid = ctx
    party = await db.parties.find_one({"id": party_id, "company_id": cid}, {"_id": 0})
    if not party:
        raise HTTPException(404, "Party not found")

    entries = []
    # Invoices
    if party["party_type"] == "customer":
        async for inv in db.invoices.find({"company_id": cid, "party_id": party_id}, {"_id": 0}):
            sign = -1 if inv["invoice_type"] == "credit_note" else 1
            entries.append({
                "date": inv["invoice_date"],
                "reference": inv["invoice_number"],
                "type": inv["invoice_type"],
                "particulars": "Sale" if sign > 0 else "Sales Return",
                "debit": inv["grand_total"] if sign > 0 else 0,
                "credit": inv["grand_total"] if sign < 0 else 0,
            })
        # Payments received reduce the debit
        async for p in db.payments.find({"company_id": cid, "party_id": party_id}, {"_id": 0}):
            entries.append({
                "date": p["created_at"][:10],
                "reference": p["invoice_id"][:8],
                "type": "payment",
                "particulars": f"Payment ({p['mode']})",
                "debit": 0, "credit": p["amount"],
            })
    else:  # supplier
        async for pur in db.purchases.find({"company_id": cid, "supplier_id": party_id}, {"_id": 0}):
            entries.append({
                "date": pur["bill_date"],
                "reference": pur["voucher_number"],
                "type": pur["purchase_type"],
                "particulars": "Purchase",
                "debit": 0,
                "credit": pur["grand_total"],
            })

    entries.sort(key=lambda x: x["date"])
    # running balance
    bal = party.get("opening_balance", 0)
    out = []
    for e in entries:
        bal += e["debit"] - e["credit"]
        out.append({**e, "balance": round(bal, 2)})

    return {
        "party": {"id": party["id"], "name": party["name"], "type": party["party_type"],
                  "opening_balance": party.get("opening_balance", 0)},
        "entries": out,
        "closing_balance": round(bal, 2),
    }
