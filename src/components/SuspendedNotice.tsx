import { ShieldAlert, Phone, Mail, Send } from "lucide-react";

export function SuspendedNotice() {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-destructive/15 text-destructive grid place-items-center shrink-0">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">Account suspended</h3>
          <p className="text-sm text-muted-foreground">
            You are suspended by the organization. If you need assistance or want
            to restore access, please contact support.
          </p>
        </div>
      </div>
      <div className="grid gap-2 text-sm">
        <a
          href="tel:0943887676"
          className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 hover:bg-muted/50 transition"
        >
          <Phone className="h-4 w-4 text-accent" />
          <span className="font-medium">0943887676</span>
        </a>
        <a
          href="mailto:jkmcompany10@gmail.com"
          className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 hover:bg-muted/50 transition"
        >
          <Mail className="h-4 w-4 text-accent" />
          <span className="font-medium">jkmcompany10@gmail.com</span>
        </a>
        <a
          href="https://t.me/Babi_noah"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 hover:bg-muted/50 transition"
        >
          <Send className="h-4 w-4 text-accent" />
          <span className="font-medium">@Babi_noah</span>
        </a>
      </div>
    </div>
  );
}
