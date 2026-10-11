import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-019, V39-039) — PELA TELA: AS SOLICITAÇÕES DE COMPRA DE DOIS SETORES FORMAM OS ITENS DO PROCESSO.
 *
 * Pré-requisito: a massa da R3 (a solicitante de compras, o agente de contratação, os setores R3-ADM e R3-SAU).
 *   1. a solicitante registra e autoriza DUAS solicitações, uma de cada setor, do mesmo material (10 e 6);
 *   2. o agente de contratação cadastra um processo e forma os itens a partir das duas: um item com 16, e a tela mostra de
 *      que solicitação e de que setor veio cada parcela; a reserva orçamentária não muda;
 *   3. depois de formados, o processo não oferece consolidar de novo, e um processo novo não oferece as solicitações já
 *      consolidadas inteiras.
 * GRAVA (base de ensaio). Cada corrida usa números novos.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const setores = await prisma.setor.findMany({ where: { codigo: { in: ["R3-ADM", "R3-SAU"] } }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } });
if (setores.length !== 2) throw new Error("A massa da R3 não tem os setores R3-ADM e R3-SAU.");
// Material de UMA unidade (a de estoque): a solicitação não diz a unidade, e a consolidação recusa material com mais de uma.
const candidatos = await prisma.material.findMany({ where: { unidades: { some: { ehDeEstoque: true } } }, orderBy: { codigo: "asc" }, select: { id: true, descricaoSucinta: true, _count: { select: { unidades: true } } } });
const material = candidatos.find((m) => m._count.unidades === 1) ?? null;
if (material === null) throw new Error("A base não tem material com unidade de estoque.");
const marca = String(Date.now()).slice(-5);
const reservasAntes = await prisma.reservaDotacao.aggregate({ _sum: { valor: true }, _count: true });

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. a solicitante ──
  const ctxA = await nav.createBrowserContext();
  const pa = await ctxA.newPage();
  pa.setDefaultTimeout(300000);
  await entrar(n, pa, "solicitante.compras@ficticio.local", senha);
  const ids: string[] = [];
  // A terceira fica fora da consolidação: é ela que o processo novo tem de oferecer (a negação não passa por vazio).
  for (const [i, setor, qtd] of [[1, setores[0]!, "10"], [2, setores[1]!, "6"], [3, setores[0]!, "2"]] as const) {
    const numero = `SC${marca}-${String(i)}`;
    await irPara(n, pa, "/licitacoes/solicitacoes");
    const r = await preencherEEnviar(pa, "criar-solicitacao", [
      { sel: 'input[name="numero"]', valor: numero },
      { sel: 'select[name="setorId"]', valor: setor.id, tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-09-01", tipo: "data" },
      { sel: 'input[name="solicitante"]', valor: `Chefia do ${setor.codigo} (ensaio)` },
      { sel: 'textarea[name="justificativa"]', valor: "Reposição de material para o semestre (ensaio)" },
      { sel: "itens.0.materialId", valor: material.id, busca: material.descricaoSucinta.slice(0, 12), tipo: "referencia" },
      { sel: 'input[name="itens.0.quantidade"]', valor: qtd },
    ]);
    const s = await prisma.solicitacaoDeCompra.findUnique({ where: { numero }, select: { id: true } });
    conferir(r.tipo === "ok" && s !== null, `solicitação ${numero} do setor ${setor.codigo} registrada pela tela (${r.texto.slice(0, 50)})`);
    if (s === null) throw new Error("sem solicitação");
    await irPara(n, pa, `/licitacoes/solicitacoes/${s.id}`);
    const a = await preencherEEnviar(pa, "autorizar", [
      { sel: 'input[name="data"]', valor: "2026-09-02", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Autorizada pela chefia (ensaio)" },
    ]);
    conferir(a.tipo === "ok", `solicitação ${numero} autorizada pela tela (${a.texto.slice(0, 50)})`);
    ids.push(s.id);
  }
  await ctxA.close();

  // ── 2. o agente de contratação ──
  const ctxB = await nav.createBrowserContext();
  const pb = await ctxB.newPage();
  pb.setDefaultTimeout(300000);
  await entrar(n, pb, "agente.contratacao@ficticio.local", senha);
  const numeroProcesso = `PE-R3-${marca}/2026`;
  await irPara(n, pb, "/licitacoes/processos");
  const rp = await preencherEEnviar(pb, "criar-processos-licitatorios", [
    { sel: 'input[name="numeroProcesso"]', valor: numeroProcesso },
    { sel: 'select[name="modalidade"]', valor: "PREGAO_ELETRONICO", tipo: "select" },
    { sel: 'input[data-mascara="valor"]:has(+ input[name="valorLicitado"])', valor: "8000,00" },
    { sel: 'textarea[name="objeto"]', valor: "Material de consumo para os setores (ensaio)" },
  ]);
  const proc = await prisma.processoLicitatorio.findFirst({ where: { numeroProcesso }, select: { id: true } });
  conferir(rp.tipo === "ok" && proc !== null, `processo ${numeroProcesso} cadastrado pela tela`);
  if (proc === null) throw new Error("sem processo");
  const P = `/licitacoes/processos/${proc.id}`;
  await irPara(n, pb, P);
  const oferecidas = await pb.$$eval('form[data-acao="consolidar-solicitacoes"] input[name="solicitacaoId"]', (els) => Array.from(els).map((e) => (e as HTMLInputElement).value));
  conferir(ids.every((id) => oferecidas.includes(id)), `o processo sem itens oferece formar os itens a partir das três solicitações (${String(oferecidas.length)} oferecida(s))`);
  const duas = ids.slice(0, 2);
  const terceira = ids[2] ?? "";
  const rc = await preencherEEnviar(pb, "consolidar-solicitacoes", duas.map((id) => ({ sel: `input[name="solicitacaoId"][value="${id}"]`, valor: "sim", tipo: "marcar" as const })));
  const itens = await prisma.itemDoProcesso.findMany({ where: { processoId: proc.id }, select: { id: true, numero: true, quantidade: true, materialId: true, unidade: true } });
  conferir(rc.tipo === "ok" && itens.length === 1 && itens[0]?.quantidade.toString() === "16" && itens[0].materialId === material.id, `um item com 16 (10 + 6) formado pela tela (${rc.texto.slice(0, 70)})`);
  await irPara(n, pb, P);
  const origem = await pb.$$eval("[data-origem-do-item]", (els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()));
  conferir(origem.length === 2 && origem.some((o) => o.includes(setores[0]!.nome) && o.includes("10,00")) && origem.some((o) => o.includes(setores[1]!.nome) && o.includes("6,00")), `a tela mostra a origem de cada parcela: ${origem.join(" | ")}`);
  conferir((await pb.$('form[data-acao="consolidar-solicitacoes"]')) === null, "o processo com itens não oferece consolidar de novo");
  const reservasDepois = await prisma.reservaDotacao.aggregate({ _sum: { valor: true }, _count: true });
  conferir(reservasDepois._count === reservasAntes._count && (reservasDepois._sum.valor?.toString() ?? "0") === (reservasAntes._sum.valor?.toString() ?? "0"), "a consolidação não criou nem mudou reserva orçamentária");
  // um processo novo não oferece as solicitações já consolidadas inteiras
  const numero2 = `PE-R3-${marca}B/2026`;
  await irPara(n, pb, "/licitacoes/processos");
  await preencherEEnviar(pb, "criar-processos-licitatorios", [
    { sel: 'input[name="numeroProcesso"]', valor: numero2 },
    { sel: 'select[name="modalidade"]', valor: "PREGAO_ELETRONICO", tipo: "select" },
    { sel: 'input[data-mascara="valor"]:has(+ input[name="valorLicitado"])', valor: "1000,00" },
    { sel: 'textarea[name="objeto"]', valor: "Outro processo (ensaio)" },
  ]);
  const proc2 = await prisma.processoLicitatorio.findFirst({ where: { numeroProcesso: numero2 }, select: { id: true } });
  if (proc2 === null) throw new Error("o segundo processo não foi cadastrado");
  await irPara(n, pb, `/licitacoes/processos/${proc2.id}`);
  // Esperar o formulário (a leitura logo após a navegação pegava a página no meio da carga).
  await pb.waitForSelector('form[data-acao="consolidar-solicitacoes"] input[name="solicitacaoId"]', { timeout: 60000 }).catch(() => null);
  const oferecidas2 = await pb.$$eval('form[data-acao="consolidar-solicitacoes"] input[name="solicitacaoId"]', (els) => Array.from(els).map((e) => (e as HTMLInputElement).value));
  conferir(oferecidas2.includes(terceira) && duas.every((id) => !oferecidas2.includes(id)), `um processo novo oferece a terceira solicitação e não as duas já consolidadas inteiras (${String(oferecidas2.length)} oferecida(s))`);
  await ctxB.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das solicitações no processo completo.");
