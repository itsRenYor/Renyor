"""Tour Operator — Packages + Bookings."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from db import db
from auth import require_company
from models import _id, _now

router = APIRouter(prefix="/api/tours", tags=["tours"])


class PackageIn(BaseModel):
    name: str
    destination: str
    duration_days: int = 1
    duration_nights: int = 0
    description: str = ""
    inclusions: str = ""
    cost_price: float = 0  # cost to operator
    sale_price: float = 0  # price to traveler
    active: bool = True


@router.get("/packages")
async def list_packages(ctx=Depends(require_company)):
    _, cid = ctx
    return await db.tour_packages.find({"company_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/packages")
async def create_package(body: PackageIn, ctx=Depends(require_company)):
    _, cid = ctx
    doc = body.model_dump()
    doc.update({"id": _id(), "company_id": cid, "created_at": _now()})
    await db.tour_packages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/packages/{pid}")
async def delete_package(pid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.tour_packages.delete_one({"id": pid, "company_id": cid})
    return {"ok": True}


class BookingIn(BaseModel):
    package_id: str
    package_name: str
    traveler_name: str
    traveler_phone: str = ""
    traveler_email: str = ""
    num_travelers: int = 1
    travel_date: str  # YYYY-MM-DD
    sale_price: float
    cost_price: float = 0
    advance_paid: float = 0
    status: str = "confirmed"  # confirmed|in_progress|completed|cancelled
    notes: str = ""


async def _next_booking_no(cid: str) -> str:
    n = await db.tour_bookings.count_documents({"company_id": cid})
    return f"TR-{n+1:05d}"


@router.get("/bookings")
async def list_bookings(ctx=Depends(require_company)):
    _, cid = ctx
    items = await db.tour_bookings.find({"company_id": cid}, {"_id": 0}).sort("travel_date", -1).to_list(500)
    for b in items:
        b["profit"] = round((b.get("sale_price", 0) - b.get("cost_price", 0)) * b.get("num_travelers", 1), 2)
    return items


@router.post("/bookings")
async def create_booking(body: BookingIn, ctx=Depends(require_company)):
    user, cid = ctx
    doc = body.model_dump()
    doc.update({"id": _id(), "company_id": cid, "booking_number": await _next_booking_no(cid),
                "created_by": user["id"], "created_at": _now()})
    await db.tour_bookings.insert_one(doc)
    doc.pop("_id", None)
    doc["profit"] = round((doc.get("sale_price", 0) - doc.get("cost_price", 0)) * doc.get("num_travelers", 1), 2)
    return doc


@router.delete("/bookings/{bid}")
async def delete_booking(bid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.tour_bookings.delete_one({"id": bid, "company_id": cid})
    return {"ok": True}
