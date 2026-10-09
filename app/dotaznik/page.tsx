import "../survey.css";
import { cookies } from "next/headers";
import { SurveyForm } from "@/components/survey/SurveyForm";
import { SURVEY_COOKIE } from "@/lib/survey";

export const metadata = { title: "Dotazník · Co na to CHC?" };

export default async function SurveyPage() {
  const done = (await cookies()).get(SURVEY_COOKIE)?.value === "1";
  return <SurveyForm alreadyDone={done} />;
}
