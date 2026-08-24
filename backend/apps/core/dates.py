from datetime import datetime

from django.utils import timezone
from rest_framework.exceptions import ValidationError


def parse_datetime_param(value: str | None, field: str = "date"):
    """Parse an ISO datetime or date query param. Invalid values raise 400."""
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise ValidationError({field: "Invalid datetime."})
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed
