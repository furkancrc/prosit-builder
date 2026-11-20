/** Règles d'affichage des dossiers (année › matière), partagées par la liste et les tests. */
export interface MatiereLike {
  id: string;
  nom: string;
  debut: string;
  fin: string;
}
export interface AnneeLike<M extends MatiereLike = MatiereLike> {
  id: string;
  matieres: M[];
}

const today = () => new Date().toISOString().slice(0, 10);

/** Matière dont les dates encadrent aujourd'hui (la première trouvée), sinon undefined. */
export function currentMatiere<M extends MatiereLike>(annees: AnneeLike<M>[], day = today()): M | undefined {
  for (const a of annees) for (const m of a.matieres) if (m.debut && m.fin && m.debut <= day && day <= m.fin) return m;
  return undefined;
}

/** Année ouverte par défaut : celle de la matière en cours, sinon celle d'une matière à venir, sinon la première. */
export function defaultAnneeId(annees: AnneeLike[], day = today()): string | undefined {
  const cur = currentMatiere(annees, day);
  if (cur) return annees.find((a) => a.matieres.some((m) => m.id === cur.id))?.id;
  const next = annees.find((a) => a.matieres.some((m) => m.debut && m.debut >= day));
  return (next ?? annees[0])?.id;
}
