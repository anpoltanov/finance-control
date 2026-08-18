import logging

from apscheduler.schedulers.background import BackgroundScheduler
from django.conf import settings
from django_apscheduler.jobstores import DjangoJobStore
from django.utils import timezone

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone=settings.TIME_ZONE)
scheduler.add_jobstore(DjangoJobStore(), "default")


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


if not scheduler.running:
    scheduler.add_job(
        commit_due_planned_transactions,
        trigger="cron",
        hour=1,
        minute=0,
        id="commit_planned_transactions",
        replace_existing=True,
        max_instances=1,
    )
    try:
        scheduler.start()
    except Exception:
        pass
