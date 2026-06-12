import { Hono, type Context } from "hono";
import { resolveRequestUser } from "../auth.ts";
import type { Env } from "../types.ts";

const THEMES = new Set(["dark", "light", "system"]);
const LANGUAGES = new Set(["system", "en", "zh-CN"]);

export interface UserSettings {
  theme: "dark" | "light" | "system";
  language: "system" | "en" | "zh-CN";
  updated_at: string | null;
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: "dark",
  language: "system",
  updated_at: null,
};

export const userSettings = new Hono<{ Bindings: Env }>();

function isTheme(value: unknown): value is UserSettings["theme"] {
  return THEMES.has(String(value));
}

function isLanguage(value: unknown): value is UserSettings["language"] {
  return LANGUAGES.has(String(value));
}

function normalizeSettings(row: Partial<UserSettings> | null | undefined): UserSettings {
  return {
    theme: isTheme(row?.theme) ? row.theme : DEFAULT_SETTINGS.theme,
    language: isLanguage(row?.language) ? row.language : DEFAULT_SETTINGS.language,
    updated_at: row?.updated_at ?? null,
  };
}

async function requestUserId(c: Context<{ Bindings: Env }>): Promise<string | Response> {
  try {
    return await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }
}

userSettings.get("/user-settings", async (c) => {
  const resolved = await requestUserId(c);
  if (resolved instanceof Response) return resolved;

  const row = await c.env.DB.prepare(
    "SELECT theme, language, updated_at FROM user_settings WHERE user_id = ?1",
  )
    .bind(resolved)
    .first<UserSettings>();

  return c.json({ settings: normalizeSettings(row) });
});

userSettings.patch("/user-settings", async (c) => {
  const resolved = await requestUserId(c);
  if (resolved instanceof Response) return resolved;

  const body = await c.req.json<Partial<UserSettings>>();
  const theme = isTheme(body.theme) ? body.theme : DEFAULT_SETTINGS.theme;
  const language = isLanguage(body.language) ? body.language : DEFAULT_SETTINGS.language;
  const updatedAt = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO user_settings (user_id, theme, language, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(user_id) DO UPDATE SET
       theme = excluded.theme,
       language = excluded.language,
       updated_at = excluded.updated_at`,
  )
    .bind(resolved, theme, language, updatedAt)
    .run();

  return c.json({ settings: { theme, language, updated_at: updatedAt } });
});
