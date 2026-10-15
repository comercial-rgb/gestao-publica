import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { Decimal } from "../packages/contracts/index.js";
import { inicioDoDiaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-024) — PELA TELA: O ENCERRAMENTO DE 2026 E A ABERTURA DE 2027, NUM EXERCÍCIO ISOLADO.
 *
 * Só na cópia `gestao_publica_esperanca_r3_encerramento` (CREATE DATABASE ... TEMPLATE da R3), preparada por
 * `scripts/demonstracao/preparar-encerramento-r3.mts`: R3-ENC-001 de 1.000,00 com 400,00 liquidados, R3-ENC-002 de
 * 500,00 sem liquidação, as contas do controle dos restos declaradas, a contadora do encerramento e quem anula empenho.
 *   1. quem anula empenho anula 250,00 de R3-ENC-001 (conferir, depois confirmar) e não recebe o encerramento;
 *   2. a contadora tenta encerrar com a confirmação errada: recusado, nada gravado; encerra 2026;
 *   3. apura o resultado; tenta virar os controles sem classificar as contas: recusado com o que falta; classifica cada
 *      conta com o destino sugerido pela tela e vira;
 *   4. abre 2027 pela proposta orçamentária;
 *   5. SQL: as inscrições dos dois empenhos, feitas AQUI à mão (R3-ENC-001: processado 400,00 e não processado
 *      1.000,00 − 250,00 − 400,00 = 350,00; R3-ENC-002: não processado 500,00); a abertura de cada uma em 01/01/2027
 *      nas contas do controle; os saldos de destino em 2027 iguais à soma das inscrições por tipo; classes 3 e 4 zeradas
 *      em 2026; as contas que encerram zeradas e as que transferem com saldo.
 * GRAVA. Passos já feitos são ditos, não contados.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3013" };
if (!/:3013\b/.test(n.base)) throw new Error("Recusado: este percurso encerra o exercício e só roda na 3013, a cópia do encerramento.");
await exigirDestinoDoPercurso(n.base);
const url = process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "";
if (new URL(url).pathname !== "/gestao_publica_esperanca_r3_encerramento") throw new Error("Recusado: o banco do percurso não é a cópia do encerramento.");
const prisma = criarPrismaClient(url);
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const nota = (o: string): void => console.log(`--  ${o}`);

const empenho = async (numero: string) => {
  const e = await prisma.empenho.findFirst({ where: { numero, anulacaoParcialDeId: null, estornoDeId: null }, select: { id: true } });
  if (e === null) throw new Error(`A cópia não tem o empenho ${numero}: rode a preparação.`);
  return e.id;
};
const E1 = await empenho("R3-ENC-001/2026");
const E2 = await empenho("R3-ENC-002/2026");
const encerrado = async (): Promise<boolean> => (await prisma.encerramentoExercicio.count({ where: { exercicio: { ano: 2026 } } })) > 0;

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. quem anula empenho ──
  const ctxA = await nav.createBrowserContext();
  const pa = await ctxA.newPage();
  pa.setDefaultTimeout(300000);
  await entrar(n, pa, "anulacao.despesa@ficticio.local", senha);
  const parciais = await prisma.empenho.count({ where: { anulacaoParcialDeId: E1 } });
  if (parciais === 0 && !(await encerrado())) {
    await irPara(n, pa, "/despesa/anulacoes?tipo=empenho&exercicio=2026");
    const linha = `tr[data-anulavel="${E1}"]`;
    await pa.click(`${linha} details summary`);
    const valor = await pa.$(`${linha} input[data-mascara="valor"]`);
    await valor?.click({ count: 3 });
    await pa.keyboard.press("Backspace");
    await valor?.type("250,00");
    await pa.type(`${linha} input[name="motivo"]`, "redução do serviço de manutenção (ensaio)");
    await pa.$eval(`${linha} input[name="data"]`, (el) => {
      const i = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(i, "2026-10-07");
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await pa.click(`${linha} button[type="button"]`);
    await pa.waitForSelector(`${linha} [data-conferencia-da-anulacao]`);
    const conferencia = await pa.$eval(`${linha} [data-conferencia-da-anulacao]`, (e) => (e.textContent ?? "").replace(/\s+/g, " "));
    await pa.waitForSelector(`${linha} input[name="__chave"][data-chave-de-comando="pronta"]`);
    await pa.click(`${linha} button[type="submit"]`);
    await pa.waitForSelector(`${linha} [data-resultado-da-acao="anular-empenho"]`, { timeout: 120000 });
    const resultado = await pa.$eval(`${linha} [data-resultado-da-acao="anular-empenho"]`, (e) => (e.textContent ?? "").replace(/\s+/g, " "));
    const feita = await prisma.empenho.findFirst({ where: { anulacaoParcialDeId: E1 }, select: { valor: true, criadoPor: true } });
    conferir(/parcial/.test(conferencia) && /registrada/.test(resultado) && feita?.valor.toFixed(2) === "250.00" && feita.criadoPor === "anulacao.despesa@ficticio.local", `R3-ENC-001 anulado em 250,00 depois de conferir (${conferencia.slice(0, 70)} | ${resultado.slice(0, 50)})`);
  } else nota("a anulação parcial de R3-ENC-001 já estava feita numa corrida anterior");
  await irPara(n, pa, "/despesa/restos-a-pagar?exercicio=2026");
  conferir((await pa.$('form[data-acao="encerrar-exercicio"]')) === null, "quem anula empenho não recebe o formulário de encerrar o exercício");
  await ctxA.close();

  // ── 2 a 4. a contadora do encerramento ──
  const ctx = await nav.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await entrar(n, p, "encerramento@ficticio.local", senha);
  if (!(await encerrado())) {
    await irPara(n, p, "/despesa/restos-a-pagar?exercicio=2026");
    const errado = await preencherEEnviar(p, "encerrar-exercicio", [{ sel: 'input[name="confirmacao"]', valor: "2025" }]);
    conferir(errado.tipo === "erro" && !(await encerrado()) && (await prisma.inscricaoRestosAPagar.count({ where: { exercicioOrigem: 2026 } })) === 0, `confirmação errada: recusado, nada gravado (${errado.texto.slice(0, 90)})`);
    await irPara(n, p, "/despesa/restos-a-pagar?exercicio=2026");
    const r = await preencherEEnviar(p, "encerrar-exercicio", [{ sel: 'input[name="confirmacao"]', valor: "2026" }]);
    conferir(r.tipo === "ok" && (await encerrado()), `2026 encerrado pela tela (${r.texto.slice(0, 120)})`);
  } else nota("2026 já estava encerrado nesta cópia, de uma corrida anterior");

  const apurado = (await prisma.lancamentoContabil.count({ where: { origemTipo: { contains: "APURACAO" }, dataTransacao: { lt: inicioDoDiaCivil("2027-01-01") } } })) > 0;
  if (!apurado) {
    await irPara(n, p, "/despesa/restos-a-pagar?exercicio=2026");
    const r = await preencherEEnviar(p, "apurar-resultado", [{ sel: 'input[name="confirmacao"]', valor: "2026" }]);
    conferir(r.tipo === "ok", `resultado de 2026 apurado pela tela (${r.texto.slice(0, 120)})`);
  } else nota("o resultado de 2026 já estava apurado");

  await irPara(n, p, "/contabilidade/virada-dos-controles?exercicio=2026");
  const semDestino = await p.$$eval("[data-destino-da-conta]", (tds) => tds.filter((t) => /Sem destino/.test(t.textContent ?? "")).map((t) => ({ conta: t.getAttribute("data-destino-da-conta") ?? "", sugestao: /sugestão:\s*(ENCERRA|TRANSFERE)/.exec(t.textContent ?? "")?.[1] ?? "" })));
  const virado = (await prisma.lancamentoContabil.count({ where: { origemTipo: { contains: "ENCERRAMENTO_CONTROLES" } } })) > 0;
  if (!virado && semDestino.length > 0) {
    const antes = await prisma.lancamentoContabil.count();
    const cedo = await preencherEEnviar(p, "encerrar-controles", [{ sel: 'input[name="confirmacao"]', valor: "2026" }]);
    conferir(cedo.tipo === "erro" && /^5\.2\.1\.1\.1\.00\.00 \(saldo 258517240\.00\).*Toda conta das classes 5 e 6 COM SALDO/.test(cedo.texto) && (await prisma.lancamentoContabil.count()) === antes, `virar com ${String(semDestino.length)} conta(s) sem destino: recusado, nada lançado (${cedo.texto.slice(0, 110)})`);
    for (const c of semDestino) {
      await irPara(n, p, "/contabilidade/virada-dos-controles?exercicio=2026");
      const r = await preencherEEnviar(p, "classificar-conta-na-virada", [
        { sel: 'select[name="contaCodigo"]', valor: c.conta, tipo: "select" },
        { sel: 'select[name="destino"]', valor: c.sugestao, tipo: "select" },
        { sel: 'textarea[name="justificativa"]', valor: `Destino sugerido pela tela para a conta ${c.conta}, aceito na base de ensaio (ensaio)` },
      ]);
      if (r.tipo !== "ok") conferir(false, `classificar ${c.conta} como ${c.sugestao} (${r.texto.slice(0, 100)})`);
    }
    conferir((await prisma.contaNaVirada.count()) >= semDestino.length, `${String(semDestino.length)} conta(s) classificadas pela tela com o destino sugerido`);
  } else nota(virado ? "os controles de 2026 já estavam virados" : "nenhuma conta sem destino");
  if (!virado) {
    await irPara(n, p, "/contabilidade/virada-dos-controles?exercicio=2026");
    const r = await preencherEEnviar(p, "encerrar-controles", [{ sel: 'input[name="confirmacao"]', valor: "2026" }]);
    conferir(r.tipo === "ok", `controles de 2026 virados pela tela (${r.texto.slice(0, 120)})`);
  }

  if ((await prisma.exercicio.count({ where: { ano: 2027 } })) === 0) {
    const proposta = await prisma.propostaOrcamentaria.findFirst({ where: { exercicio: 2027 }, orderBy: { criadoEm: "desc" }, select: { id: true } });
    if (proposta === null) throw new Error("A cópia não tem a proposta de 2027 da massa da R3.");
    await irPara(n, p, `/planejamento/proposta-orcamentaria/${proposta.id}`);
    const r = await preencherEEnviar(p, "abrir-exercicio", []);
    conferir(r.tipo === "ok" && (await prisma.exercicio.count({ where: { ano: 2027 } })) === 1, `2027 aberto pela proposta orçamentária (${r.texto.slice(0, 100)})`);
  } else nota("2027 já estava aberto");
  await ctx.close();
} finally {
  await nav.close();
}

// ── 5. SQL ──
const insc = await prisma.inscricaoRestosAPagar.findMany({ where: { exercicioOrigem: 2026 }, select: { id: true, empenhoId: true, tipo: true, valorInscrito: true } });
const de = (empenhoId: string, tipo: string): string => insc.filter((i) => i.empenhoId === empenhoId && i.tipo === tipo).map((i) => i.valorInscrito.toFixed(2)).join(",") || "-";
conferir(de(E1, "PROCESSADO") === "400.00" && de(E1, "NAO_PROCESSADO") === "350.00", `R3-ENC-001: processado ${de(E1, "PROCESSADO")} (esperado 400,00), não processado ${de(E1, "NAO_PROCESSADO")} (esperado 1.000,00 − 250,00 − 400,00 = 350,00)`);
conferir(de(E2, "PROCESSADO") === "-" && de(E2, "NAO_PROCESSADO") === "500.00", `R3-ENC-002: só não processado ${de(E2, "NAO_PROCESSADO")} (esperado 500,00)`);

const declaracao = await prisma.declaracaoDoControleDosRestos.findFirst({ orderBy: { versao: "desc" }, select: { contas: { select: { papel: true, conta: { select: { codigo: true } } } } } });
const contaDo = (papel: string): string => declaracao?.contas.find((c) => c.papel === papel)?.conta.codigo ?? "";
const RPNP_INSCRITOS = contaDo("RPNP_INSCRITOS");
const RPP_INSCRITOS = contaDo("RPP_INSCRITOS");
const somaPorTipo = (tipo: string): Decimal => insc.filter((i) => i.tipo === tipo).reduce((s, i) => s.plus(i.valorInscrito.toString()), new Decimal(0));
const saldoEm2027 = async (codigo: string): Promise<string> =>
  (await prisma.partidaContabil.findMany({ where: { conta: { codigo }, lancamento: { dataTransacao: { gte: inicioDoDiaCivil("2027-01-01") } } }, select: { tipo: true, valor: true } }))
    .reduce((s, x) => s.plus(new Decimal(x.valor.toString()).times(x.tipo === "DEBITO" ? 1 : -1)), new Decimal(0))
    .toFixed(2);
const nao = await saldoEm2027(RPNP_INSCRITOS);
const proc = await saldoEm2027(RPP_INSCRITOS);
conferir(nao === somaPorTipo("NAO_PROCESSADO").toFixed(2) && proc === somaPorTipo("PROCESSADO").toFixed(2), `destino em 2027: ${RPNP_INSCRITOS} = ${nao} (soma das inscrições não processadas ${somaPorTipo("NAO_PROCESSADO").toFixed(2)}); ${RPP_INSCRITOS} = ${proc} (processadas ${somaPorTipo("PROCESSADO").toFixed(2)})`);

const aberturaDe = async (empenhoId: string, tipo: string, conta: string): Promise<string> => {
  const i = insc.find((x) => x.empenhoId === empenhoId && x.tipo === tipo);
  if (i === undefined) return "-";
  const ctrl = await prisma.controleDoRestoAPagar.findMany({ where: { inscricaoId: i.id, evento: "ABERTURA" }, select: { exercicio: true, lancamento: { select: { dataTransacao: true, partidas: { where: { conta: { codigo: conta } }, select: { tipo: true, valor: true } } } } } });
  return ctrl.map((c) => `${String(c.exercicio)}:${c.lancamento.partidas.map((x) => `${x.tipo === "DEBITO" ? "D" : "C"} ${x.valor.toFixed(2)}`).join("+")}`).join(",");
};
const aE1p = await aberturaDe(E1, "PROCESSADO", RPP_INSCRITOS);
const aE1n = await aberturaDe(E1, "NAO_PROCESSADO", RPNP_INSCRITOS);
const aE2n = await aberturaDe(E2, "NAO_PROCESSADO", RPNP_INSCRITOS);
conferir(aE1p === "2027:D 400.00" && aE1n === "2027:D 350.00" && aE2n === "2027:D 500.00", `abertura em 2027 de cada inscrição: R3-ENC-001 P ${aE1p}, NP ${aE1n}; R3-ENC-002 NP ${aE2n}`);

const saldoAte = async (prefixo: string): Promise<string> =>
  (await prisma.partidaContabil.findMany({ where: { conta: { codigo: { startsWith: prefixo } }, lancamento: { dataTransacao: { lt: inicioDoDiaCivil("2027-01-01") } } }, select: { tipo: true, valor: true } }))
    .reduce((s, x) => s.plus(new Decimal(x.valor.toString()).times(x.tipo === "DEBITO" ? 1 : -1)), new Decimal(0))
    .toFixed(2);
const c3 = await saldoAte("3.");
const c4 = await saldoAte("4.");
conferir(c3 === "0.00" && c4 === "0.00", `classes 3 e 4 zeradas em 31/12/2026 pela apuração (3: ${c3}; 4: ${c4})`);

const viradas = await prisma.contaNaVirada.findMany({ select: { destino: true, conta: { select: { codigo: true } } } });
const restos: string[] = [];
for (const v of viradas) {
  const s = await saldoAte(v.conta.codigo);
  if (v.destino === "ENCERRA" && s !== "0.00") restos.push(`${v.conta.codigo} ENCERRA com ${s}`);
}
conferir(viradas.length > 0 && restos.length === 0, `as ${String(viradas.filter((v) => v.destino === "ENCERRA").length)} conta(s) que encerram ficam zeradas em 31/12/2026 ${restos.length > 0 ? `(${restos.join("; ")})` : ""}`);
await prisma.$disconnect();
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do encerramento completo.");
