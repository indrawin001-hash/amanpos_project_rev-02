## AmanPOS — Offline-first POS Web App

Since the app must work **offline**, I'll build it fully client-side using IndexedDB for storage. No backend / cloud needed. Data lives in the browser.

### Tech choices

- **Storage**: Dexie.js (IndexedDB) — items, users, transactions persist offline
- **Excel import**: SheetJS (`xlsx`)
- **Barcode scan**: `@zxing/browser` (camera) + USB scanner support (keyboard input)
- **Charts (admin)**: Recharts
- **Routing**: TanStack Router (already set up)
- **Styling**: Tailwind + design tokens

### Features

**Auth (local)**

- Login screen with username + password
- Seeded users: `admin/admin123` (admin), `cashier/cashier123` (cashier)
- Session in localStorage; role-based route guard

**Cashier POS** (`/pos`)

- Item table: code, description, price, UOM, qty, total
- Add items via: (a) barcode scan input field (auto-focused — works with USB scanners), (b) camera scanner, (c) search/select from item list
- Adjust quantity, remove line, see grand total
- Checkout → saves transaction to IndexedDB, prints receipt view

**Admin Dashboard** (`/admin`)

- KPIs: today's sales, transactions count, top items
- Charts: sales over time, items sold
- Transactions list with filter by date
- Items management (CRUD)
- **Excel import** for items (.xlsx with columns: code, description, price, uom, stock)

### Pages

```
/login        → Login form
/pos          → Cashier interface (cashier + admin)
/admin        → Dashboard (admin only)
/admin/items  → Items CRUD + Excel import
/admin/transactions → Transactions report
```

### Design

- Clean professional POS aesthetic — dark navy primary + emerald accent
- Large touch-friendly buttons for cashier screen
- Dense data tables for admin

### Out of scope (v1)

- Payment processor integration
- Multi-store / sync (purely offline-local per device)
- Real receipt printer driver (browser print only)

Building this now.
