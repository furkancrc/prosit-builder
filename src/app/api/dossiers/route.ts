import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { listDossiers } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Années et leurs matières. */
export function GET() {
  return handle(() => NextResponse.json(listDossiers()));
}
