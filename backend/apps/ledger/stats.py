from decimal import Decimal

from apps.ledger.models import Category, Transaction


def classify_cash_flow(tx_type: str, amount: Decimal, category_type: str | None) -> tuple[Decimal, Decimal]:
    """Return (income, expense) using category type, not only operation type.

    Income operations on an expense category reduce expenses (refunds/compensations).
    """
    zero = Decimal("0")
    if tx_type == Transaction.TYPE_TRANSFER:
        return zero, zero
    if not category_type:
        if tx_type == Transaction.TYPE_INCOME:
            return amount, zero
        if tx_type == Transaction.TYPE_EXPENSE:
            return zero, amount
        return zero, zero
    if category_type == Category.TYPE_EXPENSE:
        if tx_type == Transaction.TYPE_EXPENSE:
            return zero, amount
        if tx_type == Transaction.TYPE_INCOME:
            return zero, -amount
    if category_type == Category.TYPE_INCOME:
        if tx_type == Transaction.TYPE_INCOME:
            return amount, zero
        if tx_type == Transaction.TYPE_EXPENSE:
            return -amount, zero
    return zero, zero
