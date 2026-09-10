import { exigirFonteNoRolDaConta } from "./guard-fonte.js";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { somaLiquidaEstornaveis } from "../m08-restos-a-pagar/dominio.js";
import { travar } from "../../packages/locks/index.js";

/**
 * T07 — AS QUATRO ETAPAS DO PAGAMENTO, e as duas primeiras nascem aqui.
 *
 * ═══ O QUE O INCREMENTO PEDE ═══
 * *"Separar 'preparar/autorizar ordem', 'registrar pagamento administrativo', 'enviar ao
 * banco' e 'confirmação bancária'."*
 *
 *   1. PREPARAR / AUTORIZAR  → este arquivo.
 *   2. REGISTRAR o pagamento → `pagar()` (servico-bloco2), que passa a poder consumir
 *                              uma ordem autorizada.
 *   3. ENVIAR AO BANCO       → **não existe**. O M17 é só-leitura (extrato e saldo); a
 *                              escrita bancária é o M17-b, que não foi construído. A
 *                              porta declara indisponível com motivo — nunca devolve
 *                              sucesso local.
 *   4. CONFIRMAÇÃO BANCÁRIA  → o `VinculoConciliacao` do M09: o pagamento aparece no
 *                              extrato do banco e alguém o casa. Existe.
 *
 * ═══ ⚠️ POR QUE UMA ORDEM, SE `pagar()` JÁ FUNCIONAVA ═══
 * Porque quem apertava o botão era, no mesmo ato, quem decidia que aquele credor seria
 * pago naquele dia. É a segregação que falta na cadeia — a mesma que separa quem empenha
 * de quem liquida. Preparar e autorizar são ações DISTINTAS no censo do M16
 * (`PREPARAR_ORDEM_PAGAMENTO` e `AUTORIZAR_ORDEM_PAGAMENTO`), e é isso que permite um
 * ente dar a primeira ao setor e a segunda ao ordenador.
 *
 * ═══ ⚠️ A ORDEM NÃO TOCA O RAZÃO ═══
 * Ela é administrativa. Autorizar não é fato patrimonial: nada saiu, nada foi extinto,
 * nada mudou de dono. Um lançamento aqui contabilizaria uma INTENÇÃO — e o razão que
 * registra intenção deixa de ser razão. Quem reserva dotação é o empenho; quem reconhece
 * a obrigação é a liquidação.
 *
 * ═══ ⚠️ E ELA NÃO É "MAIS UM STATUS DO PAGAMENTO" ═══
 * Tentador: um enum no `Pagamento` com PREPARADO/AUTORIZADO/PAGO. Não serve por duas
 * razões. Primeiro, o `Pagamento` é append-only e o status ficaria congelado na criação
 * (a mesma lição que tirou o `status` do `Empenho`). Segundo, e mais importante: a ordem
 * existe ANTES do pagamento — uma ordem cancelada nunca vira pagamento nenhum, e não
 * haveria linha onde pendurar o status dela.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// ═══════════════════════════════════════════════════════════════════════════
// O DOMÍNIO PURO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ QUATRO ESTADOS, E NENHUM DELES É COLUNA.
 *
 * `PREPARADA` é a AUSÊNCIA de movimento — do mesmo jeito que não existe movimento
 * "nascer". `PAGA` não vem de movimento nenhum: vem de existir um `Pagamento` apontando
 * para a ordem. Guardar isso numa coluna exigiria `UPDATE` numa tabela append-only.
 */
export type EstadoDaOrdem = "PREPARADA" | "AUTORIZADA" | "CANCELADA" | "PAGA";

export interface MovimentoDaOrdem {
  readonly tipo: "AUTORIZACAO" | "CANCELAMENTO";
  readonly criadoEm: Date;
}

/**
 * O estado, DERIVADO. PURA.
 *
 * ⚠️ O ÚLTIMO MOVIMENTO MANDA, e a ordem é por `criadoEm`. Uma ordem autorizada e depois
 * cancelada está CANCELADA; uma cancelada e depois autorizada de novo está AUTORIZADA. É
 * append-only: nada é apagado, e a leitura é sempre a do fim da fila.
 *
 * ⚠️ `PAGA` VENCE TUDO. Uma ordem já consumida por um pagamento não volta a ser
 * cancelável — cancelar depois de o dinheiro sair não desfaz o desembolso, desfaz só o
 * papel. Quem desfaz o desembolso é a anulação do pagamento.
 */
export function estadoDaOrdem(
  movimentos: readonly MovimentoDaOrdem[],
  foiPaga: boolean
): EstadoDaOrdem {
  if (foiPaga) return "PAGA";
  if (movimentos.length === 0) return "PREPARADA";
  const ultimo = [...movimentos].sort(
    (a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()
  )[movimentos.length - 1]!;
  return ultimo.tipo === "AUTORIZACAO" ? "AUTORIZADA" : "CANCELADA";
}

export const zPrepararOrdemInput = z.object({
  liquidacaoId: z.string().min(1),
  numero: z.string().trim().min(1),
  valor: zMoney,
  dataPrevista: z.coerce.date(),
  contaBancaria: z.string().trim().min(1),
  fonteId: z.string().min(1),
  historico: z.string().trim().min(1),
  criadoPor: z.string().min(1),
});

export const zAutorizarOrdemInput = z.object({
  ordemId: z.string().min(1),
  motivo: z.string().trim().min(1).optional(),
  criadoPor: z.string().min(1),
});

/**
 * ⚠️ NO CANCELAMENTO O MOTIVO É OBRIGATÓRIO, e a assimetria é deliberada — a mesma do
 * travamento de competência. Autorizar é o curso normal; DESFAZER uma autorização é o
 * ato que o controle interno vai querer explicado, e o append-only guarda a explicação
 * com o nome de quem a deu.
 */
export const zCancelarOrdemInput = z.object({
  ordemId: z.string().min(1),
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});

export type PrepararOrdemInput = z.input<typeof zPrepararOrdemInput>;
export type AutorizarOrdemInput = z.input<typeof zAutorizarOrdemInput>;
export type CancelarOrdemInput = z.input<typeof zCancelarOrdemInput>;

// ═══════════════════════════════════════════════════════════════════════════
// OS CASOS DE USO
// ═══════════════════════════════════════════════════════════════════════════

/** O saldo ainda a pagar de uma liquidação, líquido de anulações. */
async function saldoAPagarDaLiquidacao(tx: Tx, liquidacaoId: string): Promise<Money> {
  const l = await tx.liquidacao.findUnique({
    where: { id: liquidacaoId },
    select: {
      valor: true,
      estornos: { select: { id: true } },
      anulacoesParciais: {
        select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
      },
    },
  });
  if (l === null) throw new Error(`Liquidação ${liquidacaoId} não encontrada.`);
  if (l.estornos.length > 0) {
    throw new Error(
      `Liquidação ${liquidacaoId} foi ANULADA — não há obrigação a pagar. Nada foi gravado.`
    );
  }

  // A mesma aritmética líquida do resto do repositório — nunca um SUM bruto.
  const liquidado = toMoney(l.valor.toFixed(2)).minus(
    somaLiquidaEstornaveis(
      l.anulacoesParciais.map((a) => ({
        id: a.id,
        valor: toMoney(a.valor.toFixed(2)),
        estornoDeId: a.estornoDeId,
        anulacaoParcialDeId: null,
      }))
    )
  );

  const pagamentos = await tx.pagamento.findMany({
    where: { liquidacaoId },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  const pago = somaLiquidaEstornaveis(
    pagamentos.map((p) => ({
      id: p.id,
      valor: toMoney(p.valor.toFixed(2)),
      estornoDeId: p.estornoDeId,
      anulacaoParcialDeId: p.anulacaoParcialDeId,
    }))
  );

  return liquidado.minus(pago);
}

/** Σ das ordens VIVAS (preparadas ou autorizadas, ainda não pagas) de uma liquidação. */
async function comprometidoPorOrdens(
  tx: Tx,
  liquidacaoId: string,
  ignorar?: string
): Promise<Money> {
  const ordens = await tx.ordemDePagamento.findMany({
    where: { liquidacaoId, ...(ignorar !== undefined ? { id: { not: ignorar } } : {}) },
    select: {
      id: true,
      valor: true,
      movimentos: { select: { tipo: true, criadoEm: true } },
      pagamentos: { select: { id: true } },
    },
  });

  let total = toMoney("0.00");
  for (const o of ordens) {
    const estado = estadoDaOrdem(o.movimentos, o.pagamentos.length > 0);
    // ⚠️ A ORDEM PAGA NÃO ENTRA AQUI. O pagamento dela já reduziu o saldo a pagar da
    // liquidação; contá-la de novo tiraria o mesmo dinheiro duas vezes.
    if (estado === "PREPARADA" || estado === "AUTORIZADA") total = total.plus(toMoney(o.valor.toFixed(2)));
  }
  return total;
}

/**
 * ETAPA 1a — PREPARAR a ordem. Não autoriza nada.
 *
 * ⚠️ O TETO É O SALDO A PAGAR **MENOS AS ORDENS VIVAS**, e o segundo termo é o que quase
 * se esquece. Sem ele, duas ordens de 1.000 sobre uma liquidação de 1.000 nasceriam as
 * duas — cada uma olhando o mesmo saldo — e a segunda só quebraria na hora de pagar,
 * depois de já ter sido autorizada por alguém. É a mesma corrida do saldo de dotação, num
 * grão novo; daí o trinco sobre a liquidação ANTES de somar.
 */
export async function prepararOrdemDePagamento(
  prisma: PrismaClient,
  input: PrepararOrdemInput
): Promise<{ readonly ordemId: string }> {
  const d = zPrepararOrdemInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.prepararOrdemDePagamento, {
      liquidacao: d.liquidacaoId,
    });

    // ⚠️ TRAVAR ANTES DE SOMAR. Somar e depois travar é somar um número velho.
    await travar(tx, "Liquidacao", [d.liquidacaoId]);

    const saldo = await saldoAPagarDaLiquidacao(tx, d.liquidacaoId);
    const comprometido = await comprometidoPorOrdens(tx, d.liquidacaoId);
    const disponivel = saldo.minus(comprometido);

    if (d.valor.greaterThan(disponivel)) {
      throw new Error(
        `Ordem de ${d.valor.toFixed(2)} excede o que resta da liquidação: saldo a pagar ` +
          `${saldo.toFixed(2)} menos ${comprometido.toFixed(2)} já comprometido em ordens ` +
          `vivas = ${disponivel.toFixed(2)}. Cancele uma ordem aberta ou reduza o valor. ` +
          `Nada foi gravado.`
      );
    }

    // TR 5.23 — a fonte da ordem tem de estar no ROL da conta bancária. O guard é aqui e
    // também no `pagar()`: a ordem que nasce com a fonte errada só quebraria no fim.
    //
    // ⚠️ "NO ROL", e não "igual à da conta": desde o ADR de 2026-09-10 a conta admite
    // várias fontes, e a comparação antiga recusaria o pagamento legítimo pela segunda
    // fonte de uma conta multifonte. A regra mora em `guard-fonte.ts`, uma vez.
    await exigirFonteNoRolDaConta(tx, { codigo: d.contaBancaria }, d.fonteId, "ordem de pagamento");

    const o = await tx.ordemDePagamento.create({
      data: {
        numero: d.numero,
        liquidacaoId: d.liquidacaoId,
        valor: d.valor.toFixed(2),
        dataPrevista: d.dataPrevista,
        contaBancaria: d.contaBancaria,
        fonteId: d.fonteId,
        historico: d.historico,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { ordemId: o.id };
  });
}

/** Lê a ordem com o que `estadoDaOrdem` precisa. */
async function ordemComEstado(tx: Tx, ordemId: string) {
  const o = await tx.ordemDePagamento.findUnique({
    where: { id: ordemId },
    select: {
      id: true,
      liquidacaoId: true,
      criadoPor: true,
      valor: true,
      movimentos: { select: { tipo: true, criadoEm: true } },
      pagamentos: { select: { id: true } },
    },
  });
  if (o === null) throw new Error(`Ordem de pagamento ${ordemId} não encontrada.`);
  return { ...o, estado: estadoDaOrdem(o.movimentos, o.pagamentos.length > 0) };
}

/**
 * ETAPA 1b — AUTORIZAR. Ação PRÓPRIA no censo, e é esse o ponto.
 *
 * ⚠️ QUEM PREPAROU NÃO AUTORIZA. A recusa é do domínio, não da tela: um ente pode dar as
 * duas permissões à mesma pessoa e ainda assim a mesma pessoa não fecha o ciclo sozinha
 * no mesmo documento. Segregação que depende de configuração é sugestão.
 */
export async function autorizarOrdemDePagamento(
  prisma: PrismaClient,
  input: AutorizarOrdemInput
): Promise<{ readonly movimentoId: string }> {
  const d = zAutorizarOrdemInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const o = await ordemComEstado(tx, d.ordemId);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.autorizarOrdemDePagamento, {
      liquidacao: o.liquidacaoId,
    });

    if (o.estado !== "PREPARADA") {
      throw new Error(
        `Ordem de pagamento em estado ${o.estado} — só se autoriza uma ordem PREPARADA. ` +
          `Nada foi gravado.`
      );
    }
    if (o.criadoPor === d.criadoPor) {
      throw new Error(
        `SEGREGAÇÃO DE FUNÇÕES: "${d.criadoPor}" preparou esta ordem e não pode autorizá-la. ` +
          `Preparar e autorizar são atos de pessoas diferentes — é o que separa quem pede o ` +
          `pagamento de quem o consente. Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDaOrdemDePagamento.create({
      data: {
        ordemId: d.ordemId,
        tipo: "AUTORIZACAO",
        motivo: d.motivo ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

/** ETAPA 1c — CANCELAR. Motivo obrigatório; uma ordem PAGA não se cancela. */
export async function cancelarOrdemDePagamento(
  prisma: PrismaClient,
  input: CancelarOrdemInput
): Promise<{ readonly movimentoId: string }> {
  const d = zCancelarOrdemInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const o = await ordemComEstado(tx, d.ordemId);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarOrdemDePagamento, {
      liquidacao: o.liquidacaoId,
    });

    if (o.estado === "PAGA") {
      throw new Error(
        `Ordem já PAGA — cancelar o papel não desfaz o desembolso. Quem desfaz o ` +
          `pagamento é a anulação dele. Nada foi gravado.`
      );
    }
    if (o.estado === "CANCELADA") {
      throw new Error(`Ordem de pagamento já cancelada. Nada foi gravado.`);
    }

    const m = await tx.movimentoDaOrdemDePagamento.create({
      data: {
        ordemId: d.ordemId,
        tipo: "CANCELAMENTO",
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

/**
 * O GUARD DA ETAPA 2 — chamado por `pagar()`, DENTRO da transação dele.
 *
 * ⚠️ NÃO É UM SERVIÇO. Ele não abre transação e não pede permissão própria: quem paga já
 * pediu a dele. Isto é o pedaço da regra da ordem que precisa acontecer no MESMO instante
 * da gravação do pagamento — entre conferir e gravar, outra transação poderia consumir a
 * mesma ordem.
 */
export async function exigirOrdemAutorizada(
  tx: Tx,
  p: {
    readonly ordemId: string;
    readonly liquidacaoId: string;
    readonly valor: Money;
  }
): Promise<void> {
  const o = await ordemComEstado(tx, p.ordemId);

  if (o.liquidacaoId !== p.liquidacaoId) {
    throw new Error(
      `A ordem de pagamento ${p.ordemId} é da liquidação ${o.liquidacaoId}, e o pagamento ` +
        `é da ${p.liquidacaoId}. Uma autorização não vale para outra obrigação. Nada foi gravado.`
    );
  }
  if (o.estado !== "AUTORIZADA") {
    throw new Error(
      `Ordem de pagamento em estado ${o.estado} — só se paga contra ordem AUTORIZADA. ` +
        `Nada foi gravado.`
    );
  }
  // ⚠️ VALOR EXATO, e não "até". Pagar menos do que foi autorizado deixaria o resto da
  // obrigação sem autorização nenhuma, e ninguém notaria: o saldo simplesmente ficaria
  // lá. Quem quiser pagar em partes prepara duas ordens.
  if (!toMoney(o.valor.toFixed(2)).equals(p.valor)) {
    throw new Error(
      `O pagamento é de ${p.valor.toFixed(2)} e a ordem autorizou ${o.valor.toFixed(2)}. ` +
        `O valor tem de ser exatamente o autorizado — pagar menos deixa o resto da ` +
        `obrigação sem autorização. Para pagar em partes, prepare uma ordem por parte. ` +
        `Nada foi gravado.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A LEITURA — as quatro etapas de cada ordem, num lugar só
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ A ETAPA 4 NÃO É DO M05 — e ela não vira coluna aqui.
 *
 * "O banco confirmou?" se responde no M09: existe um `VinculoConciliacao` VIVO ligando
 * este pagamento a uma linha do extrato. Copiar isso para um campo do `Pagamento` criaria
 * a segunda verdade sobre a mesma conciliação — e ela divergiria no primeiro estorno de
 * vínculo. A consulta pergunta ao dono do dado.
 */
export type ConfirmacaoBancaria = "CONFIRMADO" | "NAO_CONFIRMADO";

export interface OrdemNaLista {
  readonly id: string;
  readonly numero: string;
  readonly estado: EstadoDaOrdem;
  readonly valor: Money;
  readonly dataPrevista: Date;
  readonly contaBancaria: string;
  readonly fonteCodigo: string;
  readonly historico: string;
  readonly liquidacaoId: string;
  readonly liquidacaoNumero: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly unidadeCodigo: string;
  /** Etapa 1a. */
  readonly preparadaPor: string;
  readonly preparadaEm: Date;
  /** Etapa 1b. `null` enquanto ninguém autorizou. */
  readonly autorizadaPor: string | null;
  readonly autorizadaEm: Date | null;
  readonly canceladaPor: string | null;
  readonly motivoDoCancelamento: string | null;
  /** Etapa 2. `null` enquanto não houver pagamento. */
  readonly pagamentoId: string | null;
  readonly pagamentoNumero: string | null;
  readonly pagamentoEm: Date | null;
  /** Etapa 4. */
  readonly confirmacaoBancaria: ConfirmacaoBancaria;
}

export interface RecorteDeOrdens {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}

export async function listarOrdensDePagamento(
  prisma: Tx,
  p: RecorteDeOrdens
): Promise<readonly OrdemNaLista[]> {
  const ordens = await prisma.ordemDePagamento.findMany({
    where: {
      liquidacao: {
        empenho: {
          ficha: {
            exercicio: p.exercicio,
            ...(p.unidadeCodigo !== undefined
              ? { unidadeOrc: { codigo: p.unidadeCodigo } }
              : {}),
          },
        },
      },
    },
    orderBy: [{ dataPrevista: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true,
      numero: true,
      valor: true,
      dataPrevista: true,
      contaBancaria: true,
      historico: true,
      criadoEm: true,
      criadoPor: true,
      liquidacaoId: true,
      fonte: { select: { codigo: true } },
      movimentos: {
        orderBy: { criadoEm: "asc" },
        select: { tipo: true, motivo: true, criadoEm: true, criadoPor: true },
      },
      pagamentos: { select: { id: true, numero: true, data: true } },
      liquidacao: {
        select: {
          numero: true,
          empenho: {
            select: {
              numero: true,
              credorCpfCnpj: true,
              ficha: { select: { unidadeOrc: { select: { codigo: true } } } },
            },
          },
        },
      },
    },
  });

  // ⚠️ UMA CONSULTA SÓ para a confirmação de TODOS os pagamentos — não uma por linha.
  // A lista de ordens de um exercício pode ter centenas; N+1 aqui apareceria como uma
  // tela lenta que ninguém sabe explicar.
  const idsDePagamento = ordens.flatMap((o) => o.pagamentos.map((x) => x.id));
  const confirmados = new Set<string>();
  if (idsDePagamento.length > 0) {
    const vinculos = await prisma.vinculoConciliacao.findMany({
      where: { tipoInterno: "PAGAMENTO", internoId: { in: idsDePagamento } },
      select: { internoId: true, estornoDeId: true, estornos: { select: { id: true } } },
    });
    for (const v of vinculos) {
      // ⚠️ O VÍNCULO ESTORNADO NÃO CONFIRMA NADA, e o estorno DE um vínculo também não
      // é confirmação. Somar linhas sem olhar o sinal é a lição do M08 aparecendo aqui.
      if (v.estornoDeId === null && v.estornos.length === 0) confirmados.add(v.internoId);
    }
  }

  return ordens.map((o) => {
    const estado = estadoDaOrdem(o.movimentos, o.pagamentos.length > 0);
    const autorizacao = o.movimentos.filter((m) => m.tipo === "AUTORIZACAO").at(-1);
    const cancelamento = o.movimentos.filter((m) => m.tipo === "CANCELAMENTO").at(-1);
    const pagamento = o.pagamentos[0];

    return {
      id: o.id,
      numero: o.numero,
      estado,
      valor: toMoney(o.valor.toFixed(2)),
      dataPrevista: o.dataPrevista,
      contaBancaria: o.contaBancaria,
      fonteCodigo: o.fonte.codigo,
      historico: o.historico,
      liquidacaoId: o.liquidacaoId,
      liquidacaoNumero: o.liquidacao.numero,
      empenhoNumero: o.liquidacao.empenho.numero,
      credorCpfCnpj: o.liquidacao.empenho.credorCpfCnpj,
      unidadeCodigo: o.liquidacao.empenho.ficha.unidadeOrc.codigo,
      preparadaPor: o.criadoPor,
      preparadaEm: o.criadoEm,
      autorizadaPor: estado === "CANCELADA" ? null : autorizacao?.criadoPor ?? null,
      autorizadaEm: estado === "CANCELADA" ? null : autorizacao?.criadoEm ?? null,
      canceladaPor: estado === "CANCELADA" ? cancelamento?.criadoPor ?? null : null,
      motivoDoCancelamento: estado === "CANCELADA" ? cancelamento?.motivo ?? null : null,
      pagamentoId: pagamento?.id ?? null,
      pagamentoNumero: pagamento?.numero ?? null,
      pagamentoEm: pagamento?.data ?? null,
      confirmacaoBancaria:
        pagamento !== undefined && confirmados.has(pagamento.id)
          ? "CONFIRMADO"
          : "NAO_CONFIRMADO",
    };
  });
}

/** As liquidações que ainda comportam ordem — o vocabulário do formulário. */
export interface LiquidacaoParaOrdem {
  readonly id: string;
  readonly numero: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly disponivelParaOrdem: Money;
}

export async function liquidacoesParaOrdem(
  prisma: Tx,
  p: RecorteDeOrdens
): Promise<readonly LiquidacaoParaOrdem[]> {
  const liqs = await prisma.liquidacao.findMany({
    where: {
      estornoDeId: null,
      anulacaoParcialDeId: null,
      estornos: { none: {} },
      empenho: {
        ficha: {
          exercicio: p.exercicio,
          ...(p.unidadeCodigo !== undefined
            ? { unidadeOrc: { codigo: p.unidadeCodigo } }
            : {}),
        },
      },
    },
    orderBy: [{ data: "asc" }, { numero: "asc" }],
    select: {
      id: true,
      numero: true,
      empenho: {
        select: {
          numero: true,
          credorCpfCnpj: true,
          ficha: { select: { fonteId: true, fonte: { select: { codigo: true } } } },
        },
      },
    },
  });

  const saida: LiquidacaoParaOrdem[] = [];
  for (const l of liqs) {
    const saldo = await saldoAPagarDaLiquidacao(prisma, l.id);
    const comprometido = await comprometidoPorOrdens(prisma, l.id);
    const disponivel = saldo.minus(comprometido);
    // ⚠️ SÓ O QUE AINDA CABE. Oferecer uma liquidação já inteiramente comprometida faria
    // o operador preencher o formulário para receber a recusa no fim.
    if (disponivel.greaterThan(0)) {
      saida.push({
        id: l.id,
        numero: l.numero,
        empenhoNumero: l.empenho.numero,
        credorCpfCnpj: l.empenho.credorCpfCnpj,
        fonteId: l.empenho.ficha.fonteId,
        fonteCodigo: l.empenho.ficha.fonte.codigo,
        disponivelParaOrdem: disponivel,
      });
    }
  }
  return saida;
}
