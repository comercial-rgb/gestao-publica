import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { exigirContaDaLiquidacao } from "../../modules/m01-core-contabil/conta-da-liquidacao.js";
import { declararRoteiroPatrimonial } from "../../modules/m01-core-contabil/roteiro-patrimonial-declarado.js";
import { CONTA_FORNECEDORES_A_PAGAR, roteiroEmpenho, roteiroLiquidacao } from "../../modules/m01-core-contabil/roteiros.js";
import { criarM02Deps } from "../../modules/m02-planejamento/adapter-prisma.js";
import { reprevisarReceita } from "../../modules/m02-planejamento/servico.js";
import { cadastrarLeiOrcamentariaAnual, registrarAprovacaoDaLeiOrcamentaria } from "../../modules/m02b-plurianual/lei-orcamentaria.js";
import { criarLdo, criarPlanoPlurianual, criarProjecaoAtuarialRpps } from "../../modules/m02b-plurianual/servico.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { liquidar } from "../../modules/m05-despesa/servico-bloco2.js";
import { listarTiposConsignacao } from "../../modules/m07-extraorcamentario/consultas.js";
import { cadastrarTipoDeConsignacao, redefinirContaDaConsignacao } from "../../modules/m07-extraorcamentario/servico-tipos-de-consignacao.js";
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox.js";
import { criarM05DepsComContratos } from "../../modules/m11-licitacoes/adapter-m05.js";
import { redigirNotaExplicativa } from "../../modules/m12-relatorios/notas-explicativas.js";
import { vincularPessoaAoUsuario, pessoaDoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { concederPerfil, criarUsuario } from "../../modules/m16-travamento/servico-usuarios.js";
import { apresentacaoVigente, registrarApresentacaoDoEnte } from "../../modules/m16-travamento/apresentacao-do-ente.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import { criarM19Deps } from "../../modules/m19-pessoas/adapter-prisma.js";
import { cadastrarPessoa } from "../../modules/m19-pessoas/servico.js";
import { anexarArquivo } from "../../modules/m22-documentos/anexos.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../../modules/m32-pessoal/servico.js";
import { apropriarEncargosPorCompetencia, apropriarPorCompetencia, declararParametroDeFerias } from "../../modules/m33-folha/apropriacao-por-competencia.js";
import { apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha } from "../../modules/m33-folha/apropriacao.js";
import { certificarFolha, designarNaFolha, liquidarFolha } from "../../modules/m33-folha/certificacao.js";
import { cadastrarParametroDoDecimoTerceiro } from "../../modules/m33-folha/decimo-terceiro-servico.js";
import { consignacaoVigenteDaRubrica, declararConsignacaoDaRubrica } from "../../modules/m33-folha/descontos-da-folha.js";
import {
  apropriarEncargosDaFolha,
  apurarEncargosDaFolha,
  aprovarVersaoDoEncargo,
  cadastrarComponenteDeEncargo,
  cadastrarGrupoDosEncargos,
  cadastrarVersaoDoEncargo,
  certificarEncargosDaFolha,
  liquidarEncargosDaFolha,
} from "../../modules/m33-folha/encargos-servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, calcularFolha, fecharFolha } from "../../modules/m33-folha/servico.js";
import { calcularDvDoCnpj, documentoTemDigitoValido } from "../../packages/documento/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * A BASE FICTÍCIA DE ESPERANÇA/PB — para VER e EXECUTAR as etapas que, na base real, esperam documento do município
 * ou de outro órgão. Roda SÓ no banco `gestao_publica_esperanca_ficticio` (cópia local do ensaio de Esperança, com a
 * LOA real carregada). Nunca em produção: o portal da transparência é público, e um dado fictício lá seria lido como
 * ato do município.
 *
 * O QUE É REAL E O QUE É FICTÍCIO
 *   real (vem da base): ente, plano de contas do TCE-PB, fichas e receita prevista da Lei 613/2025; o número, a data e
 *     o veículo da Lei 613/2025 e o PDF dela (docs/oficial/esperanca-pb, SHA-256 do manifesto); a data de sanção da LDO
 *     2026 (Lei 576, de 16/06/2025); as tabelas de IRRF e do RGPS de 2026 e as alíquotas patronais da Lei 8.212/1991.
 *   FICTÍCIO (marcado no próprio registro): número e envio do projeto da LOA; vigência e protocolo da LDO; a lei do PPA;
 *     a projeção atuarial do regime próprio; o estatuto (13º e férias); o FAP; servidores, atestadora, credores,
 *     empenhos, liquidações, a reprevisão e a nota explicativa.
 *
 * Tudo passa pelos MESMOS serviços que as telas chamam (autorização, Zod, guardas, razão). Idempotente: cada item é
 * procurado pela chave natural antes de ser criado.
 *
 * Uso: DATABASE_URL=<…/gestao_publica_esperanca_ficticio> ANEXOS_DIR=<pasta> [FICTICIO_SENHA=…] npx tsx scripts/demonstracao/semear-esperanca-ficticio.ts
 */

const BANCO = "gestao_publica_esperanca_ficticio";
/**
 * A base de PRODUÇÃO de Esperança só por pedido expresso do usuário (05/10/2026: "lançar na base real, para apresentarmos;
 * depois iremos apagar geral"), com backup antes e a confirmação abaixo no ambiente. A marca de dados fictícios entra no
 * cabeçalho do sistema e do portal enquanto eles estiverem lá.
 */
const BANCO_DE_PRODUCAO = "gestao_publica_esperanca";
const CONFIRMACAO_DE_PRODUCAO = "dados ficticios para apresentar, apagar depois";
const RAIZ = resolve(import.meta.dirname, "../..");
const ADMIN = process.env["FICTICIO_ADMIN"] ?? "admin@cg.pb.gov.br";
let SENHA = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const MARCA = "FICTÍCIO — base de demonstração";
const EXERCICIO = 2026;
const MESES_FECHADOS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"] as const;
/** A apropriação por competência fica feita até agosto: setembro sobra para executar na tela. */
const MESES_APROPRIADOS = MESES_FECHADOS.slice(0, 8);

const CONTADOR = "contador@ficticio.local";
const ATESTADOR = "atestador@ficticio.local";
const LIQUIDANTE = "liquidante@ficticio.local";
const APROVADOR = "aprovador@ficticio.local";

/** Fichas da Lei 613/2025, Secretaria de Administração (02004), fonte 500. */
const FICHA_VENCIMENTOS = 10852; // 319011
const FICHA_PATRONAL = 10853; // 319013
const FICHA_SERVICOS = 10861; // 339039

const D = (dia: string): Date => meioDiaCivil(dia);
const ultimoDia = (competencia: string): string => {
  const [a, m] = competencia.split("-").map(Number) as [number, number];
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

const FONTE_IRRF =
  "Lei 15.191/2025 (tabela progressiva mensal) e Lei 15.270/2025 (redução) — https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026";
const FONTE_RGPS =
  "Portaria Interministerial MPS/MF nº 13, de 9 de janeiro de 2026 — https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal";
const FONTE_PATRONAL = "Lei 8.212/1991 art. 22, I (20%), c/c art. 15, I — https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm";
const FONTE_RAT = `Lei 8.212/1991 art. 22, II, b (2%) e Decreto 3.048/1999 Anexo V (CNAE 8411-6/00, grau 2) × FAP 1,0000 (${MARCA})`;
const ESTATUTO = `Estatuto dos Servidores de Esperança (${MARCA})`;
const FUNDAMENTO_APROPRIACAO = "MCASP 11ª ed., Parte II, item 18 — apropriação por competência; contas do PCASP do TCE-PB 2025.";

function exigirBanco(): string {
  const url = process.env["DATABASE_URL"] ?? "";
  let nome = "";
  try {
    nome = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL ausente ou ilegível. Nada foi gravado.");
  }
  if (nome === BANCO_DE_PRODUCAO) {
    if (process.env["FICTICIO_EM_PRODUCAO"] !== CONFIRMACAO_DE_PRODUCAO) throw new Error(`Recusado: "${nome}" é a base de produção. Só com FICTICIO_EM_PRODUCAO="${CONFIRMACAO_DE_PRODUCAO}" e backup feito. Nada foi gravado.`);
    const senha = process.env["FICTICIO_SENHA"] ?? "";
    if (senha.length < 16) throw new Error("Em produção os usuários fictícios ficam na internet: informe FICTICIO_SENHA com 16 caracteres ou mais. Nada foi gravado.");
    SENHA = senha;
  } else if (nome !== BANCO) throw new Error(`Recusado: este script só semeia o banco "${BANCO}", e o DATABASE_URL aponta para "${nome}". Nada foi gravado.`);
  if ((process.env["ANEXOS_DIR"] ?? "").trim() === "") throw new Error("Informe ANEXOS_DIR (a pasta dos anexos desta base, a mesma que o servidor vai usar). Nada foi gravado.");
  return url;
}

function cpfComDv(raiz9: string): string {
  const d = raiz9.split("").map(Number);
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += (d[i] as number) * (tamanho + 1 - i);
    const resto = soma % 11;
    d.push(resto < 2 ? 0 : 11 - resto);
  }
  const doc = d.join("");
  if (!documentoTemDigitoValido(doc)) throw new Error(`CPF gerado sem DV válido: ${doc}`);
  return doc;
}
const cnpjComDv = (raiz12: string): string => `${raiz12}${calcularDvDoCnpj(raiz12)}`;

type Resultado<T> = { readonly estado: "criado" | "existente"; readonly valor: T; readonly detalhe?: string };
async function passo<T>(rotulo: string, f: () => Promise<Resultado<T>>): Promise<T> {
  try {
    const r = await f();
    console.log(`${r.estado === "criado" ? "+" : "="} ${rotulo}${r.detalhe === undefined ? "" : ` — ${r.detalhe}`}`);
    return r.valor;
  } catch (e) {
    console.error(`! ${rotulo}: RECUSADO — ${e instanceof Error ? e.message : String(e)}`);
    throw new Error(`parou em "${rotulo}"`);
  }
}

async function pessoa(prisma: PrismaClient, documento: string, nome: string): Promise<string> {
  const m19 = criarM19Deps(prisma);
  return passo(`Pessoa ${documento} ${nome}`, async () => {
    const ja = await m19.pessoas.buscarPorDocumento(documento);
    if (ja !== null) return { estado: "existente", valor: ja.id };
    const { pessoaId } = await cadastrarPessoa({ documento, nome, municipio: "Esperança", uf: "PB", criadoPor: ADMIN }, m19);
    return { estado: "criado", valor: pessoaId };
  });
}

async function fichaId(prisma: PrismaClient, numero: number, natureza: string): Promise<string> {
  const f = await prisma.fichaOrcamentaria.findUnique({ where: { exercicio_numero: { exercicio: EXERCICIO, numero } }, select: { id: true, naturezaDespesa: { select: { codigoCompleto: true } } } });
  if (f === null || f.naturezaDespesa.codigoCompleto !== natureza) throw new Error(`A ficha ${String(numero)}/${String(EXERCICIO)} (${natureza}) da Lei 613/2025 não está nesta base. Nada foi gravado.`);
  return f.id;
}

async function contaId(prisma: PrismaClient, codigo: string): Promise<string> {
  const c = await prisma.contaPcasp.findUnique({ where: { codigo }, select: { id: true, analitica: true } });
  if (c === null || !c.analitica) throw new Error(`A conta ${codigo} precisa existir e ser analítica no plano carregado. Nada foi gravado.`);
  return c.id;
}

// ═══ 1. USUÁRIOS POR PAPEL (a folha exige pessoas diferentes para calcular, fechar, atestar e liquidar) ═══

const PAPEIS: readonly { readonly email: string; readonly nome: string; readonly perfil: string; readonly acoes: readonly AcaoDoSistema[] }[] = [
  {
    email: CONTADOR, nome: "Contadora (fictícia)", perfil: "CONTABILIDADE — FICTÍCIO",
    acoes: ["EMPENHAR", "LIQUIDAR", "FECHAR_FOLHA", "APROPRIAR_FOLHA", "APURAR_ENCARGOS_DA_FOLHA", "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA", "REPREVISAR_RECEITA", "CADASTRAR_LINHA_DEMONSTRATIVO",
      "CONSULTAR_DESPESA", "CONSULTAR_FOLHA", "CONSULTAR_PLANEJAMENTO", "CONSULTAR_CONTABILIDADE", "CONSULTAR_RELATORIOS", "CONSULTAR_RECEITA", "CONSULTAR_CADASTROS"],
  },
  { email: ATESTADOR, nome: "Atestadora da folha (fictícia)", perfil: "ATESTO DA FOLHA — FICTÍCIO", acoes: ["CERTIFICAR_FOLHA", "CERTIFICAR_ENCARGOS_DA_FOLHA", "CONSULTAR_FOLHA", "CONSULTAR_PESSOAL", "CONSULTAR_CADASTROS"] },
  { email: LIQUIDANTE, nome: "Liquidante da folha (fictício)", perfil: "LIQUIDAÇÃO DA FOLHA — FICTÍCIO", acoes: ["LIQUIDAR_FOLHA", "LIQUIDAR", "CONSULTAR_FOLHA", "CONSULTAR_DESPESA", "CONSULTAR_CADASTROS"] },
  { email: APROVADOR, nome: "Conferente dos encargos (fictício)", perfil: "APROVAÇÃO DE ENCARGOS — FICTÍCIO", acoes: ["APROVAR_ENCARGO_DA_FOLHA", "CONSULTAR_FOLHA", "CONSULTAR_CADASTROS"] },
];

async function semearUsuarios(prisma: PrismaClient): Promise<void> {
  for (const p of PAPEIS) {
    await passo(`Usuário ${p.email} (${p.perfil})`, async () => {
      if ((await prisma.usuario.findUnique({ where: { identificador: p.email }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      const perfil = await prisma.$transaction(async (tx) => {
        const criado = await tx.perfil.create({ data: { nome: p.perfil, descricao: `Papel da base fictícia: ${p.acoes.join(", ")}.`, criadoPor: ADMIN }, select: { id: true } });
        await tx.permissaoDePerfil.createMany({ data: p.acoes.map((acao) => ({ perfilId: criado.id, acao, unidadeOrcId: null, criadoPor: ADMIN })) });
        return criado;
      });
      const { usuarioId } = await criarUsuario(prisma, { nome: p.nome, email: p.email, senhaInicial: SENHA, criadoPor: ADMIN });
      await concederPerfil(prisma, { usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }
}

// ═══ 2. PLANEJAMENTO: LOA aprovada com o PDF oficial, LDO sancionada, PPA, projeção atuarial ═══

async function semearPlanejamento(prisma: PrismaClient): Promise<void> {
  const loaId = await passo("LOA 2026 (projeto fictício)", async () => {
    const ja = await prisma.leiOrcamentariaAnual.findUnique({ where: { exercicio: EXERCICIO }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    const r = await cadastrarLeiOrcamentariaAnual(prisma, {
      exercicio: EXERCICIO, numeroDoProjeto: "PL 000/2025 (fictício)", dataDoEnvio: "2025-09-30",
      ementa: `Estima a receita e fixa a despesa do Município de Esperança para o exercício de 2026. [Número e data do projeto: ${MARCA}]`, criadoPor: ADMIN,
    });
    return { estado: "criado", valor: r.id };
  });
  await passo("Aprovação: Lei 613/2025, de 19/12/2025 (Quinzenário Oficial, edição extra)", async () => {
    if ((await prisma.aprovacaoDaLeiOrcamentaria.findUnique({ where: { leiId: loaId }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await registrarAprovacaoDaLeiOrcamentaria(prisma, { leiId: loaId, numeroDaLei: "613/2025", dataDaSancao: "2025-12-19", dataDaPublicacao: "2025-12-19", veiculoDePublicacao: "Quinzenário Oficial do Município, edição extra", criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
  await passo("PDF oficial da Lei 613/2025 anexado à LOA", async () => {
    const manifesto = JSON.parse(readFileSync(resolve(RAIZ, "docs/oficial/esperanca-pb/MANIFEST-LOA-2026.json"), "utf8")) as { arquivos: { arquivo: string; sha256: string }[] };
    const entrada = manifesto.arquivos.find((a) => a.arquivo.endsWith(".pdf"));
    if (entrada === undefined) throw new Error("o manifesto da LOA 2026 não tem o PDF");
    const bytes = readFileSync(resolve(RAIZ, "docs/oficial", entrada.arquivo));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== entrada.sha256) throw new Error(`o PDF no disco (${hash}) não é o do manifesto`);
    if ((await prisma.anexo.findFirst({ where: { leiOrcamentariaAnualId: loaId, sha256: hash }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await anexarArquivo(prisma, { nomeOriginal: "lei-613-2025-loa-2026.pdf", mimeType: "application/pdf", conteudo: new Uint8Array(bytes), leiOrcamentariaAnualId: loaId, criadoPor: ADMIN });
    return { estado: "criado", valor: null, detalhe: `SHA-256 ${hash.slice(0, 16)}…` };
  });

  const ldoId = await passo("LDO 2026 (Lei 576, sancionada em 16/06/2025; vigência e protocolo fictícios)", async () => {
    const ja = await prisma.leiDiretrizesOrcamentarias.findFirst({ where: { exercicio: EXERCICIO }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    const { ldoId } = await criarLdo(prisma, { exercicio: EXERCICIO, inicioVigencia: D("2026-01-01"), fimVigencia: D("2026-12-31"), numeroProtocolo: "576/2025 (protocolo fictício)", dataSancao: D("2025-06-16"), criadoPor: ADMIN });
    return { estado: "criado", valor: ldoId };
  });
  // Projeção do FUNPREVE: valores FICTÍCIOS, em ordem de grandeza de um RPPS municipal pequeno, só para o anexo ter linhas.
  const projecao = [
    { ano: 2026, receitas: "9800000.00", despesas: "8700000.00", saldo: "21500000.00" },
    { ano: 2027, receitas: "10150000.00", despesas: "9400000.00", saldo: "22250000.00" },
    { ano: 2028, receitas: "10500000.00", despesas: "10250000.00", saldo: "22500000.00" },
    { ano: 2029, receitas: "10850000.00", despesas: "11200000.00", saldo: "22150000.00" },
  ] as const;
  for (const p of projecao) {
    await passo(`Projeção atuarial do regime próprio, ${String(p.ano)} (fictícia)`, async () => {
      if ((await prisma.projecaoAtuarialRpps.findFirst({ where: { ldoId, ano: p.ano }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      const resultado = (Number(p.receitas) - Number(p.despesas)).toFixed(2);
      await criarProjecaoAtuarialRpps(prisma, { ldoId, ano: p.ano, receitasPrevidenciarias: p.receitas, despesasPrevidenciarias: p.despesas, resultadoPrevidenciario: resultado, saldoFinanceiro: p.saldo, criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }

  await passo("PPA 2026–2029 (lei fictícia)", async () => {
    if ((await prisma.planoPlurianual.findUnique({ where: { anoInicio: 2026 }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await criarPlanoPlurianual(prisma, { anoInicio: 2026, anoFim: 2029, leiRef: "Lei 000/2025 (fictícia)", dataPublicacao: D("2025-12-19"), criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
}

// ═══ 3. FOLHA: tabelas oficiais, estatuto fictício, dois servidores RGPS, nove meses fechados ═══

interface Rubricas { readonly VENC: string; readonly D13: string; readonly D13ADI: string; readonly D13ABAT: string; readonly PREV: string; readonly IRRF: string }

async function semearCadastrosDaFolha(prisma: PrismaClient): Promise<{ readonly rub: Rubricas; readonly pessoaAtestadora: string }> {
  await passo("Tabela de contribuição RGPS desde 2026-01", async () => {
    if ((await prisma.tabelaDeContribuicao.findFirst({ where: { regime: "RGPS", competenciaInicio: "2026-01" }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await cadastrarTabelaDeContribuicao(prisma, {
      regime: "RGPS", competenciaInicio: "2026-01", teto: "8475.55", fundamentacaoLegal: FONTE_RGPS, criadoPor: ADMIN,
      faixas: [{ ordem: 1, ate: "1621.00", aliquota: "0.075" }, { ordem: 2, ate: "2902.84", aliquota: "0.09" }, { ordem: 3, ate: "4354.27", aliquota: "0.12" }, { ordem: 4, ate: "8475.55", aliquota: "0.14" }],
    });
    return { estado: "criado", valor: null };
  });
  await passo("Tabela de IRRF desde 2026-01", async () => {
    if ((await prisma.tabelaIrrf.findFirst({ where: { competenciaInicio: "2026-01" }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await cadastrarTabelaIrrf(prisma, {
      competenciaInicio: "2026-01", deducaoPorDependente: "189.59", descontoSimplificado: "607.20", isencaoMaior65: "1903.98",
      redutorBase: "978.62", redutorFator: "0.133145", redutorRendaMaxima: "7350.00", redutorRendaDaFaixaIsenta: "5000.00", redutorMaximoNaFaixaIsenta: "312.89",
      fundamentacaoLegal: FONTE_IRRF, criadoPor: ADMIN,
      faixas: [
        { ordem: 1, ate: "2428.80", aliquota: "0" },
        { ordem: 2, ate: "2826.65", aliquota: "0.075", parcelaADeduzir: "182.16" },
        { ordem: 3, ate: "3751.05", aliquota: "0.15", parcelaADeduzir: "394.16" },
        { ordem: 4, ate: "4664.68", aliquota: "0.225", parcelaADeduzir: "675.49" },
        { ordem: 5, ate: null, aliquota: "0.275", parcelaADeduzir: "908.73" },
      ],
    });
    return { estado: "criado", valor: null };
  });

  const definicoes = [
    { codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: ESTATUTO },
    { codigo: "D13", descricao: "13º salário", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 10, fundamentacaoLegal: ESTATUTO },
    { codigo: "D13ADI", descricao: "Adiantamento do 13º salário", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 11, fundamentacaoLegal: ESTATUTO },
    { codigo: "D13ABAT", descricao: "Abatimento do adiantamento do 13º", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 95, fundamentacaoLegal: ESTATUTO },
    { codigo: "PREV", descricao: "Contribuição previdenciária (RGPS)", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: FONTE_RGPS },
    { codigo: "IRRF", descricao: "Imposto de renda retido na fonte", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: FONTE_IRRF },
  ] as const;
  const ids: Record<string, string> = {};
  for (const r of definicoes) {
    ids[r.codigo] = await passo(`Rubrica ${r.codigo}`, async () => {
      const ja = await prisma.rubrica.findUnique({ where: { codigo: r.codigo }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      return { estado: "criado", valor: (await cadastrarRubrica(prisma, { ...r, criadoPor: ADMIN })).rubricaId };
    });
  }
  const rub = ids as unknown as Rubricas;

  await passo("Retenção da contribuição do servidor (PREV → INSS, conta 2.1.8.8.1.01.02)", async () => {
    // O seed oficial NÃO cria o INSS no plano do TCE-PB (a conta padrão é sintética); aqui o ente decide pela analítica.
    const fundamentoDaConta = "PCASP do TCE-PB 2025: 2.1.8.8.1.01.02 Contribuição ao RGPS; a 2.1.8.8.1.01.00 é sintética.";
    const inss =
      (await prisma.tipoConsignacao.findUnique({ where: { codigo: "INSS" }, select: { id: true } })) ??
      { id: (await cadastrarTipoDeConsignacao(prisma, { codigo: "INSS", descricao: "Contribuição do segurado ao RGPS (INSS)", contaPassivoCodigo: "2.1.8.8.1.01.02", fundamento: fundamentoDaConta, criadoPor: ADMIN })).tipoId };
    const vigente = (await listarTiposConsignacao(prisma)).find((t) => t.id === inss.id);
    if (vigente?.contaPassivoCodigo !== "2.1.8.8.1.01.02") {
      await redefinirContaDaConsignacao(prisma, { tipoId: inss.id, contaPassivoCodigo: "2.1.8.8.1.01.02", fundamento: fundamentoDaConta, criadoPor: ADMIN });
    }
    if ((await consignacaoVigenteDaRubrica(prisma, rub.PREV)) !== null) return { estado: "existente", valor: null };
    await declararConsignacaoDaRubrica(prisma, { rubricaId: rub.PREV, tipoConsignacaoId: inss.id, credorConsignatario: "Instituto Nacional do Seguro Social - INSS", fundamento: `Contribuição do segurado ao RGPS — ${FONTE_RGPS}`, criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });

  const cargoId = await passo("Cargo FIC-ASSESSOR (comissionado)", async () => {
    const ja = await prisma.cargo.findFirst({ where: { codigo: "FIC-ASSESSOR" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarCargo(prisma, { codigo: "FIC-ASSESSOR", denominacao: "Assessor técnico (fictício)", tipo: "COMISSAO", vagasFixadas: 10, leiAutorizativa: `Lei municipal 000/2021 (${MARCA})`, dataPublicacaoLei: D("2021-02-01"), criadoPor: ADMIN })).cargoId };
  });
  const lotacaoId = await passo("Lotação FIC-SECAD", async () => {
    const ja = await prisma.lotacao.findFirst({ where: { codigo: "FIC-SECAD" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarLotacao(prisma, { codigo: "FIC-SECAD", nome: "Secretaria de Administração", criadoPor: ADMIN })).lotacaoId };
  });
  // N=2 e diferentes: A tem 12 avos no ano; B, admitida em 20/03, tem 9 (março rende 12 dias, abaixo dos 15).
  const servidores = [
    { cpf: cpfComDv("418273659"), nome: "Ana Lúcia Barbosa (fictícia)", nascimento: "1987-05-14", sexo: "FEMININO" as const, matricula: "FIC-0001", salario: "2400.00", admissao: "2025-02-03" },
    { cpf: cpfComDv("527391846"), nome: "Rafael Costa Nunes (fictício)", nascimento: "1992-09-27", sexo: "MASCULINO" as const, matricula: "FIC-0002", salario: "2800.00", admissao: "2026-03-20" },
  ];
  for (const s of servidores) {
    const pessoaId = await pessoa(prisma, s.cpf, s.nome);
    const servidorId = await passo(`Servidor ${s.nome}`, async () => {
      const ja = await prisma.servidor.findFirst({ where: { pessoaId }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      return { estado: "criado", valor: (await cadastrarServidor(prisma, { pessoaId, dataNascimento: D(s.nascimento), sexo: s.sexo, criadoPor: ADMIN })).servidorId };
    });
    await passo(`Vínculo ${s.matricula} (RGPS, ${s.salario}, admissão ${s.admissao})`, async () => {
      if ((await prisma.vinculo.findUnique({ where: { matricula: s.matricula }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await admitirServidor(prisma, { servidorId, matricula: s.matricula, tipo: "COMISSIONADO", regimeJuridico: "Estatutário", regimePrevidenciario: "RGPS", dataAdmissao: D(s.admissao), cargoId, lotacaoId, salarioBase: s.salario, criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }

  // grupos de empenho: vencimentos, adiantamento do 13º (conta do ramo 1.1.3.1) e 13º (debita o 13º apropriado)
  const fVenc = await fichaId(prisma, FICHA_VENCIMENTOS, "319011");
  const grupos = [
    { codigo: "FIC-VENC", descricao: "Vencimentos", serie: "FV", rubrica: rub.VENC, variacao: "3.1.1.2.1.01.01", obrigacao: "2.1.1.1.1.01.01" },
    { codigo: "FIC-ADI13", descricao: "Adiantamento do 13º", serie: "FA", rubrica: rub.D13ADI, variacao: "1.1.3.1.1.01.02", obrigacao: "2.1.1.1.1.01.01" },
    { codigo: "FIC-13", descricao: "13º salário", serie: "FD", rubrica: rub.D13, variacao: "2.1.1.1.1.01.02", obrigacao: "2.1.1.1.1.01.01" },
  ];
  for (const g of grupos) {
    await passo(`Grupo de empenho ${g.codigo} (ficha ${String(FICHA_VENCIMENTOS)}, D ${g.variacao} / C ${g.obrigacao})`, async () => {
      if ((await prisma.grupoDeEmpenhoDaFolha.findUnique({ where: { codigo: g.codigo }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
        codigo: g.codigo, descricao: g.descricao, fichaId: fVenc, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: g.serie, porServidor: true,
        contaVariacaoId: await contaId(prisma, g.variacao), contaObrigacaoId: await contaId(prisma, g.obrigacao), rubricaIds: [g.rubrica], criadoPor: ADMIN,
      });
      return { estado: "criado", valor: null };
    });
  }

  await passo("Parâmetro do 13º de 2026 (estatuto fictício; abate o adiantamento CERTIFICADO)", async () => {
    if ((await prisma.parametroDoDecimoTerceiro.findFirst({ where: { exercicio: EXERCICIO }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await cadastrarParametroDoDecimoTerceiro(prisma, {
      exercicio: EXERCICIO, diasMinimosDoAvo: 15, avosNoExercicio: 12, percentualDaPrimeiraParcela: "0.5", baseDosAvosDoAdiantamento: "EXERCICIO_INTEIRO",
      estadoMinimoDoAdiantamentoParaAbater: "CERTIFICADO", decimoTerceiroSofreContribuicao: true, decimoTerceiroSofreIrrf: false,
      rubricaDoDecimoTerceiroId: rub.D13, rubricaDoAdiantamentoId: rub.D13ADI, rubricaDoAbatimentoId: rub.D13ABAT, rubricasDaBase: [rub.VENC],
      atoEsfera: "MUNICIPAL", atoTipo: "ESTATUTO_DOS_SERVIDORES", atoNumero: "000", atoAno: 2010, atoDispositivo: "art. 70", atoEmenta: `Gratificação natalina (${MARCA})`, criadoPor: ADMIN,
    });
    return { estado: "criado", valor: null };
  });
  await passo("Parâmetro de férias de 2026 (12 meses, abono de 1/3)", async () => {
    if ((await prisma.parametroDaApropriacaoDeFerias.findFirst({ where: { exercicio: EXERCICIO }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await declararParametroDeFerias(prisma, { exercicio: EXERCICIO, mesesDoPeriodoAquisitivo: 12, abonoNumerador: 1, abonoDenominador: 3, incluiRemuneracaoDoPeriodo: false, fundamento: `CF, art. 7º, XVII, c/c art. 39, § 3º; ${ESTATUTO}, art. 80`, criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
  const roteiros = [
    { chave: "APROPRIACAO/DECIMO_TERCEIRO", d: "3.1.1.2.1.01.22", c: "2.1.1.1.1.01.02", h: "Apropriação do 13º salário" },
    { chave: "APROPRIACAO/FERIAS", d: "3.1.1.2.1.01.24", c: "2.1.1.1.1.01.03", h: "Apropriação das férias" },
    { chave: "APROPRIACAO/ENCARGOS_DECIMO_TERCEIRO", d: "3.1.2.2.3.01.00", c: "2.1.1.4.3.01.01", h: "Encargos patronais sobre o 13º apropriado" },
    { chave: "APROPRIACAO/ENCARGOS_FERIAS", d: "3.1.2.2.3.01.00", c: "2.1.1.4.3.01.01", h: "Encargos patronais sobre as férias apropriadas" },
  ];
  for (const r of roteiros) {
    await passo(`Roteiro ${r.chave} (D ${r.d} / C ${r.c})`, async () => {
      if ((await prisma.roteiroPatrimonialDeclarado.findFirst({ where: { familia: "APROPRIACAO_PESSOAL", chave: r.chave }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await declararRoteiroPatrimonial(prisma, { familia: "APROPRIACAO_PESSOAL", chave: r.chave, contaDebitoCodigo: r.d, contaCreditoCodigo: r.c, historicoPadrao: r.h, fundamento: FUNDAMENTO_APROPRIACAO, criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }

  // encargos patronais RGPS (20% oficial; RAT 2% × FAP fictício) com aprovação de outra pessoa
  const fPatronal = await fichaId(prisma, FICHA_PATRONAL, "319013");
  const inss = await pessoa(prisma, "29979036000140", "Instituto Nacional do Seguro Social - INSS");
  const componentes = [
    { codigo: "FIC-RGPS-PATRONAL", descricao: "Contribuição patronal ao RGPS (20%)", tipo: "PREVIDENCIA_PATRONAL" as const, aliquota: "0.20", fundamento: FONTE_PATRONAL, sintetica: false, grupo: "FIC-ENC-PATR", vpd: "3.1.2.2.3.01.00" },
    { codigo: "FIC-RGPS-RAT", descricao: "RAT ajustado pelo FAP (2% × 1,0000)", tipo: "RISCO_AMBIENTAL_DO_TRABALHO" as const, aliquota: "0.02", fundamento: FONTE_RAT, sintetica: true, grupo: "FIC-ENC-RAT", vpd: "3.1.2.2.3.03.00" },
  ];
  for (const c of componentes) {
    const componenteId = await passo(`Componente de encargo ${c.codigo}`, async () => {
      const ja = await prisma.componenteDeEncargo.findUnique({ where: { codigo: c.codigo }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      return { estado: "criado", valor: (await cadastrarComponenteDeEncargo(prisma, { codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, regime: "RGPS", criadoPor: ADMIN })).componenteId };
    });
    const versaoId = await passo(`Versão de ${c.codigo} desde 2026-01 (${c.aliquota})`, async () => {
      const ja = await prisma.versaoDoEncargo.findFirst({ where: { componenteId, competenciaInicio: "2026-01" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      return { estado: "criado", valor: (await cadastrarVersaoDoEncargo(prisma, { componenteId, competenciaInicio: "2026-01", aliquota: c.aliquota, fundamentacaoLegal: c.fundamento, sintetica: c.sintetica, rubricaIds: [rub.VENC], criadoPor: ADMIN })).versaoId };
    });
    await passo(`Aprovação da versão de ${c.codigo} por ${APROVADOR}`, async () => {
      if ((await prisma.aprovacaoDoEncargo.findFirst({ where: { versaoId }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await aprovarVersaoDoEncargo(prisma, { versaoId, motivo: "alíquota, base e fundamento conferidos", criadoPor: APROVADOR });
      return { estado: "criado", valor: null };
    });
    await passo(`Grupo de empenho ${c.grupo} (ficha ${String(FICHA_PATRONAL)}, credor INSS)`, async () => {
      if ((await prisma.grupoDeEmpenhoDaFolha.findUnique({ where: { codigo: c.grupo }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await cadastrarGrupoDosEncargos(prisma, {
        codigo: c.grupo, descricao: c.descricao, fichaId: fPatronal, serie: "FE", credorId: inss, tipoEmpenho: "ORDINARIO", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        contaVariacaoId: await contaId(prisma, c.vpd), contaObrigacaoId: await contaId(prisma, "2.1.1.4.3.01.01"), componenteIds: [componenteId], criadoPor: ADMIN,
      });
      return { estado: "criado", valor: null };
    });
  }

  // a atestadora: pessoa, usuário ligado à pessoa, designações (folha e encargos)
  const pessoaAtestadora = await pessoa(prisma, cpfComDv("639184275"), "Marta Ribeiro Lins (fictícia)");
  await passo(`Vínculo do usuário ${ATESTADOR} à pessoa da atestadora`, async () => {
    const ja = await pessoaDoUsuario(prisma, ATESTADOR);
    if (ja !== null) return { estado: "existente", valor: null };
    const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: ATESTADOR }, select: { id: true } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento: cpfComDv("639184275"), motivo: `Designação para o atesto da folha (${MARCA})`, criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
  for (const atribuicao of ["CERTIFICAR_FOLHA", "CERTIFICAR_ENCARGOS_DA_FOLHA"] as const) {
    await passo(`Designação de ${ATESTADOR}: ${atribuicao} (Portaria 000/2026, fictícia)`, async () => {
      const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: ATESTADOR }, select: { id: true } });
      if ((await prisma.designacaoNaFolha.findFirst({ where: { usuarioId: u.id, atribuicao, revogacao: null }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await designarNaFolha(prisma, { atribuicao, pessoaId: pessoaAtestadora, usuarioIdentificador: ATESTADOR, atoDesignacao: "Portaria 000/2026 (fictícia)", vigenciaInicio: D("2026-01-01"), criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }
  return { rub, pessoaAtestadora };
}

/** Uma folha do começo ao fim: abrir e calcular (admin), fechar (contadora), apurar e empenhar, atestar, liquidar. */
async function folhaCompleta(prisma: PrismaClient, competencia: string, tipo: "MENSAL" | "ADIANTAMENTO_DECIMO_TERCEIRO", comEncargos: boolean): Promise<void> {
  const dia = ultimoDia(competencia);
  const rotulo = `${tipo === "MENSAL" ? "Folha" : "Adiantamento do 13º"} ${competencia}`;
  const folhaId = await passo(`${rotulo}: aberta`, async () => {
    const ja = await prisma.folhaDePagamento.findUnique({ where: { competencia_tipo: { competencia, tipo } }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await abrirFolha(prisma, { competencia, tipo, criadoPor: ADMIN })).folhaId };
  });
  const situacao = () => prisma.folhaDePagamento.findUniqueOrThrow({ where: { id: folhaId }, select: { fechamento: { select: { calculoId: true } }, calculos: { where: { cancelamento: null }, select: { id: true } } } });
  await passo(`${rotulo}: calculada`, async () => {
    const f = await situacao();
    if (f.fechamento !== null || f.calculos.length > 0) return { estado: "existente", valor: null };
    await calcularFolha(prisma, { folhaId, motivo: "folha da base fictícia", criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
  await passo(`${rotulo}: fechada por ${CONTADOR}`, async () => {
    if ((await situacao()).fechamento !== null) return { estado: "existente", valor: null };
    await fecharFolha(prisma, { folhaId, criadoPor: CONTADOR });
    return { estado: "criado", valor: null };
  });
  await passo(`${rotulo}: empenhada`, async () => {
    const r = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: D(dia), criadoPor: CONTADOR });
    return { estado: r.empenhados > 0 ? "criado" : "existente", valor: null, detalhe: `total ${r.total.toFixed(2)}` };
  });
  const calculoId = (await situacao()).fechamento?.calculoId as string;
  await passo(`${rotulo}: atestada por ${ATESTADOR}`, async () => {
    if ((await prisma.certificacaoDaFolha.findFirst({ where: { folhaId, calculoId, tipo: "CERTIFICACAO" }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await certificarFolha(prisma, { folhaId, data: D(dia), criadoPor: ATESTADOR });
    return { estado: "criado", valor: null };
  });
  await passo(`${rotulo}: liquidada por ${LIQUIDANTE}`, async () => {
    const r = await liquidarFolha(prisma, { folhaId, data: D(dia), criadoPor: LIQUIDANTE });
    return { estado: r.liquidadas > 0 ? "criado" : "existente", valor: null, detalhe: `total ${r.total.toFixed(2)}` };
  });
  if (!comEncargos) return;

  await passo(`${rotulo}: encargos apurados`, async () => {
    const ja = await prisma.apuracaoDeEncargos.findFirst({ where: { folhaId }, select: { numero: true } });
    if (ja !== null) return { estado: "existente", valor: null };
    const r = await apurarEncargosDaFolha(prisma, { folhaId, motivo: "encargos da base fictícia", criadoPor: CONTADOR });
    return { estado: "criado", valor: null, detalhe: `total ${r.total.toFixed(2)}` };
  });
  await passo(`${rotulo}: encargos atestados`, async () => {
    if ((await prisma.certificacaoDosEncargos.findFirst({ where: { apuracao: { folhaId }, tipo: "CERTIFICACAO" }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await certificarEncargosDaFolha(prisma, { folhaId, data: D(dia), criadoPor: ATESTADOR });
    return { estado: "criado", valor: null };
  });
  await passo(`${rotulo}: encargos empenhados`, async () => {
    const ultima = await prisma.apuracaoDeEncargos.findFirst({ where: { folhaId }, orderBy: { numero: "desc" }, select: { id: true } });
    if (ultima !== null && (await prisma.empenhoDosEncargos.count({ where: { apuracaoId: ultima.id } })) > 0) return { estado: "existente", valor: null };
    const r = await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: D(dia), criadoPor: CONTADOR });
    return { estado: "criado", valor: null, detalhe: `total ${r.total.toFixed(2)}` };
  });
  await passo(`${rotulo}: encargos liquidados`, async () => {
    const empenhos = await prisma.empenhoDosEncargos.findMany({ where: { apuracao: { folhaId } }, select: { liquidacao: { select: { id: true } } } });
    if (empenhos.length > 0 && empenhos.every((e) => e.liquidacao !== null)) return { estado: "existente", valor: null };
    const r = await liquidarEncargosDaFolha(prisma, { folhaId, data: D(dia), criadoPor: LIQUIDANTE });
    return { estado: "criado", valor: null, detalhe: `total ${r.total.toFixed(2)}` };
  });
}

async function semearFolhas(prisma: PrismaClient): Promise<void> {
  for (const c of MESES_FECHADOS) await folhaCompleta(prisma, c, "MENSAL", true);
  await folhaCompleta(prisma, "2026-06", "ADIANTAMENTO_DECIMO_TERCEIRO", false);
  for (const c of MESES_APROPRIADOS) {
    await passo(`Apropriação do 13º e das férias de ${c}`, async () => {
      if ((await prisma.apropriacaoPorCompetencia.findFirst({ where: { competencia: c, tipo: "DECIMO_TERCEIRO" }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      const r = await apropriarPorCompetencia(prisma, { competencia: c, criadoPor: CONTADOR });
      return { estado: "criado", valor: null, detalhe: `13º ${r.decimoTerceiro}, férias ${r.ferias}` };
    });
    await passo(`Encargos sobre o 13º e as férias de ${c}`, async () => {
      if ((await prisma.apropriacaoPorCompetencia.findFirst({ where: { competencia: c, tipo: "ENCARGOS_DECIMO_TERCEIRO" }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      const r = await apropriarEncargosPorCompetencia(prisma, { competencia: c, criadoPor: CONTADOR });
      return { estado: "criado", valor: null, detalhe: `13º ${r.decimoTerceiro}, férias ${r.ferias}` };
    });
  }
}

// ═══ 4. DESPESA COMUM: empenho ordinário com uma liquidação, ordinário sem liquidação, global em parcelas ═══

async function semearDespesa(prisma: PrismaClient): Promise<void> {
  const fServicos = await fichaId(prisma, FICHA_SERVICOS, "339039");
  const credores = [
    { documento: cnpjComDv("471829360001"), nome: "Manutenção Predial Borborema Ltda (fictícia)" },
    { documento: cnpjComDv("583016270001"), nome: "Limpa Bem Serviços Gerais Ltda (fictícia)" },
  ];
  for (const c of credores) await pessoa(prisma, c.documento, c.nome);
  const [manutencao, limpeza] = credores as [(typeof credores)[number], (typeof credores)[number]];

  const empenhos = [
    { numero: "FIC-001/2026", tipo: "ORDINARIO" as const, valor: "3000.00", data: "2026-07-06", credor: manutencao.documento, historico: "Reparo do telhado do prédio da Secretaria de Administração (fictício)" },
    { numero: "FIC-002/2026", tipo: "ORDINARIO" as const, valor: "1800.00", data: "2026-08-03", credor: manutencao.documento, historico: "Troca de fiação elétrica do arquivo (fictício)" },
    { numero: "FIC-003/2026", tipo: "GLOBAL" as const, valor: "12000.00", data: "2026-07-01", credor: limpeza.documento, historico: "Limpeza e conservação, julho a dezembro, R$ 2.000,00 por mês (fictício)" },
  ];
  const m05 = criarM05DepsComContratos(prisma);
  const id: Record<string, string> = {};
  for (const e of empenhos) {
    id[e.numero] = await passo(`Empenho ${e.tipo} ${e.numero} R$ ${e.valor}`, async () => {
      const ja = await prisma.empenho.findFirst({ where: { numero: e.numero, fichaId: fServicos }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const r = await empenhar({ fichaId: fServicos, numero: e.numero, tipo: e.tipo, valor: e.valor, data: D(e.data), credorCpfCnpj: e.credor, historico: e.historico, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: CONTADOR }, roteiroEmpenho(), m05);
      return { estado: "criado", valor: r.empenhoId };
    });
  }
  const conta = await exigirContaDaLiquidacao(prisma, "39");
  const roteiro = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR, contaDebitada: conta.contaCodigo });
  const m05Liq = criarM05DepsComAlmoxarifado(prisma);
  // FIC-001: liquidada em PARTE (2.000 de 3.000) — a segunda liquidação, pela tela, é recusada (ordinário).
  const liquidacoes = [
    { empenho: "FIC-001/2026", numero: "FIC-L1", valor: "2000.00", data: "2026-07-20", nf: "1043" },
    { empenho: "FIC-003/2026", numero: "FIC-L2", valor: "2000.00", data: "2026-07-31", nf: "311" },
    { empenho: "FIC-003/2026", numero: "FIC-L3", valor: "2000.00", data: "2026-08-31", nf: "342" },
  ];
  for (const l of liquidacoes) {
    const empenhoId = id[l.empenho] as string;
    await passo(`Liquidação ${l.numero} do empenho ${l.empenho} R$ ${l.valor}`, async () => {
      if ((await prisma.liquidacao.findUnique({ where: { empenhoId_numero: { empenhoId, numero: l.numero } }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await liquidar({ empenhoId, numero: l.numero, valor: l.valor, data: D(l.data), responsavelAtesto: "Fiscal do contrato (fictício)", notaFiscalNum: l.nf, notaFiscalSerie: "1", notaFiscalData: D(l.data), notaFiscalValor: l.valor, historico: `Serviço prestado, nota ${l.nf} (fictícia)`, criadoPor: LIQUIDANTE }, roteiro, m05Liq);
      return { estado: "criado", valor: null };
    });
  }
}

// ═══ 5. RECEITA E DEMONSTRAÇÕES: uma reprevisão e uma nota explicativa ═══

async function semearReceitaENotas(prisma: PrismaClient): Promise<void> {
  await passo("Reprevisão: +R$ 500.000,00 na natureza 17115111, fonte 500 (fictícia)", async () => {
    if ((await prisma.receitaReprevista.count()) > 0) return { estado: "existente", valor: null };
    await reprevisarReceita({ exercicio: EXERCICIO, naturezaReceita: "17115111", fonte: "500", tipoReceita: "ORCAMENTARIA", valorAjuste: "500000.00", motivo: `Reestimativa do FPM pelo comportamento do 1º semestre (${MARCA})`, data: D("2026-07-15"), criadoPor: CONTADOR }, criarM02Deps(prisma));
    return { estado: "criado", valor: null };
  });
  await passo("Nota explicativa NE-1 (fictícia)", async () => {
    if ((await prisma.notaExplicativa.count({ where: { exercicio: EXERCICIO } })) > 0) return { estado: "existente", valor: null };
    await redigirNotaExplicativa(prisma, {
      exercicio: EXERCICIO, secao: "DETALHAMENTO", demonstracao: "BALANCO_ORCAMENTARIO", ordem: 10, titulo: "Reestimativa da receita do FPM",
      texto: `A previsão da cota-parte do FPM foi reestimada em R$ 500.000,00 em julho, pelo comportamento da arrecadação do primeiro semestre. Texto de demonstração (${MARCA}).`,
      criadoPor: CONTADOR,
    });
    return { estado: "criado", valor: null };
  });
}

async function main(): Promise<void> {
  const prisma = criarPrismaClient(exigirBanco());
  try {
    console.log("\n[1] usuários por papel");
    await semearUsuarios(prisma);
    await passo("Apresentação: Prefeitura Municipal de Esperança (base fictícia)", async () => {
      // Com identificação já cadastrada (produção), uma versão nova com a marca, mantendo o resto; a anterior fica no histórico.
      const v = await apresentacaoVigente(prisma);
      if (v?.orgao?.includes("dados fictícios") === true) return { estado: "existente", valor: null };
      await registrarApresentacaoDoEnte(prisma, {
        nomeDeExibicao: v === null ? "Prefeitura Municipal de Esperança (base fictícia)" : `${v.nomeDeExibicao.slice(0, 95)} (base fictícia)`,
        orgao: "Base de demonstração — dados fictícios", tema: v?.tema ?? "PADRAO", manterImagem: v?.temImagem ?? false,
        canalTransparencia: v?.canalTransparencia ?? true, canalConsultaPublica: v?.canalConsultaPublica ?? true,
        ...(v?.assinaturaDoFornecedor != null ? { assinaturaDoFornecedor: v.assinaturaDoFornecedor } : {}),
        ...(v?.contatoEmail != null ? { contatoEmail: v.contatoEmail } : {}),
        ...(v?.contatoTelefone != null ? { contatoTelefone: v.contatoTelefone } : {}),
        ...(v?.horarioDeAtendimento != null ? { horarioDeAtendimento: v.horarioDeAtendimento } : {}),
        ...(v?.sitio != null ? { sitio: v.sitio } : {}),
        criadoPor: ADMIN,
      });
      return { estado: "criado", valor: null };
    });
    console.log("\n[2] planejamento");
    await semearPlanejamento(prisma);
    console.log("\n[3] cadastros da folha");
    await semearCadastrosDaFolha(prisma);
    console.log("\n[4] folhas de 2026");
    await semearFolhas(prisma);
    console.log("\n[5] despesa comum");
    await semearDespesa(prisma);
    console.log("\n[6] receita e notas");
    await semearReceitaENotas(prisma);
    console.log(`\nPronto. Usuários da base fictícia: ${PAPEIS.map((p) => p.email).join(", ")} (senha em FICTICIO_SENHA ou a padrão do script).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
