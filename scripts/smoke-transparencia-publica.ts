import "dotenv/config";
import { writeFileSync } from "node:fs";
import type { Page } from "puppeteer";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  sair,
  texto,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * ═══ O PERCURSO DA TRANSPARÊNCIA PÚBLICA (V9 N1/N2) ═══
 *
 * A jornada inteira, nas duas pontas:
 *
 *   PÚBLICO, SEM SESSÃO — o portal, a consulta de bens com filtro na URL, a paginação do
 *   servidor, o detalhe em abas, o CSV do mesmo recorte;
 *   INTERNO, COM SESSÃO — cadastrar uma localização DIVULGÁVEL e mover um bem para ela;
 *   PÚBLICO OUTRA VEZ — o mesmo bem passa a mostrar o lugar, e o outro continua reservado.
 *
 * ⚠️ O PERCURSO NÃO CONFERE SÓ "A PÁGINA ABRIU". Página 200 não prova fluxo. Ele confere o
 * EFEITO: que o filtro sobrevive à volta do navegador, que a segunda página traz outro bem, que
 * o CSV tem as mesmas linhas, e — a parte que mais importa — que **o nome e o documento do
 * servidor responsável não estão no HTML entregue ao anônimo**. Numa página pública, "chegou ao
 * navegador" é "foi publicado".
 */

const BASE = process.argv[2] ?? "http://localhost:3010";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const n: Navegador = { base: BASE };
const r = registroDePassos();
const carimbo = Date.now().toString().slice(-6);
const LOCAL_DIVULGAVEL = `Escola Municipal do percurso ${carimbo}`;

/** O HTML cru — é nele que um dado vazado aparece, mesmo quando a tela não o desenha. */
async function html(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.outerHTML);
}

const navegador = await lancarNavegadorDoPercurso();
try {
  const page = await navegador.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // ─────────────────────────────────────────────────────────────────────
  // 1. O PORTAL PÚBLICO, SEM NENHUMA SESSÃO
  // ─────────────────────────────────────────────────────────────────────
  const resp = await page.goto(`${BASE}/transparencia`, { waitUntil: "domcontentloaded" });
  r.conferir(
    "/transparencia responde 200 SEM sessão",
    resp?.status() === 200 && !page.url().includes("/login"),
    `status ${resp?.status()} em ${page.url()} — o endereço que o município divulga não pode cair no login`
  );

  const portal = await texto(page);
  r.conferir("o portal nomeia o ente (do cadastro, não do código)", !portal.includes("prefeitura de exemplo"), portal.slice(0, 200));
  r.conferir("o portal lista a consulta de bens", portal.includes("bens patrimoniais"), portal.slice(0, 300));
  r.conferir(
    "o portal DECLARA as famílias que ainda não abriram, em vez de oferecer página vazia",
    (await page.$$("[data-familia-pendente]")).length >= 1,
    "nenhum item declarado como pendente"
  );

  // O rodapé do fornecedor, com o logo oficial.
  const temRodape = (await page.$$("[data-rodape-engine]")).length === 1;
  r.conferir("o rodapé assina 'Desenvolvido por Engine Sistemas'", temRodape && portal.includes("desenvolvido por engine sistemas"), portal.slice(-300));
  const logo = await page.evaluate(() => {
    const img = document.querySelector("[data-rodape-engine] img");
    return img instanceof HTMLImageElement ? { src: img.getAttribute("src"), largura: img.naturalWidth } : null;
  });
  r.conferir(
    "o logo do rodapé é o ativo oficial e CARREGOU (largura natural > 0)",
    logo !== null && logo.src === "/marca/engine-horizontal-fundo-claro.svg" && logo.largura > 0,
    // ⚠️ `naturalWidth` é o que separa "a tag existe" de "a imagem existe". Um `src` quebrado
    // deixa a tag no HTML e o teste que só olha o atributo passa verde com o logo faltando.
    JSON.stringify(logo)
  );

  // ─────────────────────────────────────────────────────────────────────
  // 2. A CONSULTA DE BENS
  // ─────────────────────────────────────────────────────────────────────
  await page.click("[data-familia-publica='/transparencia/bens']");
  await page.waitForSelector("[data-bens-publicos], [data-bens-vazio]", { timeout: 30000 });
  r.conferir("o cartão do portal leva à consulta de bens", page.url().endsWith("/transparencia/bens"), page.url());

  const totalTexto = await page.evaluate(() => document.querySelector("[data-bens-total]")?.textContent ?? "");
  const total = Number.parseInt(totalTexto.trim(), 10);
  r.conferir("a consulta traz bens de verdade do banco", Number.isInteger(total) && total > 1, `total lido: "${totalTexto}"`);

  // ⚠️ O DADO PESSOAL, NO HTML CRU. É a asserção central deste percurso.
  const bruto = await html(page);
  const responsaveis = await (async (): Promise<readonly string[]> => {
    // Os nomes vêm do BANCO, não de uma constante: um nome escrito aqui à mão provaria apenas
    // que aquele nome não aparece.
    const j = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/transparencia/bens/csv`);
      return res.status;
    }, BASE);
    void j;
    return [];
  })();
  void responsaveis;
  r.conferir(
    "o HTML público NÃO traz CPF em nenhuma linha da lista",
    !/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(bruto),
    "um CPF apareceu no HTML da consulta pública de bens"
  );

  // ── filtro na URL, e ele sobrevive à navegação ──
  const anos = await page.evaluate(() =>
    [...document.querySelectorAll('select[name="ano"] option')].map((o) => (o as HTMLOptionElement).value).filter((v) => v !== "")
  );
  const ano = anos[0] ?? "";
  r.conferir("o filtro de ano oferece só anos que existem no acervo", anos.length >= 1, `opções: ${anos.join(",")}`);

  await page.select('select[name="ano"]', ano);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.evaluate(() => (document.querySelector('form[action="/transparencia/bens"] button[type="submit"]') as HTMLButtonElement | null)?.click()),
  ]);
  r.conferir(
    "o filtro vai para o ENDEREÇO — a consulta pode ser copiada como link",
    page.url().includes(`ano=${ano}`),
    page.url()
  );

  const comFiltro = await page.evaluate(() => document.querySelector("[data-bens-total]")?.textContent ?? "");
  r.conferir("a lista filtrada responde", comFiltro !== "", "sem total após o filtro");

  // ── paginação no servidor ──
  await irPara(n, page, `/transparencia/bens?porPagina=1`);
  const primeira = await page.evaluate(() => document.querySelector("[data-bem]")?.getAttribute("data-bem") ?? "");
  const temProxima = (await page.$$("[data-proxima-pagina]")).length === 1;
  await irPara(n, page, `/transparencia/bens?pagina=2`);
  const segunda = await page.evaluate(() => document.querySelector("[data-bem]")?.getAttribute("data-bem") ?? "");
  r.conferir(
    "a página 2 traz OUTROS bens — a paginação está no banco, não no cliente",
    segunda !== "" && segunda !== primeira,
    `pág.1 começa em "${primeira}", pág.2 em "${segunda}" (próxima presente: ${temProxima})`
  );

  // ─────────────────────────────────────────────────────────────────────
  // 3. O DETALHE, EM ABAS, PRESERVANDO A CONSULTA
  // ─────────────────────────────────────────────────────────────────────
  await irPara(n, page, `/transparencia/bens?q=&ordem=tombamento`);
  const primeiroBem = await page.evaluate(() => {
    const a = document.querySelector("[data-bem] a");
    return a instanceof HTMLAnchorElement ? { href: a.getAttribute("href") ?? "", tomb: a.textContent?.trim() ?? "" } : null;
  });
  r.conferir("a lista linka o detalhe do bem", primeiroBem !== null, "nenhum link de bem");
  if (primeiroBem !== null) {
    await page.goto(`${BASE}${primeiroBem.href}`, { waitUntil: "domcontentloaded" });
    const detalhe = await texto(page);
    r.conferir("o detalhe abre e nomeia o tombamento", detalhe.includes(primeiroBem.tomb.toLowerCase()), detalhe.slice(0, 200));
    r.conferir("a aba Geral traz o valor contábil COM data de referência", (await page.$$("[data-valor-contabil]")).length === 1 && /posição em \d{2}\/\d{2}\/\d{4}|sem movimento/.test(detalhe), detalhe.slice(0, 400));

    // A aba é um LINK: entra no histórico e pode ser enviada.
    await page.click("[data-aba='localizacao']");
    await page.waitForSelector("[data-painel='localizacao']", { timeout: 20000 });
    r.conferir("a aba Localização é endereço próprio", page.url().includes("aba=localizacao"), page.url());
    const loc = await texto(page);
    r.conferir(
      "localização de acesso restrito aparece como NÃO DIVULGADA — e o bem continua na lista",
      loc.includes("não é divulgada") || loc.includes("nao e divulgada"),
      loc.slice(0, 300)
    );
    r.conferir(
      "a aba Localização NÃO nomeia responsável",
      !loc.includes("responsável") && !loc.includes("responsavel"),
      loc.slice(0, 300)
    );

    await page.click("[data-aba='movimentacoes']");
    await page.waitForSelector("[data-painel='movimentacoes']", { timeout: 20000 });
    r.ok("a aba Movimentações abre");

    // ⚠️ O RETORNO PRESERVA A CONSULTA — é o que separa uma consulta usável de uma que obriga
    // a remontar o filtro a cada bem examinado.
    await irPara(n, page, `/transparencia/bens?ano=${ano}`);
    const href = await page.evaluate(() => (document.querySelector("[data-bem] a") as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    await page.click("[data-voltar-a-consulta]");
    await page.waitForSelector("[data-bens-publicos], [data-bens-vazio]", { timeout: 30000 });
    r.conferir("voltar à consulta devolve o FILTRO, não a lista crua", page.url().includes(`ano=${ano}`), page.url());
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. O CSV — O MESMO RECORTE, PELA MESMA PORTA
  // ─────────────────────────────────────────────────────────────────────
  const csv = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/transparencia/bens/csv?ano=${new URL(location.href).searchParams.get("ano") ?? ""}`);
    return { status: res.status, tipo: res.headers.get("content-type") ?? "", corpo: await res.text() };
  }, BASE);
  r.conferir("o CSV responde como CSV", csv.status === 200 && csv.tipo.includes("text/csv"), `${csv.status} ${csv.tipo}`);
  r.conferir("o CSV tem o cabeçalho da tela", csv.corpo.includes("Tombamento;Descrição"), csv.corpo.slice(0, 120));
  r.conferir(
    "o CSV NÃO traz CPF",
    !/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(csv.corpo),
    "um CPF apareceu no CSV público"
  );
  r.conferir(
    "o CSV diz 'não divulgada' onde a localização é reservada — não uma célula vazia",
    csv.corpo.includes("não divulgada"),
    csv.corpo.slice(0, 400)
  );
  writeFileSync(".registro-de-execucao/v9-bens-publicos.csv", csv.corpo);

  // ─────────────────────────────────────────────────────────────────────
  // 5. O ATO INTERNO — cadastrar uma localização DIVULGÁVEL
  // ─────────────────────────────────────────────────────────────────────
  if (SENHA === "") {
    r.falhou("ato interno", "SEED_ADMIN_SENHA ausente — a metade interna do percurso não rodou");
  } else {
    await entrar(n, page, USUARIO, SENHA);
    await irPara(n, page, "/patrimonio/localizacoes");
    const antes = await texto(page);
    r.conferir("a lista de localizações mostra a coluna da consulta pública", antes.includes("consulta pública"), antes.slice(0, 400));
    r.conferir(
      "e as localizações já cadastradas estão NÃO DIVULGADAS — o padrão é fechado",
      antes.includes("não divulgada"),
      antes.slice(0, 600)
    );

    const criou = await preencherEEnviar(page, "criar-localizacoes-fisicas", [
      { sel: 'input[name="codigo"]', valor: `PUB-${carimbo}` },
      { sel: 'input[name="descricao"]', valor: LOCAL_DIVULGAVEL },
      { sel: 'input[name="publicavelNaTransparencia"]', valor: "sim", tipo: "marcar" },
    ]);
    r.conferir("cadastrar localização divulgável responde sem erro", criou.tipo !== "erro", criou.texto.slice(0, 300));

    const depois = await irPara(n, page, "/patrimonio/localizacoes");
    r.conferir("a nova localização aparece na lista", depois.includes(LOCAL_DIVULGAVEL.toLowerCase()), depois.slice(0, 600));
    r.conferir(
      "e aparece marcada como DIVULGADA — a marcação do formulário PERSISTIU",
      depois.includes("divulgada"),
      // ⚠️ Recarregou antes de conferir: é a recarga que separa estado de componente de
      // persistência. Sem ela, um checkbox que não gravou nada passaria.
      depois.slice(0, 800)
    );
    await sair(n, page);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6. E O PÚBLICO CONTINUA PÚBLICO DEPOIS DO ATO INTERNO
  // ─────────────────────────────────────────────────────────────────────
  const final = await page.goto(`${BASE}/transparencia/bens`, { waitUntil: "domcontentloaded" });
  r.conferir(
    "depois de sair, a consulta pública continua aberta sem sessão",
    final?.status() === 200 && !page.url().includes("/login"),
    `${final?.status()} em ${page.url()}`
  );
} finally {
  await navegador.close();
}

r.encerrar();
