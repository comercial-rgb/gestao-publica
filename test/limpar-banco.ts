import type { PrismaClient } from "../prisma/generated/client/client.js";
import { semearUsuariosDeTeste } from "./usuarios-teste.js";
import { semearLicenciamentoDeTeste } from "./licenciamento-teste.js";

/**
 * Limpeza do banco de TESTE, compartilhada por toda a suíte de integração.
 *
 * POR QUE ISTO EXISTE: cada módulo tinha seu próprio `beforeEach` com uma
 * sequência de `deleteMany` na ordem das FKs. Quando o M05 chegou e o `Empenho`
 * passou a referenciar `LancamentoContabil` com RESTRICT, os testes do M01, M02
 * e M04 quebraram — eles apagavam o lançamento sem saber que existia um empenho
 * pendurado nele. Cada módulo novo quebraria os anteriores da mesma forma.
 *
 * `TRUNCATE ... CASCADE` é INDEPENDENTE DE ORDEM: o Postgres resolve o grafo de
 * FKs sozinho. Ao criar uma tabela nova, acrescente-a à lista — e só.
 *
 * Só rode isto contra o banco de TESTE (o guarda-chuva de `db-teste.ts` garante
 * que a suíte nunca alcança o de dev).
 */
export const TABELAS = [
  // ── ENT02 — M21 protocolo · M22 documentos · M23 comunicação · M24 notificações ──
  // ── M27 ajuda e suporte ──
  "PesquisaDeSatisfacao",
  "MovimentoDoChamado",
  "Chamado",
  "NivelDeSeveridade",
  "AjudaDeRota",
  // ── M26 designer de relatórios ──
  "ResultadoDaExecucao",
  "MovimentoDaExecucao",
  "ExecucaoDeRelatorio",
  "DistribuicaoDeModelo",
  "RetiradaDeModelo",
  "ColunaDoModelo",
  "ModeloDeRelatorio",
  // ── M25 campos adicionais ──
  "ValorDeCampoAdicional",
  "OpcaoDeCampoAdicional",
  "DefinicaoDeCampoAdicional",
  // A ordem aqui é irrelevante (TRUNCATE CASCADE resolve o grafo), mas a lista tem de
  // ser COMPLETA: uma tabela esquecida faz o processo 1/2026 de um teste sobreviver ao
  // seguinte, e a numeração — que reinicia por exercício — passa a começar em 2.
  "Notificacao",
  "MovimentoDoComunicado",
  "DestinatarioDoComunicado",
  "TagAplicadaAoComunicado",
  "TagDeComunicado",
  "Comunicado",
  "TipoDeComunicadoPorSetor",
  "TipoDeComunicado",
  "AssinaturaDeDocumento",
  "SignatarioDaFila",
  "FilaDeAssinatura",
  // ── V7 B1 (cadastro imobiliário e parâmetros do tributo) ──
  "ParametroTributario",
  "TabelaDeParametrosTributarios",
  "EncerramentoDoVinculoComImovel",
  "VinculoDePessoaComImovel",
  "AtributoDaVersaoDoImovel",
  "VersaoDoImovel",
  "Imovel",
  // ── V7 M2 U8 (agenda e formulários da fiscalização) ──
  "RespostaDoFormularioDeOcorrencia",
  "PerguntaDoFormularioDeOcorrencia",
  "MudancaDeSituacaoDoTipoDeOcorrencia",
  "RealizacaoDeFiscalizacao",
  "CancelamentoDeFiscalizacao",
  "ReagendamentoDeFiscalizacao",
  // ── V7 M2 (ponte contratual) ──
  // U7 — a medição da ordem pela planilha e o estorno da medição (antes do vínculo, do item da planilha e da medição).
  "ItemMedidoDaOrdemNaPlanilha",
  "MedicaoDaOrdemNaPlanilha",
  "EstornoDeMedicaoDaOrdem",
  "RevogacaoDeVinculoDaPlanilha",
  "VinculoDeItemDaPlanilhaAoContrato",
  "ItemDaPlanilhaOrcamentaria",
  "PlanilhaOrcamentariaDaObra",
  "PreviaDePlanilhaOrcamentaria",
  // A obra sem órgão escapava da limpeza (só caía pela cascata do Orgao): a planilha cria obra sem órgão.
  "Obra",
  "EstornoDeAditivoPorItens",
  "AlteracaoDeItemPorAditivo",
  "AditivoPorItensDoContrato",
  "AlocacaoDaLiquidacaoNaParcela",
  "ItemRecebidoDefinitivamente",
  "RecebimentoDefinitivo",
  "DecisaoDeControversia",
  "ConferenciaDoItemMedido",
  "RecebimentoProvisorio",
  "ItemMedidoNaOrdem",
  "MedicaoDaOrdemDeServico",
  "MovimentoDeExecucaoDaOrdem",
  "CancelamentoDeSaldoDaOrdem",
  "DescarteDaOrdemDeServico",
  "EmissaoDaOrdemDeServico",
  "ItemDaOrdemDeServico",
  "OrdemDeServicoDoContrato",
  "RegimeDeMedicaoDoContrato",
  "RevogacaoDeAdministradorDaFiscalizacao",
  "AdministradorDaFiscalizacao",
  // ── V7 M2.1 — o contrato acompanhado ──
  "AprovacaoDeMedicao",
  "ItemMedido",
  "MedicaoPorItens",
  "ResolucaoDeOcorrencia",
  "OcorrenciaDeFiscalizacao",
  "OrdemDeFiscalizacao",
  "VersaoDoTipoDeOcorrencia",
  "TipoDeOcorrenciaDoEnte",
  "ItemDoContrato",
  "RevogacaoDeDesignacaoNoContrato",
  "DesignacaoNoContrato",
  // ── V7 M1 U4 — a ouvidoria sem conta e a avaliação dos serviços ──
  "RemocaoDeAvaliacao",
  "AvaliacaoDeServico",
  "MetodologiaDeAvaliacao",
  "EnvioPublicoSemConta",
  "RespostaDaOuvidoria",
  "TriagemDaManifestacao",
  "ManifestacaoDeOuvidoria",
  // ── V6.2 P3 — a carta de serviços, as solicitações e a representação ──
  "AnexoDaSolicitacao",
  "DecisaoDaSolicitacao",
  "PropostaDeAlteracaoCadastral",
  "SolicitacaoDeServico",
  "PublicacaoDoServico",
  "VersaoDoServico",
  "ServicoDaCarta",
  "RevogacaoDeRepresentacao",
  "RepresentacaoDePessoa",
  "Anexo",
  "MovimentoDaTaxa",
  "TaxaDoProcesso",
  "MovimentoDeApensamento",
  "MovimentoDoProcesso",
  "RequerenteAdicionalDoProcesso",
  "EtapaDoProcesso",
  "Processo",
  "EtapaDoRoteiro",
  "Subassunto",
  "Assunto",
  "UsuarioDoSetor",
  "Setor",
  // Orquestração V3 (4.2) — o registro das atualizações versionadas de permissões. Sem
  // truncar, a v1 aplicada por um teste "já estaria aplicada" para o seguinte.
  "AtualizacaoDePermissoes",
  // V3 (pacote 2) — o vínculo usuário↔pessoa (append-only).
  "VinculoUsuarioPessoa",
  // M18 — SAGRES Captura 2.0: execução de submissão
  "ExecucaoCaptura",
  // M20 — importadores: tem `arquivoHash` ÚNICO. Sem truncar, o hash de um teste vaza para o
  // seguinte e a idempotência recusa a PRIMEIRA importação (lição do S7).
  "ImportacaoArquivo",
  // M09 — transferência entre contas (TR 5.61)
  "TransferenciaEntreContas",
  // M02 — programação financeira: CMD, MBA, limitação (TR 4.18/4.43/4.44)
  "CotaCmd",
  "VersaoCmd",
  "MetaMba",
  "VersaoMba",
  "LiberacaoProgramacao",
  "EventoLimitacaoEmpenho",
  "TemplateDecreto",
  // M16 — autenticação e registro de operação (TR 4.55 · 6.1-6.3)
  "RegistroDeOperacao",
  "ComandoDeBorda",
  "TentativaDeLogin",
  "SessaoRevogada",
  "SessaoAberta",
  "CredencialDeUsuario",
  // M16 — travamento, usuários, perfis e permissões (TR 4.52-4.56)
  "MovimentoTravamento",
  "VinculoUsuarioPerfil",
  "PermissaoDePerfil",
  "Perfil",
  "Usuario",
  // M05 — roteiro do subsistema orçamentário
  "RoteiroOrcamentario",
  // M05 V8.9 — o eixo da dotação adicional, e o roteiro do ramo por fonte
  "PoliticaDaDotacaoAdicional",
  "RoteiroDaDotacaoPorFonte",
  // ⚠️ AS TRÊS QUE O GUARD DA V8.9 ENCONTROU — e elas estavam de fora há lotes.
  //
  // Nenhuma tem chave estrangeira para tabela nenhuma, então o `TRUNCATE ... CASCADE` (que é o
  // que limpa a maior parte do schema sem estar nesta lista) nunca chegava nelas: o de-para do
  // SIGA e a certidão de fornecedor de um teste sobreviviam ao arquivo seguinte. Ver
  // `limpeza-do-banco-completa.test.ts`, que afirma o ALCANCE — lista mais fecho do CASCADE —
  // em vez de confiar em quem cria tabela lembrar desta lista.
  "CertidaoFornecedor",
  "DeParaContaSiga",
  "DeParaFonteSiga",
  // ── M10 — o histórico da política de divulgação de localização (V10 T3) ──
  "MudancaDaDivulgacaoDaLocalizacao",
  // ── M34 B2 — lançamento tributário e certidão (V10 T2) ──
  "BaseConsultadaNaCertidao",
  "SolicitacaoDeCertidao",
  "VersaoDaConfiguracaoDaCertidao",
  "CorrecaoDoLancamento",
  "ConstituicaoDoLancamento",
  "VencimentoDoLancamento",
  "ResponsavelPeloLancamento",
  "LancamentoTributario",
  "LoteDeLancamentoTributario",
  // ── M35 — licenciamento comercial (V10 T1). Antes do EnteConfig na lista por clareza; a
  // ordem é irrelevante (TRUNCATE CASCADE resolve o grafo), a COMPLETUDE não é. ──
  "EventoDeLicenciamento",
  "HabilitacaoDeModulo",
  "ContratoComercial",
  // M14 — exports federais (config do ente e matriz de ICs exigidas)
  "EnteConfig",
  "IcExigidaPorConta",
  // M21 — a configuracao do acesso a informacao (V11 V5.1). Nasce vazia em producao, e e assim que
  // os testes tem de encontra-la: uma configuracao deixada por um arquivo de teste faria o seguinte
  // medir prazo contra uma norma que ele nao publicou.
  "VersaoDaConfiguracaoDoAcessoAInformacao",
  // M14 — eSocial (V11 V2.1): o REGISTRO do leiaute. Nascem vazias em produção e é assim que os
  // testes têm de encontrá-las — um pacote deixado por um arquivo de teste faria o seguinte medir
  // consistência contra um leiaute que ele não registrou.
  "LeiauteDoESocial",
  "EventoDoLeiaute",
  "CampoDoEvento",
  // M14 — MANAD (registros 0050 e 0100)
  "ManadContabilista",
  "VersaoDaApresentacaoDoEnte",
  "ManadEmpresaGeradora",
  // M12 — mapeamento dos demonstrativos (parametrização)
  "PrefixoDaLinha",
  "LinhaDemonstrativo",
  // M10 — almoxarifado e provisões
  // ── ENT05 — M11 A COMPRA (TR 5.17) ──
  "MovimentoDoDocumentoFiscal",
  "ItemDeDocumentoFiscal",
  "DocumentoFiscalRecebido",
  "AlocacaoDeSolicitacaoNaOrdem",
  "MovimentoDaOrdemDeCompra",
  "RecebimentoDeItem",
  "RecebimentoDeOrdem",
  "ItemDeOrdemDeCompra",
  "OrdemDeCompra",
  "CotacaoDePreco",
  "ItemDePesquisaDePrecos",
  "PesquisaDePrecos",
  "MovimentoDaSolicitacao",
  "ItemDeSolicitacaoDeCompra",
  "SolicitacaoDeCompra",
  "MaterialElementoDespesa",
  "MaterialMarca",
  "MarcaAprovada",
  // ── ENT05 ITEM 3 — o repontamento de conta ──
  "MigracaoDeConta",
  // ── ENT05 — M10 patrimônio, EIXO DE GESTÃO (TR 5.19) ──
  "ItemDeTermoPatrimonial",
  "TermoPatrimonial",
  "ContagemDeBem",
  "InventarioDeBens",
  "MovimentoDeGestaoDoBem",
  "MembroDeComissaoPatrimonial",
  "ComissaoPatrimonial",
  "LocalizacaoFisica",
  "FormulaDeAvaliacao",
  "MotivoDeBaixa",
  "TipoDeIncorporacao",
  // ── ENT05 — M10 almoxarifado, EIXO FÍSICO (TR 5.18) ──
  "ContagemDeInventario",
  "InventarioDeEstoque",
  "BloqueioDeEstoque",
  "CotaDeConsumo",
  "MovimentoFisicoDeEstoque",
  "ItemDeRequisicaoDeMaterial",
  "RequisicaoDeMaterial",
  "LoteDeMaterial",
  "ParametroDeEstoque",
  "MaterialUnidade",
  "Material",
  "GrupoDeMaterial",
  "UnidadeDeMedida",
  "Deposito",
  "MovimentoAlmoxarifado",
  "RoteiroAlmoxarifado",
  "ClasseDeMaterial",
  "MovimentoProvisao",
  "RoteiroProvisao",
  "ProvisaoMatematica",
  // M10 — dívida ativa
  "MovimentoDividaAtiva",
  "RoteiroDividaAtiva",
  "DividaAtiva",
  // M10 — dívida consolidada
  "MovimentoDivida",
  "RoteiroDivida",
  "DividaConsolidada",
  // M11 — licitações e contratos
  "MovimentoContratual",
  "Contrato",
  "HomologacaoProcesso",
  "ProcessoLicitatorio",
  "LimiteContratacao",
  // M02b — planejamento plurianual (V4 §8): filhos antes dos pais, por legibilidade (o CASCADE resolve)
  "AplicacaoAlienacaoLdo",
  "AlienacaoBemLdo",
  "MargemExpansaoLdo",
  "ProjecaoAtuarialRpps",
  "DividaConsolidadaLdo",
  "RenunciaReceitaLdo",
  "RiscoFiscal",
  "MetaAnualLdo",
  "PrioridadeLdo",
  "LeiDiretrizesOrcamentarias",
  "ReceitaAnteriorPpa",
  "PrevisaoReceitaPpa",
  "AcaoPpa",
  "IndicadorPrograma",
  "ProgramaPpa",
  "Macroacao",
  "PublicoAlvo",
  "AreaTematica",
  "EixoEstruturante",
  "PlanoPlurianual",
  // M10 — patrimonial
  "MemoriaDeAtualizacao",
  "ExecucaoDeAtualizacao",
  "VersaoDeParametroDeAtualizacao",
  "MovimentoPatrimonial",
  "BemPatrimonial",
  "RoteiroPatrimonial",
  "ClasseDeBens",
  // M09 — tesouraria (extrato + conciliação)
  "VinculoConciliacao",
  "AtribuicaoDeContaDaArrecadacao",
  // V11 V9 — a entidade contábil. ⚠️ AS TRÊS FILHAS AQUI, A MÃE LÁ EMBAIXO: estas apontam para
  // `ReceitaArrecadada` e `ContaBancaria`, e por isso saem ANTES delas; `EntidadeContabil` é
  // apontada por `ReceitaArrecadada`, e por isso sai DEPOIS. Juntar as quatro num bloco só
  // quebraria a FK numa ponta ou na outra.
  "AtribuicaoDeEntidadeDaArrecadacao",
  "DeclaracaoDeTitularDaConta",
  "VersaoDaEntidadeContabil",
  // V6 P2 — M32 pessoal (filhas antes das mães)
  "ProrrogacaoContratoTrabalho",
  "ContratoTrabalho",
  "AvaliacaoExperiencia",
  // M33 folha (V6 P2.3) — filhas antes das mães
  // V6.1 — a certificação (atesto) e a liquidação da folha
  // V6.2 — os encargos do empregador
  // V7 M1 U3 — o ajuste para baixo e a guia de recolhimento
  "CancelamentoDaGuia",
  "BaixaDaGuia",
  "GuiaDeRecolhimento",
  "AjusteDosEncargos",
  "LiquidacaoDosEncargos",
  "EmpenhoDosEncargos",
  "CertificacaoDosEncargos",
  "ApuracaoDeEncargos",
  "ComponenteDoGrupoDeEmpenho",
  "AprovacaoDoEncargo",
  "IncidenciaDoEncargo",
  "VersaoDoEncargo",
  "ComponenteDeEncargo",
  "LiquidacaoDaFolha",
  "CertificacaoDaFolha",
  "RevogacaoDeDesignacao",
  "DesignacaoNaFolha",
  "EmpenhoDaFolha",
  "ApropriacaoDaFolha",
  "RubricaDoGrupoDeEmpenho",
  "GrupoDeEmpenhoDaFolha",
  "LinhaDoContracheque",
  "Contracheque",
  "FechamentoDaFolha",
  "CancelamentoDoCalculo",
  // V11 V9.5 — o FATO de abrangência vem ANTES do cálculo, e a ausência dele aqui não era
  // cosmética: `AbrangenciaDoCalculo_calculoId_fkey` é RESTRICT, então `limparBanco` falhava ao
  // apagar `CalculoDaFolha` e o `beforeEach` derrubava o teste seguinte com um erro de FK que não
  // fala do assunto nenhum — três casos de `m33-versao-da-rubrica` vermelhos por isso. É a mesma
  // armadilha que `FuncaoDePessoal` já tinha armado: tabela nova que nenhum compilador cobra daqui.
  "AbrangenciaDoCalculo",
  "CalculoDaFolha",
  "FolhaDePagamento",
  "LancamentoDaFolha",
  // V11 V4.2 — a coluna declarada vem antes da política (FK).
  "ColunaPublicadaDePessoal",
  "PoliticaDePublicacaoDePessoal",
  // V11 V9.1 — o parâmetro do 13º: a FILHA antes da MÃE, e as duas antes de `Rubrica`.
  // `RubricaDaBaseDoDecimoTerceiro` aponta para `ParametroDoDecimoTerceiro` e para `Rubrica`; o
  // parâmetro aponta para `Rubrica` três vezes (13º, adiantamento e abatimento). Sem as duas
  // aqui, `limparBanco` no `beforeEach` deixaria o parâmetro do caso anterior de pé — e o teste
  // da "versão vigente" passaria pelo motivo errado, lendo a versão de outro caso.
  "RubricaDaBaseDoDecimoTerceiro",
  "ParametroDoDecimoTerceiro",
  // ⚠️ V13 — O PARÂMETRO DO ADIANTAMENTO SALARIAL VEM ANTES DE `Rubrica`, e nenhum compilador
  // cobra esta linha. Ele aponta para `Rubrica` DUAS vezes (adiantamento e abatimento) com FK
  // RESTRICT: sem ele aqui, `limparBanco` falharia ao apagar `Rubrica` e o `beforeEach`
  // derrubaria o teste SEGUINTE com um erro de FK que não fala do assunto nenhum — a mesma
  // armadilha que `AbrangenciaDoCalculo` e `FuncaoDePessoal` já armaram nesta suíte.
  "ParametroDoAdiantamentoSalarial",
  // V11 V1.1 — as versões e as dependências vêm antes da rubrica (FK).
  "DependenciaDaVersaoDaRubrica",
  "VersaoDaRubrica",
  "Rubrica",
  "FaixaIrrf",
  "TabelaIrrf",
  "FaixaDeContribuicao",
  "TabelaDeContribuicao",
  "TabelaSalarioFamilia",
  "AnotacaoServidor",
  "HistoricoVinculo",
  "EncerramentoDeFinalidadeDependente",
  "FinalidadeDependente",
  "Dependente",
  "Treinamento",
  "Portaria",
  "Vinculo",
  "Servidor",
  "CalendarioRh",
  "Lotacao",
  "Cargo",
  // ⚠️ V11 V9.4 — a FUNÇÃO DE PESSOAL (TR 5.12.50). A ausência dela aqui NÃO dá erro de
  // compilação nem de schema: dá um segundo teste que falha por `codigo` duplicado, porque a
  // fixture do primeiro sobreviveu ao `beforeEach`. Foi assim que ela foi descoberta — doze
  // testes vermelhos num arquivo cujo primeiro caso passava.
  "FuncaoDePessoal",
  "LancamentoExtrato",
  "ExtratoBancario",
  // M07 — extraorçamentário
  "MovimentoExtraorcamentario",
  "TipoConsignacao",
  // M08 — exercício / restos a pagar
  "RoteiroEncerramento",
  "ContaNaVirada",
  "MovimentoRestosAPagar",
  "InscricaoRestosAPagar",
  "EncerramentoExercicio",
  "Exercicio",
  // M06 — ordem cronológica
  "JustificativaQuebraOrdem",
  // M03 — créditos adicionais
  "ItemCredito",
  "DecretoEncerramento",
  "DecretoCredito",
  "LeiCredito",
  "DisponibilidadeRecursoNovo",
  // M05 — despesa
  "Pagamento",
  "Liquidacao",
  "ContaBancaria",
  "MovimentoDotacao",
  "ReservaEmpenho",
  "Empenho",
  "ReservaDotacao",
  // M04 — receita
  "ReceitaArrecadada",
  "TipoLancamentoReceitaSagres",
  // V11 V9 — a MÃE, depois de `ContaBancaria` e de `ReceitaArrecadada`, que a apontam. As três
  // filhas estão lá em cima, ao lado de `AtribuicaoDeContaDaArrecadacao`.
  "EntidadeContabil",
  // M01 — ledger
  "PartidaContabil",
  "LancamentoContabil",
  "ContaPcasp",
  // M02 — planejamento
  "ReceitaPrevista",
  "ReceitaReprevista",
  "DeParaRclAnexo3",
  "DeParaOrgaoPoder",
  "DeParaBaseImpostoAsps",
  "DeParaFonteClasseAsps",
  "DeParaFundebReceita",
  "DeParaFonteClasseEducacao",
  // V11 V9.3 — a natureza da fonte para o controle da disponibilidade (PCASP 7.2.1.1).
  "DeParaFonteNaturezaDdr",
  "DeParaReceitaAlienacao",
  "DeParaFonteAlienacao",
  "ContratoPPP",
  "TipoReceitaSagres",
  "FichaOrcamentaria",
  "Subelemento",
  "NaturezaDespesa",
  "NaturezaReceita",
  "CodigoAcompanhamento",
  "FonteRecurso",
  "Acao",
  "Programa",
  "Subfuncao",
  "Funcao",
  "UnidadeOrcamentaria",
  "Orgao",
  // M05 — T07: a ordem de pagamento (movimentos antes da ordem, pela FK)
  "MovimentoDaOrdemDePagamento",
  "OrdemDePagamento",
  // M19 — pessoas e credores (cadastro append-only: pessoa, versões e papéis)
  "MovimentoDePapelDaPessoa",
  "VersaoDePessoa",
  "Pessoa",
  // base — integração
  "IntegracaoInbox",
  "EventoFiscalOutbox",
] as const;

/**
 * SÓ A LIMPEZA, sem semear ninguém.
 *
 * ⚠️ EXISTE PARA UM CASO SÓ: `test/seed-de-producao.test.ts`, que precisa de um banco
 * VAZIO e depois semeado **apenas pelos seeds de produção**. Se ele usasse `limparBanco`,
 * receberia de brinde os usuários de fixture — e passaria a provar que o sistema funciona
 * com um ator que produção nenhuma tem. Era exatamente a classe de falso-verde que aquele
 * teste existe para caçar.
 *
 * Todo o resto da suíte continua usando `limparBanco`.
 */
/**
 * ⚠️ TRUNCA SÓ O QUE TEM LINHA — E ISSO FOI MEDIDO, NÃO SUPOSTO.
 *
 * `TRUNCATE` de 141 tabelas VAZIAS custava **1,8 segundo**. O custo não é das linhas:
 * o Postgres toma `ACCESS EXCLUSIVE` em cada tabela e cria um relfilenode novo para
 * cada tabela E cada índice, tenha ela zero linhas ou um milhão. Medido contra
 * `gestao_publica_test`:
 *
 *     TRUNCATE TABLE <141 tabelas vazias> ...     -> 1794 ms
 *     detecção das não-vazias (141 EXISTS)        ->  174 ms
 *
 * Como a suíte limpa o banco uma vez por arquivo (às vezes por teste), esse 1,8 s
 * multiplicava por centenas — e foi o que fez a regressão do ENT02 sair de 7 minutos
 * para 107, com treze testes caindo por espera em módulos que ninguém tinha tocado.
 * O sintoma não apontava para a limpeza: apontava para o M05, o M08, o M12 e o M20.
 *
 * ⚠️ A DETECÇÃO LÊ LINHA, NÃO ESTATÍSTICA. `EXISTS (SELECT 1 FROM t)` para em cima da
 * primeira linha e diz a verdade. A tentação seria `pg_stat_user_tables.n_live_tup`,
 * que é barato e é ESTIMATIVA: uma estimativa velha faria a limpeza PULAR uma tabela
 * com dados, e o estado do teste anterior vazaria para o seguinte. É exatamente a
 * classe de falso-verde que esta suíte existe para não ter.
 *
 * ⚠️ E TUDO NUMA IDA SÓ. O bloco roda no servidor: detectar aqui e truncar noutra
 * chamada abriria uma janela em que outra sessão insere entre as duas — inofensiva
 * hoje (a suíte é serial), e a espécie de coisa que deixa de ser inofensiva sem aviso.
 */
export async function truncarTudo(prisma: PrismaClient): Promise<void> {
  const existencias = TABELAS.map(
    (t) => `SELECT '"${t}"' AS t WHERE EXISTS (SELECT 1 FROM "${t}")`
  ).join(" UNION ALL ");

  // ⚠️ O DELIMITADOR É NOMEADO (`$limpeza$`), E NÃO `$$` — E ISSO CUSTOU UMA DEPURAÇÃO.
  // Com `$$`, o driver ACEITA a chamada, não levanta erro nenhum e NÃO EXECUTA o bloco:
  // o banco continua com as linhas do teste anterior, e a falha aparece longe daqui,
  // como "Unique constraint failed on Perfil.nome" no arquivo seguinte. Um delimitador
  // com nome não colide com a substituição de parâmetros do driver.
  await prisma.$executeRawUnsafe(`
    DO $limpeza$
    DECLARE lista text;
    BEGIN
      SELECT string_agg(t, ', ') INTO lista FROM (${existencias}) q;
      IF lista IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || lista || ' RESTART IDENTITY CASCADE';
      END IF;
    END $limpeza$;
  `);
}

export async function limparBanco(prisma: PrismaClient): Promise<void> {
  await truncarTudo(prisma);

  // ⚠️ E OS USUÁRIOS RENASCEM AQUI — de propósito.
  //
  // A partir do bloco de permissões, TODO lançamento exige um autor CADASTRADO (o funil
  // confere a identidade). Isso alcança 49 arquivos de teste, e uma cópia do seed em cada
  // um seriam quarenta e nove lugares para esquecer de um.
  //
  // É o MESMO argumento do `semearRoteiroOrcamentario` dentro do `criarFichaDeTeste`: o
  // seed roda de dentro do helper que TODA fixture já chama. Ver `usuarios-teste.ts`.
  await semearUsuariosDeTeste(prisma);

  // ⚠️ E O LICENCIAMENTO TAMBÉM (V10 T1), pelo MESMO argumento e pelo MESMO caminho oficial.
  //
  // O gate de licenciamento é fail-closed: sem contrato, nenhum módulo contratável opera. A
  // suíte exercita as portas de leitura e o funil de escrita, e sem isto centenas de testes
  // falhariam por um motivo que não é o deles. O estado nasce por `instalarLicenciamento` — o
  // mesmo caminho da instalação real —, não por `create` à mão: fixture que monta o estado por
  // dentro prova o teste e não prova o produto.
  //
  // Quem precisa do estado "não instalado" o produz com `apagarLicenciamentoDeTeste`.
  await semearLicenciamentoDeTeste(prisma);
}
