from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ledger", "0005_soft_delete"),
    ]

    operations = [
        migrations.AddField(
            model_name="account",
            name="exclude_from_statistics",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="account",
            name="icon",
            field=models.CharField(default="credit_card", max_length=32),
        ),
        migrations.AlterField(
            model_name="category",
            name="icon",
            field=models.CharField(default="folder", max_length=32),
        ),
    ]
