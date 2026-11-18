import hashlib
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.utils import OperationalError
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.models import RefreshTokenReuse


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def reuse_ttl() -> timedelta:
    return timedelta(seconds=int(getattr(settings, "JWT_REFRESH_REUSE_SECONDS", 30)))


def reuse_row_retention() -> timedelta:
    """Keep parent→successor mappings until the refresh token itself would expire.

    Issuing reused tokens stops after reuse_ttl(); logout still needs the row.
    """
    return settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]


def _blacklist_refresh(raw: str) -> None:
    try:
        RefreshToken(raw).blacklist()
    except TokenError:
        pass


def _store_successor(reuse: RefreshTokenReuse, new_refresh: str) -> None:
    reuse.refresh = new_refresh
    reuse.created_at = timezone.now()
    reuse.save(update_fields=["refresh", "created_at"])


def _lock_hashes(hashes: set[str]) -> dict[str, RefreshTokenReuse]:
    """Lock reuse rows in lexicographic key order to avoid AB-BA deadlocks."""
    locked: dict[str, RefreshTokenReuse] = {}
    for token_hash in sorted(hashes):
        obj, _created = RefreshTokenReuse.objects.select_for_update().get_or_create(
            token_hash=token_hash,
            defaults={"refresh": ""},
        )
        locked[token_hash] = obj
    return locked


def _lock_reuse_row(raw: str) -> RefreshTokenReuse:
    return _lock_hashes({hash_refresh_token(raw)})[hash_refresh_token(raw)]


def _acquire_stable_locks(hashes: set[str], presented: str) -> dict[str, RefreshTokenReuse]:
    """Expand the related-hash set without holding a partial lock order.

    Each failed expansion rolls back its savepoint so the next attempt can lock
    the full set in lexicographic order.
    """
    hashes = set(hashes)
    while True:
        sid = transaction.savepoint()
        locked = _lock_hashes(hashes)
        needed = _related_reuse_hashes(hashes, presented)
        if needed <= hashes:
            transaction.savepoint_commit(sid)
            return locked
        hashes = needed
        transaction.savepoint_rollback(sid)


def _retry_deadlock(fn, *args, **kwargs):
    last_error: OperationalError | None = None
    for _ in range(3):
        try:
            return fn(*args, **kwargs)
        except OperationalError as exc:
            last_error = exc
    assert last_error is not None
    raise last_error


def _related_reuse_hashes(hashes: set[str], presented: str) -> set[str]:
    needed = set(hashes)
    rows = list(RefreshTokenReuse.objects.filter(pk__in=hashes))
    stored = [presented, *[row.refresh for row in rows if row.refresh]]
    for row in rows:
        needed.add(row.token_hash)
        if row.refresh:
            needed.add(hash_refresh_token(row.refresh))
    for parent in RefreshTokenReuse.objects.filter(refresh__in=stored):
        needed.add(parent.token_hash)
    return needed


def revoke_refresh_cookie(raw: str) -> None:
    """Blacklist the presented cookie, stored successors, and parent mappings."""
    _retry_deadlock(_revoke_refresh_cookie, raw)


def _revoke_refresh_cookie(raw: str) -> None:
    presented_hash = hash_refresh_token(raw)
    with transaction.atomic():
        locked = _acquire_stable_locks({presented_hash}, raw)
        tokens = {raw}
        for row in locked.values():
            if row.refresh:
                tokens.add(row.refresh)
        for token in tokens:
            _blacklist_refresh(token)
        RefreshTokenReuse.objects.filter(pk__in=locked).delete()


def rotate_or_reuse_refresh(raw: str) -> dict | None:
    """Return {"access", "refresh"} for a valid cookie, including concurrent reuse."""
    result = _retry_deadlock(_rotate_or_reuse_refresh, raw)
    RefreshTokenReuse.objects.filter(created_at__lt=timezone.now() - reuse_row_retention()).delete()
    return result


def _rotate_or_reuse_refresh(raw: str) -> dict | None:
    ttl = reuse_ttl()
    result: dict | None = None
    raw_hash = hash_refresh_token(raw)

    with transaction.atomic():
        locked = _acquire_stable_locks({raw_hash}, raw)
        reuse = locked[raw_hash]
        if reuse.refresh:
            if timezone.now() - reuse.created_at <= ttl:
                successor = reuse.refresh
                successor_row = locked[hash_refresh_token(successor)]
                try:
                    token = RefreshToken(successor)
                    result = {"access": str(token.access_token), "refresh": successor}
                    if not successor_row.refresh:
                        successor_row.delete()
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
                    _store_successor(reuse, new_refresh)
                    result = {"access": data["access"], "refresh": new_refresh}
            except TokenError:
                reuse.delete()
    return result
