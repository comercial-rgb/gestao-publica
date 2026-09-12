import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * ═══ O PERCURSO DOS PERFIS, PELO NAVEGADOR — TR 4.56 (M16) ═══
 *
 * ⚠️ ESTE PERCURSO PROVA A TELA QUE DESTRAVA AS OUTRAS. O ENT06 mediu, no banco de
 * desenvolvimento: 223 ações no censo e 185 concedidas. As 38 de diferença eram um lote
 * inteiro de funcionalidade **invisível** — o molde esconde o formulário de quem não tem a
 * ação, e ninguém abre chamado dizendo "a tela que eu nunca vi não apareceu". Não havia
 * caso de uso que concedesse uma AÇÃO a um PERFIL; só o bootstrap de instalação, que recusa
 * rodar em banco povoado.
 *
 * ⚠️ E O QUE UM TESTE DE MÓDULO NÃO PROVA: que o administrador CONSEGUE. A cadeia aqui é a
 * de quem usa — criar o perfil, achar a ação pela área, conceder, recarregar e ver;
 * conceder de novo e ser recusado com a razão na tela.
 *
 * ⚠️ CADA `goto` É UMA RECARGA. Um formulário que diz "concedido" e não gravou passa por
 * qualquer asserção que olhe só a mensagem; não passa por uma recarga que procura a
 * etiqueta da ação dentro do cartão daquele perfil.
 *
 * ⚠️ O SELETOR É RECORTADO POR CARTÃO (`data-perfil`). Há um formulário de concessão por
 * perfil na mesma página, e `querySelector('form[data-acao="conceder-acao"]')` devolveria o
 * PRIMEIRO — que é o perfil de administração, não o que este percurso criou. É o mesmo
 * defeito que `test/ui/formularios-na-mesma-pagina.test.tsx` documenta.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO e sufixa o nome pelo instante: acrescenta um perfil ao banco de
 * desenvolvimento, como aconteceria na vida real.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const SUF = String(Date.now()).slice(-6);
const PERFIL = `PERCURSO-${SUF}`;
/** Uma ação real do censo, da área Patrimônio — e que o percurso concede e revoga. */
const ACAO = "CADASTRAR_DEPOSITO";
/** A ação que reabre todas as outras: o percurso tenta revogá-la e TEM de ser recusado. */
const A_CHAVE = "CONCEDER_ACAO_A_PERFIL";

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
  const bruto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  return bruto.toLowerCase();
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
  readonly tipo?: "select";
}

/**
 * Preenche e envia UM formulário, identificado por SELETOR COMPLETO.
 *
 * ⚠️ É a variante do helper do ENT06 que recebe o seletor inteiro em vez de só o
 * `data-acao` — aqui a página tem um formulário por perfil, e o recorte é o ponto.
 */
async function preencherEEnviarEm(
  page: Page,
  form: string,
  campos: readonly CampoDoSmoke[],
  /**
   * Onde a resposta aparece, quando NÃO é dentro do próprio formulário.
   *
   * ⚠️ NA REVOGAÇÃO ELA NÃO PODE ESTAR DENTRO. Há um formulário por ação concedida, e todos
   * compartilham o mesmo estado de ação — repetir a mensagem em cada um faria os cinco
   * botões anunciarem o resultado do único que foi apertado. A tela mostra uma por cartão, e
   * o percurso lê onde ela está. Sem este parâmetro o percurso lia "silêncio" e concluía que
   * o servidor não respondera, quando a revogação tinha funcionado.
   */
  escopoDaMensagem?: string
): Promise<{ readonly tipo: string; readonly texto: string }> {
  await page.waitForSelector(form, { timeout: 20000 });

  for (const campo of campos) {
    const seletor = `${form} ${campo.sel}`;
    await page.waitForSelector(seletor, { timeout: 20000 });
    const alvo = (await page.$$(seletor))[0];
    if (alvo === undefined) throw new Error(`"${seletor}" não casou nenhum elemento`);
    if (campo.tipo === "select") {
      await alvo.select(campo.valor);
      await new Promise((r) => setTimeout(r, 400));
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
  if (!enviou) throw new Error(`não achei o botão de envio de "${form}"`);

  await new Promise((r) => setTimeout(r, 3000));

  const resposta = await page.evaluate(
    (sel, escopo) => {
      const f = document.querySelector(escopo === null ? sel : escopo);
      const alerta = f?.querySelector('[role="alert"]');
      if (alerta !== null && alerta !== undefined) {
        return { tipo: "erro", texto: (alerta.textContent ?? "").trim() };
      }
      const ps = Array.from(f?.querySelectorAll("p") ?? []);
      const bom = ps.find((x) => x.className.includes("status-ok"));
      return bom !== undefined
        ? { tipo: "ok", texto: (bom.textContent ?? "").trim() }
        : { tipo: "silencio", texto: "" };
    },
    form,
    escopoDaMensagem ?? null
  );

  if (resposta.tipo === "erro") {
    console.log(`      [servidor recusou] ${resposta.texto.slice(0, 400)}`);
  } else if (resposta.tipo === "silencio") {
    console.log(`      [sem resposta visível em "${form}"]`);
  }
  return resposta;
}

/** O id do perfil cujo cartão contém este nome — o recorte de todos os seletores seguintes. */
async function idDoPerfilNaTela(page: Page, nome: string): Promise<string> {
  // ⚠️ O CARTÃO SE IDENTIFICA (`data-perfil` + `data-nome`), e a primeira versão disto subia
  // do formulário por `closest("div")` — que devolve o div de DENTRO do `<details>`, onde o
  // nome do perfil não está. O percurso achava o perfil "em algum lugar da tela" e não
  // conseguia dizer em qual cartão.
  const id = await page.evaluate((n) => {
    const cartoes = Array.from(document.querySelectorAll("[data-perfil][data-nome]"));
    const alvo = cartoes.find((c) => c.getAttribute("data-nome") === n);
    return alvo?.getAttribute("data-perfil") ?? null;
  }, nome);
  if (id === null) throw new Error(`não achei o cartão do perfil "${nome}" na tela`);
  return id;
}

/** O texto do CARTÃO daquele perfil — asserção recortada, e não "existe em algum lugar". */
async function cartaoDiz(page: Page, perfilId: string, pedaco: string): Promise<boolean> {
  return page.evaluate(
    (id, p) => {
      const cartao = document.querySelector(`[data-perfil="${id}"][data-nome]`);
      return (cartao?.textContent ?? "").toLowerCase().includes(p);
    },
    perfilId,
    pedaco.toLowerCase()
  );
}

/** Abre o `<details>` daquele cartão — é o passo deliberado que o humano dá. */
async function abrirGerenciar(page: Page, perfilId: string): Promise<void> {
  await page.evaluate((id) => {
    const f = document.querySelector(`form[data-acao="conceder-acao"][data-perfil="${id}"]`);
    const det = f?.closest("details");
    if (det instanceof HTMLDetailsElement) det.open = true;
  }, perfilId);
  await new Promise((r) => setTimeout(r, 300));
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(30000);
    await entrar(page);
    ok("login");

    // ══════════════════════════════════════════════════════════════════════
    // 1 · A TELA EXISTE E ESCREVE — até o ENT06 ela só lia
    // ══════════════════════════════════════════════════════════════════════
    const tela = await irPara(page, "/administracao/perfis");
    conferir(
      "a tela de perfis abre e oferece CRIAR — antes do ENT06 ela só listava",
      tela.includes("perfis e permissões") && tela.includes("criar perfil"),
      "a tela abriu sem o formulário de criar perfil"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 2 · CRIAR O PERFIL — e ele nasce VAZIO
    // ══════════════════════════════════════════════════════════════════════
    const rCriar = await preencherEEnviarEm(page, 'form[data-acao="criar-perfil"]', [
      { sel: 'input[name="nome"]', valor: PERFIL },
      { sel: 'input[name="descricao"]', valor: "Perfil criado pelo percurso" },
    ]);
    conferir("perfil: o servidor aceitou a criação", rCriar.tipo === "ok", rCriar.texto);

    const depoisDeCriar = await irPara(page, "/administracao/perfis");
    conferir(
      "perfil: RECARREGADA, a lista traz o perfil — é persistência, não estado de componente",
      depoisDeCriar.includes(PERFIL.toLowerCase()),
      "o perfil não apareceu depois da recarga"
    );

    const perfilId = await idDoPerfilNaTela(page, PERFIL);
    conferir(
      "perfil: ele nasce SEM PERMISSÃO NENHUMA, e a tela diz isso em português",
      await cartaoDiz(page, perfilId, "não concede nada ainda"),
      "o cartão do perfil novo não avisou que ele está vazio"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 3 · CONCEDER UMA AÇÃO — pela ÁREA, não numa lista de duzentas
    // ══════════════════════════════════════════════════════════════════════
    await abrirGerenciar(page, perfilId);
    const formConceder = `form[data-acao="conceder-acao"][data-perfil="${perfilId}"]`;

    const temAreas = await page.evaluate((sel) => {
      const s = document.querySelector(`${sel} select[name="area"]`);
      return s instanceof HTMLSelectElement ? s.options.length : 0;
    }, formConceder);
    conferir(
      "concessão: a ação se escolhe pela ÁREA — um select com o censo inteiro seria inútil",
      temAreas > 3,
      `o seletor de área trouxe ${temAreas} opção(ões)`
    );

    const rConceder = await preencherEEnviarEm(page, formConceder, [
      { sel: 'select[name="area"]', valor: "patrimonio", tipo: "select" },
      { sel: 'select[name="acao"]', valor: ACAO, tipo: "select" },
    ]);
    conferir("concessão: o servidor aceitou", rConceder.tipo === "ok", rConceder.texto);

    await irPara(page, "/administracao/perfis");
    conferir(
      "concessão: RECARREGADA, a ação aparece NO CARTÃO daquele perfil",
      await cartaoDiz(page, perfilId, ACAO.toLowerCase()),
      "a ação concedida não apareceu no cartão do perfil"
    );
    conferir(
      "concessão: o contador do cartão deixou de ser zero",
      !(await cartaoDiz(page, perfilId, "não concede nada ainda")),
      "o cartão continuou dizendo que o perfil não concede nada"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 4 · A DUPLICATA NÃO CHEGA A SER TENTADA — a tela a impede antes
    //
    // ⚠️ A PRIMEIRA VERSÃO DESTE PASSO ESTAVA ERRADA, e o percurso a derrubou. Ela mandava
    // conceder a mesma ação de novo e exigia a recusa nomeada do servidor na tela. Mas a
    // opção já concedida vem DESABILITADA — selecioná-la não muda nada, o formulário sobe
    // vazio, e o que aparece é "escolha a ação". O servidor recusaria, sim (o t4 do domínio
    // prova a mensagem), só que por este caminho ninguém chega lá.
    //
    // O que a TELA prova é a prevenção: a ação concedida continua listada, marcada como já
    // concedida e impossível de escolher. Afirmar aqui a recusa do servidor seria cobrar da
    // interface um erro que ela existe para evitar.
    // ══════════════════════════════════════════════════════════════════════
    await abrirGerenciar(page, perfilId);
    // ⚠️ ESCOLHER A ÁREA PRIMEIRO, como o humano faz — e a primeira versão deste passo não
    // escolhia. Depois da recarga o seletor de área volta ao padrão, e a ação de patrimônio
    // simplesmente não está entre as opções da área que veio selecionada: o percurso
    // concluía "a opção não existe" quando ela estava a uma escolha de distância.
    const selArea = (await page.$$(`${formConceder} select[name="area"]`))[0];
    if (selArea === undefined) throw new Error("o seletor de área sumiu do formulário");
    await selArea.select("patrimonio");
    await new Promise((r) => setTimeout(r, 400));

    const jaConcedida = await page.evaluate(
      (sel, acao) => {
        const s = document.querySelector(`${sel} select[name="acao"]`);
        if (!(s instanceof HTMLSelectElement)) return null;
        const o = Array.from(s.options).find((x) => x.value === acao);
        return o === undefined ? null : { desabilitada: o.disabled, texto: o.textContent ?? "" };
      },
      formConceder,
      ACAO
    );
    conferir(
      "concessão repetida: a tela IMPEDE — a ação já concedida aparece marcada e não é escolhível",
      jaConcedida !== null &&
        jaConcedida.desabilitada &&
        jaConcedida.texto.toLowerCase().includes("já concedida"),
      `a opção ${ACAO} veio ${JSON.stringify(jaConcedida)}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 5 · REVOGAR — a linha some da tela, e some do banco
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/administracao/perfis");
    await abrirGerenciar(page, perfilId);
    const rRevogar = await preencherEEnviarEm(
      page,
      `form[data-acao="revogar-acao"][data-perfil="${perfilId}"][data-alvo="${ACAO}-G"]`,
      [],
      `[data-perfil="${perfilId}"][data-nome] [data-mensagem="revogar"]`
    );
    conferir("revogação: o servidor aceitou", rRevogar.tipo === "ok", rRevogar.texto);

    await irPara(page, "/administracao/perfis");
    conferir(
      "revogação: RECARREGADA, a ação SUMIU do cartão — a concessão é o fato, a ausência é a revogação",
      !(await cartaoDiz(page, perfilId, ACAO.toLowerCase())),
      "a ação revogada continuou no cartão depois da recarga"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 6 · A ÚLTIMA CHAVE — a recusa que impede trancar o ente por fora
    //
    // ⚠️ O PERCURSO TENTA DE VERDADE, no perfil que administra. Se o guard não existisse, a
    // revogação passaria e o ambiente ficaria sem ninguém capaz de conceder qualquer ação —
    // com o bootstrap recusando rodar em banco povoado, corretamente. É a asserção mais cara
    // deste arquivo, e a única que prova a trava pela interface.
    // ══════════════════════════════════════════════════════════════════════
    const idAdmin = await page.evaluate((chave) => {
      const formularios = Array.from(document.querySelectorAll('form[data-acao="revogar-acao"]'));
      const alvo = formularios.find((f) => (f.getAttribute("data-alvo") ?? "").startsWith(chave));
      return alvo?.getAttribute("data-perfil") ?? null;
    }, A_CHAVE);

    if (idAdmin === null) {
      falhou(
        "última chave: achar quem concede a chave",
        `nenhum cartão oferece revogar ${A_CHAVE} — o ambiente não tem a ação concedida a ninguém`
      );
    } else {
      await abrirGerenciar(page, idAdmin);
      const rChave = await preencherEEnviarEm(
        page,
        `form[data-acao="revogar-acao"][data-perfil="${idAdmin}"][data-alvo="${A_CHAVE}-G"]`,
        [],
        `[data-perfil="${idAdmin}"][data-nome] [data-mensagem="revogar"]`
      );
      conferir(
        "última chave: o servidor RECUSA revogar a única concessão que reabre as outras",
        rChave.tipo === "erro" && rChave.texto.toUpperCase().includes("ÚLTIMA CHAVE"),
        `esperava recusa nomeada; veio ${rChave.tipo}: ${rChave.texto.slice(0, 200)}`
      );

      const aindaTem = await irPara(page, "/administracao/perfis");
      conferir(
        "última chave: depois da recusa, a concessão CONTINUA lá — nada foi gravado",
        aindaTem.includes(A_CHAVE.toLowerCase()),
        "a chave sumiu da tela depois de uma revogação que devia ter sido recusada"
      );
    }
  } finally {
    if (navegador !== undefined) await navegador.close();
  }

  console.log(`\n${passos.length} passos, ${falhas.length} falhas.`);
  if (falhas.length > 0) {
    console.error("\nFALHAS:");
    for (const f of falhas) console.error(`  · ${f}`);
    process.exit(1);
  }
}

await main();
