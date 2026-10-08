import puppeteer, { type Browser, type LaunchOptions, type Page } from "puppeteer";
import { preflightDoNavegador } from "./preflight-navegador.js";

/**
 * OS AJUDANTES DE NAVEGADOR DOS PERCURSOS NOVOS (V6.2) — um lugar só.
 *
 * ⚠️ `PERCURSOS-SEM-HELPER-COMUM`: dez cópias de `preencherEEnviar`, cinco das quais perderam o ramo
 * do campo de data. Os percursos ANTIGOS continuam com as suas cópias (migrá-los todos de uma vez
 * mudaria vinte arquivos que hoje passam); os percursos NOVOS desta rodada — ficha pela tela,
 * encargos da folha e os serviços do P3 — nascem daqui, e a pendência encolhe em vez de crescer.
 *
 * O corpo é o do `smoke-atesto-da-folha.ts` (o mais recente e o que já passou pelos cinco papéis),
 * com a base como parâmetro e o campo referenciado (`CampoReferenciado`) acrescentado.
 */

/**
 * LANÇA O NAVEGADOR DO PERCURSO SÓ DEPOIS DO PREFLIGHT. Binário ausente para o percurso ANTES do
 * primeiro clique, com o diagnóstico e o comando de reposição — nunca como falha de um passo.
 */
export async function lancarNavegadorDoPercurso(opcoes: LaunchOptions = {}): Promise<Browser> {
  const r = await preflightDoNavegador();
  if (!r.ok) {
    console.error(`[navegador] BLOQUEADO POR AMBIENTE — ${r.diagnostico}`);
    process.exit(3);
  }
  console.log(`[navegador] ${r.versaoEsperada} em ${r.executavel}`);
  return puppeteer.launch({ headless: true, protocolTimeout: 180000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"], ...opcoes });
}

export interface Navegador {
  readonly base: string;
}

export interface CampoDoPercurso {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select" | "data" | "marcar" | "referencia" | "arquivo";
  readonly indice?: number;
  /** Para `referencia`: o texto a buscar; o valor é o `data-valor` da opção a escolher ("" = a primeira). */
  readonly busca?: string;
}

export interface Resposta {
  readonly tipo: "ok" | "erro" | "silencio";
  readonly texto: string;
}

const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function texto(page: Page): Promise<string> {
  const bruto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  return bruto.toLowerCase();
}

export async function entrar(n: Navegador, page: Page, usuario: string, senha: string): Promise<void> {
  await page.goto(`${n.base}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[type="submit"]', { timeout: 60000 });
  await page.type('input[name="identificador"]', usuario);
  await page.type('input[name="senha"]', senha);
  const enviou = await page.evaluate(() => {
    const f = document.querySelector("form");
    if (!(f instanceof HTMLFormElement)) return "não achei o formulário de login";
    if (!f.checkValidity()) return "o formulário de login não passou na validação do navegador";
    f.requestSubmit();
    return "";
  });
  if (enviou !== "") throw new Error(enviou);
  for (let i = 0; i < 120; i += 1) {
    await espera(500);
    if (!page.url().includes("/login")) return;
  }
  throw new Error(`login de ${usuario} não passou (ainda em ${page.url()}).`);
}

export async function sair(n: Navegador, page: Page): Promise<void> {
  await page.goto(`${n.base}/`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    const f = Array.from(document.querySelectorAll("form")).find((x) => x.querySelector('button[title="Sair"]'));
    f?.requestSubmit();
  });
  for (let i = 0; i < 60; i += 1) {
    await espera(500);
    if (page.url().includes("/login")) return;
  }
  throw new Error("sair não voltou ao login");
}

export async function irPara(n: Navegador, page: Page, rota: string): Promise<string> {
  let resposta = null;
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      resposta = await page.goto(`${n.base}${rota}`, { waitUntil: "networkidle2" });
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      /**
       * ═══ ⚠️ `ERR_ABORTED` ENTROU AQUI PORQUE A LISTA ENUMERAVA AS FORMAS QUE CONHECIA ═══
       *
       * MEDIDO em dois percursos do adiantamento salarial (V13 r4 e r5), com a mesma assinatura no
       * log do PRÓPRIO servidor:
       *
       *     POST /login 303
       *     GET /?exercicio=2026 200 in 213ms
       *     GET /?exercicio=2026 200 in 213ms     <- a redireção pós-login acontece DUAS vezes
       *     GET /folha/tabelas    200 in 1500ms   <- o servidor ENTREGOU a página
       *
       * O servidor respondeu **200**. Quem abortou foi o Chrome, porque `entrar()` devolve assim
       * que a URL deixa de conter `/login` — e nesse instante a cadeia de redireção pós-login pode
       * estar AINDA EM VOO. O `page.goto` seguinte corre com ela, e o navegador cancela um dos
       * dois. O sintoma aparece na navegação SEGUINTE ao login, o que fez a falha parecer ser da
       * página (`/folha/folhas` na r4, `/folha/tabelas` na r5) quando não era de nenhuma das duas.
       *
       * ⚠️ E ISTO NÃO ENFRAQUECE A MEDIÇÃO. A conferência que vale continua abaixo, intacta:
       * `status !== 200` lança, e voltar ao `/login` lança. Uma página realmente quebrada falha na
       * retentativa também — o que se tolera aqui é a corrida, não o defeito.
       *
       * A espera é curta de propósito: a corrida se resolve em milissegundos, e os 8 s dos outros
       * três casos existem para servidor que caiu, que é outra coisa.
       */
      const corrida = /ERR_ABORTED/.test(msg);
      if (tentativa >= 3 || !(corrida || /ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE/.test(msg))) throw e;
      await espera(corrida ? 750 : 8000);
    }
  }
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}

/** A rota recusa quem não pode: redireciona para /sem-acesso ou /login, ou mostra a recusa. */
export async function barrado(n: Navegador, page: Page, rota: string): Promise<{ readonly barrado: boolean; readonly url: string; readonly status: number }> {
  const r = await page.goto(`${n.base}${rota}`, { waitUntil: "networkidle2" });
  const url = page.url();
  const corpo = await texto(page);
  return { barrado: url.includes("/sem-acesso") || url.includes("/login") || /acesso negado|não tem a ação|sem acesso|não está no seu acesso/.test(corpo) || (r?.status() ?? 0) === 404, url, status: r?.status() ?? 0 };
}

export async function hrefDoRegistro(page: Page, trecho: string): Promise<string | null> {
  return page.evaluate((t) => {
    const a = Array.from(document.querySelectorAll("tbody a, main a")).find((x) => (x.textContent ?? "").includes(t)) as HTMLAnchorElement | undefined;
    if (a === undefined) return null;
    const u = new URL(a.href);
    return `${u.pathname}${u.search}`;
  }, trecho);
}

/** GET autenticado pela sessão do navegador — para provar a resposta de uma rota de dados. */
export async function buscarJson(page: Page, url: string): Promise<{ readonly status: number; readonly corpo: unknown }> {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { headers: { accept: "application/json" }, cache: "no-store" });
    let corpo: unknown = null;
    try {
      corpo = await r.json();
    } catch {
      corpo = null;
    }
    return { status: r.status, corpo };
  }, url);
}

/** Escolhe uma opção de um `CampoReferenciado`: digita, espera a lista do servidor, clica. */
async function escolherReferencia(page: Page, form: string, campo: CampoDoPercurso): Promise<void> {
  const raiz = `${form} [data-seletor]:has(input[type="hidden"][name="${campo.sel}"])`;
  await page.waitForSelector(`${raiz} input[role="combobox"]`, { timeout: 30000 });
  const combo = await page.$(`${raiz} input[role="combobox"]`);
  if (combo === null) throw new Error(`seletor referenciado "${campo.sel}" não encontrado`);
  await combo.click({ count: 3 });
  await page.keyboard.press("Backspace");
  if ((campo.busca ?? "") !== "") await combo.type(campo.busca ?? "", { delay: 10 });
  const opcao = campo.valor === "" ? `${raiz} [role="option"]` : `${raiz} [role="option"][data-valor="${campo.valor}"]`;
  await page.waitForSelector(opcao, { timeout: 20000 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  }, opcao);
  for (let i = 0; i < 20; i += 1) {
    const v = await page.$eval(`${raiz} input[type="hidden"][name="${campo.sel}"]`, (el) => (el as HTMLInputElement).value);
    if (v !== "") return;
    await espera(150);
  }
  throw new Error(`a escolha em "${campo.sel}" não chegou ao campo escondido`);
}

/**
 * V37 — escolhe num `CampoReferenciado` FORA do `preencherEEnviar` (para os scripts com auxiliar próprio, ou quando o
 * resto do formulário depende da escolha): digita a busca, clica na opção (a de `valor`, ou a primeira) e devolve o
 * valor que chegou ao campo escondido.
 */
export async function escolherPelaBusca(page: Page, form: string, nome: string, busca: string, valor = ""): Promise<string> {
  await escolherReferencia(page, form, { sel: nome, valor, busca, tipo: "referencia" });
  return page.$eval(`${form} [data-seletor] input[type="hidden"][name="${nome}"]`, (el) => (el as HTMLInputElement).value);
}

/**
 * ⚠️ `nomeDoResultado` (V11 V9.2) — ACRÉSCIMO OPCIONAL, nenhum chamador existente muda.
 *
 * O contrato declarado do V6.2 é `data-resultado-da-acao="<nome>"`, e até aqui este helper só
 * descobria esse `<nome>` extraindo-o do `data-acao="..."` do SELETOR. Isso cobre o formulário
 * que traz os dois atributos com o mesmo nome — e deixa de fora o que tem só o marcador de
 * resultado (`FormTitular`, `FormAtribuir`, os de `FormsDaEntidade`): o formulário some no
 * sucesso, o `<p>` de resultado fica FORA dele, e o helper lê "silêncio" por vinte segundos
 * antes de devolver um resultado que existe na tela.
 *
 * Quem chamar esses formulários passa o nome do marcador aqui. Sem o parâmetro, o
 * comportamento é exatamente o de antes.
 */
export async function preencherEEnviar(page: Page, acao: string, campos: readonly CampoDoPercurso[], nomeDoResultado?: string): Promise<Resposta> {
  const form = acao.startsWith("form[") ? acao : `form[data-acao="${acao}"]`;
  // ⚠️ TRAZER A ABA PARA A FRENTE, E ISSO NÃO É COSMÉTICO — É A CAUSA MEDIDA DE UM PERCURSO
  // QUE MORRIA SEM DIZER ONDE (V11 V6.4). Num percurso de DUAS ABAS (a tela velha de quem
  // ficou com a página aberta), abrir a segunda joga a primeira para segundo plano. O Chrome
  // não entrega `IntersectionObserver` a aba oculta, e é dele que o `elementHandle.click` do
  // puppeteer depende para rolar até o elemento: a promessa NUNCA resolve e o percurso morre
  // no `protocolTimeout` com "Runtime.callFunctionOn timed out", sem nome de passo.
  //
  // Medido na sonda do passo 13.3 do percurso da ponte contratual, com protocolTimeout de 20 s:
  //   aba em primeiro plano          click -> 0,0 s
  //   aba em segundo plano           click -> 20,0 s e ERRO (o timeout inteiro)
  //   aba em segundo plano + este bringToFront  click -> 0,6 s
  //   `evaluate` no MESMO elemento, em segundo plano -> 0,0 s (não é o contexto que trava)
  //
  // Aumentar o `protocolTimeout` trocaria 180 s por 360 s e manteria a falha. E é o que a
  // pessoa faz: ela clica na aba antes de digitar nela.
  await page.bringToFront();
  await page.waitForSelector(form, { timeout: 30000 });
  // ⚠️ O formulário pode estar dentro de um <details> FECHADO (divulgação progressiva: "Estornar a medição nº 2").
  // Fechado, o Chrome não renderiza o conteúdo, e o clique do puppeteer não chega ao campo — o envio não acontece e o
  // percurso lê "silêncio", como se a tela não tivesse respondido. Abrir o detalhe é o que a pessoa faz ao clicar no
  // resumo. Medido em V7 M2 U7 (percurso da medição pela planilha, passo 3.5).
  await page.evaluate((sel) => {
    let n: HTMLElement | null = document.querySelector(sel);
    while (n !== null) {
      if (n instanceof HTMLDetailsElement) n.open = true;
      n = n.parentElement;
    }
  }, form);
  for (const campo of campos) {
    if (campo.tipo === "referencia") {
      await escolherReferencia(page, form, campo);
      continue;
    }
    const seletor = `${form} ${campo.sel}`;
    await page.waitForSelector(seletor, { timeout: 30000 });
    const alvo = (await page.$$(seletor))[campo.indice ?? 0];
    if (alvo === undefined) throw new Error(`"${seletor}" não casou o elemento de índice ${campo.indice ?? 0}`);
    // Reabrir o <details> DO CAMPO: entre a abertura feita acima e o clique, o React pode
    // remontar a árvore e o `open` voltar a false. Conferir que ele aparece faz o percurso
    // recusar nomeando o campo, em vez de clicar no vazio e ler "silêncio".
    const visivel = await alvo.evaluate((el) => {
      let n: HTMLElement | null = el as HTMLElement;
      while (n !== null) {
        if (n instanceof HTMLDetailsElement) n.open = true;
        n = n.parentElement;
      }
      const e = el as HTMLElement;
      return e.getClientRects().length > 0 || e.offsetParent !== null;
    });
    if (!visivel) {
      throw new Error(
        `"${seletor}" existe no DOM mas NÃO APARECE na tela — clicar nele penduraria o ` +
          `percurso até o timeout do protocolo. Confira se um <details> fechou de novo, ou se ` +
          `o campo está oculto por estado da tela. Nada foi enviado.`
      );
    }
    if (campo.tipo === "arquivo") {
      await (alvo as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(campo.valor);
      continue;
    }
    if (campo.tipo === "marcar") {
      await page.evaluate((sel, i, marcar) => {
        const el = document.querySelectorAll(sel)[i];
        if (!(el instanceof HTMLInputElement)) return;
        // ⚠️ A TÉCNICA AGORA É MEDIDA (V11 V8.7) — `scripts/marca-em-caixa.ts`, provada em
        // `test/ui/marca-em-caixa-controlada.test.tsx` contra um checkbox REALMENTE controlado
        // pelo React. Ela vai inline porque `page.evaluate` serializa a função e não alcança
        // import nenhum; o que a mantém honesta é o teste apontar para o MESMO desenho.
        //
        // Fecha `MARCAR-EM-CAMPO-CONTROLADO`. O medo registrado era real — clicar num checkbox
        // que já está como se quer o INVERTE, e marcar o marcado o desmarcaria em silêncio —, e a
        // guarda é uma linha. O que a pendência não previa é que a cura do `value` (o setter do
        // protótipo) NÃO funciona aqui: a medição a derrubou na primeira execução.
        if (el.checked === (marcar === "sim")) return;
        el.click();
      }, seletor, campo.indice ?? 0, campo.valor);
      continue;
    }
    if (campo.tipo === "select") {
      await alvo.select(campo.valor);
      await espera(300);
      continue;
    }
    if (campo.tipo === "data") {
      await page.evaluate((sel, i, valor) => {
        const el = document.querySelectorAll(sel)[i];
        if (!(el instanceof HTMLInputElement)) return;
        // ⚠️ O `value` VAI PELO SETTER NATIVO, E ISSO NÃO É FRESCURA — É A CAUSA MEDIDA DE UM
        // CAMPO QUE FICAVA VAZIO EM SILÊNCIO (V11 V7.2, passo 2.3 do percurso do crédito
        // adicional).
        //
        // Num input CONTROLADO (`value={estado} onChange={...}`), o React instala o próprio
        // setter de `value` no elemento e usa o valor ANTERIOR para decidir se houve mudança.
        // `el.value = x` grava por cima desse setter: o DOM passa a mostrar `x`, o evento
        // `input` dispara, e o React compara `x` com `x` — conclui que nada mudou e NÃO chama o
        // `onChange`. O estado continua vazio, o formulário continua inválido, o botão continua
        // desabilitado, e o percurso lê "silêncio" sem nome de campo.
        //
        // MEDIDO: `FormDecretoCredito` (controlado) ficava com `data=""` depois deste
        // preenchimento; `FormLeiCredito` (não-controlado), ao lado, recebia a data sem
        // problema — o que fazia o defeito parecer da tela, e não do preenchimento.
        //
        // Chamar o setter do PROTÓTIPO contorna o do React: o valor interno muda por baixo, o
        // React vê valor novo no `input` e chama o `onChange`. Em campo não-controlado o efeito
        // é idêntico ao de antes.
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter !== undefined) setter.call(el, valor);
        else el.value = valor;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, seletor, campo.indice ?? 0, campo.valor);
      continue;
    }
    await alvo.click({ count: 3 });
    await page.keyboard.press("Backspace");
    await alvo.type(campo.valor, { delay: 5 });
  }
  const temChave = (await page.$(`${form} input[name="__chave"]`)) !== null;
  if (temChave) await page.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  // V6.2 — o resultado de um ato que sai da barra fica em `[data-resultado-da-acao]`, com um número de
  // sequência. Guardar o número ANTES do clique impede ler o resultado do envio anterior como deste.
  const seqAntes = await page.evaluate((sel, dado) => {
    const nome = dado !== "" ? dado : (/data-acao="([^"]+)"/.exec(sel)?.[1] ?? "");
    return document.querySelector(`[data-resultado-da-acao="${nome}"]`)?.getAttribute("data-resultado-seq") ?? "";
  }, form, nomeDoResultado ?? "");
  const enviou = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const botao = f?.querySelector('button[type="submit"]');
    if (!(botao instanceof HTMLButtonElement)) return false;
    botao.click();
    return true;
  }, form);
  if (!enviou) throw new Error(`não achei o botão de envio de "${acao}"`);
  let resposta: Resposta = { tipo: "silencio", texto: "" };
  for (let i = 0; i < 40 && resposta.tipo === "silencio"; i += 1) {
    await espera(500);
    // ⚠️ NADA DE FUNÇÃO NOMEADA AQUI DENTRO. O `tsx` compila com esbuild e `keepNames`, que
    // embrulha toda função nomeada num `__name(...)` — helper que existe no processo do Node e
    // NÃO no contexto da página. Um `const doMarcador = ...` dentro deste callback derrubou o
    // percurso da J9 com "__name is not defined", um erro que não fala de nada do domínio.
    // Medido em 24/09/2026. O nome do marcador entra por argumento e se resolve inline.
    resposta = await page.evaluate((sel, antes, dado) => {
      const f = document.querySelector(sel);
      if (f === null) {
        const nome = dado !== "" ? dado : (/data-acao="([^"]+)"/.exec(sel)?.[1] ?? "");
        const r = document.querySelector(`[data-resultado-da-acao="${nome}"]`);
        if (r !== null && r.getAttribute("data-resultado-seq") !== antes) return { tipo: r.getAttribute("role") === "alert" ? ("erro" as const) : ("ok" as const), texto: (r.textContent ?? "").trim() };
        return { tipo: "silencio" as const, texto: "" };
      }
      const alerta = f?.querySelector('[role="alert"]');
      if (alerta !== null && alerta !== undefined && (alerta.textContent ?? "").trim() !== "") return { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() };
      const ps = Array.from(f?.querySelectorAll("p") ?? []);
      const bom = ps.find((x) => x.className.includes("status-ok"));
      if (bom !== undefined) return { tipo: "ok" as const, texto: (bom.textContent ?? "").trim() };

      // ⚠️ O FORMULÁRIO QUE **FICA** TAMBÉM PODE CONFIRMAR FORA DE SI (V11 V8.1).
      //
      // Até aqui, um ato só era lido pelo marcador `data-resultado-da-acao` quando o formulário
      // SUMIA da tela. Quando ele ficava, a única confirmação aceita era um `<p>` com a classe
      // `status-ok` DENTRO dele — e isso deixava de fora um caso legítimo e comum: a consulta que
      // devolve um painel de resultado ABAIXO do formulário (para quem quer consultar outra
      // coisa em seguida), e o ato público cuja confirmação vive ao lado do que se está lendo.
      //
      // Medido no percurso do guichê, passos 5.9, 5.10 e 5.12: os três atos FUNCIONARAM — a
      // evidência do próprio passo trazia o dia e a hora certos, e a asserção seguinte, que lia o
      // banco, passava — e mesmo assim o helper reportava "silêncio". A alternativa seria moldar
      // a tela ao teste, pondo um parágrafo `status-ok` dentro de um formulário onde ele não faz
      // sentido. O contrato declarado do V6.2 é `data-resultado-da-acao`; a classe é a heurística
      // mais velha. Passa a valer o contrato, com a MESMA guarda de sequência que impede ler o
      // resultado do envio anterior como se fosse deste.
      const nome = dado !== "" ? dado : (/data-acao="([^"]+)"/.exec(sel)?.[1] ?? "");
      const marcado = document.querySelector(`[data-resultado-da-acao="${nome}"]`);
      if (marcado !== null && marcado.getAttribute("data-resultado-seq") !== antes) {
        return {
          tipo: marcado.getAttribute("role") === "alert" ? ("erro" as const) : ("ok" as const),
          texto: (marcado.textContent ?? "").trim(),
        };
      }
      return { tipo: "silencio" as const, texto: "" };
    }, form, seqAntes, nomeDoResultado ?? "");
  }
  return resposta;
}

/** O registro de passos de um percurso, com a saída que o pacote de evidências guarda. */
export function registroDePassos(): {
  readonly ok: (p: string) => void;
  readonly conferir: (p: string, c: boolean, d: string) => void;
  readonly falhou: (p: string, d: string) => void;
  readonly encerrar: () => never | void;
} {
  const passos: string[] = [];
  const falhas: string[] = [];
  const ok = (p: string): void => {
    passos.push(p);
    console.log(`[ok] ${p}`);
  };
  const falhou = (p: string, d: string): void => {
    falhas.push(`${p} — ${d}`);
    console.error(`[FALHA] ${p} — ${d}`);
  };
  return {
    ok,
    falhou,
    conferir: (p, c, d) => (c ? ok(p) : falhou(p, d)),
    encerrar: () => {
      console.log(`\n${passos.length} passo(s) ok, ${falhas.length} falha(s).`);
      if (falhas.length > 0) {
        console.error(falhas.map((f) => ` - ${f}`).join("\n"));
        process.exit(1);
      }
    },
  };
}
