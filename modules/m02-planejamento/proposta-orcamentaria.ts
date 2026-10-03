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

export const zElaborarPropostaOrcamentaria = z
  .object({
    exercicio: zExercicio,
    exercicioDeOrigem: zExercicio,
    descricao: z.string().trim().min(3, "Dê um nome à proposta (ex.: Proposta inicial 2027).").max(200),
    aproveitaReceitas: zSimNao,
    aproveitaFichas: zSimNao,
    baseDaReceita: z.enum(["PREVISAO_INICIAL", "PREVISAO_ATUALIZADA", "SEM_VALOR"], { message: "Escolha o valor de partida da receita." }),
    percentualDaReceita: zPercentualDaProposta,
    baseDaDespesa: z.enum(["DOTACAO_INICIAL", "DOTACAO_AUTORIZADA", "EMPENHADO", "SEM_VALOR"], { message: "Escolha o valor de partida da despesa." }),
    percentualDaDespesa: zPercentualDaProposta,
    reajustaProjetos: zSimNao,
    incluiFichasAbertasPorCredito: zSimNao,
    criadoPor: z.string().trim().min(1),
  })
  .refine((d) => d.exercicio > d.exercicioDeOrigem, {
    message: "O exercício da proposta tem de ser posterior ao exercício de onde os valores são importados.",
  })
  .refine((d) => d.aproveitaReceitas || d.aproveitaFichas, {
    message: "Escolha o que aproveitar: as receitas, as fichas ou as duas.",
  });
export type ElaborarPropostaOrcamentariaInput = z.input<typeof zElaborarPropostaOrcamentaria>;

interface BaseDaFicha {
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
async function basesDasFichas(
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
async function basesDasReceitas(
  tx: Tx,
  exercicio: number,
  base: BaseDaReceitaDaProposta
): Promise<readonly { readonly receitaId: string; readonly valorNaLei: Money; readonly valor: Money }[]> {
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
    return receitas.map((r) => ({ receitaId: r.id, valorNaLei: naLei(r), valor: base === "SEM_VALOR" ? toMoney("0") : naLei(r) }));
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
    valorNaLei: naLei(r),
    valor: toMoney(naLei(r).plus(soma.get(chave(r.naturezaReceita.codigo, r.fonte.codigo, r.tipoReceita)) ?? toMoney("0"))),
  }));
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

      const receitas = d.aproveitaReceitas ? await basesDasReceitas(tx, d.exercicioDeOrigem, d.baseDaReceita) : [];
      const despesa = d.aproveitaFichas
        ? await basesDasFichas(tx, d.exercicioDeOrigem, d.baseDaDespesa, d.incluiFichasAbertasPorCredito)
        : { fichas: [], abertasPorCreditoDeixadas: 0 };
      if (receitas.length === 0 && despesa.fichas.length === 0) {
        const oQue = d.aproveitaReceitas && d.aproveitaFichas ? "receita prevista nem fichas" : d.aproveitaReceitas ? "receita prevista" : "fichas";
        throw new PropostaOrcamentariaInvalidaError(
          `O exercício ${d.exercicioDeOrigem} não tem ${oQue} a aproveitar. Nada foi gravado.`
        );
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
          valorProjetado: projetar(r.valor, d.percentualDaReceita).toFixed(2),
        })),
      });
      const zero = toPercentual("0");
      await tx.linhaDeDespesaDaProposta.createMany({
        data: despesa.fichas.map((f) => ({
          propostaOrcamentariaId: proposta.id,
          fichaDeOrigemId: f.fichaId,
          valorNaLeiDeOrigem: f.valorNaLei.toFixed(2),
          valorBase: f.valor.toFixed(2),
          // Projeto e operação especial não levam o reajuste quando o operador assim escolhe: são
          // valores de obra ou de compromisso, não de custeio corrente.
          valorProjetado: projetar(
            f.valor,
            !d.reajustaProjetos && f.tipoDaAcao !== "ATIVIDADE" ? zero : d.percentualDaDespesa
          ).toFixed(2),
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

export const zEfetivarPropostaOrcamentaria = z.object({
  propostaOrcamentariaId: z.string().trim().min(1),
  criadoPor: z.string().trim().min(1),
});
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
                  },
                },
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

        const receitas = proposta.linhasDeReceita.map((l) => ({
          origem: l.receitaDeOrigem,
          valor: valorVigente(
            toMoney(l.valorProjetado.toFixed(2)),
            l.ajustes.map((a) => ({ id: a.id, criadoEm: a.criadoEm, valor: toMoney(a.valor.toFixed(2)) }))
          ),
        }));
        const despesas = proposta.linhasDeDespesa.map((l) => ({
          origem: l.fichaDeOrigem,
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
        const despesasACriar = despesas
          .filter((r) => !r.valor.isZero())
          .sort((a, b) => a.origem.numero - b.origem.numero);
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
          await tx.receitaPrevista.create({
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
        }
        for (const r of despesasACriar) {
          await criarFichaNaTransacao(
            tx,
            {
              exercicio,
              numero: r.origem.numero,
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
  readonly efetivacao: { readonly criadoEm: Date; readonly criadoPor: string; readonly fichasCriadas: number; readonly receitasCriadas: number } | null;
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
      efetivacao: { select: { criadoEm: true, criadoPor: true, fichasCriadas: true, receitasCriadas: true } },
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
        },
      },
      linhasDeDespesa: {
        select: {
          id: true,
          valorNaLeiDeOrigem: true,
          valorBase: true,
          valorProjetado: true,
          ajustes: { select: { id: true, valor: true, motivo: true, criadoEm: true, criadoPor: true } },
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
    .map((l) => ({
      id: l.id,
      naturezaCodigo: l.receitaDeOrigem.naturezaReceita.codigo,
      naturezaDescricao: l.receitaDeOrigem.naturezaReceita.descricao,
      fonteCodigo: l.receitaDeOrigem.fonte.codigo,
      tipoReceita: l.receitaDeOrigem.tipoReceita,
      valorNaLeiDeOrigem: l.valorNaLeiDeOrigem.toFixed(2),
      valorBase: l.valorBase.toFixed(2),
      valorProjetado: l.valorProjetado.toFixed(2),
      valorVigente: vig(l.valorProjetado, l.ajustes),
      ajustes: ajustesOrdenados(l.ajustes),
    }))
    .sort((a, b) => a.naturezaCodigo.localeCompare(b.naturezaCodigo) || a.fonteCodigo.localeCompare(b.fonteCodigo) || a.tipoReceita.localeCompare(b.tipoReceita));

  const despesas: LinhaDeDespesaNaProposta[] = p.linhasDeDespesa
    .map((l) => ({
      id: l.id,
      numero: l.fichaDeOrigem.numero,
      unidadeCodigo: l.fichaDeOrigem.unidadeOrc.codigo,
      unidadeNome: l.fichaDeOrigem.unidadeOrc.descricao,
      programaCodigo: l.fichaDeOrigem.programa.codigo,
      acaoCodigo: l.fichaDeOrigem.acao.codigo,
      tipoDaAcao: l.fichaDeOrigem.acao.tipo,
      naturezaCodigo: l.fichaDeOrigem.naturezaDespesa.codigoCompleto,
      naturezaDescricao: l.fichaDeOrigem.naturezaDespesa.descricao,
      fonteCodigo: l.fichaDeOrigem.fonte.codigo,
      valorNaLeiDeOrigem: l.valorNaLeiDeOrigem.toFixed(2),
      valorBase: l.valorBase.toFixed(2),
      valorProjetado: l.valorProjetado.toFixed(2),
      valorVigente: vig(l.valorProjetado, l.ajustes),
      ajustes: ajustesOrdenados(l.ajustes),
    }))
    .sort((a, b) => a.numero - b.numero);

  const [exercicio, fichas, receitasNoDestino, efetivacaoDoDestino, deducoesSemTipo, lei] = await Promise.all([
    prisma.exercicio.findUnique({ where: { ano: p.exercicio }, select: { encerramento: { select: { id: true } } } }),
    prisma.fichaOrcamentaria.count({ where: { exercicio: p.exercicio } }),
    prisma.receitaPrevista.count({ where: { exercicio: p.exercicio } }),
    prisma.efetivacaoDaProposta.findUnique({ where: { exercicio: p.exercicio }, select: { propostaOrcamentariaId: true } }),
    prisma.receitaPrevista.count({ where: { exercicio: p.exercicio, tipoReceita: "DEDUCAO", detalhe: { is: null } } }),
    prisma.leiOrcamentariaAnual.findUnique({
      where: { exercicio: p.exercicio },
      select: { id: true, numeroDoProjeto: true, aprovacao: { select: { numeroDaLei: true } } },
    }),
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
  };
}
