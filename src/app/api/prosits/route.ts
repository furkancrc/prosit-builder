import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { createProsit, listProsits, UnknownMatiereError } from "@/lib/db";
import { ContentSchema, MetaPatchSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => NextResponse.json(listProsits()));
}

const Body = MetaPatchSchema.extend({
  contents: z.object({ aller: ContentSchema.optional(), retour: ContentSchema.optional() }).optional(),
  /** Matière dans laquelle créer le prosit. */
  matiereId: z.string().min(1).max(64).nullable().optional(),
});

export function POST(req: Request) {
  return handle(async () => {
    const { contents, matiereId, ...meta } = Body.parse(await req.json().catch(() => ({})));
    try {
      return NextResponse.json({ id: createProsit(meta, contents, matiereId) }, { status: 201 });
    } catch (e) {
      if (e instanceof UnknownMatiereError) return jsonError(404, e.message);
      throw e;
    }
  });
}
