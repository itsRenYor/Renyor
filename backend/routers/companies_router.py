"""Company onboarding & list."""
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import CompanyIn, _id, _now
from auth import get_current_user

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("")
async def list_companies(user=Depends(get_current_user)):
    items = await db.companies.find({"owner_id": user["id"]}, {"_id": 0}).to_list(100)
    return items


@router.post("")
async def create_company(body: CompanyIn, user=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = _id()
    doc["owner_id"] = user["id"]
    doc["created_at"] = _now()
    await db.companies.insert_one(doc)
    # set as active if none
    if not user.get("active_company_id"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"active_company_id": doc["id"]}})
    doc.pop("_id", None)
    return doc


@router.get("/{cid}")
async def get_company(cid: str, user=Depends(get_current_user)):
    comp = await db.companies.find_one({"id": cid, "owner_id": user["id"]}, {"_id": 0})
    if not comp:
        raise HTTPException(404, "Company not found")
    return comp


@router.put("/{cid}")
async def update_company(cid: str, body: CompanyIn, user=Depends(get_current_user)):
    res = await db.companies.update_one(
        {"id": cid, "owner_id": user["id"]}, {"$set": body.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Company not found")
    comp = await db.companies.find_one({"id": cid}, {"_id": 0})
    return comp


@router.delete("/{cid}")
async def delete_company(cid: str, user=Depends(get_current_user)):
    await db.companies.delete_one({"id": cid, "owner_id": user["id"]})
    return {"ok": True}
