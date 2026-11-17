"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { readableOn } from "@/lib/color";
import { buildFilename } from "@/lib/filename";
import { DEFAULT_SETTINGS, DOC_FONTS, SettingsSchema, type Settings } from "@/lib/schema";

const ACCENTS = ["#FFE600", "#F59E0B", "#22C55E", "#3B82F6", "#E11D48"];
const VARS = ["{type}", "{Type}", "{theme}", "{themeComplet}", "{numero}", "{nom}", "{bloc}", "{date}", "{auteur}", "{groupe}"];

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    setState("idle");
    // aperçu immédiat de l'apparence
    if (k === "accentColor") {
      document.documentElement.style.setProperty("--accent", String(v));
      document.documentElement.style.setProperty("--accent-fg", readableOn(String(v)));
    }
    if (k === "colorMode") document.documentElement.classList.toggle("dark", v === "dark");
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = SettingsSchema.safeParse(s);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" · "));
      return;
    }
    setState("saving");
    try {
      setS(await api<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(parsed.data) }));
      setState("saved");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  const example = buildFilename(
    s.filenameTemplate,
    { nom: "Prosit aller SI - 1", theme: "SI : Administration et Sécurité", numero: "1", bloc: s.bloc, date: "2026-11-17", auteur: s.auteur, groupe: s.groupe, lien: "" },
    "aller",
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="title-cesi mb-6 text-2xl sm:text-3xl">
        <span className="underline-accent">Réglages</span>
      </h1>
      <form onSubmit={save} className="space-y-6">
        <Card title="Valeurs par défaut des nouveaux prosits">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Auteur (nom, prénom)">
              <input className="field" value={s.auteur} onChange={(e) => set("auteur", e.target.value)} placeholder="Nom Prénom" />
            </Field>
            <Field label="Groupe / classe">
              <input className="field" value={s.groupe} onChange={(e) => set("groupe", e.target.value)} placeholder="FISA A3" />
            </Field>
            <Field label="Bloc / projet" className="sm:col-span-2">
              <input className="field" value={s.bloc} onChange={(e) => set("bloc", e.target.value)} placeholder="SI et Sécurité 2026-27" />
            </Field>
          </div>
        </Card>

        <Card title="Nom des fichiers téléchargés">
          <Field label="Gabarit">
            <input className="field font-mono" value={s.filenameTemplate} onChange={(e) => set("filenameTemplate", e.target.value)} />
          </Field>
          <p className="mt-2 text-xs text-muted">
            Exemple : <code className="text-ink">{example}.docx</code>
          </p>
          <p className="mt-2 flex flex-wrap gap-1 text-xs text-muted">
            Variables :
            {VARS.map((v) => (
              <button key={v} type="button" className="rounded-sm bg-surface-2 px-1.5 font-mono hover:text-ink" onClick={() => set("filenameTemplate", s.filenameTemplate + v)}>
                {v}
              </button>
            ))}
          </p>
          <p className="mt-1 text-xs text-muted">{"{theme}"} = partie avant « : » (ex. « SI »). Accents et caractères interdits sont retirés automatiquement.</p>
        </Card>

        <Card title="Apparence">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Couleur d’accent">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("accentColor", c)}
                    className={`h-7 w-7 rounded-sm border ${s.accentColor.toUpperCase() === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "border-line"}`}
                    style={{ background: c }}
                    aria-label={c === "#FFE600" ? "Jaune CESI" : c}
                    title={c === "#FFE600" ? "Jaune CESI (défaut)" : c}
                  />
                ))}
                <input type="color" value={s.accentColor} onChange={(e) => set("accentColor", e.target.value.toUpperCase())} className="h-7 w-10 cursor-pointer border border-line bg-surface" aria-label="Couleur personnalisée" />
              </div>
            </Field>
            <Field label="Mode">
              <div className="flex gap-2">
                {(["light", "dark"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => set("colorMode", m)} className={`btn flex-1 justify-center ${s.colorMode === m ? "btn-primary" : ""}`}>
                    {m === "light" ? "Clair" : "Sombre"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Police du document exporté">
              <select className="field" value={s.docFont} onChange={(e) => set("docFont", e.target.value as Settings["docFont"])}>
                {DOC_FONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label="Couleur des numéros et puces du document">
              <div className="flex items-center gap-2">
                <input type="color" value={s.docSecondaryColor} onChange={(e) => set("docSecondaryColor", e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer border border-line bg-surface" />
                <button type="button" className="btn text-xs" onClick={() => set("docSecondaryColor", DEFAULT_SETTINGS.docSecondaryColor)}>Rose (modèle)</button>
                <button type="button" className="btn text-xs" onClick={() => set("docSecondaryColor", "#111111")}>Noir</button>
              </div>
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted">La couleur d’accent colore aussi le bloc titre, les repères de section et le trait de l’en-tête du document.</p>
        </Card>

        {error && <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          {state === "saved" && <span className="text-sm text-muted">Réglages enregistrés ✓</span>}
          <button className="btn btn-primary" disabled={state === "saving"}>
            {state === "saving" ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-line bg-surface p-4 sm:p-5">
      <h2 className="title-cesi mb-4 text-sm">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}
