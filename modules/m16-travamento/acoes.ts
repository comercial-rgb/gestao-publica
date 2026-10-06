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
  // ── M03 V21 — a REALOCAÇÃO por lei específica (CF art. 167, VI) ──
  // ⚠️ Ações PRÓPRIAS, e não EXECUTAR_CREDITO/ANULAR_CREDITO: a realocação não é crédito adicional
  // (não traz recurso novo nem consome o limite da LOA), e quem pode abrir crédito não passa, por
  // isso, a poder mover dotação entre órgãos. Registrar e anular separadas, como no crédito.
  | "REGISTRAR_REALOCACAO_DE_DOTACAO"
  // ── M02 V21 — os dados da unidade que a prestação de contas pede (SAGRES §4.1) ──
  // ⚠️ Ação PRÓPRIA: dizer quem é o secretário responsável e a natureza jurídica da unidade é
  // cadastro do ente, e não um ato de execução de quem empenha nela.
  | "DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA"
  | "ANULAR_REALOCACAO_DE_DOTACAO"
  | "ENCERRAR_DECRETO"
  | "DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO"
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
  // ── M05 — V22: a solicitação de empenho. DUAS ações, e a separação é o ponto ──
  /** Solicitar (e cancelar o próprio pedido): pedir a despesa. Não compromete saldo. */
  | "SOLICITAR_EMPENHO"
  /** Autorizar (ou rejeitar com motivo): consentir com a despesa. Quem solicitou não decide. */
  | "AUTORIZAR_SOLICITACAO_DE_EMPENHO"
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
  // ── M08 V20 — a REGUA da virada dos controles, separada do ATO de enterrar ──
  // ⚠️ Acao PROPRIA, e nao um ramo de ENCERRAR_CONTROLES_ORCAMENTARIOS: dizer que a dotacao CADUCA
  // (art. 167, II da CF) e ato normativo do ente, e enterrar o orcamento e ato de execucao, feito
  // uma vez por ano. Fundir daria a quem executa o poder de reescrever a regua pela qual o proprio
  // encerramento dele e medido — a mesma segregacao que separa PARAMETRIZAR_ROTEIRO_ORCAMENTARIO
  // de EMPENHAR.
  | "PARAMETRIZAR_VIRADA_DOS_CONTROLES"
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
  // ── M15 — V23: o plano de contas do Tribunal, designado para o exercício com fundamento ──
  | "IMPORTAR_PLANO_DO_TRIBUNAL"
  // ── M36/M37 — V27: frota e farmácia pública (SAGRES §4.50 a §4.57) ──
  | "CADASTRAR_FROTA"
  | "REGISTRAR_ABASTECIMENTO"
  | "CADASTRAR_FARMACIA"
  | "INFORMAR_ESTOQUE_DA_FARMACIA"
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
  // ── V22 — a LEI ORÇAMENTÁRIA ANUAL: o projeto de lei e a lei que o aprovou (TR LOA 1). UMA ação para
  // os dois atos, como CADASTRAR_LDO cobre a LDO e a sanção dela: é o mesmo setor que digita a peça. ──
  | "CADASTRAR_LOA"

  // ── M02b V18/C13 — o ATO que ALTERA a peça já aprovada (TR 5.9.1.30 · 5.9.2.18) ──
  // UMA ação, DOIS serviços (registrar o ato, acrescentar item), AS DUAS peças. E ela NÃO
  // acompanha CADASTRAR_PPA nem CADASTRAR_LDO: digitar a peça que o Executivo monta e assinar
  // a lei que altera a peça APROVADA são autoridades diferentes no ente — a segunda pressupõe
  // ato publicado. Partir em ALTERAR_PPA e ALTERAR_LDO daria dois crachás que a mesma pessoa
  // sempre recebe junto, e um crachá que não segrega ninguém é ruído no painel de permissões.
  | "ALTERAR_PLANEJAMENTO"

  // ── M12 V19/C05 — o CUSTO por centro (a apropriação, e o critério que a distribui) ──
  // DUAS ações, e a separação é a que o ente faz: publicar o critério de rateio é decisão
  // administrativa (dizer que a sede se divide 60/40 entre duas secretarias, por ato); apropriar o
  // custo de uma liquidação é rotina de quem fecha o mês. Juntar as duas daria a quem lança o poder
  // de mudar a régua — e um relatório de custos com a régua trocada no meio do exercício não se
  // compara com o do exercício anterior.
  | "PARAMETRIZAR_RATEIO_DE_CUSTO"
  | "APROPRIAR_CUSTO"

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
  // V7 M2 U6 — a planilha orçamentária da obra (prévia, versão e vínculo com o contrato)
  | "GERIR_PLANILHA_DA_OBRA"
  // V7 M2 U8 — os tipos de ocorrência do ente e os formulários versionados da fiscalização
  | "GERIR_TIPOS_DE_OCORRENCIA"
  // V7 B1 — o cadastro imobiliário e os parâmetros do tributo (a simulação é leitura, não entra aqui)
  | "GERIR_CADASTRO_IMOBILIARIO"
  | "GERIR_PARAMETROS_TRIBUTARIOS"
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
  // ── V11 V9 — A ENTIDADE CONTABIL E A TITULARIDADE DA RECEITA (desenho de engenharia).
  //
  // ⚠️ ORIGEM DA CORRECAO (V11 V9.3): esta capacidade nasceu citando `TR 5.10.1.3 · 5.38.7`, e a
  // citacao NAO se sustenta. A secao 5.38 inteira e o PORTAL DE TRANSPARENCIA (LC 101/131,
  // Lei 9.755/98 do TCU, LAI 12.527/2011), e a 5.38.7 pede consulta PUBLICA de tributos
  // arrecadados; o que existe aqui e tela INTERNA AUTENTICADA, com autorizacao por acao nomeada.
  // A 5.10.1.3 pede mais de uma UNIDADE na mesma base com contabilizacao distinta e consolidacao
  // da LRF — proximo, mas nao literal: aqui a entidade titular e atributo de um FATO de receita,
  // e a consolidacao nao foi construida. Ate que se ache vinculo literal, a capacidade fica como
  // desenho de engenharia, sem clausula atribuida. Marcar por ela renderia numero e mentiria.
  //
  // ⚠️ TRÊS AÇÕES PARA QUATRO SERVIÇOS. `publicarVersaoDaEntidadeContabil` fica sob
  // `CADASTRAR_ENTIDADE_CONTABIL` porque é a MESMA autoridade — dizer quem a entidade é. Uma
  // ação própria para "corrigir o nome" daria ao ente a chance de conceder cadastrar sem
  // corrigir, e um cadastro que não se corrige é o defeito que a V8.12 encontrou no calendário.
  // Precedente: `vincularPessoaAoUsuario`/`desvincularPessoaDoUsuario`, dois serviços, uma ação.
  //
  // ⚠️ TODAS DO ENTE, e `escopo.ts` não muda. Entidade contábil NÃO é eixo de autorização: o
  // eixo continua sendo `ENTE | UG`, e a UG só sai de uma ficha. Fazer da entidade um terceiro
  // eixo seria reescrever a segregação inteira para carimbar uma coluna.
  | "CADASTRAR_ENTIDADE_CONTABIL"
  | "DECLARAR_TITULAR_DA_CONTA_BANCARIA"
  // ⚠️ M09 V16 — QUAIS FONTES UMA CONTA BANCÁRIA COMPORTA (TR 5.10.2.6), e ela NÃO acompanha
  // `DECLARAR_TITULAR_DA_CONTA_BANCARIA`: o titular diz de QUEM é a conta (identidade jurídica);
  // o rol diz que RECURSO ela pode abrigar — é controle de DESTINAÇÃO, o número que prova que
  // recurso vinculado não custeou outra coisa. Quem declara a autarquia dona da conta não é, por
  // isso, quem decide se o FUNDEB pode entrar nela.
  | "GERIR_ROL_DE_FONTES_DA_CONTA"
  // ⚠️ M09 V36 — CADASTRAR UMA CONTA BANCÁRIA NOVA. Até a V36 nenhuma conta nascia pela tela: só
  // semeador e teste a criavam. É ação PRÓPRIA, e não acompanha o rol nem o titular: abrir a conta
  // diz em que conta contábil do PCASP o dinheiro dela é escriturado e qual a fonte padrão — é
  // parametrização da escrituração, e quem decide se o FUNDEB cabe nela continua sendo o rol.
  | "CADASTRAR_CONTA_BANCARIA"
  | "ATRIBUIR_ENTIDADE_A_ARRECADACAO"
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
  | "GERIR_GUIA_DE_RECOLHIMENTO"
  | "TRIAR_MANIFESTACAO_DE_OUVIDORIA"
  | "MODERAR_AVALIACAO_DE_SERVICO"
  | "DESIGNAR_NO_CONTRATO"
  | "DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO"
  | "CONFIGURAR_EXECUCAO_DO_CONTRATO"
  | "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO"
  | "REGISTRAR_RECEBIMENTO_PROVISORIO"
  | "REGISTRAR_RECEBIMENTO_DEFINITIVO"
  /**
   * V9 N4 — DESFAZER um recebimento definitivo já assinado.
   *
   * ⚠️ AÇÃO PRÓPRIA, E NÃO A MESMA DE RECEBER. Receber é o ato ordinário do recebedor designado;
   * desfazer um termo assinado é excepcional, deixa rastro público e reabre quantidade que já
   * estava fechada. Pendurá-lo em `REGISTRAR_RECEBIMENTO_DEFINITIVO` daria o poder de desfazer a
   * todo mundo que pode receber, em silêncio, no dia em que a funcionalidade entrasse.
   */
  | "ESTORNAR_RECEBIMENTO_DEFINITIVO"
  | "CADASTRAR_ITEM_DO_CONTRATO"
  | "PROGRAMAR_FISCALIZACAO_DO_CONTRATO"
  | "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO"
  | "RESOLVER_OCORRENCIA_DE_FISCALIZACAO"
  // V6.2 P3 — a carta de serviços e a representação
  | "CONFIGURAR_CARTA_DE_SERVICOS"
  | "SOLICITAR_SERVICO"
  | "DECIDIR_SOLICITACAO_DE_SERVICO"
  | "REGISTRAR_REPRESENTACAO"
  // ── M07 V11 V8.3 — o cadastro dos tipos de consignação ──
  //
  // ⚠️ UMA AÇÃO, E ELA É DE PARAMETRIZAÇÃO CONTÁBIL, não de execução. Quem escolhe em que conta
  // do PCASP a retenção vira dívida é a contabilidade do ente — não quem paga. Juntá-la a
  // `PAGAR` daria a quem executa o poder de reclassificar o passivo do município.
  | "GERIR_TIPOS_DE_CONSIGNACAO"
  // ── M05 V11 V8.4 — o roteiro orçamentário pela tela ──
  //
  // ⚠️ AÇÃO PRÓPRIA, e não `PARAMETRIZAR_ROTEIRO_PATRIMONIAL`: são dois subsistemas, e quem
  // responde pelo orçamentário não é necessariamente quem responde pelo patrimonial. Juntá-las
  // daria a uma pessoa o poder de reclassificar os dois razões de uma vez.
  | "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO"
  // ⚠️ AÇÃO PRÓPRIA, e não `PARAMETRIZAR_ROTEIRO_ORCAMENTARIO`: o roteiro dos restos a pagar
  // é PATRIMONIAL e de CONTROLE, e o orçamentário é de outro subsistema — quem parametriza a
  // dotação não é necessariamente quem decide contra que passivo um resto de 2025 se paga.
  | "PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR"
  // ⚠️ M04 V16/C30 — A "ALTERAÇÃO AUTORIZADA NO ATO" DA DISTRIBUIÇÃO DA RECEITA, e ela NÃO é
  // `REGISTRAR_ARRECADACAO`. Registrar a guia é o ato de quem opera a arrecadação; mandar dinheiro
  // para uma fonte que a LOA NÃO PREVÊ para aquela natureza é mudar a destinação decidida no
  // orçamento — e o erro sai no RGF Anexo 5 e na DDR, onde ele autoriza empenhar contra dinheiro
  // carimbado para outra coisa. Só é exigida nesse caso: natureza sem previsão nenhuma é excesso
  // de arrecadação, que é legítimo (INVARIANTE 5) e não pede crachá.
  | "DISTRIBUIR_RECEITA_FORA_DA_PREVISAO"
  // ── M21 V11 V8 — A AGENDA DO GUICHÊ (TR 5.39.92) ──
  //
  // ⚠️ TRÊS AÇÕES PARA DEZ SERVIÇOS, e o corte é por QUEM FAZ, não por qual função é.
  // Quem ORGANIZA o atendimento (abre uma unidade, cria um guichê, publica a oferta de
  // horários, fecha um feriado) é a chefia do setor; quem MARCA e remarca é o balcão; quem
  // CONFIRMA e registra que atendeu é a pessoa no guichê. Uma permissão por função daria um
  // rol de dez linhas para administrar — e a segregação morre por atrito.
  //
  // ⚠️ A LEITURA NÃO ENTRA AQUI: a agenda do guichê é da área do protocolo, e a leitura de
  // área já existe (`CONSULTAR_PROTOCOLO`). Uma ação de leitura por tela nova é exatamente o
  // que o bloco das ações de leitura explica que não se faz.
  | "CONFIGURAR_AGENDA_DO_GUICHE"
  | "RESERVAR_ATENDIMENTO_NO_GUICHE"
  | "REGISTRAR_ATENDIMENTO_NO_GUICHE"
  | "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA"
  | "CONFIGURAR_TABELAS_DA_FOLHA"
  // ── M33 V11 V9.1 — O PARÂMETRO DO 13º DO EXERCÍCIO ──
  //
  // ⚠️ AÇÃO PRÓPRIA, E NÃO UM RAMO DE `CONFIGURAR_TABELAS_DA_FOLHA`. As duas parecem a mesma
  // autoridade — "cadastrar número que a folha usa" — e não são: a tabela do IRRF vem de portaria
  // federal e quem a digita transcreve; o parâmetro do 13º decide o CRITÉRIO DO ENTE (quantos dias
  // fazem um mês contar, quantos avos tem o ano, quanto é a 1ª parcela). Quem transcreve a
  // portaria não recebeu, por isso, o poder de escrever a regra do município.
  | "CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO"
  // ── M33 V13 (TR 5.12.50) — O PARÂMETRO DO ADIANTAMENTO SALARIAL ──
  //
  // ⚠️ AÇÃO PRÓPRIA, E NEM MESMO UM RAMO DE `CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO`. O critério
  // do avo é ANUAL e vem do estatuto do servidor; o percentual do vale é MENSAL e costuma vir de
  // decreto do prefeito. São dois atos administrativos diferentes, de origens diferentes, com
  // periodicidades diferentes — juntá-los daria a quem decide um o poder sobre o outro.
  //
  // ⚠️ E O ERRO NESTA CONCESSÃO NÃO TEM DETECTOR ADIANTE: a folha de vale fecha, o empenho fecha,
  // a mensal abate certinho o valor errado e o total bate. Quem percebe é o servidor.
  | "CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL"
  | "CADASTRAR_RUBRICA"
  // ── M33 V11 V1.1 — A RUBRICA VERSIONADA ──
  //
  // ⚠️ ESCREVER A VERSÃO E APROVÁ-LA SÃO ATOS SEPARADOS, pela mesma razão que separa preparar de
  // constituir no M34: quem digita a fórmula de um adicional não é necessariamente quem responde
  // por ela valer na folha de três mil servidores. Uma ação só faria da revisão um passo
  // decorativo — o aprovador existiria no banco e não significaria nada.
  // ── M13 V11 V4.2 — A POLÍTICA DE PUBLICAÇÃO DE PESSOAL ──
  //
  // ⚠️ REDIGIR E APROVAR SÃO ATOS SEPARADOS, e aqui a razão é mais forte do que na rubrica: o que
  // esta política autoriza é a EXPOSIÇÃO DE DADO PESSOAL de cada servidor no portal aberto. Uma
  // ação só faria de quem redige o texto o autor da decisão de expor — e o aprovador, um campo.
  | "CADASTRAR_POLITICA_DE_PESSOAL"
  | "APROVAR_POLITICA_DE_PESSOAL"
  | "REVOGAR_POLITICA_DE_PESSOAL"
  | "CADASTRAR_VERSAO_DE_RUBRICA"
  | "APROVAR_VERSAO_DE_RUBRICA"
  | "REVOGAR_VERSAO_DE_RUBRICA"
  | "LANCAR_NA_FOLHA"
  | "ABRIR_FOLHA"
  | "CALCULAR_FOLHA"
  /**
   * ⚠️ V11 V9.5 — AÇÃO PRÓPRIA, E NÃO O REUSO DE `CALCULAR_FOLHA`. O critério é o mesmo que
   * manteve `cadastrarFuncao` sob `CADASTRAR_CARGO`: pergunta-se se é a MESMA AUTORIDADE.
   *
   * **Aqui NÃO é.** Calcular a folha é decidir QUANDO pagar; selecionar quem entra é decidir QUEM
   * fica de fora do pagamento — e um recorte errado produz folha parcial que fecha com o total, o
   * empenho e a liquidação batendo.
   *
   * ⚠️ E O ARGUMENTO INVERSO, QUE NO CASO DA FUNÇÃO PESAVA CONTRA A SEPARAÇÃO, AQUI PESA A FAVOR.
   * Lá, uma ação própria daria ao ente a chance de conceder "criar cargo" sem "criar função" —
   * estrutura pela metade, um defeito. Aqui, conceder `CALCULAR_FOLHA` sem esta deixa o operador
   * podendo calcular apenas TODOS: a separação não produz estado pela metade, produz **o padrão
   * conservador**. Quem não pode recortar não corre o risco de recortar errado.
   */
  | "SELECIONAR_VINCULOS_DA_FOLHA"
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
  // ⚠️ AÇÃO PRÓPRIA, e a decisão precisa aparecer aqui em vez de acontecer. `CRIAR_ASSUNTO`, acima,
  // já fixa prazo — mas prazo de ETAPA, interno, do setor. Este ato declara, com citação de lei, a
  // data que o ente promete a um cidadão que tem direito subjetivo à informação, e o quanto ela
  // pode ser prorrogada. Quem desenha o fluxo interno de um assunto não é necessariamente quem
  // responde por uma norma: juntar os dois daria o segundo poder a quem precisa do primeiro.
  | "PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO"
  // ── M21 — o RITO do acesso à informação (V11 V5.3) ──
  //
  // ⚠️ CINCO AÇÕES, E NÃO UMA "GERIR PEDIDO DE ACESSO". Cada uma tem um responsável diferente
  // na vida real do ente, e juntá-las daria a qualquer delas o poder de todas:
  //  · PROTOCOLAR abre o pedido e congela a norma — é do balcão;
  //  · DISTRIBUIR escolhe o setor que responde — é da triagem;
  //  · PRORROGAR estica a data prometida a quem tem direito subjetivo, e exige motivação;
  //  · RESPONDER entrega a resposta, classificada, e negar exige fundamento;
  //  · DECIDIR RECURSO revê a negativa — quem respondeu não é quem julga o próprio ato.
  | "PROTOCOLAR_PEDIDO_DE_ACESSO_A_INFORMACAO"
  | "DISTRIBUIR_PEDIDO_DE_ACESSO_A_INFORMACAO"
  | "PRORROGAR_PEDIDO_DE_ACESSO_A_INFORMACAO"
  | "RESPONDER_PEDIDO_DE_ACESSO_A_INFORMACAO"
  | "DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO"
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
  // ── M35 — AS AÇÕES DO FORNECEDOR (V10 T1 · N6.1) ──
  //
  // ⚠️ ELAS SÃO RESERVADAS, e é o único bloco do censo que é. `concederAcaoAoPerfil` — a tela
  // de permissões do ENTE — as RECUSA nomeando: o município não concede a si próprio a
  // habilitação comercial do software que ele contratou. Quem as recebe é o operador do
  // fornecedor, provisionado por ato explícito de instalação
  // (`scripts/provisionar-operador-engine.ts`), nunca por um perfil municipal chamado "admin",
  // nunca por e-mail e nunca por nome de perfil. Ver `ACOES_DO_FORNECEDOR`, abaixo.
  | "REGISTRAR_CONTRATO_COMERCIAL"
  | "ENCERRAR_CONTRATO_COMERCIAL"
  | "HABILITAR_MODULO_CONTRATADO"
  | "PROGRAMAR_VIGENCIA_DE_MODULO"
  | "SUSPENDER_MODULO_CONTRATADO"
  | "REATIVAR_MODULO_CONTRATADO"
  // ── M34 B2 — O LANÇAMENTO TRIBUTÁRIO E A CERTIDÃO (V10 T2 · N5) ──
  //
  // ⚠️ QUATRO ATOS, QUATRO AÇÕES, e a separação é a do CTN: PREPARAR é trabalho de cadastro
  // (o lote sai revisável e não constitui nada); CONSTITUIR é o ato que faz nascer o crédito
  // contra o contribuinte e mexe no razão; RETIFICAR e CANCELAR desfazem o que já foi
  // constituído. Uma ação só daria a quem monta o lote o poder de constituir trinta mil
  // créditos — e a revisão, que é o ponto do lote, perderia a razão de existir.
  | "PREPARAR_LANCAMENTO_TRIBUTARIO"
  | "CONSTITUIR_CREDITO_TRIBUTARIO"
  | "RETIFICAR_LANCAMENTO_TRIBUTARIO"
  | "CANCELAR_LANCAMENTO_TRIBUTARIO"
  // A certidão: pedir é do balcão, decidir é de quem responde pela base fiscal.
  | "SOLICITAR_CERTIDAO"
  | "DECIDIR_CERTIDAO"
  // ── M10 — a POLÍTICA DE DIVULGAÇÃO de uma localização física (V10 T3 · N2) ──
  //
  // ⚠️ AÇÃO PRÓPRIA, e não `CADASTRAR_LOCALIZACAO_FISICA`. Quem cadastra o depósito não é
  // necessariamente quem decide o que vai ao portal público do município — e pendurar as duas
  // na mesma ação daria o poder de publicar endereço a todo mundo que mexe no cadastro.
  | "DEFINIR_DIVULGACAO_DA_LOCALIZACAO"
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
  | "CONSULTAR_MEUS_SERVICOS"
  // V10 T1 — a leitura do LICENCIAMENTO. Reservada ao fornecedor, como as mutações dele.
  | "CONSULTAR_LICENCIAMENTO";

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
  // V10 T1 — o contrato comercial e os módulos habilitados. RESERVADA ao fornecedor.
  "CONSULTAR_LICENCIAMENTO",
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
  | "registrarRealocacao"
  | "declararDadosDaUnidade"
  | "anularRealocacao"
  | "encerrarDecreto"
  | "declararDisponibilidade"
  | "registrarArrecadacao"
  | "arrecadarQuitandoReconhecimento"
  | "arrecadarRecebendoDividaAtiva"
  | "arrecadarIngressoDaOperacaoDeCredito"
  | "fecharCompetenciaConferida"
  | "declararRoteiroPatrimonial"
  | "concederAdiantamento"
  | "registrarPrestacaoDeAdiantamento"
  | "aprovarPrestacaoDeAdiantamento"
  | "rejeitarPrestacaoDeAdiantamento"
  | "implantarSaldosIniciais"
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
  | "solicitarEmpenho"
  | "cancelarSolicitacaoDeEmpenho"
  | "autorizarSolicitacaoDeEmpenho"
  | "rejeitarSolicitacaoDeEmpenho"
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
  | "classificarContaNaVirada"
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
  | "importarPlanoDoTribunal"
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
  | "registrarPerfilFiscal"
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
  // ── V11 V9 — a entidade contábil e a titularidade da receita ──
  //
  // ⚠️ QUATRO SERVIÇOS, TRÊS AÇÕES — e os quatro precisam estar AQUI, não só no
  // `ACAO_DO_SERVICO`. O `Record` é tipado SOBRE esta união: uma chave que a união não conhece
  // é rejeitada pelo compilador, e todo chamador de `ACAO_DO_SERVICO.<nome>` cai junto.
  //
  // ⚠️ E O CONTADOR DO CENSO NÃO PEGA ISSO. `nomes.length` é `Object.keys(ACAO_DO_SERVICO)`,
  // contagem em tempo de EXECUÇÃO; a união é tempo de COMPILAÇÃO. Na V11 V9 as duas
  // discordaram: a suíte do censo passou com 424 nomes enquanto o `tsc` acusava cinco erros
  // pela ausência destas quatro linhas. O grep-teste prova que o serviço foi DECLARADO; só o
  // typecheck prova que a união o CONHECE. Um não substitui o outro.
  | "cadastrarEntidadeContabil"
  | "publicarVersaoDaEntidadeContabil"
  // ── V22 — os responsáveis técnicos do MANAD (0050, 0100) e o indicador de centralização (0000) ──
  | "registrarContabilistaDoManad"
  | "registrarEmpresaGeradoraDoManad"
  | "declararCentralizacaoDaEscrituracao"
  // ── V22 — a classificação do cadastro orçamentário para o MANAD (L400, L650, L700, L200) ──
  | "classificarUnidadeParaOManad"
  | "classificarAcaoParaOManad"
  | "classificarNaturezaDespesaParaOManad"
  | "classificarNaturezaReceitaParaOManad"
  // ── V22 — a campanha publicitária (o vínculo da nota de empenho com a campanha) ──
  | "cadastrarCampanhaPublicitaria"
  | "declararTitularDaContaBancaria"
  | "atribuirEntidadeAArrecadacao"
  | "atribuirEntidadeAoMovimentoExtra"
  // ── V6 (P2) — M32 pessoal ──
  | "cadastrarCargo"
  // V11 V9.4 — a FUNÇÃO (TR 5.12.50). Serviço novo, ação REUSADA; ver o mapa.
  | "cadastrarFuncao"
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
  // V11 V9.1 — o parâmetro do 13º do exercício (`modules/m33-folha/decimo-terceiro-servico.ts`).
  | "cadastrarParametroDoDecimoTerceiro"
  // V13 — o parâmetro do adiantamento salarial da competência
  // (`modules/m33-folha/adiantamento-salarial-servico.ts`). ⚠️ As LEITURAS
  // (`parametroVigenteDaCompetencia`, `parametroQueApurouOCalculo`,
  // `abatimentoDoAdiantamentoSalarialNaCompetencia`) NÃO entram neste censo: elas rodam DENTRO de
  // `calcularFolha`, sob a autorização que ele já cobra, e não são serviços exportados ao mundo.
  | "cadastrarParametroDoAdiantamentoSalarial"
  | "cadastrarRubrica"
  // M33 V11 V1.1 — a rubrica versionada.
  // M13 V11 V4.2 — a política de publicação de pessoal.
  | "cadastrarPoliticaDePessoal"
  | "aprovarPoliticaDePessoal"
  | "revogarPoliticaDePessoal"
  | "criarVersaoDaRubrica"
  | "aprovarVersaoDaRubrica"
  | "revogarVersaoDaRubrica"
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
  | "cadastrarFatorAcidentario"
  | "aprovarFatorAcidentario"
  | "registrarEstabelecimentoDaLotacao"
  | "apurarEncargosDaFolha"
  | "certificarEncargosDaFolha"
  | "devolverEncargosDaFolha"
  | "cadastrarGrupoDosEncargos"
  | "apropriarEncargosDaFolha"
  | "liquidarEncargosDaFolha"
  | "ajustarEncargosDaFolha"
  | "registrarGuiaDeRecolhimento"
  | "baixarGuiaDeRecolhimento"
  | "cancelarGuiaDeRecolhimento"
  | "triarManifestacao"
  | "responderManifestacao"
  | "cadastrarMetodologiaDeAvaliacao"
  | "avaliarAtendimento"
  | "removerAvaliacao"
  | "designarNoContrato"
  | "revogarDesignacaoNoContrato"
  | "definirAdministradorDaFiscalizacao"
  | "revogarAdministradorDaFiscalizacao"
  | "configurarRegimeDeMedicao"
  | "criarRascunhoDeOrdemDeServico"
  | "emitirOrdemDeServico"
  | "descartarRascunhoDeOrdemDeServico"
  | "cancelarSaldoDaOrdemDeServico"
  | "movimentarExecucaoDaOrdemDeServico"
  | "registrarMedicaoDaOrdem"
  | "registrarRecebimentoProvisorio"
  | "decidirControversia"
  | "registrarRecebimentoDefinitivo"
  | "estornarRecebimentoDefinitivo"
  | "liquidarParcelasDoContrato"
  | "preverAditivoPorItens"
  | "registrarAditivoPorItens"
  | "estornarAditivoPorItens"
  | "gerarPreviaDePlanilha"
  | "confirmarPreviaDePlanilha"
  | "vincularItemDaPlanilhaAoContrato"
  | "revogarVinculoDaPlanilha"
  | "medirOrdemPelaPlanilha"
  | "estornarMedicaoDaOrdem"
  | "cadastrarImovel"
  | "novaVersaoDoImovel"
  | "vincularPessoaAoImovel"
  | "encerrarVinculoComImovel"
  | "publicarTabelaDeParametros"
  | "cadastrarTipoDeOcorrencia"
  | "publicarVersaoDoTipoDeOcorrencia"
  | "mudarSituacaoDoTipoDeOcorrencia"
  | "reagendarFiscalizacao"
  | "cancelarFiscalizacao"
  | "registrarRealizacaoDaFiscalizacao"
  | "cadastrarItemDoContrato"
  | "programarFiscalizacao"
  | "registrarOcorrencia"
  | "resolverOcorrencia"
  | "registrarMedicaoPorItens"
  // M21/M19 — a carta de serviços, as solicitações do requerente e a representação (V6.2 P3)
  | "publicarRoteiroOrcamentario"
  | "publicarRoteiroRestosAPagar"
  | "publicarPoliticaDaDotacaoAdicional"
  | "publicarRoteiroDaDotacaoPorFonte"
  | "declararNaturezaDaFonte"
  // V35 — a carga da tabela oficial de fontes e CO da STN (até aqui só seed e fixture criavam fonte)
  | "carregarTabelaDeFontes"
  // V35 — a carga do QDD da LOA aprovada (estrutura que falta + fichas pelo criarFicha)
  | "carregarQddDaLoa"
  | "carregarReceitaDaLoa"
  // V35 — a dedução da receita realizada (FUNDEB) e o estorno dela
  | "registrarDeducaoDaReceita"
  | "estornarDeducaoDaReceita"
  // V35 — os de-paras da LRF gerados pelo ementário oficial de 2026
  | "gerarDeParasDaLrf"
  // V35 — o parâmetro do limite do repasse ao Legislativo (CF 29-A)
  | "declararParametroDoLimiteDoLegislativo"
  // V35 — as fontes fora do limite percentual de suplementação da LOA
  | "declararFonteForaDoLimiteDeSuplementacao"
  // V35 — o ajuste para perdas da dívida ativa
  | "declararPercentualDePerda"
  | "apurarAjusteDePerdas"
  | "redigirNotaExplicativa"
  | "retirarNotaExplicativa"
  | "registrarProjecaoAtuarialDoRreo"
  | "retirarProjecaoAtuarialDoRreo"
  | "declararContasDoControleDosRestos"
  // V35 — a apropriação mensal do 13º e das férias
  | "declararParametroDeFerias"
  | "apropriarPorCompetencia"
  | "acertarDecimoTerceiro"
  | "apropriarEncargosPorCompetencia"
  | "baixarAdiantamentoDoDecimoTerceiro"
  | "declararContaDaLiquidacao"
  | "declararConsignacaoDaRubrica"
  | "apropriarCustoDaFolha"
  | "declararContaDaReceita"
  // M04 V22 — o ementário da receita (cadastro das naturezas de receita do ente)
  | "cadastrarNaturezaReceita"
  // M09 V16 (TR 5.10.2.6) — o rol de fontes da conta bancária, o cadastro que faltava
  | "acrescentarFonteAoRol"
  | "removerFonteDoRol"
  | "cadastrarContaBancaria"
  | "cadastrarTipoDeConsignacao"
  | "redefinirContaDaConsignacao"
  | "desativarTipoDeConsignacao"
  // M07 V26 — a classificação do IR e do ISS retidos pelo próprio Tesouro (receita, não consignação)
  | "classificarRetencaoPropria"
  // M04 V26 — a regularização do legado: o IR/ISS do próprio Tesouro que ficou na consignação vira receita
  | "regularizarConsignacaoPropria"
  // V26 — o cadastro que a prestação de contas pede: programa, ação, ordenador e responsável pelo sistema
  | "declararDadosDoPrograma"
  | "declararDadosDaAcao"
  | "designarOrdenador"
  | "encerrarDesignacaoDeOrdenador"
  | "declararResponsavelSiafic"
  | "detalharReceitaPrevista"
  | "identificarNoTramita"
  | "registrarNormaNoTce"
  | "cadastrarUnidadeGestora"
  | "encerrarUnidadeGestora"
  | "vincularUnidadeOrcamentariaAUg"
  | "definirContabilizacaoDaTransferenciaEntreUgs"
  | "registrarTransferenciaEntreUgs"
  | "estornarTransferenciaEntreUgs"
  | "registrarAgrupamentoDaFolha"
  | "capturarVersaoDoProjetoDaLoa"
  // V29 — a proposta orçamentária do exercício seguinte (importar, alterar, efetivar)
  | "elaborarPropostaOrcamentaria"
  | "ajustarLinhaDaProposta"
  | "efetivarPropostaOrcamentaria"
  | "cadastrarVeiculo"
  | "publicarVersaoDoVeiculo"
  | "cadastrarMaquina"
  | "publicarVersaoDaMaquina"
  | "registrarSituacaoDaFrota"
  | "anularSituacaoDaFrota"
  | "registrarAbastecimento"
  | "anularAbastecimento"
  | "cadastrarFarmacia"
  | "publicarVersaoDaFarmacia"
  | "informarEstoqueDaFarmacia"
  | "importarLicitacoesDoTribunal"
  | "informarProtocoloDaNorma"
  | "criarUnidadeDeAtendimento"
  | "criarGuiche"
  | "definirServicoNoGuiche"
  | "publicarJanelaDeAtendimento"
  | "declararExcecaoDeCalendario"
  | "reservarAtendimento"
  | "cancelarReservaDeAtendimento"
  | "reagendarReservaDeAtendimento"
  | "confirmarReservaDeAtendimento"
  | "registrarAtendimentoRealizado"
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
  // V22 — a Lei Orçamentária Anual (projeto e aprovação)
  | "cadastrarLeiOrcamentariaAnual"
  | "registrarAprovacaoDaLeiOrcamentaria"
  // V18/C13 — a alteracao da peca aprovada (dois servicos, uma acao)
  | "registrarAtoDeAlteracaoDoPlanejamento"
  | "acrescentarItemAoAtoDeAlteracao"
  // V19/C05 — o custo por centro
  | "publicarCriterioDeRateio"
  | "apropriarCustoDaLiquidacao"
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
  | "publicarConfiguracaoDoAcesso"
  | "protocolarPedidoDeAcesso"
  | "distribuirPedidoDeAcesso"
  | "prorrogarPedidoDeAcesso"
  | "responderPedidoDeAcesso"
  | "decidirRecursoDeAcesso"
  // ⚠️ SEM AÇÃO NOVA: receber o pedido no setor É receber o PROCESSO. Criar um
  // `RECEBER_PEDIDO_DE_ACESSO` daria ao ente dois crachás para o mesmo ato, e um deles
  // acabaria concedido sem o outro — o setor receberia o processo e não o pedido, ou o
  // contrário. O fato do rito nasce junto com o recebimento do processo.
  | "receberPedidoDeAcesso"
  // ⚠️ TAMBÉM SEM AÇÃO NOVA: interpor é ato do REQUERENTE, que não tem crachá. Quem registra a
  // peça é o setor recursal — o mesmo que a julga —, e por isso o crachá é o de decidir o
  // recurso. Uma ação "INTERPOR" seria um crachá que o cidadão não pode ter e que o servidor
  // já tem por outro nome.
  | "interporRecursoDeAcesso"
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
  | "parametrizarRoteiroResultadoAlienacao"
  // M35 — o contrato comercial e a habilitação de módulos (V10 T1).
  | "registrarContratoComercial"
  | "encerrarContratoComercial"
  | "habilitarModuloContratado"
  | "programarVigenciaDeModulo"
  | "suspenderModuloContratado"
  | "reativarModuloContratado"
  // M34 B2 — o lançamento tributário e a certidão (V10 T2).
  | "prepararLoteDeLancamento"
  | "prepararLancamentoTributario"
  | "constituirCreditoTributario"
  | "retificarLancamentoTributario"
  | "cancelarLancamentoTributario"
  | "solicitarCertidao"
  | "decidirCertidao"
  | "configurarCertidao"
  // M10 — a política de divulgação da localização (V10 T3).
  | "definirDivulgacaoDaLocalizacao";

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
  registrarRealocacao: "REGISTRAR_REALOCACAO_DE_DOTACAO",
  declararDadosDaUnidade: "DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA",
  anularRealocacao: "ANULAR_REALOCACAO_DE_DOTACAO",
  encerrarDecreto: "ENCERRAR_DECRETO",
  declararDisponibilidade: "DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO",

  registrarArrecadacao: "REGISTRAR_ARRECADACAO",
  // V28 — a guia da tela que quita um crédito já reconhecido: o MESMO ato de arrecadar.
  arrecadarQuitandoReconhecimento: "REGISTRAR_ARRECADACAO",
  // V32 — a guia da tela que recebe dívida ativa ou ingressa operação de crédito: o MESMO ato de arrecadar.
  arrecadarRecebendoDividaAtiva: "REGISTRAR_ARRECADACAO",
  arrecadarIngressoDaOperacaoDeCredito: "REGISTRAR_ARRECADACAO",
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
  // V22 — a solicitação de empenho. QUATRO serviços, DUAS ações, e o corte é por QUEM FAZ:
  // o setor pede e retira o pedido (SOLICITAR_EMPENHO); a autoridade autoriza ou rejeita
  // (AUTORIZAR_SOLICITACAO_DE_EMPENHO). Rejeitar é a mesma autoridade de autorizar — um crachá
  // só para "sim" ou "não"; separá-los daria a alguém o poder de recusar sem o de consentir,
  // que ninguém pediu. E a segregação (quem solicita não decide) é cobrada no caso de uso.
  solicitarEmpenho: "SOLICITAR_EMPENHO",
  cancelarSolicitacaoDeEmpenho: "SOLICITAR_EMPENHO",
  autorizarSolicitacaoDeEmpenho: "AUTORIZAR_SOLICITACAO_DE_EMPENHO",
  rejeitarSolicitacaoDeEmpenho: "AUTORIZAR_SOLICITACAO_DE_EMPENHO",
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
  classificarContaNaVirada: "PARAMETRIZAR_VIRADA_DOS_CONTROLES",
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
  importarPlanoDoTribunal: "IMPORTAR_PLANO_DO_TRIBUNAL",
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
  // V24 — o perfil fiscal do fornecedor (Simples, dispensas, município) é dado cadastral da pessoa:
  // quem altera a pessoa altera o perfil. Uma ação própria separaria o que o ente não separa.
  registrarPerfilFiscal: "ALTERAR_PESSOA",
  moverPapelDePessoa: "MOVER_PAPEL_DE_PESSOA",

  cadastrarLinhaDemonstrativo: "CADASTRAR_LINHA_DEMONSTRATIVO",

  travar: "TRAVAR_COMPETENCIA",
  // V32 — fechar o mês pela tela, depois da conferência de divergências: o MESMO ato de travar.
  fecharCompetenciaConferida: "TRAVAR_COMPETENCIA",
  // V32 — o roteiro de precatório e de convênio declarado pela tela: dizer em que conta o movimento entra.
  declararRoteiroPatrimonial: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  // V32 — diárias e suprimento de fundos. Conceder e registrar a prestação são atos de quem EMPENHA (a concessão
  // se apoia no empenho do beneficiário); aprovar e rejeitar, de quem aprova prestação de contas.
  concederAdiantamento: "EMPENHAR",
  registrarPrestacaoDeAdiantamento: "EMPENHAR",
  aprovarPrestacaoDeAdiantamento: "APROVAR_PRESTACAO_DE_CONTAS",
  rejeitarPrestacaoDeAdiantamento: "APROVAR_PRESTACAO_DE_CONTAS",
  // V32 — a carga do balancete do sistema anterior: um lançamento de partidas arbitrárias, a autoridade do manual.
  implantarSaldosIniciais: "REGISTRAR_LANCAMENTO_MANUAL",
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
  // V11 V9: a entidade contábil. Cadastrar e publicar versão são a MESMA autoridade — dizer
  // quem a entidade é; ver o bloco da união de tipos acima.
  cadastrarEntidadeContabil: "CADASTRAR_ENTIDADE_CONTABIL",
  publicarVersaoDaEntidadeContabil: "CADASTRAR_ENTIDADE_CONTABIL",
  // V22 — OS RESPONSÁVEIS DO MANAD, sob a MESMA autoridade: dizer quem responde pela escrituração
  // da entidade perante a Receita é parte de dizer quem a entidade é. Nenhuma ação nova foi criada;
  // `CONFIGURAR_APRESENTACAO_DO_ENTE` foi descartada porque declara não tocar o EnteConfig fiscal.
  // Ver `modules/m01-core-contabil/responsaveis-do-manad.ts`.
  registrarContabilistaDoManad: "CADASTRAR_ENTIDADE_CONTABIL",
  registrarEmpresaGeradoraDoManad: "CADASTRAR_ENTIDADE_CONTABIL",
  declararCentralizacaoDaEscrituracao: "CADASTRAR_ENTIDADE_CONTABIL",
  // V22 — e a CLASSIFICAÇÃO do cadastro para o mesmo arquivo, sob a mesma autoridade: dizer que
  // tipo de unidade é esta, se a ação é do RPPS e em que nível da hierarquia a natureza está é
  // responder ao leiaute da Receita pelo ente. Zero ações novas.
  classificarUnidadeParaOManad: "CADASTRAR_ENTIDADE_CONTABIL",
  classificarAcaoParaOManad: "CADASTRAR_ENTIDADE_CONTABIL",
  classificarNaturezaDespesaParaOManad: "CADASTRAR_ENTIDADE_CONTABIL",
  classificarNaturezaReceitaParaOManad: "CADASTRAR_ENTIDADE_CONTABIL",
  // V22 — a CAMPANHA PUBLICITÁRIA sob a autoridade do contrato: a campanha é executada pelo contrato
  // de publicidade (Lei 12.232/2010), e quem o cadastra diz que campanhas ele executa. Zero ações novas.
  cadastrarCampanhaPublicitaria: "CADASTRAR_CONTRATO",
  // Declarar de QUEM é a conta é decisão de titularidade, e não cadastro de conta: quem
  // parametriza uma conta bancária não decide, por isso, a quem o dinheiro dela pertence.
  declararTitularDaContaBancaria: "DECLARAR_TITULAR_DA_CONTA_BANCARIA",
  // ⚠️ DOIS SERVIÇOS, UMA AÇÃO. Acrescentar e remover fonte do rol são o mesmo poder — dizer o
  // que a conta comporta —, e partir em dois crachás daria ao ente a chance de conceder um sem o
  // outro, o que não significaria nada: quem pode acrescentar pode desfazer acrescentando outra.
  acrescentarFonteAoRol: "GERIR_ROL_DE_FONTES_DA_CONTA",
  removerFonteDoRol: "GERIR_ROL_DE_FONTES_DA_CONTA",
  // V36 — a conta bancária nova, com a conta contábil e a fonte padrão.
  cadastrarContaBancaria: "CADASTRAR_CONTA_BANCARIA",
  // Atribuir entidade a uma guia do LEGADO — espelho exato de `atribuirContaAArrecadacao`.
  atribuirEntidadeAArrecadacao: "ATRIBUIR_ENTIDADE_A_ARRECADACAO",
  // ⚠️ V34 — o mesmo poder: dizer de quem é o dinheiro que passou por uma conta sem titular declarado.
  atribuirEntidadeAoMovimentoExtra: "ATRIBUIR_ENTIDADE_A_ARRECADACAO",
  // V6 P2 — M32 pessoal (mapa da origem, mantido): dependente e finalidade são o mesmo poder
  // (lançar o que o servidor entregou); contrato e prorrogação também.
  cadastrarCargo: "CADASTRAR_CARGO",
  /**
   * ⚠️ V11 V9.4 — `cadastrarFuncao` REUSA `CADASTRAR_CARGO` PORQUE É A **MESMA AUTORIDADE**:
   * dizer o que a estrutura do ente TEM. O critério é o mesmo de
   * `publicarVersaoDaEntidadeContabil` sob `CADASTRAR_ENTIDADE_CONTABIL` ("a MESMA autoridade —
   * dizer quem a entidade é"), e não o custo de abrir uma ação nova.
   *
   * ═══ ⚠️ O TESTE QUE DECIDE É O DO DINHEIRO, E A FUNÇÃO PASSA NELE ═══
   *
   * A objeção séria a este reuso é "função gratificada vira dinheiro" — e se virasse, seria outra
   * autoridade. **Não vira, e a simetria com o cargo é exata:**
   *
   *   · `Cargo` NÃO tem salário. O vencimento entra pelo EVENTO (`ADMISSAO`, `PROMOCAO`,
   *     `REAJUSTE_SALARIAL`), sob `ALTERAR_REMUNERACAO` — outro crachá.
   *   · `Funcao` NÃO tem valor. A gratificação que a função costuma pagar é EVENTO PRÓPRIO
   *     (`GRATIFICACAO`), na mesma `ALTERAR_REMUNERACAO` — o mesmo outro crachá.
   *
   * Nos dois casos o cadastro é catálogo (código, denominação, lei que o criou, lei que o
   * extinguiu) e o dinheiro está do OUTRO lado da linha. Quem cadastra função não paga ninguém.
   *
   * ═══ E O ARGUMENTO INVERSO, QUE É O DO PRECEDENTE ═══
   *
   * Uma ação própria daria ao ente a chance de conceder **cadastrar cargo sem cadastrar função** —
   * um ente que pode criar o posto de Diretor de Escola e não a direção de escola. Estrutura pela
   * metade, exatamente como "um cadastro que não se corrige" foi o defeito que a V8.12 encontrou
   * no calendário. A segregação que o M32 declara é "criar a vaga × ocupar a vaga"
   * (`CADASTRAR_CARGO` × `ADMITIR_SERVIDOR`), e a função está do MESMO lado dessa linha.
   *
   * ⚠️ A CONDIÇÃO DE REVERSÃO, escrita para que a decisão não vire permanente por inércia:
   * **se `Funcao` algum dia ganhar campo de VALOR**, a autoridade muda no mesmo ato e esta linha
   * deixa de valer — cadastrar passaria a fixar quanto se paga, que é `ALTERAR_REMUNERACAO`. Quem
   * acrescentar esse campo tem de separar a ação junto, não depois.
   *
   * ⚠️ O QUE ISTO MUDA, DITO EM VOZ ALTA: quem já tem `CADASTRAR_CARGO` passa a poder cadastrar
   * função. Não é ampliação silenciosa porque está escrita aqui — mas É ampliação, e quem revisar
   * o perfil de um ente precisa saber.
   */
  cadastrarFuncao: "CADASTRAR_CARGO",
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
  cadastrarParametroDoDecimoTerceiro: "CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO",
  cadastrarParametroDoAdiantamentoSalarial: "CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL",
  cadastrarRubrica: "CADASTRAR_RUBRICA",
  cadastrarPoliticaDePessoal: "CADASTRAR_POLITICA_DE_PESSOAL",
  aprovarPoliticaDePessoal: "APROVAR_POLITICA_DE_PESSOAL",
  revogarPoliticaDePessoal: "REVOGAR_POLITICA_DE_PESSOAL",
  criarVersaoDaRubrica: "CADASTRAR_VERSAO_DE_RUBRICA",
  aprovarVersaoDaRubrica: "APROVAR_VERSAO_DE_RUBRICA",
  revogarVersaoDaRubrica: "REVOGAR_VERSAO_DE_RUBRICA",
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
  // V24 — o FAP é parâmetro do encargo: cadastra quem cadastra a versão, aprova outra pessoa.
  cadastrarFatorAcidentario: "CADASTRAR_ENCARGO_DA_FOLHA",
  aprovarFatorAcidentario: "APROVAR_ENCARGO_DA_FOLHA",
  registrarEstabelecimentoDaLotacao: "CADASTRAR_ENCARGO_DA_FOLHA",
  apurarEncargosDaFolha: "APURAR_ENCARGOS_DA_FOLHA",
  certificarEncargosDaFolha: "CERTIFICAR_ENCARGOS_DA_FOLHA",
  devolverEncargosDaFolha: "CERTIFICAR_ENCARGOS_DA_FOLHA",
  cadastrarGrupoDosEncargos: "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA",
  apropriarEncargosDaFolha: "APROPRIAR_FOLHA",
  liquidarEncargosDaFolha: "LIQUIDAR_FOLHA",
  // V7 M1 U3 — reduzir a despesa dos encargos é da mesma mão que a apropria; cada anulação do M05
  // cobra DENTRO dela a sua ação (ANULAR_LIQUIDACAO_PARCIAL / ANULAR_EMPENHO_PARCIAL).
  ajustarEncargosDaFolha: "APROPRIAR_FOLHA",
  // V7 M1 U3.2 — a guia do emissor: registrar o documento recebido, baixá-la por um pagamento que já
  // aconteceu e cancelá-la. Nenhum dos três paga nada.
  registrarGuiaDeRecolhimento: "GERIR_GUIA_DE_RECOLHIMENTO",
  baixarGuiaDeRecolhimento: "GERIR_GUIA_DE_RECOLHIMENTO",
  cancelarGuiaDeRecolhimento: "GERIR_GUIA_DE_RECOLHIMENTO",
  // V7 M1 U4 — a ouvidoria triagem e responde no setor em que a manifestação está (lotação; sigilosa).
  triarManifestacao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA",
  responderManifestacao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA",
  // A avaliação: a metodologia é configuração da carta; avaliar o atendimento é ato do requerente;
  // remover por abuso é moderação, com motivo.
  cadastrarMetodologiaDeAvaliacao: "CONFIGURAR_CARTA_DE_SERVICOS",
  avaliarAtendimento: "SOLICITAR_SERVICO",
  removerAvaliacao: "MODERAR_AVALIACAO_DE_SERVICO",
  // V7 M2.1 — o contrato acompanhado. A ação do perfil é condição; a DESIGNAÇÃO no contrato (gestor ou
  // fiscal, vigente) é conferida dentro de cada ato. Designar e revogar são a mesma ação.
  designarNoContrato: "DESIGNAR_NO_CONTRATO",
  revogarDesignacaoNoContrato: "DESIGNAR_NO_CONTRATO",
  definirAdministradorDaFiscalizacao: "DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO",
  revogarAdministradorDaFiscalizacao: "DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO",
  configurarRegimeDeMedicao: "CONFIGURAR_EXECUCAO_DO_CONTRATO",
  // V7 M2 U1/U2 — a ordem de serviço é ato do GESTOR designado (a ação é condição necessária, a designação a outra);
  // medir a ordem é a mesma ação de medir; o provisório é do FISCAL, a decisão e o definitivo do RECEBEDOR designado.
  criarRascunhoDeOrdemDeServico: "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO",
  emitirOrdemDeServico: "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO",
  descartarRascunhoDeOrdemDeServico: "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO",
  cancelarSaldoDaOrdemDeServico: "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO",
  movimentarExecucaoDaOrdemDeServico: "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO",
  registrarMedicaoDaOrdem: "REGISTRAR_MEDICAO_DE_OBRA",
  registrarRecebimentoProvisorio: "REGISTRAR_RECEBIMENTO_PROVISORIO",
  decidirControversia: "REGISTRAR_RECEBIMENTO_DEFINITIVO",
  registrarRecebimentoDefinitivo: "REGISTRAR_RECEBIMENTO_DEFINITIVO",
  estornarRecebimentoDefinitivo: "ESTORNAR_RECEBIMENTO_DEFINITIVO",
  // V7 M2 U3 — liquidar a parcela recebida é LIQUIDAR (a mesma ação, na UG do empenho); o M05 cobra de novo por dentro.
  liquidarParcelasDoContrato: "LIQUIDAR",
  // V7 M2 U5 — o aditivo por itens é o MESMO ato de registrar aditivo (a variação vira movimento contratual), com a
  // prévia cobrada pela mesma ação; o estorno é o do movimento contratual.
  preverAditivoPorItens: "REGISTRAR_ADITIVO",
  registrarAditivoPorItens: "REGISTRAR_ADITIVO",
  estornarAditivoPorItens: "ESTORNAR_MOVIMENTO_CONTRATUAL",
  // V7 M2 U6 — a planilha orçamentária da obra: prévia, confirmação da versão e o vínculo com o contrato.
  gerarPreviaDePlanilha: "GERIR_PLANILHA_DA_OBRA",
  confirmarPreviaDePlanilha: "GERIR_PLANILHA_DA_OBRA",
  vincularItemDaPlanilhaAoContrato: "GERIR_PLANILHA_DA_OBRA",
  revogarVinculoDaPlanilha: "GERIR_PLANILHA_DA_OBRA",
  // V7 M2 U7 — medir a ordem pela planilha é a MESMA ação de medir (a designação de fiscal é a outra condição); o estorno
  // da medição sem recebimento é do fiscal, pela mesma ação — desfaz o próprio ato antes de qualquer dependente.
  medirOrdemPelaPlanilha: "REGISTRAR_MEDICAO_DE_OBRA",
  estornarMedicaoDaOrdem: "REGISTRAR_MEDICAO_DE_OBRA",
  // V7 M2 U8 — o cadastro dos tipos de ocorrência e dos formulários é ato de ADMINISTRAÇÃO do ente (não do contrato);
  // reagendar e cancelar o compromisso são do mesmo ato de programar (gestor designado), e registrar a realização é do
  // FISCAL designado — a mesma ação da ocorrência que ele registra.
  // V7 B1 — o cadastro imobiliário é ato do cadastro do ente; a tabela de parâmetros (fórmula, fundamento e valores) é
  // ato da administração tributária. SIMULAR não está aqui: é leitura, não cria fato nem dívida.
  cadastrarImovel: "GERIR_CADASTRO_IMOBILIARIO",
  novaVersaoDoImovel: "GERIR_CADASTRO_IMOBILIARIO",
  vincularPessoaAoImovel: "GERIR_CADASTRO_IMOBILIARIO",
  encerrarVinculoComImovel: "GERIR_CADASTRO_IMOBILIARIO",
  publicarTabelaDeParametros: "GERIR_PARAMETROS_TRIBUTARIOS",
  cadastrarTipoDeOcorrencia: "GERIR_TIPOS_DE_OCORRENCIA",
  publicarVersaoDoTipoDeOcorrencia: "GERIR_TIPOS_DE_OCORRENCIA",
  mudarSituacaoDoTipoDeOcorrencia: "GERIR_TIPOS_DE_OCORRENCIA",
  reagendarFiscalizacao: "PROGRAMAR_FISCALIZACAO_DO_CONTRATO",
  cancelarFiscalizacao: "PROGRAMAR_FISCALIZACAO_DO_CONTRATO",
  registrarRealizacaoDaFiscalizacao: "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO",
  cadastrarItemDoContrato: "CADASTRAR_ITEM_DO_CONTRATO",
  programarFiscalizacao: "PROGRAMAR_FISCALIZACAO_DO_CONTRATO",
  registrarOcorrencia: "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO",
  resolverOcorrencia: "RESOLVER_OCORRENCIA_DE_FISCALIZACAO",
  registrarMedicaoPorItens: "REGISTRAR_MEDICAO_DE_OBRA",
  // V6.2 P3 — a carta de serviços. Configurar a carta é um ato; pedir (protocolar, responder,
  // anexar) é o ato do REQUERENTE, conferido contra a titularidade na transação; decidir (exigir,
  // decidir, disponibilizar resposta) é o ato da mesa, no setor em que o processo está.
  // ── M05 V11 V8.4 — o roteiro orçamentário ──
  publicarRoteiroOrcamentario: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  publicarRoteiroRestosAPagar: "PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR",
  // ⚠️ `DISTRIBUIR_RECEITA_FORA_DA_PREVISAO` (V16/C30) NÃO ENTRA AQUI, e a ausência é decisão.
  // Este Record mapeia SERVIÇO -> ação, e o censo (t5b) cobra que cada nome corresponda a uma
  // função exportada que existe. Aquela ação não guarda um serviço: ela é a segunda autorização
  // cobrada DENTRO de `registrarArrecadacao`, quando alguma parcela cai em fonte que a LOA não
  // prevê. Inventar um nome de serviço para ela criaria um fantasma no censo — o ente concederia
  // um poder que nada exerce, e a lista que o TCE lê estaria mentindo.
  // ⚠️ V11 V8.9 — A MESMA AÇÃO DOS TRÊS, e isso é decisão, não economia. Publicar o roteiro,
  // escolher o EIXO da dotação adicional (por tipo de crédito ou por fonte) e publicar o roteiro
  // do ramo por fonte são a MESMA autoridade: dizer em que conta do plano o movimento entra.
  // Partir em três ações daria ao ente três crachás para a mesma decisão contábil — e o segundo
  // seria concedido por atrito no dia em que alguém não conseguisse publicar o par que falta.
  publicarPoliticaDaDotacaoAdicional: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  publicarRoteiroDaDotacaoPorFonte: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  // ⚠️ V11 V9.3 — E A QUARTA É A MESMA AUTORIDADE. Declarar de que natureza é uma fonte diz em
  // qual analítica de 7.2.1.1 a arrecadação daquela fonte entra: é dizer em que conta do plano o
  // movimento entra, exatamente como as três acima. Um crachá próprio aqui seria o quarto para a
  // mesma decisão contábil.
  declararNaturezaDaFonte: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  // V35 — carregar as fontes e os CO da tabela oficial é montar a estrutura do orçamento: a autoridade de quem
  // cadastra a LOA. A natureza que a carga declara pelo bloco da STN passa, dentro, pelo serviço da natureza, que
  // cobra a autoridade dele (PARAMETRIZAR_ROTEIRO_ORCAMENTARIO).
  carregarTabelaDeFontes: "CADASTRAR_LOA",
  // V35 — carregar o QDD da lei aprovada é cadastrar a LOA; cada ficha, dentro, passa pelo criarFicha, que cobra
  // CRIAR_FICHA na unidade dela.
  carregarQddDaLoa: "CADASTRAR_LOA",
  // V35 — a receita prevista da LOA aprovada, pela mesma autoridade; cada previsão, dentro, pelo criarReceitaPrevista.
  carregarReceitaDaLoa: "CADASTRAR_LOA",
  // V35 — registrar a retenção do FUNDEB é escriturar a receita que chegou líquida: a autoridade de quem arrecada.
  // Estornar é a de quem anula a arrecadação — a mesma segregação de registrar × anular.
  registrarDeducaoDaReceita: "REGISTRAR_ARRECADACAO",
  estornarDeducaoDaReceita: "ANULAR_ARRECADACAO",
  // V35 — dizer em que linha do demonstrativo cada receita entra é a autoridade de cadastrar as linhas dele.
  gerarDeParasDaLrf: "CADASTRAR_LINHA_DEMONSTRATIVO",
  // V35 — a população e a base do art. 29-A são parâmetros de um demonstrativo: a mesma autoridade.
  declararParametroDoLimiteDoLegislativo: "CADASTRAR_LINHA_DEMONSTRATIVO",
  // V35 — dizer quais fontes a LOA exclui do limite de suplementação é ler a lei autorizativa: a autoridade de registrá-la.
  declararFonteForaDoLimiteDeSuplementacao: "CRIAR_LEI_DE_CREDITO",
  // V35 — medir a perda esperada da dívida ativa é mensurar o ativo: a autoridade de atualizá-lo (MCASP, Parte III, 5.2.5).
  declararPercentualDePerda: "ATUALIZAR_DIVIDA_ATIVA",
  apurarAjusteDePerdas: "ATUALIZAR_DIVIDA_ATIVA",
  // V35 C2 — redigir e retirar notas explicativas é configurar o conjunto das demonstrações: a mesma autoridade.
  redigirNotaExplicativa: "CADASTRAR_LINHA_DEMONSTRATIVO",
  retirarNotaExplicativa: "CADASTRAR_LINHA_DEMONSTRATIVO",
  registrarProjecaoAtuarialDoRreo: "CADASTRAR_LINHA_DEMONSTRATIVO",
  retirarProjecaoAtuarialDoRreo: "CADASTRAR_LINHA_DEMONSTRATIVO",
  declararContasDoControleDosRestos: "PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR",
  // V35 — o parâmetro das férias é o par do parâmetro do 13º: o mesmo ato do ente (o estatuto) sobre o mesmo benefício anual.
  declararParametroDeFerias: "CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO",
  // V35 — apropriar o 13º e as férias por competência, e acertar o 13º no fim do ano, é apropriar a folha na contabilidade.
  apropriarPorCompetencia: "APROPRIAR_FOLHA",
  acertarDecimoTerceiro: "APROPRIAR_FOLHA",
  // V35 — os encargos patronais sobre o 13º e as férias apropriados (MCASP 18.3): o mesmo ato de apropriar a folha.
  apropriarEncargosPorCompetencia: "APROPRIAR_FOLHA",
  // V35 — baixar o adiantamento da 1ª parcela quando a 2ª o abate é parte da liquidação do 13º (MCASP 18.1): a mesma autoridade.
  baixarAdiantamentoDoDecimoTerceiro: "LIQUIDAR_FOLHA",
  // V28 — a conta da liquidação por elemento: a MESMA autoridade de dizer em que conta do plano o movimento entra.
  declararContaDaLiquidacao: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  // V28 — a VPA da arrecadação por natureza: a mesma autoridade de dizer em que conta do plano o movimento entra.
  declararContaDaReceita: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  // V28 — a consignação que retém cada rubrica de desconto da folha: quem gere os tipos de consignação decide.
  declararConsignacaoDaRubrica: "GERIR_TIPOS_DE_CONSIGNACAO",
  // ⚠️ V22 — E A QUINTA É A MESMA AUTORIDADE. Cadastrar uma natureza de receita no ementário diz
  // em que classificação orçamentária a arrecadação entra e, pelos de-paras dos demonstrativos,
  // em que linha da base de impostos ela soma: é parametrizar a classificação do orçamento, como
  // declarar a natureza da fonte. NÃO é `REGISTRAR_ARRECADACAO` — quem registra a guia não cria
  // o código em que a registra (segregação do 6.4) — nem `CRIAR_RECEITA_PREVISTA`, que é ato da
  // LOA de um exercício sobre um código que já existe.
  cadastrarNaturezaReceita: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  // ── M07 V11 V8.3 — os tipos de consignação ──
  cadastrarTipoDeConsignacao: "GERIR_TIPOS_DE_CONSIGNACAO",
  redefinirContaDaConsignacao: "GERIR_TIPOS_DE_CONSIGNACAO",
  desativarTipoDeConsignacao: "GERIR_TIPOS_DE_CONSIGNACAO",
  // ⚠️ V26 — A MESMA AUTORIDADE dos tipos de consignação: dizer que o IR retido é receita do Tesouro (e com
  // que natureza, destinação e contas) é a decisão contábil sobre o mesmo tipo que hoje vai para o passivo.
  classificarRetencaoPropria: "GERIR_TIPOS_DE_CONSIGNACAO",
  // ⚠️ V26 — REGISTRAR_ARRECADACAO: regularizar é registrar a receita que deixou de ser registrada (a guia nasce
  // aqui); a baixa da consignação é a outra perna do mesmo fato, sem saída de dinheiro.
  regularizarConsignacaoPropria: "REGISTRAR_ARRECADACAO",
  // ⚠️ V26 — A MESMA AUTORIDADE da declaração da unidade orçamentária: são os dados do orçamento e de quem o ordena
  // que a prestação de contas pede, não atos de execução.
  declararDadosDoPrograma: "DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA",
  declararDadosDaAcao: "DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA",
  designarOrdenador: "DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA",
  encerrarDesignacaoDeOrdenador: "DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA",
  // ⚠️ V26 — sob CADASTRAR_ENTIDADE_CONTABIL, a mesma dos responsáveis do MANAD: quem responde pela escrituração.
  declararResponsavelSiafic: "CADASTRAR_ENTIDADE_CONTABIL",
  // ⚠️ V26 — a mesma autoridade de criar a linha da previsão: dizer de que dedução ela é e de que documento veio.
  detalharReceitaPrevista: "CRIAR_RECEITA_PREVISTA",
  // ⚠️ V26 — a mesma autoridade de cadastrar o processo: informar como a licitação está no Tramita é dado do processo.
  identificarNoTramita: "CADASTRAR_PROCESSO",
  registrarNormaNoTce: "CRIAR_LEI_DE_CREDITO",
  cadastrarUnidadeGestora: "CADASTRAR_ENTIDADE_CONTABIL",
  encerrarUnidadeGestora: "CADASTRAR_ENTIDADE_CONTABIL",
  // ⚠️ V33 — a mesma autoridade de cadastrar a UG: dizer quais unidades orçamentárias são dela é dado do cadastro.
  vincularUnidadeOrcamentariaAUg: "CADASTRAR_ENTIDADE_CONTABIL",
  definirContabilizacaoDaTransferenciaEntreUgs: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO",
  registrarTransferenciaEntreUgs: "TRANSFERIR_ENTRE_CONTAS",
  estornarTransferenciaEntreUgs: "ESTORNAR_MOVIMENTO_BANCARIO",
  registrarAgrupamentoDaFolha: "LIQUIDAR_FOLHA",
  capturarVersaoDoProjetoDaLoa: "CADASTRAR_LOA",
  // ⚠️ V29 — NENHUMA AÇÃO NOVA. Importar e alterar a proposta é o poder de cadastrar o projeto da LOA;
  // efetivá-la cria fichas, e cobra CRIAR_FICHA em cada unidade (mais CRIAR_RECEITA_PREVISTA no ENTE,
  // conferida no corpo do serviço pela entrada `criarReceitaPrevista`) — o mesmo da criação manual.
  elaborarPropostaOrcamentaria: "CADASTRAR_LOA",
  ajustarLinhaDaProposta: "CADASTRAR_LOA",
  efetivarPropostaOrcamentaria: "CRIAR_FICHA",
  // ── M36/M37 — V27: frota e farmácia pública ──
  cadastrarVeiculo: "CADASTRAR_FROTA",
  publicarVersaoDoVeiculo: "CADASTRAR_FROTA",
  cadastrarMaquina: "CADASTRAR_FROTA",
  publicarVersaoDaMaquina: "CADASTRAR_FROTA",
  registrarSituacaoDaFrota: "CADASTRAR_FROTA",
  anularSituacaoDaFrota: "CADASTRAR_FROTA",
  registrarAbastecimento: "REGISTRAR_ABASTECIMENTO",
  anularAbastecimento: "REGISTRAR_ABASTECIMENTO",
  cadastrarFarmacia: "CADASTRAR_FARMACIA",
  publicarVersaoDaFarmacia: "CADASTRAR_FARMACIA",
  informarEstoqueDaFarmacia: "INFORMAR_ESTOQUE_DA_FARMACIA",
  // V27 — a lista de licitações do Tribunal (dados abertos) para identificar o processo no Tramita: quem cadastra o processo.
  importarLicitacoesDoTribunal: "CADASTRAR_PROCESSO",
  // V27 — o protocolo do banco de legislação que chegou depois do registro da lei: quem registra a lei registra o protocolo.
  informarProtocoloDaNorma: "CRIAR_LEI_DE_CREDITO",
  // ── M21 V11 V8 — a agenda do guichê ──
  criarUnidadeDeAtendimento: "CONFIGURAR_AGENDA_DO_GUICHE",
  criarGuiche: "CONFIGURAR_AGENDA_DO_GUICHE",
  definirServicoNoGuiche: "CONFIGURAR_AGENDA_DO_GUICHE",
  publicarJanelaDeAtendimento: "CONFIGURAR_AGENDA_DO_GUICHE",
  declararExcecaoDeCalendario: "CONFIGURAR_AGENDA_DO_GUICHE",
  reservarAtendimento: "RESERVAR_ATENDIMENTO_NO_GUICHE",
  cancelarReservaDeAtendimento: "RESERVAR_ATENDIMENTO_NO_GUICHE",
  reagendarReservaDeAtendimento: "RESERVAR_ATENDIMENTO_NO_GUICHE",
  // ⚠️ CONFIRMAR E REALIZAR são do guichê, não do balcão que marcou: quem diz "esta pessoa
  // está aqui" e "foi atendida" é quem atende. Dar as duas a quem marca deixaria a agenda
  // fechar o próprio dia sem ninguém ter aparecido.
  confirmarReservaDeAtendimento: "REGISTRAR_ATENDIMENTO_NO_GUICHE",
  registrarAtendimentoRealizado: "REGISTRAR_ATENDIMENTO_NO_GUICHE",
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
  // V22 — a LOA: o projeto enviado e a lei que o aprovou, sob a mesma ação.
  cadastrarLeiOrcamentariaAnual: "CADASTRAR_LOA",
  registrarAprovacaoDaLeiOrcamentaria: "CADASTRAR_LOA",
  // ── M02b V18/C13 — a ALTERAÇÃO da peça: o ato e os itens dele, sob a MESMA ação ──
  // Acrescentar item a um ato já registrado é o mesmo poder de registrá-lo (a mesma lei
  // mexendo em mais uma linha, TR 5.9.3.16): conceder um sem o outro não significaria nada.
  registrarAtoDeAlteracaoDoPlanejamento: "ALTERAR_PLANEJAMENTO",
  acrescentarItemAoAtoDeAlteracao: "ALTERAR_PLANEJAMENTO",

  // ── M12 V19/C05 — o custo por centro ──
  publicarCriterioDeRateio: "PARAMETRIZAR_RATEIO_DE_CUSTO",
  apropriarCustoDaLiquidacao: "APROPRIAR_CUSTO",
  // V28 — a folha liquidada repartida pelo centro de custo de cada vínculo: o MESMO ato de apropriar custo.
  apropriarCustoDaFolha: "APROPRIAR_CUSTO",

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
  publicarConfiguracaoDoAcesso: "PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO",
  protocolarPedidoDeAcesso: "PROTOCOLAR_PEDIDO_DE_ACESSO_A_INFORMACAO",
  distribuirPedidoDeAcesso: "DISTRIBUIR_PEDIDO_DE_ACESSO_A_INFORMACAO",
  prorrogarPedidoDeAcesso: "PRORROGAR_PEDIDO_DE_ACESSO_A_INFORMACAO",
  responderPedidoDeAcesso: "RESPONDER_PEDIDO_DE_ACESSO_A_INFORMACAO",
  decidirRecursoDeAcesso: "DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO",
  receberPedidoDeAcesso: "RECEBER_PROCESSO",
  interporRecursoDeAcesso: "DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO",
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
  // M35 — o licenciamento comercial (V10 T1). Uma ação por serviço, como todo o resto.
  registrarContratoComercial: "REGISTRAR_CONTRATO_COMERCIAL",
  encerrarContratoComercial: "ENCERRAR_CONTRATO_COMERCIAL",
  habilitarModuloContratado: "HABILITAR_MODULO_CONTRATADO",
  programarVigenciaDeModulo: "PROGRAMAR_VIGENCIA_DE_MODULO",
  suspenderModuloContratado: "SUSPENDER_MODULO_CONTRATADO",
  reativarModuloContratado: "REATIVAR_MODULO_CONTRATADO",
  // M34 B2 — o lançamento tributário e a certidão (V10 T2).
  //
  // ⚠️ `prepararLoteDeLancamento` e `prepararLancamentoTributario` COMPARTILHAM a ação, como
  // `importarExtrato`/`importarExtratoBb` e `encerrarExercicio`/`encerrarExercicioComRestos`:
  // preparar um lote inteiro e preparar um caso avulso são o MESMO ato administrativo, feito
  // em escalas diferentes. Duas ações inventariam uma segregação que o CTN não tem.
  prepararLoteDeLancamento: "PREPARAR_LANCAMENTO_TRIBUTARIO",
  prepararLancamentoTributario: "PREPARAR_LANCAMENTO_TRIBUTARIO",
  constituirCreditoTributario: "CONSTITUIR_CREDITO_TRIBUTARIO",
  retificarLancamentoTributario: "RETIFICAR_LANCAMENTO_TRIBUTARIO",
  cancelarLancamentoTributario: "CANCELAR_LANCAMENTO_TRIBUTARIO",
  solicitarCertidao: "SOLICITAR_CERTIDAO",
  decidirCertidao: "DECIDIR_CERTIDAO",
  // ⚠️ A CONFIGURAÇÃO DA CERTIDÃO (validade e fundamento) COMPARTILHA a ação da tabela do
  // tributo, e não ganha uma própria: as duas são parâmetro normativo do ente, publicado por
  // quem responde pela norma municipal. Uma ação a mais inventaria uma segregação que o ente
  // não tem — e o censo existe para não inventar.
  configurarCertidao: "GERIR_PARAMETROS_TRIBUTARIOS",
  definirDivulgacaoDaLocalizacao: "DEFINIR_DIVULGACAO_DA_LOCALIZACAO",
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
/**
 * ═══ ⚠️ AS AÇÕES QUE NÃO TÊM SERVIÇO PRÓPRIO — e por que esta lista precisou existir ═══
 *
 * `TODAS_AS_ACOES` é DERIVADA de `ACAO_DO_SERVICO` (serviço → ação) mais as leituras. Uma ação que
 * não apareça em nenhum dos dois **não existe para ninguém — nem para o ADMIN**, que recebe
 * exatamente `TODAS_AS_ACOES`. Fail-closed absoluto e inútil: a capacidade fica inalcançável, e o
 * sintoma é um `ACESSO NEGADO` para o usuário mais poderoso do ente, sem nenhuma forma de conceder.
 *
 * ⚠️ E ELAS NÃO ENTRAM NO MAPA `ACAO_DO_SERVICO` PARA "FICAR SIMÉTRICO". Aquele mapa descreve
 * SERVIÇOS, e `SELECIONAR_VINCULOS_DA_FOLHA` não é um: é uma **segunda cobrança dentro de
 * `calcularFolha`**, feita só quando o modo é EXPLICITA. Pôr uma chave lá criaria no censo de
 * serviços um nome que nenhuma função exporta — e o censo deixaria de descrever o que existe, que
 * é precisamente o que ele serve para fazer.
 *
 * Quem acrescentar uma ação assim acrescenta AQUI, e o teste de censo continua podendo afirmar
 * que todo serviço de mutação tem ação sem precisar fingir que toda ação tem serviço.
 */
export const ACOES_SEM_SERVICO_PROPRIO: readonly AcaoDoSistema[] = [
  // V11 V9.5 (TR 5.12.50) — recortar quem entra no cálculo da folha. Cobrada dentro de
  // `calcularFolha`, ADICIONALMENTE a `CALCULAR_FOLHA`, e só no modo EXPLICITA.
  "SELECIONAR_VINCULOS_DA_FOLHA",
  // V16/C30 — distribuir a receita em fonte que a LOA NÃO prevê para aquela natureza. Cobrada
  // dentro de `registrarArrecadacao`, ADICIONALMENTE a `REGISTRAR_ARRECADACAO`, e só quando
  // alguma parcela sai da previsão. Repartir entre as fontes PREVISTAS não pede crachá novo.
  "DISTRIBUIR_RECEITA_FORA_DA_PREVISAO",
];

export const TODAS_AS_ACOES: readonly AcaoDoSistema[] = [
  ...new Set<AcaoDoSistema>([...Object.values(ACAO_DO_SERVICO), ...ACOES_DE_LEITURA, ...ACOES_SEM_SERVICO_PROPRIO]),
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
 * ═══ ⚠️ AS AÇÕES DO FORNECEDOR — O ÚNICO BLOCO RESERVADO DO CENSO (V10 T1 · N6.1) ═══
 *
 * A habilitação comercial não é poder do ENTE: é do FORNECEDOR. A distinção não é
 * hierárquica ("o fornecedor é mais forte"), é de OBJETO — o administrador do município
 * decide quem, dentro do município, pode empenhar; o fornecedor declara o que o CONTRATO
 * alcança. Se as duas coubessem na mesma tela, quem administra permissões se concederia a
 * habilitação e o contrato viraria enfeite.
 *
 * ⚠️ TRÊS CONSEQUÊNCIAS, e cada uma tem teste:
 *   1. `concederAcaoAoPerfil` RECUSA qualquer ação desta lista, nomeando o motivo;
 *   2. o BOOTSTRAP de instalação concede `ACOES_DO_ENTE` (o censo MENOS estas) ao
 *      administrador municipal — antes ele recebia `TODAS_AS_ACOES`, e teria recebido estas
 *      de carona no dia em que nascessem;
 *   3. nenhuma atualização versionada de permissões as deriva — a v1 deriva leitura por
 *      área a partir de mutações que o perfil já tem, e um perfil municipal nunca tem estas.
 *
 * ⚠️ O QUE ISTO **NÃO** RESOLVE, e está declarado: quem tem acesso ao shell do servidor e ao
 * banco pode provisionar o que quiser. A fronteira aqui é a APLICAÇÃO — nenhuma tela, rota
 * ou ação do sistema concede estas seis. Quem as concede é um ato de instalação, com autor
 * registrado. Prometer mais do que isso seria mentir sobre o que software consegue impedir.
 */
export const ACOES_DO_FORNECEDOR: readonly AcaoDoSistema[] = [
  "REGISTRAR_CONTRATO_COMERCIAL",
  "ENCERRAR_CONTRATO_COMERCIAL",
  "HABILITAR_MODULO_CONTRATADO",
  "PROGRAMAR_VIGENCIA_DE_MODULO",
  "SUSPENDER_MODULO_CONTRATADO",
  "REATIVAR_MODULO_CONTRATADO",
  "CONSULTAR_LICENCIAMENTO",
];

/** É ação reservada ao fornecedor? — o discriminador que a tela de permissões cobra. */
export function ehAcaoDoFornecedor(acao: string): boolean {
  return (ACOES_DO_FORNECEDOR as readonly string[]).includes(acao);
}

/**
 * O CENSO DO ENTE — tudo menos o que é do fornecedor. É o que o bootstrap concede.
 *
 * ⚠️ DERIVADO, e não uma segunda lista escrita à mão: uma ação nova do censo entra aqui
 * sozinha, e uma ação nova do fornecedor sai daqui sozinha. Duas listas paralelas divergem —
 * e a divergência, aqui, seria o administrador municipal nascendo com a chave do contrato.
 */
export const ACOES_DO_ENTE: readonly AcaoDoSistema[] = TODAS_AS_ACOES.filter(
  (a) => !ehAcaoDoFornecedor(a)
);

/**
 * ⚠️ OS SERVIÇOS QUE O CENSO **NÃO** COBRE, E POR QUÊ. Cada exclusão é uma DECISÃO, e o
 * grep-teste lê esta lista — nada sai do censo por descuido.
 */
export const FORA_DO_CENSO: Record<string, string> = {
  // ── V32 ──
  lerBalancete: "puro (o balancete colado lido em linhas, com os problemas de forma)",
  previaDaImplantacao: "leitura (as contas conferidas no plano e os totais por subsistema — não muta)",
  situacaoDoAdiantamento: "puro (a situação da concessão pela prestação e pelo prazo)",
  listarAdiantamentos: "leitura (as concessões de diárias e suprimentos com a situação — não muta)",
  roteiroPatrimonialVigente: "leitura (o roteiro declarado vigente de precatório ou convênio, com os ids das contas — não muta)",
  listarRoteirosPatrimoniais: "leitura (os movimentos que precisam de roteiro e o que vale para cada um — não muta)",
  situacaoDoFechamento: "leitura (as doze competências do exercício e se cada uma está fechada para todos — não muta)",
  // ── V27 — frota e farmácia pública: leituras e os arquivos do SAGRES ──
  protocoloDaNorma: "puro (o protocolo do registro ou o informado depois)",
  listarAnexosDasNormas: "leitura (os PDFs das leis no cadastro de normas, por norma — não muta)",
  listarAnexosDasRealocacoes: "leitura (os PDFs dos decretos de realocação, por ato — não muta)",
  diferencasDoProjetoParaALei: "leitura (o projeto guardado contra a dotação inicial e a receita prevista da lei aprovada — não muta)",
  lerLicitacoesDoTribunal: "puro (lê o CSV de licitações dos dados abertos do Tribunal e confere formato — não toca o banco)",
  numeroDaLicitacaoNoLeiaute: "puro (NNNNN/AAAA para as 9 posições do leiaute)",
  licitacoesCandidatas: "leitura (as licitações importadas do Tribunal compatíveis com a modalidade do processo — não muta)",
  identificarPelaLicitacaoDoTribunal: "composável (monta a identificação a partir do registro importado e chama identificarNoTramita, que cobra CADASTRAR_PROCESSO antes de gravar)",
  lerInformeDeEstoque: "puro (lê o arquivo de estoque da farmácia e confere cada linha — não toca o banco)",
  gerarArquivosDaFrotaEFarmacia: "leitura (os TXT SAGRES §4.50 a §4.57, ou a recusa nomeada por arquivo — não muta)",
  lerFatosProprietarioFrota: "leitura (os donos dos bens cadastrados ou alterados no mês, para o §4.50 — não muta)",
  lerFatosLocadorPrestador: "leitura (os locadores dos bens cadastrados ou alterados no mês, para o §4.51 — não muta)",
  lerFatosVeiculos: "leitura (as versões de veículo que começam no mês, para o §4.52, ou a recusa sem o modelo — não muta)",
  lerFatosMaquinas: "leitura (as versões de máquina que começam no mês, para o §4.53 — não muta)",
  lerFatosSituacaoFrota: "leitura (a situação de cada bem no dia 1 e as mudanças do mês, para o §4.54 — não muta)",
  lerFatosAbastecimento: "leitura (os litros do mês por bem e combustível, com o registro zerado, para o §4.55 — não muta)",
  lerFatosFarmacia: "leitura (as farmácias ativas no fim do mês, para o §4.56 — não muta)",
  lerFatosEstoqueFarmacia: "leitura (o último informe de estoque do mês de cada farmácia, para o §4.57, ou a recusa — não muta)",
  // ── V26 — o IR e o ISS retidos pelo próprio Tesouro ──
  fatosDaOrigemDoPagamento: "leitura (os fatos de retenção possíveis pela origem do pagamento: folha ou fornecedor)",
  ordenadorNaData: "leitura (o ordenador designado vigente na data, para a unidade da ficha; recusa a ambiguidade)",
  apurarLimiteDoLegislativo: "leitura (V35 — o limite do art. 29-A, o duodécimo e os repasses do mês; não muta)",
  anexo9: "leitura (V35 — RREO Anexo 9, regra de ouro: operações de crédito contra a despesa de capital; não muta)",
  anexo4: "leitura (V35 — RREO Anexo 4, receitas e despesas previdenciárias do RPPS pelo mapeamento da STN; não muta)",
  anexo16: "leitura (V35 — Anexo 16 da Lei 4.320, dívida fundada; compõe o M10, não muta)",
  anexo17: "leitura (V35 — Anexo 17 da Lei 4.320, dívida flutuante; compõe M08 e razão, não muta)",
  termoDeConferenciaDeCaixa: "leitura (V35 — a conciliação de cada conta bancária em 31/12; não muta)",
  situacaoDoLimiteDaLoa: "leitura (V35 — despesa fixada, limite e consumido da suplementação; não muta)",
  conferirLimiteDaRealocacao: "composável interno (V35 — o limite da LOA para a realocação por decreto, chamado dentro do registro da realocação, que já autorizou REGISTRAR_REALOCACAO_DE_DOTACAO)",
  conferirLimiteDaLoa: "composável interno (V35 — o guard do limite da LOA, chamado dentro do executarCredito, que já autorizou EXECUTAR_CREDITO)",
  apuracoesDoAjusteDePerdas: "leitura (V35 — as apurações do ajuste para perdas, com a metodologia; não muta)",
  baixarAnexoPublicoDaLoa: "leitura pública (V35 C9 — o documento de LOA com lei de aprovação, sem sessão; qualquer outro anexo responde inexistente; não muta)",
  contasVigentes: "leitura (V35 A3 — as contas da última declaração do controle 5.3/6.3 dos restos; não muta)",
  controlarInscricao: "composável (V35 A3 — o controle 5.3/6.3 da inscrição, chamado DENTRO de encerrarExercicioComRestos, que autoriza)",
  encerrarControleDoExercicio: "composável (V35 A3 — o encerramento 5.3/6.3 das inscrições anteriores, dentro de encerrarExercicioComRestos)",
  abrirControleDoExercicio: "composável (V35 A3 — a abertura 5.3/6.3 do exercício seguinte, dentro de encerrarExercicioComRestos)",
  controlarExecucao: "composável (V35 A3 — o controle 5.3/6.3 da liquidação, pagamento e cancelamento de RP, dentro dos serviços do M08 que autorizam)",
  inverterControleDoFato: "composável (V35 A3 — a anulação do pagamento ou do cancelamento de RP inverte o controle, dentro das anulações do M08)",
  dmpl: "leitura (V35 — a DMPL, MCASP Parte V item 7, lida do razão do grupo 2.3 e das classes 3 e 4; não muta)",
  anexo10: "leitura (V35 — RREO Anexo 10, a projeção atuarial registrada com o resultado e o saldo derivados; não muta)",
  notasExplicativas: "leitura (V35 C2 — as notas explicativas às DCASP, redigidas e do sistema; não muta)",
  apropriacoesDoExercicio: "leitura (V35 — as apropriações do 13º e das férias do exercício; não muta)",
  deducoesRealizadas: "leitura (V35 — as deduções da receita realizadas no exercício, com o estorno com sinal; não muta)",
  lancarReprevisaoDaReceita: "composável (V35 — o lançamento da reprevisão da receita no razão; chamado dentro de reprevisar, na transação da linha, sob a autorização de reprevisarReceita)",
  lancarPrevisaoDaReceita: "composável (V35 — o lançamento da previsão da receita no razão; chamado dentro de criarReceitaPrevista, detalharReceitaPrevista e efetivarPropostaOrcamentaria, que autorizam)",
  liquidacoesComSaldo: "leitura (V33 — as liquidações com saldo a pagar da fila do art. 141, por fonte e categoria, com a anulação parcial cortada no tempo; composável de quem paga e do lote, que autorizam)",
  lerFatosProgramas: "leitura (SAGRES §4.2: os programas do orçamento com a declaração vigente)",
  lerFatosAcao: "leitura (SAGRES §4.3: as ações do orçamento com a declaração vigente)",
  gerarProgramas: "leitura (SAGRES §4.2: o arquivo)",
  gerarAcao: "leitura (SAGRES §4.3: o arquivo)",
  lerFatosOrdenador: "leitura (SAGRES §4.36: as designações que começam no dia)",
  gerarOrdenador: "leitura (SAGRES §4.36: o arquivo)",
  lerFatosResponsavelSiafic: "leitura (SAGRES §4.48: a declaração vigente no fim de janeiro)",
  gerarResponsavelSiafic: "leitura (SAGRES §4.48: o arquivo)",
  lerFatosReceitaPrevista: "leitura (SAGRES §4.7: as linhas da previsão do exercício, com o subtipo da dedução)",
  gerarReceitaPrevista: "leitura (SAGRES §4.7: o arquivo)",
  lerFatosSaldoInicial: "leitura (SAGRES §4.25: o saldo contábil de abertura, da conciliação de dezembro encerrada)",
  gerarSaldoInicial: "leitura (SAGRES §4.25: o arquivo)",
  licitacaoNoTramita: "leitura (a identificação vigente do processo no Tramita)",
  lerFatosRelacionamentoEmpenhoLicitacao: "leitura (SAGRES §4.38: os empenhos do mês com a licitação do Tramita)",
  gerarRelacionamentoEmpenhoLicitacao: "leitura (SAGRES §4.38: o arquivo)",
  gerarArquivosDaV26: "leitura (SAGRES: os arquivos da V26 do pacote, com as recusas nomeadas)",
  lerFatosAtualizacaoOrcamentaria: "leitura (SAGRES §4.5: os itens dos decretos de crédito do dia)",
  gerarAtualizacaoOrcamentaria: "leitura (SAGRES §4.5: o arquivo)",
  lerFatosDecretosEOficios: "leitura (SAGRES §4.6: os decretos do dia e o PDF de cada um)",
  gerarDecretosEOficios: "leitura (SAGRES §4.6: o arquivo e os PDFs, conferidos pelo hash)",
  lerFatosNormasOrcamentarias: "leitura (SAGRES §4.49: as leis do dia com o protocolo do TCE-PB)",
  gerarNormasOrcamentarias: "leitura (SAGRES §4.49: o arquivo)",
  ugVigenteNoDia: "leitura (pura: a unidade gestora vale no dia civil)",
  unidadesGestorasOperadas: "leitura (as unidades gestoras escrituradas aqui e vigentes no dia)",
  contabilizacaoVigenteDaTransferencia: "leitura (as contas vigentes do tipo de transferência entre unidades gestoras)",
  conciliacaoDasTransferenciasEntreUgs: "leitura (as transferências entre unidades gestoras do período, com o lado sem confirmação nomeado)",
  lerFatosTransfRecebida: "leitura (SAGRES §4.17: as transferências recebidas do dia)",
  lerFatosTransfConcedida: "leitura (SAGRES §4.18: as transferências concedidas do dia)",
  gerarTransfRecebida: "leitura (SAGRES §4.17: o arquivo)",
  gerarTransfConcedida: "leitura (SAGRES §4.18: o arquivo)",
  liquidacoesDeFolhaSemAgrupamento: "leitura (as liquidações de folha do mês sem o código de agrupamento)",
  lerFatosRelacionamentoLiquidacaoAgrupamentoFolha: "leitura (SAGRES §4.39: as liquidações do mês com o código de agrupamento da folha)",
  gerarRelacionamentoLiquidacaoAgrupamentoFolha: "leitura (SAGRES §4.39: o arquivo)",
  versaoDoProjetoNaRemessa: "leitura (a versão do projeto da LOA que vai na remessa do mês)",
  lerFatosPloaPrograma: "leitura (SAGRES §4.43: os programas da cópia do projeto)",
  lerFatosPloaAcao: "leitura (SAGRES §4.41: as ações da cópia do projeto)",
  lerFatosPloaUnidadeOrcamentaria: "leitura (SAGRES §4.45: as unidades da cópia do projeto)",
  lerFatosPloaReceitaPrevista: "leitura (SAGRES §4.44: a receita da cópia do projeto)",
  lerFatosPloaDotacao: "leitura (SAGRES §4.42: a dotação da cópia do projeto)",
  gerarPloaPrograma: "leitura (SAGRES §4.43: o arquivo)",
  gerarPloaAcao: "leitura (SAGRES §4.41: o arquivo)",
  gerarPloaUnidadeOrcamentaria: "leitura (SAGRES §4.45: o arquivo)",
  gerarPloaReceitaPrevista: "leitura (SAGRES §4.44: o arquivo)",
  gerarPloaDotacao: "leitura (SAGRES §4.42: o arquivo)",
  irDaFolhaNoPagamento: "leitura (o IR dos servidores a reter no pagamento de uma liquidação de folha, e como: receita ou consignação)",
  irDaFolhaPendente: "leitura (o IR dos contracheques que a liquidação cobre e que ainda não foi retido)",
  exigirIrDaFolhaAindaPendente:
    "GUARDA, não serviço: lida dentro da transação do pagamento, que já cobrou PAGAR, sob a trava do número da guia.",
  registrarReceitasPorRetencaoNaTx:
    "PERNA DO PAGAMENTO, não ato do usuário: grava a guia de receita por retenção e o elo DENTRO da transação de " +
    "`pagar`, que já cobrou PAGAR. Quem paga, retém — a mesma regra da consignação e da amortização.",
  anularReceitasPorRetencaoNaTx:
    "PERNA DA ANULAÇÃO DO PAGAMENTO: anula a guia por retenção DENTRO da transação de `anularPagamento`, que já cobrou " +
    "ANULAR_PAGAMENTO. A guia sozinha não se anula (o M04 recusa).",
  classificacaoPropriaVigente: "leitura (a decisão vigente do ente para um fato de retenção própria, na data)",
  listarClassificacoesDaRetencaoPropria: "leitura (as decisões do ente sobre IR e ISS próprios, para a tela)",
  mesmoPerimetro: "leitura (a conta que paga é do titular do Tesouro da classificação?)",
  exigirClassificacaoPropria: "leitura com recusa (a classificação vigente, ou o erro que nomeia o cadastro)",
  ehTributoDoProprioTesouro:
    "GUARDA, não serviço: lida dentro do ingresso, do dispêndio e da retenção do M07, que já cobraram a ação deles. " +
    "Diz se um saldo de consignação é imposto do próprio Tesouro no mesmo perímetro.",
  // ── V15/C34/C37 — a composição do recolhimento extraorçamentário (LEITURAS) ──
  //
  // ⚠️ AS TRÊS SÃO PROJEÇÃO DE FATO JÁ GRAVADO, e nenhuma escreve. Elas servem à tela de
  // consignações e ao ato de recolher, que já cobra `REGISTRAR_DISPENDIO_EXTRA` antes de ler
  // qualquer coisa. Ação própria para cada uma seria um crachá que ninguém usa — e crachá que
  // ninguém usa é crachá concedido por atrito.
  conferirComposicaoExtra:
    "LEITURA. Os quatro números da consignação SEPARADOS (retido, recolhido, estornado de cada " +
    "lado) mais o que falta recolher, e a reconciliação independente do total. Não grava nada.",
  retencoesComSaldo:
    "LEITURA. As retenções que ainda têm saldo a recolher, por origem — inclusive de exercícios " +
    "anteriores. É o vocabulário da guia de recolhimento; não grava nada.",
  composicaoDoRecolhimento:
    "LEITURA. De quais retenções um recolhimento já gravado veio, com o valor de cada parcela. " +
    "Projeção da `AlocacaoDoRecolhimento`; não grava nada.",
  // ── V17/C07 — as eliminações intragovernamentais ────────────────────────────
  planoDeConsolidacao:
    "LEITURA. As âncoras de nível 5 do plano instalado, para classificar uma conta como INTRA OFSS " +
    "(`consolidacao.ts`). Uma consulta e um classificador puro; não grava nada.",
  eliminacoesIntragovernamentais:
    "LEITURA. O demonstrativo das operações entre unidades do próprio ente e o resíduo de cada par. " +
    "⚠️ E A AUSÊNCIA DE AÇÃO É A DECISÃO CENTRAL DELE: a eliminação é DEMONSTRATIVO, não " +
    "lançamento — nada se escreve no razão, e é assim que a visão individual de cada unidade se " +
    "preserva. A tela é lida sob `CONSULTAR_RELATORIOS`, como os outros demonstrativos.",
  // ── V18/C13 — as quatro leituras da ALTERAÇÃO da peça de planejamento ──
  // ⚠️ A ESCRITA DELAS TEM AÇÃO PRÓPRIA (`ALTERAR_PLANEJAMENTO`, em `ACAO_DO_SERVICO`); o que
  // está aqui é só quem LÊ. A leitura da tela é `CONSULTAR_PLANEJAMENTO`, como as demais peças.
  comparativoDaPeca:
    "LEITURA. O comparativo da peça: o valor original, os atos que a alteraram em ordem " +
    "cronológica, a soma e o vigente — com corte por data, que é o que faz 'relatório por " +
    "versão'. Não grava nada; o valor vigente é DERIVADO e não existe como coluna.",
  metasAnuaisVigentes:
    "LEITURA. As metas fiscais da LDO com as alterações já aplicadas — o DONO da derivação. " +
    "⚠️ Os dois leitores que já existiam (o Anexo de Metas Fiscais em PDF e a meta que o RREO " +
    "Anexo 6 confronta) passam por ela, para que não haja duas verdades sobre o mesmo número.",
  atosDaPeca:
    "LEITURA. Os atos que alteraram uma peça, em ordem cronológica e com corte por data.",
  linhasAlteraveisDaPeca:
    "LEITURA. As linhas que um ato PODE alterar, recortadas pela peça — é o recorte que o " +
    "formulário oferece, para não virar um select de quinhentos itens.",
  // ⚠️ ESTA É COMPOSÁVEL INTERNA, não leitura de tela: ela roda DENTRO de `alocarRecolhimento`,
  // na transação dele, e é o número contra o qual a parcela é conferida. Autorizá-la de novo
  // seria cobrar duas vezes pelo mesmo ato.
  aRecolherDoIngresso:
    "COMPOSÁVEL INTERNO. Quanto ainda falta recolher de UM ingresso (retenção), já descontando o " +
    "que outras guias alocaram e ignorando alocações de recolhimento estornado. Roda dentro do " +
    "ato que aloca, sob a autorização dele.",
  // ── V15/C38 — o roteiro dos restos a pagar e o passivo de origem ──
  roteiroVigenteDeRestos:
    "LEITURA. A versão vigente (a de maior número) das contas de uma operação de restos a pagar. " +
    "Projeção de um cadastro append-only; não grava nada.",
  exigirRoteiroDeRestos:
    "COMPOSÁVEL INTERNO. A mesma leitura, em versão FAIL-CLOSED: recusa nomeando a operação e o " +
    "caminho da tela quando as contas não foram informadas. Roda dentro da liquidação, do " +
    "pagamento e dos cancelamentos, sob a autorização de cada um.",
  passivoDaLiquidacaoDeOrigem:
    "COMPOSÁVEL INTERNO. Descobre, na liquidação de origem, contra QUE passivo o resto se baixa — " +
    "e recusa quando há mais de uma perna credora de classe 2, em vez de escolher uma por ordem " +
    "de leitura. Roda dentro do pagamento e da liquidação do resto, sob a autorização deles.",
  // ── V12 3.D1 — as duas funções que o `t5` pegou sem classificação ──
  // Nenhuma das duas é ato do usuário: uma recebe `TxDeLeitura` e só recusa, a outra só soma o que
  // já foi gravado. Dar ação própria a elas inventaria uma segregação que o ente não tem e obrigaria
  // toda instalação existente a conceder um crachá a mais para praticar o mesmo ato.
  exigirNaturezaDaFonte:
    "GUARD COMPOSÁVEL. A natureza declarada da fonte, ou a recusa nomeando a fonte e a tela que "
    + "resolve (`NATUREZA-DA-FONTE-AUSENTE`). Recebe `TxDeLeitura` e não grava nada: é a projeção do "
    + "cadastro append-only de `declararNaturezaDaFonte`, que JÁ está no censo sob "
    + "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO. Quem a chama é a escrituração, que já cobrou a ação do seu "
    + "próprio ato antes de ler. A recusa dela é o fail-closed do lançamento, não uma autorização.",
  criterioDoAbatimentoNoCalculo:
    "LEITURA. O que o ente declarava sobre o abatimento do adiantamento QUANDO um cálculo de 13º "
    + "rodou, mais se aquele cálculo de fato abateu e quanto. Só `findMany` e soma sobre linhas já "
    + "gravadas — existe para a mensagem poder dizer de quanto se trata, e é chamada de dentro do "
    + "cálculo e das telas do 13º, que já cobram CALCULAR_FOLHA e CONSULTAR_FOLHA.",
  // ── M33 V11 V9.1 — o parâmetro do 13º ──
  parametroVigenteDoExercicio:
    "LEITURA. O parâmetro do 13º vigente de um exercício — a versão de maior número, com as três " +
    "rubricas e a base já resolvidas. Não grava nada: é projeção de um cadastro append-only. Quem " +
    "a chama é `calcularFolha`, que já cobra CALCULAR_FOLHA antes de qualquer leitura — dar-lhe " +
    "ação própria exigiria conceder duas para praticar um ato só, e um crachá que ninguém usa é " +
    "um crachá que o administrador concede por atrito. Ela RECUSA quando não há parâmetro " +
    "(`PARAMETRO-DO-13-AUSENTE`), e essa recusa é o fail-closed do cálculo, não uma autorização.",
  // ── M33 V13 — o adiantamento salarial: TRÊS LEITURAS, nenhuma delas um ato do usuário ──
  //
  // ⚠️ AS TRÊS RODAM DENTRO DE `calcularFolha`, que já cobra CALCULAR_FOLHA antes de qualquer
  // leitura. Dar ação própria a elas exigiria conceder duas para praticar um ato só, e um crachá
  // que ninguém usa é um crachá que o administrador concede por atrito. O ATO de escrever o
  // critério do ente — esse sim — tem ação própria:
  // CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL, sob `cadastrarParametroDoAdiantamentoSalarial`.
  parametroVigenteDaCompetencia:
    "LEITURA. O parâmetro do adiantamento salarial vigente de uma competência — a versão de maior " +
    "número, com as duas rubricas já resolvidas. Não grava nada: é projeção de um cadastro " +
    "append-only. Ela RECUSA quando não há parâmetro " +
    "(`PARAMETRO-DO-ADIANTAMENTO-SALARIAL-AUSENTE`), e essa recusa é o fail-closed do cálculo, " +
    "não uma autorização.",
  parametroQueApurouOCalculo:
    "LEITURA. Qual VERSÃO do parâmetro apurou um cálculo de vale já fechado, recuperada da memória " +
    "do contracheque. É ela que faz `alteração de parâmetro não reescreve cálculo fechado` valer: " +
    "a folha mensal abate pela régua que pagou, nunca pela vigente de hoje. Só `findFirst` e " +
    "`findUnique` sobre fatos já gravados; falha fechado se a memória não disser.",
  abatimentoDoAdiantamentoSalarialNaCompetencia:
    "LEITURA COM GUARDAS. Quanto o vale FECHADO de uma competência pagou a cada vínculo, e se o " +
    "estado que o ente exigiu (FECHADO, CERTIFICADO ou PAGO) foi alcançado. Não grava uma linha " +
    "sequer — as recusas dela (`ADIANTAMENTO-SALARIAL-NAO-FECHADO`, " +
    "`ADIANTAMENTO-SALARIAL-NAO-CERTIFICADO`, `ADIANTAMENTO-SALARIAL-NAO-PAGO`) são o fail-closed " +
    "do cálculo MENSAL, que já cobrou CALCULAR_FOLHA. Uma ação própria aqui seria uma fechadura na " +
    "porta interna de um cômodo cuja porta externa já está trancada.",
  roteiroVigente:
    "LEITURA. A versão vigente do roteiro orçamentário de um par (movimento, tipo de crédito). " +
    "Não grava nada; é a mesma projeção que `dotacao-razao` usa para escriturar, de modo que a " +
    "tela não pode oferecer um roteiro diferente do que o razão aplica.",
  decisaoVigente:
    "LEITURA. A decisão vigente do ente sobre um tipo de consignação (qual passivo, e se vale). " +
    "Não grava nada; é a projeção do fato append-only que o cadastro escreve.",
  // ── M05 V11 V8.9 — o eixo da dotação adicional ──
  politicaVigente:
    "LEITURA. A decisão vigente do ente sobre o EIXO da dotação adicional (por tipo de crédito ou " +
    "por fonte). Devolve `null` quando ninguém decidiu — e é por isso que ela existe separada de " +
    "`eixoVigente`: a tela precisa distinguir 'o ente decidiu assim' de 'ninguém decidiu e ficou assim'.",
  eixoVigente:
    "LEITURA. O eixo em vigor para LANÇAR, com o herdado (POR_TIPO_DE_CREDITO) no lugar da " +
    "ausência. Não grava nada; é a projeção que `dotacao-razao` consulta para saber qual tabela " +
    "de roteiro responde.",
  roteiroPorFonteVigente:
    "LEITURA. A versão vigente do roteiro de uma ORIGEM de recurso no ramo `5.2.2.1.3`. Mesma " +
    "natureza de `roteiroVigente`: a tela não pode oferecer um roteiro diferente do que o razão aplica.",
  exigirAnalitica:
    "GUARD COMPOSÁVEL. Recusa conta inexistente ou SINTÉTICA, listando as analíticas sob ela. " +
    "Não é ato do usuário: é a conferência que os dois serviços de publicação de roteiro chamam " +
    "dentro da transação deles, e a autorização já foi cobrada por quem a chamou.",
  // ── M21 V11 V8.12 — a exceção de calendário versionada ──
  excecaoVigenteNoDia:
    "LEITURA. A decisão vigente sobre um dia da unidade (fechado, expediente especial, ou nenhuma). " +
    "Não grava nada, e é chamada pelos seis caminhos que consultam o calendário — ter uma leitura " +
    "só é o que impede seis lugares de esquecerem do `orderBy` da sequência.",
  // ── M21 V11 V8.1 — os ATOS PÚBLICOS do agendamento (TR 5.39, portal de autoatendimento) ──
  agendarPeloPortal:
    "ATO PÚBLICO SEM CONTA (agendamento de atendimento presencial pelo cidadão): não " +
    "há usuário a autorizar — existiria um crachá que ninguém tem. As defesas são outras e estão " +
    "no corpo: o serviço tem de estar habilitado NAQUELE guichê E marcado como agendável pelo " +
    "portal (`false` por padrão); a capacidade é a MESMA, sob o MESMO trinco do lugar; quota por " +
    "chave de origem; UM atendimento vivo por documento declarado e por serviço; e o segredo é " +
    "entregue uma vez e guardado só por hash. O titular é DECLARADO, sem tocar no cadastro de " +
    "pessoas — CPF digitado não é autenticação, e casar pelo documento vazaria quem já é conhecido.",
  reagendarPeloPortal:
    "ATO PÚBLICO SEM CONTA (V11 V8.5): quem tem o SEGREDO remarca a própria marcação, no MESMO " +
    "guichê. Fecha GUICHE-PORTAL-SEM-REAGENDAMENTO: 'cancele e marque de novo' tinha um buraco — " +
    "entre os dois atos o lugar volta para a fila e outra pessoa pode tomá-lo, e quem só queria " +
    "mudar de horário ficava sem nenhum. Passa pelos MESMOS trincos e pela MESMA capacidade do " +
    "balcão; mudar de guichê continua sendo do ente.",
  cancelarPeloPortal:
    "ATO PÚBLICO SEM CONTA: quem tem o SEGREDO cancela a própria marcação. O `codigo` aparece na " +
    "agenda interna e NÃO basta — se bastasse, quem lê a agenda desmarcaria o atendimento de um " +
    "cidadão de forma anônima. Não cancela o que já foi atendido, e o autor fica `PORTAL-DO-CIDADAO`.",
  consultarReservaPeloSegredo:
    "LEITURA PÚBLICA pelo segredo (hash): onde, quando, para quê e em que situação — o compromisso " +
    "VIGENTE, não o original. Segredo errado e segredo inexistente respondem IGUAL, para a consulta " +
    "não virar oráculo.",
  guichesAbertosAoPortal:
    "LEITURA PÚBLICA: os guichês com ao menos um serviço aberto à marcação pela internet. Guichê " +
    "sem serviço aberto não aparece — levaria a pessoa a uma tela sem o que escolher.",
  hashDoSegredoDaReserva:
    "FUNÇÃO PURA: o sha256 do segredo, com prefixo de domínio. Não toca no banco; existe para que " +
    "o segredo NUNCA seja gravado em claro.",

  // ── M21 V11 V8 — as LEITURAS da agenda do guichê ──
  ocupacaoDoDia:
    "LEITURA. Conta quantas reservas VIVAS ocupam cada horário de um guichê num dia. Não grava " +
    "nada — e é de propósito a MESMA função que o guard da reserva subtrai dentro da transação: " +
    "uma segunda contagem faria a agenda oferecer horário que a gravação recusa.",
  ofertaDoGuiche:
    "LEITURA. Devolve os horários de um dia com capacidade, ocupadas e livres, ou o MOTIVO de a " +
    "unidade estar fechada. Quem a chama pela tela passa por `CONSULTAR_PROTOCOLO`, a ação de " +
    "leitura da área — a agenda do guichê não ganha ação de leitura própria.",
  // ⚠️ V11 V5.3 — OS CORPOS DE TRANSAÇÃO DO M21. Eles não são atos por si: quem os chama já
  // está dentro de uma transação e responde pelo ato. Estão exportados porque o pedido de
  // acesso à informação precisa tramitar e receber o PROCESSO na mesma transação em que grava o
  // fato do rito — separar as duas transações deixaria uma janela em que o processo andou e o
  // fato não existe.
  //
  // ⚠️ E ELES CONTINUAM CONFERINDO O CRACHÁ: `tramitarNaTransacao` e `receberNaTransacao` fazem
  // `autorizarNo` com a ação do processo. Quem some daqui não é a fechadura — é a casca.
  criarProcessoNaTransacao:
    "corpo comum da abertura de processo; não autoriza nada — quem chama já conferiu o crachá",
  tramitarNaTransacao: "corpo do trâmite, dentro de transação já aberta; ele mesmo autoriza TRAMITAR_PROCESSO",
  receberNaTransacao: "corpo do recebimento, dentro de transação já aberta; ele mesmo autoriza RECEBER_PROCESSO",
  // ── V11 V3.1 — a consulta do superávit (as três são LEITURA; nenhuma grava nada) ──
  //
  // ⚠️ ELAS FORAM EXPORTADAS PARA NÃO HAVER SEGUNDA ARITMÉTICA. `usadoDaDisponibilidade` já
  // existia como função interna do guard do M03; a consulta precisa do MESMO número que o guard
  // subtrai, e recalculá-lo na tela produziria um portal que diz um valor e um guard que recusa
  // por outro. Exportar uma leitura não a transforma em serviço de mutação — e é por isso que
  // elas entram aqui, com o motivo, em vez de ganharem ação no censo.
  usadoDaDisponibilidade:
    "LEITURA: soma LÍQUIDA (via `packages/estornaveis`) do quanto de uma disponibilidade de recurso novo já foi " +
    "consumido por decretos daquele exercício. É a mesma função que o guard do M03 subtrai dentro da transação " +
    "que grava o crédito; a consulta a reusa para mostrar o mesmo número antes do decreto ser escrito.",
  usosDoRecursoNovo:
    "LEITURA: as disponibilidades declaradas de uma origem num exercício, com o utilizado e os decretos que " +
    "consumiram cada fonte. Compõe as duas leituras acima; não grava nada.",
  // ── V11 V7.3 — a declaração versionada ──
  disponibilidadeVigente:
    "LEITURA: a declaração de maior versão de (exercício, fonte, origem). Exportada pelo mesmo motivo das de " +
    "cima — o guard do crédito, o serviço que declara e a consulta precisam TODOS da mesma definição de " +
    "'vigente', e três `orderBy versao desc` escritos à mão divergiriam no dia em que a regra mudasse. " +
    "Não grava nada; quem grava é `declararDisponibilidade`, que TEM ação no censo.",
  chaveDaDisponibilidade:
    "FUNÇÃO PURA: monta a chave estável do lock da disponibilidade (`exercicio:fonteId:origem`). Não toca banco " +
    "nem sessão. Existe exportada para que o guard do crédito e o serviço que declara travem o MESMO poste — " +
    "era o `id` da linha, e ele deixou de ser estável quando a declaração ganhou versões.",
  consultaDoSuperavit:
    "LEITURA: compõe o apurado dos FATOS (M12) com o declarado e o utilizado (M03) e devolve o disponível por " +
    "fonte, dizendo qual dos dois tetos limita. Nenhuma escrita.",
  // ── V11 V5.1 — a configuração do acesso à informação ──
  versoesDaConfiguracaoDoAcesso:
    "LEITURA: o histórico das versões publicadas da configuração do acesso à informação. Append-only; " +
    "nenhuma escrita.",
  configuracaoDoAcessoVigente:
    "LEITURA: resolve qual versão da configuração vale no dia civil informado. `null` é resposta — " +
    "sem configuração o sistema não promete data, e quem chama traduz isso em pendência nomeada.",
  // ── V11 V2.1 — a consistência da origem para o eSocial ──
  consistenciaDoESocial:
    "LEITURA: confronta o leiaute do eSocial REGISTRADO (fonte, sha256, conferente) com a origem de M32/M19/M14 e " +
    "devolve as pendências de cadastro. Não escreve, não corrige fato funcional e não gera arquivo nenhum — sem " +
    "pacote de leiaute registrado, devolve recusa nomeada.",
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
  registrarManifestacaoAnonima:
    "ATO PÚBLICO SEM CONTA (ouvidoria anônima): não há usuário a autorizar. As defesas são outras e estão no " +
    "corpo: serviço publicado da natureza MANIFESTACAO_ANONIMA, formulário da versão, quota por chave de origem, processo " +
    "SIGILOSO sem requerente e segredo guardado só por hash.",
  opinarSobreServico:
    "ATO PÚBLICO SEM CONTA (opinião geral sobre serviço da carta, Lei 13.460): sem usuário a autorizar; serviço publicado, " +
    "metodologia vigente, quota por chave de origem e uma raiz por token (revisão encadeada).",
  acompanharManifestacao:
    "LEITURA PÚBLICA pelo protocolo e pelo segredo (hash): projeção limitada à situação e às respostas liberadas.",
  resultadoPublicoDasAvaliacoes:
    "LEITURA PÚBLICA agregada: período, respostas, método e média por dimensão, por origem; sem autor nem comentário.",
  guiasEObrigacoesDaFolha:
    "LEITURA: o mapa das obrigações dos encargos por grupo (apurado, empenhado, liquidado, pago, restituição) e as guias " +
    "registradas com a situação derivada (recebida, baixada, cancelada). Não muta nada.",
  escopoDoProtocolo:
    "LEITURA: o escopo da consulta do protocolo (CONSULTAR_PROTOCOLO no ente e por unidade gestora) e as lotações — " +
    "a entrada da decisão de visibilidade do M21. Não muta nada.",
  podeAgirNoSetor:
    "LEITURA/GUARD: lotação no setor, ou a própria ação do ato concedida no ente sobre processo não sigiloso. " +
    "Chamada dentro da transação de cada ato do M21 (via `exigirLotacao`) e pela projeção da mesa.",
  gravarMedicaoNaTransacao:
    "composável interno: o corpo da medição de obra (período sem sobreposição, teto do valor vigente, trinco do contrato) " +
    "DENTRO da transação de um ato que já cobrou a ação — `registrarMedicao` e `registrarMedicaoPorItens` (que exige também " +
    "a designação de fiscal).",
  acompanhamentoDoContrato:
    "LEITURA: o dossiê interno do contrato — vigência, financeiro do M05, físico por item, designações, agenda, ocorrências " +
    "e medições. Quem lê é decidido pelo alcance (`alcanceNoContrato`): a visão de fiscalização só para designado ou " +
    "administrador da fiscalização; a financeira sem agenda, ocorrência nem evidência.",
  alcanceNoContrato:
    "LEITURA/GUARD: quem alcança o contrato e em qual projeção (fiscalização por designação vigente ou administrador da " +
    "fiscalização; financeira por leitura de licitações/despesa ou ato da despesa). Usada pela página, pelo anexo e pelos atos.",
  conferenciaDoPeriodoPorItens:
    "LEITURA/GUARD: o regime de período vigente no início da medição por itens (sem configuração, não confere: a " +
    "identidade é o saldo). Chamada dentro da transação da medição, que já cobrou a ação.",
  contratoTravado:
    "LEITURA/GUARD: o contrato sob o trinco (posto 5), com valor vigente e fim de vigência derivados — dentro da transação " +
    "de um ato do contrato acompanhado ou da ordem de serviço, que já cobrou a própria ação.",
  exigirDesignacao:
    "GUARD: a designação do usuário no papel (gestor, fiscal, recebedor definitivo), vigente no dia do ato e hoje, dentro da " +
    "transação de um ato que já cobrou a própria ação.",
  consumoDasParcelas:
    "LEITURA/GUARD: quanto de cada recebimento definitivo as liquidações vivas consumiram (estorno libera; anulação parcial " +
    "com várias parcelas não libera). Lida dentro da transação da liquidação e pela projeção.",
  conferirParcelasDaLiquidacao:
    "GUARD: confere as parcelas do contrato DENTRO da transação da liquidação do M05 (que já cobrou LIQUIDAR), sob o trinco " +
    "do contrato, antes de gravar: soma, documento de cobrança, empenho e credor, elegível.",
  gravarAlocacoesDaLiquidacao:
    "composável interno: grava as alocações da liquidação nas parcelas, no mesmo commit da liquidação do M05.",
  gravarAditivoNaTransacao:
    "composável interno: o corpo do registro de aditivo (supressão abaixo do empenhado, teto da dispensa, movimento) " +
    "dentro da transação de `registrarAditivo` ou de `registrarAditivoPorItens`, que já cobraram REGISTRAR_ADITIVO.",
  comprometidoPorItemDoContrato:
    "LEITURA/GUARD: a quantidade comprometida por item do contrato (ordens emitidas menos cancelado, medido sem ordem), " +
    "dentro da transação da emissão da ordem ou do aditivo por itens, que já cobraram a própria ação.",
  historicosDosItens:
    "LEITURA: as versões de quantidade e unitário de cada item pelos aditivos por itens vivos — dentro da transação dos " +
    "atos do contrato (que já cobraram a ação) e pelas leituras do dossiê já filtradas pelo alcance.",
  previaDePlanilha:
    "LEITURA: a prévia de importação da planilha orçamentária (análise, erros e divergências, sem o arquivo) — a página " +
    "que a mostra exige a leitura de licitações e contratos.",
  planilhasDaObra:
    "LEITURA: as versões da planilha orçamentária de uma obra — sob a leitura de licitações e contratos.",
  planilhaOrcamentaria:
    "LEITURA: uma versão da planilha orçamentária com itens e vínculos — sob a leitura de licitações e contratos.",
  simularTributo:
    "LEITURA PURA: resolve a versão do cadastro e a tabela vigentes no dia e calcula com a memória — não grava, não " +
    "lança, não constitui dívida e não escreve no ledger; a página exige a leitura da receita.",
  imovelPorInscricao:
    "LEITURA: o imóvel com as versões do cadastro e os vínculos — sob a leitura da receita.",
  versaoDoImovelNoDia:
    "LEITURA: a versão do cadastro que vale num dia — usada pela simulação e pela tela do imóvel.",
  vinculosDoImovelNoDia:
    "LEITURA: os vínculos de pessoa vigentes num dia, por papel e fração — usados pela simulação.",
  tabelaVigente:
    "LEITURA: a tabela de parâmetros do tributo que vale num dia (fórmula, fundamento e valores).",
  tiposDeOcorrenciaDoEnte:
    "LEITURA: os tipos de ocorrência do ente com a versão vigente do formulário — a tela de configuração e o formulário " +
    "da ocorrência, sob a leitura de licitações e o alcance do contrato.",
  agendaDaFiscalizacao:
    "LEITURA: os compromissos de fiscalização do período, com situação derivada, histórico e conflitos de horário — a " +
    "porta entrega só os contratos que a pessoa alcança.",
  conferirFormularioDaOcorrencia:
    "composável interno: confere tipo ativo, versão vigente, obrigatórias e formato das respostas dentro da transação de " +
    "`registrarOcorrencia`, que já cobrou REGISTRAR_OCORRENCIA_DE_FISCALIZACAO e a designação de fiscal.",
  versoesParaMedirAOrdem:
    "LEITURA: as versões de planilha do contrato da ordem com a conciliação de cada serviço — a página da ordem, sob o " +
    "alcance do contrato; o formulário só aparece ao fiscal designado, e o ato cobra de novo.",
  andamentoDaPlanilha:
    "LEITURA: o andamento físico da obra por serviço e as medições de ordem feitas pelas versões — sob a leitura de licitações e contratos.",
  gravarMedicaoDaOrdemNaTransacao:
    "composável interno: o núcleo da medição da ordem (período, vigência, suspensão, regime, ME06, autorizado) dentro da " +
    "transação de `registrarMedicaoDaOrdem` ou de `medirOrdemPelaPlanilha`, que já cobraram REGISTRAR_MEDICAO_DE_OBRA.",
  preCondicoesDaMedicaoDaOrdem:
    "PURA: pré-condições sem banco (período, repetição, quantidade positiva) da medição da ordem.",
  conciliarServico:
    "PURA: a conciliação de um serviço da planilha com o item do contrato e a ordem (vínculo único, unidade, item autorizado).",
  nomeEAto:
    "LEITURA: nome e ato da designação, dentro da transação dos atos da ordem que já cobraram a própria ação.",
  aditivosPorItensDoContrato:
    "LEITURA PÚBLICA: os aditivos por itens do contrato (termo, vigência, fundamento, variação, itens antes e depois) — " +
    "publicidade da alteração contratual; usada pela projeção pública e pelo dossiê.",
  nomeDoEnteNosDocumentos:
    "LEITURA PÚBLICA: o nome do ente para documentos (apresentação vigente, ou o nome oficial) — congelado no manifesto " +
    "dos documentos emitidos e usado pela impressão dos novos.",
  execucaoDoContrato:
    "LEITURA: as ordens de serviço do contrato com itens, saldos, medições, recebimentos e termos — na visão pedida " +
    "(fiscalização ou financeira), decidida antes pelo alcance.",
  contratosNoAlcanceDaFiscalizacao:
    "LEITURA: o recorte da lista de fiscalizações do usuário — contratos de designação vigente, ou todos para o administrador " +
    "da fiscalização vigente.",
  projecaoPublicaDoContrato:
    "LEITURA PÚBLICA: identificação, vigência, valores, aditivos, responsáveis vigentes (nome e ato) e execução física pelas " +
    "medições aprovadas. Sem ocorrência, evidência, conta ou documento de pessoa.",
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
  estatisticasDaPesquisa: "leitura derivada (médio/mínimo/máximo das cotações)",
  saldoDaOrdemDeCompra: "leitura derivada (quantidade − Σ recebido)",
  empenhadoLiquidoPorOrdem: "leitura derivada (Σ empenhos vivos da ordem, anulação copiando a FK)",
  situacaoDaSolicitacao: "leitura derivada dos movimentos",
  situacaoDoDocumentoFiscal: "leitura derivada dos movimentos (conferência/cancelamento/substituição)",
  saldoDoDocumentoFiscal: "leitura derivada (total − Σ liquidações vivas)",
  saldoDaConta: "leitura derivada (Σ das partidas com o sinal da natureza)",
  estadoDoBem: "leitura derivada (último movimento de cada eixo até uma data civil)",
  bensSobResponsabilidade: "leitura derivada",
  inconsistenciasDoInventarioDeBens: "leitura derivada",
  avaliarBemPorFormula: "leitura: CALCULA e não escreve — lançar é registrarReavaliacao",
  listarUnidadesDeMedida: "leitura (o rol que alimenta o formulário de material)",
  materiaisAbaixoDoMinimo: "leitura derivada (posição contra o mínimo)",
  requisicoesPendentes: "leitura derivada (Σ solicitado − Σ atendido)",
  validadeDoEstoqueDoDeposito: "leitura derivada (vencidos e a vencer)",
  posicaoDoMaterial: "leitura derivada (a posição é Σ dos movimentos até uma data civil)",
  fichaDeControleDeEstoque: "leitura derivada (movimentos do período + saldo anterior)",
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
  gerarConciliacaoBancaria: "leitura (gera o TXT SAGRES ConciliacaoBancaria §4.27 — não muta)",
  gerarConciliacaoBancariaOuRecusa: "leitura (o arquivo §4.27 ou a recusa nomeada da conciliação — não muta)",
  lerFatosConciliacaoBancaria: "leitura (o relatório de conciliação do M09 → DTO §4.27 — não muta)",
  gerarEstornoPagamento: "leitura (gera o TXT SAGRES EstornoPagamento §4.13 — não muta)",
  lerFatosEstornoPagamento: "leitura (Prisma → DTO EstornoPagamento, a anulação com o pagamento anulado — não muta)",
  gerarEstornos: "leitura (gera o TXT SAGRES Estornos §4.9, a anulação do empenho — não muta)",
  lerFatosEstornos: "leitura (Prisma → DTO Estornos, a anulação com o empenho anulado — não muta)",
  gerarEstornoLiquidacao: "leitura (gera o TXT SAGRES EstornoLiquidacao §4.11 — não muta)",
  lerFatosEstornoLiquidacao: "leitura (Prisma → DTO EstornoLiquidacao, a anulação com a liquidação anulada — não muta)",
  planoVigenteDoTribunal: "leitura (a tabela do plano de contas do Tribunal vigente no exercício — não muta)",
  gerarReceitaExtraOuRecusa: "leitura (o TXT SAGRES ReceitaExtra §4.19, ou a recusa nomeada — não muta)",
  gerarEstornoReceitaExtraOuRecusa: "leitura (o TXT SAGRES EstornoReceitaExtra §4.21, ou a recusa nomeada — não muta)",
  lerContasDoPlano: "puro (lê a planilha do Tribunal e confere cabeçalho, códigos e exigências — não toca o banco)",
  gerarEstornoRetencao: "leitura (gera o TXT SAGRES EstornoRetencao §4.15 — não muta)",
  lerFatosEstornoRetencao: "leitura (Prisma → DTO EstornoRetencao, o estorno da retenção do pagamento anulado — não muta)",
  gerarEstornoDespesaExtra: "leitura (gera o TXT SAGRES EstornoDespesaExtra §4.22 — não muta)",
  lerFatosEstornoDespesaExtra: "leitura (Prisma → DTO EstornoDespesaExtra, com o número do dispêndio estornado — não muta)",
  gerarReceitaOrcamentaria: "leitura (gera o TXT SAGRES ReceitaOrcamentaria — não muta)",
  lerFatosReceitaOrcamentaria: "leitura (Prisma → DTO ReceitaOrcamentaria, conta arrecadadora é param export — não muta)",
  gerarRetencao: "leitura (gera o TXT SAGRES Retencao §4.14 do M07 — não muta)",
  lerFatosRetencao: "leitura (Prisma → DTO Retencao: ingresso extra com pagamentoId — não muta)",
  // V25 — fornecedores e os relacionamentos do SAGRES.
  lerFatosRelacionamentoContaFonte: "leitura (Prisma → DTO RelacionamentoCCorrenteFontePagadora §4.24: o rol de fontes de cada conta — não muta)",
  gerarRelacionamentoContaFonte: "leitura (gera o TXT SAGRES RelacionamentoCCorrenteFontePagadora §4.24 — não muta)",
  lerFatosFornecedores: "leitura (Prisma → DTO Fornecedores §4.35: credores do dia e pessoas renomeadas no dia — não muta)",
  gerarFornecedores: "leitura (gera o TXT SAGRES Fornecedores §4.35 — não muta)",
  lerFatosRelacionamentoEmpenhoObra: "leitura (Prisma → DTO RelacionamentoEmpenhoObra §4.37 — não muta)",
  lerFatosRelacionamentoEmpenhoNatureza: "leitura (Prisma → DTO RelacionamentoEmpenhoNaturezaContratacao §4.46 — não muta)",
  lerFatosRelacionamentoLiquidacaoPagamento: "leitura (Prisma → DTO RelacionamentoLiquidacaoPagamento §4.58 — não muta)",
  gerarRelacionamentoEmpenhoObra: "leitura (gera o TXT SAGRES RelacionamentoEmpenhoObra §4.37 — não muta)",
  gerarRelacionamentoEmpenhoNatureza: "leitura (gera o TXT SAGRES RelacionamentoEmpenhoNaturezaContratacao §4.46 — não muta)",
  gerarRelacionamentoLiquidacaoPagamento: "leitura (gera o TXT SAGRES RelacionamentoLiquidacaoPagamento §4.58 — não muta)",
  gerarArquivosDeRelacionamentos: "leitura (gera os arquivos SAGRES de fornecedores e relacionamentos — não muta)",
  // V24 — o grupo dos restos a pagar do SAGRES; classificados na V25 (o censo ficou vermelho na V24).
  lerFatosPagamentosRestos: "leitura (Prisma → DTO PagamentosRestos §4.28: pagamentos de restos a pagar — não muta)",
  lerFatosEstornoPagamentoRestos: "leitura (Prisma → DTO EstornoPagamentoRestos §4.29 — não muta)",
  lerFatosCancelamentoRestos: "leitura (Prisma → DTO CancelamentoRestos §4.30 — não muta)",
  lerFatosLiquidacaoRestos: "leitura (Prisma → DTO LiquidacaoRestos §4.31: liquidação de restos não processados — não muta)",
  lerFatosEstornoLiquidacaoRestos: "leitura (Prisma → DTO EstornoLiquidacaoRestos §4.32 — não muta)",
  lerFatosRetencaoRestos: "leitura (Prisma → DTO RetencaoRestos §4.33: retenções em pagamento de restos — não muta)",
  lerFatosEstornoRetencaoRestos: "leitura (Prisma → DTO EstornoRetencaoRestos §4.34 — não muta)",
  lerFatosRestosInscritos: "leitura (Prisma → DTO RestosInscritos §4.40: inscrições do exercício — não muta)",
  gerarPagamentosRestos: "leitura (gera o TXT SAGRES PagamentosRestos §4.28 — não muta)",
  gerarEstornoPagamentoRestos: "leitura (gera o TXT SAGRES EstornoPagamentoRestos §4.29 — não muta)",
  gerarCancelamentoRestos: "leitura (gera o TXT SAGRES CancelamentoRestos §4.30 — não muta)",
  gerarLiquidacaoRestos: "leitura (gera o TXT SAGRES LiquidacaoRestos §4.31 — não muta)",
  gerarEstornoLiquidacaoRestos: "leitura (gera o TXT SAGRES EstornoLiquidacaoRestos §4.32 — não muta)",
  gerarRetencaoRestos: "leitura (gera o TXT SAGRES RetencaoRestos §4.33 — não muta)",
  gerarEstornoRetencaoRestos: "leitura (gera o TXT SAGRES EstornoRetencaoRestos §4.34 — não muta)",
  gerarRestosInscritos: "leitura (gera o TXT SAGRES RestosInscritos §4.40 — não muta)",
  gerarArquivosDeRestos: "leitura (gera os arquivos SAGRES do grupo dos restos a pagar da competência — não muta)",
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
  listarPropostasOrcamentarias: "leitura (as propostas orçamentárias com a contagem de linhas e a efetivação — não muta)",
  detalharPropostaOrcamentaria: "leitura (as linhas da proposta com base, projetado, ajustes e a situação do exercício de destino — não muta)",
  basesDasFichas: "leitura (a dotação inicial, autorizada ou empenhada de cada ficha pela soma dos movimentos — a base da proposta e da comparação; não muta)",
  basesDasReceitas: "leitura (a previsão inicial ou atualizada de cada receita prevista, com as reprevisões — não muta)",
  levantarFatosDoPlanejamento: "leitura (LDO, metas anuais vigentes, prioridades e o PPA que cobre o exercício — insumo da conferência da proposta; não muta)",
  itensDaDespesa: "leitura (as fichas de um exercício classificadas para a comparação — não muta)",
  itensDaReceita: "leitura (a receita prevista de um exercício, líquida, para a comparação — não muta)",
  compararExercicios: "leitura (dois exercícios lado a lado — não muta)",
  liquidadoDosEmpenhos: "leitura (V33 — liquidado líquido por empenho, em lote — não muta)",
  pagoDosEmpenhos: "leitura (V33 — pago bruto por empenho, contado por liquidação viva — não muta)",
  posicaoAPagar: "leitura (V33 — o que se deve por credor e obrigação, pela aritmética do M05 e do M08 — não muta)",
  ugDasUnidadesOrcamentarias: "leitura (V33 — de qual UG é cada unidade orçamentária no dia, pelo vínculo declarado — não muta)",
  janelaDoExercicio: "leitura (V33 — a janela (encerramento anterior, encerramento deste] dos demonstrativos — não muta)",
  parcelasDaReceitaRealizada: "leitura (V33 — guia × fonte com sinal, a base que o Anexo 12, o 13 e a DFC somam e a composição lista — não muta)",
  movimentosDeEmpenho: "leitura (V33 — cada movimento EMPENHO/EMPENHO_ANULADO com o empenho original, a base do empenhado do Anexo 13 — não muta)",
  execucaoPorEmpenho: "leitura (V33 — liquidado e pago de cada empenho pela régua dos estornáveis, a base do Anexo 12 — não muta)",
  restosPagosNaJanela: "leitura (V33 — pagamentos de restos a pagar de exercícios anteriores na janela, a base do Anexo 13 e da DFC — não muta)",
  composicaoDaLinha: "leitura (V33 — os documentos que formam uma linha do Anexo 12, do 13 ou da DFC — não muta)",
  criarFichaNaTransacao: "composável interno (o corpo da criação da ficha numa transação existente; quem chama autoriza antes: o repositório do `criarFicha` e a `efetivarPropostaOrcamentaria`)",
  listarReprevisoes: "leitura (histórico append-only de reprevisões de um exercício)",
  previsaoPorNaturezaFonte: "leitura",
  arrecadadoPorFonte: "leitura",
  arrecadadoPorNaturezaFonte: "leitura",
  arrecadadoPorCodigoAcompanhamento: "leitura (arrecadado por CO — base das emendas do RREO Anexo 3)",
  listarArrecadacoes: "leitura (as guias de um período e o total líquido das anulações — a tela da arrecadação)",
  listarNaturezasPrevistas: "leitura (o rol da LOA — o vocabulário que a tela oferece em vez de 8 dígitos de cabeça)",
  // ── M01/M04 V11 V9 — a entidade contábil. As três LEITURAS, e nenhuma grava. ──
  entidadesContabeis:
    "LEITURA. O rol de entidades contábeis do ente, cada uma com a VERSÃO VIGENTE dos seus " +
    "atributos (a de maior versão). Não grava; a tela cobra CONSULTAR_CADASTROS.",
  titularVigenteDaConta:
    "LEITURA. De quem é uma conta bancária HOJE — a declaração de maior versão. Não grava. É a " +
    "mesma projeção que o registro da guia usa para derivar o carimbo, de propósito: a tela não " +
    "pode anunciar um titular diferente do que a arrecadação vai carimbar.",
  arrecadadoPorEntidade:
    "LEITURA. O arrecadado do exercício por entidade titular, com o NÃO ATRIBUÍDO em linha " +
    "própria e total próprio. Não grava; a tela cobra CONSULTAR_RECEITA.",
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
  naturezaVigenteDaFonte: "leitura (a natureza declarada de UMA fonte — o discriminador da perna de classe 7 da arrecadacao)",
  listarNaturezasDeclaradas: "leitura (as naturezas de fonte vigentes, uma linha por fonte)",
  // V28 — a conta da liquidação por elemento (M01).
  contaDaLiquidacaoVigente: "leitura (a conta que a liquidação de UM elemento debita: rol fixo ou declaração do ente)",
  exigirContaDaLiquidacao: "guard (fail-closed antes da liquidação: elemento sem conta recusa nomeando onde declarar)",
  listarContasDaLiquidacao: "leitura (as contas de liquidação vigentes, uma linha por elemento)",
  consignacaoVigenteDaRubrica: "leitura (a consignação declarada para uma rubrica de desconto)",
  descontosDaFolhaPendentes: "leitura (os descontos dos contracheques que a liquidação cobre e que nenhum pagamento vivo reteve; recusa nomeando rubrica sem consignação)",
  exigirERegistrarDescontosDaFolhaNaTx: "composável interno (a perna do pagamento que confere e grava os descontos retidos; a autorização é a do PAGAR)",
  contaDaReceitaVigente: "leitura (a VPA declarada que cobre uma natureza de receita, pelo prefixo mais longo)",
  exigirContaDaReceita: "guard (fail-closed antes da arrecadação: natureza sem VPA declarada recusa nomeando onde declarar)",
  listarContasDaReceita: "leitura (as declarações de VPA vigentes, uma por prefixo)",
  saldoAIncorporarDaLiquidacao: "leitura (o líquido de uma liquidação menos o já incorporado ao patrimônio; o teto de adquirirBem confere o mesmo dentro da trava)",
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
  listarContasBancarias: "leitura (as contas bancárias e a fonte de cada uma — o select do pagamento)",
  listarEmpenhos: "leitura (a execução de um exercício/unidade com os saldos da TR 5.17 — a tela de empenhos)",
  listarLiquidacoes: "leitura (as liquidações com o empenho de origem — a tela de liquidações)",
  listarPagamentos: "leitura (os pagamentos executados de um exercício/unidade — a tela de anulação)",
  listarOrdensDePagamento:
    "leitura (as ordens de pagamento de um exercício/unidade, com as quatro etapas de T07 — a tela)",
  liquidacoesParaOrdem:
    "leitura (as liquidações que ainda comportam ordem — o vocabulário do formulário)",
  exigirOrdemAutorizada:
    "guard (T07 — confere, DENTRO da transação do pagamento, que a ordem está AUTORIZADA, é da mesma liquidação e tem o valor exato; não abre transação e não pede permissão própria — quem paga já pediu a dele)",
  exigirSolicitacaoParaEmpenho:
    "guard (V22 — confere, DENTRO da transação do empenho e sob a trava da solicitação, que ela está AUTORIZADA, não foi empenhada e casa com o empenho; não abre transação e não pede permissão própria — quem empenha já pediu EMPENHAR)",
  listarSolicitacoesDeEmpenho:
    "leitura (as solicitações de empenho de um exercício/unidade, com a situação derivada — a tela)",
  empenhadoLiquidoDoConvenio:
    "leitura derivada (V22 — Σ dos empenhos vivos do convênio, com a anulação copiando a FK)",
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
  lancamentosDaContaBancaria: "leitura (V22: os fatos do razão atribuídos a UMA conta bancária pelo lançamento de origem — não muta)",
  reservarNumero: "composável interno (V22: reserva o número do documento que o SISTEMA numera — folha e encargos — dentro do ato já autorizado que o chama; não é ato do usuário e não lança nada)",
  exigirUsoDoNumero: "guard (V22: o número reservado só é usado com a chave de quem o reservou — roda dentro das escritas do M05 já autorizadas)",
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
  // V24 — retenção calculada: leituras (tabelas vigentes, perfil vigente, avaliação) e o preparo
  // das retenções, que roda sob a autorização PAGAR do pagamento que as usa.
  perfilFiscalVigente: "leitura (perfil fiscal vigente do fornecedor)",
  tabelasVigentes: "leitura (tabelas normativas da retenção na data)",
  avaliarRetencoesDoPagamento: "leitura (prévia do cálculo, nada grava)",
  prepararRetencoesCalculadas: "composável interno (perna do pagar; autoriza PAGAR)",
  registrarCalculosDaRetencao: "composável interno (perna do pagar)",
  fapVigente: "leitura (o FAP aprovado do ano, dentro da apuração que a autoriza)",
  estornarRetencoesDoPagamento: "composável interno",
  registrarMovimentoDotacao: "composável interno",
  // M05 V21 — o estorno EXATO de um movimento de dotação: chamado DENTRO de `anularRealocacao`, que
  // é quem autoriza. Sozinho ele não é ato de ninguém.
  estornarMovimentoDotacao: "composável interno",
  // M03 V21 — a LEITURA dos atos de realocação do exercício, com as pernas. Não muta.
  listarRealocacoes: "leitura",
  // M02 V21 — as unidades com a declaração vigente, para a tela. Não muta.
  unidadesComDeclaracao: "leitura",
  gerarUnidadeOrcamentaria: "leitura (gera o TXT SAGRES UnidadeOrcamentaria §4.1 — não muta)",
  gerarUnidadeOrcamentariaOuRecusa: "leitura (o arquivo §4.1 ou a recusa nomeada — não muta)",
  lerFatosUnidadeOrcamentaria: "leitura (a unidade com a declaração vigente no fim do mês → DTO §4.1 — não muta)",
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
  arrecadarComVinculo: "composável interno (a composta arrecadação + vínculo)",
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
  // ── M08 V20 — a LEITURA das contas de controle na virada ──
  // ⚠️ Nao muta: soma o razao das classes 5 e 6 no corte e junta a classificacao que cada conta ja
  // tem. Quem pode ler isso e decisao de escopo de leitura (CONSULTAR_CONTABILIDADE), nao uma acao
  // concedivel. A ESCRITA e que esta no censo: PARAMETRIZAR_VIRADA_DOS_CONTROLES.
  contasDaVirada: "leitura (as contas das classes 5 e 6 com saldo no corte, com a classificacao de cada uma — nao muta)",
  //
  // ── M12 V19/C05 — as LEITURAS do custo por centro ──
  // ⚠️ Nenhuma delas muta: o custo é um acúmulo das partes JÁ gravadas pela apropriação. Quem
  // pode ler custo é decisão de escopo de leitura (a política de 4.1), não uma ação concedível —
  // seria um rol que ninguém administra. A ESCRITA é que está no censo: PARAMETRIZAR_RATEIO_DE_CUSTO
  // e APROPRIAR_CUSTO.
  custoPorCentro: "leitura (soma as partes gravadas por centro na janela de competência — não muta)",
  composicaoDoCentro: "leitura (a composição que volta ao fato: liquidação, empenho e credor — não muta)",
  criteriosDeRateio: "leitura (os critérios publicados, com a marca do vigente — não muta)",
  centrosDeCusto: "leitura (o rol curto de setores ativos que o formulário do critério oferece)",
  criterioVigenteDeRateio: "leitura (resolve a versão vigente de uma chave numa data — composável interno do apropriar)",
  // ── V22 — leituras exportadas para reuso entre demonstrativos (BF, BO, DFC), o seletor de
  // ordens do empenho e a lista de comprovantes da liquidação. Nenhuma muta; a leitura é
  // autorizada na porta que as chama (CONSULTAR_CONTABILIDADE / CONSULTAR_DESPESA por unidade).
  lerDespesas: "leitura (empenhado, liquidado e pago do Balanço Orçamentário, reusada pela DFC — não muta)",
  demonstracaoFluxosDeCaixa: "leitura (a DFC sobre os mesmos fatos do Balanço Financeiro — não muta)",
  apurarCaixa: "leitura (o caixa pelas partidas de disponibilidade na janela — não muta)",
  lerDepositos: "leitura (retenções e depósitos recebidos e devolvidos na janela — não muta)",
  empenhadoLiquidoDaCampanha: "leitura (o empenhado líquido de anulações de uma campanha publicitária — V22, composável do seletor e da lista)",
  empenhadoLiquidoDaOrdem: "leitura (o empenhado líquido de anulações de uma ordem de compra — composável do empenhar e do seletor)",
  situacaoDosEmpenhos: "leitura (a situação de cada empenho do exercício para os restos a pagar — composável do encerramento e do BF parcial)",
  listarAnexosDasLiquidacoes: "leitura (os comprovantes das liquidações autorizadas pela porta — não muta)",
  lerDadosDaLoa: "leitura (dotação inicial das fichas e previsão inicial da receita do exercício — não muta)",
  loaDoExercicio: "leitura (a LOA e os anexos da Lei 4.320 montados sobre os dados já registrados — demonstrativo, não muta)",
  //
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
  listarAnexosDosDecretos: "leitura (os PDFs dos decretos de crédito; a área é da porta, CONSULTAR_PLANEJAMENTO no ente — V26)",
  listarAnexosDaLeiOrcamentaria: "leitura (os anexos da LOA — projeto, lei e anexos da lei; a área é da porta, CONSULTAR_PLANEJAMENTO no ente — V22)",
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

  // ── M35 — o licenciamento comercial (V10 T1) ──
  lerLicenciamento:
    "LEITURA do contrato desta implantação, das habilitações e do histórico. Não muta nada. " +
    "A porta que a serve cobra CONSULTAR_LICENCIAMENTO, ação reservada ao fornecedor.",
  situacaoDoModuloNaImplantacao:
    "LEITURA de uma linha — é o GATE. Ele não pode cobrar permissão: é chamado ANTES de saber " +
    "qual ação está sendo tentada, dentro do envelope de escrita e da política de leitura. " +
    "Cobrar autorização aqui seria recursão.",
  licenciamentoInstalado:
    "LEITURA de contagem: 'esta implantação tem contrato?'. É o que distingue 'não instalado' " +
    "de 'não contratado' na mensagem que o operador lê.",
  // ── M34 B2 — as leituras do lançamento tributário e da certidão (V10 T2) ──
  historicoDaDivulgacao:
    "LEITURA do histórico da política de divulgação de uma localização. Não muta nada; a tela " +
    "que a serve cobra CONSULTAR_PATRIMONIO.",
  lotesDeLancamento: "LEITURA dos lotes com o placar de cada um. Não muta nada; a tela cobra CONSULTAR_RECEITA.",
  lancamentosDoLote: "LEITURA dos lançamentos de um lote, com memória, responsáveis e vencimentos. Não muta nada.",
  lancamentosVivosDoImovel: "LEITURA da ficha tributária do imóvel — os lançamentos ainda em aberto. Não muta nada.",
  levantarCobertura:
    "LEITURA que consulta cada base fiscal e diz como ela respondeu. É o insumo da certidão e " +
    "não grava: quem grava é `solicitarCertidao`, que a chama.",
  configuracaoVigente: "LEITURA da configuração de certidão que vale num dia. Não muta nada.",
  conferirAutenticidade:
    "LEITURA PÚBLICA e mínima, pela chave não enumerável. Não muta nada e não cobra sessão por " +
    "desenho — o que a protege é devolver só protocolo, tipo, titular com documento mascarado e " +
    "validade, nunca o extrato de débitos.",
  instalarLicenciamento:
    "ATO DE INSTALAÇÃO, como o bootstrap do primeiro usuário: roda fora da aplicação, por quem " +
    "opera o servidor, e é inerte quando já existe contrato. Não há sessão para autorizar — o " +
    "gate que ele instala é justamente o que ainda não existe quando ele roda.",
  retidoPorPagamento: "leitura (V36 — o retido vivo de cada pagamento, para o líquido do relatório; não muta)",
  pagamentosEfetuados: "leitura (V36 — o relatório de pagamentos efetuados do exercício e de restos; não muta)",
  listarIngressosAvulsos: "leitura (V36 — os ingressos extraorçamentários avulsos, com o estorno; não muta)",
  proximoNumeroLivre: "leitura (o número sugerido ao formulário do empenho, da liquidação e da anulação; quem reserva continua sendo reservarNumero, na transação; não muta)",
  arrecadadoPorFonteMesAMes: "leitura (V36 — a receita arrecadada mês a mês por fonte, composta de arrecadadoPorNaturezaFonte; não muta)",
  dispendiosEfetuados: "leitura (V36 — os dispêndios extraorçamentários do período, com o estorno descontado, para o relatório de pagamentos; não muta)",
  contasContabeisDeDisponibilidade: "leitura (V36 — as contas analíticas do grupo 1.1.1 que o cadastro da conta bancária oferece; não muta)",
  lerExtratoImportado: "leitura (V36 — as linhas de um extrato importado, com a situação derivada dos vínculos, para consulta e impressão; não muta)",
};
