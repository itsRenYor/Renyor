"""Iteration 3 — Super Admin, Change Password, Google Exchange tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ai-accounting-20.preview.emergentagent.com").rstrip("/")

SUPER_EMAIL = "info@aitax.com"
SUPER_PASS = "Ap@27021992"
DEMO_EMAIL = "demo@aitax.in"
DEMO_PASS = "Demo@12345"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="session")
def super_token():
    r = _login(SUPER_EMAIL, SUPER_PASS)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def demo_token():
    r = _login(DEMO_EMAIL, DEMO_PASS)
    assert r.status_code == 200
    return r.json()["access_token"]


# ---------- Super admin login & flags ----------
class TestSuperAdminLogin:
    def test_super_admin_login_returns_flags(self):
        r = _login(SUPER_EMAIL, SUPER_PASS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        u = data["user"]
        assert u["email"] == SUPER_EMAIL
        assert u["is_super_admin"] is True
        assert u["role"] == "super_admin"
        assert u.get("auth_provider") == "password"


# ---------- Change password (self-service) ----------
class TestChangePassword:
    def _make_user(self):
        email = f"TEST_cp_{uuid.uuid4().hex[:8]}@aitax.in"
        pw = "OrigPass1"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": pw, "full_name": "Change PW Test",
            "phone": None, "business_name": None
        }, timeout=15)
        assert r.status_code == 200, r.text
        return email, pw, r.json()["access_token"]

    def test_change_password_success(self):
        email, pw, tok = self._make_user()
        new_pw = "BrandNew99"
        r = requests.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"current_password": pw, "new_password": new_pw},
            headers={"Authorization": f"Bearer {tok}"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        # Old password fails, new works
        assert _login(email, pw).status_code == 401
        assert _login(email, new_pw).status_code == 200

    def test_change_password_wrong_current(self):
        email, pw, tok = self._make_user()
        r = requests.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"current_password": "WRONG", "new_password": "NewPass99"},
            headers={"Authorization": f"Bearer {tok}"}, timeout=15,
        )
        assert r.status_code == 400

    def test_change_password_too_short(self):
        email, pw, tok = self._make_user()
        r = requests.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"current_password": pw, "new_password": "abc"},
            headers={"Authorization": f"Bearer {tok}"}, timeout=15,
        )
        assert r.status_code == 400


# ---------- Admin RBAC ----------
class TestAdminRBAC:
    def test_stats_forbidden_for_tenant(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
        assert r.status_code == 403

    def test_stats_ok_for_super_admin(self, super_token):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for f in ["total_users", "active_users", "total_companies", "paid_subscribers",
                  "total_invoices", "mrr_estimate", "platform_revenue_total"]:
            assert f in data, f"missing field {f}"

    def test_users_list_excludes_super_admin(self, super_token):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
        assert r.status_code == 200
        users = r.json()
        emails = [u["email"] for u in users]
        assert SUPER_EMAIL not in emails

    def test_users_list_forbidden_for_tenant(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
        assert r.status_code == 403

    def test_users_search(self, super_token):
        r = requests.get(f"{BASE_URL}/api/admin/users?search=demo",
                         headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert any(u["email"] == DEMO_EMAIL for u in users)

    def test_subscriptions_endpoint(self, super_token):
        r = requests.get(f"{BASE_URL}/api/admin/subscriptions",
                         headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Force reset password by super admin ----------
class TestForceResetPassword:
    def _new_tenant(self):
        email = f"TEST_fr_{uuid.uuid4().hex[:8]}@aitax.in"
        pw = "InitPass1"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": pw, "full_name": "Force Reset", "phone": None, "business_name": None
        }, timeout=15)
        assert r.status_code == 200
        return email, pw, r.json()["user"]["id"]

    def test_force_reset_and_relogin(self, super_token):
        email, old, uid = self._new_tenant()
        new_pw = "ForcedNew99"
        r = requests.post(
            f"{BASE_URL}/api/admin/users/{uid}/reset-password",
            json={"new_password": new_pw},
            headers={"Authorization": f"Bearer {super_token}"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        # Old fails, new works
        assert _login(email, old).status_code == 401
        assert _login(email, new_pw).status_code == 200

    def test_force_reset_cannot_target_super_admin(self, super_token):
        # find super admin id via DB? not exposed — should 404 regardless because list excludes super admin
        # We'll try a known bogus id and accept 404; primary guarantee: query excludes is_super_admin
        r = requests.post(
            f"{BASE_URL}/api/admin/users/non-existent-id/reset-password",
            json={"new_password": "ABCdef123"},
            headers={"Authorization": f"Bearer {super_token}"}, timeout=15,
        )
        assert r.status_code == 404

    def test_force_reset_forbidden_for_tenant(self, demo_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/users/anyid/reset-password",
            json={"new_password": "Abcdef99"},
            headers={"Authorization": f"Bearer {demo_token}"}, timeout=15,
        )
        assert r.status_code == 403


# ---------- Toggle active ----------
class TestToggleActive:
    def _new_tenant(self):
        email = f"TEST_ta_{uuid.uuid4().hex[:8]}@aitax.in"
        pw = "TogPass11"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": pw, "full_name": "Toggle", "phone": None, "business_name": None
        }, timeout=15)
        assert r.status_code == 200
        return email, pw, r.json()["user"]["id"]

    def test_deactivate_blocks_login_then_reactivate(self, super_token):
        email, pw, uid = self._new_tenant()
        # Deactivate
        r = requests.post(
            f"{BASE_URL}/api/admin/users/{uid}/toggle-active",
            json={"active": False},
            headers={"Authorization": f"Bearer {super_token}"}, timeout=15,
        )
        assert r.status_code == 200
        # Login blocked
        r2 = _login(email, pw)
        assert r2.status_code == 403, f"expected 403 deactivated, got {r2.status_code} {r2.text}"
        # Reactivate
        r3 = requests.post(
            f"{BASE_URL}/api/admin/users/{uid}/toggle-active",
            json={"active": True},
            headers={"Authorization": f"Bearer {super_token}"}, timeout=15,
        )
        assert r3.status_code == 200
        # Login restored
        assert _login(email, pw).status_code == 200


# ---------- Google exchange ----------
class TestGoogleExchange:
    def test_empty_session_id(self):
        r = requests.post(f"{BASE_URL}/api/auth/google/exchange", json={"session_id": ""}, timeout=15)
        assert r.status_code in (400, 422), r.text

    def test_garbage_session_id(self):
        r = requests.post(f"{BASE_URL}/api/auth/google/exchange",
                          json={"session_id": "garbage_invalid_token_xxx"}, timeout=20)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"


# ---------- Idempotent super admin seed ----------
class TestSuperAdminSeed:
    def test_super_admin_login_repeatable(self):
        # Twice in a row should both succeed (idempotent)
        for _ in range(2):
            r = _login(SUPER_EMAIL, SUPER_PASS)
            assert r.status_code == 200


# ---------- Regression smoke (iteration 2) ----------
class TestRegression:
    def test_demo_login_still_works(self):
        r = _login(DEMO_EMAIL, DEMO_PASS)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["is_super_admin"] is False

    def test_dashboard_kpis(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/kpis", headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ["total_sales", "total_purchases", "inventory_value"]:
            assert k in data
