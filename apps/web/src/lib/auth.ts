import { eq } from "drizzle-orm";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { db } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session-store";

/**
 * Auth.js (NextAuth v5).
 *
 * Sesi memakai JWT pada cookie httpOnly, tetapi setiap sign-in membuat row
 * `sessions` di database. JWT menyimpan `sid`, dan setiap request divalidasi
 * ke DB (lihat src/lib/session.ts) sehingga sesi bisa **direvokasi**.
 *
 * Credentials login memakai Argon2id. OAuth (Google/GitHub) aktif otomatis
 * bila environment-nya diisi.
 */
const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "")
        .toLowerCase()
        .trim();
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !user.passwordHash || !user.isActive || user.deletedAt) return null;

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return null;

      // Upgrade transparan hash lama (scrypt) ke Argon2id setelah verifikasi sukses.
      if (needsRehash(user.passwordHash)) {
        try {
          await db
            .update(users)
            .set({ passwordHash: await hashPassword(password) })
            .where(eq(users.id, user.id));
        } catch {
          // jangan gagalkan login hanya karena upgrade hash gagal
        }
      }

      return { id: user.id, email: user.email, name: user.displayName };
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 }, // 12 jam
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user, account }) {
      if (!user) return token;

      let userId = user.id ?? "";

      // OAuth: resolve user di DB by email, buat kalau belum ada, lalu link akun.
      if (account && account.provider !== "credentials") {
        const email = (user.email ?? "").toLowerCase().trim();
        if (!email) return token;

        const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existing) {
          userId = existing.id;
        } else {
          const [created] = await db
            .insert(users)
            .values({
              id: newId("usr"),
              email,
              displayName: user.name ?? email,
              isActive: true,
            })
            .returning();
          userId = created.id;
        }

        if (account.providerAccountId) {
          await db
            .insert(accounts)
            .values({
              id: newId("acc"),
              userId,
              provider: account.provider,
              providerAccountId: String(account.providerAccountId),
            })
            .onConflictDoNothing();
        }
      }

      if (!userId) return token;

      // Buat session database untuk JWT ini.
      const { id: sid, expiresAt } = await createSession(userId);
      token.uid = userId;
      token.sid = sid;
      token.exp = Math.floor(expiresAt.getTime() / 1000); // sinkronkan expiry

      return token;
    },
    session({ session, token }) {
      if (session.user && token.uid) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      (session as { sid?: string }).sid = token.sid as string | undefined;
      return session;
    },
  },
});
