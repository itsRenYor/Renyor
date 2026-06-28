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
import { Plus, Trash2, Loader2, Wrench, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const TICKET_EMPTY = { customer_name: "", customer_phone: "", problem: "", asset: "", priority: "normal", scheduled_date: today(), technician: "", status: "open", notes: "", service_charge: 0 };
const AMC_EMPTY = { customer_name: "", customer_phone: "", asset: "", plan_name: "Standard AMC", start_date: today(), end_date: "", amount: 0, billing_cycle: "yearly", visits_per_year: 4, status: "active", notes: "" };

const STATUS_COLOR = {
  open: "bg-primary/10 text-primary", assigned: "bg-warning/15 text-warning",
  in_progress: "bg-warning/15 text-warning", completed: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground",
  active: "bg-success/15 text-success", expiring_soon: "bg-warning/15 text-warning",
  expired: "bg-destructive/15 text-destructive",
};

function TicketForm({ onClose, onSaved }) {
  const [form, setForm] = useState(TICKET_EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: typeof e === "string" ? e : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post("/services/tickets", { ...form, service_charge: parseFloat(form.service_charge) || 0 });
      toast.success("Ticket created"); onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1.5"><Label>Customer name *</Label><Input required value={form.customer_name} onChange={set("customer_name")} data-testid="ticket-customer" /></div>
      <div className="space-y-1.5"><Label>Phone</Label><Input value={form.customer_phone} onChange={set("customer_phone")} /></div>
      <div className="space-y-1.5"><Label>Asset / Item</Label><Input value={form.asset} onChange={set("asset")} placeholder="e.g., Samsung TV" /></div>
      <div className="col-span-2 space-y-1.5"><Label>Problem *</Label><Input required value={form.problem} onChange={set("problem")} data-testid="ticket-problem" /></div>
      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{["low", "normal", "high", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger data-testid="ticket-status"><SelectValue /></SelectTrigger>
          <SelectContent>{["open", "assigned", "in_progress", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Scheduled date</Label><Input type="date" value={form.scheduled_date} onChange={set("scheduled_date")} /></div>
      <div className="space-y-1.5"><Label>Technician</Label><Input value={form.technician} onChange={set("technician")} /></div>
      <div className="space-y-1.5"><Label>Service charge (₹)</Label><Input type="number" value={form.service_charge} onChange={set("service_charge")} /></div>
      <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={set("notes")} /></div>
      <DialogFooter className="col-span-2">
        <Button type="submit" disabled={saving} data-testid="ticket-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create ticket</Button>
      </DialogFooter>
    </form>
  );
}

function AmcForm({ onClose, onSaved }) {
  const [form, setForm] = useState(AMC_EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: typeof e === "string" ? e : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.end_date) return toast.error("Set an end date");
    setSaving(true);
    try {
      await api.post("/services/amc", { ...form, amount: parseFloat(form.amount) || 0, visits_per_year: parseInt(form.visits_per_year) || 0 });
      toast.success("AMC created"); onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1.5"><Label>Customer name *</Label><Input required value={form.customer_name} onChange={set("customer_name")} data-testid="amc-customer" /></div>
      <div className="space-y-1.5"><Label>Phone</Label><Input value={form.customer_phone} onChange={set("customer_phone")} /></div>
      <div className="space-y-1.5"><Label>Asset *</Label><Input required value={form.asset} onChange={set("asset")} placeholder="e.g., AC, Generator" /></div>
      <div className="col-span-2 space-y-1.5"><Label>Plan name</Label><Input value={form.plan_name} onChange={set("plan_name")} /></div>
      <div className="space-y-1.5"><Label>Start date *</Label><Input type="date" required value={form.start_date} onChange={set("start_date")} /></div>
      <div className="space-y-1.5"><Label>End date *</Label><Input type="date" required value={form.end_date} onChange={set("end_date")} data-testid="amc-end-date" /></div>
      <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={set("amount")} /></div>
      <div className="space-y-1.5">
        <Label>Billing cycle</Label>
        <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{["monthly", "quarterly", "halfyearly", "yearly"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Visits / year</Label><Input type="number" value={form.visits_per_year} onChange={set("visits_per_year")} /></div>
      <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={set("notes")} /></div>
      <DialogFooter className="col-span-2">
        <Button type="submit" disabled={saving} data-testid="amc-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create contract</Button>
      </DialogFooter>
    </form>
  );
}

export default function Services() {
  const [tickets, setTickets] = useState([]);
  const [amcs, setAmcs] = useState([]);
  const [tOpen, setTOpen] = useState(false);
  const [aOpen, setAOpen] = useState(false);

  const load = async () => {
    const [t, a] = await Promise.all([api.get("/services/tickets"), api.get("/services/amc")]);
    setTickets(t.data); setAmcs(a.data);
  };
  useEffect(() => { load(); }, []);

  const deleteTicket = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/services/tickets/${id}`); load(); };
  const deleteAmc = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/services/amc/${id}`); load(); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Service Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Service tickets, technician assignments & AMC contracts.</p>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets" data-testid="svc-tab-tickets"><Wrench className="h-3.5 w-3.5 mr-1.5" />Service Tickets ({tickets.length})</TabsTrigger>
          <TabsTrigger value="amc" data-testid="svc-tab-amc"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />AMC Contracts ({amcs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={tOpen} onOpenChange={setTOpen}>
              <DialogTrigger asChild><Button data-testid="ticket-add"><Plus className="h-4 w-4 mr-1.5" />New Ticket</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>New service ticket</DialogTitle></DialogHeader>
                <TicketForm onClose={() => setTOpen(false)} onSaved={load} />
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Ticket #</TableHead><TableHead>Customer</TableHead><TableHead>Problem</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Scheduled</TableHead><TableHead>Technician</TableHead><TableHead className="text-right">Charge</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {tickets.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No tickets yet — create your first service ticket.</TableCell></TableRow>
                ) : tickets.map((t) => (
                  <TableRow key={t.id} className="row-hover" data-testid={`ticket-row-${t.id}`}>
                    <TableCell className="font-mono font-semibold">{t.ticket_number}</TableCell>
                    <TableCell><div className="font-medium">{t.customer_name}</div><div className="text-xs text-muted-foreground">{t.customer_phone}</div></TableCell>
                    <TableCell className="max-w-xs"><div className="truncate">{t.problem}</div><div className="text-xs text-muted-foreground">{t.asset}</div></TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{t.priority}</Badge></TableCell>
                    <TableCell><Badge className={`${STATUS_COLOR[t.status] || "bg-muted"} border-0 capitalize`}>{t.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-sm">{t.scheduled_date ? formatDate(t.scheduled_date) : "—"}</TableCell>
                    <TableCell>{t.technician || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{t.service_charge ? formatINR(t.service_charge) : "—"}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => deleteTicket(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="amc" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={aOpen} onOpenChange={setAOpen}>
              <DialogTrigger asChild><Button data-testid="amc-add"><Plus className="h-4 w-4 mr-1.5" />New AMC</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>New AMC contract</DialogTitle></DialogHeader>
                <AmcForm onClose={() => setAOpen(false)} onSaved={load} />
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Contract #</TableHead><TableHead>Customer</TableHead><TableHead>Asset</TableHead><TableHead>Start - End</TableHead><TableHead>Days Left</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Cycle</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {amcs.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No AMC contracts yet.</TableCell></TableRow>
                ) : amcs.map((a) => (
                  <TableRow key={a.id} className="row-hover" data-testid={`amc-row-${a.id}`}>
                    <TableCell className="font-mono font-semibold">{a.contract_number}</TableCell>
                    <TableCell><div className="font-medium">{a.customer_name}</div><div className="text-xs text-muted-foreground">{a.customer_phone}</div></TableCell>
                    <TableCell>{a.asset}</TableCell>
                    <TableCell className="text-sm">{formatDate(a.start_date)} → {formatDate(a.end_date)}</TableCell>
                    <TableCell><span className={a.days_remaining <= 30 ? "text-destructive font-semibold" : ""}>{a.days_remaining < 0 ? "Expired" : `${a.days_remaining}d`}</span></TableCell>
                    <TableCell className="text-right font-mono">{formatINR(a.amount)}</TableCell>
                    <TableCell className="text-xs capitalize">{a.billing_cycle}</TableCell>
                    <TableCell><Badge className={`${STATUS_COLOR[a.status] || "bg-muted"} border-0 capitalize`}>{a.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => deleteAmc(a.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
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
