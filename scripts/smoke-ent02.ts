// `.env` para o smoke achar SEED_ADMIN_SENHA sem a senha passar pelo histórico do shell.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DO ENT02, PELO NAVEGADOR — a definição de concluído do lote (§6).
 *
 * ═══ O QUE O PROMPT PEDE, LITERAL ═══
 *   · um processo digital percorre abertura, tramitação, parecer, readequação,
 *     encerramento e arquivamento, PELA INTERFACE, com dados persistidos e visíveis
 *     APÓS RECARGA;
 *   · um comunicado percorre inclusão, resposta, encaminhamento, leitura registrada e
 *     arquivamento;
 *   · um relatório operacional é produzido PELO DESIGNER, com modelo copiado,
 *     visibilidade definida e execução em segundo plano.
 *
 * ═══ ⚠️ POR QUE NENHUM TESTE DE MÓDULO PROVA ISSO ═══
 * A suíte prova o domínio. Estas falhas passam por ela inteira:
 *   · o formulário grava e a lista não mostra (cache do Next não revalidado);
 *   · a lista mostra e nada gravou (estado de componente);
 *   · o seletor oferece uma opção que o servidor recusa;
 *   · a Server Action perde um campo entre o `FormData` e a porta.
 *
 * ⚠️ ESTE SMOKE NÃO LIMPA O BANCO. Ele acrescenta um processo e um comunicado ao banco
 * de desenvolvimento, e eles ficam lá — encerrados e arquivados, como ficariam na vida
 * real. Os textos levam o instante da execução para não se confundirem com os da
 * execução anterior.
 *
 * ⚠️ A CADA EXECUÇÃO O PROTOCOLO AVANÇA UM NÚMERO. Isso é o comportamento certo: a
 * numeração é sequencial por exercício e não se reaproveita.
 *
 * Pré-requisitos:
 *   SEED_IDENTIDADE=<usuario ativo> npm run seed:ent02
 *   (e as ações do ENT02 concedidas ao perfil — ver scripts/conceder-acoes-ao-perfil.ts)
 *
 * Uso:  npx next start -p 3011 &
 *       npx tsx scripts/smoke-ent02.ts http://localhost:3011 <usuario> <senha>
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const SUF = String(Date.now()).slice(-6);
const TEXTO_ABERTURA = `Solicito analise do pedido ${SUF}, conforme documentos anexos.`;
const DESPACHO = `Ao juridico para manifestacao ${SUF}.`;
const PEDIDO_PARECER = `Solicito manifestacao sobre a viabilidade ${SUF}.`;
const PARECER = `Manifestacao favoravel ao pedido ${SUF}.`;
const PEDIDO_READEQUACAO = `Falta o comprovante de residencia ${SUF}.`;
const RESPOSTA_READEQUACAO = `Comprovante anexado ${SUF}.`;
const ENCERRAMENTO = `Pedido deferido nos termos do parecer ${SUF}.`;
const ARQUIVAMENTO = `Arquive-se ${SUF}.`;

// ⚠️ O CONTEÚDO É COMPARADO BYTE A BYTE NO DOWNLOAD. Um arquivo aleatório provaria que
// "algo desceu"; este prova que desceu O MESMO — que é o que a conferência de integridade
// do M22 promete e o que um lote montado errado quebraria em silêncio.
const CONTEUDO_ANEXO = `%PDF-1.7\nrequerimento do smoke ${SUF}\n`;

const ASSUNTO_COMUNICADO = `Orientacao interna ${SUF}`;
const CORPO_COMUNICADO = `Segue orientacao sobre o procedimento ${SUF}.`;
const CORPO_RESPOSTA = `Ciente da orientacao ${SUF}.`;

const CODIGO_MODELO = `smoke_${SUF}`;
const NOME_MODELO = `Relacao de processos por assunto e situacao ${SUF}`;
const CODIGO_COPIA = `smoke_copia_${SUF}`;

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

function conferir(passo: string, condicao: boolean, detalhe: string): void {
  if (condicao) ok(passo);
  else falhou(passo, detalhe);
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

interface CampoDoSmoke {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select" | "multi";
  readonly indice?: number;
}

/**
 * PREENCHE UM FORMULÁRIO IDENTIFICADO POR `data-acao` E O ENVIA.
 *
 * ═══ ⚠️ POR QUE O FORMULÁRIO PRECISA TER NOME ═══
 * A tela do processo tem catorze formulários, e vários compartilham nomes de campo
 * (`texto`, `setorDestinoId`). A primeira versão deste smoke localizava o formulário
 * pelo primeiro campo com aquele nome — e, como `document.querySelector` devolve o
 * PRIMEIRO da página, ela preenchia os campos do parecer e apertava o botão do TRÂMITE.
 * Passou pelos oito primeiros passos e falhou no nono dizendo que o parecer não
 * aparecera. Era verdade: o parecer nunca foi enviado.
 *
 * A correção foi na TELA, não aqui: cada `<form>` ganhou `data-acao`. É a mesma
 * disciplina do `data-mascara` — um marcador estável para o que a estrutura visual não
 * consegue identificar sozinha.
 *
 * ⚠️ E OS CAMPOS SÃO PROCURADOS DENTRO DO FORMULÁRIO, não na página. Um índice global
 * mudaria de significado toda vez que uma pendência fizesse aparecer um formulário a
 * mais.
 *
 * ⚠️ DIGITA DE VERDADE nos campos de texto. Atribuir `.value` num campo controlado muda
 * o DOM e não o estado do React, e o valor não chega ao servidor.
 */
async function preencherEEnviar(
  page: Page,
  acao: string,
  campos: readonly CampoDoSmoke[]
): Promise<void> {
  const form = `form[data-acao="${acao}"]`;
  await page.waitForSelector(form, { timeout: 15000 });

  for (const campo of campos) {
    const seletor = `${form} ${campo.sel}`;
    await page.waitForSelector(seletor, { timeout: 15000 });
    const alvos = await page.$$(seletor);
    const alvo = alvos[campo.indice ?? 0];
    if (alvo === undefined) {
      throw new Error(
        `"${seletor}" casou ${alvos.length} elemento(s); o smoke pediu o de índice ${campo.indice ?? 0}`
      );
    }
    if (campo.tipo === "select" || campo.tipo === "multi") {
      await alvo.select(campo.valor);
      continue;
    }
    await alvo.click({ count: 3 });
    await page.keyboard.press("Backspace");
    await alvo.type(campo.valor, { delay: 5 });
  }

  const enviou = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const botao = f?.querySelector('button[type="submit"]');
    if (!(botao instanceof HTMLButtonElement)) return false;
    botao.click();
    return true;
  }, form);
  if (!enviou) throw new Error(`não achei o botão de envio do formulário "${acao}"`);

  await new Promise((r) => setTimeout(r, 2500));

  // ⚠️ O QUE O SERVIDOR RESPONDEU FICA REGISTRADO — inclusive quando deu certo.
  //
  // A primeira versão deste smoke só dizia "não apareceu depois da recarga", e isso é
  // o SINTOMA: não diz se o servidor recusou (e por quê), se a ação nem foi chamada, ou
  // se gravou e a lista é que não mostra. São três defeitos diferentes com a mesma cara.
  const resposta = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const alerta = f?.querySelector('[role="alert"]');
    if (alerta !== null && alerta !== undefined) {
      return { tipo: "erro", texto: (alerta.textContent ?? "").trim() };
    }
    const paragrafos = Array.from(f?.querySelectorAll("p") ?? []);
    const ok = paragrafos.find((x) => x.className.includes("status-ok"));
    return ok !== undefined
      ? { tipo: "ok", texto: (ok.textContent ?? "").trim() }
      : { tipo: "silencio", texto: "" };
  }, form);

  if (resposta.tipo === "erro") {
    console.log(`      [servidor recusou "${acao}"] ${resposta.texto.slice(0, 300)}`);
  } else if (resposta.tipo === "silencio") {
    console.log(`      [sem resposta visível em "${acao}"]`);
  }
}

/** O `value` da primeira `<option>` do select cujo texto contém `trecho`. */
async function opcaoQueContem(
  page: Page,
  seletorDoSelect: string,
  trecho: string
): Promise<string> {
  const valor = await page.evaluate(
    (sel, t) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return null;
      for (const o of Array.from(s.options)) {
        if (o.value !== "" && !o.disabled && o.textContent?.includes(t) === true) {
          return o.value;
        }
      }
      return null;
    },
    seletorDoSelect,
    trecho
  );
  if (valor === null) {
    throw new Error(`nenhuma opção de "${seletorDoSelect}" contém "${trecho}"`);
  }
  return valor;
}

/**
 * O RÓTULO DO PROCESSO recém-aberto ("12/2026"), lido da mensagem de sucesso.
 *
 * ⚠️ A MENSAGEM SÓ DÁ O IDENTIFICADOR — a PROVA vem depois. Ler dela que "deu certo"
 * não provaria nada: seria o componente dizendo o que ele mesmo acabou de renderizar.
 * O que prova é a etapa seguinte, que RECARREGA a caixa do servidor e procura a linha.
 *
 * ⚠️ E O TEXTO DE ABERTURA NÃO SERVE PARA ACHAR A LINHA: a caixa mostra número,
 * assunto, requerente, setor, situação e prazo — não o texto. A primeira versão deste
 * smoke procurava pelo texto e falhava dizendo "nenhuma linha menciona…", que era
 * verdade e não era o defeito que ele queria medir.
 */
async function rotuloDoProcessoCriado(page: Page): Promise<string> {
  const rotulo = await page.evaluate(() => {
    const corpo = document.body.innerText;
    const m = /Processo (\d+\/\d+) aberto/.exec(corpo);
    return m?.[1] ?? null;
  });
  if (rotulo === null) {
    const corpo = await texto(page);
    throw new Error(
      `a abertura não devolveu "Processo N/AAAA aberto". A tela diz: ${corpo.slice(0, 300)}`
    );
  }
  return rotulo;
}

/** O href do processo cujo rótulo é `numero/ano`, na caixa RECARREGADA do servidor. */
async function acharProcessoNaCaixa(page: Page, rotulo: string): Promise<string> {
  await irPara(page, "/protocolo/processos");
  const href = await page.evaluate((r) => {
    const linhas = Array.from(document.querySelectorAll("tbody tr"));
    for (const tr of linhas) {
      const primeira = tr.querySelector("td");
      if (primeira?.textContent?.includes(r) === true) {
        const link = tr.querySelector('a[href*="/protocolo/processos/"]');
        if (link instanceof HTMLAnchorElement) return link.getAttribute("href");
      }
    }
    return null;
  }, rotulo);
  if (href === null) {
    throw new Error(`o processo ${rotulo} não apareceu na caixa recarregada`);
  }
  return href;
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
    // não tivesse respondido. `--disable-dev-shm-usage` tira o /dev/shm pequeno do
    // caminho e `--disable-gpu` corta um processo inteiro que este smoke não usa.
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
    ],
    // ⚠️ E O `protocolTimeout` FICA EXPLÍCITO. O default (180s) transforma um renderer
    // lento numa espera de três minutos por passo; aqui a falha aparece rápido e com o
    // nome dela.
    protocolTimeout: 45000,
  });
  const page = await browser.newPage();
  // ⚠️ VIEWPORT LARGO, como no smoke da despesa. Num viewport estreito o layout colapsa
  // para uma coluna e os seletores por índice mudam de ordem — o smoke passaria a medir
  // o layout, não o comportamento.
  await page.setViewport({ width: 1440, height: 1200 });

  try {
    await entrar(page);
    ok("login");

    // ═══════════════════════════════════════════════════════════════════════
    // 1. O PROCESSO — abertura
    // ═══════════════════════════════════════════════════════════════════════
    const caixa = await irPara(page, "/protocolo/processos");
    conferir(
      "a caixa de processos abre e oferece o formulário de abertura",
      caixa.includes("Abrir processo"),
      "a tela não trouxe o formulário de abertura"
    );

    const assuntoId = await opcaoQueContem(page, 'select[name="assuntoId"]', "REQ");
    // ⚠️ O ASSUNTO REQ NÃO ACEITA ANÔNIMO, então o requerente do cadastro único é
    // OBRIGATÓRIO — e a tela só o oferece depois que o assunto é escolhido. Sem esta
    // etapa o formulário sai incompleto e o navegador bloqueia o envio por conta
    // própria, sem chamar o servidor: a falha se leria como "a tela não respondeu".
    await page.select('select[name="assuntoId"]', assuntoId);
    await new Promise((r) => setTimeout(r, 800));
    const requerente = await page.evaluate(() => {
      const s = document.querySelector('select[name="requerenteId"]');
      if (!(s instanceof HTMLSelectElement)) return null;
      const o = Array.from(s.options).find((x) => x.value !== "" && !x.disabled);
      return o?.value ?? null;
    });
    if (requerente === null) {
      throw new Error(
        "nenhum requerente disponível no cadastro único — rode o seed de pessoas antes"
      );
    }

    await preencherEEnviar(page, "abrir-processo", [
      { sel: 'select[name="requerenteId"]', valor: requerente, tipo: "select" },
      { sel: 'textarea[name="textoAbertura"]', valor: TEXTO_ABERTURA },
    ]);

    const rotulo = await rotuloDoProcessoCriado(page);
    const processoHref = await acharProcessoNaCaixa(page, rotulo);
    ok(`processo ${rotulo} aberto pela tela e reencontrado na caixa RECARREGADA`);

    let dossie = await irPara(page, processoHref);
    conferir(
      "o dossiê mostra o texto da abertura e a situação ABERTO",
      dossie.includes(TEXTO_ABERTURA.slice(0, 30)) && dossie.includes("Aberto"),
      "o dossiê não trouxe o texto de abertura ou a situação"
    );
    conferir(
      "o roteiro do assunto foi COPIADO para o processo",
      dossie.includes("Roteiro") && dossie.includes("Triagem"),
      "o processo não mostra o roteiro copiado do assunto"
    );

    // ═══════════════════════════════════════════════════════════════════════
    // 1b. ANEXO — o arquivo entra pela tela, sai pela rota, e NÃO sai para quem
    //     não tem permissão NO REGISTRO.
    //
    // ⚠️ ESTE BLOCO EXISTE PORQUE O ENT02 FECHOU SEM ELE. O M22 nasceu com caso de
    // uso, autorização por registro, hash e quinze testes — e com zero consumidores:
    // não havia porta, não havia rota, e o único input de arquivo do produto era o do
    // importador de CSV. O produto tinha um cofre sem porta.
    // ═══════════════════════════════════════════════════════════════════════
    const arquivoTemp = join(tmpdir(), `anexo-smoke-${SUF}.pdf`);
    writeFileSync(arquivoTemp, CONTEUDO_ANEXO);

    const inputArquivo = await page.$('form[data-acao="anexar"] input[type="file"]');
    if (inputArquivo === null) {
      throw new Error("a tela do processo não tem input de arquivo (form data-acao=anexar)");
    }
    await inputArquivo.uploadFile(arquivoTemp);
    await page.evaluate(() => {
      const f = document.querySelector('form[data-acao="anexar"]');
      const b = f?.querySelector('button[type="submit"]');
      if (b instanceof HTMLButtonElement) b.click();
    });
    await new Promise((r) => setTimeout(r, 3000));

    dossie = await irPara(page, processoHref);
    conferir(
      "anexar documento pela tela e reencontrá-lo na página RECARREGADA",
      dossie.includes(`anexo-smoke-${SUF}.pdf`),
      "o anexo não apareceu na lista de documentos depois da recarga"
    );

    // O href do anexo, lido da própria tela — é o endereço que um usuário teria.
    const hrefAnexo = await page.evaluate(() => {
      const a = document.querySelector("a[data-anexo]");
      return a instanceof HTMLAnchorElement ? a.getAttribute("href") : null;
    });
    if (hrefAnexo === null) throw new Error("a lista de documentos não expôs link de download");

    // ⚠️ O DOWNLOAD É MEDIDO POR HTTP, com o cookie da sessão — não por um clique cujo
    // resultado o navegador esconde numa pasta. O que importa aqui são o status, o
    // cabeçalho e os BYTES, e só o fetch os entrega.
    const baixado = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: "include" });
      return {
        status: r.status,
        disposicao: r.headers.get("content-disposition"),
        nosniff: r.headers.get("x-content-type-options"),
        hash: r.headers.get("x-anexo-sha256"),
        corpo: await r.text(),
      };
    }, hrefAnexo);

    conferir(
      "o anexo é entregue pela rota, com o conteúdo íntegro",
      baixado.status === 200 && baixado.corpo === CONTEUDO_ANEXO,
      `status ${baixado.status}, ${baixado.corpo.length} byte(s) — esperava ${CONTEUDO_ANEXO.length}`
    );
    conferir(
      "o download vem como anexo e sem adivinhação de tipo (attachment + nosniff)",
      baixado.disposicao?.startsWith("attachment") === true &&
        baixado.nosniff === "nosniff",
      `content-disposition=${baixado.disposicao} x-content-type-options=${baixado.nosniff}`
    );
    conferir(
      "o hash do arquivo viaja no cabeçalho — a integridade é conferível por fora",
      typeof baixado.hash === "string" && baixado.hash.length === 64,
      `x-anexo-sha256=${baixado.hash}`
    );

    // ⚠️ SEM SESSÃO, 404 — E ESTE É O TESTE 4 DO LOTE, o que estava PARCIAL no gate do
    // ENT02 justamente por não existir rota nenhuma para medir.
    //
    // A ausência de cookie tem de dar a MESMA resposta de "não existe". Um 401 ou um
    // redirecionamento para /login confirmaria que o anexo existe; pior, um 307 seguido
    // pelo browser faria o usuário salvar o HTML da tela de login com o nome do PDF.
    const semSessao = await browser.createBrowserContext();
    const anonima = await semSessao.newPage();
    // ⚠️ A PÁGINA PRECISA ESTAR NA ORIGEM ANTES DO `fetch`. A primeira versão chamava o
    // fetch de `about:blank` — e ele falhava por CORS, não por autorização. O smoke
    // acusou "a requisição anônima nem completou", que era verdade e não media nada: um
    // servidor que ENTREGASSE o anexo a qualquer um teria dado exatamente a mesma falha.
    // Um teste de segurança que passa a errar do lado seguro é o mais perigoso que existe.
    await anonima.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const respostaAnonima = await anonima.evaluate(async (u) => {
      try {
        const r = await fetch(u, { credentials: "omit", redirect: "manual" });
        return { status: r.status, tipo: r.headers.get("content-type") ?? "", erro: "" };
      } catch (e) {
        return { status: -1, tipo: "", erro: e instanceof Error ? e.message : String(e) };
      }
    }, hrefAnexo);
    await anonima.close();
    await semSessao.close();

    conferir(
      "quem NÃO tem sessão recebe 404 no endereço do anexo — nem o arquivo, nem a confirmação de que ele existe",
      respostaAnonima.status === 404 && !respostaAnonima.tipo.includes("pdf"),
      respostaAnonima.status === -1
        ? `a requisição anônima nem completou: ${respostaAnonima.erro}`
        : `respondeu ${respostaAnonima.status} (${respostaAnonima.tipo})`
    );

    // O LOTE. Dois documentos no processo, um zip com os dois.
    const loteResposta = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: "include" });
      const buf = await r.arrayBuffer();
      const b = new Uint8Array(buf);
      return {
        status: r.status,
        quantos: r.headers.get("x-anexos-no-lote"),
        tamanho: b.byteLength,
        // "PK\x03\x04" — a assinatura do header local de um zip.
        assinatura: b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
      };
    }, `${BASE}/documentos/lote?processo=${processoHref.split("/").pop()}`);

    conferir(
      "o download EM LOTE entrega um zip de verdade, com a contagem no cabeçalho",
      loteResposta.status === 200 &&
        loteResposta.assinatura &&
        Number(loteResposta.quantos) >= 1,
      `status ${loteResposta.status}, ${loteResposta.tamanho} byte(s), x-anexos-no-lote=${loteResposta.quantos}, assinatura zip=${loteResposta.assinatura}`
    );

    // ═══════════════════════════════════════════════════════════════════════
    // 2. TRAMITAÇÃO E RECEBIMENTO
    // ═══════════════════════════════════════════════════════════════════════
    const setorDestino = await opcaoQueContem(
      page,
      'form[data-acao="tramitar"] select[name="setorDestinoId"]',
      "JUR"
    );
    await preencherEEnviar(page, "tramitar", [
      { sel: 'select[name="setorDestinoId"]', valor: setorDestino, tipo: "select" },
      { sel: 'textarea[name="texto"]', valor: DESPACHO },
    ]);

    dossie = await irPara(page, processoHref);
    conferir(
      "tramitar pela tela e reencontrar o trâmite recarregando",
      dossie.includes(DESPACHO) && dossie.includes("Em trâmite"),
      "o trâmite não apareceu no dossiê recarregado"
    );

    // ⚠️ O BOTÃO DE RECEBER SÓ EXISTE COM O PROCESSO EM TRÂMITE. Se ele não estiver
    // aqui, a situação derivada está errada — e é isso que se quer descobrir.
    const temReceber = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent?.includes("Receber processo") === true
      )
    );
    conferir(
      "a tela oferece RECEBER — e só oferece porque a situação derivada diz que ele está em trâmite",
      temReceber,
      "o botão de receber não apareceu"
    );

    await page.evaluate(() => {
      const botao = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Receber processo") === true
      );
      botao?.click();
    });
    await new Promise((r) => setTimeout(r, 2500));

    dossie = await irPara(page, processoHref);
    conferir(
      "receber pela tela e reencontrar o recebimento recarregando",
      dossie.includes("Recebido") && dossie.includes("Em análise"),
      "o recebimento não apareceu ou a situação não virou Em análise"
    );

    // ═══════════════════════════════════════════════════════════════════════
    // 3. PARECER — pedir e responder
    // ═══════════════════════════════════════════════════════════════════════
    const setorParecer = await opcaoQueContem(
      page,
      'form[data-acao="solicitar-parecer"] select[name="setorDestinoId"]',
      "GAB"
    );
    await preencherEEnviar(page, "solicitar-parecer", [
      { sel: 'select[name="setorDestinoId"]', valor: setorParecer, tipo: "select" },
      { sel: 'textarea[name="texto"]', valor: PEDIDO_PARECER },
    ]);

    dossie = await irPara(page, processoHref);
    conferir(
      "pedir parecer pela tela — e a situação vira AGUARDANDO PARECER",
      dossie.includes(PEDIDO_PARECER) && dossie.includes("Aguardando parecer"),
      "o pedido de parecer não apareceu ou a situação não mudou"
    );

    const pedidoId = await opcaoQueContem(
      page,
      'form[data-acao="responder-parecer"] select[name="solicitacaoId"]',
      SUF
    );
    await preencherEEnviar(page, "responder-parecer", [
      { sel: 'select[name="solicitacaoId"]', valor: pedidoId, tipo: "select" },
      { sel: 'textarea[name="texto"]', valor: PARECER },
    ]);

    dossie = await irPara(page, processoHref);
    conferir(
      "responder o parecer pela tela — e a situação volta a EM ANÁLISE",
      dossie.includes(PARECER) && dossie.includes("Em análise"),
      "o parecer respondido não apareceu ou a situação não voltou"
    );

    // ═══════════════════════════════════════════════════════════════════════
    // 4. READEQUAÇÃO
    // ═══════════════════════════════════════════════════════════════════════
    // ⚠️ CADA FORMULÁRIO TEM NOME — é o que impede este passo de enviar o vizinho.
    const formularios = await page.$$("form[data-acao]");
    conferir(
      "a tela identifica cada movimento com um formulário próprio",
      formularios.length >= 6,
      `esperava ao menos 6 formulários nomeados, achei ${formularios.length}`
    );

    await preencherEEnviar(page, "solicitar-readequacao", [
      { sel: "textarea[name='texto']", valor: PEDIDO_READEQUACAO },
    ]);

    dossie = await irPara(page, processoHref);
    conferir(
      "pedir readequação pela tela — e a situação vira AGUARDANDO READEQUAÇÃO",
      dossie.includes(PEDIDO_READEQUACAO) &&
        dossie.includes("Aguardando readequação"),
      "o pedido de readequação não apareceu ou a situação não mudou"
    );

    const readequacaoId = await opcaoQueContem(
      page,
      'form[data-acao="atender-readequacao"] select[name="solicitacaoId"]',
      SUF
    );
    await preencherEEnviar(page, "atender-readequacao", [
      { sel: 'select[name="solicitacaoId"]', valor: readequacaoId, tipo: "select" },
      { sel: "textarea[name='texto']", valor: RESPOSTA_READEQUACAO },
    ]);

    dossie = await irPara(page, processoHref);
    conferir(
      "atender a readequação pela tela",
      dossie.includes(RESPOSTA_READEQUACAO) && dossie.includes("Em análise"),
      "a readequação atendida não apareceu"
    );

    // ═══════════════════════════════════════════════════════════════════════
    // 5. CAMPOS ADICIONAIS — os definidos pela entidade
    // ═══════════════════════════════════════════════════════════════════════
    const temCampos = dossie.includes("Campos adicionais");
    if (temCampos) {
      await preencherEEnviar(page, "campos-adicionais", [
        { sel: 'input[name="campo:protocolo_anterior"]', valor: `ANTERIOR-${SUF}` },
      ]);
      await irPara(page, processoHref);
      // ⚠️ O VALOR DE UM `<input>` NÃO ESTÁ NO `innerText`. A primeira versão deste
      // passo procurava o valor no texto da página e falhava dizendo "não apareceu
      // depois da recarga" — enquanto o banco tinha o valor gravado. O sintoma acusava
      // a persistência; o defeito era a leitura.
      const gravado = await page.evaluate(() => {
        const i = document.querySelector('input[name="campo:protocolo_anterior"]');
        return i instanceof HTMLInputElement ? i.value : null;
      });
      conferir(
        "gravar campo adicional pela tela e reencontrá-lo recarregando",
        gravado === `ANTERIOR-${SUF}`,
        `o campo voltou como "${gravado ?? "(ausente)"}" depois da recarga`
      );
    } else {
      falhou(
        "campos adicionais na tela do processo",
        "a tela não trouxe o painel — o seed do cenário definiu os campos?"
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. ENCERRAMENTO E ARQUIVAMENTO — dois atos, não um
    // ═══════════════════════════════════════════════════════════════════════
    await preencherEEnviar(page, "encerrar", [
      { sel: "textarea[name='texto']", valor: ENCERRAMENTO },
    ]);

    dossie = await irPara(page, processoHref);
    conferir(
      "encerrar pela tela e reencontrar o encerramento recarregando",
      dossie.includes(ENCERRAMENTO) && dossie.includes("Encerrado"),
      "o encerramento não apareceu ou a situação não mudou"
    );

    await preencherEEnviar(page, "arquivar", [
      { sel: "textarea[name='texto']", valor: ARQUIVAMENTO },
    ]);

    dossie = await irPara(page, processoHref);
    conferir(
      "arquivar pela tela — e só depois de encerrado, que são dois atos",
      dossie.includes(ARQUIVAMENTO) && dossie.includes("Arquivado"),
      "o arquivamento não apareceu ou a situação não mudou"
    );

    // ⚠️ A CADEIA INTEIRA CONTINUA NO HISTÓRICO. Um processo arquivado que perdesse os
    // movimentos anteriores seria apagamento com outro nome.
    conferir(
      "o histórico do processo arquivado carrega a cadeia inteira",
      dossie.includes(DESPACHO) &&
        dossie.includes(PARECER) &&
        dossie.includes(RESPOSTA_READEQUACAO),
      "algum movimento sumiu do histórico depois do arquivamento"
    );

    // ═══════════════════════════════════════════════════════════════════════
    // 7. A CONSULTA DO REQUERENTE — sem sessão
    // ═══════════════════════════════════════════════════════════════════════
    const verificador = await page.evaluate(() => {
      const dds = Array.from(document.querySelectorAll("dd"));
      const alvo = dds.find((d) => /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/.test(d.textContent?.trim() ?? ""));
      return alvo?.textContent?.trim() ?? null;
    });
    const numeroEAno = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const m = /Processo (\d+)\/(\d+)/.exec(h1?.textContent ?? "");
      return m === null ? null : { numero: m[1], ano: m[2] };
    });

    if (verificador !== null && numeroEAno !== null) {
      const anonima = await browser.createBrowserContext();
      const publica = await anonima.newPage();
      try {
        const url = `${BASE}/consulta?numero=${numeroEAno.numero}&exercicio=${numeroEAno.ano}&verificador=${verificador}`;
        await publica.goto(url, { waitUntil: "networkidle0" });
        const corpo = await publica.evaluate(() =>
          document.body.innerText.replace(/\s+/g, " ")
        );
        conferir(
          "a consulta do requerente funciona SEM SESSÃO, pelo número e pelo código",
          !publica.url().includes("/login") && corpo.includes("Andamento"),
          publica.url().includes("/login")
            ? "a consulta pública exigiu login — ela está no grupo autenticado por engano"
            : "a consulta não trouxe o andamento"
        );
        // ⚠️ E ELA NÃO ENTREGA O INSTRUTÓRIO.
        conferir(
          "a consulta pública NÃO mostra o parecer interno",
          !corpo.includes(PARECER),
          "o parecer interno vazou para a consulta do requerente"
        );

        const errada = `${BASE}/consulta?numero=${numeroEAno.numero}&exercicio=${numeroEAno.ano}&verificador=ZZZZZZZZZZ`;
        await publica.goto(errada, { waitUntil: "networkidle0" });
        const corpoErrado = await publica.evaluate(() =>
          document.body.innerText.replace(/\s+/g, " ")
        );
        conferir(
          "código verificador errado não revela nada",
          !corpoErrado.includes("Andamento"),
          "a consulta respondeu mesmo com o código errado"
        );
      } finally {
        await anonima.close();
      }
    } else {
      falhou(
        "consulta do requerente",
        "não consegui ler o código verificador ou o número no dossiê"
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. O COMUNICADO INTERNO
    // ═══════════════════════════════════════════════════════════════════════
    const comunicados = await irPara(page, "/comunicacao/comunicados");
    conferir(
      "a tela de comunicados abre com as caixas",
      comunicados.includes("Entrada") && comunicados.includes("Rascunhos"),
      "a tela não trouxe as caixas"
    );

    const tipoMemo = await opcaoQueContem(page, 'select[name="tipoId"]', "MEMO");
    await preencherEEnviar(page, "novo-comunicado", [
      { sel: 'select[name="tipoId"]', valor: tipoMemo, tipo: "select" },
      { sel: 'input[name="assunto"]', valor: ASSUNTO_COMUNICADO },
      { sel: 'textarea[name="corpo"]', valor: CORPO_COMUNICADO },
    ]);

    const rascunhos = await irPara(page, "/comunicacao/comunicados?caixa=RASCUNHO");
    conferir(
      "o comunicado nasce RASCUNHO e aparece na caixa de rascunhos recarregada",
      rascunhos.includes(ASSUNTO_COMUNICADO),
      "o rascunho não apareceu na caixa"
    );

    const comunicadoHref = await page.evaluate((a) => {
      const linhas = Array.from(document.querySelectorAll("tbody tr"));
      for (const tr of linhas) {
        if (tr.textContent?.includes(a) === true) {
          const link = tr.querySelector('a[href*="/comunicacao/comunicados/"]');
          if (link instanceof HTMLAnchorElement) return link.getAttribute("href");
        }
      }
      return null;
    }, ASSUNTO_COMUNICADO);

    if (comunicadoHref === null) {
      falhou("comunicado", "não achei o link do rascunho na caixa");
    } else {
      await irPara(page, comunicadoHref);

      const destino = await opcaoQueContem(
        page,
        'form[data-acao="enviar"] select[name="destino"]',
        "JUR"
      );
      await preencherEEnviar(page, "enviar", [
        { sel: 'select[name="destino"]', valor: destino, tipo: "multi" },
      ]);

      let detalhe = await irPara(page, comunicadoHref);
      conferir(
        "enviar o comunicado pela tela e reencontrá-lo enviado recarregando",
        detalhe.includes("enviado"),
        "o comunicado não consta como enviado depois da recarga"
      );

      // ⚠️ A CIÊNCIA É UM ATO, e ela aparece na lista de quem leu.
      await page.evaluate(() => {
        const botao = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent?.includes("Registrar ciência") === true
        );
        botao?.click();
      });
      await new Promise((r) => setTimeout(r, 2500));

      detalhe = await irPara(page, comunicadoHref);
      conferir(
        "registrar ciência pela tela e reencontrar a leitura recarregando",
        detalhe.includes("Quem leu") && detalhe.includes(USUARIO),
        "a leitura não apareceu na consulta de quem leu"
      );

      const setorResposta = await opcaoQueContem(
        page,
        'form[data-acao="responder"] select[name="setorRemetenteId"]',
        "JUR"
      );
      await preencherEEnviar(page, "responder", [
        { sel: 'select[name="setorRemetenteId"]', valor: setorResposta, tipo: "select" },
        { sel: 'textarea[name="corpo"]', valor: CORPO_RESPOSTA },
      ]);

      // ⚠️ A RESPOSTA É PROCURADA EM "TODAS", E NÃO NA SAÍDA — e a razão é o próprio
      // desenho das caixas. O operador do cenário está lotado em TODOS os setores, então
      // ele é ao mesmo tempo quem responde e quem recebe a resposta; e ENTRADA vence
      // SAÍDA na derivação. Fixar "saída" aqui seria o smoke exigir da tela um
      // comportamento que o domínio não promete.
      const todas = await irPara(page, "/comunicacao/comunicados?caixa=TODAS");
      conferir(
        "responder pela tela e reencontrar a resposta na caixa recarregada",
        todas.includes(`Re: ${ASSUNTO_COMUNICADO}`),
        "a resposta não apareceu em nenhuma caixa"
      );

      await irPara(page, comunicadoHref);
      // ⚠️ O DESTINO DO ENCAMINHAMENTO É O PRIMEIRO QUE A TELA OFERECE, e não um código
      // fixo. A tela exclui o setor REMETENTE da lista (ele já tem o documento na
      // saída), e o remetente depende de qual setor o formulário escolheu por padrão —
      // que é o primeiro por código. Fixar "GAB" fazia o smoke falhar quando o
      // comunicado nascia justamente em GAB, acusando a tela de não oferecer uma opção
      // que ela tinha razão em não oferecer.
      const setorEncaminhar = await page.evaluate(() => {
        const s = document.querySelector(
          'form[data-acao="encaminhar"] select[name="setorDestinoId"]'
        );
        if (!(s instanceof HTMLSelectElement)) return null;
        const o = Array.from(s.options).find((x) => x.value !== "" && !x.disabled);
        return o?.value ?? null;
      });
      if (setorEncaminhar === null) {
        throw new Error("a tela não ofereceu nenhum setor para encaminhar");
      }
      await preencherEEnviar(page, "encaminhar", [
        { sel: 'select[name="setorDestinoId"]', valor: setorEncaminhar, tipo: "select" },
      ]);

      detalhe = await irPara(page, comunicadoHref);
      conferir(
        "encaminhar pela tela — e o novo setor consta COMO ENCAMINHAMENTO",
        detalhe.includes("por encaminhamento"),
        "o encaminhamento não ficou marcado como tal"
      );

      await page.evaluate(() => {
        const botao = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent?.trim() === "Arquivar"
        );
        botao?.click();
      });
      await new Promise((r) => setTimeout(r, 2500));

      const arquivados = await irPara(page, "/comunicacao/comunicados?caixa=ARQUIVADO");
      conferir(
        "arquivar pela tela e reencontrar o comunicado na caixa de arquivados",
        arquivados.includes(ASSUNTO_COMUNICADO),
        "o comunicado não apareceu nos arquivados"
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. O DESIGNER — modelo, cópia, visibilidade e execução em segundo plano
    // ═══════════════════════════════════════════════════════════════════════
    const designer = await irPara(page, "/relatorios/designer");
    conferir(
      "o designer abre e publica os campos da fonte e as funções da gramática",
      designer.includes("Campos disponíveis") && designer.includes("Funções permitidas"),
      "o designer não listou os campos ou as funções"
    );

    await preencherEEnviar(page, "novo-modelo", [
      { sel: 'input[name="codigo"]', valor: CODIGO_MODELO },
      { sel: 'input[name="nome"]', valor: NOME_MODELO },
      { sel: 'select[name="visibilidade"]', valor: "PUBLICO", tipo: "select" },
      { sel: 'input[name="colRotulo"]', valor: "Processo", indice: 0 },
      { sel: 'input[name="colExpressao"]', valor: 'numero & "/" & ano', indice: 0 },
      { sel: 'input[name="colRotulo"]', valor: "Assunto", indice: 1 },
      { sel: 'input[name="colExpressao"]', valor: "assunto", indice: 1 },
      { sel: 'input[name="colRotulo"]', valor: "Situacao", indice: 2 },
      { sel: 'input[name="colExpressao"]', valor: "situacao", indice: 2 },
      { sel: 'input[name="colRotulo"]', valor: "Atencao", indice: 3 },
      {
        sel: 'input[name="colExpressao"]',
        valor: 'SE(movimentos = 0, "Sem movimento", "Em andamento")',
        indice: 3,
      },
    ]);

    let telaDesigner = await irPara(page, "/relatorios/designer");
    conferir(
      "criar o modelo pela tela e reencontrá-lo recarregando",
      telaDesigner.includes(CODIGO_MODELO) && telaDesigner.includes("público"),
      "o modelo não apareceu na lista depois da recarga"
    );

    // ⚠️ A EXPRESSÃO MALICIOSA É RECUSADA PELA TELA — a mesma gramática, o mesmo erro.
    await preencherEEnviar(page, "novo-modelo", [
      { sel: 'input[name="codigo"]', valor: `malicioso_${SUF}` },
      { sel: 'input[name="nome"]', valor: "Tentativa maliciosa" },
      { sel: 'input[name="colRotulo"]', valor: "X", indice: 0 },
      { sel: 'input[name="colExpressao"]', valor: "process.env.DATABASE_URL", indice: 0 },
    ]);
    const erroGramatica = await texto(page);
    conferir(
      "expressão maliciosa é recusada pela gramática, com o motivo na tela",
      erroGramatica.includes("Caractere não permitido") ||
        erroGramatica.includes('Coluna "X"'),
      "a tela não recusou a expressão maliciosa"
    );

    // A CÓPIA — e o original não muda.
    await irPara(page, "/relatorios/designer");
    await preencherEEnviar(page, "copiar-modelo", [
      { sel: 'input[name="novoCodigo"]', valor: CODIGO_COPIA },
      { sel: 'input[name="novoNome"]', valor: `Copia ${SUF}` },
    ]);

    telaDesigner = await irPara(page, "/relatorios/designer");
    conferir(
      "copiar o modelo pela tela — a cópia existe e o original continua público",
      telaDesigner.includes(CODIGO_COPIA) && telaDesigner.includes(CODIGO_MODELO),
      "a cópia não apareceu ou o original sumiu"
    );
    conferir(
      "a cópia nasce RESTRITA ao autor, mesmo derivada de um modelo público",
      telaDesigner.includes("restrito ao autor"),
      "a cópia não ficou restrita"
    );

    // A EXECUÇÃO EM SEGUNDO PLANO.
    const modeloParaExecutar = await opcaoQueContem(
      page,
      'form[data-acao="executar-relatorio"] select[name="modeloId"]',
      CODIGO_MODELO
    );
    await preencherEEnviar(page, "executar-relatorio", [
      { sel: 'select[name="modeloId"]', valor: modeloParaExecutar, tipo: "select" },
    ]);

    telaDesigner = await irPara(page, "/relatorios/designer");
    conferir(
      "executar o relatório pela tela — a execução aparece e CONCLUI",
      telaDesigner.includes("concluida") || telaDesigner.includes("CONCLUIDA"),
      "a execução não concluiu depois da recarga"
    );

    const linkResultado = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a")).find(
        (x) => x.textContent?.trim() === "ver"
      );
      return a instanceof HTMLAnchorElement ? a.getAttribute("href") : null;
    });
    if (linkResultado !== null) {
      const resultado = await irPara(page, linkResultado);
      conferir(
        "o resultado é o CSV do modelo, com o campo CALCULADO",
        resultado.includes("Processo,Assunto,Situacao,Atencao") &&
          resultado.includes("Em andamento"),
        "o CSV não trouxe o cabeçalho ou o campo calculado"
      );
      conferir(
        "o processo criado neste smoke está no relatório do designer",
        resultado.includes("Requerimento"),
        "o relatório não trouxe o processo aberto pela tela"
      );
    } else {
      falhou("resultado do relatório", "não achei o link 'ver' da execução concluída");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. O CHAMADO DE SUPORTE
    // ═══════════════════════════════════════════════════════════════════════
    await irPara(page, "/suporte/chamados");
    // ⚠️ AS OPÇÕES DE UM `<select>` FECHADO NÃO ESTÃO NO `innerText` — só a selecionada.
    // A primeira versão deste passo procurava "Crítica" no texto da página e falhava
    // acusando a tela de não trazer a escala, enquanto ela a trazia.
    const severidades = await page.evaluate(() => {
      const s = document.querySelector('select[name="severidadeId"]');
      if (!(s instanceof HTMLSelectElement)) return null;
      return Array.from(s.options)
        .filter((o) => o.value !== "")
        .map((o) => ({ valor: o.value, rotulo: o.textContent ?? "" }));
    });
    conferir(
      "a tela de chamados abre com a escala de severidade CADASTRADA pela entidade",
      severidades !== null &&
        severidades.length >= 2 &&
        severidades.some((x) => x.rotulo.includes("Crítica")),
      severidades === null
        ? "a tela não tem o seletor de severidade"
        : `a escala veio com ${severidades.length} nível(is): ${severidades.map((x) => x.rotulo).join(" | ")}`
    );

    await preencherEEnviar(page, "abrir-chamado", [
      {
        sel: 'select[name="severidadeId"]',
        valor: severidades?.[0]?.valor ?? "",
        tipo: "select",
      },
      { sel: 'input[name="titulo"]', valor: `Duvida do smoke ${SUF}` },
      {
        sel: 'textarea[name="descricao"]',
        valor: `Descricao suficientemente longa para o Zod aceitar, do smoke ${SUF}.`,
      },
    ]);

    const listaChamados = await irPara(page, "/suporte/chamados");
    conferir(
      "abrir chamado pela tela e reencontrá-lo na lista recarregada",
      listaChamados.includes(`Duvida do smoke ${SUF}`),
      "o chamado não apareceu na lista"
    );
  } catch (e) {
    falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
  }

  console.log(`\n${passos.length} passo(s) ok, ${falhas.length} falha(s).`);
  if (falhas.length > 0) {
    for (const f of falhas) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

await main();
