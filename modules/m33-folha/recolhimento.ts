import { z } from "zod";
import { Decimal, sumMoney, toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { gravarAnexoNaTransacao } from "../m22-documentos/anexos.js";

/**
 * ═══ M33 — A GUIA DE RECOLHIMENTO DOS ENCARGOS: documento do EMISSOR, registrado e baixado (V7 M1 U3.2) ═══
 *
 * Quatro objetos, e nenhum se passa pelo outro:
 *   · APURAÇÃO   — o que o ente deve, calculado (`encargos-servico.ts`);
 *   · OBRIGAÇÃO  — a despesa liquidada dos encargos, por grupo (derivada do M05);
 *   · GUIA       — o documento que o arrecadador/destinatário emite, com o arquivo DELE anexado;
 *   · PAGAMENTO  — ato do M05/M09 que já aconteceu (ou não).
 *
 * ⚠️ O SISTEMA NÃO GERA GUIA. Não há código de barras, linha digitável, PIX ou autenticação produzidos
 * aqui. Se o convênio/leiaute oficial não existe, o que a tela oferece é o DEMONSTRATIVO INTERNO, dito
 * como tal, sem nada pagável. "Anexada" não é "validada pelo emissor".
 * ⚠️ VENCIMENTO SÓ COM FUNDAMENTO — sem regra informada, ele fica nulo e a tela diz "não informado".
 * ⚠️ RECEBER A GUIA NÃO PAGA NADA. A baixa liga a guia a um PAGAMENTO do M05 da liquidação dos encargos
 * do mesmo grupo e da mesma folha; transporte externo (retorno bancário) não existe e fica pendente.
 */

const zComponente = z.object({ rotulo: z.string().trim().min(2), valor: zMoney.refine((v) => v.gte(0), "componente não pode ser negativo") });

export const zRegistrarGuiaInput = z
  .object({
    folhaId: z.string().min(1),
    grupoId: z.string().min(1),
    destinatarioId: z.string().min(1),
    natureza: z.string().trim().min(5),
    identificador: z.string().trim().min(3).max(120),
    vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fundamentoDoVencimento: z.string().trim().min(5).optional(),
    principal: zMoney.refine((v) => v.gt(0), "o principal é positivo"),
    componentes: z.array(zComponente).max(10).default([]),
    total: zMoney,
    arquivo: z.object({ nomeOriginal: z.string().trim().min(1).max(255), mimeType: z.string().min(1), conteudo: z.instanceof(Uint8Array) }),
    criadoPor: z.string().min(1),
  })
  .refine((d) => (d.vencimento === undefined) === (d.fundamentoDoVencimento === undefined), { message: "vencimento e fundamento do vencimento vêm juntos — sem regra informada, o vencimento fica \"não informado\"" });
export type RegistrarGuiaInput = z.input<typeof zRegistrarGuiaInput>;

export async function registrarGuiaDeRecolhimento(prisma: PrismaClient, input: RegistrarGuiaInput): Promise<{ readonly guiaId: string; readonly anexoId: string }> {
  const d = zRegistrarGuiaInput.parse(input);
  const soma = toMoney(d.principal.plus(sumMoney(d.componentes.map((c) => c.valor))));
  if (!soma.eq(d.total)) {
    throw new Error(`GUIA-TOTAL-DIVERGENTE: principal ${d.principal.toFixed(2)} + componentes ${sumMoney(d.componentes.map((c) => c.valor)).toFixed(2)} = ${soma.toFixed(2)}, e o total informado é ${d.total.toFixed(2)}. Confira a guia do emissor. Nada foi gravado.`);
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarGuiaDeRecolhimento, "ENTE");
      const folha = await tx.folhaDePagamento.findUnique({ where: { id: d.folhaId }, select: { competencia: true, fechamento: { select: { id: true } } } });
      if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
      if (folha.fechamento === null) throw new Error(`FOLHA-NAO-FECHADA: a folha de ${folha.competencia} não está fechada; não há obrigação de encargos a recolher. Nada foi gravado.`);
      const grupo = await tx.grupoDeEmpenhoDaFolha.findUnique({ where: { id: d.grupoId }, select: { codigo: true, credorId: true, componentes: { select: { id: true }, take: 1 } } });
      if (grupo === null || grupo.componentes.length === 0) throw new Error(`GRUPO-NAO-E-DE-ENCARGOS: ${d.grupoId} não é um grupo de encargos do empregador. Nada foi gravado.`);
      if (grupo.credorId !== d.destinatarioId) throw new Error(`GUIA-DE-OUTRO-DESTINATARIO: o grupo ${grupo.codigo} recolhe a um destinatário e a guia informa outro. Confira o emissor. Nada foi gravado.`);
      const obrigacao = await tx.liquidacaoDosEncargos.findFirst({ where: { empenhoDosEncargos: { grupoId: d.grupoId, apuracao: { folhaId: d.folhaId } } }, select: { id: true } });
      if (obrigacao === null) throw new Error(`SEM-OBRIGACAO-LIQUIDADA: os encargos do grupo ${grupo.codigo} em ${folha.competencia} não foram liquidados; a guia recolhe uma obrigação reconhecida. Liquide antes. Nada foi gravado.`);
      const g = await tx.guiaDeRecolhimento.create({
        data: {
          folhaId: d.folhaId, grupoId: d.grupoId, destinatarioId: d.destinatarioId, natureza: d.natureza, identificador: d.identificador,
          vencimento: d.vencimento === undefined ? null : meioDiaCivil(d.vencimento), fundamentoDoVencimento: d.fundamentoDoVencimento ?? null,
          principal: d.principal.toFixed(2), componentes: d.componentes.map((c) => ({ rotulo: c.rotulo, valor: c.valor.toFixed(2) })), total: d.total.toFixed(2), criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      const { anexoId } = await gravarAnexoNaTransacao(tx, { ...d.arquivo, origem: "UPLOAD", guiaDeRecolhimentoId: g.id, criadoPor: d.criadoPor });
      return { guiaId: g.id, anexoId };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error(`GUIA-DUPLICADA: a guia ${d.identificador} deste destinatário já está registrada. Nada foi gravado.`);
    throw e;
  }
}

export const zBaixarGuiaInput = z.object({ guiaId: z.string().min(1), pagamentoId: z.string().min(1), observacao: z.string().trim().min(5), criadoPor: z.string().min(1) });
export type BaixarGuiaInput = z.input<typeof zBaixarGuiaInput>;

/** BAIXA a guia por um PAGAMENTO do M05 que já existe, da liquidação dos encargos do mesmo grupo e folha. */
export async function baixarGuiaDeRecolhimento(prisma: PrismaClient, input: BaixarGuiaInput): Promise<{ readonly baixaId: string; readonly divergencia: Money }> {
  const d = zBaixarGuiaInput.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.baixarGuiaDeRecolhimento, "ENTE");
      const guia = await tx.guiaDeRecolhimento.findUnique({ where: { id: d.guiaId }, select: { folhaId: true, grupoId: true, identificador: true, total: true, baixa: { select: { id: true } }, cancelamento: { select: { id: true } } } });
      if (guia === null) throw new Error(`Guia ${d.guiaId} não existe. Nada foi gravado.`);
      if (guia.cancelamento !== null) throw new Error(`GUIA-CANCELADA: a guia ${guia.identificador} foi cancelada e não se baixa. Nada foi gravado.`);
      if (guia.baixa !== null) throw new Error(`GUIA-JA-BAIXADA: a guia ${guia.identificador} já tem baixa. Nada foi gravado.`);
      const pg = await tx.pagamento.findUnique({ where: { id: d.pagamentoId }, select: { valor: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true } }, liquidacao: { select: { liquidacaoDosEncargos: { select: { empenhoDosEncargos: { select: { grupoId: true, apuracao: { select: { folhaId: true } } } } } } } } } });
      const elo = pg?.liquidacao.liquidacaoDosEncargos?.empenhoDosEncargos;
      if (pg === null || elo === undefined || elo.grupoId !== guia.grupoId || elo.apuracao.folhaId !== guia.folhaId) {
        throw new Error(`PAGAMENTO-DE-OUTRA-OBRIGACAO: o pagamento informado não é da liquidação dos encargos deste grupo nesta folha. Nada foi gravado.`);
      }
      if (pg.estornoDeId !== null || pg.anulacaoParcialDeId !== null || pg.estornos.length > 0) throw new Error("PAGAMENTO-ANULADO: o pagamento informado é uma anulação ou foi estornado. Nada foi gravado.");
      const b = await tx.baixaDaGuia.create({ data: { guiaId: d.guiaId, pagamentoId: d.pagamentoId, observacao: d.observacao, criadoPor: d.criadoPor }, select: { id: true } });
      return { baixaId: b.id, divergencia: toMoney(new Decimal(guia.total).minus(pg.valor)) };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("BAIXA-DUPLICADA: esta guia já foi baixada, ou este pagamento já baixou outra guia. Nada foi gravado.");
    throw e;
  }
}

export const zCancelarGuiaInput = z.object({ guiaId: z.string().min(1), motivo: z.string().trim().min(10), criadoPor: z.string().min(1) });
export type CancelarGuiaInput = z.input<typeof zCancelarGuiaInput>;

export async function cancelarGuiaDeRecolhimento(prisma: PrismaClient, input: CancelarGuiaInput): Promise<{ readonly cancelamentoId: string }> {
  const d = zCancelarGuiaInput.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarGuiaDeRecolhimento, "ENTE");
      const guia = await tx.guiaDeRecolhimento.findUnique({ where: { id: d.guiaId }, select: { identificador: true, baixa: { select: { id: true } } } });
      if (guia === null) throw new Error(`Guia ${d.guiaId} não existe. Nada foi gravado.`);
      if (guia.baixa !== null) throw new Error(`GUIA-BAIXADA-NAO-CANCELA: a guia ${guia.identificador} já foi baixada por um pagamento; corrigir exige o ato sobre o pagamento. Nada foi gravado.`);
      return { cancelamentoId: (await tx.cancelamentoDaGuia.create({ data: { guiaId: d.guiaId, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } })).id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("GUIA-JA-CANCELADA: esta guia já foi cancelada. Nada foi gravado.");
    throw e;
  }
}

export type SituacaoDaGuia = "RECEBIDA" | "BAIXADA" | "CANCELADA";

export interface ObrigacaoDoGrupo {
  readonly grupoId: string;
  readonly grupo: string;
  readonly destinatario: string;
  readonly naturezas: readonly string[];
  readonly liquidado: string;
  readonly pago: string;
  readonly restituicaoAProvidenciar: string;
  readonly guias: readonly { readonly id: string; readonly identificador: string; readonly natureza: string; readonly vencimento: string | null; readonly fundamentoDoVencimento: string | null; readonly principal: string; readonly componentes: readonly { readonly rotulo: string; readonly valor: string }[]; readonly total: string; readonly situacao: SituacaoDaGuia; readonly anexoId: string | null }[];
}

/** O MAPA: por grupo de encargos da folha, a obrigação liquidada, o pago, a restituição e as guias. */
export async function guiasEObrigacoesDaFolha(prisma: PrismaClient, folhaId: string): Promise<readonly ObrigacaoDoGrupo[]> {
  const elos = await prisma.empenhoDosEncargos.findMany({
    where: { apuracao: { folhaId } },
    select: {
      grupo: { select: { id: true, codigo: true, credor: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } }, componentes: { select: { componente: { select: { descricao: true, regime: true } } } } } },
      liquidacao: { select: { liquidacao: { select: { id: true, valor: true, estornos: { select: { id: true } }, anulacoesParciais: { select: { valor: true, estornos: { select: { id: true } } } }, pagamentos: { select: { valor: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true } } } } } } } },
    },
  });
  const [guias, restituicoes] = await Promise.all([
    prisma.guiaDeRecolhimento.findMany({ where: { folhaId }, orderBy: { criadoEm: "asc" }, select: { id: true, grupoId: true, identificador: true, natureza: true, vencimento: true, fundamentoDoVencimento: true, principal: true, componentes: true, total: true, baixa: { select: { id: true } }, cancelamento: { select: { id: true } }, anexos: { select: { id: true }, take: 1 } } }),
    prisma.ajusteDosEncargos.findMany({ where: { apuracao: { folhaId }, tipo: "RESTITUICAO_A_PROVIDENCIAR" }, select: { grupoId: true, valor: true, apuracao: { select: { numero: true } } } }),
  ]);
  const porGrupo = new Map<string, ObrigacaoDoGrupo & { liq: Money; pag: Money }>();
  for (const e of elos) {
    const g = e.grupo;
    const atual = porGrupo.get(g.id) ?? {
      grupoId: g.id, grupo: g.codigo, destinatario: `${g.credor?.versoes[0]?.nome ?? ""} (${g.credor?.documento ?? ""})`,
      naturezas: g.componentes.map((c) => `${c.componente.descricao} — ${c.componente.regime}`), liquidado: "0.00", pago: "0.00", restituicaoAProvidenciar: "0.00", guias: [], liq: toMoney(0), pag: toMoney(0),
    };
    const l = e.liquidacao?.liquidacao;
    if (l !== undefined && l.estornos.length === 0) {
      const liquido = toMoney(new Decimal(l.valor).minus(sumMoney(l.anulacoesParciais.filter((a) => a.estornos.length === 0).map((a) => toMoney(a.valor)))));
      const pagos = l.pagamentos.filter((p) => p.estornoDeId === null && p.estornos.length === 0);
      const pago = toMoney(sumMoney(pagos.filter((p) => p.anulacaoParcialDeId === null).map((p) => toMoney(p.valor))).minus(sumMoney(pagos.filter((p) => p.anulacaoParcialDeId !== null).map((p) => toMoney(p.valor)))));
      atual.liq = toMoney(atual.liq.plus(liquido));
      atual.pag = toMoney(atual.pag.plus(pago));
    }
    porGrupo.set(g.id, atual);
  }
  const ultimaRestituicao = new Map<string, { numero: number; valor: string }>();
  for (const r of restituicoes) {
    const ja = ultimaRestituicao.get(r.grupoId);
    if (ja === undefined || r.apuracao.numero > ja.numero) ultimaRestituicao.set(r.grupoId, { numero: r.apuracao.numero, valor: r.valor.toFixed(2) });
  }
  return [...porGrupo.values()].sort((a, b) => a.grupo.localeCompare(b.grupo)).map(({ liq, pag, ...o }) => ({
    ...o,
    liquidado: liq.toFixed(2),
    pago: pag.toFixed(2),
    restituicaoAProvidenciar: ultimaRestituicao.get(o.grupoId)?.valor ?? "0.00",
    guias: guias.filter((g) => g.grupoId === o.grupoId).map((g) => ({
      id: g.id, identificador: g.identificador, natureza: g.natureza, vencimento: g.vencimento === null ? null : diaCivil(g.vencimento), fundamentoDoVencimento: g.fundamentoDoVencimento,
      principal: g.principal.toFixed(2), componentes: (g.componentes as { rotulo: string; valor: string }[]) ?? [], total: g.total.toFixed(2),
      situacao: g.cancelamento !== null ? ("CANCELADA" as const) : g.baixa !== null ? ("BAIXADA" as const) : ("RECEBIDA" as const), anexoId: g.anexos[0]?.id ?? null,
    })),
  }));
}
