import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — JKM Investment" }] }),
  beforeLoad: ({ context }) => {
    // Admins go to admin area
    if ((context as { role?: string }).role === "admin") {
      throw redirect({ to: "/admin" });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = Route.useRouteContext() as { user: { email?: string } };
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-accent text-accent-foreground grid place-items-center font-bold">
              J
            </div>
            <span className="font-semibold">JKM Investment</span>
          </div>
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-4">
        <h1 className="text-2xl font-semibold">Welcome, {user.email}</h1>
        <p className="text-muted-foreground">
          Your investment dashboard will appear here.
        </p>
      </main>
    </div>
  );
}
