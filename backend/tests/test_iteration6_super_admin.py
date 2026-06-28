"""Iteration 6 — Super Admin Console + Maintenance Mode gating tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ai-accounting-20.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "info@aitax.com"
SUPER_PASS = "Ap@27021992"
DEMO_EMAIL = "demo@aitax.in"
DEMO_PASS = "Demo@12345"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


@pytest.fixture(scope="module")
def super_token():
    r = _login(SUPER_EMAIL, SUPER_PASS)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["is_super_admin"] is True
    return data["access_token"]


@pytest.fixture(scope="module")
def demo_token():
    r = _login(DEMO_EMAIL, DEMO_PASS)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_user_id(super_token):
    h = {"Authorization": f"Bearer {super_token}"}
    r = requests.get(f"{API}/admin/users", headers=h, timeout=20)
    assert r.status_code == 200
    for u in r.json():
        if u["email"] == DEMO_EMAIL:
            return u["id"]
    pytest.fail("demo user not found")


def hdr(t):
    return {"Authorization": f"Bearer {t}"}


# ===================== AUTH / GATING =====================
class TestAuthAndGating:
    def test_super_admin_login(self):
        r = _login(SUPER_EMAIL, SUPER_PASS)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["is_super_admin"] is True
        assert isinstance(d["access_token"], str) and len(d["access_token"]) > 20

    def test_tenant_cannot_access_admin(self, demo_token):
        r = requests.get(f"{API}/admin/stats", headers=hdr(demo_token), timeout=20)
        assert r.status_code == 403
        assert "super" in r.text.lower()

    def test_unauthenticated_admin_endpoints(self):
        for ep in ["/admin/stats", "/admin/users", "/admin/settings", "/admin/plans"]:
            r = requests.get(f"{API}{ep}", timeout=20)
            assert r.status_code in (401, 403), f"{ep} returned {r.status_code}"


# ===================== STATS & ANALYTICS =====================
class TestStatsAnalytics:
    def test_stats(self, super_token):
        r = requests.get(f"{API}/admin/stats", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_users", "active_users", "paid_subscribers", "mrr_estimate",
                  "conversion_rate_pct", "new_signups_30d"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["total_users"], int)
        assert d["total_users"] >= 1

    def test_signups_analytics(self, super_token):
        r = requests.get(f"{API}/admin/analytics/signups?days=30", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_mrr_trend(self, super_token):
        r = requests.get(f"{API}/admin/analytics/mrr-trend?months=6", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ===================== TENANT MGMT =====================
class TestTenantMgmt:
    def test_list_users(self, super_token):
        r = requests.get(f"{API}/admin/users", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        emails = [u["email"] for u in users]
        assert DEMO_EMAIL in emails

    def test_snapshot(self, super_token, demo_user_id):
        r = requests.get(f"{API}/admin/users/{demo_user_id}/snapshot",
                         headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("user", "companies", "stats", "recent_invoices"):
            assert k in d
        assert d["user"]["email"] == DEMO_EMAIL
        # stats contains expected counts
        for k in ("customer_count", "supplier_count", "product_count"):
            assert k in d["stats"]

    def test_reset_password_and_restore(self, super_token, demo_user_id):
        new_pw = "Reset@99999"
        # reset
        r = requests.post(f"{API}/admin/users/{demo_user_id}/reset-password",
                          json={"new_password": new_pw}, headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        # login with new
        r2 = _login(DEMO_EMAIL, new_pw)
        assert r2.status_code == 200
        # restore
        r3 = requests.post(f"{API}/admin/users/{demo_user_id}/reset-password",
                           json={"new_password": DEMO_PASS}, headers=hdr(super_token), timeout=20)
        assert r3.status_code == 200
        # login with original
        r4 = _login(DEMO_EMAIL, DEMO_PASS)
        assert r4.status_code == 200

    def test_toggle_active_and_restore(self, super_token, demo_user_id):
        # deactivate
        r = requests.post(f"{API}/admin/users/{demo_user_id}/toggle-active",
                         json={"active": False}, headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        # login should fail
        r2 = _login(DEMO_EMAIL, DEMO_PASS)
        assert r2.status_code in (401, 403), f"expected fail, got {r2.status_code}"
        # restore
        r3 = requests.post(f"{API}/admin/users/{demo_user_id}/toggle-active",
                          json={"active": True}, headers=hdr(super_token), timeout=20)
        assert r3.status_code == 200
        # login works again
        r4 = _login(DEMO_EMAIL, DEMO_PASS)
        assert r4.status_code == 200

    def test_extend_trial(self, super_token, demo_user_id):
        r = requests.post(f"{API}/admin/users/{demo_user_id}/extend-trial",
                         json={"days": 14}, headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert "expires_at" in d
        # verify via snapshot
        snap = requests.get(f"{API}/admin/users/{demo_user_id}/snapshot",
                            headers=hdr(super_token), timeout=20).json()
        assert snap["user"]["subscription_status"] == "trial"

    def test_set_plan_and_cancel(self, super_token, demo_user_id):
        r = requests.post(f"{API}/admin/users/{demo_user_id}/set-plan",
                         json={"plan_id": "pro", "billing_cycle": "monthly", "days": 30},
                         headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        snap = requests.get(f"{API}/admin/users/{demo_user_id}/snapshot",
                            headers=hdr(super_token), timeout=20).json()
        assert snap["user"]["subscription_plan"] == "pro"
        assert snap["user"]["subscription_status"] == "active"

        # cancel
        r2 = requests.post(f"{API}/admin/users/{demo_user_id}/cancel-subscription",
                          headers=hdr(super_token), timeout=20)
        assert r2.status_code == 200
        snap2 = requests.get(f"{API}/admin/users/{demo_user_id}/snapshot",
                             headers=hdr(super_token), timeout=20).json()
        assert snap2["user"]["subscription_status"] == "cancelled"

        # restore demo to trial state
        requests.post(f"{API}/admin/users/{demo_user_id}/extend-trial",
                     json={"days": 14}, headers=hdr(super_token), timeout=20)


# ===================== PLANS =====================
class TestPlans:
    def test_default_plans_seeded(self, super_token):
        r = requests.get(f"{API}/admin/plans", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        plans = r.json()
        ids = [p["id"] for p in plans]
        for pid in ("starter", "pro", "enterprise"):
            assert pid in ids

    def test_update_plan_pricing(self, super_token):
        # snapshot current
        plans = requests.get(f"{API}/admin/plans", headers=hdr(super_token), timeout=20).json()
        pro = next(p for p in plans if p["id"] == "pro")
        original_monthly = pro["monthly"]
        new_monthly = original_monthly + 100
        body = {
            "id": "pro", "name": pro["name"], "monthly": new_monthly,
            "quarterly": pro["quarterly"], "yearly": pro["yearly"],
            "businesses": pro.get("businesses", 3), "users": pro.get("users", 10),
            "popular": pro.get("popular", True), "features": pro.get("features", []),
        }
        r = requests.put(f"{API}/admin/plans/pro", json=body,
                        headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        # verify
        plans2 = requests.get(f"{API}/admin/plans", headers=hdr(super_token), timeout=20).json()
        pro2 = next(p for p in plans2 if p["id"] == "pro")
        assert pro2["monthly"] == new_monthly
        # restore
        body["monthly"] = original_monthly
        requests.put(f"{API}/admin/plans/pro", json=body,
                    headers=hdr(super_token), timeout=20)


# ===================== FEATURE FLAGS =====================
class TestFeatureFlags:
    def test_get_default_flags(self, super_token):
        r = requests.get(f"{API}/admin/feature-flags", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("ai_features", "whatsapp_share", "pos_module"):
            assert k in d

    def test_update_flag_persists(self, super_token):
        # toggle ai_features
        cur = requests.get(f"{API}/admin/feature-flags", headers=hdr(super_token), timeout=20).json()
        orig = cur.get("ai_features", False)
        new_val = not orig
        r = requests.put(f"{API}/admin/feature-flags",
                        json={"ai_features": new_val},
                        headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        re_get = requests.get(f"{API}/admin/feature-flags",
                              headers=hdr(super_token), timeout=20).json()
        assert re_get["ai_features"] == new_val
        # restore
        requests.put(f"{API}/admin/feature-flags",
                    json={"ai_features": orig},
                    headers=hdr(super_token), timeout=20)


# ===================== SETTINGS =====================
class TestSettings:
    def test_get_default_settings(self, super_token):
        r = requests.get(f"{API}/admin/settings", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        s = r.json()
        assert s["maintenance_mode"] is False
        assert s["signup_mode"] == "open"
        assert s["platform_name"] == "AITAX"
        assert "security" in s

    def test_update_settings_persists(self, super_token):
        orig = requests.get(f"{API}/admin/settings", headers=hdr(super_token), timeout=20).json()
        orig_name = orig["platform_name"]
        r = requests.put(f"{API}/admin/settings",
                        json={"platform_name": "AITAX-TEST"},
                        headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        s2 = requests.get(f"{API}/admin/settings", headers=hdr(super_token), timeout=20).json()
        assert s2["platform_name"] == "AITAX-TEST"
        # restore
        requests.put(f"{API}/admin/settings",
                    json={"platform_name": orig_name},
                    headers=hdr(super_token), timeout=20)


# ===================== AUDIT / WEBHOOKS / SUBS / BACKUP =====================
class TestObservability:
    def test_audit_logs(self, super_token):
        r = requests.get(f"{API}/admin/audit-logs", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list)
        # at least one action from prior tests
        actions = [l.get("action") for l in logs]
        assert any(a for a in actions), "expected some audit log entries from prior tests"

    def test_webhook_events(self, super_token):
        r = requests.get(f"{API}/admin/webhook-events", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_subscriptions(self, super_token):
        r = requests.get(f"{API}/admin/subscriptions", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_backup(self, super_token):
        r = requests.get(f"{API}/admin/backup", headers=hdr(super_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("exported_at", "version", "collection_counts", "data"):
            assert k in d
        assert d["collection_counts"].get("users", 0) >= 1


# ===================== MAINTENANCE MODE GATING (CRITICAL) =====================
class TestMaintenanceMode:
    def test_maintenance_blocks_tenant_allows_admin_and_auth(self, super_token, demo_token):
        try:
            # enable
            r = requests.put(f"{API}/admin/settings",
                            json={"maintenance_mode": True,
                                  "maintenance_message": "Testing maintenance"},
                            headers=hdr(super_token), timeout=20)
            assert r.status_code == 200

            # tenant request to non-admin/non-auth endpoint must be 503
            r1 = requests.get(f"{API}/dashboard/kpis",
                             headers=hdr(demo_token), timeout=20)
            assert r1.status_code == 503, f"expected 503, got {r1.status_code}: {r1.text[:200]}"
            body = r1.json()
            assert body.get("maintenance_mode") is True

            r2 = requests.get(f"{API}/sales/invoices",
                             headers=hdr(demo_token), timeout=20)
            assert r2.status_code == 503

            # super admin must still work
            r3 = requests.get(f"{API}/admin/stats",
                             headers=hdr(super_token), timeout=20)
            assert r3.status_code == 200

            # auth endpoints must still work
            r4 = _login(DEMO_EMAIL, DEMO_PASS)
            assert r4.status_code == 200, f"login broke under maintenance: {r4.status_code}"
            r5 = requests.get(f"{API}/auth/me",
                             headers=hdr(demo_token), timeout=20)
            assert r5.status_code == 200

        finally:
            # ALWAYS disable maintenance mode
            requests.put(f"{API}/admin/settings",
                        json={"maintenance_mode": False},
                        headers=hdr(super_token), timeout=20)

        # tenant traffic resumes
        r6 = requests.get(f"{API}/dashboard/kpis",
                         headers=hdr(demo_token), timeout=20)
        assert r6.status_code == 200, f"tenant blocked after disabling maintenance: {r6.status_code}"
