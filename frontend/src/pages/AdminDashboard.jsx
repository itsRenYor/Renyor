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
import { Switch } from "../components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { formatINR, formatDate } from "../lib/format";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Users, Building2, CreditCard, IndianRupee, ShieldAlert, KeyRound, Power, Loader2,
  Search, LogOut, Sun, Moon, FileText, Flag, Settings, Eye, Clock, RefreshCw,
  TrendingUp, AlertTriangle, Download, Upload, Webhook, History, Wrench, Activity,
} from "lucide-react";

function StatCard({ label, value, icon: Icon, tone = "default" }) {
  const t = { default: "text-foreground", success: "text-success", primary: "text-primary", warn: "text-warning", danger: "text-destructive" }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${t}`} />
      </div>
      <div className={`mt-3 font-mono text-2xl lg:text-3xl font-bold tracking-tight ${t}`}>{value}</div>
    </Card>
  );
}

const PLAN_OPTIONS = ["trial", "starter", "pro", "enterprise"];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [subs, setSubs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [settings, setSettings] = useState(null);
  const [flags, setFlags] = useState({});
  const [audits, setAudits] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [signupTrend, setSignupTrend] = useState([]);
  const [mrrTrend, setMrrTrend] = useState([]);

  const [search, setSearch] = useState("");
  const [resetTarget, setResetTarget] = useState(null);
  const [newPwd, setNewPwd] = useState("");
  const [planTarget, setPlanTarget] = useState(null);
  const [planChoice, setPlanChoice] = useState("pro");
  const [planDays, setPlanDays] = useState(30);
  const [trialDays, setTrialDays] = useState(14);
  const [snapshot, setSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [restoreMode, setRestoreMode] = useState("merge");

  useEffect(() => {
    if (!user) return nav("/login");
    if (!user.is_super_admin) return nav("/app/dashboard");
    loadAll();
    // eslint-disable-next-line
  }, [user]);

  const loadAll = async () => {
    try {
      const [s, u, sub, p, set, f, a, w, st, mt] = await Promise.all([
        api.get("/admin/stats"),
        api.get(`/admin/users?search=${encodeURIComponent(search)}`),
        api.get("/admin/subscriptions"),
        api.get("/admin/plans"),
        api.get("/admin/settings"),
        api.get("/admin/feature-flags"),
        api.get("/admin/audit-logs?limit=100"),
        api.get("/admin/webhook-events?limit=50"),
        api.get("/admin/analytics/signups?days=30"),
        api.get("/admin/analytics/mrr-trend?months=6"),
      ]);
      setStats(s.data); setUsers(u.data); setSubs(sub.data); setPlans(p.data);
      setSettings(set.data); setFlags(f.data); setAudits(a.data); setWebhooks(w.data);
      setSignupTrend(st.data); setMrrTrend(mt.data);
    } catch (err) {
      toast.error("Failed to load admin data");
    }
  };

  const onSearch = async () => {
    const { data } = await api.get(`/admin/users?search=${encodeURIComponent(search)}`);
    setUsers(data);
  };

  const onReset = async () => {
    if (!resetTarget || newPwd.length < 6) return toast.error("Min 6 chars");
    setSaving(true);
    try {
      await api.post(`/admin/users/${resetTarget.id}/reset-password`, { new_password: newPwd });
      toast.success(`Password reset for ${resetTarget.email}`);
      setResetTarget(null); setNewPwd(""); loadAll();
    } catch (e) { toast.error("Failed"); } finally { setSaving(false); }
  };

  const onToggleActive = async (u) => {
    const next = !(u.active !== false);
    try {
      await api.post(`/admin/users/${u.id}/toggle-active`, { active: next });
      toast.success(next ? "Activated" : "Deactivated"); loadAll();
    } catch (e) { toast.error("Failed"); }
  };

  const onExtendTrial = async (uid) => {
    try {
      await api.post(`/admin/users/${uid}/extend-trial`, { days: trialDays });
      toast.success(`Trial extended by ${trialDays}d`); loadAll();
    } catch (e) { toast.error("Failed"); }
  };

  const onSetPlan = async () => {
    if (!planTarget) return;
    setSaving(true);
    try {
      await api.post(`/admin/users/${planTarget.id}/set-plan`,
        { plan_id: planChoice, billing_cycle: "monthly", days: parseInt(planDays) || 30 });
      toast.success("Plan updated"); setPlanTarget(null); loadAll();
    } catch (e) { toast.error("Failed"); } finally { setSaving(false); }
  };

  const onCancelSub = async (uid) => {
    if (!window.confirm("Cancel this user's subscription?")) return;
    await api.post(`/admin/users/${uid}/cancel-subscription`);
    toast.success("Cancelled"); loadAll();
  };

  const onViewSnapshot = async (uid) => {
    try {
      const { data } = await api.get(`/admin/users/${uid}/snapshot`);
      setSnapshot(data);
    } catch (e) { toast.error("Failed"); }
  };

  const onToggleSetting = async (key, value) => {
    try {
      await api.put("/admin/settings", { [key]: value });
      toast.success(`${key} updated`); loadAll();
    } catch (e) { toast.error("Failed"); }
  };

  const onToggleFlag = async (key) => {
    const updated = { ...flags, [key]: !flags[key] };
    try {
      await api.put("/admin/feature-flags", updated);
      setFlags(updated); toast.success(`${key} ${updated[key] ? "ON" : "OFF"}`);
    } catch (e) { toast.error("Failed"); }
  };

  const onBackup = async () => {
    try {
      const { data } = await api.get("/admin/backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `aitax-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(a.href);
      toast.success("Backup downloaded");
    } catch (e) { toast.error("Backup failed"); }
  };

  const onRestore = async () => {
    try {
      const parsed = JSON.parse(restoreText);
      const data = parsed.data || parsed;
      await api.post("/admin/restore", { data, mode: restoreMode });
      toast.success("Restored");
      setRestoreOpen(false); setRestoreText(""); loadAll();
    } catch (e) { toast.error("Invalid JSON or restore failed"); }
  };

  if (!user || !user.is_super_admin) return null;
  if (!stats || !settings) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b border-border bg-card sticky top-0 z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-destructive flex items-center justify-center text-destructive-foreground">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display font-bold leading-none">{settings.platform_name} Admin</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Platform Owner Console</div>
          </div>
          <Badge variant="destructive" className="ml-2 hidden sm:inline-flex">Super Admin</Badge>
          {settings.maintenance_mode && <Badge className="bg-warning text-warning-foreground border-0 ml-1 animate-pulse">MAINTENANCE ON</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={loadAll} data-testid="admin-refresh"><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={toggle} data-testid="admin-theme-toggle">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <span className="text-sm font-medium hidden sm:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={logout} data-testid="admin-logout"><LogOut className="h-4 w-4 mr-1.5" />Sign out</Button>
        </div>
      </header>

      <main className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Platform Owner Console</h1>
          <p className="text-sm text-muted-foreground mt-1">Total control — tenants, subscriptions, settings, security, backups, and analytics.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Tenants" value={stats.total_users} icon={Users} />
          <StatCard label="Paid subs" value={stats.paid_subscribers} icon={CreditCard} tone="success" />
          <StatCard label="MRR" value={formatINR(stats.mrr_estimate)} icon={IndianRupee} tone="primary" />
          <StatCard label="Lifetime revenue" value={formatINR(stats.platform_revenue_total)} icon={TrendingUp} tone="success" />
          <StatCard label="Trial users" value={stats.trial_users} icon={Clock} />
          <StatCard label="New (30d)" value={stats.new_signups_30d} icon={Users} tone="primary" />
          <StatCard label="Conversion" value={`${stats.conversion_rate_pct}%`} icon={Activity} />
          <StatCard label="Invoices created" value={stats.total_invoices} icon={FileText} />
        </div>

        <Tabs defaultValue="tenants">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="tenants" data-testid="admin-tab-tenants"><Users className="h-3.5 w-3.5 mr-1.5" />Tenants</TabsTrigger>
            <TabsTrigger value="subs" data-testid="admin-tab-subs"><CreditCard className="h-3.5 w-3.5 mr-1.5" />Subscriptions</TabsTrigger>
            <TabsTrigger value="plans" data-testid="admin-tab-plans">Plans</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="admin-tab-analytics"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Analytics</TabsTrigger>
            <TabsTrigger value="settings" data-testid="admin-tab-settings"><Settings className="h-3.5 w-3.5 mr-1.5" />Settings</TabsTrigger>
            <TabsTrigger value="flags" data-testid="admin-tab-flags"><Flag className="h-3.5 w-3.5 mr-1.5" />Feature Flags</TabsTrigger>
            <TabsTrigger value="audit" data-testid="admin-tab-audit"><History className="h-3.5 w-3.5 mr-1.5" />Audit</TabsTrigger>
            <TabsTrigger value="webhooks" data-testid="admin-tab-webhooks"><Webhook className="h-3.5 w-3.5 mr-1.5" />Webhooks</TabsTrigger>
            <TabsTrigger value="backup" data-testid="admin-tab-backup"><Download className="h-3.5 w-3.5 mr-1.5" />Backup</TabsTrigger>
          </TabsList>

          {/* TENANTS */}
          <TabsContent value="tenants" className="space-y-3">
            <div className="flex gap-2 items-end">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSearch()} className="pl-9" data-testid="admin-user-search" />
              </div>
              <Button variant="outline" onClick={onSearch}>Search</Button>
              <div className="ml-auto flex items-end gap-2">
                <div><Label className="text-xs">Trial extension (days)</Label><Input type="number" className="w-24" value={trialDays} onChange={(e) => setTrialDays(parseInt(e.target.value) || 14)} /></div>
              </div>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Auth</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No tenants.</TableCell></TableRow>
                  ) : users.map((u) => (
                    <TableRow key={u.id} className="row-hover" data-testid={`admin-user-row-${u.id}`}>
                      <TableCell><div className="font-medium">{u.full_name}</div><div className="text-xs text-muted-foreground font-mono">{u.email}</div></TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize text-xs">{u.auth_provider || "password"}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{u.subscription_plan || "trial"}</Badge></TableCell>
                      <TableCell>{u.active === false ? <Badge variant="destructive">Deactivated</Badge> : u.subscription_status === "active" ? <Badge className="bg-success/15 text-success border-0">Active</Badge> : <Badge variant="secondary">Trial</Badge>}</TableCell>
                      <TableCell className="text-xs font-mono">{u.subscription_expires_at ? formatDate(u.subscription_expires_at) : "—"}</TableCell>
                      <TableCell className="text-xs">{formatDate(u.created_at)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" title="View as user" onClick={() => onViewSnapshot(u.id)} data-testid={`admin-view-${u.id}`}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Reset pwd" onClick={() => setResetTarget(u)} data-testid={`admin-reset-${u.id}`}><KeyRound className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Extend trial" onClick={() => onExtendTrial(u.id)} data-testid={`admin-extend-${u.id}`}><Clock className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Set plan" onClick={() => { setPlanTarget(u); setPlanChoice(u.subscription_plan || "pro"); }} data-testid={`admin-setplan-${u.id}`}><CreditCard className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Cancel" onClick={() => onCancelSub(u.id)}><AlertTriangle className="h-3.5 w-3.5 text-warning" /></Button>
                        <Button size="sm" variant="ghost" title="Toggle active" onClick={() => onToggleActive(u)} data-testid={`admin-toggle-${u.id}`}><Power className={`h-3.5 w-3.5 ${u.active === false ? "text-destructive" : "text-success"}`} /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* SUBSCRIPTIONS */}
          <TabsContent value="subs">
            <Card>
              <Table>
                <TableHeader><TableRow><TableHead>Order ID</TableHead><TableHead>Plan</TableHead><TableHead>Cycle</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
                <TableBody>
                  {subs.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No subscriptions yet.</TableCell></TableRow> : subs.map((s) => (
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

          {/* PLANS */}
          <TabsContent value="plans" className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-lg">{p.name}</h3>
                  {p.popular && <Badge>Popular</Badge>}
                </div>
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Monthly</span><span className="font-mono">{formatINR(p.monthly)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Quarterly</span><span className="font-mono">{formatINR(p.quarterly)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Yearly</span><span className="font-mono">{formatINR(p.yearly)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Businesses</span><span className="font-mono">{p.businesses === -1 ? "Unlimited" : p.businesses}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Users</span><span className="font-mono">{p.users === -1 ? "Unlimited" : p.users}</span></div>
                </div>
                <div className="mt-4 text-xs text-muted-foreground">{(p.features || []).join(" · ")}</div>
              </Card>
            ))}
            <Card className="p-5 col-span-full text-xs text-muted-foreground">
              💡 To edit plan pricing/features, use API: <code className="font-mono">PUT /api/admin/plans/{`{id}`}</code> with full plan JSON. UI editor coming soon.
            </Card>
          </TabsContent>

          {/* ANALYTICS */}
          <TabsContent value="analytics" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-display font-semibold text-lg">Signups (last 30 days)</h3>
              <div className="h-56 mt-4">
                {signupTrend.length === 0 ? <div className="text-sm text-muted-foreground text-center py-10">No data yet.</div> : (
                  <ResponsiveContainer><AreaChart data={signupTrend}>
                    <defs><linearGradient id="su" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" fontSize={10} stroke="hsl(var(--muted-foreground))" /><YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                    <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#su)" />
                  </AreaChart></ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-display font-semibold text-lg">MRR & subscriptions (last 6 months)</h3>
              <div className="h-56 mt-4">
                {mrrTrend.length === 0 ? <div className="text-sm text-muted-foreground text-center py-10">No paid subs yet.</div> : (
                  <ResponsiveContainer><AreaChart data={mrrTrend}>
                    <defs><linearGradient id="mr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} /><stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" fontSize={10} /><YAxis fontSize={10} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#mr)" />
                  </AreaChart></ResponsiveContainer>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-4">
            <Card className="p-6 border-warning/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-lg flex items-center gap-2"><Wrench className="h-5 w-5 text-warning" /> Maintenance mode</h3>
                  <p className="text-sm text-muted-foreground mt-1">When ON, all tenant API endpoints return 503. Admin endpoints stay accessible.</p>
                </div>
                <Switch checked={!!settings.maintenance_mode} onCheckedChange={(v) => onToggleSetting("maintenance_mode", v)} data-testid="setting-maintenance-toggle" />
              </div>
              {settings.maintenance_mode && (
                <div className="mt-3 space-y-1.5">
                  <Label className="text-xs">Maintenance message shown to tenants</Label>
                  <Input value={settings.maintenance_message} onChange={(e) => setSettings({ ...settings, maintenance_message: e.target.value })} onBlur={(e) => onToggleSetting("maintenance_message", e.target.value)} />
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="font-display font-bold text-lg">Platform identity</h3>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Platform name</Label><Input value={settings.platform_name} onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })} onBlur={(e) => onToggleSetting("platform_name", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Support email</Label><Input value={settings.support_email} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} onBlur={(e) => onToggleSetting("support_email", e.target.value)} /></div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-display font-bold text-lg">Signup policy</h3>
              <div className="mt-4 space-y-1.5 max-w-sm">
                <Label>Signup mode</Label>
                <Select value={settings.signup_mode} onValueChange={(v) => onToggleSetting("signup_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open (anyone can sign up)</SelectItem>
                    <SelectItem value="approval">Approval required</SelectItem>
                    <SelectItem value="invite">Invite-only</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-display font-bold text-lg">Security policy</h3>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div><Label>Password min length</Label><Input type="number" value={settings.security?.password_min_length || 6} onChange={(e) => setSettings({ ...settings, security: { ...settings.security, password_min_length: parseInt(e.target.value) || 6 } })} onBlur={() => onToggleSetting("security", settings.security)} /></div>
                <div><Label>JWT lifetime (min)</Label><Input type="number" value={settings.security?.jwt_expire_minutes || 1440} onChange={(e) => setSettings({ ...settings, security: { ...settings.security, jwt_expire_minutes: parseInt(e.target.value) || 1440 } })} onBlur={() => onToggleSetting("security", settings.security)} /></div>
                <div><Label>Max failed logins</Label><Input type="number" value={settings.security?.max_failed_logins || 5} onChange={(e) => setSettings({ ...settings, security: { ...settings.security, max_failed_logins: parseInt(e.target.value) || 5 } })} onBlur={() => onToggleSetting("security", settings.security)} /></div>
                <div className="flex items-center justify-between mt-6"><Label>Enforce 2FA</Label><Switch checked={!!settings.security?.enforce_2fa} onCheckedChange={(v) => onToggleSetting("security", { ...settings.security, enforce_2fa: v })} /></div>
              </div>
            </Card>
          </TabsContent>

          {/* FLAGS */}
          <TabsContent value="flags" className="space-y-3">
            <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(flags).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between p-3 rounded-md border border-border" data-testid={`flag-${k}`}>
                  <div>
                    <div className="font-medium capitalize">{k.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{k}</div>
                  </div>
                  <Switch checked={!!v} onCheckedChange={() => onToggleFlag(k)} />
                </div>
              ))}
            </Card>
          </TabsContent>

          {/* AUDIT */}
          <TabsContent value="audit">
            <Card>
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                <TableBody>
                  {audits.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No audit entries yet.</TableCell></TableRow> : audits.map((a) => (
                    <TableRow key={a.id} className="row-hover">
                      <TableCell className="text-xs font-mono">{a.created_at?.slice(0, 19).replace("T", " ")}</TableCell>
                      <TableCell className="text-xs">{a.actor_email || "system"}</TableCell>
                      <TableCell><Badge variant="secondary" className="font-mono text-xs">{a.action}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{a.target || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">{JSON.stringify(a.details || {})}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* WEBHOOKS */}
          <TabsContent value="webhooks">
            <Card>
              <Table>
                <TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Provider</TableHead><TableHead>Event</TableHead><TableHead>Verified</TableHead></TableRow></TableHeader>
                <TableBody>
                  {webhooks.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">No webhook events received.</TableCell></TableRow> : webhooks.map((w) => (
                    <TableRow key={w.id} className="row-hover">
                      <TableCell className="text-xs font-mono">{w.received_at?.slice(0, 19).replace("T", " ")}</TableCell>
                      <TableCell className="capitalize">{w.provider}</TableCell>
                      <TableCell><Badge variant="secondary" className="font-mono text-xs">{w.event}</Badge></TableCell>
                      <TableCell>{w.verified ? <Badge className="bg-success/15 text-success border-0">Verified</Badge> : <Badge variant="destructive" className="text-xs">Unverified</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* BACKUP */}
          <TabsContent value="backup" className="space-y-4">
            <Card className="p-6">
              <h3 className="font-display font-bold text-lg flex items-center gap-2"><Download className="h-5 w-5" /> Backup</h3>
              <p className="text-sm text-muted-foreground mt-1">Download a JSON snapshot of all collections. Store securely off-platform.</p>
              <Button className="mt-4" onClick={onBackup} data-testid="admin-backup-export"><Download className="h-4 w-4 mr-2" /> Download backup JSON</Button>
            </Card>
            <Card className="p-6 border-warning/30">
              <h3 className="font-display font-bold text-lg flex items-center gap-2"><Upload className="h-5 w-5 text-warning" /> Restore</h3>
              <p className="text-sm text-muted-foreground mt-1">⚠ Restore from a previously downloaded backup. `replace` mode wipes existing data first; `merge` adds without deleting.</p>
              <Button className="mt-4" variant="outline" onClick={() => setRestoreOpen(true)}><Upload className="h-4 w-4 mr-2" /> Upload backup JSON</Button>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(v) => { if (!v) { setResetTarget(null); setNewPwd(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password for {resetTarget?.email}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>New password</Label>
            <Input type="text" minLength={6} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Min 6 characters" data-testid="admin-reset-password-input" />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button><Button onClick={onReset} disabled={saving} data-testid="admin-reset-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Reset</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set plan dialog */}
      <Dialog open={!!planTarget} onOpenChange={(v) => !v && setPlanTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set plan — {planTarget?.email}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Plan</Label>
            <Select value={planChoice} onValueChange={setPlanChoice}>
              <SelectTrigger data-testid="admin-setplan-select"><SelectValue /></SelectTrigger>
              <SelectContent>{PLAN_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Label>Active for (days)</Label>
            <Input type="number" value={planDays} onChange={(e) => setPlanDays(e.target.value)} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPlanTarget(null)}>Cancel</Button><Button onClick={onSetPlan} disabled={saving} data-testid="admin-setplan-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View user snapshot */}
      <Dialog open={!!snapshot} onOpenChange={(v) => !v && setSnapshot(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>View as: {snapshot?.user?.full_name} ({snapshot?.user?.email})</DialogTitle></DialogHeader>
          {snapshot && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Customers" value={snapshot.stats.customer_count} icon={Users} />
                <StatCard label="Suppliers" value={snapshot.stats.supplier_count} icon={Users} />
                <StatCard label="Products" value={snapshot.stats.product_count} icon={FileText} />
                <StatCard label="Total Sales" value={formatINR(snapshot.stats.total_sales)} icon={IndianRupee} tone="success" />
              </div>
              <div>
                <h4 className="font-semibold mt-3 mb-2">Companies ({snapshot.companies.length})</h4>
                <ul className="text-xs space-y-1">{snapshot.companies.map((c) => <li key={c.id} className="font-mono">{c.name} · {c.gstin || "no GSTIN"} · {c.city}</li>)}</ul>
              </div>
              <div>
                <h4 className="font-semibold mt-3 mb-2">Recent invoices ({snapshot.recent_invoices.length})</h4>
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Party</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {snapshot.recent_invoices.map((i) => (
                      <TableRow key={i.id}><TableCell className="font-mono text-xs">{i.invoice_number}</TableCell><TableCell className="text-xs">{i.invoice_date}</TableCell><TableCell>{i.party_name}</TableCell><TableCell className="text-right font-mono">{formatINR(i.grand_total)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-xs text-muted-foreground border-t pt-2">🔒 Read-only view — this access was logged.</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore dialog */}
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Restore from backup JSON</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Mode</Label>
            <Select value={restoreMode} onValueChange={setRestoreMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="merge">Merge (safer)</SelectItem><SelectItem value="replace">Replace (wipes existing)</SelectItem></SelectContent>
            </Select>
            <Label>Paste backup JSON</Label>
            <textarea className="w-full h-48 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono" value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder='{"exported_at":"...","data":{...}}' />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRestoreOpen(false)}>Cancel</Button><Button onClick={onRestore} variant="destructive"><Upload className="h-4 w-4 mr-2" /> Restore</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
