from rest_framework import serializers

from apps.ledger.models import Account, Category, Tag, Transaction
from apps.ledger.serializers import InstantDateTimeField, assign_tags, set_many_related_queryset, user_owned_qs
from apps.planning.models import PlannedTransaction


class PlannedCommitSerializer(serializers.Serializer):
    """Optional fields for one posted transaction. Schedule fields are not accepted."""

    type = serializers.ChoiceField(choices=Transaction.TYPE_CHOICES, required=False)
    account = serializers.PrimaryKeyRelatedField(queryset=Account.objects.none(), required=False)
    to_account = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.none(), required=False, allow_null=True
    )
    transfer_kind = serializers.ChoiceField(
        choices=Transaction.TRANSFER_KIND_CHOICES, required=False, allow_null=True
    )
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.none(), required=False, allow_null=True)
    date = InstantDateTimeField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    recipient = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=Transaction.STATUS_CHOICES, required=False)
    payment_type = serializers.CharField(required=False, allow_blank=True)
    currency_code = serializers.CharField(required=False, max_length=3)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags", queryset=Tag.objects.none(), many=True, required=False
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        set_many_related_queryset(self.fields["tag_ids"], user_owned_qs(Tag, user))
        self.fields["account"].queryset = user_owned_qs(Account, user)
        self.fields["to_account"].queryset = user_owned_qs(Account, user)
        self.fields["category"].queryset = user_owned_qs(Category, user)

    def validate(self, attrs):
        planned = self.context["planned"]
        tx_type = attrs.get("type", planned.type)
        transfer_kind = attrs["transfer_kind"] if "transfer_kind" in attrs else planned.transfer_kind
        account = attrs.get("account", planned.account)
        to_account = attrs["to_account"] if "to_account" in attrs else planned.to_account
        amount = attrs.get("amount", planned.amount)

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


class PlannedTransactionSerializer(serializers.ModelSerializer):
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags",
        queryset=Tag.objects.none(),
        many=True,
        required=False,
    )

    class Meta:
        model = PlannedTransaction
        fields = [
            "id",
            "type",
            "account",
            "to_account",
            "transfer_kind",
            "amount",
            "category",
            "next_occurrence_date",
            "end_date",
            "repeat_rule",
            "autocommit",
            "notes",
            "recipient",
            "payment_type",
            "currency_code",
            "tag_ids",
            "last_committed_at",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = ["created_at", "updated_at", "version", "last_committed_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        set_many_related_queryset(self.fields["tag_ids"], user_owned_qs(Tag, user))
        self.fields["account"].queryset = user_owned_qs(Account, user)
        self.fields["to_account"].queryset = user_owned_qs(Account, user)
        self.fields["category"].queryset = user_owned_qs(Category, user)

    def validate(self, attrs):
        tx_type = attrs.get("type", getattr(self.instance, "type", None))
        if tx_type == Transaction.TYPE_TRANSFER and not attrs.get("transfer_kind"):
            raise serializers.ValidationError({"transfer_kind": "Required for transfers."})
        return attrs

    def create(self, validated_data):
        tags = validated_data.pop("tags", [])
        validated_data["user"] = self.context["request"].user
        obj = super().create(validated_data)
        assign_tags(obj, tags)
        return obj

    def update(self, instance, validated_data):
        if "tags" in validated_data:
            tags = validated_data.pop("tags")
        else:
            tags = None
        obj = super().update(instance, validated_data)
        assign_tags(obj, tags)
        return obj
