from django.db import models


class RefreshTokenReuse(models.Model):
    """Successor refresh token for a cookie that was just rotated.

    Two tabs can POST the same refresh cookie while ROTATE_REFRESH_TOKENS and
    BLACKLIST_AFTER_ROTATION are enabled. The first request blacklists the
    presented token; later requests in a short window receive this successor
    instead of 401.
    """

    token_hash = models.CharField(max_length=64, primary_key=True)
    refresh = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["created_at"])]
