import hashlib
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.models import RefreshTokenReuse


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def reuse_ttl() -> timedelta:
    return timedelta(seconds=int(getattr(settings, "JWT_REFRESH_REUSE_SECONDS", 30)))


def _blacklist_quietly(raw: str) -> None:
    try:
        RefreshToken(raw).blacklist()
    except (TokenError, AttributeError, Exception):
        pass


def revoke_refresh_cookie(raw: str) -> None:
    """Blacklist the presented cookie and any stored rotation successors."""
    seen: set[str] = set()
    current = raw
    while current and current not in seen:
        seen.add(current)
        _blacklist_quietly(current)
        key = hash_refresh_token(current)
        with transaction.atomic():
            reuse = RefreshTokenReuse.objects.select_for_update().filter(pk=key).first()
            if not reuse or not reuse.refresh:
                break
            nxt = reuse.refresh
            reuse.delete()
        current = nxt


def rotate_or_reuse_refresh(raw: str) -> dict | None:
    """Return {"access", "refresh"} for a valid cookie, including concurrent reuse."""
    key = hash_refresh_token(raw)
    ttl = reuse_ttl()

    with transaction.atomic():
        reuse, _created = RefreshTokenReuse.objects.select_for_update().get_or_create(
            token_hash=key,
            defaults={"refresh": ""},
        )
        if reuse.refresh:
            if timezone.now() - reuse.created_at > ttl:
                return None
            try:
                token = RefreshToken(reuse.refresh)
            except TokenError:
                return None
            return {"access": str(token.access_token), "refresh": reuse.refresh}

        serializer = TokenRefreshSerializer(data={"refresh": raw})
        try:
            if not serializer.is_valid():
                reuse.delete()
                return None
        except TokenError:
            reuse.delete()
            return None

        data = serializer.validated_data
        new_refresh = data.get("refresh", raw)
        reuse.refresh = new_refresh
        reuse.save(update_fields=["refresh"])
        RefreshTokenReuse.objects.filter(created_at__lt=timezone.now() - ttl).exclude(pk=key).delete()
        return {"access": data["access"], "refresh": new_refresh}
