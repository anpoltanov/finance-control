from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ledger", "0006_account_exclude_from_statistics"),
    ]

    operations = [
        migrations.AddField(
            model_name="transaction",
            name="client_id",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="transaction",
            constraint=models.UniqueConstraint(
                condition=models.Q(client_id__isnull=False),
                fields=("user", "client_id"),
                name="ledger_tx_user_client_id_uniq",
            ),
        ),
    ]
