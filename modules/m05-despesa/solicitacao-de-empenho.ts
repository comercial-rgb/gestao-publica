import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { normalizarDocumento } from "../../packages/documento/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { exigirExercicioDaFichaAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { zCategoriaOrdemCronologica, zTipoEmpenho, type TipoEmpenho } from "./dominio.js";

/**
 * V22 — A SOLICITAÇÃO DE EMPENHO (M05).
 *
 * ═══ O QUE O TERMO DE REFERÊNCIA PEDE ═══
 * "Possibilitar a solicitação de empenho, condicionando a efetivação do empenho à autorização;
 * a autorização deve ser concedida por usuário devidamente autorizado."
 *
 *   1. SOLICITAR   → `solicitarEmpenho` (ação SOLICITAR_EMPENHO, escopo = unidade da ficha).
 *   2. AUTORIZAR   → `autorizarSolicitacaoDeEmpenho` (AUTORIZAR_SOLICITACAO_DE_EMPENHO, mesmo
 *                    escopo), ou REJEITAR com motivo (`rejeitarSolicitacaoDeEmpenho`, mesma ação).
 *   3. EMITIR      → o `empenhar` de sempre, com `solicitacaoDeEmpenhoId`: o adapter chama
 *                    `exigirSolicitacaoParaEmpenho` DENTRO da transação do empenho.
 *   ·  CANCELAR    → `cancelarSolicitacaoDeEmpenho` (SOLICITAR_EMPENHO): o setor retira o pedido.
 *
 * ═══ ⚠️ QUEM SOLICITA NÃO DECIDE A PRÓPRIA SOLICITAÇÃO ═══
 * A recusa é do caso de uso, e não da tela nem da configuração: um ente pode dar as duas ações à
 * mesma pessoa, e ainda assim ela não fecha o ciclo sozinha no mesmo documento. É a regra da
 * ordem de pagamento (T07), um passo antes na cadeia. Segregação que depende de configuração é
 * sugestão.
 *
 * ═══ ⚠️ ADMINISTRATIVA: NÃO TOCA O RAZÃO E NÃO RESERVA DOTAÇÃO ═══
 * Quem compromete o crédito é o empenho, e o saldo é conferido na transação dele, contra o SUM
 * real. Uma solicitação que retivesse saldo seria uma reserva de dotação com outro nome.
 *
 * ═══ ⚠️ A SOLICITAÇÃO É OPCIONAL NO EMPENHO — e isso é decisão declarada ═══
 * Torná-la obrigatória quebraria o empenho da folha, dos encargos e da ordem de compra, e
 * obrigaria a inventar autorização retroativa para tudo o que já existe. O ente que quiser exigi-la
 * concede EMPENHAR só a quem emite a partir de solicitação — a exigência por parâmetro do ente é
 * pendência nomeada (ver MODULO.md).
 *
 * ═══ ⚠️ ANULAR O EMPENHO NÃO DEVOLVE A SOLICITAÇÃO ═══
 * A autorização foi para UM ato, e ele aconteceu. A solicitação cujo empenho foi anulado continua
 * EMPENHADA (a tela diz "empenho anulado"); a nova necessidade pede nova solicitação e nova
 * autorização. Reaproveitar a autorização de um ato desfeito seria consentimento usado duas vezes —
 * e a unicidade de `Empenho.solicitacaoDeEmpenhoId` (a anulação não copia a coluna) é a trava dura.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

// ═══════════════════════════════════════════════════════════════════════════
// O DOMÍNIO PURO
// ═══════════════════════════════════════════════════════════════════════════

export type SituacaoDaSolicitacao = "PENDENTE" | "AUTORIZADA" | "REJEITADA" | "CANCELADA" | "EMPENHADA";

export interface MovimentoDaSolicitacao {
  readonly tipo: "AUTORIZADA" | "REJEITADA" | "CANCELADA";
  readonly criadoEm: Date;
}

/**
 * A situação, DERIVADA. PURA.
 *
 * ⚠️ O EMPENHO EMITIDO VENCE TUDO — como o pagamento vence a ordem. Depois de emitido, o que vale é
 * o empenho; desfazê-lo é a anulação dele, não um movimento da solicitação.
 *
 * ⚠️ E O ÚLTIMO MOVIMENTO MANDA, pela ordem de `criadoEm`. Sem movimento: PENDENTE.
 */
export function situacaoDaSolicitacao(
  movimentos: readonly MovimentoDaSolicitacao[],
  temEmpenho: boolean
): SituacaoDaSolicitacao {
  if (temEmpenho) return "EMPENHADA";
  if (movimentos.length === 0) return "PENDENTE";
  const ultimo = [...movimentos].sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())[movimentos.length - 1]!;
  return ultimo.tipo;
}

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), { message: "Valor deve ser > 0" });
const zIdOpcional = z.string().trim().min(1).optional();

export const zSolicitarEmpenhoInput = z
  .object({
    fichaId: z.string().min(1),
    numero: z.string().trim().min(1),
    credorCpfCnpj: z.string().transform(normalizarDocumento).pipe(z.string().min(11, "CPF/CNPJ inválido")),
    valor: zValorPositivo,
    tipo: zTipoEmpenho,
    categoriaOrdemCronologica: zCategoriaOrdemCronologica.optional(),
    historico: z.string().trim().min(1),
    contratoId: zIdOpcional,
    ordemDeCompraId: zIdOpcional,
    convenioId: zIdOpcional,
    obraId: zIdOpcional,
    dividaId: zIdOpcional,
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    // A MESMA regra do `zEmpenharInput`: sem contrato não há de quem herdar a categoria.
    if (v.contratoId === undefined && v.categoriaOrdemCronologica === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["categoriaOrdemCronologica"],
        message:
          "Solicitação SEM contrato precisa da categoria da ordem cronológica (art. 141): o " +
          "empenho emitido dela a exigirá, e não há de quem herdá-la.",
      });
    }
  });

export const zAutorizarSolicitacaoInput = z.object({
  solicitacaoId: z.string().min(1),
  motivo: z.string().trim().min(1).optional(),
  criadoPor: z.string().min(1),
});

/** Rejeitar e cancelar exigem motivo: é o ato que o controle interno vai querer explicado. */
export const zDecisaoComMotivoInput = z.object({
  solicitacaoId: z.string().min(1),
  motivo: z.string().trim().min(10, "Informe o motivo (mínimo de 10 caracteres)."),
  criadoPor: z.string().min(1),
});

export type SolicitarEmpenhoInput = z.input<typeof zSolicitarEmpenhoInput>;
export type AutorizarSolicitacaoInput = z.input<typeof zAutorizarSolicitacaoInput>;
export type DecisaoComMotivoInput = z.input<typeof zDecisaoComMotivoInput>;

const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoDaSolicitacao, string>> = {
  PENDENTE: "aguardando autorização",
  AUTORIZADA: "autorizada",
  REJEITADA: "rejeitada",
  CANCELADA: "cancelada",
  EMPENHADA: "já empenhada",
};

// ═══════════════════════════════════════════════════════════════════════════
// OS CASOS DE USO
// ═══════════════════════════════════════════════════════════════════════════

/** Os vínculos informados existem? Recusa nomeando — nunca um erro de chave estrangeira cru. */
async function exigirVinculosExistentes(
  tx: Tx,
  v: {
    readonly contratoId?: string | undefined;
    readonly ordemDeCompraId?: string | undefined;
    readonly convenioId?: string | undefined;
    readonly obraId?: string | undefined;
    readonly dividaId?: string | undefined;
  }
): Promise<void> {
  const faltas: string[] = [];
  if (v.contratoId !== undefined && (await tx.contrato.findUnique({ where: { id: v.contratoId }, select: { id: true } })) === null) faltas.push(`contrato ${v.contratoId}`);
  if (v.ordemDeCompraId !== undefined && (await tx.ordemDeCompra.findUnique({ where: { id: v.ordemDeCompraId }, select: { id: true } })) === null) faltas.push(`ordem de compra ${v.ordemDeCompraId}`);
  if (v.convenioId !== undefined && (await tx.convenio.findUnique({ where: { id: v.convenioId }, select: { id: true } })) === null) faltas.push(`convênio ${v.convenioId}`);
  if (v.obraId !== undefined && (await tx.obra.findUnique({ where: { id: v.obraId }, select: { id: true } })) === null) faltas.push(`obra ${v.obraId}`);
  if (v.dividaId !== undefined && (await tx.dividaConsolidada.findUnique({ where: { id: v.dividaId }, select: { id: true } })) === null) faltas.push(`dívida ${v.dividaId}`);
  if (faltas.length > 0) {
    throw new Error(`Vínculo inexistente na solicitação: ${faltas.join(", ")}. Nada foi gravado.`);
  }
}

/**
 * SOLICITAR — o setor pede a despesa. Não compromete saldo.
 *
 * ⚠️ O EXERCÍCIO DA FICHA TEM DE ESTAR ABERTO: pedir despesa num exercício encerrado é pedir o que
 * nenhum empenho poderá atender.
 */
export async function solicitarEmpenho(
  prisma: PrismaClient,
  input: SolicitarEmpenhoInput
): Promise<{ readonly solicitacaoId: string }> {
  const d = zSolicitarEmpenhoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.solicitarEmpenho, { ficha: d.fichaId });

    await exigirExercicioDaFichaAberto(tx, d.fichaId, "solicitação de empenho");
    await exigirVinculosExistentes(tx, d);

    const ja = await tx.solicitacaoDeEmpenho.findUnique({
      where: { fichaId_numero: { fichaId: d.fichaId, numero: d.numero } },
      select: { id: true },
    });
    if (ja !== null) {
      throw new Error(`Já existe a solicitação ${d.numero} nesta ficha. Use outro número. Nada foi gravado.`);
    }

    const s = await tx.solicitacaoDeEmpenho.create({
      data: {
        numero: d.numero,
        fichaId: d.fichaId,
        credorCpfCnpj: d.credorCpfCnpj,
        valor: d.valor.toFixed(2),
        tipo: d.tipo,
        categoriaOrdemCronologica: d.categoriaOrdemCronologica ?? null,
        historico: d.historico,
        contratoId: d.contratoId ?? null,
        ordemDeCompraId: d.ordemDeCompraId ?? null,
        convenioId: d.convenioId ?? null,
        obraId: d.obraId ?? null,
        dividaId: d.dividaId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { solicitacaoId: s.id };
  });
}

/** Lê a solicitação com o que a situação precisa. SEM trava: quem decide trava antes. */
async function solicitacaoComSituacao(tx: Tx, solicitacaoId: string) {
  const s = await tx.solicitacaoDeEmpenho.findUnique({
    where: { id: solicitacaoId },
    select: {
      id: true,
      numero: true,
      fichaId: true,
      credorCpfCnpj: true,
      valor: true,
      tipo: true,
      contratoId: true,
      ordemDeCompraId: true,
      convenioId: true,
      obraId: true,
      dividaId: true,
      criadoPor: true,
      movimentos: { select: { tipo: true, criadoEm: true } },
      empenho: { select: { id: true, numero: true } },
    },
  });
  if (s === null) throw new Error(`Solicitação de empenho ${solicitacaoId} não encontrada. Nada foi gravado.`);
  return { ...s, situacao: situacaoDaSolicitacao(s.movimentos, s.empenho !== null) };
}

/** A unidade da ficha da solicitação — o escopo dos atos sobre ela. */
async function fichaDaSolicitacao(tx: Tx, solicitacaoId: string): Promise<string> {
  const s = await tx.solicitacaoDeEmpenho.findUnique({ where: { id: solicitacaoId }, select: { fichaId: true } });
  if (s === null) throw new Error(`Solicitação de empenho ${solicitacaoId} não encontrada. Nada foi gravado.`);
  return s.fichaId;
}

/** A regra da segregação, uma vez: quem solicitou não decide a própria solicitação. */
function exigirSegregacao(solicitante: string, decisor: string, ato: "autorizar" | "rejeitar"): void {
  if (solicitante === decisor) {
    throw new Error(
      `SEGREGAÇÃO DE FUNÇÕES: "${decisor}" solicitou este empenho e não pode ${ato} a própria ` +
        `solicitação. Solicitar e autorizar são atos de pessoas diferentes — quem pede a despesa ` +
        `não é quem consente com ela.` +
        (ato === "rejeitar" ? ` Para retirar o pedido, cancele a solicitação.` : "") +
        ` Nada foi gravado.`
    );
  }
}

/**
 * AUTORIZAR — o consentimento. Ação PRÓPRIA no censo, escopada pela unidade da ficha.
 *
 * ⚠️ TRAVA ANTES DE DERIVAR A SITUAÇÃO: autorizar e cancelar concorrentes leriam "pendente" os dois.
 */
export async function autorizarSolicitacaoDeEmpenho(
  prisma: PrismaClient,
  input: AutorizarSolicitacaoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zAutorizarSolicitacaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const fichaId = await fichaDaSolicitacao(tx, d.solicitacaoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.autorizarSolicitacaoDeEmpenho, { ficha: fichaId });

    await travar(tx, "SolicitacaoDeEmpenho", [d.solicitacaoId]);
    const s = await solicitacaoComSituacao(tx, d.solicitacaoId);

    exigirSegregacao(s.criadoPor, d.criadoPor, "autorizar");
    if (s.situacao !== "PENDENTE") {
      throw new Error(
        `A solicitação ${s.numero} está ${ROTULO_DA_SITUACAO[s.situacao]} — só se autoriza uma ` +
          `solicitação aguardando autorização. Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDaSolicitacaoDeEmpenho.create({
      data: { solicitacaoId: s.id, tipo: "AUTORIZADA", motivo: d.motivo ?? null, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

/** REJEITAR — a mesma autoridade de autorizar, com motivo obrigatório. É final. */
export async function rejeitarSolicitacaoDeEmpenho(
  prisma: PrismaClient,
  input: DecisaoComMotivoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zDecisaoComMotivoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const fichaId = await fichaDaSolicitacao(tx, d.solicitacaoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.rejeitarSolicitacaoDeEmpenho, { ficha: fichaId });

    await travar(tx, "SolicitacaoDeEmpenho", [d.solicitacaoId]);
    const s = await solicitacaoComSituacao(tx, d.solicitacaoId);

    exigirSegregacao(s.criadoPor, d.criadoPor, "rejeitar");
    if (s.situacao !== "PENDENTE") {
      throw new Error(
        `A solicitação ${s.numero} está ${ROTULO_DA_SITUACAO[s.situacao]} — só se rejeita uma ` +
          `solicitação aguardando autorização. Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDaSolicitacaoDeEmpenho.create({
      data: { solicitacaoId: s.id, tipo: "REJEITADA", motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

/**
 * CANCELAR — o setor retira o pedido (pendente ou autorizado, nunca empenhado). Motivo obrigatório.
 *
 * ⚠️ EMPENHADA NÃO SE CANCELA: desfazer o empenho é a anulação dele, e cancelar o papel não devolve
 * o crédito comprometido.
 */
export async function cancelarSolicitacaoDeEmpenho(
  prisma: PrismaClient,
  input: DecisaoComMotivoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zDecisaoComMotivoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const fichaId = await fichaDaSolicitacao(tx, d.solicitacaoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarSolicitacaoDeEmpenho, { ficha: fichaId });

    await travar(tx, "SolicitacaoDeEmpenho", [d.solicitacaoId]);
    const s = await solicitacaoComSituacao(tx, d.solicitacaoId);

    if (s.situacao === "EMPENHADA") {
      throw new Error(
        `A solicitação ${s.numero} já foi empenhada (empenho ${s.empenho?.numero ?? ""}). Cancelar o ` +
          `pedido não desfaz o empenho — quem o desfaz é a anulação do empenho. Nada foi gravado.`
      );
    }
    if (s.situacao === "REJEITADA" || s.situacao === "CANCELADA") {
      throw new Error(`A solicitação ${s.numero} já está ${ROTULO_DA_SITUACAO[s.situacao]}. Nada foi gravado.`);
    }

    const m = await tx.movimentoDaSolicitacaoDeEmpenho.create({
      data: { solicitacaoId: s.id, tipo: "CANCELADA", motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

/** O que o empenho vai gravar, para conferir contra o que foi autorizado. */
export interface EmpenhoContraASolicitacao {
  readonly solicitacaoDeEmpenhoId: string;
  readonly fichaId: string;
  readonly credorCpfCnpj: string;
  readonly valor: Money;
  readonly tipo: TipoEmpenho;
  readonly contratoId?: string | undefined;
  readonly ordemDeCompraId?: string | undefined;
  readonly convenioId?: string | undefined;
  readonly obraId?: string | undefined;
  readonly dividaId?: string | undefined;
}

/**
 * O GUARD DA EMISSÃO — chamado pelo adapter DENTRO da transação do `empenhar`.
 *
 * ⚠️ NÃO É UM SERVIÇO: não abre transação e não pede permissão própria (quem empenha já pediu
 * EMPENHAR). É o pedaço da regra que tem de acontecer no MESMO instante da gravação — entre
 * conferir e gravar, outra transação poderia cancelar ou empenhar a mesma solicitação.
 *
 * ⚠️ O EMPENHO É O QUE FOI AUTORIZADO: mesma ficha, mesmo credor, mesmo tipo, os mesmos vínculos, e
 * valor ATÉ o solicitado. Menos é permitido (a negociação reduziu); mais seria despesa que ninguém
 * autorizou. A solicitação é consumida por inteiro na emissão — a sobra não fica autorizada.
 */
export async function exigirSolicitacaoParaEmpenho(tx: Tx, p: EmpenhoContraASolicitacao): Promise<void> {
  await travar(tx, "SolicitacaoDeEmpenho", [p.solicitacaoDeEmpenhoId]);
  const s = await solicitacaoComSituacao(tx, p.solicitacaoDeEmpenhoId);

  if (s.situacao === "EMPENHADA") {
    throw new Error(
      `A solicitação ${s.numero} já foi empenhada (empenho ${s.empenho?.numero ?? ""}). Uma ` +
        `autorização vale para UM empenho. Nada foi gravado.`
    );
  }
  if (s.situacao !== "AUTORIZADA") {
    throw new Error(
      `A solicitação ${s.numero} está ${ROTULO_DA_SITUACAO[s.situacao]} — o empenho só pode ser ` +
        `emitido a partir de solicitação AUTORIZADA. Nada foi gravado.`
    );
  }

  const divergencias: string[] = [];
  if (s.fichaId !== p.fichaId) divergencias.push("a ficha");
  if (s.credorCpfCnpj !== p.credorCpfCnpj) divergencias.push("o credor");
  if (s.tipo !== p.tipo) divergencias.push("o tipo do empenho");
  const vinculos: readonly [string, string | null, string | undefined][] = [
    ["o contrato", s.contratoId, p.contratoId],
    ["a ordem de compra", s.ordemDeCompraId, p.ordemDeCompraId],
    ["o convênio", s.convenioId, p.convenioId],
    ["a obra", s.obraId, p.obraId],
    ["a dívida", s.dividaId, p.dividaId],
  ];
  for (const [nome, autorizado, informado] of vinculos) {
    if ((autorizado ?? undefined) !== informado) divergencias.push(nome);
  }
  if (divergencias.length > 0) {
    throw new Error(
      `O empenho diverge da solicitação ${s.numero} autorizada em: ${divergencias.join(", ")}. O ` +
        `empenho emitido de uma solicitação é o que foi autorizado. Nada foi gravado.`
    );
  }

  const autorizado = toMoney(s.valor.toFixed(2));
  if (p.valor.greaterThan(autorizado)) {
    throw new Error(
      `O empenho (${p.valor.toFixed(2)}) excede o valor autorizado na solicitação ${s.numero} ` +
        `(${autorizado.toFixed(2)}). Nada foi gravado.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A LEITURA
// ═══════════════════════════════════════════════════════════════════════════

export interface SolicitacaoNaLista {
  readonly id: string;
  readonly numero: string;
  readonly situacao: SituacaoDaSolicitacao;
  readonly fichaId: string;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly credorCpfCnpj: string;
  readonly valor: Money;
  readonly tipo: TipoEmpenho;
  readonly categoriaOrdemCronologica: string | null;
  readonly historico: string;
  readonly contrato: { readonly id: string; readonly numero: string } | null;
  readonly ordemDeCompra: { readonly id: string; readonly numero: string } | null;
  readonly convenio: { readonly id: string; readonly identificador: string } | null;
  readonly obra: { readonly id: string; readonly identificador: string } | null;
  readonly divida: { readonly id: string; readonly identificador: string } | null;
  readonly solicitadaPor: string;
  readonly solicitadaEm: Date;
  /** O último movimento de decisão (autorização, rejeição ou cancelamento), quando houver. */
  readonly decididaPor: string | null;
  readonly decididaEm: Date | null;
  readonly motivo: string | null;
  readonly empenhoId: string | null;
  readonly empenhoNumero: string | null;
  /** O empenho emitido foi anulado por inteiro depois — a solicitação NÃO volta (ver cabeçalho). */
  readonly empenhoAnulado: boolean;
}

export async function listarSolicitacoesDeEmpenho(
  prisma: Tx,
  p: { readonly exercicio: number; readonly unidadeCodigo?: string | undefined }
): Promise<readonly SolicitacaoNaLista[]> {
  const linhas = await prisma.solicitacaoDeEmpenho.findMany({
    where: {
      ficha: {
        exercicio: p.exercicio,
        ...(p.unidadeCodigo !== undefined ? { unidadeOrc: { codigo: p.unidadeCodigo } } : {}),
      },
    },
    orderBy: [{ criadoEm: "desc" }],
    select: {
      id: true,
      numero: true,
      fichaId: true,
      credorCpfCnpj: true,
      valor: true,
      tipo: true,
      categoriaOrdemCronologica: true,
      historico: true,
      criadoEm: true,
      criadoPor: true,
      ficha: {
        select: {
          numero: true,
          unidadeOrc: { select: { codigo: true } },
          fonte: { select: { codigo: true } },
          naturezaDespesa: { select: { codigoCompleto: true } },
        },
      },
      contrato: { select: { id: true, numeroContrato: true } },
      ordemDeCompra: { select: { id: true, numero: true } },
      convenio: { select: { id: true, identificador: true } },
      obra: { select: { id: true, identificador: true } },
      divida: { select: { id: true, identificador: true } },
      movimentos: { orderBy: { criadoEm: "asc" }, select: { tipo: true, motivo: true, criadoEm: true, criadoPor: true } },
      empenho: { select: { id: true, numero: true, estornos: { select: { id: true } } } },
    },
  });

  return linhas.map((s) => {
    const ultimo = s.movimentos.at(-1);
    return {
      id: s.id,
      numero: s.numero,
      situacao: situacaoDaSolicitacao(s.movimentos, s.empenho !== null),
      fichaId: s.fichaId,
      fichaNumero: s.ficha.numero,
      unidadeCodigo: s.ficha.unidadeOrc.codigo,
      fonteCodigo: s.ficha.fonte.codigo,
      naturezaCodigo: s.ficha.naturezaDespesa.codigoCompleto,
      credorCpfCnpj: s.credorCpfCnpj,
      valor: toMoney(s.valor.toFixed(2)),
      tipo: s.tipo,
      categoriaOrdemCronologica: s.categoriaOrdemCronologica,
      historico: s.historico,
      contrato: s.contrato === null ? null : { id: s.contrato.id, numero: s.contrato.numeroContrato },
      ordemDeCompra: s.ordemDeCompra,
      convenio: s.convenio,
      obra: s.obra,
      divida: s.divida,
      solicitadaPor: s.criadoPor,
      solicitadaEm: s.criadoEm,
      decididaPor: ultimo?.criadoPor ?? null,
      decididaEm: ultimo?.criadoEm ?? null,
      motivo: ultimo?.motivo ?? null,
      empenhoId: s.empenho?.id ?? null,
      empenhoNumero: s.empenho?.numero ?? null,
      empenhoAnulado: (s.empenho?.estornos.length ?? 0) > 0,
    };
  });
}
