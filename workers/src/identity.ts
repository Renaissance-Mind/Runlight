export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function selectGithubVerifiedEmail(entries: Array<Record<string, unknown>>): string | null {
  const verified = entries
    .map((entry) => ({
      email: normalizeEmail(typeof entry.email === "string" ? entry.email : null),
      primary: entry.primary === true,
      verified: entry.verified === true,
    }))
    .filter((entry) => entry.email && entry.verified);

  return verified.find((entry) => entry.primary)?.email || verified[0]?.email || null;
}

export function selectGoogleVerifiedEmail(profile: Record<string, unknown>): string | null {
  const verified = profile.email_verified === true || profile.verified_email === true;
  if (!verified) return null;
  return normalizeEmail(typeof profile.email === "string" ? profile.email : null);
}

