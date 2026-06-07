import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserRole } from "@/lib/auth";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuspendedNotice } from "@/components/SuspendedNotice";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — JKM Investment" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    suspended: s.suspended === "1" || s.suspended === 1 || s.suspended === true ? true : false,
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

function LoginPage() {
  const navigate = useNavigate();
  const { suspended } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSuspended, setShowSuspended] = useState<boolean>(suspended);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setShowSuspended(false);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { data, error: signInErr } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (signInErr || !data.user) {
      setError(signInErr?.message ?? "Sign in failed");
      setLoading(false);
      return;
    }

    // Check suspension
    const { data: suspendedData } = await supabase.rpc("is_suspended" as never, {
      _user_id: data.user.id,
    } as never);
    if (suspendedData === true) {
      await supabase.auth.signOut();
      setShowSuspended(true);
      setLoading(false);
      return;
    }

    const role = await getCurrentUserRole(data.user.id);
    navigate({ to: role === "admin" ? "/admin" : "/dashboard", replace: true });
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your JKM Investment account."
      footer={
        <p className="text-sm text-muted-foreground text-center">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </p>
      }
    >
      <Button variant="ghost" size="sm" asChild className="px-0 text-muted-foreground hover:text-foreground">
        <Link to="/">← Home</Link>
      </Button>
      {showSuspended && <SuspendedNotice />}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-xs text-primary hover:underline"
            >
              Forgot?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
