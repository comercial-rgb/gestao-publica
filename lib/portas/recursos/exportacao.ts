import type { ConsultaDoMolde } from "../../molde/consulta";
import type { DefinicaoDeRecurso, LinhaDoMolde } from "../../molde/tipos";
import { exigirLeitura } from "../molde";
import { telaExigeLeituraEmAlgumEscopo } from "../leitura";
import { BENS_PATRIMONIAIS, CLASSES_DE_BENS } from "./acervo";
import { listarBensPatrimoniais, listarClassesDeBens } from "./acervo-dados";
import { CLASSES_DE_MATERIAL, DEPOSITOS, GRUPOS_DE_MATERIAL, INVENTARIOS_DE_ESTOQUE, MATERIAIS, REQUISICOES_DE_MATERIAL, UNIDADES_DE_MEDIDA } from "./almoxarifado";
import { listarClassesDeMaterial, listarDepositos, listarGruposDeMaterial, listarInventariosDeEstoque, listarMateriais, listarRequisicoes, listarUnidadesDeMedidaDoMolde } from "./almoxarifado-dados";
import { AUDIENCIAS_PUBLICAS } from "./audiencias";
import { listarAudiencias } from "./audiencias-dados";
import { CAMPANHAS_PUBLICITARIAS } from "./campanhas-publicitarias";
import { listarCampanhasPublicitarias } from "./campanhas-publicitarias-dados";
import { ORDENS_DE_COMPRA, PESQUISAS_DE_PRECOS, SOLICITACOES_DE_COMPRA } from "./compras";
import { listarOrdens, listarPesquisas, listarSolicitacoes } from "./compras-dados";
import { CONTRATOS, PROCESSOS_LICITATORIOS } from "./contratacao";
import { listarContratos, listarProcessos } from "./contratacao-dados";
import { listarAuditorias, listarConsorcios, listarConvenios, listarDividasAtivas, listarDividasFundadas, listarObras, listarPrecatorios, listarProvisoes } from "./dados";
import { AUDITORIAS, CONSORCIOS, CONVENIOS, DIVIDA_ATIVA, DIVIDA_FUNDADA, OBRAS, PRECATORIOS, PROVISOES } from "./definicoes";
import { DOCUMENTOS_FISCAIS } from "./documentos-fiscais";
import { listarDocumentosFiscais } from "./documentos-fiscais-dados";
import { EMENTARIO_DA_RECEITA } from "./ementario-receita";
import { listarNaturezasDeReceita } from "./ementario-receita-dados";
import { ENCARGOS_DA_FOLHA } from "./encargos";
import { listarComponentesDeEncargo } from "./encargos-dados";
import { FICHAS } from "./fichas";
import { listarFichas } from "./fichas-dados";
import { DESIGNACOES_DA_FOLHA, FOLHAS, GRUPOS_DE_EMPENHO_DA_FOLHA, LANCAMENTOS_DA_FOLHA, PARAMETROS_DO_ADIANTAMENTO_SALARIAL, PARAMETROS_DO_DECIMO_TERCEIRO, RUBRICAS, TABELAS_DA_FOLHA } from "./folha";
import { listarDesignacoes, listarFolhas, listarGruposDeEmpenho, listarLancamentos, listarParametrosDoAdiantamentoSalarial, listarParametrosDoDecimoTerceiro, listarRubricas, listarTabelas } from "./folha-dados";
import { LOCALIZACOES_FISICAS, MOTIVOS_DE_BAIXA, TIPOS_DE_INCORPORACAO } from "./gestao-do-bem";
import { listarLocalizacoes, listarMotivosDeBaixa, listarTiposDeIncorporacao } from "./gestao-do-bem-dados";
import { LEIS_ORCAMENTARIAS } from "./leis-orcamentarias";
import { listarLeisOrcamentarias } from "./leis-orcamentarias-dados";
import { PARAMETROS_DE_ATUALIZACAO } from "./parametros";
import { listarParametros } from "./parametros-dados";
import { CARGOS, FUNCOES, LOTACOES, SERVIDORES } from "./pessoal";
import { listarCargos, listarFuncoes, listarLotacoes, listarServidores } from "./pessoal-dados";
import { ESTRUTURA_DO_PPA, LEIS_DE_DIRETRIZES, PLANOS_PLURIANUAIS, PROGRAMAS_DO_PPA } from "./plurianual";
import { listarEstrutura, listarLdos, listarPlanos, listarProgramasDoPpa } from "./plurianual-dados";
import { PARCERIAS_PUBLICO_PRIVADAS } from "./ppp";
import { listarPpps } from "./ppp-dados";
import { REPRESENTACOES } from "./representacoes";
import { listarRepresentacoes } from "./representacoes-dados";
import { ROTEIROS_DE_RESULTADO, ROTEIROS_DO_ALMOXARIFADO, ROTEIROS_PATRIMONIAIS } from "./roteiros";
import { listarRoteirosDeResultado, listarRoteirosDoAlmoxarifadoDoMolde, listarRoteirosPatrimoniais } from "./roteiros-dados";
import { SERVICOS_DA_CARTA } from "./servicos-da-carta";
import { listarServicosDaCarta } from "./servicos-da-carta-dados";
import { SETORES } from "./setores";
import { listarSetoresDoMolde } from "./setores-dados";
import { SOLICITACOES_DA_MESA } from "./solicitacoes-da-mesa";
import { listarSolicitacoesDaMesa } from "./solicitacoes-da-mesa-dados";
import { TERMOS_PATRIMONIAIS } from "./termos";
import { listarTermos } from "./termos-dados";

/**
 * V39-R3 (R3-029) — AS LISTAS DO MOLDE QUE SE EXPORTAM INTEIRAS, pela rota `/exportar/[recurso]`.
 *
 * Cada entrada é a MESMA leitura da tela: a mesma ação de consulta (`abrir`) e o MESMO lister, chamado página a página
 * pela rota, com os mesmos filtros e a mesma ordem. Nenhuma consulta nova. Gerado das 58 páginas que montam
 * `ListaDeRecurso` (scripts de apoio da R3); `test/exportacao-do-molde.test.ts` confere que toda página do molde
 * tem entrada aqui com a mesma ação de leitura.
 */
export interface ExportacaoDoMolde {
  readonly definicao: DefinicaoDeRecurso;
  /** Cobra a leitura da tela e devolve o lister da tela. */
  readonly abrir: () => Promise<(c: ConsultaDoMolde) => Promise<{ readonly linhas: readonly LinhaDoMolde[]; readonly total: number }>>;
}

export const EXPORTACOES_DO_MOLDE: Readonly<Record<string, ExportacaoDoMolde>> = {
  [AUDIENCIAS_PUBLICAS.nome]: { definicao: AUDIENCIAS_PUBLICAS, abrir: async () => { await exigirLeitura("CONSULTAR_PLANEJAMENTO"); return listarAudiencias; } },
  [AUDITORIAS.nome]: { definicao: AUDITORIAS, abrir: async () => { await exigirLeitura("CONSULTAR_CONTROLE_INTERNO"); return listarAuditorias; } },
  [BENS_PATRIMONIAIS.nome]: { definicao: BENS_PATRIMONIAIS, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarBensPatrimoniais; } },
  [CAMPANHAS_PUBLICITARIAS.nome]: { definicao: CAMPANHAS_PUBLICITARIAS, abrir: async () => { await exigirLeitura("CONSULTAR_DESPESA"); return listarCampanhasPublicitarias; } },
  [CARGOS.nome]: { definicao: CARGOS, abrir: async () => { await exigirLeitura("CONSULTAR_PESSOAL"); return listarCargos; } },
  [CLASSES_DE_BENS.nome]: { definicao: CLASSES_DE_BENS, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarClassesDeBens; } },
  [CLASSES_DE_MATERIAL.nome]: { definicao: CLASSES_DE_MATERIAL, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarClassesDeMaterial; } },
  [CONSORCIOS.nome]: { definicao: CONSORCIOS, abrir: async () => { await exigirLeitura("CONSULTAR_TRANSFERENCIAS"); return listarConsorcios; } },
  [CONTRATOS.nome]: { definicao: CONTRATOS, abrir: async () => { await exigirLeitura("CONSULTAR_LICITACOES"); return listarContratos; } },
  [CONVENIOS.nome]: { definicao: CONVENIOS, abrir: async () => { await exigirLeitura("CONSULTAR_TRANSFERENCIAS"); return listarConvenios; } },
  [DEPOSITOS.nome]: { definicao: DEPOSITOS, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarDepositos; } },
  [DESIGNACOES_DA_FOLHA.nome]: { definicao: DESIGNACOES_DA_FOLHA, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarDesignacoes; } },
  [DIVIDA_ATIVA.nome]: { definicao: DIVIDA_ATIVA, abrir: async () => { await exigirLeitura("CONSULTAR_DIVIDA"); return listarDividasAtivas; } },
  [DIVIDA_FUNDADA.nome]: { definicao: DIVIDA_FUNDADA, abrir: async () => { await exigirLeitura("CONSULTAR_DIVIDA"); return listarDividasFundadas; } },
  [DOCUMENTOS_FISCAIS.nome]: { definicao: DOCUMENTOS_FISCAIS, abrir: async () => { await exigirLeitura("CONSULTAR_LICITACOES"); return listarDocumentosFiscais; } },
  [EMENTARIO_DA_RECEITA.nome]: { definicao: EMENTARIO_DA_RECEITA, abrir: async () => { await exigirLeitura("CONSULTAR_RECEITA"); return listarNaturezasDeReceita; } },
  [ENCARGOS_DA_FOLHA.nome]: { definicao: ENCARGOS_DA_FOLHA, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarComponentesDeEncargo; } },
  [ESTRUTURA_DO_PPA.nome]: { definicao: ESTRUTURA_DO_PPA, abrir: async () => { await exigirLeitura("CONSULTAR_PLANEJAMENTO"); return listarEstrutura; } },
  [FICHAS.nome]: { definicao: FICHAS, abrir: async () => { await exigirLeitura("CONSULTAR_PLANEJAMENTO"); return listarFichas; } },
  [FOLHAS.nome]: { definicao: FOLHAS, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarFolhas; } },
  [FUNCOES.nome]: { definicao: FUNCOES, abrir: async () => { await exigirLeitura("CONSULTAR_PESSOAL"); return listarFuncoes; } },
  [GRUPOS_DE_EMPENHO_DA_FOLHA.nome]: { definicao: GRUPOS_DE_EMPENHO_DA_FOLHA, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarGruposDeEmpenho; } },
  [GRUPOS_DE_MATERIAL.nome]: { definicao: GRUPOS_DE_MATERIAL, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarGruposDeMaterial; } },
  [INVENTARIOS_DE_ESTOQUE.nome]: { definicao: INVENTARIOS_DE_ESTOQUE, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarInventariosDeEstoque; } },
  [LANCAMENTOS_DA_FOLHA.nome]: { definicao: LANCAMENTOS_DA_FOLHA, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarLancamentos; } },
  [LEIS_DE_DIRETRIZES.nome]: { definicao: LEIS_DE_DIRETRIZES, abrir: async () => { await exigirLeitura("CONSULTAR_PLANEJAMENTO"); return listarLdos; } },
  [LEIS_ORCAMENTARIAS.nome]: { definicao: LEIS_ORCAMENTARIAS, abrir: async () => { await exigirLeitura("CONSULTAR_PLANEJAMENTO"); return listarLeisOrcamentarias; } },
  [LOCALIZACOES_FISICAS.nome]: { definicao: LOCALIZACOES_FISICAS, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarLocalizacoes; } },
  [LOTACOES.nome]: { definicao: LOTACOES, abrir: async () => { await exigirLeitura("CONSULTAR_PESSOAL"); return listarLotacoes; } },
  [MATERIAIS.nome]: { definicao: MATERIAIS, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarMateriais; } },
  [MOTIVOS_DE_BAIXA.nome]: { definicao: MOTIVOS_DE_BAIXA, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarMotivosDeBaixa; } },
  [OBRAS.nome]: { definicao: OBRAS, abrir: async () => { await exigirLeitura("CONSULTAR_LICITACOES"); return listarObras; } },
  [ORDENS_DE_COMPRA.nome]: { definicao: ORDENS_DE_COMPRA, abrir: async () => { await exigirLeitura("CONSULTAR_LICITACOES"); return listarOrdens; } },
  [PARAMETROS_DE_ATUALIZACAO.nome]: { definicao: PARAMETROS_DE_ATUALIZACAO, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarParametros; } },
  [PARAMETROS_DO_ADIANTAMENTO_SALARIAL.nome]: { definicao: PARAMETROS_DO_ADIANTAMENTO_SALARIAL, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarParametrosDoAdiantamentoSalarial; } },
  [PARAMETROS_DO_DECIMO_TERCEIRO.nome]: { definicao: PARAMETROS_DO_DECIMO_TERCEIRO, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarParametrosDoDecimoTerceiro; } },
  [PARCERIAS_PUBLICO_PRIVADAS.nome]: { definicao: PARCERIAS_PUBLICO_PRIVADAS, abrir: async () => { await exigirLeitura("CONSULTAR_LICITACOES"); return listarPpps; } },
  [PESQUISAS_DE_PRECOS.nome]: { definicao: PESQUISAS_DE_PRECOS, abrir: async () => { await exigirLeitura("CONSULTAR_LICITACOES"); return listarPesquisas; } },
  [PLANOS_PLURIANUAIS.nome]: { definicao: PLANOS_PLURIANUAIS, abrir: async () => { await exigirLeitura("CONSULTAR_PLANEJAMENTO"); return listarPlanos; } },
  [PRECATORIOS.nome]: { definicao: PRECATORIOS, abrir: async () => { await exigirLeitura("CONSULTAR_DIVIDA"); return listarPrecatorios; } },
  [PROCESSOS_LICITATORIOS.nome]: { definicao: PROCESSOS_LICITATORIOS, abrir: async () => { await exigirLeitura("CONSULTAR_LICITACOES"); return listarProcessos; } },
  [PROGRAMAS_DO_PPA.nome]: { definicao: PROGRAMAS_DO_PPA, abrir: async () => { await exigirLeitura("CONSULTAR_PLANEJAMENTO"); return listarProgramasDoPpa; } },
  [PROVISOES.nome]: { definicao: PROVISOES, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarProvisoes; } },
  [REPRESENTACOES.nome]: { definicao: REPRESENTACOES, abrir: async () => { await exigirLeitura("CONSULTAR_CADASTROS"); return listarRepresentacoes; } },
  [REQUISICOES_DE_MATERIAL.nome]: { definicao: REQUISICOES_DE_MATERIAL, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarRequisicoes; } },
  [ROTEIROS_DE_RESULTADO.nome]: { definicao: ROTEIROS_DE_RESULTADO, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarRoteirosDeResultado; } },
  [ROTEIROS_DO_ALMOXARIFADO.nome]: { definicao: ROTEIROS_DO_ALMOXARIFADO, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarRoteirosDoAlmoxarifadoDoMolde; } },
  [ROTEIROS_PATRIMONIAIS.nome]: { definicao: ROTEIROS_PATRIMONIAIS, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarRoteirosPatrimoniais; } },
  [RUBRICAS.nome]: { definicao: RUBRICAS, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarRubricas; } },
  [SERVIDORES.nome]: { definicao: SERVIDORES, abrir: async () => { await exigirLeitura("CONSULTAR_PESSOAL"); return listarServidores; } },
  [SETORES.nome]: { definicao: SETORES, abrir: async () => { await exigirLeitura("CONSULTAR_PROTOCOLO"); return listarSetoresDoMolde; } },
  [SOLICITACOES_DE_COMPRA.nome]: { definicao: SOLICITACOES_DE_COMPRA, abrir: async () => { await exigirLeitura("CONSULTAR_LICITACOES"); return listarSolicitacoes; } },
  [TABELAS_DA_FOLHA.nome]: { definicao: TABELAS_DA_FOLHA, abrir: async () => { await exigirLeitura("CONSULTAR_FOLHA"); return listarTabelas; } },
  [TERMOS_PATRIMONIAIS.nome]: { definicao: TERMOS_PATRIMONIAIS, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarTermos; } },
  [TIPOS_DE_INCORPORACAO.nome]: { definicao: TIPOS_DE_INCORPORACAO, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarTiposDeIncorporacao; } },
  [UNIDADES_DE_MEDIDA.nome]: { definicao: UNIDADES_DE_MEDIDA, abrir: async () => { await exigirLeitura("CONSULTAR_PATRIMONIO"); return listarUnidadesDeMedidaDoMolde; } },
  [SERVICOS_DA_CARTA.nome]: { definicao: SERVICOS_DA_CARTA, abrir: async () => { await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO"); return listarServicosDaCarta; } },
  [SOLICITACOES_DA_MESA.nome]: {
    definicao: SOLICITACOES_DA_MESA,
    abrir: async () => {
      const sessao = await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
      return (c) => listarSolicitacoesDaMesa(sessao, c);
    },
  },
};
