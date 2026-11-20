import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { deleteMatiere, updateMatiere } from "@/lib/db";
import { MatiereSchema } from "@/lib/schema";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const patch = MatiereSchema.omit({ anneeId: true }).partial().parse(await req.json());
    return updateMatiere((await params).id, patch) ? new NextResponse(null, { status: 204 }) : jsonError(404, "Matière introuvable");
  });
}

/** Supprime la matière ; ses prosits deviennent « non classés ». */
export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => (deleteMatiere((await params).id) ? new NextResponse(null, { status: 204 }) : jsonError(404, "Matière introuvable")));
}
