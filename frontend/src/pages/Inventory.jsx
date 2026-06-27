import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { formatDate } from "../lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AlertTriangle } from "lucide-react";

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [low, setLow] = useState([]);
  const [moves, setMoves] = useState([]);

  useEffect(() => {
    api.get("/masters/products").then(({ data }) => setProducts(data));
    api.get("/masters/products/low-stock").then(({ data }) => setLow(data));
    api.get("/masters/stock-movements").then(({ data }) => setMoves(data));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time stock levels & movement history.</p>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock" data-testid="inv-tab-stock">Stock</TabsTrigger>
          <TabsTrigger value="low" data-testid="inv-tab-low">Low Stock ({low.length})</TabsTrigger>
          <TabsTrigger value="movements" data-testid="inv-tab-movements">Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>HSN</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Value ₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id} className="row-hover">
                    <TableCell><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.category || "—"}</div></TableCell>
                    <TableCell className="font-mono text-xs">{p.sku || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.hsn_code || "—"}</TableCell>
                    <TableCell className="text-right font-mono"><span className={p.current_stock < p.min_stock ? "text-destructive font-semibold" : ""}>{p.current_stock} {p.unit}</span></TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{p.min_stock}</TableCell>
                    <TableCell className="text-right font-mono">{(p.current_stock * p.purchase_price).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="low">
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Current</TableHead><TableHead className="text-right">Min</TableHead><TableHead className="text-right">Shortage</TableHead></TableRow></TableHeader>
              <TableBody>
                {low.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">All products well stocked 🎉</TableCell></TableRow>
                ) : low.map((p) => (
                  <TableRow key={p.id} className="row-hover">
                    <TableCell><div className="font-medium flex items-center gap-2">{p.name} <AlertTriangle className="h-3.5 w-3.5 text-destructive" /></div></TableCell>
                    <TableCell className="text-right font-mono text-destructive font-semibold">{p.current_stock}</TableCell>
                    <TableCell className="text-right font-mono">{p.min_stock}</TableCell>
                    <TableCell className="text-right font-mono">{(p.min_stock - p.current_stock).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
              <TableBody>
                {moves.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No movements yet.</TableCell></TableRow>
                ) : moves.map((m) => (
                  <TableRow key={m.id} className="row-hover">
                    <TableCell className="text-sm">{formatDate(m.created_at)}</TableCell>
                    <TableCell className="font-medium">{m.product_name}</TableCell>
                    <TableCell><Badge className={`${m.movement_type === "in" || m.movement_type === "opening" ? "bg-success/15 text-success" : "bg-terracotta/15 text-terracotta"} border-0 capitalize`}>{m.movement_type}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{m.quantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reference_type || "manual"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
