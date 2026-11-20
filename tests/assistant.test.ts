import { describe, expect, it } from "vitest";
import { docToText } from "@/lib/ai/doc-text";
import { htmlToText } from "@/lib/ai/html-text";
import { extractInsertable, textForTextField, textToListItems } from "@/lib/ai/insert";
import { isPrivateAddress } from "@/lib/ai/links";
import { parseEvent } from "@/lib/ai/perplexity";
import { buildContext } from "@/lib/ai/prompt";
import { emptyContent, getTemplate } from "@/lib/templates";
import type { Meta } from "@/lib/schema";

const meta: Meta = { nom: "Prosit SI - 1", theme: "Système d'information", numero: "1", bloc: "", date: "", auteur: "", groupe: "", lien: "" };
let seq = 0;
const newId = () => `t${++seq}`;

describe("docToText", () => {
  it("liste toutes les rubriques, marque les vides et garde définitions et statuts", () => {
    const c = emptyContent(getTemplate("retour"));
    c.contexte = "Une PME a des problèmes d'accès.";
    c.motsInconnus = [{ id: "a", text: "VLAN", level: 0, detail: "Réseau local virtuel" }];
    c.pistes = [{ id: "b", text: "Mauvaise segmentation", level: 0, status: "valid" }];
    const t = docToText(meta, "retour", c);
    expect(t).toContain("# Prosit retour — Prosit SI - 1");
    expect(t).toContain("## II. Contexte\nUne PME a des problèmes d'accès.");
    expect(t).toContain("- VLAN\n  Définition : Réseau local virtuel");
    expect(t).toContain("- Mauvaise segmentation [Validée]");
    expect(t).toMatch(/## III\. Problématique\n\(vide\)/);
    expect(t).toContain("### Études");
  });
});

describe("htmlToText", () => {
  it("retire scripts et menus et garde la structure", () => {
    const { title, text } = htmlToText(
      "<html><head><title>Cours &amp; TD</title><script>x()</script></head><body><nav>Menu</nav><h1>VLAN</h1><p>Un VLAN&nbsp;isole.</p><ul><li>A</li><li>B</li></ul></body></html>",
    );
    expect(title).toBe("Cours & TD");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("x()");
    expect(text).toContain("VLAN\n");
    expect(text).toContain("Un VLAN isole.");
    expect(text).toContain("- A\n- B");
  });
});

describe("insertion des propositions", () => {
  it("prend le dernier bloc ```prosit``` et retire les citations", () => {
    const a = "Voici :\n```prosit\n- un [1]\n```\nPuis :\n```prosit\n- VLAN : réseau virtuel [2][3]\n```\nFin";
    expect(extractInsertable(a)).toBe("- VLAN : réseau virtuel");
    expect(extractInsertable("pas de bloc")).toBeNull();
  });

  it("convertit puces, indentation et « terme : définition »", () => {
    const items = textToListItems("- **VLAN** : réseau virtuel\n  - sous-point\n1. DHCP — attribution d'adresses\n    suite de la définition", { withDetail: true, newId });
    expect(items.map((i) => [i.text, i.level, i.detail])).toEqual([
      ["VLAN", 0, "réseau virtuel"],
      ["sous-point", 1, undefined],
      ["DHCP", 0, "attribution d'adresses\nsuite de la définition"],
    ]);
  });

  it("sans définition, garde la ligne entière et normalise les niveaux", () => {
    const items = textToListItems("    - trop indenté\n- Étudier : les VLAN", { withDetail: false, newId });
    expect(items.map((i) => [i.text, i.level])).toEqual([
      ["trop indenté", 0],
      ["Étudier : les VLAN", 0],
    ]);
  });

  it("champ texte : retire puces et renvois", () => {
    expect(textForTextField("- Comment sécuriser le SI ? [1]")).toBe("Comment sécuriser le SI ?");
  });
});

describe("liens d'aide", () => {
  it("repère les adresses privées", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });

  it("joint les ressources lues et signale les liens illisibles", () => {
    const ctx = buildContext({
      type: "aller",
      docText: "# doc",
      focus: "Contexte",
      links: [
        { url: "https://a.fr", ok: true, title: "Cours", text: "contenu du cours" },
        { url: "https://moodle.fr/x", ok: false, error: "page de connexion (lien privé)" },
      ],
    });
    expect(ctx).toContain("<<<RESSOURCE https://a.fr — Cours\ncontenu du cours\nRESSOURCE>>>");
    expect(ctx).toContain("- https://moodle.fr/x (page de connexion (lien privé))");
    expect(ctx).toContain("Rubrique sur laquelle l'étudiant travaille : Contexte");
  });
});

describe("flux Perplexity", () => {
  it("lit le texte et les sources de l'Agent API", () => {
    expect(parseEvent({ type: "response.output_text.delta", delta: "Bon" })).toEqual([{ type: "text", text: "Bon" }]);
    expect(parseEvent({ type: "response.output_item.done", item: { type: "search_results", results: [{ id: 1, url: "https://x.fr", title: "X" }] } })).toEqual([
      { type: "sources", sources: [{ url: "https://x.fr", title: "X" }] },
    ]);
  });

  it("accepte l'ancien format Sonar et remonte les erreurs", () => {
    expect(parseEvent({ choices: [{ delta: { content: "a" } }], citations: ["https://y.fr"] })).toEqual([
      { type: "text", text: "a" },
      { type: "sources", sources: [{ url: "https://y.fr", title: "https://y.fr" }] },
    ]);
    expect(() => parseEvent({ type: "error", error: { message: "quota" } })).toThrow(/quota/);
  });
});
