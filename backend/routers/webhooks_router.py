"""Razorpay webhook handler.

Razorpay POSTs payment events to this endpoint. We verify the X-Razorpay-Signature
header against RAZORPAY_WEBHOOK_SECRET, then update subscription_orders + user
subscription state accordingly.

Setup at Razorpay dashboard: Settings → Webhooks → Add Webhook
  - URL: https://<your-domain>/api/webhooks/razorpay
  - Events: subscription.activated, payment.captured, payment.failed, refund.created,
            subscription.cancelled, subscription.completed
  - Secret: any strong string → set as RAZORPAY_WEBHOOK_SECRET in backend/.env
"""
import os
import hmac
import hashlib
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException
from db import db
from models import _id, _now

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])
logger = logging.getLogger("aitax.webhook")

RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")


def _verify(body: bytes, signature: str) -> bool:
    if not RAZORPAY_WEBHOOK_SECRET:
        # Dev mode: skip verification but log it
        logger.warning("RAZORPAY_WEBHOOK_SECRET not set — accepting unverified webhook (dev only)")
        return True
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


@router.post("/razorpay")
async def razorpay_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    if not _verify(body, sig):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event", "unknown")
    payload_data = payload.get("payload", {})

    # Always log the event for audit
    await db.webhook_events.insert_one({
        "id": _id(),
        "provider": "razorpay",
        "event": event,
        "received_at": _now(),
        "raw": payload,
        "verified": bool(RAZORPAY_WEBHOOK_SECRET),
    })

    # Extract IDs
    payment = (payload_data.get("payment") or {}).get("entity", {})
    order = (payload_data.get("order") or {}).get("entity", {})
    refund = (payload_data.get("refund") or {}).get("entity", {})
    subscription = (payload_data.get("subscription") or {}).get("entity", {})

    rzp_order_id = payment.get("order_id") or order.get("id") or subscription.get("id") or ""

    sub_order = await db.subscription_orders.find_one({"razorpay_order_id": rzp_order_id}) if rzp_order_id else None

    if event == "payment.captured" and sub_order:
        await db.subscription_orders.update_one(
            {"id": sub_order["id"]},
            {"$set": {"status": "paid", "razorpay_payment_id": payment.get("id"),
                      "captured_at": _now(), "amount_captured": (payment.get("amount") or 0) / 100}},
        )
        # Activate user
        from datetime import timedelta
        days_map = {"monthly": 30, "quarterly": 90, "yearly": 365}
        days = days_map.get(sub_order.get("billing_cycle", "monthly"), 30)
        expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        await db.users.update_one(
            {"id": sub_order["user_id"]},
            {"$set": {"subscription_plan": sub_order["plan_id"], "subscription_status": "active",
                      "billing_cycle": sub_order.get("billing_cycle"), "subscription_expires_at": expires}},
        )
        logger.info("Webhook: activated subscription for user %s plan %s", sub_order["user_id"], sub_order["plan_id"])

    elif event == "payment.failed" and sub_order:
        await db.subscription_orders.update_one(
            {"id": sub_order["id"]},
            {"$set": {"status": "failed", "failure_reason": payment.get("error_description", "")}},
        )

    elif event == "refund.created" and sub_order:
        await db.subscription_orders.update_one(
            {"id": sub_order["id"]},
            {"$set": {"status": "refunded", "refund_id": refund.get("id"),
                      "refund_amount": (refund.get("amount") or 0) / 100, "refunded_at": _now()}},
        )
        await db.users.update_one(
            {"id": sub_order["user_id"]},
            {"$set": {"subscription_status": "cancelled"}},
        )

    elif event == "subscription.cancelled" and sub_order:
        await db.users.update_one(
            {"id": sub_order["user_id"]},
            {"$set": {"subscription_status": "cancelled"}},
        )

    return {"ok": True, "event": event}


@router.get("/events")
async def list_events(limit: int = 50):
    """Admin-friendly: recent webhook events for diagnostics. Not auth-protected — internal use."""
    items = await db.webhook_events.find({}, {"_id": 0}).sort("received_at", -1).limit(limit).to_list(limit)
    return items
