"""Service Management — Service Tickets + AMC Contracts."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db import db
from auth import require_company
from models import _id, _now

router = APIRouter(prefix="/api/services", tags=["services"])


# ===== SERVICE TICKETS =====
class TicketIn(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str = ""
    problem: str
    asset: str = ""  # e.g., "Samsung TV Model X"
    priority: str = "normal"  # low|normal|high|urgent
    scheduled_date: str = ""  # YYYY-MM-DD
    technician: str = ""
    status: str = "open"  # open|assigned|in_progress|completed|cancelled
    notes: str = ""
    service_charge: float = 0.0


async def _next_ticket_no(cid: str) -> str:
    n = await db.service_tickets.count_documents({"company_id": cid})
    return f"SRV-{n+1:05d}"


@router.get("/tickets")
async def list_tickets(status: str = "", ctx=Depends(require_company)):
    _, cid = ctx
    q = {"company_id": cid}
    if status:
        q["status"] = status
    items = await db.service_tickets.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.post("/tickets")
async def create_ticket(body: TicketIn, ctx=Depends(require_company)):
    user, cid = ctx
    doc = body.model_dump()
    doc.update({"id": _id(), "company_id": cid, "ticket_number": await _next_ticket_no(cid),
                "created_by": user["id"], "created_at": _now()})
    await db.service_tickets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/tickets/{tid}")
async def update_ticket(tid: str, body: TicketIn, ctx=Depends(require_company)):
    _, cid = ctx
    res = await db.service_tickets.update_one({"id": tid, "company_id": cid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.service_tickets.find_one({"id": tid}, {"_id": 0})


@router.delete("/tickets/{tid}")
async def delete_ticket(tid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.service_tickets.delete_one({"id": tid, "company_id": cid})
    return {"ok": True}


# ===== AMC CONTRACTS =====
class AMCIn(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str = ""
    asset: str  # what is being maintained
    plan_name: str = "Standard AMC"
    start_date: str  # YYYY-MM-DD
    end_date: str
    amount: float
    billing_cycle: str = "yearly"  # monthly|quarterly|halfyearly|yearly
    visits_per_year: int = 4
    status: str = "active"  # active|expiring_soon|expired|cancelled
    notes: str = ""


async def _next_amc_no(cid: str) -> str:
    n = await db.amc_contracts.count_documents({"company_id": cid})
    return f"AMC-{n+1:05d}"


@router.get("/amc")
async def list_amc(ctx=Depends(require_company)):
    _, cid = ctx
    items = await db.amc_contracts.find({"company_id": cid}, {"_id": 0}).sort("end_date", 1).to_list(500)
    # Compute "days remaining" & auto-update expiring_soon / expired
    from datetime import date
    today = date.today().isoformat()
    out = []
    for a in items:
        try:
            days = (date.fromisoformat(a["end_date"]) - date.today()).days
        except Exception:
            days = 0
        if a.get("status") != "cancelled":
            if days < 0:
                a["status"] = "expired"
            elif days <= 30:
                a["status"] = "expiring_soon"
            else:
                a["status"] = "active"
        a["days_remaining"] = days
        out.append(a)
    return out


@router.post("/amc")
async def create_amc(body: AMCIn, ctx=Depends(require_company)):
    user, cid = ctx
    doc = body.model_dump()
    doc.update({"id": _id(), "company_id": cid, "contract_number": await _next_amc_no(cid),
                "created_by": user["id"], "created_at": _now()})
    await db.amc_contracts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/amc/{aid}")
async def delete_amc(aid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.amc_contracts.delete_one({"id": aid, "company_id": cid})
    return {"ok": True}
