import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const isGoogle = user?.auth_provider === "google";

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 6) return toast.error("Password must be at least 6 characters");
    if (next !== confirm) return toast.error("Passwords don't match");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: next });
      toast.success("Password changed successfully");
      setCur(""); setNext(""); setConfirm("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Your account details & security.</p>
      </div>

      <Card className="p-6">
        <h3 className="font-display font-semibold text-lg">Account</h3>
        <div className="mt-4 grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <div className="text-muted-foreground">Email</div>
          <div className="font-mono" data-testid="profile-email">{user?.email}</div>
          <div className="text-muted-foreground">Full name</div><div>{user?.full_name}</div>
          <div className="text-muted-foreground">Role</div><div className="capitalize">{user?.role?.replace("_", " ")}</div>
          <div className="text-muted-foreground">Sign-in method</div>
          <div>
            <Badge variant={isGoogle ? "secondary" : "outline"} className="gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              {isGoogle ? "Google" : "Email & Password"}
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-display font-semibold text-lg">Change password</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {isGoogle
            ? "You signed in with Google — you don't have a password set. Use Google to sign in or contact support to add one."
            : "Use a strong password — minimum 6 characters."}
        </p>
        {!isGoogle && (
          <form className="mt-5 space-y-4 max-w-sm" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label>Current password</Label>
              <Input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} data-testid="profile-current-password" />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} data-testid="profile-new-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="profile-confirm-password" />
            </div>
            <Button type="submit" disabled={saving} data-testid="profile-change-password-submit">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
