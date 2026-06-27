"""Subscription plans + Razorpay payment integration."""
import os
import hmac
import hashlib
from fastapi import APIRouter, HTTPException, Depends
import razorpay
from db import db
from models import CreateOrderIn, VerifyPaymentIn, _id, _now
from auth import get_current_user

router = APIRouter(prefix="/api/subscription", tags=["subscription"])

RAZORPAY_KEY_ID = os.environ["RAZORPAY_KEY_ID"]
RAZORPAY_KEY_SECRET = os.environ["RAZORPAY_KEY_SECRET"]

rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


PLANS = {
    "starter": {
        "id": "starter",
        "name": "Starter",
        "monthly": 499,
        "quarterly": 1349,
        "yearly": 4799,
        "businesses": 1,
        "users": 2,
        "features": [
            "1 Business",
            "2 Users",
            "Unlimited Invoices",
            "GST Reports",
            "Inventory Management",
            "Email Support",
        ],
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "monthly": 1499,
        "quarterly": 4049,
        "yearly": 14399,
        "businesses": 3,
        "users": 10,
        "features": [
            "3 Businesses",
            "10 Users",
            "Multi-branch",
            "Service Management",
            "AMC Contracts",
            "Priority Support",
            "WhatsApp Invoicing",
            "Advanced Reports",
        ],
        "popular": True,
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "monthly": 4999,
        "quarterly": 13499,
        "yearly": 47999,
        "businesses": -1,
        "users": -1,
        "features": [
            "Unlimited Businesses",
            "Unlimited Users",
            "Tour Operator Module",
            "Transport Module",
            "AI Receipt OCR",
            "Custom Integrations",
            "Dedicated Account Manager",
            "API Access",
        ],
    },
}


@router.get("/plans")
async def list_plans():
    return {"plans": list(PLANS.values()), "razorpay_key_id": RAZORPAY_KEY_ID}


@router.get("/status")
async def status(user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {
        "plan": full.get("subscription_plan", "trial"),
        "status": full.get("subscription_status", "trial"),
        "expires_at": full.get("subscription_expires_at"),
        "billing_cycle": full.get("billing_cycle"),
    }


@router.post("/create-order")
async def create_order(body: CreateOrderIn, user=Depends(get_current_user)):
    plan = PLANS.get(body.plan_id)
    if not plan:
        raise HTTPException(400, "Invalid plan")
    if body.billing_cycle not in ("monthly", "quarterly", "yearly"):
        raise HTTPException(400, "Invalid billing cycle")

    amount_inr = plan[body.billing_cycle]
    amount_paise = int(amount_inr * 100)

    try:
        order = rzp_client.order.create(
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": f"sub_{user['id'][:8]}_{_id()[:8]}",
                "notes": {
                    "user_id": user["id"],
                    "plan_id": body.plan_id,
                    "billing_cycle": body.billing_cycle,
                },
            }
        )
    except Exception as e:
        raise HTTPException(500, f"Razorpay error: {str(e)}")

    await db.subscription_orders.insert_one(
        {
            "id": _id(),
            "user_id": user["id"],
            "razorpay_order_id": order["id"],
            "plan_id": body.plan_id,
            "billing_cycle": body.billing_cycle,
            "amount": amount_inr,
            "status": "created",
            "created_at": _now(),
        }
    )

    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": RAZORPAY_KEY_ID,
        "plan_name": plan["name"],
    }


@router.post("/verify-payment")
async def verify_payment(body: VerifyPaymentIn, user=Depends(get_current_user)):
    # Verify signature
    payload = f"{body.razorpay_order_id}|{body.razorpay_payment_id}"
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(400, "Invalid payment signature")

    plan = PLANS.get(body.plan_id)
    if not plan:
        raise HTTPException(400, "Invalid plan")

    from datetime import datetime, timezone, timedelta

    days_map = {"monthly": 30, "quarterly": 90, "yearly": 365}
    expires = (
        datetime.now(timezone.utc) + timedelta(days=days_map[body.billing_cycle])
    ).isoformat()

    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "subscription_plan": body.plan_id,
                "subscription_status": "active",
                "billing_cycle": body.billing_cycle,
                "subscription_expires_at": expires,
            }
        },
    )
    await db.subscription_orders.update_one(
        {"razorpay_order_id": body.razorpay_order_id},
        {
            "$set": {
                "status": "paid",
                "razorpay_payment_id": body.razorpay_payment_id,
                "paid_at": _now(),
            }
        },
    )

    return {"ok": True, "plan": body.plan_id, "expires_at": expires}
