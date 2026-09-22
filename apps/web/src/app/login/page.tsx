import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            O
          </span>
          <div>
            <h1 className="text-sm font-semibold text-foreground">ORVEXA</h1>
            <p className="text-xs text-muted-foreground">Your AI Workforce</p>
          </div>
        </div>

        <form action={authenticate} className="mt-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              Email atau password salah.
            </p>
          ) : null}

          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo: seed user dari <span className="font-mono">npm run db:seed</span>
        </p>
      </div>
    </main>
  );
}
