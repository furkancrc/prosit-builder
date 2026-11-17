import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { duplicateProsit } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = duplicateProsit((await params).id);
    return id ? NextResponse.json({ id }, { status: 201 }) : jsonError(404, "Prosit introuvable");
  });
}
