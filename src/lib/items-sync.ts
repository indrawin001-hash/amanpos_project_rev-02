import { supabase } from "@/integrations/supabase/client";
import { db, type Item } from "@/lib/db";

export interface CloudItemRow {
  code: string;
  item_code: string | null;
  description: string;
  price: number;
  purchase_price?: number;
  uom: string;
  stock: number;
}

const PAGE = 1000;

function toLocal(r: CloudItemRow): Omit<Item, "id"> {
  return {
    code: r.code,
    itemCode: r.item_code ?? undefined,
    description: r.description ?? "",
    price: Number(r.price) || 0,
    cost: Number(r.purchase_price) || 0,
    uom: r.uom || "pcs",
    stock: Number(r.stock) || 0,
  };
}

function toCloud(i: Item): CloudItemRow {
  return {
    code: i.code,
    item_code: i.itemCode ?? null,
    description: i.description ?? "",
    price: Number(i.price) || 0,
    purchase_price: Number(i.cost) || 0,
    uom: i.uom || "pcs",
    stock: Number(i.stock) || 0,
  };
}

export async function cloudItemCount(): Promise<number> {
  const { count, error } = await supabase
    .from("items")
    .select("code", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Fetch every item from the shared catalog. */
export async function fetchCloudItems(): Promise<CloudItemRow[]> {
  const all: CloudItemRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("items")
      .select("code,item_code,description,price,purchase_price,uom,stock")
      .order("code")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as CloudItemRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Replace the on-device catalog with the shared one. Returns item count. */
export async function pullItems(): Promise<number> {
  const rows = await fetchCloudItems();
  await db.transaction("rw", db.items, async () => {
    await db.items.clear();
    if (rows.length) await db.items.bulkAdd(rows.map(toLocal) as Item[]);
  });
  return rows.length;
}

/** Push the given items to the shared catalog (insert or update by barcode). */
export async function pushItems(items: Item[]): Promise<number> {
  const rows = items.filter((i) => i.code?.trim()).map(toCloud);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from("items").upsert(chunk, { onConflict: "code" });
    if (error) throw error;
  }
  return rows.length;
}

/** Upload everything currently on this device to the shared catalog. */
export async function pushAllLocalItems(): Promise<number> {
  const local = await db.items.toArray();
  return pushItems(local);
}

export async function deleteCloudItem(code: string): Promise<void> {
  const { error } = await supabase.from("items").delete().eq("code", code);
  if (error) throw error;
}

/** Remove every item from the shared catalog and this device. */
export async function clearAllItems(): Promise<void> {
  const { error } = await supabase.from("items").delete().neq("code", "");
  if (error) throw error;
  await db.items.clear();
}

/** Remove every item stored on this device only. */
export async function clearLocalItems(): Promise<void> {
  await db.items.clear();
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * Best-effort background refresh of the device catalog from the shared one.
 * Silently does nothing when offline or when the shared catalog is empty.
 */
export async function syncItemsQuietly(): Promise<number | null> {
  if (!isOnline()) return null;
  try {
    const count = await cloudItemCount();
    if (count === 0) return null;
    return await pullItems();
  } catch {
    return null;
  }
}
