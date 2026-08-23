import hmac

from django.conf import settings
from django.contrib.auth.models import User
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        raw_token = None
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                text = raw_token.decode("utf-8") if isinstance(raw_token, bytes) else str(raw_token)
                if text.count(".") != 2:
                    raw_token = None
        if raw_token is None:
            cookie = request.COOKIES.get("access_token")
            if cookie:
                raw_token = cookie.encode("utf-8") if isinstance(cookie, str) else cookie
        if raw_token is None:
            return None
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token


class MCPTokenAuthentication(BaseAuthentication):
    """Optional bearer token for a local MCP process. Empty token disables this class."""

    def authenticate(self, request):
        token = getattr(settings, "MCP_API_TOKEN", "") or ""
        if not token:
            return None
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        provided = auth[7:]
        try:
            matched = hmac.compare_digest(provided.encode("utf-8"), token.encode("utf-8"))
        except Exception:
            return None
        if not matched:
            return None
        username = getattr(settings, "MCP_USERNAME", "") or ""
        if username:
            user = User.objects.filter(username=username).first()
        else:
            user = User.objects.order_by("id").first()
        if user is None:
            raise AuthenticationFailed("MCP user is not configured.")
        return (user, None)
