import { buildTemplateCsv } from "@/lib/stock-import";

/** GET /api/dashboard/stock/template — descarga la plantilla CSV. */
export async function GET(): Promise<Response> {
  return new Response(buildTemplateCsv(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-stock.csv"',
    },
  });
}
