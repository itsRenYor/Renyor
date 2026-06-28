import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { formatINR, formatDate, today } from "../lib/format";
import { Plus, Trash2, Loader2, Plane, Calendar } from "lucide-react";
import { toast } from "sonner";

const PKG_EMPTY = { name: "", destination: "", duration_days: 1, duration_nights: 0, description: "", inclusions: "", cost_price: 0, sale_price: 0, active: true };
const BK_EMPTY = { package_id: "", package_name: "", traveler_name: "", traveler_phone: "", traveler_email: "", num_travelers: 1, travel_date: today(), sale_price: 0, cost_price: 0, advance_paid: 0, status: "confirmed", notes: "" };

const STATUS_COLOR = {
  confirmed: "bg-primary/10 text-primary", in_progress: "bg-warning/15 text-warning",
  completed: "bg-success/15 text-success", cancelled: "bg-muted text-muted-foreground",
};

export default function Tours() {
  const [packages, setPackages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [pOpen, setPOpen] = useState(false);
  const [bOpen, setBOpen] = useState(false);
  const [pForm, setPForm] = useState(PKG_EMPTY);
  const [bForm, setBForm] = useState(BK_EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [p, b] = await Promise.all([api.get("/tours/packages"), api.get("/tours/bookings")]);
    setPackages(p.data); setBookings(b.data);
  };
  useEffect(() => { load(); }, []);

  const setP = (k) => (e) => setPForm({ ...pForm, [k]: typeof e === "string" ? e : e.target.value });
  const setB = (k) => (e) => setBForm({ ...bForm, [k]: typeof e === "string" ? e : e.target.value });

  const submitPkg = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...pForm, duration_days: parseInt(pForm.duration_days) || 1, duration_nights: parseInt(pForm.duration_nights) || 0,
        cost_price: parseFloat(pForm.cost_price) || 0, sale_price: parseFloat(pForm.sale_price) || 0 };
      await api.post("/tours/packages", payload);
      toast.success("Package created"); setPOpen(false); setPForm(PKG_EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const submitBk = async (e) => {
    e.preventDefault();
    if (!bForm.package_id) return toast.error("Pick a package");
    setSaving(true);
    try {
      const payload = { ...bForm,
        num_travelers: parseInt(bForm.num_travelers) || 1,
        sale_price: parseFloat(bForm.sale_price) || 0,
        cost_price: parseFloat(bForm.cost_price) || 0,
        advance_paid: parseFloat(bForm.advance_paid) || 0 };
      await api.post("/tours/bookings", payload);
      toast.success("Booking created"); setBOpen(false); setBForm(BK_EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const onPickPackage = (pid) => {
    const p = packages.find((x) => x.id === pid);
    if (!p) return;
    setBForm({ ...bForm, package_id: pid, package_name: p.name, sale_price: p.sale_price, cost_price: p.cost_price });
  };

  const delPkg = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/tours/packages/${id}`); load(); };
  const delBk = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/tours/bookings/${id}`); load(); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Tour Operator</h1>
        <p className="text-sm text-muted-foreground mt-1">Tour packages & traveler bookings with profitability tracking.</p>
      </div>

      <Tabs defaultValue="packages">
        <TabsList>
          <TabsTrigger value="packages" data-testid="tour-tab-packages"><Plane className="h-3.5 w-3.5 mr-1.5" />Packages ({packages.length})</TabsTrigger>
          <TabsTrigger value="bookings" data-testid="tour-tab-bookings"><Calendar className="h-3.5 w-3.5 mr-1.5" />Bookings ({bookings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="packages" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={pOpen} onOpenChange={setPOpen}>
              <DialogTrigger asChild><Button data-testid="package-add"><Plus className="h-4 w-4 mr-1.5" />New Package</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New tour package</DialogTitle></DialogHeader>
                <form onSubmit={submitPkg} className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5"><Label>Name *</Label><Input required value={pForm.name} onChange={setP("name")} placeholder="e.g., Kerala Backwaters 5N6D" data-testid="package-name" /></div>
                  <div className="space-y-1.5"><Label>Destination *</Label><Input required value={pForm.destination} onChange={setP("destination")} /></div>
                  <div className="space-y-1.5"><Label>Duration (D/N)</Label>
                    <div className="flex gap-1"><Input type="number" value={pForm.duration_days} onChange={setP("duration_days")} placeholder="Days" /><Input type="number" value={pForm.duration_nights} onChange={setP("duration_nights")} placeholder="Nights" /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Cost price (₹)</Label><Input type="number" value={pForm.cost_price} onChange={setP("cost_price")} /></div>
                  <div className="space-y-1.5"><Label>Sale price (₹) *</Label><Input type="number" required value={pForm.sale_price} onChange={setP("sale_price")} data-testid="package-sale-price" /></div>
                  <div className="col-span-2 space-y-1.5"><Label>Inclusions</Label><Input value={pForm.inclusions} onChange={setP("inclusions")} placeholder="Flights, 4★ hotels, breakfast…" /></div>
                  <DialogFooter className="col-span-2"><Button type="submit" disabled={saving} data-testid="package-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Package</TableHead><TableHead>Destination</TableHead><TableHead>Duration</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Sale</TableHead><TableHead className="text-right">Margin</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {packages.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No packages yet.</TableCell></TableRow>
                ) : packages.map((p) => (
                  <TableRow key={p.id} className="row-hover">
                    <TableCell><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.inclusions || "—"}</div></TableCell>
                    <TableCell>{p.destination}</TableCell>
                    <TableCell className="text-sm">{p.duration_days}D / {p.duration_nights}N</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatINR(p.cost_price)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatINR(p.sale_price)}</TableCell>
                    <TableCell className="text-right font-mono text-success">{formatINR(p.sale_price - p.cost_price)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => delPkg(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="bookings" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={bOpen} onOpenChange={setBOpen}>
              <DialogTrigger asChild><Button data-testid="booking-add"><Plus className="h-4 w-4 mr-1.5" />New Booking</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New tour booking</DialogTitle></DialogHeader>
                <form onSubmit={submitBk} className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Package *</Label>
                    <Select value={bForm.package_id} onValueChange={onPickPackage}>
                      <SelectTrigger data-testid="booking-package"><SelectValue placeholder="Pick package" /></SelectTrigger>
                      <SelectContent>{packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatINR(p.sale_price)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Traveler name *</Label><Input required value={bForm.traveler_name} onChange={setB("traveler_name")} data-testid="booking-traveler" /></div>
                  <div className="space-y-1.5"><Label># Travelers</Label><Input type="number" value={bForm.num_travelers} onChange={setB("num_travelers")} /></div>
                  <div className="space-y-1.5"><Label>Phone</Label><Input value={bForm.traveler_phone} onChange={setB("traveler_phone")} /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input value={bForm.traveler_email} onChange={setB("traveler_email")} /></div>
                  <div className="space-y-1.5"><Label>Travel date *</Label><Input type="date" required value={bForm.travel_date} onChange={setB("travel_date")} /></div>
                  <div className="space-y-1.5"><Label>Sale price/pax (₹)</Label><Input type="number" value={bForm.sale_price} onChange={setB("sale_price")} /></div>
                  <div className="space-y-1.5"><Label>Cost price/pax (₹)</Label><Input type="number" value={bForm.cost_price} onChange={setB("cost_price")} /></div>
                  <div className="space-y-1.5"><Label>Advance paid (₹)</Label><Input type="number" value={bForm.advance_paid} onChange={setB("advance_paid")} /></div>
                  <DialogFooter className="col-span-2"><Button type="submit" disabled={saving} data-testid="booking-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Booking #</TableHead><TableHead>Traveler</TableHead><TableHead>Package</TableHead><TableHead>Travel Date</TableHead><TableHead className="text-right">Pax</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Profit</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No bookings yet.</TableCell></TableRow>
                ) : bookings.map((b) => (
                  <TableRow key={b.id} className="row-hover">
                    <TableCell className="font-mono font-semibold">{b.booking_number}</TableCell>
                    <TableCell><div className="font-medium">{b.traveler_name}</div><div className="text-xs text-muted-foreground">{b.traveler_phone}</div></TableCell>
                    <TableCell>{b.package_name}</TableCell>
                    <TableCell className="text-sm">{formatDate(b.travel_date)}</TableCell>
                    <TableCell className="text-right font-mono">{b.num_travelers}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatINR(b.sale_price * b.num_travelers)}</TableCell>
                    <TableCell className="text-right font-mono text-success">{formatINR(b.profit)}</TableCell>
                    <TableCell><Badge className={`${STATUS_COLOR[b.status]} border-0 capitalize`}>{b.status}</Badge></TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => delBk(b.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
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
