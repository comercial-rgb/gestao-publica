import {
  ClassificacaoDoManadInvalidaError,
  classificarAcaoParaOManad,
  classificarNaturezaDespesaParaOManad,
  classificarNaturezaReceitaParaOManad,
  classificarUnidadeParaOManad,
  TIPO_DE_CONTA_MANAD,
  TIPO_MANAD_DA_ACAO,
  type ResultadoDaClassificacao,
} from "../../modules/m14-exports-federais/classificacao-do-manad.js";
import { TIPO_MANAD } from "../../modules/m01-core-contabil/tipo-manad.js";
import {
  declararCentralizacaoDaEscrituracao,
  INDICADORES_DE_CENTRALIZACAO,
} from "../../modules/m01-core-contabil/responsaveis-do-manad.js";
import { autorizar } from "../../modules/m16-travamento/autorizacao.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEntePara } from "./leitura";
import { comEscritaAutenticada, type Identidade } from "./sessao";

/**
 * PORTA — A CLASSIFICAÇÃO DO CADASTRO PARA O ARQUIVO DA RECEITA (MANAD) E A FORMA DE ESCRITURAÇÃO.
 *
 * LEITURA sob `CONSULTAR_CONTABILIDADE` no ente; ESCRITA sob `CADASTRAR_ENTIDADE_CONTABIL`, pelo
 * funil único (`comEscritaAutenticada`), e o domínio confere a mesma ação de novo na transação.
 *
 * ⚠️ PENDENTES PRIMEIRO, E SÓ ELES POR PADRÃO: um ente real tem centenas de naturezas. A tela
 * mostra o que falta classificar (o que derruba o arquivo) e, a pedido, as já classificadas —
 * com teto declarado, nunca a tabela inteira num `select`.
 */

export { ClassificacaoDoManadInvalidaError, TIPO_MANAD, TIPO_MANAD_DA_ACAO, TIPO_DE_CONTA_MANAD, INDICADORES_DE_CENTRALIZACAO };

const ACAO_DE_CADASTRO = "CADASTRAR_ENTIDADE_CONTABIL";

/** Teto das já classificadas por grupo, quando a tela pede todas. */
export const TETO_DAS_CLASSIFICADAS = 200;

export interface ItemDaClassificacao {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  /** Unidade e ação: o código do tipo. Naturezas: "S" ou "A". `null` = pendente. */
  readonly tipo: string | null;
  /** Só naturezas: o nível da conta. */
  readonly nivel: number | null;
}

export interface GrupoDaClassificacao {
  readonly pendentes: readonly ItemDaClassificacao[];
  readonly classificadas: readonly ItemDaClassificacao[];
  readonly totalClassificadas: number;
}

export interface ClassificacaoNaTela {
  readonly unidades: GrupoDaClassificacao;
  readonly acoes: GrupoDaClassificacao;
  readonly naturezasDespesa: GrupoDaClassificacao;
  readonly naturezasReceita: GrupoDaClassificacao;
  readonly centralizacao: string | null;
  readonly podeClassificar: boolean;
}

function grupo(itens: readonly ItemDaClassificacao[], todas: boolean): GrupoDaClassificacao {
  const pendentes = itens.filter((i) => i.tipo === null || (i.nivel === null && i.tipo.length === 1));
  const classificadas = itens.filter((i) => !pendentes.includes(i));
  return { pendentes, classificadas: todas ? classificadas.slice(0, TETO_DAS_CLASSIFICADAS) : [], totalClassificadas: classificadas.length };
}

async function podeCadastrar(sessao: Identidade): Promise<boolean> {
  try {
    await autorizar(cliente(), sessao.identificador, ACAO_DE_CADASTRO);
    return true;
  } catch (e) {
    if (e instanceof Error && /^ACESSO NEGADO/u.test(e.message)) return false;
    throw e;
  }
}

export async function lerClassificacaoDoManadPara(sessao: Identidade, todas: boolean): Promise<ClassificacaoNaTela> {
  await exigirLeituraDoEntePara(sessao, "CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const [unidades, acoes, despesas, receitas, ente, pode] = await Promise.all([
    prisma.unidadeOrcamentaria.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, tipoManad: true } }),
    prisma.acao.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, tipoManad: true } }),
    prisma.naturezaDespesa.findMany({ orderBy: { codigoCompleto: "asc" }, select: { id: true, codigoCompleto: true, descricao: true, indTipoContaManad: true, nivelContaManad: true } }),
    prisma.naturezaReceita.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, indTipoContaManad: true, nivelContaManad: true } }),
    prisma.enteConfig.findUnique({ where: { id: "unico" }, select: { indCentralizacao: true } }),
    podeCadastrar(sessao),
  ]);
  return {
    unidades: grupo(unidades.map((u) => ({ id: u.id, codigo: u.codigo, descricao: u.descricao, tipo: u.tipoManad || null, nivel: null })), todas),
    acoes: grupo(acoes.map((a) => ({ id: a.id, codigo: a.codigo, descricao: a.descricao, tipo: a.tipoManad || null, nivel: null })), todas),
    naturezasDespesa: grupo(
      despesas.map((n) => ({ id: n.id, codigo: n.codigoCompleto, descricao: n.descricao, tipo: n.indTipoContaManad || null, nivel: n.nivelContaManad })),
      todas
    ),
    naturezasReceita: grupo(
      receitas.map((n) => ({ id: n.id, codigo: n.codigo, descricao: n.descricao, tipo: n.indTipoContaManad || null, nivel: n.nivelContaManad })),
      todas
    ),
    centralizacao: ente?.indCentralizacao || null,
    podeClassificar: pode,
  };
}

export type GrupoClassificavel = "unidade" | "acao" | "natureza-despesa" | "natureza-receita";

export async function classificarParaOManad(
  grupoAlvo: GrupoClassificavel,
  dados: { readonly id: string; readonly tipo: string; readonly nivel: string }
): Promise<ResultadoDaClassificacao> {
  return comEscritaAutenticada(ACAO_DE_CADASTRO, (criadoPor) => {
    const prisma = cliente();
    switch (grupoAlvo) {
      case "unidade":
        return classificarUnidadeParaOManad(prisma, { unidadeId: dados.id, tipo: dados.tipo, criadoPor });
      case "acao":
        return classificarAcaoParaOManad(prisma, { acaoId: dados.id, tipo: dados.tipo, criadoPor });
      case "natureza-despesa":
        return classificarNaturezaDespesaParaOManad(prisma, { naturezaId: dados.id, tipoDeConta: dados.tipo, nivel: dados.nivel, criadoPor });
      case "natureza-receita":
        return classificarNaturezaReceitaParaOManad(prisma, { naturezaId: dados.id, tipoDeConta: dados.tipo, nivel: dados.nivel, criadoPor });
    }
  });
}

export async function declararCentralizacao(indicador: string): Promise<{ readonly anterior: string | null; readonly atual: string }> {
  return comEscritaAutenticada(ACAO_DE_CADASTRO, (criadoPor) => declararCentralizacaoDaEscrituracao(cliente(), { indicador, criadoPor }));
}
