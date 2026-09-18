import { sumMoney, toMoney } from "../../packages/contracts/index.js";

/**
 * ═══ A AGREGAÇÃO DO RESUMO DA FOLHA — PURA (V6.2 U1; extraída no V11 V4.2) ═══
 *
 * ⚠️ ELA MORAVA NUMA PORTA, e isso era o problema. `lib/portas/recursos/resumo-da-folha.ts` faz
 * três coisas: lê o banco, agrega, e monta o PDF — e por isso carrega `lib/pdf/`, `lib/format/` e
 * a identidade do ente. Quando o demonstrativo público de pessoal precisou da MESMA agregação
 * (para que o portal e a tela interna nunca divirjam), importar aquela porta arrastou o gerador de
 * PDF inteiro para dentro do projeto backend — e com ele uma cascata de arquivos que nunca tinham
 * sido conferidos ali. Catorze erros de tipo, todos em código pré-existente e correto no app.
 *
 * A aritmética não precisa de nada disso: ela é `Decimal` sobre linhas. Aqui, no domínio, ela é
 * importável por qualquer um — porta interna, porta pública, teste — sem trazer I/O junto.
 *
 * ⚠️ BRUTO MENOS DESCONTOS É O LÍQUIDO DO SERVIDOR; o PATRONAL é do ENTE e fica ao lado, nunca
 * somado ao líquido nem subtraído dele. O custo da folha para o ente é bruto + patronal, e quem
 * consome esta função é que diz isso numa linha própria — para ninguém somar de cabeça.
 *
 * ⚠️ `patronal` NULO É "NÃO APURADO", e ele CONTAMINA o grupo: se um vínculo do grupo não tem
 * encargo apurado, o total do grupo é nulo, não a soma dos que têm. Um total parcial apresentado
 * como total seria pior que a ausência — ele parece completo.
 */

export interface LinhaParaResumo {
  readonly regime: string;
  readonly lotacao: string;
  readonly bruto: string;
  readonly descontos: string;
  readonly liquido: string;
  /** Nulo = encargos não apurados para este vínculo. */
  readonly patronal: string | null;
}

export interface GrupoDoResumo {
  readonly regime: string;
  readonly lotacao: string;
  readonly vinculos: number;
  readonly bruto: string;
  readonly descontos: string;
  readonly liquido: string;
  readonly patronal: string | null;
}

/** Agrega por regime × lotação, somando em Decimal. PURA — é o que o teste confere contra contas à mão. */
export function agregarResumoDaFolha(linhas: readonly LinhaParaResumo[]): {
  readonly grupos: readonly GrupoDoResumo[];
  readonly total: GrupoDoResumo;
  readonly custoDoEnte: string | null;
} {
  const mapa = new Map<string, LinhaParaResumo[]>();
  for (const l of linhas) {
    const k = `${l.regime} ${l.lotacao}`;
    mapa.set(k, [...(mapa.get(k) ?? []), l]);
  }
  const somar = (ls: readonly LinhaParaResumo[], regime: string, lotacao: string): GrupoDoResumo => ({
    regime,
    lotacao,
    vinculos: ls.length,
    bruto: sumMoney(ls.map((l) => toMoney(l.bruto))).toFixed(2),
    descontos: sumMoney(ls.map((l) => toMoney(l.descontos))).toFixed(2),
    liquido: sumMoney(ls.map((l) => toMoney(l.liquido))).toFixed(2),
    patronal: ls.some((l) => l.patronal === null) ? null : sumMoney(ls.map((l) => toMoney(l.patronal as string))).toFixed(2),
  });
  const grupos = [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, ls]) => somar(ls, ls[0]?.regime ?? "", ls[0]?.lotacao ?? ""));
  const total = somar(linhas, "TOTAL", "");
  return {
    grupos,
    total,
    custoDoEnte: total.patronal === null ? null : toMoney(toMoney(total.bruto).plus(total.patronal)).toFixed(2),
  };
}
