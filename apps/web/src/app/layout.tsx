import type { Metadata } from "next";
import { cookies } from "next/headers";

import {
  DEFAULT_THEME,
  THEME_COOKIE,
  ThemeProvider,
  type ThemeKey,
} from "@/components/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Orvexa — Your AI Workforce",
  description:
    "Platform kolaborasi AI workforce: tim AI agent terspesialisasi yang bekerja bersama di ruang real-time.",
};

function readTheme(value: string | undefined): ThemeKey {
  const allowed: ThemeKey[] = [
    "corporate_gray",
    "light",
    "dark",
    "midnight",
    "high_contrast",
  ];
  return allowed.includes(value as ThemeKey) ? (value as ThemeKey) : DEFAULT_THEME;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const theme = readTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html lang="id" data-theme={theme} suppressHydrationWarning>
      <body>
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
