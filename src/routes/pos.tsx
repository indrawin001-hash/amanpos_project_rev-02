import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  type Item,
  type TransactionLine,
  type Transaction,
  type PaymentMethod,
  type Member,
  pointsFromSpend,
  RUPIAH_PER_POINT,
} from "@/lib/db";
import { printTransactionReceipt } from "@/lib/print-receipt";
import { AppShell, BRAND_LOGO_URL } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
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
import { currency, number, genReceiptNo } from "@/lib/format";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ScanLine,
  ShoppingCart,
  Receipt,
  Printer,
  X,
  Monitor,
  Banknote,
  QrCode,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { publishCustomerDisplay } from "@/lib/customer-display";
import QRCode from "qrcode";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "Cashier — AmanPOS" },
      {
        name: "description",
        content: "AmanPOS cashier point of sale interface with barcode scan and item picker.",
      },
    ],
  }),
  component: () => (
    <AppShell role="cashier">
      <POSPage />
    </AppShell>
  ),
});

function POSPage() {
  const hydrated = useHydrated();

  if (!hydrated) {
    return <div className="h-[calc(100vh-3.5rem)] md:h-screen" />;
  }

  return <POSPageContent />;
}

function POSPageContent() {
  const { user } = useAuth();
  const items = useLiveQuery(() => db.items.orderBy("description").toArray(), [], []);
  const members = useLiveQuery(() => db.members.orderBy("name").toArray(), [], []);

  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<TransactionLine[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [newMemberOpen, setNewMemberOpen] = useState(false);
  const [newMember, setNewMember] = useState({ code: "", name: "", phone: "" });
  const [member, setMember] = useState<Member | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [reprintOpen, setReprintOpen] = useState(false);
  const [reprintSearch, setReprintSearch] = useState("");
  const recentTx = useLiveQuery(
    () => db.transactions.orderBy("createdAt").reverse().limit(50).toArray(),
    [],
    [] as Transaction[],
  );
  const filteredRecent = useMemo(() => {
    const q = reprintSearch.trim().toLowerCase();
    if (!q) return recentTx;
    return recentTx.filter(
      (t) =>
        t.receiptNo.toLowerCase().includes(q) ||
        (t.memberName ?? "").toLowerCase().includes(q) ||
        (t.memberCode ?? "").toLowerCase().includes(q),
    );
  }, [recentTx, reprintSearch]);
  const [paid, setPaid] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrisRef, setQrisRef] = useState<string>("");
  const [receipt, setReceipt] = useState<null | {
    receiptNo: string;
    lines: TransactionLine[];
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    paid: number;
    change: number;
    createdAt: number;
    cashier: string;
    paymentMethod: PaymentMethod;
    qrisReference?: string;
    memberCode?: string;
    memberName?: string;
    pointsEarned?: number;
    pointsRedeemed?: number;
  }>(null);

  const scanRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items ?? [];
    return (items ?? []).filter(
      (i) => i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [items, search]);

  // O(1) barcode lookup so scans resolve instantly even with large catalogs
  const codeIndex = useMemo(() => {
    const m = new Map<string, Item>();
    for (const i of items ?? []) m.set(i.code.trim().toLowerCase(), i);
    return m;
  }, [items]);

  async function addByCode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    let it = codeIndex.get(trimmed.toLowerCase());
    if (!it) {
      // fallback to an indexed DB lookup (catalog may still be loading)
      try {
        it = await db.items.where("code").equals(trimmed).first();
      } catch {
        /* ignore */
      }
    }
    if (!it) {
      toast.error(`Item "${trimmed}" not found`);
      return;
    }
    addItem(it);
  }

  function addItem(it: Item) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.code === it.code);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          quantity: copy[idx].quantity + 1,
          total: (copy[idx].quantity + 1) * copy[idx].price,
        };
        return copy;
      }
      return [
        ...prev,
        {
          code: it.code,
          description: it.description,
          price: it.price,
          uom: it.uom,
          quantity: 1,
          total: it.price,
        },
      ];
    });
  }

  function setQty(code: string, qty: number) {
    setLines((prev) =>
      prev
        .map((l) =>
          l.code === code
            ? { ...l, quantity: Math.max(0, qty), total: Math.max(0, qty) * l.price }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(code: string) {
    setLines((prev) => prev.filter((l) => l.code !== code));
  }

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const tax = 0;
  const maxRedeemable = member
    ? Math.min(member.points, Math.floor(subtotal / RUPIAH_PER_POINT))
    : 0;
  const redeem = Math.min(Math.max(0, Math.floor(redeemPoints) || 0), maxRedeemable);
  const discount = redeem * RUPIAH_PER_POINT;
  const total = Math.max(0, subtotal + tax - discount);
  const earnPoints = member ? pointsFromSpend(total) : 0;

  // Reset redemption when member changes or cart empties
  useEffect(() => {
    setRedeemPoints(0);
  }, [member?.id, lines.length === 0]);

  // Publish current cart to the customer display (second monitor)
  useEffect(() => {
    publishCustomerDisplay({
      lines,
      subtotal,
      tax,
      total,
      status: lines.length === 0 ? "idle" : "selling",
      updatedAt: Date.now(),
    });
  }, [lines, subtotal, total]);

  function openCustomerDisplay() {
    const w = window.open(
      "/customer-display",
      "amanpos_customer_display",
      "popup=yes,width=1024,height=768",
    );
    if (!w)
      toast.error(
        "Please allow pop-ups, then click again. Drag the new window to your second monitor.",
      );
    else
      toast.success(
        "Customer display opened. Drag it to the second monitor, then press F11 for fullscreen.",
      );
  }

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const list = members ?? [];
    if (!q) return list;
    return list.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.phone ?? "").toLowerCase().includes(q),
    );
  }, [members, memberSearch]);

  async function createMember() {
    const code = newMember.code.trim() || `M${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const name = newMember.name.trim();
    if (!name) {
      toast.error("Member name required");
      return;
    }
    try {
      const id = await db.members.add({
        code,
        name,
        phone: newMember.phone.trim(),
        email: "",
        points: 0,
        totalSpent: 0,
        createdAt: Date.now(),
      });
      const m = await db.members.get(id);
      if (m) setMember(m);
      setNewMember({ code: "", name: "", phone: "" });
      setNewMemberOpen(false);
      setMemberPickerOpen(false);
      toast.success(`Member ${name} added`);
    } catch {
      toast.error("Member code already exists");
    }
  }

  function openPayment() {
    if (lines.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setPaymentMethod("cash");
    setPaid(String(total));
    setQrDataUrl("");
    setQrisRef("");
    setPaymentOpen(true);
  }

  // Generate a QRIS-style payload QR whenever QRIS is selected / total changes
  useEffect(() => {
    if (!paymentOpen || paymentMethod !== "qris") return;
    const ref = `QRIS-${Date.now().toString(36).toUpperCase()}`;
    setQrisRef(ref);
    const payload = `QRIS|MERCHANT:AMANMART|AMOUNT:${total}|REF:${ref}`;
    QRCode.toDataURL(payload, { width: 280, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [paymentOpen, paymentMethod, total]);

  async function completeSale() {
    let paidNum = total;
    let change = 0;
    if (paymentMethod === "cash") {
      paidNum = Number(paid);
      if (!Number.isFinite(paidNum) || paidNum < total) {
        toast.error("Insufficient payment");
        return;
      }
      change = paidNum - total;
    }
    const receiptNo = genReceiptNo();
    const tx = {
      receiptNo,
      cashier: user!.username,
      lines,
      subtotal,
      tax,
      discount,
      total,
      paid: paidNum,
      change,
      paymentMethod,
      qrisReference: paymentMethod === "qris" ? qrisRef : undefined,
      memberId: member?.id,
      memberCode: member?.code,
      memberName: member?.name,
      pointsEarned: earnPoints,
      pointsRedeemed: redeem,
      createdAt: Date.now(),
    };
    await db.transactions.add(tx);
    // decrement stock
    await db.transaction("rw", db.items, async () => {
      for (const l of lines) {
        const it = await db.items.where("code").equals(l.code).first();
        if (it && it.id != null)
          await db.items.update(it.id, { stock: Math.max(0, it.stock - l.quantity) });
      }
    });
    // Update member points / lifetime spend
    if (member?.id != null) {
      const newPoints = Math.max(0, (member.points || 0) - redeem + earnPoints);
      const newSpent = (member.totalSpent || 0) + total;
      await db.members.update(member.id, { points: newPoints, totalSpent: newSpent });
    }
    // Push paid state to customer display
    publishCustomerDisplay({
      lines,
      subtotal,
      tax,
      total,
      paid: paidNum,
      change,
      receiptNo,
      status: "paid",
      updatedAt: Date.now(),
    });
    setReceipt(tx);
    setLines([]);
    setMember(null);
    setRedeemPoints(0);
    setPaymentOpen(false);
    setPaid("");
    scanRef.current?.focus();
    toast.success(`Sale completed via ${paymentMethod.toUpperCase()} — ${currency(total)}`);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen max-w-3xl mx-auto w-full">
      {/* Scan + pick controls */}
      <div className="p-4 space-y-3 border-b bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const el = scanRef.current;
            const code = el?.value ?? "";
            if (el) el.value = "";
            void addByCode(code);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={scanRef}
              defaultValue=""
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Scan barcode or type item code & press Enter"
              className="pl-9 h-12 font-mono text-base"
            />
          </div>

          <Button type="submit" className="h-12 px-6">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 px-4"
            onClick={() => setPickerOpen(true)}
          >
            <Search className="h-4 w-4 mr-1" /> Pick item
          </Button>
        </form>
        <div className="flex justify-between items-center gap-2">
          {member ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs">
              <UserRound className="h-3.5 w-3.5" />
              <span className="font-medium">{member.name}</span>
              <span className="text-muted-foreground font-mono">{member.code}</span>
              <span className="text-muted-foreground">· {number(member.points)} pts</span>
              <button
                type="button"
                onClick={() => setMember(null)}
                className="ml-1 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMemberSearch("");
                setMemberPickerOpen(true);
              }}
              className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <UserPlus className="h-3.5 w-3.5" /> Attach member
            </button>
          )}
          <button
            type="button"
            onClick={openCustomerDisplay}
            className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Monitor className="h-3.5 w-3.5" /> Customer display
          </button>
          <button
            type="button"
            onClick={() => {
              setReprintSearch("");
              setReprintOpen(true);
            }}
            className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Printer className="h-3.5 w-3.5" /> Reprint receipt
          </button>
        </div>
      </div>

      {/* Reprint past transactions */}
      <Dialog open={reprintOpen} onOpenChange={setReprintOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reprint receipt</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={reprintSearch}
              onChange={(e) => setReprintSearch(e.target.value)}
              placeholder="Search receipt no or member…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-[50vh] overflow-auto -mx-6 px-6 divide-y">
            {filteredRecent.map((t) => (
              <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate">{t.receiptNo}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString()} ·{" "}
                    {t.lines.reduce((s, l) => s + l.quantity, 0)} items
                    {t.memberName ? ` · ${t.memberName}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="font-semibold text-sm">{currency(t.total)}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      try {
                        printTransactionReceipt(t, BRAND_LOGO_URL);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed to open print window");
                      }
                    }}
                  >
                    <Printer className="h-3.5 w-3.5 mr-1" /> Print
                  </Button>
                </div>
              </div>
            ))}
            {filteredRecent.length === 0 && (
              <div className="text-center text-muted-foreground py-6 text-sm">
                No transactions found
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReprintOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member picker */}
      <Dialog open={memberPickerOpen} onOpenChange={setMemberPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach member</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search by name, code or phone…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-[45vh] overflow-auto -mx-6 px-6 divide-y">
            {filteredMembers.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMember(m);
                  setMemberPickerOpen(false);
                }}
                className="w-full text-left py-2.5 flex items-center justify-between hover:bg-muted/40 -mx-2 px-2 rounded"
              >
                <div>
                  <div className="font-medium text-sm">{m.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {m.code}
                    {m.phone ? ` · ${m.phone}` : ""}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold">{number(m.points)} pts</div>
                  <div className="text-muted-foreground">{currency(m.totalSpent)}</div>
                </div>
              </button>
            ))}
            {filteredMembers.length === 0 && (
              <div className="text-center text-muted-foreground py-6 text-sm">No matches</div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewMember({ code: "", name: memberSearch, phone: "" });
                setNewMemberOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4 mr-1" /> New member
            </Button>
            <Button variant="ghost" onClick={() => setMemberPickerOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New member quick-add */}
      <Dialog open={newMemberOpen} onOpenChange={setNewMemberOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={newMember.phone}
                onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Member code (auto if blank)</Label>
              <Input
                value={newMember.code}
                onChange={(e) => setNewMember({ ...newMember, code: e.target.value })}
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewMemberOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createMember}>Create & attach</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select item</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items by name or code…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-[55vh] overflow-auto -mx-6 px-6">
            {filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No items. Ask your admin to import items from Excel.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filtered.map((it) => (
                  <button
                    key={it.code}
                    onClick={() => {
                      addItem(it);
                      setPickerOpen(false);
                    }}
                    className="text-left rounded-lg border bg-card p-3 hover:border-primary transition-all"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono truncate">
                      {it.code}
                    </div>
                    <div className="mt-1 text-sm font-medium leading-snug line-clamp-2 min-h-[2.25rem]">
                      {it.description}
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div>
                        <div className="font-display font-bold leading-none">
                          {currency(it.price)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">per {it.uom}</div>
                      </div>
                      <div
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full",
                          it.stock > 10
                            ? "bg-success/15 text-[color:var(--success-foreground)]"
                            : it.stock > 0
                              ? "bg-warning/20 text-[color:var(--warning-foreground)]"
                              : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {it.stock > 0 ? `${it.stock}` : "Out"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CART */}
      <aside className="flex flex-col min-w-0 bg-muted/30 flex-1 min-h-0">
        <div className="p-4 border-b bg-card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <div className="font-display font-bold">Current sale</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {lines.length} item{lines.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-3 opacity-40" />
              <div className="font-medium text-foreground">Cart is empty</div>
              <div className="text-sm mt-1">Scan a barcode or tap an item to start.</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground sticky top-0 bg-muted/30 backdrop-blur">
                <tr>
                  <th className="text-left px-4 py-2">Item</th>
                  <th className="text-center px-2 py-2 w-32">Qty</th>
                  <th className="text-right px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.code} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium leading-tight">{l.description}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {l.code} · {currency(l.price)}/{l.uom}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => setQty(l.code, l.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          value={l.quantity}
                          onChange={(e) => setQty(l.code, Number(e.target.value) || 0)}
                          className="h-7 w-12 text-center px-1"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => setQty(l.code, l.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-semibold">{currency(l.total)}</div>
                      <button
                        onClick={() => removeLine(l.code)}
                        className="text-xs text-destructive hover:underline mt-1 inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t bg-card p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{currency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span>{currency(tax)}</span>
          </div>
          {member && (
            <>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-[color:var(--accent-foreground)]">
                  <span>Points redeemed ({number(redeem)} pts)</span>
                  <span>-{currency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Points to earn</span>
                <span>+{number(earnPoints)} pts</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-baseline">
            <span className="font-display font-bold">Total</span>
            <span className="font-display font-bold text-3xl">{currency(total)}</span>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setLines([])}
              disabled={lines.length === 0}
              className="h-14"
            >
              Clear
            </Button>
            <Button
              onClick={openPayment}
              disabled={lines.length === 0}
              className="flex-1 h-14 text-lg bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Receipt className="h-5 w-5 mr-2" /> Charge {currency(total)}
            </Button>
          </div>
        </div>
      </aside>

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">Total due</span>
              <span className="font-display font-bold text-2xl">{currency(total)}</span>
            </div>

            {member && (
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {member.code} · {number(member.points)} pts available
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    Earn{" "}
                    <span className="font-semibold text-foreground">+{number(earnPoints)}</span> pts
                  </div>
                </div>
                {maxRedeemable > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Redeem points (max {number(maxRedeemable)} ={" "}
                      {currency(maxRedeemable * RUPIAH_PER_POINT)})
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={maxRedeemable}
                        value={redeemPoints}
                        onChange={(e) => setRedeemPoints(Number(e.target.value) || 0)}
                        className="h-9"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setRedeemPoints(maxRedeemable)}
                      >
                        Max
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setRedeemPoints(0)}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Payment method tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all",
                  paymentMethod === "cash"
                    ? "border-accent bg-accent/10 text-accent-foreground"
                    : "border-border hover:border-accent/50",
                )}
              >
                <Banknote className="h-4 w-4" /> Cash
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("qris")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all",
                  paymentMethod === "qris"
                    ? "border-accent bg-accent/10 text-accent-foreground"
                    : "border-border hover:border-accent/50",
                )}
              >
                <QrCode className="h-4 w-4" /> QRIS
              </button>
            </div>

            {paymentMethod === "cash" ? (
              <>
                <div className="space-y-2">
                  <Label>Amount received</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                    className="h-12 text-lg font-mono"
                    autoFocus
                  />
                  <div className="flex gap-2 flex-wrap">
                    {[
                      total,
                      Math.ceil(total / 10000) * 10000,
                      Math.ceil(total / 50000) * 50000,
                      Math.ceil(total / 100000) * 100000,
                    ].map((v, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => setPaid(String(v))}
                      >
                        {currency(v)}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between text-sm border-t pt-3">
                  <span className="text-muted-foreground">Change</span>
                  <span className="font-semibold">
                    {currency(Math.max(0, Number(paid) - total))}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 border-t pt-4">
                <div className="text-xs text-muted-foreground">
                  Ask customer to scan with any QRIS app
                </div>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QRIS payment code"
                    className="h-56 w-56 rounded-lg border bg-white p-2"
                  />
                ) : (
                  <div className="h-56 w-56 rounded-lg border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    Generating…
                  </div>
                )}
                <div className="text-[11px] font-mono text-muted-foreground">
                  Ref: {qrisRef || "—"}
                </div>
                <div className="text-xs text-center text-muted-foreground max-w-[16rem]">
                  After the customer's payment confirmation appears on your acquirer app, tap{" "}
                  <span className="font-medium text-foreground">Mark as paid</span>.
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={completeSale}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {paymentMethod === "qris" ? "Mark as paid" : "Complete sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Receipt
              <button
                onClick={() => setReceipt(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {receipt && (
            <div className="print-area font-mono text-xs leading-relaxed">
              <div className="text-center mb-3">
                <img
                  src={BRAND_LOGO_URL}
                  alt="AmanMart"
                  className="h-14 w-auto object-contain mx-auto mb-1"
                  crossOrigin="anonymous"
                />
                <div className="text-[10px]">Receipt {receipt.receiptNo}</div>
                <div className="text-[10px]">{new Date(receipt.createdAt).toLocaleString()}</div>
                <div className="text-[10px]">Cashier: {receipt.cashier}</div>
                {receipt.memberName && (
                  <div className="text-[10px]">
                    Member: {receipt.memberName} ({receipt.memberCode})
                  </div>
                )}
              </div>
              <div className="border-t border-dashed pt-2 space-y-1">
                {receipt.lines.map((l) => (
                  <div key={l.code}>
                    <div>{l.description}</div>
                    <div className="flex justify-between">
                      <span>
                        {" "}
                        {l.quantity} {l.uom} × {currency(l.price)}
                      </span>
                      <span>{currency(l.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed mt-2 pt-2 space-y-0.5">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{currency(receipt.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>{currency(receipt.tax)}</span>
                </div>
                {receipt.discount > 0 && (
                  <div className="flex justify-between">
                    <span>Points redeemed ({number(receipt.pointsRedeemed ?? 0)})</span>
                    <span>-{currency(receipt.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm">
                  <span>TOTAL</span>
                  <span>{currency(receipt.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Method</span>
                  <span>{(receipt.paymentMethod ?? "cash").toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid</span>
                  <span>{currency(receipt.paid)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Change</span>
                  <span>{currency(receipt.change)}</span>
                </div>
                {receipt.qrisReference && (
                  <div className="flex justify-between">
                    <span>QRIS Ref</span>
                    <span>{receipt.qrisReference}</span>
                  </div>
                )}
                {receipt.memberName && (
                  <div className="flex justify-between border-t border-dashed mt-1 pt-1">
                    <span>Points earned</span>
                    <span>+{number(receipt.pointsEarned ?? 0)}</span>
                  </div>
                )}
              </div>

              <div className="text-center mt-4 text-[10px]">Thank you!</div>
            </div>
          )}
          <DialogFooter className="no-print">
            <Button variant="outline" onClick={() => setReceipt(null)}>
              Close
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
