"""Exact copies of one transaction, for a person to review before anything is removed."""

import hashlib
from collections import defaultdict

from django.db import transaction as db_transaction
from rest_framework.exceptions import ValidationError

from apps.ledger.models import Transaction


def fingerprint(tx: Transaction) -> tuple:
    tags = tuple(sorted(tag.id for tag in tx.tags.all()))
    return (
        tx.type,
        tx.account_id,
        tx.to_account_id,
        tx.transfer_kind or "",
        format(tx.amount, "f"),
        tx.category_id,
        tx.date.isoformat() if tx.date else "",
        tx.notes or "",
        tx.recipient or "",
        tx.status or "",
        tx.payment_type or "",
        tx.currency_code or "",
        format(tx.ref_currency_amount, "f") if tx.ref_currency_amount is not None else "",
        tx.planned_transaction_id,
        tx.import_source_id or "",
        str(tx.import_pair_id or ""),
        tags,
    )


def _sample(tx: Transaction) -> dict:
    return {
        "type": tx.type,
        "amount": format(tx.amount, "f"),
        "date": tx.date.isoformat() if tx.date else "",
        "notes": tx.notes,
        "recipient": tx.recipient,
        "account_title": tx.account.title if tx.account_id else "",
        "category_name": tx.category.name if tx.category_id else "",
        "currency_code": tx.currency_code,
    }


def find_duplicate_groups(user) -> list[dict]:
    rows = (
        Transaction.objects.filter(user=user, deleted_at__isnull=True)
        .select_related("account", "category")
        .prefetch_related("tags")
        .order_by("created_at", "id")
    )
    buckets: dict[tuple, list[Transaction]] = defaultdict(list)
    for tx in rows:
        buckets[fingerprint(tx)].append(tx)

    groups = []
    for fp, copies in buckets.items():
        if len(copies) < 2:
            continue
        copies.sort(key=lambda item: (item.created_at, item.id))
        groups.append(
            {
                "key": hashlib.sha256(repr(fp).encode()).hexdigest()[:16],
                "count": len(copies),
                "suggested_keep_id": copies[0].id,
                "transaction": _sample(copies[0]),
                "copies": [
                    {"id": item.id, "created_at": item.created_at.isoformat(), "version": item.version}
                    for item in copies
                ],
            }
        )
    groups.sort(key=lambda group: group["transaction"]["date"], reverse=True)
    return groups


def _int_id(value):
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def resolve_duplicates(user, resolutions) -> int:
    if not isinstance(resolutions, list) or not resolutions:
        raise ValidationError({"resolutions": "Choose at least one group."})
    if len(resolutions) > 200:
        raise ValidationError({"resolutions": "Too many groups."})

    deleted = 0
    with db_transaction.atomic():
        for item in resolutions:
            if not isinstance(item, dict):
                raise ValidationError({"resolutions": "Each group must be an object."})
            keep_id = _int_id(item.get("keep_id"))
            raw_ids = item.get("delete_ids")
            if keep_id is None or not isinstance(raw_ids, list) or not raw_ids:
                raise ValidationError({"resolutions": "Each group needs keep_id and delete_ids."})
            if len(raw_ids) > 500:
                raise ValidationError({"delete_ids": "Too many copies in one group."})
            delete_ids = []
            for raw in raw_ids:
                parsed = _int_id(raw)
                if parsed is None:
                    raise ValidationError({"delete_ids": "Copy ids must be integers."})
                delete_ids.append(parsed)
            if keep_id in delete_ids:
                raise ValidationError({"keep_id": "The copy you keep cannot also be removed."})

            rows = {
                tx.id: tx
                for tx in Transaction.objects.select_for_update().filter(
                    user=user, deleted_at__isnull=True, pk__in=set(delete_ids) | {keep_id}
                )
            }
            keep = rows.get(keep_id)
            if keep is None:
                raise ValidationError({"keep_id": f"Transaction {keep_id} was not found."})
            signature = fingerprint(keep)
            for copy_id in delete_ids:
                copy = rows.get(copy_id)
                if copy is None or fingerprint(copy) != signature:
                    raise ValidationError(
                        {"delete_ids": f"Transaction {copy_id} is not an exact copy of {keep_id}."}
                    )
            for copy_id in delete_ids:
                rows[copy_id].soft_delete()
                deleted += 1
    return deleted
