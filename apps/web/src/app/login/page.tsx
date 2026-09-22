import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";

async function authenticate(formData: FormData): Promise<void> {
  "use server";
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=${encodeURIComponent(error.type ?? "CredentialsSignin")}`);
    }
    // Re-throw NEXT_REDIRECT (login sukses) dan error tak terduga.
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-sm font-semibold text-brand-fg">
            O
          </span>
          <div>
            <h1 className="text-sm font-semibold text-fg">ORVEXA</h1>
            <p className="text-xs text-fg-faint">Your AI Workforce</p>
          </div>
        </div>

        <form action={authenticate} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs text-fg-muted">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs text-fg-muted">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>

          {error ? (
            <p role="alert" className="text-xs text-danger">
              Email atau password salah.
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-fg-faint">
          Demo: seed user dari <span className="font-mono">npm run db:seed</span>
        </p>
      </div>
    </main>
  );
}
