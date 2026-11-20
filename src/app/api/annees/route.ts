import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { createAnnee } from "@/lib/db";

export function POST(req: Request) {
  return handle(async () => {
    const { nom } = z.object({ nom: z.string().trim().min(1).max(100) }).parse(await req.json());
    return NextResponse.json({ id: createAnnee(nom) }, { status: 201 });
  });
}
