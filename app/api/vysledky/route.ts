import { isResultsAuthed } from "@/lib/server/resultsAuth";
import { surveyRows } from "@/lib/server/surveyLive";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isResultsAuthed())) return Response.json({ ok: false, error: "Nepřihlášen." }, { status: 401 });
  try {
    const rows = await surveyRows();
    if (!rows) return Response.json({ ok: false, error: "Databáze není nastavená." }, { status: 503 });
    return Response.json({ ok: true, rows }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Načtení z databáze selhalo." }, { status: 502 });
  }
}
