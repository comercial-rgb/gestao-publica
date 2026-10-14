import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { Decimal } from "../packages/contracts/index.js";
import { fimDoDiaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-022, V39-072) — PELA TELA: A POSIÇÃO MENSAL DA FARMÁCIA CALCULADA DOS MOVIMENTOS.
 *
 * Pré-requisito: a massa da R3 (seção 9: Losartana e Metformina recebidas em 15/09/2026 no depósito da farmácia 9001;
 * o responsável pelo informe; o coordenador, que cadastra farmácia e não informa estoque).
 *   1. quem não informa estoque vê de onde vem a posição e não recebe os formulários de modo, código e cálculo;
 *   2. o responsável adota "calculada dos movimentos" a partir de 09/2026 (na primeira corrida);
 *   3. outubro ainda não terminou: o cálculo recusa;
 *   4. sem o código no informe, o cálculo de setembro recusa nomeando os dois medicamentos (na primeira corrida); o
 *      responsável declara os códigos (faixa de uso interno do GS1, prefixo 2 — nenhum produto real);
 *   5. calcula setembro: 2 produtos, com as quantidades conferidas contra a soma dos movimentos feita aqui, por SQL;
 *   6. digitar o estoque de setembro é recusado (o mês é calculado); a lista mostra a origem.
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
const nota = (o: string): void => console.log(`--  ${o}`);
const CODIGOS = { R3MED003: ["2000000000015", "LOSARTANA 50MG COMPRIMIDO"], R3MED004: ["2000000000022", "METFORMINA 850MG COMPRIMIDO"] } as const;

const farmacia = await prisma.farmaciaPublica.findFirst({ where: { codigo: "9001" }, select: { id: true } });
const deposito = await prisma.deposito.findFirst({ where: { codigo: "FARM-R3" }, select: { id: true } });
if (farmacia === null || deposito === null) throw new Error("A massa da R3 não tem a farmácia 9001 com o depósito FARM-R3.");
const FARM = 'li[data-farmacia="9001"]';

// A posição esperada no fim de setembro, somada AQUI por SQL (independente do cálculo do sistema).
const sinal: Record<string, number> = { ENTRADA: 1, AJUSTE_ENTRADA: 1, ESTORNO_SAIDA: 1, SAIDA: -1, AJUSTE_SAIDA: -1, ESTORNO_ENTRADA: -1 };
const movs = await prisma.movimentoFisicoDeEstoque.findMany({ where: { depositoId: deposito.id, dataMovimento: { lte: fimDoDiaCivil("2026-09-30") } }, select: { tipo: true, quantidade: true, material: { select: { codigo: true } } } });
const esperado = new Map<string, Decimal>();
for (const m of movs) {
  if (sinal[m.tipo] === undefined) throw new Error(`tipo de movimento sem sinal neste percurso: ${m.tipo}`);
  esperado.set(m.material.codigo, (esperado.get(m.material.codigo) ?? new Decimal(0)).plus(new Decimal(m.quantidade.toString()).times(sinal[m.tipo]!)));
}
const esperadoPositivo = [...esperado.entries()].filter(([, q]) => q.greaterThan(0)).map(([c, q]) => [c, q.toFixed(2)] as const).sort();
console.log(`posição esperada em 30/09 (por SQL): ${esperadoPositivo.map(([c, q]) => `${c} ${q}`).join(", ")}`);

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. quem não informa estoque ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "coordenador.farmacia@ficticio.local", senha);
  await irPara(n, pc, "/patrimonio/farmacias");
  const modoVisto = await pc.$eval(`[data-modo-do-informe="9001"]`, (e) => e.textContent ?? "").catch(() => "");
  const formsC = await pc.$$(`${FARM} form[data-acao="adotar-modo-do-informe"], ${FARM} form[data-acao="calcular-posicao-da-farmacia"], ${FARM} form[data-acao="declarar-codigo-no-informe"], ${FARM} form[data-acao="informar-estoque-da-farmacia"]`);
  conferir(/Posição do mês:/.test(modoVisto) && formsC.length === 0, `quem não informa estoque vê de onde vem a posição (${modoVisto.trim()}) e não recebe nenhum dos formulários`);
  await ctxC.close();

  // ── 2 a 6. o responsável pelo informe ──
  const ctx = await nav.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await entrar(n, p, "informe.farmacia@ficticio.local", senha);
  const abrir = async () => {
    await irPara(n, p, "/patrimonio/farmacias");
    await p.$$eval(`${FARM} details`, (ds) => ds.forEach((d) => { (d as HTMLDetailsElement).open = true; }));
  };
  const jaAdotado = await prisma.modoDoInformeAdotado.findFirst({ where: { farmaciaId: farmacia.id, desdeAno: 2026, desdeMes: 9 }, select: { modo: true } });
  if (jaAdotado === null) {
    await abrir();
    const r = await preencherEEnviar(p, `form[data-acao="adotar-modo-do-informe"][data-farmacia="9001"]`, [
      { sel: 'select[name="modo"]', valor: "CALCULADO", tipo: "select" },
      { sel: 'input[name="desde"]', valor: "2026-09", tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "Decisão da coordenação: a posição vem do estoque do sistema (ensaio)" },
    ], "adotar-modo-do-informe");
    const gravado = await prisma.modoDoInformeAdotado.findFirst({ where: { farmaciaId: farmacia.id, desdeAno: 2026, desdeMes: 9 }, select: { modo: true, criadoPor: true } });
    conferir(r.tipo === "ok" && gravado?.modo === "CALCULADO" && gravado.criadoPor === "informe.farmacia@ficticio.local", `adotada a posição calculada a partir de 09/2026 (${r.texto.slice(0, 90)})`);
  } else nota(`o modo de 09/2026 já estava adotado numa corrida anterior (${jaAdotado.modo})`);

  await abrir();
  const outubro = await preencherEEnviar(p, `form[data-acao="calcular-posicao-da-farmacia"][data-farmacia="9001"]`, [{ sel: 'input[name="mes"]', valor: "2026-10", tipo: "data" }], "calcular-posicao-da-farmacia");
  conferir(outubro.tipo === "erro" && /O mês 10\/2026 ainda não terminou/.test(outubro.texto), `outubro ainda aberto: recusado com o motivo (${outubro.texto.slice(0, 90)})`);

  const semCodigo = await prisma.material.findMany({ where: { codigo: { in: ["R3MED003", "R3MED004"] }, codigosNoInforme: { none: {} } }, select: { codigo: true } });
  if (semCodigo.length === 2) {
    await abrir();
    const antes = await prisma.informeDeEstoqueDaFarmacia.count({ where: { farmaciaId: farmacia.id, ano: 2026, mes: 9 } });
    const r = await preencherEEnviar(p, `form[data-acao="calcular-posicao-da-farmacia"][data-farmacia="9001"]`, [{ sel: 'input[name="mes"]', valor: "2026-09", tipo: "data" }], "calcular-posicao-da-farmacia");
    const depois = await prisma.informeDeEstoqueDaFarmacia.count({ where: { farmaciaId: farmacia.id, ano: 2026, mes: 9 } });
    conferir(r.tipo === "erro" && /Os materiais R3MED003, R3MED004 têm estoque no fim de 09\/2026 e não têm o código do produto no informe declarado/.test(r.texto) && antes === depois, `sem o código no informe, setembro recusa nomeando os dois medicamentos (${r.texto.slice(0, 110)})`);
    for (const [codigo, [gtin, descricao]] of Object.entries(CODIGOS)) {
      await abrir();
      const d = await preencherEEnviar(p, `form[data-acao="declarar-codigo-no-informe"][data-material="${codigo}"]`, [
        { sel: 'input[name="codigoProduto"]', valor: gtin },
        { sel: 'input[name="descricao"]', valor: descricao },
        { sel: 'input[name="fundamento"]', valor: "Código de uso interno da base de ensaio" },
      ], "declarar-codigo-no-informe");
      conferir(d.tipo === "ok", `código ${gtin} declarado para ${codigo} (${d.texto.slice(0, 60)})`);
    }
  } else nota(`os códigos no informe já estavam declarados numa corrida anterior (faltavam ${String(semCodigo.length)})`);

  await abrir();
  const setembro = await preencherEEnviar(p, `form[data-acao="calcular-posicao-da-farmacia"][data-farmacia="9001"]`, [{ sel: 'input[name="mes"]', valor: "2026-09", tipo: "data" }], "calcular-posicao-da-farmacia");
  const informe = await prisma.informeDeEstoqueDaFarmacia.findFirst({ where: { farmaciaId: farmacia.id, ano: 2026, mes: 9, origem: "CALCULADO" }, orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select: { criadoPor: true, itens: { orderBy: { codigoProduto: "asc" }, select: { codigoProduto: true, quantidade: true } } } });
  const porMaterial = new Map(Object.entries(CODIGOS).map(([m, [g]]) => [g, m]));
  const calculado = (informe?.itens ?? []).map((i) => [porMaterial.get(i.codigoProduto) ?? i.codigoProduto, i.quantidade.toFixed(2)] as const).sort();
  conferir(
    setembro.tipo === "ok" && JSON.stringify(calculado) === JSON.stringify(esperadoPositivo) && calculado.length === 2 && informe?.criadoPor === "informe.farmacia@ficticio.local",
    `setembro calculado pela tela: ${calculado.map(([c, q]) => `${c} ${q}`).join(", ")} = a soma dos movimentos por SQL (${setembro.texto.slice(0, 90)})`
  );

  await abrir();
  const digitado = await preencherEEnviar(p, `form[data-acao="informar-estoque-da-farmacia"][data-farmacia="9001"]`, [
    { sel: 'input[name="mes"]', valor: "2026-09", tipo: "data" },
    { sel: 'input[name="fundamento"]', valor: "Inventário manual de setembro (ensaio)" },
    { sel: 'textarea[name="produtos"]', valor: "2000000000015;LOSARTANA 50MG;CP;999" },
  ], "informar-estoque-da-farmacia");
  conferir(digitado.tipo === "erro" && /calcula a posição pelos movimentos desde 09\/2026; em 09\/2026 o estoque não se digita/.test(digitado.texto), `digitar setembro é recusado: o mês é calculado (${digitado.texto.slice(0, 100)})`);

  await irPara(n, p, "/patrimonio/farmacias");
  const lista = await p.$$eval(`${FARM} [data-lista="informes-de-estoque"] li`, (ls) => ls.map((l) => (l.textContent ?? "").replace(/\s+/g, " ").trim()));
  conferir(lista.some((t) => /^09\/2026 — 2 produto\(s\), calculado dos movimentos, em .*\d$/.test(t)), `a lista mostra setembro calculado dos movimentos, valendo (${lista.slice(0, 2).join(" | ")})`);
  await ctx.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da posição calculada da farmácia completo.");
