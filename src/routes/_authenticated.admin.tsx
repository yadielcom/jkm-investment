import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import {
  Users,
  TrendingUp,
  ShoppingCart,
  Wallet,
  Clock,
  CheckCircle2,
  Activity,
  ImageIcon,
  ShieldCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRealtime } from "@/hooks/use-realtime";

type Status = "pending" | "approved" | "rejected";

interface PurchaseRow {
  id: string;
  user_id: string;
  number_of_shares: number;
  total_amount: number;
  payment_method: string;
  payment_screenshot_url: string | null;
  status: Status;
  created_at: string;
}
interface SaleRow {
  id: string;
  user_id: string;
  number_of_shares: number;
  status: Status;
  created_at: string;
}
interface TxRow {
  id: string;
  user_id: string;
  type: "buy" | "sell";
  amount: number;
  status: Status;
  created_at: string;
}
interface LogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string;
  target_id: string | null;
  created_at: string;
  details: unknown;
}
interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  suspended: boolean;
}
interface WalletRow {
  user_id: string;
  total_shares: number;
  total_invested: number;
}

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — JKM Investment" }] }),
  beforeLoad: ({ context }) => {
    if ((context as { role?: string }).role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminPage,
});

const formatETB = (n: number) =>
  new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const formatDate = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    approved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    rejected: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  };
  return (
    <Badge variant="outline" className={`${map[status]} capitalize`}>
      {status}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  accent?: boolean;
}) {
  return (
    <Card className="p-5 border-border/60 bg-gradient-to-br from-card to-card/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p
            className={`mt-2 text-2xl font-semibold ${accent ? "text-accent" : ""}`}
          >
            {value}
          </p>
        </div>
        <div className="h-10 w-10 rounded-md bg-accent/10 text-accent grid place-items-center">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function AdminPage() {
  const { user } = Route.useRouteContext() as { user: { email?: string } };
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeShareholders, setActiveShareholders] = useState(0);
  const [totalSharesSold, setTotalSharesSold] = useState(0);
  const [totalInvested, setTotalInvested] = useState(0);
  const [growthPct, setGrowthPct] = useState<number>(0);
  const [currentPrice, setCurrentPrice] = useState<number>(1000);
  const [growthHistory, setGrowthHistory] = useState<
    { growth_percentage: number; created_at: string }[]
  >([]);
  const [growthInput, setGrowthInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submittingGrowth, setSubmittingGrowth] = useState(false);
  const [submittingPrice, setSubmittingPrice] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [userBusyId, setUserBusyId] = useState<string | null>(null);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  async function loadAll() {
    setLoading(true);
    const [
      purchasesRes,
      salesRes,
      txRes,
      logsRes,
      profilesRes,
      walletsRes,
      growthRes,
    ] = await Promise.all([
      supabase
        .from("share_purchases")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("share_sales")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("admin_activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("profiles").select("id, full_name, email, phone, suspended"),
      supabase
        .from("wallet_balances")
        .select("user_id, total_shares, total_invested"),
      supabase
        .from("company_growth")
        .select("growth_percentage, share_price, created_at")
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

    setPurchases((purchasesRes.data ?? []) as PurchaseRow[]);
    setSales((salesRes.data ?? []) as SaleRow[]);
    setTransactions((txRes.data ?? []) as TxRow[]);
    setLogs((logsRes.data ?? []) as LogRow[]);

    const pmap: Record<string, ProfileRow> = {};
    (profilesRes.data ?? []).forEach((p) => {
      pmap[p.id] = p as ProfileRow;
    });
    setProfiles(pmap);
    setTotalUsers((profilesRes.data ?? []).length);

    const walletList = (walletsRes.data ?? []) as WalletRow[];
    setWallets(walletList);
    setActiveShareholders(
      walletList.filter((w) => Number(w.total_shares ?? 0) > 0).length,
    );
    setTotalSharesSold(
      walletList.reduce((sum, w) => sum + Number(w.total_shares ?? 0), 0),
    );
    setTotalInvested(
      walletList.reduce((sum, w) => sum + Number(w.total_invested ?? 0), 0),
    );

    const growthRows = (growthRes.data ?? []) as {
      growth_percentage: number;
      share_price: number | null;
      created_at: string;
    }[];
    setGrowthHistory(growthRows);
    const latest = growthRows[growthRows.length - 1];
    setGrowthPct(Number(latest?.growth_percentage ?? 0));
    setCurrentPrice(Number(latest?.share_price ?? 1000));
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useRealtime(
    [
      { table: "share_purchases" },
      { table: "share_sales" },
      { table: "transactions" },
      { table: "wallet_balances" },
      { table: "company_growth" },
      { table: "admin_activity_logs" },
      { table: "profiles" },
    ],
    () => {
      void loadAll();
    },
  );

  const txChartData = useMemo(() => {
    const buckets: Record<string, { date: string; buys: number; sells: number }> = {};
    transactions.forEach((t) => {
      const day = new Date(t.created_at).toLocaleDateString("en-ET", {
        month: "short",
        day: "numeric",
      });
      buckets[day] = buckets[day] ?? { date: day, buys: 0, sells: 0 };
      if (t.type === "buy") buckets[day].buys += Number(t.amount);
      else buckets[day].sells += Number(t.amount);
    });
    return Object.values(buckets).slice(-14);
  }, [transactions]);

  const growthChartData = useMemo(
    () =>
      growthHistory.map((g) => ({
        date: new Date(g.created_at).toLocaleDateString("en-ET", {
          month: "short",
          day: "numeric",
        }),
        pct: Number(g.growth_percentage),
      })),
    [growthHistory],
  );

  const pendingPurchases = useMemo(
    () => purchases.filter((p) => p.status === "pending"),
    [purchases],
  );
  const pendingSales = useMemo(
    () => sales.filter((s) => s.status === "pending"),
    [sales],
  );
  const completedTx = useMemo(
    () => transactions.filter((t) => t.status === "approved").length,
    [transactions],
  );
  const pendingTotal = pendingPurchases.length + pendingSales.length;

  async function updatePurchase(id: string, status: Status) {
    setBusyId(id);
    const { error } = await supabase
      .from("share_purchases")
      .update({ status })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Purchase ${status}`);
    void loadAll();
  }

  async function updateSale(id: string, status: Status) {
    setBusyId(id);
    const { error } = await supabase
      .from("share_sales")
      .update({ status })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Sale ${status}`);
    void loadAll();
  }

  async function submitGrowth(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(growthInput);
    if (!Number.isFinite(value)) {
      toast.error("Enter a valid number");
      return;
    }
    setSubmittingGrowth(true);
    const { error } = await supabase
      .from("company_growth")
      .insert({ growth_percentage: value });
    setSubmittingGrowth(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Growth updated. Wallets recalculated.");
    setGrowthInput("");
    void loadAll();
  }

  async function submitPriceOverride(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(priceInput);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a share price greater than 0");
      return;
    }
    if (!window.confirm(`Override current share price to ${value} ETB? This affects every portfolio.`)) {
      return;
    }
    setSubmittingPrice(true);
    const { error } = await supabase.rpc("admin_set_share_price" as never, { new_price: value } as never);
    setSubmittingPrice(false);
    if (error) {
      console.error("[admin_set_share_price]", error);
      toast.error(error.message);
      return;
    }
    toast.success(`Share price set to ${value} ETB. Wallets recalculated.`);
    setPriceInput("");
    void loadAll();
  }

  function userLabel(id: string) {
    const p = profiles[id];
    return p?.full_name || p?.email || id.slice(0, 8);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-sidebar text-sidebar-foreground">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-accent text-accent-foreground grid place-items-center font-bold">
              J
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold">JKM Admin</span>
              <span className="text-xs text-sidebar-foreground/70">
                Control Console
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1 text-xs text-sidebar-foreground/80">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              {user.email}
            </span>
            <Button variant="ghost" size="sm" asChild className="text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-foreground/10">
              <Link to="/">Home</Link>
            </Button>
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCard label="Total users" value={String(totalUsers)} icon={Users} />
          <StatCard
            label="Active shareholders"
            value={String(activeShareholders)}
            icon={TrendingUp}
          />
          <StatCard
            label="Total shares held"
            value={totalSharesSold.toLocaleString()}
            icon={ShoppingCart}
          />
          <StatCard
            label="Total invested"
            value={formatETB(totalInvested)}
            icon={Wallet}
            accent
          />
          <StatCard
            label="Pending approvals"
            value={String(pendingTotal)}
            icon={Clock}
          />
          <StatCard
            label="Completed transactions"
            value={String(completedTx)}
            icon={CheckCircle2}
          />
          <StatCard
            label="Company growth"
            value={`${growthPct >= 0 ? "+" : ""}${growthPct}%`}
            icon={Activity}
            accent
          />
          <StatCard
            label="Total transactions"
            value={String(transactions.length)}
            icon={Activity}
          />
        </section>

        {/* Growth control */}
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Company growth</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Set a new growth percentage. This recalculates every wallet via
                existing backend triggers.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Current: <span className="text-accent font-medium">{growthPct}%</span>
              </p>
            </div>
            <form onSubmit={submitGrowth} className="flex items-end gap-2">
              <div>
                <Label htmlFor="growth" className="text-xs">
                  New growth %
                </Label>
                <Input
                  id="growth"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 5 or -2.5"
                  value={growthInput}
                  onChange={(e) => setGrowthInput(e.target.value)}
                  className="w-44"
                  required
                />
              </div>
              <Button type="submit" disabled={submittingGrowth}>
                {submittingGrowth ? "Submitting…" : "Update growth"}
              </Button>
            </form>
          </div>
        </Card>

        {/* Manual Share Price Adjustment (admin override) */}
        <Card className="p-6 border-destructive/40">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Manual Share Price Adjustment</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Override the current market share price. Future ROI updates will compound from this new base price.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Current share price:{" "}
                <span className="text-accent font-medium">{formatETB(currentPrice)}</span>
              </p>
              <p className="text-xs text-destructive mt-2">
                Warning: This action overrides the current market share price and affects all portfolio valuations.
              </p>
            </div>
            <form onSubmit={submitPriceOverride} className="flex items-end gap-2">
              <div>
                <Label htmlFor="price-override" className="text-xs">
                  New share price (ETB)
                </Label>
                <Input
                  id="price-override"
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  placeholder="e.g. 1000"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-44"
                  required
                />
              </div>
              <Button type="submit" variant="destructive" disabled={submittingPrice}>
                {submittingPrice ? "Applying…" : "Apply New Share Price"}
              </Button>
            </form>
          </div>
        </Card>



        {/* Analytics charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold">Company growth history</h3>
                <p className="text-xs text-muted-foreground">
                  Latest: {growthPct >= 0 ? "+" : ""}{growthPct}%
                </p>
              </div>
            </div>
            <div className="h-64">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : growthChartData.length === 0 ? (
                <div className="h-full grid place-items-center text-sm text-muted-foreground">
                  No growth records yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthChartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g-admin-growth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={40} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => `${Number(v).toFixed(2)}%`}
                    />
                    <Area type="monotone" dataKey="pct" stroke="var(--color-accent)" strokeWidth={2} fill="url(#g-admin-growth)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4">
              <h3 className="text-base font-semibold">Transaction activity (last 14 days)</h3>
              <p className="text-xs text-muted-foreground">Buys vs sells per day</p>
            </div>
            <div className="h-64">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : txChartData.length === 0 ? (
                <div className="h-full grid place-items-center text-sm text-muted-foreground">
                  No transactions yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={txChartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={60} tickFormatter={(v) => Intl.NumberFormat("en", { notation: "compact" }).format(Number(v))} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => formatETB(Number(v))}
                    />
                    <Bar dataKey="buys" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sells" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </section>



        {/* Pending purchases */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Pending purchase requests
              <span className="ml-2 text-sm text-muted-foreground">
                ({pendingPurchases.length})
              </span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Proof</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : pendingPurchases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No pending purchase requests.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingPurchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{userLabel(p.user_id)}</TableCell>
                      <TableCell>{p.number_of_shares}</TableCell>
                      <TableCell>{formatETB(Number(p.total_amount))}</TableCell>
                      <TableCell className="uppercase text-xs">{p.payment_method}</TableCell>
                      <TableCell>
                        {p.payment_screenshot_url ? (
                          <a
                            href={p.payment_screenshot_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:underline"
                          >
                            <ImageIcon className="h-4 w-4" /> View
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">none</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(p.created_at)}
                      </TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          disabled={busyId === p.id}
                          onClick={() => updatePurchase(p.id, "approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === p.id}
                          onClick={() => updatePurchase(p.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Pending sales */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Pending sell requests
              <span className="ml-2 text-sm text-muted-foreground">
                ({pendingSales.length})
              </span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Shares to sell</TableHead>
                  <TableHead>Est. proceeds</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : pendingSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No pending sell requests.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingSales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{userLabel(s.user_id)}</TableCell>
                      <TableCell>{s.number_of_shares}</TableCell>
                      <TableCell>{formatETB(s.number_of_shares * 1000)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(s.created_at)}
                      </TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          disabled={busyId === s.id}
                          onClick={() => updateSale(s.id, "approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === s.id}
                          onClick={() => updateSale(s.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* All transactions */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60">
            <h2 className="text-lg font-semibold">Recent transactions</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.slice(0, 25).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{userLabel(t.user_id)}</TableCell>
                    <TableCell className="capitalize">{t.type}</TableCell>
                    <TableCell>{formatETB(Number(t.amount))}</TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(t.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Audit logs */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60">
            <h2 className="text-lg font-semibold">Admin activity log</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium capitalize">
                      {l.action.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.target_table}
                    </TableCell>
                    <TableCell>{l.actor_id ? userLabel(l.actor_id) : "system"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(l.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No admin activity yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
}
