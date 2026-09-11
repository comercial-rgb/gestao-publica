import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { origemDaNatureza } from "../m04-receita/dominio.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { janelaCivilDoMes } from "../../packages/datas/index.js";

/**
 * M10 — DÍVIDA CONSOLIDADA / FUNDADA (TR 5.82, 4.64, 5.8, 4.48).
 *
 * ═══ O SALDO É Σ, NUNCA COLUNA ═══
 * Uma coluna `saldoAtual` seria a segunda verdade sobre a mesma dívida, e o dia em
 * que um estorno esquecesse de atualizá-la o ente amortizaria o que já não deve.
 *
 * ═══ ONDE CADA LANÇAMENTO É FEITO (ver também o cabeçalho do schema) ═══
 * O ingresso é contabilizado pelo M04 (é receita orçamentária) e a amortização pelo
 * M05 (é despesa orçamentária) — os dois por ROTEIRO POR PARÂMETRO, apontando a
 * perna certa para a conta do passivo. Só a ATUALIZAÇÃO MONETÁRIA tem lançamento
 * próprio (`RoteiroDivida`), porque é a única sem contrapartida orçamentária.
 * Um roteiro de ingresso aqui creditaria o passivo DUAS VEZES.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export type TipoMovimentoDivida =
  | "INGRESSO_OPERACAO_CREDITO"
  | "ATUALIZACAO_MONETARIA"
  | "AMORTIZACAO"
  | "ESTORNO_INGRESSO_OPERACAO_CREDITO"
  | "ESTORNO_ATUALIZACAO_MONETARIA"
  | "ESTORNO_AMORTIZACAO";

/**
 * O SINAL DE CADA MOVIMENTO SOBRE O SALDO DA DÍVIDA.
 *
 * A dívida CRESCE quando o dinheiro entra (ingresso) e quando ela é corrigida
 * (atualização); DIMINUI quando é paga (amortização). Os estornos desfazem, cada um
 * com o sinal invertido do seu original. O `Record` exaustivo é o guarda: um tipo
 * novo no enum do Prisma não compila sem que alguém diga o que ele faz com o saldo
 * — e é exatamente aí que os bugs 345af7d/4768cff nasceram, num sinal trocado.
 */
export const SINAL_MOVIMENTO_DIVIDA: Record<TipoMovimentoDivida, 1 | -1> = {
  INGRESSO_OPERACAO_CREDITO: 1,
  ATUALIZACAO_MONETARIA: 1,
  AMORTIZACAO: -1,
  ESTORNO_INGRESSO_OPERACAO_CREDITO: -1,
  ESTORNO_ATUALIZACAO_MONETARIA: -1,
  ESTORNO_AMORTIZACAO: 1,
};

/** O tipo do estorno de cada movimento. Um estorno NÃO se estorna. */
export const TIPO_DO_ESTORNO_DIVIDA: Record<
  TipoMovimentoDivida,
  TipoMovimentoDivida | null
> = {
  INGRESSO_OPERACAO_CREDITO: "ESTORNO_INGRESSO_OPERACAO_CREDITO",
  ATUALIZACAO_MONETARIA: "ESTORNO_ATUALIZACAO_MONETARIA",
  AMORTIZACAO: "ESTORNO_AMORTIZACAO",
  ESTORNO_INGRESSO_OPERACAO_CREDITO: null,
  ESTORNO_ATUALIZACAO_MONETARIA: null,
  ESTORNO_AMORTIZACAO: null,
};

export interface MovimentoParaSaldo {
  readonly tipo: TipoMovimentoDivida;
  readonly valor: Money;
}

/**
 * O SALDO DA DÍVIDA — puro, e a fonte única.
 *
 * ⚠️ O ESTORNO NÃO É FILTRADO: ele SOMA, com o sinal dele. Filtrar o par
 * (original + estorno) daria o mesmo número por dois caminhos — e dois caminhos é
 * um a mais do que se precisa para divergirem.
 */
export function saldoDaDivida(
  movimentos: readonly MovimentoParaSaldo[]
): Money {
  let saldo = toMoney("0.00");
  for (const m of movimentos) {
    const sinal = SINAL_MOVIMENTO_DIVIDA[m.tipo];
    saldo = toMoney(sinal === 1 ? saldo.plus(m.valor) : saldo.minus(m.valor));
  }
  return saldo;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo precisa de ao menos 10 caracteres");

export const zCadastrarDividaInput = z.object({
  identificador: z.string().trim().min(1),
  credorNome: z.string().trim().min(3),
  credorDocumento: z.string().trim().min(11, "CPF (11) ou CNPJ (14), sem máscara"),
  tipo: z.enum(["CONTRATUAL", "MOBILIARIA"]),
  leiAutorizativa: z.string().trim().min(3, "A lei que autorizou (art. 32 da LRF)"),
  objeto: z.string().trim().min(10),
  contaContabilId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarDividaInput = z.input<typeof zCadastrarDividaInput>;

export const zIngressoOperacaoCreditoInput = z.object({
  dividaId: z.string().min(1),
  /** TR 4.64 — o ingresso NASCE de uma receita arrecadada. */
  receitaArrecadadaId: z.string().min(1),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type IngressoOperacaoCreditoInput = z.input<
  typeof zIngressoOperacaoCreditoInput
>;

export const zAtualizacaoMonetariaInput = z.object({
  dividaId: z.string().min(1),
  valor: zValorPositivo,
  /** "YYYY-MM" — a competência da correção. É ela que dá a idempotência. */
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato YYYY-MM"),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type AtualizacaoMonetariaInput = z.input<typeof zAtualizacaoMonetariaInput>;

export const zEstornarMovimentoDividaInput = z.object({
  movimentoId: z.string().min(1),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoDividaInput = z.input<
  typeof zEstornarMovimentoDividaInput
>;

/** O 1º instante da competência "YYYY-MM", no calendário civil do ente. */
export function inicioDaCompetencia(competencia: string): Date {
  return janelaCivilDoMes(competencia).inicio;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS DERIVADAS
// ═══════════════════════════════════════════════════════════════════════════

/** Σ(valor × SINAL) até o corte. O saldo NUNCA sai de coluna. */
export async function saldoDaDividaEm(
  tx: Tx,
  dividaId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoDivida.findMany({
    where: {
      dividaId,
      // Corte pela data do FATO.
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return saldoDaDivida(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

/**
 * ⚠️ O LOCK DA DÍVIDA — ordem de aquisição FICHA(S) → CONTRATO → DÍVIDA.
 *
 * Mesma corrida do saldo da ficha (6fa5d4e) e do contrato (e0e7e9f): SOMA, DECIDE,
 * GRAVA. Sob READ COMMITTED dois pagamentos concorrentes leem o MESMO saldo e os
 * dois amortizam — a dívida ficaria negativa sem nenhum guard ter errado.
 *
 * A DÍVIDA É A ÚLTIMA da ordem porque é a última a ser tocada no `pagar()`. Inverter
 * a ordem em qualquer caminho novo é abrir um deadlock.
 */
export async function travarDivida(tx: Tx, dividaId: string): Promise<void> {
  await travar(tx, "DividaConsolidada", [dividaId]);
}

async function exigirDivida(
  tx: Tx,
  dividaId: string
): Promise<{ readonly id: string; readonly identificador: string }> {
  const d = await tx.dividaConsolidada.findUnique({
    where: { id: dividaId },
    select: { id: true, identificador: true },
  });
  if (d === null) {
    throw new Error(`Dívida ${dividaId} não existe.`);
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVIÇOS
// ═══════════════════════════════════════════════════════════════════════════

/** O cadastro é IDENTIDADE — zero valor. O valor é o Σ dos movimentos. */
export async function cadastrarDivida(
  prisma: PrismaClient,
  input: CadastrarDividaInput
): Promise<{ readonly dividaId: string }> {
  const d = zCadastrarDividaInput.parse(input);
  // SEM UG: a dívida consolidada é do MUNICÍPIO — é ele que assina o empréstimo. A `DividaConsolidada`
  // não tem unidade, e uma "dívida da Secretaria de Saúde" não existe em direito financeiro.
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.cadastrarDivida, "ENTE");


  const criada = await prisma.dividaConsolidada.create({
    data: {
      identificador: d.identificador,
      credorNome: d.credorNome,
      credorDocumento: d.credorDocumento,
      tipo: d.tipo,
      leiAutorizativa: d.leiAutorizativa,
      objeto: d.objeto,
      contaContabilId: d.contaContabilId,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });
  return { dividaId: criada.id };
}

/**
 * INGRESSO DE OPERAÇÃO DE CRÉDITO (TR 4.64) — o fato que mata o dinheiro órfão.
 *
 * ═══ NENHUM LANÇAMENTO CONTÁBIL AQUI, E É DE PROPÓSITO ═══
 * A operação de crédito é RECEITA ORÇAMENTÁRIA: o M04 já contabilizou (D caixa /
 * C conta da dívida — o roteiro da arrecadação vem por parâmetro, e para operação
 * de crédito a perna credora aponta para o PASSIVO, não para uma VPA: o ente não
 * ficou mais rico, ficou mais endividado). Lançar de novo aqui creditaria o passivo
 * DUAS VEZES. Este movimento é o FATO e o VÍNCULO.
 *
 * ⚠️ E é este vínculo que fecha o "dinheiro órfão" do superávit por fonte: o caixa
 * que entrou passa a ter um fato COM FONTE por trás (a ReceitaArrecadada), e a S1
 * do Anexo 14 deixa de acusar.
 *
 * FAIL-CLOSED: a receita existe, NÃO está anulada (derivação do M04 — `estornos`), é
 * de CAPITAL, e o valor não excede o arrecadado.
 */
/**
 * ⚠️ INTERNA — roda DENTRO da transação da OPERAÇÃO COMPOSTA.
 *
 * Não é mais serviço público: o ingresso SEM a arrecadação é meio fato (o razão
 * creditaria o passivo pela arrecadação e os movimentos não saberiam).
 */
export async function ingressoNaTx(
  tx: Tx,
  input: IngressoOperacaoCreditoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zIngressoOperacaoCreditoInput.parse(input);
  {
    await travarDivida(tx, d.dividaId);
    const divida = await exigirDivida(tx, d.dividaId);

    const receita = await tx.receitaArrecadada.findUnique({
      where: { id: d.receitaArrecadadaId },
      select: {
        id: true,
        valor: true,
        numeroReceita: true,
        estornoDeId: true,
        // "Foi anulada?" é DERIVADO — o M04 não tem flag.
        estornos: { select: { id: true } },
        naturezaReceita: { select: { codigo: true, descricao: true } },
      },
    });
    if (receita === null) {
      throw new Error(
        `Receita arrecadada ${d.receitaArrecadadaId} não existe — e a TR 4.64 exige ` +
          `que a operação de crédito nasça de uma receita.`
      );
    }
    if (receita.estornoDeId !== null) {
      throw new Error(
        `A receita ${receita.numeroReceita} É uma ANULAÇÃO — não se vincula uma ` +
          `dívida ao estorno de uma arrecadação.`
      );
    }
    if (receita.estornos.length > 0) {
      throw new Error(
        `A receita ${receita.numeroReceita} foi ANULADA. O dinheiro voltou; a dívida ` +
          `não pode nascer dele.`
      );
    }

    // ⚠️ O GUARD ERA DEGRADADO ATÉ 50783ae, E O TEXTO DELE FICA AQUI:
    //
    //     if (!ehReceitaDeCapital(receita.naturezaReceita.codigo)) { ... }
    //     "GUARD PARCIAL, E DECLARADO: o repositório NÃO tem entidade que diga
    //      'esta natureza é operação de crédito' (não há tabela de ORIGEM da
    //      receita — só o código STN e uma descrição livre). O que dá para exigir
    //      SEM INVENTAR é a CATEGORIA (...): operação de crédito é necessariamente
    //      receita de CAPITAL."
    //
    // A muleta barrava o IPTU e DEIXAVA PASSAR três receitas de capital que não são
    // dívida nenhuma: a ALIENAÇÃO de bens (2.2), a AMORTIZAÇÃO de empréstimos
    // CONCEDIDOS (2.3 — dinheiro que ENTRA de quem nos deve) e a TRANSFERÊNCIA de
    // capital (2.4 — convênio, que ninguém tem de devolver). Vincular uma dívida a
    // qualquer uma delas fabricava um passivo em cima de dinheiro que não é
    // emprestado. O que faltava era a ORIGEM (2º dígito), e agora o M04 a deriva do
    // próprio código.
    const origem = origemDaNatureza(receita.naturezaReceita.codigo);
    if (origem !== "OPERACOES_DE_CREDITO") {
      throw new Error(
        `A receita ${receita.numeroReceita} é da natureza ` +
          `${receita.naturezaReceita.codigo} (${receita.naturezaReceita.descricao}), ` +
          `cuja ORIGEM é ${origem} — e NÃO OPERACOES_DE_CREDITO (2º dígito 1 na ` +
          `categoria de capital, Portaria 163/2001). Só uma operação de crédito faz ` +
          `nascer dívida: amarrar o passivo a outra receita é declarar que o ente ` +
          `deve um dinheiro que ninguém emprestou a ele.`
      );
    }

    const arrecadado = toMoney(receita.valor.toFixed(2));
    if (d.valor.greaterThan(arrecadado)) {
      throw new Error(
        `INGRESSO MAIOR QUE A RECEITA: a dívida ${divida.identificador} registraria ` +
          `${d.valor.toFixed(2)}, mas a receita ${receita.numeroReceita} arrecadou ` +
          `${arrecadado.toFixed(2)}. A dívida não pode nascer maior do que o dinheiro ` +
          `que entrou.`
      );
    }

    const criado = await tx.movimentoDivida.create({
      data: {
        dividaId: d.dividaId,
        tipo: "INGRESSO_OPERACAO_CREDITO",
        valor: d.valor.toFixed(2),
        dataMovimento: d.dataMovimento,
        receitaArrecadadaId: d.receitaArrecadadaId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  }
}

/**
 * ATUALIZAÇÃO MONETÁRIA — o ÚNICO movimento com lançamento próprio.
 *
 * D VPD (variação monetária) / C passivo: aqui o patrimônio DIMINUI de verdade — a
 * correção é despesa, e não tem contrapartida orçamentária.
 *
 * ⚠️ SEM MOTOR DE ÍNDICE: o valor é INFORMADO. Calcular IPCA/IGP-M exigiria uma
 * série oficial que o repositório não tem — e um índice chutado corrigiria a dívida
 * do ente para mais ou para menos com cara de exatidão.
 *
 * ⚠️ IDEMPOTÊNCIA DERIVADA, NÃO ÍNDICE ÚNICO: duas correções da mesma competência
 * seriam a mesma correção duas vezes. Mas um `@@unique(dividaId, competencia)` no
 * banco travaria a competência PARA SEMPRE — inclusive depois de a correção ser
 * ESTORNADA, quando ela precisa poder ser refeita. Quem governa é o SALDO da
 * competência (o mesmo padrão do t3 do M10 bloco 2 e do t7 do M09).
 */
export async function registrarAtualizacaoMonetaria(
  prisma: PrismaClient,
  input: AtualizacaoMonetariaInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zAtualizacaoMonetariaInput.parse(input);
  const competencia = inicioDaCompetencia(d.competencia);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAtualizacaoMonetaria, "ENTE");

    await travarDivida(tx, d.dividaId);
    const divida = await exigirDivida(tx, d.dividaId);

    // IDEMPOTÊNCIA: o líquido da competência (originais − estornos) tem de ser 0.
    const daCompetencia = await tx.movimentoDivida.findMany({
      where: {
        dividaId: d.dividaId,
        tipo: { in: ["ATUALIZACAO_MONETARIA", "ESTORNO_ATUALIZACAO_MONETARIA"] },
      },
      select: { tipo: true, valor: true },
    });
    const jaAtualizado = saldoDaDivida(
      daCompetencia.map((m) => ({
        tipo: m.tipo,
        valor: toMoney(m.valor.toFixed(2)),
      }))
    );
    if (!jaAtualizado.isZero()) {
      throw new Error(
        `COMPETÊNCIA ${d.competencia} JÁ ATUALIZADA na dívida ` +
          `${divida.identificador} (líquido ${jaAtualizado.toFixed(2)}). Corrigir ` +
          `duas vezes o mesmo mês é inflar a dívida com juros que ninguém contratou. ` +
          `Estorne a atualização anterior se ela estiver errada.`
      );
    }

    // ROTEIRO POR TABELA: ausente = LANÇA, sem gravar nada.
    const roteiro = await tx.roteiroDivida.findUnique({
      where: { tipo: "ATUALIZACAO_MONETARIA" },
      select: {
        contaDebito: { select: { id: true, codigo: true, analitica: true } },
        contaCredito: { select: { id: true, codigo: true, analitica: true } },
      },
    });
    if (roteiro === null) {
      throw new Error(
        `Não há RoteiroDivida cadastrado para ATUALIZACAO_MONETARIA. As contas do ` +
          `PCASP vêm por PARÂMETRO — nenhuma conta é inventada no código. Cadastre o ` +
          `roteiro antes de corrigir a dívida.`
      );
    }

    const lancamentoId = randomUUID();
    await lancarNoRazao(tx, {
        id: lancamentoId,
        numeroControle: `DIV-${divida.identificador}-${d.competencia}`,
        dataTransacao: d.dataMovimento,
        historico: `Atualização monetária da dívida ${divida.identificador} (${d.competencia})`,
        origemTipo: "ATUALIZACAO_DIVIDA",
        origemId: d.dividaId,
        criadoPor: d.criadoPor,
        partidas: [
            {
              contaId: roteiro.contaDebito.id,
              tipo: "DEBITO",
              subsistema: "PATRIMONIAL",
              valor: d.valor.toFixed(2),
            },
            {
              contaId: roteiro.contaCredito.id,
              tipo: "CREDITO",
              subsistema: "PATRIMONIAL",
              valor: d.valor.toFixed(2),
            },
          ]
      });

    const criado = await tx.movimentoDivida.create({
      data: {
        dividaId: d.dividaId,
        tipo: "ATUALIZACAO_MONETARIA",
        valor: d.valor.toFixed(2),
        competencia,
        dataMovimento: d.dataMovimento,
        lancamentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id, lancamentoId };
  });
}

/**
 * A AMORTIZAÇÃO NASCE DENTRO DO `pagar()` (M05) — esta função é chamada de LÁ, com a
 * transação do pagamento. Não é um serviço público: amortizar por fora do pagamento
 * seria baixar uma dívida sem o dinheiro ter saído.
 *
 * ⚠️ PELO BRUTO. O pagamento pode ter retenção (M07), e o caixa sai LÍQUIDO — mas a
 * OBRIGAÇÃO morre inteira: o retido não foi perdoado pelo credor, ele mudou de dono.
 * Baixar a dívida pelo líquido a deixaria eternamente aberta na parte retida.
 *
 * ⚠️ A TRANSAÇÃO É A DO PAGAMENTO: se a dívida não cobre o valor, o PAGAMENTO INTEIRO
 * aborta. Não existe "pagou mas não amortizou".
 */
export async function amortizarNoPagamento(
  tx: Tx,
  p: {
    readonly dividaId: string;
    readonly pagamentoId: string;
    readonly valorBruto: Money;
    readonly data: Date;
    readonly numeroPagamento: string;
    readonly criadoPor: string;
  }
): Promise<void> {
  // 3º LOCK da ordem FICHA(S) → CONTRATO → DÍVIDA.
  await travarDivida(tx, p.dividaId);
  const divida = await exigirDivida(tx, p.dividaId);

  const saldo = await saldoDaDividaEm(tx, p.dividaId);
  if (p.valorBruto.greaterThan(saldo)) {
    throw new Error(
      `AMORTIZAÇÃO MAIOR QUE O SALDO DA DÍVIDA ${divida.identificador}: o pagamento ` +
        `${p.numeroPagamento} amortizaria ${p.valorBruto.toFixed(2)}, e a dívida deve ` +
        `${saldo.toFixed(2)}. Faltam ${p.valorBruto.minus(saldo).toFixed(2)} de saldo. ` +
        `Pagar mais do que se deve deixaria a dívida NEGATIVA — o pagamento inteiro ` +
        `foi abortado.`
    );
  }

  await tx.movimentoDivida.create({
    data: {
      dividaId: p.dividaId,
      tipo: "AMORTIZACAO",
      valor: p.valorBruto.toFixed(2),
      dataMovimento: p.data,
      pagamentoId: p.pagamentoId,
      motivo: `Amortização pelo pagamento ${p.numeroPagamento}`,
      criadoPor: p.criadoPor,
    },
    select: { id: true },
  });
}

/**
 * O ESTORNO DA AMORTIZAÇÃO, quando o PAGAMENTO é anulado — na mesma transação da
 * anulação. Simetria completa: quem nasceu junto, morre junto.
 */
export async function estornarAmortizacaoDoPagamento(
  tx: Tx,
  p: {
    readonly pagamentoOriginalId: string;
    readonly data: Date;
    readonly motivo: string;
    readonly criadoPor: string;
  }
): Promise<void> {
  const amortizacoes = await tx.movimentoDivida.findMany({
    where: { pagamentoId: p.pagamentoOriginalId, tipo: "AMORTIZACAO" },
    select: {
      id: true,
      dividaId: true,
      valor: true,
      estornos: { select: { id: true } },
    },
  });

  for (const a of amortizacoes) {
    if (a.estornos.length > 0) continue; // já estornada (idempotente)
    await travarDivida(tx, a.dividaId);
    await tx.movimentoDivida.create({
      data: {
        dividaId: a.dividaId,
        tipo: "ESTORNO_AMORTIZACAO",
        valor: a.valor.toFixed(2),
        dataMovimento: p.data,
        pagamentoId: p.pagamentoOriginalId,
        estornoDeId: a.id,
        motivo: p.motivo,
        criadoPor: p.criadoPor,
      },
      select: { id: true },
    });
  }
}

/**
 * ESTORNO AVULSO de um movimento de dívida.
 *
 * ⚠️ A PORTA DA AMORTIZAÇÃO É FECHADA (a lição da retenção do M07): uma AMORTIZACAO
 * com `pagamentoId` nasceu DENTRO de um pagamento. Estorná-la sozinha devolveria a
 * dívida e deixaria o pagamento de pé — o ente deveria o dinheiro E já o teria pago.
 * Para desfazê-la, ANULE O PAGAMENTO: o estorno vem junto, na mesma transação.
 *
 * ⚠️ O INGRESSO, AO CONTRÁRIO, ESTORNA-SE LIVREMENTE — e a assimetria é deliberada.
 * A receita pode estar CERTA e o VÍNCULO errado (a operação de crédito foi lançada
 * na dívida errada). Exigir a anulação da receita para corrigir o vínculo faria o
 * ente desfazer um dinheiro que entrou de verdade. O que se desfaz aqui é o vínculo,
 * não a arrecadação.
 */
export async function estornarMovimentoDivida(
  prisma: PrismaClient,
  input: EstornarMovimentoDividaInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEstornarMovimentoDividaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoDivida, "ENTE");

    const original = await tx.movimentoDivida.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        dividaId: true,
        tipo: true,
        valor: true,
        competencia: true,
        pagamentoId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento de dívida ${d.movimentoId} não existe.`);
    }

    const tipo = TIPO_DO_ESTORNO_DIVIDA[original.tipo];
    if (tipo === null) {
      throw new Error(
        `${original.tipo} JÁ É um estorno — não se estorna um estorno. Para refazer o ` +
          `fato, registre-o de novo (append-only: o histórico não se reescreve).`
      );
    }

    if (original.pagamentoId !== null) {
      throw new Error(
        `PORTA FECHADA: o movimento ${original.id} é uma AMORTIZAÇÃO que nasceu DENTRO ` +
          `do pagamento ${original.pagamentoId} — ela não se estorna sozinha. Estorná-la ` +
          `aqui devolveria a dívida e deixaria o pagamento de pé: o ente deveria o ` +
          `dinheiro E já o teria pago. ANULE O PAGAMENTO — o estorno vem junto, na mesma ` +
          `transação.`
      );
    }

    await travarDivida(tx, original.dividaId);

    if (original.estornos.length > 0) {
      throw new Error(
        `Movimento de dívida ${original.id} JÁ FOI ESTORNADO. Estornar duas vezes ` +
          `devolveria o valor em dobro.`
      );
    }

    const criado = await tx.movimentoDivida.create({
      data: {
        dividaId: original.dividaId,
        tipo,
        valor: original.valor.toFixed(2),
        // A competência é PRESERVADA: sem ela, a idempotência da atualização nunca
        // liberaria a competência estornada (o bug do M10 bloco 1, exposto no 2).
        competencia: original.competencia,
        dataMovimento: d.dataMovimento,
        estornoDeId: original.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

/**
 * A CASCATA DA ANULAÇÃO — estorna os INGRESSOS vivos vinculados à receita anulada.
 *
 * Roda DENTRO da transação da anulação da arrecadação (M04), pela porta
 * `AoAnularArrecadacaoPort`. Sem isto, anular a receita desfaria o dinheiro e deixaria
 * o passivo de pé — o ente teria "tomado" um empréstimo que nunca entrou.
 *
 * Idempotente: quem já foi estornado é pulado (o índice parcial uq_estorno_divida_unico
 * é a garantia dura).
 */
export async function estornarIngressoNaTx(
  tx: Tx,
  receitaArrecadadaId: string
): Promise<void> {
  const ingressos = await tx.movimentoDivida.findMany({
    where: { receitaArrecadadaId, tipo: "INGRESSO_OPERACAO_CREDITO" },
    select: {
      id: true,
      dividaId: true,
      valor: true,
      dataMovimento: true,
      estornos: { select: { id: true } },
    },
  });

  for (const i of ingressos) {
    if (i.estornos.length > 0) continue;
    await travarDivida(tx, i.dividaId);
    await tx.movimentoDivida.create({
      data: {
        dividaId: i.dividaId,
        tipo: "ESTORNO_INGRESSO_OPERACAO_CREDITO",
        valor: i.valor.toFixed(2),
        dataMovimento: i.dataMovimento,
        receitaArrecadadaId,
        estornoDeId: i.id,
        motivo: "Anulação da arrecadação que trouxe a operação de crédito.",
        criadoPor: "M04:anularArrecadacao",
      },
      select: { id: true },
    });
  }
}
