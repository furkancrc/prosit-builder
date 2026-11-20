import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { setPrositMatiere, UnknownMatiereError } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Range le prosit dans une matière (matiereId: null = non classé). */
export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { matiereId } = z.object({ matiereId: z.string().min(1).max(64).nullable() }).parse(await req.json());
    try {
      return setPrositMatiere((await params).id, matiereId) ? new NextResponse(null, { status: 204 }) : jsonError(404, "Prosit introuvable");
    } catch (e) {
      if (e instanceof UnknownMatiereError) return jsonError(404, e.message);
      throw e;
    }
  });
}
