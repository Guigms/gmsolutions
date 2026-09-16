import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { BRL, MONTHS, monthLabel } from "@/utils/format";
import { exportCsv } from "@/utils/exportCsv";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";

const STATUS_COLORS = { pago: "#10b981", pendente: "#f59e0b", atrasado: "#f43f5e", previsto: "#94a3b8" };
const STATUS_LABELS = { pago: "Pago", pendente: "Pendente", atrasado: "Em atraso", previsto: "A vencer" };

export default function Reports() {
  const { year, month } = useApp();
  const [report, setReport] = useState(null);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rep, d] = await Promise.all([
        api.get("/reports", { params: { year, month } }),
        api.get("/dashboard", { params: { year, month } }),
      ]);
      setReport(rep.data);
      setDash(d.data);
    } catch {
      toast.error("Erro ao carregar relatórios");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportCsv(year, month);
      toast.success("CSV exportado com sucesso");
    } catch {
      toast.error("Erro ao exportar CSV");
    } finally {
      setExporting(false);
    }
  };

  if (loading || !report || !dash) {
    return (
      <div data-testid="reports-loading" className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const monthly = report.monthly.map((m) => ({ name: monthLabel(m.year, m.month), Recebido: m.received, Pendente: m.pending }));
  const forecast = report.forecast.map((m) => ({ name: monthLabel(m.year, m.month), Previsto: m.expected }));
  const donut = Object.entries(dash.status_counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: STATUS_LABELS[k], value: v, color: STATUS_COLORS[k] }));
  const totalReceived6m = report.monthly.reduce((s, m) => s + m.received, 0);

  return (
    <div data-testid="reports-page" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Relatórios
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-500 dark:text-slate-400">
            Análise financeira até {MONTHS[month - 1]} de {year}
          </p>
        </div>
        <Button data-testid="export-csv-button" variant="outline" onClick={handleExport} disabled={exporting} className="gap-2 self-start">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Receita mensal esperada</p>
          <p data-testid="report-expected-value" className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {BRL(report.expected)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recebido (últimos 6 meses)</p>
          <p data-testid="report-received-6m" className="mt-2 font-mono text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {BRL(totalReceived6m)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Taxa de pontualidade ({MONTHS[month - 1].slice(0, 3)}/{String(year).slice(2)})</p>
          <p data-testid="report-punctuality" className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {dash.punctuality}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="col-span-1 lg:col-span-8 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <h3 className="font-heading text-lg font-semibold text-slate-800 dark:text-slate-200">Recebido vs Pendente</h3>
          <div className="mt-4 h-80" data-testid="report-bar-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" />
                <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v) => BRL(v)} />
                <Legend />
                <Bar dataKey="Recebido" stackId="a" fill="#10b981" />
                <Bar dataKey="Pendente" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <h3 className="font-heading text-lg font-semibold text-slate-800 dark:text-slate-200">Status — {MONTHS[month - 1]}/{year}</h3>
          <div className="mt-4 h-80" data-testid="report-donut-chart">
            {donut.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                    {donut.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="col-span-1 lg:col-span-8 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <h3 className="font-heading text-lg font-semibold text-slate-800 dark:text-slate-200">
            Previsão de recebimento (próximos 6 meses)
          </h3>
          <div className="mt-4 h-64" data-testid="report-forecast-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" />
                <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v) => BRL(v)} />
                <Area type="monotone" dataKey="Previsto" stroke="#10b981" strokeWidth={2.5} fill="url(#forecastFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-4 rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/90">
          <h3 className="font-heading text-lg font-semibold text-slate-800 dark:text-slate-200 p-5 border-b border-slate-200 dark:border-slate-800">
            Resumo mensal
          </h3>
          <table className="w-full text-sm" data-testid="report-summary-table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left dark:border-slate-800 dark:bg-slate-800/40">
                <th className="px-4 py-2.5 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Mês</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Recebido</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Pendente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {report.monthly.map((m) => (
                <tr key={`${m.year}-${m.month}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{monthLabel(m.year, m.month)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{BRL(m.received)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400">{BRL(m.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
