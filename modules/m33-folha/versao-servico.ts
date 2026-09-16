import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal } from "../../packages/contracts/index.js";
import { zCompetencia } from "./dominio.js";
import {
  CicloDeRubricasError,
  DependenciaInexistenteError,
  DependenciaPosteriorError,
  FormulaDaRubricaInvalidaError,
  analisarFormulaDaRubrica,
  escolherVersaoVigente,
  ordemDeCalculo,
  type NoDoGrafo,
  type VersaoLida,
} from "./rubrica-versionada.js";
import type { NaturezaDaRubrica } from "./dominio.js";

/**
 * ═══ M33 — OS ATOS DA RUBRICA VERSIONADA (V11 V1.1) ═══
 *
 * Escrever a versão, aprovar e revogar são TRÊS atos, com três ações do censo. Quem digita a
 * fórmula de um adicional não é necessariamente quem responde por ela valer na folha inteira; um
 * ato só faria do aprovador um campo sem significado.
 *
 * ⚠️ O GRAFO É CONFERIDO DUAS VEZES: ao escrever e ao APROVAR. Entre uma coisa e outra alguém
 * pode ter revogado a rubrica que esta fórmula cita — e aprovar uma versão que não tem como
 * calcular deixaria a folha inteira recusando no dia do fechamento, longe daqui.
 */

export class VersaoNaoEncontradaError extends Error {
  constructor(id: string) {
    super(`VERSAO-INEXISTENTE: a versão ${id} não existe. Nada foi gravado.`);
    this.name = "VersaoNaoEncontradaError";
  }
}

export class SituacaoImpedeError extends Error {
  constructor(readonly esperada: string, readonly atual: string, readonly ato: string) {
    super(`SITUACAO-IMPEDE: ${ato} exige versão ${esperada}; esta está ${atual}. Nada foi gravado.`);
    this.name = "SituacaoImpedeError";
  }
}

export class AprovacaoPeloProprioAutorError extends Error {
  constructor(readonly autor: string) {
    super(`APROVACAO-PELO-PROPRIO-AUTOR: quem escreveu a versão não a aprova. A revisão existe para que outra pessoa confira a fórmula, a vigência e o fundamento antes de ela alcançar a folha. Nada foi gravado.`);
    this.name = "AprovacaoPeloProprioAutorError";
  }
}

export class VigenciaInvalidaError extends Error {
  constructor(motivo: string) {
    super(`VIGENCIA-INVALIDA: ${motivo} Nada foi gravado.`);
    this.name = "VigenciaInvalidaError";
  }
}

/** O mês anterior a uma competência AAAA-MM. Janeiro recua para dezembro do ano anterior. */
export function competenciaAnterior(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

export const zCriarVersaoDaRubricaInput = z
  .object({
    rubricaId: z.string().min(1),
    competenciaInicio: zCompetencia,
    competenciaFim: zCompetencia.nullable().optional(),
    formula: z.string().max(2000).nullable().optional(),
    percentual: z.instanceof(Decimal).nullable().optional(),
    incideContribuicao: z.boolean(),
    incideIrrf: z.boolean(),
    proporcionalAosDias: z.boolean(),
    casasDecimais: z.number().int().min(0).max(6).default(2),
    regime: z.enum(["TODOS", "RGPS", "RPPS", "ISENTO"]).default("TODOS"),
    fundamentacaoLegal: z.string().min(1),
    criadoPor: z.string().min(1),
  })
  .strict();
export type CriarVersaoDaRubricaInput = z.input<typeof zCriarVersaoDaRubricaInput>;

export const zAprovarVersaoDaRubricaInput = z.object({ versaoId: z.string().min(1), aprovadoPor: z.string().min(1) }).strict();
export const zRevogarVersaoDaRubricaInput = z
  .object({ versaoId: z.string().min(1), motivo: z.string().min(1), revogadoPor: z.string().min(1) })
  .strict();

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Lê o grafo do ente tal como ele ficaria COM esta versão valendo na competência dada. */
async function conferirGrafo(
  tx: Tx,
  p: { readonly codigo: string; readonly natureza: NaturezaDaRubrica; readonly ordem: number; readonly formula: string | null; readonly competencia: string; readonly regime: "TODOS" | "RGPS" | "RPPS" | "ISENTO" },
): Promise<readonly string[]> {
  const dependencias = p.formula === null ? [] : analisarFormulaDaRubrica(p.codigo, p.formula).dependencias;
  const todas = await tx.rubrica.findMany({
    select: {
      codigo: true, natureza: true, ordem: true,
      versoes: { select: { id: true, versao: true, competenciaInicio: true, competenciaFim: true, formula: true, percentual: true, incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, casasDecimais: true, regime: true, fundamentacaoLegal: true, situacao: true } },
    },
  });
  // ⚠️ O REGIME DA CONFERÊNCIA: uma versão marcada para um regime só é conferida NAQUELE regime;
  // uma de TODOS é conferida no RPPS, que é o caso geral do ente. Conferir no regime errado
  // aprovaria uma fórmula cuja dependência não existe para quem vai usá-la.
  const regimeDaConferencia = p.regime === "TODOS" ? "RPPS" : p.regime;
  const nos: NoDoGrafo[] = [];
  for (const r of todas) {
    const versoes: VersaoLida[] = r.versoes.map((v) => ({ ...v, percentual: v.percentual === null ? null : new Decimal(v.percentual), regime: v.regime as VersaoLida["regime"], situacao: v.situacao as VersaoLida["situacao"] }));
    if (r.codigo === p.codigo) {
      nos.push({ codigo: r.codigo, natureza: r.natureza as NaturezaDaRubrica, ordem: r.ordem, dependencias });
      continue;
    }
    const vigente = escolherVersaoVigente(r.codigo, versoes, p.competencia, regimeDaConferencia);
    if (vigente === null) continue;
    nos.push({
      codigo: r.codigo,
      natureza: r.natureza as NaturezaDaRubrica,
      ordem: r.ordem,
      dependencias: vigente.formula === null ? [] : analisarFormulaDaRubrica(r.codigo, vigente.formula).dependencias,
    });
  }
  ordemDeCalculo(nos); // lança DependenciaInexistente, DependenciaPosterior ou Ciclo
  return dependencias;
}

export async function criarVersaoDaRubrica(prisma: PrismaClient, input: CriarVersaoDaRubricaInput): Promise<{ readonly versaoId: string; readonly versao: number; readonly dependencias: readonly string[] }> {
  const d = zCriarVersaoDaRubricaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarVersaoDaRubrica, "ENTE");
    const r = await tx.rubrica.findUnique({ where: { id: d.rubricaId }, select: { id: true, codigo: true, natureza: true, ordem: true, versoes: { select: { versao: true } } } });
    if (r === null) throw new Error(`Rubrica ${d.rubricaId} não existe. Nada foi gravado.`);
    const natureza = r.natureza as NaturezaDaRubrica;
    const formula = d.formula ?? null;

    // ⚠️ FÓRMULA SÓ ONDE A NATUREZA É FÓRMULA, e fórmula OBRIGATÓRIA quando ela é. Guardar uma
    // expressão numa rubrica de vencimento-base deixaria no cadastro uma conta que ninguém
    // executa — e quem lesse a tela acreditaria nela.
    if (natureza === "FORMULA" && formula === null) throw new FormulaDaRubricaInvalidaError(r.codigo, "a rubrica é de natureza FORMULA e nenhuma expressão foi informada.");
    if (natureza !== "FORMULA" && formula !== null) throw new FormulaDaRubricaInvalidaError(r.codigo, `a rubrica é de natureza ${natureza}; o valor dela não vem de fórmula. Mude a natureza ou remova a expressão.`);
    if (natureza === "FORMULA" && d.proporcionalAosDias) {
      throw new FormulaDaRubricaInvalidaError(r.codigo, "uma versão de FORMULA não pode ser proporcional aos dias: a proporcionalidade se escreve na própria fórmula, com a variável fator_dias. Aplicar as duas contaria os dias duas vezes.");
    }
    if (natureza === "PERCENTUAL_DO_VENCIMENTO" && (d.percentual === null || d.percentual === undefined)) {
      throw new Error(`PERCENTUAL-AUSENTE: a rubrica ${r.codigo} é PERCENTUAL_DO_VENCIMENTO e a versão não informou o percentual. Nada foi gravado.`);
    }
    if (d.competenciaFim !== null && d.competenciaFim !== undefined && d.competenciaFim < d.competenciaInicio) {
      throw new VigenciaInvalidaError(`o fim ${d.competenciaFim} é anterior ao início ${d.competenciaInicio}.`);
    }

    const dependencias = await conferirGrafo(tx, { codigo: r.codigo, natureza, ordem: r.ordem, formula, competencia: d.competenciaInicio, regime: d.regime });

    const proxima = Math.max(0, ...r.versoes.map((v) => v.versao)) + 1;
    const criada = await tx.versaoDaRubrica.create({
      data: {
        rubricaId: r.id, versao: proxima, competenciaInicio: d.competenciaInicio,
        competenciaFim: d.competenciaFim ?? null, formula,
        percentual: d.percentual === null || d.percentual === undefined ? null : d.percentual.toFixed(4),
        incideContribuicao: d.incideContribuicao, incideIrrf: d.incideIrrf,
        proporcionalAosDias: d.proporcionalAosDias, casasDecimais: d.casasDecimais,
        regime: d.regime, fundamentacaoLegal: d.fundamentacaoLegal,
        situacao: "RASCUNHO", criadoPor: d.criadoPor,
        dependencias: { create: dependencias.map((c) => ({ codigoDaDependencia: c })) },
      },
      select: { id: true, versao: true },
    });
    return { versaoId: criada.id, versao: criada.versao, dependencias };
  });
}

export async function aprovarVersaoDaRubrica(prisma: PrismaClient, input: z.input<typeof zAprovarVersaoDaRubricaInput>): Promise<{ readonly versaoId: string; readonly anteriorFechadaEm: string | null }> {
  const d = zAprovarVersaoDaRubricaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.aprovadoPor, ACAO_DO_SERVICO.aprovarVersaoDaRubrica, "ENTE");
    const v = await tx.versaoDaRubrica.findUnique({
      where: { id: d.versaoId },
      select: { id: true, versao: true, situacao: true, criadoPor: true, competenciaInicio: true, formula: true, regime: true, rubrica: { select: { id: true, codigo: true, natureza: true, ordem: true } } },
    });
    if (v === null) throw new VersaoNaoEncontradaError(d.versaoId);
    if (v.situacao !== "RASCUNHO") throw new SituacaoImpedeError("RASCUNHO", v.situacao, "aprovar");
    // ⚠️ SEGREGAÇÃO, como na certificação da folha: quem escreveu não aprova.
    if (v.criadoPor === d.aprovadoPor) throw new AprovacaoPeloProprioAutorError(d.aprovadoPor);

    await conferirGrafo(tx, {
      codigo: v.rubrica.codigo, natureza: v.rubrica.natureza as NaturezaDaRubrica, ordem: v.rubrica.ordem,
      formula: v.formula, competencia: v.competenciaInicio, regime: v.regime as "TODOS" | "RGPS" | "RPPS" | "ISENTO",
    });

    /**
     * ⚠️ APROVAR A SUCESSORA FECHA A ANTECESSORA — e é o único caminho pela tela para suceder uma
     * versão sem apagar a anterior. Sem isto, as duas ficariam vigentes na mesma competência e o
     * motor recusaria por ambiguidade no dia do cálculo, longe daqui.
     */
    const abertas = await tx.versaoDaRubrica.findMany({
      where: { rubricaId: v.rubrica.id, situacao: "APROVADA", regime: v.regime, id: { not: v.id }, OR: [{ competenciaFim: null }, { competenciaFim: { gte: v.competenciaInicio } }] },
      select: { id: true, versao: true, competenciaInicio: true },
    });
    const fim = competenciaAnterior(v.competenciaInicio);
    for (const a of abertas) {
      if (a.competenciaInicio >= v.competenciaInicio) {
        throw new VigenciaInvalidaError(`a versão ${a.versao} já vale desde ${a.competenciaInicio}, que não é anterior a ${v.competenciaInicio}; ela teria de ser revogada antes.`);
      }
      await tx.versaoDaRubrica.update({ where: { id: a.id }, data: { competenciaFim: fim } });
    }

    await tx.versaoDaRubrica.update({ where: { id: v.id }, data: { situacao: "APROVADA", aprovadoPor: d.aprovadoPor, aprovadoEm: new Date() } });
    return { versaoId: v.id, anteriorFechadaEm: abertas.length === 0 ? null : fim };
  });
}

export async function revogarVersaoDaRubrica(prisma: PrismaClient, input: z.input<typeof zRevogarVersaoDaRubricaInput>): Promise<{ readonly versaoId: string }> {
  const d = zRevogarVersaoDaRubricaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.revogadoPor, ACAO_DO_SERVICO.revogarVersaoDaRubrica, "ENTE");
    const v = await tx.versaoDaRubrica.findUnique({ where: { id: d.versaoId }, select: { id: true, situacao: true } });
    if (v === null) throw new VersaoNaoEncontradaError(d.versaoId);
    if (v.situacao === "REVOGADA") throw new SituacaoImpedeError("RASCUNHO ou APROVADA", v.situacao, "revogar");
    // ⚠️ REVOGAR É FATO, NÃO APAGAMENTO: a folha que usou esta versão continua explicável, com a
    // fórmula e o fundamento que valiam no dia. O que muda é que ela deixa de valer daqui para a
    // frente — e o motivo fica gravado.
    await tx.versaoDaRubrica.update({ where: { id: v.id }, data: { situacao: "REVOGADA", revogadoPor: d.revogadoPor, revogadoEm: new Date(), motivoDaRevogacao: d.motivo } });
    return { versaoId: v.id };
  });
}

export { CicloDeRubricasError, DependenciaInexistenteError, DependenciaPosteriorError, FormulaDaRubricaInvalidaError };
