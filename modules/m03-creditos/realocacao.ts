import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { AutorizacaoPort } from "../m16-travamento/porta.js";
import type { IdPort } from "../m01-core-contabil/ports.js";
import { somarItens } from "./dominio.js";

/**
 * ═══ A REALOCAÇÃO DE DOTAÇÃO POR LEI ESPECÍFICA (V21 — C19) ═══
 *
 * O remanejamento, a transposição e a transferência de recursos de uma categoria de programação
 * para outra, ou de um órgão para outro — a Constituição, art. 167, VI, veda fazê-los "sem prévia
 * autorização legislativa". Este arquivo é o domínio (sem I/O) e o caso de uso; o adapter mora em
 * `adapter-realocacao.ts`.
 *
 * ═══ ⚠️ POR QUE NÃO É CRÉDITO ADICIONAL, E POR QUE ISSO IMPORTA ═══
 * O crédito adicional autoriza despesa não computada ou insuficientemente dotada (Lei 4.320,
 * art. 40) e consome o LIMITE que a LOA dá ao Executivo. O `TipoCredito` governa esse limite, e
 * dez sítios do repositório enumeram os seus três valores. A realocação move dotação que JÁ
 * EXISTE, por lei própria, fora daquele limite. Um quarto `TipoCredito` a faria herdar o teto da
 * lei de crédito, a conta do ramo 5.2.2.1.2 e o campo do MANAD — três respostas erradas de uma vez.
 *
 * ═══ O QUE É IGUAL AO CRÉDITO POR ANULAÇÃO, E VEM DE LÁ ═══
 * O balanceamento: Σ acréscimo == Σ redução, no total E em CADA FONTE. Mover dotação de fonte
 * vinculada para fonte livre fecharia no total e furaria a vinculação do recurso (LRF, art. 8º,
 * parágrafo único) — a mesma razão do crédito por anulação. A SOMA é a do M03 (`somarItens`); as
 * mensagens são desta operação, porque "crédito por anulação" na tela de um remanejamento
 * mandaria o operador procurar o defeito no lugar errado.
 */

export type EspecieDeRealocacao = "REMANEJAMENTO" | "TRANSPOSICAO" | "TRANSFERENCIA";
export type TipoPernaDeRealocacao = "ACRESCIMO" | "REDUCAO";

export const ESPECIES_DE_REALOCACAO: readonly EspecieDeRealocacao[] = [
  "REMANEJAMENTO",
  "TRANSPOSICAO",
  "TRANSFERENCIA",
];

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "O valor de cada perna tem de ser maior que zero.",
});

export const zPernaDeRealocacao = z.object({
  fichaId: z.string().min(1),
  tipo: z.enum(["ACRESCIMO", "REDUCAO"]),
  valor: zValorPositivo,
  /** A fonte da ficha. Conferida contra a ficha no adapter — não é escolha de quem digita. */
  fonteId: z.string().min(1),
});

export const zRegistrarRealocacaoInput = z.object({
  especie: z.enum(["REMANEJAMENTO", "TRANSPOSICAO", "TRANSFERENCIA"]),
  numero: z.string().trim().min(1, "Informe o número do ato que executa a realocação."),
  /** A data do FATO — competência do movimento e do lançamento. */
  data: z.coerce.date(),
  leiNumero: z.string().trim().min(1, "Informe o número da lei que autorizou a realocação."),
  leiDataPublicacao: z.coerce.date(),
  /** V35 — a autorização percentual da LOA, quando o ato é decreto sob ela (os acréscimos correm contra o percentual). */
  autorizacaoDaLoaId: z.string().min(1).nullable().optional(),
  justificativa: z.string().trim().min(10, {
    message:
      "Explique por que a dotação muda de lugar (ex.: 'Reorganização da Secretaria de Obras, Lei 123/2026'). " +
      "É esta frase que a prestação de contas lê.",
  }),
  pernas: z.array(zPernaDeRealocacao).min(2, "A realocação tem ao menos uma ficha que cede e uma que recebe."),
  criadoPor: z.string().min(1),
});

export const zAnularRealocacaoInput = z.object({
  atoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: z.string().trim().min(10, {
    message: "Explique por que a realocação está sendo desfeita (ao menos uma frase).",
  }),
  criadoPor: z.string().min(1),
});

export type RegistrarRealocacaoInput = z.input<typeof zRegistrarRealocacaoInput>;
export type AnularRealocacaoInput = z.input<typeof zAnularRealocacaoInput>;
export type PernaDeRealocacao = z.output<typeof zPernaDeRealocacao>;

export interface TotaisDaRealocacao {
  readonly acrescido: Money;
  readonly reduzido: Money;
  readonly porFonte: ReadonlyMap<string, { readonly acrescido: Money; readonly reduzido: Money }>;
}

/**
 * Soma por perna e por fonte. Sem I/O. ⚠️ A SOMA É A DO CRÉDITO POR ANULAÇÃO (`somarItens`): a
 * perna que recebe entra como a suplementação, a que cede como a anulação. Uma segunda soma aqui
 * seria uma segunda definição de "fecha por fonte", livre para divergir da primeira.
 */
export function somarPernas(pernas: readonly PernaDeRealocacao[]): TotaisDaRealocacao {
  const t = somarItens(
    pernas.map((p) => ({
      fichaId: p.fichaId,
      fonteId: p.fonteId,
      valor: p.valor,
      tipo: p.tipo === "ACRESCIMO" ? ("SUPLEMENTACAO" as const) : ("ANULACAO" as const),
    }))
  );
  const porFonte = new Map<string, { readonly acrescido: Money; readonly reduzido: Money }>();
  for (const [fonteId, f] of t.porFonte) {
    porFonte.set(fonteId, { acrescido: f.suplementado, reduzido: f.anulado });
  }
  return { acrescido: t.suplementado, reduzido: t.anulado, porFonte };
}

/**
 * AS REGRAS DE FORMA DO ATO, sem I/O — conferidas ANTES de abrir transação.
 *
 *   1. ao menos uma ficha que cede e uma que recebe;
 *   2. uma ficha aparece UMA vez no ato — ceder e receber na mesma ficha, ou duas pernas na mesma
 *      ficha, é um ato que se escreve com menos linhas e cujo efeito líquido ninguém lê de primeira;
 *   3. Σ acréscimo == Σ redução no total — a realocação não cria nem destrói orçamento;
 *   4. e em CADA FONTE — a vinculação do recurso;
 *   5. a lei é ANTERIOR ou do mesmo dia do ato, pela data CIVIL do ente — "prévia autorização
 *      legislativa" (art. 167, VI). Comparar em UTC deixaria uma lei publicada às 22h de um dia
 *      contar como do dia seguinte.
 *
 * FAIL-CLOSED: qualquer uma falha, lança — nada é gravado.
 */
export function validarRealocacao(d: {
  readonly data: Date;
  readonly leiDataPublicacao: Date;
  readonly pernas: readonly PernaDeRealocacao[];
}): TotaisDaRealocacao {
  const cedem = d.pernas.filter((p) => p.tipo === "REDUCAO");
  const recebem = d.pernas.filter((p) => p.tipo === "ACRESCIMO");
  if (cedem.length === 0 || recebem.length === 0) {
    throw new Error(
      `A realocação precisa de ao menos uma ficha que CEDE e uma que RECEBE dotação ` +
        `(recebidas ${String(cedem.length)} que cede(m) e ${String(recebem.length)} que recebe(m)). ` +
        `Nada foi gravado.`
    );
  }

  const vistas = new Set<string>();
  for (const p of d.pernas) {
    if (vistas.has(p.fichaId)) {
      throw new Error(
        `A mesma ficha aparece em mais de uma perna do ato. Cada ficha entra uma vez só — ou cede, ou ` +
          `recebe, com o valor total. Nada foi gravado.`
      );
    }
    vistas.add(p.fichaId);
  }

  const totais = somarPernas(d.pernas);
  if (!totais.acrescido.equals(totais.reduzido)) {
    throw new Error(
      `A realocação NÃO FECHA: as fichas que recebem somam ${totais.acrescido.toFixed(2)} e as que ` +
        `cedem somam ${totais.reduzido.toFixed(2)} (diferença ` +
        `${toMoney(totais.acrescido.minus(totais.reduzido)).toFixed(2)}). Remanejar, transpor ou ` +
        `transferir move dotação que já existe — o total do orçamento não muda. Nada foi gravado.`
    );
  }
  for (const [fonteId, t] of totais.porFonte) {
    if (!t.acrescido.equals(t.reduzido)) {
      throw new Error(
        `A realocação NÃO FECHA na fonte ${fonteId}: recebe ${t.acrescido.toFixed(2)} e cede ` +
          `${t.reduzido.toFixed(2)}. Cada fonte tem de fechar sozinha — levar dotação de uma fonte ` +
          `para outra fura a vinculação do recurso. Nada foi gravado.`
      );
    }
  }

  if (diaCivil(d.leiDataPublicacao) > diaCivil(d.data)) {
    throw new Error(
      `A lei foi publicada em ${diaCivil(d.leiDataPublicacao)}, depois do ato (${diaCivil(d.data)}). ` +
        `A Constituição exige autorização legislativa PRÉVIA para remanejar, transpor ou transferir ` +
        `(art. 167, VI). Nada foi gravado.`
    );
  }

  return totais;
}

// ── A PORTA DE PERSISTÊNCIA ─────────────────────────────────────────────────────────────

export interface RealocacaoParaPersistir {
  readonly atoId: string;
  readonly especie: EspecieDeRealocacao;
  readonly numero: string;
  readonly data: Date;
  readonly leiNumero: string;
  readonly leiDataPublicacao: Date;
  readonly autorizacaoDaLoaId: string | null;
  readonly justificativa: string;
  readonly pernas: readonly (PernaDeRealocacao & { readonly itemId: string })[];
  readonly criadoPor: string;
}

export interface AtoParaAnular {
  readonly id: string;
  readonly numero: string;
  readonly ano: number;
  readonly anulado: boolean;
  readonly pernasVivas: readonly { readonly id: string; readonly fichaId: string }[];
}

export interface RealocacaoRepositoryPort {
  registrar(p: RealocacaoParaPersistir): Promise<{ readonly atoId: string; readonly ano: number }>;
  buscarParaAnular(atoId: string): Promise<AtoParaAnular | null>;
  anular(p: {
    readonly atoId: string;
    readonly data: Date;
    readonly motivo: string;
    readonly criadoPor: string;
    readonly idsDasPernasDeEstorno: readonly string[];
  }): Promise<{ readonly pernasEstornadas: number }>;
}

export interface RealocacaoDeps {
  readonly autz: AutorizacaoPort;
  readonly realocacoes: RealocacaoRepositoryPort;
  readonly ids: IdPort;
}

// ── OS CASOS DE USO ─────────────────────────────────────────────────────────────────────

/**
 * REGISTRA o ato e escritura as pernas — UM ato, indivisível.
 *
 * ⚠️ A AUTORIZAÇÃO É SOBRE TODAS AS FICHAS, as que cedem e as que recebem. Quem só tem poder na
 * Saúde não executa "a parte dele" de um remanejamento da Educação para a Saúde: gravar metade
 * seria uma realocação que não fecha. Mesmo desenho do `executarCredito`.
 */
export async function registrarRealocacao(
  input: RegistrarRealocacaoInput,
  deps: RealocacaoDeps
): Promise<{ readonly atoId: string; readonly ano: number; readonly total: string }> {
  const d = zRegistrarRealocacaoInput.parse(input);
  const totais = validarRealocacao(d);

  await deps.autz.exigir(d.criadoPor, ACAO_DO_SERVICO.registrarRealocacao, {
    fichas: d.pernas.map((p) => p.fichaId),
  });

  const r = await deps.realocacoes.registrar({
    atoId: deps.ids.novo(),
    especie: d.especie,
    numero: d.numero,
    data: d.data,
    leiNumero: d.leiNumero,
    leiDataPublicacao: d.leiDataPublicacao,
    autorizacaoDaLoaId: d.autorizacaoDaLoaId ?? null,
    justificativa: d.justificativa,
    pernas: d.pernas.map((p) => ({ ...p, itemId: deps.ids.novo() })),
    criadoPor: d.criadoPor,
  });
  return { ...r, total: totais.acrescido.toFixed(2) };
}

/**
 * DESFAZ o ato: o original fica intacto; cada perna viva ganha uma perna nova invertida e o
 * lançamento dela é ESTORNADO (mesmas contas, lados trocados).
 *
 * ⚠️ AS MESMAS FICHAS DO REGISTRO — desfazer devolve dotação a quem cedeu e tira de quem recebeu.
 */
export async function anularRealocacao(
  input: AnularRealocacaoInput,
  deps: RealocacaoDeps
): Promise<{ readonly pernasEstornadas: number; readonly numero: string; readonly ano: number }> {
  const d = zAnularRealocacaoInput.parse(input);
  const ato = await deps.realocacoes.buscarParaAnular(d.atoId);
  if (ato === null) {
    throw new Error(`Ato de realocação não encontrado. Nada foi gravado.`);
  }
  if (ato.anulado) {
    throw new Error(
      `O ato ${ato.numero}/${String(ato.ano)} já foi anulado — uma realocação se desfaz uma vez. ` +
        `Nada foi gravado.`
    );
  }

  await deps.autz.exigir(d.criadoPor, ACAO_DO_SERVICO.anularRealocacao, {
    fichas: ato.pernasVivas.map((p) => p.fichaId),
  });

  const r = await deps.realocacoes.anular({
    atoId: ato.id,
    data: d.data,
    motivo: d.motivo,
    criadoPor: d.criadoPor,
    idsDasPernasDeEstorno: ato.pernasVivas.map(() => deps.ids.novo()),
  });
  return { ...r, numero: ato.numero, ano: ato.ano };
}
