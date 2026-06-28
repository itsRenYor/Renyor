"""Super Admin module — platform-level operations."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field
from db import db
from auth import get_current_user, hash_password
from models import _now

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def require_super_admin(user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


# ---------- Schemas ----------
class ForceResetIn(BaseModel):
    new_password: str = Field(min_length=6)


class ToggleActiveIn(BaseModel):
    active: bool


# ---------- Endpoints ----------
@router.get("/stats")
async def stats(_=Depends(require_super_admin)):
    total_users = await db.users.count_documents({})
    active_users = await db.users.count_documents({"active": {"$ne": False}})
    total_companies = await db.companies.count_documents({})
    paid_subs = await db.users.count_documents({"subscription_status": "active"})

    # MRR (sum of active plan prices, normalised to monthly)
    plan_monthly = {"starter": 499, "pro": 1499, "enterprise": 4999}
    cycle_div = {"monthly": 1, "quarterly": 3, "yearly": 12}
    mrr = 0
    async for u in db.users.find({"subscription_status": "active"}, {"_id": 0, "subscription_plan": 1, "billing_cycle": 1}):
        p = plan_monthly.get(u.get("subscription_plan"), 0)
        c = cycle_div.get(u.get("billing_cycle", "monthly"), 1)
        mrr += p  # plan price is already monthly equivalent per cycle in our backend; just sum monthly

    total_invoices = await db.invoices.count_documents({})
    total_revenue_cur = db.subscription_orders.aggregate(
        [{"$match": {"status": "paid"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    )
    tr = await total_revenue_cur.to_list(1)
    platform_revenue = tr[0]["total"] if tr else 0

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_companies": total_companies,
        "paid_subscribers": paid_subs,
        "total_invoices": total_invoices,
        "mrr_estimate": mrr,
        "platform_revenue_total": platform_revenue,
    }


@router.get("/users")
async def list_users(search: str = "", _=Depends(require_super_admin)):
    q = {"is_super_admin": {"$ne": True}}
    if search:
        q["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"full_name": {"$regex": search, "$options": "i"}},
        ]
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return users


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, body: ForceResetIn, _=Depends(require_super_admin)):
    res = await db.users.update_one(
        {"id": user_id, "is_super_admin": {"$ne": True}},
        {"$set": {"password_hash": hash_password(body.new_password), "password_reset_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True}


@router.post("/users/{user_id}/toggle-active")
async def toggle_active(user_id: str, body: ToggleActiveIn, _=Depends(require_super_admin)):
    res = await db.users.update_one(
        {"id": user_id, "is_super_admin": {"$ne": True}},
        {"$set": {"active": body.active}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True, "active": body.active}


@router.get("/subscriptions")
async def list_subscriptions(_=Depends(require_super_admin)):
    items = await db.subscription_orders.find({}, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    return items
