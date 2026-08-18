from decimal import Decimal

from django.test import TestCase

from apps.imports.walletapp import parse_walletapp_csv, preview_import


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
