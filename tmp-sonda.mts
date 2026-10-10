import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./scripts/percursos-navegador.js";
const n: Navegador = { base: process.env["BASE"] ?? "" };
const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "", process.env["PERCURSO_SENHA"] ?? "");
  await irPara(n, page, "/financeiro/conciliacao/periodo");
  const contaId = await page.$$eval('form[data-acao="abrir-conciliacao"] select[name="conta"] option', (os) => os.find((o) => (o.textContent ?? "").startsWith("FIC-PM-500"))?.getAttribute("value") ?? "");
  await irPara(n, page, `/financeiro/conciliacao/periodo?conta=${contaId}`);
  const href = await page.$$eval("li[data-periodo]", (ls) => ls.find((l) => (l.textContent ?? "").includes("10/10/2026 a 31/10"))?.querySelector("a")?.getAttribute("href") ?? "");
  await irPara(n, page, href);
  const forms = await page.$$eval('form[data-acao="justificar-pendencia"]', (fs) => fs.map((f) => ({ ref: (f.querySelector('input[name="referencia"]') as HTMLInputElement | null)?.value ?? "", lado: (f.querySelector('input[name="lado"]') as HTMLInputElement | null)?.value ?? "", motivo: (f.querySelector('input[name="motivo"]') as HTMLInputElement | null)?.outerHTML.slice(0, 200) ?? "" })));
  console.log("FORMS", JSON.stringify(forms));
  const alvo = forms.find((f) => f.lado === "EXTRATO");
  if (alvo !== undefined) {
    const r = await preencherEEnviar(page, `form[data-acao="justificar-pendencia"]:has(input[name="referencia"][value="${alvo.ref}"])`, [{ sel: 'input[name="motivo"]', valor: "Tarifa do pacote de serviços debitada pelo banco em 07/08/2026, sem registro no razão até o fim do período; a contabilizar (demonstração)." }]);
    console.log("RESPOSTA", r.tipo, r.texto.slice(0, 300));
  }
} finally { await nav.close(); }
