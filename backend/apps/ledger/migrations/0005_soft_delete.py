from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ledger", "0004_category_color"),
    ]

    operations = [
        migrations.AddField(
            model_name="account",
            name="deleted_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="category",
            name="deleted_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="tag",
            name="deleted_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="deleted_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
