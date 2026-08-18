from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("budgets", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="budget",
            name="deleted_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
