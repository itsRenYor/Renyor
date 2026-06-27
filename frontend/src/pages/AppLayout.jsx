import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator
} from "../components/ui/dropdown-menu";
import {
  LayoutDashboard, Users, Package, Truck, FileText, ShoppingCart,
  BarChart3, Sun, Moon, LogOut, ChevronDown, Building2, Sparkles, BookOpen, Boxes
} from "lucide-react";
import { useEffect } from "react";

const navGroups = [
  {
    title: "Overview",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
    ],
  },
  {
    title: "Masters",
    items: [
      { to: "/app/customers", label: "Customers", icon: Users, testid: "nav-customers" },
      { to: "/app/suppliers", label: "Suppliers", icon: Truck, testid: "nav-suppliers" },
      { to: "/app/products", label: "Products", icon: Package, testid: "nav-products" },
    ],
  },
  {
    title: "Transactions",
    items: [
      { to: "/app/sales", label: "Sales", icon: FileText, testid: "nav-sales" },
      { to: "/app/purchases", label: "Purchases", icon: ShoppingCart, testid: "nav-purchases" },
      { to: "/app/inventory", label: "Inventory", icon: Boxes, testid: "nav-inventory" },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/app/billing", label: "Billing & Plans", icon: Sparkles, testid: "nav-billing" },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!user) nav("/login");
    else if (!user.active_company_id && loc.pathname !== "/onboarding") nav("/onboarding");
  }, [user, loc.pathname, nav]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col sticky top-0 h-screen">
        <div className="h-16 px-5 flex items-center gap-2 border-b border-border">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-display font-bold">A</div>
          <div>
            <div className="font-display font-bold text-lg leading-none">AITAX</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Business OS</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {navGroups.map((g) => (
            <div key={g.title}>
              <div className="px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1.5">
                {g.title}
              </div>
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    data-testid={it.testid}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-foreground/80 hover:bg-muted hover:text-foreground"
                      }`
                    }
                  >
                    <it.icon className="h-4 w-4" />
                    {it.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <Badge variant="secondary" className="w-full justify-center gap-1.5 py-2 font-normal">
            <Building2 className="h-3 w-3" />
            <span className="truncate">Active Company</span>
          </Badge>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-border bg-background/90 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-6">
          <div className="text-sm text-muted-foreground">
            <span className="font-mono">{new Date().toLocaleDateString("en-IN", { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} data-testid="app-theme-toggle">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2" data-testid="user-menu">
                  <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display text-sm font-semibold">
                    {(user.full_name || "U")[0].toUpperCase()}
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="text-sm font-medium leading-none">{user.full_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{user.role}</div>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav("/app/billing")} data-testid="user-menu-billing">
                  <Sparkles className="h-4 w-4 mr-2" /> Billing & Plans
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav("/onboarding")} data-testid="user-menu-company">
                  <Building2 className="h-4 w-4 mr-2" /> Company Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} data-testid="user-menu-logout" className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
