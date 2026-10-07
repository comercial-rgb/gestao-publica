import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { acompanhamentoDasCotasCmd } from "../modules/m02-planejamento/programacao.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA PERIODICIDADE DO CONTROLE DAS COTAS (TR 5.9.3.33), em /planejamento/cmd-mba, com os atos em
 * 01/11 (virada de bimestre e de mês; no empate de data vale o gravado por último, e a corrida não depende das
 * anteriores):
 *   bimestral desde 01/11 registrada pela tela e listada nos atos; repetir é recusado dizendo o motivo; trimestral em
 *   01/11 (meio do trimestre out–dez) é recusado dizendo que só muda na virada; nada gravado nas recusas; o
 *   acompanhamento mostra novembro no bimestre nov–dez com o saldo do período do domínio; mensal na mesma data volta o
 *   controle ao padrão. O efeito no empenho está nos testes do guard (m02-periodicidade-das-cotas).
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
const DATA = "2026-11-01";

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);
  const declarar = async (periodicidade: string, ato: string): Promise<string> => {
    await irPara(n, page, "/planejamento/cmd-mba?exercicio=2026");
    const r = await preencherEEnviar(page, "periodicidade-das-cotas", [
      { sel: 'select[name="periodicidade"]', valor: periodicidade, tipo: "select" },
      { sel: 'input[name="vigenteDesde"]', valor: DATA, tipo: "data" },
      { sel: 'input[name="atoRef"]', valor: ato },
    ]);
    return r.texto;
  };
  const atosNaTela = async (): Promise<string> => {
    await irPara(n, page, "/planejamento/cmd-mba?exercicio=2026");
    return page.$eval("[data-atos-de-periodicidade]", (e) => (e as HTMLElement).innerText).catch(() => "");
  };
  const total = (): Promise<number> => prisma.periodicidadeDasCotasCmd.count({ where: { exercicio: 2026 } });

  await declarar("BIMESTRAL", `Decreto do percurso ${marca}-B`);
  const telaB = await atosNaTela();
  conferir(/bimestral desde 01\/11\/2026/i.test(telaB) && telaB.includes(`${marca}-B`), `bimestral desde 01/11 registrada pela tela e listada nos atos`);

  const antes = await total();
  const repetida = await declarar("BIMESTRAL", `Decreto do percurso ${marca}-R`);
  const meio = await declarar("TRIMESTRAL", `Decreto do percurso ${marca}-T`);
  conferir(
    /já é bimestral/i.test(repetida) && /só muda na virada de um período/i.test(meio) && (await total()) === antes,
    `repetir recusado ("${repetida.trim().slice(0, 60)}"); trimestral no meio do trimestre recusado ("${meio.trim().slice(0, 70)}"); nada gravado`
  );

  await irPara(n, page, "/planejamento/cmd-mba?exercicio=2026");
  const dominio = await acompanhamentoDasCotasCmd(prisma, { exercicio: 2026 });
  const fontes = new Map((await prisma.fonteRecurso.findMany({ select: { id: true, codigo: true } })).map((f) => [f.id, f.codigo]));
  const naTela = await page.$$eval("[data-saldo-do-periodo]", (els) => els.map((e) => [e.getAttribute("data-saldo-do-periodo") ?? "", (e as HTMLElement).innerText.trim()]));
  // A tela escreve o negativo entre parênteses (convenção contábil).
  const emTexto = (v: string): string => {
    const neg = v.startsWith("-");
    const [i = "0", d = "00"] = (neg ? v.slice(1) : v).split(".");
    const corpo = `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
    return neg ? `(${corpo})` : corpo;
  };
  const novembro = dominio.filter((l) => l.mes === 11 && (l.previsto !== "0.00" || l.realizado !== "0.00"));
  const divergentes = novembro.filter((l) => {
    const t = naTela.find(([k]) => k === `${fontes.get(l.fonteId) ?? ""}-11`);
    return !(l.periodo === "11 a 12" && t !== undefined && t[1].includes(emTexto(l.saldoDoPeriodo)));
  });
  const rotulo = await page.$$eval("table", (ts) => ts.some((t) => (t as HTMLElement).innerText.toLowerCase().includes("nov–dez")));
  conferir(
    novembro.length > 0 && divergentes.length === 0 && rotulo,
    `acompanhamento: ${String(novembro.length)} linha(s) de novembro no bimestre nov–dez, saldo do período igual ao do domínio${divergentes.length > 0 ? ` (divergem ${String(divergentes.length)})` : ""}`
  );

  await declarar("MENSAL", `Decreto do percurso ${marca}-M`);
  const telaM = await atosNaTela();
  const ultimo = await prisma.periodicidadeDasCotasCmd.findFirst({ where: { exercicio: 2026 }, orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }], select: { periodicidade: true } });
  conferir(ultimo?.periodicidade === "MENSAL" && telaM.includes(`${marca}-M`), `mensal na mesma data, gravado depois: volta o controle de novembro ao padrão (${ultimo?.periodicidade ?? "-"}), e os atos ficam listados`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da periodicidade completo.");
