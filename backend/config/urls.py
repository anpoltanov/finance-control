from django.conf import settings
from django.urls import include, path, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.ledger.urls")),
    path("api/v1/", include("apps.imports.urls")),
    path("api/v1/", include("apps.budgets.urls")),
    path("api/v1/", include("apps.planning.urls")),
]

if settings.FRONTEND_DIST.exists():
    urlpatterns += [
        re_path(r"^(?!api/|static/).*$", TemplateView.as_view(template_name="index.html")),
    ]
