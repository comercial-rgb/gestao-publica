import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import { AREAS, type SlugDeArea } from "../navegacao.js";

/**
 * ═══ O MENU MOSTRA O QUE O SERVIDOR PERMITE — E NÃO UMA LISTA PARALELA ═══
 *
 * ⚠️ ELE MORA EM `lib/portas/` E NÃO EM `lib/`, e a fronteira é cobrada por
 * `test/ui/fronteira-ui.test.ts`: só a PORTA importa `modules/mNN`. Caberia em `lib/`
 * tipando a ação como `string` — e aí o `Record` deixaria de ser exaustivo, que é
 * exatamente a garantia pela qual este arquivo existe. Entre perder a rede do compilador e
 * mudar de pasta, muda-se de pasta.
 *
 * ⚠️ O DEFEITO QUE ISTO IMPEDE, E ELE JÁ ACONTECEU AQUI. No ENT02, o seletor de
 * encaminhamento do protocolo oferecia setores que o servidor recusava: a tela tinha a
 * própria ideia de quem podia receber, e a ideia divergia da regra. O usuário escolhia, o
 * servidor negava, e nada na tela explicava por quê.
 *
 * Uma barra lateral com 18 áreas fixas repete esse defeito em escala: ela promete ao
 * operador da tesouraria que existe uma tela de "Administração" que ele nunca vai
 * conseguir usar. **Menu que mostra o que o servidor nega é uma mentira de interface** — e
 * a correção não é esconder na tela: é derivar a visibilidade DA MESMA fonte que autoriza.
 *
 * ═══ ⚠️ POR QUE UM `Record` COMPLETO, E NÃO UMA LISTA POR ÁREA ═══
 *
 * `Record<AcaoDoSistema, DestinoDaAcao>` obriga o COMPILADOR a exigir uma entrada para cada
 * uma das 185 ações. Uma lista por área ("a área financeiro tem estas ações") aceitaria em
 * silêncio uma ação nova que ninguém classificou — e o efeito seria uma tela existente e
 * invisível, ou pior, uma área visível para quem não pode nada dentro dela.
 *
 * É a mesma anatomia do `ACAO_DO_SERVICO`: o tipo é a rede, não a boa vontade de quem
 * edita. Quem acrescentar uma ação ao censo do M16 não compila até dizer onde ela mora.
 *
 * ═══ ⚠️ `"transversal"` NÃO É UMA GAVETA DE SOBRA ═══
 *
 * Anexar arquivo, assinar documento e preencher campo adicional acontecem DENTRO de outras
 * áreas — o molde declara `ANEXAR_ARQUIVO` em sete cadastros diferentes. Uma ação dessas
 * não pode, sozinha, abrir uma área: quem só pode anexar não tem tela própria para ir.
 * Mapeá-las para alguma área daria visibilidade por tabela de permissão que não
 * corresponde a nenhuma tela — exatamente o que este arquivo existe para evitar.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO **NÃO** RESOLVE, E ESTÁ NOMEADO ═══
 *
 * O censo do M16 cobre MUTAÇÕES; leitura não é permissão hoje (está dito lá, e é pendência
 * antiga). Então uma área só de leitura — `transparencia` — não tem ação nenhuma e fica
 * visível para qualquer sessão. Isso não é um menu mentindo: é o menu dizendo a verdade
 * sobre um servidor que, ali, de fato não nega. O dia em que a leitura virar permissão,
 * esta função passa a filtrá-la sem mudar de forma.
 */

/** A área onde a ação tem tela, ou `"transversal"` quando ela acontece dentro de outras. */
export type DestinoDaAcao = SlugDeArea | "transversal";

export const AREA_DA_ACAO: Record<AcaoDoSistema, DestinoDaAcao> = {
  // M01 — o razão
  REGISTRAR_LANCAMENTO_MANUAL: "contabilidade",
  ESTORNAR_LANCAMENTO_MANUAL: "contabilidade",
  // M02 — planejamento
  CRIAR_FICHA: "planejamento",
  CRIAR_RECEITA_PREVISTA: "planejamento",
  REPREVISAR_RECEITA: "planejamento",
  // M02 — programação financeira (CMD/MBA · TR 4.18/4.43/4.44)
  CRIAR_VERSAO_CMD: "planejamento",
  CRIAR_VERSAO_MBA: "planejamento",
  LIBERAR_PROGRAMACAO: "planejamento",
  CONFIGURAR_LIMITACAO_EMPENHO: "planejamento",
  // M03 — créditos adicionais
  CRIAR_LEI_DE_CREDITO: "planejamento",
  CRIAR_DECRETO_DE_CREDITO: "planejamento",
  EXECUTAR_CREDITO: "planejamento",
  ANULAR_CREDITO: "planejamento",
  ENCERRAR_DECRETO: "planejamento",
  // M04 — receita
  REGISTRAR_ARRECADACAO: "receita",
  ANULAR_ARRECADACAO: "receita",
  // M04 — reconhecimento pelo fato gerador (TR 5.87/5.88)
  RECONHECER_RECEITA: "receita",
  ESTORNAR_RECONHECIMENTO: "receita",
  CANCELAR_RECONHECIMENTO: "receita",
  // M05 — despesa
  RESERVAR_DOTACAO: "despesa",
  LIBERAR_RESERVA: "despesa",
  EMPENHAR: "despesa",
  ANULAR_EMPENHO: "despesa",
  ANULAR_EMPENHO_PARCIAL: "despesa",
  LIQUIDAR: "despesa",
  ANULAR_LIQUIDACAO: "despesa",
  ANULAR_LIQUIDACAO_PARCIAL: "despesa",
  PAGAR: "despesa",
  // M05 — T07: a ordem de pagamento. TRÊS ações, e a separação é o ponto
  PREPARAR_ORDEM_PAGAMENTO: "despesa",
  AUTORIZAR_ORDEM_PAGAMENTO: "despesa",
  CANCELAR_ORDEM_PAGAMENTO: "despesa",
  ANULAR_PAGAMENTO: "despesa",
  ANULAR_PAGAMENTO_PARCIAL: "despesa",
  ESTORNAR_ANULACAO_PARCIAL: "despesa",
  // M07 — extraorçamentário
  REGISTRAR_INGRESSO_EXTRA: "financeiro",
  REGISTRAR_DISPENDIO_EXTRA: "financeiro",
  ESTORNAR_MOVIMENTO_EXTRA: "financeiro",
  // M08 — exercício e restos a pagar
  ABRIR_EXERCICIO: "contabilidade",
  ENCERRAR_EXERCICIO: "contabilidade",
  APURAR_RESULTADO: "contabilidade",
  ESTORNAR_APURACAO: "contabilidade",
  ENCERRAR_CONTROLES_ORCAMENTARIOS: "contabilidade",
  ESTORNAR_ENCERRAMENTO_CONTROLES: "contabilidade",
  LIQUIDAR_RESTOS_A_PAGAR: "contabilidade",
  PAGAR_RESTOS_A_PAGAR: "contabilidade",
  CANCELAR_RESTOS_A_PAGAR: "contabilidade",
  ANULAR_PAGAMENTO_RESTOS_A_PAGAR: "contabilidade",
  ANULAR_CANCELAMENTO_RESTOS_A_PAGAR: "contabilidade",
  // M09 — tesouraria
  IMPORTAR_EXTRATO: "financeiro",
  VINCULAR_CONCILIACAO: "financeiro",
  ESTORNAR_VINCULO: "financeiro",
  TRANSFERIR_ENTRE_CONTAS: "financeiro",
  REGISTRAR_MOVIMENTO_BANCARIO: "financeiro",
  ESTORNAR_MOVIMENTO_BANCARIO: "financeiro",
  ABRIR_CONCILIACAO: "financeiro",
  ENCERRAR_CONCILIACAO: "financeiro",
  REGISTRAR_PENDENCIA_MANUAL: "financeiro",
  JUSTIFICAR_PENDENCIA: "financeiro",
  // M18 — SAGRES Captura 2.0
  SUBMETER_CAPTURA: "integracoes",
  // M20 — importadores de arquivo externo (folha/tributário)
  IMPORTAR_FOLHA: "integracoes",
  IMPORTAR_TRIBUTOS: "integracoes",
  // M10 — almoxarifado
  CADASTRAR_CLASSE_DE_MATERIAL: "patrimonio",
  REGISTRAR_ENTRADA_ALMOXARIFADO: "patrimonio",
  REGISTRAR_SAIDA_CONSUMO: "patrimonio",
  REGISTRAR_AJUSTE_ALMOXARIFADO: "patrimonio",
  ESTORNAR_MOVIMENTO_ALMOXARIFADO: "patrimonio",

  // ENT05 — o eixo FÍSICO do almoxarifado (TR 5.18). Mora em "patrimonio", junto do
  // eixo contábil que ele acompanha: separá-lo numa área própria faria o mesmo
  // almoxarifado aparecer em dois lugares do menu.
  CADASTRAR_DEPOSITO: "patrimonio",
  CADASTRAR_UNIDADE_DE_MEDIDA: "cadastros",
  CADASTRAR_GRUPO_DE_MATERIAL: "cadastros",
  CADASTRAR_MATERIAL: "cadastros",
  DEFINIR_PARAMETRO_DE_ESTOQUE: "patrimonio",
  REGISTRAR_ENTRADA_FISICA: "patrimonio",
  REGISTRAR_SAIDA_FISICA: "patrimonio",
  ESTORNAR_MOVIMENTO_FISICO: "patrimonio",
  TRANSFERIR_ENTRE_DEPOSITOS: "patrimonio",
  REGISTRAR_REQUISICAO_DE_MATERIAL: "patrimonio",
  DEFINIR_COTA_DE_CONSUMO: "patrimonio",
  ABRIR_INVENTARIO_DE_ESTOQUE: "patrimonio",
  REGISTRAR_CONTAGEM_DE_INVENTARIO: "patrimonio",
  FECHAR_INVENTARIO_DE_ESTOQUE: "patrimonio",
  BLOQUEAR_ESTOQUE: "patrimonio",
  ENCERRAR_BLOQUEIO_DE_ESTOQUE: "patrimonio",

  // ENT07 — o acervo. A CLASSE é tabela de apoio e mora em "cadastros"; o BEM é o acervo em
  // si, e mora em "patrimonio", junto dos atos que o movem e o avaliam.
  CADASTRAR_CLASSE_DE_BENS: "cadastros",
  CADASTRAR_BEM: "patrimonio",

  // ENT05 — o eixo de GESTÃO do bem (TR 5.19).
  CADASTRAR_LOCALIZACAO_FISICA: "cadastros",
  CADASTRAR_COMISSAO_PATRIMONIAL: "cadastros",
  CADASTRAR_MOTIVO_DE_BAIXA: "cadastros",
  CADASTRAR_TIPO_DE_INCORPORACAO: "cadastros",
  CADASTRAR_FORMULA_DE_AVALIACAO: "cadastros",
  REGISTRAR_MOVIMENTO_DE_GESTAO: "patrimonio",
  TRANSFERIR_BEM_ENTRE_ENTIDADES: "patrimonio",
  ESTORNAR_MOVIMENTO_DE_GESTAO: "patrimonio",
  GERAR_ETIQUETA_DE_BEM: "patrimonio",
  EMITIR_TERMO_PATRIMONIAL: "patrimonio",
  ABRIR_INVENTARIO_DE_BENS: "patrimonio",
  REGISTRAR_CONTAGEM_DE_BEM: "patrimonio",
  FECHAR_INVENTARIO_DE_BENS: "patrimonio",

  // ENT05 ITEM 3 — a correção de eixo do plano de contas.
  REPONTAR_CONTA: "contabilidade",

  // ENT05 — A COMPRA (TR 5.17). Mora em "licitacoes", com o processo e o contrato que
  // ela alimenta; o cadastro de marca e o vínculo com elemento são cadastro.
  RELACIONAR_MARCA_AO_MATERIAL: "cadastros",
  RELACIONAR_ELEMENTO_AO_MATERIAL: "cadastros",
  REGISTRAR_SOLICITACAO_DE_COMPRA: "licitacoes",
  MOVIMENTAR_SOLICITACAO_DE_COMPRA: "licitacoes",
  REGISTRAR_PESQUISA_DE_PRECOS: "licitacoes",
  EMITIR_ORDEM_DE_COMPRA: "licitacoes",
  REGISTRAR_RECEBIMENTO_DE_ORDEM: "licitacoes",
  ESTORNAR_ORDEM_DE_COMPRA: "licitacoes",
  // M10 — patrimônio
  ADQUIRIR_BEM: "patrimonio",
  REGISTRAR_ENTRADA_AVULSA: "patrimonio",
  ALIENAR_BEM: "patrimonio",
  BAIXAR_BEM: "patrimonio",
  REGISTRAR_REAVALIACAO: "patrimonio",
  REGISTRAR_IMPAIRMENT: "patrimonio",
  REGISTRAR_CUSTO_SUBSEQUENTE: "patrimonio",
  ATUALIZAR_COMPETENCIA_PATRIMONIAL: "patrimonio",
  ESTORNAR_MOVIMENTO_PATRIMONIAL: "patrimonio",
  // M10 — dívida consolidada
  CADASTRAR_DIVIDA: "divida",
  REGISTRAR_ATUALIZACAO_MONETARIA: "divida",
  ESTORNAR_MOVIMENTO_DIVIDA: "divida",
  // M10 — dívida ativa
  CADASTRAR_DIVIDA_ATIVA: "divida",
  INSCREVER_DIVIDA_ATIVA: "divida",
  ATUALIZAR_DIVIDA_ATIVA: "divida",
  CANCELAR_DIVIDA_ATIVA: "divida",
  ESTORNAR_MOVIMENTO_DIVIDA_ATIVA: "divida",
  // M10 — provisões
  CADASTRAR_PROVISAO: "patrimonio",
  CONSTITUIR_PROVISAO: "patrimonio",
  REVERTER_PROVISAO: "patrimonio",
  ATUALIZAR_PROVISAO: "patrimonio",
  ESTORNAR_MOVIMENTO_PROVISAO: "patrimonio",
  // M11 — licitações, contratos e obras
  CADASTRAR_PROCESSO: "licitacoes",
  HOMOLOGAR_PROCESSO: "licitacoes",
  CADASTRAR_CONTRATO: "licitacoes",
  REGISTRAR_ADITIVO: "licitacoes",
  ESTORNAR_MOVIMENTO_CONTRATUAL: "licitacoes",
  CADASTRAR_LIMITE: "licitacoes",
  CADASTRAR_OBRA: "licitacoes",
  // M12 — relatórios (parametrização)
  CADASTRAR_LINHA_DEMONSTRATIVO: "relatorios",
  // M19 — pessoas e credores
  CADASTRAR_PESSOA: "cadastros",
  ALTERAR_PESSOA: "cadastros",
  MOVER_PAPEL_DE_PESSOA: "cadastros",
  // M16 — travamento
  TRAVAR_COMPETENCIA: "contabilidade",
  DESTRAVAR_COMPETENCIA: "contabilidade",
  // M16 — administração de usuários (TR 4.55/4.56) · família ADMINISTRACAO
  CRIAR_USUARIO: "administracao",
  CONCEDER_PERFIL: "administracao",
  REVOGAR_PERFIL: "administracao",
  ATIVAR_USUARIO: "administracao",
  INATIVAR_USUARIO: "administracao",
  RESETAR_SENHA: "administracao",
  CRIAR_PERFIL: "administracao",
  CONCEDER_ACAO_A_PERFIL: "administracao",
  REVOGAR_ACAO_DE_PERFIL: "administracao",
  // M21 — protocolo e processo digital (ENT02)
  ABRIR_PROCESSO: "protocolo",
  TRAMITAR_PROCESSO: "protocolo",
  RECEBER_PROCESSO: "protocolo",
  COMPLEMENTAR_PROCESSO: "protocolo",
  SOLICITAR_PARECER: "protocolo",
  RESPONDER_PARECER: "protocolo",
  SOLICITAR_READEQUACAO: "protocolo",
  ATENDER_READEQUACAO: "protocolo",
  ENCERRAR_PROCESSO: "protocolo",
  ARQUIVAR_PROCESSO: "protocolo",
  REABRIR_PROCESSO: "protocolo",
  APENSAR_PROCESSO: "protocolo",
  DESAPENSAR_PROCESSO: "protocolo",
  TORNAR_MOVIMENTO_SEM_EFEITO: "protocolo",
  // M21 — os CADASTROS do protocolo (ENT02)
  CRIAR_SETOR: "protocolo",
  LOTAR_USUARIO_NO_SETOR: "protocolo",
  CRIAR_ASSUNTO: "protocolo",
  REGISTRAR_TAXA_DO_PROCESSO: "protocolo",
  BAIXAR_TAXA_DO_PROCESSO: "protocolo",
  // M22 — anexos e assinatura (ENT02)
  ANEXAR_ARQUIVO: "transversal",
  ASSINAR_DOCUMENTO: "transversal",
  CRIAR_FILA_DE_ASSINATURA: "transversal",
  ASSINAR_NA_FILA: "transversal",
  // M23 — comunicação interna (ENT02)
  CRIAR_TIPO_DE_COMUNICADO: "comunicacao",
  RASCUNHAR_COMUNICADO: "comunicacao",
  EDITAR_RASCUNHO_DE_COMUNICADO: "comunicacao",
  ENVIAR_COMUNICADO: "comunicacao",
  RESPONDER_COMUNICADO: "comunicacao",
  ENCAMINHAR_COMUNICADO: "comunicacao",
  MARCAR_LEITURA_DE_COMUNICADO: "comunicacao",
  GERIR_MINHA_CAIXA: "comunicacao",
  ETIQUETAR_COMUNICADO: "comunicacao",
  // M25 — campos adicionais (ENT02)
  DEFINIR_CAMPO_ADICIONAL: "administracao",
  DESATIVAR_CAMPO_ADICIONAL: "administracao",
  PREENCHER_CAMPOS_ADICIONAIS: "transversal",
  // M26 — designer de relatórios (ENT02)
  CRIAR_MODELO_DE_RELATORIO: "relatorios",
  NOVA_VERSAO_DE_MODELO: "relatorios",
  COPIAR_MODELO_DE_RELATORIO: "relatorios",
  DISTRIBUIR_MODELO_DE_RELATORIO: "relatorios",
  RETIRAR_MODELO_DE_RELATORIO: "relatorios",
  EXECUTAR_RELATORIO: "relatorios",
  // M27 — ajuda contextual e chamados (ENT02)
  ESCREVER_AJUDA_DE_ROTA: "suporte",
  CRIAR_NIVEL_DE_SEVERIDADE: "suporte",
  ABRIR_CHAMADO: "suporte",
  RESPONDER_CHAMADO: "suporte",
  ENCERRAR_CHAMADO: "suporte",
  REABRIR_CHAMADO: "suporte",
  RESPONDER_PESQUISA_DE_SATISFACAO: "suporte",
  // M09 — lote de pagamento e borderô (ENT03)
  CRIAR_LOTE_DE_PAGAMENTO: "financeiro",
  INCLUIR_NO_LOTE: "financeiro",
  FECHAR_LOTE: "financeiro",
  GERAR_BORDERO: "financeiro",
  PROCESSAR_RETORNO_BANCARIO: "financeiro",
  // M28 — convênios e transferências voluntárias (ENT03b · LRF art. 25)
  CADASTRAR_CONVENIO: "transferencias",
  LIBERAR_PARCELA_DE_CONVENIO: "transferencias",
  APROVAR_PRESTACAO_DE_CONTAS: "transferencias",
  GLOSAR_CONVENIO: "transferencias",
  REGISTRAR_DEVOLUCAO_DE_CONVENIO: "transferencias",
  ESTORNAR_MOVIMENTO_DE_CONVENIO: "transferencias",
  // M29 — precatórios judiciais (ENT03b · CF art. 100)
  CADASTRAR_PRECATORIO: "divida",
  INSCREVER_PRECATORIO: "divida",
  ATUALIZAR_PRECATORIO: "divida",
  CANCELAR_PRECATORIO: "divida",
  ESTORNAR_MOVIMENTO_DE_PRECATORIO: "divida",
  // M30 — consórcios públicos (ENT03b · Lei 11.107/2005)
  CADASTRAR_CONSORCIO: "transferencias",
  REGISTRAR_CONTRATO_DE_RATEIO: "transferencias",
  REPASSAR_AO_CONSORCIO: "transferencias",
  REGISTRAR_DEVOLUCAO_DE_CONSORCIO: "transferencias",
  ESTORNAR_MOVIMENTO_DE_CONSORCIO: "transferencias",
  // M11 — medição de obra (ENT03b · Lei 14.133 art. 140)
  REGISTRAR_MEDICAO_DE_OBRA: "licitacoes",
  APROVAR_MEDICAO_DE_OBRA: "licitacoes",
  // M31 — controle interno (ENT03b · CF art. 74)
  ABRIR_AUDITORIA_INTERNA: "controle-interno",
  RESPONDER_CHECKLIST_DE_AUDITORIA: "controle-interno",
  REGISTRAR_IRREGULARIDADE: "controle-interno",
  REGISTRAR_PROVIDENCIA: "controle-interno",
  APRECIAR_PROVIDENCIA: "controle-interno",
  ENCERRAR_AUDITORIA_INTERNA: "controle-interno",
  EMITIR_RELATORIO_CIRCUNSTANCIADO: "controle-interno",
};

/**
 * As áreas que o usuário enxerga, dadas as ações que ele realmente tem.
 *
 * ⚠️ A ORDEM É A DE `AREAS`, e não a de descoberta: a barra lateral não pode embaralhar os
 * itens conforme o perfil — quem usa o sistema todo dia navega por posição.
 */
export function areasVisiveis(
  acoesDoUsuario: Iterable<AcaoDoSistema>
): readonly SlugDeArea[] {
  const comTela = new Set<SlugDeArea>();
  for (const a of acoesDoUsuario) {
    const destino = AREA_DA_ACAO[a];
    if (destino !== undefined && destino !== "transversal") comTela.add(destino);
  }
  // Área sem ação de mutação nenhuma é área de leitura — ver o cabeçalho.
  const semAcoes = new Set(
    AREAS.map((a) => a.slug).filter(
      (slug) => !Object.values(AREA_DA_ACAO).includes(slug)
    )
  );
  return AREAS.filter((a) => comTela.has(a.slug) || semAcoes.has(a.slug)).map(
    (a) => a.slug
  );
}

/** As áreas que NENHUMA ação de mutação alcança — só leitura. Exportada para o teste. */
export function areasSemAcao(): readonly SlugDeArea[] {
  const comAcao = new Set(Object.values(AREA_DA_ACAO));
  return AREAS.map((a) => a.slug).filter((s) => !comAcao.has(s));
}
