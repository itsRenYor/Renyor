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
import { Plus, Trash2, Loader2, Truck, Route as RouteIcon } from "lucide-react";
import { toast } from "sonner";

const VEH_EMPTY = { vehicle_number: "", vehicle_type: "Truck", make_model: "", capacity: "", driver_name: "", driver_phone: "", fitness_expiry: "", insurance_expiry: "", permit_expiry: "", active: true };
const TRIP_EMPTY = { vehicle_id: "", vehicle_number: "", driver_name: "", customer_name: "", from_location: "", to_location: "", trip_date: today(), lr_number: "", goods_description: "", freight_amount: 0, advance_paid: 0, diesel_expense: 0, other_expenses: 0, status: "scheduled", notes: "" };

const STATUS_COLOR = {
  scheduled: "bg-primary/10 text-primary", in_transit: "bg-warning/15 text-warning",
  delivered: "bg-success/15 text-success", cancelled: "bg-muted text-muted-foreground",
};

export default function Transport() {
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [vOpen, setVOpen] = useState(false);
  const [tOpen, setTOpen] = useState(false);
  const [vForm, setVForm] = useState(VEH_EMPTY);
  const [tForm, setTForm] = useState(TRIP_EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [v, t] = await Promise.all([api.get("/transport/vehicles"), api.get("/transport/trips")]);
    setVehicles(v.data); setTrips(t.data);
  };
  useEffect(() => { load(); }, []);

  const setV = (k) => (e) => setVForm({ ...vForm, [k]: typeof e === "string" ? e : e.target.value });
  const setT = (k) => (e) => setTForm({ ...tForm, [k]: typeof e === "string" ? e : e.target.value });

  const submitV = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post("/transport/vehicles", vForm);
      toast.success("Vehicle added"); setVOpen(false); setVForm(VEH_EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const submitT = async (e) => {
    e.preventDefault();
    if (!tForm.vehicle_id) return toast.error("Pick a vehicle");
    setSaving(true);
    try {
      const payload = { ...tForm,
        freight_amount: parseFloat(tForm.freight_amount) || 0,
        advance_paid: parseFloat(tForm.advance_paid) || 0,
        diesel_expense: parseFloat(tForm.diesel_expense) || 0,
        other_expenses: parseFloat(tForm.other_expenses) || 0 };
      await api.post("/transport/trips", payload);
      toast.success("Trip created"); setTOpen(false); setTForm(TRIP_EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const pickVehicle = (vid) => {
    const v = vehicles.find((x) => x.id === vid);
    if (v) setTForm({ ...tForm, vehicle_id: vid, vehicle_number: v.vehicle_number, driver_name: v.driver_name });
  };

  const delV = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/transport/vehicles/${id}`); load(); };
  const delT = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/transport/trips/${id}`); load(); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Transport</h1>
        <p className="text-sm text-muted-foreground mt-1">Fleet, drivers, LR sheets & trip profitability.</p>
      </div>

      <Tabs defaultValue="vehicles">
        <TabsList>
          <TabsTrigger value="vehicles" data-testid="tr-tab-vehicles"><Truck className="h-3.5 w-3.5 mr-1.5" />Vehicles ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="trips" data-testid="tr-tab-trips"><RouteIcon className="h-3.5 w-3.5 mr-1.5" />Trip Sheets ({trips.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={vOpen} onOpenChange={setVOpen}>
              <DialogTrigger asChild><Button data-testid="vehicle-add"><Plus className="h-4 w-4 mr-1.5" />Add Vehicle</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add vehicle</DialogTitle></DialogHeader>
                <form onSubmit={submitV} className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Vehicle # *</Label><Input required value={vForm.vehicle_number} onChange={setV("vehicle_number")} placeholder="MH-12-AB-1234" className="font-mono uppercase" data-testid="vehicle-number" /></div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={vForm.vehicle_type} onValueChange={(v) => setVForm({ ...vForm, vehicle_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["Truck", "Tempo", "Van", "Trailer", "Car", "Pickup"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Make / Model</Label><Input value={vForm.make_model} onChange={setV("make_model")} /></div>
                  <div className="space-y-1.5"><Label>Capacity</Label><Input value={vForm.capacity} onChange={setV("capacity")} placeholder="10 Ton" /></div>
                  <div className="space-y-1.5"><Label>Driver name</Label><Input value={vForm.driver_name} onChange={setV("driver_name")} /></div>
                  <div className="space-y-1.5"><Label>Driver phone</Label><Input value={vForm.driver_phone} onChange={setV("driver_phone")} /></div>
                  <div className="space-y-1.5"><Label>Fitness expiry</Label><Input type="date" value={vForm.fitness_expiry} onChange={setV("fitness_expiry")} /></div>
                  <div className="space-y-1.5"><Label>Insurance expiry</Label><Input type="date" value={vForm.insurance_expiry} onChange={setV("insurance_expiry")} /></div>
                  <DialogFooter className="col-span-2"><Button type="submit" disabled={saving} data-testid="vehicle-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Vehicle #</TableHead><TableHead>Type</TableHead><TableHead>Make/Model</TableHead><TableHead>Capacity</TableHead><TableHead>Driver</TableHead><TableHead>Insurance</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {vehicles.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No vehicles yet.</TableCell></TableRow>
                ) : vehicles.map((v) => (
                  <TableRow key={v.id} className="row-hover">
                    <TableCell className="font-mono font-semibold uppercase">{v.vehicle_number}</TableCell>
                    <TableCell><Badge variant="secondary">{v.vehicle_type}</Badge></TableCell>
                    <TableCell>{v.make_model || "—"}</TableCell>
                    <TableCell>{v.capacity || "—"}</TableCell>
                    <TableCell><div>{v.driver_name || "—"}</div><div className="text-xs text-muted-foreground">{v.driver_phone}</div></TableCell>
                    <TableCell className="text-sm">{v.insurance_expiry ? formatDate(v.insurance_expiry) : "—"}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => delV(v.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="trips" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={tOpen} onOpenChange={setTOpen}>
              <DialogTrigger asChild><Button data-testid="trip-add"><Plus className="h-4 w-4 mr-1.5" />New Trip</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New trip sheet</DialogTitle></DialogHeader>
                <form onSubmit={submitT} className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Vehicle *</Label>
                    <Select value={tForm.vehicle_id} onValueChange={pickVehicle}>
                      <SelectTrigger data-testid="trip-vehicle"><SelectValue placeholder="Pick vehicle" /></SelectTrigger>
                      <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicle_number} · {v.driver_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Customer</Label><Input value={tForm.customer_name} onChange={setT("customer_name")} /></div>
                  <div className="space-y-1.5"><Label>LR #</Label><Input value={tForm.lr_number} onChange={setT("lr_number")} className="font-mono" /></div>
                  <div className="space-y-1.5"><Label>From *</Label><Input required value={tForm.from_location} onChange={setT("from_location")} data-testid="trip-from" /></div>
                  <div className="space-y-1.5"><Label>To *</Label><Input required value={tForm.to_location} onChange={setT("to_location")} data-testid="trip-to" /></div>
                  <div className="space-y-1.5"><Label>Trip date</Label><Input type="date" value={tForm.trip_date} onChange={setT("trip_date")} /></div>
                  <div className="space-y-1.5"><Label>Goods</Label><Input value={tForm.goods_description} onChange={setT("goods_description")} /></div>
                  <div className="space-y-1.5"><Label>Freight (₹)</Label><Input type="number" value={tForm.freight_amount} onChange={setT("freight_amount")} /></div>
                  <div className="space-y-1.5"><Label>Diesel (₹)</Label><Input type="number" value={tForm.diesel_expense} onChange={setT("diesel_expense")} /></div>
                  <div className="space-y-1.5"><Label>Other expenses (₹)</Label><Input type="number" value={tForm.other_expenses} onChange={setT("other_expenses")} /></div>
                  <div className="space-y-1.5"><Label>Advance paid (₹)</Label><Input type="number" value={tForm.advance_paid} onChange={setT("advance_paid")} /></div>
                  <DialogFooter className="col-span-2"><Button type="submit" disabled={saving} data-testid="trip-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Trip #</TableHead><TableHead>Vehicle</TableHead><TableHead>Route</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Freight</TableHead><TableHead className="text-right">Expenses</TableHead><TableHead className="text-right">Profit</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {trips.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No trips yet.</TableCell></TableRow>
                ) : trips.map((t) => (
                  <TableRow key={t.id} className="row-hover">
                    <TableCell className="font-mono font-semibold">{t.trip_number}</TableCell>
                    <TableCell className="font-mono uppercase">{t.vehicle_number}</TableCell>
                    <TableCell><div className="font-medium">{t.from_location} → {t.to_location}</div><div className="text-xs text-muted-foreground">{t.customer_name}</div></TableCell>
                    <TableCell className="text-sm">{formatDate(t.trip_date)}</TableCell>
                    <TableCell className="text-right font-mono">{formatINR(t.freight_amount)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{formatINR((t.diesel_expense || 0) + (t.other_expenses || 0))}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${t.profit >= 0 ? "text-success" : "text-destructive"}`}>{formatINR(t.profit)}</TableCell>
                    <TableCell><Badge className={`${STATUS_COLOR[t.status]} border-0 capitalize`}>{t.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => delT(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
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
