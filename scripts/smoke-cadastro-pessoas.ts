// ⚠️ O `.env` — para o smoke achar SEED_ADMIN_SENHA sem a senha passar pelo histórico do
// shell. O smoke do ENT02 já fazia isso; este não fazia, e a única forma de rodá-lo era
// digitar a senha como terceiro argumento, que fica gravado no `~/.zsh_history`.
import "dotenv/config";
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
 * O DOCUMENTO É GERADO A CADA EXECUÇÃO — e a versão anterior deste arquivo errava aqui.
 *
 * ═══ ⚠️ O COMENTÁRIO QUE ESTAVA AQUI ERA FALSO, DE DUAS MANEIRAS ═══
 * Ele dizia: "documento sintético único por execução não é possível — o DV depende dos
 * dígitos do meio. Então o smoke LIMPA o próprio rastro no fim."
 *
 *   · A premissa é falsa. O DV não impede um documento por execução: ele se CALCULA a
 *     partir dos dígitos sorteados, que é o que `cnpjDeTeste()` faz abaixo. O raciocínio
 *     confundia "não posso trocar os dígitos mantendo um DV fixo" com "não posso gerar um
 *     CNPJ válido aleatório".
 *   · E a conclusão era falsa também: **o smoke nunca limpou rastro nenhum**. Não havia
 *     teardown. O comentário descrevia um comportamento que não existia no arquivo.
 *
 * ═══ O QUE ISSO CUSTOU, MEDIDO ═══
 * O cadastro `11222333000181` ficou no banco de desenvolvimento numa execução de
 * 2026-09-09 22:04:47. Da segunda execução em diante o passo 2 (cadastrar) era RECUSADO
 * pelo domínio — corretamente, porque o documento já existia —, e com ele caíam os passos
 * que dependiam do cadastro novo. Resultado: **6 ok / 3 falhas**, nenhuma delas um defeito
 * do sistema. O smoke acusava o próprio rastro.
 *
 * ═══ ⚠️ POR QUE GERAR, E NÃO LIMPAR NO FIM ═══
 * Um teardown resolve o caso feliz e falha justamente quando importa: se o processo morre
 * no meio (ou o `finally` não roda, ou a máquina cai), o rastro fica e a execução seguinte
 * herda o problema — que é exatamente o que aconteceu. Um documento por execução torna o
 * smoke idempotente **por construção**: não há estado a limpar, porque não há colisão
 * possível.
 *
 * ⚠️ E O RASTRO QUE FICA É DELIBERADO, como no smoke do ENT02: um cadastro por execução no
 * banco de dev, com o instante no nome. Apagá-lo exigiria dar ao smoke poder de DELETE
 * sobre um cadastro append-only — e o M19 não tem delete, de propósito.
 *
 * ⚠️ O DOCUMENTO NÃO PERTENCE A EMPRESA NENHUMA. A raiz é sorteada em 8 dígitos e o DV é
 * calculado; a chance de colidir com um CNPJ real existe no papel e não tem consequência,
 * porque este é um banco de desenvolvimento local.
 */
function cnpjDeTeste(): string {
  const raiz = Array.from({ length: 8 }, () =>
    String(Math.floor(Math.random() * 10))
  ).join("");
  const base = `${raiz}0001`;
  const dv = (parcial: string): string => {
    // Pesos do módulo 11 da Receita, da direita para a esquerda: 2..9 e recomeça em 2.
    let soma = 0;
    let peso = 2;
    for (let i = parcial.length - 1; i >= 0; i--) {
      soma += Number(parcial[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return String(resto < 2 ? 0 : 11 - resto);
  };
  const d1 = dv(base);
  const d2 = dv(base + d1);
  return `${base}${d1}${d2}`;
}

const CNPJ_LIMPO = cnpjDeTeste();
const CNPJ = `${CNPJ_LIMPO.slice(0, 2)}.${CNPJ_LIMPO.slice(2, 5)}.${CNPJ_LIMPO.slice(5, 8)}/${CNPJ_LIMPO.slice(8, 12)}-${CNPJ_LIMPO.slice(12)}`;

const SUF = String(Date.now()).slice(-6);
const NOME = `Fornecedor de Smoke ${SUF} Ltda`;
const NOME_ALTERADO = `Fornecedor de Smoke ${SUF} ME`;

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
    // `count`, e não `clickCount`: o nome mudou no Puppeteer e a opção desconhecida era
    // ACEITA em silêncio — o clique virava um só, o campo não era selecionado e o valor
    // novo se concatenava ao velho. O `typecheck:scripts` é quem pegou.
    await page.click(seletor, { count: 3 }); // seleciona o que houver
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
    } else if (!listaRecarregada.includes(CNPJ)) {
      falhou("recarregar a lista", "o documento não aparece formatado na lista");
    } else {
      ok("recarregar a lista e encontrar o cadastro persistido");
    }

    // ── 4. o detalhe ───────────────────────────────────────────────────────
    //
    // ⚠️ O LINK É O DA LINHA DESTE CADASTRO, não o primeiro da lista. `page.$` devolve o
    // PRIMEIRO elemento do documento — num banco de desenvolvimento com outras pessoas
    // cadastradas, ele abriria o detalhe de OUTRA. O smoke então conferiria nome, documento
    // e histórico de um cadastro que ele não criou, e falharia dizendo "o detalhe não traz
    // o nome" — sintoma verdadeiro, causa errada.
    //
    // É a mesma família do defeito que o smoke do ENT02 teve com os catorze formulários da
    // tela do processo: seletor global onde a identidade da linha é o que importa.
    const hrefDetalhe = await page.evaluate((doc) => {
      for (const tr of Array.from(document.querySelectorAll("tbody tr"))) {
        if (tr.textContent?.includes(doc) !== true) continue;
        const a = tr.querySelector('a[href^="/cadastros/pessoas/"]');
        if (a instanceof HTMLAnchorElement) return a.getAttribute("href");
      }
      return null;
    }, CNPJ);

    if (hrefDetalhe === null) {
      falhou("abrir o detalhe", `não há link para o detalhe da linha de ${CNPJ}`);
    } else {
      await page.goto(`${BASE}${hrefDetalhe}`, { waitUntil: "networkidle0" });
      const detalhe = await texto(page);
      const faltando = [NOME, CNPJ, "Ativa", "Histórico"].filter(
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
    // ⚠️ O AVISO MUDOU DE SENTIDO. Antes ele alertava para um rastro que ENVENENAVA a
    // execução seguinte; agora o documento é sorteado a cada corrida, então o cadastro que
    // fica é apenas um registro a mais no banco de dev — como o processo e o comunicado que
    // o smoke do ENT02 deixam. Ele continua sendo dito porque quem opera o ambiente deve
    // saber o que apareceu lá, e por qual execução.
    console.error(
      `\nO cadastro desta execução (${CNPJ_LIMPO} — "${NOME}") ficou no banco de dev. ` +
        `Ele NÃO atrapalha a próxima execução: o documento é sorteado a cada corrida.`
    );
    process.exitCode = 1;
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
