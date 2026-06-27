import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { formatINR } from "../lib/format";
import { Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", contact_person: "", phone: "", email: "", gstin: "", address: "", city: "", state: "", pincode: "", opening_balance: 0, credit_limit: 0 };

export default function PartiesPage({ partyType }) {
  const isCustomer = partyType === "customer";
  const title = isCustomer ? "Customers" : "Suppliers";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get(`/masters/parties?party_type=${partyType}&search=${search}`);
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [partyType, search]);

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, opening_balance: parseFloat(form.opening_balance) || 0, credit_limit: parseFloat(form.credit_limit) || 0 };
      if (editing) {
        await api.put(`/masters/parties/${editing.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(`/masters/parties?party_type=${partyType}`, payload);
        toast.success("Created");
      }
      setOpen(false); setEditing(null); setForm(EMPTY); load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  const onEdit = (p) => { setEditing(p); setForm({ ...EMPTY, ...p }); setOpen(true); };
  const onDelete = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await api.delete(`/masters/parties/${id}`);
    toast.success("Deleted"); load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your {partyType} master list.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${partyType}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
              data-testid="party-search"
            />
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(EMPTY); } }}>
            <DialogTrigger asChild>
              <Button data-testid="party-add"><Plus className="h-4 w-4 mr-1.5" />Add {isCustomer ? "Customer" : "Supplier"}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit" : "Add new"} {isCustomer ? "customer" : "supplier"}</DialogTitle>
              </DialogHeader>
              <form className="grid grid-cols-2 gap-4" onSubmit={onSave}>
                <div className="col-span-2 space-y-1.5">
                  <Label>Name *</Label>
                  <Input required value={form.name} onChange={set("name")} data-testid="party-form-name" />
                </div>
                <div className="space-y-1.5"><Label>Contact Person</Label><Input value={form.contact_person} onChange={set("contact_person")} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={set("phone")} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={set("email")} /></div>
                <div className="space-y-1.5"><Label>GSTIN</Label><Input value={form.gstin || ""} onChange={set("gstin")} className="font-mono uppercase" /></div>
                <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input value={form.address || ""} onChange={set("address")} /></div>
                <div className="space-y-1.5"><Label>City</Label><Input value={form.city || ""} onChange={set("city")} /></div>
                <div className="space-y-1.5"><Label>State</Label><Input value={form.state || ""} onChange={set("state")} /></div>
                <div className="space-y-1.5"><Label>Pincode</Label><Input value={form.pincode || ""} onChange={set("pincode")} /></div>
                <div className="space-y-1.5"><Label>Opening Balance (₹)</Label><Input type="number" value={form.opening_balance} onChange={set("opening_balance")} /></div>
                <div className="space-y-1.5 col-span-2"><Label>Credit Limit (₹)</Label><Input type="number" value={form.credit_limit} onChange={set("credit_limit")} /></div>
                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={saving} data-testid="party-form-submit">
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>City</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">No {partyType}s yet. Add your first one.</TableCell></TableRow>
            ) : items.map((p) => (
              <TableRow key={p.id} className="row-hover" data-testid={`party-row-${p.id}`}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                </TableCell>
                <TableCell className="font-mono text-sm">{p.phone || "-"}</TableCell>
                <TableCell className="font-mono text-xs">{p.gstin || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{p.city || "-"}</TableCell>
                <TableCell className="text-right font-mono">
                  <span className={p.current_balance > 0 ? "text-terracotta font-semibold" : ""}>{formatINR(p.current_balance)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(p)} data-testid={`party-edit-${p.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(p.id)} data-testid={`party-delete-${p.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
