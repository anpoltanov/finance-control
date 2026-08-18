from django.core.management.base import BaseCommand
from apps.planning.scheduler import commit_due_planned_transactions


class Command(BaseCommand):
    help = "Commit due planned transactions with autocommit enabled"

    def handle(self, *args, **options):
        commit_due_planned_transactions()
        self.stdout.write(self.style.SUCCESS("Done."))
