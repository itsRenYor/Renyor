import { useEffect, useState } from "react";
import { api, API } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { formatINR } from "../lib/format";
import { Download, Loader2, FileJson, Receipt } from "lucide-react";
import { toast } from "sonner";

function MonthInput({ value, onChange }) {
  return <Input type="month" value={value} onChange={(e) => onChange(e.target.value)} className="w-44" data-testid="gst-month" />;
}

function SummaryCard({ label, value, primary }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-bold ${primary ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

export default function GstReports() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [tab, setTab] = useState("gstr1");
  const [gstr1, setGstr1] = useState(null);
  const [gstr3b, setGstr3b] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r3] = await Promise.all([
        api.get(`/gst/gstr1?month=${month}`),
        api.get(`/gst/gstr3b?month=${month}`),
      ]);
      setGstr1(r1.data); setGstr3b(r3.data);
    } catch (err) {
      toast.error("Failed to load GST reports");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const downloadJson = (data, name) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${month}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast.success("Downloaded");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">GST Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">GSTR-1 outward supplies and GSTR-3B summary — ready to export.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tax period</Label>
            <MonthInput value={month} onChange={setMonth} />
          </div>
          <Button variant="outline" onClick={load} disabled={loading} data-testid="gst-refresh">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="gstr1" data-testid="gst-tab-gstr1">GSTR-1 (Outward)</TabsTrigger>
          <TabsTrigger value="gstr3b" data-testid="gst-tab-gstr3b">GSTR-3B (Summary)</TabsTrigger>
        </TabsList>

        <TabsContent value="gstr1" className="space-y-4">
          {gstr1 && (
            <>
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  {gstr1.company.name} · GSTIN <span className="font-mono">{gstr1.company.gstin || "—"}</span> · Period {gstr1.period}
                </div>
                <Button onClick={() => downloadJson(gstr1, "GSTR-1")} data-testid="gst-download-gstr1">
                  <Download className="h-4 w-4 mr-2" /> Download JSON
                </Button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <SummaryCard label="Invoices" value={gstr1.summary.total_invoices} />
                <SummaryCard label="Taxable" value={formatINR(gstr1.summary.total_taxable_value)} />
                <SummaryCard label="IGST" value={formatINR(gstr1.summary.total_igst)} />
                <SummaryCard label="CGST + SGST" value={formatINR(gstr1.summary.total_cgst + gstr1.summary.total_sgst)} />
                <SummaryCard label="Total Tax" value={formatINR(gstr1.summary.total_tax)} primary />
              </div>

              <Card>
                <div className="p-4 border-b border-border flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-0">B2B</Badge>
                  <span className="text-sm font-medium">{gstr1.b2b.length} invoices to GST-registered customers</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Party (GSTIN)</TableHead>
                      <TableHead className="text-right">Taxable ₹</TableHead>
                      <TableHead className="text-right">IGST</TableHead>
                      <TableHead className="text-right">CGST</TableHead>
                      <TableHead className="text-right">SGST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gstr1.b2b.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No B2B invoices.</TableCell></TableRow>
                    ) : gstr1.b2b.map((r, i) => (
                      <TableRow key={r.invoice_number + i}>
                        <TableCell className="font-mono font-semibold">{r.invoice_number}</TableCell>
                        <TableCell className="text-sm">{r.invoice_date}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.party_name}</div>
                          <div className="text-xs font-mono text-muted-foreground">{r.party_gstin}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatINR(r.taxable_value)}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(r.igst)}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(r.cgst)}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(r.sgst)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatINR(r.invoice_value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <Card>
                <div className="p-4 border-b border-border flex items-center gap-2">
                  <Badge variant="secondary">B2C</Badge>
                  <span className="text-sm font-medium">{gstr1.b2c.length} retail invoices (no GSTIN)</span>
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Tax</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {gstr1.b2c.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No B2C invoices.</TableCell></TableRow>
                    ) : gstr1.b2c.map((r, i) => (
                      <TableRow key={r.invoice_number + i}>
                        <TableCell className="font-mono">{r.invoice_number}</TableCell>
                        <TableCell className="text-sm">{r.invoice_date}</TableCell>
                        <TableCell>{r.party_name}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(r.taxable_value)}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(r.igst + r.cgst + r.sgst)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatINR(r.invoice_value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <Card>
                <div className="p-4 border-b border-border"><span className="text-sm font-medium">HSN Summary</span></div>
                <Table>
                  <TableHeader><TableRow><TableHead>HSN</TableHead><TableHead>Description</TableHead><TableHead>UQC</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Total Tax</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {gstr1.hsn_summary.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No data.</TableCell></TableRow>
                    ) : gstr1.hsn_summary.map((r, i) => (
                      <TableRow key={r.hsn_code + i}>
                        <TableCell className="font-mono">{r.hsn_code}</TableCell>
                        <TableCell>{r.description}</TableCell>
                        <TableCell>{r.uqc}</TableCell>
                        <TableCell className="text-right font-mono">{r.total_qty}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(r.taxable_value)}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(r.igst + r.cgst + r.sgst)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="gstr3b" className="space-y-4">
          {gstr3b && (
            <>
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  {gstr3b.company.name} · Period {gstr3b.period}
                </div>
                <Button onClick={() => downloadJson(gstr3b, "GSTR-3B")} data-testid="gst-download-gstr3b">
                  <Download className="h-4 w-4 mr-2" /> Download JSON
                </Button>
              </div>

              <Card className="p-6">
                <h3 className="font-display font-semibold text-lg">3.1 Outward supplies</h3>
                <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <SummaryCard label="Taxable value" value={formatINR(gstr3b.section_3_1_outward_supplies.taxable_value)} />
                  <SummaryCard label="IGST" value={formatINR(gstr3b.section_3_1_outward_supplies.igst)} />
                  <SummaryCard label="CGST" value={formatINR(gstr3b.section_3_1_outward_supplies.cgst)} />
                  <SummaryCard label="SGST" value={formatINR(gstr3b.section_3_1_outward_supplies.sgst)} />
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-display font-semibold text-lg">4. Eligible ITC (from purchases)</h3>
                <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <SummaryCard label="Taxable value" value={formatINR(gstr3b.section_4_eligible_itc.taxable_value)} />
                  <SummaryCard label="IGST" value={formatINR(gstr3b.section_4_eligible_itc.igst)} />
                  <SummaryCard label="CGST" value={formatINR(gstr3b.section_4_eligible_itc.cgst)} />
                  <SummaryCard label="SGST" value={formatINR(gstr3b.section_4_eligible_itc.sgst)} />
                </div>
              </Card>

              <Card className="p-6 border-primary/30">
                <h3 className="font-display font-semibold text-lg text-primary">Net tax payable</h3>
                <p className="text-xs text-muted-foreground mt-1">After offsetting input tax credit</p>
                <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <SummaryCard label="IGST payable" value={formatINR(gstr3b.net_tax_payable.igst)} />
                  <SummaryCard label="CGST payable" value={formatINR(gstr3b.net_tax_payable.cgst)} />
                  <SummaryCard label="SGST payable" value={formatINR(gstr3b.net_tax_payable.sgst)} />
                  <SummaryCard label="TOTAL" value={formatINR(gstr3b.net_tax_payable.total)} primary />
                </div>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
