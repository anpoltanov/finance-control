from django.db.models import Q
from rest_framework import viewsets

from apps.core.dates import parse_datetime_param
from apps.ledger.models import Account, Category, Tag, Transaction
from apps.ledger.serializers import (
    AccountSerializer,
    CategorySerializer,
    TagSerializer,
    TransactionSerializer,
)


class UserScopedMixin:
    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user, deleted_at__isnull=True)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        instance.soft_delete()


class AccountViewSet(UserScopedMixin, viewsets.ModelViewSet):
    serializer_class = AccountSerializer
    queryset = Account.objects.all()


class CategoryViewSet(UserScopedMixin, viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    queryset = Category.objects.all()


class TagViewSet(UserScopedMixin, viewsets.ModelViewSet):
    serializer_class = TagSerializer
    queryset = Tag.objects.all()


class TransactionViewSet(UserScopedMixin, viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    queryset = Transaction.objects.select_related(
        "account", "to_account", "category", "category__parent"
    ).prefetch_related("tags")

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        date_from = parse_datetime_param(params.get("date_from"), field="date_from")
        date_to = parse_datetime_param(params.get("date_to"), field="date_to")
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        if params.get("account"):
            account_id = params["account"]
            qs = qs.filter(Q(account_id=account_id) | Q(to_account_id=account_id))
        if params.get("category"):
            qs = qs.filter(category_id=params["category"])
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("type"):
            qs = qs.filter(type=params["type"])
        if params.get("tag"):
            qs = qs.filter(tags__id=params["tag"])
        return qs.distinct()
