from __future__ import annotations

import csv
import hashlib
import io
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from apps.ledger.models import Account, Category, Tag, Transaction

TYPE_MAP = {
    "расход": Transaction.TYPE_EXPENSE,
    "expense": Transaction.TYPE_EXPENSE,
    "доход": Transaction.TYPE_INCOME,
    "income": Transaction.TYPE_INCOME,
}


@dataclass
class WalletAppRow:
    index: int = 0
    account: str = ""
    category: str = ""
    currency: str = "RUB"
    amount: Decimal = Decimal("0")
    ref_currency_amount: Decimal | None = None
    type: str = Transaction.TYPE_EXPENSE
    payment_type: str = ""
    note: str = ""
    date: datetime | None = None
    transfer: bool = False
    payee: str = ""
    labels: list[str] = field(default_factory=list)

    def source_id(self) -> str:
        raw = "|".join(
            [
                str(self.index),
                self.account,
                self.category,
                str(self.amount),
                self.type,
                self.date.isoformat() if self.date else "",
                self.payee,
                self.note,
            ]
        )
        digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
        return f"walletapp:{digest}"


@dataclass
class TransferPair:
    outflow: WalletAppRow
    inflow: WalletAppRow
    confidence: str = "high"


@dataclass
class ImportPreview:
    regular: list[WalletAppRow] = field(default_factory=list)
    paired_transfers: list[TransferPair] = field(default_factory=list)
    to_nowhere: list[WalletAppRow] = field(default_factory=list)
    from_nowhere: list[WalletAppRow] = field(default_factory=list)
    ambiguous: list[dict] = field(default_factory=list)
    new_accounts: list[str] = field(default_factory=list)
    new_categories: list[str] = field(default_factory=list)
    new_tags: list[str] = field(default_factory=list)


def _parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "да"}


def _parse_decimal(value: str) -> Decimal:
    text = (value or "0").strip().replace(" ", "").replace(",", ".")
    try:
        return Decimal(text)
    except InvalidOperation:
        return Decimal("0")


def _parse_datetime(value: str) -> datetime:
    text = (value or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, dt_timezone.utc)
    return dt


def _split_labels(value: str) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def parse_walletapp_csv(content: str) -> list[WalletAppRow]:
    reader = csv.DictReader(io.StringIO(content), delimiter=";")
    rows: list[WalletAppRow] = []
    for index, raw in enumerate(reader):
        lowered = {str(k).strip().lower(): (v or "").strip() for k, v in raw.items() if k}
        type_raw = lowered.get("type", "")
        tx_type = TYPE_MAP.get(type_raw.lower(), Transaction.TYPE_EXPENSE)
        date_raw = lowered.get("date", "")
        rows.append(
            WalletAppRow(
                index=index,
                account=lowered.get("account", ""),
                category=lowered.get("category", ""),
                currency=(lowered.get("currency") or "RUB")[:3],
                amount=_parse_decimal(lowered.get("amount", "0")).copy_abs(),
                ref_currency_amount=_parse_decimal(lowered.get("ref_currency_amount", "0")) or None,
                type=tx_type,
                payment_type=lowered.get("payment_type", ""),
                note=lowered.get("note", ""),
                date=_parse_datetime(date_raw) if date_raw else timezone.now(),
                transfer=_parse_bool(lowered.get("transfer", "")),
                payee=lowered.get("payee", ""),
                labels=_split_labels(lowered.get("labels", "")),
            )
        )
    return rows


def preview_import(rows: list[WalletAppRow], resolutions: dict | None = None) -> ImportPreview:
    resolutions = {str(k): str(v) for k, v in (resolutions or {}).items() if v not in (None, "")}
    regular = [row for row in rows if not row.transfer]
    outflows = [row for row in rows if row.transfer and row.type == Transaction.TYPE_EXPENSE]
    inflows = [row for row in rows if row.transfer and row.type == Transaction.TYPE_INCOME]
    used_inflows: set[int] = set()
    paired: list[TransferPair] = []
    ambiguous: list[dict] = []
    to_nowhere: list[WalletAppRow] = []

    for outflow in outflows:
        resolution = resolutions.get(str(outflow.index))
        if resolution == "to_nowhere":
            to_nowhere.append(outflow)
            continue
        if resolution and resolution.isdigit():
            match = next((row for row in inflows if row.index == int(resolution)), None)
            if match and match.index not in used_inflows:
                paired.append(TransferPair(outflow=outflow, inflow=match, confidence="manual"))
                used_inflows.add(match.index)
                continue

        candidates = [
            row
            for row in inflows
            if row.index not in used_inflows
            and row.amount == outflow.amount
            and row.date == outflow.date
            and row.account != outflow.account
        ]
        if len(candidates) == 1:
            match = candidates[0]
            paired.append(TransferPair(outflow=outflow, inflow=match, confidence="high"))
            used_inflows.add(match.index)
        elif len(candidates) > 1:
            ambiguous.append(
                {
                    "outflow_index": outflow.index,
                    "candidates": [row.index for row in candidates],
                    "confidence": "low",
                }
            )
        else:
            to_nowhere.append(outflow)

    from_nowhere = [row for row in inflows if row.index not in used_inflows]
    accounts = {row.account for row in rows if row.account}
    categories = {row.category for row in regular if row.category}
    tags: set[str] = set()
    for row in rows:
        tags.update(row.labels)

    return ImportPreview(
        regular=regular,
        paired_transfers=paired,
        to_nowhere=to_nowhere,
        from_nowhere=from_nowhere,
        ambiguous=ambiguous,
        new_accounts=sorted(accounts),
        new_categories=sorted(categories),
        new_tags=sorted(tags),
    )


def preview_to_dict(preview: ImportPreview) -> dict:
    return {
        "paired_transfers": [
            {
                "from_account": pair.outflow.account,
                "to_account": pair.inflow.account,
                "amount": str(pair.outflow.amount),
                "currency": pair.outflow.currency,
                "date": pair.outflow.date.isoformat() if pair.outflow.date else "",
                "confidence": pair.confidence,
                "outflow_index": pair.outflow.index,
                "inflow_index": pair.inflow.index,
            }
            for pair in preview.paired_transfers
        ],
        "to_nowhere": [
            {
                "index": row.index,
                "account": row.account,
                "amount": str(row.amount),
                "date": row.date.isoformat() if row.date else "",
            }
            for row in preview.to_nowhere
        ],
        "from_nowhere": [
            {
                "index": row.index,
                "account": row.account,
                "amount": str(row.amount),
                "date": row.date.isoformat() if row.date else "",
            }
            for row in preview.from_nowhere
        ],
        "ambiguous": preview.ambiguous,
        "regular_count": len(preview.regular),
        "new_accounts": preview.new_accounts,
        "new_categories": preview.new_categories,
        "new_tags": preview.new_tags,
    }


def _get_or_create_account(user, title: str, currency: str) -> Account:
    account, _ = Account.objects.get_or_create(
        user=user,
        title=title,
        defaults={"currency_code": currency or "RUB"},
    )
    return account


def _get_or_create_category(user, name: str, tx_type: str) -> Category | None:
    if not name:
        return None
    category_type = Category.TYPE_INCOME if tx_type == Transaction.TYPE_INCOME else Category.TYPE_EXPENSE
    category, _ = Category.objects.get_or_create(
        user=user,
        name=name,
        parent=None,
        defaults={"type": category_type},
    )
    return category


def _get_tags(user, labels: list[str]) -> list[Tag]:
    tags = []
    for name in labels:
        tag, _ = Tag.objects.get_or_create(user=user, name=name)
        tags.append(tag)
    return tags


def _create_transaction(user, **kwargs) -> Transaction | None:
    source_id = kwargs.get("import_source_id") or ""
    if source_id and Transaction.objects.filter(user=user, import_source_id=source_id).exists():
        return None
    tags = kwargs.pop("tag_objects", [])
    tx = Transaction.objects.create(user=user, **kwargs)
    if tags:
        tx.tags.set(tags)
    return tx


def commit_import(user, rows: list[WalletAppRow], resolutions: dict | None = None) -> dict:
    preview = preview_import(rows, resolutions)
    created = 0
    skipped = 0

    def count(tx: Transaction | None):
        nonlocal created, skipped
        if tx is None:
            skipped += 1
        else:
            created += 1

    for row in preview.regular:
        count(
            _create_transaction(
                user,
                type=row.type,
                account=_get_or_create_account(user, row.account, row.currency),
                amount=row.amount,
                category=_get_or_create_category(user, row.category, row.type),
                date=row.date,
                notes=row.note,
                recipient=row.payee,
                payment_type=row.payment_type,
                currency_code=row.currency,
                status=Transaction.STATUS_CLEARED,
                import_source_id=row.source_id(),
                tag_objects=_get_tags(user, row.labels),
            )
        )

    for pair in preview.paired_transfers:
        pair_id = uuid.uuid4()
        count(
            _create_transaction(
                user,
                type=Transaction.TYPE_TRANSFER,
                account=_get_or_create_account(user, pair.outflow.account, pair.outflow.currency),
                to_account=_get_or_create_account(user, pair.inflow.account, pair.inflow.currency),
                transfer_kind=Transaction.TRANSFER_ACCOUNT,
                amount=pair.outflow.amount,
                date=pair.outflow.date,
                notes=pair.outflow.note or pair.inflow.note,
                recipient=pair.outflow.payee or pair.inflow.payee,
                payment_type=pair.outflow.payment_type,
                currency_code=pair.outflow.currency,
                status=Transaction.STATUS_CLEARED,
                import_source_id=pair.outflow.source_id(),
                import_pair_id=pair_id,
                tag_objects=_get_tags(user, pair.outflow.labels + pair.inflow.labels),
            )
        )

    for row in preview.to_nowhere:
        count(
            _create_transaction(
                user,
                type=Transaction.TYPE_TRANSFER,
                account=_get_or_create_account(user, row.account, row.currency),
                transfer_kind=Transaction.TRANSFER_TO_NOWHERE,
                amount=row.amount,
                date=row.date,
                notes=row.note,
                recipient=row.payee,
                payment_type=row.payment_type,
                currency_code=row.currency,
                status=Transaction.STATUS_CLEARED,
                import_source_id=row.source_id(),
                tag_objects=_get_tags(user, row.labels),
            )
        )

    for row in preview.from_nowhere:
        count(
            _create_transaction(
                user,
                type=Transaction.TYPE_TRANSFER,
                account=_get_or_create_account(user, row.account, row.currency),
                transfer_kind=Transaction.TRANSFER_FROM_NOWHERE,
                amount=row.amount,
                date=row.date,
                notes=row.note,
                recipient=row.payee,
                payment_type=row.payment_type,
                currency_code=row.currency,
                status=Transaction.STATUS_CLEARED,
                import_source_id=row.source_id(),
                tag_objects=_get_tags(user, row.labels),
            )
        )

    return {
        "created": created,
        "skipped": skipped,
        "ambiguous_count": len(preview.ambiguous),
    }
