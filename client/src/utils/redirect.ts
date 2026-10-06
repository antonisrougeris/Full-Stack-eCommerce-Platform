const SAFE_REDIRECT_BASE = "https://skanare.local";

export function normalizeSameOriginPath(
  value: string | null | undefined,
  fallback: string | null = null
): string | null {
  if (!value) return fallback;

  const cleaned = value.trim();

  if (
    !cleaned ||
    !cleaned.startsWith("/") ||
    cleaned.startsWith("//") ||
    cleaned.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(cleaned)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(
      cleaned,
      SAFE_REDIRECT_BASE
    );

    if (
      parsed.origin !==
      SAFE_REDIRECT_BASE
    ) {
      return fallback;
    }

    return (
      parsed.pathname +
      parsed.search +
      parsed.hash
    );
  } catch {
    return fallback;
  }
}
