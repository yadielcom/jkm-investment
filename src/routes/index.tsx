import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import jkmLogo from "@/assets/jkm-logo.png";
import {
  Mail,
  Phone,
  Send,
  ArrowRight,
  TrendingUp,
  Shield,
  BarChart3,
  Menu,
  X,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JKM Investment — Own a piece of the future" },
      { name: "description", content: "JKM Investment platform. Buy shares, sell shares, and track your investment growth in real-time." },
      { property: "og:title", content: "JKM Investment — Own a piece of the future" },
      { property: "og:description", content: "JKM Investment platform. Buy shares, sell shares, and track your investment growth in real-time." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const role = await getCurrentUserRole(data.user.id);
      throw redirect({ to: role === "admin" ? "/admin" : "/dashboard" });
    }
  },
  component: LandingPage,
});

function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToContact = useCallback(() => {
    const el = document.getElementById("contact");
    if (el) el.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setMobileOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-sidebar/95 backdrop-blur-md shadow-lg border-b border-sidebar-border/30"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <button onClick={scrollToTop} className="flex items-center gap-2 cursor-pointer">
              <img src={jkmLogo} alt="JKM" className="h-10 w-10 rounded-md object-contain bg-black/60 p-0.5" />
              <span className={`text-lg font-semibold tracking-tight transition-colors ${scrolled ? "text-sidebar-foreground" : "text-sidebar-foreground"}`}>
                JKM Investment
              </span>
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={scrollToTop}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                  scrolled
                    ? "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-white/10"
                }`}
              >
                Home
              </button>
              <button
                onClick={scrollToContact}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                  scrolled
                    ? "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-white/10"
                }`}
              >
                Contact Us
              </button>
              <div className="w-px h-5 mx-2 bg-sidebar-foreground/20" />
              <Link to="/login">
                <Button
                  variant="ghost"
                  className={`text-sm cursor-pointer ${
                    scrolled
                      ? "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      : "text-sidebar-foreground hover:bg-white/10"
                  }`}
                >
                  Log in
                </Button>
              </Link>
              <Link to="/signup">
                <Button className="text-sm bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer">
                  Sign up
                </Button>
              </Link>
            </nav>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="md:hidden p-2 rounded-md text-sidebar-foreground hover:bg-white/10 cursor-pointer"
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden bg-sidebar/98 backdrop-blur-md border-t border-sidebar-border/30">
            <div className="px-4 py-4 space-y-1">
              <button
                onClick={scrollToTop}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-sidebar-foreground rounded-md hover:bg-sidebar-accent cursor-pointer"
              >
                Home
              </button>
              <button
                onClick={scrollToContact}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-sidebar-foreground rounded-md hover:bg-sidebar-accent cursor-pointer"
              >
                Contact Us
              </button>
              <div className="border-t border-sidebar-border/30 my-2" />
              <Link to="/login" onClick={() => setMobileOpen(false)}>
                <span className="block px-3 py-2 text-sm font-medium text-sidebar-foreground rounded-md hover:bg-sidebar-accent cursor-pointer">
                  Log in
                </span>
              </Link>
              <Link to="/signup" onClick={() => setMobileOpen(false)}>
                <span className="block px-3 py-2 text-sm font-medium text-sidebar-foreground rounded-md bg-accent/20 text-accent hover:bg-accent/30 cursor-pointer">
                  Sign up
                </span>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative min-h-[92vh] flex items-center bg-sidebar overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar via-sidebar to-black/50 pointer-events-none" />
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-16 w-full">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <TrendingUp size={14} />
              Ethiopian Investment Platform
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-sidebar-foreground leading-[1.1] mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
              Own a piece of{" "}
              <span className="text-accent">JKM Investment</span>
            </h1>
            <p className="text-lg sm:text-xl text-sidebar-foreground/70 max-w-xl mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              Build wealth with confidence. Buy shares, track growth, and secure your financial future with a platform built for modern Ethiopian investors.
            </p>
            <div className="flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold px-8 cursor-pointer group"
                >
                  Get Started
                  <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-sidebar-foreground/20 text-sidebar-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground px-8 cursor-pointer"
                >
                  Log in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 sm:py-28 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
              Why choose <span className="text-accent">JKM</span>?
            </h2>
            <p className="text-muted-foreground text-lg">
              A seamless experience designed to make investing simple, secure, and rewarding.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: TrendingUp,
                title: "Buy shares easily",
                description: "Purchase shares at 1,000 ETB per share with a streamlined checkout process. CBE and Telebirr payments supported.",
              },
              {
                icon: BarChart3,
                title: "Track investment growth",
                description: "Watch your portfolio grow in real-time with live updates, profit tracking, and ROI analytics at a glance.",
              },
              {
                icon: Shield,
                title: "Sell shares anytime",
                description: "Submit sell requests anytime and receive your proceeds after admin approval. Your wealth, your control.",
              },
            ].map((feature, i) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border bg-card p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4 duration-700"
                style={{ animationDelay: `${(i + 1) * 100}ms` }}
              >
                <div className="h-12 w-12 rounded-lg bg-accent/10 text-accent grid place-items-center mb-5 group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-300">
                  <feature.icon size={24} />
                </div>
                <h3 className="text-xl font-semibold text-card-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary/5 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
            Ready to start your journey?
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
            Join thousands of Ethiopian investors building wealth with JKM Investment.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/signup">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 cursor-pointer group"
              >
                Create Account
                <ChevronRight size={18} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                variant="outline"
                className="px-8 cursor-pointer"
              >
                Already a member? Log in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 sm:py-28 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
              Contact <span className="text-accent">Us</span>
            </h2>
            <p className="text-muted-foreground text-lg">
              Have questions? We are here to help. Reach out through any of the channels below.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="rounded-xl border border-border bg-card p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent grid place-items-center shrink-0">
                  <Mail size={20} />
                </div>
                <h3 className="font-semibold text-card-foreground">Email</h3>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>jkmcompany10@gmail.com</p>
                <p>tradingyadiel@gmail.com</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent grid place-items-center shrink-0">
                  <Phone size={20} />
                </div>
                <h3 className="font-semibold text-card-foreground">Phone</h3>
              </div>
              <p className="text-sm text-muted-foreground">0943887676</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent grid place-items-center shrink-0">
                  <Send size={20} />
                </div>
                <h3 className="font-semibold text-card-foreground">Telegram</h3>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  <span className="text-foreground/60">User:</span>{" "}
                  <span className="text-foreground font-medium">@Babi_noah</span>
                </p>
                <p>
                  <span className="text-foreground/60">Channel:</span>{" "}
                  <span className="text-foreground font-medium">@businessinethiopia10</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Risk Disclaimer */}
      <section className="py-12 bg-accent/5 border-t border-accent/20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-start gap-4 rounded-xl border border-accent/30 bg-background p-6">
            <div className="shrink-0 mt-0.5">
              <AlertTriangle size={22} className="text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                Investment Risk Disclaimer
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Higher risk offers higher potential reward. All investments carry risk, including the possible loss of capital.
                Only invest what you can afford to lose. Past performance is not indicative of future results.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-sidebar border-t border-sidebar-border/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-accent text-accent-foreground grid place-items-center font-bold text-sm">
                J
              </div>
              <span className="text-sm font-medium text-sidebar-foreground">
                JKM Investment
              </span>
            </div>
            <p className="text-xs text-sidebar-foreground/50">
              © {new Date().getFullYear()} JKM Investment. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
