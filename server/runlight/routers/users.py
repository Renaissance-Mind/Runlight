"""User endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from runlight.auth import resolve_user

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users/current")
async def current_user(user_id: str = Depends(resolve_user)):
    return {"user_id": user_id}
