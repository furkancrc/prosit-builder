import { notFound } from "next/navigation";
import { getDocuments, getProsit } from "@/lib/db";
import { effectiveMeta, prositLabel } from "@/lib/meta";
import { effectiveRetourContent } from "@/lib/templates";
import { formatProsit } from "@/lib/format";
import { buildCards } from "@/lib/revision";
import { Revision } from "@/components/Revision";

export const dynamic = "force-dynamic";

export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prosit = getProsit(id);
  const docs = prosit ? getDocuments(id) : [];
  const retour = docs.find((d) => d.type === "retour");
  if (!prosit || !retour) notFound();
  const aller = docs.find((d) => d.type === "aller");
  // les cartes viennent du retour (définitions, réponses, justifications), complété par l'aller comme à l'export
  const content = formatProsit(aller ? effectiveRetourContent(formatProsit(aller.content, "aller"), retour.content) : retour.content, "retour");
  return <Revision prositId={id} title={prositLabel(effectiveMeta(prosit, "retour", retour.metaOverrides))} cards={buildCards(content)} />;
}
