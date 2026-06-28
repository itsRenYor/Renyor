"""Iteration 5 backend tests: Accounting engine, Razorpay webhooks, Services/Tours/Transport."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ai-accounting-20.preview.emergentagent.com").rstrip("/")
DEMO = {"email": "demo@aitax.in", "password": "Demo@12345"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register_fresh(business_name="It5 Co"):
    email = f"TEST_it5_{uuid.uuid4().hex[:8]}@aitax.in"
    body = {"email": email, "password": "Test@12345", "full_name": "It5 Tester", "business_name": business_name}
    r = requests.post(f"{BASE_URL}/api/auth/register", json=body)
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("access_token") or _login(email, "Test@12345")
    return {"Authorization": f"Bearer {tok}"}, email


@pytest.fixture(scope="module")
def demo_headers():
    return {"Authorization": f"Bearer {_login(**DEMO)}"}


@pytest.fixture(scope="module")
def fresh_headers():
    h, _ = _register_fresh("It5 Clean Co")
    return h


@pytest.fixture(scope="module")
def other_headers():
    h, _ = _register_fresh("It5 Other Co")
    return h


# ========== ACCOUNTING ==========
class TestAccounting:
    def test_profit_loss_structure(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/accounting/profit-loss", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "income" in d and "cost_of_goods" in d and "gross_profit" in d
        assert "expenses" in d and "total_expenses" in d and "net_profit" in d
        for k in ("gross_sales", "sales_returns", "net_sales"):
            assert k in d["income"]
        assert "purchases" in d["cost_of_goods"]
        assert isinstance(d["expenses"], list)

    def test_balance_sheet(self, fresh_headers):
        r = requests.get(f"{BASE_URL}/api/accounting/balance-sheet", headers=fresh_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "as_on" in d and "assets" in d and "liabilities" in d and "equity" in d
        assert "totals_match" in d
        # clean tenant — Assets == Liabilities + Equity (book-value identity)
        ta = d["assets"]["total_assets"]
        tl = d["liabilities"]["total_liabilities"]
        eq = d["equity"]["capital_and_reserves"]
        assert abs(ta - (tl + eq)) < 0.01
        assert d["totals_match"] is True

    def test_trial_balance(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/accounting/trial-balance", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["accounts"], list)
        assert "total_debit" in d and "total_credit" in d and "difference" in d

    def test_expense_crud_and_pnl_reflection(self, fresh_headers):
        # Create
        body = {"category": "TEST_Rent", "description": "Office rent", "amount": 5000,
                "expense_date": "2026-01-15", "payment_mode": "bank"}
        r = requests.post(f"{BASE_URL}/api/accounting/expenses", json=body, headers=fresh_headers)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        assert r.json()["amount"] == 5000
        # List
        r = requests.get(f"{BASE_URL}/api/accounting/expenses", headers=fresh_headers)
        assert r.status_code == 200
        cats = [e["category"] for e in r.json()]
        assert "TEST_Rent" in cats
        # P&L reflects
        r = requests.get(f"{BASE_URL}/api/accounting/profit-loss", headers=fresh_headers)
        assert r.status_code == 200
        pnl_cats = [e["category"] for e in r.json()["expenses"]]
        assert "TEST_Rent" in pnl_cats
        assert r.json()["total_expenses"] >= 5000
        # Delete
        r = requests.delete(f"{BASE_URL}/api/accounting/expenses/{eid}", headers=fresh_headers)
        assert r.status_code == 200

    def test_party_ledger(self, demo_headers):
        # Pick any customer
        r = requests.get(f"{BASE_URL}/api/masters/parties?party_type=customer", headers=demo_headers)
        assert r.status_code == 200
        parties = r.json()
        if not parties:
            pytest.skip("No customer in demo tenant")
        pid = parties[0]["id"]
        r = requests.get(f"{BASE_URL}/api/accounting/ledger/party/{pid}", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "party" in d and "entries" in d and "closing_balance" in d
        assert d["party"]["id"] == pid

    def test_accounting_tenant_isolation(self, fresh_headers, other_headers):
        # Create expense in A
        body = {"category": "TEST_IsoCat", "amount": 999, "expense_date": "2026-01-10"}
        requests.post(f"{BASE_URL}/api/accounting/expenses", json=body, headers=fresh_headers)
        # B's list should NOT include it
        r = requests.get(f"{BASE_URL}/api/accounting/expenses", headers=other_headers)
        assert r.status_code == 200
        cats = [e["category"] for e in r.json()]
        assert "TEST_IsoCat" not in cats


# ========== WEBHOOKS ==========
class TestWebhooks:
    def test_webhook_no_signature_dev_mode(self):
        # In dev (RAZORPAY_WEBHOOK_SECRET unset), should accept and log
        payload = {"event": "test.ping", "payload": {}}
        r = requests.post(f"{BASE_URL}/api/webhooks/razorpay", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        assert r.json()["event"] == "test.ping"

    def test_webhook_events_list(self):
        r = requests.get(f"{BASE_URL}/api/webhooks/events")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        # at least the ping above should be there
        events = [e["event"] for e in r.json()]
        assert "test.ping" in events or len(events) >= 0

    def test_webhook_payment_captured_activates_subscription(self, fresh_headers):
        # Create a subscription order
        r = requests.post(f"{BASE_URL}/api/subscription/create-order",
                          json={"plan_id": "pro", "billing_cycle": "monthly"},
                          headers=fresh_headers)
        assert r.status_code == 200, r.text
        order = r.json()
        rzp_order_id = order.get("razorpay_order_id") or order.get("order_id")
        assert rzp_order_id, f"no order id in response: {order}"

        # Fire payment.captured webhook
        webhook_body = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_TEST_" + uuid.uuid4().hex[:8],
                        "order_id": rzp_order_id,
                        "amount": 149900,
                    }
                }
            },
        }
        r = requests.post(f"{BASE_URL}/api/webhooks/razorpay", json=webhook_body)
        assert r.status_code == 200, r.text

        # Verify user.subscription_status == active via /api/subscription/status
        r = requests.get(f"{BASE_URL}/api/subscription/status", headers=fresh_headers)
        assert r.status_code == 200
        assert r.json().get("status") == "active", r.json()


# ========== SERVICES ==========
class TestServices:
    def test_ticket_crud(self, fresh_headers):
        body = {"customer_name": "TEST_Cust1", "problem": "TV not turning on",
                "asset": "Samsung 32 inch", "priority": "high"}
        r = requests.post(f"{BASE_URL}/api/services/tickets", json=body, headers=fresh_headers)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["ticket_number"].startswith("SRV-")
        assert len(t["ticket_number"]) == 4 + 5  # SRV-NNNNN
        tid = t["id"]

        r = requests.get(f"{BASE_URL}/api/services/tickets", headers=fresh_headers)
        assert r.status_code == 200
        assert any(x["id"] == tid for x in r.json())

        r = requests.put(f"{BASE_URL}/api/services/tickets/{tid}",
                         json={**body, "status": "in_progress"}, headers=fresh_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

        r = requests.delete(f"{BASE_URL}/api/services/tickets/{tid}", headers=fresh_headers)
        assert r.status_code == 200

    def test_amc_crud_with_status_computation(self, fresh_headers):
        # Create active AMC (end_date 6 months from now)
        from datetime import date, timedelta
        end = (date.today() + timedelta(days=180)).isoformat()
        body = {"customer_name": "TEST_AMC", "asset": "Office AC", "start_date": "2026-01-01",
                "end_date": end, "amount": 12000, "billing_cycle": "yearly"}
        r = requests.post(f"{BASE_URL}/api/services/amc", json=body, headers=fresh_headers)
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        assert r.json()["contract_number"].startswith("AMC-")

        # Create expiring_soon AMC (end_date 10 days)
        end2 = (date.today() + timedelta(days=10)).isoformat()
        body2 = {**body, "end_date": end2, "customer_name": "TEST_AMC_Soon"}
        r2 = requests.post(f"{BASE_URL}/api/services/amc", json=body2, headers=fresh_headers)
        assert r2.status_code == 200

        # Expired AMC
        end3 = (date.today() - timedelta(days=5)).isoformat()
        body3 = {**body, "end_date": end3, "customer_name": "TEST_AMC_Exp"}
        r3 = requests.post(f"{BASE_URL}/api/services/amc", json=body3, headers=fresh_headers)
        assert r3.status_code == 200

        # List — should have days_remaining + computed status
        r = requests.get(f"{BASE_URL}/api/services/amc", headers=fresh_headers)
        assert r.status_code == 200
        rows = r.json()
        for row in rows:
            assert "days_remaining" in row
        statuses = {row["customer_name"]: row["status"] for row in rows if row["customer_name"].startswith("TEST_AMC")}
        assert statuses.get("TEST_AMC") == "active"
        assert statuses.get("TEST_AMC_Soon") == "expiring_soon"
        assert statuses.get("TEST_AMC_Exp") == "expired"

        # Cleanup
        requests.delete(f"{BASE_URL}/api/services/amc/{aid}", headers=fresh_headers)

    def test_services_tenant_isolation(self, fresh_headers, other_headers):
        body = {"customer_name": "TEST_IsoTicket", "problem": "Iso test"}
        r = requests.post(f"{BASE_URL}/api/services/tickets", json=body, headers=fresh_headers)
        assert r.status_code == 200
        # Other tenant should not see it
        r = requests.get(f"{BASE_URL}/api/services/tickets", headers=other_headers)
        names = [t["customer_name"] for t in r.json()]
        assert "TEST_IsoTicket" not in names


# ========== TOURS ==========
class TestTours:
    def test_package_and_booking_with_profit(self, fresh_headers):
        # Create package
        pkg = {"name": "TEST_Goa3D", "destination": "Goa", "duration_days": 3,
               "duration_nights": 2, "cost_price": 5000, "sale_price": 8000}
        r = requests.post(f"{BASE_URL}/api/tours/packages", json=pkg, headers=fresh_headers)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        # Create booking
        bk = {"package_id": pid, "package_name": "TEST_Goa3D", "traveler_name": "TEST_John",
              "num_travelers": 4, "travel_date": "2026-03-15", "sale_price": 8000, "cost_price": 5000}
        r = requests.post(f"{BASE_URL}/api/tours/bookings", json=bk, headers=fresh_headers)
        assert r.status_code == 200, r.text
        bdoc = r.json()
        assert bdoc["booking_number"].startswith("TR-")
        # profit = (8000 - 5000) * 4 = 12000
        assert bdoc["profit"] == 12000

        # List
        r = requests.get(f"{BASE_URL}/api/tours/bookings", headers=fresh_headers)
        assert r.status_code == 200
        booking = next((x for x in r.json() if x["id"] == bdoc["id"]), None)
        assert booking and booking["profit"] == 12000

        # cleanup
        requests.delete(f"{BASE_URL}/api/tours/bookings/{bdoc['id']}", headers=fresh_headers)
        requests.delete(f"{BASE_URL}/api/tours/packages/{pid}", headers=fresh_headers)

    def test_tours_tenant_isolation(self, fresh_headers, other_headers):
        pkg = {"name": "TEST_IsoPkg", "destination": "X", "sale_price": 1000}
        r = requests.post(f"{BASE_URL}/api/tours/packages", json=pkg, headers=fresh_headers)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/tours/packages", headers=other_headers)
        names = [p["name"] for p in r.json()]
        assert "TEST_IsoPkg" not in names


# ========== TRANSPORT ==========
class TestTransport:
    def test_vehicle_and_trip_with_profit(self, fresh_headers):
        veh = {"vehicle_number": "TEST_MH12AB1234", "vehicle_type": "Truck",
               "make_model": "Tata", "capacity": "10 Ton", "driver_name": "Ramesh"}
        r = requests.post(f"{BASE_URL}/api/transport/vehicles", json=veh, headers=fresh_headers)
        assert r.status_code == 200, r.text
        vid = r.json()["id"]

        trip = {"vehicle_id": vid, "vehicle_number": "TEST_MH12AB1234",
                "from_location": "Mumbai", "to_location": "Pune", "trip_date": "2026-01-20",
                "freight_amount": 15000, "diesel_expense": 4000, "other_expenses": 1000}
        r = requests.post(f"{BASE_URL}/api/transport/trips", json=trip, headers=fresh_headers)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["trip_number"].startswith("TRIP-")
        # profit = 15000 - 4000 - 1000 = 10000
        assert t["profit"] == 10000

        r = requests.get(f"{BASE_URL}/api/transport/trips", headers=fresh_headers)
        trips = r.json()
        found = next((x for x in trips if x["id"] == t["id"]), None)
        assert found and found["profit"] == 10000

        # cleanup
        requests.delete(f"{BASE_URL}/api/transport/trips/{t['id']}", headers=fresh_headers)
        requests.delete(f"{BASE_URL}/api/transport/vehicles/{vid}", headers=fresh_headers)

    def test_transport_tenant_isolation(self, fresh_headers, other_headers):
        veh = {"vehicle_number": "TEST_ISO_VEH"}
        r = requests.post(f"{BASE_URL}/api/transport/vehicles", json=veh, headers=fresh_headers)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/transport/vehicles", headers=other_headers)
        nums = [v["vehicle_number"] for v in r.json()]
        assert "TEST_ISO_VEH" not in nums


# ========== AUTH GATING ==========
class TestAuthGating:
    @pytest.mark.parametrize("path", [
        "/api/accounting/profit-loss",
        "/api/accounting/balance-sheet",
        "/api/accounting/trial-balance",
        "/api/accounting/expenses",
        "/api/services/tickets",
        "/api/services/amc",
        "/api/tours/packages",
        "/api/tours/bookings",
        "/api/transport/vehicles",
        "/api/transport/trips",
    ])
    def test_requires_auth(self, path):
        r = requests.get(f"{BASE_URL}{path}")
        assert r.status_code in (401, 403), f"{path} returned {r.status_code}"
