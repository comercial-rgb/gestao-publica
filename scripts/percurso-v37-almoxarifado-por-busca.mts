import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, escolherPelaBusca, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — PERCURSO DO SETOR ATÉ O INVENTÁRIO, PELOS CAMPOS DE BUSCA:
 *   1. o setor se cadastra pela tela nova (/protocolo/setores), com a unidade gestora pela busca;
 *   2. a requisição de material se registra com o setor novo e o material pela BUSCA (nenhum `select` de material);
 *   3. o atendimento da requisição mostra o lote como busca e registra a saída;
 *   4. o bloqueio do depósito escolhe o material pela busca, e se encerra em seguida;
 *   5. o inventário se abre, a contagem escolhe o material pela busca (e o lote como busca), e se fecha.
 * Pré-requisito: o percurso das compras pela busca (materiais MAT-0001/MAT-0002 e o depósito ALM-01 com saldo).
 * Escreve na base fictícia. As datas do bloqueio e do inventário ficam no fim do ano, fora do caminho dos outros
 * percursos (os dois travam a movimentação do depósito no intervalo).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v37-almoxarifado-por-busca.mts
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
const ALMOX = "/patrimonio/almoxarifado";
const MARCA = String(Date.now()).slice(-6);
const semSelectDeMaterial = (page: import("puppeteer").Page): Promise<boolean> => page.evaluate(() => document.querySelector('select[name="materialId"], select[name="loteId"]') === null);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  const deposito = await prisma.deposito.findUnique({ where: { codigo: "ALM-01" }, select: { id: true, unidadeOrc: { select: { id: true, codigo: true } } } });
  const resma = await prisma.material.findUnique({ where: { codigo: "MAT-0001" }, select: { id: true } });
  const caneta = await prisma.material.findUnique({ where: { codigo: "MAT-0002" }, select: { id: true } });
  if (deposito === null || resma === null || caneta === null) throw new Error("Rode antes o percurso das compras pela busca (depósito ALM-01, MAT-0001 e MAT-0002).");

  // ── 1. o setor, pela tela nova ──
  if ((await prisma.setor.findUnique({ where: { codigo: "SEC-ADM" } })) === null) {
    await irPara(n, page, "/protocolo/setores");
    await escolherPelaBusca(page, 'form[data-acao="criar-setores"]', "unidadeOrcId", deposito.unidadeOrc.codigo, deposito.unidadeOrc.id);
    const r = await preencherEEnviar(page, "criar-setores", [
      { sel: '[name="codigo"]', valor: "SEC-ADM" },
      { sel: '[name="nome"]', valor: "Secretaria de Administração" },
    ]);
    const gravado = await prisma.setor.findUnique({ where: { codigo: "SEC-ADM" }, select: { unidadeOrcId: true } });
    conferir(r.tipo === "ok" && gravado?.unidadeOrcId === deposito.unidadeOrc.id, `setor SEC-ADM cadastrado pela tela, na unidade ${deposito.unidadeOrc.codigo} escolhida pela busca (${r.texto.slice(0, 60)})`);
  } else console.log("   setor SEC-ADM já existe");
  const setor = await prisma.setor.findUniqueOrThrow({ where: { codigo: "SEC-ADM" }, select: { id: true } });
  await irPara(n, page, "/protocolo/setores?q=SEC-ADM");
  conferir(await page.$eval("main", (m) => /SEC-ADM/.test(m.textContent ?? "") && /Secretaria de Administração/.test(m.textContent ?? "")), "a lista de setores mostra o setor, filtrada por código");
  // O setor desativado some da requisição nova; reativado, volta (pelo detalhe do setor).
  await irPara(n, page, `/protocolo/setores/${setor.id}`);
  const rd = await preencherEEnviar(page, "desativar", []);
  await irPara(n, page, `${ALMOX}/requisicoes`);
  const someDaLista = await page.$$eval('form[data-acao="criar-requisicoes-de-material"] select[name="setorId"] option', (os, id) => !os.some((o) => (o as HTMLOptionElement).value === id), setor.id);
  await irPara(n, page, `/protocolo/setores/${setor.id}`);
  const rr = await preencherEEnviar(page, "reativar", []);
  const ativo = (await prisma.setor.findUniqueOrThrow({ where: { id: setor.id }, select: { ativo: true } })).ativo;
  conferir(rd.tipo === "ok" && someDaLista && rr.tipo === "ok" && ativo, `setor desativado pela tela some da requisição nova, e reativado volta (${rd.texto.slice(0, 30)} / ${rr.texto.slice(0, 30)})`);

  // ── 2. a requisição, com o material pela busca ──
  const numero = `REQ-${MARCA}`;
  await irPara(n, page, `${ALMOX}/requisicoes`);
  conferir(await semSelectDeMaterial(page), "a tela de requisições não tem mais o select de material");
  const escolhido = await escolherPelaBusca(page, 'form[data-acao="criar-requisicoes-de-material"]', "materialId", "Resma", resma.id);
  const rq = await preencherEEnviar(page, "criar-requisicoes-de-material", [
    { sel: '[name="numero"]', valor: numero },
    { sel: 'select[name="depositoId"]', valor: deposito.id, tipo: "select" },
    { sel: 'select[name="setorId"]', valor: setor.id, tipo: "select" },
    { sel: '[name="dataRequisicao"]', valor: "2026-10-08", tipo: "data" },
    { sel: '[name="solicitante"]', valor: "Servidora da administração (fictícia)" },
    { sel: '[name="quantidade"]', valor: "3" },
  ]);
  const req = await prisma.requisicaoDeMaterial.findUnique({ where: { numero }, select: { id: true, setorId: true, itens: { select: { id: true, materialId: true } } } });
  conferir(rq.tipo === "ok" && escolhido === resma.id && req?.setorId === setor.id && req.itens[0]?.materialId === resma.id, `requisição ${numero} gravada com o setor novo e a resma escolhida pela busca (${rq.texto.slice(0, 60)})`);

  // ── 3. o atendimento: o lote é busca; a saída se registra ──
  if (req !== null && req.itens[0] !== undefined) {
    await irPara(n, page, `${ALMOX}/requisicoes/${req.id}`);
    const loteEhBusca = await page.evaluate(() => document.querySelector('form[data-acao="atender"] [data-seletor] input[type="hidden"][name="loteId"]') !== null && document.querySelector('form[data-acao="atender"] select[name="loteId"]') === null);
    conferir(loteEhBusca, "no atendimento, o lote é um campo de busca (antes, um select que nascia vazio)");
    const ra = await preencherEEnviar(page, "atender", [
      { sel: 'select[name="itemDeRequisicaoId"]', valor: req.itens[0].id, tipo: "select" },
      { sel: '[name="quantidade"]', valor: "2" },
      { sel: '[name="dataMovimento"]', valor: "2026-10-08", tipo: "data" },
      { sel: '[name="motivo"]', valor: "Atendimento da requisição (percurso)" },
    ]);
    const saidas = await prisma.movimentoFisicoDeEstoque.findMany({ where: { itemDeRequisicaoId: req.itens[0].id }, select: { quantidade: true } });
    // ⚠️ AS CONTAS DO ROTEIRO SÃO ESCOLHA DO ENTE, e o percurso não as escolhe. Sem o roteiro da saída, o passo afirma
    // a recusa COM O MOTIVO (e nada gravado) e a tela de roteiros mostrando o que falta; com ele, a saída gravada.
    const roteiro = (await prisma.versaoDeRoteiro.findFirst({ where: { familia: "ALMOXARIFADO", chave: "SAIDA_CONSUMO", situacao: "PUBLICADA" }, select: { id: true } }))
      ?? (await prisma.roteiroAlmoxarifado.findUnique({ where: { tipo: "SAIDA_CONSUMO" }, select: { id: true } }));
    if (roteiro === null) {
      conferir(ra.tipo === "erro" && /roteiro contábil cadastrado para a saída por consumo/.test(ra.texto) && /Roteiros contábeis do almoxarifado/.test(ra.texto) && saidas.length === 0, `sem roteiro da saída, o atendimento é recusado dizendo onde cadastrá-lo, e nada se grava (${ra.texto.slice(0, 90)})`);
      await irPara(n, page, `${ALMOX}/roteiros`);
      const tela = await page.$eval("main", (m) => m.textContent ?? "");
      conferir(/Saída por consumo/.test(tela) && /Sem roteiro/.test(tela) && (await page.$('form[data-acao="criar-roteiros-do-almoxarifado"] [data-seletor] input[type="hidden"][name="contaDebitoId"]')) !== null, "a tela de roteiros do almoxarifado lista a saída por consumo sem roteiro, com as contas por busca");
    } else {
      conferir(ra.tipo === "ok" && saidas.length === 1 && saidas[0]?.quantidade.toFixed(0) === "2", `saída de 2 un registrada para a requisição (${ra.tipo}: ${ra.texto.slice(0, 60)})`);
    }
  }

  // ── 4. o bloqueio com o material pela busca, e o encerramento ──
  await irPara(n, page, `${ALMOX}/depositos/${deposito.id}`);
  conferir(await semSelectDeMaterial(page), "o detalhe do depósito não tem mais o select de material");
  const motivo = `Conferência da caneta ${MARCA} (percurso)`;
  await escolherPelaBusca(page, 'form[data-acao="bloquear"]', "materialId", "MAT-0002", caneta.id);
  const rb = await preencherEEnviar(page, "bloquear", [
    { sel: '[name="inicio"]', valor: "2026-12-31", tipo: "data" },
    { sel: '[name="motivo"]', valor: motivo },
  ]);
  const bloqueio = await prisma.bloqueioDeEstoque.findFirst({ where: { motivo }, select: { id: true, materialId: true } });
  conferir(rb.tipo === "ok" && bloqueio?.materialId === caneta.id, `bloqueio da caneta no ALM-01 pela busca (${rb.texto.slice(0, 60)})`);
  if (bloqueio !== null) {
    await irPara(n, page, `${ALMOX}/depositos/${deposito.id}`);
    const re = await preencherEEnviar(page, "encerrar-bloqueio", [
      { sel: 'select[name="bloqueioId"]', valor: bloqueio.id, tipo: "select" },
      { sel: '[name="fim"]', valor: "2026-12-31", tipo: "data" },
    ]);
    const fim = await prisma.bloqueioDeEstoque.findUnique({ where: { id: bloqueio.id }, select: { fim: true } });
    conferir(re.tipo === "ok" && fim?.fim !== null, `bloqueio encerrado (${re.texto.slice(0, 60)})`);
  }

  // ── 5. o inventário: abre, conta pela busca, fecha ──
  const antes = new Set((await prisma.inventarioDeEstoque.findMany({ select: { id: true } })).map((i) => i.id));
  await irPara(n, page, `${ALMOX}/inventarios`);
  const ri = await preencherEEnviar(page, "criar-inventarios-de-estoque", [
    { sel: 'select[name="depositoId"]', valor: deposito.id, tipo: "select" },
    { sel: '[name="dataAbertura"]', valor: "2026-12-30", tipo: "data" },
  ]);
  const inventario = (await prisma.inventarioDeEstoque.findMany({ where: { depositoId: deposito.id }, select: { id: true } })).find((i) => !antes.has(i.id));
  conferir(ri.tipo === "ok" && inventario !== undefined, `inventário do ALM-01 aberto (${ri.texto.slice(0, 60)})`);
  if (inventario !== undefined) {
    await irPara(n, page, `${ALMOX}/inventarios/${inventario.id}`);
    conferir(await semSelectDeMaterial(page), "a contagem não tem mais select de material nem de lote");
    await escolherPelaBusca(page, 'form[data-acao="contar"]', "materialId", "Resma", resma.id);
    const rc = await preencherEEnviar(page, "contar", [{ sel: '[name="quantidadeContada"]', valor: "37" }]);
    const contagem = await prisma.contagemDeInventario.findFirst({ where: { inventarioId: inventario.id }, select: { materialId: true, quantidadeContada: true } });
    conferir(rc.tipo === "ok" && contagem?.materialId === resma.id && contagem.quantidadeContada.toFixed(0) === "37", `contagem de 37 resmas pela busca (${rc.texto.slice(0, 60)})`);
    await irPara(n, page, `${ALMOX}/inventarios/${inventario.id}`);
    const rf = await preencherEEnviar(page, "fechar", [{ sel: '[name="dataFechamento"]', valor: "2026-12-30", tipo: "data" }]);
    const fechado = await prisma.inventarioDeEstoque.findUnique({ where: { id: inventario.id }, select: { dataFechamento: true } });
    conferir(rf.tipo === "ok" && fechado?.dataFechamento !== null, `inventário fechado (${rf.texto.slice(0, 60)})`);
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do almoxarifado pela busca completo.");
