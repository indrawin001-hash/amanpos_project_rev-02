import Dexie, { type Table } from "dexie";

export interface Item {
  id?: number;
  code: string;
  itemCode?: string;
  description: string;
  price: number;
  /** Purchase price (cost) used for margin calculation */
  cost?: number;
  uom: string;
  stock: number;
}

export interface User {
  id?: number;
  username: string;
  password: string;
  role: "admin" | "cashier";
  name: string;
}

export interface TransactionLine {
  code: string;
  description: string;
  price: number;
  uom: string;
  quantity: number;
  total: number;
}

export type PaymentMethod = "cash" | "qris";

export interface Member {
  id?: number;
  code: string; // member code / card number
  name: string;
  phone?: string;
  email?: string;
  points: number; // current balance
  totalSpent: number; // lifetime spend
  createdAt: number;
}

export const POINTS_PER_RUPIAH = 100_000; // spend Rp 100.000 → 1 point
export const RUPIAH_PER_POINT = 100; // 1 point redeems Rp 100
export const MEMBER_DISCOUNT_PERCENT = 5; // 5% discount for members
export const MEMBER_POINTS_PER_TRANSACTION = 2.5; // 2.5 points per transaction for members

export function pointsFromSpend(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.floor(amount / POINTS_PER_RUPIAH);
}

export interface Transaction {
  id?: number;
  receiptNo: string;
  cashier: string;
  lines: TransactionLine[];
  subtotal: number;
  tax: number;
  discount?: number; // total discount (member discount + points redemption)
  memberDiscount?: number; // specific 5% member discount amount
  total: number;
  paid: number;
  change: number;
  paymentMethod?: PaymentMethod;
  qrisReference?: string;
  // Membership
  memberId?: number;
  memberCode?: string;
  memberName?: string;
  pointsEarned?: number;
  pointsRedeemed?: number;
  createdAt: number;
}

export interface StockCount {
  id?: number;
  name: string; // kept for backward compat; mirrors PIC name
  pic?: string; // Nama PIC
  location: string; // Nama Lokasi
  description?: string; // Deskripsi (opsional)
  status: "open" | "closed";
  createdAt: number;
  closedAt?: number;
}

export interface StockCountLine {
  id?: number;
  countId: number;
  code: string;
  description: string;
  uom: string;
  systemStock: number;
  countedQty: number;
  scannedAt: number;
}

class AmanPOSDB extends Dexie {
  items!: Table<Item, number>;
  users!: Table<User, number>;
  transactions!: Table<Transaction, number>;
  stockCounts!: Table<StockCount, number>;
  stockCountLines!: Table<StockCountLine, number>;
  members!: Table<Member, number>;

  constructor() {
    super("amanpos");
    this.version(1).stores({
      items: "++id, &code, description",
      users: "++id, &username",
      transactions: "++id, receiptNo, createdAt, cashier",
    });
    this.version(2).stores({
      items: "++id, &code, description",
      users: "++id, &username",
      transactions: "++id, receiptNo, createdAt, cashier",
      stockCounts: "++id, status, createdAt, location",
      stockCountLines: "++id, countId, code, [countId+code]",
    });
    this.version(3).stores({
      items: "++id, &code, description",
      users: "++id, &username",
      transactions: "++id, receiptNo, createdAt, cashier, memberId",
      stockCounts: "++id, status, createdAt, location",
      stockCountLines: "++id, countId, code, [countId+code]",
      members: "++id, &code, name, phone",
    });
    this.version(4).stores({
      items: "++id, &code, itemCode, description",
      users: "++id, &username",
      transactions: "++id, receiptNo, createdAt, cashier, memberId",
      stockCounts: "++id, status, createdAt, location",
      stockCountLines: "++id, countId, code, [countId+code]",
      members: "++id, &code, name, phone",
    });
  }
}

let _db: AmanPOSDB | null = null;
export function getDb(): AmanPOSDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("Database is only available in the browser");
  }
  if (!_db) _db = new AmanPOSDB();
  return _db;
}

export const db = new Proxy({} as AmanPOSDB, {
  get(_t, prop) {
    const instance = getDb() as unknown as Record<string | symbol, unknown>;
    const v = instance[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(instance) : v;
  },
});

export async function seedIfEmpty() {
  if (typeof indexedDB === "undefined") return;
  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.bulkAdd([
      { username: "admin", password: "admin123", role: "admin", name: "Administrator" },
      { username: "cashier", password: "cashier123", role: "cashier", name: "Default Cashier" },
    ]);
  }
  const itemCount = await db.items.count();
  if (itemCount === 0) {
    await db.items.bulkAdd([
      {
        code: "8991002101234",
        description: "Mineral Water 600ml",
        price: 3500,
        uom: "pcs",
        stock: 120,
      },
      {
        code: "8991002105678",
        description: "Instant Noodles",
        price: 3200,
        uom: "pcs",
        stock: 200,
      },
      { code: "8991002109012", description: "Coffee Sachet", price: 1500, uom: "pcs", stock: 300 },
      { code: "8991002103456", description: "Snack Chips", price: 7500, uom: "pcs", stock: 80 },
      { code: "8991002107890", description: "Soft Drink Can", price: 6500, uom: "pcs", stock: 90 },
      {
        code: "BOX-RICE-5KG",
        description: "Rice 5kg Premium",
        price: 78000,
        uom: "box",
        stock: 25,
      },
    ]);
  }
}
