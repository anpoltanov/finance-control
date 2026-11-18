from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import SimpleTestCase, override_settings
from django.urls import NoReverseMatch, reverse
from django.utils.dateparse import parse_datetime
from rest_framework.test import APITestCase

from apps.core.throttles import LoginRateThrottle
from apps.core.views import LoginView
from apps.ledger.models import Account, Transaction
from config.settings import _parse_host_list


class ParseHostListTests(SimpleTestCase):
    def test_strips_scheme_quotes_and_path(self):
        self.assertEqual(
            _parse_host_list('https://finance.example.com, "app.example.com"'),
            ["finance.example.com", "app.example.com"],
        )


class AdminRemovedTests(APITestCase):
    def test_admin_urls_are_not_registered(self):
        with self.assertRaises(NoReverseMatch):
            reverse("admin:index")


class SeedUserTests(APITestCase):
    def test_seed_user_is_not_staff_or_superuser(self):
        call_command("seed_user", username="admin", password="secret-pass")
        user = User.objects.get(username="admin")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password("secret-pass"))


class AuthCookieTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")

    def test_login_sets_cookies_and_me_works(self):
        res = self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn("access_token", res.cookies)
        self.assertIn("refresh_token", res.cookies)
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "u")

    def test_refresh_issues_new_access_cookie(self):
        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_access = self.client.cookies.get("access_token").value
        res = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertNotEqual(self.client.cookies.get("access_token").value, old_access)
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200)

    def test_logout_clears_cookies_and_blacklists_refresh(self):
        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        refresh = self.client.cookies.get("refresh_token").value
        res = self.client.post("/api/v1/auth/logout/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.cookies["access_token"].value, "")
        self.assertEqual(res.cookies["refresh_token"].value, "")
        self.client.cookies["refresh_token"] = refresh
        again = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(again.status_code, 401)

    def test_login_rejects_bad_password(self):
        res = self.client.post("/api/v1/auth/login/", {"username": "u", "password": "nope"}, format="json")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data["detail"], "Invalid credentials.")


class LoginThrottleTests(APITestCase):
    def test_login_view_uses_login_throttle(self):
        self.assertIn(LoginRateThrottle, LoginView.throttle_classes)

    def test_login_is_throttled(self):
        from django.core.cache import cache

        cache.clear()
        previous = getattr(LoginRateThrottle, "rate", None)
        LoginRateThrottle.rate = "3/min"
        try:
            for _ in range(3):
                res = self.client.post("/api/v1/auth/login/", {"username": "nope", "password": "nope"}, format="json")
                self.assertEqual(res.status_code, 401)
            res = self.client.post("/api/v1/auth/login/", {"username": "nope", "password": "nope"}, format="json")
            self.assertEqual(res.status_code, 429)
        finally:
            if previous is None:
                delattr(LoginRateThrottle, "rate")
            else:
                LoginRateThrottle.rate = previous


class SyncDateTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.client.force_authenticate(self.user)

    def test_invalid_since_returns_400(self):
        res = self.client.get("/api/v1/sync/", {"since": "not-a-date"})
        self.assertEqual(res.status_code, 400)

    def test_invalid_report_from_returns_400(self):
        res = self.client.get("/api/v1/reports/summary/", {"from": "yesterday"})
        self.assertEqual(res.status_code, 400)


class SyncDeletionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="syncer", password="p")
        self.client.force_authenticate(self.user)
        self.account = Account.objects.create(user=self.user, title="Cash")

    def _create(self, amount):
        res = self.client.post(
            "/api/v1/transactions/",
            {
                "type": "expense",
                "account": self.account.id,
                "amount": amount,
                "date": "2026-08-24T12:26:00+03:00",
                "currency_code": "RUB",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        return res.data["id"]

    def test_soft_delete_is_in_the_next_incremental_sync(self):
        baseline = self.client.get("/api/v1/sync/")
        self.assertEqual(baseline.status_code, 200, baseline.content)
        tx_id = self._create("10.00")
        created = self.client.get("/api/v1/sync/", {"since": baseline.data["synced_at"]})
        self.assertIn(tx_id, [row["id"] for row in created.data["transactions"]])
        Transaction.objects.get(pk=tx_id).soft_delete()
        deleted = self.client.get("/api/v1/sync/", {"since": created.data["synced_at"]})
        self.assertEqual(deleted.status_code, 200, deleted.content)
        self.assertIn(tx_id, deleted.data["deleted_ids"]["transactions"])
        self.assertNotIn(tx_id, [row["id"] for row in deleted.data["transactions"]])

    def test_delete_at_the_cursor_instant_is_not_skipped(self):
        tx_id = self._create("11.00")
        baseline = self.client.get("/api/v1/sync/")
        cursor = parse_datetime(baseline.data["synced_at"])
        self.assertIsNotNone(cursor)
        tx = Transaction.objects.get(pk=tx_id)
        tx.deleted_at = cursor
        tx.save(update_fields=["deleted_at"])
        res = self.client.get("/api/v1/sync/", {"since": baseline.data["synced_at"]})
        self.assertIn(tx_id, res.data["deleted_ids"]["transactions"])
        self.assertNotIn(tx_id, [row["id"] for row in res.data["transactions"]])


class McpAuthTests(APITestCase):
    @override_settings(MCP_API_TOKEN="secret-mcp-token", MCP_USERNAME="")
    def test_mcp_token_authenticates_first_user_without_superuser(self):
        user = User.objects.create_user(username="plain", password="p", is_staff=False, is_superuser=False)
        res = self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION="Bearer secret-mcp-token")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data["id"], user.id)

    @override_settings(MCP_API_TOKEN="")
    def test_empty_mcp_token_does_not_authenticate(self):
        User.objects.create_user(username="plain", password="p")
        res = self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION="Bearer secret-mcp-token")
        self.assertEqual(res.status_code, 401)
