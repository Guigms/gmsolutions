import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { BRL, MONTHS, monthLabel } from "@/utils/format";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { DollarSign, Clock, AlertTriangle, Users, CheckCircle2, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const STATUS_COLORS = { pago: "#10b981", pendente: "#f59e0b", atrasado: "#f43f5e", previsto: "#94a3b8" };
const STATUS_LABELS = { pago: "Pago", pendente: "Pendente", atrasado: "Em atraso", previsto: "A vencer" };

const KpiCard = ({ testid, title, value, icon: Icon, iconClasses, subtitle }) => (
  <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClasses}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <p data-testid={testid} className="mt-3 font-mono text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
      {value}
    </p>
    {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
  </div>
);

export default function Dashboard() {
  const { year, month } = useApp();
  const [data, setData] = useState(null);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, rep] = await Promise.all([
        api.get("/dashboard", { params: { year, month } }),
        api.get("/reports", { params: { year, month } }),
      ]);
      setData(dash.data);
      setSeries(rep.data.monthly.map((m) => ({ name: monthLabel(m.year, m.month), Recebido: m.received, Pendente: m.pending })));
    } catch {
      toast.error("Erro ao carregar o dashboard");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markPaid = async (client) => {
    setMarking(client.id);
    try {
      await api.post(`/clients/${client.id}/payment`, { year, month });
      toast.success(`Pagamento de ${client.name} confirmado`);
      fetchData();
    } catch {
      toast.error("Erro ao confirmar pagamento");
    } finally {
      setMarking(null);
    }
  };

  if (loading || !data) {
    return (
      <div data-testid="dashboard-loading" className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const donutData = Object.entries(data.status_counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: STATUS_LABELS[k], value: v, color: STATUS_COLORS[k] }));

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Dashboard
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500 dark:text-slate-400">
          Visão geral de {MONTHS[month - 1]} de {year}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <KpiCard testid="kpi-received-amount" title="Recebido no mês" value={BRL(data.received)} icon={DollarSign}
          iconClasses="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400" />
        <KpiCard testid="kpi-pending-amount" title="Pendente no mês" value={BRL(data.pending)} icon={Clock}
          iconClasses="bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400" />
        <KpiCard testid="kpi-overdue-amount" title="Em atraso" value={BRL(data.overdue)} icon={AlertTriangle}
          iconClasses="bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
          subtitle={`${data.status_counts.atrasado} cliente(s) em atraso`} />
        <KpiCard testid="kpi-active-clients" title="Clientes ativos" value={data.active_clients} icon={Users}
          iconClasses="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          subtitle={`Pontualidade: ${data.punctuality}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="col-span-1 lg:col-span-8 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <h3 className="font-heading text-lg font-semibold text-slate-800 dark:text-slate-200">
            Recebido vs Pendente (últimos 6 meses)
          </h3>
          <div className="mt-4 h-72" data-testid="dashboard-bar-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" />
                <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500"
                  tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v) => BRL(v)} />
                <Bar dataKey="Recebido" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pendente" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <h3 className="font-heading text-lg font-semibold text-slate-800 dark:text-slate-200">Status dos clientes</h3>
          <div className="mt-4 h-72" data-testid="dashboard-status-chart">
            {donutData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Nenhum cliente cadastrado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {donutData.map((d) => (
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

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-heading text-lg font-semibold text-slate-800 dark:text-slate-200">
            Clientes em atraso — {MONTHS[month - 1]}/{year}
          </h3>
          <span data-testid="overdue-count" className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
            {data.overdue_list.length}
          </span>
        </div>
        {data.overdue_list.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400" data-testid="no-overdue-message">
            Nenhum cliente em atraso neste mês. Tudo certo!
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="overdue-list">
            {data.overdue_list.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-3.5" data-testid={`overdue-row-${c.id}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{c.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Vence dia {c.due_day} · {BRL(c.monthly_value)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status="atrasado" />
                  <button
                    data-testid={`mark-paid-button-${c.id}`}
                    onClick={() => markPaid(c)}
                    disabled={marking === c.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-600"
                  >
                    {marking === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Dar OK
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
