from django.core.management.base import BaseCommand
from django.contrib.auth.models import User


class Command(BaseCommand):
    help = "Create initial user for the finance app"

    def add_arguments(self, parser):
        parser.add_argument("--username", default="admin")
        parser.add_argument("--password", required=True)

    def handle(self, *args, **options):
        username = options["username"]
        password = options["password"]
        user, created = User.objects.get_or_create(username=username)
        user.set_password(password)
        user.is_staff = True
        user.is_superuser = True
        user.save()
        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} user '{username}'"))
