from datetime import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.ledger.models import Account, Category, Tag, Transaction


def aware(year, month, day, hour=12):
    return timezone.make_aware(datetime(year, month, day, hour, 0))


class TransactionTagApiTests(APITestCase):
    def test_create_transaction_with_tags(self):
        user = User.objects.create_user(username="u", password="p")
        self.client.force_authenticate(user)
        account = Account.objects.create(user=user, title="Sber")
        tag = Tag.objects.create(user=user, name="food")
        res = self.client.post(
            "/api/v1/transactions/",
            {
                "type": "expense",
                "account": account.id,
                "amount": "10.00",
                "date": "2026-08-18T12:00:00Z",
                "tag_ids": [tag.id],
                "currency_code": "RUB",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(list(res.data["tag_ids"]), [tag.id])


class AccountFlagTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.client.force_authenticate(self.user)

    def test_create_account_with_flags(self):
        res = self.client.post(
            "/api/v1/accounts/",
            {
                "title": "Vault",
                "icon": "savings",
                "color": "#22c55e",
                "currency_code": "RUB",
                "initial_balance": "0",
                "archived": True,
                "exclude_from_statistics": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(res.data["archived"])
        self.assertTrue(res.data["exclude_from_statistics"])
        account = Account.objects.get(pk=res.data["id"])
        self.assertTrue(account.archived)
        self.assertTrue(account.exclude_from_statistics)

    def test_flags_default_false(self):
        res = self.client.post(
            "/api/v1/accounts/",
            {"title": "Cash", "currency_code": "RUB", "initial_balance": "0"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertFalse(res.data["archived"])
        self.assertFalse(res.data["exclude_from_statistics"])


class ReportExcludeAccountTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.client.force_authenticate(self.user)
        self.counted = Account.objects.create(user=self.user, title="Counted")
        self.hidden = Account.objects.create(
            user=self.user, title="Hidden", exclude_from_statistics=True
        )
        self.archived = Account.objects.create(user=self.user, title="Old", archived=True)
        self.food = Category.objects.create(user=self.user, name="Food", type=Category.TYPE_EXPENSE)

    def test_reports_omit_excluded_accounts_but_include_archived(self):
        Transaction.objects.create(
            user=self.user,
            type=Transaction.TYPE_EXPENSE,
            account=self.counted,
            amount=Decimal("10.00"),
            category=self.food,
            date=aware(2026, 8, 10),
        )
        Transaction.objects.create(
            user=self.user,
            type=Transaction.TYPE_EXPENSE,
            account=self.hidden,
            amount=Decimal("99.00"),
            category=self.food,
            date=aware(2026, 8, 10),
        )
        Transaction.objects.create(
            user=self.user,
            type=Transaction.TYPE_EXPENSE,
            account=self.archived,
            amount=Decimal("5.00"),
            category=self.food,
            date=aware(2026, 8, 10),
        )
        Transaction.objects.create(
            user=self.user,
            type=Transaction.TYPE_INCOME,
            account=self.hidden,
            amount=Decimal("40.00"),
            date=aware(2026, 8, 11),
        )
        Transaction.objects.create(
            user=self.user,
            type=Transaction.TYPE_INCOME,
            account=self.counted,
            amount=Decimal("7.00"),
            date=aware(2026, 8, 11),
        )
        res = self.client.get("/api/v1/reports/summary/", {"from": "2026-08-01", "to": "2026-08-31T23:59:59"})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Decimal(res.data["expense_total"]), Decimal("15.00"))
        self.assertEqual(Decimal(res.data["income_total"]), Decimal("7.00"))
        self.assertEqual(len(res.data["by_category"]), 1)
        self.assertEqual(Decimal(res.data["by_category"][0]["total"]), Decimal("15.00"))
