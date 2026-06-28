"""Auth + user routes."""
import os
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import db
from models import UserRegister, UserLogin, TokenOut, UserOut, _id, _now
from auth import hash_password, verify_password, create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMERGENT_OAUTH_SESSION_URL = os.environ.get(
    "EMERGENT_OAUTH_SESSION_URL",
    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
)
SUPER_ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "").lower()


def _user_to_out(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "full_name": u["full_name"],
        "phone": u.get("phone"),
        "role": u.get("role", "business_owner"),
        "active_company_id": u.get("active_company_id"),
        "created_at": u["created_at"],
        "is_super_admin": bool(u.get("is_super_admin", False)),
        "auth_provider": u.get("auth_provider", "password"),
        "picture": u.get("picture"),
    }


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class GoogleExchangeIn(BaseModel):
    session_id: str


@router.post("/register", response_model=TokenOut)
async def register(body: UserRegister):
    if body.email.lower() == SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="This email is reserved")
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "id": _id(),
        "email": body.email.lower(),
        "full_name": body.full_name,
        "phone": body.phone,
        "password_hash": hash_password(body.password),
        "role": "business_owner",
        "active_company_id": None,
        "subscription_plan": "trial",
        "subscription_status": "trial",
        "trial_ends_at": _now(),
        "auth_provider": "password",
        "active": True,
        "is_super_admin": False,
        "created_at": _now(),
    }
    await db.users.insert_one(user_doc)

    if body.business_name:
        comp_doc = {
            "id": _id(),
            "owner_id": user_doc["id"],
            "name": body.business_name,
            "legal_name": body.business_name,
            "business_type": "trading",
            "financial_year_start": "04-01",
            "created_at": _now(),
        }
        await db.companies.insert_one(comp_doc)
        await db.users.update_one(
            {"id": user_doc["id"]}, {"$set": {"active_company_id": comp_doc["id"]}}
        )
        user_doc["active_company_id"] = comp_doc["id"]

    token = create_token(user_doc["id"])
    return {"access_token": token, "token_type": "bearer", "user": _user_to_out(user_doc)}


@router.post("/login", response_model=TokenOut)
async def login(body: UserLogin):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("password_hash") or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if u.get("active") is False:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    token = create_token(u["id"])
    return {"access_token": token, "token_type": "bearer", "user": _user_to_out(u)}


@router.get("/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return _user_to_out(user)


@router.post("/change-password")
async def change_password(body: ChangePasswordIn, user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not full.get("password_hash") or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": _now()}},
    )
    return {"ok": True}


@router.post("/switch-company/{company_id}")
async def switch_company(company_id: str, user=Depends(get_current_user)):
    comp = await db.companies.find_one({"id": company_id, "owner_id": user["id"]}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_company_id": company_id}})
    return {"ok": True, "active_company_id": company_id}


# ---------- Google (Emergent-managed) ----------
@router.post("/google/exchange", response_model=TokenOut)
async def google_exchange(body: GoogleExchangeIn):
    """Exchange Emergent OAuth session_id for our JWT.
    REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    """
    if not body.session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.get(EMERGENT_OAUTH_SESSION_URL, headers={"X-Session-ID": body.session_id})
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OAuth exchange failed: {e}")

    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email not provided by OAuth")

    # Block super admin from Google login
    if email == SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Super admin must use password login")

    existing = await db.users.find_one({"email": email})
    if existing:
        if existing.get("active") is False:
            raise HTTPException(status_code=403, detail="Account is deactivated")
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"last_login_at": _now(), "picture": data.get("picture") or existing.get("picture")}},
        )
        u = existing
    else:
        u = {
            "id": _id(),
            "email": email,
            "full_name": data.get("name") or email.split("@")[0],
            "phone": None,
            "password_hash": None,
            "role": "business_owner",
            "active_company_id": None,
            "subscription_plan": "trial",
            "subscription_status": "trial",
            "trial_ends_at": _now(),
            "auth_provider": "google",
            "picture": data.get("picture"),
            "active": True,
            "is_super_admin": False,
            "created_at": _now(),
            "last_login_at": _now(),
        }
        await db.users.insert_one(u)

    token = create_token(u["id"])
    return {"access_token": token, "token_type": "bearer", "user": _user_to_out(u)}
