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
    tag_names = serializers.SerializerMethodField()
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
            "tag_names",
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

    def get_tag_names(self, obj):
        return list(obj.tags.values_list("name", flat=True))

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
        tags = validated_data.pop("tags", [])
        validated_data["user"] = self.context["request"].user
        tx = super().create(validated_data)
        if tags:
            tx.tags.set(tags)
        return tx

    def update(self, instance, validated_data):
        tags = validated_data.pop("tags", None)
        tx = super().update(instance, validated_data)
        if tags is not None:
            tx.tags.set(tags)
        return tx
