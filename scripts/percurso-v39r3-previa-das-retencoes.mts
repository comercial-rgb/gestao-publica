import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { toMoney } from "../packages/contracts/index.js";
import { diaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-014, V39-027) — PELA TELA: A PRÉVIA DAS RETENÇÕES GUARDADA NA LIQUIDAÇÃO.
 *
 * Pré-requisito: a massa da R3 (liquidação R3-EXP-L1 de material de expediente, o perfil fiscal do fornecedor) e as
 * tabelas oficiais da retenção carregadas (scripts/carregar-tabelas-da-retencao.ts).
 *   1. a liquidante abre a prévia pela lista de liquidações, escolhe a natureza do IR e calcula: a tela mostra o IR
 *      pela alíquota da tabela oficial (conferida no banco, em Decimal) e NADA é gravado;
 *   2. guarda a prévia: nova versão, sem lançamento contábil e sem consignação; a tela a mostra como a vigente;
 *   3. quem só consulta a despesa vê a prévia e não recebe o formulário;
 *   4. o tesoureiro vê, no pagamento, a oferta de reaproveitar a prévia; paga com ela e, sem a decisão do ente sobre o
 *      IR retido como receita própria, a recusa vem nomeada e nenhum pagamento é gravado.
 * GRAVA (base de ensaio ou demonstração). Cada corrida acrescenta uma versão.
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
const liq = await prisma.liquidacao.findFirst({ where: { numero: "R3-EXP-L1" }, select: { id: true, valor: true, empenho: { select: { ficha: { select: { fonteId: true } } } } } });
if (liq === null) throw new Error("A massa da R3 não está nesta base (liquidação R3-EXP-L1).");
const natureza = await prisma.naturezaDaRetencaoDoIR.findFirst({ where: { codigoReceita: "6147" }, orderBy: { vigenteDesde: "desc" }, select: { aliquota: true } });
if (natureza === null) throw new Error("As tabelas oficiais da retenção não estão nesta base (natureza 6147 do IR).");
// O esperado vem da tabela, em Decimal: valor da liquidação × alíquota, em centavos.
const irEsperado = toMoney(toMoney(liq.valor.toFixed(2)).times(natureza.aliquota.toString()).toDecimalPlaces(2)).toFixed(2);
const rota = `/despesa/liquidacoes/${liq.id}/retencoes`;
const hoje = diaCivil(new Date());
const contar = async () => ({
  previas: await prisma.previaDeRetencaoDaLiquidacao.count({ where: { liquidacaoId: liq.id } }),
  lancamentos: await prisma.lancamentoContabil.count(),
  movimentos: await prisma.movimentoExtraorcamentario.count(),
  pagamentos: await prisma.pagamento.count({ where: { liquidacaoId: liq.id } }),
});

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1 e 2. a liquidante ──
  const ctxA = await nav.createBrowserContext();
  const pa = await ctxA.newPage();
  pa.setDefaultTimeout(300000);
  await entrar(n, pa, "liquidante@ficticio.local", senha);
  await irPara(n, pa, "/despesa/liquidacoes?exercicio=2026");
  const link = await pa.$(`a[href="${rota}"]`);
  conferir(link !== null, "a lista de liquidações oferece \"Prévia das retenções\" para R3-EXP-L1");
  await irPara(n, pa, rota);
  const antes = await contar();
  const form = 'form[data-acao="guardar-previa-de-retencao"]';
  await pa.select(`${form} select[name="rcNaturezaIR"]`, "6147");
  await pa.click(`${form} [data-acao="calcular-retencoes"]`);
  await pa.waitForSelector(`${form} [data-previa-das-retencoes] [data-tributo="IRRF"]`, { timeout: 120000 });
  const calculado = await pa.$eval(`${form} [data-tributo="IRRF"] [data-valor]`, (e) => e.getAttribute("data-valor") ?? "");
  const depoisDoCalculo = await contar();
  conferir(calculado === irEsperado && depoisDoCalculo.previas === antes.previas, `calcular mostra o IR ${calculado} (tabela oficial: ${irEsperado}) e não grava nada`);

  const r = await preencherEEnviar(pa, "guardar-previa-de-retencao", [{ sel: 'select[name="rcNaturezaIR"]', valor: "6147", tipo: "select" }]);
  const depois = await contar();
  const ultima = await prisma.previaDeRetencaoDaLiquidacao.findFirst({ where: { liquidacaoId: liq.id }, orderBy: { versao: "desc" }, select: { versao: true, totalPrevisto: true, criadoPor: true, valorPrevisto: true } });
  conferir(
    r.tipo === "ok" && depois.previas === antes.previas + 1 && ultima?.totalPrevisto.toFixed(2) === irEsperado && ultima.criadoPor === "liquidante@ficticio.local" && ultima.valorPrevisto.toFixed(2) === liq.valor.toFixed(2),
    `guardar grava a versão ${String(ultima?.versao ?? "?")} com retenção prevista ${ultima?.totalPrevisto.toFixed(2) ?? "?"} (${r.texto.slice(0, 90)})`,
  );
  conferir(depois.lancamentos === antes.lancamentos && depois.movimentos === antes.movimentos, "a prévia não lança nada no razão nem cria consignação");
  await irPara(n, pa, rota);
  const vigente = await pa.$eval('[data-vigente="sim"]', (e) => `${e.getAttribute("data-previa-versao") ?? ""}|${(e.textContent ?? "").replace(/\s+/g, " ")}`).catch(() => "");
  conferir(vigente.startsWith(`${String(ultima?.versao ?? "?")}|`) && vigente.includes("Retido") && vigente.includes("liquidante@ficticio.local"), `depois de recarregar, a tela mostra a versão vigente com a memória (${vigente.slice(0, 120)})`);
  await ctxA.close();

  // ── 3. quem só consulta ──
  const ctxB = await nav.createBrowserContext();
  const pb = await ctxB.newPage();
  pb.setDefaultTimeout(300000);
  await entrar(n, pb, "conferente.despesa@ficticio.local", senha);
  await irPara(n, pb, rota);
  const temPrevia = (await pb.$('[data-vigente="sim"]')) !== null;
  const temForm = (await pb.$(form)) !== null;
  const aviso = (await pb.content()).includes("Guardar uma prévia cabe a quem liquida a despesa");
  conferir(temPrevia && !temForm && aviso, "quem só consulta vê a prévia, não recebe o formulário e lê por quê");
  await ctxB.close();

  // ── 4. o tesoureiro ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "tesoureiro@ficticio.local", senha);
  await irPara(n, pc, `/despesa/pagamentos?exercicio=2026&liquidacao=${liq.id}`);
  const fp = 'form[data-acao="pagar"]';
  await pc.waitForSelector(`${fp} [data-usar-previa]`, { timeout: 60000 }).catch(() => null);
  const oferta = await pc.$eval(`${fp} [data-usar-previa]`, (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
  conferir(/Usar os dados fiscais da prévia guardada na liquidação \(versão \d+/.test(oferta), `o pagamento oferece reaproveitar a prévia (${oferta.slice(0, 110)})`);
  const conta = await prisma.contaBancaria.findFirst({ where: { fonteId: liq.empenho.ficha.fonteId, contaContabilId: { not: null } }, orderBy: { codigo: "asc" }, select: { codigo: true } });
  if (conta === null) throw new Error("a base não tem conta bancária da fonte da ficha");
  const antesDoPagamento = await contar();
  const pedeJustificativa = (await pc.$(`${fp} select[name="hipotese"]`)) !== null;
  const justificativa: Parameters<typeof preencherEEnviar>[2][number][] = [];
  if (pedeJustificativa) {
    const hipotese = await pc.$eval(`${fp} select[name="hipotese"]`, (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
    justificativa.push({ sel: 'select[name="hipotese"]', valor: hipotese, tipo: "select" }, { sel: 'textarea[name="justificativa"], input[name="justificativa"]', valor: "Percurso de ensaio da prévia das retenções." }, { sel: 'input[name="autorizadoPor"]', valor: "Secretário de Finanças (fictício)" });
  }
  const rp = await preencherEEnviar(pc, "pagar", [
    ...justificativa,
    { sel: 'input[name="numero"]', valor: String(Date.now()).slice(-6) },
    { sel: '[data-mascara="valor"]', valor: liq.valor.toFixed(2).replace(".", ",") },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'select[name="contaBancaria"]', valor: conta.codigo, tipo: "select" },
    { sel: 'input[name="historico"]', valor: "Pagamento do material de expediente pela prévia (ensaio)" },
    { sel: 'input[name="usarPrevia"]', valor: "sim", tipo: "marcar" },
  ]);
  if (rp.tipo === "silencio") {
    const invalidos = await pc.$$eval(`${fp} :invalid`, (els) => els.map((e) => `${e.getAttribute("name") ?? e.tagName}: ${(e as HTMLInputElement).validationMessage}`));
    console.log(`(campos inválidos no envio: ${invalidos.join("; ") || "nenhum"})`);
  }
  const depoisDoPagamento = await contar();
  conferir(
    rp.tipo === "erro" && /imposto do próprio município.*ainda não disse com que natureza de receita/.test(rp.texto) && depoisDoPagamento.pagamentos === antesDoPagamento.pagamentos && depoisDoPagamento.lancamentos === antesDoPagamento.lancamentos,
    `pagar pela prévia sem a decisão do ente sobre o IR como receita própria: recusado com o motivo, nada gravado (${rp.tipo}: ${rp.texto.slice(0, 160)})`,
  );
  await ctxC.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da prévia das retenções completo.");
