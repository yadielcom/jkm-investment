import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  Loader2,
  Smartphone,
  Upload,
  ShieldAlert,
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
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { RISK_WARNING } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/buy")({
  head: () => ({ meta: [{ title: "Buy Shares — JKM Investment" }] }),
  beforeLoad: ({ context }) => {
    if ((context as { role?: string }).role === "admin") {
      throw redirect({ to: "/admin" });
    }
  },
  component: BuyPage,
});

const BASE_SHARE_PRICE = 1000;
const MAX_SHARES = 1_000_000;
const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const PAYMENTS = {
  cbe: [
    { name: "Yohana Kejela", account: "1000330261165" },
    { name: "Yadiel Geremew", account: "1000556035" },
  ],
  telebirr: [
    { name: "Eshkol Wondwossen", account: "0943887676" },
    { name: "Geremew Geleta", account: "0991332049" },
  ],
} as const;

type PaymentMethod = "cbe" | "telebirr";

const schema = z.object({
  shares: z
    .number({ invalid_type_error: "Enter a valid number of shares" })
    .positive("At least a fraction of a share")
    .max(MAX_SHARES, "Too many shares"),
  method: z.enum(["cbe", "telebirr"]),
  file: z
    .instanceof(File, { message: "Upload your payment screenshot" })
    .refine((f) => ACCEPTED.includes(f.type), "PNG, JPG or WEBP only")
    .refine((f) => f.size <= MAX_FILE_BYTES, "Max 5 MB"),
});


function formatETB(n: number) {
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatShares(n: number) {
  return new Intl.NumberFormat("en-ET", {
    maximumFractionDigits: 4,
  }).format(n);
}


function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Copied", { description: value });
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy");
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function BuyPage() {
  const navigate = useNavigate();
  const [shares, setShares] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cbe");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number>(BASE_SHARE_PRICE);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSubmitRef = useRef(0);

  // Fetch current dynamic share price (base × (1 + growth%))
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("company_growth")
        .select("growth_percentage")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const g = Number(data?.growth_percentage ?? 0);
      if (!cancelled) setCurrentPrice(BASE_SHARE_PRICE * (1 + g / 100));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

    const parsed = schema.safeParse({ shares: sharesNum, method, file });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Invalid form");
      return;
    }

    lastSubmitRef.current = now;
    setSubmitting(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Not authenticated");
      const userId = userData.user.id;

      const f = parsed.data.file;
      const ext = (f.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("payment-screenshots")
        .upload(path, f, { contentType: f.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error: insErr, data: insData } = await supabase
        .from("share_purchases")
        .insert({
          user_id: userId,
          number_of_shares: parsed.data.shares,
          price_per_share: currentPrice, // backend trigger restamps to current price
          total_amount: parsed.data.shares * currentPrice, // backend trigger overrides

          payment_method: parsed.data.method,
          payment_screenshot_url: path,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);

      setSubmittedId(insData.id);
      toast.success("Purchase request submitted", {
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
              Your purchase of {sharesNum.toLocaleString()} share
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
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
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
          <span className="text-sm font-semibold tracking-tight">Buy Shares</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid gap-6 lg:grid-cols-5">
        {/* Left: Form */}
        <form onSubmit={onSubmit} className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Purchase details</CardTitle>
              <CardDescription>
                Current share price: {formatETB(currentPrice)} (base{" "}
                {formatETB(BASE_SHARE_PRICE)} × company growth). Fractional
                shares allowed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="shares">Number of shares</Label>
                <Input
                  id="shares"
                  type="number"
                  inputMode="decimal"
                  min={0.0001}
                  step="0.0001"
                  placeholder="e.g. 1.5"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  required
                />
              </div>

              <div className="rounded-lg border bg-gradient-to-br from-sidebar to-sidebar/90 text-sidebar-foreground p-5">
                <div className="text-xs uppercase tracking-wider text-sidebar-foreground/60">
                  Total investment
                </div>
                <div className="mt-1 text-3xl font-semibold">
                  {formatETB(total)}
                </div>
                <div className="mt-1 text-xs text-sidebar-foreground/60">
                  {formatShares(sharesNum)} × {formatETB(currentPrice)}
                </div>
              </div>


              <div className="space-y-3">
                <Label>Payment method</Label>
                <RadioGroup
                  value={method}
                  onValueChange={(v) => setMethod(v as PaymentMethod)}
                  className="grid grid-cols-2 gap-3"
                >
                  <label
                    htmlFor="m-cbe"
                    className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      method === "cbe" ? "border-accent bg-accent/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <RadioGroupItem id="m-cbe" value="cbe" />
                    <Building2 className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">CBE</span>
                  </label>
                  <label
                    htmlFor="m-tb"
                    className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      method === "telebirr" ? "border-accent bg-accent/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <RadioGroupItem id="m-tb" value="telebirr" />
                    <Smartphone className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">Telebirr</span>
                  </label>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Payment screenshot</Label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileRef}
                    id="file"
                    type="file"
                    accept={ACCEPTED.join(",")}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" /> Choose file
                  </Button>
                  <span className="text-xs text-muted-foreground truncate">
                    {file ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)` : "PNG, JPG, WEBP · max 5 MB"}
                  </span>
                </div>
              </div>

              <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <span>{RISK_WARNING}</span>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || sharesNum <= 0 || !file}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Submitting…" : `Submit purchase request`}
              </Button>
            </CardContent>
          </Card>
        </form>

        {/* Right: Payment info */}
        <aside className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" /> CBE Accounts
              </CardTitle>
              <CardDescription>Commercial Bank of Ethiopia</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PAYMENTS.cbe.map((p) => (
                <div
                  key={p.account}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <div className="font-mono text-sm font-medium">{p.account}</div>
                    <div className="text-xs text-muted-foreground">{p.name}</div>
                  </div>
                  <CopyButton value={p.account} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="h-4 w-4 text-primary" /> Telebirr
              </CardTitle>
              <CardDescription>Mobile money</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PAYMENTS.telebirr.map((p) => (
                <div
                  key={p.account}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <div className="font-mono text-sm font-medium">{p.account}</div>
                    <div className="text-xs text-muted-foreground">{p.name}</div>
                  </div>
                  <CopyButton value={p.account} />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground leading-relaxed">
            Transfer the exact total amount to one of the accounts above, then
            upload a clear screenshot of the receipt. Your request stays in
            <span className="font-medium text-foreground"> pending </span>
            status until an admin approves it.
          </div>
        </aside>
      </main>
    </div>
  );
}
