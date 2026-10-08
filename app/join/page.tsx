import "../team.css";
import { TeamApp } from "@/components/team/TeamApp";

export const metadata = { title: "Připoj tým · Co na to CHC?" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  return <TeamApp initialCode={c ?? ""} />;
}
