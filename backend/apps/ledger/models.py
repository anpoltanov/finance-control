from decimal import Decimal

from django.contrib.auth.models import User
from django.db import models, transaction
from django.db.models import Q, Sum


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk:
            with transaction.atomic():
                current = (
                    type(self)
                    .objects.select_for_update()
                    .filter(pk=self.pk)
                    .values_list("version", flat=True)
                    .first()
                )
                self.version = (current or 0) + 1
                update_fields = kwargs.get("update_fields")
                if update_fields is not None:
                    kwargs["update_fields"] = set(update_fields) | {"version"}
                super().save(*args, **kwargs)
            return
        super().save(*args, **kwargs)

    def soft_delete(self):
        from django.utils import timezone

        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at", "updated_at", "version"])


class Account(TimestampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="accounts")
    household_id = models.UUIDField(null=True, blank=True, db_index=True)
    title = models.CharField(max_length=255)
    icon = models.CharField(max_length=32, default="credit_card")
    color = models.CharField(max_length=7, default="#6366f1")
    sort_order = models.IntegerField(default=0)
    archived = models.BooleanField(default=False)
    exclude_from_statistics = models.BooleanField(default=False)
    currency_code = models.CharField(max_length=3, default="RUB")
    initial_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal("0"))

    class Meta:
        ordering = ["sort_order", "title"]
        unique_together = [("user", "title")]

    def __str__(self):
        return self.title

    def compute_balance(self) -> Decimal:
        from apps.ledger.models import Transaction

        balance = self.initial_balance
        txs = Transaction.objects.filter(user=self.user, deleted_at__isnull=True).filter(
            Q(account=self) | Q(to_account=self)
        )
        for tx in txs:
            if tx.type == "income" and tx.account_id == self.id:
                balance += tx.amount
            elif tx.type == "expense" and tx.account_id == self.id:
                balance -= tx.amount
            elif tx.type == "transfer":
                if tx.transfer_kind == "account_to_account":
                    if tx.account_id == self.id:
                        balance -= tx.amount
                    elif tx.to_account_id == self.id:
                        balance += tx.amount
                elif tx.transfer_kind == "to_nowhere" and tx.account_id == self.id:
                    balance -= tx.amount
                elif tx.transfer_kind == "from_nowhere" and tx.account_id == self.id:
                    balance += tx.amount
        return balance


class Category(TimestampedModel):
    TYPE_EXPENSE = "expense"
    TYPE_INCOME = "income"
    TYPE_CHOICES = [(TYPE_EXPENSE, "Expense"), (TYPE_INCOME, "Income")]

    PRIORITY_MUST = "must"
    PRIORITY_NEED = "need"
    PRIORITY_WANT = "want"
    PRIORITY_CHOICES = [
        (PRIORITY_MUST, "Must"),
        (PRIORITY_NEED, "Need"),
        (PRIORITY_WANT, "Want"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="categories")
    household_id = models.UUIDField(null=True, blank=True, db_index=True)
    name = models.CharField(max_length=255)
    icon = models.CharField(max_length=32, default="folder")
    color = models.CharField(max_length=7, default="#6366f1")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default=TYPE_EXPENSE)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, null=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name", "parent"],
                name="ledger_category_user_name_parent_uniq",
                nulls_distinct=False,
            ),
        ]

    def __str__(self):
        return self.name

    @classmethod
    def ids_with_descendants(cls, user, category_ids):
        """Return selected category ids plus every nested child (any depth)."""
        selected = {int(cid) for cid in category_ids}
        if not selected:
            return set()
        rows = cls.objects.filter(user=user, deleted_at__isnull=True).values_list("id", "parent_id")
        children: dict[int | None, list[int]] = {}
        for cid, parent_id in rows:
            children.setdefault(parent_id, []).append(cid)
        expanded: set[int] = set()
        stack = list(selected)
        while stack:
            cid = stack.pop()
            if cid in expanded:
                continue
            expanded.add(cid)
            stack.extend(children.get(cid, []))
        return expanded


class Tag(TimestampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tags")
    household_id = models.UUIDField(null=True, blank=True, db_index=True)
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#94a3b8")

    class Meta:
        ordering = ["name"]
        unique_together = [("user", "name")]

    def __str__(self):
        return self.name


class Transaction(TimestampedModel):
    TYPE_EXPENSE = "expense"
    TYPE_INCOME = "income"
    TYPE_TRANSFER = "transfer"
    TYPE_CHOICES = [
        (TYPE_EXPENSE, "Expense"),
        (TYPE_INCOME, "Income"),
        (TYPE_TRANSFER, "Transfer"),
    ]

    TRANSFER_ACCOUNT = "account_to_account"
    TRANSFER_TO_NOWHERE = "to_nowhere"
    TRANSFER_FROM_NOWHERE = "from_nowhere"
    TRANSFER_KIND_CHOICES = [
        (TRANSFER_ACCOUNT, "Account to account"),
        (TRANSFER_TO_NOWHERE, "To nowhere"),
        (TRANSFER_FROM_NOWHERE, "From nowhere"),
    ]

    STATUS_PENDING = "pending"
    STATUS_CLEARED = "cleared"
    STATUS_RECONCILED = "reconciled"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_CLEARED, "Cleared"),
        (STATUS_RECONCILED, "Reconciled"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="transactions")
    household_id = models.UUIDField(null=True, blank=True, db_index=True)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="transactions")
    to_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name="incoming_transfers"
    )
    transfer_kind = models.CharField(max_length=20, choices=TRANSFER_KIND_CHOICES, null=True, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="transactions")
    date = models.DateTimeField()
    notes = models.TextField(blank=True)
    recipient = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_CLEARED)
    payment_type = models.CharField(max_length=64, blank=True)
    currency_code = models.CharField(max_length=3, default="RUB")
    ref_currency_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="transactions")
    planned_transaction = models.ForeignKey(
        "planning.PlannedTransaction",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="committed_transactions",
    )
    import_source_id = models.CharField(max_length=64, blank=True, db_index=True)
    import_pair_id = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ["-date", "-id"]
        indexes = [
            models.Index(fields=["user", "date"]),
            models.Index(fields=["user", "type"]),
            models.Index(fields=["user", "account"]),
            models.Index(fields=["user", "category"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"{self.type} {self.amount} @ {self.date.date()}"
