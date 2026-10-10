import "dotenv/config";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V38 (AUD-050) — UMA CONCILIAÇÃO CONCLUÍDA PELA TELA, NA BASE DE DEMONSTRAÇÃO, COM PENDÊNCIAS TRATADAS.
 *
 * A contadora não achou conciliação feita para entender o comportamento. Este percurso monta o cenário e o conclui só
 * pela interface (nenhum acesso ao banco: roda igual na base local e na de produção, ambas fictícias):
 *   1. abre o período da conta (FIC-CM-500, ou a de `PERCURSO_CONTA`), de 1º de janeiro até hoje;
 *   2. lê na tela os fatos do razão no período (data, descrição, valor);
 *   3. gera um extrato OFX FICTÍCIO com esses fatos, MENOS a última saída (que o banco ainda não debitou), e MAIS uma
 *      tarifa que só o banco tem — os dois lados de uma conciliação real;
 *   4. importa o extrato pela tela e vincula cada linha ao fato do razão;
 *   5. justifica as duas pendências (a saída não debitada e a tarifa) e encerra o período.
 * GRAVA: um período de conciliação, um extrato com as linhas, os vínculos, as justificativas e o encerramento. Recusa a
 * 3010 e tela sem a marca "(base fictícia)". Se a conta já tem período, não executa.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v38-conciliacao-concluida.mts
 *      (produção: BASE=https://... PERCURSO_USUARIO=... PERCURSO_SENHA=...)
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
// A conta vem do ambiente: as bases fictícias não têm os mesmos fatos (em produção, a FIC-CM-500 não tem movimento).
const CONTA = process.env["PERCURSO_CONTA"] ?? "FIC-CM-500";
const MARCA = String(Date.now()).slice(-6);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const hoje = diaCivil(new Date());
const ano = hoje.slice(0, 4);

interface Fato {
  readonly ref: string;
  readonly dia: string;
  readonly descricao: string;
  /** O valor com sinal, como texto decimal ("-1000.00"): dinheiro não passa por ponto flutuante, nem no arquivo fictício. */
  readonly valor: string;
}

const saida = (v: string): boolean => v.startsWith("-");
const ascii = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "-");
const ofxData = (dia: string): string => dia.replace(/-/g, "") + "120000[-3:BRT]";

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, usuario, senha);

  // A base tem de ser a de demonstração: a marca aparece no cabeçalho.
  await irPara(n, page, "/financeiro/conciliacao/periodo");
  const marca = await page.evaluate(() => document.body.innerText.includes("base fictícia"));
  if (!marca) throw new Error('Recusado: a tela não mostra "(base fictícia)". Este percurso só grava na base de demonstração.');

  const contaId = await page.$$eval('form[data-acao="abrir-conciliacao"] select[name="conta"] option', (os, c) => os.find((o) => (o.textContent ?? "").startsWith(c as string))?.getAttribute("value") ?? "", CONTA);
  if (contaId === "") throw new Error(`A conta ${CONTA} não está entre as contas da conciliação.`);
  await irPara(n, page, `/financeiro/conciliacao/periodo?conta=${contaId}`);
  const periodos = await page.$$eval("li[data-periodo]", (ls) => ls.map((l) => (l.textContent ?? "").replace(/\s+/g, " ").trim()));
  // Um período ENCERRADO da conta é o cenário pronto: não se refaz. Um ABERTO (uma corrida que parou) é retomado.
  const encerrado = periodos.some((x) => x.includes("encerrada"));
  if (encerrado || periodos.length > 1) {
    console.log(`NAO EXECUTADO: a conta ${CONTA} já tem período(s) de conciliação: ${periodos.join("; ")}`);
  } else {
    // ── 1. abrir o período (ou retomar o aberto) ──
    const ra = periodos.length === 1 ? { tipo: "ok", texto: `retomado: ${periodos[0] ?? ""}` } : await preencherEEnviar(page, "abrir-conciliacao", [
      { sel: 'select[name="conta"]', valor: contaId, tipo: "select" },
      { sel: 'input[name="inicio"]', valor: `${ano}-01-01`, tipo: "data" },
      { sel: 'input[name="fim"]', valor: hoje, tipo: "data" },
    ]);
    await irPara(n, page, `/financeiro/conciliacao/periodo?conta=${contaId}`);
    const periodoHref = await page.$eval("li[data-periodo] a", (a) => a.getAttribute("href") ?? "").catch(() => "");
    conferir(ra.tipo === "ok" && periodoHref !== "", `período de ${CONTA} aberto pela tela, de 01/01/${ano} a hoje (${ra.texto.slice(0, 60)})`);
    if (periodoHref === "") throw new Error("sem período, o percurso não segue");

    // ── 2. os fatos do razão no período, lidos da tela ──
    // A tela do período mostra cada pendência do razão com a data, a descrição e o residual (texto decimal com sinal).
    await irPara(n, page, periodoHref);
    const lidas = await page.$$eval("li[data-pendencia-interna]", (ls) =>
      ls.map((l) => ({
        ref: l.getAttribute("data-pendencia-interna") ?? "",
        dia: l.getAttribute("data-dia") ?? "",
        texto: (l.querySelector("div > span")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        residual: (l.querySelector("div > span.tabular-nums")?.textContent ?? "").trim(),
      }))
    );
    const refs = lidas.map((l) => l.ref);
    const fatos: Fato[] = lidas
      .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.dia) && /^-?\d+\.\d{2}$/.test(l.residual))
      .map((l) => ({ ref: l.ref, dia: l.dia, descricao: l.texto.replace(/^\d{2}\/\d{2}\/\d{4} \[[A-Z_]+\] /, ""), valor: l.residual }));
    fatos.sort((a, b) => a.dia.localeCompare(b.dia));
    const saidas = fatos.filter((f) => saida(f.valor));
    const naoDebitada = saidas[saidas.length - 1];
    conferir(fatos.length >= 2 && fatos.length === refs.length && naoDebitada !== undefined, `(${String(refs.length)} pendência(s) na tela do período) ${String(fatos.length)} fato(s) do razão no período lidos da tela (${fatos.map((f) => `${f.dia} ${f.valor}`).join(", ")})`);
    if (naoDebitada === undefined || fatos.length < 2) throw new Error("o cenário pede ao menos dois fatos e uma saída");

    // ── 3. o extrato fictício: todos os fatos menos a última saída, mais uma tarifa só do banco ──
    const noBanco = fatos.filter((f) => f !== naoDebitada);
    const diaTarifa = fatos[fatos.length - 1]!.dia;
    const transacoes = [
      // O MEMO em ASCII, como o cabeçalho declara (ENCODING:USASCII): medido na corrida de produção, o travessão da
      // descrição virou caractere de controle e a linha não se achou para o vínculo.
      ...noBanco.map((f, i) => ({ fitid: `DEMO-${MARCA}-${String(i + 1)}`, dia: f.dia, valor: f.valor, memo: ascii(`DEMO ${f.descricao}`).slice(0, 60) })),
      { fitid: `DEMO-${MARCA}-TAR`, dia: diaTarifa, valor: "-8.90", memo: `DEMO TARIFA PACOTE DE SERVICOS` },
    ];
    const ofx = [
      "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
      "<OFX>", "<SIGNONMSGSRSV1>", "<SONRS>", "<STATUS>", "<CODE>0", "<SEVERITY>INFO", "</STATUS>", `<DTSERVER>${ofxData(hoje)}`, "<LANGUAGE>POR", "</SONRS>", "</SIGNONMSGSRSV1>",
      "<BANKMSGSRSV1>", "<STMTTRNRS>", "<TRNUID>0", "<STATUS>", "<CODE>0", "<SEVERITY>INFO", "</STATUS>", "<STMTRS>", "<CURDEF>BRL",
      "<BANKACCTFROM>", "<BANKID>001", `<ACCTID>DEMO-${CONTA}`, "<ACCTTYPE>CHECKING", "</BANKACCTFROM>",
      "<BANKTRANLIST>", `<DTSTART>${ano}0101`, `<DTEND>${hoje.replace(/-/g, "")}`,
      ...transacoes.flatMap((t) => ["<STMTTRN>", `<TRNTYPE>${saida(t.valor) ? "DEBIT" : "CREDIT"}`, `<DTPOSTED>${ofxData(t.dia)}`, `<TRNAMT>${t.valor}`, `<FITID>${t.fitid}`, `<MEMO>${t.memo}`, "</STMTTRN>"]),
      "</BANKTRANLIST>", "</STMTRS>", "</STMTTRNRS>", "</BANKMSGSRSV1>", "</OFX>", "",
    ].join("\r\n");
    const arquivo = join(mkdtempSync(join(tmpdir(), "demo-conciliacao-")), `extrato-demonstracao-${MARCA}.ofx`);
    writeFileSync(arquivo, ofx, "latin1");

    // ── 4. importar e vincular ──
    await irPara(n, page, `/financeiro/conciliacao?exercicio=${ano}`);
    const FI = 'form[data-acao="importar-extrato"]';
    await page.select(`${FI} select[name="contaBancaria"]`, CONTA);
    const input = await page.$(`${FI} input[type="file"]`);
    await (input as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(arquivo);
    await page.waitForSelector(`${FI} input[name="__chave"][data-chave-de-comando="pronta"]`);
    await page.click(`${FI} button[type="submit"]`);
    await page.waitForSelector(`${FI} [data-resultado-da-acao="importar-extrato"]`, { timeout: 120000 });
    const ri = await page.$eval(`${FI} [data-resultado-da-acao="importar-extrato"]`, (e) => ({ erro: e.getAttribute("role") === "alert", texto: e.textContent ?? "" }));
    conferir(!ri.erro, `extrato fictício importado pela tela: ${String(transacoes.length)} linha(s) (${ri.texto.slice(0, 70)})`);

    let vinculados = 0;
    for (const [i, f] of noBanco.entries()) {
      await irPara(n, page, `/financeiro/conciliacao?exercicio=${ano}`);
      const memo = transacoes[i]!.memo;
      const linha = await page.$$eval('form[data-acao="vincular-conciliacao"] select[name="linhaDoExtrato"] option', (os, m) => os.find((o) => (o.textContent ?? "").includes(m as string))?.getAttribute("value") ?? "", memo);
      // O painel geral é o da conta do extrato mais recente — depois da importação, esta. O registro é "TIPO:id".
      const registro = await page.$$eval('form[data-acao="vincular-conciliacao"] select[name="registroDoSistema"] option', (os, r) => os.find((o) => (o.getAttribute("value") ?? "").endsWith(`:${r as string}`))?.getAttribute("value") ?? "", f.ref);
      if (linha === "" || registro === "") {
        console.log(`   vínculo ${f.dia} ${f.valor}: linha do extrato ${linha === "" ? "não achada" : "ok"}, registro ${registro === "" ? "não achado" : "ok"}`);
        continue;
      }
      const rv = await preencherEEnviar(page, "vincular-conciliacao", [
        { sel: 'select[name="linhaDoExtrato"]', valor: linha, tipo: "select" },
        { sel: 'select[name="registroDoSistema"]', valor: registro, tipo: "select" },
      ]);
      if (rv.tipo === "ok") vinculados += 1;
      else console.log(`   vínculo ${f.dia} ${f.valor}: ${rv.tipo} ${rv.texto.slice(0, 120)}`);
    }
    conferir(vinculados === noBanco.length, `${String(vinculados)} de ${String(noBanco.length)} linha(s) do extrato vinculada(s) ao fato do razão pela tela`);

    // ── 5. justificar as duas pendências e encerrar ──
    await irPara(n, page, periodoHref);
    const pendentesInternas = await page.$$eval("[data-pendencia-interna]", (ls) => ls.map((l) => l.getAttribute("data-pendencia-interna") ?? ""));
    const pendentesExtrato = await page.$$eval("[data-pendencia-extrato]", (ls) => ls.map((l) => l.getAttribute("data-pendencia-extrato") ?? ""));
    const refNaoDebitada = naoDebitada.ref;
    conferir(
      pendentesInternas.length === 1 && pendentesInternas[0] === refNaoDebitada && pendentesExtrato.length === 1,
      `sobraram as duas pendências do cenário: a saída de ${naoDebitada.dia} que o banco não debitou e a tarifa que só o banco tem`
    );
    const justificar = async (referencia: string, motivo: string): Promise<boolean> => {
      await irPara(n, page, periodoHref);
      const r = await preencherEEnviar(page, `form[data-acao="justificar-pendencia"]:has(input[name="referencia"][value="${referencia}"])`, [{ sel: 'input[name="motivo"]', valor: motivo }]);
      return r.tipo === "ok";
    };
    const j1 = await justificar(refNaoDebitada, `Pagamento emitido em ${naoDebitada.dia.split("-").reverse().join("/")}, ainda não debitado pelo banco no período (exemplo de demonstração)`);
    const j2 = pendentesExtrato[0] === undefined ? false : await justificar(pendentesExtrato[0], "Tarifa do pacote de serviços debitada pelo banco, a contabilizar no período seguinte (exemplo de demonstração)");
    conferir(j1 && j2, "as duas pendências justificadas pela tela, com o motivo");

    await irPara(n, page, periodoHref);
    // Encerrar é IRREVERSÍVEL: só com tudo antes conferido (medido na corrida de produção, que encerrou com um vínculo
    // faltando e sem as justificativas).
    if (falhas.length > 0) throw new Error(`o período NÃO foi encerrado: ${String(falhas.length)} conferência(s) falharam antes`);
    const re = await preencherEEnviar(page, "encerrar-conciliacao", []);
    await irPara(n, page, periodoHref);
    const estado = await page.$eval("[data-estado]", (e) => e.getAttribute("data-estado") ?? "").catch(() => "");
    conferir(estado === "ENCERRADA", `período encerrado pela tela: ${estado} (${re.texto.slice(0, 80)})`);
    console.log(`   conciliação de demonstração: ${n.base}${periodoHref}`);
  }
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da conciliação concluída completo.");
