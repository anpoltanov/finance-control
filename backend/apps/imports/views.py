import json

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.imports.walletapp import commit_import, parse_walletapp_csv, preview_import, preview_to_dict


class WalletAppImportView(APIView):
    def post(self, request):
        max_bytes = getattr(settings, "IMPORT_MAX_BYTES", 5 * 1024 * 1024)
        max_rows = getattr(settings, "IMPORT_MAX_ROWS", 20_000)
        content = None
        upload = request.FILES.get("file")
        if upload:
            if upload.size and upload.size > max_bytes:
                return Response({"detail": "CSV file is too large."}, status=status.HTTP_400_BAD_REQUEST)
            raw = upload.read()
            if len(raw) > max_bytes:
                return Response({"detail": "CSV file is too large."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                content = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                return Response({"detail": "CSV file must be UTF-8."}, status=status.HTTP_400_BAD_REQUEST)
        elif request.data.get("file_content"):
            file_content = request.data["file_content"]
            if not isinstance(file_content, str):
                return Response({"detail": "CSV file required."}, status=status.HTTP_400_BAD_REQUEST)
            if len(file_content.encode("utf-8")) > max_bytes:
                return Response({"detail": "CSV file is too large."}, status=status.HTTP_400_BAD_REQUEST)
            content = file_content

        if not content:
            return Response({"detail": "CSV file required."}, status=status.HTTP_400_BAD_REQUEST)

        rows = parse_walletapp_csv(content)
        if len(rows) > max_rows:
            return Response({"detail": "CSV has too many rows."}, status=status.HTTP_400_BAD_REQUEST)

        dry_run = request.query_params.get("dry_run", "").lower() == "true"

        resolutions_raw = request.POST.get("resolutions") or request.data.get("resolutions")
        try:
            if isinstance(resolutions_raw, str):
                resolutions = json.loads(resolutions_raw) if resolutions_raw else {}
            else:
                resolutions = resolutions_raw or {}
            if not isinstance(resolutions, dict):
                raise ValueError("resolutions must be an object")
        except (json.JSONDecodeError, ValueError, TypeError):
            return Response({"detail": "Invalid resolutions JSON."}, status=status.HTTP_400_BAD_REQUEST)

        if dry_run:
            preview = preview_import(rows, resolutions, user=request.user)
            return Response(preview_to_dict(preview))

        result = commit_import(request.user, rows, resolutions)
        return Response(result)
