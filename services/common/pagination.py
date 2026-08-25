"""DRF-compatible page-number pagination."""
from __future__ import annotations

from typing import Any, Callable, TypeVar
from urllib.parse import urlencode

from fastapi import Request
from sqlalchemy.orm import Query

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 200


def parse_page_params(page: int = 1, page_size: int = DEFAULT_PAGE_SIZE) -> tuple[int, int]:
    page = max(1, int(page or 1))
    page_size = min(max(1, int(page_size or DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
    return page, page_size


def build_page_links(
    *,
    base_url: str,
    page: int,
    page_size: int,
    total: int,
    extra_params: dict[str, Any] | None = None,
) -> tuple[str | None, str | None]:
    params = dict(extra_params or {})
    params["page_size"] = str(page_size)

    def _url(p: int) -> str:
        q = urlencode({**params, "page": str(p)})
        return f"{base_url}?{q}"

    nxt = _url(page + 1) if page * page_size < total else None
    prev = _url(page - 1) if page > 1 else None
    return nxt, prev


def _page_url(request: Request, page: int) -> str | None:
    if page < 1:
        return None
    params = dict(request.query_params)
    params["page"] = str(page)
    query = urlencode(params)
    base = str(request.url).split("?")[0]
    return f"{base}?{query}" if query else base


def paginate_query(
    request: Request,
    query: Query,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    *,
    max_page_size: int = MAX_PAGE_SIZE,
    serializer: Callable[[Any], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = min(max(1, page_size), max_page_size)
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    if serializer:
        results = [serializer(row) for row in rows]
    else:
        results = rows
    return {
        "count": total,
        "next": _page_url(request, page + 1) if page * page_size < total else None,
        "previous": _page_url(request, page - 1) if page > 1 else None,
        "results": results,
    }
