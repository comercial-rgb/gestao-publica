import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DAS MULTAS DE TRÂNSITO (TR 5.10.1.45):
 *   a contabilidade declara pela tela de roteiros as contas de controle das multas (na base fictícia, "demais controles"
 *   7.9.9 / 8.9.9 — escolha de demonstração; em produção a escolha é da contabilidade do ente); o administrador registra
 *   duas multas do mesmo veículo com infratores diferentes (N=2), cada uma com o lançamento de controle; o auto repetido é
 *   recusado com o motivo; a baixa de uma lança o controle de volta; a tela mostra a situação e o em aberto por infrator;
 *   quem só consulta o patrimônio lê sem os formulários.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-multas-de-transito.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const marca = String(Date.now()).slice(-6);
const hoje = diaCivil(new Date());
const CONTROLE_D = "7.9.9.0.0.00.00";
const CONTROLE_C = "8.9.9.0.0.00.00";
const TELA = "/patrimonio/frota/multas";

// O veículo: na frota hoje e não baixado (a última situação viva).
const veiculoNaFrota = async () => {
  const veiculos = await prisma.veiculoDaFrota.findMany({ orderBy: { placa: "asc" }, select: { id: true, placa: true, situacoes: { where: { anulacao: null }, orderBy: { desde: "desc" }, take: 1, select: { situacao: true, desde: true } } } });
  return veiculos.find((v) => v.situacoes[0] !== undefined && v.situacoes[0].situacao !== "BAIXADA" && diaCivil(v.situacoes[0].desde) <= hoje);
};
const pessoas = await prisma.pessoa.findMany({ where: { tipo: "FISICA" }, orderBy: { documento: "asc" }, take: 2, select: { documento: true } });
if (pessoas.length < 2) throw new Error("a base não tem duas pessoas físicas no cadastro");
const [p1, p2] = pessoas as [{ documento: string }, { documento: string }];

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 0. sem veículo na frota, o percurso cadastra um pela tela da frota (o caminho que o servidor faria) ──
  let veiculo = await veiculoNaFrota();
  if (veiculo === undefined) {
    const ug = await prisma.unidadeGestora.findFirst({ where: { entidadeContabilId: { not: null } }, orderBy: { codigoTce: "asc" }, select: { id: true } });
    if (ug === null) throw new Error("a base não tem unidade gestora escriturada para a frota");
    await irPara(n, page, "/patrimonio/frota");
    const r0 = await preencherEEnviar(page, "cadastrar-veiculo", [
      { sel: 'select[name="ugId"]', valor: ug.id, tipo: "select" },
      { sel: 'input[name="placa"]', valor: `PRC${marca.slice(-4)}` },
      { sel: 'input[name="anoModelo"]', valor: "2022" },
      { sel: 'input[name="renavam"]', valor: "123456789" },
      { sel: 'select[name="situacaoInicial"]', valor: "EM_USO", tipo: "select" },
      { sel: 'select[name="tipoFrota"]', valor: "PROPRIO", tipo: "select" },
      { sel: 'select[name="combustivelPrincipal"]', valor: "GASOLINA", tipo: "select" },
      { sel: 'input[name="vigenteDesde"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "Documento do veículo (percurso)" },
    ]);
    veiculo = await veiculoNaFrota();
    conferir(r0.tipo === "ok" && veiculo !== undefined, `veículo cadastrado pela tela da frota para o percurso (${r0.texto.slice(0, 60)})`);
  }
  if (veiculo === undefined) throw new Error("sem veículo na frota, o percurso não segue");
  const doVeiculo = veiculo.id;

  // ── 1. o roteiro das multas, pela tela de roteiros ──
  for (const [chave, d, c, h] of [["REGISTRO", CONTROLE_D, CONTROLE_C, "Multa de trânsito notificada"], ["BAIXA", CONTROLE_C, CONTROLE_D, "Multa de trânsito baixada"]] as const) {
    const ja = await prisma.roteiroPatrimonialDeclarado.count({ where: { familia: "MULTA_DE_TRANSITO", chave } });
    if (ja > 0) {
      // Declarado em rodada anterior: a tela de roteiros tem de mostrá-lo com as contas.
      await irPara(n, page, "/contabilidade/roteiros-patrimoniais");
      const linha = await page.$eval(`tr[data-roteiro="MULTA_DE_TRANSITO|${chave}"]`, (e) => (e as HTMLElement).innerText).catch(() => "");
      conferir(linha.includes(d) && linha.includes(c), `a tela de roteiros mostra o ${chave} das multas declarado (${linha.replace(/\s+/g, " ").slice(0, 80)})`);
      continue;
    }
    await irPara(n, page, "/contabilidade/roteiros-patrimoniais");
    const r = await preencherEEnviar(page, 'form[data-painel="declarar-roteiro-patrimonial"]', [
      { sel: 'select[name="movimento"]', valor: `MULTA_DE_TRANSITO|${chave}`, tipo: "select" },
      { sel: "contaDebitoCodigo", valor: d, tipo: "referencia", busca: d },
      { sel: "contaCreditoCodigo", valor: c, tipo: "referencia", busca: c },
      { sel: 'input[name="historicoPadrao"]', valor: h },
      { sel: 'input[name="fundamento"]', valor: "Base fictícia: demais controles do plano, escolha de demonstração (a conta é decisão da contabilidade)." },
    ], "declarar-roteiro-patrimonial");
    conferir(r.tipo === "ok", `roteiro ${chave} das multas declarado pela tela (${r.texto.slice(0, 70)})`);
  }

  // ── 2. duas multas do mesmo veículo, infratores diferentes ──
  const registrar = async (auto: string, valor: string, cpf: string, orgao = "DETRAN-PB") => {
    await irPara(n, page, TELA);
    return preencherEEnviar(page, "registrar-multa", [
      { sel: 'select[name="veiculoId"]', valor: doVeiculo, tipo: "select" },
      { sel: 'input[name="orgaoAutuador"]', valor: orgao },
      { sel: 'input[name="numeroDoAuto"]', valor: auto },
      { sel: 'input[name="diaDaInfracao"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="diaDaNotificacao"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="infracao"]', valor: "Estacionar em local proibido pela sinalização (percurso)" },
      { sel: 'input[name="local"]', valor: "Esperança, Rua Principal" },
      { sel: '[data-mascara="valor"]', valor },
      { sel: '[data-mascara="cpf-cnpj"]', valor: cpf },
    ]);
  };
  const r1 = await registrar(`P${marca}-1`, "195,23", p1.documento);
  const r2 = await registrar(`P${marca}-2`, "88,38", p2.documento);
  const ms = await prisma.multaDeTransito.findMany({ where: { numeroDoAuto: { in: [`P${marca}-1`, `P${marca}-2`] } }, orderBy: { numeroDoAuto: "asc" }, select: { id: true, valor: true, lancamentoId: true, infrator: { select: { documento: true } } } });
  const partidas = await prisma.partidaContabil.findMany({ where: { lancamentoId: { in: ms.map((m) => m.lancamentoId) } }, select: { tipo: true, subsistema: true, valor: true, conta: { select: { codigo: true } } } });
  conferir(
    r1.tipo === "ok" && r2.tipo === "ok" && ms.length === 2 && ms[0]?.infrator.documento !== ms[1]?.infrator.documento &&
      partidas.length === 4 && partidas.every((p) => p.subsistema === "CONTROLE") &&
      partidas.filter((p) => p.tipo === "DEBITO").every((p) => p.conta.codigo === CONTROLE_D),
    `duas multas registradas pela tela, infratores diferentes, cada uma com o lançamento de controle (${r1.texto.slice(0, 50)} | ${r2.texto.slice(0, 50)})`
  );
  const [m1, m2] = ms;
  if (m1 === undefined || m2 === undefined) throw new Error("sem as duas multas, o percurso não segue");

  // ── 3. o auto repetido ──
  // O mesmo auto, com o órgão escrito de outro jeito: é o mesmo auto.
  const r3 = await registrar(`p${marca}-1`, "10,00", p2.documento, "Detran/PB");
  conferir(r3.tipo === "erro" && /já está registrado/.test(r3.texto) && (await prisma.multaDeTransito.count({ where: { numeroDoAuto: `P${marca}-1` } })) === 1, `auto repetido recusado com o motivo (${r3.texto.slice(0, 90)})`);

  // ── 4. a baixa ──
  await irPara(n, page, TELA);
  const r4 = await preencherEEnviar(page, "baixar-multa", [
    { sel: 'select[name="multaId"]', valor: m2.id, tipo: "select" },
    { sel: 'select[name="tipo"]', valor: "RESSARCIDA_PELO_INFRATOR", tipo: "select" },
    { sel: 'input[name="dia"]', valor: hoje, tipo: "data" },
    { sel: 'input[name="observacao"]', valor: "Guia paga pelo condutor (percurso)" },
  ]);
  const baixa = await prisma.baixaDaMultaDeTransito.findUnique({ where: { multaId: m2.id }, select: { tipo: true, lancamentoId: true } });
  const pb = baixa === null ? [] : await prisma.partidaContabil.findMany({ where: { lancamentoId: baixa.lancamentoId }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } });
  conferir(
    r4.tipo === "ok" && baixa?.tipo === "RESSARCIDA_PELO_INFRATOR" && pb.some((p) => p.tipo === "DEBITO" && p.conta.codigo === CONTROLE_C && p.valor.toFixed(2) === "88.38"),
    `multa baixada como ressarcida, com o lançamento de volta no controle (${r4.texto.slice(0, 60)})`
  );

  // ── 5. a tela ──
  await irPara(n, page, TELA);
  const s1 = await page.$eval(`tr[data-multa^="P${marca}-1"] td[data-situacao]`, (e) => (e as HTMLElement).innerText).catch(() => "");
  const s2 = await page.$eval(`tr[data-multa^="P${marca}-2"] td[data-situacao]`, (e) => (e as HTMLElement).innerText).catch(() => "");
  const porInfrator = await page.$eval("[data-por-infrator]", (e) => (e as HTMLElement).innerText).catch(() => "");
  conferir(/Em aberto/.test(s1) && /Ressarcida pelo infrator/.test(s2) && porInfrator.length > 0, `a tabela mostra a situação de cada uma ("${s1}" | "${s2.split("\n")[0] ?? ""}") e o em aberto por infrator`);

  // ── 6. quem só consulta o patrimônio ──
  const leitor = await prisma.usuario.findFirst({
    where: {
      identificador: { endsWith: "@ficticio.local" },
      vinculos: { some: { perfil: { permissoes: { some: { acao: "CONSULTAR_PATRIMONIO" as never } } } } },
      NOT: { vinculos: { some: { perfil: { permissoes: { some: { acao: "CADASTRAR_FROTA" as never } } } } } },
    },
    select: { identificador: true },
  });
  if (leitor === null) {
    console.log("NAO EXECUTADO quem só consulta: a base fictícia não tem usuário com consulta do patrimônio sem a gestão da frota");
  } else {
    const outra = await (await nav.createBrowserContext()).newPage();
    outra.setDefaultTimeout(120000);
    await entrar(n, outra, leitor.identificador, "Ficticio#2026");
    await outra.goto(`${n.base}${TELA}`, { waitUntil: "domcontentloaded" });
    await outra.waitForSelector("[data-resumo-multas]");
    const forms = await outra.$$('form[data-acao="registrar-multa"], form[data-acao="baixar-multa"]');
    conferir(forms.length === 0, `${leitor.identificador} lê as multas sem os formulários (a recusa no servidor está no teste do domínio)`);
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das multas de trânsito completo.");
