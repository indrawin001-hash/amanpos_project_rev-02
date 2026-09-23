import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Transaction, type TransactionLine } from "@/lib/db";
import { AppShell, BRAND_LOGO_URL } from "@/components/AppShell";
import { printTransactionReceipt } from "@/lib/print-receipt";
import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { currency, number, genReceiptNo } from "@/lib/format";
import { format } from "date-fns";
import { Download, Eye, Upload, Trophy, Printer } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/admin/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — AmanPOS Admin" },
      { name: "description", content: "Browse and export AmanPOS transactions and sales reports." },
    ],
  }),
  component: () => (
    <AppShell role="admin">
      <TxPage />
    </AppShell>
  ),
});

function TxPage() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="p-6 lg:p-8" />;
  return <TxPageContent />;
}

type ItemAgg = {
  code: string;
  description: string;
  uom: string;
  qty: number;
  revenue: number;
  txCount: number;
  avgPrice: number;
};

function TxPageContent() {
  const txs = useLiveQuery(() => db.transactions.orderBy("createdAt").reverse().toArray(), [], []);
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [itemSort, setItemSort] = useState<"revenue" | "qty">("revenue");
  const [itemQuery, setItemQuery] = useState("");

  const filtered = useMemo(() => {
    const fromMs = new Date(`${from}T00:00:00`).getTime();
    const toMs = new Date(`${to}T23:59:59.999`).getTime();
    return txs.filter((t) => t.createdAt >= fromMs && t.createdAt <= toMs);
  }, [txs, from, to]);

  const totals = useMemo(
    () => ({
      revenue: filtered.reduce((s, t) => s + t.total, 0),
      items: filtered.reduce((s, t) => s + t.lines.reduce((a, l) => a + l.quantity, 0), 0),
      count: filtered.length,
    }),
    [filtered],
  );

  const itemReport: ItemAgg[] = useMemo(() => {
    const map = new Map<string, ItemAgg & { txSet: Set<number | string> }>();
    for (const t of filtered) {
      for (const l of t.lines) {
        const key = l.code;
        let row = map.get(key);
        if (!row) {
          row = {
            code: l.code,
            description: l.description,
            uom: l.uom,
            qty: 0,
            revenue: 0,
            txCount: 0,
            avgPrice: 0,
            txSet: new Set(),
          };
          map.set(key, row);
        }
        row.qty += l.quantity;
        row.revenue += l.total;
        row.txSet.add(t.id ?? t.receiptNo);
      }
    }
    const rows = Array.from(map.values()).map((r) => ({
      code: r.code,
      description: r.description,
      uom: r.uom,
      qty: r.qty,
      revenue: r.revenue,
      txCount: r.txSet.size,
      avgPrice: r.qty > 0 ? r.revenue / r.qty : 0,
    }));
    const q = itemQuery.trim().toLowerCase();
    const filteredRows = q
      ? rows.filter(
          (r) => r.code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
        )
      : rows;
    filteredRows.sort((a, b) => (itemSort === "qty" ? b.qty - a.qty : b.revenue - a.revenue));
    return filteredRows;
  }, [filtered, itemSort, itemQuery]);

  function exportXlsx() {
    const rows = filtered.flatMap((t) =>
      t.lines.map((l) => ({
        receiptNo: t.receiptNo,
        datetime: format(new Date(t.createdAt), "yyyy-MM-dd HH:mm:ss"),
        cashier: t.cashier,
        memberCode: t.memberCode ?? "",
        memberName: t.memberName ?? "",
        code: l.code,
        description: l.description,
        uom: l.uom,
        qty: l.quantity,
        price: l.price,
        lineTotal: l.total,
        receiptTotal: t.total,
        pointsEarned: t.pointsEarned ?? 0,
        pointsRedeemed: t.pointsRedeemed ?? 0,
      })),
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `amanpos-transactions-${from}_to_${to}.xlsx`);
  }

  function exportItemReportXlsx() {
    const rows = itemReport.map((r) => ({
      code: r.code,
      description: r.description,
      uom: r.uom,
      qty_sold: r.qty,
      transactions: r.txCount,
      avg_price: Math.round(r.avgPrice),
      revenue: r.revenue,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items Report");
    XLSX.writeFile(wb, `amanpos-items-report-${from}_to_${to}.xlsx`);
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  function downloadImportTemplate() {
    const sample = [
      {
        receiptNo: "EXT-0001",
        datetime: "2026-01-15 10:30:00",
        cashier: "External",
        code: "8991002101234",
        description: "Mineral Water 600ml",
        uom: "pcs",
        qty: 2,
        price: 3500,
      },
      {
        receiptNo: "EXT-0001",
        datetime: "2026-01-15 10:30:00",
        cashier: "External",
        code: "8991002105678",
        description: "Instant Noodles",
        uom: "pcs",
        qty: 3,
        price: 3200,
      },
      {
        receiptNo: "EXT-0002",
        datetime: "2026-01-15 11:05:00",
        cashier: "External",
        code: "BOX-RICE-5KG",
        description: "Rice 5kg Premium",
        uom: "box",
        qty: 1,
        price: 78000,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "amanpos-transactions-import-template.xlsx");
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (rows.length === 0) {
        toast.error("File has no rows");
        return;
      }

      const groups = new Map<
        string,
        { receiptNo: string; cashier: string; createdAt: number; lines: TransactionLine[] }
      >();
      let skipped = 0;

      for (const r of rows) {
        const code = String(r.code ?? r.Code ?? "").trim();
        const description = String(r.description ?? r.Description ?? "").trim();
        const qty = Number(r.qty ?? r.quantity ?? r.Qty ?? 0);
        const price = Number(r.price ?? r.Price ?? 0);
        if (!code || !description || !qty || !price) {
          skipped++;
          continue;
        }
        const uom = String(r.uom ?? r.UOM ?? "pcs").trim() || "pcs";
        const cashier = String(r.cashier ?? r.Cashier ?? "Imported").trim() || "Imported";
        const receiptNo =
          String(r.receiptNo ?? r.receipt ?? r.Receipt ?? "").trim() || genReceiptNo();
        const dtRaw = r.datetime ?? r.date ?? r.Date ?? r.DateTime;
        let createdAt = Date.now();
        if (dtRaw instanceof Date) createdAt = dtRaw.getTime();
        else if (dtRaw) {
          const t = new Date(String(dtRaw)).getTime();
          if (!Number.isNaN(t)) createdAt = t;
        }

        let g = groups.get(receiptNo);
        if (!g) {
          g = { receiptNo, cashier, createdAt, lines: [] };
          groups.set(receiptNo, g);
        }
        g.lines.push({ code, description, price, uom, quantity: qty, total: qty * price });
      }

      const txs: Transaction[] = Array.from(groups.values()).map((g) => {
        const subtotal = g.lines.reduce((s, l) => s + l.total, 0);
        return {
          receiptNo: g.receiptNo,
          cashier: g.cashier,
          lines: g.lines,
          subtotal,
          tax: 0,
          total: subtotal,
          paid: subtotal,
          change: 0,
          createdAt: g.createdAt,
        };
      });

      await db.transactions.bulkAdd(txs);
      toast.success(
        `Imported ${txs.length} transactions (${rows.length - skipped} lines)${skipped ? `, skipped ${skipped} invalid` : ""}`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to import file");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const top10Revenue = useMemo(
    () => [...itemReport].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    [itemReport],
  );
  const top10Qty = useMemo(
    () => [...itemReport].sort((a, b) => b.qty - a.qty).slice(0, 10),
    [itemReport],
  );

  function reprint(t: Transaction) {
    try {
      printTransactionReceipt(t, BRAND_LOGO_URL);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open print window");
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filter, view, import and export sales.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
          <Button variant="outline" onClick={downloadImportTemplate}>
            <Download className="h-4 w-4 mr-1" /> Template
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-1" /> {importing ? "Importing…" : "Import transactions"}
          </Button>
        </div>
      </header>

      <div className="rounded-xl border bg-card p-4 shadow-soft flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <div className="flex gap-6 ml-auto text-sm">
          <Stat label="Transactions" value={number(totals.count)} />
          <Stat label="Items sold" value={number(totals.items)} />
          <Stat label="Revenue" value={currency(totals.revenue)} accent />
        </div>
      </div>

      <Tabs defaultValue="tx" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tx">Transactions</TabsTrigger>
          <TabsTrigger value="items">Items report</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="top">Top 10</TabsTrigger>
        </TabsList>

        <TabsContent value="tx" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" onClick={exportXlsx} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export Excel
            </Button>
          </div>
          <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left px-5 py-3">Receipt</th>
                    <th className="text-left px-5 py-3">Date / time</th>
                    <th className="text-left px-5 py-3">Cashier</th>
                    <th className="text-left px-5 py-3">Member</th>
                    <th className="text-right px-5 py-3">Items</th>
                    <th className="text-right px-5 py-3">Pts</th>
                    <th className="text-right px-5 py-3">Total</th>
                    <th className="px-5 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="px-5 py-3 font-mono text-xs">{t.receiptNo}</td>
                      <td className="px-5 py-3">
                        {format(new Date(t.createdAt), "MMM d, yyyy HH:mm")}
                      </td>
                      <td className="px-5 py-3">{t.cashier}</td>
                      <td className="px-5 py-3">
                        {t.memberName ? (
                          <div>
                            <div className="font-medium">{t.memberName}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {t.memberCode}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {t.lines.reduce((s, l) => s + l.quantity, 0)}
                      </td>
                      <td className="px-5 py-3 text-right text-xs">
                        {(t.pointsEarned ?? 0) > 0 && (
                          <span className="text-[color:var(--accent-foreground)]">
                            +{t.pointsEarned}
                          </span>
                        )}
                        {(t.pointsRedeemed ?? 0) > 0 && (
                          <span className="text-destructive ml-1">-{t.pointsRedeemed}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold">{currency(t.total)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Reprint receipt"
                          onClick={() => reprint(t)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="View receipt"
                          onClick={() => setViewing(t)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                        No transactions in this range
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search code or description"
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Sort by</span>
              <Button
                size="sm"
                variant={itemSort === "revenue" ? "default" : "outline"}
                onClick={() => setItemSort("revenue")}
              >
                Revenue
              </Button>
              <Button
                size="sm"
                variant={itemSort === "qty" ? "default" : "outline"}
                onClick={() => setItemSort("qty")}
              >
                Qty sold
              </Button>
            </div>
            <div className="ml-auto">
              <Button
                variant="outline"
                onClick={exportItemReportXlsx}
                disabled={itemReport.length === 0}
              >
                <Download className="h-4 w-4 mr-1" /> Export Excel
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left px-5 py-3">Code</th>
                    <th className="text-left px-5 py-3">Description</th>
                    <th className="text-left px-5 py-3">UOM</th>
                    <th className="text-right px-5 py-3">Qty sold</th>
                    <th className="text-right px-5 py-3">Transactions</th>
                    <th className="text-right px-5 py-3">Avg price</th>
                    <th className="text-right px-5 py-3">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {itemReport.map((r) => (
                    <tr key={r.code} className="border-t hover:bg-muted/30">
                      <td className="px-5 py-3 font-mono text-xs">{r.code}</td>
                      <td className="px-5 py-3">{r.description}</td>
                      <td className="px-5 py-3">{r.uom}</td>
                      <td className="px-5 py-3 text-right">{number(r.qty)}</td>
                      <td className="px-5 py-3 text-right">{number(r.txCount)}</td>
                      <td className="px-5 py-3 text-right">{currency(r.avgPrice)}</td>
                      <td className="px-5 py-3 text-right font-semibold">{currency(r.revenue)}</td>
                    </tr>
                  ))}
                  {itemReport.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                        No items sold in this range
                      </td>
                    </tr>
                  )}
                </tbody>
                {itemReport.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td className="px-5 py-3" colSpan={3}>
                        Total
                      </td>
                      <td className="px-5 py-3 text-right">
                        {number(itemReport.reduce((s, r) => s + r.qty, 0))}
                      </td>
                      <td className="px-5 py-3"></td>
                      <td className="px-5 py-3"></td>
                      <td className="px-5 py-3 text-right">
                        {currency(itemReport.reduce((s, r) => s + r.revenue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="members" className="space-y-3">
          <MembersReport txs={filtered} rangeLabel={`${from}_to_${to}`} />
        </TabsContent>

        <TabsContent value="top" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Top10Card
              title="Top 10 by Sales Value"
              icon={<Trophy className="h-4 w-4" />}
              rows={top10Revenue}
              metric="revenue"
            />
            <Top10Card
              title="Top 10 by Quantity Sold"
              icon={<Trophy className="h-4 w-4" />}
              rows={top10Qty}
              metric="qty"
            />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt {viewing?.receiptNo}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="text-sm space-y-3">
              <div className="text-xs text-muted-foreground">
                {format(new Date(viewing.createdAt), "PPpp")} · Cashier: {viewing.cashier}
              </div>
              <div className="border rounded-lg divide-y">
                {viewing.lines.map((l) => (
                  <div key={l.code} className="p-3 flex justify-between gap-3">
                    <div>
                      <div className="font-medium">{l.description}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {l.code} · {l.quantity} {l.uom} × {currency(l.price)}
                      </div>
                    </div>
                    <div className="font-semibold">{currency(l.total)}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-1 pt-2 border-t">
                <Row label="Subtotal" value={currency(viewing.subtotal)} />
                <Row label="Tax" value={currency(viewing.tax)} />
                <Row label="Total" value={currency(viewing.total)} bold />
                <Row label="Paid" value={currency(viewing.paid)} />
                <Row label="Change" value={currency(viewing.change)} />
              </div>
              <Button className="w-full" onClick={() => reprint(viewing)}>
                <Printer className="h-4 w-4 mr-1" /> Reprint receipt
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-display font-bold text-lg ${accent ? "text-[color:var(--accent-foreground)]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Top10Card({
  title,
  icon,
  rows,
  metric,
}: {
  title: string;
  icon: React.ReactNode;
  rows: ItemAgg[];
  metric: "revenue" | "qty";
}) {
  const max = Math.max(1, ...rows.map((r) => (metric === "revenue" ? r.revenue : r.qty)));
  return (
    <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center gap-2 font-semibold">
        {icon} {title}
      </div>
      <div className="divide-y">
        {rows.map((r, i) => {
          const val = metric === "revenue" ? r.revenue : r.qty;
          const pct = (val / max) * 100;
          return (
            <div key={r.code} className="px-5 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.description}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{r.code}</div>
                  </div>
                </div>
                <div className="text-right font-semibold whitespace-nowrap">
                  {metric === "revenue" ? currency(r.revenue) : `${number(r.qty)} ${r.uom}`}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-muted-foreground text-sm">
            No items sold in this range
          </div>
        )}
      </div>
    </div>
  );
}

function MembersReport({ txs, rangeLabel }: { txs: Transaction[]; rangeLabel: string }) {
  const rows = useMemo(() => {
    const map = new Map<
      string,
      {
        code: string;
        name: string;
        txCount: number;
        revenue: number;
        earned: number;
        redeemed: number;
      }
    >();
    for (const t of txs) {
      if (!t.memberCode) continue;
      const key = t.memberCode;
      let r = map.get(key);
      if (!r) {
        r = {
          code: t.memberCode,
          name: t.memberName ?? t.memberCode,
          txCount: 0,
          revenue: 0,
          earned: 0,
          redeemed: 0,
        };
        map.set(key, r);
      }
      r.txCount += 1;
      r.revenue += t.total;
      r.earned += t.pointsEarned ?? 0;
      r.redeemed += t.pointsRedeemed ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [txs]);

  const memberTxs = txs.filter((t) => !!t.memberCode).length;

  function exportXlsx() {
    const data = rows.map((r) => ({
      member_code: r.code,
      member_name: r.name,
      transactions: r.txCount,
      revenue: r.revenue,
      points_earned: r.earned,
      points_redeemed: r.redeemed,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Members");
    XLSX.writeFile(wb, `amanpos-members-report-${rangeLabel}.xlsx`);
  }

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {rows.length} unique member{rows.length === 1 ? "" : "s"} · {memberTxs} member transaction
          {memberTxs === 1 ? "" : "s"} in this range
        </div>
        <Button variant="outline" onClick={exportXlsx} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export Excel
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-right px-5 py-3">Transactions</th>
                <th className="text-right px-5 py-3">Revenue</th>
                <th className="text-right px-5 py-3">Points earned</th>
                <th className="text-right px-5 py-3">Points redeemed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-t hover:bg-muted/30">
                  <td className="px-5 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 text-right">{number(r.txCount)}</td>
                  <td className="px-5 py-3 text-right font-semibold">{currency(r.revenue)}</td>
                  <td className="px-5 py-3 text-right text-[color:var(--accent-foreground)]">
                    +{number(r.earned)}
                  </td>
                  <td className="px-5 py-3 text-right text-destructive">-{number(r.redeemed)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    No member transactions in this range
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
