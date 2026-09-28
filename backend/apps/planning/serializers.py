from rest_framework import serializers

from apps.ledger.models import Account, Category, Tag, Transaction
from apps.ledger.serializers import TagNameListField, pop_tags, set_many_related_queryset, user_owned_qs
from apps.planning.models import PlannedTransaction


class PlannedTransactionSerializer(serializers.ModelSerializer):
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags",
        queryset=Tag.objects.none(),
        many=True,
        required=False,
    )
    tag_names = TagNameListField()

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
            "tag_names",
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
        user = self.context["request"].user
        tags = pop_tags(validated_data, user)
        validated_data["user"] = user
        obj = super().create(validated_data)
        if tags:
            obj.tags.set(tags)
        return obj

    def update(self, instance, validated_data):
        user = self.context["request"].user
        tags = pop_tags(validated_data, user, instance)
        obj = super().update(instance, validated_data)
        if tags is not None:
            obj.tags.set(tags)
        return obj
