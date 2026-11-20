import { listDossiers, listProsits } from "@/lib/db";
import { PrositList } from "@/components/PrositList";

export const dynamic = "force-dynamic";

export default function Home() {
  return <PrositList initial={listProsits()} initialDossiers={listDossiers()} />;
}
