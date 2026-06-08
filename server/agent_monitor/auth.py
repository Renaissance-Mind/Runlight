"""Token-based authentication."""

from __future__ import annotations

from fastapi import Header, HTTPException

from agent_monitor.config import DEFAULT_USER_ID, settings


def resolve_user(authorization: str | None = Header(None)) -> str:
    token_map = settings.get_token_map()

    if authorization is None:
        return DEFAULT_USER_ID

    token = authorization.removeprefix("Bearer ").strip()
    if not token or token == authorization:
        return DEFAULT_USER_ID

    if not token_map:
        return DEFAULT_USER_ID

    user_id = token_map.get(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Unknown token")
    return user_id
