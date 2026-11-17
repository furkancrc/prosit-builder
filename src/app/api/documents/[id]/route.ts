import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { updateDocument } from "@/lib/db";
import { ContentSchema, MetaPatchSchema } from "@/lib/schema";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ content: ContentSchema.optional(), metaOverrides: MetaPatchSchema.optional() });

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const d = updateDocument((await params).id, Body.parse(await req.json()));
    return d ? NextResponse.json(d) : jsonError(404, "Document introuvable");
  });
}
