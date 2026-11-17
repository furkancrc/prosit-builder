import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDocuments, getProsit, getSettings } from "@/lib/db";
import { Editor } from "@/components/Editor";

export const dynamic = "force-dynamic";

export default async function PrositPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prosit = getProsit(id);
  if (!prosit) notFound();
  return (
    <Suspense>
      <Editor key={prosit.id} prosit={prosit} documents={getDocuments(id)} settings={getSettings()} />
    </Suspense>
  );
}
