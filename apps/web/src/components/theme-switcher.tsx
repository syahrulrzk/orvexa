"use client";

import { THEMES, useTheme, type ThemeKey } from "./theme-provider";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <label className="flex items-center gap-2 text-xs text-fg-muted">
      <span className="sr-only">Theme</span>
      <select
        aria-label="Pilih tema"
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeKey)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg focus-visible:outline-none"
      >
        {THEMES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
