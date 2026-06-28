import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { formatINR } from "../lib/format";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, Package, AlertTriangle, Wallet,
  ArrowDownRight, ArrowUpRight, Receipt, ShoppingBag, IndianRupee
} from "lucide-react";

function Kpi({ label, value, sub, icon: Icon, tone = "default", testid, delay = 0 }) {
  const toneCls = {
    default: "text-foreground",
    success: "text-success",
    danger: "text-destructive",
    warning: "text-warning",
    terracotta: "text-terracotta",
  }[tone];
  return (
    <Card
      className="p-5 kpi-reveal"
      style={{ animationDelay: `${delay}ms` }}
      data-testid={testid}
    >
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${toneCls}`} />
      </div>
      <div className={`mt-3 font-mono text-2xl lg:text-3xl font-bold tracking-tight ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const [kpi, setKpi] = useState(null);
  const [trend, setTrend] = useState([]);
  const [top, setTop] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/dashboard/kpis"),
      api.get("/dashboard/revenue-trend?days=30"),
      api.get("/dashboard/top-customers?limit=5"),
    ]).then(([k, t, c]) => {
      setKpi(k.data);
      setTrend(t.data);
      setTop(c.data);
    });
  }, []);

  if (!kpi) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">A real-time pulse of your business.</p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></div>
          Live
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Today's Sales" value={formatINR(kpi.sales_today)} sub={`${kpi.sales_today_count} invoices`} icon={Receipt} testid="kpi-sales-today" delay={0} />
        <Kpi label="Today's Receipts" value={formatINR(kpi.receipts_today)} icon={IndianRupee} tone="success" testid="kpi-receipts" delay={50} />
        <Kpi label="Receivables" value={formatINR(kpi.receivables)} sub="Outstanding from customers" icon={ArrowUpRight} tone="terracotta" testid="kpi-receivables" delay={100} />
        <Kpi label="Payables" value={formatINR(kpi.payables)} sub="Outstanding to suppliers" icon={ArrowDownRight} tone="warning" testid="kpi-payables" delay={150} />

        <Kpi label="Inventory Value" value={formatINR(kpi.inventory_value)} icon={Package} testid="kpi-inventory" delay={200} />
        <Kpi label="Profit (lifetime)" value={formatINR(kpi.profit)} sub={`Sales: ${formatINR(kpi.total_sales)}`} icon={kpi.profit >= 0 ? TrendingUp : TrendingDown} tone={kpi.profit >= 0 ? "success" : "danger"} testid="kpi-profit" delay={250} />
        <Kpi label="Low Stock Alerts" value={kpi.low_stock_count} sub="Below minimum stock" icon={AlertTriangle} tone={kpi.low_stock_count > 0 ? "danger" : "default"} testid="kpi-low-stock" delay={300} />
        <Kpi label="Customers / Products" value={`${kpi.customers_count} / ${kpi.products_count}`} sub={`${kpi.suppliers_count} suppliers`} icon={Users} testid="kpi-counts" delay={350} />
      </div>

      {/* Chart + Top customers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-lg">Revenue trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 30 days</p>
            </div>
          </div>
          {trend.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              No sales yet — create your first invoice to see the trend.
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-lg">Top customers</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">By revenue</p>
          {top.length > 0 ? (
            <div className="space-y-3">
              {top.map((t, i) => (
                <div key={t.name} className="flex items-center justify-between text-sm" data-testid={`top-customer-${i}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {t.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.invoices} invoices</div>
                    </div>
                  </div>
                  <div className="font-mono font-semibold">{formatINR(t.total)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-8 text-center">No customer revenue yet.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
