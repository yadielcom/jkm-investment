import type { ReactNode } from "react";
import jkmLogo from "@/assets/jkm-logo.png";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Brand panel */}
      <div className="hidden md:flex md:w-1/2 bg-sidebar text-sidebar-foreground p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar via-sidebar to-black/40 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src={jkmLogo} alt="JKM Investment" className="h-12 w-12 rounded-md object-contain bg-black/40 p-1" />
            <div className="flex flex-col">
              <span className="text-xl font-semibold tracking-tight">JKM Investment</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-accent/80">Billion Dollar Company</span>
            </div>
          </div>
        </div>
        <div className="relative z-10 space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            Build wealth with <span className="text-accent">confidence</span>.
          </h2>
          <p className="text-sidebar-foreground/70 text-sm max-w-sm">
            A premium investment platform for the next generation of Ethiopian investors.
          </p>
        </div>
        <div className="relative z-10 text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} JKM Investment. All rights reserved.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="md:hidden flex items-center gap-2 mb-2">
            <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold">
              J
            </div>
            <span className="text-lg font-semibold">JKM Investment</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="pt-2">{footer}</div>}
          <div className="mt-6 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-foreground/80">
            ⚠️ Only invest what you can afford to lose.
          </div>
        </div>
      </div>
    </div>
  );
}
