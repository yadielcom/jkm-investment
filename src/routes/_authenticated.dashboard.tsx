import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Activity,
  Bell,
  Sparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtime } from "@/hooks/use-realtime";

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
  const queryClient = useQueryClient();
  const userId = user.id;

  // Realtime invalidation for this user's data
  useRealtime(
    [
      { table: "wallet_balances", filter: `user_id=eq.${userId}` },
      { table: "transactions", filter: `user_id=eq.${userId}` },
      { table: "notifications", filter: `user_id=eq.${userId}` },
      { table: "share_purchases", filter: `user_id=eq.${userId}` },
      { table: "share_sales", filter: `user_id=eq.${userId}` },
      { table: "company_growth" },
    ],
    () => {
      queryClient.invalidateQueries();
    },
  );

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
        .limit(50);
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
        .limit(20);
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
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const growth = useQuery({
    queryKey: ["company_growth_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_growth")
        .select("growth_percentage,created_at")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  const w = wallet.data;
  const loading = wallet.isLoading;
  const isEmpty = !loading && (!w || Number(w?.total_shares ?? 0) === 0);
  const pl = Number(w?.profit_loss ?? 0);
  const roi = Number(w?.roi ?? 0);
  const positive = pl >= 0;
  const unreadCount = (notifications.data ?? []).filter((n) => !n.read_status).length;

  // Portfolio value trend from approved transactions (cumulative invested baseline)
  const portfolioSeries = useMemo(() => {
    const txs = [...(transactions.data ?? [])]
      .filter((t) => t.status === "approved")
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    let invested = 0;
    const points = txs.map((t) => {
      invested += t.type === "buy" ? Number(t.amount) : -Number(t.amount);
      return {
        date: new Date(t.created_at).toLocaleDateString("en-ET", {
          month: "short",
          day: "numeric",
        }),
        invested: Math.max(0, invested),
      };
    });
    // Append current value as latest point
    if (w?.current_value != null) {
      points.push({ date: "Now", invested: Number(w.current_value) });
    }
    return points;
  }, [transactions.data, w?.current_value]);

  const growthSeries = useMemo(
    () =>
      (growth.data ?? []).map((g) => ({
        date: new Date(g.created_at).toLocaleDateString("en-ET", {
          month: "short",
          day: "numeric",
        }),
        pct: Number(g.growth_percentage),
      })),
    [growth.data],
  );

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

  async function markAllRead() {
    const unreadIds = (notifications.data ?? [])
      .filter((n) => !n.read_status)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read_status: true })
      .in("id", unreadIds);
    queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-sidebar text-sidebar-foreground backdrop-blur">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-accent text-accent-foreground grid place-items-center font-bold">
              J
            </div>
            <span className="font-semibold tracking-tight">JKM Investment</span>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-1 text-xs text-accent-foreground">
                <Bell className="h-3 w-3" /> {unreadCount} new
              </span>
            )}
            <Button variant="ghost" size="sm" asChild className="text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-foreground/10">
              <Link to="/">Home</Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
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

        {/* Quick actions */}
        <section className="flex flex-wrap gap-3">
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link to="/buy">Buy Shares</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/sell">Sell Shares</Link>
          </Button>
        </section>

        {loading ? (
          <HeroSkeleton />
        ) : isEmpty ? (
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
                <div className="flex flex-wrap items-end gap-4">
                  <CardTitle className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums">
                    {formatETB(w?.current_value)}
                  </CardTitle>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      positive
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {positive ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {formatPct(roi)}
                  </span>
                </div>
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

            {/* Charts */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Portfolio value trend</CardTitle>
                  <CardDescription>
                    Investment value over time (server-calculated)
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-64">
                  {portfolioSeries.length < 2 ? (
                    <ChartEmpty label="Not enough data yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={portfolioSeries} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="grad-value" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={70} tickFormatter={(v) => Intl.NumberFormat("en", { notation: "compact" }).format(Number(v))} />
                        <Tooltip
                          contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                          formatter={(v) => formatETB(Number(v))}
                        />
                        <Area type="monotone" dataKey="invested" stroke="var(--color-accent)" strokeWidth={2} fill="url(#grad-value)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Company growth history</CardTitle>
                  <CardDescription>
                    Growth percentages applied to wallets
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-64">
                  {growthSeries.length === 0 ? (
                    <ChartEmpty label="No growth data yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={growthSeries} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="grad-growth" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={40} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                          formatter={(v) => `${Number(v).toFixed(2)}%`}
                        />
                        <Area type="monotone" dataKey="pct" stroke="var(--color-primary)" strokeWidth={2} fill="url(#grad-growth)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
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
              {purchases.isLoading || sales.isLoading ? (
                <ListSkeleton />
              ) : activity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No activity yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {activity.map((a) => (
                    <li
                      key={`${a.kind}-${a.id}`}
                      className="flex items-center justify-between py-3 transition-colors hover:bg-muted/30 px-2 -mx-2 rounded"
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 text-accent" /> Notifications
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] h-5 min-w-5 px-1.5">
                      {unreadCount}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>Real-time updates</CardDescription>
              </div>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllRead}>
                  Mark all
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {notifications.isLoading ? (
                <ListSkeleton rows={3} />
              ) : (notifications.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  You're all caught up.
                </p>
              ) : (
                <ul className="space-y-3">
                  {(notifications.data ?? []).map((n) => (
                    <li
                      key={n.id}
                      className={`relative rounded-md border p-3 transition-all animate-in fade-in slide-in-from-right-2 ${
                        n.read_status
                          ? "bg-background"
                          : "bg-accent/10 border-accent/40"
                      }`}
                    >
                      {!n.read_status && (
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent animate-pulse" />
                      )}
                      <p className="text-sm pr-4">{n.message}</p>
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
            {transactions.isLoading ? (
              <ListSkeleton rows={4} />
            ) : (transactions.data ?? []).length === 0 ? (
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
                    <TableRow key={t.id} className="transition-colors hover:bg-muted/30">
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
    <Card className="transition-all hover:shadow-lg hover:-translate-y-0.5 duration-200">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardDescription className="flex items-center gap-2 text-xs">
          <span className="text-accent">{icon}</span>
          {label}
        </CardDescription>
        {trend && (
          <span
            className={`text-xs font-medium inline-flex items-center gap-0.5 ${
              trend === "up" ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function HeroSkeleton() {
  return (
    <Card className="bg-sidebar border-0">
      <CardHeader>
        <Skeleton className="h-4 w-32 bg-white/10" />
        <Skeleton className="h-12 w-64 mt-2 bg-white/10" />
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20 bg-white/10" />
            <Skeleton className="h-6 w-24 bg-white/10" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="h-full grid place-items-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-2 border-accent/40 bg-accent/5">
      <CardContent className="flex flex-col items-center text-center py-12 px-6 space-y-4">
        <div className="h-14 w-14 rounded-full bg-accent/20 text-accent-foreground grid place-items-center animate-pulse">
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
