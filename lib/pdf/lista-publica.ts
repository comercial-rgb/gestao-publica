/**
 * O ROL PÚBLICO — só metadados (slug, rótulo). SEM puppeteer, SEM porta: a página pública de
 * transparência importa ISTO (não o motor), então o grafo dela fica leve e sem o Chromium.
 * O builder de cada um mora em `demonstrativos.ts` (que a rota de PDF importa).
 */
export interface DemonstrativoMeta {
  readonly slug: string;
  readonly rotulo: string;
  /** Como o período é escolhido (por ora, todos por bimestre). */
  readonly periodo: "bimestre";
}

export const DEMONSTRATIVOS_META: readonly DemonstrativoMeta[] = [
  { slug: "rreo-anexo1", rotulo: "RREO — Anexo 1 · Balanço Orçamentário", periodo: "bimestre" },
];
