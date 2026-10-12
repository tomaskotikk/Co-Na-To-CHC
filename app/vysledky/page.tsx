import "../survey.css";
import "../results.css";
import { Login } from "@/components/results/Login";
import { Results } from "@/components/results/Results";
import { isResultsAuthed, resultsPassword } from "@/lib/server/resultsAuth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Výsledky · Co na to CHC?", robots: { index: false, follow: false } };

export default async function ResultsPage() {
  if (!resultsPassword()) {
    return (
      <main className="sv sv-end">
        <h1 className="sv-title">Výsledky</h1>
        <p className="sv-lead">Stránka je zamčená — na serveru chybí heslo (proměnná RESULTS_PASSWORD, aspoň 10 znaků).</p>
      </main>
    );
  }
  return (await isResultsAuthed()) ? <Results /> : <Login />;
}
