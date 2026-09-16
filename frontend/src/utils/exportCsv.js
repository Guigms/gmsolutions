import api from "@/lib/api";

export async function exportCsv(year, month) {
  const { data } = await api.get("/reports/export", { params: { year, month }, responseType: "blob" });
  const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `mensalidades_${year}_${String(month).padStart(2, "0")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
