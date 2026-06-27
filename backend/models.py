"""Shared Pydantic models for AITAX."""
from datetime import datetime, timezone
from typing import Optional, List
import uuid
from pydantic import BaseModel, Field, EmailStr, ConfigDict


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- AUTH ----------
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    phone: Optional[str] = None
    business_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    role: str
    active_company_id: Optional[str] = None
    created_at: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- COMPANY ----------
class CompanyIn(BaseModel):
    name: str
    legal_name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    business_type: str = "trading"  # trading|service|manufacturing|mixed
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    financial_year_start: str = "04-01"  # MM-DD


class CompanyOut(CompanyIn):
    id: str
    owner_id: str
    created_at: str


# ---------- CUSTOMER / SUPPLIER ----------
class PartyIn(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    opening_balance: float = 0.0
    credit_limit: float = 0.0


class PartyOut(PartyIn):
    id: str
    company_id: str
    party_type: str  # customer|supplier
    current_balance: float = 0.0
    created_at: str


# ---------- PRODUCT ----------
class ProductIn(BaseModel):
    name: str
    sku: Optional[str] = None
    hsn_code: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    unit: str = "PCS"
    sale_price: float = 0.0
    purchase_price: float = 0.0
    gst_rate: float = 18.0
    opening_stock: float = 0.0
    min_stock: float = 0.0
    description: Optional[str] = None


class ProductOut(ProductIn):
    id: str
    company_id: str
    current_stock: float = 0.0
    created_at: str


# ---------- INVOICE / SALES ----------
class InvoiceItem(BaseModel):
    product_id: Optional[str] = None
    name: str
    hsn_code: Optional[str] = None
    quantity: float
    unit: str = "PCS"
    rate: float
    discount_pct: float = 0.0
    gst_rate: float = 18.0
    # computed
    amount: float = 0.0
    gst_amount: float = 0.0
    total: float = 0.0


class InvoiceIn(BaseModel):
    invoice_type: str = "tax_invoice"  # quotation|tax_invoice|retail_invoice|credit_note|pos
    party_id: Optional[str] = None
    party_name: str
    party_gstin: Optional[str] = None
    invoice_date: str  # YYYY-MM-DD
    due_date: Optional[str] = None
    items: List[InvoiceItem]
    notes: Optional[str] = None
    discount_total: float = 0.0
    shipping: float = 0.0
    paid_amount: float = 0.0
    payment_mode: Optional[str] = None  # cash|upi|bank|credit


class InvoiceOut(InvoiceIn):
    id: str
    company_id: str
    invoice_number: str
    subtotal: float
    gst_total: float
    grand_total: float
    balance_due: float
    status: str  # draft|sent|paid|partial|overdue|cancelled
    created_by: str
    created_at: str


# ---------- PURCHASE ----------
class PurchaseIn(BaseModel):
    purchase_type: str = "purchase_invoice"  # po|purchase_invoice|return
    supplier_id: Optional[str] = None
    supplier_name: str
    supplier_gstin: Optional[str] = None
    bill_number: Optional[str] = None
    bill_date: str
    items: List[InvoiceItem]
    notes: Optional[str] = None
    paid_amount: float = 0.0
    payment_mode: Optional[str] = None


class PurchaseOut(PurchaseIn):
    id: str
    company_id: str
    voucher_number: str
    subtotal: float
    gst_total: float
    grand_total: float
    balance_due: float
    status: str
    created_by: str
    created_at: str


# ---------- INVENTORY MOVEMENT ----------
class StockMovementOut(BaseModel):
    id: str
    company_id: str
    product_id: str
    product_name: str
    movement_type: str  # in|out|adjustment|opening
    quantity: float
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: str


# ---------- SUBSCRIPTION ----------
class CreateOrderIn(BaseModel):
    plan_id: str  # starter|pro|enterprise
    billing_cycle: str = "monthly"  # monthly|quarterly|yearly


class VerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: str
    billing_cycle: str
