import "dotenv/config";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-003/004/005 — A CONTINUIDADE DE UMA CONCILIAÇÃO ENCERRADA, PELA TELA, SEM TOCAR NO ENCERRAMENTO.
 *
 * O cenário é o da FIC-PM-500 de produção (ou a conta de `PERCURSO_CONTA`): um período ENCERRADO com pendências que
 * passaram adiante. O percurso:
 *   1. lê o período encerrado (o último da conta) e fotografa o que a tela mostra dele: saldos, diferença, pendências;
 *   2. abre o período SEGUINTE, começando no dia civil seguinte ao fim do encerrado (a data vem da tela, não do relógio);
 *   3. vincula, no painel da conta, o PAR de pendências herdadas de mesmo valor — uma do extrato, uma do razão (a caução
 *      que estava dos dois lados). Par ambíguo (mais de um com o mesmo valor) RECUSA: o percurso não escolhe por chute;
 *   4. justifica cada pendência que sobrou com um motivo PRÓPRIO, montado do dado dela (data, descrição, valor);
 *   5. confere que o período encerrado mostra EXATAMENTE o que mostrava antes (o encerramento não muda) e que os saldos
 *      do novo período não mudaram com o vínculo (vínculo não é lançamento: nada entra duas vezes);
 *   6. tenta encerrar o novo período e confere a RECUSA, porque ele ainda não terminou (V39-008).
 * GRAVA: um período aberto, um vínculo e as justificativas. NÃO encerra nada. O destino e a natureza da base são
 * conferidos pelo `entrar` (V39-002). Para quando o período encerrado ainda não terminou no relógio: um vínculo gravado
 * antes do fim do último dia mudaria o relatório encerrado.
 *
 * Uso: BASE=... PERCURSO_CONTA=FIC-PM-500 [PERCURSO_FIM=AAAA-MM-DD] npx tsx scripts/percurso-v39-continuidade-da-conciliacao.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const CONTA = process.env["PERCURSO_CONTA"] ?? "FIC-PM-500";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const br = (dia: string): string => dia.split("-").reverse().join("/");
const doBr = (d: string): string => d.split("/").reverse().join("-");
const diaSeguinte = (dia: string): string => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const fimDoMes = (dia: string): string => {
  const d = new Date(`${dia.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

interface Foto {
  readonly saldos: string;
  readonly pendencias: readonly string[];
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, usuario, senha);

  await irPara(n, page, "/financeiro/conciliacao/periodo");
  const contaId = await page.$$eval('form[data-acao="abrir-conciliacao"] select[name="conta"] option', (os, c) => os.find((o) => (o.textContent ?? "").startsWith(c as string))?.getAttribute("value") ?? "", CONTA);
  if (contaId === "") throw new Error(`A conta ${CONTA} não está entre as contas da conciliação.`);
  const listaHref = `/financeiro/conciliacao/periodo?conta=${contaId}`;
  await irPara(n, page, listaHref);
  const periodos = await page.$$eval("li[data-periodo]", (ls) => ls.map((l) => ({ id: l.getAttribute("data-periodo") ?? "", texto: (l.textContent ?? "").replace(/\s+/g, " ").trim(), href: l.querySelector("a")?.getAttribute("href") ?? "" })));
  const encerrados = periodos.filter((p) => p.texto.includes("encerrada"));
  const abertos = periodos.filter((p) => !p.texto.includes("encerrada"));
  // o último encerrado: o de fim mais tardio
  const fimDe = (t: string): string => doBr(/a (\d{2}\/\d{2}\/\d{4})/.exec(t)?.[1] ?? "00/00/0000");
  const anterior = [...encerrados].sort((a, b) => fimDe(b.texto).localeCompare(fimDe(a.texto)))[0];
  if (anterior === undefined) throw new Error(`A conta ${CONTA} não tem período encerrado; não há continuidade a ensaiar.`);
  const fimAnterior = fimDe(anterior.texto);
  const inicio = diaSeguinte(fimAnterior);
  conferir(true, `período encerrado de ${CONTA}: ${anterior.texto}; o seguinte começa em ${br(inicio)}`);
  // O relatório encerrado lê os vínculos "como estavam no fim do período": antes de esse dia acabar, vincular o mudaria.
  if (diaCivil(new Date()) <= fimAnterior) throw new Error(`Recusado: o período encerrado termina em ${br(fimAnterior)} e esse dia ainda não acabou; um vínculo agora mudaria o relatório encerrado.`);

  const fotografar = async (href: string): Promise<Foto> => {
    await irPara(n, page, href);
    const saldos = await page.$eval("[data-conciliacao] dl", (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());
    const pendencias = await page.$$eval("[data-pendencia-extrato], [data-pendencia-interna]", (ls) => ls.map((l) => `${l.getAttribute("data-pendencia-extrato") ?? l.getAttribute("data-pendencia-interna") ?? ""} ${(l.querySelector("div")?.textContent ?? "").replace(/\s+/g, " ").trim()}`).sort());
    return { saldos, pendencias };
  };
  const antes = await fotografar(anterior.href);
  conferir(antes.pendencias.length > 0, `foto do encerrado: ${antes.saldos}; ${String(antes.pendencias.length)} pendência(s)`);

  // ── 2. o período seguinte (ou o já aberto, se uma corrida anterior parou depois de abrir) ──
  const fim = process.env["PERCURSO_FIM"] ?? fimDoMes(inicio);
  let novoHref = abertos.find((p) => p.texto.startsWith(br(inicio)))?.href ?? "";
  if (novoHref === "") {
    const ra = await preencherEEnviar(page, "abrir-conciliacao", [
      { sel: 'select[name="conta"]', valor: contaId, tipo: "select" },
      { sel: 'input[name="inicio"]', valor: inicio, tipo: "data" },
      { sel: 'input[name="fim"]', valor: fim, tipo: "data" },
    ]);
    await irPara(n, page, listaHref);
    novoHref = (await page.$$eval("li[data-periodo]", (ls, i) => ls.find((l) => (l.textContent ?? "").includes(i as string))?.querySelector("a")?.getAttribute("href") ?? "", br(inicio)));
    conferir(ra.tipo === "ok" && novoHref !== "", `período seguinte aberto pela tela: ${br(inicio)} a ${br(fim)} (${ra.texto.slice(0, 80)})`);
  } else conferir(true, `período seguinte já aberto (retomado): ${novoHref}`);
  if (novoHref === "") throw new Error("sem o período seguinte, o percurso não segue");

  await irPara(n, page, novoHref);
  const herdadas = await page.$$eval("li[data-herdada]", (ls) => ls.map((l) => ({ chave: l.getAttribute("data-herdada") ?? "", texto: (l.textContent ?? "").replace(/\s+/g, " ").trim(), residual: (l.querySelector("span.tabular-nums")?.textContent ?? "").trim() })));
  conferir(herdadas.length === antes.pendencias.length, `o seguinte herda ${String(herdadas.length)} pendência(s) do encerrado, que tinha ${String(antes.pendencias.length)}`);
  const saldosAntesDoVinculo = await page.$eval("[data-conciliacao] dl", (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());

  // ── 3. o par de mesmo valor, um de cada lado ──
  const doExtrato = herdadas.filter((h) => h.chave.startsWith("EXTRATO:"));
  const doRazao = herdadas.filter((h) => !h.chave.startsWith("EXTRATO:"));
  const pares = doExtrato.flatMap((e) => doRazao.filter((r) => r.residual === e.residual).map((r) => ({ e, r })));
  const valoresRepetidos = pares.filter((p) => pares.filter((q) => q.e.residual === p.e.residual).length > 1);
  if (pares.length === 0) console.log("   nenhum par de mesmo valor entre extrato e razão: nada a vincular");
  if (valoresRepetidos.length > 0) throw new Error(`Recusado: mais de um par com o mesmo valor (${valoresRepetidos.map((p) => p.e.residual).join(", ")}); o vínculo precisa de escolha, não de chute.`);
  for (const { e, r } of pares) {
    await irPara(n, page, `/financeiro/conciliacao?exercicio=${inicio.slice(0, 4)}&conta=${contaId}`);
    const linha = e.chave.slice("EXTRATO:".length);
    const temLinha = await page.$$eval('form[data-acao="vincular-conciliacao"] select[name="linhaDoExtrato"] option', (os, v) => os.some((o) => o.getAttribute("value") === v), linha);
    const temRegistro = await page.$$eval('form[data-acao="vincular-conciliacao"] select[name="registroDoSistema"] option', (os, v) => os.some((o) => o.getAttribute("value") === v), r.chave);
    if (!temLinha || !temRegistro) {
      conferir(false, `o painel da conta oferece a linha (${temLinha ? "sim" : "não"}) e o registro (${temRegistro ? "sim" : "não"}) do par de ${e.residual}`);
      continue;
    }
    const rv = await preencherEEnviar(page, "vincular-conciliacao", [
      { sel: 'select[name="linhaDoExtrato"]', valor: linha, tipo: "select" },
      { sel: 'select[name="registroDoSistema"]', valor: r.chave, tipo: "select" },
    ]);
    conferir(rv.tipo === "ok", `vínculo pela tela do par de ${e.residual}: extrato "${e.texto.slice(0, 60)}" com razão "${r.texto.slice(0, 60)}" (${rv.texto.slice(0, 80)})`);
  }

  // ── 4. uma justificativa própria por pendência que sobrou ──
  await irPara(n, page, novoHref);
  const sobra = await page.$$eval("[data-pendencia-extrato], [data-pendencia-interna]", (ls) =>
    ls.map((l) => ({
      ref: l.getAttribute("data-pendencia-extrato") ?? l.getAttribute("data-pendencia-interna") ?? "",
      lado: l.hasAttribute("data-pendencia-extrato") ? "EXTRATO" : "RAZAO",
      dia: l.getAttribute("data-dia") ?? "",
      texto: (l.querySelector("div > span")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      residual: (l.querySelector("div > span.tabular-nums")?.textContent ?? "").trim(),
    })),
  );
  const paresVinculados = pares.length;
  conferir(sobra.length === herdadas.length - 2 * paresVinculados, `sobraram ${String(sobra.length)} pendência(s) depois do vínculo (eram ${String(herdadas.length)})`);
  const motivos: string[] = [];
  for (const p of sobra) {
    const valor = p.residual.replace("-", "");
    const motivo =
      p.lado === "EXTRATO"
        ? `Débito/crédito de R$ ${valor} lançado pelo banco em ${br(p.dia)} sem registro correspondente no razão até o fim do período; a contabilizar (demonstração).`
        : `Registro de R$ ${valor} de ${br(p.dia)} (${p.texto.replace(/^\d{2}\/\d{2}\/\d{4} /, "").slice(0, 60)}) ainda não compensado pelo banco no período (demonstração).`;
    motivos.push(motivo);
    const r = await preencherEEnviar(page, `form[data-acao="justificar-pendencia"]:has(input[name="referencia"][value="${p.ref}"])`, [{ sel: 'input[name="motivo"]', valor: motivo }]);
    conferir(r.tipo === "ok", `justificada pela tela: ${p.texto.slice(0, 70)} (${p.residual})`);
    await irPara(n, page, novoHref);
  }
  conferir(new Set(motivos).size === motivos.length, `cada pendência com motivo próprio (${String(motivos.length)} motivo(s) distintos)`);

  // ── 5. o encerrado não mudou; o vínculo não duplicou saldo ──
  const depois = await fotografar(anterior.href);
  conferir(depois.saldos === antes.saldos && JSON.stringify(depois.pendencias) === JSON.stringify(antes.pendencias), "o período encerrado mostra exatamente o que mostrava antes (saldos e pendências)");
  await irPara(n, page, novoHref);
  const saldosDepois = await page.$eval("[data-conciliacao] dl", (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());
  const semDiferenca = (s: string): string => s.replace(/Diferença.*$/, "");
  conferir(semDiferenca(saldosDepois) === semDiferenca(saldosAntesDoVinculo), `os saldos do novo período não mudaram com o vínculo (${semDiferenca(saldosDepois)})`);

  // ── 6. o novo período ainda não terminou: encerrar é recusado pelo serviço ──
  if (fim >= diaCivil(new Date())) {
    const re = await preencherEEnviar(page, "encerrar-conciliacao", []);
    conferir(re.tipo === "erro" && /ainda não acabou/.test(re.texto), `encerrar antes do fim é recusado: ${re.texto.slice(0, 120)}`);
    await irPara(n, page, novoHref);
    const estado = await page.$eval("[data-estado]", (e) => e.getAttribute("data-estado") ?? "").catch(() => "");
    conferir(estado === "ABERTA", `o período seguinte continua ABERTO: ${estado}`);
  }
  console.log(`   período seguinte: ${n.base}${novoHref}`);
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da continuidade completo.");
