import { getSettings } from "@/lib/db";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsForm initial={getSettings()} />;
}
