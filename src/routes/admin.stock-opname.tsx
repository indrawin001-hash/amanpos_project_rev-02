import { createFileRoute, useHydrated, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type StockCount, type StockCountLine } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { useEffect, useRef, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Database,
  FolderOpen,
  FileSpreadsheet,
  ScanBarcode,
  Plus,
  Download,
  Trash2,
  Lock,
  Unlock,
  ArrowLeft,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/admin/stock-opname")({
  head: () => ({
    meta: [
      { title: "Stock Opname — AmanPOS Admin" },
      {
        name: "description",
        content:
          "PDT-friendly stock opname: scan barcodes on handheld terminals, run parallel counts, and export results.",
      },
    ],
  }),
  component: () => (
    <AppShell role="admin">
      <Page />
    </AppShell>
  ),
});

export function Page() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="p-3" />;
  return <PageContent />;
}

function PageContent() {
  const [activeCountId, setActiveCountId] = useState<number | null>(null);

  if (activeCountId != null) {
    return <CountSession countId={activeCountId} onBack={() => setActiveCountId(null)} />;
  }
  return <Hub onOpen={(id) => setActiveCountId(id)} />;
}

/* -------------------- HUB -------------------- */

function Hub({ onOpen }: { onOpen: (id: number) => void }) {
  const counts = useLiveQuery(
    () => db.stockCounts.orderBy("createdAt").reverse().toArray(),
    [],
    [] as StockCount[],
  );
  const [newOpen, setNewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <header>
        <div className="text-xs sm:text-sm text-muted-foreground">Inventory</div>
        <h1 className="font-display text-xl sm:text-3xl font-bold">Stock Opname</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          PDT-ready: beberapa terminal bisa menghitung paralel per lokasi/PIC.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HubCard
          icon={<Database className="h-5 w-5" />}
          title="Master Data"
          description="Import & kelola data master"
          actionLabel="Kelola"
          to="/admin/items"
        />
        <HubCard
          icon={<FolderOpen className="h-5 w-5" />}
          title="Stock Count"
          description="Hitung stok per lokasi"
          actionLabel="Mulai Hitung"
          onClick={() => setNewOpen(true)}
        />
        <HubCard
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Export Data"
          description="Export hasil ke Excel"
          actionLabel="Export"
          onClick={() => setExportOpen(true)}
        />
      </div>

      <div className="rounded-xl border bg-card shadow-soft">
        <div className="p-3 sm:p-5 flex items-center justify-between gap-2">
          <div className="font-display font-bold text-sm sm:text-base">Sesi perhitungan</div>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Baru
          </Button>
        </div>

        <ul className="divide-y border-t">
          {counts.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              Belum ada sesi — buat satu untuk mulai menghitung.
            </li>
          )}
          {counts.map((c) => (
            <li key={c.id} className="p-3 sm:p-4 hover:bg-muted/30">
              <button onClick={() => onOpen(c.id!)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.location}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      PIC: {c.pic ?? "-"} · {format(new Date(c.createdAt), "dd MMM HH:mm")}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      c.status === "open"
                        ? "bg-accent/15 text-[color:var(--accent-foreground)]"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.status === "open" ? (
                      <Unlock className="h-3 w-3" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                    {c.status}
                  </span>
                </div>
              </button>
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => onOpen(c.id!)}>
                  Buka
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Hapus sesi "${c.name}" beserta semua barisnya?`)) return;
                    await db.stockCountLines.where("countId").equals(c.id!).delete();
                    await db.stockCounts.delete(c.id!);
                    toast.success("Sesi dihapus");
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <NewSessionDialog open={newOpen} onOpenChange={setNewOpen} onCreated={onOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} counts={counts} />
    </div>
  );
}

function HubCard({
  icon,
  title,
  description,
  actionLabel,
  to,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  to?: string;
  onClick?: () => void;
}) {
  const button = (
    <Button
      className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90"
      onClick={onClick}
    >
      {actionLabel}
    </Button>
  );
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft space-y-3">
      <div className="flex items-center gap-2 font-display font-bold text-sm">
        <span className="h-8 w-8 rounded-md bg-muted grid place-items-center">{icon}</span>
        {title}
      </div>
      <div className="text-xs text-muted-foreground">{description}</div>
      {to ? <Link to={to}>{button}</Link> : button}
    </div>
  );
}

/* -------------------- New session dialog -------------------- */

function NewSessionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const [pic, setPic] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setPic("");
      setLocation("");
      setDescription("");
    }
  }, [open]);

  async function create() {
    if (!pic.trim() || !location.trim()) {
      toast.error("Nama PIC dan Nama Lokasi wajib diisi");
      return;
    }
    const stamp = format(new Date(), "yyyy-MM-dd HH:mm");
    const id = await db.stockCounts.add({
      name: `${pic.trim()} — ${stamp}`,
      pic: pic.trim(),
      location: location.trim(),
      description: description.trim() || undefined,
      status: "open",
      createdAt: Date.now(),
    });
    toast.success("Lokasi berhasil dibuat");
    onOpenChange(false);
    onCreated(id as number);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Lokasi Baru</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nama PIC</Label>
            <Input
              value={pic}
              onChange={(e) => setPic(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="h-11"
            />
          </div>
          <div>
            <Label>Nama Lokasi</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Contoh: Gudang A - Rak 1"
              className="h-11"
            />
          </div>
          <div>
            <Label>Deskripsi (Opsional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi lokasi"
              className="h-11"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={create} className="bg-accent text-accent-foreground hover:bg-accent/90">
            Buat Lokasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Count session screen (PDT-optimized) -------------------- */

function CountSession({ countId, onBack }: { countId: number; onBack: () => void }) {
  const session = useLiveQuery(() => db.stockCounts.get(countId), [countId]);
  const lines = useLiveQuery(
    () => db.stockCountLines.where("countId").equals(countId).toArray(),
    [countId],
    [] as StockCountLine[],
  );

  const [code, setCode] = useState("");
  const [qty, setQty] = useState<number | "">(1);
  const [lastScanned, setLastScanned] = useState<StockCountLine | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const totals = useMemo(() => {
    let counted = 0;
    for (const l of lines) counted += l.countedQty;
    return { counted, itemsCounted: lines.length };
  }, [lines]);

  async function scan(e?: React.FormEvent) {
    e?.preventDefault();
    const c = code.trim();
    const q = qty === "" ? 1 : Number(qty);
    if (!c) return;
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Qty harus lebih dari 0");
      return;
    }
    if (session?.status === "closed") {
      toast.error("Sesi sudah ditutup");
      return;
    }
    const item = await db.items.where("code").equals(c).first();
    if (!item) {
      toast.error(`Kode "${c}" tidak ditemukan`);
      setCode("");
      inputRef.current?.focus();
      return;
    }
    const existing = await db.stockCountLines.where("[countId+code]").equals([countId, c]).first();
    let saved: StockCountLine;
    if (existing) {
      const newQty = existing.countedQty + q;
      await db.stockCountLines.update(existing.id!, {
        countedQty: newQty,
        scannedAt: Date.now(),
      });
      saved = { ...existing, countedQty: newQty, scannedAt: Date.now() };
    } else {
      const id = await db.stockCountLines.add({
        countId,
        code: item.code,
        description: item.description,
        uom: item.uom,
        systemStock: item.stock,
        countedQty: q,
        scannedAt: Date.now(),
      });
      saved = {
        id: id as number,
        countId,
        code: item.code,
        description: item.description,
        uom: item.uom,
        systemStock: item.stock,
        countedQty: q,
        scannedAt: Date.now(),
      };
    }
    setLastScanned(saved);
    setCode("");
    setQty(1);
    inputRef.current?.focus();
  }

  async function updateQty(line: StockCountLine, newQty: number) {
    if (!Number.isFinite(newQty) || newQty < 0) return;
    await db.stockCountLines.update(line.id!, { countedQty: newQty });
  }

  async function removeLine(line: StockCountLine) {
    await db.stockCountLines.delete(line.id!);
    if (lastScanned?.id === line.id) setLastScanned(null);
  }

  async function toggleStatus() {
    if (!session) return;
    if (session.status === "open") {
      await db.stockCounts.update(session.id!, { status: "closed", closedAt: Date.now() });
      toast.success("Sesi ditutup");
    } else {
      await db.stockCounts.update(session.id!, { status: "open" });
      toast.success("Sesi dibuka kembali");
    }
  }

  async function applyToStock() {
    if (!session) return;
    if (!confirm(`Update master stock ke qty hasil hitung untuk ${lines.length} item?`)) return;
    for (const l of lines) {
      const it = await db.items.where("code").equals(l.code).first();
      if (it) await db.items.update(it.id!, { stock: l.countedQty });
    }
    toast.success("Master stock diperbarui");
  }

  async function exportSession() {
    if (!session) return;
    await exportCountToExcel(session, lines);
  }

  if (!session) {
    return (
      <div className="p-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="mt-6 text-muted-foreground">Sesi tidak ditemukan.</div>
      </div>
    );
  }

  const closed = session.status === "closed";

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] max-w-3xl mx-auto text-[11px] sm:text-xs">
      {/* Sticky compact header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 h-7 px-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate">{session.location}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              PIC {session.pic ?? "-"} ·{" "}
              <span className={closed ? "" : "text-[color:var(--accent-foreground)]"}>
                {session.status}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] uppercase text-muted-foreground leading-none">Qty</div>
            <div className="font-display font-bold text-base leading-tight">{totals.counted}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] uppercase text-muted-foreground leading-none">Item</div>
            <div className="font-display font-bold text-base leading-tight">
              {totals.itemsCounted}
            </div>
          </div>
        </div>
      </div>

      {/* Scan bar */}
      {!closed && (
        <form onSubmit={scan} className="p-2 border-b bg-card">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ScanBarcode className="h-3 w-3 text-accent" />
            <div className="text-[10px] font-bold uppercase tracking-wide">Scan barcode</div>
          </div>
          <div className="grid grid-cols-[1fr_64px] gap-1.5">
            <Input
              ref={inputRef}
              autoFocus
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Scan / ketik kode + Enter"
              className="font-mono h-9 text-xs px-2"
            />
            <Input
              type="number"
              min={1}
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Qty"
              className="h-9 text-xs text-center px-1"
            />
          </div>
          <Button type="submit" className="w-full h-9 mt-1.5 text-xs">
            Tambah
          </Button>

          {lastScanned && (
            <div className="mt-2 rounded-md border bg-accent/10 p-2">
              <div className="text-[9px] uppercase text-muted-foreground">Terakhir discan</div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <div className="min-w-0">
                  <div className="font-mono text-[10px]">{lastScanned.code}</div>
                  <div className="text-[11px] truncate">{lastScanned.description}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] text-muted-foreground">Qty</div>
                  <div className="font-display font-bold text-base leading-none">
                    {lastScanned.countedQty}
                  </div>
                  <div className="text-[9px] text-muted-foreground">{lastScanned.uom}</div>
                </div>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Counted list (PDT cards) */}
      <div className="flex-1 overflow-auto">
        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Item terhitung
        </div>
        {lines.length === 0 && (
          <div className="px-4 py-8 text-center text-[11px] text-muted-foreground">
            Belum ada item — scan barcode untuk mulai.
          </div>
        )}
        <ul className="divide-y">
          {lines
            .slice()
            .sort((a, b) => b.scannedAt - a.scannedAt)
            .map((l) => (
              <li key={l.id} className="px-2 py-1.5 hover:bg-muted/30">
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[9px] text-muted-foreground">{l.code}</div>
                    <div className="text-[11px] leading-tight line-clamp-2">{l.description}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{l.uom}</div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={closed}
                      onClick={() => updateQty(l, Math.max(0, l.countedQty - 1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      value={l.countedQty}
                      disabled={closed}
                      onChange={(e) => updateQty(l, Number(e.target.value))}
                      className="h-7 w-12 text-center text-xs font-bold px-0.5"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={closed}
                      onClick={() => updateQty(l, l.countedQty + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    {!closed && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeLine(l)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
        </ul>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur border-t p-1.5 grid grid-cols-3 gap-1.5">
        <Button variant="outline" className="h-9 text-xs px-1" onClick={exportSession}>
          <Download className="h-3.5 w-3.5 mr-1" /> Excel
        </Button>
        <Button variant="outline" className="h-9 text-xs px-1" onClick={toggleStatus}>
          {closed ? (
            <>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Buka
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5 mr-1" /> Tutup
            </>
          )}
        </Button>
        <Button className="h-9 text-xs px-1" onClick={applyToStock} disabled={lines.length === 0}>
          Apply
        </Button>
      </div>
    </div>
  );
}

/* -------------------- Export dialog -------------------- */

function ExportDialog({
  open,
  onOpenChange,
  counts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  counts: StockCount[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mergeAll, setMergeAll] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(counts[0]?.id ?? null);
      setMergeAll(false);
    }
  }, [open, counts]);

  async function doExport() {
    if (mergeAll) {
      if (counts.length === 0) {
        toast.error("Tidak ada sesi");
        return;
      }
      const allLines: (StockCountLine & { _session: string; _pic: string; _location: string })[] =
        [];
      for (const s of counts) {
        const ls = await db.stockCountLines.where("countId").equals(s.id!).toArray();
        for (const l of ls) {
          allLines.push({
            ...l,
            _session: s.name,
            _pic: s.pic ?? "",
            _location: s.location,
          });
        }
      }
      await exportMergedToExcel(allLines);
      onOpenChange(false);
      return;
    }
    if (selected == null) {
      toast.error("Pilih sesi untuk export");
      return;
    }
    const session = counts.find((c) => c.id === selected);
    if (!session) return;
    const lines = await db.stockCountLines.where("countId").equals(selected).toArray();
    await exportCountToExcel(session, lines);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export hasil stock opname</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mergeAll}
              onChange={(e) => setMergeAll(e.target.checked)}
            />
            Gabungkan semua sesi (semua PDT) dalam satu file
          </label>

          {!mergeAll && (
            <>
              <Label>Sesi</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm h-11"
                value={selected ?? ""}
                onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : null)}
              >
                {counts.length === 0 && <option value="">Tidak ada sesi</option>}
                {counts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.location} — {c.pic ?? "-"} ({c.status})
                  </option>
                ))}
              </select>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Mode gabung berguna saat beberapa PDT menghitung paralel — hasil dikonsolidasi per
            lokasi/PIC.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={doExport} disabled={counts.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function itemCodeMap(codes: string[]) {
  const map = new Map<string, string>();
  const uniq = Array.from(new Set(codes));
  const found = await db.items.where("code").anyOf(uniq).toArray();
  for (const it of found) map.set(it.code, it.itemCode ?? "");
  return map;
}

async function exportCountToExcel(session: StockCount, lines: StockCountLine[]) {
  const codes = await itemCodeMap(lines.map((l) => l.code));
  const rows = lines.map((l) => ({
    item_code: codes.get(l.code) ?? "",
    code: l.code,
    description: l.description,
    uom: l.uom,
    system_stock: l.systemStock,
    counted_qty: l.countedQty,
    variance: l.countedQty - l.systemStock,
    scanned_at: format(new Date(l.scannedAt), "yyyy-MM-dd HH:mm:ss"),
  }));
  const totals = {
    item_code: "",
    code: "",
    description: "TOTAL",
    uom: "",
    system_stock: lines.reduce((s, l) => s + l.systemStock, 0),
    counted_qty: lines.reduce((s, l) => s + l.countedQty, 0),
    variance: lines.reduce((s, l) => s + (l.countedQty - l.systemStock), 0),
    scanned_at: "",
  };

  const meta = [
    ["Session", session.name],
    ["PIC", session.pic ?? "-"],
    ["Location", session.location],
    ["Status", session.status],
    ["Created", format(new Date(session.createdAt), "yyyy-MM-dd HH:mm:ss")],
    ["Closed", session.closedAt ? format(new Date(session.closedAt), "yyyy-MM-dd HH:mm:ss") : "-"],
    ["Items counted", lines.length],
  ];

  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet([...rows, totals]);
  const wsMeta = XLSX.utils.aoa_to_sheet(meta);
  XLSX.utils.book_append_sheet(wb, wsData, "Stock Opname");
  XLSX.utils.book_append_sheet(wb, wsMeta, "Session Info");

  const safe = session.name.replace(/[^a-z0-9-_]+/gi, "_");
  XLSX.writeFile(wb, `stock-opname-${safe}.xlsx`);
  toast.success("File Excel diunduh");
}

async function exportMergedToExcel(
  lines: (StockCountLine & { _session: string; _pic: string; _location: string })[],
) {
  const codes = await itemCodeMap(lines.map((l) => l.code));
  // Detail sheet
  const detail = lines.map((l) => ({
    session: l._session,
    pic: l._pic,
    location: l._location,
    item_code: codes.get(l.code) ?? "",
    code: l.code,
    description: l.description,
    uom: l.uom,
    system_stock: l.systemStock,
    counted_qty: l.countedQty,
    variance: l.countedQty - l.systemStock,
    scanned_at: format(new Date(l.scannedAt), "yyyy-MM-dd HH:mm:ss"),
  }));

  // Consolidated by code
  const byCode = new Map<
    string,
    {
      item_code: string;
      code: string;
      description: string;
      uom: string;
      system_stock: number;
      counted_qty: number;
    }
  >();
  for (const l of lines) {
    const cur = byCode.get(l.code);
    if (cur) {
      cur.counted_qty += l.countedQty;
    } else {
      byCode.set(l.code, {
        item_code: codes.get(l.code) ?? "",
        code: l.code,
        description: l.description,
        uom: l.uom,
        system_stock: l.systemStock,
        counted_qty: l.countedQty,
      });
    }
  }
  const consolidated = Array.from(byCode.values()).map((r) => ({
    ...r,
    variance: r.counted_qty - r.system_stock,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(consolidated), "Consolidated");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Detail per PDT");
  XLSX.writeFile(wb, `stock-opname-merged-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
  toast.success("File gabungan diunduh");
}
