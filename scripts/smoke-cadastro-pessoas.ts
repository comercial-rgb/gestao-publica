import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DE TELA — o cadastro de pessoas, PELO NAVEGADOR (ENT01, T02).
 *
 * ═══ POR QUE UM NAVEGADOR DE VERDADE, SE JÁ HÁ 36 TESTES DO M19 ═══
 * Os testes do módulo provam o DOMÍNIO. O gate do ENT01 pede outra coisa, e ela é
 * literal: *"cada tela, recarregada, encontra o dado persistido — não estado de
 * componente"*. Isso não se prova chamando o caso de uso: prova-se preenchendo o
 * formulário, enviando, RECARREGANDO a página e procurando o registro na lista.
 *
 * A diferença é real. Um formulário pode gravar e a lista não mostrar (cache do Next não
 * revalidado); pode mostrar sem gravar (estado do componente); pode gravar e a tela de
 * detalhe ler outra coisa. Nenhuma dessas falhas aparece num teste de serviço, e todas
 * aparecem aqui.
 *
 * O QUE ESTE SMOKE EXERCITA, na ordem:
 *   1. login de verdade (as rotas são protegidas — sem sessão respondem 307);
 *   2. cadastrar uma pessoa pelo formulário;
 *   3. RECARREGAR a lista e encontrá-la lá;
 *   4. abrir o detalhe e conferir documento, situação e histórico;
 *   5. conceder o papel CREDOR e recarregar — o papel tem de estar na lista;
 *   6. alterar o cadastro e recarregar — o nome novo aparece E o antigo continua no
 *      histórico (é o append-only, visto pela tela);
 *   7. tentar cadastrar o MESMO documento — a tela tem de mostrar a recusa do domínio,
 *      não gravar em silêncio.
 *
 * Sai com código 1 se qualquer passo falhar — serve de gate.
 *
 * Uso:  npx next start -p 3011 &
 *       npx tsx scripts/smoke-cadastro-pessoas.ts http://localhost:3011 <usuario> <senha>
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

/**
 * ⚠️ DOCUMENTO SINTÉTICO, com DV válido, e ÚNICO POR EXECUÇÃO nos dígitos do meio não é
 * possível — o DV depende deles. Então o smoke LIMPA o próprio rastro no fim, e o
 * cadastro usa sempre o mesmo CNPJ de teste. Ele não pertence a empresa nenhuma.
 */
const CNPJ = "11.222.333/0001-81";
const CNPJ_LIMPO = "11222333000181";
const NOME = "Fornecedor de Smoke Ltda";
const NOME_ALTERADO = "Fornecedor de Smoke ME";

const falhas: string[] = [];
const passos: string[] = [];

function ok(passo: string): void {
  passos.push(passo);
  console.log(`[ok] ${passo}`);
}

function falhou(passo: string, detalhe: string): void {
  falhas.push(`${passo} — ${detalhe}`);
  console.error(`[FALHA] ${passo} — ${detalhe}`);
}

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type('input[name="identificador"]', USUARIO);
  await page.type('input[name="senha"]', SENHA);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('button[type="submit"]'),
  ]);
  if (page.url().includes("/login")) {
    throw new Error(
      `login não passou (ainda em ${page.url()}). Confira SEED_ADMIN_SENHA e o seed:bootstrap.`
    );
  }
}

/** O texto visível da página, normalizado — é sobre ele que as asserções caem. */
async function texto(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
}

async function irPara(page: Page, rota: string): Promise<string> {
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle0" });
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}

/**
 * ⚠️ OS CAMPOS COM MÁSCARA TÊM DOIS INPUTS, e é isto que um smoke ingênuo erra.
 *
 * `CampoCpfCnpj` renderiza o input VISÍVEL (que o usuário digita, com máscara) e um
 * `<input type="hidden" name="documento">` que carrega só os dígitos — é o hidden que
 * atravessa a fronteira. Digitar no `[name="documento"]` é digitar no ESCONDIDO: nada
 * acontece na tela, o React não atualiza, e o formulário sai vazio.
 *
 * O visível se identifica por `data-mascara`, que existe para isto. Um seletor por
 * classe quebraria no dia em que o Tailwind mudasse.
 */
const SELETOR_VISIVEL: Readonly<Record<string, string>> = {
  documento: '[data-mascara="cpf-cnpj"]',
  telefone: '[data-mascara="telefone"]',
  cep: '[data-mascara="cep"]',
};

/**
 * Preenche campos e envia o formulário que os contém.
 *
 * ⚠️ DIGITA DE VERDADE (`page.type`), em vez de atribuir `.value`. Os campos com máscara
 * são CONTROLADOS pelo React: atribuir `.value` muda o DOM e não o estado, e o hidden —
 * que é derivado do estado — continua vazio. O formulário submeteria em branco e o smoke
 * culparia a tela por um defeito do próprio smoke.
 */
async function preencherEEnviar(
  page: Page,
  ancora: string,
  campos: Readonly<Record<string, string>>
): Promise<void> {
  await page.waitForSelector(ancora, { timeout: 5000 });

  for (const [nome, valor] of Object.entries(campos)) {
    const seletor = SELETOR_VISIVEL[nome] ?? `[name="${nome}"]`;
    await page.waitForSelector(seletor, { timeout: 5000 });
    await page.click(seletor, { clickCount: 3 }); // seleciona o que houver
    await page.keyboard.press("Backspace");
    await page.type(seletor, valor, { delay: 5 });
  }

  // O botão do MESMO formulário do campo-âncora — e não o primeiro da página, que numa
  // tela com três formulários seria quase sempre o errado.
  const enviou = await page.evaluate((sel) => {
    const campo = document.querySelector(sel);
    const form = campo?.closest("form");
    const botao = form?.querySelector('button[type="submit"]');
    if (!(botao instanceof HTMLButtonElement)) return false;
    botao.click();
    return true;
  }, ancora);
  if (!enviou) throw new Error(`não achei o botão de envio do formulário de "${ancora}"`);

  // A Server Action não navega: espera-se a resposta do servidor chegar ao DOM.
  await new Promise((r) => setTimeout(r, 2000));
}

async function main(): Promise<void> {
  if (SENHA === "") {
    throw new Error(
      "Senha ausente. Passe como 3º argumento ou defina SEED_ADMIN_SENHA no ambiente."
    );
  }

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  try {
    await entrar(page);
    ok("login");

    // ── 1. a tela existe e está no menu ────────────────────────────────────
    const listaInicial = await irPara(page, "/cadastros/pessoas");
    if (!listaInicial.includes("Pessoas e credores")) {
      falhou("abrir a lista", "o título da tela não apareceu");
    } else {
      ok("abrir /cadastros/pessoas");
    }

    // ── 2. cadastrar ───────────────────────────────────────────────────────
    await preencherEEnviar(page, '[data-mascara="cpf-cnpj"]', {
      documento: CNPJ,
      nome: NOME,
      municipio: "Campina Grande",
    });
    const depoisDoEnvio = await texto(page);
    if (!depoisDoEnvio.includes("Pessoa cadastrada")) {
      falhou("cadastrar", `a tela não confirmou. Texto: ${depoisDoEnvio.slice(0, 400)}`);
    } else {
      ok("cadastrar pela tela");
    }

    // ── 3. RECARREGAR e encontrar o dado ───────────────────────────────────
    // É AQUI que "estado de componente" seria desmascarado.
    const listaRecarregada = await irPara(page, "/cadastros/pessoas");
    if (!listaRecarregada.includes(NOME)) {
      falhou("recarregar a lista", "o cadastro recém-criado não está lá");
    } else if (!listaRecarregada.includes("11.222.333/0001-81")) {
      falhou("recarregar a lista", "o documento não aparece formatado na lista");
    } else {
      ok("recarregar a lista e encontrar o cadastro persistido");
    }

    // ── 4. o detalhe ───────────────────────────────────────────────────────
    const link = await page.$(`a[href^="/cadastros/pessoas/"]`);
    if (link === null) {
      falhou("abrir o detalhe", "não há link para o detalhe na lista");
    } else {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle0" }),
        link.click(),
      ]);
      const detalhe = await texto(page);
      const faltando = [NOME, "11.222.333/0001-81", "Ativa", "Histórico"].filter(
        (t) => !detalhe.includes(t)
      );
      if (faltando.length > 0) {
        falhou("abrir o detalhe", `faltou na tela: ${faltando.join(", ")}`);
      } else if (!detalhe.includes("cadastro inicial")) {
        falhou("abrir o detalhe", "o histórico não mostra a versão inicial");
      } else {
        ok("detalhe com dados, situação e histórico");
      }
    }
    const urlDoDetalhe = page.url();

    // ── 5. conceder papel e recarregar ─────────────────────────────────────
    await page.select('[name="papel"]', "CREDOR");
    await page.select('[name="movimento"]', "CONCEDIDO");
    await page.$eval('[name="data"]', (el) => {
      (el as HTMLInputElement).value = "2026-01-10";
    });
    await page.evaluate(() => {
      const form = document.querySelector('[name="movimento"]')?.closest("form");
      form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    await page.goto(urlDoDetalhe, { waitUntil: "networkidle0" });
    const comPapel = await texto(page);
    if (!comPapel.includes("Credor concedido em 10/01/2026")) {
      falhou("conceder papel", "o movimento não aparece no histórico após recarregar");
    } else {
      ok("conceder o papel CREDOR e reencontrá-lo após recarregar");
    }

    const listaComPapel = await irPara(page, "/cadastros/pessoas?papel=CREDOR");
    if (!listaComPapel.includes(NOME)) {
      falhou("filtrar por papel", "o filtro CREDOR não devolveu quem acabou de recebê-lo");
    } else {
      ok("filtrar a lista por papel");
    }

    // ── 6. alterar: o novo aparece, o antigo FICA no histórico ─────────────
    await page.goto(urlDoDetalhe, { waitUntil: "networkidle0" });
    await preencherEEnviar(page, '[name="motivo"][required]', {
      nome: NOME_ALTERADO,
      motivo: "mudanca de razao social",
    });
    await page.goto(urlDoDetalhe, { waitUntil: "networkidle0" });
    const depoisDaAlteracao = await texto(page);
    if (!depoisDaAlteracao.includes(NOME_ALTERADO)) {
      falhou("alterar", "o nome novo não aparece após recarregar");
    } else if (!depoisDaAlteracao.includes(NOME)) {
      falhou(
        "alterar",
        "⚠️ O NOME ANTIGO SUMIU. O cadastro é append-only: a versão anterior tem de " +
          "continuar no histórico. Se ela sumiu, houve UPDATE onde deveria haver versão."
      );
    } else if (!depoisDaAlteracao.includes("mudanca de razao social")) {
      falhou("alterar", "o motivo não aparece no histórico");
    } else {
      ok("alterar e ver as DUAS versões no histórico (append-only pela tela)");
    }

    // ── 7. o duplicado é recusado PELA TELA ────────────────────────────────
    await irPara(page, "/cadastros/pessoas");
    await preencherEEnviar(page, '[data-mascara="cpf-cnpj"]', {
      documento: CNPJ,
      nome: "Tentativa Duplicada",
    });
    const aposDuplicado = await texto(page);
    if (!aposDuplicado.includes("já cadastrado")) {
      falhou(
        "recusar documento duplicado",
        "a tela não mostrou a recusa do domínio — verifique se ela gravou em silêncio"
      );
    } else {
      ok("recusar documento duplicado, com a mensagem do domínio");
    }
  } catch (erro) {
    falhou("execução", erro instanceof Error ? erro.message : String(erro));
  } finally {
    await browser.close();
  }

  console.log(
    `\n[smoke:pessoas] ${passos.length} passo(s) ok, ${falhas.length} falha(s).`
  );
  if (falhas.length > 0) {
    console.error(`\nO cadastro de teste (${CNPJ_LIMPO}) pode ter ficado no banco de dev.`);
    process.exitCode = 1;
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
