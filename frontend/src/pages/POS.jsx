import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { formatINR, today } from "../lib/format";
import { Plus, Minus, Trash2, Search, ScanLine, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("Walk-in Customer");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api.get("/masters/products").then(({ data }) => setProducts(data));
    api.get("/masters/parties?party_type=customer").then(({ data }) => setCustomers(data));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return products;
    const s = search.toLowerCase();
    return products.filter((p) =>
      (p.name || "").toLowerCase().includes(s) ||
      (p.sku || "").toLowerCase().includes(s) ||
      (p.hsn_code || "").includes(s)
    );
  }, [products, search]);

  const addToCart = (p) => {
    const existing = cart.find((it) => it.product_id === p.id);
    if (existing) {
      setCart(cart.map((it) => it.product_id === p.id ? { ...it, quantity: it.quantity + 1 } : it));
    } else {
      setCart([...cart, {
        _key: Date.now(), product_id: p.id, name: p.name, hsn_code: p.hsn_code || "",
        unit: p.unit, rate: p.sale_price, gst_rate: p.gst_rate, quantity: 1, discount_pct: 0,
      }]);
    }
  };

  const updateQty = (key, delta) => {
    setCart(cart.map((it) => it._key === key ? { ...it, quantity: Math.max(0.01, it.quantity + delta) } : it));
  };

  const setQty = (key, v) => {
    const q = parseFloat(v) || 0;
    setCart(cart.map((it) => it._key === key ? { ...it, quantity: q } : it));
  };

  const removeItem = (key) => setCart(cart.filter((it) => it._key !== key));

  const totals = useMemo(() => {
    let sub = 0, gst = 0;
    cart.forEach((it) => {
      const amt = it.quantity * it.rate;
      sub += amt;
      gst += amt * (it.gst_rate / 100);
    });
    const grand = sub + gst - (parseFloat(discount) || 0);
    return { sub, gst, grand };
  }, [cart, discount]);

  const onPartyChange = (cid) => {
    if (cid === "_walkin") {
      setPartyId(""); setPartyName("Walk-in Customer"); return;
    }
    const c = customers.find((x) => x.id === cid);
    if (c) { setPartyId(cid); setPartyName(c.name); }
  };

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    setCompleting(true);
    try {
      const payload = {
        invoice_type: "pos",
        party_id: partyId || null,
        party_name: partyName,
        invoice_date: today(),
        items: cart.map(({ _key, ...rest }) => ({ ...rest })),
        discount_total: parseFloat(discount) || 0,
        shipping: 0,
        paid_amount: parseFloat(paid) || totals.grand,
        payment_mode: paymentMode,
        notes: null,
      };
      const { data } = await api.post("/sales", payload);
      setDone(data);
      // refresh products for live stock
      const { data: prods } = await api.get("/masters/products");
      setProducts(prods);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Checkout failed");
    } finally { setCompleting(false); }
  };

  const newSale = () => {
    setDone(null); setCart([]); setDiscount(0); setPaid(0);
    setPartyId(""); setPartyName("Walk-in Customer"); setPaymentMode("cash");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
            <ScanLine className="h-7 w-7 text-primary" /> POS Billing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Touch-optimized counter checkout — tap products, take payment, print.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:h-[calc(100vh-220px)]">
        {/* Product grid */}
        <div className="lg:col-span-3 flex flex-col gap-3 min-h-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Scan barcode or search product…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-12 text-base"
              autoFocus
              data-testid="pos-search"
            />
          </div>
          <Card className="flex-1 overflow-y-auto p-3 min-h-[400px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {filtered.length === 0 ? (
                <div className="col-span-full text-center text-muted-foreground py-12">No products match "{search}"</div>
              ) : filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="text-left p-3 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all active:scale-95"
                  data-testid={`pos-product-${p.id}`}
                >
                  <div className="font-medium text-sm leading-tight line-clamp-2">{p.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">{p.sku || "—"}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="font-mono text-base font-bold text-primary">{formatINR(p.sale_price)}</div>
                    <Badge variant={p.current_stock < p.min_stock ? "destructive" : "secondary"} className="text-[10px]">{p.current_stock} {p.unit}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Cart */}
        <Card className="lg:col-span-2 flex flex-col p-4 max-h-[calc(100vh-220px)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-lg">Cart</h3>
            <Badge variant="secondary">{cart.length} item{cart.length !== 1 && "s"}</Badge>
          </div>

          <div className="space-y-2 mb-3">
            <Select value={partyId || "_walkin"} onValueChange={onPartyChange}>
              <SelectTrigger data-testid="pos-customer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_walkin">Walk-in Customer</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2 min-h-[100px]">
            {cart.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 text-sm">
                Tap products on the left to add them.
              </div>
            ) : cart.map((it) => (
              <div key={it._key} className="flex items-center gap-2 p-2 rounded-md border border-border" data-testid={`pos-cart-item-${it.product_id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{formatINR(it.rate)} × {it.quantity} = {formatINR(it.rate * it.quantity)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(it._key, -1)}><Minus className="h-3 w-3" /></Button>
                  <Input value={it.quantity} onChange={(e) => setQty(it._key, e.target.value)} className="w-12 h-7 text-center font-mono text-xs px-1" />
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(it._key, +1)}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(it._key)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-mono">{formatINR(totals.sub)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>GST</span><span className="font-mono">{formatINR(totals.gst)}</span></div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Discount ₹</span>
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-20 h-7 text-right font-mono text-xs" />
            </div>
            <div className="flex justify-between font-mono text-xl font-bold text-primary border-t border-border pt-2">
              <span>TOTAL</span><span data-testid="pos-total">{formatINR(totals.grand)}</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger data-testid="pos-payment-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="bank">Card / Bank</SelectItem>
                <SelectItem value="credit">Credit (later)</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" placeholder={`Paid (default ${totals.grand.toFixed(0)})`} value={paid} onChange={(e) => setPaid(e.target.value)} data-testid="pos-paid" />
          </div>

          <Button
            className="mt-3 h-12 text-base"
            onClick={checkout}
            disabled={completing || cart.length === 0}
            data-testid="pos-checkout"
          >
            {completing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Checkout {cart.length > 0 && `· ${formatINR(totals.grand)}`}
          </Button>
        </Card>
      </div>

      {/* Receipt dialog */}
      <Dialog open={!!done} onOpenChange={(v) => !v && newSale()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> Sale completed</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-muted-foreground">Invoice #</div><div className="font-mono font-semibold">{done?.invoice_number}</div>
              <div className="text-muted-foreground">Customer</div><div>{done?.party_name}</div>
              <div className="text-muted-foreground">Amount</div><div className="font-mono font-bold text-primary text-lg">{formatINR(done?.grand_total)}</div>
              <div className="text-muted-foreground">Payment</div><div className="capitalize">{done?.payment_mode}</div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => window.open(`${api.defaults.baseURL}/sales/${done.id}/pdf?_t=${Date.now()}`, "_blank")}
              data-testid="pos-receipt-pdf"
            >
              View PDF
            </Button>
            <Button onClick={newSale} data-testid="pos-new-sale">New Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
