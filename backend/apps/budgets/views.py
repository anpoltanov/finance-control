from rest_framework import viewsets

from apps.budgets.models import Budget
from apps.budgets.serializers import BudgetSerializer


class BudgetViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetSerializer
    queryset = Budget.objects.prefetch_related("categories")

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user, deleted_at__isnull=True)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        instance.soft_delete()
