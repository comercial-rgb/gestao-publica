import type { PrismaClient } from "../prisma/generated/client/client.js";
import { semearUsuariosDeTeste } from "./usuarios-teste.js";

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
const TABELAS = [
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
  // M14 — exports federais (config do ente e matriz de ICs exigidas)
  "EnteConfig",
  "IcExigidaPorConta",
  // M14 — MANAD (registros 0050 e 0100)
  "ManadContabilista",
  "ManadEmpresaGeradora",
  // M12 — mapeamento dos demonstrativos (parametrização)
  "PrefixoDaLinha",
  "LinhaDemonstrativo",
  // M10 — almoxarifado e provisões
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
  // M10 — patrimonial
  "MovimentoPatrimonial",
  "BemPatrimonial",
  "RoteiroPatrimonial",
  "ClasseDeBens",
  // M09 — tesouraria (extrato + conciliação)
  "VinculoConciliacao",
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
}
