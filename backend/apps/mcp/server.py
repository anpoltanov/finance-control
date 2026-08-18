"""MCP server exposing finance data and actions for local AI agents."""

import json
import os
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from mcp.server.mcpserver import MCPServer

API_URL = os.environ.get("FINANCE_API_URL", "http://localhost:8080/api/v1").rstrip("/")
API_TOKEN = os.environ.get("MCP_API_TOKEN", "")

server = MCPServer("finance-control")


def api_request(method: str, path: str, body: dict | None = None) -> Any:
    headers = {"Content-Type": "application/json"}
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"
    data = json.dumps(body).encode() if body is not None else None
    req = Request(f"{API_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except HTTPError as e:
        raise RuntimeError(e.read().decode()) from e


@server.tool()
async def list_accounts() -> str:
    """List all finance accounts with balances."""
    return json.dumps(api_request("GET", "/accounts/"), indent=2, default=str)


@server.tool()
async def list_transactions(type: str = "", date_from: str = "", date_to: str = "") -> str:
    """List transactions with optional type and date filters."""
    params = {k: v for k, v in {"type": type, "date_from": date_from, "date_to": date_to}.items() if v}
    q = "&".join(f"{k}={v}" for k, v in params.items())
    path = f"/transactions/{('?' + q) if q else ''}"
    return json.dumps(api_request("GET", path), indent=2, default=str)


@server.tool()
async def create_transaction(
    type: str,
    account: int,
    amount: str,
    date: str,
    category: int | None = None,
    notes: str = "",
) -> str:
    """Create a new expense, income, or transfer transaction."""
    body = {"type": type, "account": account, "amount": amount, "date": date, "notes": notes}
    if category is not None:
        body["category"] = category
    return json.dumps(api_request("POST", "/transactions/", body), indent=2, default=str)


@server.tool()
async def report_summary(from_date: str = "", to_date: str = "") -> str:
    """Get income/expense summary and spending by category."""
    params = {k: v for k, v in {"from": from_date, "to": to_date}.items() if v}
    q = "&".join(f"{k}={v}" for k, v in params.items())
    path = f"/reports/summary/{('?' + q) if q else ''}"
    return json.dumps(api_request("GET", path), indent=2, default=str)


@server.resource("finance://accounts")
async def accounts_resource() -> str:
    """Current account balances."""
    return json.dumps(api_request("GET", "/accounts/"), indent=2, default=str)


def main():
    server.run()


if __name__ == "__main__":
    main()
