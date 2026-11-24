import { describe, expect, it } from "vitest";
import { cleanText, formatHypotheses, formatPlanList, formatProsit, parsePlanText, parsePoint, similarity } from "@/lib/format";
import type { Content, ListItem } from "@/lib/schema";

const li = (text: string, extra: Partial<ListItem> = {}): ListItem => ({ id: Math.random().toString(36).slice(2), text, level: 0, ...extra });

describe("nettoyage de texte", () => {
  it("retire markdown et citations, normalise espaces et majuscules", () => {
    expect(cleanText("  **Etudier**   le  `DNS` [1][2] ")).toBe("Étudier le DNS");
    expect(cleanText("a cause du réseau")).toBe("A cause du réseau".replace(/^A cause/, "À cause"));
    expect(cleanText("le S.I. est organisé [3]")).toBe("Le S.I. est organisé"); // pas de majuscule après « S.I. »
    expect(cleanText("Texte. Etude suivante")).toBe("Texte. Étude suivante");
    expect(cleanText("Accès : droit")).toBe("Accès : droit"); // espace insécable conservé
  });
  it("similarité tolérante aux accents, apostrophes et précisions ajoutées", () => {
    expect(similarity("L'arbre des dossiers correspond à l'AD", "L’arbre des dossiers correspond à l’AD (correspond au service : dossier = service)")).toBeGreaterThanOrEqual(0.8);
    expect(similarity("Comprendre les droits NFS", "Comprendre les droits NTFS")).toBeGreaterThanOrEqual(0.8);
    expect(similarity("Switch", "Serveur")).toBe(0);
    expect(similarity("Le DHCP est mal configuré", "Le DNS est mal configuré")).toBeLessThan(0.8);
    expect(similarity("Prosit 1", "Prosit 2")).toBeLessThan(0.8);
  });
});

describe("parseur de texte libre → élément du plan", () => {
  it("fixture étude AGDLP", () => {
    const el = parsePlanText(`Définir la méthode AGDLP
La méthode AGDLP (Account, Global, Domain Local, Permission) est la bonne pratique Microsoft pour gérer les droits d'accès en environnement Active Directory :
- A (Account) : les comptes utilisateurs sont placés dans des groupes Globaux (ex. : GG_Comptabilite)
- G (Global) : ces groupes globaux sont imbriqués dans des groupes Domaine Local (ex. : DL_Partage_Compta_RW)
Avantage : pour ajouter ou retirer un utilisateur, on modifie uniquement le groupe global, sans toucher aux ACL des dossiers.`);
    expect(el.titre).toBe("Définir la méthode AGDLP");
    expect(el.description).toMatch(/^La méthode AGDLP .* Active Directory :$/);
    expect(el.points?.map((p) => p.label)).toEqual(["A (Account)", "G (Global)"]);
    expect(el.points?.[0].texte).toBe("Les comptes utilisateurs sont placés dans des groupes Globaux (ex. : GG_Comptabilite)");
    expect(el.interet).toMatch(/^Pour ajouter ou retirer un utilisateur/);
    expect(el.etapes).toBeUndefined();
  });

  it("fixture réalisation : étapes numérotées, pas de label dans une parenthèse", () => {
    const el = parsePlanText(`Créer les dossiers partagés et attribuer les droits
1. Créer l'arborescence sur le serveur de fichiers (un dossier racine par service : Comptabilité, RH, Bureau d'Études, Direction)
2. Créer les groupes AD selon AGDLP`);
    expect(el.titre).toBe("Créer les dossiers partagés et attribuer les droits");
    expect(el.etapes).toEqual([
      "Créer l'arborescence sur le serveur de fichiers (un dossier racine par service : Comptabilité, RH, Bureau d'Études, Direction)",
      "Créer les groupes AD selon AGDLP",
    ]);
    expect(el.points).toBeUndefined();
  });

  it("label : 1 à 6 mots, parenthèses fermées, sinon texte normal", () => {
    expect(parsePoint("Animateur : Aubin")).toEqual({ label: "Animateur", texte: "Aubin" });
    expect(parsePoint("Une phrase assez longue qui contient plus de six mots : puis une suite")).toEqual({
      texte: "Une phrase assez longue qui contient plus de six mots : puis une suite",
    });
    expect(parsePoint("Dossier racine (par service : Compta) et suite").label).toBeUndefined();
  });
});

describe("hypothèses", () => {
  it("fixture : doublons fusionnés, statut déduit du symbole, symbole retiré", () => {
    const out = formatHypotheses([
      li("✔ L'arbre des dossiers correspond à l'AD → bonne pratique : l'arborescence reflète l'organigramme"),
      li("L’arbre des dossiers correspond à l’AD (correspond au service : dossier = service)", { status: "valid", detail: "L'arborescence reflète l'organigramme." }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("valid");
    expect(out[0].text).not.toMatch(/[✔◐✘]/);
    expect(out[0].text.startsWith("L")).toBe(true);
    expect(out[0].detail).toBeTruthy();
  });
  it("justification collée après « : » seulement après au moins 6 mots", () => {
    const [a, b] = formatHypotheses([li("Les droits sont mal gérés par les groupes AD : faux, ils sont individuels"), li("DHCP : à vérifier")]);
    expect(a).toMatchObject({ text: "Les droits sont mal gérés par les groupes AD", detail: "Faux, ils sont individuels" });
    expect(b).toMatchObject({ text: "DHCP : à vérifier" });
  });
  it("◐ et ✘ donnent partielle / non validée sans écraser un statut déjà choisi", () => {
    const [a, b] = formatHypotheses([li("◐ Hypothèse A sur le réseau"), li("✘ Hypothèse B sur les droits", { status: "valid" })]);
    expect(a.status).toBe("partial");
    expect(b.status).toBe("valid");
    expect(b.text).toBe("Hypothèse B sur les droits");
  });
});

describe("plan d'action", () => {
  it("migre un ancien élément fourre-tout (texte + détail multi-lignes)", () => {
    const [el] = formatPlanList(
      [li("Définir la méthode AGDLP", { detail: "La méthode AGDLP est la bonne pratique.\n- A (Account) : comptes\n- G (Global) : groupes\nIntérêt : simplifie les droits" })],
      "etude",
    );
    expect(el.text).toBe("Définir la méthode AGDLP");
    expect(el.detail).toBeUndefined();
    expect(el.description).toBe("La méthode AGDLP est la bonne pratique.");
    expect(el.points).toEqual([
      { label: "A (Account)", texte: "Comptes" },
      { label: "G (Global)", texte: "Groupes" },
    ]);
    expect(el.interet).toBe("Simplifie les droits");
  });
  it("sous-éléments → points (études) ou étapes (réalisation)", () => {
    const etude = formatPlanList([li("Comprendre l'AD"), li("Forêt : ensemble de domaines", { level: 1 })], "etude");
    expect(etude).toHaveLength(1);
    expect(etude[0].points).toEqual([{ label: "Forêt", texte: "Ensemble de domaines" }]);
    const real = formatPlanList([li("Installer l'AD"), li("Nommer le serveur", { level: 1 }), li("Promouvoir en DC", { level: 1 })], "realisation");
    expect(real[0].etapes).toEqual(["Nommer le serveur", "Promouvoir en DC"]);
  });
  it("supprime l'élément vide en double et les éléments vides", () => {
    const out = formatPlanList([li("Comprendre les droits NFS"), li("Comprendre les droits NTFS", { description: "Permissions NTFS." }), li("  ")], "etude");
    expect(out.map((i) => i.text)).toEqual(["Comprendre les droits NTFS"]);
  });
  it("garde un titre seul (prosit aller)", () => {
    expect(formatPlanList([li("Comprendre l'AD"), li("Comprendre les GPO")], "etude")).toHaveLength(2);
  });
});

describe("formatProsit", () => {
  const retour: Content = {
    contexte: "Analyser le besoin.\nNeoLink veut  uniformiser **son** administration [1].",
    motsInconnus: [li("**Switch** : relie les machines"), li("Contexte")],
    pistes: [li("✔ Hypothèse sur l'AD → confirmée"), li("Hypothèse sur l'AD", { status: "valid" })],
    etude: [li("Comprendre l'AD", { detail: "L'annuaire Microsoft.\n- Forêt : ensemble de domaines" })],
    syntheseIntro: "Un **SI** est organisé.",
  };
  const f = formatProsit(retour, "retour");

  it("retire le paragraphe parasite et le markdown, garde le gras voulu de la synthèse", () => {
    expect(f.contexte).toBe("NeoLink veut uniformiser son administration.");
    expect(f.syntheseIntro).toBe("Un **SI** est organisé.");
  });
  it("sépare « terme : définition » et garde un mot clé qui ressemble à un titre", () => {
    expect((f.motsInconnus as ListItem[]).map((i) => [i.text, i.detail])).toEqual([
      ["Switch", "Relie les machines"],
      ["Contexte", undefined],
    ]);
  });
  it("fusionne les hypothèses et structure le plan", () => {
    expect(f.pistes as ListItem[]).toHaveLength(1);
    expect((f.etude as ListItem[])[0]).toMatchObject({ description: "L'annuaire Microsoft.", points: [{ label: "Forêt", texte: "Ensemble de domaines" }] });
  });
  it("est idempotent et déterministe", () => {
    expect(formatProsit(f, "retour")).toEqual(f);
    expect(formatProsit(retour, "retour")).toEqual(f);
  });
});
