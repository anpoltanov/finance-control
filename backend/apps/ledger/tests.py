from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.ledger.models import Account, Tag


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
