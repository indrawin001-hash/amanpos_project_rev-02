import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { subscribeCustomerDisplay, type CustomerDisplayState } from "@/lib/customer-display";
import { currency } from "@/lib/format";
import { BRAND_LOGO_URL } from "@/components/AppShell";
import { ShoppingCart, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/customer-display")({
  head: () => ({
    meta: [
      { title: "Customer Display — AmanPOS" },
      { name: "description", content: "AmanPOS customer-facing display for the second monitor." },
    ],
  }),
  component: CustomerDisplayPage,
});

function CustomerDisplayPage() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="min-h-screen bg-[#0b6b3a]" />;
  return <Display />;
}

function Display() {
  const [state, setState] = useState<CustomerDisplayState | null>(null);

  useEffect(() => subscribeCustomerDisplay(setState), []);

  const lines = state?.lines ?? [];
  const total = state?.total ?? 0;
  const paid = state?.paid ?? 0;
  const change = state?.change ?? 0;
  const status = state?.status ?? "idle";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b6b3a] via-[#0e7a43] to-[#0b6b3a] text-white flex flex-col">
      <header className="bg-white/95 text-neutral-900 px-8 py-4 flex items-center justify-between shadow-lg">
        <img src={BRAND_LOGO_URL} alt="AmanMart" className="h-14 w-auto object-contain" />
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-neutral-500">Customer Display</div>
          <div className="text-sm font-semibold text-[#0b6b3a]">Welcome to AmanMart</div>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-8 min-h-0">
        {status === "paid" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-24 w-24 mb-6 text-yellow-300" />
            <div className="text-5xl font-bold mb-2">Thank you!</div>
            <div className="text-xl opacity-90 mb-10">Your payment has been received</div>
            <div className="grid grid-cols-3 gap-8 bg-white/10 rounded-2xl p-8 backdrop-blur">
              <Stat label="Total" value={currency(total)} big />
              <Stat label="Paid" value={currency(paid)} />
              <Stat label="Change" value={currency(change)} highlight />
            </div>
            {state?.receiptNo && (
              <div className="mt-6 text-sm opacity-70 font-mono">Receipt {state.receiptNo}</div>
            )}
          </div>
        ) : lines.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-90">
            <ShoppingCart className="h-24 w-24 mb-6 opacity-60" />
            <div className="text-4xl font-bold">Welcome</div>
            <div className="text-xl mt-2 opacity-80">
              Please wait while the cashier scans your items
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="text-lg uppercase tracking-widest opacity-80 mb-2">Your items</div>
            <div className="flex-1 overflow-auto rounded-xl bg-white/10 backdrop-blur">
              <table className="w-full text-lg">
                <thead className="text-sm uppercase tracking-wider opacity-80 sticky top-0 bg-[#0b6b3a]/80 backdrop-blur">
                  <tr>
                    <th className="text-left px-6 py-3">Item</th>
                    <th className="text-center px-4 py-3 w-24">Qty</th>
                    <th className="text-right px-4 py-3 w-40">Price</th>
                    <th className="text-right px-6 py-3 w-48">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.code + i} className="border-t border-white/10">
                      <td className="px-6 py-3">
                        <div className="font-semibold">{l.description}</div>
                        <div className="text-xs opacity-70 font-mono">{l.code}</div>
                      </td>
                      <td className="text-center px-4 py-3 font-semibold">
                        {l.quantity} {l.uom}
                      </td>
                      <td className="text-right px-4 py-3">{currency(l.price)}</td>
                      <td className="text-right px-6 py-3 font-bold">{currency(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {state?.memberName && (
              <div className="mt-3 flex items-center justify-between bg-white/10 rounded-xl px-5 py-2.5 backdrop-blur text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-yellow-300">{state.memberName}</span>
                  <span className="opacity-75 font-mono text-xs">({state.memberCode})</span>
                  <span className="bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded text-xs font-medium">
                    Member 5% Discount
                  </span>
                </div>
                {(state?.pointsEarned ?? 0) > 0 && (
                  <div className="text-yellow-300 font-semibold">
                    +{state.pointsEarned} pts to earn
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 rounded-2xl bg-yellow-300 text-neutral-900 px-8 py-5 shadow-2xl space-y-2">
              {(state?.memberDiscount ?? 0) > 0 && (
                <div className="flex justify-between items-center text-sm font-semibold text-emerald-800 border-b border-black/10 pb-1.5">
                  <span>Member Discount (5%)</span>
                  <span>-{currency(state.memberDiscount ?? 0)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-bold uppercase tracking-wider">Total</div>
                <div className="text-6xl font-black tabular-nums">{currency(total)}</div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="px-8 py-3 text-center text-sm opacity-80 bg-black/20">
        AmanMart · Halal Terjangkau · Terima kasih atas kunjungan Anda
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  big,
  highlight,
}: {
  label: string;
  value: string;
  big?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest opacity-80 mb-1">{label}</div>
      <div
        className={`font-bold tabular-nums ${big ? "text-5xl" : "text-3xl"} ${highlight ? "text-yellow-300" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
