import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

const EMPTY = { name: "", monthly_value: "", due_day: "", phone: "", email: "", notes: "" };

export const ClientModal = ({ open, onOpenChange, client, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setForm(
        client
          ? {
              name: client.name,
              monthly_value: String(client.monthly_value),
              due_day: String(client.due_day),
              phone: client.phone || "",
              email: client.email || "",
              notes: client.notes || "",
            }
          : EMPTY
      );
    }
  }, [open, client]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const value = parseFloat(String(form.monthly_value).replace(",", "."));
    const day = parseInt(form.due_day, 10);
    if (!form.name.trim()) return setError("Informe o nome do cliente.");
    if (!value || value <= 0) return setError("Informe um valor de mensalidade válido.");
    if (!day || day < 1 || day > 31) return setError("O dia de vencimento deve ser entre 1 e 31.");
    const payload = {
      name: form.name.trim(),
      monthly_value: value,
      due_day: day,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (client) {
        await api.put(`/clients/${client.id}`, payload);
        toast.success("Cliente atualizado");
      } else {
        await api.post("/clients", payload);
        toast.success("Cliente cadastrado");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="client-modal" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-name">Nome completo *</Label>
            <Input id="client-name" data-testid="client-name-input" value={form.name} onChange={set("name")} placeholder="Nome do cliente" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="client-value">Mensalidade (R$) *</Label>
              <Input id="client-value" data-testid="client-value-input" inputMode="decimal" value={form.monthly_value} onChange={set("monthly_value")} placeholder="150,00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-dueday">Dia vencimento *</Label>
              <Input id="client-dueday" data-testid="client-dueday-input" type="number" min={1} max={31} value={form.due_day} onChange={set("due_day")} placeholder="10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="client-phone">Telefone/WhatsApp</Label>
              <Input id="client-phone" data-testid="client-phone-input" value={form.phone} onChange={set("phone")} placeholder="(11) 99999-0000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">E-mail</Label>
              <Input id="client-email" data-testid="client-email-input" type="email" value={form.email} onChange={set("email")} placeholder="cliente@email.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-notes">Observações</Label>
            <Textarea id="client-notes" data-testid="client-notes-input" value={form.notes} onChange={set("notes")} placeholder="Anotações internas..." rows={2} />
          </div>
          {error && (
            <p data-testid="client-form-error" className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <DialogFooter className="gap-2">
            <Button data-testid="client-cancel-button" type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              data-testid="client-save-button"
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-600"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : client ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
