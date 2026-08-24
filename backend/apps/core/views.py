from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.budgets.models import Budget
from apps.budgets.serializers import BudgetSerializer
from apps.core.dates import parse_datetime_param
from apps.core.throttles import LoginRateThrottle
from apps.ledger.models import Account, Category, Tag, Transaction
from apps.ledger.serializers import (
    AccountSerializer,
    CategorySerializer,
    TagSerializer,
    TransactionSerializer,
)
from apps.planning.models import PlannedTransaction
from apps.planning.serializers import PlannedTransactionSerializer

COOKIE_PATH = getattr(settings, "JWT_COOKIE_PATH", "/")


def _cookie_kwargs():
    return {
        "httponly": settings.JWT_COOKIE_HTTPONLY,
        "secure": settings.JWT_COOKIE_SECURE,
        "samesite": settings.JWT_COOKIE_SAMESITE,
        "path": COOKIE_PATH,
    }


def set_jwt_cookies(response, refresh: RefreshToken):
    kwargs = _cookie_kwargs()
    response.set_cookie(
        "access_token",
        str(refresh.access_token),
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        **kwargs,
    )
    response.set_cookie(
        "refresh_token",
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        **kwargs,
    )


def set_jwt_cookies_from_strings(response, access: str, refresh: str):
    kwargs = _cookie_kwargs()
    response.set_cookie(
        "access_token",
        access,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        **kwargs,
    )
    response.set_cookie(
        "refresh_token",
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        **kwargs,
    )


def clear_jwt_cookies(response):
    kwargs = _cookie_kwargs()
    for name in ("access_token", "refresh_token"):
        response.set_cookie(
            name,
            "",
            max_age=0,
            expires="Thu, 01 Jan 1970 00:00:00 GMT",
            **kwargs,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [LoginRateThrottle]

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


class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get("refresh_token")
        if not raw:
            return Response({"detail": "Refresh token missing."}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = TokenRefreshSerializer(data={"refresh": raw})
        try:
            if not serializer.is_valid():
                return Response({"detail": "Invalid refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        except TokenError:
            return Response({"detail": "Invalid refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        data = serializer.validated_data
        response = Response({"detail": "Token refreshed."})
        set_jwt_cookies_from_strings(response, data["access"], data.get("refresh", raw))
        return response


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get("refresh_token")
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except (TokenError, AttributeError, Exception):
                pass
        response = Response({"detail": "Logged out."})
        clear_jwt_cookies(response)
        return response


class MeView(APIView):
    def get(self, request):
        return Response({"username": request.user.username, "id": request.user.id})


class SyncView(APIView):
    def get(self, request):
        since = parse_datetime_param(request.query_params.get("since"), field="since")

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
        from collections import defaultdict

        from apps.ledger.stats import classify_cash_flow

        date_from = parse_datetime_param(request.query_params.get("from"), field="from")
        date_to = parse_datetime_param(request.query_params.get("to"), field="to")
        txs = Transaction.objects.filter(
            user=request.user,
            deleted_at__isnull=True,
            account__exclude_from_statistics=False,
        ).select_related("category")
        if date_from:
            txs = txs.filter(date__gte=date_from)
        if date_to:
            txs = txs.filter(date__lte=date_to)

        cats = {c.id: c for c in Category.objects.filter(user=request.user).only("id", "parent_id", "color", "name", "type")}

        def root_color(cat_id):
            cat = cats.get(cat_id)
            while cat and cat.parent_id:
                cat = cats.get(cat.parent_id)
            return cat.color if cat else "#6366f1"

        income = 0
        expense = 0
        by_category_map: dict[int, float] = defaultdict(float)
        monthly_map: dict[tuple[str, str], float] = defaultdict(float)

        for tx in txs:
            category_type = tx.category.type if tx.category_id else None
            inc, exp = classify_cash_flow(tx.type, tx.amount, category_type)
            income += inc
            expense += exp
            if tx.category_id and exp != 0 and tx.category and tx.category.type == Category.TYPE_EXPENSE:
                by_category_map[tx.category_id] += float(exp)
            if inc != 0 or exp != 0:
                month_key = tx.date.date().replace(day=1).isoformat()
                if inc:
                    monthly_map[(month_key, "income")] += float(inc)
                if exp:
                    monthly_map[(month_key, "expense")] += float(exp)

        by_category = [
            {
                "category_id": cat_id,
                "category_name": cats[cat_id].name if cat_id in cats else str(cat_id),
                "category_color": root_color(cat_id),
                "total": str(total),
            }
            for cat_id, total in sorted(by_category_map.items(), key=lambda item: item[1], reverse=True)
            if total > 0
        ]
        monthly = [
            {"month": f"{month}T00:00:00", "type": kind, "total": str(total)}
            for (month, kind), total in sorted(monthly_map.items())
        ]

        return Response(
            {
                "income_total": str(income),
                "expense_total": str(expense),
                "by_category": by_category,
                "monthly": monthly,
            }
        )
