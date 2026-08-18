from django.contrib import admin
from apps.budgets.models import Budget
from apps.ledger.models import Account, Category, Tag, Transaction
from apps.planning.models import PlannedTransaction

admin.site.register(Account)
admin.site.register(Category)
admin.site.register(Tag)
admin.site.register(Transaction)
admin.site.register(Budget)
admin.site.register(PlannedTransaction)
