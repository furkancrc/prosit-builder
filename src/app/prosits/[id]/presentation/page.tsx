import { notFound } from "next/navigation";
import { getDocuments, getProsit, getSettings } from "@/lib/db";
import { effectiveMeta } from "@/lib/meta";
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
  const doc = prosit && getDocuments(id).find((d) => d.type === tab);
  if (!prosit || !doc) notFound();
  const settings = getSettings();
  return (
    <Presentation
      prositId={id}
      initial={{ kind: "state", tab, meta: effectiveMeta(prosit, tab, doc.metaOverrides), content: doc.content, active: 0 }}
      accent={settings.accentColor}
      secondary={settings.docSecondaryColor}
    />
  );
}
