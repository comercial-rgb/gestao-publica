import { diaCivil } from "../../packages/datas/index.js";
import { z } from "zod";
import { toMoney, type Money } from "../../packages/contracts/index.js";

/**
 * M09 — O LOTE DE PAGAMENTO E O BORDERÔ: as regras PURAS.
 *
 * Sem Prisma, sem I/O. É o que se pode testar sem banco — e é onde mora a decisão de
 * "em que pé está isto?", que em todo este repositório é DERIVADA de movimentos.
 */

// ═══════════════════════════════════════════════════════════════════════════
// O ESTADO DO LOTE — derivado, nunca gravado
// ═══════════════════════════════════════════════════════════════════════════

export type EstadoDoLote = "ABERTO" | "FECHADO" | "CANCELADO";

export interface MovimentoDoLoteLido {
  readonly tipo: "FECHADO" | "REABERTO" | "CANCELADO";
  readonly criadoEm: Date;
}

/**
 * ⚠️ O ESTADO É O ÚLTIMO MOVIMENTO, e "ABERTO" é a AUSÊNCIA de movimento.
 *
 * Não há movimento "criar", do mesmo jeito que não há movimento "nascer" — criar o lote É
 * a existência dele. Um `TipoMovimentoDoLote.ABERTO` obrigaria toda criação a gravar duas
 * linhas, e o dia em que alguém esquecesse a segunda o lote não teria estado nenhum.
 *
 * ⚠️ E O CANCELAMENTO É TERMINAL. Reabrir um lote cancelado apagaria a razão pela qual ele
 * foi cancelado — que é justamente o que o motivo registra.
 */
export function estadoDoLote(
  movimentos: readonly MovimentoDoLoteLido[]
): EstadoDoLote {
  const ordenados = [...movimentos].sort(
    (a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()
  );
  let estado: EstadoDoLote = "ABERTO";
  for (const m of ordenados) {
    if (m.tipo === "CANCELADO") return "CANCELADO";
    estado = m.tipo === "FECHADO" ? "FECHADO" : "ABERTO";
  }
  return estado;
}

// ═══════════════════════════════════════════════════════════════════════════
// O ESTADO DO BORDERÔ
// ═══════════════════════════════════════════════════════════════════════════

export type EstadoDoBordero =
  | "GERADO"
  | "ENVIADO"
  | "RETORNO_PROCESSADO"
  | "CANCELADO";

export interface MovimentoDoBorderoLido {
  readonly tipo: "ENVIADO" | "RETORNO_PROCESSADO" | "CANCELADO";
  readonly criadoEm: Date;
}

export function estadoDoBordero(
  movimentos: readonly MovimentoDoBorderoLido[]
): EstadoDoBordero {
  const ordenados = [...movimentos].sort(
    (a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()
  );
  let estado: EstadoDoBordero = "GERADO";
  for (const m of ordenados) {
    if (m.tipo === "CANCELADO") return "CANCELADO";
    estado = m.tipo;
  }
  return estado;
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ASSINATURAS — a pergunta vai ao M22, e a resposta se lê aqui
// ═══════════════════════════════════════════════════════════════════════════

export interface SignatarioLido {
  readonly ordem: number;
  readonly usuarioIdent: string;
  /** `null` = ainda não assinou. Vem de `SignatarioDaFila.assinatura`. */
  readonly assinouEm: Date | null;
}

export interface EstadoDasAssinaturas {
  readonly exigidas: number;
  readonly colhidas: number;
  readonly completa: boolean;
  /** Quem tem de assinar AGORA — a fila é ordenada. `null` quando completa. */
  readonly proximo: string | null;
  readonly faltam: readonly string[];
}

/**
 * ⚠️ "TEM TODAS AS ASSINATURAS?" É LIDO DA FILA DO M22, e não de um booleano local.
 *
 * Um `Bordero.assinado` seria a segunda verdade sobre a assinatura, e ela divergiria no
 * primeiro caso interessante: uma fila de três em que o terceiro nunca assinou, com o
 * booleano gravado por engano na segunda assinatura. O dinheiro sairia com um documento
 * que a tela chamaria de assinado.
 *
 * ⚠️ E A FILA VAZIA NÃO É "COMPLETA".
 *
 * `[].every(...)` devolve `true` em JavaScript, e essa é a armadilha exata: um borderô sem
 * signatário nenhum passaria por "todas as assinaturas colhidas" e seria enviado ao banco.
 * A regra do lote (teste 5) é que ele NÃO se gera nem se envia sem as assinaturas
 * exigidas — e zero exigidas é uma configuração inválida, não um atalho.
 */
export function estadoDasAssinaturas(
  signatarios: readonly SignatarioLido[]
): EstadoDasAssinaturas {
  const ordenados = [...signatarios].sort((a, b) => a.ordem - b.ordem);
  const faltam = ordenados.filter((s) => s.assinouEm === null);
  const colhidas = ordenados.length - faltam.length;

  return {
    exigidas: ordenados.length,
    colhidas,
    // ⚠️ `length > 0` explícito — ver o docblock. Sem ele, fila vazia = "completa".
    completa: ordenados.length > 0 && faltam.length === 0,
    proximo: faltam[0]?.usuarioIdent ?? null,
    faltam: faltam.map((s) => s.usuarioIdent),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// A COMPOSIÇÃO DO LOTE
// ═══════════════════════════════════════════════════════════════════════════

export interface ItemLido {
  readonly id: string;
  readonly valor: Money;
  readonly origem: "ORCAMENTARIO" | "EXTRAORCAMENTARIO";
  /** `true` quando o retorno bancário já baixou este item. */
  readonly baixado: boolean;
}

export function totalDoLote(itens: readonly ItemLido[]): Money {
  return itens.reduce((s, i) => s.plus(i.valor), toMoney("0.00"));
}

export function totalBaixado(itens: readonly ItemLido[]): Money {
  return itens
    .filter((i) => i.baixado)
    .reduce((s, i) => s.plus(i.valor), toMoney("0.00"));
}

// ═══════════════════════════════════════════════════════════════════════════
// O CONTEÚDO ASSINÁVEL — o que o hash carimba
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaDoBordero {
  readonly ordemOuNota: string;
  readonly favorecido: string;
  readonly valor: Money;
}

/**
 * O TEXTO CANÔNICO DO BORDERÔ — é dele que sai o hash assinado.
 *
 * ⚠️ ELE É ORDENADO E DETERMINÍSTICO. Duas gerações do mesmo lote, sem movimento nenhum
 * entre elas, produzem o MESMO texto e portanto o mesmo hash. Sem isso, "a assinatura
 * confere?" seria uma pergunta sem resposta estável — e a verificação de integridade viraria
 * decoração.
 *
 * ⚠️ E O VALOR ENTRA COM DUAS CASAS, SEMPRE. `Money.toString()` de "1000.50" pode devolver
 * "1000.5"; um hash sobre isso mudaria por causa de formatação, não de conteúdo. É a mesma
 * lição que o designer de relatórios aprendeu no ENT02 com `paraCelula`.
 */
export function conteudoDoBordero(p: {
  readonly numero: number;
  readonly dataVencimento: Date;
  readonly contaBancaria: string;
  readonly linhas: readonly LinhaDoBordero[];
}): string {
  const linhas = [...p.linhas]
    .sort((a, b) => a.ordemOuNota.localeCompare(b.ordemOuNota))
    .map((l) => `${l.ordemOuNota};${l.favorecido};${l.valor.toFixed(2)}`);

  const total = p.linhas.reduce((s, l) => s.plus(l.valor), toMoney("0.00"));

  return [
    `BORDERO;${p.numero}`,
    // ⚠️ DIA CIVIL DO ENTE, e não o corte do ISO em UTC. Este texto é o conteúdo
    // CANÔNICO do borderô — é dele que sai o `hashConteudo` e é ele que vai à assinatura.
    // Um vencimento de 30/06 às 22:00 (civil) sairia como "2026-07-01" e o documento
    // assinado diria um dia a mais que o fato. Ver `packages/datas`.
    `VENCIMENTO;${diaCivil(p.dataVencimento)}`,
    `CONTA;${p.contaBancaria}`,
    ...linhas,
    `TOTAL;${total.toFixed(2)};${p.linhas.length}`,
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRADAS
// ═══════════════════════════════════════════════════════════════════════════

export const zCriarLote = z.object({
  exercicio: z.number().int(),
  dataVencimento: z.date(),
  contaBancariaId: z.string().min(1),
  descricao: z.string().trim().min(3).max(200),
  criadoPor: z.string().min(1),
});

export const zIncluirNoLote = z
  .object({
    loteId: z.string().min(1),
    ordemId: z.string().min(1).optional(),
    movimentoExtraId: z.string().min(1).optional(),
    criadoPor: z.string().min(1),
  })
  .refine(
    (d) =>
      [d.ordemId, d.movimentoExtraId].filter((v) => v !== undefined).length === 1,
    {
      message:
        "Um item do lote é UMA ordem de pagamento OU UMA nota extraorçamentária — nunca " +
        "as duas, nunca nenhuma. Sem dono não há valor a pagar; com dois, não se sabe " +
        "qual deles o banco vai liquidar.",
    }
  );

export const zGerarBordero = z.object({
  loteId: z.string().min(1),
  /** Os signatários exigidos, em ORDEM. Vazio é recusado — ver `estadoDasAssinaturas`. */
  signatarios: z.array(z.string().min(1)).min(1),
  modo: z.enum(["SIMPLES", "AVANCADA"]),
  criadoPor: z.string().min(1),
});

export const zProcessarRetorno = z.object({
  borderoId: z.string().min(1),
  linhas: z
    .array(
      z.object({
        itemId: z.string().min(1),
        dataLiquidacaoBanco: z.date(),
        identificadorBanco: z.string().min(1),
      })
    )
    .min(1),
  criadoPor: z.string().min(1),
});

export type CriarLoteInput = z.input<typeof zCriarLote>;
export type IncluirNoLoteInput = z.input<typeof zIncluirNoLote>;
export type GerarBorderoInput = z.input<typeof zGerarBordero>;
export type ProcessarRetornoInput = z.input<typeof zProcessarRetorno>;
