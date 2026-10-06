import type { TransactionLine } from "@/lib/db";

export type CustomerDisplayState = {
  lines: TransactionLine[];
  subtotal: number;
  tax: number;
  total: number;
  discount?: number;
  memberDiscount?: number;
  memberName?: string;
  memberCode?: string;
  pointsEarned?: number;
  status: "idle" | "selling" | "paid";
  paid?: number;
  change?: number;
  receiptNo?: string;
  updatedAt: number;
};

const CHANNEL = "amanpos-customer-display";
const STORAGE_KEY = "amanpos:cdisplay";

export function publishCustomerDisplay(state: CustomerDisplayState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(state);
    bc.close();
  } catch {
    /* ignore */
  }
}

export function subscribeCustomerDisplay(cb: (s: CustomerDisplayState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) cb(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = (e) => cb(e.data as CustomerDisplayState);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        cb(JSON.parse(e.newValue));
      } catch {
        /* ignore */
      }
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    bc.close();
    window.removeEventListener("storage", onStorage);
  };
}
