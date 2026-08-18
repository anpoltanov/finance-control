from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.ledger.serializers import TransactionSerializer
from apps.planning.models import PlannedTransaction
from apps.planning.serializers import PlannedTransactionSerializer


class PlannedTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = PlannedTransactionSerializer
    queryset = PlannedTransaction.objects.select_related("account", "to_account", "category").prefetch_related("tags")

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user, deleted_at__isnull=True)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        instance.soft_delete()

    @action(detail=True, methods=["post"])
    def commit(self, request, pk=None):
        planned = self.get_object()
        planned_id = planned.pk
        tx = planned.commit()
        still_exists = PlannedTransaction.objects.filter(pk=planned_id, deleted_at__isnull=True).first()
        response = {"transaction": TransactionSerializer(tx, context={"request": request}).data, "planned": None}
        if still_exists:
            response["planned"] = PlannedTransactionSerializer(still_exists, context={"request": request}).data
        return Response(response)
