from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import override_settings
from django.urls import NoReverseMatch, reverse
from rest_framework.test import APITestCase

from apps.core.throttles import LoginRateThrottle
from apps.core.views import LoginView


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

    def test_second_tab_can_reuse_just_rotated_refresh_cookie(self):
        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        first = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(first.status_code, 200, first.content)
        new_refresh = self.client.cookies.get("refresh_token").value
        self.assertNotEqual(new_refresh, old_refresh)

        self.client.cookies["refresh_token"] = old_refresh
        second = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(self.client.cookies.get("refresh_token").value, new_refresh)
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200)

    def test_rotated_refresh_cookie_is_rejected_after_reuse_window(self):
        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        self.client.post("/api/v1/auth/refresh/")

        from datetime import timedelta

        from django.utils import timezone

        from apps.core.models import RefreshTokenReuse
        from apps.core.token_refresh import hash_refresh_token

        RefreshTokenReuse.objects.filter(pk=hash_refresh_token(old_refresh)).update(
            created_at=timezone.now() - timedelta(seconds=31)
        )
        self.client.cookies["refresh_token"] = old_refresh
        res = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(res.status_code, 401)

    def test_logout_with_pre_rotation_cookie_revokes_successor_after_reuse_window(self):
        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        self.client.post("/api/v1/auth/refresh/")
        successor = self.client.cookies.get("refresh_token").value

        from datetime import timedelta

        from django.utils import timezone

        from apps.core.models import RefreshTokenReuse
        from apps.core.token_refresh import hash_refresh_token

        RefreshTokenReuse.objects.filter(pk=hash_refresh_token(old_refresh)).update(
            created_at=timezone.now() - timedelta(seconds=31)
        )
        self.client.cookies["refresh_token"] = old_refresh
        self.assertEqual(self.client.post("/api/v1/auth/refresh/").status_code, 401)

        self.client.cookies["refresh_token"] = old_refresh
        self.client.post("/api/v1/auth/logout/")
        self.client.cookies["refresh_token"] = successor
        self.assertEqual(self.client.post("/api/v1/auth/refresh/").status_code, 401)

    def test_logout_with_successor_deletes_parent_reuse_mapping(self):
        from apps.core.models import RefreshTokenReuse
        from apps.core.token_refresh import hash_refresh_token

        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        self.client.post("/api/v1/auth/refresh/")
        successor = self.client.cookies.get("refresh_token").value
        self.assertTrue(RefreshTokenReuse.objects.filter(pk=hash_refresh_token(old_refresh)).exists())

        self.client.cookies["refresh_token"] = successor
        self.client.post("/api/v1/auth/logout/")
        self.assertFalse(RefreshTokenReuse.objects.filter(pk=hash_refresh_token(old_refresh)).exists())
        self.client.cookies["refresh_token"] = old_refresh
        self.assertEqual(self.client.post("/api/v1/auth/refresh/").status_code, 401)

    def test_logout_invalidates_reuse_of_previous_refresh_cookie(self):
        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        self.client.post("/api/v1/auth/refresh/")
        self.client.post("/api/v1/auth/logout/")
        self.client.cookies["refresh_token"] = old_refresh
        res = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(res.status_code, 401)

    def test_logout_with_pre_rotation_cookie_revokes_successor(self):
        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        self.client.post("/api/v1/auth/refresh/")
        successor = self.client.cookies.get("refresh_token").value
        self.assertNotEqual(successor, old_refresh)

        self.client.cookies["refresh_token"] = old_refresh
        self.client.post("/api/v1/auth/logout/")

        self.client.cookies["refresh_token"] = old_refresh
        self.assertEqual(self.client.post("/api/v1/auth/refresh/").status_code, 401)
        self.client.cookies["refresh_token"] = successor
        self.assertEqual(self.client.post("/api/v1/auth/refresh/").status_code, 401)

    def test_revoke_blacklists_successor_before_deleting_reuse_row(self):
        from unittest.mock import patch

        from apps.core.models import RefreshTokenReuse
        from apps.core import token_refresh as tr

        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        self.client.post("/api/v1/auth/refresh/")
        successor = self.client.cookies.get("refresh_token").value
        key = tr.hash_refresh_token(old_refresh)
        real = tr._blacklist_refresh
        blacklisted = []

        def spy(raw):
            if raw == successor:
                self.assertTrue(RefreshTokenReuse.objects.filter(pk=key).exists())
            blacklisted.append(raw)
            return real(raw)

        with patch.object(tr, "_blacklist_refresh", side_effect=spy):
            tr.revoke_refresh_cookie(old_refresh)

        self.assertIn(successor, blacklisted)
        self.assertFalse(RefreshTokenReuse.objects.filter(pk=key).exists())
        self.client.cookies["refresh_token"] = successor
        self.assertEqual(self.client.post("/api/v1/auth/refresh/").status_code, 401)

    def test_reuse_locks_successor_row_before_minting(self):
        from unittest.mock import patch

        from apps.core import token_refresh as tr

        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        self.client.post("/api/v1/auth/refresh/")
        successor = self.client.cookies.get("refresh_token").value
        calls: list[set[str]] = []
        real = tr._lock_hashes

        def spy(hashes):
            calls.append(set(hashes))
            return real(hashes)

        with patch.object(tr, "_lock_hashes", side_effect=spy):
            data = tr.rotate_or_reuse_refresh(old_refresh)

        self.assertIsNotNone(data)
        self.assertTrue(
            any(
                tr.hash_refresh_token(old_refresh) in locked_hashes
                and tr.hash_refresh_token(successor) in locked_hashes
                for locked_hashes in calls
            )
        )

    def test_successor_lock_placeholder_does_not_poison_reuse_ttl(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.core.models import RefreshTokenReuse
        from apps.core.token_refresh import hash_refresh_token

        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        self.client.post("/api/v1/auth/refresh/")
        successor = self.client.cookies.get("refresh_token").value
        RefreshTokenReuse.objects.update_or_create(
            token_hash=hash_refresh_token(successor),
            defaults={"refresh": ""},
        )
        RefreshTokenReuse.objects.filter(pk=hash_refresh_token(successor)).update(
            created_at=timezone.now() - timedelta(seconds=31)
        )

        self.client.cookies["refresh_token"] = successor
        first = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(first.status_code, 200, first.content)
        rotated = self.client.cookies.get("refresh_token").value
        self.assertNotEqual(rotated, successor)

        self.client.cookies["refresh_token"] = successor
        second = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(self.client.cookies.get("refresh_token").value, rotated)

    def test_reuse_of_blacklisted_successor_returns_401_not_500(self):
        from unittest.mock import patch

        from rest_framework_simplejwt.exceptions import TokenError

        self.client.post("/api/v1/auth/login/", {"username": "u", "password": "p"}, format="json")
        old_refresh = self.client.cookies.get("refresh_token").value
        self.client.post("/api/v1/auth/refresh/")
        self.client.cookies["refresh_token"] = old_refresh
        with patch("apps.core.token_refresh.RefreshToken", side_effect=TokenError("blacklisted")):
            res = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(res.status_code, 401)


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
