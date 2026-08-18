from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.ledger.models import Account, Category, Tag


class PlannedTransactionApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.client.force_authenticate(self.user)
        self.account = Account.objects.create(user=self.user, title="Sber")
        self.category = Category.objects.create(user=self.user, name="Ипотека", type="expense")
        self.tag = Tag.objects.create(user=self.user, name="дом")

    def test_create_planned_with_outbox_payload(self):
        payload = {
            "type": "expense",
            "amount": "45000.00",
            "category": self.category.id,
            "next_occurrence_date": "2026-10-25",
            "repeat_rule": "monthly",
            "autocommit": False,
            "notes": "Ипотека",
            "recipient": "",
            "payment_type": "",
            "tag_ids": [self.tag.id],
            "account": self.account.id,
            "to_account": None,
            "transfer_kind": None,
            "currency_code": "RUB",
        }
        res = self.client.post("/api/v1/planned-transactions/", payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data["notes"], "Ипотека")
        self.assertEqual(list(res.data["tag_ids"]), [self.tag.id])

    def test_create_planned_without_tags(self):
        payload = {
            "type": "expense",
            "amount": "45000.00",
            "category": self.category.id,
            "next_occurrence_date": "2026-10-25",
            "repeat_rule": "monthly",
            "account": self.account.id,
            "currency_code": "RUB",
        }
        res = self.client.post("/api/v1/planned-transactions/", payload, format="json")
        self.assertEqual(res.status_code, 201, res.content)

    def test_create_without_trailing_slash(self):
        payload = {
            "type": "expense",
            "amount": "45000.00",
            "next_occurrence_date": "2026-10-25",
            "repeat_rule": "monthly",
            "account": self.account.id,
            "currency_code": "RUB",
        }
        res = self.client.post("/api/v1/planned-transactions", payload, format="json")
        self.assertNotEqual(res.status_code, 404, res.content)
