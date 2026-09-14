import { createHash } from "node:crypto";
import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO, type AcaoDoSistema } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { AtoInelegivelError, Decimal, exigirElegivel, sumMoney, toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { roteiroEmpenho, roteiroLiquidacaoDaFolha, elementoDebitaEstoque } from "../m01-core-contabil/roteiros.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { zCompetencia } from "./dominio.js";
import { situacaoDaCertificacao, designacaoVigenteEm, type SituacaoDaCertificacao } from "./certificacao.js";
import {
  apurarEncargos,
  diferencaAEmpenhar,
  elegibilidadeParaApropriarEncargos,
  elegibilidadeParaCertificarEncargos,
  elegibilidadeParaLiquidarEncargos,
  elegibilidadeParaApurarEncargos,
  type AtorNosEncargos,
  type EstadoDosEncargos,
  type ResumoDoComponente,
} from "./encargos.js";

/**
 * ═══ M33 — OS ENCARGOS DO EMPREGADOR: cadastro, aprovação, apuração, atesto, empenho e liquidação ═══
 *
 * O motor é puro (`encargos.ts`); aqui se lê, se autoriza e se grava. Nada reimplementa despesa: o
 * empenho é o `empenhar` do M05 e a liquidação é o `liquidar` do M05, com o roteiro de liquidação da
 * folha e as contas que o GRUPO DE ENCARGOS declara (VPD de encargos e obrigação de encargos a
 * recolher) — não as da remuneração, e muito menos a de serviços de terceiros.
 *
 * ⚠️ TRÊS SEPARAÇÕES que este arquivo existe para manter:
 *   1. o encargo não toca o contracheque: nenhuma linha, nenhum total, nenhum sha do cálculo muda;
 *   2. a contribuição retida do servidor não vira despesa: só o que a APURAÇÃO calcula se empenha;
 *   3. o atesto salarial não é o atesto dos encargos: a certificação é outro objeto, com outra
 *      atribuição na designação, presa ao sha256 da apuração.
 *
 * ⚠️ RETOMÁVEL POR GRUPO, SEM DUPLICAR: cada grupo é um empenho (transação própria no M05); o
 * `@@unique([apuracaoId, grupoId])`, o `empenhoId @unique` e o `@@unique([fichaId, numero])` do M05
 * são a idempotência real. Nova apuração do mesmo cálculo empenha só a DIFERENÇA.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
// ⚠️ A ALÍQUOTA NÃO PASSA POR `number`: 0,015 em ponto flutuante é 0,01499999…, e a folha inteira
// arredondaria para baixo em algum vínculo de borda. Texto decimal → Decimal, e o intervalo conferido.
const zAliquota = z
  .union([z.string().trim().regex(/^\d+(\.\d+)?$/, "alíquota decimal, com ponto"), z.number()])
  .transform((v) => new Decimal(String(v)))
  .refine((d) => d.gte(0) && d.lte(1), "alíquota em fração: 0.20 = 20%");
const zDinheiroOpcional = z.string().trim().regex(/^\d+(\.\d{1,2})?$/).optional();

// ═══════════════════════════════════════════════════════════════════════════════
// CADASTRO E APROVAÇÃO DOS PARÂMETROS
// ═══════════════════════════════════════════════════════════════════════════════

export const zCadastrarComponenteDeEncargoInput = z.object({
  codigo: z.string().trim().regex(/^[A-Z0-9-]{2,30}$/, "código em maiúsculas, dígitos e hífen"),
  descricao: z.string().trim().min(3),
  tipo: z.enum(["PREVIDENCIA_PATRONAL", "PREVIDENCIA_SUPLEMENTAR", "RISCO_AMBIENTAL_DO_TRABALHO", "OUTRAS_ENTIDADES", "FGTS", "OUTRO"]),
  regime: z.enum(["RGPS", "RPPS", "ISENTO"]),
  criadoPor: z.string().min(1),
});
export type CadastrarComponenteDeEncargoInput = z.input<typeof zCadastrarComponenteDeEncargoInput>;

export async function cadastrarComponenteDeEncargo(prisma: PrismaClient, input: CadastrarComponenteDeEncargoInput): Promise<{ readonly componenteId: string }> {
  const d = zCadastrarComponenteDeEncargoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarComponenteDeEncargo, "ENTE");
    if ((await tx.componenteDeEncargo.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) !== null) {
      throw new Error(`COMPONENTE-REPETIDO: já existe componente de encargo com o código ${d.codigo}. Nada foi gravado.`);
    }
    const c = await tx.componenteDeEncargo.create({ data: { codigo: d.codigo, descricao: d.descricao, tipo: d.tipo, regime: d.regime, criadoPor: d.criadoPor }, select: { id: true } });
    return { componenteId: c.id };
  });
}

export const zCadastrarVersaoDoEncargoInput = z
  .object({
    componenteId: z.string().min(1),
    competenciaInicio: zCompetencia,
    competenciaFim: zCompetencia.optional(),
    aliquota: zAliquota,
    teto: zDinheiroOpcional,
    fundamentacaoLegal: z.string().trim().min(5, "sem fundamento não há parâmetro"),
    sintetica: z.boolean(),
    rubricaIds: z.array(z.string().min(1)).min(1, "a base precisa de ao menos uma rubrica incidente"),
    criadoPor: z.string().min(1),
  })
  .refine((d) => d.competenciaFim === undefined || d.competenciaFim >= d.competenciaInicio, { message: "a competência final não pode ser anterior à inicial" });
export type CadastrarVersaoDoEncargoInput = z.input<typeof zCadastrarVersaoDoEncargoInput>;

export async function cadastrarVersaoDoEncargo(prisma: PrismaClient, input: CadastrarVersaoDoEncargoInput): Promise<{ readonly versaoId: string }> {
  const d = zCadastrarVersaoDoEncargoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarVersaoDoEncargo, "ENTE");
    const comp = await tx.componenteDeEncargo.findUnique({ where: { id: d.componenteId }, select: { codigo: true } });
    if (comp === null) throw new Error(`Componente de encargo ${d.componenteId} não existe. Nada foi gravado.`);
    const gemea = await tx.versaoDoEncargo.findFirst({ where: { componenteId: d.componenteId, competenciaInicio: d.competenciaInicio }, select: { id: true } });
    if (gemea !== null) {
      throw new Error(`VERSAO-AMBIGUA: o componente ${comp.codigo} já tem versão começando em ${d.competenciaInicio}. Duas com o mesmo início diriam duas verdades; cadastre a correção com início posterior. Nada foi gravado.`);
    }
    const rubricas = await tx.rubrica.findMany({ where: { id: { in: d.rubricaIds } }, select: { id: true, codigo: true, tipo: true } });
    if (rubricas.length !== new Set(d.rubricaIds).size) throw new Error("Rubrica inexistente entre as incidentes. Nada foi gravado.");
    const descontos = rubricas.filter((r) => r.tipo !== "PROVENTO");
    if (descontos.length > 0) {
      throw new Error(`RUBRICA-DE-DESCONTO-NA-BASE-DO-ENCARGO: ${descontos.map((r) => r.codigo).join(", ")} — o encargo incide sobre a remuneração, não sobre o que se desconta do servidor. Nada foi gravado.`);
    }
    const v = await tx.versaoDoEncargo.create({
      data: {
        componenteId: d.componenteId, competenciaInicio: d.competenciaInicio, competenciaFim: d.competenciaFim ?? null,
        aliquota: d.aliquota.toFixed(4), teto: d.teto ?? null, fundamentacaoLegal: d.fundamentacaoLegal, sintetica: d.sintetica, criadoPor: d.criadoPor,
        incidencias: { create: [...new Set(d.rubricaIds)].map((rubricaId) => ({ rubricaId })) },
      },
      select: { id: true },
    });
    return { versaoId: v.id };
  });
}

export const zAprovarVersaoDoEncargoInput = z.object({ versaoId: z.string().min(1), motivo: z.string().trim().optional(), criadoPor: z.string().min(1) });
export type AprovarVersaoDoEncargoInput = z.input<typeof zAprovarVersaoDoEncargoInput>;

export async function aprovarVersaoDoEncargo(prisma: PrismaClient, input: AprovarVersaoDoEncargoInput): Promise<{ readonly aprovacaoId: string }> {
  const d = zAprovarVersaoDoEncargoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.aprovarVersaoDoEncargo, "ENTE");
    const v = await tx.versaoDoEncargo.findUnique({ where: { id: d.versaoId }, select: { criadoPor: true, competenciaInicio: true, aprovacao: { select: { id: true } }, componente: { select: { codigo: true } } } });
    if (v === null) throw new Error(`Versão de encargo ${d.versaoId} não existe. Nada foi gravado.`);
    if (v.aprovacao !== null) throw new Error(`VERSAO-JA-APROVADA: a versão de ${v.componente.codigo} a partir de ${v.competenciaInicio} já está aprovada. Nada foi gravado.`);
    // ⚠️ QUEM CADASTRA O PARÂMETRO NÃO O APROVA: uma alíquota errada que passa pela mesma mão vira
    // obrigação de toda a folha do ente.
    if (v.criadoPor === d.criadoPor) {
      throw new Error(`AUTOAPROVACAO-DO-ENCARGO: ${d.criadoPor} cadastrou esta versão e não pode aprová-la. Outra pessoa confere alíquota, base e fundamento. Nada foi gravado.`);
    }
    const a = await tx.aprovacaoDoEncargo.create({ data: { versaoId: d.versaoId, motivo: d.motivo ?? null, criadoPor: d.criadoPor }, select: { id: true } });
    return { aprovacaoId: a.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A APURAÇÃO — o fato numerado sobre o cálculo fechado
// ═══════════════════════════════════════════════════════════════════════════════

async function lerParaApurar(tx: Tx, calculoId: string) {
  const [contracheques, componentes, versoes] = await Promise.all([
    tx.contracheque.findMany({
      where: { calculoId },
      select: { vinculoId: true, regime: true, vinculo: { select: { matricula: true } }, linhas: { select: { rubricaId: true, tipo: true, valor: true, rubrica: { select: { codigo: true } } } } },
    }),
    tx.componenteDeEncargo.findMany({ select: { id: true, codigo: true, descricao: true, tipo: true, regime: true } }),
    tx.versaoDoEncargo.findMany({ select: { id: true, componenteId: true, competenciaInicio: true, competenciaFim: true, aliquota: true, teto: true, fundamentacaoLegal: true, sintetica: true, aprovacao: { select: { id: true } } } }),
  ]);
  const incidencias = await tx.incidenciaDoEncargo.findMany({ where: { versaoId: { in: versoes.map((v) => v.id) } }, select: { versaoId: true, rubricaId: true } });
  return {
    contracheques: contracheques.map((c) => ({
      vinculoId: c.vinculoId, matricula: c.vinculo.matricula, regime: c.regime,
      linhas: c.linhas.map((l) => ({ rubricaId: l.rubricaId, codigo: l.rubrica.codigo, tipo: l.tipo, valor: toMoney(l.valor) })),
    })),
    componentes,
    versoes: versoes.map((v) => ({
      id: v.id, componenteId: v.componenteId, competenciaInicio: v.competenciaInicio, competenciaFim: v.competenciaFim,
      aliquota: new Decimal(v.aliquota), teto: v.teto === null ? null : toMoney(v.teto), fundamentacaoLegal: v.fundamentacaoLegal, sintetica: v.sintetica,
      aprovada: v.aprovacao !== null, rubricasIncidentes: incidencias.filter((i) => i.versaoId === v.id).map((i) => i.rubricaId),
    })),
  };
}

export const zApurarEncargosInput = z.object({ folhaId: z.string().min(1), motivo: z.string().trim().optional(), criadoPor: z.string().min(1) });
export type ApurarEncargosInput = z.input<typeof zApurarEncargosInput>;

export interface ResultadoDaApuracao {
  readonly apuracaoId: string;
  readonly numero: number;
  readonly competencia: string;
  readonly complementar: boolean;
  readonly completa: boolean;
  readonly total: Money;
  readonly sha256: string;
  readonly porComponente: readonly ResumoDoComponente[];
}

export async function apurarEncargosDaFolha(prisma: PrismaClient, input: ApurarEncargosInput): Promise<ResultadoDaApuracao> {
  const d = zApurarEncargosInput.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apurarEncargosDaFolha, "ENTE");
      const folha = await tx.folhaDePagamento.findUnique({
        where: { id: d.folhaId },
        select: { competencia: true, fechamento: { select: { calculoId: true, calculo: { select: { numero: true, sha256: true } } } }, certificacoes: { select: { tipo: true } } },
      });
      if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
      exigirElegivel(elegibilidadeParaApurarEncargos({ competencia: folha.competencia, fechada: folha.fechamento !== null, apuracao: null, certificacao: null, gruposPendentesDeEmpenho: 0, componentesSemGrupo: [], empenhosDaApuracao: 0, liquidados: 0 }));
      const fechamento = folha.fechamento as NonNullable<typeof folha.fechamento>;
      const lido = await lerParaApurar(tx, fechamento.calculoId);
      const r = apurarEncargos({ competencia: folha.competencia, calculo: { numero: fechamento.calculo.numero, sha256: fechamento.calculo.sha256 }, ...lido });
      if (r.itens.length === 0) {
        throw new Error(`ENCARGOS-SEM-COMPONENTE: não há componente de encargo cadastrado. Nada a apurar em ${folha.competencia} — e isso não prova que o ente não deve encargo nenhum. Nada foi gravado.`);
      }
      const ultima = await tx.apuracaoDeEncargos.findFirst({ where: { calculoId: fechamento.calculoId }, orderBy: { numero: "desc" }, select: { numero: true, sha256: true } });
      if (ultima !== null && ultima.sha256 === r.sha256) {
        throw new Error(`APURACAO-SEM-MUDANCA: a apuração nº ${ultima.numero} de ${folha.competencia} já tem exatamente este resultado (mesmo sha256). Apurar de novo sem mudança de parâmetro criaria uma versão igual. Nada foi gravado.`);
      }
      const complementar = folha.certificacoes.some((c) => c.tipo === "CERTIFICACAO");
      const numero = (ultima?.numero ?? 0) + 1;
      const a = await tx.apuracaoDeEncargos.create({
        data: {
          folhaId: d.folhaId, calculoId: fechamento.calculoId, numero, complementar, motivo: d.motivo ?? null,
          memoria: r.memoria as object, sha256: r.sha256, total: r.total.toFixed(2), completa: r.completa, esperados: r.esperados, criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      return { apuracaoId: a.id, numero, competencia: folha.competencia, complementar, completa: r.completa, total: r.total, sha256: r.sha256, porComponente: r.porComponente };
    });
  } catch (e) {
    // ⚠️ DUAS APURAÇÕES AO MESMO TEMPO: o `@@unique([calculoId, numero])` deixa uma passar; a outra
    // recebe o motivo — e não um erro de banco.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      throw new Error("APURACAO-CONCORRENTE: outra apuração dos encargos desta folha foi gravada no mesmo instante. Recarregue e confira a apuração vigente antes de repetir. Este envio não gravou nada.");
    }
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// O RETRATO DOS ATOS SOBRE OS ENCARGOS — o mesmo na tela e no caso de uso
// ═══════════════════════════════════════════════════════════════════════════════

/** Por grupo: o valor da apuração vigente, o já empenhado pela folha e se esta apuração já empenhou. */
async function planoDeEmpenho(tx: Tx, folhaId: string, apuracao: { readonly id: string; readonly porComponente: readonly ResumoDoComponente[] }) {
  const comValor = apuracao.porComponente.filter((p) => new Decimal(p.total).gt(0));
  const vinculos = await tx.componenteDoGrupoDeEmpenho.findMany({
    where: { componente: { codigo: { in: comValor.map((p) => p.codigo) } } },
    select: { componente: { select: { codigo: true } }, grupo: { select: { id: true, codigo: true, descricao: true, serie: true, fichaId: true, porServidor: true, credorId: true, credor: { select: { documento: true } }, tipoEmpenho: true, categoriaOrdemCronologica: true, contaVariacao: { select: { codigo: true } }, contaObrigacao: { select: { codigo: true } } } } },
  });
  const grupoDe = new Map(vinculos.map((v) => [v.componente.codigo, v.grupo]));
  const semGrupo = comValor.filter((p) => !grupoDe.has(p.codigo)).map((p) => p.codigo);
  const porGrupo = new Map<string, { grupo: (typeof vinculos)[number]["grupo"]; pedido: Money }>();
  for (const p of comValor) {
    const g = grupoDe.get(p.codigo);
    if (g === undefined) continue;
    const acc = porGrupo.get(g.id) ?? { grupo: g, pedido: toMoney(0) };
    acc.pedido = toMoney(acc.pedido.plus(new Decimal(p.total)));
    porGrupo.set(g.id, acc);
  }
  const empenhados = await tx.empenhoDosEncargos.findMany({ where: { apuracao: { folhaId } }, select: { apuracaoId: true, grupoId: true, valor: true } });
  const plano = [...porGrupo.values()]
    .sort((a, b) => a.grupo.codigo.localeCompare(b.grupo.codigo))
    .map((x) => {
      const jaEmpenhado = sumMoney(empenhados.filter((e) => e.grupoId === x.grupo.id).map((e) => toMoney(e.valor)));
      const destaApuracao = empenhados.some((e) => e.grupoId === x.grupo.id && e.apuracaoId === apuracao.id);
      return { ...x, jaEmpenhado, destaApuracao, diferenca: diferencaAEmpenhar(x.pedido, jaEmpenhado) };
    });
  return { plano, semGrupo };
}

async function apuracaoVigente(tx: Tx, folhaId: string) {
  const a = await tx.apuracaoDeEncargos.findFirst({
    where: { folhaId },
    orderBy: [{ criadoEm: "desc" }, { numero: "desc" }],
    select: { id: true, numero: true, completa: true, criadoPor: true, sha256: true, total: true, memoria: true, calculoId: true, certificacoes: { select: { id: true, tipo: true, criadoEm: true, criadoPor: true, designacao: { select: { atoDesignacao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } } },
  });
  if (a === null) return null;
  const memoria = a.memoria as { porComponente?: ResumoDoComponente[] };
  const situacao: SituacaoDaCertificacao = situacaoDaCertificacao(a.certificacoes.map((c) => ({ tipo: c.tipo, calculoId: a.id, criadoEm: c.criadoEm })), a.id);
  const ultimaCertificacao = [...a.certificacoes].sort((x, y) => y.criadoEm.getTime() - x.criadoEm.getTime()).find((c) => c.tipo === "CERTIFICACAO");
  return { ...a, porComponente: memoria.porComponente ?? [], situacao, ultimaCertificacao };
}

export interface RetratoDosEncargos {
  readonly estado: EstadoDosEncargos;
  readonly ator: AtorNosEncargos;
  readonly versao: string;
}

export async function retratoDosEncargos(prisma: PrismaClient, folhaId: string, usuarioIdentificador: string, opcoes: { readonly consultarDesignacao: boolean }): Promise<RetratoDosEncargos | null> {
  const folha = await prisma.folhaDePagamento.findUnique({ where: { id: folhaId }, select: { competencia: true, fechamento: { select: { id: true } } } });
  if (folha === null) return null;
  const a = await apuracaoVigente(prisma, folhaId);
  const plano = a === null ? null : await planoDeEmpenho(prisma, folhaId, a);
  const empenhosDaApuracao = a === null ? [] : await prisma.empenhoDosEncargos.findMany({ where: { apuracao: { folhaId } }, select: { id: true, liquidacao: { select: { id: true } } } });
  const designado = opcoes.consultarDesignacao ? (await designacaoParaOAto(prisma, usuarioIdentificador, "CERTIFICAR_ENCARGOS_DA_FOLHA", new Date())) !== null : null;
  const estado: EstadoDosEncargos = {
    competencia: folha.competencia,
    fechada: folha.fechamento !== null,
    apuracao: a === null ? null : { numero: a.numero, completa: a.completa, apuradaPor: a.criadoPor },
    certificacao: a === null ? null : a.situacao,
    gruposPendentesDeEmpenho: plano === null ? 0 : plano.plano.filter((p) => p.diferenca.tipo !== "NADA" && !p.destaApuracao).length,
    componentesSemGrupo: plano?.semGrupo ?? [],
    empenhosDaApuracao: empenhosDaApuracao.length,
    liquidados: empenhosDaApuracao.filter((e) => e.liquidacao !== null).length,
  };
  const ultima = a?.certificacoes.slice().sort((x, y) => y.criadoEm.getTime() - x.criadoEm.getTime())[0];
  const versao = createHash("sha256").update(JSON.stringify([a?.id ?? null, a?.certificacoes.map((c) => c.id).sort() ?? [], estado.empenhosDaApuracao, estado.liquidados])).digest("hex").slice(0, 16);
  return {
    estado,
    ator: { apurou: a?.criadoPor === usuarioIdentificador, certificou: ultima?.tipo === "CERTIFICACAO" && ultima.criadoPor === usuarioIdentificador, designado },
    versao,
  };
}

/** A designação com a atribuição, vigente no dia do ato E hoje — a mesma regra do atesto salarial. */
async function designacaoParaOAto(tx: Tx, usuarioIdentificador: string, atribuicao: "CERTIFICAR_ENCARGOS_DA_FOLHA", dataDoAto: Date) {
  const candidatas = await tx.designacaoNaFolha.findMany({
    where: { atribuicao, usuario: { identificador: usuarioIdentificador, ativo: true } },
    orderBy: { vigenciaInicio: "desc" },
    select: { id: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } },
  });
  const agora = new Date();
  const v = candidatas.find((c) => designacaoVigenteEm(c, dataDoAto) && designacaoVigenteEm(c, agora));
  return v === undefined ? null : { id: v.id, atoDesignacao: v.atoDesignacao, nome: v.pessoa.versoes[0]?.nome ?? v.pessoa.documento };
}

// ═══════════════════════════════════════════════════════════════════════════════
// O ATESTO DOS ENCARGOS
// ═══════════════════════════════════════════════════════════════════════════════

export const zCertificarEncargosInput = z.object({ folhaId: z.string().min(1), data: z.coerce.date(), criadoPor: z.string().min(1) });
export type CertificarEncargosInput = z.input<typeof zCertificarEncargosInput>;
export const zDevolverEncargosInput = zCertificarEncargosInput.extend({ motivo: z.string().trim().min(3) });
export type DevolverEncargosInput = z.input<typeof zDevolverEncargosInput>;

async function registrarAtestoDosEncargos(prisma: PrismaClient, d: z.output<typeof zDevolverEncargosInput> | z.output<typeof zCertificarEncargosInput>, tipo: "CERTIFICACAO" | "DEVOLUCAO", acao: AcaoDoSistema) {
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, acao, "ENTE");
    const folha = await tx.folhaDePagamento.findUnique({ where: { id: d.folhaId }, select: { competencia: true, fechamento: { select: { id: true } } } });
    if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
    const a = await apuracaoVigente(tx, d.folhaId);
    const designacao = await designacaoParaOAto(tx, d.criadoPor, "CERTIFICAR_ENCARGOS_DA_FOLHA", d.data);
    const estado: EstadoDosEncargos = { competencia: folha.competencia, fechada: folha.fechamento !== null, apuracao: a === null ? null : { numero: a.numero, completa: a.completa, apuradaPor: a.criadoPor }, certificacao: a?.situacao ?? null, gruposPendentesDeEmpenho: 0, componentesSemGrupo: [], empenhosDaApuracao: 0, liquidados: 0 };
    const ator: AtorNosEncargos = { apurou: a?.criadoPor === d.criadoPor, certificou: false, designado: designacao !== null };
    if (tipo === "CERTIFICACAO") exigirElegivel(elegibilidadeParaCertificarEncargos(estado, ator));
    else {
      if (a === null) throw new AtoInelegivelError({ situacao: "PRE_CONDICAO", codigo: "ENCARGOS-NAO-APURADOS", motivo: `Os encargos de ${folha.competencia} ainda não foram apurados.` });
      if (a.situacao === "DEVOLVIDA") throw new AtoInelegivelError({ situacao: "NAO_APLICAVEL", codigo: "ENCARGOS-JA-DEVOLVIDOS", motivo: `A apuração nº ${a.numero} já foi devolvida.` });
      const liquidadas = await tx.liquidacaoDosEncargos.count({ where: { empenhoDosEncargos: { apuracao: { folhaId: d.folhaId } } } });
      if (liquidadas > 0) throw new AtoInelegivelError({ situacao: "NAO_APLICAVEL", codigo: "ENCARGOS-JA-LIQUIDADOS", motivo: `${liquidadas} liquidação(ões) dos encargos já existe(m); devolver o atesto não as desfaz.` });
      if (designacao === null) throw new AtoInelegivelError({ situacao: "PRE_CONDICAO", codigo: "SEM-DESIGNACAO-VIGENTE", motivo: "Você não tem designação vigente para certificar os encargos." });
    }
    if (a === null || designacao === null) throw new Error("estado inconsistente — o predicado deveria ter recusado");
    const c = await tx.certificacaoDosEncargos.create({
      data: { apuracaoId: a.id, designacaoId: designacao.id, tipo, motivo: "motivo" in d ? d.motivo : null, sha256: a.sha256, total: toMoney(a.total).toFixed(2), criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { certificacaoId: c.id, numero: a.numero, sha256: a.sha256, competencia: folha.competencia, responsavel: `${designacao.nome} (${designacao.atoDesignacao})` };
  });
}

export async function certificarEncargosDaFolha(prisma: PrismaClient, input: CertificarEncargosInput) {
  return registrarAtestoDosEncargos(prisma, zCertificarEncargosInput.parse(input), "CERTIFICACAO", ACAO_DO_SERVICO.certificarEncargosDaFolha);
}

export async function devolverEncargosDaFolha(prisma: PrismaClient, input: DevolverEncargosInput) {
  return registrarAtestoDosEncargos(prisma, zDevolverEncargosInput.parse(input), "DEVOLUCAO", ACAO_DO_SERVICO.devolverEncargosDaFolha);
}

// ═══════════════════════════════════════════════════════════════════════════════
// O EMPENHO DOS ENCARGOS — por grupo, só a diferença, retomável
// ═══════════════════════════════════════════════════════════════════════════════

export const zApropriarEncargosInput = z.object({ folhaId: z.string().min(1), dataDoEmpenho: z.coerce.date(), criadoPor: z.string().min(1) });
export type ApropriarEncargosInput = z.input<typeof zApropriarEncargosInput>;

export class EmpenhoDosEncargosInterrompidoError extends Error {
  constructor(readonly feitos: number, readonly ondeParou: string, readonly motivo: string) {
    super(
      `EMPENHO-DOS-ENCARGOS-INTERROMPIDO: ${feitos} empenho(s) de encargos já gravado(s), e o ato parou no grupo ${ondeParou}. Motivo: ${motivo} ` +
        `Os empenhos gravados CONTINUAM válidos; resolva a causa e empenhar de novo continua de onde parou — sem duplicar.`
    );
    this.name = "EmpenhoDosEncargosInterrompidoError";
  }
}

export interface ResultadoDoEmpenhoDosEncargos {
  readonly competencia: string;
  readonly apuracao: number;
  readonly empenhados: number;
  readonly jaExistiam: number;
  readonly semDiferenca: number;
  readonly total: Money;
  readonly porGrupo: readonly { readonly codigo: string; readonly pedido: string; readonly jaEmpenhado: string; readonly empenhado: string }[];
}

export async function apropriarEncargosDaFolha(prisma: PrismaClient, input: ApropriarEncargosInput): Promise<ResultadoDoEmpenhoDosEncargos> {
  const d = zApropriarEncargosInput.parse(input);
  const folha = await prisma.folhaDePagamento.findUnique({ where: { id: d.folhaId }, select: { competencia: true, tipo: true, fechamento: { select: { id: true } } } });
  if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apropriarEncargosDaFolha, "ENTE");
  });
  const a = await apuracaoVigente(prisma, d.folhaId);
  const { plano, semGrupo } = a === null ? { plano: [], semGrupo: [] } : await planoDeEmpenho(prisma, d.folhaId, a);
  exigirElegivel(elegibilidadeParaApropriarEncargos({
    competencia: folha.competencia, fechada: folha.fechamento !== null,
    apuracao: a === null ? null : { numero: a.numero, completa: a.completa, apuradaPor: a.criadoPor },
    certificacao: a?.situacao ?? null,
    gruposPendentesDeEmpenho: plano.filter((p) => p.diferenca.tipo !== "NADA" && !p.destaApuracao).length,
    componentesSemGrupo: semGrupo,
    empenhosDaApuracao: 0, liquidados: 0,
  }));
  if (a === null) throw new Error("estado inconsistente");
  // ⚠️ AS PRÉ-CONDIÇÕES DE TODOS OS GRUPOS ANTES DE GRAVAR O PRIMEIRO EMPENHO (a de componente sem
  // grupo já veio pelo predicado acima).
  const reducoes = plano.filter((p) => p.diferenca.tipo === "REDUCAO");
  if (reducoes.length > 0) {
    throw new Error(
      `REDUCAO-DE-ENCARGO-EMPENHADO: ${reducoes.map((p) => `${p.grupo.codigo} (empenhado ${p.jaEmpenhado.toFixed(2)}, apurado ${p.pedido.toFixed(2)})`).join("; ")}. ` +
        `A apuração nova pede MENOS do que já foi empenhado; desfazer despesa é anulação parcial pelo M05, com o seu lançamento — não um empenho negativo. Nada foi gravado.`
    );
  }
  const incoerentes = plano.filter((p) => p.grupo.porServidor || p.grupo.credorId === null);
  if (incoerentes.length > 0) throw new Error(`GRUPO-DE-ENCARGOS-SEM-CREDOR: ${incoerentes.map((p) => p.grupo.codigo).join(", ")} — o empenho dos encargos é único por grupo, com o credor declarado (o regime ou o fundo). Nada foi gravado.`);

  const deps = criarM05DepsComContratos(prisma);
  let empenhados = 0;
  let jaExistiam = 0;
  let semDiferenca = 0;
  let total = toMoney(0);
  const porGrupo: { codigo: string; pedido: string; jaEmpenhado: string; empenhado: string }[] = [];
  for (const p of plano) {
    const linha = { codigo: p.grupo.codigo, pedido: p.pedido.toFixed(2), jaEmpenhado: p.jaEmpenhado.toFixed(2), empenhado: "0.00" };
    if (p.destaApuracao) {
      jaExistiam += 1;
      porGrupo.push(linha);
      continue;
    }
    if (p.diferenca.tipo !== "EMPENHAR") {
      semDiferenca += 1;
      porGrupo.push(linha);
      continue;
    }
    const valor = p.diferenca.valor;
    const numero = `${p.grupo.serie}/${folha.competencia}/${p.grupo.codigo}-E${a.numero}`;
    try {
      // A janela entre o empenho do M05 (transação própria) e o elo: reconhecer, não duplicar.
      const ja = await prisma.empenho.findUnique({ where: { fichaId_numero: { fichaId: p.grupo.fichaId, numero } }, select: { id: true } });
      const empenhoId =
        ja?.id ??
        (
          await empenhar(
            {
              fichaId: p.grupo.fichaId, numero, tipo: p.grupo.tipoEmpenho, valor: valor.toFixed(2), data: d.dataDoEmpenho,
              credorCpfCnpj: p.grupo.credor?.documento ?? "", categoriaOrdemCronologica: p.grupo.categoriaOrdemCronologica,
              historico: `Encargos do empregador — folha ${folha.tipo.toLowerCase()} de ${folha.competencia}, ${p.grupo.descricao}, apuração nº ${a.numero}${a.numero > 1 ? " (diferença sobre o já empenhado)" : ""} (empenho de ${diaCivil(d.dataDoEmpenho)}).`,
              criadoPor: d.criadoPor,
            },
            roteiroEmpenho(),
            deps
          )
        ).empenhoId;
      await prisma.empenhoDosEncargos.create({ data: { apuracaoId: a.id, grupoId: p.grupo.id, empenhoId, valor: valor.toFixed(2), criadoPor: d.criadoPor } });
      empenhados += 1;
      total = toMoney(total.plus(valor));
      porGrupo.push({ ...linha, empenhado: valor.toFixed(2) });
    } catch (e) {
      throw new EmpenhoDosEncargosInterrompidoError(empenhados, p.grupo.codigo, e instanceof Error ? e.message : String(e));
    }
  }
  return { competencia: folha.competencia, apuracao: a.numero, empenhados, jaExistiam, semDiferenca, total, porGrupo };
}

/** O grupo de ENCARGOS: componentes (não rubricas), empenho único com credor, contas próprias. */
export const zCadastrarGrupoDosEncargosInput = z.object({
  codigo: z.string().trim().regex(/^[A-Z0-9-]{2,30}$/),
  descricao: z.string().trim().min(3),
  fichaId: z.string().min(1),
  serie: z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/),
  credorId: z.string().min(1),
  tipoEmpenho: z.enum(["ORDINARIO", "GLOBAL", "ESTIMATIVO"]),
  categoriaOrdemCronologica: z.enum(["FORNECIMENTO_BENS", "LOCACAO", "PRESTACAO_SERVICOS", "REALIZACAO_OBRAS"]),
  contaVariacaoId: z.string().min(1),
  contaObrigacaoId: z.string().min(1),
  componenteIds: z.array(z.string().min(1)).min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarGrupoDosEncargosInput = z.input<typeof zCadastrarGrupoDosEncargosInput>;

export async function cadastrarGrupoDosEncargos(prisma: PrismaClient, input: CadastrarGrupoDosEncargosInput): Promise<{ readonly grupoId: string }> {
  const d = zCadastrarGrupoDosEncargosInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarGrupoDosEncargos, "ENTE");
    if ((await tx.grupoDeEmpenhoDaFolha.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) !== null) throw new Error(`GRUPO-REPETIDO: já existe grupo com o código ${d.codigo}. Nada foi gravado.`);
    const ficha = await tx.fichaOrcamentaria.findUnique({ where: { id: d.fichaId }, select: { numero: true, naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } } } });
    if (ficha === null) throw new Error(`Ficha ${d.fichaId} não existe. Nada foi gravado.`);
    if (elementoDebitaEstoque(ficha.naturezaDespesa.codElemento)) throw new Error(`FICHA-DE-MATERIAL-NO-GRUPO-DA-FOLHA: a ficha ${ficha.numero} (${ficha.naturezaDespesa.codigoCompleto}) debita estoque. Nada foi gravado.`);
    for (const id of [d.contaVariacaoId, d.contaObrigacaoId]) {
      const c = await tx.contaPcasp.findUnique({ where: { id }, select: { codigo: true, analitica: true } });
      if (c === null) throw new Error(`Conta ${id} não existe no plano. Nada foi gravado.`);
      if (!c.analitica) throw new Error(`CONTA-SINTETICA: ${c.codigo} não recebe partida. Nada foi gravado.`);
    }
    if ((await tx.pessoa.findUnique({ where: { id: d.credorId }, select: { id: true } })) === null) throw new Error(`Credor ${d.credorId} não existe no cadastro de pessoas. Nada foi gravado.`);
    const comps = await tx.componenteDeEncargo.findMany({ where: { id: { in: d.componenteIds } }, select: { id: true, codigo: true, grupoDeEmpenho: { select: { grupo: { select: { codigo: true } } } } } });
    if (comps.length !== new Set(d.componenteIds).size) throw new Error("Componente inexistente entre os informados. Nada foi gravado.");
    const jaEmOutro = comps.filter((c) => c.grupoDeEmpenho !== null);
    if (jaEmOutro.length > 0) throw new Error(`COMPONENTE-JA-EM-OUTRO-GRUPO: ${jaEmOutro.map((c) => `${c.codigo} (${c.grupoDeEmpenho?.grupo.codigo ?? "?"})`).join(", ")}. Nada foi gravado.`);
    const g = await tx.grupoDeEmpenhoDaFolha.create({
      data: {
        codigo: d.codigo, descricao: d.descricao, fichaId: d.fichaId, categoriaOrdemCronologica: d.categoriaOrdemCronologica, tipoEmpenho: d.tipoEmpenho,
        serie: d.serie, porServidor: false, credorId: d.credorId, contaVariacaoId: d.contaVariacaoId, contaObrigacaoId: d.contaObrigacaoId, criadoPor: d.criadoPor,
        componentes: { create: [...new Set(d.componenteIds)].map((componenteId) => ({ componenteId, criadoPor: d.criadoPor })) },
      },
      select: { id: true },
    });
    return { grupoId: g.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A LIQUIDAÇÃO DOS ENCARGOS
// ═══════════════════════════════════════════════════════════════════════════════

export const zLiquidarEncargosInput = z.object({ folhaId: z.string().min(1), data: z.coerce.date(), criadoPor: z.string().min(1) });
export type LiquidarEncargosInput = z.input<typeof zLiquidarEncargosInput>;

export async function liquidarEncargosDaFolha(prisma: PrismaClient, input: LiquidarEncargosInput): Promise<{ readonly competencia: string; readonly liquidadas: number; readonly jaExistiam: number; readonly pendentes: number; readonly total: Money }> {
  const d = zLiquidarEncargosInput.parse(input);
  const folha = await prisma.folhaDePagamento.findUnique({ where: { id: d.folhaId }, select: { competencia: true, tipo: true } });
  if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
  const a = await apuracaoVigente(prisma, d.folhaId);
  const empenhos = await prisma.empenhoDosEncargos.findMany({
    where: { apuracao: { folhaId: d.folhaId } },
    orderBy: [{ grupo: { codigo: "asc" } }, { criadoEm: "asc" }],
    select: { id: true, valor: true, empenhoId: true, empenho: { select: { numero: true } }, liquidacao: { select: { id: true } }, grupo: { select: { codigo: true, descricao: true, contaVariacao: { select: { codigo: true } }, contaObrigacao: { select: { codigo: true } } } } },
  });
  const certificacao = a?.ultimaCertificacao;
  exigirElegivel(elegibilidadeParaLiquidarEncargos(
    { competencia: folha.competencia, fechada: true, apuracao: a === null ? null : { numero: a.numero, completa: a.completa, apuradaPor: a.criadoPor }, certificacao: a?.situacao ?? null, gruposPendentesDeEmpenho: 0, componentesSemGrupo: [], empenhosDaApuracao: empenhos.length, liquidados: empenhos.filter((e) => e.liquidacao !== null).length },
    { apurou: false, certificou: certificacao?.criadoPor === d.criadoPor, designado: null }
  ));
  if (a === null || certificacao === undefined) throw new Error("estado inconsistente");
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.liquidarEncargosDaFolha, "ENTE");
  });
  const semContas = [...new Set(empenhos.filter((e) => e.liquidacao === null && (e.grupo.contaVariacao === null || e.grupo.contaObrigacao === null)).map((e) => e.grupo.codigo))];
  if (semContas.length > 0) throw new Error(`GRUPO-SEM-CONTAS-DA-LIQUIDACAO: ${semContas.join(", ")} não declara(m) as contas da liquidação dos encargos. Nada foi gravado.`);
  const responsavelAtesto = `${certificacao.designacao.pessoa.versoes[0]?.nome ?? certificacao.designacao.pessoa.documento} (${certificacao.designacao.atoDesignacao})`;
  const deps = criarM05DepsComContratos(prisma);
  let liquidadas = 0;
  let jaExistiam = 0;
  let total = toMoney(0);
  for (const e of empenhos) {
    const valor = toMoney(e.valor);
    total = toMoney(total.plus(valor));
    if (e.liquidacao !== null) {
      jaExistiam += 1;
      continue;
    }
    const numero = e.empenho.numero;
    try {
      const ja = await prisma.liquidacao.findUnique({ where: { empenhoId_numero: { empenhoId: e.empenhoId, numero } }, select: { id: true } });
      const liquidacaoId =
        ja?.id ??
        (
          await liquidar(
            {
              empenhoId: e.empenhoId, numero, valor: valor.toFixed(2), data: d.data, responsavelAtesto,
              historico: `Encargos do empregador — folha ${folha.tipo.toLowerCase()} de ${folha.competencia}, ${e.grupo.descricao}. Apuração nº ${a.numero} certificada por ${responsavelAtesto}; liquidação de ${diaCivil(d.data)}.`,
              criadoPor: d.criadoPor,
            },
            roteiroLiquidacaoDaFolha({ variacaoDiminutiva: e.grupo.contaVariacao!.codigo, obrigacaoAPagar: e.grupo.contaObrigacao!.codigo }),
            deps
          )
        ).liquidacaoId;
      await prisma.liquidacaoDosEncargos.create({ data: { empenhoDosEncargosId: e.id, certificacaoId: certificacao.id, liquidacaoId, valor: valor.toFixed(2), criadoPor: d.criadoPor } });
      liquidadas += 1;
    } catch (err) {
      throw new Error(`LIQUIDACAO-DOS-ENCARGOS-INTERROMPIDA: ${liquidadas} liquidação(ões) gravada(s); parou no grupo ${e.grupo.codigo}. Motivo: ${err instanceof Error ? err.message : String(err)} As gravadas continuam válidas; liquidar de novo continua de onde parou.`);
    }
  }
  return { competencia: folha.competencia, liquidadas, jaExistiam, pendentes: empenhos.length - liquidadas - jaExistiam, total };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A LEITURA DA TELA — apurações com comparativo, atesto, empenhos e liquidações
// ═══════════════════════════════════════════════════════════════════════════════

export interface EncargosLidos {
  readonly vigente: {
    readonly id: string;
    readonly numero: number;
    readonly complementar: boolean;
    readonly completa: boolean;
    readonly esperados: number;
    readonly total: Money;
    readonly sha256: string;
    readonly apuradaPor: string;
    readonly apuradaEm: Date;
    readonly situacao: SituacaoDaCertificacao;
    readonly porComponente: readonly ResumoDoComponente[];
    readonly itens: readonly Record<string, unknown>[];
  } | null;
  readonly anteriores: readonly { readonly numero: number; readonly total: Money; readonly sha256: string; readonly apuradaEm: Date; readonly porComponente: readonly ResumoDoComponente[] }[];
  /** Por componente: vigente − anterior imediatamente precedente. */
  readonly comparativo: readonly { readonly codigo: string; readonly anterior: string; readonly vigente: string; readonly diferenca: string }[];
  readonly atestos: readonly { readonly id: string; readonly apuracao: number; readonly tipo: string; readonly motivo: string | null; readonly responsavel: string; readonly quando: Date; readonly criadoPor: string }[];
  readonly empenhos: readonly { readonly apuracao: number; readonly grupo: string; readonly numero: string; readonly empenhoId: string; readonly valor: Money; readonly liquidacao: { readonly numero: string; readonly data: Date } | null }[];
}

export async function encargosDaFolha(prisma: PrismaClient, folhaId: string): Promise<EncargosLidos> {
  const apuracoes = await prisma.apuracaoDeEncargos.findMany({
    where: { folhaId }, orderBy: [{ criadoEm: "desc" }, { numero: "desc" }],
    select: { id: true, numero: true, complementar: true, completa: true, esperados: true, total: true, sha256: true, criadoPor: true, criadoEm: true, memoria: true, certificacoes: { orderBy: { criadoEm: "asc" }, select: { id: true, tipo: true, motivo: true, criadoEm: true, criadoPor: true, designacao: { select: { atoDesignacao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } } },
  });
  const [v, anterior] = apuracoes;
  const memo = (m: unknown) => m as { porComponente?: ResumoDoComponente[]; itens?: Record<string, unknown>[] };
  const empenhos = await prisma.empenhoDosEncargos.findMany({
    where: { apuracao: { folhaId } }, orderBy: [{ criadoEm: "asc" }],
    select: { valor: true, empenhoId: true, apuracao: { select: { numero: true } }, grupo: { select: { codigo: true } }, empenho: { select: { numero: true } }, liquidacao: { select: { liquidacao: { select: { numero: true, data: true } } } } },
  });
  const porCodigo = (lista: readonly ResumoDoComponente[]) => new Map(lista.map((p) => [p.codigo, p.total]));
  const vig = v === undefined ? new Map<string, string>() : porCodigo(memo(v.memoria).porComponente ?? []);
  const ant = anterior === undefined ? new Map<string, string>() : porCodigo(memo(anterior.memoria).porComponente ?? []);
  const codigos = [...new Set([...vig.keys(), ...ant.keys()])].sort();
  return {
    vigente: v === undefined ? null : {
      id: v.id, numero: v.numero, complementar: v.complementar, completa: v.completa, esperados: v.esperados, total: toMoney(v.total), sha256: v.sha256,
      apuradaPor: v.criadoPor, apuradaEm: v.criadoEm,
      situacao: situacaoDaCertificacao(v.certificacoes.map((c) => ({ tipo: c.tipo, calculoId: v.id, criadoEm: c.criadoEm })), v.id),
      porComponente: memo(v.memoria).porComponente ?? [], itens: memo(v.memoria).itens ?? [],
    },
    anteriores: apuracoes.slice(1).map((a) => ({ numero: a.numero, total: toMoney(a.total), sha256: a.sha256, apuradaEm: a.criadoEm, porComponente: memo(a.memoria).porComponente ?? [] })),
    comparativo: anterior === undefined ? [] : codigos.map((c) => {
      const va = new Decimal(ant.get(c) ?? "0");
      const vv = new Decimal(vig.get(c) ?? "0");
      return { codigo: c, anterior: va.toFixed(2), vigente: vv.toFixed(2), diferenca: toMoney(vv.minus(va)).toFixed(2) };
    }),
    atestos: apuracoes.flatMap((a) => a.certificacoes.map((c) => ({ id: c.id, apuracao: a.numero, tipo: c.tipo, motivo: c.motivo, responsavel: `${c.designacao.pessoa.versoes[0]?.nome ?? c.designacao.pessoa.documento} (${c.designacao.atoDesignacao})`, quando: c.criadoEm, criadoPor: c.criadoPor }))),
    empenhos: empenhos.map((e) => ({ apuracao: e.apuracao.numero, grupo: e.grupo.codigo, numero: e.empenho.numero, empenhoId: e.empenhoId, valor: toMoney(e.valor), liquidacao: e.liquidacao === null ? null : { numero: e.liquidacao.liquidacao.numero, data: e.liquidacao.liquidacao.data } })),
  };
}

