import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "puppeteer";
import { entrar, hrefDoRegistro, lancarNavegadorDoPercurso, sair, type Navegador } from "./percursos-navegador.js";

/**
 * CAPTURAS DE EXPERIÊNCIA (V7 M1 U5) — o MESMO roteiro contra dois artefatos (antes/depois).
 *
 * Uso: npx tsx scripts/capturas-da-experiencia.ts <base> <rotulo: antes|depois>
 *
 * Para cada tela afetada e cada largura de amostra (360, 768, 1366, 1440) grava a captura de página
 * inteira e MEDE, sem julgar pela imagem:
 *   · transbordo horizontal da PÁGINA (scrollWidth do documento > largura da janela) — tabela larga com
 *     rolagem interna própria não conta; a página inteira rolando de lado conta;
 *   · o foco pelo teclado: 12 TABs a partir do topo; cada elemento focado precisa ter contorno ou sombra
 *     visível e não ficar coberto por cabeçalho fixo (o centro do elemento é ele mesmo no elementFromPoint).
 * A saída é um JSON por rótulo, com o SHA do artefato informado pelo rodapé, e as capturas em PNG.
 * Dados SINTÉTICOS do banco descartável; nenhuma credencial é gravada.
 *
 * V7 M2 — `CAPTURAS_TELAS` (JSON: [{ nome, papel, rota }]) substitui o roteiro fixo: as telas da execução do contrato
 * dependem dos identificadores que a preparação de cada execução criou, e quem chama os informa. `papel` é "visitante",
 * "admin" ou a conta de percurso (senha dos papéis).
 */

const N: Navegador = { base: process.argv[2] ?? "http://localhost:3011" };
const ROTULO = process.argv[3] ?? "antes";
const SAIDA = process.env["CAPTURAS_SAIDA"] ?? join(process.cwd(), ".registro-de-execucao", "pacote-v7-m1", "capturas", ROTULO);
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const LARGURAS = [360, 768, 1366, 1440] as const;

interface Tela {
  readonly nome: string;
  readonly papel: string;
  /** Rota fixa, ou a descoberta a partir de uma lista (primeiro link cujo texto contém o trecho). */
  readonly rota: string | { readonly lista: string; readonly trecho: string };
}

const TELAS_FIXAS: readonly Tela[] = [
  { nome: "folha-lista", papel: "admin", rota: "/folha/folhas" },
  { nome: "folha-detalhe", papel: "admin", rota: { lista: "/folha/folhas?q=2026-12", trecho: "2026-12" } },
  { nome: "encargos-lista", papel: "admin", rota: "/folha/encargos" },
  { nome: "servidores-lista", papel: "admin", rota: "/pessoal/servidores" },
  { nome: "servidor-detalhe", papel: "admin", rota: { lista: "/pessoal/servidores", trecho: "" } },
  { nome: "carta-publica", papel: "visitante", rota: "/servicos" },
  { nome: "servico-publico", papel: "visitante", rota: { lista: "/servicos", trecho: "" } },
  { nome: "carta-configuracao", papel: "admin", rota: "/protocolo/servicos" },
  { nome: "mesa-lista", papel: "admin", rota: "/protocolo/solicitacoes" },
  { nome: "mesa-detalhe", papel: "admin", rota: { lista: "/protocolo/solicitacoes", trecho: "" } },
  { nome: "requerente-lista", papel: "cidada-a@percursos.local", rota: "/meus-servicos" },
  { nome: "requerente-detalhe", papel: "cidada-a@percursos.local", rota: { lista: "/meus-servicos", trecho: "" } },
];

const TELAS: readonly Tela[] = process.env["CAPTURAS_TELAS"] === undefined ? TELAS_FIXAS : (JSON.parse(process.env["CAPTURAS_TELAS"]) as Tela[]);

interface Medida {
  readonly largura: number;
  readonly status: number;
  readonly transbordoDaPagina: number;
  readonly focoInvisivel: readonly string[];
  readonly focoCoberto: readonly string[];
}

async function medir(page: Page): Promise<Omit<Medida, "largura" | "status">> {
  // ⚠️ A ÁREA AUTENTICADA ROLA DENTRO DE <main> (o documento tem a altura da janela): medir só o
  // documento responderia "0 px" para qualquer tela. Mede-se o documento E o <main>, e cada elemento
  // que passa da borda direita sem um ancestral com rolagem horizontal própria (tabela larga declarada).
  const transbordoDaPagina = await page.evaluate(() => {
    const docExcesso = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const main = document.querySelector("main");
    const mainExcesso = main === null ? 0 : Math.max(0, main.scrollWidth - main.clientWidth);
    const limite = main === null ? window.innerWidth : main.getBoundingClientRect().right;
    let piorElemento = 0;
    for (const el of Array.from(document.querySelectorAll("main *, body > *:not(script)"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= limite + 1) continue;
      let rolaSozinho = false;
      for (let a = el.parentElement; a !== null && a !== main && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "auto" || ox === "scroll") { rolaSozinho = true; break; }
      }
      if (!rolaSozinho) piorElemento = Math.max(piorElemento, Math.round(r.right - limite));
    }
    return Math.max(docExcesso, mainExcesso, piorElemento);
  });
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
  const focoInvisivel: string[] = [];
  const focoCoberto: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el === null || el === document.body) return null;
      el.scrollIntoView({ block: "nearest" });
      const cs = getComputedStyle(el);
      const visivel = (cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      const b = el.getBoundingClientRect();
      const noCentro = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const coberto = b.height > 0 && b.top >= 0 && b.top < window.innerHeight && noCentro !== null && noCentro !== el && !el.contains(noCentro) && !(noCentro.contains(el));
      const nome = `${el.tagName.toLowerCase()}${el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : ""} "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)}"`;
      return { visivel, coberto, nome };
    });
    if (r === null) continue;
    if (!r.visivel) focoInvisivel.push(r.nome);
    if (r.coberto) focoCoberto.push(r.nome);
  }
  return { transbordoDaPagina, focoInvisivel, focoCoberto };
}

/** Para a captura de página inteira: a moldura de altura fixa passa a crescer com o conteúdo. */
async function desdobrar(page: Page): Promise<void> {
  await page.evaluate(() => {
    const main = document.querySelector("main");
    for (let a: HTMLElement | null = main; a !== null; a = a.parentElement) {
      a.style.height = "auto";
      a.style.maxHeight = "none";
      a.style.overflow = "visible";
    }
  });
}

/** A PROVA DO INSTRUMENTO: injeta um bloco de 2000 px e apaga o contorno de foco — as duas medidas têm de acusar. */
async function provar(page: Page): Promise<void> {
  await page.setViewport({ width: 360, height: 900 });
  await page.goto(`${N.base}/servicos`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.setAttribute("data-prova-do-instrumento", "");
    d.style.width = "2000px";
    d.textContent = "prova do instrumento";
    (document.querySelector("main") ?? document.body).appendChild(d);
    const st = document.createElement("style");
    st.textContent = "*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }";
    document.head.appendChild(st);
  });
  const presente = await page.evaluate(() => document.querySelector("[data-prova-do-instrumento]") !== null);
  const m = await medir(page);
  if (!presente) throw new Error("a mutação da prova não ficou na página (hidratação removeu?) — prova inválida.");
  const acusou = m.transbordoDaPagina > 1000 && m.focoInvisivel.length > 0;
  console.log(`[prova do instrumento] transbordo ${m.transbordoDaPagina}px, foco invisível ${m.focoInvisivel.length} — ${acusou ? "ACUSOU" : "NÃO ACUSOU"}`);
  if (!acusou) throw new Error("o instrumento não acusou a mutação: as medidas desta execução não valem.");
}

async function main(): Promise<void> {
  mkdirSync(SAIDA, { recursive: true });
  const navegador = await lancarNavegadorDoPercurso();
  const relatorio: Record<string, unknown> = { rotulo: ROTULO, base: N.base, em: new Date().toISOString(), telas: {} as Record<string, unknown> };
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await provar(page);
    let sessao: Tela["papel"] = "visitante";
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(`${N.base}/login`, { waitUntil: "domcontentloaded" });
    relatorio["artefato"] = await page.evaluate(() => (document.body.innerText.match(/\b[0-9a-f]{7}\b/g) ?? []).at(-1) ?? "não informado");
    for (const tela of TELAS) {
      if (tela.papel !== sessao) {
        if (sessao !== "visitante") await sair(N, page);
        if (tela.papel === "admin") await entrar(N, page, ADMIN, SENHA_ADMIN);
        else if (tela.papel !== "visitante") await entrar(N, page, tela.papel, SENHA);
        sessao = tela.papel;
      }
      let rota = typeof tela.rota === "string" ? tela.rota : null;
      if (typeof tela.rota !== "string") {
        await page.setViewport({ width: 1366, height: 900 });
        await page.goto(`${N.base}${tela.rota.lista}`, { waitUntil: "networkidle2" });
        rota = tela.rota.trecho === ""
          ? await page.evaluate((lista) => {
              const a = Array.from(document.querySelectorAll("main tbody a, main li a, main a")).find((x) => {
                const h = (x as HTMLAnchorElement).getAttribute("href") ?? "";
                return h.startsWith(`${lista.split("?")[0]}/`) && !h.includes("?");
              }) as HTMLAnchorElement | undefined;
              return a === undefined ? null : new URL(a.href).pathname;
            }, tela.rota.lista)
          : await hrefDoRegistro(page, tela.rota.trecho);
      }
      if (rota === null) {
        (relatorio["telas"] as Record<string, unknown>)[tela.nome] = { erro: "sem registro para abrir na lista" };
        console.log(`[--] ${tela.nome}: sem registro`);
        continue;
      }
      const medidas: Medida[] = [];
      for (const largura of LARGURAS) {
        await page.setViewport({ width: largura, height: 900 });
        const r = await page.goto(`${N.base}${rota}`, { waitUntil: "networkidle2" });
        const medida = await medir(page);
        await desdobrar(page);
        await new Promise((r) => setTimeout(r, 300));
        await page.screenshot({ path: join(SAIDA, `${tela.nome}-${largura}.png`), fullPage: true });
        medidas.push({ largura, status: r?.status() ?? 0, ...medida });
      }
      (relatorio["telas"] as Record<string, unknown>)[tela.nome] = { rota: rota.replace(/[a-z0-9]{20,}/g, "<id>"), medidas };
      const pior = medidas.map((m) => `${m.largura}:${m.status}/transborda ${m.transbordoDaPagina}px/foco invisível ${m.focoInvisivel.length}/coberto ${m.focoCoberto.length}`).join(" · ");
      console.log(`[ok] ${tela.nome} ${pior}`);
    }
  } finally {
    await navegador.close();
  }
  writeFileSync(join(SAIDA, "medidas.json"), JSON.stringify(relatorio, null, 2));
  console.log(`medidas em ${join(SAIDA, "medidas.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
