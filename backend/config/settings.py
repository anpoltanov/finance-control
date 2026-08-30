import os
import sys
import urllib.parse as up
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR / "static" / "frontend"

INSECURE_SECRET = "django-insecure-dev-only-change-me"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() == "true"


SECRET_KEY = os.environ.get("SECRET_KEY", INSECURE_SECRET)
DEBUG = _env_bool("DEBUG", False)
RUNNING_TESTS = "test" in sys.argv


def _parse_host_list(raw: str) -> list[str]:
    """Parse ALLOWED_HOSTS; strip quotes and accidental URL schemes (https://...)."""
    hosts: list[str] = []
    for part in raw.split(","):
        item = part.strip().strip("\"'")
        if not item:
            continue
        if "://" in item:
            item = up.urlparse(item).hostname or item
        item = item.split("/")[0].strip().strip("\"'")
        if item and item not in hosts:
            hosts.append(item)
    return hosts


ALLOWED_HOSTS = _parse_host_list(os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1"))

if not DEBUG and not RUNNING_TESTS:
    if not SECRET_KEY or SECRET_KEY == INSECURE_SECRET:
        raise ImproperlyConfigured("SECRET_KEY must be set to a strong value when DEBUG is false.")
    if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured("ALLOWED_HOSTS must be an explicit host list when DEBUG is false.")

BEHIND_PROXY = _env_bool("BEHIND_PROXY", True)
if BEHIND_PROXY:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    USE_X_FORWARDED_HOST = True

if "SECURE_SSL_REDIRECT" in os.environ:
    SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", False)
else:
    SECURE_SSL_REDIRECT = not DEBUG and not BEHIND_PROXY

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

USE_HSTS = _env_bool("USE_HSTS", default=not DEBUG and not BEHIND_PROXY)
if USE_HSTS:
    SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", False)

SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", default=not DEBUG)

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_apscheduler",
    "apps.core",
    "apps.ledger",
    "apps.imports",
    "apps.budgets",
    "apps.planning",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [FRONTEND_DIST],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if DATABASE_URL:
    parsed = up.urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": parsed.username,
            "PASSWORD": parsed.password,
            "HOST": parsed.hostname,
            "PORT": parsed.port or 5432,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.environ.get("TIME_ZONE", "Europe/Moscow")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []
# Vite already content-hashes assets; Django manifest hashing would 404 them.
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.core.authentication.CookieJWTAuthentication",
        "apps.core.authentication.MCPTokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "login": "5/min",
    },
}
if RUNNING_TESTS:
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["login"] = "1000/min"
if DEBUG:
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

if "JWT_COOKIE_SECURE" in os.environ:
    JWT_COOKIE_SECURE = _env_bool("JWT_COOKIE_SECURE", True)
else:
    JWT_COOKIE_SECURE = not DEBUG
JWT_COOKIE_HTTPONLY = True
JWT_COOKIE_SAMESITE = os.environ.get("JWT_COOKIE_SAMESITE", "Lax")
JWT_COOKIE_PATH = "/"

MCP_API_TOKEN = os.environ.get("MCP_API_TOKEN", "")
MCP_USERNAME = os.environ.get("MCP_USERNAME", "")

DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
IMPORT_MAX_BYTES = DATA_UPLOAD_MAX_MEMORY_SIZE
IMPORT_MAX_ROWS = 20_000

APSCHEDULER_DATETIME_FORMAT = "N H:i:s"
APSCHEDULER_RUN_NOW_TIMEOUT = 25
