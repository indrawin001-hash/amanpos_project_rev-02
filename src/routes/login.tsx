import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingBag, ShieldCheck, WifiOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — AmanPOS" },
      { name: "description", content: "Sign in to AmanPOS cashier or admin panel." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: user.role === "admin" ? "/admin" : "/pos" });
    }
  }, [user, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await login(username, password);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Login failed");
      return;
    }
    toast.success("Welcome back!");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)] overflow-hidden">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at top right, color-mix(in oklab, var(--accent) 60%, transparent), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-accent text-accent-foreground grid place-items-center font-display font-bold text-xl">
              A
            </div>
            <div>
              <div className="font-display text-2xl font-bold tracking-tight">AmanPOS</div>
              <div className="text-xs text-[color:var(--sidebar-foreground)]/70">
                Offline-first Point of Sale
              </div>
            </div>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="font-display text-4xl font-bold leading-tight max-w-md">
            Run your store, even when the internet is down.
          </h1>
          <div className="grid gap-4 max-w-md">
            <Feature
              icon={<ShoppingBag className="h-4 w-4" />}
              title="Fast cashier checkout"
              desc="Scan barcodes or pick items in one tap."
            />
            <Feature
              icon={<WifiOff className="h-4 w-4" />}
              title="Works offline"
              desc="All data stored locally on the device."
            />
            <Feature
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Admin dashboard"
              desc="Monitor sales, reports & item catalog."
            />
          </div>
        </div>

        <div className="relative text-xs text-[color:var(--sidebar-foreground)]/60">
          © {new Date().getFullYear()} AmanPOS
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-display font-bold">
              A
            </div>
            <div className="font-display text-xl font-bold">AmanPOS</div>
          </div>

          <h2 className="font-display text-3xl font-bold">Sign in</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Use your AmanPOS credentials to continue.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="u">Username</Label>
              <Input
                id="u"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p">Password</Label>
              <Input
                id="p"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-8 rounded-lg border bg-muted/50 p-4 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">Demo accounts</div>
            <div>
              <span className="font-mono">admin</span> / <span className="font-mono">admin123</span>{" "}
              — full access
            </div>
            <div>
              <span className="font-mono">cashier</span> /{" "}
              <span className="font-mono">cashier123</span> — POS only
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-lg bg-white/10 grid place-items-center shrink-0">{icon}</div>
      <div>
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-[color:var(--sidebar-foreground)]/70">{desc}</div>
      </div>
    </div>
  );
}
