import logging

from django.utils import timezone

logger = logging.getLogger(__name__)


def commit_due_planned_transactions():
    from apps.planning.models import PlannedTransaction

    today = timezone.localdate()
    due = PlannedTransaction.objects.filter(
        autocommit=True, next_occurrence_date__lte=today, deleted_at__isnull=True
    )
    count = 0
    for planned in due:
        if planned.end_date and planned.next_occurrence_date > planned.end_date:
            continue
        try:
            planned.commit()
            count += 1
        except Exception:
            logger.exception("Failed to autocommit planned transaction %s", planned.pk)
    logger.info("Autocommitted %s planned transactions", count)
