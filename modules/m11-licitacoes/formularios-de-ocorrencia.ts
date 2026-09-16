import { z } from "zod";
import { diaCivil, diaCivilBr, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * ═══ M11 — OS TIPOS DE OCORRÊNCIA DO ENTE E OS FORMULÁRIOS VERSIONADOS (V7 M2 U8) ═══
 *
 * O tipo de ocorrência ("descumprimento do contrato", "demora no serviço") é CADASTRO do ente, e o formulário que o
 * fiscal responde é uma VERSÃO dele. A ocorrência guarda a versão usada e as respostas presas às perguntas daquela
 * versão: publicar outra versão ou desativar o tipo NÃO reinterpreta o que já foi respondido — o histórico continua
 * legível como foi preenchido.
 *
 * ⚠️ Módulo sem dependência do contrato: quem registra a ocorrência (em `fiscalizacao.ts`) já cobrou a ação e a
 * designação, e chama `conferirFormularioDaOcorrencia` dentro da mesma transação.
 */


type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const hoje = (): string => diaCivil(new Date());
const br = (dia: string): string => dia.split("-").reverse().join("/");

export const TIPOS_DE_RESPOSTA = ["TEXTO", "NUMERO", "DATA", "OPCAO", "SIM_NAO"] as const;
export type TipoDeResposta = (typeof TIPOS_DE_RESPOSTA)[number];

// ═══════════════════════════════════════════════════════════════════════════════
// OS TIPOS DE OCORRÊNCIA E OS FORMULÁRIOS
// ═══════════════════════════════════════════════════════════════════════════════

export const zCadastrarTipoDeOcorrencia = z
  .object({
    codigo: z.string().trim().min(2).max(30).regex(/^[A-Z0-9-]+$/, "O código usa letras maiúsculas, números e hífen."),
    nome: z.string().trim().min(3),
    natureza: z.enum(["CONFORMIDADE", "NAO_CONFORMIDADE", "ATRASO", "IMPEDIMENTO", "OUTRO"]),
    criadoPor: z.string().min(1),
  })
  .strict();
export type CadastrarTipoDeOcorrenciaInput = z.input<typeof zCadastrarTipoDeOcorrencia>;

/** O tipo nasce ATIVO, e a atividade é fato com motivo (como a desativação). */
export async function cadastrarTipoDeOcorrencia(prisma: PrismaClient, input: CadastrarTipoDeOcorrenciaInput): Promise<{ readonly tipoId: string }> {
  const d = zCadastrarTipoDeOcorrencia.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarTipoDeOcorrencia, "ENTE");
      const r = await tx.tipoDeOcorrenciaDoEnte.create({
        data: { codigo: d.codigo, nome: d.nome, natureza: d.natureza, criadoPor: d.criadoPor, mudancas: { create: { ativo: true, motivo: "Cadastro do tipo de ocorrência.", criadoPor: d.criadoPor } } },
        select: { id: true },
      });
      return { tipoId: r.id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error(`TIPO-JA-CADASTRADO: já existe tipo de ocorrência com o código ${d.codigo}. Nada foi gravado.`);
    throw e;
  }
}

const zPergunta = z
  .object({
    codigo: z.string().trim().min(1).max(40),
    rotulo: z.string().trim().min(3),
    tipoDeResposta: z.enum(TIPOS_DE_RESPOSTA),
    obrigatoria: z.boolean(),
    opcoes: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export const zPublicarVersaoDoTipoDeOcorrencia = z
  .object({
    tipoId: z.string().min(1),
    exigeGravidade: z.boolean(),
    encaminhamentoPadrao: z.enum(["NENHUM", "GESTOR"]),
    vigenciaInicio: zDia,
    motivo: z.string().trim().min(5),
    perguntas: z.array(zPergunta).min(1).max(40),
    criadoPor: z.string().min(1),
  })
  .strict();
export type PublicarVersaoDoTipoDeOcorrenciaInput = z.input<typeof zPublicarVersaoDoTipoDeOcorrencia>;

/** A versão nova vale a partir da vigência; a anterior continua valendo para quem já respondeu por ela. */
export async function publicarVersaoDoTipoDeOcorrencia(prisma: PrismaClient, input: PublicarVersaoDoTipoDeOcorrenciaInput): Promise<{ readonly versaoId: string; readonly versao: number; readonly perguntas: number }> {
  const d = zPublicarVersaoDoTipoDeOcorrencia.parse(input);
  const codigos = d.perguntas.map((p) => p.codigo);
  if (new Set(codigos).size !== codigos.length) throw new Error("PERGUNTA-REPETIDA: cada pergunta tem um código próprio no formulário. Nada foi gravado.");
  for (const p of d.perguntas) {
    if (p.tipoDeResposta === "OPCAO") {
      if (p.opcoes.length < 2) throw new Error(`PERGUNTA-SEM-OPCOES: a pergunta ${p.codigo} é de lista de opções e precisa de pelo menos duas. Nada foi gravado.`);
      if (new Set(p.opcoes).size !== p.opcoes.length) throw new Error(`OPCAO-REPETIDA: a pergunta ${p.codigo} tem opções repetidas. Nada foi gravado.`);
    } else if (p.opcoes.length > 0) {
      throw new Error(`OPCOES-EM-PERGUNTA-QUE-NAO-E-LISTA: a pergunta ${p.codigo} é do tipo ${p.tipoDeResposta} e não tem lista de opções. Nada foi gravado.`);
    }
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarVersaoDoTipoDeOcorrencia, "ENTE");
    const tipo = await tx.tipoDeOcorrenciaDoEnte.findUnique({ where: { id: d.tipoId }, select: { codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { versao: true, vigenciaInicio: true } } } });
    if (tipo === null) throw new Error("TIPO-INEXISTENTE: o tipo de ocorrência indicado não existe. Nada foi gravado.");
    const ultima = tipo.versoes[0];
    if (ultima !== undefined && d.vigenciaInicio < diaCivil(ultima.vigenciaInicio)) {
      throw new Error(`VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE: a versão ${ultima.versao} do tipo ${tipo.codigo} vale desde ${diaCivilBr(ultima.vigenciaInicio)}; a nova não pode valer antes. Nada foi gravado.`);
    }
    const versao = (ultima?.versao ?? 0) + 1;
    const r = await tx.versaoDoTipoDeOcorrencia.create({
      data: {
        tipoId: d.tipoId, versao, exigeGravidade: d.exigeGravidade, encaminhamentoPadrao: d.encaminhamentoPadrao, vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), motivo: d.motivo, criadoPor: d.criadoPor,
        perguntas: { create: d.perguntas.map((p, i) => ({ ordem: i + 1, codigo: p.codigo, rotulo: p.rotulo, tipoDeResposta: p.tipoDeResposta, obrigatoria: p.obrigatoria, opcoes: p.opcoes })) },
      },
      select: { id: true },
    });
    return { versaoId: r.id, versao, perguntas: d.perguntas.length };
  });
}

export const zMudarSituacaoDoTipo = z.object({ tipoId: z.string().min(1), ativo: z.boolean(), motivo: z.string().trim().min(5), criadoPor: z.string().min(1) }).strict();
export type MudarSituacaoDoTipoInput = z.input<typeof zMudarSituacaoDoTipo>;

export async function mudarSituacaoDoTipoDeOcorrencia(prisma: PrismaClient, input: MudarSituacaoDoTipoInput): Promise<{ readonly mudancaId: string; readonly ativo: boolean }> {
  const d = zMudarSituacaoDoTipo.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.mudarSituacaoDoTipoDeOcorrencia, "ENTE");
    const tipo = await tx.tipoDeOcorrenciaDoEnte.findUnique({ where: { id: d.tipoId }, select: { codigo: true, mudancas: { orderBy: { criadoEm: "desc" }, take: 1, select: { ativo: true } } } });
    if (tipo === null) throw new Error("TIPO-INEXISTENTE: o tipo de ocorrência indicado não existe. Nada foi gravado.");
    if ((tipo.mudancas[0]?.ativo ?? true) === d.ativo) throw new Error(`SITUACAO-JA-E-ESSA: o tipo ${tipo.codigo} já está ${d.ativo ? "ativo" : "inativo"}. Nada foi gravado.`);
    const r = await tx.mudancaDeSituacaoDoTipoDeOcorrencia.create({ data: { tipoId: d.tipoId, ativo: d.ativo, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
    return { mudancaId: r.id, ativo: d.ativo };
  });
}

export interface TipoParaPreencher {
  readonly tipoId: string;
  readonly codigo: string;
  readonly nome: string;
  readonly natureza: string;
  readonly ativo: boolean;
  readonly versaoVigente: { readonly id: string; readonly versao: number; readonly exigeGravidade: boolean; readonly encaminhamentoPadrao: "NENHUM" | "GESTOR"; readonly vigenciaInicio: string; readonly perguntas: readonly { readonly id: string; readonly codigo: string; readonly rotulo: string; readonly tipoDeResposta: TipoDeResposta; readonly obrigatoria: boolean; readonly opcoes: readonly string[] }[] } | null;
  readonly versoes: number;
}

/** Os tipos do ente com a versão VIGENTE no dia (a última com vigência até ele) e a situação de hoje. */
export async function tiposDeOcorrenciaDoEnte(prisma: Tx, opcoes: { readonly dia?: string; readonly apenasAtivos?: boolean } = {}): Promise<readonly TipoParaPreencher[]> {
  const dia = opcoes.dia ?? hoje();
  const tipos = await prisma.tipoDeOcorrenciaDoEnte.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true, codigo: true, nome: true, natureza: true,
      mudancas: { orderBy: { criadoEm: "desc" }, take: 1, select: { ativo: true } },
      versoes: { orderBy: { versao: "asc" }, select: { id: true, versao: true, exigeGravidade: true, encaminhamentoPadrao: true, vigenciaInicio: true, perguntas: { orderBy: { ordem: "asc" }, select: { id: true, codigo: true, rotulo: true, tipoDeResposta: true, obrigatoria: true, opcoes: true } } } },
    },
  });
  const saida = tipos.map((t) => {
    const vigente = t.versoes.filter((v) => diaCivil(v.vigenciaInicio) <= dia).at(-1) ?? null;
    return {
      tipoId: t.id, codigo: t.codigo, nome: t.nome, natureza: t.natureza, ativo: t.mudancas[0]?.ativo ?? true, versoes: t.versoes.length,
      versaoVigente: vigente === null ? null : { id: vigente.id, versao: vigente.versao, exigeGravidade: vigente.exigeGravidade, encaminhamentoPadrao: vigente.encaminhamentoPadrao, vigenciaInicio: diaCivil(vigente.vigenciaInicio), perguntas: vigente.perguntas.map((p) => ({ ...p, tipoDeResposta: p.tipoDeResposta as TipoDeResposta, opcoes: p.opcoes })) },
    } satisfies TipoParaPreencher;
  });
  return opcoes.apenasAtivos === true ? saida.filter((t) => t.ativo && t.versaoVigente !== null) : saida;
}

/**
 * A CONFERÊNCIA DO FORMULÁRIO, dentro da transação de quem registra a ocorrência (que já cobrou a ação e a designação):
 * o tipo tem de estar ativo hoje, a versão indicada tem de ser a VIGENTE no dia do fato, as obrigatórias respondidas,
 * e cada resposta no formato da sua pergunta. Devolve as linhas a gravar.
 */
export async function conferirFormularioDaOcorrencia(
  tx: Tx,
  versaoDoTipoId: string,
  diaDoFato: string,
  respostas: readonly { readonly perguntaId: string; readonly valor: string }[],
  gravidade: string | null
): Promise<{ readonly encaminhamentoPadrao: "NENHUM" | "GESTOR"; readonly linhas: readonly { readonly perguntaId: string; readonly valor: string }[] }> {
  const v = await tx.versaoDoTipoDeOcorrencia.findUnique({
    where: { id: versaoDoTipoId },
    select: {
      versao: true, exigeGravidade: true, encaminhamentoPadrao: true, vigenciaInicio: true,
      perguntas: { orderBy: { ordem: "asc" }, select: { id: true, codigo: true, rotulo: true, tipoDeResposta: true, obrigatoria: true, opcoes: true } },
      tipo: { select: { id: true, codigo: true, mudancas: { orderBy: { criadoEm: "desc" }, take: 1, select: { ativo: true } }, versoes: { orderBy: { versao: "asc" }, select: { id: true, versao: true, vigenciaInicio: true } } } },
    },
  });
  if (v === null) throw new Error("VERSAO-DE-FORMULARIO-INEXISTENTE: a versão do tipo de ocorrência indicada não existe. Nada foi gravado.");
  if (!(v.tipo.mudancas[0]?.ativo ?? true)) throw new Error(`TIPO-DESATIVADO: o tipo de ocorrência ${v.tipo.codigo} está inativo e não se usa em ocorrência nova. As ocorrências anteriores continuam como estão. Nada foi gravado.`);
  const vigenteNoDia = v.tipo.versoes.filter((x) => diaCivil(x.vigenciaInicio) <= diaDoFato).at(-1) ?? null;
  if (vigenteNoDia === null) throw new Error(`SEM-VERSAO-VIGENTE-NO-DIA: o tipo ${v.tipo.codigo} não tem versão de formulário valendo em ${br(diaDoFato)}. Nada foi gravado.`);
  if (vigenteNoDia.id !== versaoDoTipoId) {
    throw new Error(`VERSAO-DO-FORMULARIO-NAO-VIGENTE: em ${br(diaDoFato)} vale a versão ${vigenteNoDia.versao} do formulário do tipo ${v.tipo.codigo}, não a versão ${v.versao}. Recarregue a tela. Nada foi gravado.`);
  }
  if (v.exigeGravidade && (gravidade === null || gravidade === "")) throw new Error(`GRAVIDADE-EXIGIDA: o tipo ${v.tipo.codigo} exige a gravidade da ocorrência. Nada foi gravado.`);
  if (!v.exigeGravidade && gravidade !== null && gravidade !== "") throw new Error(`GRAVIDADE-NAO-APLICAVEL: o tipo ${v.tipo.codigo} não classifica gravidade. Nada foi gravado.`);
  const porId = new Map(v.perguntas.map((p) => [p.id, p]));
  const vistas = new Set<string>();
  const linhas: { perguntaId: string; valor: string }[] = [];
  for (const r of respostas) {
    const p = porId.get(r.perguntaId);
    if (p === undefined) throw new Error(`PERGUNTA-DE-OUTRA-VERSAO: uma resposta não pertence à versão ${v.versao} do formulário do tipo ${v.tipo.codigo}. Nada foi gravado.`);
    if (vistas.has(p.id)) throw new Error(`RESPOSTA-REPETIDA: a pergunta "${p.rotulo}" foi respondida duas vezes. Nada foi gravado.`);
    vistas.add(p.id);
    const valor = r.valor.trim();
    if (valor === "") continue;
    const invalida = (motivo: string): never => {
      throw new Error(`RESPOSTA-INVALIDA: a resposta de "${p.rotulo}" ${motivo}. Nada foi gravado.`);
    };
    if (p.tipoDeResposta === "NUMERO" && !/^-?\d+(\.\d{1,4})?$/.test(valor)) invalida("precisa ser um número (até 4 casas, ponto decimal)");
    if (p.tipoDeResposta === "DATA" && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) invalida("precisa ser uma data AAAA-MM-DD");
    if (p.tipoDeResposta === "SIM_NAO" && valor !== "SIM" && valor !== "NAO") invalida("é SIM ou NAO");
    if (p.tipoDeResposta === "OPCAO" && !p.opcoes.includes(valor)) invalida(`precisa ser uma das opções: ${p.opcoes.join(", ")}`);
    linhas.push({ perguntaId: p.id, valor });
  }
  const respondidas = new Set(linhas.map((l) => l.perguntaId));
  const faltando = v.perguntas.filter((p) => p.obrigatoria && !respondidas.has(p.id));
  if (faltando.length > 0) throw new Error(`PERGUNTA-OBRIGATORIA-SEM-RESPOSTA: falta responder ${faltando.map((p) => `"${p.rotulo}"`).join(", ")}. Nada foi gravado.`);
  return { encaminhamentoPadrao: v.encaminhamentoPadrao, linhas };
}

