import "dotenv/config";
import { pathToFileURL } from "node:url";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { registrarMovimentoDotacao } from "../../modules/m05-despesa/dotacao-razao.js";
import { recalcularCache } from "../../modules/m05-despesa/adapter-prisma.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { liquidar, pagar } from "../../modules/m05-despesa/servico-bloco2.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../../modules/m05-despesa/dominio.js";
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox.js";
import { registrarArrecadacao } from "../../modules/m04-receita/servico.js";
import { roteiroArrecadacao } from "../../modules/m04-receita/dominio.js";
import { criarM04Deps } from "../../modules/m04-receita/adapter-prisma.js";
import { criarLei, criarDecreto, executarCredito } from "../../modules/m03-creditos/servico.js";
import { criarM03Deps } from "../../modules/m03-creditos/adapter-prisma.js";
import { registrarDispendioExtra } from "../../modules/m07-extraorcamentario/extraorcamentario.js";
import { roteiroDispendioExtra } from "../../modules/m07-extraorcamentario/dominio.js";
import { registrarEntradaAvulsa, registrarReavaliacao, atualizarCompetencia } from "../../modules/m10-patrimonial/patrimonio.js";
import { transferirEntreContas } from "../../modules/m09-tesouraria/transferencia.js";
import { importarExtratoBb } from "../../modules/m09-tesouraria/extrato.js";
import { vincular } from "../../modules/m09-tesouraria/vinculo.js";
import { extratoPocContaA } from "../../modules/m17-banco-bb/fixtures-poc.js";
import type { PrismaClient } from "../generated/client/client.js";

/**
 * MASSA POC SAGRES — a "PREFEITURA MODELO — POC" (DIRETIVA §5). UG e dados SINTÉTICOS, claramente
 * identificados como POC, NUNCA transmitidos ao TCE. Nenhum dado corresponde a pessoa/empresa/conta real.
 *
 * História encadeada (pelo funil razao.ts, dados reais): dotação → empenho → liquidação → pagamento;
 * duas contas bancárias sintéticas da mesma UG → transferência entre elas (TR 5.61); extrato BB
 * (fixture SPEC_BB → importarExtratoBb) para o SaldoMensal e a conciliação.
 *
 * ⚠️ NÃO CRIA USUÁRIOS. Um seed que carimba superusuário no banco é a chave-mestra vazando
 * (m16-rollout t5). A identidade que ASSINA a massa (`criadoPor`) tem de PRÉ-EXISTIR — do
 * `seed:bootstrap` (admin@cg.pb.gov.br) no dev, ou dos usuários das fixtures no teste. FAIL-HARD se faltar.
 *
 * ⚠️ IDEMPOTENTE: guarda pela UG POC (`org-poc`). Rodar de novo = MESMO estado, não duplica.
 *
 * ⚠️ Contas PCASP no caminho (Passo 0.a — 3 estruturais): Bancos 1.1.1.1.2, VPD 3.3.2.1.1.01,
 * disponibilidade. Código + natureza corretos; só o RÓTULO oficial diverge (decisão do Winner). Os
 * exporters SAGRES NÃO usam nomes PCASP, então a demonstração ao TCE não é afetada.
 */

const ADMIN_PADRAO = "admin@cg.pb.gov.br"; // a identidade do seed:bootstrap
const D = (mes: number, dia: number): Date => new Date(Date.UTC(2026, mes - 1, dia, 12, 0, 0));

const CONTA_DOTACAO_INICIAL = "5.2.2.1.1.00.00";
const CONTA_DOTACAO_ADICIONAL = "5.2.2.1.2.00.00"; // o que os decretos acrescentam (roteiros.ts, canônico)
const CONTA_CREDITO_DISPONIVEL = "6.2.2.1.1.00.00";
const CONTA_BANCOS = "1.1.1.1.2.00.00";
const CONTA_CONSIGNACAO_ISS = "2.1.8.8.1.02.00"; // Consignações ISS a pagar (passivo, M07) — mesmo código do m07-retencao.test
const CONTA_CONSIGNACAO_INSS = "2.1.8.8.1.01.00"; // Consignações INSS a pagar (usada pelo importador de folha, M20)
// Patrimônio (M10, TRAVA-3) — contas CANÔNICAS (mesmos códigos dos testes do M10 / par do despacho 0b).
const CONTA_IMOB_MOVEL = "1.2.3.1.1.01.00"; //   Bens móveis (veículos)
const CONTA_IMOB_IMOVEL = "1.2.3.2.1.01.00"; //  Bens imóveis (edificações)
const CONTA_VPA_INCORP = "4.5.9.1.1.00.00"; //   VPA — incorporação de ativos
const CONTA_VPD_DEPREC = "3.3.3.1.1.00.00"; //   VPD — depreciação
const CONTA_DEPREC_ACUM = "1.2.3.8.1.01.00"; //  Depreciação acumulada (redutora do ativo)

// Contas do subsistema da RECEITA (S7, F3) — arrecadação pelo funil `roteiroArrecadacao`.
const CONTA_VPA_RECEITA = "4.1.1.2.1.01.00"; //   VPA — a receita sob a ótica patrimonial (CREDORA)
const CONTA_RECEITA_A_REALIZAR = "6.2.1.1.0.00.00"; // controle orçamentário (DEVEDORA)
const CONTA_RECEITA_REALIZADA = "6.2.1.2.0.00.00"; // controle orçamentário (CREDORA)

// Contas PCASP do caminho (mesmos códigos dos roteiros do M05 + a dotação inicial).
const CONTAS_PCASP = [
  { codigo: CONTA_BANCOS, nome: "Bancos Conta Movimento", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { codigo: "2.1.3.1.1.00.00", nome: "Fornecedores a Pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { codigo: "3.3.2.1.1.01.00", nome: "Servicos de Terceiros PJ", naturezaSaldo: "DEVEDORA" as const, nivel: 6, analitica: true },
  { codigo: CONTA_DOTACAO_INICIAL, nome: "Dotacao Inicial", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: CONTA_DOTACAO_ADICIONAL, nome: "Dotacao Adicional", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: CONTA_CREDITO_DISPONIVEL, nome: "Credito Disponivel", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { codigo: CONTA_CONSIGNACAO_ISS, nome: "Consignacoes ISS a Pagar", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true, indicadorSuperavit: "F" as const },
  { codigo: CONTA_CONSIGNACAO_INSS, nome: "Consignacoes INSS a Pagar", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true, indicadorSuperavit: "F" as const },
  // Patrimônio (M10).
  { codigo: CONTA_IMOB_MOVEL, nome: "Bens Moveis - Veiculos", naturezaSaldo: "DEVEDORA" as const, nivel: 6, analitica: true },
  { codigo: CONTA_IMOB_IMOVEL, nome: "Bens Imoveis - Edificacoes", naturezaSaldo: "DEVEDORA" as const, nivel: 6, analitica: true },
  { codigo: CONTA_VPA_INCORP, nome: "VPA Incorporacao de Ativos", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true },
  { codigo: CONTA_VPD_DEPREC, nome: "VPD Depreciacao", naturezaSaldo: "DEVEDORA" as const, nivel: 6, analitica: true },
  { codigo: CONTA_DEPREC_ACUM, nome: "Depreciacao Acumulada", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true },
  { codigo: "6.2.2.1.3.01.00", nome: "Credito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true },
  { codigo: "6.2.2.1.3.03.00", nome: "Credito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true },
  { codigo: "6.2.2.1.3.04.00", nome: "Credito Pago", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true },
  // Subsistema da receita (F3).
  { codigo: CONTA_VPA_RECEITA, nome: "VPA Receita Tributaria", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true },
  { codigo: CONTA_RECEITA_A_REALIZAR, nome: "Receita a Realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: CONTA_RECEITA_REALIZADA, nome: "Receita Realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CONTA_BANCOS,
  variacaoAumentativa: CONTA_VPA_RECEITA,
  receitaARealizar: CONTA_RECEITA_A_REALIZAR,
  receitaRealizada: CONTA_RECEITA_REALIZADA,
});

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: CONTA_CREDITO_DISPONIVEL, creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: CONTA_BANCOS, creditoLiquidado: "6.2.2.1.3.03.00", creditoPago: "6.2.2.1.3.04.00" });

export interface OpcoesSeedPoc {
  /** A identidade AUTORIZADA que assina a massa. Deve PRÉ-EXISTIR (o seed não cria usuários). */
  readonly criadoPor?: string;
  /**
   * DIRETIVA §5 — o ERRO PROPOSITAL. Quando `true`, o empenho usa um subelemento FORA do domínio
   * oficial ("999"), que `validarDominioEmpenhos` (S2) REJEITA nomeando. Correção = o seed PADRÃO.
   */
  readonly comErroProposital?: boolean;
}

async function jaSemeado(prisma: PrismaClient): Promise<boolean> {
  return (await prisma.orgao.findUnique({ where: { id: "org-poc" }, select: { id: true } })) !== null;
}

export async function semearSagresPoc(prisma: PrismaClient, opcoes: OpcoesSeedPoc = {}): Promise<void> {
  const por = opcoes.criadoPor ?? ADMIN_PADRAO;
  if (await jaSemeado(prisma)) {
    console.log("[seed:sagres-poc] UG POC já existe — no-op (idempotente).");
    return;
  }

  // ⚠️ A identidade `por` TEM de existir (o razão a cobra com "USUÁRIO NÃO CADASTRADO", TR 4.55). Este
  // seed NÃO a verifica nem a cria de propósito — quem cria identidades é o `seed:bootstrap`/o admin, e
  // um seed que toca a tabela de identidades já falha o grep de segurança (m16-rollout t5). Se `por` não
  // existir, a primeira operação do razão (a dotação) cai nomeando — rode 'npm run seed:bootstrap' antes.

  // (0b) IDENTIFICAÇÃO DO ENTE (S6) — cadastro institucional com ORDENADOR sintético. CPF fictício
  // com dígito verificador VÁLIDO (11144477735), claramente de teste — nunca uma pessoa real. É daqui
  // que o empenho herda o cpfOrdenador (quita o gap da S3).
  await prisma.enteConfig.upsert({
    where: { id: "unico" },
    update: { nomeOrdenador: "ORDENADOR MODELO POC", cpfOrdenador: "11144477735", nomeContador: "CONTADOR MODELO POC", cpfContador: "52998224725", crcContador: "CRC-PB-000001" },
    create: {
      id: "unico", codigoIbge: "2504009", poderOrgao: "20111", nome: "PREFEITURA MODELO - POC", cnpj: "12345678000199", uf: "PB",
      nomeOrdenador: "ORDENADOR MODELO POC", cpfOrdenador: "11144477735", nomeContador: "CONTADOR MODELO POC", cpfContador: "52998224725", crcContador: "CRC-PB-000001",
      // O tribunal do ente (multi-ente) — a POC é paraibana, logo TCE-PB. NOT NULL e sem default:
      // é o seed que afirma o tribunal, nunca o schema por omissão.
      tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-federal",
      conferidoPor: por, conferidoEm: D(1, 1),
    },
  });

  // (1) PCASP do caminho (garante existência por CÓDIGO — é como os roteiros do M05 as resolvem).
  await prisma.contaPcasp.createMany({ data: CONTAS_PCASP, skipDuplicates: true });
  const idDe = async (codigo: string): Promise<string> =>
    (await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;
  const idBancos = await idDe(CONTA_BANCOS);

  // (2) DOMÍNIO. Órgão/UO são POC (99/99001); o resto é referência COMPARTILHADA — UPSERT por chave.
  const orgao = await prisma.orgao.upsert({ where: { codigo: "99" }, update: {}, create: { id: "org-poc", codigo: "99", nome: "PREFEITURA MODELO - POC" } });
  const uo = await prisma.unidadeOrcamentaria.upsert({ where: { codigo: "99001" }, update: {}, create: { codigo: "99001", descricao: "SECRETARIA DE FINANCAS - POC", orgaoId: orgao.id } });
  const funcao = await prisma.funcao.upsert({ where: { codigo: "04" }, update: {}, create: { codigo: "04", nome: "Administracao" } });
  const subfuncao = await prisma.subfuncao.upsert({ where: { codigo: "122" }, update: {}, create: { codigo: "122", nome: "Administracao Geral" } });
  const programa = await prisma.programa.upsert({ where: { codigo: "0001" }, update: {}, create: { codigo: "0001", descricao: "Gestao Administrativa" } });
  const acao = await prisma.acao.upsert({ where: { codigo: "2001" }, update: {}, create: { codigo: "2001", descricao: "Manutencao dos Servicos", tipo: "ATIVIDADE" } });
  const nd = await prisma.naturezaDespesa.upsert({ where: { codigoCompleto: "339039" }, update: {}, create: { codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Outros Servicos de Terceiros - PJ" } });
  // Subelemento 040 — o par (39,040) é válido na tabela oficial (relacao_elemento_subelemento_2026).
  const sub040 = await prisma.subelemento.upsert({ where: { naturezaId_codigo: { naturezaId: nd.id, codigo: "040" } }, update: {}, create: { codigo: "040", descricao: "Servicos Tecnicos Profissionais", naturezaId: nd.id } });
  const fonte = await prisma.fonteRecurso.upsert({ where: { codigo: "500" }, update: {}, create: { codigo: "500", descricao: "Recursos Ordinarios", codigoTce: "500" } });

  // (2b) DOMÍNIO DA RECEITA (F3) — natureza STN (8 díg.) + CO (4 díg.), para a arrecadação pelo funil.
  const natReceita = await prisma.naturezaReceita.upsert({ where: { codigo: "11130211" }, update: {}, create: { codigo: "11130211", descricao: "IPTU - Principal" } });
  const co0001 = await prisma.codigoAcompanhamento.upsert({ where: { codigo: "0001" }, update: {}, create: { codigo: "0001", descricao: "Acompanhamento POC" } });
  void natReceita;
  void co0001;

  // ERRO PROPOSITAL (F4): subelemento "999" — NÃO consta na tabela oficial. O empenho o aceita; o
  // motor da S2 é que REJEITA na exportação. Só na variante.
  const subEmpenho = opcoes.comErroProposital === true
    ? await prisma.subelemento.upsert({ where: { naturezaId_codigo: { naturezaId: nd.id, codigo: "999" } }, update: {}, create: { codigo: "999", descricao: "SUBELEMENTO INVALIDO - ERRO POC", naturezaId: nd.id } })
    : sub040;

  // (3) DOTAÇÃO (LOA): roteiro DOTACAO_INICIAL + exercício aberto + ficha + movimento no razão (funil).
  await prisma.roteiroOrcamentario.upsert({ where: { tipo: "DOTACAO_INICIAL" }, update: {}, create: { tipo: "DOTACAO_INICIAL", contaDebitoId: await idDe(CONTA_DOTACAO_INICIAL), contaCreditoId: await idDe(CONTA_CREDITO_DISPONIVEL), criadoPor: por } });
  // Roteiros de CRÉDITO ADICIONAL (M03) — contas canônicas (roteiros.ts): o crédito acresce a dotação
  // adicional / disponível; a anulação inverte. Sem eles, `executarCredito` cairia fail-closed.
  await prisma.roteiroOrcamentario.upsert({ where: { tipo: "CREDITO_ADICIONAL" }, update: {}, create: { tipo: "CREDITO_ADICIONAL", contaDebitoId: await idDe(CONTA_DOTACAO_ADICIONAL), contaCreditoId: await idDe(CONTA_CREDITO_DISPONIVEL), criadoPor: por } });
  await prisma.roteiroOrcamentario.upsert({ where: { tipo: "ANULACAO_CREDITO" }, update: {}, create: { tipo: "ANULACAO_CREDITO", contaDebitoId: await idDe(CONTA_CREDITO_DISPONIVEL), contaCreditoId: await idDe(CONTA_DOTACAO_ADICIONAL), criadoPor: por } });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: por } });
  await prisma.$transaction(async (tx) => {
    await tx.fichaOrcamentaria.create({
      data: {
        id: "ficha-poc", exercicio: 2026, numero: 9001,
        orgaoId: orgao.id, unidadeOrcId: uo.id, funcaoId: funcao.id, subfuncaoId: subfuncao.id,
        programaId: programa.id, acaoId: acao.id, naturezaDespesaId: nd.id, fonteId: fonte.id,
        exercicioFonte: 1, valorDotado: "150000.00",
      },
    });
    await registrarMovimentoDotacao(tx, {
      fichaId: "ficha-poc", tipo: "DOTACAO_INICIAL", valor: "150000.00", origemTipo: "LOA", origemId: "ficha-poc",
      criadoPor: por, data: D(1, 1), historico: "Dotacao inicial da ficha POC (LOA 2026)",
    });
    await recalcularCache(tx, "ficha-poc");
  });

  // (3b) DUAS CONTAS BANCÁRIAS sintéticas da mesma UG (tripla completa) — ANTES do pagamento.
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-poc-a", codigo: "CC-POC-A", descricao: "CONTA MOVIMENTO POC A", fonteId: fonte.id, contaContabilId: idBancos, banco: "001", agencia: "1234", digitoAgencia: "0", conta: "11111", digitoConta: "1" },
      { id: "cb-poc-b", codigo: "CC-POC-B", descricao: "CONTA MOVIMENTO POC B", fonteId: fonte.id, contaContabilId: idBancos, banco: "001", agencia: "5678", digitoAgencia: "0", conta: "22222", digitoConta: "2" },
    ],
  });

  // (4) EXECUÇÃO: empenho → liquidação → pagamento (serviços reais, pelo funil).
  const deps = criarM05DepsComAlmoxarifado(prisma);
  const emp = await empenhar(
    { fichaId: "ficha-poc", numero: "1", tipo: "ORDINARIO", valor: "50000.00", data: D(7, 10), credorCpfCnpj: "12345678000199", historico: "Empenho de servicos - POC", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", subelementoId: subEmpenho.id, criadoPor: por },
    R_EMPENHO, deps
  );
  const liq = await liquidar(
    { empenhoId: emp.empenhoId, numero: "1", valor: "50000.00", data: D(7, 12), responsavelAtesto: "Ordenador POC", historico: "Liquidacao de servicos - POC", criadoPor: por },
    R_LIQUIDACAO, deps
  );
  const pag = await pagar(
    { liquidacaoId: liq.liquidacaoId, numero: "1", valor: "50000.00", data: D(7, 14), contaBancaria: "CC-POC-A", fonteId: fonte.id, historico: "Pagamento de servicos - POC", criadoPor: por },
    R_PAGAMENTO, deps
  );

  // (5) TRANSFERÊNCIA entre as duas contas (TR 5.61, F1) — pelo funil.
  await transferirEntreContas(prisma, {
    contaOrigemId: "cb-poc-a", contaDestinoId: "cb-poc-b", valor: "2500.00",
    data: D(7, 15), codigo: "1", historico: "Transferencia entre contas proprias - POC", criadoPor: por,
  });

  // (6) EXTRATO BB via o CAMINHO REAL (fixture SPEC_BB → normalização M17 → importarExtratoBb), origem
  // API_BB, competência única (ORIGEM-CONFLITANTE-COMPETENCIA: a conta A só recebe por UMA origem).
  await importarExtratoBb(prisma, { contaBancariaId: "cb-poc-a", extrato: extratoPocContaA(), importadoPor: por });

  // (7) CONCILIAÇÃO: o débito de 50k do extrato É o pagamento de serviços.
  const linhaPagamento = await prisma.lancamentoExtrato.findFirstOrThrow({
    where: { contaBancariaId: "cb-poc-a", natureza: "DEBITO", valor: "50000.00" }, select: { id: true },
  });
  await vincular(prisma, { lancamentoExtratoId: linhaPagamento.id, tipoInterno: "PAGAMENTO", internoId: pag.pagamentoId, valor: "50000.00", criadoPor: por });

  // ═══ MASSA AMPLIADA (S7, F3) — determinística e idempotente (guarda pela UG POC, no topo) ═══

  // (8) RECEITA ORÇAMENTÁRIA (05/jul) — arrecadação pelo funil real (razão balanceado). A conta
  // arrecadadora é PARÂMETRO de exportação (o modelo não amarra receita a conta — art. 167).
  const depsM04 = criarM04Deps(prisma);
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: "11130211", fonte: "500", co: "0001", exercicioFonte: 1, valor: "80000.00", dataArrecadacao: D(7, 5), numeroReceita: "7", criadoPor: por },
    R_ARRECADACAO, depsM04
  );

  // (9) SEGUNDO MÊS (agosto) — a cadeia mínima empenho→liquidação→pagamento, mesmos serviços reais.
  const emp2 = await empenhar(
    { fichaId: "ficha-poc", numero: "2", tipo: "ORDINARIO", valor: "20000.00", data: D(8, 5), credorCpfCnpj: "12345678000199", historico: "Empenho de servicos - POC (agosto)", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", subelementoId: subEmpenho.id, criadoPor: por },
    R_EMPENHO, deps
  );
  const liq2 = await liquidar(
    { empenhoId: emp2.empenhoId, numero: "2", valor: "20000.00", data: D(8, 7), responsavelAtesto: "Ordenador POC", historico: "Liquidacao de servicos - POC (agosto)", criadoPor: por },
    R_LIQUIDACAO, deps
  );
  await pagar(
    { liquidacaoId: liq2.liquidacaoId, numero: "2", valor: "20000.00", data: D(8, 8), contaBancaria: "CC-POC-A", fonteId: fonte.id, historico: "Pagamento de servicos - POC (agosto)", criadoPor: por },
    R_PAGAMENTO, deps
  );

  // (10) CRÉDITO ADICIONAL (M03, TRAVA-1) — 1 lei + 1 decreto de REMANEJAMENTO (origem ANULACAO):
  // suplementa 5k e anula 5k na MESMA ficha/fonte. Balanceado (TR 5.111: Σanul == Σsupl por fonte),
  // pelos serviços reais. A dotação atualizada da ficha passa a somar o crédito (via saldoAutorizado).
  const depsM03 = criarM03Deps(prisma);
  const leiId = await criarLei({ numero: "001", ano: 2026, tipoCredito: "SUPLEMENTAR", valorAutorizado: "5000.00", dataPublicacao: D(9, 1), criadoPor: por }, depsM03);
  const decretoId = await criarDecreto({ leiId, numero: "0001", ano: 2026, data: D(9, 2), origemRecurso: "ANULACAO", criadoPor: por }, depsM03);
  await executarCredito(
    { decretoId, itens: [
      { fichaId: "ficha-poc", tipo: "SUPLEMENTACAO", valor: "5000.00", fonteId: fonte.id },
      { fichaId: "ficha-poc", tipo: "ANULACAO", valor: "5000.00", fonteId: fonte.id },
    ], criadoPor: por },
    depsM03
  );

  // (11) EXTRAORÇAMENTÁRIO (M07, TRAVA-2) — CADEIA NOVA em SETEMBRO (dia sem movimento prévio, para
  // os goldens SAGRES existentes não mudarem). Empenho nº3 → liquidação → pagamento COM RETENÇÃO de
  // ISS na fonte: o líquido sai ao fornecedor e o retido nasce como ingresso extra (receita extra
  // vinculada ao pagamento, TR 5.25/5.41), com saldo próprio. Depois, recolhimento PARCIAL do ISS
  // (despesa extra, TR 5.43-5.45) — a trava de saldo do M07 impede recolher mais do que se reteve.
  const tipoIss = await prisma.tipoConsignacao.upsert({ where: { codigo: "ISS" }, update: {}, create: { codigo: "ISS", descricao: "ISS retido na fonte", criadoPor: por } });
  // INSS: cadastrado para o importador de folha (M20) — a fixture da POC retém INSS e ISS.
  await prisma.tipoConsignacao.upsert({ where: { codigo: "INSS" }, update: {}, create: { codigo: "INSS", descricao: "INSS retido na fonte", criadoPor: por } });
  const emp3 = await empenhar(
    { fichaId: "ficha-poc", numero: "3", tipo: "ORDINARIO", valor: "10000.00", data: D(9, 10), credorCpfCnpj: "12345678000199", historico: "Empenho de servicos com retencao - POC (setembro)", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", subelementoId: subEmpenho.id, criadoPor: por },
    R_EMPENHO, deps
  );
  const liq3 = await liquidar(
    { empenhoId: emp3.empenhoId, numero: "3", valor: "10000.00", data: D(9, 12), responsavelAtesto: "Ordenador POC", historico: "Liquidacao com retencao - POC (setembro)", criadoPor: por },
    R_LIQUIDACAO, deps
  );
  const pag3 = await pagar(
    { liquidacaoId: liq3.liquidacaoId, numero: "3", valor: "10000.00", data: D(9, 14), contaBancaria: "CC-POC-A", fonteId: fonte.id, historico: "Pagamento com retencao ISS - POC (setembro)", criadoPor: por },
    R_PAGAMENTO, deps,
    { contaDisponibilidade: CONTA_BANCOS, retencoes: [{ tipoConsignacaoId: tipoIss.id, credorConsignatario: "Municipio de Campina Grande", valor: "500.00", contaConsignacaoAPagar: CONTA_CONSIGNACAO_ISS }] }
  );
  void pag3;
  // Recolhimento PARCIAL: repassa 300 dos 500 retidos ao consignatário (saldo do ISS → 200).
  await registrarDispendioExtra(
    prisma,
    { tipoConsignacaoId: tipoIss.id, credorConsignatario: "Municipio de Campina Grande", contaBancaria: "CC-POC-A", fonteId: fonte.id, valor: "300.00", data: D(9, 20), historico: "Recolhimento parcial de ISS - POC (setembro)", criadoPor: por },
    roteiroDispendioExtra({ consignacaoAPagar: CONTA_CONSIGNACAO_ISS, disponibilidade: CONTA_BANCOS })
  );

  // (12) PATRIMÔNIO (M10, TRAVA-3) — 2 bens (1 móvel + 1 imóvel) em OUTUBRO, pelos serviços reais.
  // Roteiro patrimonial CANÔNICO (mesmos códigos dos testes do M10 / par do despacho 0b — nada
  // inventado). ⚠️ `roteiroPatrimonial` é GLOBAL por tipo: a perna do ativo sai do roteiro, não da
  // classe — a posição 5.86 separa por classe via `MovimentoPatrimonial.classeDeBensId`.
  const idImobMovel = await idDe(CONTA_IMOB_MOVEL);
  const idImobImovel = await idDe(CONTA_IMOB_IMOVEL);
  const idVpaIncorp = await idDe(CONTA_VPA_INCORP);
  const classeMovel = await prisma.classeDeBens.upsert({ where: { codigo: "1.2.3.1.1.01" }, update: {}, create: { codigo: "1.2.3.1.1.01", descricao: "Veiculos", especie: "MOVEL", contaContabilAtivoId: idImobMovel, criadoPor: por } });
  const classeImovel = await prisma.classeDeBens.upsert({ where: { codigo: "1.2.3.2.1.01" }, update: {}, create: { codigo: "1.2.3.2.1.01", descricao: "Edificacoes", especie: "IMOVEL", contaContabilAtivoId: idImobImovel, criadoPor: por } });
  await prisma.parametroAtualizacaoClasse.upsert({ where: { classeDeBensId: classeMovel.id }, update: {}, create: { classeDeBensId: classeMovel.id, metodo: "DEPRECIACAO", vidaUtilMeses: 24, percentualResidual: "0.100000", criadoPor: por } });
  await prisma.roteiroPatrimonial.createMany({ data: [
    { tipo: "AVALIACAO_INICIAL", contaDebitoId: idImobMovel, contaCreditoId: idVpaIncorp, criadoPor: por },
    { tipo: "REAVALIACAO_AUMENTO", contaDebitoId: idImobMovel, contaCreditoId: idVpaIncorp, criadoPor: por },
    { tipo: "DEPRECIACAO", contaDebitoId: await idDe(CONTA_VPD_DEPREC), contaCreditoId: await idDe(CONTA_DEPREC_ACUM), criadoPor: por },
  ], skipDuplicates: true });
  const bemMovel = await prisma.bemPatrimonial.create({ data: { numeroTombamento: "TOMB-POC-0001", descricao: "Onibus escolar - POC", classeDeBensId: classeMovel.id, dataAquisicao: D(10, 1), criadoPor: por } });
  const bemImovel = await prisma.bemPatrimonial.create({ data: { numeroTombamento: "TOMB-POC-0002", descricao: "Escola municipal - POC", classeDeBensId: classeImovel.id, dataAquisicao: D(10, 1), criadoPor: por } });
  // Avaliação inicial (ingresso patrimonial) — pelos serviços reais.
  await registrarEntradaAvulsa(prisma, { tipo: "AVALIACAO_INICIAL", classeDeBensId: classeMovel.id, bemId: bemMovel.id, valor: "50000.00", dataMovimento: D(10, 2), motivo: "Avaliacao inicial do onibus escolar POC", criadoPor: por });
  await registrarEntradaAvulsa(prisma, { tipo: "AVALIACAO_INICIAL", classeDeBensId: classeImovel.id, bemId: bemImovel.id, valor: "200000.00", dataMovimento: D(10, 2), motivo: "Avaliacao inicial da escola municipal POC", criadoPor: por });
  // Reavaliação (aumento) do imóvel; depreciação mensal do móvel (competência 2026-10).
  await registrarReavaliacao(prisma, { classeDeBensId: classeImovel.id, sentido: "AUMENTO", valor: "20000.00", bemId: bemImovel.id, dataMovimento: D(10, 15), motivo: "Reavaliacao da escola municipal POC", criadoPor: por });
  await atualizarCompetencia(prisma, { classeDeBensId: classeMovel.id, competencia: "2026-10", criadoPor: por });

  console.log("[seed:sagres-poc] massa POC (ampliada) criada: ficha 150k; empenho/liq/pag 50k+20k+10k(ISS 500); receita 80k; decreto remanejamento 5k; recolhimento ISS 300; 2 bens (movel 50k + imovel 200k, reaval +20k, deprec movel out); 2 contas, transf, extrato BB + conciliacao.");
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida (.env).");
  // DIRETIVA §5 — a VARIANTE com o erro proposital, ligada da linha de comando:
  //   npm run seed:sagres-poc -- --com-erro
  // Sem a flag, o seed é o PADRÃO (limpo). É a mesma massa; muda só o subelemento do empenho.
  const comErroProposital = process.argv.includes("--com-erro");
  if (comErroProposital) console.log("[seed:sagres-poc] VARIANTE --com-erro: subelemento 999 (fora do domínio oficial).");
  const prisma = criarPrismaClient(url);
  try {
    await semearSagresPoc(prisma as unknown as PrismaClient, { comErroProposital });
  } finally {
    await prisma.$disconnect();
  }
}

// Só roda como ENTRYPOINT direto (`tsx prisma/seed/sagres-poc.ts`) — nunca quando IMPORTADO.
const ehEntrada = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ehEntrada) {
  main().catch((e: unknown) => {
    console.error("[seed:sagres-poc] FALHOU:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
