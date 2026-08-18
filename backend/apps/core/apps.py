from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self):
        import sys

        if any(cmd in sys.argv for cmd in ("migrate", "makemigrations", "test", "seed_user", "commit_planned")):
            return
        from apps.planning import scheduler  # noqa: F401
