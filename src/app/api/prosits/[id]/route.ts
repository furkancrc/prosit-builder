import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { deleteProsit, getDocuments, getProsit, updateProsit } from "@/lib/db";
import { MetaPatchSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const prosit = getProsit(id);
    if (!prosit) return jsonError(404, "Prosit introuvable");
    return NextResponse.json({ prosit, documents: getDocuments(id) });
  });
}

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const p = updateProsit(id, MetaPatchSchema.parse(await req.json()));
    return p ? NextResponse.json(p) : jsonError(404, "Prosit introuvable");
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    return deleteProsit(id) ? new NextResponse(null, { status: 204 }) : jsonError(404, "Prosit introuvable");
  });
}
