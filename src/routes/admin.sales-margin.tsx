import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Item } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { currency, number } from "@/lib/format";
import { format, startOfMonth, subDays } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { TrendingUp, RefreshCcw, Settings2 } from "lucide-react";

type Preset = "7D" | "30D" | "90D" | "MTD" | "Custom";

export const Route = createFileRoute("/admin/sales-margin")({
  head: () => ({
    meta: [
      { title: "Sales & Margin — AmanPOS Admin" },
      {
        name: "description",
        content: "Revenue, COGS, gross profit and margin dashboard with KPIs and sales mix.",
      },
    ],
  }),
  component: () => (
    <AppShell role="admin">
      <Page />
    </AppShell>
  ),
});

function Page() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="p-6 lg:p-8" />;
  return <Content />;
}

/** Purchase price from the item master when set, otherwise the default cost ratio. */
function getCost(item: Item | undefined, price: number, defaultRatio: number) {
  const c = item?.cost;
  return typeof c === "number" && c > 0 ? c : price * defaultRatio;
}

function Content() {
  const txs = useLiveQuery(() => db.transactions.orderBy("createdAt").reverse().toArray(), [], []);
  const items = useLiveQuery(() => db.items.toArray(), [], []);

  const itemMap = useMemo(() => {
    const m = new Map<string, Item>();
    for (const it of items) m.set(it.code, it);
    return m;
  }, [items]);

  const today = format(new Date(), "yyyy-MM-dd");
  const [preset, setPreset] = useState<Preset>("30D");
  const [from, setFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [costRatio, setCostRatio] = useState(0.712); // default ~71.2% of price as COGS

  function applyPreset(p: Preset) {
    setPreset(p);
    const now = new Date();
    if (p === "7D") {
      setFrom(format(subDays(now, 6), "yyyy-MM-dd"));
      setTo(format(now, "yyyy-MM-dd"));
    } else if (p === "30D") {
      setFrom(format(subDays(now, 29), "yyyy-MM-dd"));
      setTo(format(now, "yyyy-MM-dd"));
    } else if (p === "90D") {
      setFrom(format(subDays(now, 89), "yyyy-MM-dd"));
      setTo(format(now, "yyyy-MM-dd"));
    } else if (p === "MTD") {
      setFrom(format(startOfMonth(now), "yyyy-MM-dd"));
      setTo(format(now, "yyyy-MM-dd"));
    }
  }

  const filtered = useMemo(() => {
    const fromMs = new Date(`${from}T00:00:00`).getTime();
    const toMs = new Date(`${to}T23:59:59.999`).getTime();
    return txs.filter((t) => t.createdAt >= fromMs && t.createdAt <= toMs);
  }, [txs, from, to]);

  const kpi = useMemo(() => {
    let revenue = 0,
      cogs = 0,
      units = 0;
    for (const t of filtered) {
      revenue += t.total;
      for (const l of t.lines) {
        units += l.quantity;
        const c = getCost(itemMap.get(l.code), l.price, costRatio);
        cogs += c * l.quantity;
      }
    }
    const grossProfit = revenue - cogs;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const count = filtered.length;
    const atv = count > 0 ? revenue / count : 0;
    const atu = count > 0 ? units / count : 0;
    return { revenue, cogs, grossProfit, margin, count, atv, atu, units };
  }, [filtered, itemMap, costRatio]);

  const daily = useMemo(() => {
    const map = new Map<string, { date: string; revenue: number; profit: number }>();
    for (const t of filtered) {
      const key = format(new Date(t.createdAt), "MMM d");
      const row = map.get(key) ?? { date: key, revenue: 0, profit: 0 };
      row.revenue += t.total;
      for (const l of t.lines) {
        const c = getCost(itemMap.get(l.code), l.price, costRatio);
        row.profit += (l.price - c) * l.quantity;
      }
      map.set(key, row);
    }
    return Array.from(map.values());
  }, [filtered, itemMap, costRatio]);

  const mix = useMemo(() => {
    const m = new Map<string, { description: string; revenue: number }>();
    for (const t of filtered) {
      for (const l of t.lines) {
        const cur = m.get(l.code) ?? { description: l.description, revenue: 0 };
        cur.revenue += l.total;
        m.set(l.code, cur);
      }
    }
    const arr = Array.from(m.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
    const total = arr.reduce((s, r) => s + r.revenue, 0) || 1;
    return arr.map((r) => ({ ...r, pct: (r.revenue / total) * 100 }));
  }, [filtered]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-accent/15 text-[color:var(--accent-foreground)] grid place-items-center">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Sales &amp; margin</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Revenue and gross margin (at weighted-average cost). Sales arrive from POS, import, or
              manual entry.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => applyPreset(preset)}>
          <RefreshCcw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </header>

      <div className="rounded-xl border bg-card p-4 shadow-soft space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["7D", "30D", "90D", "MTD", "Custom"] as Preset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? "default" : "outline"}
              onClick={() => (p === "Custom" ? setPreset("Custom") : applyPreset(p))}
            >
              {p}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("Custom");
              }}
              className="w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("Custom");
              }}
              className="w-44"
            />
          </div>
          <div className="space-y-1.5 ml-auto">
            <Label className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Default cost ratio (% of price)
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={(costRatio * 100).toFixed(1)}
              onChange={(e) =>
                setCostRatio(Math.max(0, Math.min(100, Number(e.target.value || 0))) / 100)
              }
              className="w-32"
            />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Revenue" value={currency(kpi.revenue)} tone="default" />
        <Card label="COGS" value={currency(kpi.cogs)} tone="muted" />
        <Card label="Gross profit" value={currency(kpi.grossProfit)} tone="success" />
        <Card label="Margin" value={`${kpi.margin.toFixed(1)}%`} tone="accent" />
        <Card label="Transactions" value={number(kpi.count)} sub="Sales invoices in period" />
        <Card
          label="Avg transaction value"
          value={currency(kpi.atv)}
          sub="ATV · revenue per transaction"
          tone="accent"
        />
        <Card
          label="Avg transaction units"
          value={kpi.atu.toFixed(1)}
          sub="ATU · units per transaction"
          tone="success"
        />
        <Card label="Units sold" value={number(kpi.units)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-soft">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="font-display font-bold">Revenue &amp; profit trend</div>
              <div className="text-xs text-muted-foreground">Daily across selected period</div>
            </div>
            <div className="text-sm font-semibold">{currency(kpi.revenue)}</div>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) =>
                    v >= 1000000
                      ? `${(v / 1000000).toFixed(1)}M`
                      : v >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : String(v)
                  }
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
                  dot={false}
                  name="Revenue"
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={false}
                  name="Gross profit"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-soft">
          <div className="font-display font-bold">Sales mix</div>
          <div className="text-xs text-muted-foreground mb-3">
            Share of revenue in the selected period
          </div>
          {mix.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No sales in range</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={mix} layout="vertical" margin={{ left: 0, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="description"
                    width={110}
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                  />
                  <Tooltip
                    formatter={(v) => currency(Number(v))}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="revenue" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "muted" | "success" | "accent";
}) {
  const cls =
    tone === "accent"
      ? "text-[color:var(--accent-foreground)]"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "muted"
          ? "text-foreground"
          : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-5 shadow-soft">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1.5 font-display font-bold text-2xl ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
