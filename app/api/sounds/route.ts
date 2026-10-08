import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/** seznam vlastních zvuků v public/sounds (přepíšou syntetizované) */
export async function GET() {
  try {
    const files = await fs.readdir(path.join(process.cwd(), "public", "sounds"));
    return Response.json(files.filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f)));
  } catch {
    return Response.json([]);
  }
}
