import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { formatINR, formatDate } from "../lib/format";
import { toast } from "sonner";
import {
  Users, Building2, CreditCard, IndianRupee, ShieldAlert, KeyRound,
  Power, Loader2, Search, LogOut, Sun, Moon, FileText
} from "lucide-react";

function StatCard({ label, value, icon: Icon, tone = "default" }) {
  const toneCls = {
    default: "text-foreground",
    success: "text-success",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${toneCls}`} />
      </div>
      <div className={`mt-3 font-mono text-2xl lg:text-3xl font-bold tracking-tight ${toneCls}`}>{value}</div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [subs, setSubs] = useState([]);
  const [search, setSearch] = useState("");
  const [resetTarget, setResetTarget] = useState(null);
  const [newPwd, setNewPwd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return nav("/login");
    if (!user.is_super_admin) return nav("/app/dashboard");
    loadAll();
    // eslint-disable-next-line
  }, [user]);

  const loadAll = async () => {
    const [s, u, sub] = await Promise.all([
      api.get("/admin/stats"),
      api.get(`/admin/users?search=${encodeURIComponent(search)}`),
      api.get("/admin/subscriptions"),
    ]);
    setStats(s.data); setUsers(u.data); setSubs(sub.data);
  };

  const onSearch = async () => {
    const { data } = await api.get(`/admin/users?search=${encodeURIComponent(search)}`);
    setUsers(data);
  };

  const onReset = async () => {
    if (!resetTarget || newPwd.length < 6) return toast.error("Password must be ≥ 6 chars");
    setSaving(true);
    try {
      await api.post(`/admin/users/${resetTarget.id}/reset-password`, { new_password: newPwd });
      toast.success(`Password reset for ${resetTarget.email}`);
      setResetTarget(null); setNewPwd("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  const onToggleActive = async (u) => {
    const next = !(u.active !== false);
    try {
      await api.post(`/admin/users/${u.id}/toggle-active`, { active: next });
      toast.success(next ? "Account activated" : "Account deactivated");
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  if (!user || !user.is_super_admin) return null;
  if (!stats) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b border-border bg-card sticky top-0 z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-destructive flex items-center justify-center text-destructive-foreground">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display font-bold leading-none">AITAX Admin</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Platform Console</div>
          </div>
          <Badge variant="destructive" className="ml-2 hidden sm:inline-flex">Super Admin</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} data-testid="admin-theme-toggle">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <span className="text-sm font-medium hidden sm:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={logout} data-testid="admin-logout">
            <LogOut className="h-4 w-4 mr-1.5" /> Sign out
          </Button>
        </div>
      </header>

      <main className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Platform overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Every tenant, every subscription, every invoice — across AITAX.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total tenants" value={stats.total_users} icon={Users} />
          <StatCard label="Paid subscribers" value={stats.paid_subscribers} icon={CreditCard} tone="success" />
          <StatCard label="Businesses" value={stats.total_companies} icon={Building2} />
          <StatCard label="Invoices created" value={stats.total_invoices} icon={FileText} />
          <StatCard label="MRR (estimate)" value={formatINR(stats.mrr_estimate)} icon={IndianRupee} tone="primary" />
          <StatCard label="Lifetime revenue" value={formatINR(stats.platform_revenue_total)} icon={IndianRupee} tone="success" />
          <StatCard label="Active accounts" value={stats.active_users} icon={Power} />
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users" data-testid="admin-tab-users">Tenants</TabsTrigger>
            <TabsTrigger value="subs" data-testid="admin-tab-subs">Subscriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by email or name…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSearch()} className="pl-9" data-testid="admin-user-search" />
              </div>
              <Button variant="outline" onClick={onSearch}>Search</Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Auth</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No tenants yet.</TableCell></TableRow>
                  ) : users.map((u) => (
                    <TableRow key={u.id} className="row-hover" data-testid={`admin-user-row-${u.id}`}>
                      <TableCell>
                        <div className="font-medium">{u.full_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{u.auth_provider || "password"}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{u.subscription_plan || "trial"}</Badge></TableCell>
                      <TableCell>
                        {u.active === false ? (
                          <Badge variant="destructive">Deactivated</Badge>
                        ) : u.subscription_status === "active" ? (
                          <Badge className="bg-success/15 text-success border-0">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Trial</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(u.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setResetTarget(u)} data-testid={`admin-reset-${u.id}`}>
                          <KeyRound className="h-3.5 w-3.5 mr-1.5" /> Reset
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onToggleActive(u)} data-testid={`admin-toggle-${u.id}`}>
                          <Power className={`h-3.5 w-3.5 mr-1.5 ${u.active === false ? "text-destructive" : "text-success"}`} />
                          {u.active === false ? "Activate" : "Deactivate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="subs">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No subscriptions yet.</TableCell></TableRow>
                  ) : subs.map((s) => (
                    <TableRow key={s.id} className="row-hover">
                      <TableCell className="font-mono text-xs">{s.razorpay_order_id}</TableCell>
                      <TableCell className="capitalize">{s.plan_id}</TableCell>
                      <TableCell className="capitalize">{s.billing_cycle}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{formatINR(s.amount)}</TableCell>
                      <TableCell><Badge className={s.status === "paid" ? "bg-success/15 text-success border-0" : "bg-muted"}>{s.status}</Badge></TableCell>
                      <TableCell className="text-sm">{formatDate(s.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!resetTarget} onOpenChange={(v) => { if (!v) { setResetTarget(null); setNewPwd(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password for {resetTarget?.email}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Set a new password. The user will be able to login with it immediately. Inform them via your own channel (email, phone).</p>
            <Label>New password</Label>
            <Input type="text" minLength={6} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Min 6 characters" data-testid="admin-reset-password-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={onReset} disabled={saving} data-testid="admin-reset-submit">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
