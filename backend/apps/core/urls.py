from django.urls import path

from .views import LoginView, LogoutView, MeView, ReportSummaryView, SyncView

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("sync/", SyncView.as_view(), name="sync"),
    path("reports/summary/", ReportSummaryView.as_view(), name="reports-summary"),
]
