import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { BRL, MONTHS, formatDateTime } from "@/utils/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Undo2, ReceiptText } from "lucide-react";

export const PaymentHistoryModal = ({ client, onClose, onChanged }) => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState(null);

  const fetchPayments = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/clients/${client.id}/payments`);
      setPayments(data);
    } catch {
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const revert = async (p) => {
    setReverting(p.id);
    try {
      await api.post(`/clients/${client.id}/payment`, { year: p.year, month: p.month });
      toast.success(`Pagamento de ${MONTHS[p.month - 1]}/${p.year} estornado`);
      fetchPayments();
      onChanged();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setReverting(null);
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="payment-history-modal" className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Histórico de pagamentos — {client?.name}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div data-testid="history-loading" className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : payments.length === 0 ? (
          <p data-testid="history-empty-message" className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhum pagamento registrado ainda.
          </p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1" data-testid="payment-history-list">
            {payments.map((p) => (
              <li
                key={p.id}
                data-testid={`payment-row-${p.year}-${p.month}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/60">
                    <ReceiptText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {MONTHS[p.month - 1]}/{p.year} · <span className="font-mono">{BRL(p.amount)}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Confirmado em {formatDateTime(p.paid_at)}</p>
                  </div>
                </div>
                <button
                  data-testid={`revert-payment-button-${p.year}-${p.month}`}
                  onClick={() => revert(p)}
                  disabled={reverting === p.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {reverting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  Estornar
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};
