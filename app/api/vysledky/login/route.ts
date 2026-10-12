import { cookies } from "next/headers";
import { checkPassword, RESULTS_COOKIE, resultsPassword, resultsToken } from "@/lib/server/resultsAuth";

export const dynamic = "force-dynamic";

// proti hádání hesla: 5 špatných pokusů za 15 minut z jedné IP
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const pw = resultsPassword();
  if (!pw) return fail(503, "Heslo není nastavené (RESULTS_PASSWORD, aspoň 10 znaků).");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_FAILS) return fail(429, "Moc špatných pokusů. Zkus to za 15 minut.");

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (!checkPassword(String(body?.password ?? "").slice(0, 200))) {
    fails.set(ip, [...recent, now]);
    return fail(401, "Špatné heslo.");
  }

  fails.delete(ip);
  (await cookies()).set(RESULTS_COOKIE, resultsToken(pw), {
    httpOnly: true,
    sameSite: "strict",
    // Render jede přes https proxy; lokálně (http) by secure cookie nefungovala
    secure: req.headers.get("x-forwarded-proto") === "https",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(RESULTS_COOKIE);
  return Response.json({ ok: true });
}
