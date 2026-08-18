from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.ledger.views import AccountViewSet, CategoryViewSet, TagViewSet, TransactionViewSet

router = DefaultRouter()
router.register("accounts", AccountViewSet, basename="account")
router.register("categories", CategoryViewSet, basename="category")
router.register("tags", TagViewSet, basename="tag")
router.register("transactions", TransactionViewSet, basename="transaction")

urlpatterns = [
    path("", include(router.urls)),
]
