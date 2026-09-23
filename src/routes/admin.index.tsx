import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { currency, number } from "@/lib/format";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { startOfDay, subDays, format } from "date-fns";
import { DollarSign, ShoppingBag, Package, TrendingUp, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AmanPOS Admin" },
      {
        name: "description",
        content: "AmanPOS admin dashboard: sales KPIs, charts, and recent transactions.",
      },
    ],
  }),
  component: () => (
    <AppShell role="admin">
      <Dashboard />
    </AppShell>
  ),
});

function Dashboard() {
  const hydrated = useHydrated();

  if (!hydrated) {
    return <div className="p-6 lg:p-8" />;
  }

  return <DashboardContent />;
}

function DashboardContent() {
  const txs = useLiveQuery(() => db.transactions.orderBy("createdAt").reverse().toArray(), [], []);
  const items = useLiveQuery(() => db.items.toArray(), [], []);

  const stats = useMemo(() => {
    const todayStart = startOfDay(new Date()).getTime();
    const today = txs.filter((t) => t.createdAt >= todayStart);
    const todayRevenue = today.reduce((s, t) => s + t.total, 0);
    const todayCount = today.length;
    const itemsSoldToday = today.reduce(
      (s, t) => s + t.lines.reduce((a, l) => a + l.quantity, 0),
      0,
    );
    const allRevenue = txs.reduce((s, t) => s + t.total, 0);
    return { todayRevenue, todayCount, itemsSoldToday, allRevenue };
  }, [txs]);

  const series = useMemo(() => {
    const days: { date: string; label: string; revenue: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      const next = d.getTime() + 86400000;
      const day = txs.filter((t) => t.createdAt >= d.getTime() && t.createdAt < next);
      days.push({
        date: d.toISOString(),
        label: format(d, "EEE"),
        revenue: day.reduce((s, t) => s + t.total, 0),
        count: day.length,
      });
    }
    return days;
  }, [txs]);

  const topItems = useMemo(() => {
    const map = new Map<string, { description: string; qty: number; revenue: number }>();
    for (const t of txs) {
      for (const l of t.lines) {
        const cur = map.get(l.code) ?? { description: l.description, qty: 0, revenue: 0 };
        cur.qty += l.quantity;
        cur.revenue += l.total;
        map.set(l.code, cur);
      }
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [txs]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header>
        <div className="text-sm text-muted-foreground">Welcome back</div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<DollarSign className="h-4 w-4" />}
          label="Today's revenue"
          value={currency(stats.todayRevenue)}
          accent
        />
        <Kpi
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Today's transactions"
          value={number(stats.todayCount)}
        />
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="Items sold today"
          value={number(stats.itemsSoldToday)}
        />
        <Kpi
          icon={<Package className="h-4 w-4" />}
          label="Catalog items"
          value={number(items.length)}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-soft">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="font-display font-bold">Sales — last 7 days</div>
              <div className="text-xs text-muted-foreground">Daily revenue</div>
            </div>
            <div className="text-sm font-semibold">
              {currency(series.reduce((s, d) => s + d.revenue, 0))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                />
                <Tooltip
                  formatter={(v) => currency(Number(v))}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-accent)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-soft">
          <div className="font-display font-bold mb-4">Top items</div>
          {topItems.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No sales yet</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={topItems} layout="vertical" margin={{ left: 0, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="description"
                    width={110}
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tick={{ width: 100 }}
                  />
                  <Tooltip
                    formatter={(v) => `${Number(v)} sold`}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="qty" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-soft">
        <div className="p-5 flex items-center justify-between">
          <div className="font-display font-bold">Recent transactions</div>
          <Link
            to="/admin/transactions"
            className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-t">
              <tr>
                <th className="text-left px-5 py-3">Receipt</th>
                <th className="text-left px-5 py-3">Time</th>
                <th className="text-left px-5 py-3">Cashier</th>
                <th className="text-right px-5 py-3">Items</th>
                <th className="text-right px-5 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {txs.slice(0, 8).map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="px-5 py-3 font-mono text-xs">{t.receiptNo}</td>
                  <td className="px-5 py-3">{format(new Date(t.createdAt), "MMM d, HH:mm")}</td>
                  <td className="px-5 py-3">{t.cashier}</td>
                  <td className="px-5 py-3 text-right">
                    {t.lines.reduce((s, l) => s + l.quantity, 0)}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{currency(t.total)}</td>
                </tr>
              ))}
              {txs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    No transactions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-5 shadow-soft ${accent ? "ring-1 ring-accent/40" : ""}`}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm">{label}</span>
        <span
          className={`h-7 w-7 rounded-md grid place-items-center ${accent ? "bg-accent/15 text-[color:var(--accent-foreground)]" : "bg-muted"}`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 font-display font-bold text-2xl">{value}</div>
    </div>
  );
}
