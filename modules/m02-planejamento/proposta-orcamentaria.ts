import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { BaseDaDespesaDaProposta, BaseDaReceitaDaProposta } from "../../prisma/generated/client/enums.js";
import { Decimal, toMoney, toPercentual, type Money, type Percentual } from "../../packages/contracts/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { exigirExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { calcularSaldos, type TotaisPorTipo } from "../m05-despesa/dominio.js";
import type { TipoMovimentoDotacao } from "../m05-despesa/dominio.js";
import { criarFichaNaTransacao } from "./adapter-prisma.js";
import { SINAL_PREVISAO } from "./dominio.js";
import { travar } from "../../packages/locks/index.js";
import { CONTA_PREVISAO_DEDUCAO_FUNDEB, CONTA_PREVISAO_INICIAL_RECEITA_BRUTA, CONTA_PREVISAO_OUTRAS_DEDUCOES, CONTA_RECEITA_A_REALIZAR } from "../m01-core-contabil/roteiros.js";
import { lancarPrevisaoDaReceita } from "./previsao-no-razao.js";
import { AtoDeclaradoInvalidoError, conferirAtoDeclarado, zAtoDeclarado } from "../m01-core-contabil/ato-declarado.js";
import { baseAdmiteEnsaio, naturezaDaBase } from "../m16-travamento/natureza-da-base.js";

/**
 * A PROPOSTA ORÇAMENTÁRIA DO EXERCÍCIO SEGUINTE (V29, M02).
 *
 * Importa as receitas previstas e as fichas de um exercício (a ORIGEM) para orçar outro (o
 * DESTINO), com a base e o percentual escolhidos; cada linha se altera por AJUSTE; a EFETIVAÇÃO
 * cria as fichas e a receita prevista do destino.
 *
 * ⚠️ POR QUE A PROPOSTA NÃO É FICHA. Criar ficha grava a dotação inicial no razão, em 1º de janeiro
 * do exercício, e o razão é append-only. A proposta ainda muda até a votação; se ela fosse ficha,
 * cada mudança viraria crédito adicional. Aqui nada toca o razão até a efetivação.
 *
 * ⚠️ AUTORIZAÇÃO. Elaborar e ajustar: CADASTRAR_LOA no ENTE (é o mesmo poder de cadastrar o projeto
 * da LOA). Efetivar: CRIAR_FICHA em CADA unidade orçamentária que recebe ficha, e
 * CRIAR_RECEITA_PREVISTA no ENTE quando há receita — as mesmas perguntas da criação manual, porque
 * o efeito é o mesmo.
 */

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class PropostaOrcamentariaInvalidaError extends Error {
  override readonly name = "PropostaOrcamentariaInvalidaError";
}

const ROTULO_BASE_RECEITA: Readonly<Record<BaseDaReceitaDaProposta, string>> = {
  PREVISAO_INICIAL: "previsão inicial",
  PREVISAO_ATUALIZADA: "previsão atualizada",
  SEM_VALOR: "estrutura, sem valores",
};
const ROTULO_BASE_DESPESA: Readonly<Record<BaseDaDespesaDaProposta, string>> = {
  DOTACAO_INICIAL: "dotação inicial",
  DOTACAO_AUTORIZADA: "dotação autorizada",
  EMPENHADO: "empenhado até a importação",
  SEM_VALOR: "estrutura, sem valores",
};
export { ROTULO_BASE_DESPESA, ROTULO_BASE_RECEITA };

// ─────────────────────────────────────────────────────────────────────────────
// Domínio puro
// ─────────────────────────────────────────────────────────────────────────────

const zPercentualDaProposta = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Informe o percentual como número (ex.: 4,5 ou -2).")
  .transform((v) => toPercentual(v))
  .refine((v) => v.greaterThan(-100) && v.lessThanOrEqualTo(1000), "O percentual fica acima de -100 e até 1000.");

/**
 * O valor projetado: base × (1 + percentual / 100), em 2 casas, half-even (a regra do `toMoney`).
 * Percentual 0 devolve a base sem alteração.
 */
export function projetar(base: Money, percentual: Percentual): Money {
  return toMoney(base.times(new Decimal(1).plus(percentual.dividedBy(100))));
}

/**
 * O valor vigente de uma linha: o do ajuste mais recente, ou o projetado se não houver ajuste.
 * Os ajustes chegam em qualquer ordem; o mais recente é o de maior `criadoEm` (empate: maior id,
 * só para a escolha ser determinística).
 */
export function valorVigente(
  projetado: Money,
  ajustes: readonly { readonly id: string; readonly valor: Money; readonly criadoEm: Date }[]
): Money {
  let ultimo: (typeof ajustes)[number] | undefined;
  for (const a of ajustes) {
    if (
      ultimo === undefined ||
      a.criadoEm.getTime() > ultimo.criadoEm.getTime() ||
      (a.criadoEm.getTime() === ultimo.criadoEm.getTime() && a.id > ultimo.id)
    ) {
      ultimo = a;
    }
  }
  return ultimo === undefined ? projetado : ultimo.valor;
}

function lerOuRecusar<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new PropostaOrcamentariaInvalidaError(`${r.error.issues[0]?.message ?? "Dados inválidos."} Nada foi gravado.`);
  }
  return r.data;
}

const zExercicio = z.coerce
  .number()
  .int("Informe o exercício com quatro dígitos.")
  .min(2000, "Exercício inválido.")
  .max(2100, "Exercício inválido.");

// ─────────────────────────────────────────────────────────────────────────────
// Elaborar (importar)
// ─────────────────────────────────────────────────────────────────────────────

const zSimNao = z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1", z.boolean());

/** As escolhas da importação — as mesmas para a prévia (V38) e para o ato. */
const zEscolhasDaImportacao = z.object({
  exercicio: zExercicio,
  exercicioDeOrigem: zExercicio,
  aproveitaReceitas: zSimNao,
  aproveitaFichas: zSimNao,
  baseDaReceita: z.enum(["PREVISAO_INICIAL", "PREVISAO_ATUALIZADA", "SEM_VALOR"], { message: "Escolha o valor de partida da receita." }),
  percentualDaReceita: zPercentualDaProposta,
  baseDaDespesa: z.enum(["DOTACAO_INICIAL", "DOTACAO_AUTORIZADA", "EMPENHADO", "SEM_VALOR"], { message: "Escolha o valor de partida da despesa." }),
  percentualDaDespesa: zPercentualDaProposta,
  reajustaProjetos: zSimNao,
  incluiFichasAbertasPorCredito: zSimNao,
});
const MSG_DESTINO_POSTERIOR = "O exercício da proposta tem de ser posterior ao exercício de onde os valores são importados.";
const MSG_O_QUE_APROVEITAR = "Escolha o que aproveitar: as receitas, as fichas ou as duas.";

export const zElaborarPropostaOrcamentaria = zEscolhasDaImportacao
  .extend({
    descricao: z.string().trim().min(3, "Dê um nome à proposta (ex.: Proposta inicial 2027).").max(200),
    criadoPor: z.string().trim().min(1),
  })
  .refine((d) => d.exercicio > d.exercicioDeOrigem, { message: MSG_DESTINO_POSTERIOR })
  .refine((d) => d.aproveitaReceitas || d.aproveitaFichas, { message: MSG_O_QUE_APROVEITAR });
export type ElaborarPropostaOrcamentariaInput = z.input<typeof zElaborarPropostaOrcamentaria>;

export const zPreviaDaImportacao = zEscolhasDaImportacao
  .refine((d) => d.exercicio > d.exercicioDeOrigem, { message: MSG_DESTINO_POSTERIOR })
  .refine((d) => d.aproveitaReceitas || d.aproveitaFichas, { message: MSG_O_QUE_APROVEITAR });
export type PreviaDaImportacaoInput = z.input<typeof zPreviaDaImportacao>;
type EscolhasDaImportacao = z.output<typeof zEscolhasDaImportacao>;

export interface BaseDaFicha {
  readonly fichaId: string;
  readonly valorNaLei: Money;
  readonly valor: Money;
  readonly tipoDaAcao: "PROJETO" | "ATIVIDADE" | "OPERACAO_ESPECIAL";
}

/**
 * As fichas de origem com a base escolhida. A base AUTORIZADA e a EMPENHADA são o Σ dos movimentos.
 *
 * ⚠️ A FICHA ABERTA NO EXERCÍCIO POR CRÉDITO ESPECIAL OU EXTRAORDINÁRIO não estava na lei de origem
 * (dotação inicial zero; nasceu de um decreto). Ela é alteração EXCLUSIVA daquele exercício e só
 * entra quando o operador pede — o padrão é ficar de fora.
 */
export async function basesDasFichas(
  tx: Tx,
  exercicio: number,
  base: BaseDaDespesaDaProposta,
  incluiAbertasPorCredito: boolean
): Promise<{ readonly fichas: readonly BaseDaFicha[]; readonly abertasPorCreditoDeixadas: number }> {
  const todas = await tx.fichaOrcamentaria.findMany({
    where: { exercicio },
    select: { id: true, valorDotado: true, exercicioFonte: true, acao: { select: { tipo: true } } },
    orderBy: { numero: "asc" },
  });
  const comCreditoNovo = new Set(
    (
      await tx.itemCredito.findMany({
        where: {
          ficha: { exercicio },
          estornoDeId: null,
          decreto: { lei: { tipoCredito: { in: ["ESPECIAL", "EXTRAORDINARIO"] } } },
        },
        select: { fichaId: true },
      })
    ).map((i) => i.fichaId)
  );
  // Também é exclusiva a ficha de recurso de EXERCÍCIO ANTERIOR (exercício da fonte 2): ela existe para
  // aplicar superávit ou saldo daquele ano, e uma lei nova não nasce com dotação "de exercício anterior".
  const abertaPorCredito = (f: (typeof todas)[number]): boolean =>
    (f.valorDotado.isZero() && comCreditoNovo.has(f.id)) || f.exercicioFonte !== 1;
  const fichas = incluiAbertasPorCredito ? todas : todas.filter((f) => !abertaPorCredito(f));
  const abertasPorCreditoDeixadas = todas.length - fichas.length;

  const naLei = (f: (typeof todas)[number]): Money => toMoney(f.valorDotado.toFixed(2));
  if (base === "DOTACAO_INICIAL" || base === "SEM_VALOR") {
    return {
      fichas: fichas.map((f) => ({
        fichaId: f.id,
        valorNaLei: naLei(f),
        valor: base === "SEM_VALOR" ? toMoney("0") : naLei(f),
        tipoDaAcao: f.acao.tipo,
      })),
      abertasPorCreditoDeixadas,
    };
  }
  // ⚠️ O SALDO VEM DOS MOVIMENTOS, pela aritmética do M05 (`calcularSaldos`), e não das colunas de
  // cache da ficha: o cache é orientação de tela, a fonte da verdade é o Σ dos movimentos.
  const grupos = await tx.movimentoDotacao.groupBy({
    by: ["fichaId", "tipo"],
    where: { fichaId: { in: fichas.map((f) => f.id) } },
    _sum: { valor: true },
  });
  const porFicha = new Map<string, Partial<Record<TipoMovimentoDotacao, Money>>>();
  for (const g of grupos) {
    const t = porFicha.get(g.fichaId) ?? {};
    t[g.tipo] = toMoney((g._sum.valor ?? 0).toString());
    porFicha.set(g.fichaId, t);
  }
  return {
    fichas: fichas.map((f) => {
      const saldos = calcularSaldos((porFicha.get(f.id) ?? {}) as TotaisPorTipo);
      return {
        fichaId: f.id,
        valorNaLei: naLei(f),
        valor: base === "EMPENHADO" ? saldos.empenhado : saldos.autorizado,
        tipoDaAcao: f.acao.tipo,
      };
    }),
    abertasPorCreditoDeixadas,
  };
}

/** As previsões de origem com a base escolhida. A ATUALIZADA soma as reprevisões da mesma natureza, fonte e tipo. */
export async function basesDasReceitas(
  tx: Tx,
  exercicio: number,
  base: BaseDaReceitaDaProposta
): Promise<readonly { readonly receitaId: string; readonly valorNaLei: Money; readonly valor: Money; readonly tipoReceita: "ORCAMENTARIA" | "INTRA_ORCAMENTARIA" | "DEDUCAO" }[]> {
  const receitas = await tx.receitaPrevista.findMany({
    where: { exercicio },
    select: {
      id: true,
      valorPrevisto: true,
      tipoReceita: true,
      naturezaReceita: { select: { codigo: true } },
      fonte: { select: { codigo: true } },
    },
    orderBy: [{ naturezaReceita: { codigo: "asc" } }, { fonte: { codigo: "asc" } }],
  });
  const naLei = (r: (typeof receitas)[number]): Money => toMoney(r.valorPrevisto.toFixed(2));
  if (base === "PREVISAO_INICIAL" || base === "SEM_VALOR") {
    return receitas.map((r) => ({ receitaId: r.id, tipoReceita: r.tipoReceita, valorNaLei: naLei(r), valor: base === "SEM_VALOR" ? toMoney("0") : naLei(r) }));
  }
  // A reprevisão (LRF art. 12) é chaveada por código de natureza, código de fonte e tipo — o mesmo
  // grão da previsão. Uma reprevisão sem previsão correspondente não tem linha onde entrar e fica
  // de fora, como fica do Anexo 12.
  const ajustes = await tx.receitaReprevista.findMany({
    where: { exercicio },
    select: { naturezaCodigo: true, fonteCodigo: true, tipoReceita: true, valorAjuste: true },
  });
  const chave = (n: string, f: string, t: string): string => `${n}|${f}|${t}`;
  const soma = new Map<string, Money>();
  for (const a of ajustes) {
    const k = chave(a.naturezaCodigo, a.fonteCodigo, a.tipoReceita);
    soma.set(k, toMoney((soma.get(k) ?? toMoney("0")).plus(a.valorAjuste.toFixed(2))));
  }
  return receitas.map((r) => ({
    receitaId: r.id,
    tipoReceita: r.tipoReceita,
    valorNaLei: naLei(r),
    valor: toMoney(naLei(r).plus(soma.get(chave(r.naturezaReceita.codigo, r.fonte.codigo, r.tipoReceita)) ?? toMoney("0"))),
  }));
}

type ReceitaImportada = Awaited<ReturnType<typeof basesDasReceitas>>[number] & { readonly projetado: Money };
type FichaImportada = BaseDaFicha & { readonly projetado: Money; readonly levaReajuste: boolean };

/**
 * O QUE A IMPORTAÇÃO TRAZ, com o valor projetado de cada linha — a MESMA leitura para a prévia e para o ato: o que a
 * prévia mostra é o que a importação grava.
 */
async function levantarImportacao(
  tx: Tx,
  d: EscolhasDaImportacao
): Promise<{ readonly receitas: readonly ReceitaImportada[]; readonly despesa: { readonly fichas: readonly FichaImportada[]; readonly abertasPorCreditoDeixadas: number } }> {
  const receitas = d.aproveitaReceitas ? await basesDasReceitas(tx, d.exercicioDeOrigem, d.baseDaReceita) : [];
  const despesa = d.aproveitaFichas
    ? await basesDasFichas(tx, d.exercicioDeOrigem, d.baseDaDespesa, d.incluiFichasAbertasPorCredito)
    : { fichas: [], abertasPorCreditoDeixadas: 0 };
  const zero = toPercentual("0");
  return {
    receitas: receitas.map((r) => ({ ...r, projetado: projetar(r.valor, d.percentualDaReceita) })),
    despesa: {
      abertasPorCreditoDeixadas: despesa.abertasPorCreditoDeixadas,
      fichas: despesa.fichas.map((f) => {
        // Projeto e operação especial não levam o reajuste quando o operador assim escolhe: são
        // valores de obra ou de compromisso, não de custeio corrente.
        const levaReajuste = d.reajustaProjetos || f.tipoDaAcao === "ATIVIDADE";
        return { ...f, levaReajuste, projetado: projetar(f.valor, levaReajuste ? d.percentualDaDespesa : zero) };
      }),
    },
  };
}

function nadaAAproveitar(d: EscolhasDaImportacao): string {
  const oQue = d.aproveitaReceitas && d.aproveitaFichas ? "receita prevista nem fichas" : d.aproveitaReceitas ? "receita prevista" : "fichas";
  return `O exercício ${d.exercicioDeOrigem} não tem ${oQue} a aproveitar.`;
}

/** Os totais de um lado da prévia: quantas linhas, a lei de origem, a partida e o valor com reajuste. */
export interface LadoDaPrevia {
  readonly linhas: number;
  readonly lei: string;
  readonly partida: string;
  readonly comReajuste: string;
  /** Linhas que chegam com valor zero: só entram no orçamento se alguém informar o valor. */
  readonly semValor: number;
}

/**
 * V38 (AUD-103) — A PRÉVIA DA IMPORTAÇÃO: o que será copiado, o que será reajustado, o que fica de fora e o que vai
 * pedir complemento, ANTES de criar a proposta. Nada grava.
 */
export interface PreviaDaImportacao {
  readonly exercicio: number;
  readonly exercicioDeOrigem: number;
  /** Recusa antecipada: o mesmo motivo que o ato daria (destino já gerado; nada a aproveitar). */
  readonly recusa: string | null;
  readonly receitas: LadoDaPrevia & {
    readonly naOrigem: number;
    /** Deduções da origem sem o tipo da dedução: no exercício novo nascem sem lançamento até o tipo ser informado. */
    readonly deducoesSemTipo: number;
  };
  readonly fichas: LadoDaPrevia & {
    readonly naOrigem: number;
    /** Abertas por crédito especial ou extraordinário, ou de recurso de exercício anterior, deixadas de fora. */
    readonly deixadasDeFora: number;
    /** Projetos e operações especiais que entram SEM o reajuste (escolha do operador). */
    readonly semReajuste: number;
  };
}

/**
 * O resumo de um lado, puro. Exportado para teste. ⚠️ A RECEITA É LÍQUIDA, como na página da proposta: a dedução entra
 * com o sinal de `SINAL_PREVISAO` (subtrai).
 */
export function resumirLadoDaImportacao(
  linhas: readonly { readonly valorNaLei: Money; readonly valor: Money; readonly projetado: Money; readonly tipoReceita?: string }[]
): LadoDaPrevia {
  const sinal = (l: (typeof linhas)[number]): 1 | -1 => (l.tipoReceita === undefined ? 1 : SINAL_PREVISAO[l.tipoReceita as keyof typeof SINAL_PREVISAO]);
  const soma = (k: "valorNaLei" | "valor" | "projetado"): string =>
    linhas.reduce((acc, l) => toMoney(sinal(l) === 1 ? acc.plus(l[k]) : acc.minus(l[k])), toMoney("0")).toFixed(2);
  return { linhas: linhas.length, lei: soma("valorNaLei"), partida: soma("valor"), comReajuste: soma("projetado"), semValor: linhas.filter((l) => l.projetado.isZero()).length };
}

export async function previaDaImportacaoDaProposta(prisma: Tx, input: PreviaDaImportacaoInput): Promise<PreviaDaImportacao> {
  const d = lerOuRecusar(zPreviaDaImportacao, input);
  const [{ receitas, despesa }, efetivada, receitasNaOrigem, fichasNaOrigem, deducoesSemTipo] = await Promise.all([
    levantarImportacao(prisma, d),
    prisma.efetivacaoDaProposta.findUnique({ where: { exercicio: d.exercicio }, select: { id: true } }),
    prisma.receitaPrevista.count({ where: { exercicio: d.exercicioDeOrigem } }),
    prisma.fichaOrcamentaria.count({ where: { exercicio: d.exercicioDeOrigem } }),
    d.aproveitaReceitas
      ? prisma.receitaPrevista.count({ where: { exercicio: d.exercicioDeOrigem, tipoReceita: "DEDUCAO", detalhe: { is: null } } })
      : Promise.resolve(0),
  ]);
  const recusa =
    efetivada !== null
      ? `O orçamento de ${d.exercicio} já foi gerado por uma proposta efetivada. Alterações agora são crédito adicional ou realocação.`
      : receitas.length === 0 && despesa.fichas.length === 0
        ? nadaAAproveitar(d)
        : null;
  return {
    exercicio: d.exercicio,
    exercicioDeOrigem: d.exercicioDeOrigem,
    recusa,
    receitas: { ...resumirLadoDaImportacao(receitas), naOrigem: receitasNaOrigem, deducoesSemTipo },
    fichas: {
      ...resumirLadoDaImportacao(despesa.fichas),
      naOrigem: fichasNaOrigem,
      deixadasDeFora: despesa.abertasPorCreditoDeixadas,
      semReajuste: d.percentualDaDespesa.isZero() ? 0 : despesa.fichas.filter((f) => !f.levaReajuste).length,
    },
  };
}

/**
 * IMPORTA o exercício de origem numa proposta nova. Nada toca o razão nem cria ficha.
 *
 * O operador escolhe O QUE aproveitar (receitas, fichas ou as duas), o valor de partida de cada lado
 * (inclusive "só a estrutura", com valor zero), o reajuste, se projetos e operações especiais levam o
 * reajuste e se as fichas abertas por crédito especial ou extraordinário entram.
 *
 * NÃO VEM DA ORIGEM: a execução como fato (empenhos, liquidações, pagamentos — o empenhado é só um
 * valor de partida), os saldos bancários, as aprovações e os protocolos da lei de origem.
 *
 * Recusa: exercício de destino já efetivado; nada a importar com as escolhas feitas.
 */
export async function elaborarPropostaOrcamentaria(
  prisma: PrismaClient,
  input: ElaborarPropostaOrcamentariaInput
): Promise<{
  readonly id: string;
  readonly linhasDeReceita: number;
  readonly linhasDeDespesa: number;
  readonly fichasAbertasPorCreditoDeixadas: number;
}> {
  const d = lerOuRecusar(zElaborarPropostaOrcamentaria, input);
  return prisma.$transaction(
    async (tx: Tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.elaborarPropostaOrcamentaria, "ENTE");

      const efetivada = await tx.efetivacaoDaProposta.findUnique({ where: { exercicio: d.exercicio }, select: { id: true } });
      if (efetivada !== null) {
        throw new PropostaOrcamentariaInvalidaError(
          `O orçamento de ${d.exercicio} já foi gerado por uma proposta efetivada. Alterações agora são crédito adicional ou realocação. Nada foi gravado.`
        );
      }

      const { receitas, despesa } = await levantarImportacao(tx, d);
      if (receitas.length === 0 && despesa.fichas.length === 0) {
        throw new PropostaOrcamentariaInvalidaError(`${nadaAAproveitar(d)} Nada foi gravado.`);
      }

      const proposta = await tx.propostaOrcamentaria.create({
        data: {
          exercicio: d.exercicio,
          exercicioDeOrigem: d.exercicioDeOrigem,
          descricao: d.descricao,
          baseDaReceita: d.baseDaReceita,
          percentualDaReceita: d.percentualDaReceita.toFixed(6),
          baseDaDespesa: d.baseDaDespesa,
          percentualDaDespesa: d.percentualDaDespesa.toFixed(6),
          aproveitaReceitas: d.aproveitaReceitas,
          aproveitaFichas: d.aproveitaFichas,
          reajustaProjetos: d.reajustaProjetos,
          incluiFichasAbertasPorCredito: d.incluiFichasAbertasPorCredito,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      await tx.linhaDeReceitaDaProposta.createMany({
        data: receitas.map((r) => ({
          propostaOrcamentariaId: proposta.id,
          receitaDeOrigemId: r.receitaId,
          valorNaLeiDeOrigem: r.valorNaLei.toFixed(2),
          valorBase: r.valor.toFixed(2),
          valorProjetado: r.projetado.toFixed(2),
        })),
      });
      await tx.linhaDeDespesaDaProposta.createMany({
        data: despesa.fichas.map((f) => ({
          propostaOrcamentariaId: proposta.id,
          fichaDeOrigemId: f.fichaId,
          valorNaLeiDeOrigem: f.valorNaLei.toFixed(2),
          valorBase: f.valor.toFixed(2),
          valorProjetado: f.projetado.toFixed(2),
        })),
      });
      return {
        id: proposta.id,
        linhasDeReceita: receitas.length,
        linhasDeDespesa: despesa.fichas.length,
        fichasAbertasPorCreditoDeixadas: despesa.abertasPorCreditoDeixadas,
      };
    },
    // Mede-se pelo tamanho da LOA de origem (três leituras e dois createMany); o limite padrão de
    // 5 s cobre centenas de linhas com folga. Não foi aumentado.
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ajustar
// ─────────────────────────────────────────────────────────────────────────────

export const zAjustarLinhaDaProposta = z.object({
  propostaOrcamentariaId: z.string().trim().min(1),
  lado: z.enum(["RECEITA", "DESPESA"]),
  linhaId: z.string().trim().min(1),
  /** String decimal com ponto ("1250000.00"). A conversão do que a pessoa digita é da tela. */
  valor: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Informe o valor em reais, sem sinal, com até duas casas (ex.: 1.250.000,00).")
    .transform((v) => toMoney(v)),
  motivo: z.string().trim().min(5, "Informe o motivo da alteração.").max(500),
  criadoPor: z.string().trim().min(1),
});
export type AjustarLinhaDaPropostaInput = z.input<typeof zAjustarLinhaDaProposta>;

/** ALTERA o valor de uma linha: grava um ajuste (append-only). Zero tira a linha do orçamento gerado. */
export async function ajustarLinhaDaProposta(
  prisma: PrismaClient,
  input: AjustarLinhaDaPropostaInput
): Promise<{ readonly id: string }> {
  const d = lerOuRecusar(zAjustarLinhaDaProposta, input);
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.ajustarLinhaDaProposta, "ENTE");
    // A mesma trava da efetivação, ANTES de ler: um ajuste não entra no meio de uma efetivação.
    await travar(tx, "PropostaOrcamentaria", [d.propostaOrcamentariaId]);

    const proposta = await tx.propostaOrcamentaria.findUnique({
      where: { id: d.propostaOrcamentariaId },
      select: { efetivacao: { select: { id: true } } },
    });
    if (proposta === null) throw new PropostaOrcamentariaInvalidaError("Proposta não encontrada. Nada foi gravado.");
    if (proposta.efetivacao !== null) {
      throw new PropostaOrcamentariaInvalidaError(
        "A proposta já foi efetivada: o orçamento existe e só muda por crédito adicional ou realocação. Nada foi gravado."
      );
    }

    if (d.lado === "RECEITA") {
      const linha = await tx.linhaDeReceitaDaProposta.findUnique({ where: { id: d.linhaId }, select: { propostaOrcamentariaId: true } });
      if (linha === null || linha.propostaOrcamentariaId !== d.propostaOrcamentariaId) {
        throw new PropostaOrcamentariaInvalidaError("A linha não pertence a esta proposta. Nada foi gravado.");
      }
      return tx.ajusteDeReceitaDaProposta.create({
        data: { linhaId: d.linhaId, valor: d.valor.toFixed(2), motivo: d.motivo, criadoPor: d.criadoPor },
        select: { id: true },
      });
    }
    const linha = await tx.linhaDeDespesaDaProposta.findUnique({ where: { id: d.linhaId }, select: { propostaOrcamentariaId: true } });
    if (linha === null || linha.propostaOrcamentariaId !== d.propostaOrcamentariaId) {
      throw new PropostaOrcamentariaInvalidaError("A linha não pertence a esta proposta. Nada foi gravado.");
    }
    return tx.ajusteDeDespesaDaProposta.create({
      data: { linhaId: d.linhaId, valor: d.valor.toFixed(2), motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Efetivar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V39-021 — O QUE PERMITE EXECUTAR. Até a V38 a efetivação gerava o orçamento sem perguntar pela lei (AUD-101). Agora ela
 * exige um fundamento, e são três, porque os casos são três:
 *   · LEI_APROVADA — a LOA do exercício cadastrada e com a aprovação registrada (número da lei, sanção, publicação);
 *   · EXECUCAO_PROVISORIA — a lei ainda não saiu e a LDO autoriza executar o projeto (o dispositivo, declarado e
 *     conferido: tem de falar do orçamento daquele exercício). Recusada quando a LOA já está aprovada;
 *   · ENSAIO — gerar o orçamento só para exercitar o motor, permitido apenas em base que o BANCO declara de
 *     demonstração ou de ensaio (`natureza-da-base.ts`). Nunca numa base oficial, e nunca por um texto de tela.
 */
export const zFundamentoDaEfetivacao = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("LEI_APROVADA") }),
  z.object({ tipo: z.literal("EXECUCAO_PROVISORIA"), ato: zAtoDeclarado }),
  z.object({ tipo: z.literal("ENSAIO") }),
], { error: "Escolha o que permite executar o orçamento: a lei aprovada, a execução provisória autorizada pela LDO ou o ensaio." });
export type FundamentoDaEfetivacao = z.infer<typeof zFundamentoDaEfetivacao>;

export const zEfetivarPropostaOrcamentaria = z.object({
  propostaOrcamentariaId: z.string().trim().min(1),
  fundamento: zFundamentoDaEfetivacao,
  criadoPor: z.string().trim().min(1),
});

/**
 * As colunas do fundamento na efetivação, depois de CONFERIDO. Recusa (sem gravar) o fundamento que não se sustenta:
 * lei sem aprovação, execução provisória com a lei já aprovada ou com ato que não trata do orçamento, ensaio em base
 * que não é de ensaio.
 */
async function conferirFundamentoDaEfetivacao(
  tx: Tx,
  exercicio: number,
  fundamento: FundamentoDaEfetivacao,
): Promise<{ fundamento: string; leiId: string | null; aprovacaoId: string | null; atoTipo: string | null; atoNumero: string | null; atoAno: number | null; atoDispositivo: string | null; atoCitacao: string | null }> {
  const vazio = { leiId: null, aprovacaoId: null, atoTipo: null, atoNumero: null, atoAno: null, atoDispositivo: null, atoCitacao: null };
  const lei = await tx.leiOrcamentariaAnual.findUnique({ where: { exercicio }, select: { id: true, aprovacao: { select: { id: true, numeroDaLei: true } } } });
  if (fundamento.tipo === "LEI_APROVADA") {
    if (lei === null) {
      throw new PropostaOrcamentariaInvalidaError(
        `A lei orçamentária de ${exercicio} não está cadastrada. Cadastre o projeto e registre a aprovação (número da lei, sanção e publicação) antes de gerar o orçamento por ela. Nada foi gravado.`
      );
    }
    if (lei.aprovacao === null) {
      throw new PropostaOrcamentariaInvalidaError(
        `O projeto da lei orçamentária de ${exercicio} está cadastrado, mas a aprovação ainda não foi registrada (número da lei, sanção e publicação). Sem ela, o orçamento só se gera pela execução provisória que a LDO autorizar. Nada foi gravado.`
      );
    }
    return { ...vazio, fundamento: "LEI_APROVADA", leiId: lei.id, aprovacaoId: lei.aprovacao.id };
  }
  if (fundamento.tipo === "EXECUCAO_PROVISORIA") {
    if (lei?.aprovacao != null) {
      throw new PropostaOrcamentariaInvalidaError(
        `A lei orçamentária de ${exercicio} já está aprovada (Lei ${lei.aprovacao.numeroDaLei}). Gere o orçamento pela lei, não pela execução provisória. Nada foi gravado.`
      );
    }
    try {
      conferirAtoDeclarado(fundamento.ato, { hoje: new Date(), ancoradouros: [{ rotulo: `o orçamento de ${exercicio}`, termos: ["orcament", String(exercicio)] }] });
    } catch (e) {
      if (e instanceof AtoDeclaradoInvalidoError && e.motivo === "ATO_NAO_TRATA_DO_OBJETO") {
        throw new PropostaOrcamentariaInvalidaError(
          `O trecho citado não fala do orçamento de ${exercicio}. Transcreva o dispositivo da LDO que autoriza executar o projeto de lei orçamentária de ${exercicio} enquanto a lei não é sancionada. Nada foi gravado.`
        );
      }
      throw e;
    }
    const a = fundamento.ato;
    return { ...vazio, fundamento: "EXECUCAO_PROVISORIA", atoTipo: a.atoTipo, atoNumero: a.atoNumero, atoAno: a.atoAno, atoDispositivo: a.atoDispositivo, atoCitacao: a.atoCitacao };
  }
  const base = await naturezaDaBase(tx);
  if (!baseAdmiteEnsaio(base.natureza)) {
    throw new PropostaOrcamentariaInvalidaError(
      `Gerar o orçamento em ensaio só vale em base declarada de demonstração ou de ensaio; esta base está declarada ${base.natureza === "NAO_DECLARADA" ? "sem natureza" : base.natureza}. Use a lei aprovada ou a execução provisória autorizada pela LDO. Nada foi gravado.`
    );
  }
  return { ...vazio, fundamento: "ENSAIO" };
}
export type EfetivarPropostaOrcamentariaInput = z.input<typeof zEfetivarPropostaOrcamentaria>;

const CODIGO_UNIQUE_VIOLADO = "P2002";

/**
 * A SEGUNDA PERGUNTA DA EFETIVAÇÃO: quem gera o orçamento também PREVÊ a receita, e prever receita
 * é CRIAR_RECEITA_PREVISTA no ENTE — o mesmo poder do `criarReceitaPrevista` manual.
 *
 * ⚠️ FORA DO CORPO DO SERVIÇO, E DE PROPÓSITO DECLARADO. O guard do censo (t6b) acusa, no corpo de
 * um serviço, a ação de OUTRO serviço — é o erro do copiar-colar. Aqui não é cópia: a efetivação
 * cobra as DUAS ações porque faz os dois atos. Ela continua cobrando a SUA (CRIAR_FICHA, por
 * unidade) no corpo; esta é a segunda, nomeada.
 */
async function autorizarAReceitaDaEfetivacao(tx: Tx, quem: string): Promise<void> {
  await autorizarNo(tx, quem, ACAO_DO_SERVICO.criarReceitaPrevista, "ENTE");
}

/**
 * GERA O ORÇAMENTO do exercício da proposta: uma receita prevista por linha de receita e uma ficha
 * por linha de despesa, com o valor vigente, numa transação só. Linha com valor zero não entra.
 *
 * As pré-condições vêm TODAS antes do primeiro `create` (a regra da casa: efeito antes da guarda
 * envenena a tentativa seguinte): proposta existe e não foi efetivada; exercício de destino aberto;
 * destino sem ficha e sem receita prevista; nenhuma linha negativa; autorização em cada unidade.
 *
 * A ficha nasce pelo MESMO corpo da criação manual (`criarFichaNaTransacao`): exercício aberto,
 * dotação inicial no razão em 1º de janeiro, cache recalculado.
 */
export async function efetivarPropostaOrcamentaria(
  prisma: PrismaClient,
  input: EfetivarPropostaOrcamentariaInput
): Promise<{ readonly exercicio: number; readonly fichasCriadas: number; readonly receitasCriadas: number }> {
  const d = lerOuRecusar(zEfetivarPropostaOrcamentaria, input);
  try {
    return await prisma.$transaction(
      async (tx: Tx) => {
        // A trava vem antes da primeira leitura: as linhas lidas aqui são as que viram orçamento.
        await travar(tx, "PropostaOrcamentaria", [d.propostaOrcamentariaId]);
        const proposta = await tx.propostaOrcamentaria.findUnique({
          where: { id: d.propostaOrcamentariaId },
          select: {
            exercicio: true,
            efetivacao: { select: { id: true } },
            linhasDeReceita: {
              select: {
                id: true,
                valorProjetado: true,
                ajustes: { select: { id: true, valor: true, criadoEm: true } },
                receitaDeOrigem: {
                  select: {
                    naturezaReceitaId: true,
                    fonteId: true,
                    exercicioFonte: true,
                    tipoReceita: true,
                    naturezaReceita: { select: { codigo: true } },
                    // V35 — o tipo da dedução da linha de origem: a dedução nova nasce com o mesmo detalhe e a previsão
                    // dela entra no razão na conta que o tipo decide.
                    detalhe: { select: { tipoDeducaoSagres: true } },
                  },
                },
                // V38 — a linha nova.
                naturezaReceitaId: true,
                fonteId: true,
                exercicioFonte: true,
                tipoReceita: true,
                naturezaReceita: { select: { codigo: true } },
              },
            },
            linhasDeDespesa: {
              select: {
                id: true,
                valorProjetado: true,
                ajustes: { select: { id: true, valor: true, criadoEm: true } },
                fichaDeOrigem: {
                  select: {
                    numero: true,
                    orgaoId: true,
                    unidadeOrcId: true,
                    funcaoId: true,
                    subfuncaoId: true,
                    programaId: true,
                    acaoId: true,
                    naturezaDespesaId: true,
                    fonteId: true,
                    coId: true,
                    exercicioFonte: true,
                  },
                },
                // V38 — a linha nova.
                orgaoId: true,
                unidadeOrcId: true,
                funcaoId: true,
                subfuncaoId: true,
                programaId: true,
                acaoId: true,
                naturezaDespesaId: true,
                fonteId: true,
                coId: true,
                exercicioFonte: true,
                criadoEm: true,
              },
            },
          },
        });
        if (proposta === null) throw new PropostaOrcamentariaInvalidaError("Proposta não encontrada. Nada foi gravado.");
        if (proposta.efetivacao !== null) {
          throw new PropostaOrcamentariaInvalidaError("Esta proposta já foi efetivada. Nada foi gravado.");
        }
        const exercicio = proposta.exercicio;

        const outra = await tx.efetivacaoDaProposta.findUnique({ where: { exercicio }, select: { id: true } });
        if (outra !== null) {
          throw new PropostaOrcamentariaInvalidaError(
            `O orçamento de ${exercicio} já foi gerado por outra proposta. Nada foi gravado.`
          );
        }

        await exigirExercicioAberto(tx, exercicio, `efetivação da proposta orçamentária de ${exercicio}`);

        const [fichasNoDestino, receitasNoDestino] = await Promise.all([
          tx.fichaOrcamentaria.count({ where: { exercicio } }),
          tx.receitaPrevista.count({ where: { exercicio } }),
        ]);
        if (fichasNoDestino > 0 || receitasNoDestino > 0) {
          throw new PropostaOrcamentariaInvalidaError(
            `O exercício ${exercicio} já tem ${fichasNoDestino} ficha(s) e ${receitasNoDestino} receita(s) prevista(s). ` +
              `A efetivação gera o orçamento inteiro e não mistura com o que já foi cadastrado. Nada foi gravado.`
          );
        }

        // V39-021 — o que permite executar, conferido ANTES do primeiro registro.
        const fundamento = await conferirFundamentoDaEfetivacao(tx, exercicio, d.fundamento);

        // V38 — a origem da linha é a receita (ou a ficha) de origem, ou a classificação própria da linha nova.
        const receitas = proposta.linhasDeReceita.map((l) => ({
          origem: l.receitaDeOrigem ?? origemDaReceitaNova(l),
          valor: valorVigente(
            toMoney(l.valorProjetado.toFixed(2)),
            l.ajustes.map((a) => ({ id: a.id, criadoEm: a.criadoEm, valor: toMoney(a.valor.toFixed(2)) }))
          ),
        }));
        const despesas = proposta.linhasDeDespesa.map((l) => ({
          origem: l.fichaDeOrigem ?? origemDaFichaNova(l),
          nova: l.fichaDeOrigem === null,
          criadoEm: l.criadoEm ?? new Date(0),
          valor: valorVigente(
            toMoney(l.valorProjetado.toFixed(2)),
            l.ajustes.map((a) => ({ id: a.id, criadoEm: a.criadoEm, valor: toMoney(a.valor.toFixed(2)) }))
          ),
        }));

        const negativaR = receitas.find((r) => r.valor.isNegative());
        if (negativaR !== undefined) {
          throw new PropostaOrcamentariaInvalidaError(
            `A receita ${negativaR.origem.naturezaReceita.codigo} ficou com valor negativo na proposta. Ajuste a linha antes de efetivar. Nada foi gravado.`
          );
        }
        const negativaD = despesas.find((r) => r.valor.isNegative());
        if (negativaD !== undefined) {
          throw new PropostaOrcamentariaInvalidaError(
            `A ficha ${negativaD.origem.numero} ficou com valor negativo na proposta. Ajuste a linha antes de efetivar. Nada foi gravado.`
          );
        }

        const receitasACriar = receitas.filter((r) => !r.valor.isZero());
        // As importadas pelo número da ficha; as novas depois, na ordem em que entraram, com os números seguintes.
        const despesasACriar = despesas
          .filter((r) => !r.valor.isZero())
          .sort((a, b) => Number(a.nova) - Number(b.nova) || a.origem.numero - b.origem.numero || a.criadoEm.getTime() - b.criadoEm.getTime());
        let proximoNumero = despesas.reduce((m, r) => Math.max(m, r.origem.numero), 0) + 1;
        if (receitasACriar.length === 0 && despesasACriar.length === 0) {
          throw new PropostaOrcamentariaInvalidaError(
            "Todas as linhas da proposta estão com valor zero: não há orçamento a gerar. Nada foi gravado."
          );
        }

        // ⚠️ A AUTORIZAÇÃO É A DA CRIAÇÃO MANUAL, linha por linha de poder: CRIAR_FICHA em CADA
        // unidade que recebe ficha (quem só cria na Saúde não gera o orçamento da Educação) e
        // CRIAR_RECEITA_PREVISTA no ENTE. Antes de qualquer gravação.
        const ugs = [...new Set(despesasACriar.map((r) => r.origem.unidadeOrcId))];
        if (ugs.length > 0) await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.efetivarPropostaOrcamentaria, { ugs });
        if (receitasACriar.length > 0) await autorizarAReceitaDaEfetivacao(tx, d.criadoPor);

        for (const r of receitasACriar) {
          const criada = await tx.receitaPrevista.create({
            data: {
              exercicio,
              naturezaReceitaId: r.origem.naturezaReceitaId,
              fonteId: r.origem.fonteId,
              exercicioFonte: r.origem.exercicioFonte,
              tipoReceita: r.origem.tipoReceita,
              valorPrevisto: r.valor.toFixed(2),
            },
            select: { id: true },
          });
          // V35 — a previsão no razão, como na criação pela tela. A dedução só entra com o tipo da linha de origem;
          // sem ele fica sem lançamento até o detalhe ser registrado (Planejamento › Receita prevista).
          const tipoDeducao = r.origem.detalhe?.tipoDeducaoSagres ?? null;
          if (r.origem.tipoReceita !== "DEDUCAO") {
            await lancarPrevisaoDaReceita(tx, {
              receitaPrevistaId: criada.id, exercicio, valor: r.valor.toFixed(2),
              debito: CONTA_PREVISAO_INICIAL_RECEITA_BRUTA, credito: CONTA_RECEITA_A_REALIZAR,
              historico: `Previsão inicial da receita ${r.origem.naturezaReceita.codigo} (LOA ${String(exercicio)})`, autor: d.criadoPor,
            });
          } else if (tipoDeducao !== null) {
            await tx.detalheDaReceitaPrevista.create({
              data: { receitaPrevistaId: criada.id, tipoDeducaoSagres: tipoDeducao, codigoNoDocumento: null, documento: `Proposta orçamentária efetivada para ${String(exercicio)} (tipo da dedução da linha de origem)`, criadoPor: d.criadoPor },
            });
            await lancarPrevisaoDaReceita(tx, {
              receitaPrevistaId: criada.id, exercicio, valor: r.valor.toFixed(2),
              debito: CONTA_RECEITA_A_REALIZAR, credito: tipoDeducao === "3" ? CONTA_PREVISAO_DEDUCAO_FUNDEB : CONTA_PREVISAO_OUTRAS_DEDUCOES,
              historico: `Previsão de dedução da receita ${r.origem.naturezaReceita.codigo} (LOA ${String(exercicio)})`, autor: d.criadoPor,
            });
          }
        }
        for (const r of despesasACriar) {
          await criarFichaNaTransacao(
            tx,
            {
              exercicio,
              numero: r.nova ? proximoNumero++ : r.origem.numero,
              orgaoId: r.origem.orgaoId,
              unidadeOrcId: r.origem.unidadeOrcId,
              funcaoId: r.origem.funcaoId,
              subfuncaoId: r.origem.subfuncaoId,
              programaId: r.origem.programaId,
              acaoId: r.origem.acaoId,
              naturezaDespesaId: r.origem.naturezaDespesaId,
              fonteId: r.origem.fonteId,
              ...(r.origem.coId !== null ? { coId: r.origem.coId } : {}),
              exercicioFonte: r.origem.exercicioFonte,
              valorDotado: r.valor,
            },
            d.criadoPor
          );
        }

        await tx.efetivacaoDaProposta.create({
          data: {
            propostaOrcamentariaId: d.propostaOrcamentariaId,
            exercicio,
            fichasCriadas: despesasACriar.length,
            receitasCriadas: receitasACriar.length,
            criadoPor: d.criadoPor,
            ...fundamento,
          },
          select: { id: true },
        });
        return { exercicio, fichasCriadas: despesasACriar.length, receitasCriadas: receitasACriar.length };
      },
      // ⚠️ CADA FICHA ESCREVE NO RAZÃO (movimento, perna contábil e recálculo do cache): o tempo cresce
      // com o número de fichas, e o padrão de 5 s cobre poucas dezenas. O limite acompanha a folha
      // (`m33-folha/servico.ts`), que também grava o exercício inteiro numa transação.
      { timeout: 120_000 }
    );
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === CODIGO_UNIQUE_VIOLADO) {
      throw new PropostaOrcamentariaInvalidaError(
        "Já existe, no exercício, ficha ou receita prevista com a mesma classificação, ou o orçamento do exercício " +
          "acabou de ser gerado por outra efetivação. Confira o exercício e tente de novo. Nada desta tentativa foi gravado.",
        { cause: e }
      );
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leituras
// ─────────────────────────────────────────────────────────────────────────────

export interface PropostaNaLista {
  readonly id: string;
  readonly exercicio: number;
  readonly exercicioDeOrigem: number;
  readonly descricao: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly linhasDeReceita: number;
  readonly linhasDeDespesa: number;
  readonly efetivadaEm: Date | null;
}

export async function listarPropostasOrcamentarias(prisma: Tx): Promise<readonly PropostaNaLista[]> {
  const ps = await prisma.propostaOrcamentaria.findMany({
    orderBy: [{ exercicio: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true,
      exercicio: true,
      exercicioDeOrigem: true,
      descricao: true,
      criadoEm: true,
      criadoPor: true,
      efetivacao: { select: { criadoEm: true } },
      _count: { select: { linhasDeReceita: true, linhasDeDespesa: true } },
    },
  });
  return ps.map((p) => ({
    id: p.id,
    exercicio: p.exercicio,
    exercicioDeOrigem: p.exercicioDeOrigem,
    descricao: p.descricao,
    criadoEm: p.criadoEm,
    criadoPor: p.criadoPor,
    linhasDeReceita: p._count.linhasDeReceita,
    linhasDeDespesa: p._count.linhasDeDespesa,
    efetivadaEm: p.efetivacao?.criadoEm ?? null,
  }));
}

export interface AjusteNaLinha {
  readonly valor: string;
  readonly motivo: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

export interface LinhaDeReceitaNaProposta {
  readonly id: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly tipoReceita: string;
  /** A previsão da lei de origem — a coluna de comparação entre os exercícios. */
  readonly valorNaLeiDeOrigem: string;
  readonly valorBase: string;
  readonly valorProjetado: string;
  readonly valorVigente: string;
  readonly ajustes: readonly AjusteNaLinha[];
  /** V38 — a linha que a lei de origem não tinha, incluída na proposta com um motivo. */
  readonly nova: boolean;
  readonly motivo: string | null;
}

export interface LinhaDeDespesaNaProposta {
  readonly id: string;
  readonly numero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly programaCodigo: string;
  readonly acaoCodigo: string;
  readonly tipoDaAcao: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly valorNaLeiDeOrigem: string;
  readonly valorBase: string;
  readonly valorProjetado: string;
  readonly valorVigente: string;
  readonly ajustes: readonly AjusteNaLinha[];
  /** V38 — a linha nova: sem ficha de origem, com número dado só na efetivação (`numero` = 0 até lá). */
  readonly nova: boolean;
  readonly motivo: string | null;
}

export interface TotaisDaProposta {
  /** O total da lei de origem, para a comparação. */
  readonly lei: string;
  readonly base: string;
  readonly projetado: string;
  readonly vigente: string;
}

export interface PropostaDetalhada {
  readonly id: string;
  readonly exercicio: number;
  readonly exercicioDeOrigem: number;
  readonly descricao: string;
  readonly baseDaReceita: BaseDaReceitaDaProposta;
  readonly percentualDaReceita: string;
  readonly baseDaDespesa: BaseDaDespesaDaProposta;
  readonly percentualDaDespesa: string;
  readonly aproveitaReceitas: boolean;
  readonly aproveitaFichas: boolean;
  readonly reajustaProjetos: boolean;
  readonly incluiFichasAbertasPorCredito: boolean;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly receitas: readonly LinhaDeReceitaNaProposta[];
  readonly despesas: readonly LinhaDeDespesaNaProposta[];
  /**
   * ⚠️ A RECEITA É LÍQUIDA: a dedução (para o FUNDEB e as demais) é guardada com valor positivo e
   * `tipoReceita = DEDUCAO`, e entra no total com o sinal de `SINAL_PREVISAO` — o mesmo dos
   * relatórios. Somá-la como receita inflaria a previsão e mentiria no equilíbrio.
   */
  readonly totalDaReceita: TotaisDaProposta;
  readonly receitaBruta: TotaisDaProposta;
  readonly deducoesDaReceita: TotaisDaProposta;
  readonly totalDaDespesa: TotaisDaProposta;
  readonly efetivacao: { readonly criadoEm: Date; readonly criadoPor: string; readonly fichasCriadas: number; readonly receitasCriadas: number; readonly fundamento: string | null; readonly atoNumero: string | null; readonly atoAno: number | null; readonly atoDispositivo: string | null } | null;
  /** A situação do exercício de destino, para a tela dizer o que falta antes e depois de efetivar. */
  readonly destino: {
    readonly existe: boolean;
    readonly encerrado: boolean;
    readonly fichas: number;
    readonly receitas: number;
    readonly efetivadoPorOutra: boolean;
    /** Deduções do destino ainda sem o tipo da dedução (a prestação de contas exige). */
    readonly deducoesSemTipo: number;
    /** A lei orçamentária do destino: o projeto e, se houver, a aprovação. */
    readonly lei: { readonly id: string; readonly numeroDoProjeto: string; readonly numeroDaLei: string | null } | null;
  };
  /** V38 (AUD-103) — quantas fichas e receitas previstas o exercício de origem tem hoje: o "o que veio e o que não veio". */
  readonly naOrigem: { readonly fichas: number; readonly receitas: number };
}

type LinhaComValores = { readonly valorNaLeiDeOrigem: string; readonly valorBase: string; readonly valorProjetado: string; readonly valorVigente: string };

function totais(linhas: readonly LinhaComValores[], sinal: (l: LinhaComValores) => 1 | -1 = () => 1): TotaisDaProposta {
  const s = (k: keyof LinhaComValores): string =>
    linhas.reduce((acc, l) => (sinal(l) === 1 ? acc.plus(l[k]) : acc.minus(l[k])), toMoney("0")).toFixed(2);
  return { lei: s("valorNaLeiDeOrigem"), base: s("valorBase"), projetado: s("valorProjetado"), vigente: s("valorVigente") };
}

function ajustesOrdenados(
  ajustes: readonly { readonly id: string; readonly valor: { toFixed(n: number): string }; readonly motivo: string; readonly criadoEm: Date; readonly criadoPor: string }[]
): readonly AjusteNaLinha[] {
  return [...ajustes]
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime() || (a.id < b.id ? 1 : -1))
    .map((a) => ({ valor: a.valor.toFixed(2), motivo: a.motivo, criadoEm: a.criadoEm, criadoPor: a.criadoPor }));
}

export async function detalharPropostaOrcamentaria(prisma: Tx, id: string): Promise<PropostaDetalhada | null> {
  const p = await prisma.propostaOrcamentaria.findUnique({
    where: { id },
    select: {
      id: true,
      exercicio: true,
      exercicioDeOrigem: true,
      descricao: true,
      baseDaReceita: true,
      percentualDaReceita: true,
      baseDaDespesa: true,
      percentualDaDespesa: true,
      aproveitaReceitas: true,
      aproveitaFichas: true,
      reajustaProjetos: true,
      incluiFichasAbertasPorCredito: true,
      criadoEm: true,
      criadoPor: true,
      efetivacao: { select: { criadoEm: true, criadoPor: true, fichasCriadas: true, receitasCriadas: true, fundamento: true, atoNumero: true, atoAno: true, atoDispositivo: true } },
      linhasDeReceita: {
        select: {
          id: true,
          valorNaLeiDeOrigem: true,
          valorBase: true,
          valorProjetado: true,
          ajustes: { select: { id: true, valor: true, motivo: true, criadoEm: true, criadoPor: true } },
          receitaDeOrigem: {
            select: {
              tipoReceita: true,
              naturezaReceita: { select: { codigo: true, descricao: true } },
              fonte: { select: { codigo: true } },
            },
          },
          // V38 — a linha nova carrega a própria classificação.
          tipoReceita: true,
          motivo: true,
          naturezaReceita: { select: { codigo: true, descricao: true } },
          fonte: { select: { codigo: true } },
        },
      },
      linhasDeDespesa: {
        select: {
          id: true,
          valorNaLeiDeOrigem: true,
          valorBase: true,
          valorProjetado: true,
          ajustes: { select: { id: true, valor: true, motivo: true, criadoEm: true, criadoPor: true } },
          motivo: true,
          criadoEm: true,
          unidadeOrc: { select: { codigo: true, descricao: true } },
          programa: { select: { codigo: true } },
          acao: { select: { codigo: true, tipo: true } },
          naturezaDespesa: { select: { codigoCompleto: true, descricao: true } },
          fonte: { select: { codigo: true } },
          fichaDeOrigem: {
            select: {
              numero: true,
              unidadeOrc: { select: { codigo: true, descricao: true } },
              programa: { select: { codigo: true } },
              acao: { select: { codigo: true, tipo: true } },
              naturezaDespesa: { select: { codigoCompleto: true, descricao: true } },
              fonte: { select: { codigo: true } },
            },
          },
        },
      },
    },
  });
  if (p === null) return null;

  const vig = (projetado: { toFixed(n: number): string }, ajustes: readonly { id: string; valor: { toFixed(n: number): string }; criadoEm: Date }[]): string =>
    valorVigente(
      toMoney(projetado.toFixed(2)),
      ajustes.map((a) => ({ id: a.id, criadoEm: a.criadoEm, valor: toMoney(a.valor.toFixed(2)) }))
    ).toFixed(2);

  const receitas: LinhaDeReceitaNaProposta[] = p.linhasDeReceita
    .map((l) => {
      // V38 — a origem ou a própria linha: o CHECK do banco garante que uma das duas existe.
      const natureza = l.receitaDeOrigem?.naturezaReceita ?? l.naturezaReceita;
      const fonte = l.receitaDeOrigem?.fonte ?? l.fonte;
      const tipo = l.receitaDeOrigem?.tipoReceita ?? l.tipoReceita;
      if (natureza === null || fonte === null || tipo === null) throw new PropostaOrcamentariaInvalidaError(`A linha de receita ${l.id} não tem origem nem classificação.`);
      return {
      id: l.id,
      nova: l.receitaDeOrigem === null,
      motivo: l.motivo,
      naturezaCodigo: natureza.codigo,
      naturezaDescricao: natureza.descricao,
      fonteCodigo: fonte.codigo,
      tipoReceita: tipo,
      valorNaLeiDeOrigem: l.valorNaLeiDeOrigem.toFixed(2),
      valorBase: l.valorBase.toFixed(2),
      valorProjetado: l.valorProjetado.toFixed(2),
      valorVigente: vig(l.valorProjetado, l.ajustes),
      ajustes: ajustesOrdenados(l.ajustes),
      };
    })
    .sort((a, b) => a.naturezaCodigo.localeCompare(b.naturezaCodigo) || a.fonteCodigo.localeCompare(b.fonteCodigo) || a.tipoReceita.localeCompare(b.tipoReceita));

  const despesas: LinhaDeDespesaNaProposta[] = p.linhasDeDespesa
    .map((l) => {
      const o = l.fichaDeOrigem;
      const unidade = o?.unidadeOrc ?? l.unidadeOrc;
      const programa = o?.programa ?? l.programa;
      const acao = o?.acao ?? l.acao;
      const natureza = o?.naturezaDespesa ?? l.naturezaDespesa;
      const fonte = o?.fonte ?? l.fonte;
      if (unidade === null || programa === null || acao === null || natureza === null || fonte === null) {
        throw new PropostaOrcamentariaInvalidaError(`A linha de despesa ${l.id} não tem origem nem classificação.`);
      }
      return {
      id: l.id,
      nova: o === null,
      motivo: l.motivo,
      numero: o?.numero ?? 0,
      unidadeCodigo: unidade.codigo,
      unidadeNome: unidade.descricao,
      programaCodigo: programa.codigo,
      acaoCodigo: acao.codigo,
      tipoDaAcao: acao.tipo,
      naturezaCodigo: natureza.codigoCompleto,
      naturezaDescricao: natureza.descricao,
      fonteCodigo: fonte.codigo,
      valorNaLeiDeOrigem: l.valorNaLeiDeOrigem.toFixed(2),
      valorBase: l.valorBase.toFixed(2),
      valorProjetado: l.valorProjetado.toFixed(2),
      valorVigente: vig(l.valorProjetado, l.ajustes),
      ajustes: ajustesOrdenados(l.ajustes),
      criadoEm: l.criadoEm,
      };
    })
    // As importadas pelo número da ficha; as novas depois, na ordem em que entraram.
    .sort((a, b) => Number(a.nova) - Number(b.nova) || a.numero - b.numero || (a.criadoEm?.getTime() ?? 0) - (b.criadoEm?.getTime() ?? 0))
    .map(({ criadoEm: _c, ...resto }) => resto);

  const [exercicio, fichas, receitasNoDestino, efetivacaoDoDestino, deducoesSemTipo, lei, fichasNaOrigem, receitasNaOrigem] = await Promise.all([
    prisma.exercicio.findUnique({ where: { ano: p.exercicio }, select: { encerramento: { select: { id: true } } } }),
    prisma.fichaOrcamentaria.count({ where: { exercicio: p.exercicio } }),
    prisma.receitaPrevista.count({ where: { exercicio: p.exercicio } }),
    prisma.efetivacaoDaProposta.findUnique({ where: { exercicio: p.exercicio }, select: { propostaOrcamentariaId: true } }),
    prisma.receitaPrevista.count({ where: { exercicio: p.exercicio, tipoReceita: "DEDUCAO", detalhe: { is: null } } }),
    prisma.leiOrcamentariaAnual.findUnique({
      where: { exercicio: p.exercicio },
      select: { id: true, numeroDoProjeto: true, aprovacao: { select: { numeroDaLei: true } } },
    }),
    prisma.fichaOrcamentaria.count({ where: { exercicio: p.exercicioDeOrigem } }),
    prisma.receitaPrevista.count({ where: { exercicio: p.exercicioDeOrigem } }),
  ]);

  const sinal = (l: LinhaComValores): 1 | -1 => SINAL_PREVISAO[(l as LinhaDeReceitaNaProposta).tipoReceita as keyof typeof SINAL_PREVISAO];
  return {
    id: p.id,
    exercicio: p.exercicio,
    exercicioDeOrigem: p.exercicioDeOrigem,
    descricao: p.descricao,
    baseDaReceita: p.baseDaReceita,
    percentualDaReceita: toPercentual(p.percentualDaReceita.toString()).toString(),
    baseDaDespesa: p.baseDaDespesa,
    percentualDaDespesa: toPercentual(p.percentualDaDespesa.toString()).toString(),
    aproveitaReceitas: p.aproveitaReceitas,
    aproveitaFichas: p.aproveitaFichas,
    reajustaProjetos: p.reajustaProjetos,
    incluiFichasAbertasPorCredito: p.incluiFichasAbertasPorCredito,
    criadoEm: p.criadoEm,
    criadoPor: p.criadoPor,
    receitas,
    despesas,
    totalDaReceita: totais(receitas, sinal),
    receitaBruta: totais(receitas.filter((r) => r.tipoReceita !== "DEDUCAO")),
    deducoesDaReceita: totais(receitas.filter((r) => r.tipoReceita === "DEDUCAO")),
    totalDaDespesa: totais(despesas),
    efetivacao: p.efetivacao,
    destino: {
      existe: exercicio !== null,
      encerrado: exercicio?.encerramento !== null && exercicio?.encerramento !== undefined,
      fichas,
      receitas: receitasNoDestino,
      efetivadoPorOutra: efetivacaoDoDestino !== null && efetivacaoDoDestino.propostaOrcamentariaId !== p.id,
      deducoesSemTipo,
      lei: lei === null ? null : { id: lei.id, numeroDoProjeto: lei.numeroDoProjeto, numeroDaLei: lei.aprovacao?.numeroDaLei ?? null },
    },
    naOrigem: { fichas: fichasNaOrigem, receitas: receitasNaOrigem },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// V38 — LINHAS NOVAS NA PROPOSTA (a ficha ou a receita que a lei de origem não tinha) e o REAJUSTE EM LOTE
// ─────────────────────────────────────────────────────────────────────────────
//
// A contadora quer "abrir o exercício seguinte puxando do anterior e só fazer as alterações": alterar valores,
// INCLUIR receitas e despesas novas e aplicar um percentual em lote. Antes, a proposta só ajustava linhas importadas
// (toda linha exigia origem), e uma ficha criada à mão no destino impedia gerar o orçamento.
//
// A linha nova é insert-only como as demais: nasce com a classificação própria, valorNaLeiDeOrigem e valorBase zero e
// valorProjetado = o valor informado; muda por AJUSTE e some com valor zero. A efetivação a transforma em ficha (ou em
// receita prevista) pelo mesmo corpo das importadas, com o número seguinte aos importados.

type OrigemDaReceita = {
  readonly naturezaReceitaId: string;
  readonly fonteId: string;
  readonly exercicioFonte: number;
  readonly tipoReceita: "ORCAMENTARIA" | "INTRA_ORCAMENTARIA" | "DEDUCAO";
  readonly naturezaReceita: { readonly codigo: string };
  readonly detalhe: { readonly tipoDeducaoSagres: string | null } | null;
};
function origemDaReceitaNova(l: {
  readonly id: string;
  readonly naturezaReceitaId: string | null;
  readonly fonteId: string | null;
  readonly exercicioFonte: number | null;
  readonly tipoReceita: "ORCAMENTARIA" | "INTRA_ORCAMENTARIA" | "DEDUCAO" | null;
  readonly naturezaReceita: { readonly codigo: string } | null;
}): OrigemDaReceita {
  if (l.naturezaReceitaId === null || l.fonteId === null || l.exercicioFonte === null || l.tipoReceita === null || l.naturezaReceita === null) {
    throw new PropostaOrcamentariaInvalidaError(`A linha de receita ${l.id} não tem origem nem classificação. Nada foi gravado.`);
  }
  return { naturezaReceitaId: l.naturezaReceitaId, fonteId: l.fonteId, exercicioFonte: l.exercicioFonte, tipoReceita: l.tipoReceita, naturezaReceita: l.naturezaReceita, detalhe: null };
}

type OrigemDaFicha = {
  readonly numero: number;
  readonly orgaoId: string;
  readonly unidadeOrcId: string;
  readonly funcaoId: string;
  readonly subfuncaoId: string;
  readonly programaId: string;
  readonly acaoId: string;
  readonly naturezaDespesaId: string;
  readonly fonteId: string;
  readonly coId: string | null;
  readonly exercicioFonte: number;
};
function origemDaFichaNova(l: {
  readonly id: string;
  readonly orgaoId: string | null;
  readonly unidadeOrcId: string | null;
  readonly funcaoId: string | null;
  readonly subfuncaoId: string | null;
  readonly programaId: string | null;
  readonly acaoId: string | null;
  readonly naturezaDespesaId: string | null;
  readonly fonteId: string | null;
  readonly coId: string | null;
  readonly exercicioFonte: number | null;
}): OrigemDaFicha {
  if (
    l.orgaoId === null || l.unidadeOrcId === null || l.funcaoId === null || l.subfuncaoId === null || l.programaId === null ||
    l.acaoId === null || l.naturezaDespesaId === null || l.fonteId === null || l.exercicioFonte === null
  ) {
    throw new PropostaOrcamentariaInvalidaError(`A linha de despesa ${l.id} não tem origem nem classificação. Nada foi gravado.`);
  }
  return {
    numero: 0, orgaoId: l.orgaoId, unidadeOrcId: l.unidadeOrcId, funcaoId: l.funcaoId, subfuncaoId: l.subfuncaoId, programaId: l.programaId,
    acaoId: l.acaoId, naturezaDespesaId: l.naturezaDespesaId, fonteId: l.fonteId, coId: l.coId, exercicioFonte: l.exercicioFonte,
  };
}

const zValorDaLinhaNova = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Informe o valor em reais, sem sinal, com até duas casas (ex.: 1.250.000,00).")
  .transform((v) => toMoney(v))
  .refine((v) => v.greaterThan(0), "A linha nova precisa de um valor maior que zero.");
const zCodigo = z.string().trim().min(1);

/** A proposta aberta (existe e não foi efetivada), travada para a escrita. */
async function propostaAberta(tx: Tx, propostaOrcamentariaId: string): Promise<{ readonly exercicio: number }> {
  await travar(tx, "PropostaOrcamentaria", [propostaOrcamentariaId]);
  const proposta = await tx.propostaOrcamentaria.findUnique({
    where: { id: propostaOrcamentariaId },
    select: { exercicio: true, efetivacao: { select: { id: true } } },
  });
  if (proposta === null) throw new PropostaOrcamentariaInvalidaError("Proposta não encontrada. Nada foi gravado.");
  if (proposta.efetivacao !== null) {
    throw new PropostaOrcamentariaInvalidaError(
      "A proposta já foi efetivada: o orçamento existe e só muda por crédito adicional ou realocação. Nada foi gravado."
    );
  }
  return { exercicio: proposta.exercicio };
}

export const zIncluirFichaNaProposta = z.object({
  propostaOrcamentariaId: z.string().trim().min(1),
  classificacao: z.object({
    unidadeOrc: zCodigo,
    funcao: zCodigo,
    subfuncao: zCodigo,
    programa: zCodigo,
    acao: zCodigo,
    naturezaDespesa: zCodigo,
    fonte: zCodigo,
    co: z.string().trim().optional(),
  }),
  exercicioFonte: z.number().int().min(1).max(9).default(1),
  valor: zValorDaLinhaNova,
  motivo: z.string().trim().min(5, "Informe o motivo da inclusão.").max(500),
  criadoPor: z.string().trim().min(1),
});
export type IncluirFichaNaPropostaInput = z.input<typeof zIncluirFichaNaProposta>;

/**
 * INCLUI uma ficha nova na proposta: a classificação completa (por código, como a criação manual da ficha), o valor
 * e o motivo. O órgão vem da unidade. Recusa componente inexistente, classificação já presente na proposta (importada
 * ou nova) e proposta efetivada. A autorização é a de quem elabora a proposta (ente); a efetivação continua cobrando
 * CRIAR_FICHA na unidade, como para as importadas.
 */
export async function incluirFichaNaProposta(prisma: PrismaClient, input: IncluirFichaNaPropostaInput): Promise<{ readonly id: string }> {
  const d = lerOuRecusar(zIncluirFichaNaProposta, input);
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.incluirFichaNaProposta, "ENTE");
    await propostaAberta(tx, d.propostaOrcamentariaId);
    const c = d.classificacao;
    const [unidade, funcao, subfuncao, programa, acao, natureza, fonte, co] = await Promise.all([
      tx.unidadeOrcamentaria.findUnique({ where: { codigo: c.unidadeOrc }, select: { id: true, orgaoId: true } }),
      tx.funcao.findUnique({ where: { codigo: c.funcao }, select: { id: true } }),
      tx.subfuncao.findUnique({ where: { codigo: c.subfuncao }, select: { id: true } }),
      tx.programa.findUnique({ where: { codigo: c.programa }, select: { id: true } }),
      tx.acao.findUnique({ where: { codigo: c.acao }, select: { id: true } }),
      tx.naturezaDespesa.findUnique({ where: { codigoCompleto: c.naturezaDespesa.replace(/\D/g, "") }, select: { id: true } }),
      tx.fonteRecurso.findUnique({ where: { codigo: c.fonte }, select: { id: true } }),
      c.co === undefined || c.co === "" ? Promise.resolve(null) : tx.codigoAcompanhamento.findUnique({ where: { codigo: c.co }, select: { id: true } }),
    ]);
    const faltantes = [
      unidade === null ? `unidade "${c.unidadeOrc}"` : "", funcao === null ? `função "${c.funcao}"` : "", subfuncao === null ? `subfunção "${c.subfuncao}"` : "",
      programa === null ? `programa "${c.programa}"` : "", acao === null ? `ação "${c.acao}"` : "", natureza === null ? `natureza "${c.naturezaDespesa}"` : "",
      fonte === null ? `fonte "${c.fonte}"` : "", c.co !== undefined && c.co !== "" && co === null ? `código de acompanhamento "${c.co}"` : "",
    ].filter((x) => x !== "");
    if (faltantes.length > 0 || unidade === null || funcao === null || subfuncao === null || programa === null || acao === null || natureza === null || fonte === null) {
      throw new PropostaOrcamentariaInvalidaError(`Componente(s) inexistente(s) no plano de classificação: ${faltantes.join(", ")}. Nada foi gravado.`);
    }
    const chave = [unidade.id, funcao.id, subfuncao.id, programa.id, acao.id, natureza.id, fonte.id, co?.id ?? "", String(d.exercicioFonte)].join("|");
    const existentes = await tx.linhaDeDespesaDaProposta.findMany({
      where: { propostaOrcamentariaId: d.propostaOrcamentariaId },
      select: {
        unidadeOrcId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true, naturezaDespesaId: true, fonteId: true, coId: true, exercicioFonte: true,
        fichaDeOrigem: { select: { numero: true, unidadeOrcId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true, naturezaDespesaId: true, fonteId: true, coId: true, exercicioFonte: true } },
      },
    });
    const igual = existentes.find((l) => {
      const o = l.fichaDeOrigem ?? l;
      return [o.unidadeOrcId, o.funcaoId, o.subfuncaoId, o.programaId, o.acaoId, o.naturezaDespesaId, o.fonteId, o.coId ?? "", String(o.exercicioFonte)].join("|") === chave;
    });
    if (igual !== undefined) {
      throw new PropostaOrcamentariaInvalidaError(
        `A proposta já tem uma linha com esta classificação${igual.fichaDeOrigem === null ? " (incluída nela)" : ` (a ficha ${String(igual.fichaDeOrigem.numero)} importada)`}. Altere o valor dessa linha em vez de incluir outra. Nada foi gravado.`
      );
    }
    const linha = await tx.linhaDeDespesaDaProposta.create({
      data: {
        propostaOrcamentariaId: d.propostaOrcamentariaId,
        orgaoId: unidade.orgaoId, unidadeOrcId: unidade.id, funcaoId: funcao.id, subfuncaoId: subfuncao.id, programaId: programa.id, acaoId: acao.id,
        naturezaDespesaId: natureza.id, fonteId: fonte.id, coId: co?.id ?? null, exercicioFonte: d.exercicioFonte,
        valorNaLeiDeOrigem: "0.00", valorBase: "0.00", valorProjetado: d.valor.toFixed(2),
        motivo: d.motivo, criadoPor: d.criadoPor, criadoEm: new Date(),
      },
      select: { id: true },
    });
    return { id: linha.id };
  });
}

export const zIncluirReceitaNaProposta = z.object({
  propostaOrcamentariaId: z.string().trim().min(1),
  naturezaReceita: zCodigo,
  fonte: zCodigo,
  tipoReceita: z.enum(["ORCAMENTARIA", "INTRA_ORCAMENTARIA", "DEDUCAO"]),
  exercicioFonte: z.number().int().min(1).max(9).default(1),
  valor: zValorDaLinhaNova,
  motivo: z.string().trim().min(5, "Informe o motivo da inclusão.").max(500),
  criadoPor: z.string().trim().min(1),
});
export type IncluirReceitaNaPropostaInput = z.input<typeof zIncluirReceitaNaProposta>;

/**
 * INCLUI uma receita nova na proposta (natureza e fonte por código, como a previsão manual). A DEDUÇÃO nova fica de
 * fora: a prestação de contas exige o tipo da dedução, que a linha nova não tem como declarar; a dedução se cadastra na
 * receita prevista do exercício, depois de gerado o orçamento. Recusa linha igual (natureza, fonte, tipo e exercício
 * da fonte), importada ou nova.
 */
export async function incluirReceitaNaProposta(prisma: PrismaClient, input: IncluirReceitaNaPropostaInput): Promise<{ readonly id: string }> {
  const d = lerOuRecusar(zIncluirReceitaNaProposta, input);
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.incluirReceitaNaProposta, "ENTE");
    await propostaAberta(tx, d.propostaOrcamentariaId);
    if (d.tipoReceita === "DEDUCAO") {
      throw new PropostaOrcamentariaInvalidaError(
        "A dedução da receita não entra como linha nova da proposta: ela exige o tipo da dedução, que se informa na receita prevista do exercício depois de gerado o orçamento. Nada foi gravado."
      );
    }
    const [natureza, fonte] = await Promise.all([
      tx.naturezaReceita.findUnique({ where: { codigo: d.naturezaReceita.replace(/\D/g, "") }, select: { id: true } }),
      tx.fonteRecurso.findUnique({ where: { codigo: d.fonte }, select: { id: true } }),
    ]);
    const faltantes = [natureza === null ? `natureza de receita "${d.naturezaReceita}"` : "", fonte === null ? `fonte "${d.fonte}"` : ""].filter((x) => x !== "");
    if (natureza === null || fonte === null) {
      throw new PropostaOrcamentariaInvalidaError(`Componente(s) inexistente(s) no plano de classificação: ${faltantes.join(", ")}. Nada foi gravado.`);
    }
    const existentes = await tx.linhaDeReceitaDaProposta.findMany({
      where: { propostaOrcamentariaId: d.propostaOrcamentariaId },
      select: {
        naturezaReceitaId: true, fonteId: true, tipoReceita: true, exercicioFonte: true,
        receitaDeOrigem: { select: { naturezaReceitaId: true, fonteId: true, tipoReceita: true, exercicioFonte: true } },
      },
    });
    const chave = [natureza.id, fonte.id, d.tipoReceita, String(d.exercicioFonte)].join("|");
    if (existentes.some((l) => { const o = l.receitaDeOrigem ?? l; return [o.naturezaReceitaId, o.fonteId, o.tipoReceita, String(o.exercicioFonte)].join("|") === chave; })) {
      throw new PropostaOrcamentariaInvalidaError(
        "A proposta já tem uma linha com esta natureza, fonte e tipo de receita. Altere o valor dessa linha em vez de incluir outra. Nada foi gravado."
      );
    }
    const linha = await tx.linhaDeReceitaDaProposta.create({
      data: {
        propostaOrcamentariaId: d.propostaOrcamentariaId,
        naturezaReceitaId: natureza.id, fonteId: fonte.id, tipoReceita: d.tipoReceita, exercicioFonte: d.exercicioFonte,
        valorNaLeiDeOrigem: "0.00", valorBase: "0.00", valorProjetado: d.valor.toFixed(2),
        motivo: d.motivo, criadoPor: d.criadoPor, criadoEm: new Date(),
      },
      select: { id: true },
    });
    return { id: linha.id };
  });
}

// ── O reajuste em lote: um percentual sobre o valor vigente das linhas de um recorte, com prévia.

const zRecorte = z.object({
  fonte: z.string().trim().optional(),
  unidadeOrc: z.string().trim().optional(),
  /** O começo do código da natureza (da despesa: 6 dígitos; da receita: 8). */
  naturezaPrefixo: z.string().trim().optional(),
  tipoDaAcao: z.enum(["ATIVIDADE", "PROJETO", "OPERACAO_ESPECIAL"]).optional(),
  tipoReceita: z.enum(["ORCAMENTARIA", "INTRA_ORCAMENTARIA", "DEDUCAO"]).optional(),
});
export type RecorteDoReajuste = z.input<typeof zRecorte>;

export const zReajusteDaProposta = z.object({
  propostaOrcamentariaId: z.string().trim().min(1),
  lado: z.enum(["RECEITA", "DESPESA"]),
  percentual: zPercentualDaProposta,
  recorte: zRecorte.default({}),
});
export const zReajustarLinhasDaProposta = zReajusteDaProposta.extend({
  motivo: z.string().trim().min(5, "Informe o motivo do reajuste.").max(500),
  /** V39-016 — a versão que a prévia mostrou. A aplicação recalcula e só grava se o resultado for o mesmo. */
  versaoDaPrevia: z.string().trim().min(1, "Calcule a prévia antes de aplicar: o reajuste grava exatamente o que a prévia mostrou."),
  criadoPor: z.string().trim().min(1),
});
export type PreviaDoReajusteInput = z.input<typeof zReajusteDaProposta>;
export type ReajustarLinhasDaPropostaInput = z.input<typeof zReajustarLinhasDaProposta>;

export interface ResultadoDoReajuste {
  readonly linhas: number;
  readonly totalAntes: string;
  readonly totalDepois: string;
  /** V39-016 — a impressão digital do resultado (linha, valor vigente e valor novo de cada uma). */
  readonly versao: string;
}

/**
 * V39-016 — A VERSÃO DO RESULTADO de um reajuste: SHA-256 das linhas alcançadas, cada uma com o valor vigente e o novo,
 * em ordem de id. Muda se alguém ajustar uma linha do recorte, se entrar ou sair linha, ou se o percentual ou o
 * recorte forem trocados depois da prévia. Puro.
 */
export function versaoDoReajuste(linhas: readonly { readonly id: string; readonly antes: string; readonly depois: string }[]): string {
  const ordenadas = [...linhas].sort((a, b) => a.id.localeCompare(b.id)).map((l) => [l.id, l.antes, l.depois]);
  return createHash("sha256").update(JSON.stringify(ordenadas)).digest("hex");
}

interface LinhaParaReajuste {
  readonly id: string;
  readonly vigente: Money;
  readonly fonte: string;
  readonly unidade: string;
  readonly natureza: string;
  readonly tipoDaAcao: string;
  readonly tipoReceita: string;
  /** Como a linha se nomeia no histórico (V38, realocação): "ficha 12", "ficha nova 3.3.90.30 fonte 500", "receita 1112... fonte 500". */
  readonly rotulo?: string;
}

/** As linhas de um lado com o valor vigente e o que o recorte lê (códigos), da origem ou da própria linha. */
async function linhasDoLado(tx: Tx, propostaOrcamentariaId: string, lado: "RECEITA" | "DESPESA"): Promise<readonly LinhaParaReajuste[]> {
  const vig = (projetado: { toFixed(n: number): string }, ajustes: readonly { id: string; valor: { toFixed(n: number): string }; criadoEm: Date }[]): Money =>
    valorVigente(toMoney(projetado.toFixed(2)), ajustes.map((a) => ({ id: a.id, criadoEm: a.criadoEm, valor: toMoney(a.valor.toFixed(2)) })));
  if (lado === "RECEITA") {
    const ls = await tx.linhaDeReceitaDaProposta.findMany({
      where: { propostaOrcamentariaId },
      select: {
        id: true, valorProjetado: true, ajustes: { select: { id: true, valor: true, criadoEm: true } },
        tipoReceita: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } },
        receitaDeOrigem: { select: { tipoReceita: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } } } },
      },
    });
    return ls.map((l) => {
      const fonte = (l.receitaDeOrigem?.fonte ?? l.fonte)?.codigo ?? "";
      const natureza = (l.receitaDeOrigem?.naturezaReceita ?? l.naturezaReceita)?.codigo ?? "";
      return {
        id: l.id, vigente: vig(l.valorProjetado, l.ajustes), fonte, unidade: "", natureza,
        tipoDaAcao: "", tipoReceita: l.receitaDeOrigem?.tipoReceita ?? l.tipoReceita ?? "",
        rotulo: `receita ${natureza} fonte ${fonte}${l.receitaDeOrigem === null ? " (nova)" : ""}`,
      };
    });
  }
  const ls = await tx.linhaDeDespesaDaProposta.findMany({
    where: { propostaOrcamentariaId },
    select: {
      id: true, valorProjetado: true, ajustes: { select: { id: true, valor: true, criadoEm: true } },
      unidadeOrc: { select: { codigo: true } }, acao: { select: { tipo: true } }, naturezaDespesa: { select: { codigoCompleto: true } }, fonte: { select: { codigo: true } },
      fichaDeOrigem: { select: { numero: true, unidadeOrc: { select: { codigo: true } }, acao: { select: { tipo: true } }, naturezaDespesa: { select: { codigoCompleto: true } }, fonte: { select: { codigo: true } } } },
    },
  });
  return ls.map((l) => {
    const fonte = (l.fichaDeOrigem?.fonte ?? l.fonte)?.codigo ?? "";
    const natureza = (l.fichaDeOrigem?.naturezaDespesa ?? l.naturezaDespesa)?.codigoCompleto ?? "";
    return {
      id: l.id, vigente: vig(l.valorProjetado, l.ajustes), fonte, unidade: (l.fichaDeOrigem?.unidadeOrc ?? l.unidadeOrc)?.codigo ?? "", natureza,
      tipoDaAcao: (l.fichaDeOrigem?.acao ?? l.acao)?.tipo ?? "", tipoReceita: "",
      rotulo: l.fichaDeOrigem === null ? `ficha nova ${natureza} fonte ${fonte}` : `ficha ${String(l.fichaDeOrigem.numero)}`,
    };
  });
}

/** O recorte, puro: vazio é "todas as linhas"; cada critério informado restringe (E). Exportado para teste. */
export function linhasNoRecorte<T extends Omit<LinhaParaReajuste, "id" | "vigente">>(linhas: readonly T[], recorte: z.output<typeof zRecorte>): readonly T[] {
  const vazio = (v: string | undefined): boolean => v === undefined || v === "";
  const naturezaPrefixo = (recorte.naturezaPrefixo ?? "").replace(/\D/g, "");
  return linhas.filter(
    (l) =>
      (vazio(recorte.fonte) || l.fonte === recorte.fonte) &&
      (vazio(recorte.unidadeOrc) || l.unidade === recorte.unidadeOrc) &&
      (naturezaPrefixo === "" || l.natureza.replace(/\D/g, "").startsWith(naturezaPrefixo)) &&
      (recorte.tipoDaAcao === undefined || l.tipoDaAcao === recorte.tipoDaAcao) &&
      (recorte.tipoReceita === undefined || l.tipoReceita === recorte.tipoReceita)
  );
}

function somar(linhas: readonly { readonly vigente: Money }[]): Money {
  return linhas.reduce((acc, l) => toMoney(acc.plus(l.vigente)), toMoney("0"));
}

/** A PRÉVIA do reajuste: quantas linhas o recorte alcança e o total antes e depois. Nada grava. */
export async function previaDoReajusteDaProposta(prisma: Tx, input: PreviaDoReajusteInput): Promise<ResultadoDoReajuste> {
  const d = lerOuRecusar(zReajusteDaProposta, input);
  const alvo = linhasNoRecorte(await linhasDoLado(prisma, d.propostaOrcamentariaId, d.lado), d.recorte);
  const depois = alvo.map((l) => ({ vigente: projetar(l.vigente, d.percentual) }));
  const versao = versaoDoReajuste(alvo.map((l, i) => ({ id: l.id, antes: l.vigente.toFixed(2), depois: (depois[i]?.vigente ?? l.vigente).toFixed(2) })));
  return { linhas: alvo.length, totalAntes: somar(alvo).toFixed(2), totalDepois: somar(depois).toFixed(2), versao };
}

/**
 * REAJUSTA EM LOTE: grava um ajuste por linha do recorte, com o valor vigente mais o percentual (2 casas, a mesma
 * régua de `projetar`) e o motivo. O que a prévia mostrou é o que o ato grava: a mesma leitura, dentro da transação,
 * com a proposta travada. Recorte sem linha é recusado.
 */
export async function reajustarLinhasDaProposta(prisma: PrismaClient, input: ReajustarLinhasDaPropostaInput): Promise<ResultadoDoReajuste> {
  const d = lerOuRecusar(zReajustarLinhasDaProposta, input);
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.reajustarLinhasDaProposta, "ENTE");
    await propostaAberta(tx, d.propostaOrcamentariaId);
    const alvo = linhasNoRecorte(await linhasDoLado(tx, d.propostaOrcamentariaId, d.lado), d.recorte);
    if (alvo.length === 0) {
      throw new PropostaOrcamentariaInvalidaError("Nenhuma linha da proposta está no recorte informado. Nada foi gravado.");
    }
    const novos = alvo.map((l) => ({ id: l.id, valor: projetar(l.vigente, d.percentual) }));
    // V39-016 — o que se grava é o que a prévia mostrou. Se uma linha do recorte foi ajustada, entrou ou saiu, ou se o
    // percentual/recorte mudou depois da prévia, a versão difere e nada se grava.
    const versao = versaoDoReajuste(alvo.map((l, i) => ({ id: l.id, antes: l.vigente.toFixed(2), depois: (novos[i]?.valor ?? l.vigente).toFixed(2) })));
    if (versao !== d.versaoDaPrevia) {
      throw new PropostaOrcamentariaInvalidaError(
        "Os valores mudaram desde a prévia (uma linha do recorte foi ajustada, ou o percentual ou o recorte foram trocados). Calcule a prévia de novo e confira antes de aplicar. Nada foi gravado."
      );
    }
    const motivo = `${d.motivo} (reajuste em lote de ${d.percentual.toString().replace(".", ",")}%)`;
    if (d.lado === "RECEITA") {
      await tx.ajusteDeReceitaDaProposta.createMany({ data: novos.map((n) => ({ linhaId: n.id, valor: n.valor.toFixed(2), motivo, criadoPor: d.criadoPor })) });
    } else {
      await tx.ajusteDeDespesaDaProposta.createMany({ data: novos.map((n) => ({ linhaId: n.id, valor: n.valor.toFixed(2), motivo, criadoPor: d.criadoPor })) });
    }
    return { linhas: alvo.length, totalAntes: somar(alvo).toFixed(2), totalDepois: somar(novos.map((n) => ({ vigente: n.valor }))).toFixed(2), versao };
  });
}

// ── V38 (AUD-113) — REALOCAR entre linhas da proposta, com o total preservado.
//
// Depois do reajuste, a contadora quer "conferir e alocar entre itens o que precisar". O ajuste linha a linha muda o
// total; a realocação tira um valor de uma linha e põe na outra, num ato só, com o mesmo motivo nas duas e o nome da
// outra linha no histórico de cada uma. Nada se distribui sozinho: a pessoa escolhe a origem, o destino e o valor.

export const zRealocarNaProposta = z
  .object({
    propostaOrcamentariaId: z.string().trim().min(1),
    lado: z.enum(["RECEITA", "DESPESA"]),
    deLinhaId: z.string().trim().min(1, "Escolha a linha de onde o valor sai."),
    paraLinhaId: z.string().trim().min(1, "Escolha a linha que recebe o valor."),
    valor: z
      .string()
      .trim()
      .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Informe o valor em reais, sem sinal, com até duas casas (ex.: 10.000,00).")
      .transform((v) => toMoney(v))
      .refine((v) => v.greaterThan(0), "O valor a realocar tem de ser maior que zero."),
    motivo: z.string().trim().min(5, "Informe o motivo da realocação.").max(400),
    criadoPor: z.string().trim().min(1),
  })
  .refine((d) => d.deLinhaId !== d.paraLinhaId, { message: "A linha de origem e a de destino são a mesma: escolha duas linhas diferentes." });
export type RealocarNaPropostaInput = z.input<typeof zRealocarNaProposta>;

export interface ResultadoDaRealocacao {
  readonly de: { readonly rotulo: string; readonly antes: string; readonly depois: string };
  readonly para: { readonly rotulo: string; readonly antes: string; readonly depois: string };
  /** O total do lado antes e depois: iguais por construção, e conferidos antes de gravar. */
  readonly totalAntes: string;
  readonly totalDepois: string;
}

/**
 * A ARITMÉTICA DA REALOCAÇÃO, pura: a origem perde o valor, o destino ganha o mesmo valor, a soma não muda. Recusa
 * deixar a origem negativa (nomeando o saldo dela). Exportada para teste.
 */
export function realocarValores(de: Money, para: Money, valor: Money): { readonly de: Money; readonly para: Money } {
  if (valor.greaterThan(de)) {
    throw new PropostaOrcamentariaInvalidaError(
      `O valor a realocar (${valor.toFixed(2)}) passa do valor da linha de origem na proposta (${de.toFixed(2)}). Nada foi gravado.`
    );
  }
  return { de: toMoney(de.minus(valor)), para: toMoney(para.plus(valor)) };
}

const sinalDaLinha = (lado: "RECEITA" | "DESPESA", l: LinhaParaReajuste): 1 | -1 =>
  lado === "RECEITA" ? SINAL_PREVISAO[l.tipoReceita as keyof typeof SINAL_PREVISAO] : 1;

function totalDoLado(lado: "RECEITA" | "DESPESA", linhas: readonly LinhaParaReajuste[], valor: (l: LinhaParaReajuste) => Money): Money {
  return linhas.reduce((acc, l) => toMoney(sinalDaLinha(lado, l) === 1 ? acc.plus(valor(l)) : acc.minus(valor(l))), toMoney("0"));
}

/**
 * REALOCA um valor de uma linha para outra do MESMO lado: dois ajustes (append-only), na mesma transação, com a
 * proposta travada. Na receita, as duas linhas têm de ter o mesmo sinal (dedução com dedução; receita com receita):
 * tirar de uma dedução para pôr numa receita mudaria a receita líquida, e isso não é realocar.
 */
export async function realocarNaProposta(prisma: PrismaClient, input: RealocarNaPropostaInput): Promise<ResultadoDaRealocacao> {
  const d = lerOuRecusar(zRealocarNaProposta, input);
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.realocarNaProposta, "ENTE");
    await propostaAberta(tx, d.propostaOrcamentariaId);
    const linhas = await linhasDoLado(tx, d.propostaOrcamentariaId, d.lado);
    const de = linhas.find((l) => l.id === d.deLinhaId);
    const para = linhas.find((l) => l.id === d.paraLinhaId);
    if (de === undefined || para === undefined) {
      throw new PropostaOrcamentariaInvalidaError(
        `A linha ${de === undefined ? "de origem" : "de destino"} não pertence a esta proposta ${d.lado === "RECEITA" ? "nas receitas" : "nas fichas"}. Nada foi gravado.`
      );
    }
    if (sinalDaLinha(d.lado, de) !== sinalDaLinha(d.lado, para)) {
      throw new PropostaOrcamentariaInvalidaError(
        "Uma das linhas é dedução da receita e a outra não: realocar entre elas mudaria a receita líquida. Use a alteração de valor de cada linha. Nada foi gravado."
      );
    }
    const novos = realocarValores(de.vigente, para.vigente, d.valor);
    const rotuloDe = de.rotulo ?? "a linha de origem";
    const rotuloPara = para.rotulo ?? "a linha de destino";
    const depois = (l: LinhaParaReajuste): Money => (l.id === de.id ? novos.de : l.id === para.id ? novos.para : l.vigente);
    const totalAntes = totalDoLado(d.lado, linhas, (l) => l.vigente);
    const totalDepois = totalDoLado(d.lado, linhas, depois);
    // Defesa: a aritmética garante; se um dia não garantir, nada se grava.
    if (!totalAntes.equals(totalDepois)) {
      throw new PropostaOrcamentariaInvalidaError("A realocação mudaria o total da proposta. Nada foi gravado.");
    }
    const valorBr = d.valor.toFixed(2);
    const dados = [
      { linhaId: de.id, valor: novos.de.toFixed(2), motivo: `${d.motivo} (realocação: ${valorBr} para ${rotuloPara})`, criadoPor: d.criadoPor },
      { linhaId: para.id, valor: novos.para.toFixed(2), motivo: `${d.motivo} (realocação: ${valorBr} vindos de ${rotuloDe})`, criadoPor: d.criadoPor },
    ];
    if (d.lado === "RECEITA") await tx.ajusteDeReceitaDaProposta.createMany({ data: dados });
    else await tx.ajusteDeDespesaDaProposta.createMany({ data: dados });
    return {
      de: { rotulo: rotuloDe, antes: de.vigente.toFixed(2), depois: novos.de.toFixed(2) },
      para: { rotulo: rotuloPara, antes: para.vigente.toFixed(2), depois: novos.para.toFixed(2) },
      totalAntes: totalAntes.toFixed(2),
      totalDepois: totalDepois.toFixed(2),
    };
  });
}

/** Uma linha da proposta como o seletor da realocação a oferece: o rótulo, o valor na proposta e a classificação. */
export interface LinhaParaEscolha {
  readonly id: string;
  readonly rotulo: string;
  readonly vigente: string;
  readonly detalhe: string;
  readonly busca: string;
}

/** As linhas de um lado, para escolher na realocação. A busca casa ficha, natureza, fonte e unidade. Nada grava. */
export async function linhasDaPropostaParaEscolha(prisma: Tx, propostaOrcamentariaId: string, lado: "RECEITA" | "DESPESA"): Promise<readonly LinhaParaEscolha[]> {
  return (await linhasDoLado(prisma, propostaOrcamentariaId, lado))
    .map((l) => ({
      id: l.id,
      rotulo: l.rotulo ?? l.id,
      vigente: l.vigente.toFixed(2),
      detalhe: `natureza ${l.natureza} · fonte ${l.fonte}${l.unidade === "" ? "" : ` · unidade ${l.unidade}`}`,
      busca: [l.rotulo ?? "", l.natureza, l.fonte, l.unidade].join(" "),
    }))
    .sort((x, y) => x.rotulo.localeCompare(y.rotulo, "pt-BR", { numeric: true }));
}
