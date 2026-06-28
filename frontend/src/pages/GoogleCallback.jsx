import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function GoogleCallback() {
  const nav = useNavigate();
  const { _setSession } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) {
      toast.error("Missing session id from Google");
      nav("/login");
      return;
    }
    const session_id = m[1];

    (async () => {
      try {
        const { data } = await api.post("/auth/google/exchange", { session_id });
        _setSession(data.access_token, data.user);
        // Clean hash + redirect
        window.history.replaceState(null, "", window.location.pathname);
        toast.success(`Welcome, ${data.user.full_name}`);
        nav(data.user.active_company_id ? "/app/dashboard" : "/onboarding", { replace: true });
      } catch (err) {
        toast.error(err.response?.data?.detail || "Google login failed");
        nav("/login", { replace: true });
      }
    })();
  }, [nav, _setSession]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Signing you in with Google…</p>
      </div>
    </div>
  );
}
