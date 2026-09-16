import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { BRL, MONTHS, formatDateTime } from "@/utils/format";
import { StatusBadge } from "@/components/StatusBadge";
import { ClientModal } from "@/components/ClientModal";
import { PaymentHistoryModal } from "@/components/PaymentHistoryModal";
import { exportCsv } from "@/utils/exportCsv";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, CheckCircle2, Undo2, History, Pencil, Trash2, Download, Loader2 } from "lucide-react";

export default function Clients() {
  const { year, month } = useApp();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [dueDayFilter, setDueDayFilter] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [historyClient, setHistoryClient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [marking, setMarking] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year, month };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "todos") params.status = statusFilter;
      if (dueDayFilter !== "todos") params.due_day = Number(dueDayFilter);
      const { data } = await api.get("/clients", { params });
      setClients(data);
    } catch {
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }, [year, month, search, statusFilter, dueDayFilter]);

  useEffect(() => {
    const t = setTimeout(fetchClients, 250);
    return () => clearTimeout(t);
  }, [fetchClients]);

  const togglePayment = async (client) => {
    setMarking(client.id);
    try {
      const { data } = await api.post(`/clients/${client.id}/payment`, { year, month });
      toast.success(
        data.status === "pago"
          ? `Pagamento de ${client.name} confirmado (${MONTHS[month - 1]}/${year})`
          : `Pagamento de ${client.name} estornado`
      );
      fetchClients();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setMarking(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/clients/${deleteTarget.id}`);
      toast.success(`Cliente ${deleteTarget.name} excluído`);
      setDeleteTarget(null);
      fetchClients();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setDeleting(false);
    }
  };

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

  return (
    <div data-testid="clients-page" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Clientes
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-500 dark:text-slate-400">
            Status de {MONTHS[month - 1]} de {year}
          </p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="export-csv-button" variant="outline" onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar CSV
          </Button>
          <Button
            data-testid="add-client-button"
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-600"
          >
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="client-search-input"
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger data-testid="client-status-filter" className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="atrasado">Em atraso</SelectItem>
            <SelectItem value="previsto">A vencer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dueDayFilter} onValueChange={setDueDayFilter}>
          <SelectTrigger data-testid="client-dueday-filter" className="w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os vencimentos</SelectItem>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/90">
        {loading ? (
          <div data-testid="clients-loading" className="flex h-48 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
          </div>
        ) : clients.length === 0 ? (
          <p data-testid="clients-empty-message" className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhum cliente encontrado. Clique em "Novo cliente" para começar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="clients-table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left dark:border-slate-800 dark:bg-slate-800/40">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cliente</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mensalidade</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Vencimento</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pago em</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {clients.map((c) => (
                  <tr key={c.id} data-testid={`client-row-${c.id}`} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</p>
                      {c.phone && <p className="text-xs text-slate-500 dark:text-slate-400">{c.phone}</p>}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-800 dark:text-slate-200">{BRL(c.monthly_value)}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">Dia {c.due_day}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={c.status} /></td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(c.paid_at)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          data-testid={`mark-paid-button-${c.id}`}
                          onClick={() => togglePayment(c)}
                          disabled={marking === c.id}
                          title={c.status === "pago" ? "Estornar pagamento" : "Dar OK no mês"}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                            c.status === "pago"
                              ? "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                              : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-600"
                          }`}
                        >
                          {marking === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : c.status === "pago" ? (
                            <Undo2 className="h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          {c.status === "pago" ? "Estornar" : "Dar OK"}
                        </button>
                        <button
                          data-testid={`view-history-button-${c.id}`}
                          onClick={() => setHistoryClient(c)}
                          title="Histórico de pagamentos"
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          data-testid={`edit-client-button-${c.id}`}
                          onClick={() => { setEditing(c); setModalOpen(true); }}
                          title="Editar cliente"
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          data-testid={`delete-client-button-${c.id}`}
                          onClick={() => setDeleteTarget(c)}
                          title="Excluir cliente"
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ClientModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        client={editing}
        onSaved={fetchClients}
      />

      <PaymentHistoryModal
        client={historyClient}
        onClose={() => setHistoryClient(null)}
        onChanged={fetchClients}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent data-testid="delete-client-dialog">
          <DialogHeader>
            <DialogTitle>Excluir cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Todo o histórico de pagamentos
            também será removido. Essa ação não pode ser desfeita.
          </p>
          <DialogFooter className="gap-2">
            <Button data-testid="delete-cancel-button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              data-testid="delete-confirm-button"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
