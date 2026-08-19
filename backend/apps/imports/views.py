import json

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.imports.walletapp import commit_import, parse_walletapp_csv, preview_import, preview_to_dict


class WalletAppImportView(APIView):
    def post(self, request):
        content = None
        upload = request.FILES.get("file")
        if upload:
            content = upload.read().decode("utf-8-sig")
        elif request.data.get("file_content"):
            content = request.data["file_content"]

        if not content:
            return Response({"detail": "CSV file required."}, status=status.HTTP_400_BAD_REQUEST)

        rows = parse_walletapp_csv(content)
        dry_run = request.query_params.get("dry_run", "").lower() == "true"

        resolutions_raw = request.POST.get("resolutions") or request.data.get("resolutions")
        if isinstance(resolutions_raw, str):
            resolutions = json.loads(resolutions_raw) if resolutions_raw else {}
        else:
            resolutions = resolutions_raw or {}

        if dry_run:
            preview = preview_import(rows, resolutions, user=request.user)
            return Response(preview_to_dict(preview))

        result = commit_import(request.user, rows, resolutions)
        return Response(result)
