import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Item } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { useEffect, useRef, useState } from "react";
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
  Upload,
  Plus,
  Pencil,
  Trash2,
  Download,
  Search,
  CloudUpload,
  RefreshCw,
} from "lucide-react";
import {
  pullItems,
  pushItems,
  pushAllLocalItems,
  deleteCloudItem,
  clearAllItems,
  cloudItemCount,
  isOnline,
} from "@/lib/items-sync";
import { currency } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/items")({
  head: () => ({
    meta: [
      { title: "Items — AmanPOS Admin" },
      {
        name: "description",
        content: "Manage AmanPOS item catalog. Import from Excel, add or edit items.",
      },
    ],
  }),
  component: () => (
    <AppShell role="admin">
      <ItemsPage />
    </AppShell>
  ),
});

function ItemsPage() {
  const hydrated = useHydrated();

  if (!hydrated) {
    return <div className="p-6 lg:p-8" />;
  }

  return <ItemsPageContent />;
}

function ItemsPageContent() {
  const items = useLiveQuery(() => db.items.orderBy("description").toArray(), [], []);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [cloudCount, setCloudCount] = useState<number | null>(null);

  async function refreshCloudCount() {
    if (!isOnline()) {
      setCloudCount(null);
      return;
    }
    try {
      setCloudCount(await cloudItemCount());
    } catch {
      setCloudCount(null);
    }
  }

  // On open: adopt the shared catalog if it already has items.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isOnline()) return;
      try {
        const remote = await cloudItemCount();
        if (cancelled) return;
        setCloudCount(remote);
        if (remote > 0) {
          setSyncing(true);
          const n = await pullItems();
          if (!cancelled) toast.success(`Synced ${n} items from the shared catalog`);
        }
      } catch {
        /* offline or unreachable — keep local data */
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function syncNow() {
    if (!isOnline()) {
      toast.error("You're offline — showing the last saved copy");
      return;
    }
    setSyncing(true);
    try {
      const n = await pullItems();
      await refreshCloudCount();
      toast.success(`Synced ${n} items`);
    } catch {
      toast.error("Sync failed — check your connection");
    } finally {
      setSyncing(false);
    }
  }

  async function uploadAll() {
    if (!isOnline()) {
      toast.error("You're offline — connect to upload");
      return;
    }
    if (
      !confirm(
        `Upload all ${items.length} items on this device to the shared catalog? Existing shared items with the same barcode will be updated.`,
      )
    )
      return;
    setSyncing(true);
    try {
      const n = await pushAllLocalItems();
      await refreshCloudCount();
      toast.success(`Uploaded ${n} items — now available on every device`);
    } catch {
      toast.error("Upload failed — check your connection");
    } finally {
      setSyncing(false);
    }
  }

  async function clearAll() {
    if (!isOnline()) {
      toast.error("You're offline — connect to clear the shared catalog");
      return;
    }
    if (
      !confirm(`Delete ALL items from the shared catalog and this device? This cannot be undone.`)
    )
      return;
    if (
      !confirm(
        `Please confirm once more: every item will be removed so you can re-upload a fresh list.`,
      )
    )
      return;
    setSyncing(true);
    try {
      await clearAllItems();
      await refreshCloudCount();
      toast.success("All items cleared — you can now import and upload a fresh list");
    } catch {
      toast.error("Couldn't clear the items — check your connection");
    } finally {
      setSyncing(false);
    }
  }

  async function syncUp(changed: Item[]) {
    if (!isOnline()) {
      toast.message("Saved on this device — will need uploading when back online");
      return;
    }
    try {
      await pushItems(changed);
      await refreshCloudCount();
    } catch {
      toast.error("Saved locally, but couldn't update the shared catalog");
    }
  }

  const filtered = items.filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      i.code.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      (i.itemCode ?? "").toLowerCase().includes(q)
    );
  });

  function openNew() {
    setEditing({
      code: "",
      itemCode: "",
      description: "",
      price: 0,
      cost: 0,
      uom: "pcs",
      stock: 0,
    });
    setOpen(true);
  }
  function openEdit(it: Item) {
    setEditing(it);
    setOpen(true);
  }

  async function save() {
    if (!editing) return;
    if (!editing.code.trim() || !editing.description.trim()) {
      toast.error("Code and description required");
      return;
    }
    try {
      if (editing.id != null) {
        await db.items.update(editing.id, editing);
        toast.success("Item updated");
      } else {
        await db.items.add(editing);
        toast.success("Item added");
      }
      setOpen(false);
      await syncUp([editing]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(it: Item) {
    if (!confirm(`Delete "${it.description}"?`)) return;
    if (it.id != null) await db.items.delete(it.id);
    toast.success("Item deleted");
    if (isOnline()) {
      try {
        await deleteCloudItem(it.code);
        await refreshCloudCount();
      } catch {
        toast.error("Removed here, but couldn't update the shared catalog");
      }
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      let added = 0,
        updated = 0,
        skipped = 0;

      // Normalise headers so "Item Code", "ITEM_CODE", "Kode Barang" etc. all match
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const A = {
        code: ["code", "barcode", "barcode0", "barcodeutama", "kodebarcode", "ean"],
        itemCode: [
          "itemcode",
          "itemno",
          "itemnumber",
          "kodeitem",
          "kodebarang",
          "sku",
          "plu",
          "partnumber",
          "productcode",
        ],
        description: [
          "description",
          "itemdescription",
          "name",
          "itemname",
          "deskripsi",
          "namabarang",
        ],
        newCode: ["newcode", "newbarcode", "barcodebaru"],
        price: ["price", "hargajual0", "hargajual", "sellingprice", "unitprice"],
        cost: ["purchaseprice", "cost", "hargabeli", "buyprice", "costprice"],
        uom: ["uom", "unit", "salesunitofmeasure", "satuan", "unitofmeasure"],
        stock: ["stock", "qty", "quantity", "invonhand", "onhand", "stok"],
      };
      const headerKeys = Object.keys(rows[0] ?? {});
      const headerMap = new Map(headerKeys.map((k) => [norm(k), k]));
      const colOf = (aliases: string[]) => {
        for (const a of aliases) {
          const k = headerMap.get(a);
          if (k) return k;
        }
        return undefined;
      };
      const cols = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, colOf(v)])) as Record<
        keyof typeof A,
        string | undefined
      >;

      if (!cols.code && !cols.itemCode) {
        toast.error(
          `No barcode or item code column found. Columns seen: ${headerKeys.join(", ") || "none"}`,
        );
        return;
      }

      for (const r of rows) {
        const val = (c?: string) => (c ? r[c] : undefined);
        const str = (c?: string) => String(val(c) ?? "").trim();
        const filled = (c?: string) => c != null && String(r[c] ?? "").trim() !== "";

        const code = str(cols.code);
        const itemCode = str(cols.itemCode);
        const description = str(cols.description);
        const newCode = str(cols.newCode);
        const priceRaw = val(cols.price);
        const costRaw = val(cols.cost);
        const uomRaw = val(cols.uom);
        const stockRaw = val(cols.stock);

        // Lookup existing by barcode first, then by item code
        let existing = code ? await db.items.where("code").equals(code).first() : undefined;
        if (!existing && itemCode)
          existing = await db.items.where("itemCode").equals(itemCode).first();
        if (!existing && !code) {
          skipped++;
          continue;
        }

        if (existing) {
          const patch: Partial<Item> = {};
          if (filled(cols.description)) patch.description = description;
          if (filled(cols.price)) patch.price = Number(priceRaw) || 0;
          if (filled(cols.cost)) patch.cost = Number(costRaw) || 0;
          if (filled(cols.uom)) patch.uom = String(uomRaw).trim() || "pcs";
          if (filled(cols.stock)) patch.stock = Number(stockRaw) || 0;
          if (itemCode && itemCode !== existing.itemCode) patch.itemCode = itemCode;
          if (newCode && newCode !== existing.code) {
            const clash = await db.items.where("code").equals(newCode).first();
            if (clash) {
              skipped++;
              continue;
            }
            patch.code = newCode;
          }
          if (Object.keys(patch).length === 0) {
            skipped++;
            continue;
          }
          await db.items.update(existing.id!, patch);
          updated++;
        } else {
          if (!description) {
            skipped++;
            continue;
          }
          await db.items.add({
            code,
            itemCode: itemCode || undefined,
            description,
            price: Number(priceRaw ?? 0) || 0,
            cost: Number(costRaw ?? 0) || 0,
            uom: String(uomRaw ?? "pcs").trim() || "pcs",
            stock: Number(stockRaw ?? 0) || 0,
          });
          added++;
        }
      }
      toast.success(
        `Imported — ${added} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}${cols.itemCode ? "" : " (no item code column detected)"}`,
      );
      if ((added || updated) && isOnline()) {
        setSyncing(true);
        try {
          const n = await pushAllLocalItems();
          await refreshCloudCount();
          toast.success(`Shared catalog updated — ${n} items available on all devices`);
        } catch {
          toast.error("Imported here, but couldn't update the shared catalog");
        } finally {
          setSyncing(false);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Import failed — check the file format");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      {
        code: "8991002101234",
        item_code: "1000001",
        description: "Sample Item A",
        price: 15000,
        purchase_price: 11000,
        uom: "pcs",
        stock: 50,
        new_code: "",
      },
      {
        code: "BOX-001",
        item_code: "1000002",
        description: "Sample Item B",
        price: 75000,
        purchase_price: 54000,
        uom: "box",
        stock: 10,
        new_code: "",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, "amanpos-items-template.xlsx");
  }

  function exportItems() {
    const rows = filtered.map((it) => ({
      item_code: it.itemCode ?? "",
      code: it.code,
      description: it.description,
      uom: it.uom,
      price: it.price,
      purchase_price: it.cost ?? 0,
      stock: it.stock,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    XLSX.writeFile(wb, `amanpos-items-${stamp}.xlsx`);
    toast.success(`Exported ${rows.length} item${rows.length === 1 ? "" : "s"}`);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Items</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shared across all devices.{" "}
            {cloudCount === null
              ? "Offline — showing the copy saved on this device."
              : `${cloudCount.toLocaleString()} items in the shared catalog.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={syncNow} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync
          </Button>
          <Button variant="outline" onClick={uploadAll} disabled={syncing || items.length === 0}>
            <CloudUpload className="h-4 w-4 mr-1" /> Upload to shared
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-1" /> Template
          </Button>
          <Button variant="outline" onClick={exportItems} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Import Excel
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onImportFile}
          />
          <Button
            variant="outline"
            className="text-destructive"
            onClick={clearAll}
            disabled={syncing}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Clear all
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> New item
          </Button>
        </div>
      </header>

      <p className="text-xs text-muted-foreground -mt-2">
        Import tip: supports columns <span className="font-mono">item_code</span> (or "Item Code"),{" "}
        <span className="font-mono">code</span>/"Barcode 0",{" "}
        <span className="font-mono">description</span>, <span className="font-mono">price</span>
        /"Harga Jual 0", <span className="font-mono">purchase_price</span>/"Harga Beli",{" "}
        <span className="font-mono">uom</span>/"Sales Unit of Measure",{" "}
        <span className="font-mono">stock</span>/"Inv On Hand". Existing rows update in place — fill
        only the columns you want to change. Use <span className="font-mono">new_code</span> to
        replace the barcode.
      </p>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by item code, barcode or description…"
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-5 py-3">Item Code</th>
                <th className="text-left px-5 py-3">Barcode</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-left px-5 py-3">UoM</th>
                <th className="text-right px-5 py-3">Purchase Price</th>
                <th className="text-right px-5 py-3">Price</th>
                <th className="text-right px-5 py-3">Stock</th>
                <th className="px-5 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-t hover:bg-muted/30">
                  <td className="px-5 py-3 font-mono text-xs">{it.itemCode ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{it.code}</td>
                  <td className="px-5 py-3 font-medium">{it.description}</td>
                  <td className="px-5 py-3">{it.uom}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">
                    {it.cost ? currency(it.cost) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">{currency(it.price)}</td>
                  <td className="px-5 py-3 text-right">{it.stock}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(it)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(it)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id != null ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Item code</Label>
                  <Input
                    value={editing.itemCode ?? ""}
                    onChange={(e) => setEditing({ ...editing, itemCode: e.target.value })}
                    className="font-mono"
                    placeholder="e.g. 1000001"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Barcode</Label>
                  <Input
                    value={editing.code}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Purchase price</Label>
                  <Input
                    type="number"
                    value={editing.cost ?? 0}
                    onChange={(e) => setEditing({ ...editing, cost: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    value={editing.price}
                    onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>UoM</Label>
                  <Input
                    value={editing.uom}
                    onChange={(e) => setEditing({ ...editing, uom: e.target.value })}
                    placeholder="pcs, box…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Stock</Label>
                  <Input
                    type="number"
                    value={editing.stock}
                    onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
