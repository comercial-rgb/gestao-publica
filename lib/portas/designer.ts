import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao } from "./sessao";
import { COLUNAS_DA_FONTE } from "../../modules/m26-designer/fontes";
import { FUNCOES } from "../../modules/m26-designer/gramatica";
import {
  copiarModeloDeRelatorio,
  criarModeloDeRelatorio,
  distribuirModeloDeRelatorio,
  executarRelatorio,
  processarExecucoesPendentes,
  retirarModeloDeRelatorio,
} from "../../modules/m26-designer/servico";

/**
 * PORTA — DESIGNER DE RELATÓRIOS (M26).
 *
 * ⚠️ A EXPRESSÃO NUNCA É AVALIADA AQUI. Quem a analisa e a executa é o domínio, com a
 * gramática segura e o limite de passos. A porta transporta texto.
 */

export { PortaSemBancoError };

export interface ColunaDisponivel {
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo: string;
}

export interface FuncaoDisponivel {
  readonly nome: string;
  readonly ajuda: string;
}

export interface ModeloDaTela {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly fonte: string;
  readonly visibilidade: string;
  readonly versao: number;
  readonly vigenciaInicio: Date;
  readonly retirado: boolean;
  readonly meu: boolean;
  readonly copiadoDe: string | null;
  readonly distribuidoPara: readonly string[];
  readonly colunas: readonly {
    readonly ordem: number;
    readonly rotulo: string;
    readonly expressao: string;
    readonly tipo: string;
  }[];
}

export interface ExecucaoDaTela {
  readonly id: string;
  readonly modelo: string;
  readonly situacao: "PENDENTE" | "CONCLUIDA" | "FALHOU";
  readonly detalhe: string | null;
  readonly linhas: number | null;
  readonly filtros: string | null;
  readonly criadoPor: string;
  readonly criadoEm: Date;
}

export function lerColunasDaFonte(fonte: string): readonly ColunaDisponivel[] {
  return (COLUNAS_DA_FONTE[fonte] ?? []).map((c) => ({
    nome: c.nome,
    rotulo: c.rotulo,
    tipo: c.tipo,
  }));
}

export function lerFuncoesDaGramatica(): readonly FuncaoDisponivel[] {
  return Object.entries(FUNCOES).map(([nome, f]) => ({ nome, ajuda: f.ajuda }));
}

export async function lerUnidades(): Promise<readonly { readonly id: string; readonly rotulo: string }[]> {
  const us = await cliente().unidadeOrcamentaria.findMany({
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
  });
  return us.map((u) => ({ id: u.id, rotulo: `${u.codigo} — ${u.descricao}` }));
}

/**
 * OS MODELOS QUE ESTE USUÁRIO PODE VER.
 *
 * ⚠️ MODELO RESTRITO SÓ APARECE PARA O AUTOR. Mostrá-lo cinza a terceiros já entregaria
 * o nome e a existência — e o nome de um relatório costuma dizer o que ele mede.
 */
export async function lerModelos(): Promise<readonly ModeloDaTela[]> {
  const sessao = await exigirSessao();
  const modelos = await cliente().modeloDeRelatorio.findMany({
    where: {
      OR: [{ visibilidade: "PUBLICO" }, { criadoPor: sessao.identificador }],
    },
    select: {
      id: true,
      codigo: true,
      nome: true,
      descricao: true,
      fonte: true,
      visibilidade: true,
      versao: true,
      vigenciaInicio: true,
      criadoPor: true,
      retirada: { select: { id: true } },
      copiadoDe: { select: { codigo: true } },
      distribuicoes: { select: { unidadeOrc: { select: { codigo: true } } } },
      colunas: {
        select: { ordem: true, rotulo: true, expressao: true, tipo: true },
        orderBy: { ordem: "asc" },
      },
    },
    orderBy: [{ codigo: "asc" }, { versao: "desc" }],
  });

  return modelos.map((m) => ({
    id: m.id,
    codigo: m.codigo,
    nome: m.nome,
    descricao: m.descricao,
    fonte: m.fonte,
    visibilidade: m.visibilidade,
    versao: m.versao,
    vigenciaInicio: m.vigenciaInicio,
    retirado: m.retirada !== null,
    meu: m.criadoPor === sessao.identificador,
    copiadoDe: m.copiadoDe?.codigo ?? null,
    distribuidoPara: m.distribuicoes.map((d) => d.unidadeOrc.codigo),
    colunas: m.colunas,
  }));
}

/**
 * AS EXECUÇÕES DO USUÁRIO — e a leitura DRENA A FILA antes de listar.
 *
 * ⚠️ ISSO É DECLARADO, E É UM REMENDO HONESTO. Não há processo dedicado neste
 * repositório (pendência DESIGNER-WORKER-CONTINUO); drenar ao abrir a tela faz o
 * caminho normal do usuário funcionar sem depender de alguém lembrar de rodar o
 * comando. O que ele NÃO faz é fingir que o relatório saiu na hora: a execução continua
 * sendo enfileirada, e a notificação de término é real.
 */
export async function lerExecucoes(): Promise<readonly ExecucaoDaTela[]> {
  const sessao = await exigirSessao();
  await processarExecucoesPendentes(cliente(), 20);

  const execucoes = await cliente().execucaoDeRelatorio.findMany({
    where: { criadoPor: sessao.identificador },
    select: {
      id: true,
      filtros: true,
      criadoPor: true,
      criadoEm: true,
      modelo: { select: { nome: true } },
      movimentos: { select: { tipo: true, detalhe: true }, orderBy: { criadoEm: "desc" }, take: 1 },
      resultado: { select: { linhas: true } },
    },
    orderBy: { criadoEm: "desc" },
    take: 100,
  });

  return execucoes.map((e): ExecucaoDaTela => {
    const ultimo = e.movimentos[0];
    return {
      id: e.id,
      modelo: e.modelo.nome,
      situacao:
        ultimo === undefined
          ? "PENDENTE"
          : ultimo.tipo === "CONCLUSAO"
            ? "CONCLUIDA"
            : "FALHOU",
      detalhe: ultimo?.detalhe ?? null,
      linhas: e.resultado?.linhas ?? null,
      filtros: e.filtros,
      criadoPor: e.criadoPor,
      criadoEm: e.criadoEm,
    };
  });
}

/** O CSV de uma execução — só de quem a pediu. */
export async function lerResultado(execucaoId: string): Promise<string | null> {
  const sessao = await exigirSessao();
  const e = await cliente().execucaoDeRelatorio.findUnique({
    where: { id: execucaoId },
    select: { criadoPor: true, resultado: { select: { csv: true } } },
  });
  if (e === null || e.criadoPor !== sessao.identificador) return null;
  return e.resultado?.csv ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITAS
// ═══════════════════════════════════════════════════════════════════════════

export async function criarModeloNaTela(input: {
  readonly unidadeOrcId: string;
  readonly codigo: string;
  readonly nome: string;
  readonly descricao?: string | undefined;
  readonly fonte: "PROCESSOS" | "COMUNICADOS";
  readonly visibilidade: "PUBLICO" | "AUTOR";
  readonly colunas: readonly {
    readonly ordem: number;
    readonly rotulo: string;
    readonly expressao: string;
    readonly tipo: "TEXTO" | "NUMERO" | "MOEDA" | "DATA" | "BOOLEANO";
  }[];
}): Promise<{ readonly modeloId: string }> {
  return comEscritaAutenticada("CRIAR_MODELO_DE_RELATORIO", (criadoPor) =>
    criarModeloDeRelatorio(cliente(), {
      ...input,
      colunas: input.colunas.map((c) => ({ ...c })),
      criadoPor,
    })
  );
}

export async function copiarModeloNaTela(input: {
  readonly modeloId: string;
  readonly novoCodigo: string;
  readonly novoNome: string;
}): Promise<{ readonly modeloId: string }> {
  return comEscritaAutenticada("COPIAR_MODELO_DE_RELATORIO", (criadoPor) =>
    copiarModeloDeRelatorio(cliente(), { ...input, criadoPor })
  );
}

export async function distribuirModeloNaTela(input: {
  readonly modeloId: string;
  readonly unidadeOrcId: string;
}): Promise<void> {
  await comEscritaAutenticada("DISTRIBUIR_MODELO_DE_RELATORIO", (criadoPor) =>
    distribuirModeloDeRelatorio(cliente(), { ...input, criadoPor })
  );
}

export async function retirarModeloNaTela(input: {
  readonly modeloId: string;
  readonly motivo: string;
}): Promise<void> {
  await comEscritaAutenticada("RETIRAR_MODELO_DE_RELATORIO", (criadoPor) =>
    retirarModeloDeRelatorio(cliente(), { ...input, criadoPor })
  );
}

export async function executarNaTela(input: {
  readonly modeloId: string;
  readonly unidadeOrcId: string;
  readonly filtros?: string | undefined;
}): Promise<{ readonly execucaoId: string }> {
  return comEscritaAutenticada("EXECUTAR_RELATORIO", (criadoPor) =>
    executarRelatorio(cliente(), { ...input, criadoPor })
  );
}
