from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.planning.views import PlannedTransactionViewSet

router = DefaultRouter()
router.register("planned-transactions", PlannedTransactionViewSet, basename="planned-transaction")

urlpatterns = [
    path("", include(router.urls)),
]
