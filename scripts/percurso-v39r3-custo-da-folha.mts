import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { Decimal } from "../packages/contracts/index.js";
import { janelaCivilDoAno } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-021, V39-056) — PELA TELA: O CUSTO DA FOLHA COM A PARCELA SEM CENTRO DE CUSTO.
 *
 * Pré-requisito: a massa da R3 (seção 8: FIC-0001 com centro de custo desde janeiro, FIC-0002 sem; o contador de custos e
 * a consulta da contabilidade). Cada corrida usa a competência mais recente em que as duas matrículas ainda não foram
 * apropriadas.
 *   1. quem só consulta a contabilidade vê o custo e não recebe o formulário de apropriar a folha;
 *   2. o contador apropria a liquidação de FIC-0001: vai inteira ao centro, nada sem centro;
 *   3. apropria a de FIC-0002: a mensagem diz o valor sem centro e a matrícula; nada vai a centro nenhum;
 *   4. a tela mostra a linha "Sem centro de custo" com o que o banco guardou, o total apropriado = centros + sem centro,
 *      e a lista com FIC-0002, a liquidação e o empenho.
 * GRAVA (base de ensaio).
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
const br = (v: string): string => {
  const [i = "0", d = "00"] = v.split(".");
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d.padEnd(2, "0").slice(0, 2)}`;
};

// A competência mais recente com as duas matrículas sem apropriação, no grupo de vencimentos.
const liqs = await prisma.liquidacaoDaFolha.findMany({
  where: { liquidacao: { apropriacoesDeCusto: { none: {} } }, empenhoDaFolha: { vinculo: { matricula: { in: ["FIC-0001", "FIC-0002"] } }, grupo: { codigo: "FIC-VENC" } } },
  select: { liquidacaoId: true, liquidacao: { select: { valor: true } }, empenhoDaFolha: { select: { vinculo: { select: { matricula: true } }, apropriacao: { select: { folha: { select: { competencia: true } } } } } } },
});
const porCompetencia = new Map<string, Map<string, { id: string; valor: string }>>();
for (const l of liqs) {
  const c = l.empenhoDaFolha.apropriacao.folha.competencia;
  const m = porCompetencia.get(c) ?? new Map<string, { id: string; valor: string }>();
  m.set(l.empenhoDaFolha.vinculo?.matricula ?? "", { id: l.liquidacaoId, valor: l.liquidacao.valor.toFixed(2) });
  porCompetencia.set(c, m);
}
const competencia = [...porCompetencia.entries()].filter(([, m]) => m.has("FIC-0001") && m.has("FIC-0002")).map(([c]) => c).sort().at(-1);
if (competencia === undefined) throw new Error("Não há competência com FIC-0001 e FIC-0002 ainda sem apropriação de custo nesta base.");
const A = porCompetencia.get(competencia)!.get("FIC-0001")!;
const B = porCompetencia.get(competencia)!.get("FIC-0002")!;
console.log(`competência ${competencia}: FIC-0001 R$ ${A.valor}, FIC-0002 R$ ${B.valor}`);

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. quem só consulta ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "consulta.contabilidade@ficticio.local", senha);
  await irPara(n, pc, "/contabilidade/custos");
  const veTitulo = (await pc.$eval("h1", (e) => e.textContent ?? "").catch(() => "")).includes("Custo por centro");
  const temForm = (await pc.$('form[data-acao="apropriar-custo-da-folha"]')) !== null;
  conferir(veTitulo && !temForm, "quem só consulta a contabilidade vê o custo por centro e não recebe o formulário de apropriar a folha");
  await ctxC.close();

  // ── 2 e 3. o contador apropria ──
  const ctx = await nav.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await entrar(n, p, "custos.contabilidade@ficticio.local", senha);
  const apropriar = async (liquidacaoId: string) => {
    await irPara(n, p, "/contabilidade/custos");
    await p.$eval('details[data-forma="custo-da-folha"]', (e) => { (e as HTMLDetailsElement).open = true; });
    return preencherEEnviar(p, 'form[data-acao="apropriar-custo-da-folha"]', [{ sel: 'select[name="liquidacaoId"]', valor: liquidacaoId, tipo: "select" }], "apropriar-custo-da-folha");
  };
  const ra = await apropriar(A.id);
  const apA = await prisma.apropriacaoDeCusto.findFirst({ where: { liquidacaoId: A.id }, select: { itens: { select: { valor: true } }, semCentro: { select: { valor: true } } } });
  conferir(ra.tipo === "ok" && !/Sem centro/.test(ra.texto) && apA?.itens.length === 1 && apA.itens[0]?.valor.toFixed(2) === A.valor && apA.semCentro.length === 0, `FIC-0001 apropriada inteira ao centro, nada sem centro (${ra.texto.slice(0, 90)})`);
  const rb = await apropriar(B.id);
  const apB = await prisma.apropriacaoDeCusto.findFirst({ where: { liquidacaoId: B.id }, select: { itens: { select: { id: true } }, semCentro: { select: { valor: true, vinculo: { select: { matricula: true } } } } } });
  conferir(
    rb.tipo === "ok" && rb.texto.includes(`Sem centro de custo na competência: R$ ${B.valor} (matrícula(s) FIC-0002)`) && apB?.itens.length === 0 && apB.semCentro.length === 1 && apB.semCentro[0]?.valor.toFixed(2) === B.valor && apB.semCentro[0]?.vinculo.matricula === "FIC-0002",
    `FIC-0002 apropriada à parcela sem centro, com a matrícula na mensagem (${rb.texto.slice(0, 140)})`
  );

  // ── 4. a tela de custo do exercício ──
  const ano = Number(competencia.slice(0, 4));
  await irPara(n, p, `/contabilidade/custos?exercicio=${String(ano)}`);
  const janela = janelaCivilDoAno(ano);
  const naTela = async (sel: string) => (await p.$eval(sel, (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).catch(() => ""));
  const somaSem = (await prisma.parcelaSemCentroDeCusto.findMany({ where: { apropriacao: { competencia: { gte: janela.inicio, lte: janela.fim } } }, select: { valor: true } })).reduce((s, x) => s.plus(x.valor.toFixed(2)), new Decimal(0));
  const somaCentros = (await prisma.itemDaApropriacaoDeCusto.findMany({ where: { apropriacao: { competencia: { gte: janela.inicio, lte: janela.fim } } }, select: { valor: true } })).reduce((s, x) => s.plus(x.valor.toFixed(2)), new Decimal(0));
  const centavos = (c: Decimal): string => br(c.toFixed(2));
  const telaSem = await naTela(`[data-custo-sem-centro="${String(ano)}"]`);
  const telaTotal = await naTela(`[data-custo-total="${String(ano)}"]`);
  // o valor inteiro, não dentro de outro ("2.800,00" não casa em "12.800,00")
  const exato = (texto: string, valor: string): boolean => new RegExp(`(^|[^\\d.,])${valor.replace(/\./g, "\\.")}($|[^\\d])`).test(texto);
  conferir(exato(telaSem, centavos(somaSem)) && exato(telaTotal, centavos(somaSem.plus(somaCentros))), `a linha sem centro mostra ${centavos(somaSem)} e o total apropriado ${centavos(somaSem.plus(somaCentros))} = centros + sem centro (tela: ${telaSem} | ${telaTotal})`);
  const numeroB = (await prisma.liquidacao.findUniqueOrThrow({ where: { id: B.id }, select: { numero: true } })).numero;
  // FIC-0002 aparece uma vez por competência apropriada; a linha desta corrida é a da liquidação de agora.
  const linhasB = await p.$$eval('[data-matricula-sem-centro="FIC-0002"]', (es) => es.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()));
  const linhaB = linhasB.find((t) => t.includes(numeroB)) ?? "";
  conferir(linhaB.includes("FIC-0002") && linhaB.includes(numeroB) && linhaB.includes(br(B.valor)), `a lista de quem está sem centro tem FIC-0002, a liquidação ${numeroB} e o valor (${linhaB.slice(0, 100)})`);
  await ctx.close();

  // ── 5. quem só consulta, DEPOIS da apropriação sem centro ──
  // Medido na base refeita do zero: antes de haver parcela sem centro, a tela não mostra o quadro (nem resumo, nem lista),
  // e a conferência no começo passava ou falhava conforme a base já tivesse uma apropriação de corrida anterior.
  const ctxC2 = await nav.createBrowserContext();
  const pc2 = await ctxC2.newPage();
  pc2.setDefaultTimeout(300000);
  await entrar(n, pc2, "consulta.contabilidade@ficticio.local", senha);
  await irPara(n, pc2, `/contabilidade/custos?exercicio=${String(ano)}`);
  const veResumo = (await pc2.$("[data-sem-centro-resumo]")) !== null;
  const veMatricula = (await pc2.$("[data-matricula-sem-centro]")) !== null;
  conferir(veResumo && !veMatricula, "sem consultar a folha, a lista por matrícula não aparece; aparece o resumo");
  await ctxC2.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do custo da folha completo.");
