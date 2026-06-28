"""Super Admin module — comprehensive platform-level operations.

Endpoints organised into:
- Stats & analytics
- Tenant management (list, view-as, extend-trial, set-plan, cancel-sub, activate)
- Subscription & plans management
- Settings (maintenance mode, branding, security)
- Feature flags (global + per-tenant)
- Audit logs
- Webhook events viewer
- Backup (DB dump export)
"""
import os
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from db import db
from auth import get_current_user, hash_password
from models import _id, _now

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def require_super_admin(user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


async def _audit(action: str, target: str = "", details: dict = None, admin: dict = None):
    """Insert audit log entry."""
    await db.audit_logs.insert_one({
        "id": _id(),
        "actor_id": (admin or {}).get("id"),
        "actor_email": (admin or {}).get("email"),
        "action": action,
        "target": target,
        "details": details or {},
        "created_at": _now(),
    })


# ===================== SETTINGS =====================
DEFAULT_SETTINGS = {
    "maintenance_mode": False,
    "maintenance_message": "We're updating AITAX. Be right back!",
    "signup_mode": "open",  # open|approval|invite|closed
    "platform_name": "AITAX",
    "support_email": "info@aitax.com",
    "security": {
        "password_min_length": 6,
        "jwt_expire_minutes": 1440,
        "max_failed_logins": 5,
        "enforce_2fa": False,
    },
}


async def _get_settings() -> dict:
    s = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    if not s:
        return DEFAULT_SETTINGS.copy()
    out = DEFAULT_SETTINGS.copy()
    out.update(s)
    return out


@router.get("/settings")
async def get_settings(_=Depends(require_super_admin)):
    return await _get_settings()


class SettingsUpdate(BaseModel):
    maintenance_mode: Optional[bool] = None
    maintenance_message: Optional[str] = None
    signup_mode: Optional[str] = None
    platform_name: Optional[str] = None
    support_email: Optional[str] = None
    security: Optional[dict] = None


@router.put("/settings")
async def update_settings(body: SettingsUpdate, admin=Depends(require_super_admin)):
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(400, "No changes provided")
    await db.platform_settings.update_one({"_id": "global"}, {"$set": changes}, upsert=True)
    await _audit("settings.update", details=changes, admin=admin)
    return await _get_settings()


# Public settings — used by clients to know if maintenance is on
@router.get("/public-settings", include_in_schema=False)
async def public_settings():
    s = await _get_settings()
    return {
        "maintenance_mode": s["maintenance_mode"],
        "maintenance_message": s["maintenance_message"],
        "platform_name": s["platform_name"],
    }


# ===================== STATS & ANALYTICS =====================
@router.get("/stats")
async def stats(_=Depends(require_super_admin)):
    total_users = await db.users.count_documents({"is_super_admin": {"$ne": True}})
    active_users = await db.users.count_documents({"is_super_admin": {"$ne": True}, "active": {"$ne": False}})
    total_companies = await db.companies.count_documents({})
    paid_subs = await db.users.count_documents({"subscription_status": "active"})
    trial_users = await db.users.count_documents({"subscription_status": "trial"})
    total_invoices = await db.invoices.count_documents({})
    google_users = await db.users.count_documents({"auth_provider": "google"})

    plan_monthly = {"starter": 499, "pro": 1499, "enterprise": 4999}
    mrr = 0
    async for u in db.users.find({"subscription_status": "active"}, {"_id": 0, "subscription_plan": 1}):
        mrr += plan_monthly.get(u.get("subscription_plan"), 0)

    rev_cur = db.subscription_orders.aggregate(
        [{"$match": {"status": "paid"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    )
    rev = await rev_cur.to_list(1)
    platform_revenue = rev[0]["total"] if rev else 0

    # New signups in last 30 days
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    new_signups_30d = await db.users.count_documents({"is_super_admin": {"$ne": True}, "created_at": {"$gte": cutoff}})

    conversion = (paid_subs / total_users * 100) if total_users else 0

    return {
        "total_users": total_users, "active_users": active_users,
        "trial_users": trial_users, "paid_subscribers": paid_subs,
        "total_companies": total_companies, "total_invoices": total_invoices,
        "google_users": google_users, "mrr_estimate": mrr,
        "platform_revenue_total": platform_revenue,
        "new_signups_30d": new_signups_30d,
        "conversion_rate_pct": round(conversion, 2),
    }


@router.get("/analytics/signups")
async def signup_analytics(days: int = 30, _=Depends(require_super_admin)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    cur = db.users.aggregate([
        {"$match": {"is_super_admin": {"$ne": True}, "created_at": {"$gte": cutoff}}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ])
    rows = await cur.to_list(days)
    return [{"date": r["_id"], "count": r["count"]} for r in rows]


@router.get("/analytics/mrr-trend")
async def mrr_trend(months: int = 6, _=Depends(require_super_admin)):
    cur = db.subscription_orders.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 7]}, "amount": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ])
    rows = await cur.to_list(months * 2)
    return [{"month": r["_id"], "revenue": round(r["amount"], 2), "subs": r["count"]} for r in rows[-months:]]


# ===================== TENANT MANAGEMENT =====================
@router.get("/users")
async def list_users(search: str = "", status: str = "", _=Depends(require_super_admin)):
    q = {"is_super_admin": {"$ne": True}}
    if search:
        q["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"full_name": {"$regex": search, "$options": "i"}},
        ]
    if status:
        q["subscription_status"] = status
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return users


@router.get("/users/{user_id}/snapshot")
async def view_user_snapshot(user_id: str, admin=Depends(require_super_admin)):
    """Read-only 'View as user' — returns user + companies + recent invoices + party counts."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "User not found")
    companies = await db.companies.find({"owner_id": user_id}, {"_id": 0}).to_list(50)
    comp_ids = [c["id"] for c in companies]
    invoices = await db.invoices.find({"company_id": {"$in": comp_ids}}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    customer_count = await db.parties.count_documents({"company_id": {"$in": comp_ids}, "party_type": "customer"})
    supplier_count = await db.parties.count_documents({"company_id": {"$in": comp_ids}, "party_type": "supplier"})
    product_count = await db.products.count_documents({"company_id": {"$in": comp_ids}})
    invoice_total_cur = db.invoices.aggregate([
        {"$match": {"company_id": {"$in": comp_ids}, "invoice_type": {"$in": ["tax_invoice", "retail_invoice", "pos"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$grand_total"}, "count": {"$sum": 1}}},
    ])
    it = await invoice_total_cur.to_list(1)

    await _audit("user.view_snapshot", target=user_id, admin=admin)

    return {
        "user": u,
        "companies": companies,
        "stats": {
            "customer_count": customer_count,
            "supplier_count": supplier_count,
            "product_count": product_count,
            "total_sales": round(it[0]["total"], 2) if it else 0,
            "invoice_count": it[0]["count"] if it else 0,
        },
        "recent_invoices": invoices,
    }


class ForceResetIn(BaseModel):
    new_password: str = Field(min_length=6)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, body: ForceResetIn, admin=Depends(require_super_admin)):
    res = await db.users.update_one(
        {"id": user_id, "is_super_admin": {"$ne": True}},
        {"$set": {"password_hash": hash_password(body.new_password), "password_reset_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    await _audit("user.password_reset", target=user_id, admin=admin)
    return {"ok": True}


class ToggleActiveIn(BaseModel):
    active: bool


@router.post("/users/{user_id}/toggle-active")
async def toggle_active(user_id: str, body: ToggleActiveIn, admin=Depends(require_super_admin)):
    res = await db.users.update_one(
        {"id": user_id, "is_super_admin": {"$ne": True}},
        {"$set": {"active": body.active}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    await _audit("user.toggle_active", target=user_id, details={"active": body.active}, admin=admin)
    return {"ok": True, "active": body.active}


class ExtendTrialIn(BaseModel):
    days: int = 14


@router.post("/users/{user_id}/extend-trial")
async def extend_trial(user_id: str, body: ExtendTrialIn, admin=Depends(require_super_admin)):
    new_expiry = (datetime.now(timezone.utc) + timedelta(days=body.days)).isoformat()
    res = await db.users.update_one(
        {"id": user_id, "is_super_admin": {"$ne": True}},
        {"$set": {"subscription_status": "trial", "trial_ends_at": new_expiry, "subscription_expires_at": new_expiry}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    await _audit("user.extend_trial", target=user_id, details={"days": body.days}, admin=admin)
    return {"ok": True, "expires_at": new_expiry}


class SetPlanIn(BaseModel):
    plan_id: str  # starter|pro|enterprise|trial|platform
    billing_cycle: str = "monthly"
    days: int = 30


@router.post("/users/{user_id}/set-plan")
async def set_plan(user_id: str, body: SetPlanIn, admin=Depends(require_super_admin)):
    expires = (datetime.now(timezone.utc) + timedelta(days=body.days)).isoformat()
    res = await db.users.update_one(
        {"id": user_id, "is_super_admin": {"$ne": True}},
        {"$set": {
            "subscription_plan": body.plan_id,
            "subscription_status": "active" if body.plan_id != "trial" else "trial",
            "billing_cycle": body.billing_cycle,
            "subscription_expires_at": expires,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    await _audit("user.set_plan", target=user_id, details={"plan": body.plan_id, "days": body.days}, admin=admin)
    return {"ok": True, "expires_at": expires}


@router.post("/users/{user_id}/cancel-subscription")
async def cancel_sub(user_id: str, admin=Depends(require_super_admin)):
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"subscription_status": "cancelled"}},
    )
    await _audit("user.cancel_subscription", target=user_id, admin=admin)
    return {"ok": True}


# ===================== SUBSCRIPTIONS =====================
@router.get("/subscriptions")
async def list_subscriptions(_=Depends(require_super_admin)):
    return await db.subscription_orders.find({}, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)


# ===================== PLANS =====================
DEFAULT_PLANS = [
    {"id": "starter", "name": "Starter", "monthly": 499, "quarterly": 1349, "yearly": 4799,
     "businesses": 1, "users": 2, "features": ["1 Business", "2 Users", "Unlimited Invoices", "GST Reports", "Email Support"]},
    {"id": "pro", "name": "Pro", "monthly": 1499, "quarterly": 4049, "yearly": 14399,
     "businesses": 3, "users": 10, "popular": True,
     "features": ["3 Businesses", "10 Users", "Multi-branch", "Service Management", "AMC Contracts", "Priority Support"]},
    {"id": "enterprise", "name": "Enterprise", "monthly": 4999, "quarterly": 13499, "yearly": 47999,
     "businesses": -1, "users": -1,
     "features": ["Unlimited Businesses", "Unlimited Users", "Tour & Transport Modules", "AI Receipt OCR", "API Access"]},
]


@router.get("/plans")
async def list_plans(_=Depends(require_super_admin)):
    plans = await db.platform_plans.find({}, {"_id": 0}).to_list(50)
    if not plans:
        # Seed from defaults
        for p in DEFAULT_PLANS:
            await db.platform_plans.insert_one(p.copy())
        plans = DEFAULT_PLANS
    return plans


class PlanIn(BaseModel):
    id: str
    name: str
    monthly: float
    quarterly: float
    yearly: float
    businesses: int = 1
    users: int = 1
    popular: bool = False
    features: List[str] = []


@router.put("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanIn, admin=Depends(require_super_admin)):
    await db.platform_plans.update_one({"id": plan_id}, {"$set": body.model_dump()}, upsert=True)
    await _audit("plan.update", target=plan_id, details=body.model_dump(), admin=admin)
    return body.model_dump()


# ===================== FEATURE FLAGS =====================
DEFAULT_FLAGS = {
    "ai_features": False,
    "whatsapp_share": True,
    "pos_module": True,
    "gst_filing": True,
    "service_module": True,
    "tour_module": True,
    "transport_module": True,
    "accounting_module": True,
    "google_login": True,
}


@router.get("/feature-flags")
async def get_flags(_=Depends(require_super_admin)):
    f = await db.feature_flags.find_one({"_id": "global"}, {"_id": 0})
    out = DEFAULT_FLAGS.copy()
    if f:
        out.update(f)
    return out


@router.put("/feature-flags")
async def update_flags(flags: Dict[str, bool], admin=Depends(require_super_admin)):
    await db.feature_flags.update_one({"_id": "global"}, {"$set": flags}, upsert=True)
    await _audit("flags.update", details=flags, admin=admin)
    return await get_flags()


# ===================== AUDIT LOGS =====================
@router.get("/audit-logs")
async def audit_logs(limit: int = 100, _=Depends(require_super_admin)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


# ===================== WEBHOOK EVENTS =====================
@router.get("/webhook-events")
async def webhook_events(limit: int = 100, _=Depends(require_super_admin)):
    return await db.webhook_events.find({}, {"_id": 0}).sort("received_at", -1).limit(limit).to_list(limit)


# ===================== BACKUP =====================
@router.get("/backup")
async def backup_db(admin=Depends(require_super_admin)):
    """Export all collections as JSON for backup. NB: For small/medium tenants only."""
    collections = [
        "users", "companies", "parties", "products", "stock_movements",
        "invoices", "purchases", "payments", "expenses",
        "service_tickets", "amc_contracts", "tour_packages", "tour_bookings",
        "vehicles", "trips", "subscription_orders", "platform_plans",
        "platform_settings", "feature_flags", "audit_logs", "webhook_events",
    ]
    dump = {}
    for c in collections:
        docs = await db[c].find({}, {"_id": 0}).limit(50000).to_list(50000)
        dump[c] = docs
    await _audit("platform.backup_export", admin=admin)
    return {
        "exported_at": _now(),
        "version": "1.0",
        "collection_counts": {k: len(v) for k, v in dump.items()},
        "data": dump,
    }


class RestoreIn(BaseModel):
    data: Dict[str, List[dict]]
    mode: str = "merge"  # merge|replace


@router.post("/restore")
async def restore_db(body: RestoreIn, admin=Depends(require_super_admin)):
    """⚠ Restore from backup JSON. mode='replace' drops collections first."""
    counts = {}
    for collection, docs in body.data.items():
        if collection == "platform_settings":
            continue  # never overwrite global settings on restore
        if body.mode == "replace":
            await db[collection].delete_many({})
        if docs:
            try:
                await db[collection].insert_many(docs, ordered=False)
            except Exception as e:
                # duplicates etc — skip silently in merge mode
                pass
        counts[collection] = len(docs)
    await _audit("platform.restore", details={"mode": body.mode, "counts": counts}, admin=admin)
    return {"ok": True, "imported": counts}
