import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { formatINR } from "../lib/format";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function Pricing({ inApp = false }) {
  const [plans, setPlans] = useState([]);
  const [cycle, setCycle] = useState("monthly");
  const [status, setStatus] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    api.get("/subscription/plans").then(({ data }) => setPlans(data.plans));
    if (user) api.get("/subscription/status").then(({ data }) => setStatus(data));
  }, [user]);

  const onSubscribe = async (planId) => {
    if (!user) { nav("/register"); return; }
    setLoadingPlan(planId);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Failed to load payment SDK"); setLoadingPlan(null); return; }
      const { data: order } = await api.post("/subscription/create-order", { plan_id: planId, billing_cycle: cycle });
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "AITAX",
        description: `${order.plan_name} — ${cycle}`,
        prefill: { name: user.full_name, email: user.email, contact: user.phone || "" },
        theme: { color: "#0A5C36" },
        handler: async (resp) => {
          try {
            await api.post("/subscription/verify-payment", { ...resp, plan_id: planId, billing_cycle: cycle });
            toast.success("Subscription activated 🎉");
            const { data } = await api.get("/subscription/status"); setStatus(data);
          } catch (e) {
            toast.error("Payment verification failed");
          }
        },
        modal: { ondismiss: () => setLoadingPlan(null) },
      });
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setLoadingPlan(null); }
  };

  return (
    <div className={inApp ? "" : "min-h-screen bg-background"}>
      {!inApp && (
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-display font-bold">A</div>
              <span className="font-display font-bold text-xl">AITAX</span>
            </Link>
            {user ? (
              <Button onClick={() => nav("/app/dashboard")}>Open App</Button>
            ) : (
              <div className="flex gap-2"><Button variant="ghost" onClick={() => nav("/login")}>Login</Button><Button onClick={() => nav("/register")}>Sign up</Button></div>
            )}
          </div>
        </header>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center max-w-2xl mx-auto">
          <Badge className="bg-primary/10 text-primary border-0" data-testid="pricing-badge"><Sparkles className="h-3 w-3 mr-1.5" /> Simple, transparent pricing</Badge>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-4">Plans for every Bharat business</h1>
          <p className="mt-4 text-muted-foreground">From a single kirana store to a multi-branch distributor. 14-day free trial on every plan.</p>
        </div>

        {status && status.status === "active" && (
          <Card className="mt-8 p-4 bg-success/10 border-success/30 text-center">
            <div className="text-sm font-medium">You're on the <span className="text-success font-bold capitalize">{status.plan}</span> plan ({status.billing_cycle}) — active until {new Date(status.expires_at).toLocaleDateString("en-IN")}</div>
          </Card>
        )}

        <div className="mt-8 flex justify-center">
          <Tabs value={cycle} onValueChange={setCycle}>
            <TabsList>
              <TabsTrigger value="monthly" data-testid="cycle-monthly">Monthly</TabsTrigger>
              <TabsTrigger value="quarterly" data-testid="cycle-quarterly">Quarterly <Badge variant="secondary" className="ml-2 text-[10px]">10% off</Badge></TabsTrigger>
              <TabsTrigger value="yearly" data-testid="cycle-yearly">Yearly <Badge variant="secondary" className="ml-2 text-[10px]">20% off</Badge></TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <Card key={p.id} className={`p-7 relative ${p.popular ? "border-primary border-2 shadow-lg" : ""}`} data-testid={`plan-${p.id}`}>
              {p.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-0">Most Popular</Badge>
              )}
              <h3 className="font-display text-xl font-bold">{p.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-bold tracking-tight">{formatINR(p[cycle])}</span>
                <span className="text-sm text-muted-foreground">/{cycle.slice(0, -2)}</span>
              </div>
              <ul className="mt-6 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full mt-7"
                variant={p.popular ? "default" : "outline"}
                disabled={loadingPlan === p.id}
                onClick={() => onSubscribe(p.id)}
                data-testid={`plan-subscribe-${p.id}`}
              >
                {loadingPlan === p.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {status?.plan === p.id && status?.status === "active" ? "Current Plan" : "Subscribe"}
              </Button>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center text-xs text-muted-foreground max-w-xl mx-auto">
          Prices in Indian Rupees. GST applicable extra. Secure payments via Razorpay. Cancel anytime — pro-rated refunds available within 7 days of payment.
        </div>
      </div>
    </div>
  );
}
