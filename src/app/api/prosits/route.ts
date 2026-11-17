import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { createProsit, listProsits } from "@/lib/db";
import { ContentSchema, MetaPatchSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => NextResponse.json(listProsits()));
}

const Body = MetaPatchSchema.extend({
  contents: z.object({ aller: ContentSchema.optional(), retour: ContentSchema.optional() }).optional(),
});

export function POST(req: Request) {
  return handle(async () => {
    const { contents, ...meta } = Body.parse(await req.json().catch(() => ({})));
    const id = createProsit(meta, contents);
    return NextResponse.json({ id }, { status: 201 });
  });
}
