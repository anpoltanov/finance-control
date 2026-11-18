"""One logical save must insert one transaction, even when the POST is replayed."""

from datetime import timedelta

from django.contrib.auth.models import User
from rest_framework.exceptions import APIException

from apps.ledger.models import Transaction

# Clients that still retry a create without client_id (a tab that has not loaded
# this version) can replay the same payload for about as long as one save burst.
RECENT_DUPLICATE_WINDOW = timedelta(seconds=5)


class DeletedClientId(APIException):
    status_code = 409
    default_detail = "This save was already deleted."
    default_code = "client_id_deleted"


def lock_user(user: User) -> None:
    User.objects.select_for_update().get(pk=user.pk)


def find_by_client_id(user, client_id) -> Transaction | None:
    if not client_id:
        return None
    existing = Transaction.objects.filter(user=user, client_id=client_id).first()
    if existing is not None and existing.deleted_at is not None:
        raise DeletedClientId()
    return existing


def _fk_id(value):
    if value is None:
        return None
    return getattr(value, "pk", value)


def same_payload(tx: Transaction, data: dict, tags) -> bool:
    wanted_tags = tuple(sorted(_fk_id(tag) for tag in tags))
    have_tags = tuple(sorted(tx.tags.values_list("id", flat=True)))
    return (
        tx.type == data.get("type")
        and tx.account_id == _fk_id(data.get("account"))
        and tx.to_account_id == _fk_id(data.get("to_account"))
        and (tx.transfer_kind or None) == (data.get("transfer_kind") or None)
        and tx.amount == data.get("amount")
        and tx.category_id == _fk_id(data.get("category"))
        and tx.date == data.get("date")
        and (tx.notes or "") == (data.get("notes") or "")
        and (tx.recipient or "") == (data.get("recipient") or "")
        and (tx.status or Transaction.STATUS_CLEARED) == (data.get("status") or Transaction.STATUS_CLEARED)
        and (tx.payment_type or "") == (data.get("payment_type") or "")
        and (tx.currency_code or "RUB") == (data.get("currency_code") or "RUB")
        and tx.ref_currency_amount == data.get("ref_currency_amount")
        and tx.planned_transaction_id == _fk_id(data.get("planned_transaction"))
        and wanted_tags == have_tags
    )


def find_recent_identical(user, data: dict, tags) -> Transaction | None:
    from django.utils import timezone

    since = timezone.now() - RECENT_DUPLICATE_WINDOW
    recent = (
        Transaction.objects.filter(user=user, deleted_at__isnull=True, created_at__gte=since)
        .prefetch_related("tags")
        .order_by("id")
    )
    for tx in recent:
        if same_payload(tx, data, tags):
            return tx
    return None
