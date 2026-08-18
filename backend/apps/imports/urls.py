from django.urls import path

from apps.imports.views import WalletAppImportView

urlpatterns = [
    path("import/walletapp/", WalletAppImportView.as_view(), name="import-walletapp"),
]
