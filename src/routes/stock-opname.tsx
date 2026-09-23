import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Page } from "./admin.stock-opname";
import { BRAND_LOGO_URL as logo } from "@/lib/brand-logo";

export const Route = createFileRoute("/stock-opname")({
  head: () => ({
    meta: [
      { title: "Stock Opname — AmanPOS" },
      {
        name: "description",
        content: "Direct stock opname access — PDT-friendly barcode counting without login.",
      },
    ],
  }),
  component: StandalonePage,
});

function StandalonePage() {
  useEffect(() => {
    let done = false;
    void import("@/lib/items-sync").then(({ syncItemsQuietly }) => {
      if (!done) void syncItemsQuietly();
    });
    return () => {
      done = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
          <img src={logo} alt="AmanMart" className="h-7 w-auto" />
          <div className="text-sm font-semibold">Stock Opname</div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl">
        <Page />
      </main>
    </div>
  );
}
