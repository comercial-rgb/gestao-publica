import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA NONA RODADA:
 *   1. audiência pública (TR 5.9.1.1-2): registrada pela lista; duas solicitações com bairro, solicitante, contato e
 *      órgão; acolher sem parecer recusado dizendo o motivo, nada gravado; com parecer a tabela mostra "Acolhida";
 *      documento anexado e baixado; quem não lê o planejamento não abre a audiência nem baixa o documento.
 *   2. obra prevista na LDO (TR 5.9.2.16-17): valor no exercício acima do previsto recusado, nada gravado; a válida
 *      entra no histórico; o demonstrativo de obras e conservação sai em PDF.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-nona-rodada.mts
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

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);
  const orgao = await prisma.orgao.findFirstOrThrow({ orderBy: { codigo: "asc" }, select: { id: true } });

  // ── 1. audiência pública ──
  const local = `Câmara Municipal — percurso ${marca}`;
  await irPara(n, page, "/planejamento/audiencias");
  await page.$eval("form[data-acao='criar-audiencias-publicas'] textarea[name='pauta']", (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, "Prioridades da LDO 2027 apresentadas à comunidade");
  await preencherEEnviar(page, "criar-audiencias-publicas", [
    { sel: 'input[name="exercicio"]', valor: "2027" },
    { sel: 'select[name="peca"]', valor: "LDO", tipo: "select" },
    { sel: 'input[name="data"]', valor: "2026-05-12", tipo: "data" },
    { sel: 'input[name="local"]', valor: local },
  ]);
  const aud = await prisma.audienciaPublica.findFirst({ where: { local }, select: { id: true } });
  conferir(aud !== null, `audiência registrada pela lista (${local})`);
  if (aud === null) throw new Error("sem audiência, o percurso não segue");

  const solicitar = async (descricao: string, bairro: string, nome: string, contato: string): Promise<void> => {
    await irPara(n, page, `/planejamento/audiencias/${aud.id}`);
    await page.$eval("form[data-acao='solicitacao'] textarea[name='descricao']", (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, descricao);
    await preencherEEnviar(page, "solicitacao", [
      { sel: 'input[name="bairro"]', valor: bairro },
      { sel: 'select[name="orgaoId"]', valor: orgao.id, tipo: "select" },
      { sel: 'input[name="solicitanteNome"]', valor: nome },
      { sel: 'input[name="solicitanteContato"]', valor: contato },
    ]);
  };
  await solicitar(`Pavimentar a Rua das Flores ${marca}`, "Centro", "Maria Fictícia", "(83) 90000-0001");
  await solicitar(`Posto de saúde no Alto ${marca}`, "Alto", "João Fictício", "joao@ficticio.local");
  const sols = await prisma.solicitacaoDaAudiencia.findMany({ where: { audienciaId: aud.id }, orderBy: { criadoEm: "asc" }, select: { id: true } });
  conferir(sols.length === 2, `duas solicitações gravadas pela tela (${String(sols.length)})`);

  await irPara(n, page, `/planejamento/audiencias/${aud.id}`);
  const semParecer = await preencherEEnviar(page, "situacao", [
    { sel: 'select[name="solicitacaoId"]', valor: sols[0]?.id ?? "", tipo: "select" },
    { sel: 'select[name="situacao"]', valor: "ACOLHIDA", tipo: "select" },
  ]);
  const gravadasAntes = await prisma.situacaoDaSolicitacao.count({ where: { solicitacaoId: { in: sols.map((s) => s.id) } } });
  conferir(/exige o parecer/i.test(semParecer.texto) && gravadasAntes === 0, `acolher sem parecer: recusado ("${semParecer.texto.trim().slice(0, 90)}"), nada gravado`);

  await irPara(n, page, `/planejamento/audiencias/${aud.id}`);
  await page.$eval("form[data-acao='situacao'] textarea[name='parecer']", (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, "Incluída como prioridade na LDO 2027.");
  await preencherEEnviar(page, "situacao", [
    { sel: 'select[name="solicitacaoId"]', valor: sols[0]?.id ?? "", tipo: "select" },
    { sel: 'select[name="situacao"]', valor: "ACOLHIDA", tipo: "select" },
  ]);
  await irPara(n, page, `/planejamento/audiencias/${aud.id}`);
  const situacoes = await page.$$eval("[data-solicitacao] [data-situacao]", (els) => els.map((e) => (e as HTMLElement).innerText.trim()));
  const tabela = await page.$eval("[data-solicitacoes-da-audiencia]", (e) => (e as HTMLElement).innerText);
  conferir(
    situacoes.join("|") === "Acolhida|Recebida" && tabela.includes("(83) 90000-0001") && tabela.includes("Alto") && tabela.includes("Incluída como prioridade"),
    `tabela das solicitações: situações ${situacoes.join(", ")}; bairro, contato e parecer na tela`
  );

  const caminho = join(tmpdir(), `ata-da-audiencia-${marca}.pdf`);
  writeFileSync(caminho, `%PDF-1.4\n% ata fictícia ${marca}\n`);
  await irPara(n, page, `/planejamento/audiencias/${aud.id}?aba=anexos`);
  await preencherEEnviar(page, "anexar", [{ sel: 'input[name="arquivo"]', valor: caminho, tipo: "arquivo" }]);
  const anexo = await prisma.anexo.findFirst({ where: { audienciaPublicaId: aud.id }, select: { id: true } });
  await irPara(n, page, `/planejamento/audiencias/${aud.id}?aba=anexos`);
  const listado = (await page.evaluate(() => document.body.innerText)).includes(`ata-da-audiencia-${marca}.pdf`);
  const baixa = async (p: typeof page): Promise<number> => p.evaluate(async (u) => (await fetch(u)).status, `${n.base}/documentos/anexos/${anexo?.id ?? "x"}`);
  const statusAdmin = await baixa(page);
  conferir(anexo !== null && listado && statusAdmin === 200, `documento anexado pela aba Anexos, listado e baixado (${String(statusAdmin)})`);

  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "atestador@ficticio.local", "Ficticio#2026");
  const resp = await outra.goto(`${n.base}/planejamento/audiencias/${aud.id}`, { waitUntil: "domcontentloaded" });
  const textoNegado = await outra.evaluate(() => document.body.innerText);
  const statusNegado = await baixa(outra);
  conferir(
    !textoNegado.includes("Maria Fictícia") && /acesso|permiss/i.test(textoNegado) && statusNegado !== 200,
    `sem leitura do planejamento: a audiência não abre (${String(resp?.status())}, "${(/[^.\n]*(acesso|permiss)[^.\n]*/i.exec(textoNegado)?.[0] ?? "").replace(/\s+/g, " ").trim().slice(0, 110)}") e o download responde ${String(statusNegado)}`
  );

  // ── 2. obra prevista na LDO ──
  const ldo = await prisma.leiDiretrizesOrcamentarias.findFirstOrThrow({ orderBy: { exercicio: "desc" }, select: { id: true } });
  const descricao = `Pavimentação do Centro — percurso ${marca}`;
  const prever = async (noExercicio: string) => {
    await irPara(n, page, `/planejamento/ldo/${ldo.id}`);
    return preencherEEnviar(page, "obra-prevista", [
      { sel: 'select[name="orgaoId"]', valor: orgao.id, tipo: "select" },
      { sel: 'input[name="descricao"]', valor: descricao },
      { sel: 'input[name="dataInicio"]', valor: "2027-03-01", tipo: "data" },
      { sel: 'input[data-mascara="valor"]', valor: "500.000,00", indice: 0 },
      { sel: 'input[data-mascara="valor"]', valor: "20.000,00", indice: 1 },
      { sel: 'input[data-mascara="valor"]', valor: "0,00", indice: 2 },
      { sel: 'input[data-mascara="valor"]', valor: noExercicio, indice: 3 },
    ]);
  };
  const acima = await prever("500.000,01");
  const depoisDaRecusa = await prisma.obraPrevistaLdo.count({ where: { descricao } });
  conferir(/excede o valor previsto/i.test(acima.texto) && depoisDaRecusa === 0, `valor no exercício acima do previsto: recusado ("${acima.texto.trim().slice(0, 90)}"), nada gravado`);
  await prever("250.000,00");
  const gravada = await prisma.obraPrevistaLdo.findFirst({ where: { descricao }, select: { valorPrevisto: true, valorConservacao: true, valorNoExercicio: true } });
  await irPara(n, page, `/planejamento/ldo/${ldo.id}?aba=historico`);
  const historico = (await page.evaluate(() => document.body.innerText)).includes(`Obra prevista: ${descricao}`);
  conferir(
    gravada !== null && gravada.valorPrevisto.toFixed(2) === "500000.00" && gravada.valorConservacao.toFixed(2) === "20000.00" && gravada.valorNoExercicio.toFixed(2) === "250000.00" && historico,
    "obra prevista gravada com os valores digitados e no histórico da LDO"
  );
  const pdf = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, tipo: r.headers.get("content-type") ?? "", bytes: (await r.arrayBuffer()).byteLength };
  }, `${n.base}/planejamento/ldo/${ldo.id}/anexos/obras-e-conservacao`);
  conferir(pdf.status === 200 && pdf.tipo.includes("application/pdf") && pdf.bytes > 1000, `demonstrativo de obras e conservação em PDF (${String(pdf.status)}, ${pdf.tipo}, ${String(pdf.bytes)} bytes)`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da nona rodada completo.");
