from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.imports.walletapp import commit_import, parse_walletapp_csv, preview_import
from apps.ledger.models import Account, Category, Tag, Transaction


SAMPLE_CSV = """account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels
ВТБ Андрей;Обслуживание транспорта;RUB;80000;80000;Расход;Наличные;;2026-07-28T13:38:36.446Z;false;;Audi A3, Ремонт авто
ВТБ Андрей;Перевод, снятие;RUB;300000;300000;Расход;Наличные;;2026-07-14T19:33:00.000Z;true;;
Сбер Андрей;Перевод, снятие;RUB;300000;300000;Доход;Наличные;;2026-07-14T19:33:00.000Z;true;;
"""


class WalletAppImportTest(TestCase):
    def test_parses_and_pairs_transfers(self):
        rows = parse_walletapp_csv(SAMPLE_CSV)
        preview = preview_import(rows)
        self.assertEqual(len(preview.regular), 1)
        self.assertEqual(len(preview.paired_transfers), 1)
        pair = preview.paired_transfers[0]
        self.assertEqual(pair.outflow.account, "ВТБ Андрей")
        self.assertEqual(pair.inflow.account, "Сбер Андрей")
        self.assertEqual(pair.outflow.amount, Decimal("300000"))

    def test_to_nowhere_unpaired_outflow(self):
        csv = """account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels
ВТБ;Перевод;RUB;100;100;Расход;Cash;;2026-01-01T12:00:00.000Z;true;;
"""
        rows = parse_walletapp_csv(csv)
        preview = preview_import(rows)
        self.assertEqual(len(preview.to_nowhere), 1)
        self.assertEqual(len(preview.paired_transfers), 0)

    def test_commit_creates_regular_and_transfer(self):
        user = User.objects.create_user(username="u", password="p")
        result = commit_import(user, parse_walletapp_csv(SAMPLE_CSV))
        self.assertEqual(result["created"], 2)
        self.assertEqual(Transaction.objects.filter(user=user).count(), 2)
        transfer = Transaction.objects.get(user=user, type=Transaction.TYPE_TRANSFER)
        self.assertEqual(transfer.transfer_kind, Transaction.TRANSFER_ACCOUNT)
        self.assertEqual(transfer.account.title, "ВТБ Андрей")
        self.assertEqual(transfer.to_account.title, "Сбер Андрей")


class ImportReuseExistingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="reuse", password="p")
        self.account = Account.objects.create(user=self.user, title="Cash")
        self.parent = Category.objects.create(user=self.user, name="Food", type=Category.TYPE_EXPENSE)
        self.nested = Category.objects.create(
            user=self.user, name="Groceries", type=Category.TYPE_EXPENSE, parent=self.parent
        )
        Tag.objects.create(user=self.user, name="market")

    def test_preview_omits_existing_nested_category_account_and_tag(self):
        csv = """account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels
cash;Groceries;RUB;10;10;Расход;Card;;2026-08-01T12:00:00.000Z;false;;market
"""
        preview = preview_import(parse_walletapp_csv(csv), user=self.user)
        self.assertEqual(preview.new_accounts, [])
        self.assertEqual(preview.new_categories, [])
        self.assertEqual(preview.new_tags, [])

    def test_commit_reuses_nested_category_instead_of_creating_top_level(self):
        csv = """account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels
CASH;Groceries;RUB;12;12;Расход;Card;;2026-08-02T12:00:00.000Z;false;;MARKET
"""
        result = commit_import(self.user, parse_walletapp_csv(csv))
        self.assertEqual(result["created"], 1)
        self.assertEqual(Category.objects.filter(user=self.user).count(), 2)
        tx = Transaction.objects.get(user=self.user)
        self.assertEqual(tx.category_id, self.nested.id)
        self.assertEqual(tx.category.parent_id, self.parent.id)
        self.assertEqual(tx.account_id, self.account.id)
        self.assertEqual(list(tx.tags.values_list("name", flat=True)), ["market"])

    def test_commit_walks_parent_child_path(self):
        csv = """account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels
Cash;Food / Groceries;RUB;8;8;Расход;Card;;2026-08-03T12:00:00.000Z;false;;
"""
        commit_import(self.user, parse_walletapp_csv(csv))
        self.assertEqual(Category.objects.filter(user=self.user).count(), 2)
        tx = Transaction.objects.get(user=self.user)
        self.assertEqual(tx.category_id, self.nested.id)


class ImportThenSyncTests(APITestCase):
    def test_sync_includes_imported_transactions(self):
        user = User.objects.create_user(username="u", password="p")
        self.client.force_authenticate(user)
        commit_import(user, parse_walletapp_csv(SAMPLE_CSV))
        res = self.client.get("/api/v1/sync/")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(len(res.data["transactions"]), 2)
        self.assertGreaterEqual(len(res.data["accounts"]), 2)
