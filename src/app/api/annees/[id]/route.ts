import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { deleteAnnee, renameAnnee } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { nom } = z.object({ nom: z.string().trim().min(1).max(100) }).parse(await req.json());
    return renameAnnee((await params).id, nom) ? new NextResponse(null, { status: 204 }) : jsonError(404, "Année introuvable");
  });
}

/** Supprime l'année et ses matières ; leurs prosits deviennent « non classés » (rien n'est effacé). */
export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => (deleteAnnee((await params).id) ? new NextResponse(null, { status: 204 }) : jsonError(404, "Année introuvable")));
}
