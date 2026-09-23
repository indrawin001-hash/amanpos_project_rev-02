import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Item } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, Search, Tag } from "lucide-react";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/admin/price-cards")({
  head: () => ({
    meta: [
      { title: "Price Cards — AmanPOS Admin" },
      {
        name: "description",
        content:
          "Print A4 price cards with barcode, price, UOM and description for selected items.",
      },
    ],
  }),
  component: () => (
    <AppShell role="admin">
      <PriceCardsPage />
    </AppShell>
  ),
});

function PriceCardsPage() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="p-6 lg:p-8" />;
  return <PriceCardsContent />;
}

type CartonSetting = { qtyPerCarton: number; cartonPrice: number | null };

function PriceCardsContent() {
  const items = useLiveQuery(() => db.items.orderBy("description").toArray(), [], []);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [cartons, setCartons] = useState<Record<string, CartonSetting>>({});
  const [defaultQtyPerCarton, setDefaultQtyPerCarton] = useState(40);
  const [showCarton, setShowCarton] = useState(true);
  const [plu, setPlu] = useState<Record<string, string>>({}); // internal short PLU

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [items, search]);

  const selectedItems = useMemo(() => items.filter((i) => selected[i.code]), [items, selected]);

  function toggle(code: string) {
    setSelected((s) => ({ ...s, [code]: !s[code] }));
  }
  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) filtered.forEach((i) => (next[i.code] = true));
    setSelected(next);
  }

  function updateCarton(code: string, patch: Partial<CartonSetting>) {
    setCartons((c) => {
      const prev = c[code] ?? { qtyPerCarton: defaultQtyPerCarton, cartonPrice: null };
      return { ...c, [code]: { ...prev, ...patch } };
    });
  }

  function print() {
    window.print();
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 print:hidden">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6" /> Price Cards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select items, then print A4 price cards with barcode, price, UOM and description.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Default qty / carton</Label>
            <Input
              type="number"
              className="w-32"
              value={defaultQtyPerCarton}
              onChange={(e) => setDefaultQtyPerCarton(Number(e.target.value) || 0)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm h-10">
            <Checkbox checked={showCarton} onCheckedChange={(v) => setShowCarton(!!v)} />
            Show carton price
          </label>
          <Button onClick={print} disabled={selectedItems.length === 0}>
            <Printer className="h-4 w-4 mr-1" /> Print ({selectedItems.length})
          </Button>
        </div>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/40 sticky top-0">
              <tr>
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((i) => selected[i.code])}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-left px-4 py-3">UoM</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-left px-4 py-3 w-28">PLU (opt.)</th>
                <th className="text-left px-4 py-3 w-24">Qty/CRT</th>
                <th className="text-right px-4 py-3 w-32">Carton price</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const c = cartons[it.code];
                const qty = c?.qtyPerCarton ?? defaultQtyPerCarton;
                const cprice = c?.cartonPrice ?? it.price * qty;
                return (
                  <tr key={it.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={!!selected[it.code]}
                        onCheckedChange={() => toggle(it.code)}
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{it.code}</td>
                    <td className="px-4 py-2">{it.description}</td>
                    <td className="px-4 py-2">{it.uom}</td>
                    <td className="px-4 py-2 text-right">{currency(it.price)}</td>
                    <td className="px-4 py-2">
                      <Input
                        value={plu[it.code] ?? ""}
                        placeholder="—"
                        onChange={(e) => setPlu((p) => ({ ...p, [it.code]: e.target.value }))}
                        className="h-8 text-xs font-mono"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={qty}
                        onChange={(e) =>
                          updateCarton(it.code, { qtyPerCarton: Number(e.target.value) || 0 })
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={cprice}
                        onChange={(e) =>
                          updateCarton(it.code, { cartonPrice: Number(e.target.value) || 0 })
                        }
                        className="h-8 text-xs text-right"
                      />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    No items
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print area — hidden on screen, visible only when printing */}
      <PrintSheet
        items={selectedItems}
        cartons={cartons}
        defaultQty={defaultQtyPerCarton}
        showCarton={showCarton}
        plu={plu}
      />
    </div>
  );
}

function PrintSheet({
  items,
  cartons,
  defaultQty,
  showCarton,
  plu,
}: {
  items: Item[];
  cartons: Record<string, CartonSetting>;
  defaultQty: number;
  showCarton: boolean;
  plu: Record<string, string>;
}) {
  return (
    <div className="price-card-print-area hidden print:block">
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          html, body { background: white !important; }
          body * { visibility: hidden !important; }
          .price-card-print-area, .price-card-print-area * { visibility: visible !important; }
          .price-card-print-area { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
        }
        .pc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
        .pc-card { border: 0; padding: 3mm 3mm 4mm; break-inside: avoid; page-break-inside: avoid; font-family: Arial, Helvetica, sans-serif; color: #111; }
        .pc-desc { color: #1e3a8a; font-size: 10pt; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; margin-bottom: 4mm; min-height: 12mm; }
        .pc-price-row { display: flex; justify-content: flex-end; align-items: baseline; gap: 2mm; color: #dc2626; font-weight: 700; }
        .pc-price-main { font-size: 20pt; line-height: 1; }
        .pc-price-sub { color: #444; font-size: 8pt; font-weight: 500; }
        .pc-price-row.small .pc-price-main { font-size: 14pt; }
        .pc-barcode-wrap { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4mm; }
        .pc-barcode { flex: 1; }
        .pc-barcode svg { width: 100%; height: 18mm; }
        .pc-meta { text-align: right; font-size: 8pt; font-weight: 700; padding-left: 3mm; white-space: nowrap; }
      `}</style>

      <div className="price-card-print-root">
        <div className="pc-grid">
          {items.map((it) => {
            const c = cartons[it.code];
            const qty = c?.qtyPerCarton ?? defaultQty;
            const cprice = c?.cartonPrice ?? it.price * qty;
            return (
              <PriceCard
                key={it.code}
                item={it}
                qty={qty}
                cartonPrice={cprice}
                showCarton={showCarton}
                plu={plu[it.code]}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PriceCard({
  item,
  qty,
  cartonPrice,
  showCarton,
  plu,
}: {
  item: Item;
  qty: number;
  cartonPrice: number;
  showCarton: boolean;
  plu?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, item.code, {
        format: /^\d{12,13}$/.test(item.code)
          ? item.code.length === 13
            ? "EAN13"
            : "UPC"
          : "CODE128",
        displayValue: true,
        fontSize: 12,
        margin: 0,
        height: 50,
      });
    } catch {
      JsBarcode(ref.current, item.code || "0", {
        format: "CODE128",
        displayValue: true,
        fontSize: 12,
        margin: 0,
        height: 50,
      });
    }
  }, [item.code]);

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const formatRp = (n: number) =>
    "Rp. " + new Intl.NumberFormat("en-US").format(Math.round(n || 0));

  return (
    <div className="pc-card">
      <div className="pc-desc">{item.description}</div>
      <div className="pc-price-row">
        <span className="pc-price-main">{formatRp(item.price)}</span>
        <span className="pc-price-sub">/ {item.uom.toUpperCase()} / 1</span>
      </div>
      {showCarton && (
        <div className="pc-price-row small" style={{ marginTop: "1mm" }}>
          <span className="pc-price-main">{formatRp(cartonPrice)}</span>
          <span className="pc-price-sub">/ CRT / {qty}</span>
        </div>
      )}
      <div className="pc-barcode-wrap">
        <div className="pc-barcode">
          <svg ref={ref} />
        </div>
        <div className="pc-meta">
          <div>{plu || ""}</div>
          <div>
            {dd}/{mm}/{yyyy}
          </div>
        </div>
      </div>
    </div>
  );
}
