from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.imports.walletapp import commit_import, parse_walletapp_csv, preview_import
from apps.ledger.models import Transaction


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


class ImportThenSyncTests(APITestCase):
    def test_sync_includes_imported_transactions(self):
        user = User.objects.create_user(username="u", password="p")
        self.client.force_authenticate(user)
        commit_import(user, parse_walletapp_csv(SAMPLE_CSV))
        res = self.client.get("/api/v1/sync/")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(len(res.data["transactions"]), 2)
        self.assertGreaterEqual(len(res.data["accounts"]), 2)
