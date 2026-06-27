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
import { Plus, Trash2, Loader2, Eye, X } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { value: "tax_invoice", label: "Tax Invoice" },
  { value: "retail_invoice", label: "Retail Invoice" },
  { value: "quotation", label: "Quotation" },
  { value: "pos", label: "POS Bill" },
  { value: "credit_note", label: "Credit Note" },
];

const STATUS_COLOR = {
  paid: "bg-success/15 text-success",
  partial: "bg-warning/15 text-warning",
  sent: "bg-primary/10 text-primary",
  draft: "bg-muted text-muted-foreground",
  overdue: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function InvoiceForm({ onClose, onCreated }) {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    invoice_type: "tax_invoice",
    party_id: "",
    party_name: "",
    party_gstin: "",
    invoice_date: today(),
    due_date: "",
    notes: "",
    discount_total: 0,
    shipping: 0,
    paid_amount: 0,
    payment_mode: "credit",
    items: [{ _key: 1, product_id: "", name: "", hsn_code: "", quantity: 1, unit: "PCS", rate: 0, discount_pct: 0, gst_rate: 18 }],
  });
  const [saving, setSaving] = useState(false);
  const [nextKey, setNextKey] = useState(2);

  useEffect(() => {
    api.get("/masters/parties?party_type=customer").then(({ data }) => setCustomers(data));
    api.get("/masters/products").then(({ data }) => setProducts(data));
  }, []);

  const set = (k, v) => setForm({ ...form, [k]: v });
  const setItem = (idx, k, v) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [k]: v };
    setForm({ ...form, items });
  };

  const selectProduct = (idx, pid) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    const items = [...form.items];
    items[idx] = {
      ...items[idx],
      product_id: pid, name: p.name, hsn_code: p.hsn_code || "",
      unit: p.unit, rate: p.sale_price, gst_rate: p.gst_rate,
    };
    setForm({ ...form, items });
  };

  const addItem = () => { setForm({ ...form, items: [...form.items, { _key: nextKey, product_id: "", name: "", hsn_code: "", quantity: 1, unit: "PCS", rate: 0, discount_pct: 0, gst_rate: 18 }] }); setNextKey(nextKey + 1); };
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  const totals = useMemo(() => {
    let sub = 0, gst = 0;
    form.items.forEach((it) => {
      const amt = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
      const disc = amt * ((parseFloat(it.discount_pct) || 0) / 100);
      const net = amt - disc;
      const g = net * ((parseFloat(it.gst_rate) || 0) / 100);
      sub += net; gst += g;
    });
    const grand = sub + gst - (parseFloat(form.discount_total) || 0) + (parseFloat(form.shipping) || 0);
    return { sub, gst, grand };
  }, [form]);

  const onCustomerChange = (pid) => {
    const c = customers.find((x) => x.id === pid);
    if (c) setForm({ ...form, party_id: pid, party_name: c.name, party_gstin: c.gstin || "" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.party_name) return toast.error("Please select or enter customer name");
    if (form.items.length === 0) return toast.error("Add at least one item");
    setSaving(true);
    try {
      const payload = {
        ...form,
        discount_total: parseFloat(form.discount_total) || 0,
        shipping: parseFloat(form.shipping) || 0,
        paid_amount: parseFloat(form.paid_amount) || 0,
        items: form.items.map((it) => ({
          ...it,
          quantity: parseFloat(it.quantity) || 0,
          rate: parseFloat(it.rate) || 0,
          discount_pct: parseFloat(it.discount_pct) || 0,
          gst_rate: parseFloat(it.gst_rate) || 0,
        })),
      };
      await api.post("/sales", payload);
      toast.success("Invoice created");
      onCreated(); onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Invoice type</Label>
          <Select value={form.invoice_type} onValueChange={(v) => set("invoice_type", v)}>
            <SelectTrigger data-testid="invoice-type"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Customer</Label>
          <Select value={form.party_id} onValueChange={onCustomerChange}>
            <SelectTrigger data-testid="invoice-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Invoice date</Label>
          <Input type="date" value={form.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Line items</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="invoice-add-item"><Plus className="h-3.5 w-3.5 mr-1" />Add row</Button>
        </div>
        <div className="border border-border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-[28%]">Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Disc%</TableHead>
                <TableHead className="text-right">GST%</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.items.map((it, i) => {
                const amt = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
                const disc = amt * ((parseFloat(it.discount_pct) || 0) / 100);
                const net = amt - disc;
                const g = net * ((parseFloat(it.gst_rate) || 0) / 100);
                return (
                  <TableRow key={it._key ?? `row-${i}`}>
                    <TableCell>
                      <Select value={it.product_id} onValueChange={(v) => selectProduct(i, v)}>
                        <SelectTrigger className="h-8" data-testid={`invoice-item-product-${i}`}><SelectValue placeholder="Product (optional)" /></SelectTrigger>
                        <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input placeholder="or item name" value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} className="h-8 mt-1 text-xs" data-testid={`invoice-item-name-${i}`} />
                    </TableCell>
                    <TableCell><Input type="number" value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} className="h-8 text-right font-mono" /></TableCell>
                    <TableCell><Input type="number" value={it.rate} onChange={(e) => setItem(i, "rate", e.target.value)} className="h-8 text-right font-mono" /></TableCell>
                    <TableCell><Input type="number" value={it.discount_pct} onChange={(e) => setItem(i, "discount_pct", e.target.value)} className="h-8 text-right font-mono w-16" /></TableCell>
                    <TableCell><Input type="number" value={it.gst_rate} onChange={(e) => setItem(i, "gst_rate", e.target.value)} className="h-8 text-right font-mono w-16" /></TableCell>
                    <TableCell className="text-right font-mono">{formatINR(net + g)}</TableCell>
                    <TableCell><Button type="button" size="icon" variant="ghost" onClick={() => removeItem(i)}><X className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5"><Label>Discount (₹)</Label><Input type="number" value={form.discount_total} onChange={(e) => set("discount_total", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Shipping (₹)</Label><Input type="number" value={form.shipping} onChange={(e) => set("shipping", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Paid Amount (₹)</Label><Input type="number" value={form.paid_amount} onChange={(e) => set("paid_amount", e.target.value)} data-testid="invoice-paid" /></div>
        <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
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
      </div>

      <Card className="p-4 bg-muted/30">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Subtotal</div><div className="font-mono font-semibold mt-1">{formatINR(totals.sub)}</div></div>
          <div><div className="text-xs text-muted-foreground">GST</div><div className="font-mono font-semibold mt-1">{formatINR(totals.gst)}</div></div>
          <div><div className="text-xs text-muted-foreground">Grand Total</div><div className="font-mono text-xl font-bold mt-1 text-primary" data-testid="invoice-grand-total">{formatINR(totals.grand)}</div></div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving} data-testid="invoice-submit">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create Invoice
        </Button>
      </div>
    </form>
  );
}

export default function SalesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const q = filter === "all" ? "" : `?invoice_type=${filter}`;
    const { data } = await api.get(`/sales${q}`);
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const onDelete = async (id) => {
    if (!window.confirm("Delete invoice?")) return;
    await api.delete(`/sales/${id}`); toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Sales</h1>
          <p className="text-sm text-muted-foreground mt-1">Invoices, quotations & credit notes.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44" data-testid="sales-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="sales-new"><Plus className="h-4 w-4 mr-1.5" />New Invoice</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create invoice</DialogTitle></DialogHeader>
              <InvoiceForm onClose={() => setOpen(false)} onCreated={load} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">No invoices yet. Create your first one.</TableCell></TableRow>
            ) : items.map((inv) => (
              <TableRow key={inv.id} className="row-hover" data-testid={`invoice-row-${inv.id}`}>
                <TableCell className="font-mono font-semibold">{inv.invoice_number}</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{TYPES.find((t) => t.value === inv.invoice_type)?.label || inv.invoice_type}</Badge></TableCell>
                <TableCell>
                  <div className="font-medium">{inv.party_name}</div>
                  {inv.party_gstin && <div className="text-xs font-mono text-muted-foreground">{inv.party_gstin}</div>}
                </TableCell>
                <TableCell className="text-sm">{formatDate(inv.invoice_date)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatINR(inv.grand_total)}</TableCell>
                <TableCell className="text-right font-mono">
                  <span className={inv.balance_due > 0 ? "text-terracotta font-semibold" : "text-muted-foreground"}>{formatINR(inv.balance_due)}</span>
                </TableCell>
                <TableCell><Badge className={`${STATUS_COLOR[inv.status] || "bg-muted"} hover:bg-current/20 border-0 capitalize`}>{inv.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => onDelete(inv.id)} data-testid={`invoice-delete-${inv.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
