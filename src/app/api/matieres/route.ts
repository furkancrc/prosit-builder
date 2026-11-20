import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { createMatiere } from "@/lib/db";
import { MatiereSchema } from "@/lib/schema";

export function POST(req: Request) {
  return handle(async () => {
    const { anneeId, ...m } = MatiereSchema.parse(await req.json());
    const id = createMatiere(anneeId, m);
    return id ? NextResponse.json({ id }, { status: 201 }) : jsonError(404, "Année introuvable");
  });
}
