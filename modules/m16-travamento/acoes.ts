/**
 * M16 — O CENSO DAS AÇÕES. TR 4.55/4.56 (usuários e permissões) · 6.4/6.5 (segregação).
 *
 * ═══ ⚠️ ISTO É UM CENSO, NÃO UMA TAXONOMIA INVENTADA ═══
 * Cada ação abaixo corresponde a UM SERVIÇO REAL exportado por um módulo. Nada foi
 * agrupado "para ficar bonito", e nada foi criado para um serviço que não existe. Uma
 * permissão que autoriza algo que o sistema não faz é uma promessa vazia; uma ação que o
 * sistema faz e ninguém classificou é uma porta sem fechadura.
 *
 * ⚠️ **AS LEITURAS ENTRARAM (orquestração V3, 4.1).** Até aqui o rol cobria só as MUTAÇÕES,
 * e a leitura era "camada de aplicação" — um `where` por consulta e nenhuma permissão. A
 * ENT10 mediu o que isso custava: a leitura resolvia o escopo pela UNIÃO das unidades de
 * TODAS as ações do usuário, e `exigirLeitura` só exigia sessão. Agora a leitura é
 * permissão como qualquer outra: uma ação `CONSULTAR_<ÁREA>` por área de navegação
 * (`ACOES_DE_LEITURA`, abaixo), concedida global ou por unidade gestora, e a política
 * de leitura (`lib/portas/leitura.ts`) resolve o escopo DAQUELA ação — não da união.
 * Permissão global em uma ação não concede leitura global em outra.
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
  | "ABRIR_CONCILIACAO"
  | "ENCERRAR_CONCILIACAO"
  | "REGISTRAR_PENDENCIA_MANUAL"
  | "JUSTIFICAR_PENDENCIA"
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
  // ── M10 — almoxarifado, EIXO FÍSICO (ENT05, TR 5.18) ──
  | "CADASTRAR_DEPOSITO"
  | "CADASTRAR_UNIDADE_DE_MEDIDA"
  | "CADASTRAR_GRUPO_DE_MATERIAL"
  | "CADASTRAR_MATERIAL"
  | "DEFINIR_PARAMETRO_DE_ESTOQUE"
  | "REGISTRAR_ENTRADA_FISICA"
  | "REGISTRAR_SAIDA_FISICA"
  | "ESTORNAR_MOVIMENTO_FISICO"
  | "TRANSFERIR_ENTRE_DEPOSITOS"
  | "REGISTRAR_REQUISICAO_DE_MATERIAL"
  | "DEFINIR_COTA_DE_CONSUMO"
  | "ABRIR_INVENTARIO_DE_ESTOQUE"
  | "REGISTRAR_CONTAGEM_DE_INVENTARIO"
  | "FECHAR_INVENTARIO_DE_ESTOQUE"
  | "BLOQUEAR_ESTOQUE"
  | "ENCERRAR_BLOQUEIO_DE_ESTOQUE"
  // ── ENT07 — o ACERVO: a classe classifica, o bem existe ──
  // Até aqui nada no domínio criava um `BemPatrimonial`: `adquirirBem` exige liquidação e
  // `registrarEntradaAvulsa` recebe um bem que já existe. Cadastrar e AVALIAR são dois atos,
  // e por isso duas ações — quem põe o bem no acervo não é quem lhe atribui valor.
  | "CADASTRAR_CLASSE_DE_BENS"
  | "CADASTRAR_BEM"
  // ── ENT11 — o EIXO FINANCEIRO do patrimônio: o roteiro contábil de cada evento ──
  //
  // ⚠️ UMA AÇÃO PARA OS DOIS ROTEIROS, e a decisão é deliberada. `RoteiroPatrimonial` (o
  // movimento do bem) e `RoteiroResultadoAlienacao` (o ganho/perda da venda) são tabelas
  // irmãs porque as chaves vêm de enums diferentes — mas o ATO é o mesmo: dizer em que par
  // de contas do PCASP um evento patrimonial bate. Duas ações inventariam uma segregação
  // que o termo de referência não pede, e cada uma teria de ser concedida à mão em toda
  // instalação existente. É o mesmo raciocínio de `REGISTRAR_MOVIMENTO_DE_GESTAO`, que
  // cobre os quatro eixos de gestão do bem com um crachá só.
  | "PARAMETRIZAR_ROTEIRO_PATRIMONIAL"
  // ── Orquestração V3 (4.5) — PUBLICAR uma versão de roteiro é ato separado de PROPOR.
  // Quem propõe o par de contas (validado pelo motor) não é necessariamente quem o põe em
  // vigor: a publicação é a aprovação, e a segregação do 6.4 pede dois crachás.
  | "PUBLICAR_ROTEIRO_PATRIMONIAL"
  // ── V3 (pacote 2) — o parâmetro de depreciação/amortização/exaustão da classe é
  // VERSIONADO e tem crachá próprio: quem parametriza roteiro não é necessariamente quem
  // decide vida útil e residual (é decisão do contador sobre a NBC TSP 07).
  | "DEFINIR_PARAMETRO_DE_ATUALIZACAO"
  // ── M02b — o planejamento PLURIANUAL (PPA e LDO), V4 §8 Fila A, conciliado do siafic-cg c04ad5a ──
  //
  // ⚠️ DEZ AÇÕES PARA VINTE SERVIÇOS, e não é preguiça de censo: o agrupamento segue os ANEXOS DA
  // LRF, que é como o trabalho se divide numa prefeitura. Quem monta o Anexo de Metas Fiscais
  // (art. 4º §1º) não é quem monta o de Riscos (art. 4º §3º), e nenhum dos dois é quem cadastra a
  // árvore temática do PPA. Uma ação por serviço daria vinte crachás que ninguém concede
  // separadamente — e o ente concederia todos "para simplificar", o oposto do 6.4. Uma ação só
  // daria o crachá que abre o planejamento inteiro. Precedente: `encerrarExercicio` /
  // `encerrarExercicioComRestos`.
  | "CADASTRAR_PPA"
  | "CADASTRAR_ESTRUTURA_PPA"
  | "CADASTRAR_PROGRAMA_PPA"
  | "CADASTRAR_RECEITA_PPA"
  | "CADASTRAR_LDO"
  | "CADASTRAR_PRIORIDADE_LDO"
  | "CADASTRAR_METAS_FISCAIS_LDO"
  | "CADASTRAR_RISCOS_FISCAIS_LDO"
  | "CADASTRAR_RENUNCIA_RECEITA_LDO"
  | "CADASTRAR_ALIENACAO_LDO"

  // ── M10 — patrimônio, EIXO DE GESTÃO (ENT05, TR 5.19) ──
  | "CADASTRAR_LOCALIZACAO_FISICA"
  | "CADASTRAR_COMISSAO_PATRIMONIAL"
  | "CADASTRAR_MOTIVO_DE_BAIXA"
  | "CADASTRAR_TIPO_DE_INCORPORACAO"
  | "CADASTRAR_FORMULA_DE_AVALIACAO"
  | "REGISTRAR_MOVIMENTO_DE_GESTAO"
  | "TRANSFERIR_BEM_ENTRE_ENTIDADES"
  | "ESTORNAR_MOVIMENTO_DE_GESTAO"
  | "GERAR_ETIQUETA_DE_BEM"
  | "EMITIR_TERMO_PATRIMONIAL"
  | "ABRIR_INVENTARIO_DE_BENS"
  | "REGISTRAR_CONTAGEM_DE_BEM"
  | "FECHAR_INVENTARIO_DE_BENS"
  // ── M01 — a correção de eixo do plano de contas (ENT05, ITEM 3) ──
  | "REPONTAR_CONTA"
  // ── M11 — A COMPRA (ENT05, TR 5.17) ──
  | "RELACIONAR_MARCA_AO_MATERIAL"
  | "RELACIONAR_ELEMENTO_AO_MATERIAL"
  | "REGISTRAR_SOLICITACAO_DE_COMPRA"
  | "MOVIMENTAR_SOLICITACAO_DE_COMPRA"
  | "REGISTRAR_PESQUISA_DE_PRECOS"
  | "EMITIR_ORDEM_DE_COMPRA"
  | "REGISTRAR_RECEBIMENTO_DE_ORDEM"
  | "ESTORNAR_ORDEM_DE_COMPRA"
  | "REGISTRAR_DOCUMENTO_FISCAL"
  | "CONFERIR_DOCUMENTO_FISCAL"
  | "CANCELAR_DOCUMENTO_FISCAL"
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
  // ── M16 — o CRACHÁ do crachá (ENT06 item 1) ──
  //
  // ⚠️ CONCEDER AÇÃO A PERFIL É O PODER DE DISTRIBUIR PODER, e por isso tem ação própria,
  // separada de `CONCEDER_PERFIL`. Conceder um PERFIL a alguém entrega um crachá que já
  // existe; conceder uma AÇÃO a um perfil MUDA o que aquele crachá abre — para todos que o
  // têm, de uma vez. São poderes de ordem diferente, e juntá-los daria, a quem só devia
  // vincular servidores a perfis prontos, a capacidade de ampliar qualquer perfil.
  | "CRIAR_PERFIL"
  | "CONCEDER_ACAO_A_PERFIL"
  | "REVOGAR_ACAO_DE_PERFIL"
  // ── V3 (pacote 2) — o usuário É uma pessoa do cadastro: vínculo explícito, auditável,
  // opcional, e que NÃO concede permissão. Família ADMINISTRACAO, como criar usuário.
  | "VINCULAR_PESSOA_AO_USUARIO"
  // ── V6 (P0.1) — a APRESENTAÇÃO do ente (nome de exibição, imagem, contatos, tema, canais):
  // versionada, auditada, família ADMINISTRACAO. Não toca o `EnteConfig` fiscal.
  | "CONFIGURAR_APRESENTACAO_DO_ENTE"
  // ── V6 (P1.2) — atribuir a conta bancária a uma arrecadação do LEGADO (M09): ato do tesoureiro,
  // conferido contra o razão. Família FINANCEIRO, do ente (a arrecadação é do ente).
  | "ATRIBUIR_CONTA_A_ARRECADACAO"
  // ── V6 (P2.1/P2.2) — M32 PESSOAL (RH bloco 1, conciliado do siafic-cg c04ad5a). Catorze ações
  // para dezessete serviços; a divisão é a da origem (ver modules/m32-pessoal/MODULO.md):
  // criar a vaga × ocupar a vaga; cadastrar a pessoa × admitir; mover × pagar; instruir × decidir.
  | "CADASTRAR_SERVIDOR"
  | "ADMITIR_SERVIDOR"
  | "MOVIMENTAR_SERVIDOR"
  | "ALTERAR_REMUNERACAO"
  | "DESLIGAR_SERVIDOR"
  | "CADASTRAR_CARGO"
  | "CADASTRAR_LOTACAO"
  | "GERIR_DEPENDENTE"
  | "BAIXAR_DEPENDENTE"
  | "REGISTRAR_PORTARIA"
  | "REGISTRAR_ANOTACAO"
  | "REGISTRAR_TREINAMENTO"
  | "CONFIGURAR_CALENDARIO_RH"
  | "REGISTRAR_CONTRATO_TRABALHO"
  | "REGISTRAR_AVALIACAO_EXPERIENCIA"
  // V6 P2.3 — M33 folha de pagamento
  | "APROPRIAR_FOLHA"
  // V6.1 — o atesto da folha e a sua liquidação: designar, certificar, liquidar.
  | "DESIGNAR_NA_FOLHA"
  | "CERTIFICAR_FOLHA"
  | "LIQUIDAR_FOLHA"
  // V6.2 — os encargos do empregador: cadastrar e aprovar o parâmetro são sujeitos diferentes; apurar e
  // certificar também. Empenho e liquidação dos encargos usam APROPRIAR_FOLHA e LIQUIDAR_FOLHA.
  | "CADASTRAR_ENCARGO_DA_FOLHA"
  | "APROVAR_ENCARGO_DA_FOLHA"
  | "APURAR_ENCARGOS_DA_FOLHA"
  | "CERTIFICAR_ENCARGOS_DA_FOLHA"
  // V6.2 P3 — a carta de serviços e a representação
  | "CONFIGURAR_CARTA_DE_SERVICOS"
  | "SOLICITAR_SERVICO"
  | "DECIDIR_SOLICITACAO_DE_SERVICO"
  | "REGISTRAR_REPRESENTACAO"
  | "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA"
  | "CONFIGURAR_TABELAS_DA_FOLHA"
  | "CADASTRAR_RUBRICA"
  | "LANCAR_NA_FOLHA"
  | "ABRIR_FOLHA"
  | "CALCULAR_FOLHA"
  | "CANCELAR_CALCULO_DA_FOLHA"
  | "FECHAR_FOLHA"
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
  | "PROCESSAR_RETORNO_BANCARIO"
  // ── M28 — convênios e transferências voluntárias (ENT03b · LRF art. 25) ──
  | "CADASTRAR_CONVENIO"
  | "LIBERAR_PARCELA_DE_CONVENIO"
  /** ⚠️ SEPARADA DE `LIBERAR_PARCELA`, e a separação é SEGREGAÇÃO (TR 6.4): quem libera o
   *  repasse não é quem aprova a prestação de contas dele. Um crachá só para as duas coisas
   *  deixaria a mesma pessoa transferir e dar quitação — que é exatamente o arranjo que o
   *  controle interno existe para impedir. */
  | "APROVAR_PRESTACAO_DE_CONTAS"
  | "GLOSAR_CONVENIO"
  | "REGISTRAR_DEVOLUCAO_DE_CONVENIO"
  | "ESTORNAR_MOVIMENTO_DE_CONVENIO"
  // ── M29 — precatórios judiciais (ENT03b · CF art. 100) ──
  | "CADASTRAR_PRECATORIO"
  | "INSCREVER_PRECATORIO"
  | "ATUALIZAR_PRECATORIO"
  | "CANCELAR_PRECATORIO"
  | "ESTORNAR_MOVIMENTO_DE_PRECATORIO"
  // ── M30 — consórcios públicos (ENT03b · Lei 11.107/2005) ──
  | "CADASTRAR_CONSORCIO"
  /** O contrato de RATEIO é o que autoriza a despesa (art. 8º) — e é ele que fixa o teto que
   *  o guard do repasse confere. Cadastrá-lo é ato distinto de repassar. */
  | "REGISTRAR_CONTRATO_DE_RATEIO"
  | "REPASSAR_AO_CONSORCIO"
  | "REGISTRAR_DEVOLUCAO_DE_CONSORCIO"
  | "ESTORNAR_MOVIMENTO_DE_CONSORCIO"
  // ── M11 — medição de obra (ENT03b · Lei 14.133 art. 140) ──
  | "REGISTRAR_MEDICAO_DE_OBRA"
  /** ⚠️ APROVAR É OUTRO CRACHÁ, pela mesma razão do convênio: quem mede não é quem aprova a
   *  medição. Medir e aprovar com o mesmo poder é atestar o próprio serviço. */
  | "APROVAR_MEDICAO_DE_OBRA"
  // ── M31 — controle interno (ENT03b · CF art. 74) ──
  | "ABRIR_AUDITORIA_INTERNA"
  | "RESPONDER_CHECKLIST_DE_AUDITORIA"
  | "REGISTRAR_IRREGULARIDADE"
  | "REGISTRAR_PROVIDENCIA"
  | "APRECIAR_PROVIDENCIA"
  | "ENCERRAR_AUDITORIA_INTERNA"
  | "EMITIR_RELATORIO_CIRCUNSTANCIADO"
  // ── A LEITURA (orquestração V3, 4.1) — uma ação de CONSULTA por área de navegação ──
  //
  // ⚠️ UMA POR ÁREA, E NÃO UMA POR CONSULTA. O sistema tem mais de cem leituras
  // (`FORA_DO_CENSO` as lista). Uma permissão por leitura seria um rol que ninguém
  // administra — e o administrador concederia "tudo" por atrito, que é como a
  // segregação morre. A área é o grão que o menu já usa (`AREA_DA_ACAO`) e que o
  // usuário reconhece: "ele pode CONSULTAR a despesa". O escopo (global ou uma unidade
  // gestora) vale como em toda ação do censo.
  //
  // ⚠️ E ELAS NÃO SÃO SERVIÇOS DE MUTAÇÃO: não entram em `ACAO_DO_SERVICO`, porque não
  // há um `export async function` que as cobre — quem as cobra são as portas de leitura
  // (`lib/portas/leitura.ts`) e o grep-teste `test/ui/leitura-exige-acao.test.ts`.
  | AcaoDeLeitura;

/** As dezoito ações de LEITURA — uma por `SlugDeArea` de `lib/navegacao.ts`. */
export type AcaoDeLeitura =
  | "CONSULTAR_PLANEJAMENTO"
  | "CONSULTAR_RECEITA"
  | "CONSULTAR_DESPESA"
  | "CONSULTAR_FINANCEIRO"
  | "CONSULTAR_PATRIMONIO"
  | "CONSULTAR_LICITACOES"
  | "CONSULTAR_CONTABILIDADE"
  | "CONSULTAR_RELATORIOS"
  | "CONSULTAR_TRANSPARENCIA"
  | "CONSULTAR_PROTOCOLO"
  | "CONSULTAR_COMUNICACAO"
  | "CONSULTAR_CADASTROS"
  | "CONSULTAR_TRANSFERENCIAS"
  | "CONSULTAR_DIVIDA"
  | "CONSULTAR_CONTROLE_INTERNO"
  | "CONSULTAR_ADMINISTRACAO"
  | "CONSULTAR_INTEGRACOES"
  | "CONSULTAR_SUPORTE"
  | "CONSULTAR_PESSOAL"
  | "CONSULTAR_FOLHA"
  | "CONSULTAR_PORTAL_DO_SERVIDOR"
  | "CONSULTAR_MEUS_SERVICOS";

/**
 * O rol das ações de leitura, para o bootstrap, os perfis de fixture e a política de
 * leitura. A ordem é a das áreas em `lib/navegacao.ts`.
 */
export const ACOES_DE_LEITURA: readonly AcaoDeLeitura[] = [
  "CONSULTAR_PLANEJAMENTO",
  "CONSULTAR_RECEITA",
  "CONSULTAR_DESPESA",
  "CONSULTAR_FINANCEIRO",
  "CONSULTAR_PATRIMONIO",
  "CONSULTAR_LICITACOES",
  "CONSULTAR_CONTABILIDADE",
  "CONSULTAR_RELATORIOS",
  "CONSULTAR_TRANSPARENCIA",
  "CONSULTAR_PROTOCOLO",
  "CONSULTAR_COMUNICACAO",
  "CONSULTAR_CADASTROS",
  "CONSULTAR_TRANSFERENCIAS",
  "CONSULTAR_DIVIDA",
  "CONSULTAR_CONTROLE_INTERNO",
  "CONSULTAR_ADMINISTRACAO",
  "CONSULTAR_INTEGRACOES",
  "CONSULTAR_SUPORTE",
  // V6 P2 — a área de pessoal (M32).
  "CONSULTAR_PESSOAL",
  "CONSULTAR_FOLHA",
  "CONSULTAR_PORTAL_DO_SERVIDOR",
  // V6.2 P3 — o que o requerente pediu, recortado pela pessoa da sessão e pelas representações vigentes.
  "CONSULTAR_MEUS_SERVICOS",
];

/** É uma ação de leitura? — o discriminador que a política de leitura e os testes usam. */
export function ehAcaoDeLeitura(acao: string): acao is AcaoDeLeitura {
  return (ACOES_DE_LEITURA as readonly string[]).includes(acao);
}

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
  | "abrirConciliacao"
  | "encerrarConciliacao"
  | "registrarPendenciaManual"
  | "justificarPendencia"
  | "submeterCaptura"
  | "confirmarImportacaoFolha"
  | "confirmarImportacaoTributos"
  | "cadastrarClasseDeMaterial"
  | "registrarEntradaAlmoxarifado"
  | "registrarSaidaConsumo"
  | "registrarAjusteAlmoxarifado"
  | "estornarMovimentoAlmoxarifado"
  | "cadastrarClasseDeBens"
  | "cadastrarBem"
  | "adquirirBem"
  | "registrarEntradaAvulsa"
  | "alienarBem"
  | "baixarBem"
  | "registrarReavaliacao"
  // ── V3 (4.5) — as versões de roteiro ──
  | "proporVersaoDeRoteiro"
  | "publicarVersaoDeRoteiro"
  | "registrarImpairment"
  | "registrarCustoSubsequente"
  | "atualizarCompetencia"
  | "definirParametroDeAtualizacao"
  | "estornarMovimentoPatrimonial"
  | "cadastrarDeposito"
  | "cadastrarUnidadeDeMedida"
  | "cadastrarGrupoDeMaterial"
  | "cadastrarMaterial"
  | "definirParametroDeEstoque"
  | "registrarEntradaFisica"
  | "registrarSaidaFisica"
  | "estornarMovimentoFisico"
  | "transferirEntreDepositos"
  | "registrarRequisicaoDeMaterial"
  | "definirCotaDeConsumo"
  | "abrirInventarioDeEstoque"
  | "registrarContagemDeInventario"
  | "fecharInventarioDeEstoque"
  | "bloquearEstoque"
  | "encerrarBloqueioDeEstoque"
  | "cadastrarLocalizacaoFisica"
  | "cadastrarComissaoPatrimonial"
  | "cadastrarMotivoDeBaixa"
  | "cadastrarTipoDeIncorporacao"
  | "cadastrarFormulaDeAvaliacao"
  | "registrarMovimentoDeGestao"
  | "transferirBemEntreEntidades"
  | "estornarMovimentoDeGestao"
  | "gerarEtiquetaDeBem"
  | "emitirTermoPatrimonial"
  | "abrirInventarioDeBens"
  | "registrarContagemDeBem"
  | "fecharInventarioDeBens"
  | "repontarConta"
  | "relacionarMarcaAoMaterial"
  | "relacionarElementoAoMaterial"
  | "registrarSolicitacaoDeCompra"
  // ── V6 P1.1 — o vínculo solicitação × ordem ──
  | "vincularSolicitacaoAOrdem"
  | "desfazerVinculoDaSolicitacao"
  | "movimentarSolicitacaoDeCompra"
  | "registrarPesquisaDePrecos"
  | "emitirOrdemDeCompra"
  | "registrarRecebimentoDeOrdem"
  | "estornarOrdemDeCompra"
  | "registrarDocumentoFiscal"
  | "importarDocumentoFiscalDeXml"
  | "conferirDocumentoFiscal"
  | "cancelarDocumentoFiscal"
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
  // ── M16 — perfis: criar e mudar o que um perfil concede (ENT06 item 1) ──
  | "criarPerfil"
  | "concederAcaoAoPerfil"
  | "revogarAcaoDoPerfil"
  // ── V3 (pacote 2) — usuário ↔ pessoa ──
  | "vincularPessoaAoUsuario"
  | "desvincularPessoaDoUsuario"
  // ── V6 (P0.1) — a apresentação do ente ──
  | "registrarApresentacaoDoEnte"
  // ── V6 (P1.2) — a conta bancária da arrecadação do legado ──
  | "atribuirContaAArrecadacao"
  // ── V6 (P2) — M32 pessoal ──
  | "cadastrarCargo"
  | "cadastrarLotacao"
  | "cadastrarServidor"
  | "admitirServidor"
  | "registrarMovimentacao"
  | "registrarAlteracaoRemuneratoria"
  | "desligarServidor"
  | "cadastrarDependente"
  | "registrarFinalidadeDependente"
  | "baixarFinalidadeDependente"
  | "registrarPortaria"
  | "registrarAnotacaoServidor"
  | "registrarTreinamento"
  | "cadastrarDiaCalendarioRh"
  | "cadastrarContratoTrabalho"
  | "prorrogarContratoTrabalho"
  | "registrarAvaliacaoExperiencia"
  // M33 — folha
  | "cadastrarGrupoDeEmpenhoDaFolha"
  | "definirContasDaLiquidacaoDoGrupo"
  | "apropriarFolha"
  | "cadastrarTabelaDeContribuicao"
  | "cadastrarTabelaIrrf"
  | "cadastrarTabelaSalarioFamilia"
  | "cadastrarRubrica"
  | "lancarNaFolha"
  | "abrirFolha"
  | "calcularFolha"
  | "cancelarCalculoDaFolha"
  | "fecharFolha"
  // M33 — a certificação (atesto) da folha e a sua liquidação (V6.1)
  | "designarNaFolha"
  | "revogarDesignacaoNaFolha"
  | "certificarFolha"
  | "devolverFolhaParaCorrecao"
  | "liquidarFolha"
  // M33 — os encargos do empregador (V6.2)
  | "cadastrarComponenteDeEncargo"
  | "cadastrarVersaoDoEncargo"
  | "aprovarVersaoDoEncargo"
  | "apurarEncargosDaFolha"
  | "certificarEncargosDaFolha"
  | "devolverEncargosDaFolha"
  | "cadastrarGrupoDosEncargos"
  | "apropriarEncargosDaFolha"
  | "liquidarEncargosDaFolha"
  | "ajustarEncargosDaFolha"
  // M21/M19 — a carta de serviços, as solicitações do requerente e a representação (V6.2 P3)
  | "cadastrarServicoDaCarta"
  | "cadastrarVersaoDoServico"
  | "publicarVersaoDoServico"
  | "protocolarSolicitacao"
  | "responderExigenciaDaSolicitacao"
  | "anexarDoRequerente"
  | "emitirExigenciaDaSolicitacao"
  | "decidirSolicitacao"
  | "disponibilizarRespostaDaSolicitacao"
  | "registrarRepresentacao"
  | "revogarRepresentacao"
  // ── M02b — planejamento plurianual (V4 §8) ──
  | "criarPlanoPlurianual"
  | "criarEixoEstruturante"
  | "criarAreaTematica"
  | "criarPublicoAlvo"
  | "criarMacroacao"
  | "criarProgramaPpa"
  | "criarIndicadorPrograma"
  | "criarAcaoPpa"
  | "criarPrevisaoReceitaPpa"
  | "criarReceitaAnteriorPpa"
  | "criarLdo"
  | "criarPrioridadeLdo"
  | "criarMetaAnualLdo"
  | "criarRiscoFiscal"
  | "criarRenunciaReceitaLdo"
  | "criarAlienacaoBemLdo"
  | "criarAplicacaoAlienacaoLdo"
  | "criarDividaConsolidadaLdo"
  | "criarProjecaoAtuarialRpps"
  | "criarMargemExpansaoLdo"
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
  | "processarRetornoBancario"
  // ── M28 — convênios (ENT03b) ──
  | "cadastrarConvenio"
  | "liberarParcela"
  | "aprovarPrestacaoDeContas"
  | "glosar"
  | "registrarDevolucao"
  | "estornarMovimentoConvenio"
  // ── M29 — precatórios (ENT03b) ──
  | "cadastrarPrecatorio"
  | "inscreverPrecatorio"
  | "registrarAtualizacaoDePrecatorio"
  | "cancelarPrecatorio"
  | "estornarMovimentoPrecatorio"
  // ── M30 — consórcios (ENT03b) ──
  | "cadastrarConsorcio"
  | "registrarContratoDeRateio"
  | "repassarAoConsorcio"
  | "registrarDevolucaoDeConsorcio"
  | "estornarMovimentoConsorcio"
  // ── M11 — medição de obra (ENT03b) ──
  | "registrarMedicao"
  | "aprovarMedicao"
  // ── M31 — controle interno (ENT03b) ──
  | "abrirAuditoria"
  | "responderItemDoChecklist"
  | "registrarIrregularidade"
  | "registrarProvidencia"
  | "apreciarProvidencia"
  | "encerrarAuditoria"
  | "emitirRelatorioCircunstanciado"
  // ENT11 — o eixo financeiro do patrimônio.
  | "parametrizarRoteiroPatrimonial"
  | "parametrizarRoteiroResultadoAlienacao";

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
  // ⚠️ ABRIR e ENCERRAR são ações SEPARADAS. Encerrar é o ato que o controle interno lê
  // como "isto foi conferido", e quem opera a conciliação no dia a dia não é
  // necessariamente quem assina o fechamento — é a segregação do TR 6.4, a mesma que
  // separa preparar e autorizar a ordem de pagamento.
  abrirConciliacao: "ABRIR_CONCILIACAO",
  encerrarConciliacao: "ENCERRAR_CONCILIACAO",
  registrarPendenciaManual: "REGISTRAR_PENDENCIA_MANUAL",
  justificarPendencia: "JUSTIFICAR_PENDENCIA",
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
  definirParametroDeAtualizacao: "DEFINIR_PARAMETRO_DE_ATUALIZACAO",
  estornarMovimentoPatrimonial: "ESTORNAR_MOVIMENTO_PATRIMONIAL",

  // ENT05 — o eixo FÍSICO do almoxarifado (TR 5.18). Uma ação por serviço, como sempre:
  // "bloquear estoque" e "fechar inventário" são poderes DIFERENTES, e a segregação do
  // 6.4 existe para que o ente possa dar um sem dar o outro.
  cadastrarDeposito: "CADASTRAR_DEPOSITO",
  cadastrarUnidadeDeMedida: "CADASTRAR_UNIDADE_DE_MEDIDA",
  cadastrarGrupoDeMaterial: "CADASTRAR_GRUPO_DE_MATERIAL",
  cadastrarMaterial: "CADASTRAR_MATERIAL",
  definirParametroDeEstoque: "DEFINIR_PARAMETRO_DE_ESTOQUE",
  registrarEntradaFisica: "REGISTRAR_ENTRADA_FISICA",
  registrarSaidaFisica: "REGISTRAR_SAIDA_FISICA",
  estornarMovimentoFisico: "ESTORNAR_MOVIMENTO_FISICO",
  transferirEntreDepositos: "TRANSFERIR_ENTRE_DEPOSITOS",
  registrarRequisicaoDeMaterial: "REGISTRAR_REQUISICAO_DE_MATERIAL",
  definirCotaDeConsumo: "DEFINIR_COTA_DE_CONSUMO",
  abrirInventarioDeEstoque: "ABRIR_INVENTARIO_DE_ESTOQUE",
  registrarContagemDeInventario: "REGISTRAR_CONTAGEM_DE_INVENTARIO",
  fecharInventarioDeEstoque: "FECHAR_INVENTARIO_DE_ESTOQUE",
  bloquearEstoque: "BLOQUEAR_ESTOQUE",
  encerrarBloqueioDeEstoque: "ENCERRAR_BLOQUEIO_DE_ESTOQUE",

  // ENT05 — o eixo de GESTÃO do bem (TR 5.19). Também aqui uma ação por serviço: quem
  // CONTA o bem no inventário não é quem FECHA o inventário, e quem emite termo de
  // responsabilidade não é, necessariamente, quem transfere bem entre entidades.
  // ENT07 — o acervo.
  cadastrarClasseDeBens: "CADASTRAR_CLASSE_DE_BENS",
  cadastrarBem: "CADASTRAR_BEM",
  // ENT11 — os dois roteiros do eixo financeiro, sob a MESMA ação (ver a nota na união).
  parametrizarRoteiroPatrimonial: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL",
  // V3 (4.5): propor é parametrizar (validação estrutural); publicar é OUTRO crachá.
  proporVersaoDeRoteiro: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL",
  publicarVersaoDeRoteiro: "PUBLICAR_ROTEIRO_PATRIMONIAL",
  parametrizarRoteiroResultadoAlienacao: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL",
  cadastrarLocalizacaoFisica: "CADASTRAR_LOCALIZACAO_FISICA",
  cadastrarComissaoPatrimonial: "CADASTRAR_COMISSAO_PATRIMONIAL",
  cadastrarMotivoDeBaixa: "CADASTRAR_MOTIVO_DE_BAIXA",
  cadastrarTipoDeIncorporacao: "CADASTRAR_TIPO_DE_INCORPORACAO",
  cadastrarFormulaDeAvaliacao: "CADASTRAR_FORMULA_DE_AVALIACAO",
  registrarMovimentoDeGestao: "REGISTRAR_MOVIMENTO_DE_GESTAO",
  transferirBemEntreEntidades: "TRANSFERIR_BEM_ENTRE_ENTIDADES",
  estornarMovimentoDeGestao: "ESTORNAR_MOVIMENTO_DE_GESTAO",
  gerarEtiquetaDeBem: "GERAR_ETIQUETA_DE_BEM",
  emitirTermoPatrimonial: "EMITIR_TERMO_PATRIMONIAL",
  abrirInventarioDeBens: "ABRIR_INVENTARIO_DE_BENS",
  registrarContagemDeBem: "REGISTRAR_CONTAGEM_DE_BEM",
  fecharInventarioDeBens: "FECHAR_INVENTARIO_DE_BENS",

  // ENT05 ITEM 3 — repontar conta MOVE SALDO no razão inteiro. Ação própria, do ENTE, e
  // nunca agrupada com cadastro de conta: cadastrar é criar linha; repontar é mexer em
  // saldo que já existe.
  repontarConta: "REPONTAR_CONTA",

  // ENT05 — A COMPRA (TR 5.17). Ação própria para cada um, e o par que mais importa é
  // `EMITIR_ORDEM_DE_COMPRA` x `REGISTRAR_RECEBIMENTO_DE_ORDEM`: quem emite a ordem não
  // é quem atesta o recebimento — é a segregação do 6.4 no ponto onde ela mais vale.
  relacionarMarcaAoMaterial: "RELACIONAR_MARCA_AO_MATERIAL",
  relacionarElementoAoMaterial: "RELACIONAR_ELEMENTO_AO_MATERIAL",
  registrarSolicitacaoDeCompra: "REGISTRAR_SOLICITACAO_DE_COMPRA",
  // V6 P1.1: decidir o que a ordem atende é poder de quem a emite; desfazer, de quem a estorna.
  vincularSolicitacaoAOrdem: "EMITIR_ORDEM_DE_COMPRA",
  desfazerVinculoDaSolicitacao: "ESTORNAR_ORDEM_DE_COMPRA",
  movimentarSolicitacaoDeCompra: "MOVIMENTAR_SOLICITACAO_DE_COMPRA",
  registrarPesquisaDePrecos: "REGISTRAR_PESQUISA_DE_PRECOS",
  emitirOrdemDeCompra: "EMITIR_ORDEM_DE_COMPRA",
  registrarRecebimentoDeOrdem: "REGISTRAR_RECEBIMENTO_DE_ORDEM",
  estornarOrdemDeCompra: "ESTORNAR_ORDEM_DE_COMPRA",
  registrarDocumentoFiscal: "REGISTRAR_DOCUMENTO_FISCAL",
  importarDocumentoFiscalDeXml: "REGISTRAR_DOCUMENTO_FISCAL",
  conferirDocumentoFiscal: "CONFERIR_DOCUMENTO_FISCAL",
  cancelarDocumentoFiscal: "CANCELAR_DOCUMENTO_FISCAL",

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

  // M16 — os perfis (ENT06 item 1). Criar o crachá e mudar o que ele abre.
  criarPerfil: "CRIAR_PERFIL",
  concederAcaoAoPerfil: "CONCEDER_ACAO_A_PERFIL",
  revogarAcaoDoPerfil: "REVOGAR_ACAO_DE_PERFIL",
  // V3 (pacote 2): vincular e desvincular são o MESMO poder (dizer quem o usuário é).
  vincularPessoaAoUsuario: "VINCULAR_PESSOA_AO_USUARIO",
  desvincularPessoaDoUsuario: "VINCULAR_PESSOA_AO_USUARIO",
  // V6 (P0.1): cada reconfiguração da apresentação é uma versão nova, com autor.
  registrarApresentacaoDoEnte: "CONFIGURAR_APRESENTACAO_DO_ENTE",
  // V6 (P1.2): atribuir conta a uma guia do legado é ato próprio do tesoureiro.
  atribuirContaAArrecadacao: "ATRIBUIR_CONTA_A_ARRECADACAO",
  // V6 P2 — M32 pessoal (mapa da origem, mantido): dependente e finalidade são o mesmo poder
  // (lançar o que o servidor entregou); contrato e prorrogação também.
  cadastrarCargo: "CADASTRAR_CARGO",
  cadastrarLotacao: "CADASTRAR_LOTACAO",
  cadastrarServidor: "CADASTRAR_SERVIDOR",
  admitirServidor: "ADMITIR_SERVIDOR",
  registrarMovimentacao: "MOVIMENTAR_SERVIDOR",
  registrarAlteracaoRemuneratoria: "ALTERAR_REMUNERACAO",
  desligarServidor: "DESLIGAR_SERVIDOR",
  cadastrarDependente: "GERIR_DEPENDENTE",
  registrarFinalidadeDependente: "GERIR_DEPENDENTE",
  baixarFinalidadeDependente: "BAIXAR_DEPENDENTE",
  registrarPortaria: "REGISTRAR_PORTARIA",
  registrarAnotacaoServidor: "REGISTRAR_ANOTACAO",
  registrarTreinamento: "REGISTRAR_TREINAMENTO",
  cadastrarDiaCalendarioRh: "CONFIGURAR_CALENDARIO_RH",
  cadastrarContratoTrabalho: "REGISTRAR_CONTRATO_TRABALHO",
  prorrogarContratoTrabalho: "REGISTRAR_CONTRATO_TRABALHO",
  registrarAvaliacaoExperiencia: "REGISTRAR_AVALIACAO_EXPERIENCIA",
  // V6 P2.3 — M33 folha: as três tabelas são UM poder (parametrizar a folha pela norma vigente);
  // abrir, calcular, cancelar o cálculo e fechar são quatro atos distintos, porque quem calcula
  // não é necessariamente quem fecha (o fechamento congela e leva ao empenho).
  // V6 P2.3b — a apropriação contábil: o ato tem crachá PRÓPRIO, e quem o exerce precisa TAMBÉM
  // de EMPENHAR (o M05 exige a sua ação em cada empenho, dentro da transação). Apropriar não é
  // atalho para empenhar: é o ato de dizer que aquela competência fechada vira aquela despesa.
  cadastrarGrupoDeEmpenhoDaFolha: "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA",
  // V6.1 — definir as duas contas patrimoniais da liquidação é o MESMO poder de parametrizar o
  // grupo (quais rubricas, em qual ficha, para quem): quem monta o grupo diz onde a obrigação
  // nasce. Um crachá à parte não separaria ninguém de nada.
  definirContasDaLiquidacaoDoGrupo: "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA",
  apropriarFolha: "APROPRIAR_FOLHA",
  cadastrarTabelaDeContribuicao: "CONFIGURAR_TABELAS_DA_FOLHA",
  cadastrarTabelaIrrf: "CONFIGURAR_TABELAS_DA_FOLHA",
  cadastrarTabelaSalarioFamilia: "CONFIGURAR_TABELAS_DA_FOLHA",
  cadastrarRubrica: "CADASTRAR_RUBRICA",
  lancarNaFolha: "LANCAR_NA_FOLHA",
  abrirFolha: "ABRIR_FOLHA",
  calcularFolha: "CALCULAR_FOLHA",
  cancelarCalculoDaFolha: "CANCELAR_CALCULO_DA_FOLHA",
  fecharFolha: "FECHAR_FOLHA",

  // V6.1 — o atesto da folha e a sua liquidação. TRÊS crachás para CINCO serviços, porque são
  // três PODERES: administrar as designações do ente (criar e revogar é o mesmo poder — quem põe
  // tira), certificar (que inclui devolver para correção: recusar é o outro lado de atestar) e
  // liquidar. Quem liquida precisa TAMBÉM de LIQUIDAR, exigida pelo M05 na unidade da ficha,
  // dentro da transação de cada liquidação — LIQUIDAR_FOLHA não é atalho para liquidar.
  designarNaFolha: "DESIGNAR_NA_FOLHA",
  revogarDesignacaoNaFolha: "DESIGNAR_NA_FOLHA",
  certificarFolha: "CERTIFICAR_FOLHA",
  devolverFolhaParaCorrecao: "CERTIFICAR_FOLHA",
  liquidarFolha: "LIQUIDAR_FOLHA",
  // V6.2 — os encargos do empregador
  cadastrarComponenteDeEncargo: "CADASTRAR_ENCARGO_DA_FOLHA",
  cadastrarVersaoDoEncargo: "CADASTRAR_ENCARGO_DA_FOLHA",
  aprovarVersaoDoEncargo: "APROVAR_ENCARGO_DA_FOLHA",
  apurarEncargosDaFolha: "APURAR_ENCARGOS_DA_FOLHA",
  certificarEncargosDaFolha: "CERTIFICAR_ENCARGOS_DA_FOLHA",
  devolverEncargosDaFolha: "CERTIFICAR_ENCARGOS_DA_FOLHA",
  cadastrarGrupoDosEncargos: "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA",
  apropriarEncargosDaFolha: "APROPRIAR_FOLHA",
  liquidarEncargosDaFolha: "LIQUIDAR_FOLHA",
  // V7 M1 U3 — reduzir a despesa dos encargos é da mesma mão que a apropria; cada anulação do M05
  // cobra DENTRO dela a sua ação (ANULAR_LIQUIDACAO_PARCIAL / ANULAR_EMPENHO_PARCIAL).
  ajustarEncargosDaFolha: "APROPRIAR_FOLHA",
  // V6.2 P3 — a carta de serviços. Configurar a carta é um ato; pedir (protocolar, responder,
  // anexar) é o ato do REQUERENTE, conferido contra a titularidade na transação; decidir (exigir,
  // decidir, disponibilizar resposta) é o ato da mesa, no setor em que o processo está.
  cadastrarServicoDaCarta: "CONFIGURAR_CARTA_DE_SERVICOS",
  cadastrarVersaoDoServico: "CONFIGURAR_CARTA_DE_SERVICOS",
  publicarVersaoDoServico: "CONFIGURAR_CARTA_DE_SERVICOS",
  protocolarSolicitacao: "SOLICITAR_SERVICO",
  responderExigenciaDaSolicitacao: "SOLICITAR_SERVICO",
  anexarDoRequerente: "SOLICITAR_SERVICO",
  emitirExigenciaDaSolicitacao: "DECIDIR_SOLICITACAO_DE_SERVICO",
  decidirSolicitacao: "DECIDIR_SOLICITACAO_DE_SERVICO",
  disponibilizarRespostaDaSolicitacao: "DECIDIR_SOLICITACAO_DE_SERVICO",
  registrarRepresentacao: "REGISTRAR_REPRESENTACAO",
  revogarRepresentacao: "REGISTRAR_REPRESENTACAO",

  // ── M02b — planejamento plurianual (V4 §8): 20 serviços, 10 ações, pelos anexos da LRF ──
  criarPlanoPlurianual: "CADASTRAR_PPA",
  // A árvore temática (eixo, área, público-alvo, macroação) é UM ato: montar a estrutura do plano.
  criarEixoEstruturante: "CADASTRAR_ESTRUTURA_PPA",
  criarAreaTematica: "CADASTRAR_ESTRUTURA_PPA",
  criarPublicoAlvo: "CADASTRAR_ESTRUTURA_PPA",
  criarMacroacao: "CADASTRAR_ESTRUTURA_PPA",
  // O programa no plano, o seu indicador e as suas ações: quem detalha o programa.
  criarProgramaPpa: "CADASTRAR_PROGRAMA_PPA",
  criarIndicadorPrograma: "CADASTRAR_PROGRAMA_PPA",
  criarAcaoPpa: "CADASTRAR_PROGRAMA_PPA",
  // A receita do quadriênio e a série histórica que a instrui.
  criarPrevisaoReceitaPpa: "CADASTRAR_RECEITA_PPA",
  criarReceitaAnteriorPpa: "CADASTRAR_RECEITA_PPA",
  criarLdo: "CADASTRAR_LDO",
  criarPrioridadeLdo: "CADASTRAR_PRIORIDADE_LDO",
  // O Anexo de Metas Fiscais (LRF art. 4º §1º e §2º): metas anuais, dívida, RPPS e margem.
  criarMetaAnualLdo: "CADASTRAR_METAS_FISCAIS_LDO",
  criarDividaConsolidadaLdo: "CADASTRAR_METAS_FISCAIS_LDO",
  criarProjecaoAtuarialRpps: "CADASTRAR_METAS_FISCAIS_LDO",
  criarMargemExpansaoLdo: "CADASTRAR_METAS_FISCAIS_LDO",
  // O Anexo de Riscos Fiscais (art. 4º §3º).
  criarRiscoFiscal: "CADASTRAR_RISCOS_FISCAIS_LDO",
  criarRenunciaReceitaLdo: "CADASTRAR_RENUNCIA_RECEITA_LDO",
  // A alienação prevista e a aplicação do produto (art. 44) são o mesmo demonstrativo.
  criarAlienacaoBemLdo: "CADASTRAR_ALIENACAO_LDO",
  criarAplicacaoAlienacaoLdo: "CADASTRAR_ALIENACAO_LDO",

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

  // ── M28 — convênios (ENT03b) ──
  cadastrarConvenio: "CADASTRAR_CONVENIO",
  liberarParcela: "LIBERAR_PARCELA_DE_CONVENIO",
  aprovarPrestacaoDeContas: "APROVAR_PRESTACAO_DE_CONTAS",
  glosar: "GLOSAR_CONVENIO",
  registrarDevolucao: "REGISTRAR_DEVOLUCAO_DE_CONVENIO",
  estornarMovimentoConvenio: "ESTORNAR_MOVIMENTO_DE_CONVENIO",

  // ── M29 — precatórios (ENT03b) ──
  cadastrarPrecatorio: "CADASTRAR_PRECATORIO",
  inscreverPrecatorio: "INSCREVER_PRECATORIO",
  registrarAtualizacaoDePrecatorio: "ATUALIZAR_PRECATORIO",
  cancelarPrecatorio: "CANCELAR_PRECATORIO",
  estornarMovimentoPrecatorio: "ESTORNAR_MOVIMENTO_DE_PRECATORIO",

  // ── M30 — consórcios (ENT03b) ──
  cadastrarConsorcio: "CADASTRAR_CONSORCIO",
  registrarContratoDeRateio: "REGISTRAR_CONTRATO_DE_RATEIO",
  repassarAoConsorcio: "REPASSAR_AO_CONSORCIO",
  registrarDevolucaoDeConsorcio: "REGISTRAR_DEVOLUCAO_DE_CONSORCIO",
  estornarMovimentoConsorcio: "ESTORNAR_MOVIMENTO_DE_CONSORCIO",

  // ── M11 — medição de obra (ENT03b) ──
  registrarMedicao: "REGISTRAR_MEDICAO_DE_OBRA",
  aprovarMedicao: "APROVAR_MEDICAO_DE_OBRA",

  // ── M31 — controle interno (ENT03b) ──
  abrirAuditoria: "ABRIR_AUDITORIA_INTERNA",
  responderItemDoChecklist: "RESPONDER_CHECKLIST_DE_AUDITORIA",
  registrarIrregularidade: "REGISTRAR_IRREGULARIDADE",
  registrarProvidencia: "REGISTRAR_PROVIDENCIA",
  apreciarProvidencia: "APRECIAR_PROVIDENCIA",
  encerrarAuditoria: "ENCERRAR_AUDITORIA_INTERNA",
  emitirRelatorioCircunstanciado: "EMITIR_RELATORIO_CIRCUNSTANCIADO",
};

/**
 * Todas as ações do rol — a lista que o seed de perfis e as mensagens de erro usam.
 *
 * ⚠️ MUTAÇÕES **E** LEITURAS. As de mutação saem do `ACAO_DO_SERVICO` (uma por serviço,
 * cobradas pelo grep-teste do censo); as de leitura saem de `ACOES_DE_LEITURA` (uma por
 * área, cobradas pela política de leitura). Uma lista que só tivesse as primeiras faria o
 * bootstrap nascer sem leitura nenhuma — e o administrador da instalação abriria um
 * sistema em que não enxerga tela alguma.
 */
export const TODAS_AS_ACOES: readonly AcaoDoSistema[] = [
  ...new Set<AcaoDoSistema>([...Object.values(ACAO_DO_SERVICO), ...ACOES_DE_LEITURA]),
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
  "CRIAR_PERFIL",
  "CONCEDER_ACAO_A_PERFIL",
  "REVOGAR_ACAO_DE_PERFIL",
  "VINCULAR_PESSOA_AO_USUARIO",
  "CONFIGURAR_APRESENTACAO_DO_ENTE",
];

/**
 * ⚠️ OS SERVIÇOS QUE O CENSO **NÃO** COBRE, E POR QUÊ. Cada exclusão é uma DECISÃO, e o
 * grep-teste lê esta lista — nada sai do censo por descuido.
 */
export const FORA_DO_CENSO: Record<string, string> = {
  // ── V6.1 — o atesto da folha e a sua liquidação ──
  parcelasDoCalculo:
    "LEITURA e AGRUPAMENTO puro de banco: diz quem empenha o quê, em qual ficha, por quem. É a ÚNICA verdade " +
    "do agrupamento — a apropriação empenha parcela a parcela e a certificação soma por grupo, para que o atesto " +
    "não descreva uma distribuição e a despesa faça outra. Não muta nada.",
  objetoParaCertificar:
    "LEITURA: monta o manifesto do que se vai certificar (entidade, competência, cálculo, vínculos, alocações) e o " +
    "seu sha256. A tela usa a MESMA função para MOSTRAR o que será atestado. Quem grava o fato é `certificarFolha`.",
  certificacaoDaFolha:
    "LEITURA: a trilha do atesto (certificações e devoluções) e a situação DERIVADA do último fato daquele cálculo.",
  liquidacaoDaFolha:
    "LEITURA: separa empenho liquidado de empenho pendente, para que a folha pela metade nunca apareça como liquidada.",
  designacoesNaFolha:
    "LEITURA: as designações do ente com a vigência DERIVADA (início, fim e revogação) no dia perguntado.",
  // ── V6.2 U0 — disponibilidade dos atos (leituras que alimentam o predicado de elegibilidade) ──
  designacaoVigenteParaOAto:
    "LEITURA: a designação vigente no dia do ato E no instante do servidor — a segunda data impede que uma " +
    "revogação já registrada seja contornada datando o comando novo de antes dela. Não muta nada.",
  retratoDosEncargos:
    "LEITURA: o retrato do estado dos encargos (apuração vigente, atesto, empenhos, liquidações) que os predicados de " +
    "`encargos.ts` leem. A tela projeta a barra; quem decide é o caso de uso.",
  escopoDoProtocolo:
    "LEITURA: o escopo da consulta do protocolo (CONSULTAR_PROTOCOLO no ente e por unidade gestora) e as lotações — " +
    "a entrada da decisão de visibilidade do M21. Não muta nada.",
  podeAgirNoSetor:
    "LEITURA/GUARD: lotação no setor, ou a própria ação do ato concedida no ente sobre processo não sigiloso. " +
    "Chamada dentro da transação de cada ato do M21 (via `exigirLotacao`) e pela projeção da mesa.",
  gravarAnexoNaTransacao:
    "composável interno: grava a linha e o arquivo do anexo DENTRO da transação de um ato que já cobrou a própria ação " +
    "(o XML do documento fiscal, os documentos da solicitação da carta), com o mesmo Zod de dono único e a mesma recusa " +
    "de tipo e tamanho de `anexarArquivo`.",
  representacoesVigentesDoUsuario:
    "LEITURA: as representações que a conta exerce no dia perguntado, com a vigência DERIVADA (início, fim e revogação). " +
    "É a pergunta que o protocolo da solicitação, a resposta à exigência e o download fazem dentro da própria transação.",
  encargosDaFolha:
    "LEITURA: as apurações dos encargos com o comparativo entre versões, os atestos, os empenhos e as liquidações.",
  retratoDosAtosDaFolha:
    "LEITURA: o retrato do estado da folha que os predicados de `elegibilidade.ts` leem, com a versão dos fatos. " +
    "A tela projeta a barra de ações a partir dele; quem decide é o caso de uso, dentro da transação.",
  // ── V6 P2.3b — a apropriação contábil da folha ──
  apropriacaoDaFolha:
    "LEITURA: devolve os empenhos que a folha gerou (o elo competência × despesa) para o detalhe da folha. " +
    "Não muta nada — quem apropria é `apropriarFolha`, e essa tem crachá próprio.",
  // ── V6 P1.1 — o vínculo solicitação × ordem ──
  alocarDentroDaTransacao:
    "composável interno: roda DENTRO da transação de `emitirOrdemDeCompra` (ordem formada a partir da solicitação) " +
    "ou de `vincularSolicitacaoAOrdem`, que já autorizaram e travaram a ordem. Só os controles do vínculo moram nele.",
  atendimentoDaSolicitacao: "LEITURA: solicitado/ordenado/recebido/cancelado/pendente por item, derivados das alocações e recebimentos.",
  origemDaOrdem: "LEITURA: de quais solicitações cada linha da ordem veio, e quanto é 'sem origem' (compra direta ou legado).",
  ordemEstornada: "LEITURA: a ordem tem movimento ESTORNO? (o estorno virou fato — o runtime não apaga linha).",
  // ── V6 P2 — M32 pessoal ──
  nomeDoServidor: "LEITURA: o nome que as telas mostram (social, ou o da versão vigente da pessoa canônica).",
  // ── V6 P1.2 — a conciliação e o legado sem conta ──
  arrecadacoesSemContaDaFonte:
    "LEITURA: as guias da fonte da conta sem conta bancária declarada nem atribuída (legado), com a conta contábil que debitaram — " +
    "informativas, fora da identidade da conciliação.",
  // ── V6 (P0.1) — a identidade PÚBLICA do ente ──
  apresentacaoVigente:
    "LEITURA PÚBLICA: a versão vigente da apresentação do ente (nome de exibição, imagem, canais) — " +
    "é o que a tela de entrada mostra ANTES do login. Não grava nada e não expõe credencial, vínculo nem dado fiscal.",
  imagemDaApresentacaoVigente: "LEITURA PÚBLICA: os bytes da imagem institucional vigente, para a rota que a serve.",
  historicoDaApresentacao: "LEITURA: as versões da apresentação (sem bytes) — quem mudou o quê e quando, na tela administrativa.",
  // ── M02b — planejamento plurianual (V4 §8) ──
  metaFiscalDoExercicio:
    "LEITURA: a meta fiscal declarada na LDO para um exercício (ou null com pendência nomeada). " +
    "Insumo do RREO Anexo 6; não grava nada.",
  // ── Orquestração V3 (4.1/4.2) — a política de leitura e as atualizações versionadas ──
  escopoDaAcaoDeLeitura: "leitura (o escopo de UMA ação de leitura para uma identidade — a política de leitura, 4.1)",
  acoesDeLeituraDoUsuario: "leitura (as ações de leitura do usuário em algum escopo — o recorte do painel)",
  situacaoDasAtualizacoes: "leitura (a situação das atualizações versionadas de permissões, com a prévia)",
  aplicarAtualizacaoDePermissoes:
    "composto de concessões: cobra CONCEDER_ACAO_A_PERFIL (a MESMA ação que cada concessão individual " +
    "cobra) e grava o registro da versão na mesma transação. Uma ação própria inventaria um poder que já existe.",
  // ── ENT05 — o composável que une o eixo FÍSICO ao CONTÁBIL do almoxarifado. ──
  //
  // ⚠️ Ele NÃO autoriza e NÃO abre transação: recebe a `tx` de quem chama, justamente para
  // que a saída física e o lançamento contábil sejam ATÔMICOS. Dar-lhe ação própria faria o
  // ente conceder duas vezes o mesmo poder — quem cobra a ação é `registrarSaidaConsumo` (o
  // serviço público) ou `registrarSaidaFisica` (o do eixo físico), cada um a sua.
  estatisticasDaPesquisa: "leitura derivada (médio/mínimo/máximo das cotações, TR 5.17.48)",
  saldoDaOrdemDeCompra: "leitura derivada (quantidade − Σ recebido, TR 5.17.105)",
  empenhadoLiquidoPorOrdem: "leitura derivada (Σ empenhos vivos da ordem, anulação copiando a FK)",
  situacaoDaSolicitacao: "leitura derivada dos movimentos (TR 5.17.52)",
  situacaoDoDocumentoFiscal: "leitura derivada dos movimentos (conferência/cancelamento/substituição)",
  saldoDoDocumentoFiscal: "leitura derivada (total − Σ liquidações vivas)",
  saldoDaConta: "leitura derivada (Σ das partidas com o sinal da natureza)",
  estadoDoBem: "leitura derivada (último movimento de cada eixo até uma data civil)",
  bensSobResponsabilidade: "leitura derivada (TR 5.19.10)",
  inconsistenciasDoInventarioDeBens: "leitura derivada (TR 5.19.21)",
  avaliarBemPorFormula: "leitura: CALCULA e não escreve — lançar é registrarReavaliacao",
  listarUnidadesDeMedida: "leitura (o rol que alimenta o formulário de material)",
  materiaisAbaixoDoMinimo: "leitura derivada (posição contra o mínimo, TR 5.18.3)",
  requisicoesPendentes: "leitura derivada (Σ solicitado − Σ atendido, TR 5.18.8/5.18.9)",
  validadeDoEstoqueDoDeposito: "leitura derivada (vencidos e a vencer, TR 5.18.14/5.18.20)",
  posicaoDoMaterial: "leitura derivada (a posição é Σ dos movimentos até uma data civil)",
  fichaDeControleDeEstoque: "leitura derivada (TR 5.18.16 — movimentos do período + saldo anterior)",
  bloqueiosVigentes: "leitura derivada (os bloqueios e o inventário aberto que alcançam um par)",
  registrarSaidaConsumoNaTx:
    "composável interno: recebe a tx do chamador para unir os dois eixos numa transação só " +
    "(a ação é a de REGISTRAR_SAIDA_CONSUMO ou a de REGISTRAR_SAIDA_FISICA)",

  // ── ENT03b — os GUARDS e as LEITURAS dos cadastros novos. ──
  //
  // ⚠️ OS DOIS PRIMEIROS SÃO GUARDS CHAMADOS DE DENTRO DE OUTRO SERVIÇO, na transação DELE.
  // Dar-lhes ação própria seria pior que inútil: o ente concederia "exigir a ordem do art.
  // 100" a alguém — um poder que não existe —, e quem NÃO o tivesse veria o `pagar()` do M05
  // ser recusado por falta de permissão para um guard que ele nem pediu. Quem cobra a ação é
  // o serviço que os chama (`pagar` e `liquidar`).
  exigirOrdemDoArt100:
    "guard chamado de dentro do pagar() do M05, na transação dele (a ação é a de PAGAR)",
  exigirMedicaoAprovadaDaObra:
    "guard chamado de dentro do liquidar() do M05, na transação dele (a ação é a de LIQUIDAR)",
  filaDePrecatorios: "leitura (monta a fila do art. 100 por Σ dos movimentos — não muta)",
  // ⚠️ NASCE DENTRO DO `pagar()`, e morre com ele. Mesma razão do `amortizarNoPagamento`
  // (M10) e do `registrarRetencao` (M07): quem nasceu junto, morre junto. Uma ação própria
  // aqui deixaria alguém baixar o passivo do precatório SEM o dinheiro ter saído.
  baixarPrecatorioNoPagamento:
    "perna interna do pagar() do M05, na transação dele (a ação é a de PAGAR)",

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
  lerConciliacao: "leitura",
  conciliacoesDaConta: "leitura",
  naoResolvidasDe: "leitura",
  exigirConciliacaoAberta: "guard",
  estadoDaConciliacao: "leitura",
  somarSelecao: "leitura",
  rotuloDoPeriodo: "leitura",
  chaveDoPeriodo: "leitura",
  exigirFonteNoRol: "guard",
  exigirFonteNoRolDaConta: "guard",
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
  // ⚠️ ENT06 item 2 — o corpo transacional da ENTRADA no almoxarifado, extraído para que a
  // liquidação de material seja UM ato. Ele não autoriza, não abre transação e não trava:
  // quem chama faz as três coisas, como em `registrarSaidaConsumoNaTx`. Dar-lhe ação própria
  // faria o ente conceder DUAS vezes o mesmo poder — quem cobra o crachá é `liquidar` (o
  // serviço público) ou `registrarEntradaAlmoxarifado` (a entrada avulsa), cada um a sua.
  registrarEntradaAlmoxarifadoNaTx:
    "composável interno (a entrada que nasce dentro da transação da liquidação)",
  registrarEntradaFisicaNaTx:
    "composável interno (o eixo FÍSICO da mesma entrada, na mesma transação)",
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
  pessoaDoUsuario: "leitura (a pessoa vinculada ao usuário — a última linha de VinculoUsuarioPessoa, se for VINCULO)",
  versoesDoRoteiro: "leitura (as versões de um roteiro, com a vigência derivada — V3 4.5)",
  versaoVigente: "leitura (a versão PUBLICADA em vigor de um roteiro — o resolvedor do M10 a consome)",
  documentoDoTermo: "leitura (o termo patrimonial para o PDF: a emissão congelada (segunda via) ou a posição atual — V3 pacote 2, V4 §5)",
  comporTermo: "leitura (a composição do termo a partir dos dados e do acervo de agora — a emissão a congelar, ou a posição atual — V4 §5)",
  composicaoDoTermo: "leitura (a composição de um termo existente, pela linha dele — V4 §5)",
  analisarEstornoPatrimonial: "leitura (a análise de dependências do estorno de um movimento de valor — estornarMovimentoPatrimonial a refaz na transação — V3 pacote 2)",
  analisarEstornoDeGestao: "leitura (a análise do estorno de um movimento de gestão: o par da transferência e os posteriores do eixo — V3 pacote 2)",
  parametroVigente: "leitura (o parâmetro de atualização em vigor da classe — a última versão, ou a linha legada — V3 pacote 2)",
  versoesDoParametro: "leitura (as versões do parâmetro de uma classe, com a vigência derivada — V3 pacote 2)",
  preverCompetencia: "leitura (a prévia da competência: a mesma conta de atualizarCompetencia, sem escrever — V3 pacote 2)",
  parametroVigenteEm: "leitura (o parâmetro cuja vigência alcança a competência pedida — V4 §4.1)",
  conciliacaoDaClasse: "leitura (a conciliação item → classe → razão, com a acumulada histórica sem bem — V4 §4.2)",
  receitaArrecadadaPorNumero:
    "leitura (a arrecadação pela guia — exercício e número; quem decide se ela sustenta a alienação é alienarBem — V3 pacote 2)",
  comOperacaoRegistrada: "porta da borda (o log do 6.1-6.3, em duas fases — V3 4.3)",
  registrarSucessoNaTransacao:
    "perna do FUNIL: grava a linha SUCESSO do registro de operação na transação do fato (V3 4.3) — a autorização é do serviço que abriu a transação",
  // ── Sessão noturna V4 (3) — o contrato de comando ──
  concluirComandoNaTransacao:
    "porta da borda (conclui a reserva do comando DENTRO da transação do fato — o funil chama por todo lançamento; um ato sem lançamento chama por si)",
  exigirAcaoEmAlgumEscopo: "guard (revalidação do replay: usuário ativo e ação ainda concedida em algum escopo)",
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
  listarAnexosDoTermo: "leitura (os anexos de um termo patrimonial — o termo assinado; do ente, exige usuário ativo — V4 §5)",
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
