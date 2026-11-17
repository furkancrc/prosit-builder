import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/db";
import { SettingsSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => NextResponse.json(getSettings()));
}

export function PUT(req: Request) {
  return handle(async () => NextResponse.json(saveSettings(SettingsSchema.parse(await req.json()))));
}
