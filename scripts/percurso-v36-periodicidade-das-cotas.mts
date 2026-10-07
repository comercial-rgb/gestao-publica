import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { acompanhamentoDasCotasCmd } from "../modules/m02-planejamento/programacao.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA PERIODICIDADE DO CONTROLE DAS COTAS (TR 5.9.3.33), em /planejamento/cmd-mba:
 *   bimestral desde 06/10 registrada pela tela (os três atos na mesma data: no empate vale o gravado por último, e a corrida não depende das anteriores) e mostrada como vigente; repetir é recusado dizendo o motivo, nada
 *   gravado; o acompanhamento mostra o período e o saldo do período que o domínio calcula; mensal desde hoje volta o
 *   controle ao padrão (e o histórico fica). O efeito no empenho está nos testes do guard (m02-periodicidade-das-cotas).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-periodicidade-das-cotas.mts
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
  const declarar = async (periodicidade: string, desde: string, ato: string): Promise<string> => {
    await irPara(n, page, "/planejamento/cmd-mba?exercicio=2026");
    const r = await preencherEEnviar(page, "periodicidade-das-cotas", [
      { sel: 'select[name="periodicidade"]', valor: periodicidade, tipo: "select" },
      { sel: 'input[name="vigenteDesde"]', valor: desde, tipo: "data" },
      { sel: 'input[name="atoRef"]', valor: ato },
    ]);
    return r.texto;
  };
  const vigenteNaTela = async (): Promise<string> => {
    await irPara(n, page, "/planejamento/cmd-mba?exercicio=2026");
    return page.$eval("[data-periodicidade-vigente]", (e) => e.getAttribute("data-periodicidade-vigente") ?? "");
  };

  const antes = await prisma.periodicidadeDasCotasCmd.count({ where: { exercicio: 2026 } });
  await declarar("BIMESTRAL", "2026-10-06", `Decreto do percurso ${marca}-B`);
  const gravada = await prisma.periodicidadeDasCotasCmd.findFirst({ where: { atoRef: `Decreto do percurso ${marca}-B` }, select: { periodicidade: true } });
  const telaB = await vigenteNaTela();
  conferir(gravada?.periodicidade === "BIMESTRAL" && telaB === "BIMESTRAL", `bimestral desde 06/10 gravada e mostrada como vigente (${telaB})`);

  const repetida = await declarar("BIMESTRAL", "2026-10-06", `Decreto do percurso ${marca}-R`);
  const depois = await prisma.periodicidadeDasCotasCmd.count({ where: { exercicio: 2026 } });
  conferir(/já é bimestral/i.test(repetida) && depois === antes + 1, `repetir: recusado ("${repetida.trim().slice(0, 80)}"), nada gravado`);

  await irPara(n, page, "/planejamento/cmd-mba?exercicio=2026");
  const dominio = await acompanhamentoDasCotasCmd(prisma, { exercicio: 2026 });
  const fontes = new Map((await prisma.fonteRecurso.findMany({ select: { id: true, codigo: true } })).map((f) => [f.id, f.codigo]));
  const naTela = await page.$$eval("[data-saldo-do-periodo]", (els) => els.map((e) => [e.getAttribute("data-saldo-do-periodo") ?? "", (e as HTMLElement).innerText.trim()]));
  const outubro = dominio.filter((l) => l.mes === 10 && (l.previsto !== "0.00" || l.realizado !== "0.00"));
  // A tela escreve o negativo entre parênteses (convenção contábil); compara-se o módulo e o sinal.
  const emTexto = (v: string): string => {
    const neg = v.startsWith("-");
    const [i = "0", d = "00"] = (neg ? v.slice(1) : v).split(".");
    const corpo = `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
    return neg ? `(${corpo})` : corpo;
  };
  const divergentes: string[] = [];
  const confere = outubro.every((l) => {
    const t = naTela.find(([k]) => k === `${fontes.get(l.fonteId) ?? ""}-10`);
    const ok = l.periodo === "9 a 10" && t !== undefined && t[1].includes(emTexto(l.saldoDoPeriodo));
    if (!ok) divergentes.push(`${fontes.get(l.fonteId) ?? l.fonteId}: domínio ${l.periodo} ${l.saldoDoPeriodo}, tela ${t?.[1] ?? "ausente"}`);
    return ok;
  });
  if (divergentes.length > 0) console.log(divergentes.slice(0, 5).join("\n"));
  const periodoNaTela = await page.$$eval("table", (ts) => ts.some((t) => (t as HTMLElement).innerText.toLowerCase().includes("set–out")));
  conferir(
    confere && (outubro.length === 0 || periodoNaTela),
    `acompanhamento: ${String(outubro.length)} linha(s) de outubro no bimestre set–out, com o saldo do período igual ao do domínio`
  );

  await declarar("MENSAL", "2026-10-06", `Decreto do percurso ${marca}-M`);
  const telaM = await vigenteNaTela();
  const historico = await prisma.periodicidadeDasCotasCmd.count({ where: { atoRef: { startsWith: `Decreto do percurso ${marca}` } } });
  conferir(telaM === "MENSAL" && historico === 2, `mensal na mesma data, gravada depois: o controle volta ao padrão (${telaM}) e os dois atos ficam (${String(historico)})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da periodicidade completo.");
