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

    def test_patch_selected_tags_round_trip(self):
        created = self.client.post(
            "/api/v1/planned-transactions/",
            {
                "type": "expense",
                "amount": "10.00",
                "next_occurrence_date": "2026-10-25",
                "repeat_rule": "once",
                "account": self.account.id,
                "currency_code": "RUB",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        res = self.client.patch(
            f"/api/v1/planned-transactions/{created.data['id']}/",
            {"tag_ids": [self.tag.id]},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(list(res.data["tag_ids"]), [self.tag.id])
        kept = self.client.patch(
            f"/api/v1/planned-transactions/{created.data['id']}/",
            {"notes": "still tagged"},
            format="json",
        )
        self.assertEqual(kept.status_code, 200, kept.content)
        self.assertEqual(list(kept.data["tag_ids"]), [self.tag.id])

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

    def _expense_plan(self, **extra):
        payload = {
            "type": "expense",
            "amount": "45000.00",
            "category": self.category.id,
            "next_occurrence_date": "2026-10-25",
            "repeat_rule": "monthly",
            "account": self.account.id,
            "currency_code": "RUB",
            "notes": "Ипотека",
            "tag_ids": [self.tag.id],
        }
        payload.update(extra)
        created = self.client.post("/api/v1/planned-transactions/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        return created.data

    def test_commit_empty_body_keeps_template_values(self):
        planned = self._expense_plan(repeat_rule="once")
        res = self.client.post(f"/api/v1/planned-transactions/{planned['id']}/commit/", {}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data["transaction"]["amount"], "45000.00")
        self.assertEqual(res.data["transaction"]["category"], self.category.id)
        self.assertEqual(res.data["transaction"]["notes"], "Ипотека")
        self.assertEqual(list(res.data["transaction"]["tag_ids"]), [self.tag.id])
        self.assertIsNone(res.data["planned"])

    def test_commit_overrides_change_only_the_created_transaction(self):
        other = Category.objects.create(user=self.user, name="Продукты", type="expense")
        planned = self._expense_plan()
        res = self.client.post(
            f"/api/v1/planned-transactions/{planned['id']}/commit/",
            {
                "amount": "10.00",
                "notes": "edited",
                "category": other.id,
                "recipient": "shop",
                "date": "2026-10-01T15:30:00",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        tx = res.data["transaction"]
        self.assertEqual(tx["amount"], "10.00")
        self.assertEqual(tx["notes"], "edited")
        self.assertEqual(tx["category"], other.id)
        self.assertEqual(tx["recipient"], "shop")
        self.assertIn("2026-10-01", tx["date"])
        saved = res.data["planned"]
        self.assertEqual(saved["amount"], "45000.00")
        self.assertEqual(saved["notes"], "Ипотека")
        self.assertEqual(saved["category"], self.category.id)
        self.assertEqual(saved["next_occurrence_date"], "2026-11-25")
