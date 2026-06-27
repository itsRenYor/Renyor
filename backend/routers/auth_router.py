"""Auth + user routes."""
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import UserRegister, UserLogin, TokenOut, UserOut, _id, _now
from auth import hash_password, verify_password, create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_to_out(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "full_name": u["full_name"],
        "phone": u.get("phone"),
        "role": u.get("role", "business_owner"),
        "active_company_id": u.get("active_company_id"),
        "created_at": u["created_at"],
    }


@router.post("/register", response_model=TokenOut)
async def register(body: UserRegister):
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
        "created_at": _now(),
    }
    await db.users.insert_one(user_doc)

    # Auto-create initial company if business_name provided
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
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(u["id"])
    return {"access_token": token, "token_type": "bearer", "user": _user_to_out(u)}


@router.get("/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return _user_to_out(user)


@router.post("/switch-company/{company_id}")
async def switch_company(company_id: str, user=Depends(get_current_user)):
    comp = await db.companies.find_one({"id": company_id, "owner_id": user["id"]}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_company_id": company_id}})
    return {"ok": True, "active_company_id": company_id}
