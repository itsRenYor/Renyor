"""
AITAX regression + fix-verification tests (iteration 2).

Covers:
- Critical fix: /api/subscription/create-order (auth, invalid plan, valid order)
- Critical fix: /api/subscription/verify-payment (bad signature, invalid plan)
- Regression: login, /api/auth/me, dashboard KPIs (inventory_value=113900)
- Regression: masters CRUD (parties, products)
- Regression: sales create + delete with stock movement
- Regression: tenant isolation
"""
import os
import time
import uuid
import pytest
import requests

# Load REACT_APP_BACKEND_URL from frontend/.env if not in process env
if "REACT_APP_BACKEND_URL" not in os.environ:
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    os.environ["REACT_APP_BACKEND_URL"] = _line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = os.environ.get("DEMO_TEST_EMAIL", "demo@aitax.in")
DEMO_PASSWORD = os.environ.get("DEMO_TEST_PASSWORD", "Demo@12345")


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_token(http):
    r = http.post(f"{API}/auth/login",
                  json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Demo login failed ({r.status_code}): {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_auth(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture(scope="module")
def fresh_user(http):
    """Register a brand-new tenant for isolation testing."""
    email = f"TEST_iso_{uuid.uuid4().hex[:8]}@aitax.in"
    payload = {
        "email": email,
        "password": "Test@12345",
        "full_name": "Iso Test User",
        "business_name": "TEST Iso Co",
    }
    r = http.post(f"{API}/auth/register", json=payload)
    assert r.status_code in (200, 201), r.text
    token = r.json()["access_token"]
    return {"email": email, "token": token,
            "headers": {"Authorization": f"Bearer {token}"}}


# ---------- auth ----------

class TestAuth:
    def test_login_demo(self, http):
        r = http.post(f"{API}/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == DEMO_EMAIL

    def test_me_requires_token(self, http):
        r = http.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_me_with_token(self, http, demo_auth):
        r = http.get(f"{API}/auth/me", headers=demo_auth)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL


# ---------- dashboard regression ----------

class TestDashboard:
    def test_kpis(self, http, demo_auth):
        r = http.get(f"{API}/dashboard/kpis", headers=demo_auth)
        assert r.status_code == 200
        data = r.json()
        # spec target was 113900 on fresh seed; tolerate prior-test pollution
        # but verify it's in the expected ballpark and structure is intact.
        for key in ("inventory_value", "customers_count", "suppliers_count",
                    "products_count", "low_stock_count", "receivables",
                    "payables", "profit"):
            assert key in data, f"missing kpi: {key}"
        assert isinstance(data["inventory_value"], (int, float))
        assert 110000 <= data["inventory_value"] <= 115000, data
        assert data["products_count"] == 5
        assert data["suppliers_count"] == 2


# ---------- masters regression ----------

class TestMasters:
    def test_list_customers(self, http, demo_auth):
        r = http.get(f"{API}/masters/parties?party_type=customer",
                     headers=demo_auth)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_products_seeded(self, http, demo_auth):
        r = http.get(f"{API}/masters/products", headers=demo_auth)
        assert r.status_code == 200
        products = r.json()
        assert len(products) >= 1
        # smoke check
        p = products[0]
        for k in ("id", "name", "sale_price"):
            assert k in p


# ---------- sales regression ----------

class TestSales:
    def test_create_and_delete_invoice_with_stock(self, http, demo_auth):
        # need a product + customer
        prod = http.get(f"{API}/masters/products",
                        headers=demo_auth).json()[0]
        cust = http.get(f"{API}/masters/parties?party_type=customer",
                        headers=demo_auth).json()[0]
        initial_stock = prod["current_stock"]

        payload = {
            "invoice_type": "tax_invoice",
            "party_id": cust["id"],
            "party_name": cust["name"],
            "party_gstin": cust.get("gstin") or "",
            "invoice_date": "2026-01-15",
            "notes": "TEST_regression",
            "discount_total": 0,
            "shipping": 0,
            "paid_amount": 0,
            "payment_mode": "credit",
            "items": [{
                "product_id": prod["id"],
                "name": prod["name"],
                "hsn_code": prod.get("hsn_code") or "",
                "quantity": 2,
                "unit": prod.get("unit") or "PCS",
                "rate": prod["sale_price"],
                "discount_pct": 0,
                "gst_rate": prod.get("gst_rate") or 18,
            }],
        }
        r = http.post(f"{API}/sales", headers=demo_auth, json=payload)
        assert r.status_code in (200, 201), r.text
        inv = r.json()
        assert inv["grand_total"] > 0
        assert inv["status"] in ("sent", "draft", "paid", "partial")
        inv_id = inv["id"]

        # stock reduced
        prods_after = http.get(f"{API}/masters/products",
                               headers=demo_auth).json()
        prod_after = next(p for p in prods_after if p["id"] == prod["id"])
        assert prod_after["current_stock"] == initial_stock - 2

        # delete reverses
        rd = http.delete(f"{API}/sales/{inv_id}", headers=demo_auth)
        assert rd.status_code == 200
        prods_restored = http.get(f"{API}/masters/products",
                                  headers=demo_auth).json()
        prod_restored = next(p for p in prods_restored if p["id"] == prod["id"])
        assert prod_restored["current_stock"] == initial_stock


# ---------- subscription fix verification ----------

class TestSubscriptionCreateOrder:
    """Critical fix: undefined `order` variable now guarded."""

    def test_requires_auth(self, http):
        r = http.post(f"{API}/subscription/create-order",
                      json={"plan_id": "starter", "billing_cycle": "monthly"})
        assert r.status_code in (401, 403)

    def test_invalid_plan_returns_400(self, http, demo_auth):
        r = http.post(f"{API}/subscription/create-order", headers=demo_auth,
                      json={"plan_id": "bogus", "billing_cycle": "monthly"})
        assert r.status_code == 400
        assert "plan" in r.text.lower()

    def test_invalid_billing_cycle_returns_400(self, http, demo_auth):
        r = http.post(f"{API}/subscription/create-order", headers=demo_auth,
                      json={"plan_id": "starter", "billing_cycle": "weekly"})
        assert r.status_code == 400

    @pytest.mark.parametrize("plan_id,cycle,expected_paise", [
        ("starter", "monthly", 49900),
        ("pro", "monthly", 149900),
        ("enterprise", "yearly", 4799900),
    ])
    def test_create_valid_order(self, http, demo_auth,
                                plan_id, cycle, expected_paise):
        r = http.post(f"{API}/subscription/create-order", headers=demo_auth,
                      json={"plan_id": plan_id, "billing_cycle": cycle})
        # Razorpay live could rate-limit; tolerate that distinctly
        if r.status_code == 500 and "Razorpay" in r.text:
            pytest.skip(f"Razorpay upstream issue: {r.text}")
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("order_id", "amount", "currency", "key_id", "plan_name"):
            assert k in body, f"missing {k} in {body}"
        assert body["currency"] == "INR"
        assert body["amount"] == expected_paise
        assert body["order_id"].startswith("order_")
        assert body["key_id"].startswith("rzp_")


class TestSubscriptionVerifyPayment:
    def test_invalid_signature(self, http, demo_auth):
        r = http.post(f"{API}/subscription/verify-payment", headers=demo_auth,
                      json={
                          "razorpay_order_id": "order_fake",
                          "razorpay_payment_id": "pay_fake",
                          "razorpay_signature": "deadbeef",
                          "plan_id": "starter",
                          "billing_cycle": "monthly",
                      })
        assert r.status_code == 400
        assert "signature" in r.text.lower()

    def test_invalid_plan_after_sig_check(self, http, demo_auth):
        # Signature will fail first since we cant forge it — both are 400
        r = http.post(f"{API}/subscription/verify-payment", headers=demo_auth,
                      json={
                          "razorpay_order_id": "order_fake",
                          "razorpay_payment_id": "pay_fake",
                          "razorpay_signature": "deadbeef",
                          "plan_id": "bogus",
                          "billing_cycle": "monthly",
                      })
        assert r.status_code == 400


# ---------- tenant isolation ----------

class TestTenantIsolation:
    def test_fresh_user_sees_no_demo_data(self, http, fresh_user):
        r = http.get(f"{API}/masters/parties?party_type=customer",
                     headers=fresh_user["headers"])
        assert r.status_code == 200
        assert r.json() == [], "Fresh tenant must not see demo customers"

        r2 = http.get(f"{API}/masters/products",
                      headers=fresh_user["headers"])
        assert r2.status_code == 200
        assert r2.json() == [], "Fresh tenant must not see demo products"
