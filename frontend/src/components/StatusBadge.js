const CONFIG = {
  pago: {
    label: "Pago",
    classes: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  pendente: {
    label: "Pendente",
    classes: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  atrasado: {
    label: "Em atraso",
    classes: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800",
    dot: "bg-rose-500",
  },
  previsto: {
    label: "A vencer",
    classes: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    dot: "bg-slate-400",
  },
};

export const StatusBadge = ({ status }) => {
  const c = CONFIG[status] || CONFIG.pendente;
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c.classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};
