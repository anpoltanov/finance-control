from datetime import datetime

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.budgets.models import Budget
from apps.budgets.serializers import BudgetSerializer
from apps.ledger.models import Account, Category, Tag, Transaction
from apps.ledger.serializers import (
    AccountSerializer,
    CategorySerializer,
    TagSerializer,
    TransactionSerializer,
)
from apps.planning.models import PlannedTransaction
from apps.planning.serializers import PlannedTransactionSerializer


def set_jwt_cookies(response, refresh: RefreshToken):
    access = refresh.access_token
    response.set_cookie(
        "access_token",
        str(access),
        httponly=settings.JWT_COOKIE_HTTPONLY,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
    )
    response.set_cookie(
        "refresh_token",
        str(refresh),
        httponly=settings.JWT_COOKIE_HTTPONLY,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
    )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        refresh = RefreshToken.for_user(user)
        response = Response({"username": user.username})
        set_jwt_cookies(response, refresh)
        return response


class LogoutView(APIView):
    def post(self, request):
        response = Response({"detail": "Logged out."})
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")
        return response


class MeView(APIView):
    def get(self, request):
        return Response({"username": request.user.username, "id": request.user.id})


class SyncView(APIView):
    def get(self, request):
        since_str = request.query_params.get("since")
        since = None
        if since_str:
            since = datetime.fromisoformat(since_str.replace("Z", "+00:00"))
            if timezone.is_naive(since):
                since = timezone.make_aware(since)

        def active_qs(model):
            q = model.objects.filter(user=request.user, deleted_at__isnull=True)
            if since:
                q = q.filter(updated_at__gt=since)
            return q.order_by("updated_at")

        def deleted_ids(model):
            q = model.objects.filter(user=request.user, deleted_at__isnull=False)
            if since:
                q = q.filter(deleted_at__gt=since)
            return list(q.values_list("id", flat=True))

        return Response(
            {
                "accounts": AccountSerializer(active_qs(Account), many=True).data,
                "categories": CategorySerializer(active_qs(Category), many=True).data,
                "tags": TagSerializer(active_qs(Tag), many=True).data,
                "transactions": TransactionSerializer(active_qs(Transaction), many=True).data,
                "budgets": BudgetSerializer(active_qs(Budget), many=True, context={"request": request}).data,
                "planned_transactions": PlannedTransactionSerializer(
                    active_qs(PlannedTransaction), many=True, context={"request": request}
                ).data,
                "deleted_ids": {
                    "accounts": deleted_ids(Account),
                    "categories": deleted_ids(Category),
                    "tags": deleted_ids(Tag),
                    "transactions": deleted_ids(Transaction),
                    "budgets": deleted_ids(Budget),
                    "planned_transactions": deleted_ids(PlannedTransaction),
                },
                "synced_at": timezone.now().isoformat(),
            }
        )


class ReportSummaryView(APIView):
    def get(self, request):
        from django.db.models import Sum
        from django.db.models.functions import TruncMonth

        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        txs = Transaction.objects.filter(user=request.user, deleted_at__isnull=True)
        if date_from:
            txs = txs.filter(date__gte=date_from)
        if date_to:
            txs = txs.filter(date__lte=date_to)

        by_category = (
            txs.filter(type="expense", category__isnull=False)
            .values("category__name", "category__id", "category__color", "category__parent_id")
            .annotate(total=Sum("amount"))
            .order_by("-total")
        )
        income = txs.filter(type="income").aggregate(total=Sum("amount"))["total"] or 0
        expense = txs.filter(type="expense").aggregate(total=Sum("amount"))["total"] or 0
        monthly = (
            txs.filter(type__in=["expense", "income"])
            .annotate(month=TruncMonth("date"))
            .values("month", "type")
            .annotate(total=Sum("amount"))
            .order_by("month")
        )
        cats = {c.id: c for c in Category.objects.filter(user=request.user).only("id", "parent_id", "color")}

        def root_color(cat_id):
            cat = cats.get(cat_id)
            while cat and cat.parent_id:
                cat = cats.get(cat.parent_id)
            return cat.color if cat else "#6366f1"

        return Response(
            {
                "income_total": str(income),
                "expense_total": str(expense),
                "by_category": [
                    {
                        "category_id": r["category__id"],
                        "category_name": r["category__name"],
                        "category_color": root_color(r["category__id"]),
                        "total": str(r["total"]),
                    }
                    for r in by_category
                ],
                "monthly": [
                    {"month": r["month"].isoformat() if r["month"] else None, "type": r["type"], "total": str(r["total"])}
                    for r in monthly
                ],
            }
        )
