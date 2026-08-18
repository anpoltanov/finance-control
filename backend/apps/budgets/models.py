from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.contrib.auth.models import User
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from apps.ledger.models import TimestampedModel, Transaction


class Budget(TimestampedModel):
    PERIOD_MONTHLY = "monthly"
    PERIOD_YEARLY = "yearly"
    PERIOD_CHOICES = [(PERIOD_MONTHLY, "Monthly"), (PERIOD_YEARLY, "Yearly")]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="budgets")
    household_id = models.UUIDField(null=True, blank=True, db_index=True)
    name = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    start_date = models.DateField()
    period = models.CharField(max_length=10, choices=PERIOD_CHOICES, default=PERIOD_MONTHLY)
    rollover_enabled = models.BooleanField(default=False)
    categories = models.ManyToManyField("ledger.Category", blank=True, related_name="budgets")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def period_bounds(self, reference: date | None = None) -> tuple[date, date]:
        reference = reference or timezone.localdate()
        start = self.start_date
        if self.period == self.PERIOD_MONTHLY:
            delta = relativedelta(months=1)
        else:
            delta = relativedelta(years=1)

        period_start = start
        while period_start + delta <= reference:
            period_start = period_start + delta
        period_end = period_start + delta - relativedelta(days=1)
        return period_start, period_end

    def spent_in_period(self, period_start: date, period_end: date) -> Decimal:
        qs = Transaction.objects.filter(
            user=self.user,
            type=Transaction.TYPE_EXPENSE,
            date__date__gte=period_start,
            date__date__lte=period_end,
            deleted_at__isnull=True,
        )
        if self.categories.exists():
            qs = qs.filter(category__in=self.categories.all())
        return qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")

    def compute_status(self, reference: date | None = None) -> dict:
        period_start, period_end = self.period_bounds(reference)
        spent = self.spent_in_period(period_start, period_end)
        limit = self.amount

        if self.rollover_enabled:
            rollover = Decimal("0")
            cursor_start = self.start_date
            delta = relativedelta(months=1) if self.period == self.PERIOD_MONTHLY else relativedelta(years=1)
            while cursor_start < period_start:
                cursor_end = cursor_start + delta - relativedelta(days=1)
                period_spent = self.spent_in_period(cursor_start, cursor_end)
                rollover += max(self.amount - period_spent, Decimal("0"))
                cursor_start += delta
            limit += rollover

        remaining = limit - spent
        return {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "limit": str(limit),
            "spent": str(spent),
            "remaining": str(remaining),
            "percent_used": float(spent / limit * 100) if limit else 0.0,
        }
