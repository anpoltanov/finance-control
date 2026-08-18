from rest_framework import serializers

from apps.budgets.models import Budget
from apps.ledger.models import Category


class BudgetSerializer(serializers.ModelSerializer):
    category_ids = serializers.PrimaryKeyRelatedField(
        source="categories", queryset=Category.objects.none(), many=True, required=False
    )
    status = serializers.SerializerMethodField()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            self.fields["category_ids"].queryset = Category.objects.filter(user=user)

    class Meta:
        model = Budget
        fields = [
            "id",
            "name",
            "amount",
            "start_date",
            "period",
            "rollover_enabled",
            "category_ids",
            "status",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = ["created_at", "updated_at", "version", "status"]

    def get_status(self, obj):
        return obj.compute_status()

    def create(self, validated_data):
        categories = validated_data.pop("categories", [])
        validated_data["user"] = self.context["request"].user
        budget = super().create(validated_data)
        if categories:
            budget.categories.set(categories)
        return budget

    def update(self, instance, validated_data):
        categories = validated_data.pop("categories", None)
        budget = super().update(instance, validated_data)
        if categories is not None:
            budget.categories.set(categories)
        return budget
