import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  TrendingUp,
  PiggyBank,
  Activity,
  Bell,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — JKM Investment" }] }),
  beforeLoad: ({ context }) => {
    if ((context as { role?: string }).role === "admin") {
      throw redirect({ to: "/admin" });
    }
  },
  component: DashboardPage,
});

function formatETB(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(v);
}

function formatPct(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-ET", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const variant: Record<string, string> = {
    approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    rejected: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
        variant[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function DashboardPage() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const navigate = useNavigate();
  const userId = user.id;

  const wallet = useQuery({
    queryKey: ["wallet", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_balances")
        .select("total_shares,total_invested,current_value,profit_loss,roi,updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const transactions = useQuery({
    queryKey: ["transactions", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id,type,amount,status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const notifications = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,message,read_status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const purchases = useQuery({
    queryKey: ["purchases", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("share_purchases")
        .select("id,number_of_shares,total_amount,status,created_at,payment_method")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sales = useQuery({
    queryKey: ["sales", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("share_sales")
        .select("id,number_of_shares,status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  const w = wallet.data;
  const isEmpty = !w || Number(w.total_shares ?? 0) === 0;
  const pl = Number(w?.profit_loss ?? 0);
  const roi = Number(w?.roi ?? 0);
  const positive = pl >= 0;

  const activity = useMemo(() => {
    const items = [
      ...(purchases.data ?? []).map((p) => ({
        kind: "buy" as const,
        id: p.id,
        date: p.created_at,
        shares: p.number_of_shares,
        amount: Number(p.total_amount ?? 0),
        status: p.status as string,
      })),
      ...(sales.data ?? []).map((s) => ({
        kind: "sell" as const,
        id: s.id,
        date: s.created_at,
        shares: s.number_of_shares,
        amount: Number(s.number_of_shares) * 1000,
        status: s.status as string,
      })),
    ];
    items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    return items.slice(0, 8);
  }, [purchases.data, sales.data]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-sidebar text-sidebar-foreground">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-accent text-accent-foreground grid place-items-center font-bold">
              J
            </div>
            <span className="font-semibold tracking-tight">JKM Investment</span>
          </div>
          <Button variant="secondary" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 animate-in fade-in duration-500">
        {/* Greeting */}
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {user.email}
            </h1>
          </div>
          {w?.updated_at && (
            <p className="text-xs text-muted-foreground">
              Last updated {formatDate(w.updated_at)}
            </p>
          )}
        </section>

        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* Hero card */}
            <Card className="relative overflow-hidden border-0 bg-sidebar text-sidebar-foreground shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-sidebar via-sidebar to-black/50 pointer-events-none" />
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
              <CardHeader className="relative">
                <CardDescription className="text-sidebar-foreground/60">
                  Current portfolio value
                </CardDescription>
                <CardTitle className="text-4xl sm:text-5xl font-semibold tracking-tight">
                  {formatETB(w?.current_value)}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <HeroStat label="Total shares" value={String(w?.total_shares ?? 0)} />
                <HeroStat label="Total invested" value={formatETB(w?.total_invested)} />
                <HeroStat
                  label="Profit / Loss"
                  value={formatETB(pl)}
                  tone={positive ? "up" : "down"}
                />
                <HeroStat
                  label="ROI"
                  value={formatPct(roi)}
                  tone={positive ? "up" : "down"}
                />
              </CardContent>
            </Card>

            {/* Summary cards */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={<PiggyBank className="h-4 w-4" />}
                label="Total shares owned"
                value={String(w?.total_shares ?? 0)}
              />
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label="Total invested"
                value={formatETB(w?.total_invested)}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Profit / Loss"
                value={formatETB(pl)}
                trend={positive ? "up" : "down"}
              />
              <StatCard
                icon={<Sparkles className="h-4 w-4" />}
                label="ROI"
                value={formatPct(roi)}
                trend={positive ? "up" : "down"}
              />
            </section>
          </>
        )}

        {/* Grid: Activity + Notifications */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-accent" /> Investment activity
                </CardTitle>
                <CardDescription>Your latest buy & sell requests</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No activity yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {activity.map((a) => (
                    <li
                      key={`${a.kind}-${a.id}`}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-9 w-9 rounded-full grid place-items-center ${
                            a.kind === "buy"
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-accent/20 text-accent-foreground"
                          }`}
                        >
                          {a.kind === "buy" ? (
                            <ArrowDownRight className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {a.kind === "buy" ? "Purchased" : "Sold"} {a.shares} shares
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(a.date)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">
                          {formatETB(a.amount)}
                        </span>
                        <StatusBadge status={a.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-accent" /> Notifications
              </CardTitle>
              <CardDescription>Updates from JKM</CardDescription>
            </CardHeader>
            <CardContent>
              {(notifications.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  You're all caught up.
                </p>
              ) : (
                <ul className="space-y-3">
                  {(notifications.data ?? []).map((n) => (
                    <li
                      key={n.id}
                      className={`rounded-md border p-3 transition-colors ${
                        n.read_status
                          ? "bg-background"
                          : "bg-accent/10 border-accent/40"
                      }`}
                    >
                      <p className="text-sm">{n.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatDate(n.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Transactions table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaction history</CardTitle>
            <CardDescription>
              All buy and sell transactions on your account
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {(transactions.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No transactions yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transactions.data ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{formatDate(t.created_at)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            t.type === "buy"
                              ? "border-emerald-500/40 text-emerald-700"
                              : "border-accent/60 text-foreground"
                          }
                        >
                          {t.type === "buy" ? "Buy" : "Sell"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatETB(t.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pt-2">
          ⚠️ Only invest what you can afford to lose.
        </p>
      </main>
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <p className="text-sidebar-foreground/60 text-xs uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "up"
            ? "text-emerald-400"
            : tone === "down"
              ? "text-red-400"
              : "text-sidebar-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: "up" | "down";
}) {
  return (
    <Card className="transition-all hover:shadow-md hover:-translate-y-0.5 duration-200">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardDescription className="flex items-center gap-2 text-xs">
          <span className="text-accent">{icon}</span>
          {label}
        </CardDescription>
        {trend && (
          <span
            className={`text-xs font-medium ${
              trend === "up" ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {trend === "up" ? "▲" : "▼"}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-2 border-accent/40 bg-accent/5">
      <CardContent className="flex flex-col items-center text-center py-12 px-6 space-y-4">
        <div className="h-14 w-14 rounded-full bg-accent/20 text-accent-foreground grid place-items-center">
          <Sparkles className="h-7 w-7" />
        </div>
        <div className="space-y-1 max-w-md">
          <h2 className="text-xl font-semibold">Start your investment journey</h2>
          <p className="text-sm text-muted-foreground">
            You don't own any shares yet. Purchase your first JKM shares to start
            building your portfolio.
          </p>
        </div>
        <Button size="lg" className="bg-primary hover:bg-primary/90" asChild>
          <Link to="/buy">Buy your first shares</Link>
        </Button>
        <p className="text-[11px] text-muted-foreground pt-2">
          ⚠️ Only invest what you can afford to lose.
        </p>
      </CardContent>
    </Card>
  );
}
