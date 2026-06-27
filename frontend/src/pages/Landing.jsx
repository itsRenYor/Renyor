import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import {
  ArrowRight, Check, Sparkles, ShieldCheck, Zap, BarChart3, Package,
  Receipt, Wallet, Sun, Moon, Layers, Users, FileText
} from "lucide-react";

const features = [
  { icon: Receipt, title: "GST Invoicing", desc: "Tax/Retail invoices, e-way bill ready, HSN/SAC, IGST/CGST/SGST auto-split." },
  { icon: Package, title: "Live Inventory", desc: "Real-time stock from sales & purchase, multi-godown, low-stock alerts." },
  { icon: Wallet, title: "Receivables & Payables", desc: "Outstanding ageing, payment reminders, automated reconciliation." },
  { icon: BarChart3, title: "Owner Dashboard", desc: "Daily cash position, profit trend, top customers — like a control room." },
  { icon: ShieldCheck, title: "Multi-Tenant Secure", desc: "JWT, RBAC, audit log. Your CA can manage many businesses safely." },
  { icon: Layers, title: "Built for Bharat", desc: "Trader, service, AMC, transport & tour operator modules — one platform." },
];

const personas = [
  "Kirana & Grocery", "Hardware & Electrical", "Medical Stores", "Textile & Apparel",
  "Mobile & Electronics", "Auto Parts", "Wholesalers", "Service & AMC",
  "Tour Operators", "Transporters", "Chartered Accountants", "Freelance Consultants",
];

export default function Landing() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-display font-bold">A</div>
            <span className="font-display font-bold text-xl tracking-tight">AITAX</span>
            <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">For Bharat MSMEs</Badge>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            <a href="#features" className="hover:text-primary transition-colors" data-testid="nav-features">Features</a>
            <a href="#who" className="hover:text-primary transition-colors" data-testid="nav-who">Who it's for</a>
            <Link to="/pricing" className="hover:text-primary transition-colors" data-testid="nav-pricing">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} data-testid="theme-toggle">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? (
              <Button onClick={() => nav("/app/dashboard")} data-testid="nav-app">Open App</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => nav("/login")} data-testid="nav-login">Login</Button>
                <Button onClick={() => nav("/register")} data-testid="nav-register">
                  Start Free Trial <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.08),transparent_50%)]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <Badge className="bg-primary/10 text-primary hover:bg-primary/15 border-0 mb-5" data-testid="hero-badge">
              <Sparkles className="h-3 w-3 mr-1.5" /> Replaces 10+ tools for ₹499/mo
            </Badge>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              The accounting OS for <br />
              <span className="text-primary">Bharat's traders & businesses</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Invoicing, GST, inventory, receivables, services & taxes — replace handwritten registers,
              Excel sheets, and 10 disconnected apps with one platform built for Indian MSMEs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => nav("/register")} data-testid="hero-cta-trial" className="text-base">
                Start 14-day free trial <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => nav("/login")} data-testid="hero-cta-demo">
                Try Demo Account
              </Button>
            </div>
            <div className="mt-6 flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> No credit card</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> GST-ready</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Hindi & English</span>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative rounded-xl border border-border bg-card p-1 shadow-xl">
              <div className="rounded-lg overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1560221328-12fe60f83ab8?crop=entropy&cs=srgb&fm=jpg&q=85&w=900"
                  alt="Dashboard preview" className="w-full h-auto"
                />
              </div>
              <div className="absolute -bottom-5 -left-5 w-44 rounded-lg border border-border bg-card p-4 shadow-lg hidden sm:block">
                <div className="text-xs text-muted-foreground">Today's Sales</div>
                <div className="font-mono text-2xl font-bold mt-0.5">₹2,48,500</div>
                <div className="text-xs text-success mt-1">▲ 12.4% vs yesterday</div>
              </div>
              <div className="absolute -top-5 -right-5 rounded-lg border border-border bg-card px-3 py-2 shadow-lg hidden sm:flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-success animate-pulse"></div>
                <span className="text-xs font-medium">GSTR-1 ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-widest text-primary uppercase">Everything you need</div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mt-2 tracking-tight">
              One platform. Every business workflow.
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-lg overflow-hidden border border-border">
            {features.map((f, i) => (
              <div
                key={i}
                className="bg-card p-6 hover:bg-muted/40 transition-colors"
                data-testid={`feature-${i}`}
              >
                <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display font-semibold text-lg mt-4">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section id="who" className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <div className="text-xs font-semibold tracking-widest text-primary uppercase">Built for</div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mt-2 tracking-tight">
              From the kirana shop on the corner to multi-branch distributors.
            </h2>
            <p className="mt-4 text-muted-foreground">
              AITAX adapts to trading, service, AMC, tour & transport businesses — without
              the complexity of legacy ERP.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {personas.map((p) => (
              <div key={p} className="rounded-md border border-border bg-card px-4 py-3 text-sm" data-testid={`persona-${p.toLowerCase().replace(/\s+/g, '-')}`}>
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl">
            Trusted by shop owners, CAs & growing businesses.
          </h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {[
              { img: "https://images.unsplash.com/photo-1589386417686-0d34b5903d23?crop=entropy&cs=srgb&fm=jpg&q=85&w=200", name: "Anil Kumar", role: "Hardware Dealer, Pune", quote: "Closed the day in 5 minutes instead of 1 hour. GSTR-1 just exports." },
              { img: "https://images.unsplash.com/photo-1762341124796-530c0085f7d8?crop=entropy&cs=srgb&fm=jpg&q=85&w=200", name: "Meera Joshi", role: "Textile Retailer, Surat", quote: "Stock + invoicing in one. Never overselling now. Saved 4 hrs/week." },
              { img: "https://images.pexels.com/photos/7580766/pexels-photo-7580766.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200", name: "CA Rohan Mehta", role: "Practicing CA", quote: "I manage 38 clients here. Switching companies is one click. Beautiful." },
            ].map((t, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-6" data-testid={`testimonial-${i}`}>
                <p className="text-sm leading-relaxed">"{t.quote}"</p>
                <div className="mt-5 flex items-center gap-3">
                  <img src={t.img} alt={t.name} className="h-10 w-10 rounded-full object-cover" />
                  <div>
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight">
            Stop maintaining 6 registers.<br />Start running 1 business.
          </h2>
          <p className="mt-5 text-muted-foreground max-w-xl mx-auto">
            14 days free. No credit card. Cancel anytime. Setup in under 5 minutes.
          </p>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Button size="lg" onClick={() => nav("/register")} data-testid="cta-bottom-register">
              Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => nav("/pricing")} data-testid="cta-bottom-pricing">
              View Pricing
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-primary flex items-center justify-center text-primary-foreground font-display font-bold text-sm">A</div>
            <span className="font-display font-semibold text-foreground">AITAX</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div>Made in India for Bharat MSMEs.</div>
        </div>
      </footer>
    </div>
  );
}
