import {
  declararDadosDaAcao,
  declararDadosDoPrograma,
} from "../../modules/m02-planejamento/declaracao-do-programa.js";
import { vigenteNoCorte } from "../../modules/m02-planejamento/declaracao-da-unidade.js";
import { OBJETIVO_MILENIO_2026 } from "../../modules/m02-planejamento/objetivos-da-agenda-2030.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — PROGRAMAS E AÇÕES DO ORÇAMENTO, com os dados que a prestação de contas pede (SAGRES §4.2 e §4.3). Só os
 * programas e as ações que têm ficha no exercício — é o que vai ao Tribunal. A regra (tamanhos, tabela da Agenda
 * 2030, programa 5000 da Primeira Infância, meta com unidade) é do domínio.
 */

export { OBJETIVO_MILENIO_2026 };

export interface ProgramaNaTela {
  readonly id: string;
  readonly codigo: string;
  readonly descricaoDoCadastro: string;
  readonly vigente: { readonly descricao: string; readonly objetivo: string; readonly ods: string; readonly desde: string; readonly por: string } | null;
}
export interface AcaoNaTela {
  readonly id: string;
  readonly codigo: string;
  readonly tipo: string;
  readonly descricaoDoCadastro: string;
  readonly vigente: { readonly descricao: string; readonly meta: string | null; readonly unidade: string | null; readonly desde: string; readonly por: string } | null;
}

const TIPO: Record<string, string> = { PROJETO: "Projeto", ATIVIDADE: "Atividade", OPERACAO_ESPECIAL: "Operação especial" };

export async function lerProgramasEAcoesDoOrcamento(exercicio: number): Promise<{ readonly programas: readonly ProgramaNaTela[]; readonly acoes: readonly AcaoNaTela[] }> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const prisma = cliente();
  const agora = new Date();
  const [programas, acoes] = await Promise.all([
    prisma.programa.findMany({
      where: { fichas: { some: { exercicio } } },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, descricao: true, declaracoes: { select: { descricao: true, objetivo: true, tipoObjetivoMilenio: true, vigenteDesde: true, criadoEm: true, criadoPor: true } } },
    }),
    prisma.acao.findMany({
      where: { fichas: { some: { exercicio } } },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, descricao: true, tipo: true, declaracoes: { select: { descricao: true, descMeta: true, unidadeMedida: true, vigenteDesde: true, criadoEm: true, criadoPor: true } } },
    }),
  ]);
  return {
    programas: programas.map((g) => {
      const v = vigenteNoCorte(g.declaracoes, agora);
      return {
        id: g.id,
        codigo: g.codigo,
        descricaoDoCadastro: g.descricao,
        vigente: v === null ? null : { descricao: v.descricao, objetivo: v.objetivo, ods: `${v.tipoObjetivoMilenio} — ${OBJETIVO_MILENIO_2026[v.tipoObjetivoMilenio] ?? ""}`, desde: diaCivilBr(v.vigenteDesde), por: v.criadoPor },
      };
    }),
    acoes: acoes.map((a) => {
      const v = vigenteNoCorte(a.declaracoes, agora);
      return {
        id: a.id,
        codigo: a.codigo,
        tipo: TIPO[a.tipo] ?? a.tipo,
        descricaoDoCadastro: a.descricao,
        vigente: v === null ? null : { descricao: v.descricao, meta: v.descMeta, unidade: v.unidadeMedida, desde: diaCivilBr(v.vigenteDesde), por: v.criadoPor },
      };
    }),
  };
}

export async function declararPrograma(input: {
  readonly programaId: string;
  readonly descricao: string;
  readonly objetivo: string;
  readonly tipoObjetivoMilenio: string;
  readonly fundamento: string;
  readonly vigenteDesde: Date;
}): Promise<string> {
  const r = await comEscritaAutenticada("DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA", (criadoPor) => declararDadosDoPrograma(cliente(), { ...input, criadoPor }));
  return `Programa ${r.codigo}: dados declarados, valendo desde ${r.vigenteDesde.split("-").reverse().join("/")}. A declaração anterior continua registrada para os meses em que valeu.`;
}

export async function declararAcao(input: {
  readonly acaoId: string;
  readonly descricao: string;
  readonly descMeta?: string | undefined;
  readonly unidadeMedida?: string | undefined;
  readonly fundamento: string;
  readonly vigenteDesde: Date;
}): Promise<string> {
  const r = await comEscritaAutenticada("DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA", (criadoPor) => declararDadosDaAcao(cliente(), { ...input, criadoPor }));
  return `Ação ${r.codigo}: dados declarados, valendo desde ${r.vigenteDesde.split("-").reverse().join("/")}.`;
}
