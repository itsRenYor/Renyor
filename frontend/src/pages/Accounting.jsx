import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { formatINR, formatDate, today } from "../lib/format";
import { Plus, Loader2, Trash2, FileDown, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

function StatRow({ label, value, indent = 0, bold = false, primary = false }) {
  return (
    <div className={`flex justify-between py-2 ${indent ? "pl-" + (indent * 4) : ""} ${bold ? "border-t border-border font-semibold" : ""}`}>
      <span className={primary ? "text-primary font-semibold" : ""}>{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""} ${primary ? "text-primary text-lg" : ""}`}>{value}</span>
    </div>
  );
}

const EXP_EMPTY = { category: "", description: "", amount: 0, expense_date: today(), payment_mode: "cash", vendor: "", bill_number: "" };

export default function Accounting() {
  const [pl, setPl] = useState(null);
  const [bs, setBs] = useState(null);
  const [tb, setTb] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [expOpen, setExpOpen] = useState(false);
  const [expForm, setExpForm] = useState(EXP_EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const params = start || end ? `?start=${start || ""}&end=${end || ""}` : "";
    const [plr, bsr, tbr, expr] = await Promise.all([
      api.get(`/accounting/profit-loss${params}`),
      api.get(`/accounting/balance-sheet`),
      api.get(`/accounting/trial-balance`),
      api.get(`/accounting/expenses`),
    ]);
    setPl(plr.data); setBs(bsr.data); setTb(tbr.data); setExpenses(expr.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const downloadJson = (data, name) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const setEx = (k) => (e) => setExpForm({ ...expForm, [k]: typeof e === "string" ? e : e.target.value });

  const submitExpense = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/accounting/expenses", { ...expForm, amount: parseFloat(expForm.amount) || 0 });
      toast.success("Expense recorded"); setExpOpen(false); setExpForm(EXP_EMPTY); load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  const deleteExpense = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    await api.delete(`/accounting/expenses/${id}`); load();
  };

  if (!pl || !bs || !tb) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Accounting</h1>
        <p className="text-sm text-muted-foreground mt-1">Financial statements derived from your invoices, purchases & expenses.</p>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl" data-testid="acc-tab-pnl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="bs" data-testid="acc-tab-bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="tb" data-testid="acc-tab-tb">Trial Balance</TabsTrigger>
          <TabsTrigger value="exp" data-testid="acc-tab-exp">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl" className="space-y-4">
          <Card className="p-5">
            <div className="flex justify-between items-end mb-4">
              <h3 className="font-display font-semibold text-xl">Profit & Loss Statement</h3>
              <div className="flex items-end gap-2">
                <div><Label className="text-xs">From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-36" /></div>
                <div><Label className="text-xs">To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-36" /></div>
                <Button variant="outline" onClick={load} data-testid="pnl-refresh">Apply</Button>
                <Button variant="outline" onClick={() => downloadJson(pl, "P&L")}><FileDown className="h-3.5 w-3.5 mr-1.5" />JSON</Button>
              </div>
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Income</div>
                <StatRow label="Gross Sales" value={formatINR(pl.income.gross_sales)} />
                {pl.income.sales_returns > 0 && <StatRow label="Less: Sales Returns" value={"- " + formatINR(pl.income.sales_returns)} />}
                <StatRow label="Net Sales" value={formatINR(pl.income.net_sales)} bold />
                <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2 mt-5">Cost of Goods Sold</div>
                <StatRow label="Purchases" value={formatINR(pl.cost_of_goods.purchases)} />
                <StatRow label="Gross Profit" value={formatINR(pl.gross_profit)} bold />
              </div>
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Operating Expenses</div>
                {pl.expenses.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-3">No expenses recorded.</div>
                ) : pl.expenses.map((e, i) => (
                  <StatRow key={i} label={e.category} value={formatINR(e.amount)} />
                ))}
                <StatRow label="Total Expenses" value={formatINR(pl.total_expenses)} bold />
                <div className="mt-5">
                  <StatRow label="Net Profit" value={formatINR(pl.net_profit)} primary bold />
                  <div className="flex items-center gap-2 mt-1 text-sm">
                    {pl.net_profit >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                    <span className="text-muted-foreground">
                      {pl.net_profit >= 0 ? "Profitable" : "Loss"} · Margin {pl.income.net_sales > 0 ? ((pl.net_profit / pl.income.net_sales) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="bs" className="space-y-4">
          <Card className="p-5">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-display font-semibold text-xl">Balance Sheet</h3>
                <p className="text-xs text-muted-foreground">As on {formatDate(bs.as_on)}</p>
              </div>
              <Button variant="outline" onClick={() => downloadJson(bs, "BalanceSheet")}><FileDown className="h-3.5 w-3.5 mr-1.5" />JSON</Button>
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Assets</div>
                <div className="text-sm font-semibold mb-1">Current Assets</div>
                <StatRow label="Cash & Bank" value={formatINR(bs.assets.current_assets.cash_and_bank)} />
                <StatRow label="Sundry Debtors" value={formatINR(bs.assets.current_assets.sundry_debtors)} />
                <StatRow label="Inventory" value={formatINR(bs.assets.current_assets.inventory)} />
                <StatRow label="Total Assets" value={formatINR(bs.assets.total_assets)} bold />
              </div>
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Liabilities & Equity</div>
                <div className="text-sm font-semibold mb-1">Current Liabilities</div>
                <StatRow label="Sundry Creditors" value={formatINR(bs.liabilities.current_liabilities.sundry_creditors)} />
                <StatRow label="GST Payable" value={formatINR(bs.liabilities.current_liabilities.gst_payable)} />
                <StatRow label="Total Liabilities" value={formatINR(bs.liabilities.total_liabilities)} bold />
                <div className="text-sm font-semibold mb-1 mt-4">Equity</div>
                <StatRow label="Capital & Reserves" value={formatINR(bs.equity.capital_and_reserves)} bold />
              </div>
            </div>
            {!bs.totals_match && (
              <div className="mt-4 p-3 rounded-md bg-warning/10 text-warning text-xs">⚠ Books are slightly out of balance — usually due to opening balances. Add an opening journal to fix.</div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="tb">
          <Card>
            <div className="p-4 flex justify-between items-center border-b border-border">
              <h3 className="font-display font-semibold text-lg">Trial Balance</h3>
              <Button variant="outline" onClick={() => downloadJson(tb, "TrialBalance")}><FileDown className="h-3.5 w-3.5 mr-1.5" />JSON</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit ₹</TableHead>
                  <TableHead className="text-right">Credit ₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tb.accounts.map((a, i) => (
                  <TableRow key={i} className="row-hover">
                    <TableCell className="font-medium">{a.account}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize text-xs">{a.type}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{a.debit ? formatINR(a.debit) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{a.credit ? formatINR(a.credit) : "—"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={2}>Totals</TableCell>
                  <TableCell className="text-right font-mono">{formatINR(tb.total_debit)}</TableCell>
                  <TableCell className="text-right font-mono">{formatINR(tb.total_credit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {Math.abs(tb.difference) > 0.01 && (
              <div className="p-3 text-xs text-warning">Difference: {formatINR(tb.difference)} (open balances may not be journaled)</div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="exp" className="space-y-4">
          <div className="flex justify-between">
            <h3 className="font-display font-semibold text-lg">Operating Expenses</h3>
            <Dialog open={expOpen} onOpenChange={(v) => { setExpOpen(v); if (!v) setExpForm(EXP_EMPTY); }}>
              <DialogTrigger asChild><Button data-testid="expense-add"><Plus className="h-4 w-4 mr-1.5" />Add Expense</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record expense</DialogTitle></DialogHeader>
                <form onSubmit={submitExpense} className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label>Category *</Label>
                    <Select value={expForm.category} onValueChange={(v) => setExpForm({ ...expForm, category: v })}>
                      <SelectTrigger data-testid="expense-category"><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>
                        {["Rent", "Salary", "Utilities", "Travel", "Office Supplies", "Marketing", "Professional Fees", "Internet & Phone", "Repairs", "Other"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Amount (₹) *</Label><Input type="number" required value={expForm.amount} onChange={setEx("amount")} data-testid="expense-amount" /></div>
                  <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={expForm.expense_date} onChange={setEx("expense_date")} /></div>
                  <div className="space-y-1.5 col-span-2"><Label>Description</Label><Input value={expForm.description} onChange={setEx("description")} /></div>
                  <div className="space-y-1.5"><Label>Vendor</Label><Input value={expForm.vendor} onChange={setEx("vendor")} /></div>
                  <div className="space-y-1.5"><Label>Bill #</Label><Input value={expForm.bill_number} onChange={setEx("bill_number")} /></div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Paid via</Label>
                    <Select value={expForm.payment_mode} onValueChange={(v) => setExpForm({ ...expForm, payment_mode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="bank">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter className="col-span-2">
                    <Button type="submit" disabled={saving} data-testid="expense-submit">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Vendor</TableHead><TableHead>Mode</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No expenses recorded yet.</TableCell></TableRow>
                ) : expenses.map((e) => (
                  <TableRow key={e.id} className="row-hover">
                    <TableCell className="text-sm">{formatDate(e.expense_date)}</TableCell>
                    <TableCell><Badge variant="secondary">{e.category}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate">{e.description || "—"}</TableCell>
                    <TableCell>{e.vendor || "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{e.payment_mode}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatINR(e.amount)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => deleteExpense(e.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
