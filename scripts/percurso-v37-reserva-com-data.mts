import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — PERCURSO DA RESERVA COM DATA DO FATO, pela tela da ficha:
 *   1. a reserva se grava com a data informada, e o movimento da dotação nasce com essa competência (não a da gravação);
 *   2. a lista de reservas da ficha mostra a data do fato;
 *   3. uma reserva datada antes do exercício ter disponível é recusada com o motivo, e nada se grava.
 * Escreve na base fictícia (uma reserva de 1,00).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v37-reserva-com-data.mts
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

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);
  // A ficha de 2026 de maior disponível (a reserva de 1,00 cabe em qualquer data depois da dotação inicial).
  const fichas = await prisma.fichaOrcamentaria.findMany({ where: { exercicio: 2026 }, select: { id: true, numero: true, saldoAutorizado: true, saldoReservado: true, saldoEmpenhado: true } });
  const livre = (f: (typeof fichas)[number]) => f.saldoAutorizado.minus(f.saldoReservado).minus(f.saldoEmpenhado);
  const ficha = [...fichas].sort((a, b) => livre(b).comparedTo(livre(a)))[0];
  if (ficha === undefined || !livre(ficha).greaterThan(1)) throw new Error("sem ficha de 2026 com disponível");
  const marca = String(Date.now()).slice(-6);

  // ── 1 e 2: a reserva com data do fato ──
  await irPara(n, page, `/planejamento/fichas/${ficha.id}`);
  const r = await preencherEEnviar(page, "reservar-dotacao", [
    { sel: 'input[name="valor"]', valor: "1,00" },
    { sel: 'input[name="data"]', valor: "2026-09-15", tipo: "data" },
    { sel: 'input[name="historico"]', valor: `Reserva com data do percurso ${marca}` },
  ]);
  const criada = await prisma.reservaDotacao.findFirst({ where: { historico: `Reserva com data do percurso ${marca}` }, select: { id: true, data: true } });
  const mov = criada === null ? null : await prisma.movimentoDotacao.findFirst({ where: { origemId: criada.id, tipo: "RESERVA" }, select: { competencia: true, competenciaDerivada: true } });
  conferir(
    r.tipo === "ok" && criada?.data !== null && criada?.data !== undefined && diaCivil(criada.data) === "2026-09-15" && mov !== null && diaCivil(mov.competencia) === "2026-09-15" && !mov.competenciaDerivada,
    `reserva de 1,00 na ficha ${String(ficha.numero)} gravada com a data 15/09/2026, e o movimento com essa competência (${r.texto.slice(0, 60)})`
  );
  await irPara(n, page, `/planejamento/fichas/${ficha.id}`);
  const tela = await page.$eval("main", (m) => m.textContent ?? "");
  conferir(tela.includes(`Reserva com data do percurso ${marca}`) && tela.includes("15/09/2026"), "a lista de reservas da ficha mostra a data do fato");

  // ── 3: uma data sem disponível ──
  const antes = await prisma.reservaDotacao.count();
  const recusa = await preencherEEnviar(page, "reservar-dotacao", [
    { sel: 'input[name="valor"]', valor: "1,00" },
    { sel: 'input[name="data"]', valor: "2025-12-31", tipo: "data" },
    { sel: 'input[name="historico"]', valor: `Reserva fora do exercício ${marca}` },
  ]);
  conferir(recusa.tipo === "erro" && (await prisma.reservaDotacao.count()) === antes, `a reserva com data sem disponível é recusada, e nada se grava (${recusa.texto.slice(0, 120)})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da reserva com data completo.");
