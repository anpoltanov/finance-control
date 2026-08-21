from datetime import date, datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.budgets.models import Budget
from apps.ledger.models import Account, Category, Transaction


def aware(year, month, day, hour=12):
    return timezone.make_aware(datetime(year, month, day, hour, 0))


class BudgetNestedSpentTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.account = Account.objects.create(user=self.user, title="Cash")
        self.parent = Category.objects.create(user=self.user, name="Food", type=Category.TYPE_EXPENSE)
        self.groceries = Category.objects.create(
            user=self.user, name="Groceries", type=Category.TYPE_EXPENSE, parent=self.parent
        )
        self.dining = Category.objects.create(
            user=self.user, name="Dining", type=Category.TYPE_EXPENSE, parent=self.parent
        )
        self.nested = Category.objects.create(
            user=self.user, name="Cafe", type=Category.TYPE_EXPENSE, parent=self.dining
        )
        self.other = Category.objects.create(user=self.user, name="Transport", type=Category.TYPE_EXPENSE)

    def _expense(self, category, amount, day=10):
        return Transaction.objects.create(
            user=self.user,
            type=Transaction.TYPE_EXPENSE,
            account=self.account,
            amount=Decimal(amount),
            category=category,
            date=aware(2026, 8, day),
            currency_code="RUB",
        )

    def test_parent_selected_includes_nested_children(self):
        self._expense(self.parent, "10.00")
        self._expense(self.groceries, "20.00")
        self._expense(self.nested, "5.00")
        self._expense(self.other, "100.00")
        budget = Budget.objects.create(
            user=self.user,
            name="Food",
            amount=Decimal("200"),
            start_date="2026-08-01",
            period=Budget.PERIOD_MONTHLY,
        )
        budget.categories.add(self.parent)
        spent = budget.spent_in_period(date(2026, 8, 1), date(2026, 8, 31))
        self.assertEqual(spent, Decimal("35.00"))

    def test_unchecked_child_is_excluded_when_parent_not_stored(self):
        self._expense(self.groceries, "20.00")
        self._expense(self.dining, "30.00")
        self._expense(self.nested, "5.00")
        budget = Budget.objects.create(
            user=self.user,
            name="Partial food",
            amount=Decimal("200"),
            start_date="2026-08-01",
            period=Budget.PERIOD_MONTHLY,
        )
        budget.categories.add(self.groceries)
        spent = budget.spent_in_period(date(2026, 8, 1), date(2026, 8, 31))
        self.assertEqual(spent, Decimal("20.00"))

    def test_excluded_account_omitted_from_budget_spent(self):
        hidden = Account.objects.create(
            user=self.user, title="Hidden", exclude_from_statistics=True
        )
        Transaction.objects.create(
            user=self.user,
            type=Transaction.TYPE_EXPENSE,
            account=hidden,
            amount=Decimal("50.00"),
            category=self.groceries,
            date=aware(2026, 8, 10),
            currency_code="RUB",
        )
        self._expense(self.groceries, "20.00")
        budget = Budget.objects.create(
            user=self.user,
            name="Food",
            amount=Decimal("200"),
            start_date="2026-08-01",
            period=Budget.PERIOD_MONTHLY,
        )
        budget.categories.add(self.parent)
        spent = budget.spent_in_period(date(2026, 8, 1), date(2026, 8, 31))
        self.assertEqual(spent, Decimal("20.00"))

    def test_income_refund_on_expense_category_reduces_spent(self):
        self._expense(self.groceries, "20.00")
        Transaction.objects.create(
            user=self.user,
            type=Transaction.TYPE_INCOME,
            account=self.account,
            amount=Decimal("5.00"),
            category=self.groceries,
            date=aware(2026, 8, 12),
            currency_code="RUB",
        )
        budget = Budget.objects.create(
            user=self.user,
            name="Food",
            amount=Decimal("200"),
            start_date="2026-08-01",
            period=Budget.PERIOD_MONTHLY,
        )
        budget.categories.add(self.parent)
        spent = budget.spent_in_period(date(2026, 8, 1), date(2026, 8, 31))
        self.assertEqual(spent, Decimal("15.00"))
