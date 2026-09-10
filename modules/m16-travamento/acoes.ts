/**
 * M16 — O CENSO DAS AÇÕES. TR 4.55/4.56 (usuários e permissões) · 6.4/6.5 (segregação).
 *
 * ═══ ⚠️ ISTO É UM CENSO, NÃO UMA TAXONOMIA INVENTADA ═══
 * Cada ação abaixo corresponde a UM SERVIÇO REAL exportado por um módulo. Nada foi
 * agrupado "para ficar bonito", e nada foi criado para um serviço que não existe. Uma
 * permissão que autoriza algo que o sistema não faz é uma promessa vazia; uma ação que o
 * sistema faz e ninguém classificou é uma porta sem fechadura.
 *
 * ⚠️ **LEITURAS FICAM DE FORA, NESTA FASE.** O rol cobre as MUTAÇÕES — o que muda o razão
 * ou o cadastro. A leitura segregada por unidade gestora (o outro lado do 6.4) é camada de
 * APLICAÇÃO (o `where` de cada consulta), e não uma permissão: negar `balancoOrcamentario`
 * a alguém não protege nada se ele puder ler o razão por outro caminho. PENDÊNCIA NOMEADA.
 *
 * ═══ ⚠️⚠️ E AQUI ESTÁ O LIMITE DO RECORD — LEIA ANTES DE CONFIAR NELE ═══
 * O `ACAO_DO_SERVICO` abaixo é exaustivo sobre `NomeDeServico`, que é uma união que EU
 * ESCREVI À MÃO. Ele garante que, se alguém acrescentar um nome à união e esquecer o
 * mapeamento, o TypeScript reclama.
 *
 * **Ele NÃO garante que um serviço NOVO apareça na união.** Quem escreve
 * `export async function pagarPrecatorio()` amanhã simplesmente não o declara aqui — e
 * nada acontece. O compilador não sabe que o serviço existe.
 *
 * A rede que pega ISSO é um GREP-TESTE (`m16-censo.test.ts`), que varre os módulos e falha
 * se um `export async function` de mutação não estiver no censo, nomeando arquivo e função.
 * É a mesma anatomia do grep-teste do funil — e pela mesma razão: o compilador só enxerga o
 * que alguém declarou.
 */

// ═══════════════════════════════════════════════════════════════════════════
// O ROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ UMA AÇÃO POR SERVIÇO DE MUTAÇÃO. O nome da ação é o do serviço, em maiúsculas — de
 * propósito: quando o erro disser "usuário X não tem permissão para EMPENHAR", quem lê sabe
 * exatamente qual botão ele apertou. Uma ação "GESTAO_DA_DESPESA" agruparia empenhar,
 * liquidar e pagar num crachá só — e a segregação do 6.4 existe justamente para separá-los.
 */
export type AcaoDoSistema =
  // ── M01 — o razão ──
  /** TR 5.95 — o LANÇAMENTO MANUAL. É a chave-mestra do razão: partidas arbitrárias, sem
   *  fato de origem. Se alguma ação tem de ser rara e vigiada, é esta. */
  | "REGISTRAR_LANCAMENTO_MANUAL"
  | "ESTORNAR_LANCAMENTO_MANUAL"
  // ── M02 — planejamento ──
  | "CRIAR_FICHA"
  | "CRIAR_RECEITA_PREVISTA"
  | "REPREVISAR_RECEITA"
  // ── M02 — programação financeira (CMD/MBA · TR 4.18/4.43/4.44) ──
  | "CRIAR_VERSAO_CMD"
  | "CRIAR_VERSAO_MBA"
  | "LIBERAR_PROGRAMACAO"
  | "CONFIGURAR_LIMITACAO_EMPENHO"
  // ── M03 — créditos adicionais ──
  | "CRIAR_LEI_DE_CREDITO"
  | "CRIAR_DECRETO_DE_CREDITO"
  | "EXECUTAR_CREDITO"
  | "ANULAR_CREDITO"
  | "ENCERRAR_DECRETO"
  // ── M04 — receita ──
  | "REGISTRAR_ARRECADACAO"
  | "ANULAR_ARRECADACAO"
  // ── M04 — reconhecimento pelo fato gerador (TR 5.87/5.88) ──
  | "RECONHECER_RECEITA"
  | "ESTORNAR_RECONHECIMENTO"
  | "CANCELAR_RECONHECIMENTO"
  // ── M05 — despesa ──
  | "RESERVAR_DOTACAO"
  | "LIBERAR_RESERVA"
  | "EMPENHAR"
  | "ANULAR_EMPENHO"
  | "ANULAR_EMPENHO_PARCIAL"
  | "LIQUIDAR"
  | "ANULAR_LIQUIDACAO"
  | "ANULAR_LIQUIDACAO_PARCIAL"
  | "PAGAR"
  // ── M05 — T07: a ordem de pagamento. TRÊS ações, e a separação é o ponto ──
  /** Preparar a ordem: dizer QUE se pretende pagar. Não autoriza nada. */
  | "PREPARAR_ORDEM_PAGAMENTO"
  /** Autorizar: o consentimento. Ação PRÓPRIA para que o ente possa dá-la a outra pessoa. */
  | "AUTORIZAR_ORDEM_PAGAMENTO"
  /** Cancelar a ordem — motivo obrigatório. */
  | "CANCELAR_ORDEM_PAGAMENTO"
  | "ANULAR_PAGAMENTO"
  | "ANULAR_PAGAMENTO_PARCIAL"
  | "ESTORNAR_ANULACAO_PARCIAL"
  // ── M07 — extraorçamentário ──
  | "REGISTRAR_INGRESSO_EXTRA"
  | "REGISTRAR_DISPENDIO_EXTRA"
  | "ESTORNAR_MOVIMENTO_EXTRA"
  // ── M08 — exercício e restos a pagar ──
  | "ABRIR_EXERCICIO"
  | "ENCERRAR_EXERCICIO"
  | "APURAR_RESULTADO"
  | "ESTORNAR_APURACAO"
  | "ENCERRAR_CONTROLES_ORCAMENTARIOS"
  | "ESTORNAR_ENCERRAMENTO_CONTROLES"
  | "LIQUIDAR_RESTOS_A_PAGAR"
  | "PAGAR_RESTOS_A_PAGAR"
  | "CANCELAR_RESTOS_A_PAGAR"
  | "ANULAR_PAGAMENTO_RESTOS_A_PAGAR"
  | "ANULAR_CANCELAMENTO_RESTOS_A_PAGAR"
  // ── M09 — tesouraria ──
  | "IMPORTAR_EXTRATO"
  | "VINCULAR_CONCILIACAO"
  | "ESTORNAR_VINCULO"
  | "TRANSFERIR_ENTRE_CONTAS"
  | "REGISTRAR_MOVIMENTO_BANCARIO"
  | "ESTORNAR_MOVIMENTO_BANCARIO"
  // ── M18 — SAGRES Captura 2.0 ──
  | "SUBMETER_CAPTURA"
  // ── M20 — importadores de arquivo externo (folha/tributário) ──
  | "IMPORTAR_FOLHA"
  | "IMPORTAR_TRIBUTOS"
  // ── M10 — almoxarifado ──
  | "CADASTRAR_CLASSE_DE_MATERIAL"
  | "REGISTRAR_ENTRADA_ALMOXARIFADO"
  | "REGISTRAR_SAIDA_CONSUMO"
  | "REGISTRAR_AJUSTE_ALMOXARIFADO"
  | "ESTORNAR_MOVIMENTO_ALMOXARIFADO"
  // ── M10 — patrimônio ──
  | "ADQUIRIR_BEM"
  | "REGISTRAR_ENTRADA_AVULSA"
  | "ALIENAR_BEM"
  | "BAIXAR_BEM"
  | "REGISTRAR_REAVALIACAO"
  | "REGISTRAR_IMPAIRMENT"
  | "REGISTRAR_CUSTO_SUBSEQUENTE"
  | "ATUALIZAR_COMPETENCIA_PATRIMONIAL"
  | "ESTORNAR_MOVIMENTO_PATRIMONIAL"
  // ── M10 — dívida consolidada ──
  | "CADASTRAR_DIVIDA"
  | "REGISTRAR_ATUALIZACAO_MONETARIA"
  | "ESTORNAR_MOVIMENTO_DIVIDA"
  // ── M10 — dívida ativa ──
  | "CADASTRAR_DIVIDA_ATIVA"
  | "INSCREVER_DIVIDA_ATIVA"
  | "ATUALIZAR_DIVIDA_ATIVA"
  | "CANCELAR_DIVIDA_ATIVA"
  | "ESTORNAR_MOVIMENTO_DIVIDA_ATIVA"
  // ── M10 — provisões ──
  | "CADASTRAR_PROVISAO"
  | "CONSTITUIR_PROVISAO"
  | "REVERTER_PROVISAO"
  | "ATUALIZAR_PROVISAO"
  | "ESTORNAR_MOVIMENTO_PROVISAO"
  // ── M11 — licitações, contratos e obras ──
  | "CADASTRAR_PROCESSO"
  | "HOMOLOGAR_PROCESSO"
  | "CADASTRAR_CONTRATO"
  | "REGISTRAR_ADITIVO"
  | "ESTORNAR_MOVIMENTO_CONTRATUAL"
  | "CADASTRAR_LIMITE"
  | "CADASTRAR_OBRA"
  // ── M12 — relatórios (parametrização) ──
  | "CADASTRAR_LINHA_DEMONSTRATIVO"
  // ── M19 — pessoas e credores ──
  | "CADASTRAR_PESSOA"
  | "ALTERAR_PESSOA"
  | "MOVER_PAPEL_DE_PESSOA"
  // ── M16 — travamento ──
  | "TRAVAR_COMPETENCIA"
  | "DESTRAVAR_COMPETENCIA"
  // ── M16 — administração de usuários (TR 4.55/4.56) · família ADMINISTRACAO ──
  | "CRIAR_USUARIO"
  | "CONCEDER_PERFIL"
  | "REVOGAR_PERFIL"
  | "ATIVAR_USUARIO"
  | "INATIVAR_USUARIO"
  | "RESETAR_SENHA"
  // ── M21 — protocolo e processo digital (ENT02) ──
  //
  // ⚠️ UMA AÇÃO POR ATO, e não um "GERIR_PROCESSO" que agrupasse tudo. Abrir, tramitar
  // e encerrar são decisões de peso diferente: o atendente do balcão abre e tramita; quem
  // encerra responde pelo mérito. Um crachá só daria os três a quem precisa de um.
  | "ABRIR_PROCESSO"
  | "TRAMITAR_PROCESSO"
  | "RECEBER_PROCESSO"
  | "COMPLEMENTAR_PROCESSO"
  | "SOLICITAR_PARECER"
  | "RESPONDER_PARECER"
  | "SOLICITAR_READEQUACAO"
  | "ATENDER_READEQUACAO"
  | "ENCERRAR_PROCESSO"
  | "ARQUIVAR_PROCESSO"
  | "REABRIR_PROCESSO"
  | "APENSAR_PROCESSO"
  | "DESAPENSAR_PROCESSO"
  | "TORNAR_MOVIMENTO_SEM_EFEITO"
  // ── M21 — os CADASTROS do protocolo (ENT02) ──
  //
  // ⚠️ CONFIGURAR NÃO É OPERAR. Quem desenha o roteiro de um assunto decide por quantos
  // setores todo processo daquele tipo vai passar e em quantos dias; quem abre o
  // processo apenas o usa. Uma ação única daria o primeiro poder a quem precisa do
  // segundo.
  | "CRIAR_SETOR"
  | "LOTAR_USUARIO_NO_SETOR"
  | "CRIAR_ASSUNTO"
  | "REGISTRAR_TAXA_DO_PROCESSO"
  | "BAIXAR_TAXA_DO_PROCESSO"
  // ── M22 — anexos e assinatura (ENT02) ──
  //
  // ⚠️ ASSINAR É AÇÃO PRÓPRIA, separada de tudo o mais. Quem instrui o processo não é
  // necessariamente quem responde por ele: dar a assinatura junto com o trâmite faria
  // do despacho um ato assinado por quem só o encaminhou.
  | "ANEXAR_ARQUIVO"
  | "ASSINAR_DOCUMENTO"
  | "CRIAR_FILA_DE_ASSINATURA"
  | "ASSINAR_NA_FILA"
  // ── M23 — comunicação interna (ENT02) ──
  //
  // ⚠️ ARQUIVAR, DESARQUIVAR, FAVORITAR E DESFAVORITAR COMPARTILHAM UMA AÇÃO SÓ. Eles
  // são o MESMO poder — organizar a própria caixa — e nenhum deles muda o documento
  // para outra pessoa. Quatro crachás separados para "guardar" e "desguardar" o meu
  // próprio e-mail seriam quatro linhas de permissão que ninguém jamais negaria uma
  // sem negar as outras.
  //
  // ETIQUETAR fica de fora dessa fusão de propósito: a tag é VISÍVEL a todos os
  // envolvidos, e por isso não é organização pessoal.
  | "CRIAR_TIPO_DE_COMUNICADO"
  | "RASCUNHAR_COMUNICADO"
  | "EDITAR_RASCUNHO_DE_COMUNICADO"
  | "ENVIAR_COMUNICADO"
  | "RESPONDER_COMUNICADO"
  | "ENCAMINHAR_COMUNICADO"
  | "MARCAR_LEITURA_DE_COMUNICADO"
  | "GERIR_MINHA_CAIXA"
  | "ETIQUETAR_COMUNICADO"
  // ── M25 — campos adicionais (ENT02) ──
  //
  // ⚠️ DEFINIR E PREENCHER SÃO PODERES DIFERENTES, e a separação é o ponto: quem
  // preenche um formulário não é quem decide o que o formulário pergunta. Uma ação
  // única deixaria qualquer atendente criar campo novo no cadastro do ente.
  | "DEFINIR_CAMPO_ADICIONAL"
  | "DESATIVAR_CAMPO_ADICIONAL"
  | "PREENCHER_CAMPOS_ADICIONAIS"
  // ── M26 — designer de relatórios (ENT02) ──
  //
  // ⚠️ DISTRIBUIR TEM AÇÃO PRÓPRIA porque o catálogo pede permissão própria — e com
  // razão: desenhar um relatório para a própria unidade é uma coisa; empurrá-lo para
  // outra entidade é outra, e ela envolve terceiros.
  | "CRIAR_MODELO_DE_RELATORIO"
  | "NOVA_VERSAO_DE_MODELO"
  | "COPIAR_MODELO_DE_RELATORIO"
  | "DISTRIBUIR_MODELO_DE_RELATORIO"
  | "RETIRAR_MODELO_DE_RELATORIO"
  | "EXECUTAR_RELATORIO"
  // ── M27 — ajuda contextual e chamados (ENT02) ──
  //
  // ⚠️ RESPONDER e ENCERRAR sao acoes SEPARADAS. Quem abriu o chamado e quem sabe se
  // o problema acabou; deixar o suporte encerrar junto com a resposta faria a metrica
  // de resolucao medir a velocidade de digitar, nao a de resolver.
  | "ESCREVER_AJUDA_DE_ROTA"
  | "CRIAR_NIVEL_DE_SEVERIDADE"
  | "ABRIR_CHAMADO"
  | "RESPONDER_CHAMADO"
  | "ENCERRAR_CHAMADO"
  | "REABRIR_CHAMADO"
  | "RESPONDER_PESQUISA_DE_SATISFACAO"
  // ── M09 — lote de pagamento e borderô (ENT03) ──
  //
  // ⚠️ AÇÕES PRÓPRIAS, e não reuso de PAGAR. Compor a remessa e autorizar o pagamento são
  // atos de pessoas diferentes: quem monta o lote na tesouraria não é quem autoriza a
  // ordem. Reusar PAGAR daria a quem compõe o crachá de quem paga.
  | "CRIAR_LOTE_DE_PAGAMENTO"
  | "INCLUIR_NO_LOTE"
  | "FECHAR_LOTE"
  | "GERAR_BORDERO"
  | "PROCESSAR_RETORNO_BANCARIO";

/**
 * O NOME DO SERVIÇO, exatamente como ele é exportado. É esta união que o grep-teste
 * confronta com o `export async function` de cada módulo.
 */
export type NomeDeServico =
  | "registrarLancamento"
  | "estornarLancamento"
  | "criarFicha"
  | "criarReceitaPrevista"
  | "reprevisarReceita"
  | "proporCmdDaLoa"
  | "proporMbaDaLoa"
  | "registrarVersaoCmd"
  | "registrarVersaoMba"
  | "liberarProgramacao"
  | "registrarEventoLimitacao"
  | "criarLei"
  | "criarDecreto"
  | "executarCredito"
  | "anularCredito"
  | "encerrarDecreto"
  | "registrarArrecadacao"
  | "anularArrecadacao"
  | "reconhecerReceita"
  | "estornarReconhecimento"
  | "cancelarReconhecimento"
  | "reservarDotacao"
  | "liberarReserva"
  | "empenhar"
  | "anularEmpenho"
  | "anularEmpenhoParcial"
  | "liquidar"
  | "anularLiquidacao"
  | "anularLiquidacaoParcial"
  | "pagar"
  | "prepararOrdemDePagamento"
  | "autorizarOrdemDePagamento"
  | "cancelarOrdemDePagamento"
  | "anularPagamento"
  | "anularPagamentoParcial"
  | "estornarAnulacaoParcial"
  | "registrarIngressoExtra"
  | "registrarDispendioExtra"
  | "estornarMovimentoExtra"
  | "abrirExercicio"
  | "encerrarExercicio"
  | "encerrarExercicioComRestos"
  | "apurarResultadoDoExercicio"
  | "estornarApuracao"
  | "encerrarControlesOrcamentarios"
  | "estornarEncerramentoControles"
  | "liquidarRestosAPagar"
  | "pagarRestosAPagar"
  | "cancelarRestosAPagar"
  | "anularPagamentoRestosAPagar"
  | "anularCancelamentoRestosAPagar"
  | "importarExtrato"
  | "importarExtratoBb"
  | "vincular"
  | "estornarVinculo"
  | "transferirEntreContas"
  | "registrarMovimentoBancario"
  | "estornarMovimentoBancario"
  | "submeterCaptura"
  | "confirmarImportacaoFolha"
  | "confirmarImportacaoTributos"
  | "cadastrarClasseDeMaterial"
  | "registrarEntradaAlmoxarifado"
  | "registrarSaidaConsumo"
  | "registrarAjusteAlmoxarifado"
  | "estornarMovimentoAlmoxarifado"
  | "adquirirBem"
  | "registrarEntradaAvulsa"
  | "alienarBem"
  | "baixarBem"
  | "registrarReavaliacao"
  | "registrarImpairment"
  | "registrarCustoSubsequente"
  | "atualizarCompetencia"
  | "estornarMovimentoPatrimonial"
  | "cadastrarDivida"
  | "registrarAtualizacaoMonetaria"
  | "estornarMovimentoDivida"
  | "cadastrarDividaAtiva"
  | "inscreverDividaAtiva"
  | "atualizarDividaAtiva"
  | "cancelarDividaAtiva"
  | "estornarMovimentoDividaAtiva"
  | "cadastrarProvisao"
  | "constituirProvisao"
  | "reverterProvisao"
  | "atualizarProvisao"
  | "estornarMovimentoProvisao"
  | "cadastrarProcesso"
  | "homologarProcesso"
  | "cadastrarContrato"
  | "registrarAditivo"
  | "estornarMovimentoContratual"
  | "cadastrarLimite"
  | "cadastrarObra"
  | "cadastrarLinhaDemonstrativo"
  | "travar"
  | "destravar"
  | "cadastrarPessoa"
  | "alterarPessoa"
  | "moverPapelDePessoa"
  // ── M16 — administração de usuários (7.14) ──
  | "criarUsuario"
  | "concederPerfil"
  | "revogarPerfil"
  | "ativarUsuario"
  | "inativarUsuario"
  | "resetarSenha"
  // ── M21 — protocolo (ENT02) ──
  | "abrirProcesso"
  | "tramitar"
  | "receberProcesso"
  | "complementarProcesso"
  | "solicitarParecer"
  | "responderParecer"
  | "solicitarReadequacao"
  | "atenderReadequacao"
  | "encerrarProcesso"
  | "arquivarProcesso"
  | "reabrirProcesso"
  | "apensarProcesso"
  | "desapensarProcesso"
  | "tornarMovimentoSemEfeito"
  // ── M21 — cadastros do protocolo (ENT02) ──
  | "criarSetor"
  | "lotarUsuarioNoSetor"
  | "criarAssunto"
  | "registrarTaxaDoProcesso"
  | "baixarTaxaDoProcesso"
  // ── M22 — anexos e assinatura (ENT02) ──
  | "anexarArquivo"
  | "assinarDocumento"
  | "criarFilaDeAssinatura"
  | "assinarNaFila"
  // ── M23 — comunicação interna (ENT02) ──
  | "criarTipoDeComunicado"
  | "rascunharComunicado"
  | "editarRascunho"
  | "enviarComunicado"
  | "responderComunicado"
  | "encaminharComunicado"
  | "marcarLeitura"
  | "arquivarComunicado"
  | "desarquivarComunicado"
  | "favoritarComunicado"
  | "desfavoritarComunicado"
  | "etiquetarComunicado"
  // ── M25 — campos adicionais (ENT02) ──
  | "definirCampoAdicional"
  | "desativarCampoAdicional"
  | "preencherCamposAdicionais"
  // ── M26 — designer de relatórios (ENT02) ──
  | "criarModeloDeRelatorio"
  | "novaVersaoDoModelo"
  | "copiarModeloDeRelatorio"
  | "distribuirModeloDeRelatorio"
  | "retirarModeloDeRelatorio"
  | "executarRelatorio"
  // ── M27 — ajuda e suporte (ENT02) ──
  | "escreverAjudaDeRota"
  | "criarNivelDeSeveridade"
  | "abrirChamado"
  | "responderChamado"
  | "encerrarChamado"
  | "reabrirChamado"
  | "responderPesquisaDeSatisfacao"
  // ── M09 — lote de pagamento e borderô (ENT03) ──
  | "criarLoteDePagamento"
  | "incluirNoLote"
  | "fecharLote"
  | "gerarBordero"
  | "processarRetornoBancario";

/**
 * ⚠️ O RECORD EXAUSTIVO — serviço → ação.
 *
 * Um nome novo na união `NomeDeServico` **não compila** até alguém lhe dar uma ação. É a
 * garantia que o compilador PODE dar. A que ele não pode dar — que o serviço novo apareça
 * na união — é do grep-teste. Ver o cabeçalho.
 *
 * ⚠️ Repare que `encerrarExercicio` e `encerrarExercicioComRestos` mapeiam para a MESMA
 * ação (`ENCERRAR_EXERCICIO`): são dois caminhos para o mesmo ato administrativo (com e sem
 * inscrição de RP), e dar-lhes crachás diferentes deixaria o ente conceder um e negar o
 * outro sem saber que concedeu o mesmo poder duas vezes.
 */
export const ACAO_DO_SERVICO: Record<NomeDeServico, AcaoDoSistema> = {
  registrarLancamento: "REGISTRAR_LANCAMENTO_MANUAL",
  estornarLancamento: "ESTORNAR_LANCAMENTO_MANUAL",

  criarFicha: "CRIAR_FICHA",
  criarReceitaPrevista: "CRIAR_RECEITA_PREVISTA",
  reprevisarReceita: "REPREVISAR_RECEITA",

  proporCmdDaLoa: "CRIAR_VERSAO_CMD",
  registrarVersaoCmd: "CRIAR_VERSAO_CMD",
  proporMbaDaLoa: "CRIAR_VERSAO_MBA",
  registrarVersaoMba: "CRIAR_VERSAO_MBA",
  liberarProgramacao: "LIBERAR_PROGRAMACAO",
  registrarEventoLimitacao: "CONFIGURAR_LIMITACAO_EMPENHO",

  criarLei: "CRIAR_LEI_DE_CREDITO",
  criarDecreto: "CRIAR_DECRETO_DE_CREDITO",
  executarCredito: "EXECUTAR_CREDITO",
  anularCredito: "ANULAR_CREDITO",
  encerrarDecreto: "ENCERRAR_DECRETO",

  registrarArrecadacao: "REGISTRAR_ARRECADACAO",
  anularArrecadacao: "ANULAR_ARRECADACAO",

  reconhecerReceita: "RECONHECER_RECEITA",
  estornarReconhecimento: "ESTORNAR_RECONHECIMENTO",
  cancelarReconhecimento: "CANCELAR_RECONHECIMENTO",

  reservarDotacao: "RESERVAR_DOTACAO",
  liberarReserva: "LIBERAR_RESERVA",
  empenhar: "EMPENHAR",
  anularEmpenho: "ANULAR_EMPENHO",
  anularEmpenhoParcial: "ANULAR_EMPENHO_PARCIAL",
  liquidar: "LIQUIDAR",
  anularLiquidacao: "ANULAR_LIQUIDACAO",
  anularLiquidacaoParcial: "ANULAR_LIQUIDACAO_PARCIAL",
  pagar: "PAGAR",
  // T07 — cada etapa da ordem é uma ação própria. Um "GERIR_ORDEM" só juntaria de volta
  // o que a separação existe para separar: quem pede o pagamento e quem o consente.
  prepararOrdemDePagamento: "PREPARAR_ORDEM_PAGAMENTO",
  autorizarOrdemDePagamento: "AUTORIZAR_ORDEM_PAGAMENTO",
  cancelarOrdemDePagamento: "CANCELAR_ORDEM_PAGAMENTO",
  anularPagamento: "ANULAR_PAGAMENTO",
  anularPagamentoParcial: "ANULAR_PAGAMENTO_PARCIAL",
  estornarAnulacaoParcial: "ESTORNAR_ANULACAO_PARCIAL",

  registrarIngressoExtra: "REGISTRAR_INGRESSO_EXTRA",
  registrarDispendioExtra: "REGISTRAR_DISPENDIO_EXTRA",
  estornarMovimentoExtra: "ESTORNAR_MOVIMENTO_EXTRA",

  abrirExercicio: "ABRIR_EXERCICIO",
  encerrarExercicio: "ENCERRAR_EXERCICIO",
  encerrarExercicioComRestos: "ENCERRAR_EXERCICIO",
  apurarResultadoDoExercicio: "APURAR_RESULTADO",
  estornarApuracao: "ESTORNAR_APURACAO",
  encerrarControlesOrcamentarios: "ENCERRAR_CONTROLES_ORCAMENTARIOS",
  estornarEncerramentoControles: "ESTORNAR_ENCERRAMENTO_CONTROLES",
  liquidarRestosAPagar: "LIQUIDAR_RESTOS_A_PAGAR",
  pagarRestosAPagar: "PAGAR_RESTOS_A_PAGAR",
  cancelarRestosAPagar: "CANCELAR_RESTOS_A_PAGAR",
  anularPagamentoRestosAPagar: "ANULAR_PAGAMENTO_RESTOS_A_PAGAR",
  anularCancelamentoRestosAPagar: "ANULAR_CANCELAMENTO_RESTOS_A_PAGAR",

  importarExtrato: "IMPORTAR_EXTRATO",
  // M17-a: import por API do BB reusa a AÇÃO (não alarga permissão) — o par do encerrarExercicio.
  importarExtratoBb: "IMPORTAR_EXTRATO",
  vincular: "VINCULAR_CONCILIACAO",
  estornarVinculo: "ESTORNAR_VINCULO",
  transferirEntreContas: "TRANSFERIR_ENTRE_CONTAS",
  registrarMovimentoBancario: "REGISTRAR_MOVIMENTO_BANCARIO",
  estornarMovimentoBancario: "ESTORNAR_MOVIMENTO_BANCARIO",
  submeterCaptura: "SUBMETER_CAPTURA",
  confirmarImportacaoFolha: "IMPORTAR_FOLHA",
  confirmarImportacaoTributos: "IMPORTAR_TRIBUTOS",

  cadastrarClasseDeMaterial: "CADASTRAR_CLASSE_DE_MATERIAL",
  registrarEntradaAlmoxarifado: "REGISTRAR_ENTRADA_ALMOXARIFADO",
  registrarSaidaConsumo: "REGISTRAR_SAIDA_CONSUMO",
  registrarAjusteAlmoxarifado: "REGISTRAR_AJUSTE_ALMOXARIFADO",
  estornarMovimentoAlmoxarifado: "ESTORNAR_MOVIMENTO_ALMOXARIFADO",

  adquirirBem: "ADQUIRIR_BEM",
  registrarEntradaAvulsa: "REGISTRAR_ENTRADA_AVULSA",
  alienarBem: "ALIENAR_BEM",
  baixarBem: "BAIXAR_BEM",
  registrarReavaliacao: "REGISTRAR_REAVALIACAO",
  registrarImpairment: "REGISTRAR_IMPAIRMENT",
  registrarCustoSubsequente: "REGISTRAR_CUSTO_SUBSEQUENTE",
  atualizarCompetencia: "ATUALIZAR_COMPETENCIA_PATRIMONIAL",
  estornarMovimentoPatrimonial: "ESTORNAR_MOVIMENTO_PATRIMONIAL",

  cadastrarDivida: "CADASTRAR_DIVIDA",
  registrarAtualizacaoMonetaria: "REGISTRAR_ATUALIZACAO_MONETARIA",
  estornarMovimentoDivida: "ESTORNAR_MOVIMENTO_DIVIDA",

  cadastrarDividaAtiva: "CADASTRAR_DIVIDA_ATIVA",
  inscreverDividaAtiva: "INSCREVER_DIVIDA_ATIVA",
  atualizarDividaAtiva: "ATUALIZAR_DIVIDA_ATIVA",
  cancelarDividaAtiva: "CANCELAR_DIVIDA_ATIVA",
  estornarMovimentoDividaAtiva: "ESTORNAR_MOVIMENTO_DIVIDA_ATIVA",

  cadastrarProvisao: "CADASTRAR_PROVISAO",
  constituirProvisao: "CONSTITUIR_PROVISAO",
  reverterProvisao: "REVERTER_PROVISAO",
  atualizarProvisao: "ATUALIZAR_PROVISAO",
  estornarMovimentoProvisao: "ESTORNAR_MOVIMENTO_PROVISAO",

  cadastrarProcesso: "CADASTRAR_PROCESSO",
  homologarProcesso: "HOMOLOGAR_PROCESSO",
  cadastrarContrato: "CADASTRAR_CONTRATO",
  registrarAditivo: "REGISTRAR_ADITIVO",
  estornarMovimentoContratual: "ESTORNAR_MOVIMENTO_CONTRATUAL",
  cadastrarLimite: "CADASTRAR_LIMITE",
  cadastrarObra: "CADASTRAR_OBRA",

  cadastrarPessoa: "CADASTRAR_PESSOA",
  alterarPessoa: "ALTERAR_PESSOA",
  moverPapelDePessoa: "MOVER_PAPEL_DE_PESSOA",

  cadastrarLinhaDemonstrativo: "CADASTRAR_LINHA_DEMONSTRATIVO",

  travar: "TRAVAR_COMPETENCIA",
  destravar: "DESTRAVAR_COMPETENCIA",

  // M16 — administração de usuários (7.14). A família ADMINISTRACAO — quem gerencia usuários não é
  // quem executa despesa; cada ação concedida átomo a átomo (o teste de não-herança prova).
  criarUsuario: "CRIAR_USUARIO",
  concederPerfil: "CONCEDER_PERFIL",
  revogarPerfil: "REVOGAR_PERFIL",
  ativarUsuario: "ATIVAR_USUARIO",
  inativarUsuario: "INATIVAR_USUARIO",
  resetarSenha: "RESETAR_SENHA",

  // ── M21 — protocolo e processo digital (ENT02) ──
  abrirProcesso: "ABRIR_PROCESSO",
  tramitar: "TRAMITAR_PROCESSO",
  receberProcesso: "RECEBER_PROCESSO",
  complementarProcesso: "COMPLEMENTAR_PROCESSO",
  solicitarParecer: "SOLICITAR_PARECER",
  responderParecer: "RESPONDER_PARECER",
  solicitarReadequacao: "SOLICITAR_READEQUACAO",
  atenderReadequacao: "ATENDER_READEQUACAO",
  encerrarProcesso: "ENCERRAR_PROCESSO",
  arquivarProcesso: "ARQUIVAR_PROCESSO",
  reabrirProcesso: "REABRIR_PROCESSO",
  apensarProcesso: "APENSAR_PROCESSO",
  desapensarProcesso: "DESAPENSAR_PROCESSO",
  tornarMovimentoSemEfeito: "TORNAR_MOVIMENTO_SEM_EFEITO",

  // ── M21 — cadastros do protocolo (ENT02) ──
  criarSetor: "CRIAR_SETOR",
  lotarUsuarioNoSetor: "LOTAR_USUARIO_NO_SETOR",
  criarAssunto: "CRIAR_ASSUNTO",
  registrarTaxaDoProcesso: "REGISTRAR_TAXA_DO_PROCESSO",
  baixarTaxaDoProcesso: "BAIXAR_TAXA_DO_PROCESSO",

  // ── M22 — anexos e assinatura (ENT02) ──
  anexarArquivo: "ANEXAR_ARQUIVO",
  assinarDocumento: "ASSINAR_DOCUMENTO",
  criarFilaDeAssinatura: "CRIAR_FILA_DE_ASSINATURA",
  assinarNaFila: "ASSINAR_NA_FILA",

  // ── M23 — comunicação interna (ENT02) ──
  criarTipoDeComunicado: "CRIAR_TIPO_DE_COMUNICADO",
  rascunharComunicado: "RASCUNHAR_COMUNICADO",
  editarRascunho: "EDITAR_RASCUNHO_DE_COMUNICADO",
  enviarComunicado: "ENVIAR_COMUNICADO",
  responderComunicado: "RESPONDER_COMUNICADO",
  encaminharComunicado: "ENCAMINHAR_COMUNICADO",
  marcarLeitura: "MARCAR_LEITURA_DE_COMUNICADO",
  // Os quatro compartilham a ação — ver o comentário na união das ações.
  arquivarComunicado: "GERIR_MINHA_CAIXA",
  desarquivarComunicado: "GERIR_MINHA_CAIXA",
  favoritarComunicado: "GERIR_MINHA_CAIXA",
  desfavoritarComunicado: "GERIR_MINHA_CAIXA",
  etiquetarComunicado: "ETIQUETAR_COMUNICADO",

  // ── M25 — campos adicionais (ENT02) ──
  definirCampoAdicional: "DEFINIR_CAMPO_ADICIONAL",
  desativarCampoAdicional: "DESATIVAR_CAMPO_ADICIONAL",
  preencherCamposAdicionais: "PREENCHER_CAMPOS_ADICIONAIS",

  // ── M26 — designer de relatórios (ENT02) ──
  criarModeloDeRelatorio: "CRIAR_MODELO_DE_RELATORIO",
  novaVersaoDoModelo: "NOVA_VERSAO_DE_MODELO",
  copiarModeloDeRelatorio: "COPIAR_MODELO_DE_RELATORIO",
  distribuirModeloDeRelatorio: "DISTRIBUIR_MODELO_DE_RELATORIO",
  retirarModeloDeRelatorio: "RETIRAR_MODELO_DE_RELATORIO",
  executarRelatorio: "EXECUTAR_RELATORIO",

  // ── M27 — ajuda e suporte (ENT02) ──
  escreverAjudaDeRota: "ESCREVER_AJUDA_DE_ROTA",
  criarNivelDeSeveridade: "CRIAR_NIVEL_DE_SEVERIDADE",
  abrirChamado: "ABRIR_CHAMADO",
  responderChamado: "RESPONDER_CHAMADO",
  encerrarChamado: "ENCERRAR_CHAMADO",
  reabrirChamado: "REABRIR_CHAMADO",
  responderPesquisaDeSatisfacao: "RESPONDER_PESQUISA_DE_SATISFACAO",
  //
  // ── M09 — LOTE DE PAGAMENTO E BORDERÔ (ENT03) ──
  //
  // ⚠️ AÇÕES PRÓPRIAS, e não reuso de PAGAR. Compor a remessa e autorizar o pagamento são
  // atos diferentes, de pessoas diferentes: quem monta o lote na tesouraria não é quem
  // autoriza a ordem. Reusar PAGAR daria a quem compõe o crachá de quem paga.
  criarLoteDePagamento: "CRIAR_LOTE_DE_PAGAMENTO",
  incluirNoLote: "INCLUIR_NO_LOTE",
  fecharLote: "FECHAR_LOTE",
  gerarBordero: "GERAR_BORDERO",
  processarRetornoBancario: "PROCESSAR_RETORNO_BANCARIO",
};

/** Todas as ações do rol — a lista que o seed de perfis e as mensagens de erro usam. */
export const TODAS_AS_ACOES: readonly AcaoDoSistema[] = [
  ...new Set(Object.values(ACAO_DO_SERVICO)),
].sort() as AcaoDoSistema[];

/**
 * ⚠️ A FAMÍLIA ADMINISTRACAO — os atos de administração de usuários (7.14).
 *
 * Ela existe para uma razão de SEGREGAÇÃO (TR 6.4): quem cria/gerencia usuários NÃO é quem executa
 * despesa, e um perfil de execução NÃO herda estes poderes só por receber "quase tudo". Todo perfil
 * que não seja o superusuário de instalação recebe cada ação DAQUI átomo a átomo, por concessão
 * explícita — o teste de não-herança prova. É a mesma lógica das `ACOES_DE_CONTROLE` (o contrapeso
 * do fechamento), agora para o cadastro de quem pode o quê.
 */
export const ACOES_DE_ADMINISTRACAO: readonly AcaoDoSistema[] = [
  "CRIAR_USUARIO",
  "CONCEDER_PERFIL",
  "REVOGAR_PERFIL",
  "ATIVAR_USUARIO",
  "INATIVAR_USUARIO",
  "RESETAR_SENHA",
];

/**
 * ⚠️ OS SERVIÇOS QUE O CENSO **NÃO** COBRE, E POR QUÊ. Cada exclusão é uma DECISÃO, e o
 * grep-teste lê esta lista — nada sai do censo por descuido.
 */
export const FORA_DO_CENSO: Record<string, string> = {
  // ── SAGRES (M15): os geradores de arquivo TXT são LEITURA PURA (Prisma findMany → serialização).
  // Não mutam estado — o teste-invariante do próprio M15 prova que não há create/update/aggregate.
  // Exportar/gerar um arquivo é ato de LEITURA; a autorização de quem pode exportar é da tela (S2/S6).
  gerarDotacao: "leitura (gera o TXT SAGRES Dotacao da FichaOrcamentaria — não muta)",
  gerarEmpenhos: "leitura (gera o TXT SAGRES Empenhos — não muta)",
  gerarLiquidacao: "leitura (gera o TXT SAGRES Liquidacao — não muta)",
  gerarCadastroContaBancaria: "leitura (gera o TXT SAGRES CadastroContaBancaria — não muta)",
  gerarSaldoMensal: "leitura (gera o TXT SAGRES SaldoMensal, saldo por SUM na exportação — não muta)",
  lerFatosDotacao: "leitura (Prisma → DTO Dotacao, para validar/serializar — não muta)",
  lerFatosEmpenhos: "leitura (Prisma → DTO Empenhos — não muta)",
  lerFatosLiquidacao: "leitura (Prisma → DTO Liquidacao — não muta)",
  lerFatosCadastroConta: "leitura (Prisma → DTO CadastroContaBancaria — não muta)",
  lerFatosSaldoMensal: "leitura (Prisma → DTO SaldoMensal — não muta)",
  gerarMovimentacaoEntreContas: "leitura (gera o TXT SAGRES MovimentacaoEntreContas — não muta)",
  lerFatosMovimentacao: "leitura (Prisma → DTO MovimentacaoEntreContas — não muta)",
  gerarPagamentos: "leitura (gera o TXT SAGRES Pagamentos — não muta)",
  lerFatosPagamentos: "leitura (Prisma → DTO Pagamentos, conta pagadora por código — não muta)",
  gerarReceitaOrcamentaria: "leitura (gera o TXT SAGRES ReceitaOrcamentaria — não muta)",
  lerFatosReceitaOrcamentaria: "leitura (Prisma → DTO ReceitaOrcamentaria, conta arrecadadora é param export — não muta)",
  gerarRetencao: "leitura (gera o TXT SAGRES Retencao §4.14 do M07 — não muta)",
  lerFatosRetencao: "leitura (Prisma → DTO Retencao: ingresso extra com pagamentoId — não muta)",
  gerarDespesaExtra: "leitura (gera o TXT SAGRES DespesaExtra §4.20 do M07 — não muta)",
  lerFatosDespesaExtra: "leitura (Prisma → DTO DespesaExtra: dispêndio extra, numeração derivada no exercício — não muta)",
  //
  // ── Créditos adicionais (M03): as CONSULTAS são leitura pura (Prisma → DTO da tela/PDF). ──
  listarDecretos: "leitura (Prisma → DTO dos decretos de crédito, para a tela/PDF — não muta)",
  listarQdd: "leitura (Prisma → DTO do QDD com a dotação atualizada; soma delegada ao calcularSaldos do M05 — não muta)",
  listarContasPcasp: "leitura (Prisma → DTO do plano de contas PCASP, SEM saldo — o saldo é do razão/M12 — não muta)",
  vocabularioDosEmpenhos: "leitura (Prisma distinct → credores/fontes com empenho no recorte, para os filtros — não muta)",
  listarLeis: "leitura (Prisma → DTO das leis de crédito, para o SELECT do form — não muta)",
  //
  // ── Pessoas e credores (M19): a listagem é leitura pura. ──
  // A derivação (versão vigente, papéis vigentes) acontece em SQL para que o filtro caia
  // sobre a versão VIGENTE e não sobre nomes antigos — mas continua sendo SELECT.
  listarPessoas: "leitura (SQL com DISTINCT ON → DTO da lista de pessoas, com os papéis vigentes — não muta)",
  // ── Importadores (M20): a PRÉVIA é pura (parse+validação, nada grava) e o histórico é leitura. ──
  previaDaFolha: "puro (texto → linhas+violações; a prévia NÃO grava — a confirmação é que é ato)",
  previaDeTributos: "puro (texto → linhas+violações; a prévia NÃO grava)",
  hashDoArquivo: "puro (sha256 do conteúdo — a trava de idempotência)",
  listarImportacoes: "leitura (histórico de importações confirmadas — não muta)",
  //
  // ── Extraorçamentário (M07): CONSULTAS de leitura pura (saldos/retenções/despesas extra). ──
  listarTiposConsignacao: "leitura (Prisma → DTO dos eventos de consignação — não muta)",
  listarSaldosExtra: "leitura (Σ por consignatário — saldo a repassar; não muta)",
  listarRetencoes: "leitura (Prisma → DTO das retenções com drill ao pagamento — não muta)",
  listarDispendios: "leitura (Prisma → DTO dos recolhimentos/despesa extra — não muta)",
  //
  // ── Leituras: o outro lado do 6.4, e ele é camada de APLICAÇÃO ──
  // Negar `balancoOrcamentario` a alguém não protege nada se ele lê o razão por outro
  // caminho. A segregação de leitura é um `where` em cada consulta, não uma permissão.
  // PENDÊNCIA NOMEADA (6.4-leitura).
  saldosPorConta: "leitura",
  somasPorConta: "leitura",
  somasPorContaELancamento: "leitura",
  saldoDasContas: "leitura",
  saldosDeControle: "leitura",
  movimentosPorConta: "leitura",
  previsaoPorFonte: "leitura",
  reprevisaoAcumuladaPorNatureza: "leitura (Σ dos ajustes de reprevisão por natureza — previsão atualizada)",
  listarReprevisoes: "leitura (histórico append-only de reprevisões de um exercício)",
  previsaoPorNaturezaFonte: "leitura",
  arrecadadoPorFonte: "leitura",
  arrecadadoPorNaturezaFonte: "leitura",
  arrecadadoPorCodigoAcompanhamento: "leitura (arrecadado por CO — base das emendas do RREO Anexo 3)",
  listarArrecadacoes: "leitura (as guias de um período e o total líquido das anulações — a tela da arrecadação)",
  listarNaturezasPrevistas: "leitura (o rol da LOA — o vocabulário que a tela oferece em vez de 8 dígitos de cabeça)",
  despesaPorFonte: "leitura",
  // ⚠️ TRÊS ONDE HAVIA UMA (ADR de 2026-09-10). `saldosDaFicha` foi RETIRADA: os dois
  // eixos de tempo do movimento de dotação respondem perguntas diferentes, e a
  // assinatura antiga respondia uma delas em silêncio. Todas as três são LEITURA —
  // nenhuma grava, e por isso nenhuma vira ação de permissão.
  saldosCorrentesDaFicha: "leitura",
  saldosDaFichaPorCompetencia: "leitura",
  saldosDaFichaPorRegistro: "leitura",
  statusDeEmpenho: "leitura",
  totaisPorTipo: "leitura",
  empenhadoLiquidoPorContrato: "leitura",
  execucaoPorContrato: "leitura",
  saldoDdrPorFonte: "leitura (os 4 baldes da DDR por fonte — o controle de DISPONIBILIDADE, insumo do RGF Anexo 5)",
  rgfAnexo2: "leitura (RGF Anexo 2 — dívida consolidada líquida sobre a RCL ajustada, LRF art. 55 I b)",
  anexo6: "leitura (RREO Anexo 6 — resultado primário e nominal ACIMA DA LINHA, LRF art. 53 III)",
  anexo6AbaixoDaLinha:
    "leitura (RREO Anexo 6 ABAIXO DA LINHA — resultado nominal pela variação da DCL entre dois cortes, mais a harmonização com o acima, LRF art. 53 III)",
  dclNoCorte:
    "leitura (a DCL (I − II) num corte arbitrário — dona única da aritmética; o RGF Anexo 2 e o Anexo 6 abaixo-da-linha a chamam, ninguém a recopia)",
  variacaoMonetariaDaDivida:
    "leitura (Σ das ATUALIZACAO_MONETARIA − ESTORNO numa janela — o ajuste metodológico não-fiscal do RREO Anexo 6 abaixo-da-linha)",
  ingressosOperacaoCreditoPorTipo:
    "leitura (Σ dos INGRESSO_OPERACAO_CREDITO − estorno numa janela, por tipo de dívida — o lado da dívida do RGF Anexo 4, amarrado à receita origem 21)",
  rclAjustadaDoQuadrimestre:
    "leitura (a RCL ajustada do quadrimestre — motor único da família da dívida, RGF Anexos 2/3/4, puxada do RREO Anexo 3; regra Siconfi)",
  rgfAnexo3: "leitura (RGF Anexo 3 — Garantias e Contragarantias sobre a RCL ajustada, LRF art. 55, I, 'c')",
  rgfAnexo4: "leitura (RGF Anexo 4 — Operações de Crédito sobre a RCL ajustada, LRF art. 55, I, 'd')",
  rgfAnexo6: "leitura (RGF Anexo 6 — Demonstrativo Simplificado da Gestão Fiscal; consolida os campos dos Anexos 1-5, sem recalcular)",
  rreoAnexo14: "leitura (RREO Anexo 14 — Demonstrativo Simplificado do RREO; consolida os campos dos Anexos 1/3/6/7/8/11/12, sem recalcular)",
  executarVerificacoes: "leitura (Relatório de Consistência — VISITA as identidades dos donos e devolve a tríade OK/DIVERGE/SEM_DADO; zero aritmética nova, TR 5.128-5.131)",
  diagnosticoPreEnvio: "leitura (diagnóstico pré-envio MSC/Siconfi — compõe os escopos num veredito único, TR 7.27; consome executarVerificacoes)",
  verificacoesDaLoa: "leitura (consistência da LOA — equilíbrio/por-fonte/intra/MDE/Saúde projetados sobre a previsão, TR 4.17; visitadas pelo escopo PLANEJAMENTO)",
  medir: "helper puro (o visitador de igualdade da tríade — compara os dois lados que o dono devolve; não lê banco por si)",
  medirPiso: "helper puro (o visitador de PISO da tríade — OK quando o aplicado atinge o mínimo; não lê banco por si)",
  verificarGeracao: "helper puro (o visitador fail-closed da tríade — gerar sem estourar == OK; não lê banco por si)",
  dotacaoFixadaDetalhada: "leitura (a dotação FIXADA pela LOA no grão da ficha — o lado despesa da consistência da LOA)",
  execucaoPorGrupoNd:
    "leitura (dotação/empenhada/liquidada/paga por (grupo, elemento) de ND no exercício — o eixo que separa despesa primária de financeira; filtra ficha.exercicio, e é isso que mantém o RP pago FORA da coluna (a))",
  rpPagosPorGrupoNd:
    "leitura (RP PAGOS no período por (grupo, elemento), separados em PROCESSADO × NÃO PROCESSADO — as colunas (b) e (c) do RREO Anexo 6; agrega totaisDosMovimentos, o dono da aritmética de RP)",
  saldoDaDividaPorTipo: "leitura (Σ do saldo das dívidas por tipo no corte — agrega saldoDaDividaEm, o dono do saldo de cada dívida)",
  passivoAtuarialEm: "leitura (Σ das provisões matemáticas previdenciárias no corte — o Passivo Atuarial do RGF Anexo 2)",
  bloco2Mde: "leitura (MDE bloco 2 — VAAT capital/infantil, áreas de atuação e RP × lastro, Lei 14.113/2020 arts. 27-28)",
  medirDespesa: "leitura (empenhada/liquidada/paga de um conjunto de fichas — a regra bimestral do MDF, dona única; o bloco 2 a reusa)",
  diferimentoFundeb: "leitura (o diferimento do art. 25 §3º da Lei 14.113/2020 — 10% do FUNDEB utilizáveis no 1º quadrimestre seguinte)",
  rgfAnexo5: "leitura (RGF Anexo 5 — disponibilidade de caixa e restos a pagar por vinculação, LRF art. 55, III, 'a')",
  obrigacoesDoExercicioPorFonte: "leitura (liquidado − pago do exercício corrente por fonte — a coluna (c) do RGF Anexo 5)",
  naturezaDoEmpenho: "leitura (o elemento da natureza da ficha do empenho — é ele que escolhe o roteiro da liquidação, M01)",
  listarFichas: "leitura (as fichas de um exercício/unidade — o select do form de empenho)",
  listarContasBancarias: "leitura (as contas bancárias e a fonte de cada uma — o select do pagamento, TR 5.23)",
  listarEmpenhos: "leitura (a execução de um exercício/unidade com os saldos da TR 5.17 — a tela de empenhos)",
  listarLiquidacoes: "leitura (as liquidações com o empenho de origem — a tela de liquidações)",
  listarPagamentos: "leitura (os pagamentos executados de um exercício/unidade — a tela de anulação, TR 5.35)",
  listarOrdensDePagamento:
    "leitura (as ordens de pagamento de um exercício/unidade, com as quatro etapas de T07 — a tela)",
  liquidacoesParaOrdem:
    "leitura (as liquidações que ainda comportam ordem — o vocabulário do formulário)",
  exigirOrdemAutorizada:
    "guard (T07 — confere, DENTRO da transação do pagamento, que a ordem está AUTORIZADA, é da mesma liquidação e tem o valor exato; não abre transação e não pede permissão própria — quem paga já pediu a dele)",
  dossieDoEmpenho:
    "leitura (o dossiê de UM empenho: origem, liquidações, pagamentos, retenções, anulações e o razão de toda a cadeia — a tela de conferência do empenho)",
  dadosDasLiquidacoes: "leitura (credor e empenho de cada liquidação — o que a fila do art. 141 não carrega; enriquece o painel do M06)",
  saldoDaLei: "leitura",
  saldoDosRestos: "leitura",
  restosAPagarPorFonte: "leitura",
  saldoExtraorcamentario: "leitura",
  extraorcamentarioPorFonte: "leitura",
  totaisDoConsignatario: "leitura",
  conciliacaoBancaria: "leitura",
  // ⚠️ M09/ENT03a — as duas são LEITURA, e a distinção importa: quem GRAVA movimento
  // bancário é `registrarMovimentoBancario`, que tem ação própria. Estas duas apenas
  // somam os fatos que já existem. Dar ação a elas seria conceder permissão para
  // consultar um saldo que o próprio extrato já mostra.
  fatosDeCaixaDaConta: "leitura",
  saldoDaContaBancaria: "leitura",

  // ⚠️ M05/ENT03a — OS TRÊS SÃO COMPOSÁVEIS, e uma ação própria para eles seria uma
  // permissão que não significa nada de novo.
  //
  // Eles não gravam por conta própria: montam o texto canônico do fato (função pura) e
  // chamam `anexarArquivo` e `criarFilaDeAssinatura`. Cada uma dessas DUAS já é uma ação
  // do censo, e cada uma já autoriza no escopo certo — o anexo pelo EMPENHO ou pela
  // LIQUIDAÇÃO (ver `escopoDoDono`), a fila pelo alvo do anexo.
  //
  // Uma terceira ação aqui teria de ser concedida junto com as outras duas para servir
  // de alguma coisa, e poderia DIVERGIR delas: alguém com a ação nova e sem a de anexar
  // receberia uma recusa vinda de dentro, com a mensagem errada. Pior, alguém poderia
  // um dia conceder só a nova achando que bastava, e o sistema recusaria por outro
  // motivo — a permissão viraria decoração.
  enviarEmpenhoParaAssinatura: "composável interno",
  enviarLiquidacaoParaAssinatura: "composável interno",
  enviarOrdemParaAssinatura: "composável interno",
  // Pré-condição PURA da fila, compartilhada entre o M22 e o M05. Não toca o banco.
  exigirFilaViavel: "guard",
  situacaoDoLancamento: "leitura",
  vinculoLiquidoDoLancamento: "leitura",
  vinculoLiquidoDoMovimento: "leitura",
  saldoDaClasseDeMaterial: "leitura",
  valorBrutoDaClasse: "leitura",
  valorContabilDaClasse: "leitura",
  valorBrutoDoBem: "leitura",
  valorContabilDoBem: "leitura",
  atualizacaoAcumuladaDaClasse: "leitura",
  demonstrativoPatrimonialPorClasse: "leitura",
  saldoDaDividaEm: "leitura",
  saldoDaDividaAtivaEm: "leitura",
  saldoAArrecadar: "leitura (o LEITOR do 5.87 — corta por dataFatoGerador)",
  saldoReconhecidoDe: "leitura (saldo de UM reconhecimento — a base do guard Σ baixas)",
  saldoDaProvisaoEm: "leitura",
  saldoDoContrato: "leitura",
  valorAtualizadoDoContrato: "leitura",
  empenhadoLiquidoDoContrato: "leitura",
  vigenciaFimDoContrato: "leitura",
  estaVigenteEm: "leitura",
  homologadoEm: "leitura",
  limiteVigenteEm: "leitura",
  relatorioProcessosLicitatorios: "leitura",
  balancoOrcamentario: "leitura",
  anexo1: "leitura (RREO Anexo 1 — Balanço Orçamentário, LRF art. 52)",
  anexo2: "leitura (RREO Anexo 2 — Despesa por Função/Subfunção, LRF art. 52 II)",
  anexo3: "leitura (RREO Anexo 3 — Receita Corrente Líquida, LRF art. 53 I)",
  anexo7: "leitura (RREO Anexo 7 — Restos a Pagar por Poder e Órgão, LRF art. 53 V)",
  restosParaAnexo7: "leitura (inscrições de RP recortadas por ano do fato — base do Anexo 7)",
  anexo12: "leitura (RREO Anexo 12 — ASPS/Saúde, LC 141/2012 art. 35)",
  anexo8: "leitura (RREO Anexo 8 — MDE/Educação, LDB art. 72; CF art. 212/212-A)",
  anexo11: "leitura (RREO Anexo 11 — Alienação de Ativos, LRF art. 53 §1º III)",
  rgfAnexo1: "leitura (RGF Anexo 1 — Despesa com Pessoal, LRF art. 55 I 'a')",
  anexo13: "leitura (RREO Anexo 13 — PPP, Lei 11.079/2004 art. 28)",
  baseDeImpostos: "leitura (base de impostos e transferências — motor compartilhado ASPS/MDE/FUNDEB)",
  lerDeParaBaseImpostos: "leitura (de-para natureza→chave da base de impostos — fonte única do motor)",
  balancoFinanceiro: "leitura",
  balancoPatrimonial: "leitura",
  demonstracaoVariacoesPatrimoniais: "leitura",
  apuradoNoPeriodo: "leitura",
  ordemCronologicaMensal: "leitura",
  relatorioRestosAPagar: "leitura",
  // ── os LIVROS obrigatórios (TR 5.92-5.94): leitura pura, compõem o `somasPorConta` ──
  diario: "leitura (Livro Diário — TR 5.92)",
  razaoAnalitico: "leitura (Livro Razão — TR 5.93)",
  balancete: "leitura (Balancete de verificação — TR 5.94)",
  // ── M02 — programação financeira: leitores e o gerador de decreto ──
  confrontoMba: "leitura (o confronto do art. 9º — meta × arrecadado)",
  gerarDecretoCmd: "leitura (compõe o texto do decreto — TR 4.19)",
  gerarDecretoMba: "leitura (idem)",
  superavitFinanceiroPorFonte: "leitura",
  linhasDoSuperavitPorFonte: "leitura",
  datasetDespesa: "leitura",
  datasetReceita: "leitura",
  gerarMsc: "leitura",
  gerarManad: "leitura",
  resolverDimensoes: "leitura",
  estaTravado: "leitura",
  estaEncerrado: "leitura",
  exercicioEstaEncerrado: "leitura",
  anoDaFicha: "leitura",
  conferirDotacaoContraRazao: "leitura",
  conferirAlmoxarifadoContraRazao: "leitura",
  conferirDividaAtivaContraRazao: "leitura",
  conferirProvisaoContraRazao: "leitura",
  reconciliarFicha: "leitura",

  // ── Composáveis internos: rodam DENTRO da transação de outro serviço ──
  // Eles não são um ato do usuário — são uma perna do ato dele. Autorizá-los
  // separadamente autorizaria duas vezes a mesma coisa (e permitiria conceder metade de
  // uma operação atômica, que é pior do que nenhuma).
  lancarNoRazao: "funil interno (a autorização é do serviço; o funil só confere IDENTIDADE)",
  persistirArrecadacaoNaTx: "composável interno",
  criarLancamentoExtra: "composável interno",
  registrarRetencoesDoPagamento: "composável interno (perna do pagar)",
  estornarRetencoesDoPagamento: "composável interno",
  registrarMovimentoDotacao: "composável interno",
  amortizarNoPagamento: "composável interno (perna do pagar)",
  estornarAmortizacaoDoPagamento: "composável interno",
  aoAnularLiquidacaoTotal: "composável interno (cascata do M05)",
  aoAnularLiquidacaoParcial: "composável interno (cascata do M05)",
  ingressoNaTx: "composável interno",
  estornarIngressoNaTx: "composável interno",
  receberNaTx: "composável interno",
  estornarRecebimentoNaTx: "composável interno",
  arrecadarIngressoOperacaoCredito: "composável interno (adapter M04↔M10)",
  arrecadarRecebimentoDividaAtiva: "composável interno (adapter M04↔M10)",
  arrecadarComVinculo: "composável interno (a composta arrecadação + vínculo, TR 5.87)",
  vincularReconhecimentoNaTx: "composável interno (perna da arrecadação vinculada)",
  resolverContas: "composável interno",
  recalcularCache: "composável interno",
  garantirDotacaoInicial: "composável interno",
  exigirFonteDaFicha: "guard",
  exigirCotaCmd: "guard (a limitação de empenho pelo CMD — TR 4.43)",
  exigirTipoAtivo: "guard",
  exigirExercicioAberto: "guard",
  exigirExercicioDaFichaAberto: "guard",
  // Guard novo do ADR de 2026-09-10: confere o exercício da COMPETÊNCIA, não o da ficha.
  exigirCompetenciaEmExercicioAberto: "guard",
  exigirLiquidacaoCorrente: "guard",
  exigirPagamentoCorrente: "guard",
  exigirAnulacaoDePagamentoCorrente: "guard",
  exigirTetoDaDispensa: "guard",
  exigirCompetenciaDestravada: "guard (o do travamento)",
  // ⚠️ OS GUARDS DA PRÓPRIA AUTORIZAÇÃO. Autorizar o `autorizar` seria circular — e
  // conceder a alguém o poder de "conferir permissões" não faz sentido: ele não é um ato,
  // é a pergunta que precede todo ato.
  exigirUsuarioAtivo: "guard (identidade — usado pelo funil)",
  autorizar: "guard (a própria autorização; autorizá-la seria circular)",
  autorizarNo: "guard (a autorização no escopo do fato)",

  // ── AUTENTICAÇÃO (TR 4.55): ela PRECEDE a autorização, e não pode depender dela ──
  //
  // ⚠️ Exigir permissão para AUTENTICAR seria circular: para saber o que o usuário pode, é
  // preciso saber QUEM ele é — e é justamente isto que descobre quem ele é. É o mesmo argumento
  // do `autorizar` logo acima.
  autenticar: "autenticação (precede a autorização — autorizá-la seria circular)",
  validarSessao: "autenticação (é ela que troca o token pela identidade, na borda)",
  revogarSessao: "autenticação (o logout — quem tem o token é dono da sessão)",
  revogarTodasDoUsuario: "autenticação (perna da troca de senha)",
  revogarSessoesNaTx: "autenticação (o corpo da revogação em massa, JÁ dentro de uma tx — composável interno; usado pela troca de senha e pela inativação de usuário)",
  gerarHashDeSenha: "cripto (puro; não toca banco)",
  conferirSenha: "cripto (puro; não toca banco)",
  //
  // ⚠️ `definirSenha` É O CASO DIFÍCIL, E ELE VAI NOMEADO EM VEZ DE RESOLVIDO ÀS PRESSAS.
  //
  // Trocar a PRÓPRIA senha não é ato que se conceda a alguém — é do dono. Mas RESETAR a senha de
  // OUTRO é um poder e tanto (quem o tem entra na conta do tesoureiro). O certo seria uma ação
  // no censo — e ela NÃO nasce aqui por uma razão concreta: uma ação nova cai, por herança, no
  // perfil EXECUCAO das fixtures (que recebe `TODAS_AS_ACOES` menos as de CONTROLE), e todo
  // executor passaria a poder trocar a senha alheia. Quem pode resetar senha é decisão de
  // ESCOPO — do ente —, não de código.
  // PENDÊNCIA NOMEADA (4.55-reset-de-senha).
  // ⚠️ `definirSenha` continua FORA_DO_CENSO — mas agora como AUTENTICAÇÃO PURA (a troca-a-própria e
  // a perna interna do `resetarSenha`), não mais como a pendência 4.55. O 4.55 foi QUITADO na 7.14:
  // o reset de terceiro passou a ser o serviço `resetarSenha`, que COBRA a ação RESETAR_SENHA do
  // censo. `definirSenha` em si é a mecânica compartilhada (o scrypt + a revogação de sessões).
  definirSenha: "autenticação (a mecânica compartilhada da senha — usada por resetarSenha, autorizado, e pela troca-a-própria)",
  //
  // A porta do log da borda. Registrar não é um ato do usuário — é o sistema contando o que
  // aconteceu. Exigir permissão para logar seria permitir que alguém agisse SEM deixar rastro.
  comOperacaoRegistrada: "porta da borda (o log do 6.1-6.3)",
  // ── Os RESOLVEDORES DE ESCOPO (TR 6.5). Eles não são atos: são a pergunta "de qual
  // unidade gestora é este fato?", e a resposta sai andando até a ficha. Ver `escopo.ts`.
  ugDaFicha: "resolvedor de escopo (6.5)",
  ugDoSetor: "resolvedor de escopo (6.5) — a UG sai da unidade orçamentária do setor (ENT02)",
  //
  // ── M24 — notificações (ENT02). Notificar NÃO é ato do usuário: é o sistema contando
  // o que aconteceu. Exigir permissão para notificar permitiria agir sem avisar ninguém,
  // que é o oposto do que a notificação existe para garantir. Mesma razão do log da borda.
  //
  // ── M21 — as CONSULTAS do protocolo (ENT02). Leitura pura: nenhuma grava.
  //
  // ⚠️ `podeVerProcesso` NÃO é uma exceção à autorização — é a REGRA DE VISIBILIDADE,
  // e ela é uma só para a caixa, para a busca e para o download de anexo. Escrevê-la em
  // três lugares garantiria que um dia divergissem, e a divergência interessante é
  // sempre a mesma: o processo some da listagem e o anexo continua baixável.
  podeVerProcesso: "leitura (a regra de visibilidade do processo — compartilhada pela caixa, pela busca e pelo anexo)",
  listarProcessos: "leitura (a caixa de processos, com o recorte de visibilidade no where)",
  dossieDoProcesso: "leitura (o dossiê e a linha do tempo; devolve null a quem não pode ver)",
  acompanhamentoExterno: "leitura (a consulta do requerente por número + código verificador, sem sessão)",
  //
  // ── M22 — a leitura do anexo. Ela NÃO é uma ação porque a permissão que a governa é a
  // do REGISTRO DONO: quem pode ler o processo pode ler o anexo dele, e uma ação
  // "BAIXAR_ANEXO" seria uma segunda regra de acesso — que divergiria da primeira.
  baixarAnexo: "leitura (entrega o arquivo depois de perguntar ao registro dono se este usuário pode)",
  //
  // ⚠️ `enviarBordero` NÃO É UMA AÇÃO, e a razão é que ele nunca grava nada: não há canal
  // bancário configurado, e ele SEMPRE recusa. Dar-lhe uma ação criaria uma permissão que
  // o ente concederia a alguém para fazer... nada. E, pior, o dia em que o convênio
  // existisse, a permissão já estaria distribuída sem que ninguém tivesse decidido isso.
  //
  // Ele confere as assinaturas (que é uma LEITURA da fila do M22) e então nomeia o motivo
  // do bloqueio. Quando o canal existir, ele vira um serviço de escrita e ENTRA no censo —
  // e esse commit terá de acrescentar a ação de propósito, que é o comportamento certo.
  enviarBordero: "guard que sempre recusa (transmissão indisponível: sem convênio bancário) — não grava nada",
  podeVerComunicado: "leitura (a regra de visibilidade do comunicado — remetente, destinatários e global)",
  //
  // ── M22 — a LISTA e o LOTE. Mesma doutrina do `baixarAnexo`, e vale repetir por quê: a
  // lista também é vazamento quando erra. Os NOMES dos arquivos de um processo disciplinar
  // contam a história inteira sem que ninguém precise baixar coisa alguma — por isso elas
  // perguntam ao registro dono ANTES de enumerar, e devolvem lista vazia a quem não pode.
  listarAnexosDoProcesso: "leitura (os anexos que ESTE usuário pode ver — pergunta ao processo dono)",
  listarAnexosDaPessoa: "leitura (os anexos de um cadastro do ente; exige usuário ativo)",
  listarAnexosDoComunicado: "leitura (os anexos de um comunicado — pergunta ao M23 quem participa)",
  loteDeAnexosDoProcesso: "leitura (monta o zip com o que baixarAnexo entregaria um a um)",
  loteDeAnexosDaPessoa: "leitura (idem, para o cadastro de pessoas)",
  //
  // ── M23 — as CONSULTAS da comunicação interna (ENT02). Leitura pura.
  listarCaixaDeComunicados: "leitura (a caixa CALCULADA para quem pergunta — não há coluna de caixa)",
  leiturasDoComunicado: "leitura (quem leu, quando e por qual origem; devolve null a quem não participa)",
  integridadeDoEnvio: "leitura (confronta o hash carimbado no envio com o texto de hoje)",
  //
  // ── M25 — as CONSULTAS dos campos adicionais (ENT02). Leitura pura.
  camposDoRegistro: "leitura (os campos de um registro com o valor VIGENTE — o mais recente)",
  historicoDeCamposAdicionais: "leitura (o histórico É a tabela: os valores são append-only)",
  registrosComCampo: "leitura (o filtro da listagem, sobre a coluna TIPADA e só o valor vigente)",
  //
  // ── M26 — designer de relatórios (ENT02).
  //
  // ⚠️ `processarExecucoesPendentes` NÃO é ato do usuário: é o trabalhador drenando a
  // fila. A autorização aconteceu no ENFILEIRAMENTO, com a identidade de quem pediu.
  // Exigir crachá do trabalhador seria pedir permissão ao processo — e a única saída
  // seria dar-lhe um de superusuário, que é o oposto do que se quer.
  processarExecucoesPendentes: "trabalhador da fila (a autorização foi no enfileiramento)",
  lerFonteProcessos: "leitura (a fonte de dados do designer, já recortada por unidade e por sigilo)",
  lerFonteComunicados: "leitura (idem, para comunicados)",
  //
  // ── M27 — ajuda e suporte (ENT02). Leitura pura.
  ajudaDaRota: "leitura (o texto de ajuda VIGENTE de uma rota — o mais recente)",
  listarChamados: "leitura (os chamados que o usuário pode ver; quem abriu vê o seu)",
  detalheDoChamado: "leitura (o histórico do chamado; devolve null a quem não pode ver)",
  //
  // ⚠️ O ARMAZENAMENTO É I/O DE DISCO, não ato do usuário. `gravarArquivo` e `lerArquivo`
  // são chamados DE DENTRO de `anexarArquivo` e `baixarAnexo`, que é onde a autorização
  // mora. Dar-lhes ação própria criaria uma permissão "escrever no disco" que ninguém
  // saberia conceder — e que não corresponde a nenhum botão.
  gravarArquivo: "I/O de disco (chamado por anexarArquivo, que é quem autoriza)",
  lerArquivo: "I/O de disco com conferência de integridade (chamado por baixarAnexo, que é quem autoriza)",
  registrarNotificacao: "porta do sistema (o aviso do fato — não é ato do usuário)",
  notificarVarios: "porta do sistema (o mesmo aviso a N destinatários, deduplicados)",
  ugDaReserva: "resolvedor de escopo (6.5)",
  ugDoEmpenho: "resolvedor de escopo (6.5)",
  ugDaLiquidacao: "resolvedor de escopo (6.5)",
  ugDoPagamento: "resolvedor de escopo (6.5)",
  ugDaInscricaoRp: "resolvedor de escopo (6.5)",
  ugDoMovimentoRp: "resolvedor de escopo (6.5)",
  ugDoMovimentoAlmoxarifado: "resolvedor de escopo (6.5)",
  ugDoMovimentoPatrimonial: "resolvedor de escopo (6.5)",
  ugDoInterno: "resolvedor de escopo (6.5)",
  ugDoVinculo: "resolvedor de escopo (6.5)",
  ugsDoLancamento: "resolvedor de escopo (6.5)",
  travarFichas: "lock",
  travarLiquidacoes: "lock",
  travarDivida: "lock",

  // ── Seeds, backfills e helpers de fixture: não são caminho de usuário ──
  semearM06: "seed",
  semearM07: "seed",
  semearM08: "seed",
  semearLimitesOficiais: "seed",
  backfillDotacaoInicial: "backfill",
  empenharDe2026: "helper de fixture",
  liquidarDe2026: "helper de fixture",
  pagarDe2026: "helper de fixture",
  empenharELiquidar: "helper de fixture",
};
