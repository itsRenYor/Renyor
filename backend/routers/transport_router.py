"""Transport — Vehicles + Trip Sheets."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db import db
from auth import require_company
from models import _id, _now

router = APIRouter(prefix="/api/transport", tags=["transport"])


class VehicleIn(BaseModel):
    vehicle_number: str
    vehicle_type: str = "Truck"  # Truck|Tempo|Van|Trailer|Car
    make_model: str = ""
    capacity: str = ""  # e.g., "10 Ton"
    driver_name: str = ""
    driver_phone: str = ""
    fitness_expiry: str = ""
    insurance_expiry: str = ""
    permit_expiry: str = ""
    active: bool = True


@router.get("/vehicles")
async def list_vehicles(ctx=Depends(require_company)):
    _, cid = ctx
    return await db.vehicles.find({"company_id": cid}, {"_id": 0}).sort("vehicle_number", 1).to_list(500)


@router.post("/vehicles")
async def create_vehicle(body: VehicleIn, ctx=Depends(require_company)):
    _, cid = ctx
    doc = body.model_dump()
    doc.update({"id": _id(), "company_id": cid, "created_at": _now()})
    await db.vehicles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.vehicles.delete_one({"id": vid, "company_id": cid})
    return {"ok": True}


class TripIn(BaseModel):
    vehicle_id: str
    vehicle_number: str
    driver_name: str = ""
    customer_name: str = ""
    from_location: str
    to_location: str
    trip_date: str  # YYYY-MM-DD
    lr_number: str = ""  # Lorry Receipt
    goods_description: str = ""
    freight_amount: float = 0
    advance_paid: float = 0
    diesel_expense: float = 0
    other_expenses: float = 0
    status: str = "scheduled"  # scheduled|in_transit|delivered|cancelled
    notes: str = ""


async def _next_trip_no(cid: str) -> str:
    n = await db.trips.count_documents({"company_id": cid})
    return f"TRIP-{n+1:05d}"


@router.get("/trips")
async def list_trips(status: str = "", ctx=Depends(require_company)):
    _, cid = ctx
    q = {"company_id": cid}
    if status:
        q["status"] = status
    items = await db.trips.find(q, {"_id": 0}).sort("trip_date", -1).to_list(500)
    for t in items:
        t["profit"] = round(t.get("freight_amount", 0) - t.get("diesel_expense", 0) - t.get("other_expenses", 0), 2)
    return items


@router.post("/trips")
async def create_trip(body: TripIn, ctx=Depends(require_company)):
    user, cid = ctx
    doc = body.model_dump()
    doc.update({"id": _id(), "company_id": cid, "trip_number": await _next_trip_no(cid),
                "created_by": user["id"], "created_at": _now()})
    await db.trips.insert_one(doc)
    doc.pop("_id", None)
    doc["profit"] = round(doc.get("freight_amount", 0) - doc.get("diesel_expense", 0) - doc.get("other_expenses", 0), 2)
    return doc


@router.delete("/trips/{tid}")
async def delete_trip(tid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.trips.delete_one({"id": tid, "company_id": cid})
    return {"ok": True}
