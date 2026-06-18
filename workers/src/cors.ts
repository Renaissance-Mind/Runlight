export type CorsOriginOption = string | string[] | ((origin: string) => string | null);

export function parseCorsOrigins(value?: string): CorsOriginOption {
  const origins = (value || "*").split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0 || origins.includes("*")) {
    return (origin: string) => origin || null;
  }
  return origins;
}
