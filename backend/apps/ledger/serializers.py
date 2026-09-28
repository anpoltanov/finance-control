from django.db import IntegrityError
from rest_framework import serializers

from apps.ledger.models import Account, Category, Tag, Transaction
from apps.planning.models import PlannedTransaction


def set_related_queryset(field, queryset):
    field.queryset = queryset
    child = getattr(field, "child_relation", None)
    if child is not None:
        child.queryset = queryset


def set_many_related_queryset(field, queryset):
    """DRF wraps many=True PK fields in ManyRelatedField; queryset lives on child_relation."""
    set_related_queryset(field, queryset)


def user_owned_qs(model, user):
    if user is not None and getattr(user, "is_authenticated", False):
        return model.objects.filter(user=user, deleted_at__isnull=True)
    return model.objects.none()


class TagNameListField(serializers.ListField):
    """Read tag names from the relation and accept names when creating new tags."""

    child = serializers.CharField(max_length=100, trim_whitespace=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_empty", True)
        super().__init__(**kwargs)

    def get_attribute(self, instance):
        manager = getattr(instance, "tags", None)
        if manager is None:
            return []
        if hasattr(manager, "all"):
            return [tag.name for tag in manager.all()]
        return list(manager)


def get_or_create_tag(user, name: str) -> Tag:
    cleaned = name.strip()
    active = Tag.objects.filter(user=user, deleted_at__isnull=True, name__iexact=cleaned).first()
    if active is not None:
        return active
    deleted = Tag.objects.filter(user=user, deleted_at__isnull=False, name__iexact=cleaned).first()
    if deleted is not None:
        deleted.deleted_at = None
        deleted.save(update_fields=["deleted_at", "updated_at", "version"])
        return deleted
    try:
        return Tag.objects.create(user=user, name=cleaned)
    except IntegrityError:
        tag = Tag.objects.filter(user=user, name__iexact=cleaned).first()
        if tag is None:
            raise
        if tag.deleted_at is not None:
            tag.deleted_at = None
            tag.save(update_fields=["deleted_at", "updated_at", "version"])
        return tag


def pop_tags(validated_data, user, instance=None):
    """Resolve tag_ids and tag_names into a tag list.

    Returns None when the request did not mention tags, so partial updates keep
    the current set. An explicit tag_ids list replaces the set; tag_names are
    created when missing and added to that set.
    """
    has_ids = "tags" in validated_data
    has_names = "tag_names" in validated_data
    tags = validated_data.pop("tags", None)
    names = validated_data.pop("tag_names", None)
    if not has_ids and not has_names:
        return None

    chosen = {}
    if has_ids:
        for tag in tags or []:
            chosen[tag.pk] = tag
    elif instance is not None:
        for tag in instance.tags.all():
            chosen[tag.pk] = tag

    for raw in names or []:
        name = (raw or "").strip()
        if not name:
            continue
        tag = get_or_create_tag(user, name)
        chosen[tag.pk] = tag
    return list(chosen.values())


class AccountSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            "id",
            "title",
            "icon",
            "color",
            "sort_order",
            "archived",
            "exclude_from_statistics",
            "currency_code",
            "initial_balance",
            "balance",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = ["created_at", "updated_at", "version", "balance"]

    def get_balance(self, obj):
        return str(obj.compute_balance())


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "icon", "color", "type", "parent", "priority", "created_at", "updated_at", "version"]
        read_only_fields = ["created_at", "updated_at", "version"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        self.fields["parent"].queryset = user_owned_qs(Category, user)

    def validate(self, attrs):
        cat_type = attrs.get("type", getattr(self.instance, "type", Category.TYPE_EXPENSE))
        priority = attrs.get("priority", getattr(self.instance, "priority", None))
        if cat_type == Category.TYPE_INCOME:
            attrs["priority"] = None
        elif priority and priority not in dict(Category.PRIORITY_CHOICES):
            raise serializers.ValidationError({"priority": "Invalid priority."})
        return attrs


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "color", "created_at", "updated_at", "version"]
        read_only_fields = ["created_at", "updated_at", "version"]


class TransactionSerializer(serializers.ModelSerializer):
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags", queryset=Tag.objects.none(), many=True, required=False
    )
    tag_names = TagNameListField()
    account_title = serializers.CharField(source="account.title", read_only=True)
    to_account_title = serializers.CharField(source="to_account.title", read_only=True, allow_null=True)
    category_name = serializers.CharField(source="category.name", read_only=True, allow_null=True)
    category_icon = serializers.CharField(source="category.icon", read_only=True, allow_null=True)
    category_color = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = [
            "id",
            "type",
            "account",
            "account_title",
            "to_account",
            "to_account_title",
            "transfer_kind",
            "amount",
            "category",
            "category_name",
            "category_icon",
            "category_color",
            "date",
            "notes",
            "recipient",
            "status",
            "payment_type",
            "currency_code",
            "ref_currency_amount",
            "tag_ids",
            "tag_names",
            "planned_transaction",
            "import_source_id",
            "import_pair_id",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "version",
            "import_source_id",
            "import_pair_id",
            "category_icon",
            "category_color",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        set_many_related_queryset(self.fields["tag_ids"], user_owned_qs(Tag, user))
        self.fields["account"].queryset = user_owned_qs(Account, user)
        self.fields["to_account"].queryset = user_owned_qs(Account, user)
        self.fields["category"].queryset = user_owned_qs(Category, user)
        self.fields["planned_transaction"].queryset = user_owned_qs(PlannedTransaction, user)

    def get_category_color(self, obj):
        cat = obj.category
        if not cat:
            return None
        while cat.parent_id:
            parent = getattr(cat, "parent", None)
            if parent is None:
                break
            cat = parent
        return cat.color

    def validate(self, attrs):
        tx_type = attrs.get("type", getattr(self.instance, "type", None))
        transfer_kind = attrs.get("transfer_kind", getattr(self.instance, "transfer_kind", None))
        account = attrs.get("account", getattr(self.instance, "account", None))
        to_account = attrs.get("to_account", getattr(self.instance, "to_account", None))
        amount = attrs.get("amount", getattr(self.instance, "amount", None))

        if amount is not None and amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be positive."})

        if tx_type == Transaction.TYPE_TRANSFER:
            if not transfer_kind:
                raise serializers.ValidationError({"transfer_kind": "Required for transfers."})
            if transfer_kind == Transaction.TRANSFER_ACCOUNT:
                if not to_account:
                    raise serializers.ValidationError({"to_account": "Destination account required."})
                if account and to_account and account.id == to_account.id:
                    raise serializers.ValidationError({"to_account": "Accounts must differ."})
            elif transfer_kind in (Transaction.TRANSFER_TO_NOWHERE, Transaction.TRANSFER_FROM_NOWHERE):
                attrs["to_account"] = None
        else:
            attrs["transfer_kind"] = None
            attrs["to_account"] = None

        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        tags = pop_tags(validated_data, user)
        validated_data["user"] = user
        tx = super().create(validated_data)
        if tags:
            tx.tags.set(tags)
        return tx

    def update(self, instance, validated_data):
        user = self.context["request"].user
        tags = pop_tags(validated_data, user, instance)
        tx = super().update(instance, validated_data)
        if tags is not None:
            tx.tags.set(tags)
        return tx
