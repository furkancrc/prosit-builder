import { notFound } from "next/navigation";
import { getDocuments, getProsit, getSettings } from "@/lib/db";
import { effectiveMeta } from "@/lib/meta";
import { effectiveRetourContent } from "@/lib/templates";
import { formatProsit } from "@/lib/format";
import { Presentation } from "@/components/Presentation";

export const dynamic = "force-dynamic";

export default async function PresentationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tab = (await searchParams).tab === "retour" ? "retour" : "aller";
  const prosit = getProsit(id);
  const docs = prosit ? getDocuments(id) : [];
  const doc = docs.find((d) => d.type === tab);
  if (!prosit || !doc) notFound();
  const aller = docs.find((d) => d.type === "aller");
  // le retour est présenté fusionné avec l'aller, comme à l'export
  const content = formatProsit(tab === "retour" && aller ? effectiveRetourContent(formatProsit(aller.content, "aller"), doc.content) : doc.content, tab);
  const settings = getSettings();
  return (
    <Presentation
      prositId={id}
      initial={{ kind: "state", tab, meta: effectiveMeta(prosit, tab, doc.metaOverrides), content, active: 0 }}
      accent={settings.accentColor}
      secondary={settings.docSecondaryColor}
    />
  );
}
