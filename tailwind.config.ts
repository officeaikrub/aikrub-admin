import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  // Admin is dark-first — class strategy so Pete can toggle later if needed.
  darkMode: "class",

  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],

  theme: {
    extend: {
      // ─── Font families ────────────────────────────────────────
      // Mirror main AIKrub design system.
      fontFamily: {
        display: [
          "Krub",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        ui: [
          "Anuphan",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        content: [
          "Anuphan",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        // mono — สำหรับ numeric columns, IDs, code blocks ใน admin tables
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },

      // ─── Colors ───────────────────────────────────────────────
      colors: {
        // Surface
        surface:          "var(--color-bg)",
        "surface-muted":  "var(--color-bg-muted)",
        "surface-raised": "var(--color-bg-raised)",

        // Text
        fg:              "var(--color-fg)",
        "fg-muted":      "var(--color-fg-muted)",
        "fg-subtle":     "var(--color-fg-subtle)",

        // Border
        border:          "var(--color-border)",
        "border-strong": "var(--color-border-strong)",

        // Accent (brand orange — same as main)
        accent:          "var(--color-accent)",
        "accent-deep":   "var(--color-accent-deep)",
        "accent-tint":   "var(--color-accent-tint)",
        "accent-fg":     "var(--color-accent-fg)",

        // Status
        success:         "var(--color-success)",
        warning:         "var(--color-warning)",
        error:           "var(--color-error)",
        info:            "var(--color-info)",

        // shadcn/ui semantic color tokens — required by button/card/input
        background:          "hsl(var(--background))",
        foreground:          "hsl(var(--foreground))",
        card:                "hsl(var(--card))",
        "card-foreground":   "hsl(var(--card-foreground))",
        popover:             "hsl(var(--popover))",
        "popover-foreground":"hsl(var(--popover-foreground))",
        primary:             "hsl(var(--primary))",
        "primary-foreground":"hsl(var(--primary-foreground))",
        secondary:           "hsl(var(--secondary))",
        "secondary-foreground":"hsl(var(--secondary-foreground))",
        muted:               "hsl(var(--muted))",
        "muted-foreground":  "hsl(var(--muted-foreground))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive:         "hsl(var(--destructive))",
        "destructive-foreground":"hsl(var(--destructive-foreground))",
        input:               "hsl(var(--input))",
        ring:                "hsl(var(--ring))",
      },

      // ─── Spacing ──────────────────────────────────────────────
      spacing: {
        "1":  "0.25rem",
        "2":  "0.5rem",
        "3":  "0.75rem",
        "4":  "1rem",
        "5":  "1.25rem",
        "6":  "1.5rem",
        "8":  "2rem",
        "10": "2.5rem",
        "12": "3rem",
        "16": "4rem",
        "20": "5rem",
        "24": "6rem",
        "32": "8rem",
      },

      // ─── Border radius ────────────────────────────────────────
      borderRadius: {
        xs:   "4px",
        sm:   "8px",
        md:   "12px",
        lg:   "20px",
        xl:   "28px",
        full: "9999px",
      },

      // ─── Font sizes ───────────────────────────────────────────
      fontSize: {
        xs:    ["0.75rem",  { lineHeight: "1.5" }],
        sm:    ["0.875rem", { lineHeight: "1.5" }],
        base:  ["1rem",     { lineHeight: "1.625" }],
        lg:    ["1.125rem", { lineHeight: "1.625" }],
        xl:    ["1.25rem",  { lineHeight: "1.5" }],
        "2xl": ["1.5rem",   { lineHeight: "1.25" }],
        "3xl": ["1.875rem", { lineHeight: "1.1" }],
        "4xl": ["2.25rem",  { lineHeight: "1.1" }],
        "5xl": ["3rem",     { lineHeight: "1.05" }],
        "6xl": ["4rem",     { lineHeight: "1.0" }],
        "7xl": ["5rem",     { lineHeight: "1.0" }],
      },

      // ─── Letter spacing ───────────────────────────────────────
      letterSpacing: {
        tightest: "-0.045em",
        tighter:  "-0.025em",
        tight:    "-0.015em",
        normal:   "0em",
        wide:     "0.05em",
        wider:    "0.1em",
        widest:   "0.14em",
      },

      // ─── Keyframes (StickyBulkActionBar slide-up) ─────────────
      // The bar slides up from off-screen bottom.
      // translateX(-50%) is preserved because the element uses left:50%
      // centering — without it the element snaps to the wrong position during
      // the animation. Motion-safe guard is on the component class.
      keyframes: {
        slideUpIn: {
          "0%":   { transform: "translateX(-50%) translateY(100%)", opacity: "0" },
          "100%": { transform: "translateX(-50%) translateY(0)",     opacity: "1" },
        },
        slideDownOut: {
          "0%":   { transform: "translateX(-50%) translateY(0)",     opacity: "1" },
          "100%": { transform: "translateX(-50%) translateY(100%)", opacity: "0" },
        },
      },
      animation: {
        slideUpIn:   "slideUpIn 200ms ease-out both",
        slideDownOut: "slideDownOut 200ms ease-in both",
      },

    },
  },

  plugins: [animate],
};

export default config;
