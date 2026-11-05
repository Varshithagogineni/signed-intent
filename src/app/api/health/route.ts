import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/db";

/** Liveness check for the hosting platform: the server is up and the database answers. */
export async function GET() {
  await connection();
  getDb().run(sql`select 1`);
  return Response.json({ ok: true });
}
