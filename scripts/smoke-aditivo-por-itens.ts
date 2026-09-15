import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — O ADITIVO POR ITENS (V7 M2 U5), POR PAPÉIS.
 *
 * Preparação declarada: a mesma da ponte contratual (`scripts/preparar-ponte-contratual.ts`, sufixo próprio), que entrega
 * o contrato com visita 10 × R$ 100,00 e hora 20 × R$ 50,00 em `PONTE_JSON`. Pela tela:
 *   1. a área de contratos abre o contrato (sem aditivo por itens) e confere a composição de 10 → 12 visitas: acréscimo
 *      de R$ 200,00, nada gravado;
 *   2. informa a variação errada (R$ 150,00): recusa com a composição;
 *   3. informa R$ 200,00: aditivo registrado, contratado hoje 12, original 10; repetir o termo é recusado pelo número;
 *   4. a gestora designada vê o aditivo e o novo contratado, sem o formulário (com o motivo);
 *   5. o visitante vê a alteração na projeção pública.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const CONTRATOS = "contratos-aditivos@percursos.local";
const GESTORA = "gestora-contrato@percursos.local";
const R = registroDePassos();
const CAPTURAS = process.env["PERCURSO_CAPTURAS"] ?? join(process.cwd(), ".registro-de-execucao", "pacote-v7-m2", "capturas");

interface Ponte { readonly sufixo: string; readonly contratoId: string; readonly contrato: string }
const PONTE: Ponte = JSON.parse(process.env["PONTE_JSON"] ?? "null") as Ponte;
const FORM = 'form[data-acao="aditivo-por-itens"]';

async function capturar(page: Page, nome: string): Promise<void> {
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `aditivo-${nome}.png`), fullPage: true });
}

async function campoPeloRotulo(page: Page, trecho: string): Promise<string> {
  return page.$$eval(`${FORM} label`, (ls, t) => (ls.find((x) => (x.textContent ?? "").includes(t as string))?.querySelector("input") as HTMLInputElement | null)?.name ?? "", trecho);
}

/** Clica o botão "Registrar aditivo" (o segundo envio do formulário) e espera o resultado DESTE envio. */
async function registrar(page: Page): Promise<{ readonly tipo: "ok" | "erro" | "silencio"; readonly texto: string }> {
  await page.waitForSelector(`${FORM} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  const antes = await page.$eval(FORM, (f) => (f.querySelector('[role="alert"], [role="status"]')?.textContent ?? "").trim());
  await page.$eval(`${FORM} button[value="aditivo"]`, (b) => (b as HTMLButtonElement).click());
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const r = await page.$eval(FORM, (f) => {
      const alerta = f.querySelector('[role="alert"]');
      const ok = f.querySelector('[data-resultado-da-acao="aditivo-por-itens"]');
      return alerta !== null ? { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() } : ok !== null ? { tipo: "ok" as const, texto: (ok.textContent ?? "").trim() } : { tipo: "silencio" as const, texto: "" };
    });
    if (r.tipo !== "silencio" && r.texto !== antes) return r;
  }
  return { tipo: "silencio", texto: "" };
}

async function main(): Promise<void> {
  if (PONTE === null) {
    R.falhou("preparação", "PONTE_JSON ausente: rode scripts/preparar-ponte-contratual.ts no banco descartável antes");
    R.encerrar();
    return;
  }
  let navegador: Browser | undefined;
  const SUF = PONTE.sufixo;
  const href = `/licitacoes/contratos/${PONTE.contratoId}`;
  const numero = `AD-${SUF}`;
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1366, height: 900 });
    console.log(`      [contrato ${PONTE.contrato} · banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"}]`);

    await entrar(N, page, CONTRATOS, SENHA);
    await irPara(N, page, href);
    R.conferir("1.1 a área de contratos abre o contrato sem aditivo por itens e com o formulário do termo", (await page.$("[data-sem-aditivos-por-itens]")) !== null && (await page.$(FORM)) !== null, (await texto(page)).slice(0, 200));
    const visita = await campoPeloRotulo(page, `Visita técnica ${SUF}: quantidade`);
    const campos = [
      { sel: 'input[name="numeroAditivo"]', valor: numero },
      { sel: 'input[name="fundamento"]', valor: "Lei 14.133/2021, art. 124, I, b; cláusula de alteração do contrato" },
      { sel: 'textarea[name="motivo"]', valor: `Aumento das visitas pedido pela fiscalização (percurso ${SUF})` },
      { sel: `input[name="${visita}"]`, valor: "12" },
    ];
    const previa = await preencherEEnviar(page, "aditivo-por-itens", campos);
    R.conferir("1.2 a composição conferida: 10 → 12 visitas a R$ 100,00, acréscimo de R$ 200,00, nada gravado", previa.tipo === "ok" && /nada foi gravado: acréscimo de R\$ 200,00 — item 1: 10 → 12 visita/.test(previa.texto) && visita !== "", `${previa.tipo}: ${previa.texto.slice(0, 260)}`);
    await capturar(page, "previa");

    await page.$eval(`${FORM} input[name="variacaoDoTermo"]`, (i) => { (i as HTMLInputElement).value = ""; });
    await page.type(`${FORM} input[name="variacaoDoTermo"]`, "150,00");
    const errado = await registrar(page);
    R.conferir("2.1 a variação errada no termo é recusada com a composição", errado.tipo === "erro" && /o termo informa 150\.00, e os itens compõem 200\.00 \(item 1: 200\.00\)/.test(errado.texto), `${errado.tipo}: ${errado.texto.slice(0, 260)}`);

    await page.$eval(`${FORM} input[name="variacaoDoTermo"]`, (i) => { (i as HTMLInputElement).value = ""; });
    await page.type(`${FORM} input[name="variacaoDoTermo"]`, "200,00");
    const certo = await registrar(page);
    R.conferir("3.1 com R$ 200,00 o aditivo é registrado", certo.tipo === "ok" && new RegExp(`Aditivo nº ${numero} registrado: acréscimo de R\\$ 200,00`).test(certo.texto), `${certo.tipo}: ${certo.texto.slice(0, 260)}`);
    await irPara(N, page, href);
    const linha = await page.$eval("[data-saldo-dos-itens] [data-item-do-contrato='1']", (tr) => Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim()));
    R.conferir("3.2 recarregado: o item 1 tem original 10 e contratado hoje 12, e o termo aparece na lista", linha[2] === "10" && linha[3] === "12" && (await page.$(`[data-aditivo-por-itens="${numero}"]`)) !== null, linha.join(" | "));
    await capturar(page, "registrado");
    for (const c of campos) {
      if (c.sel.startsWith("textarea")) await page.$eval(`${FORM} ${c.sel}`, (el, v) => { (el as HTMLTextAreaElement).value = v as string; }, c.valor);
    }
    await page.$eval(`${FORM} input[name="numeroAditivo"]`, (el, v) => { (el as HTMLInputElement).value = v as string; }, numero);
    await page.$eval(`${FORM} input[name="fundamento"]`, (el) => { (el as HTMLInputElement).value = "Lei 14.133/2021, art. 124, I, b"; });
    await page.$eval(`${FORM} input[name="${visita}"]`, (el) => { (el as HTMLInputElement).value = "14"; });
    await page.$eval(`${FORM} input[name="variacaoDoTermo"]`, (el) => { (el as HTMLInputElement).value = "200,00"; });
    const repetido = await registrar(page);
    R.conferir("3.3 o mesmo número de termo não se registra de novo", repetido.tipo === "erro" && /NUMERO-DE-ADITIVO-JA-USADO/.test(repetido.texto), `${repetido.tipo}: ${repetido.texto.slice(0, 200)}`);
    await sair(N, page);

    await entrar(N, page, GESTORA, SENHA);
    await irPara(N, page, href);
    const motivo = await page.$eval("[data-motivo-do-aditivo]", (p) => p.textContent ?? "").catch(() => "");
    R.conferir("4.1 a gestora vê o termo e o contratado de hoje, sem o formulário e com o motivo", (await page.$(FORM)) === null && /área de contratos/.test(motivo) && (await page.$(`[data-aditivo-por-itens="${numero}"]`)) !== null, motivo);
    await sair(N, page);

    await irPara(N, page, `/transparencia/contratos/${PONTE.contratoId}`);
    const publico = await page.$eval("[data-publico-aditivos-por-itens]", (s) => s.textContent ?? "").catch(() => "");
    R.conferir("5.1 o visitante vê a alteração de itens na projeção pública", new RegExp(`Termo nº ${numero}`).test(publico) && /10 → 12 visita/.test(publico), publico.slice(0, 200));
    await capturar(page, "publico");
  } catch (e) {
    R.falhou("execução", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e));
    if (navegador !== undefined) {
      const p = (await navegador.pages()).at(-1);
      if (p !== undefined) await capturar(p, "falha").catch(() => undefined);
    }
  } finally {
    await navegador?.close();
  }
  R.encerrar();
}

void main();
