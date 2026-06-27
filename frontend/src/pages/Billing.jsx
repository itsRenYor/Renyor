import Pricing from "./Pricing";

export default function Billing() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Billing & Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your AITAX plan.</p>
      </div>
      <Pricing inApp />
    </div>
  );
}
