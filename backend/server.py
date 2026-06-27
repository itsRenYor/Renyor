"""AITAX FastAPI server."""
import logging
import os
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import db
from auth import hash_password
from models import _id, _now
from routers.auth_router import router as auth_router
from routers.companies_router import router as companies_router
from routers.masters_router import router as masters_router
from routers.sales_router import router as sales_router
from routers.purchases_router import router as purchases_router
from routers.dashboard_router import router as dashboard_router
from routers.subscription_router import router as subscription_router

app = FastAPI(title="AITAX API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(companies_router)
app.include_router(masters_router)
app.include_router(sales_router)
app.include_router(purchases_router)
app.include_router(dashboard_router)
app.include_router(subscription_router)


@app.get("/api/")
async def root():
    return {"app": "AITAX", "version": "1.0.0", "status": "ok"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("aitax")


@app.on_event("startup")
async def seed_demo():
    """Seed demo user + sample data idempotently."""
    existing = await db.users.find_one({"email": "demo@aitax.in"})
    if existing:
        logger.info("Demo data already exists")
        return

    user_id = _id()
    comp_id = _id()
    await db.users.insert_one(
        {
            "id": user_id,
            "email": "demo@aitax.in",
            "full_name": "Demo Owner",
            "phone": "+91 98765 43210",
            "password_hash": hash_password("Demo@12345"),
            "role": "business_owner",
            "active_company_id": comp_id,
            "subscription_plan": "trial",
            "subscription_status": "trial",
            "created_at": _now(),
        }
    )
    await db.companies.insert_one(
        {
            "id": comp_id,
            "owner_id": user_id,
            "name": "Demo Traders Pvt Ltd",
            "legal_name": "Demo Traders Private Limited",
            "gstin": "27ABCDE1234F1Z5",
            "pan": "ABCDE1234F",
            "business_type": "trading",
            "address": "Shop 42, MG Road",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
            "phone": "+91 98765 43210",
            "email": "demo@aitax.in",
            "financial_year_start": "04-01",
            "created_at": _now(),
        }
    )
    # Sample customers & suppliers
    parties_seed = [
        ("Rahul Sharma", "customer", "9876543210", "27AAACR5055K1Z5", 0),
        ("Priya Electronics", "customer", "9988776655", None, 12500),
        ("Mumbai Wholesale Mart", "customer", "9123456780", "27AAJCM4567L1ZX", 4500),
        ("ABC Distributors", "supplier", "9871234560", "27AAACA1234B1Z5", 8500),
        ("Khanna Hardware", "supplier", "9810000111", None, 0),
    ]
    for name, ptype, phone, gstin, bal in parties_seed:
        await db.parties.insert_one(
            {
                "id": _id(),
                "company_id": comp_id,
                "party_type": ptype,
                "name": name,
                "phone": phone,
                "gstin": gstin,
                "opening_balance": bal,
                "current_balance": bal,
                "credit_limit": 50000,
                "created_at": _now(),
            }
        )

    # Sample products
    products_seed = [
        ("LED Bulb 9W", "LED-9W", "8539", "Lighting", "Philips", "PCS", 80, 50, 18, 200, 50),
        ("Ceiling Fan Standard", "FAN-STD", "8414", "Appliance", "Crompton", "PCS", 2200, 1700, 18, 25, 5),
        ("Copper Wire 1.5mm", "WIRE-1.5", "7408", "Electrical", "Polycab", "MTR", 38, 28, 18, 1000, 200),
        ("Mobile Charger 20W", "CHG-20W", "8504", "Mobile", "Mi", "PCS", 599, 350, 18, 80, 10),
        ("Hammer 500g", "HAM-500", "8205", "Tools", "Taparia", "PCS", 250, 180, 12, 30, 5),
    ]
    for name, sku, hsn, cat, brand, unit, sp, pp, gst, stock, mn in products_seed:
        pid = _id()
        await db.products.insert_one(
            {
                "id": pid,
                "company_id": comp_id,
                "name": name,
                "sku": sku,
                "hsn_code": hsn,
                "category": cat,
                "brand": brand,
                "unit": unit,
                "sale_price": sp,
                "purchase_price": pp,
                "gst_rate": gst,
                "opening_stock": stock,
                "current_stock": stock,
                "min_stock": mn,
                "description": None,
                "created_at": _now(),
            }
        )
        await db.stock_movements.insert_one(
            {
                "id": _id(),
                "company_id": comp_id,
                "product_id": pid,
                "product_name": name,
                "movement_type": "opening",
                "quantity": stock,
                "reference_type": None,
                "reference_id": None,
                "notes": "Opening stock",
                "created_at": _now(),
            }
        )
    logger.info("Seeded demo data for demo@aitax.in")
