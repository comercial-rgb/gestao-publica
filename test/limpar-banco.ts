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
  // M19 — pessoas e credores (cadastro append-only: pessoa, versões e papéis)
  "MovimentoDePapelDaPessoa",
  "VersaoDePessoa",
  "Pessoa",
  // base — integração
  "IntegracaoInbox",
  "EventoFiscalOutbox",
] as const;

export async function limparBanco(prisma: PrismaClient): Promise<void> {
  const lista = TABELAS.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`
  );

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
