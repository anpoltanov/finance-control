import os

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
        else:
            raw_token = request.COOKIES.get("access_token")
        if raw_token is None:
            return None
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token


class MCPTokenAuthentication(BaseAuthentication):
    """Optional bearer token for MCP server and automation."""

    def authenticate(self, request):
        token = os.environ.get("MCP_API_TOKEN", "")
        if not token:
            return None
        auth = request.headers.get("Authorization", "")
        if auth == f"Bearer {token}":
            from django.contrib.auth.models import User

            user = User.objects.filter(is_superuser=True).first()
            if user:
                return (user, None)
        return None
