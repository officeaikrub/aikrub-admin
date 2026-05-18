/**
 * WordmarkLogo — renders "AIKrub" with "AI" in accent color, "Krub" in fg.
 * Used in login page, top bar, and any place "AIKrub" appears in the admin panel.
 *
 * Usage:
 *   <WordmarkLogo />                  → "AIKrub"
 *   <WordmarkLogo suffix=" Admin" />  → "AIKrub Admin"
 */

interface WordmarkLogoProps {
  /** Optional text appended after "Krub" in muted color */
  suffix?: string;
  className?: string;
}

export function WordmarkLogo({ suffix, className }: WordmarkLogoProps) {
  return (
    <span className={className}>
      <span style={{ color: "var(--color-accent)" }}>AI</span>
      <span style={{ color: "var(--color-fg)" }}>Krub</span>
      {suffix && (
        <span style={{ color: "var(--color-fg-muted)" }}>{suffix}</span>
      )}
    </span>
  );
}
