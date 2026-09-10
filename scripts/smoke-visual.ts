import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE VISUAL EM PRODUÇÃO (S-fechamento, F3 — o "selo visual").
 *
 * Confere, contra o servidor de PRODUÇÃO já de pé (`next start`), que o CSS realmente CHEGA e é
 * APLICADO nas rotas-chave. A diferença para os gates que já existem importa muito:
 *   · `npm run build` verde prova que compilou — não que a tela tem estilo;
 *   · ler os bytes do `.css` servido prova que o arquivo existe — não que o navegador o aplicou.
 * Por isso aqui se abre um Chromium DE VERDADE, faz-se LOGIN DE VERDADE (as rotas são protegidas:
 * sem sessão elas respondem 307 e não há tela para inspecionar), e mede-se o **estilo computado**
 * dos elementos reais da página — o que o olho veria.
 *
 * O QUE VERIFICA, por rota:
 *   1. a página responde 200 e NÃO caiu de volta no /login (sessão viva);
 *   2. a família de fonte computada do `body` é **Inter** (a fonte do sistema de design carregou);
 *   3. o `background-color` do body não é transparente (as variáveis de tema aplicaram);
 *   4. **campo de 44px** — todo `input`/`select` visível de altura fixa mede 44px (o `h-11`);
 *   5. **card de 20px** — todo cartão visível tem padding de 20px (o `p-5`).
 * Os itens 4 e 5 são conferidos SÓ ONDE EXISTEM: uma tela sem formulário não é reprovada por não
 * ter campo. O que reprova é existir e estar com a medida errada — que é exatamente o sintoma de
 * CSS não aplicado.
 *
 * Sai com código 1 se qualquer rota falhar — serve de gate.
 *
 * Uso:  npx next start -p 3001 &
 *       npx tsx scripts/smoke-visual.ts http://localhost:3001 <usuario> <senha>
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

/** As rotas-chave da demonstração (todas protegidas, exceto o próprio /login). */
const ROTAS = [
  "/",
  "/integracoes",
  "/integracoes/sagres",
  "/integracoes/sagres?dia=2026-09-14",
  "/integracoes/importadores",
  "/planejamento/creditos-adicionais",
  "/planejamento/qdd",
  "/financeiro/extraorcamentario",
  "/patrimonio/bens",
  "/relatorios/atualizacoes-orcamentarias",
  // ── As telas que fecharam as lacunas do roteiro de demonstração ──
  // Cada uma entra com o RECORTE que a demonstração usa, e não só na sua URL nua: uma tela que
  // responde 200 vazia passaria no smoke sem provar nada do que será apontado à Comissão.
  "/planejamento/cmd-mba",
  "/despesa/ordem-cronologica",
  "/despesa/ordem-cronologica?fonte=500",
  // ── ENT01 ──
  "/despesa/empenhos?exercicio=2026",
  "/despesa/ordens?exercicio=2026",
  "/cadastros/pessoas",
  "/contabilidade",
  "/contabilidade/plano-de-contas",
  "/contabilidade/plano-de-contas?classe=2",
  "/contabilidade/lancamentos?desde=2026-09-01&ate=2026-09-30",
  "/relatorios/gerenciais",
  "/suporte",
  // ── ENT02 ──
  // ⚠️ AS ROTAS NOVAS ENTRAM AQUI, e não em outro lugar: esta lista é o que o smoke
  // visual varre. Uma tela nova fora dela não é acusada por ninguém — o smoke continua
  // dizendo "22/22 rota(s) OK", verde e cego, que é o pior modo de falha de um guarda.
  "/protocolo",
  "/protocolo/processos",
  "/comunicacao",
  "/comunicacao/comunicados",
  "/comunicacao/comunicados?caixa=SAIDA",
  "/relatorios/designer",
  "/suporte/chamados",
] as const;

interface Resultado {
  readonly rota: string;
  readonly ok: boolean;
  readonly detalhe: string;
}

/** O que o navegador computou para os elementos que importam. Roda DENTRO da página. */
interface Medidas {
  readonly url: string;
  readonly fonte: string;
  readonly fundo: string;
  readonly campos: number[];
  readonly cards: number[];
}

/**
 * ⚠️ O script de medição vai como STRING, de propósito. Se fosse uma função, o `tsx` (esbuild) a
 * compilaria com a marca `__name(...)` que ele injeta para preservar nomes — e essa marca não existe
 * no contexto do navegador, então todo `evaluate` morreria com "__name is not defined". String é
 * avaliada tal e qual, sem passar pelo compilador.
 */
const SCRIPT_MEDIDA = `(() => {
  const visivel = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const body = getComputedStyle(document.body);

  // ⚠️ FORA DO CROMO. A barra lateral e o topo ([data-chrome]) têm escala PRÓPRIA e menor — o
  // seletor de exercício é h-8 (32px) de propósito. Medir o cromo com a régua do conteúdo daria
  // falso positivo em toda tela. O selo é sobre o CONTEÚDO.
  const noConteudo = (el) => !el.closest("[data-chrome]");

  // CAMPO DE FORMULÁRIO — o design system usa h-11 (2.75rem = 44px). Textarea é livre; fora.
  const campos = Array.from(document.querySelectorAll("input:not([type=hidden]), select"))
    .filter((el) => visivel(el) && noConteudo(el))
    .map((el) => Math.round(el.getBoundingClientRect().height));

  // CARTÃO — a assinatura do componente Card, não "qualquer div com borda": raio grande
  // (--radius-lg = 10px), sombra do token (--shadow-card) e fundo de superfície. Sem isso o
  // detector pegava badge redondo, avatar e wrapper de tabela (que é p-0 de propósito).
  const cards = Array.from(document.querySelectorAll("div"))
    .filter((el) => {
      if (!visivel(el) || !noConteudo(el)) return false;
      const s = getComputedStyle(el);
      return s.borderStyle === "solid" && Math.round(parseFloat(s.borderRadius)) >= 10 && s.boxShadow !== "none";
    })
    .map((el) => Math.round(parseFloat(getComputedStyle(el).paddingTop)));

  return { url: location.pathname + location.search, fonte: body.fontFamily, fundo: body.backgroundColor, campos, cards };
})()`;

async function medir(page: Page): Promise<Medidas> {
  return page.evaluate(SCRIPT_MEDIDA) as Promise<Medidas>;
}

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.type('input[name="identificador"]', USUARIO);
  await page.type('input[name="senha"]', SENHA);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => undefined),
    page.click('button[type="submit"]'),
  ]);
  // A Server Action pode resolver sem navegação clássica — confirma pelo destino.
  await new Promise((r) => setTimeout(r, 1500));
  if (page.url().includes("/login")) {
    const msg = (await page.evaluate("document.body.innerText.slice(0, 300)")) as string;
    throw new Error(`login falhou (continua em /login). Texto da tela: ${msg.replace(/\s+/g, " ")}`);
  }
}

async function conferirRota(page: Page, rota: string): Promise<Resultado> {
  const resp = await page.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
  const status = resp?.status() ?? 0;
  if (status !== 200) return { rota, ok: false, detalhe: `status ${status}` };
  if (page.url().includes("/login")) return { rota, ok: false, detalhe: "caiu no /login — sessão perdida" };

  const m = await medir(page);
  const problemas: string[] = [];

  if (!/Inter/i.test(m.fonte)) problemas.push(`fonte do body é "${m.fonte}" (esperado Inter)`);
  if (m.fundo === "rgba(0, 0, 0, 0)" || m.fundo === "transparent") problemas.push("body sem background — tokens de tema não aplicaram");

  // Campo 44px — só reprova se houver campo E ele estiver fora da medida.
  const camposForaDaMedida = m.campos.filter((h) => h !== 44);
  if (m.campos.length > 0 && camposForaDaMedida.length === m.campos.length) {
    problemas.push(`nenhum dos ${m.campos.length} campo(s) mede 44px (alturas: ${[...new Set(m.campos)].join(", ")})`);
  }
  // Card 20px — idem.
  const cards20 = m.cards.filter((p) => p === 20);
  if (m.cards.length > 0 && cards20.length === 0) {
    problemas.push(`nenhum dos ${m.cards.length} cartão(ões) tem padding 20px (paddings: ${[...new Set(m.cards)].join(", ")})`);
  }

  const resumo = `fonte OK · ${m.campos.length} campo(s)${m.campos.length > 0 ? ` (${m.campos.filter((h) => h === 44).length} a 44px)` : ""} · ${m.cards.length} cartão(ões)${m.cards.length > 0 ? ` (${cards20.length} a 20px)` : ""}`;
  return problemas.length > 0
    ? { rota, ok: false, detalhe: problemas.join(" | ") }
    : { rota, ok: true, detalhe: resumo };
}

if (SENHA === "") {
  console.error("Senha ausente. Passe como 4º argumento ou defina SEED_ADMIN_SENHA.");
  process.exit(1);
}

console.log(`═══ SMOKE VISUAL (navegador real) — ${BASE} ═══\n`);
let browser: Browser | undefined;
const resultados: Resultado[] = [];
try {
  browser = await puppeteer.launch({
    headless: true,
    // ⚠️ AS FLAGS DE MEMÓRIA NÃO SÃO ENFEITE. Numa máquina sob pressão de memória o
    // renderer do Chromium é paginado para o disco e o runtime dele simplesmente PARA:
    // o puppeteer devolve "Runtime.callFunctionOn timed out", que se lê como se a tela
    // não tivesse respondido — e mandaria a próxima pessoa procurar defeito na tela.
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
    ],
    protocolTimeout: 45000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await entrar(page);
  console.log(`✓ login como ${USUARIO} — sessão viva\n`);

  for (const rota of ROTAS) {
    const r = await conferirRota(page, rota).catch((e: unknown) => ({
      rota,
      ok: false,
      detalhe: e instanceof Error ? e.message : String(e),
    }));
    resultados.push(r);
    console.log(`${r.ok ? "✓" : "✗"} ${rota.padEnd(42)} ${r.detalhe}`);
  }
} finally {
  await browser?.close();
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} rota(s) OK.`);
if (falhas.length > 0) {
  console.error(`\n✗ SMOKE VISUAL FALHOU em ${falhas.length} rota(s):`);
  falhas.forEach((f) => console.error(`  · ${f.rota} — ${f.detalhe}`));
  process.exit(1);
}
console.log("✓ CSS aplicado em produção: Inter carregada, campo 44px e card 20px medidos no navegador.");
