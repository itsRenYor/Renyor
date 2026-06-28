"""Iteration 4 backend tests: GST reports, PDF/share, POS, Multi-company."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ai-accounting-20.preview.emergentagent.com").rstrip("/")
DEMO = {"email": "demo@aitax.in", "password": "Demo@12345"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_headers():
    return {"Authorization": f"Bearer {_login(**DEMO)}"}


@pytest.fixture(scope="module")
def fresh_user_headers():
    """Register a brand new tenant for clean multi-company tests."""
    email = f"TEST_it4_{uuid.uuid4().hex[:8]}@aitax.in"
    body = {
        "email": email,
        "password": "Test@12345",
        "full_name": "It4 Tester",
        "business_name": "It4 Co A",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=body)
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("access_token") or _login(email, "Test@12345")
    return {"Authorization": f"Bearer {tok}"}, email


# ------------------- GST -------------------
class TestGST:
    def test_gstr1_current_month(self, demo_headers):
        month = time.strftime("%Y-%m")
        r = requests.get(f"{BASE_URL}/api/gst/gstr1?month={month}", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["report"] == "GSTR-1"
        assert d["period"] == month
        for k in ("total_invoices", "b2b_count", "b2c_count", "total_taxable_value",
                  "total_igst", "total_cgst", "total_sgst", "total_tax"):
            assert k in d["summary"], f"missing {k}"
        assert isinstance(d["b2b"], list)
        assert isinstance(d["b2c"], list)
        assert isinstance(d["hsn_summary"], list)
        assert "name" in d["company"]

    def test_gstr3b_current_month(self, demo_headers):
        month = time.strftime("%Y-%m")
        r = requests.get(f"{BASE_URL}/api/gst/gstr3b?month={month}", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["report"] == "GSTR-3B"
        assert "section_3_1_outward_supplies" in d
        assert "section_4_eligible_itc" in d
        assert "net_tax_payable" in d
        for k in ("igst", "cgst", "sgst", "total"):
            assert k in d["net_tax_payable"]

    def test_gst_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/gst/gstr1?month=2026-01")
        assert r.status_code in (401, 403)


# ------------------- PDF & Share -------------------
class TestPdfAndShare:
    @pytest.fixture(scope="class")
    def invoice_id(self, demo_headers):
        # find an existing invoice or create one
        r = requests.get(f"{BASE_URL}/api/sales", headers=demo_headers)
        assert r.status_code == 200
        invs = r.json()
        if invs:
            return invs[0]["id"]
        # create a quick one
        prods = requests.get(f"{BASE_URL}/api/masters/products", headers=demo_headers).json()
        parties = requests.get(f"{BASE_URL}/api/masters/parties?party_type=customer", headers=demo_headers).json()
        assert prods and parties
        p = prods[0]; party = parties[0]
        payload = {
            "invoice_type": "tax_invoice",
            "party_id": party["id"], "party_name": party["name"],
            "party_gstin": party.get("gstin"),
            "invoice_date": time.strftime("%Y-%m-%d"),
            "items": [{"product_id": p["id"], "name": p["name"], "hsn_code": p.get("hsn_code", ""),
                       "unit": p["unit"], "rate": p["sale_price"], "gst_rate": p["gst_rate"],
                       "quantity": 1, "discount_pct": 0}],
            "discount_total": 0, "shipping": 0, "paid_amount": 0, "payment_mode": "cash", "notes": None,
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=demo_headers, json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_pdf_magic_bytes_and_content_type(self, demo_headers, invoice_id):
        r = requests.get(f"{BASE_URL}/api/sales/{invoice_id}/pdf", headers=demo_headers)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:5] == b"%PDF-"
        assert r.content[:8] == b"%PDF-1.4"
        assert len(r.content) > 1024

    def test_pdf_404_for_unknown(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/sales/nonexistent-id-xxx/pdf", headers=demo_headers)
        assert r.status_code == 404

    def test_pdf_tenant_isolation(self, demo_headers, invoice_id, fresh_user_headers):
        other_headers, _ = fresh_user_headers
        r = requests.get(f"{BASE_URL}/api/sales/{invoice_id}/pdf", headers=other_headers)
        # Either 404 (not found in their tenant) or 400 (no active company) — both mean isolation holds
        assert r.status_code in (404, 400), f"Expected isolation, got {r.status_code}: {r.text}"

    def test_share_links(self, demo_headers, invoice_id):
        r = requests.get(f"{BASE_URL}/api/sales/{invoice_id}/share", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "whatsapp_url" in d and d["whatsapp_url"].startswith("https://wa.me/")
        assert "mailto_url" in d and d["mailto_url"].startswith("mailto:")
        assert "phone" in d
        assert "email" in d


# ------------------- POS -------------------
class TestPOS:
    def test_pos_invoice_creation(self, demo_headers):
        prods = requests.get(f"{BASE_URL}/api/masters/products", headers=demo_headers).json()
        assert prods, "no products to test POS"
        p = prods[0]
        stock_before = p["current_stock"]
        payload = {
            "invoice_type": "pos",
            "party_id": None, "party_name": "Walk-in Customer",
            "invoice_date": time.strftime("%Y-%m-%d"),
            "items": [{"product_id": p["id"], "name": p["name"], "hsn_code": p.get("hsn_code", ""),
                       "unit": p["unit"], "rate": p["sale_price"], "gst_rate": p["gst_rate"],
                       "quantity": 2, "discount_pct": 0}],
            "discount_total": 0, "shipping": 0,
            "paid_amount": 0, "payment_mode": "cash", "notes": None,
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=demo_headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["invoice_type"] == "pos"
        assert d["invoice_number"].startswith("POS-"), f"Got {d['invoice_number']}"
        assert d["grand_total"] > 0

        # verify stock deducted
        prods_after = requests.get(f"{BASE_URL}/api/masters/products", headers=demo_headers).json()
        p_after = next(x for x in prods_after if x["id"] == p["id"])
        assert p_after["current_stock"] == stock_before - 2

        # cleanup
        requests.delete(f"{BASE_URL}/api/sales/{d['id']}", headers=demo_headers)


# ------------------- Multi-company -------------------
class TestMultiCompany:
    def test_create_and_switch_company(self, fresh_user_headers):
        headers, email = fresh_user_headers
        # initial
        r = requests.get(f"{BASE_URL}/api/companies", headers=headers)
        assert r.status_code == 200
        cos_initial = r.json()
        assert len(cos_initial) >= 1
        first_id = cos_initial[0]["id"]

        # create 2nd
        body = {
            "name": f"TEST_Co_B_{uuid.uuid4().hex[:6]}",
            "gstin": "29AAAAA0000A1Z5",
            "state": "Karnataka",
            "business_type": "Services",
            "address": "X", "city": "Bangalore", "pincode": "560001",
            "phone": "9999999999", "email": "co@b.in",
            "financial_year_start": "2025-04-01",
        }
        r = requests.post(f"{BASE_URL}/api/companies", headers=headers, json=body)
        assert r.status_code == 200, r.text
        new_co = r.json()
        assert new_co["name"] == body["name"]
        new_id = new_co["id"]

        # list now has 2
        r = requests.get(f"{BASE_URL}/api/companies", headers=headers)
        assert r.status_code == 200
        assert len(r.json()) == len(cos_initial) + 1

        # add a product to company A for isolation check
        prod_a = {"name": "TEST_PROD_A", "unit": "PCS", "sale_price": 100, "purchase_price": 50,
                  "gst_rate": 18, "current_stock": 10, "min_stock": 1, "hsn_code": "1234",
                  "sku": "SA-1", "category": "test"}
        r = requests.post(f"{BASE_URL}/api/masters/products", headers=headers, json=prod_a)
        assert r.status_code == 200, r.text

        prods_a = requests.get(f"{BASE_URL}/api/masters/products", headers=headers).json()
        a_names = {p["name"] for p in prods_a}
        assert "TEST_PROD_A" in a_names

        # switch
        r = requests.post(f"{BASE_URL}/api/auth/switch-company/{new_id}", headers=headers)
        assert r.status_code == 200, r.text

        # me should reflect new active
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=headers).json()
        assert me["active_company_id"] == new_id

        # products on Co B must not contain TEST_PROD_A
        prods_b = requests.get(f"{BASE_URL}/api/masters/products", headers=headers).json()
        b_names = {p["name"] for p in prods_b}
        assert "TEST_PROD_A" not in b_names, "Tenant isolation broken — Co A product visible in Co B"

        # switch back
        r = requests.post(f"{BASE_URL}/api/auth/switch-company/{first_id}", headers=headers)
        assert r.status_code == 200


# ------------------- Regression smoke -------------------
class TestRegression:
    def test_login_me(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=demo_headers)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO["email"]

    def test_dashboard_kpis(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/dashboard/kpis", headers=demo_headers)
        assert r.status_code == 200

    def test_google_exchange_empty(self):
        r = requests.post(f"{BASE_URL}/api/auth/google/exchange", json={})
        assert r.status_code in (400, 401, 422)

    def test_razorpay_create_order(self, demo_headers):
        r = requests.post(f"{BASE_URL}/api/subscription/create-order",
                          headers=demo_headers,
                          json={"plan_id": "pro", "billing_cycle": "monthly"})
        assert r.status_code in (200, 201), r.text
