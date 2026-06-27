import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { formatINR, formatDate, today } from "../lib/format";
import { Plus, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { value: "purchase_invoice", label: "Purchase Invoice" },
  { value: "po", label: "Purchase Order" },
  { value: "return", label: "Purchase Return" },
];

const STATUS_COLOR = {
  paid: "bg-success/15 text-success",
  partial: "bg-warning/15 text-warning",
  open: "bg-primary/10 text-primary",
};

function PurchaseForm({ onClose, onCreated }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    purchase_type: "purchase_invoice",
    supplier_id: "",
    supplier_name: "",
    supplier_gstin: "",
    bill_number: "",
    bill_date: today(),
    notes: "",
    paid_amount: 0,
    payment_mode: "credit",
    items: [{ product_id: "", name: "", hsn_code: "", quantity: 1, unit: "PCS", rate: 0, discount_pct: 0, gst_rate: 18 }],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/masters/parties?party_type=supplier").then(({ data }) => setSuppliers(data));
    api.get("/masters/products").then(({ data }) => setProducts(data));
  }, []);

  const set = (k, v) => setForm({ ...form, [k]: v });
  const setItem = (idx, k, v) => { const items = [...form.items]; items[idx] = { ...items[idx], [k]: v }; setForm({ ...form, items }); };

  const selectProduct = (idx, pid) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    const items = [...form.items];
    items[idx] = { ...items[idx], product_id: pid, name: p.name, hsn_code: p.hsn_code || "", unit: p.unit, rate: p.purchase_price, gst_rate: p.gst_rate };
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { product_id: "", name: "", hsn_code: "", quantity: 1, unit: "PCS", rate: 0, discount_pct: 0, gst_rate: 18 }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  const totals = useMemo(() => {
    let sub = 0, gst = 0;
    form.items.forEach((it) => {
      const amt = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
      const net = amt - amt * ((parseFloat(it.discount_pct) || 0) / 100);
      sub += net; gst += net * ((parseFloat(it.gst_rate) || 0) / 100);
    });
    return { sub, gst, grand: sub + gst };
  }, [form]);

  const onSupplier = (sid) => {
    const s = suppliers.find((x) => x.id === sid);
    if (s) setForm({ ...form, supplier_id: sid, supplier_name: s.name, supplier_gstin: s.gstin || "" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.supplier_name) return toast.error("Select supplier");
    setSaving(true);
    try {
      const payload = {
        ...form,
        paid_amount: parseFloat(form.paid_amount) || 0,
        items: form.items.map((it) => ({
          ...it,
          quantity: parseFloat(it.quantity) || 0,
          rate: parseFloat(it.rate) || 0,
          discount_pct: parseFloat(it.discount_pct) || 0,
          gst_rate: parseFloat(it.gst_rate) || 0,
        })),
      };
      await api.post("/purchases", payload);
      toast.success("Purchase recorded");
      onCreated(); onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.purchase_type} onValueChange={(v) => set("purchase_type", v)}>
            <SelectTrigger data-testid="purchase-type"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <Select value={form.supplier_id} onValueChange={onSupplier}>
            <SelectTrigger data-testid="purchase-supplier"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Bill #</Label><Input value={form.bill_number} onChange={(e) => set("bill_number", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.bill_date} onChange={(e) => set("bill_date", e.target.value)} /></div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Items</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Add row</Button>
        </div>
        <div className="border border-border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">GST%</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.items.map((it, i) => {
                const amt = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
                const g = amt * ((parseFloat(it.gst_rate) || 0) / 100);
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <Select value={it.product_id} onValueChange={(v) => selectProduct(i, v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Product" /></SelectTrigger>
                        <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} className="h-8 mt-1 text-xs" placeholder="or item name" />
                    </TableCell>
                    <TableCell><Input type="number" value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} className="h-8 text-right font-mono" /></TableCell>
                    <TableCell><Input type="number" value={it.rate} onChange={(e) => setItem(i, "rate", e.target.value)} className="h-8 text-right font-mono" /></TableCell>
                    <TableCell><Input type="number" value={it.gst_rate} onChange={(e) => setItem(i, "gst_rate", e.target.value)} className="h-8 text-right font-mono w-16" /></TableCell>
                    <TableCell className="text-right font-mono">{formatINR(amt + g)}</TableCell>
                    <TableCell><Button type="button" size="icon" variant="ghost" onClick={() => removeItem(i)}><X className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-1.5"><Label>Paid Amount (₹)</Label><Input type="number" value={form.paid_amount} onChange={(e) => set("paid_amount", e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Payment Mode</Label>
          <Select value={form.payment_mode} onValueChange={(v) => set("payment_mode", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="bank">Bank Transfer</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>

      <Card className="p-4 bg-muted/30">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Subtotal</div><div className="font-mono font-semibold mt-1">{formatINR(totals.sub)}</div></div>
          <div><div className="text-xs text-muted-foreground">GST</div><div className="font-mono font-semibold mt-1">{formatINR(totals.gst)}</div></div>
          <div><div className="text-xs text-muted-foreground">Grand Total</div><div className="font-mono text-xl font-bold mt-1 text-primary" data-testid="purchase-grand-total">{formatINR(totals.grand)}</div></div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving} data-testid="purchase-submit">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Purchase
        </Button>
      </div>
    </form>
  );
}

export default function PurchasesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get(`/purchases`);
    setItems(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const onDelete = async (id) => {
    if (!window.confirm("Delete?")) return;
    await api.delete(`/purchases/${id}`); toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Purchases</h1>
          <p className="text-sm text-muted-foreground mt-1">POs, purchase invoices & returns.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="purchase-new"><Plus className="h-4 w-4 mr-1.5" />New Purchase</Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record purchase</DialogTitle></DialogHeader>
            <PurchaseForm onClose={() => setOpen(false)} onCreated={load} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Bill #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No purchases yet.</TableCell></TableRow>
            ) : items.map((p) => (
              <TableRow key={p.id} className="row-hover" data-testid={`purchase-row-${p.id}`}>
                <TableCell className="font-mono font-semibold">{p.voucher_number}</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{TYPES.find((t) => t.value === p.purchase_type)?.label}</Badge></TableCell>
                <TableCell><div className="font-medium">{p.supplier_name}</div></TableCell>
                <TableCell className="font-mono text-xs">{p.bill_number || "—"}</TableCell>
                <TableCell className="text-sm">{formatDate(p.bill_date)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatINR(p.grand_total)}</TableCell>
                <TableCell className="text-right font-mono"><span className={p.balance_due > 0 ? "text-terracotta font-semibold" : ""}>{formatINR(p.balance_due)}</span></TableCell>
                <TableCell><Badge className={`${STATUS_COLOR[p.status]} border-0 capitalize`}>{p.status}</Badge></TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => onDelete(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
