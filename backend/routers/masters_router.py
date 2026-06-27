"""Customers, Suppliers, Products masters."""
from fastapi import APIRouter, HTTPException, Depends, Query
from db import db
from models import PartyIn, ProductIn, _id, _now
from auth import require_company

router = APIRouter(prefix="/api/masters", tags=["masters"])


# ============= PARTIES (Customers & Suppliers) =============
def _party_collection():
    return db.parties


@router.get("/parties")
async def list_parties(
    party_type: str = Query("customer"),
    search: str = Query(""),
    ctx=Depends(require_company),
):
    _, cid = ctx
    q = {"company_id": cid, "party_type": party_type}
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    items = await db.parties.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.post("/parties")
async def create_party(
    body: PartyIn, party_type: str = Query("customer"), ctx=Depends(require_company)
):
    user, cid = ctx
    if party_type not in ("customer", "supplier"):
        raise HTTPException(400, "Invalid party_type")
    doc = body.model_dump()
    doc.update(
        {
            "id": _id(),
            "company_id": cid,
            "party_type": party_type,
            "current_balance": body.opening_balance,
            "created_at": _now(),
        }
    )
    await db.parties.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/parties/{pid}")
async def update_party(pid: str, body: PartyIn, ctx=Depends(require_company)):
    _, cid = ctx
    res = await db.parties.update_one(
        {"id": pid, "company_id": cid}, {"$set": body.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    party = await db.parties.find_one({"id": pid}, {"_id": 0})
    return party


@router.delete("/parties/{pid}")
async def delete_party(pid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.parties.delete_one({"id": pid, "company_id": cid})
    return {"ok": True}


# ============= PRODUCTS =============
@router.get("/products")
async def list_products(search: str = Query(""), ctx=Depends(require_company)):
    _, cid = ctx
    q = {"company_id": cid}
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    items = await db.products.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@router.post("/products")
async def create_product(body: ProductIn, ctx=Depends(require_company)):
    _, cid = ctx
    doc = body.model_dump()
    doc.update(
        {
            "id": _id(),
            "company_id": cid,
            "current_stock": body.opening_stock,
            "created_at": _now(),
        }
    )
    await db.products.insert_one(doc)

    # opening stock movement
    if body.opening_stock > 0:
        await db.stock_movements.insert_one(
            {
                "id": _id(),
                "company_id": cid,
                "product_id": doc["id"],
                "product_name": doc["name"],
                "movement_type": "opening",
                "quantity": body.opening_stock,
                "reference_type": None,
                "reference_id": None,
                "notes": "Opening stock",
                "created_at": _now(),
            }
        )
    doc.pop("_id", None)
    return doc


@router.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, ctx=Depends(require_company)):
    _, cid = ctx
    res = await db.products.update_one(
        {"id": pid, "company_id": cid}, {"$set": body.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.products.find_one({"id": pid}, {"_id": 0})


@router.delete("/products/{pid}")
async def delete_product(pid: str, ctx=Depends(require_company)):
    _, cid = ctx
    await db.products.delete_one({"id": pid, "company_id": cid})
    return {"ok": True}


# ============= LOW STOCK =============
@router.get("/products/low-stock")
async def low_stock(ctx=Depends(require_company)):
    _, cid = ctx
    items = await db.products.find(
        {"company_id": cid, "$expr": {"$lt": ["$current_stock", "$min_stock"]}}, {"_id": 0}
    ).to_list(500)
    return items


# ============= STOCK MOVEMENTS =============
@router.get("/stock-movements")
async def stock_movements(product_id: str = Query(None), ctx=Depends(require_company)):
    _, cid = ctx
    q = {"company_id": cid}
    if product_id:
        q["product_id"] = product_id
    items = (
        await db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    )
    return items
