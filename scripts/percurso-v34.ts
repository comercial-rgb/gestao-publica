import "dotenv/config";
import type { Page } from "puppeteer";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { cadastrarEntidadeContabil } from "../modules/m01-core-contabil/entidade-contabil.js";
import { entrar, irPara, lancarNavegadorDoPercurso, registroDePassos, sair, type Navegador } from "./percursos-navegador.js";

/**
 * V34 — OS PERCURSOS DIRIGIDOS DA RODADA, PELO NAVEGADOR. GRAVA: só na 3011, sobre um banco de ensaio.
 *
 *   P. O CONTADOR emite o PDF e o CSV do Balanço Orçamentário, do Financeiro, da DFC e da composição de uma linha — a
 *      mesma apuração da tela; a demonstração recusada devolve o motivo, e não um erro.
 *   S. O ADMINISTRADOR abre a fila dos movimentos extraorçamentários sem titular e regulariza um, com o ato; o
 *      movimento sai da fila e a atribuição fica gravada com o autor.
 *   G. A remessa do SAGRES abre (regressão do recorte por registro no regime de uma UG).
 *
 * Uso: DATABASE_URL=<ensaio> npx tsx scripts/percurso-v34.ts http://localhost:3011 <senha-admin>
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SENHA_ADMIN = process.argv[3] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
// O administrador da apresentação (o mesmo do percurso de promoção); a senha vem do .env, nunca do código.
const ADMIN = process.env["PERCURSO_ADMIN"] ?? "admin@cg.pb.gov.br";
const N: Navegador = { base: BASE };

/** Busca uma rota com a sessão da aba: status, tipo e tamanho — sem baixar para o disco. */
async function buscar(page: Page, rota: string): Promise<{ status: number; tipo: string; bytes: number; inicio: string }> {
  return page.evaluate(async (r) => {
    const resp = await fetch(r, { credentials: "same-origin" });
    const buf = new Uint8Array(await resp.arrayBuffer());
    const inicio = new TextDecoder().decode(buf.slice(0, 160));
    return { status: resp.status, tipo: resp.headers.get("content-type") ?? "", bytes: buf.length, inicio };
  }, rota);
}
const ehPdf = (r: { status: number; tipo: string; inicio: string }): boolean => r.status === 200 && r.tipo.includes("application/pdf") && r.inicio.startsWith("%PDF");
const recusaComMotivo = (r: { status: number; inicio: string }): boolean => r.status === 409 && /não foi emitido:/.test(r.inicio);

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!/ensaio/.test(url)) throw new Error("Este percurso grava: só roda sobre um banco de ensaio.");
  if (SENHA_ADMIN === "" || ADMIN === "") throw new Error("A identidade e a senha do administrador são obrigatórias.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);

    // ══ P. PDF E CSV PELA MESMA APURAÇÃO ══
    await entrar(N, page, "contabilidade@percursos.local", SENHA_PAPEIS);
    const bo = await irPara(N, page, "/relatorios/demonstracoes/balanco-orcamentario?exercicio=2026");
    const botoes = await page.$$eval("a, button", (xs) => xs.map((x) => (x.textContent ?? "").trim()));
    R.conferir("P.1 o Balanço Orçamentário oferece o PDF e o CSV", botoes.includes("Imprimir PDF") && botoes.some((b) => /CSV/i.test(b)), botoes.filter((b) => /PDF|CSV/i.test(b)).join(" | ") || bo.slice(0, 200));
    const pBo = await buscar(page, "/relatorios/demonstracoes/balanco-orcamentario/pdf?exercicio=2026");
    R.conferir("P.2 o PDF do Balanço Orçamentário é emitido", ehPdf(pBo), `${String(pBo.status)} ${pBo.tipo} ${String(pBo.bytes)}B ${pBo.inicio.slice(0, 80)}`);
    for (const [passo, rota, nome] of [
      ["P.3", "balanco-financeiro", "Balanço Financeiro"],
      ["P.4", "fluxos-de-caixa", "DFC"],
    ] as const) {
      const r = await buscar(page, `/relatorios/demonstracoes/${rota}/pdf?exercicio=2026`);
      R.conferir(`${passo} o PDF do ${nome} é emitido, ou a recusa do motor volta com o motivo`, ehPdf(r) || recusaComMotivo(r), `${String(r.status)} ${r.tipo} ${r.inicio.slice(0, 160)}`);
    }
    // a composição de uma linha do BO: o botão do PDF e o PDF
    await irPara(N, page, "/relatorios/demonstracoes/balanco-orcamentario?exercicio=2026");
    const linha = (await page.$$eval('a[href^="/relatorios/demonstracoes/composicao?linha=bo-despesa"]', (as) => as.map((a) => a.getAttribute("href") ?? "")))[0] ?? "";
    const comp = await irPara(N, page, linha);
    const hrefPdf = await page.$$eval('a[href^="/relatorios/demonstracoes/composicao/pdf"]', (as) => as.map((a) => a.getAttribute("href") ?? ""));
    R.conferir("P.5 a composição da linha oferece o PDF", hrefPdf.length === 1, `${linha} | ${comp.slice(0, 160)}`);
    if (hrefPdf[0] !== undefined) {
      const pc = await buscar(page, hrefPdf[0]);
      R.conferir("P.6 o PDF da composição é emitido", ehPdf(pc), `${String(pc.status)} ${pc.tipo} ${pc.inicio.slice(0, 80)}`);
    }
    const ruim = await buscar(page, "/relatorios/demonstracoes/composicao/pdf?linha=bo-despesa%3Axyz&exercicio=2026");
    R.conferir("P.7 o PDF de linha que não existe é recusado com o caminho", ruim.status === 400 && /link da própria linha/.test(ruim.inicio), `${String(ruim.status)} ${ruim.inicio}`);
    await sair(N, page);

    // ══ S. A FILA DOS MOVIMENTOS SEM TITULAR ══
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    const fila = await irPara(N, page, "/financeiro/extraorcamentario/sem-titular?exercicio=2026");
    const ids = await page.$$eval("li[data-movimento]", (ls) => ls.map((l) => l.getAttribute("data-movimento") ?? ""));
    R.conferir("S.1 a fila abre e diz o que fazer (lista ou ausência nomeada)", /movimentos sem titular/i.test(fila) && (ids.length > 0 || /nenhum movimento sem titular/i.test(fila)), fila.slice(0, 240));
    if (ids.length > 0) {
      const alvo = ids[0]!;
      // A base da apresentação não tem entidade contábil cadastrada (achado da V34): sem ela não há a quem atribuir. O
      // ensaio cadastra uma, pelo serviço normal e identificada como de ensaio.
      if ((await prisma.entidadeContabil.count()) === 0) {
        await cadastrarEntidadeContabil(prisma, { codigo: "E34", nome: "Entidade de ensaio V34", tipoManad: "01", atoTipo: "LEI", atoNumero: "1", atoAno: 2000, atoDispositivo: "art. 1", atoCitacao: "Cadastro da Entidade de ensaio V34 (percurso).", criadoPor: ADMIN }, new Date());
      }
      const entidade = await prisma.entidadeContabil.findFirst({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true } } } });
      if (entidade === null || entidade.versoes[0] === undefined) {
        R.falhou("S.2 regularizar um movimento", "o ensaio não tem entidade contábil cadastrada");
      } else {
        const nome = entidade.versoes[0].nome;
        // recarrega a fila: a entidade pode ter acabado de ser cadastrada, e o formulário lista as entidades ao abrir
        await irPara(N, page, "/financeiro/extraorcamentario/sem-titular?exercicio=2026");
        await page.click(`button[data-papel="atribuir-${alvo}"]`);
        const f = `li[data-movimento="${alvo}"] form`;
        await page.waitForSelector(f);
        await page.select(`${f} select[name="entidadeId"]`, entidade.id);
        await page.type(`${f} input[name="motivo"]`, "Movimento da conta sem titular regularizado no ensaio V34");
        const tipos = await page.$$eval(`${f} select[name="atoTipo"] option`, (os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""));
        await page.select(`${f} select[name="atoTipo"]`, tipos.includes("LEI") ? "LEI" : tipos[0]!);
        await page.type(`${f} input[name="atoNumero"]`, "1");
        await page.type(`${f} input[name="atoAno"]`, "2000");
        await page.type(`${f} input[name="atoDispositivo"]`, "art. 1");
        await page.type(`${f} textarea[name="atoCitacao"]`, `A conta movimentada pertence a ${nome}.`);
        await page.click(`${f} button[type="submit"]`);
        await page.waitForSelector('[data-resultado-da-acao="atribuir-entidade-ao-movimento"]', { timeout: 60000 });
        const aviso = await page.$eval('[data-resultado-da-acao="atribuir-entidade-ao-movimento"]', (e) => e.textContent ?? "");
        R.conferir("S.2 a atribuição é gravada e a tela confirma por escrito", /Entidade atribuída/.test(aviso), aviso);
        const gravada = await prisma.atribuicaoDeEntidadeDoMovimentoExtra.findUnique({ where: { movimentoId: alvo }, select: { entidadeId: true, criadoPor: true } });
        R.conferir("S.3 a atribuição está no banco, com a entidade e o autor", gravada?.entidadeId === entidade.id && gravada.criadoPor === ADMIN, JSON.stringify(gravada));
        await irPara(N, page, "/financeiro/extraorcamentario/sem-titular?exercicio=2026");
        const depois = await page.$$eval("li[data-movimento]", (ls) => ls.map((l) => l.getAttribute("data-movimento") ?? ""));
        R.conferir("S.4 recarregada a tela, o movimento saiu da fila", !depois.includes(alvo), depois.join(","));
      }
    }
    const menu = await irPara(N, page, "/financeiro/extraorcamentario?exercicio=2026");
    const links = await page.$$eval("a", (as) => as.filter((x) => /movimentos sem titular/i.test(x.textContent ?? "")).map((x) => x.getAttribute("href") ?? ""));
    R.conferir("S.5 o menu do extraorçamentário leva à fila", links.some((h) => h.includes("/financeiro/extraorcamentario/sem-titular")), `${links.join(" ")} | ${menu.slice(0, 120)}`);

    // ══ G. SAGRES ══
    const sagres = await irPara(N, page, "/integracoes/sagres");
    R.conferir("G.1 a remessa do SAGRES abre", !/não foi possível|erro inesperado/i.test(sagres) && /SAGRES/i.test(sagres), sagres.slice(0, 240));
    await sair(N, page);
  } finally {
    await navegador.close();
    await (prisma as unknown as { $disconnect(): Promise<void> }).$disconnect();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
