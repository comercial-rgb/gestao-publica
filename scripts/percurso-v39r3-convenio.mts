import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { Decimal } from "../packages/contracts/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-025, V39-076) — PELA TELA: O CONVÊNIO RECEBIDO, DO INGRESSO À DEVOLUÇÃO.
 *
 * Pré-requisito: a massa da R3 (seção 11: a receita R3-CONV-REC-001 de R$ 30.000,00 na fonte 571, os roteiros de controle,
 * os convênios R3-CONV-A (20.000) e R3-CONV-B (15.000) e a gestora de convênios; a consulta de convênios).
 *   1. quem só consulta convênios abre o detalhe e não recebe as ações;
 *   2. a gestora libera a parcela 1 de A, R$ 20.000,00, ligada à receita;
 *   3. tenta liberar R$ 15.000,00 de B ligada à MESMA receita: recusado — passa do que entrou (30.000 − 20.000);
 *   4. libera a parcela 1 de B com R$ 10.000,00 (o resto da receita);
 *   5. em A: aprova a prestação de R$ 18.000,00, glosa R$ 2.000,00 e registra a devolução dos R$ 2.000,00;
 *   6. confere por SQL: o ligado à receita = o arrecadado; e o razão de controle de A: 18.000 aprovados, 2.000
 *      impugnados e baixados pela devolução, direitos conveniados com o saldo devedor de 18.000.
 * GRAVA (base de ensaio). Os passos já feitos numa corrida anterior são ditos, não contados.
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

const receita = await prisma.receitaArrecadada.findFirst({ where: { exercicio: 2026, numeroReceita: "R3-CONV-REC-001" }, select: { id: true, valor: true } });
const a = await prisma.convenio.findFirst({ where: { identificador: "R3-CONV-A/2026" }, select: { id: true } });
const b = await prisma.convenio.findFirst({ where: { identificador: "R3-CONV-B/2026" }, select: { id: true } });
if (receita === null || a === null || b === null) throw new Error("A massa da R3 não tem a receita R3-CONV-REC-001 e os convênios R3-CONV-A/B.");
const movimento = (convenioId: string, tipo: "LIBERACAO_DE_PARCELA" | "PRESTACAO_APROVADA" | "GLOSA" | "DEVOLUCAO") =>
  prisma.movimentoConvenio.findMany({ where: { convenioId, tipo, estornos: { none: {} } }, select: { valor: true, parcela: true } });

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. quem só consulta ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "consulta.convenios@ficticio.local", senha);
  await irPara(n, pc, `/transferencias/convenios/${a.id}`);
  const titulo = await pc.$eval("h1", (e) => e.textContent ?? "").catch(() => "");
  const formsC = await pc.$$('form[data-acao="liberar-parcela"], form[data-acao="aprovar-prestacao"], form[data-acao="glosar"], form[data-acao="registrar-devolucao"]');
  conferir(titulo.includes("R3-CONV-A") && formsC.length === 0, `quem só consulta abre o convênio (${titulo.trim().slice(0, 50)}) e não recebe as ações`);
  await ctxC.close();

  // ── 2 a 5. a gestora ──
  const ctx = await nav.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await entrar(n, p, "convenios@ficticio.local", senha);
  const liberar = async (convenioId: string, parcela: string, valor: string) => {
    await irPara(n, p, `/transferencias/convenios/${convenioId}`);
    return preencherEEnviar(p, 'form[data-acao="liberar-parcela"]', [
      { sel: 'input[name="parcela"]', valor: parcela },
      { sel: '[data-mascara="valor"]', valor },
      { sel: 'input[name="diaMovimento"]', valor: "2026-08-10", tipo: "data" },
      { sel: 'input[name="competencia"]', valor: "2026-08" },
      { sel: 'select[name="receitaArrecadadaId"]', valor: receita.id, tipo: "select" },
      { sel: 'input[name="motivo"]', valor: "Parcela recebida do Estado (ensaio)" },
    ]);
  };
  if ((await movimento(a.id, "LIBERACAO_DE_PARCELA")).length === 0) {
    const r = await liberar(a.id, "1", "20000,00");
    const lib = await movimento(a.id, "LIBERACAO_DE_PARCELA");
    conferir(r.tipo === "ok" && lib.length === 1 && lib[0]?.valor.toFixed(2) === "20000.00", `A: parcela 1 de R$ 20.000,00 liberada, ligada à receita (${r.texto.slice(0, 60)})`);
  } else nota("A: a parcela 1 já estava liberada numa corrida anterior");

  const ligadoAntes = (await prisma.movimentoConvenio.findMany({ where: { receitaArrecadadaId: receita.id, estornos: { none: {} } }, select: { valor: true } })).reduce((s, x) => s.plus(x.valor.toString()), new Decimal(0));
  const excesso = await liberar(b.id, "9", "15000,00");
  const depois = await prisma.movimentoConvenio.count({ where: { convenioId: b.id, parcela: 9 } });
  conferir(
    excesso.tipo === "erro" && /A receita R3-CONV-REC-001 trouxe 30000\.00, já explica .* de outras liberações, e esta é de 15000\.00: passa do que entrou/.test(excesso.texto) && depois === 0,
    `B: R$ 15.000,00 da MESMA receita, que já explica ${ligadoAntes.toFixed(2)}: recusado, nada gravado (${excesso.texto.slice(0, 120)})`
  );

  if ((await movimento(b.id, "LIBERACAO_DE_PARCELA")).length === 0) {
    const r = await liberar(b.id, "1", "10000,00");
    conferir(r.tipo === "ok" && (await movimento(b.id, "LIBERACAO_DE_PARCELA")).length === 1, `B: parcela 1 de R$ 10.000,00 (o resto da receita) liberada (${r.texto.slice(0, 60)})`);
  } else nota("B: a parcela 1 já estava liberada numa corrida anterior");

  const ato = async (acao: string, valor: string, motivo: string) => {
    await irPara(n, p, `/transferencias/convenios/${a.id}`);
    return preencherEEnviar(p, `form[data-acao="${acao}"]`, [
      { sel: '[data-mascara="valor"]', valor },
      { sel: 'input[name="diaMovimento"]', valor: "2026-09-20", tipo: "data" },
      { sel: 'input[name="competencia"]', valor: "2026-09" },
      { sel: 'input[name="motivo"]', valor: motivo },
    ]);
  };
  if ((await movimento(a.id, "PRESTACAO_APROVADA")).length === 0) {
    const r1 = await ato("aprovar-prestacao", "18000,00", "Prestação de contas da reforma aprovada (ensaio)");
    const r2 = await ato("glosar", "2000,00", "Despesa sem nota fiscal na prestação (ensaio)");
    const r3 = await ato("registrar-devolucao", "2000,00", "Devolução do valor glosado ao Estado (ensaio)");
    conferir(r1.tipo === "ok" && r2.tipo === "ok" && r3.tipo === "ok", `A: prestação de R$ 18.000,00 aprovada, R$ 2.000,00 glosados e devolvidos (${r1.texto.slice(0, 40)} | ${r2.texto.slice(0, 40)} | ${r3.texto.slice(0, 40)})`);
  } else nota("A: prestação, glosa e devolução já registradas numa corrida anterior");
  await ctx.close();
} finally {
  await nav.close();
}

// ── 6. SQL, independente das telas ──
const ligado = (await prisma.movimentoConvenio.findMany({ where: { receitaArrecadadaId: receita.id, estornos: { none: {} } }, select: { valor: true } })).reduce((s, x) => s.plus(x.valor.toString()), new Decimal(0));
conferir(ligado.equals(new Decimal(receita.valor.toString())), `a receita explica exatamente o que entrou: ligado ${ligado.toFixed(2)} = arrecadado ${receita.valor.toFixed(2)}`);
const partidas = await prisma.partidaContabil.findMany({ where: { lancamento: { origemId: a.id, origemTipo: { startsWith: "CONVENIO_" } } }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } });
const saldo = new Map<string, Decimal>();
for (const x of partidas) saldo.set(x.conta.codigo, (saldo.get(x.conta.codigo) ?? new Decimal(0)).plus(new Decimal(x.valor.toString()).times(x.tipo === "DEBITO" ? 1 : -1)));
const s = (c: string): string => (saldo.get(c) ?? new Decimal(0)).toFixed(2);
// à mão: direitos D 18.000 + D 2.000 − C 2.000 = 18.000 devedor; aprovados C 18.000; impugnados C 2.000 − D 2.000 = 0
conferir(s("7.1.1.2.1.01.00") === "18000.00" && s("8.1.1.2.1.01.04") === "-18000.00" && s("8.1.1.2.1.01.05") === "0.00", `razão de controle de A: direitos ${s("7.1.1.2.1.01.00")}, aprovados ${s("8.1.1.2.1.01.04")}, impugnados ${s("8.1.1.2.1.01.05")}`);
await prisma.$disconnect();
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do convênio completo.");
