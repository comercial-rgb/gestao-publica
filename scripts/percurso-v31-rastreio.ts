import "dotenv/config";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, type Navegador } from "./percursos-navegador.js";

/**
 * V31 — O CONTADOR SEGUE UM VALOR NOS DOIS SENTIDOS (relatório ↔ lançamento ↔ documento ↔ operação).
 *
 *   R. A CONTABILIDADE (perfil sem reserva): do balancete ao razão da conta, do razão ao lançamento, do
 *      lançamento ao documento; da lista de lançamentos, a liquidação abre o dossiê do empenho na âncora;
 *      do empenho à ficha, e da ficha de volta ao mesmo empenho. Sem RESERVAR_DOTACAO, a ficha não oferece
 *      reserva (negação com motivo: o formulário não existe para ela).
 *   P. O PLANEJAMENTO (sem consulta da despesa): a ficha diz por que os empenhos não aparecem.
 *   D. O ADMINISTRADOR reserva na ficha sem processo e libera — conferido no banco e no saldo da ficha.
 *
 * ⚠️ GRAVA (uma reserva e a liberação dela). A 3010 é recusada.
 * Uso: DATABASE_URL=<ensaio> npx tsx scripts/percurso-v31-rastreio.ts http://localhost:3011 <senha-admin>
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SENHA_ADMIN = process.argv[3] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const N: Navegador = { base: BASE };
if (BASE.includes(":3010")) throw new Error("Este percurso grava uma reserva. A 3010 é a apresentação — use a 3011. Nada foi feito.");

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "" || SENHA_ADMIN === "") throw new Error("DATABASE_URL e a senha do administrador são obrigatórias.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  // Um empenho de 2026 com liquidação: o ponto de partida conhecido pelo banco, conferido pela tela.
  const liq = await prisma.liquidacao.findFirst({
    where: { estornoDeId: null, anulacaoParcialDeId: null, empenho: { ficha: { exercicio: 2026 } } },
    select: { id: true, lancamentoId: true, empenhoId: true, empenho: { select: { numero: true, fichaId: true } } },
  });
  if (liq === null) throw new Error("O ensaio não tem liquidação em 2026; o percurso precisa de uma. Nada foi feito.");
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);

    // ══ R. CONTABILIDADE ══
    await entrar(N, page, "contabilidade@percursos.local", SENHA_PAPEIS);
    R.ok("R.0 login da contabilidade");
    // O menu é honesto: sem CONSULTAR_RELATORIOS, os livros não aparecem na aba Contabilidade, e a URL
    // direta é recusada dizendo a ação que falta.
    await irPara(N, page, "/");
    await page.click('li[data-aba="contabilidade"] button[aria-expanded]');
    const livrosNoMenu = await page.evaluate(() => document.querySelectorAll('li[data-aba="contabilidade"] a[href^="/relatorios/livros/"]').length);
    R.conferir("R.0a sem a consulta de relatórios, a aba Contabilidade não oferece os livros", livrosNoMenu === 0, `${String(livrosNoMenu)} link(s) de livro`);
    await page.goto(`${BASE}/relatorios/livros/balancete?exercicio=2026`, { waitUntil: "networkidle0" });
    R.conferir("R.0b e o balancete pela URL é recusado nomeando a ação", page.url().includes("/sem-acesso") && page.url().includes("CONSULTAR_RELATORIOS"), page.url());

    // Da lista de lançamentos: a liquidação abre o dossiê do empenho, na âncora.
    await irPara(N, page, `/contabilidade/lancamentos/${liq.lancamentoId}`);
    const origem = await page.evaluate(() => (document.querySelector("[data-origem-do-lancamento] a") as HTMLAnchorElement | null)?.getAttribute("href") ?? null);
    R.conferir("R.5 o lançamento da liquidação aponta o documento", origem !== null && origem.startsWith("/despesa/documento/LIQUIDACAO/"), String(origem));
    if (origem === null) throw new Error("sem origem");
    await page.goto(`${BASE}${origem}`, { waitUntil: "networkidle0" });
    const chegou = new URL(page.url());
    R.conferir(
      `R.6 e abre o empenho ${liq.empenho.numero} na liquidação (âncora)`,
      chegou.pathname === `/despesa/empenhos/${liq.empenhoId}` && chegou.hash === `#liquidacao-${liq.id}` && (await page.$(`#liquidacao-${liq.id}`)) !== null,
      page.url()
    );
    const linkFicha = await page.evaluate(() => (document.querySelector('a[href^="/planejamento/fichas/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null);
    R.conferir("R.7 o empenho abre a ficha (a dotação)", linkFicha === `/planejamento/fichas/${liq.empenho.fichaId}`, String(linkFicha));
    await irPara(N, page, `/planejamento/fichas/${liq.empenho.fichaId}`);
    const volta = await page.evaluate((id: string) => document.querySelector(`[data-operacoes-da-ficha] a[href="/despesa/empenhos/${id}"]`) !== null, liq.empenhoId);
    R.conferir("R.8 e a ficha lista o mesmo empenho, com o link de volta", volta, "o empenho não aparece na ficha");
    const totais = await page.evaluate(() => document.querySelector("[data-total-dos-empenhos]")?.textContent ?? "");
    R.conferir("R.9 a ficha diz o que falta liquidar e pagar", /a liquidar/.test(totais) && /a pagar/.test(totais), totais);
    R.conferir(
      "R.10 sem RESERVAR_DOTACAO, a ficha não oferece reservar à contabilidade",
      (await page.$('form[data-acao="reservar-dotacao"]')) === null,
      "o formulário de reserva apareceu para quem não tem a ação"
    );
    await sair(N, page).catch(() => undefined);

    // ══ P. PLANEJAMENTO ══
    await entrar(N, page, "planejamento@percursos.local", SENHA_PAPEIS);
    await irPara(N, page, `/planejamento/fichas/${liq.empenho.fichaId}`);
    const motivo = await page.evaluate(() => document.querySelector("[data-motivo-sem-empenhos]")?.textContent ?? "");
    R.conferir(
      "P.1 quem não lê a despesa vê a ficha, e o motivo de os empenhos não aparecerem — não a lista",
      /consulta da despesa da unidade \d{5} não está no seu acesso/.test(motivo) && (await page.$('[data-operacoes-da-ficha] a[href^="/despesa/empenhos/"]')) === null,
      motivo
    );
    await sair(N, page).catch(() => undefined);

    // ══ D. ADMINISTRADOR: reserva avulsa e liberação ══
    await entrar(N, page, "admin@cg.pb.gov.br", SENHA_ADMIN);
    // O caminho do relatório, com quem tem a consulta dos relatórios.
    await irPara(N, page, "/relatorios/livros/balancete?exercicio=2026");
    const linkRazao = await page.evaluate(() => (document.querySelector('a[href^="/relatorios/livros/razao?conta="]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null);
    R.conferir("R.1 a conta do balancete abre o razão no mesmo período", linkRazao !== null && /desde=2026-01-01&ate=2026-12-31/.test(linkRazao), String(linkRazao));
    if (linkRazao === null) throw new Error("sem conta no balancete");
    await irPara(N, page, linkRazao);
    const linkLanc = await page.evaluate(() => (document.querySelector('a[href^="/contabilidade/lancamentos/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null);
    R.conferir("R.2 o número do razão abre o lançamento", linkLanc !== null, String(linkLanc));
    if (linkLanc === null) throw new Error("sem lançamento no razão");
    const lanc = await irPara(N, page, linkLanc);
    const temPartidas = await page.evaluate(() => document.querySelectorAll('section[aria-label="Partidas do lançamento"] tbody tr').length);
    R.conferir("R.3 o lançamento mostra as partidas e a origem", temPartidas >= 2 && (await page.$("[data-origem-do-lancamento]")) !== null, `${String(temPartidas)} partida(s) · ${lanc.slice(0, 200)}`);
    const voltaAoRazao = await page.evaluate(() => (document.querySelector('a[href^="/relatorios/livros/razao?conta="]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null);
    R.conferir("R.4 e cada conta do lançamento volta ao razão", voltaAoRazao !== null, String(voltaAoRazao));

    const antes = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: liq.empenho.fichaId }, select: { saldoReservado: true, saldoDisponivel: true } });
    await irPara(N, page, `/planejamento/fichas/${liq.empenho.fichaId}`);
    const r = await preencherEEnviar(page, "reservar-dotacao", [
      { sel: 'input[name="valor"]', valor: "100,00" },
      { sel: 'input[name="historico"]', valor: "Reserva do percurso V31 para contratação" },
    ]);
    R.conferir("D.1 reservar na ficha, sem processo, confirma", r.tipo === "ok" && /reserva de/i.test(r.texto), `${r.tipo}: ${r.texto}`);
    const reserva = await prisma.reservaDotacao.findFirst({
      where: { fichaId: liq.empenho.fichaId, historico: "Reserva do percurso V31 para contratação" },
      select: { id: true, valor: true, processoId: true },
    });
    const depois = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: liq.empenho.fichaId }, select: { saldoReservado: true, saldoDisponivel: true } });
    R.conferir(
      "D.2 a reserva foi gravada sem processo, e o saldo da ficha moveu 100,00",
      reserva !== null && reserva.processoId === null && reserva.valor.toFixed(2) === "100.00" &&
        depois.saldoReservado.minus(antes.saldoReservado).toFixed(2) === "100.00" &&
        antes.saldoDisponivel.minus(depois.saldoDisponivel).toFixed(2) === "100.00",
      `${JSON.stringify(reserva)} · reservado ${antes.saldoReservado.toFixed(2)}→${depois.saldoReservado.toFixed(2)}`
    );
    if (reserva === null) throw new Error("sem reserva");
    await irPara(N, page, `/planejamento/fichas/${liq.empenho.fichaId}`);
    await page.click('details[data-forma="liberar-reserva"] summary');
    const lib = await preencherEEnviar(page, "liberar-reserva", [{ sel: 'input[name="historico"]', valor: "Contratação desistida no percurso" }]);
    R.conferir("D.3 liberar a reserva confirma", lib.tipo === "ok" && /liberada/i.test(lib.texto), `${lib.tipo}: ${lib.texto}`);
    const fim = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: liq.empenho.fichaId }, select: { saldoReservado: true, saldoDisponivel: true } });
    const liberacao = await prisma.reservaDotacao.count({ where: { estornoDeId: reserva.id } });
    R.conferir(
      "D.4 a liberação é um registro novo e o saldo volta ao que era",
      liberacao === 1 && fim.saldoReservado.toFixed(2) === antes.saldoReservado.toFixed(2) && fim.saldoDisponivel.toFixed(2) === antes.saldoDisponivel.toFixed(2),
      `liberacoes=${String(liberacao)} · reservado ${fim.saldoReservado.toFixed(2)} · disponível ${fim.saldoDisponivel.toFixed(2)}`
    );
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
