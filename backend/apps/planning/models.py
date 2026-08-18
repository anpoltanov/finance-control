from datetime import datetime, time as dt_time
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone

from apps.ledger.models import Account, Category, Tag, TimestampedModel, Transaction


class PlannedTransaction(TimestampedModel):
    REPEAT_ONCE = "once"
    REPEAT_MONTHLY = "monthly"
    REPEAT_YEARLY = "yearly"
    REPEAT_CHOICES = [
        (REPEAT_ONCE, "Once"),
        (REPEAT_MONTHLY, "Monthly"),
        (REPEAT_YEARLY, "Yearly"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="planned_transactions")
    household_id = models.UUIDField(null=True, blank=True, db_index=True)
    type = models.CharField(max_length=10, choices=Transaction.TYPE_CHOICES)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="planned_transactions")
    to_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name="planned_incoming"
    )
    transfer_kind = models.CharField(max_length=20, choices=Transaction.TRANSFER_KIND_CHOICES, null=True, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    next_occurrence_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    repeat_rule = models.CharField(max_length=10, choices=REPEAT_CHOICES, default=REPEAT_ONCE)
    autocommit = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    recipient = models.CharField(max_length=255, blank=True)
    payment_type = models.CharField(max_length=64, blank=True)
    currency_code = models.CharField(max_length=3, default="RUB")
    tags = models.ManyToManyField(Tag, blank=True)
    last_committed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["next_occurrence_date", "id"]

    def advance_schedule(self):
        if self.repeat_rule == self.REPEAT_ONCE:
            return
        if self.repeat_rule == self.REPEAT_MONTHLY:
            self.next_occurrence_date += relativedelta(months=1)
        elif self.repeat_rule == self.REPEAT_YEARLY:
            self.next_occurrence_date += relativedelta(years=1)

    def commit(self) -> Transaction:
        naive = datetime.combine(self.next_occurrence_date, dt_time.min)
        tx = Transaction.objects.create(
            user=self.user,
            type=self.type,
            account=self.account,
            to_account=self.to_account,
            transfer_kind=self.transfer_kind,
            amount=self.amount,
            category=self.category,
            date=timezone.make_aware(naive) if timezone.is_naive(naive) else naive,
            notes=self.notes,
            recipient=self.recipient,
            payment_type=self.payment_type,
            currency_code=self.currency_code,
            planned_transaction=self,
            status=Transaction.STATUS_CLEARED,
        )
        tx.tags.set(self.tags.all())
        self.last_committed_at = timezone.now()
        if self.repeat_rule == self.REPEAT_ONCE:
            self.soft_delete()
        else:
            self.advance_schedule()
            self.save(update_fields=["last_committed_at", "next_occurrence_date", "updated_at", "version"])
        return tx
