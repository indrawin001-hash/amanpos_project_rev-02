import type { Transaction } from "@/lib/db";
import { currency, number } from "@/lib/format";

function esc(s: string) {
  return String(s).replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
  );
}

/** Opens a print window with a thermal-style receipt for an existing transaction (reprint). */
export function printTransactionReceipt(t: Transaction, logoUrl?: string) {
  const rows = t.lines
    .map(
      (l) => `<div class="ln">
        <div class="d">${esc(l.description)}</div>
        <div class="m"><span>${esc(l.code)} · ${number(l.quantity)} ${esc(l.uom)} × ${currency(l.price)}</span><span>${currency(l.total)}</span></div>
      </div>`,
    )
    .join("");

  const totals = [
    ["Subtotal", currency(t.subtotal)],
    ["Tax", currency(t.tax)],
    ...((t.discount ?? 0) > 0
      ? [[`Points redeemed (${number(t.pointsRedeemed ?? 0)})`, `-${currency(t.discount ?? 0)}`]]
      : []),
    ["TOTAL", currency(t.total)],
    ["Method", (t.paymentMethod ?? "cash").toUpperCase()],
    ["Paid", currency(t.paid)],
    ["Change", currency(t.change)],
    ...(t.qrisReference ? [["QRIS Ref", t.qrisReference]] : []),
    ...(t.memberName ? [["Points earned", `+${number(t.pointsEarned ?? 0)}`]] : []),
  ]
    .map(
      ([k, v]) =>
        `<div class="row${k === "TOTAL" ? " b" : ""}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(t.receiptNo)}</title>
  <style>
    @page { margin: 6mm; }
    body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; width: 76mm; margin: 0 auto; color: #000; }
    .c { text-align: center; }
    img { max-height: 46px; object-fit: contain; margin-bottom: 4px; }
    .sep { border-top: 1px dashed #000; margin: 6px 0; }
    .ln { margin-bottom: 4px; }
    .ln .d { font-weight: 600; }
    .ln .m { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; }
    .row { display: flex; justify-content: space-between; }
    .row.b { font-weight: 700; font-size: 13px; }
    .sm { font-size: 10px; }
  </style></head><body>
    <div class="c">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="AmanMart" />` : ""}
      <div class="sm">Receipt ${esc(t.receiptNo)}</div>
      <div class="sm">${esc(new Date(t.createdAt).toLocaleString())}</div>
      <div class="sm">Cashier: ${esc(t.cashier)}</div>
      ${t.memberName ? `<div class="sm">Member: ${esc(t.memberName)} (${esc(t.memberCode ?? "")})</div>` : ""}
      <div class="sm" style="font-weight:700;margin-top:2px">** REPRINT **</div>
    </div>
    <div class="sep"></div>
    ${rows}
    <div class="sep"></div>
    ${totals}
    <div class="sep"></div>
    <div class="c sm">Thank you for shopping at AmanMart</div>
  </body></html>`;

  const w = window.open("", "amanpos_reprint", "width=420,height=700");
  if (!w) {
    throw new Error("Popup blocked — allow popups to reprint receipts");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  const go = () => {
    w.focus();
    w.print();
  };
  if (logoUrl) setTimeout(go, 400);
  else go();
}
