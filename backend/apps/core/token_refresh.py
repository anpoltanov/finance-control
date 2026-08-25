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


def _blacklist_refresh(raw: str) -> None:
    try:
        RefreshToken(raw).blacklist()
    except TokenError:
        pass


def _lock_reuse_row(raw: str) -> RefreshTokenReuse:
    obj, _created = RefreshTokenReuse.objects.select_for_update().get_or_create(
        token_hash=hash_refresh_token(raw),
        defaults={"refresh": ""},
    )
    return obj


def revoke_refresh_cookie(raw: str) -> None:
    """Blacklist the presented cookie and any stored rotation successors."""
    seen: set[str] = set()
    current = raw
    with transaction.atomic():
        while current and current not in seen:
            seen.add(current)
            reuse = _lock_reuse_row(current)
            successor = reuse.refresh
            if successor:
                # rotate_or_reuse_refresh(successor) locks this other key, not
                # the parent row. Hold it until the blacklist commit is visible.
                _lock_reuse_row(successor)
                _blacklist_refresh(successor)
            _blacklist_refresh(current)
            reuse.delete()
            current = successor


def rotate_or_reuse_refresh(raw: str) -> dict | None:
    """Return {"access", "refresh"} for a valid cookie, including concurrent reuse."""
    key = hash_refresh_token(raw)
    ttl = reuse_ttl()
    result: dict | None = None

    with transaction.atomic():
        reuse, _created = RefreshTokenReuse.objects.select_for_update().get_or_create(
            token_hash=key,
            defaults={"refresh": ""},
        )
        if reuse.refresh:
            if timezone.now() - reuse.created_at > ttl:
                reuse.delete()
            else:
                try:
                    token = RefreshToken(reuse.refresh)
                    result = {"access": str(token.access_token), "refresh": reuse.refresh}
                except TokenError:
                    reuse.delete()
        else:
            serializer = TokenRefreshSerializer(data={"refresh": raw})
            try:
                if not serializer.is_valid():
                    reuse.delete()
                else:
                    data = serializer.validated_data
                    new_refresh = data.get("refresh", raw)
                    reuse.refresh = new_refresh
                    reuse.save(update_fields=["refresh"])
                    result = {"access": data["access"], "refresh": new_refresh}
            except TokenError:
                reuse.delete()

    # Prune after releasing this request's row lock so we never lock parent
    # then successor (logout) while another transaction holds successor then parent.
    RefreshTokenReuse.objects.filter(created_at__lt=timezone.now() - ttl).delete()
    return result
