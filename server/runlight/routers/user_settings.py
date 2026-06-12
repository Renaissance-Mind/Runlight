"""User dashboard settings endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from runlight.auth import resolve_user
from runlight.db.models import UserSettings
from runlight.db.session import get_db

Theme = Literal["dark", "light", "system"]
Language = Literal["system", "en", "zh-CN"]


class UserSettingsPatch(BaseModel):
    theme: Theme = "dark"
    language: Language = "system"


router = APIRouter(prefix="/api", tags=["user-settings"])


def _settings_dict(settings: UserSettings | None) -> dict:
    if settings is None:
        return {"theme": "dark", "language": "system", "updated_at": None}
    return {
        "theme": settings.theme,
        "language": settings.language,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


@router.get("/user-settings")
async def get_user_settings(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(resolve_user),
):
    result = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    return {"settings": _settings_dict(result.scalar_one_or_none())}


@router.patch("/user-settings")
async def save_user_settings(
    patch: UserSettingsPatch,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(resolve_user),
):
    result = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    settings = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if settings is None:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
    settings.theme = patch.theme
    settings.language = patch.language
    settings.updated_at = now
    await db.commit()
    await db.refresh(settings)
    return {"settings": _settings_dict(settings)}
