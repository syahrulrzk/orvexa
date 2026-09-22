"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const THEMES = [
  { key: "corporate_gray", name: "Corporate Gray" },
  { key: "light", name: "Light" },
  { key: "dark", name: "Dark" },
  { key: "midnight", name: "Midnight" },
  { key: "high_contrast", name: "High Contrast" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];

export const THEME_COOKIE = "orv_theme";
export const DEFAULT_THEME: ThemeKey = "corporate_gray";

type ThemeContextValue = {
  theme: ThemeKey;
  setTheme: (theme: ThemeKey) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function ThemeProvider({
  initialTheme = DEFAULT_THEME,
  children,
}: {
  initialTheme?: ThemeKey;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeKey>(initialTheme);

  const setTheme = useCallback((next: ThemeKey) => {
    setThemeState(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
