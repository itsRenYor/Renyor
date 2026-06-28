import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Building2, ChevronDown, Check, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function CompanySwitcher() {
  const { user, refreshUser } = useAuth();
  const nav = useNavigate();
  const [companies, setCompanies] = useState([]);

  const load = async () => {
    const { data } = await api.get("/companies");
    setCompanies(data);
  };
  useEffect(() => { load(); }, []);

  const active = companies.find((c) => c.id === user?.active_company_id);

  const onSwitch = async (cid) => {
    if (cid === user?.active_company_id) return;
    try {
      await api.post(`/auth/switch-company/${cid}`);
      await refreshUser();
      toast.success("Switched company");
      window.location.reload();
    } catch (err) {
      toast.error("Switch failed");
    }
  };

  if (!companies.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 max-w-[260px]" data-testid="company-switcher">
          <Building2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span className="truncate text-sm font-medium">{active?.name || "Select company"}</span>
          {companies.length > 1 && (
            <Badge variant="secondary" className="text-[10px] px-1.5">{companies.length}</Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-widest">Your businesses</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.id}
            className="cursor-pointer"
            onClick={() => onSwitch(c.id)}
            data-testid={`company-option-${c.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{c.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {c.gstin || c.city || c.business_type}
              </div>
            </div>
            {c.id === user?.active_company_id && (
              <Check className="h-4 w-4 text-primary flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => nav("/onboarding")} className="text-primary cursor-pointer" data-testid="company-add-new">
          <Plus className="h-4 w-4 mr-2" /> Add another business
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
