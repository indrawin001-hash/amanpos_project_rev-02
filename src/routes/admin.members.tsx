import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Member } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { currency, number } from "@/lib/format";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, Search, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/members")({
  head: () => ({
    meta: [
      { title: "Members — AmanPOS Admin" },
      { name: "description", content: "Manage AmanPOS loyalty members and their points balance." },
    ],
  }),
  component: () => (
    <AppShell role="admin">
      <MembersPage />
    </AppShell>
  ),
});

function MembersPage() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="p-6 lg:p-8" />;
  return <MembersPageContent />;
}

function nextMemberCode() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `M${stamp}`;
}

function MembersPageContent() {
  const members = useLiveQuery(() => db.members.orderBy("name").toArray(), [], []);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return members;
    return members.filter(
      (m) =>
        m.code.toLowerCase().includes(t) ||
        m.name.toLowerCase().includes(t) ||
        (m.phone ?? "").toLowerCase().includes(t),
    );
  }, [members, q]);

  const totals = useMemo(
    () => ({
      count: members.length,
      points: members.reduce((s, m) => s + (m.points || 0), 0),
      spent: members.reduce((s, m) => s + (m.totalSpent || 0), 0),
    }),
    [members],
  );

  function openNew() {
    setEditing({
      code: nextMemberCode(),
      name: "",
      phone: "",
      email: "",
      points: 0,
      totalSpent: 0,
      createdAt: Date.now(),
    });
    setOpen(true);
  }
  function openEdit(m: Member) {
    setEditing({ ...m });
    setOpen(true);
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Name required");
      return;
    }
    if (!editing.code.trim()) {
      toast.error("Member code required");
      return;
    }
    try {
      if (editing.id != null) {
        await db.members.update(editing.id, {
          code: editing.code.trim(),
          name: editing.name.trim(),
          phone: editing.phone?.trim() ?? "",
          email: editing.email?.trim() ?? "",
          points: Math.max(0, Math.floor(Number(editing.points) || 0)),
        });
        toast.success("Member updated");
      } else {
        await db.members.add({
          code: editing.code.trim(),
          name: editing.name.trim(),
          phone: editing.phone?.trim() ?? "",
          email: editing.email?.trim() ?? "",
          points: Math.max(0, Math.floor(Number(editing.points) || 0)),
          totalSpent: Math.max(0, Number(editing.totalSpent) || 0),
          createdAt: Date.now(),
        });
        toast.success("Member added");
      }
      setOpen(false);
      setEditing(null);
    } catch (e) {
      console.error(e);
      toast.error("Member code must be unique");
    }
  }

  async function remove(m: Member) {
    if (m.id == null) return;
    if (!confirm(`Delete member "${m.name}"?`)) return;
    await db.members.delete(m.id);
    toast.success("Member deleted");
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7" /> Members
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Loyalty members earn 1 point for every Rp 100.000 spent (1 point = Rp 100).
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Add member
        </Button>
      </header>

      <div className="rounded-xl border bg-card p-4 shadow-soft flex flex-wrap items-end gap-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, code or phone…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="Members" value={number(totals.count)} />
          <Stat label="Points outstanding" value={number(totals.points)} />
          <Stat label="Lifetime spend" value={currency(totals.spent)} accent />
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Phone</th>
                <th className="text-right px-5 py-3">Points</th>
                <th className="text-right px-5 py-3">Lifetime spend</th>
                <th className="text-left px-5 py-3">Joined</th>
                <th className="px-5 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t hover:bg-muted/30">
                  <td className="px-5 py-3 font-mono text-xs">{m.code}</td>
                  <td className="px-5 py-3 font-medium">{m.name}</td>
                  <td className="px-5 py-3">{m.phone || "—"}</td>
                  <td className="px-5 py-3 text-right font-semibold">{number(m.points)}</td>
                  <td className="px-5 py-3 text-right">{currency(m.totalSpent)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {format(new Date(m.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-5 py-3 text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(m)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    No members yet. Add your first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id != null ? "Edit member" : "Add member"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Member code</Label>
                  <Input
                    value={editing.code}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={editing.phone ?? ""}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    value={editing.email ?? ""}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Points</Label>
                  <Input
                    type="number"
                    value={editing.points}
                    onChange={(e) =>
                      setEditing({ ...editing, points: Number(e.target.value) || 0 })
                    }
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-display font-bold text-lg ${accent ? "text-[color:var(--accent-foreground)]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
