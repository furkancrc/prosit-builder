import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { setHelpLinks } from "@/lib/db";
import { HelpLinksSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Remplace la liste des liens d'aide du prosit. */
export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { links } = z.object({ links: HelpLinksSchema }).parse(await req.json());
    const saved = setHelpLinks(id, links);
    return saved ? NextResponse.json({ links: saved }) : jsonError(404, "Prosit introuvable");
  });
}
