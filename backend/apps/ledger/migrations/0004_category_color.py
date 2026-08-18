from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ledger", "0003_category_priority_and_parent_unique"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="color",
            field=models.CharField(default="#6366f1", max_length=7),
        ),
    ]
