import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ArrowUpRight,
  Wallet,
  TrendingDown,
  Ban,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RISK_WARNING } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sell")({
  head: () => ({ meta: [{ title: "Sell Shares — JKM Investment" }] }),
  beforeLoad: ({ context }) => {
    if ((context as { role?: string }).role === "admin") {
      throw redirect({ to: "/admin" });
    }
  },
  component: SellPage,
});

const BASE_SHARE_PRICE = 1000;

function formatETB(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(v);
}

function formatShares(n: number) {
  return new Intl.NumberFormat("en-ET", {
    maximumFractionDigits: 4,
  }).format(n);
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

function SellPage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const userId = user.id;

  const [shares, setShares] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number>(BASE_SHARE_PRICE);
  const lastSubmitRef = useRef(0);

  const [wallet, setWallet] = useState<{
    total_shares: number;
    total_invested: number;
    current_value: number;
  } | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  const [sales, setSales] = useState<
    Array<{ id: string; number_of_shares: number; status: string; created_at: string; price_at_sale?: number | null }>
  >([]);
  const [salesLoading, setSalesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: w }, { data: s }, { data: g }] = await Promise.all([
        supabase
          .from("wallet_balances")
          .select("total_shares,total_invested,current_value")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("share_sales")
          .select("id,number_of_shares,status,created_at,price_at_sale")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("company_growth")
          .select("share_price")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!cancelled) {
        setWallet(w ?? { total_shares: 0, total_invested: 0, current_value: 0 });
        setSales((s as any) ?? []);
        setCurrentPrice(
          Number((g as { share_price?: number } | null)?.share_price ?? BASE_SHARE_PRICE),
        );
        setWalletLoading(false);
        setSalesLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const owned = Number(wallet?.total_shares ?? 0);

  const sharesNum = useMemo(() => {
    const n = Number(shares);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [shares]);

  const total = sharesNum * currentPrice;


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Prevent duplicate rapid submissions
    const now = Date.now();
    if (now - lastSubmitRef.current < 3000) {
      toast.warning("Please wait a moment before resubmitting.");
      return;
    }

    const schema = z.object({
      shares: z
        .number({ invalid_type_error: "Enter a valid number of shares" })
        .positive("At least a fraction of a share")
        .max(owned, `You only own ${formatShares(owned)} share${owned === 1 ? "" : "s"}`),
    });


    const parsed = schema.safeParse({ shares: sharesNum });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Invalid form");
      return;
    }

    lastSubmitRef.current = now;
    setSubmitting(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Not authenticated");

      const { error: insErr, data: insData } = await supabase
        .from("share_sales")
        .insert({
          user_id: userData.user.id,
          number_of_shares: parsed.data.shares,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);

      setSubmittedId(insData.id);
      toast.success("Sell request submitted", {
        description: "Pending admin approval.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      toast.error(msg);
      lastSubmitRef.current = 0;
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/10 grid place-items-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <CardTitle>Request submitted</CardTitle>
            <CardDescription>
              Your request to sell {sharesNum.toLocaleString()} share
              {sharesNum === 1 ? "" : "s"} ({formatETB(total)}) is pending admin
              approval. You will be notified once it's processed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={() => navigate({ to: "/dashboard" })}>
              Back to dashboard
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSubmittedId(null);
                setShares("");
              }}
            >
              Submit another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <span className="text-sm font-semibold tracking-tight">Sell Shares</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid gap-6 lg:grid-cols-5">
        {/* Left: Form */}
        <section className="lg:col-span-3 space-y-6">
          {/* Wallet summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4 text-primary" /> Your holdings
              </CardTitle>
              <CardDescription>
                Shares available to sell
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {walletLoading ? (
                <div className="h-12 animate-pulse bg-muted rounded" />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Total shares owned</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {owned.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Current value</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {formatETB(wallet?.current_value)}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <form onSubmit={onSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Sell details</CardTitle>
                <CardDescription>
                  Current share price: {formatETB(currentPrice)} (compounded
                  from company growth). Fractional shares allowed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="shares">Number of shares to sell</Label>
                  <Input
                    id="shares"
                    type="number"
                    inputMode="decimal"
                    min={0.0001}
                    max={owned || undefined}
                    step="0.0001"
                    placeholder={owned > 0 ? `e.g. 1.5 (max ${formatShares(owned)})` : "You own 0 shares"}
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    disabled={owned === 0}
                    required
                  />
                  {sharesNum > owned && owned > 0 && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      You cannot sell more shares than you own ({formatShares(owned)}).
                    </p>
                  )}
                </div>

                <div className="rounded-lg border bg-gradient-to-br from-sidebar to-sidebar/90 text-sidebar-foreground p-5">
                  <div className="text-xs uppercase tracking-wider text-sidebar-foreground/60">
                    Estimated proceeds
                  </div>
                  <div className="mt-1 text-3xl font-semibold">
                    {formatETB(total)}
                  </div>
                  <div className="mt-1 text-xs text-sidebar-foreground/60">
                    {formatShares(sharesNum)} × {formatETB(currentPrice)}
                  </div>
                </div>


                <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  <span>{RISK_WARNING}</span>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || sharesNum <= 0 || sharesNum > owned || owned === 0}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Submitting…" : "Submit sell request"}
                </Button>
              </CardContent>
            </Card>
          </form>
        </section>

        {/* Right: Info + History */}
        <aside className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-4 w-4 text-primary" /> How selling works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                1. Enter the number of shares you want to sell.
              </p>
              <p>
                2. Submit your request. It will enter a <span className="font-medium text-foreground">pending</span> status.
              </p>
              <p>
                3. An admin will review and either approve or reject your request.
              </p>
              <p>
                4. If approved, the transaction will be processed and your wallet updated.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowUpRight className="h-4 w-4 text-primary" /> Recent sell requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesLoading ? (
                <div className="space-y-2">
                  <div className="h-10 animate-pulse bg-muted rounded" />
                  <div className="h-10 animate-pulse bg-muted rounded" />
                </div>
              ) : sales.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No sell requests yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {sales.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {s.number_of_shares} share{s.number_of_shares === 1 ? "" : "s"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(s.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground leading-relaxed">
            Sell requests are subject to admin approval. Approved sales are
            processed at the current share value of {formatETB(currentPrice)} per share.
          </div>

        </aside>
      </main>
    </div>
  );
}
