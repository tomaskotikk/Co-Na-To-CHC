import "../../admin.css";
import { Admin } from "@/components/admin/Admin";

export const metadata = { title: "Ovladač · Co na to CHC?" };

export default async function AdminPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Admin token={token} />;
}
