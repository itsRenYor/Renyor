import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";

const EMPTY = { name: "", legal_name: "", gstin: "", pan: "", business_type: "trading", address: "", city: "", state: "", pincode: "", phone: "", email: "", financial_year_start: "04-01" };

export default function Onboarding() {
  const { user, refreshUser } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [existingId, setExistingId] = useState(null);

  useEffect(() => {
    api.get("/companies").then(({ data }) => {
      setCompanies(data);
      if (user?.active_company_id) {
        const cur = data.find((c) => c.id === user.active_company_id);
        if (cur) { setForm({ ...EMPTY, ...cur }); setExistingId(cur.id); }
      }
    });
  }, [user]);

  const set = (k) => (e) => setForm({ ...form, [k]: typeof e === "string" ? e : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (existingId) {
        await api.put(`/companies/${existingId}`, form);
        toast.success("Company updated");
      } else {
        await api.post("/companies", form);
        toast.success("Company created");
      }
      await refreshUser();
      nav("/app/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{existingId ? "Company profile" : "Set up your business"}</h1>
            <p className="text-sm text-muted-foreground">Tell us about your business. You can edit anytime.</p>
          </div>
        </div>

        <Card className="p-6 mt-6">
          <form className="grid grid-cols-2 gap-4" onSubmit={submit}>
            <div className="col-span-2 space-y-1.5"><Label>Business name *</Label><Input required value={form.name} onChange={set("name")} data-testid="onboarding-name" /></div>
            <div className="col-span-2 space-y-1.5"><Label>Legal name</Label><Input value={form.legal_name || ""} onChange={set("legal_name")} /></div>
            <div className="space-y-1.5"><Label>GSTIN</Label><Input value={form.gstin || ""} onChange={set("gstin")} className="font-mono uppercase" placeholder="22ABCDE1234F1Z5" data-testid="onboarding-gstin" /></div>
            <div className="space-y-1.5"><Label>PAN</Label><Input value={form.pan || ""} onChange={set("pan")} className="font-mono uppercase" /></div>
            <div className="space-y-1.5">
              <Label>Business type</Label>
              <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                <SelectTrigger data-testid="onboarding-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trading">Trading</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Financial year start</Label><Input value={form.financial_year_start} onChange={set("financial_year_start")} placeholder="04-01" /></div>
            <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input value={form.address || ""} onChange={set("address")} /></div>
            <div className="space-y-1.5"><Label>City</Label><Input value={form.city || ""} onChange={set("city")} /></div>
            <div className="space-y-1.5"><Label>State</Label><Input value={form.state || ""} onChange={set("state")} /></div>
            <div className="space-y-1.5"><Label>Pincode</Label><Input value={form.pincode || ""} onChange={set("pincode")} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone || ""} onChange={set("phone")} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Email</Label><Input type="email" value={form.email || ""} onChange={set("email")} /></div>

            <div className="col-span-2 flex justify-between items-center pt-2">
              <div className="text-xs text-muted-foreground">{companies.length} company{companies.length !== 1 && "ies"} on this account</div>
              <Button type="submit" disabled={saving} data-testid="onboarding-submit">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {existingId ? "Save changes" : "Continue to dashboard"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
