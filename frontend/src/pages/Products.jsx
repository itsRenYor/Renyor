import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { formatINR } from "../lib/format";
import { Plus, Search, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", sku: "", hsn_code: "", category: "", brand: "", unit: "PCS", sale_price: 0, purchase_price: 0, gst_rate: 18, opening_stock: 0, min_stock: 0, description: "" };

export default function ProductsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get(`/masters/products?search=${search}`);
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        sale_price: parseFloat(form.sale_price) || 0,
        purchase_price: parseFloat(form.purchase_price) || 0,
        gst_rate: parseFloat(form.gst_rate) || 0,
        opening_stock: parseFloat(form.opening_stock) || 0,
        min_stock: parseFloat(form.min_stock) || 0,
      };
      if (editing) {
        await api.put(`/masters/products/${editing.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(`/masters/products`, payload);
        toast.success("Product created");
      }
      setOpen(false); setEditing(null); setForm(EMPTY); load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  const onEdit = (p) => { setEditing(p); setForm({ ...EMPTY, ...p }); setOpen(true); };
  const onDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/masters/products/${id}`); toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">Inventory items, services & stock-keeping units.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-64" data-testid="product-search" />
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(EMPTY); } }}>
            <DialogTrigger asChild>
              <Button data-testid="product-add"><Plus className="h-4 w-4 mr-1.5" />Add Product</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
              <form className="grid grid-cols-2 gap-4" onSubmit={onSave}>
                <div className="col-span-2 space-y-1.5"><Label>Name *</Label><Input required value={form.name} onChange={set("name")} data-testid="product-form-name" /></div>
                <div className="space-y-1.5"><Label>SKU</Label><Input value={form.sku || ""} onChange={set("sku")} className="font-mono" /></div>
                <div className="space-y-1.5"><Label>HSN Code</Label><Input value={form.hsn_code || ""} onChange={set("hsn_code")} className="font-mono" /></div>
                <div className="space-y-1.5"><Label>Category</Label><Input value={form.category || ""} onChange={set("category")} /></div>
                <div className="space-y-1.5"><Label>Brand</Label><Input value={form.brand || ""} onChange={set("brand")} /></div>
                <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit} onChange={set("unit")} placeholder="PCS, KG, MTR…" /></div>
                <div className="space-y-1.5"><Label>GST Rate (%)</Label><Input type="number" value={form.gst_rate} onChange={set("gst_rate")} /></div>
                <div className="space-y-1.5"><Label>Sale Price (₹)</Label><Input type="number" required value={form.sale_price} onChange={set("sale_price")} data-testid="product-form-sale-price" /></div>
                <div className="space-y-1.5"><Label>Purchase Price (₹)</Label><Input type="number" value={form.purchase_price} onChange={set("purchase_price")} /></div>
                <div className="space-y-1.5"><Label>Opening Stock</Label><Input type="number" value={form.opening_stock} onChange={set("opening_stock")} disabled={!!editing} /></div>
                <div className="space-y-1.5"><Label>Min Stock</Label><Input type="number" value={form.min_stock} onChange={set("min_stock")} /></div>
                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={saving} data-testid="product-form-submit">
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
              <TableHead>Product</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead className="text-right">Sale ₹</TableHead>
              <TableHead className="text-right">Purchase ₹</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">No products yet. Add your first product.</TableCell></TableRow>
            ) : items.map((p) => (
              <TableRow key={p.id} className="row-hover" data-testid={`product-row-${p.id}`}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.sku || "—"} · {p.category || "Uncategorized"}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{p.hsn_code || "—"}</TableCell>
                <TableCell className="text-right font-mono">{formatINR(p.sale_price)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{formatINR(p.purchase_price)}</TableCell>
                <TableCell className="text-right font-mono"><Badge variant="secondary">{p.gst_rate}%</Badge></TableCell>
                <TableCell className="text-right font-mono">
                  <span className={p.current_stock < p.min_stock ? "text-destructive font-semibold" : ""}>{p.current_stock} {p.unit}</span>
                  {p.current_stock < p.min_stock && <AlertTriangle className="inline h-3 w-3 ml-1 text-destructive" />}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(p)} data-testid={`product-edit-${p.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(p.id)} data-testid={`product-delete-${p.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
