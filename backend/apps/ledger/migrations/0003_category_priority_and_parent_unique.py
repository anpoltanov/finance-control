# Generated manually for v1.1 category nesting

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ledger", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="priority",
            field=models.CharField(
                blank=True,
                choices=[("must", "Must"), ("need", "Need"), ("want", "Want")],
                max_length=10,
                null=True,
            ),
        ),
        migrations.AlterUniqueTogether(
            name="category",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="category",
            constraint=models.UniqueConstraint(
                fields=("user", "name", "parent"),
                name="ledger_category_user_name_parent_uniq",
                nulls_distinct=False,
            ),
        ),
    ]
