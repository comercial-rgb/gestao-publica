import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { diaCivil, somarDiasCivis } from "../packages/datas/index.js";

/**
 * SMOKE DO ENT03c, PELO NAVEGADOR — os três cadastros que o CENSO achou com motor e sem tela.
 *
 * ═══ POR QUE ESTE PERCURSO, E NÃO OUTRO ═══
 * O censo deste lote mediu o M10 e o M11 cláusula a cláusula e encontrou o mesmo padrão três
 * vezes: caso de uso completo, invariante provado por teste de integração, e NENHUMA rota em
 * `app/`. Dívida fundada, dívida ativa e obras com medições estavam assim.
 *
 * O que este smoke prova é a outra ponta da mesma medição: que a tela gerada pelo molde
 * **alcança o motor que já existia**. Um descritor que compila e uma rota que responde 200
 * não provam isso — provam que a página renderiza. O que prova é o dado persistido reaparecer
 * depois de uma RECARGA, e a regra de negócio recusando o que tem de recusar.
 *
 * ⚠️ E ELE EXERCITA AS DUAS SEGREGAÇÕES QUE O MOTOR JÁ GARANTIA E NINGUÉM VIA:
 *   · "quem mede não aprova" na medição de obra — aqui o mesmo usuário tenta os dois papéis,
 *     e o servidor recusa. É a prova de que a tela NÃO contorna o guard;
 *   · o recebimento da dívida ativa NÃO está entre as ações da tela, por decisão: ele é
 *     receita orçamentária e entra pela guia de arrecadação. Uma tela que o oferecesse
 *     criaria um segundo caminho para o mesmo fato, e o segundo contaria a receita duas vezes.
 *
 * ⚠️ ESTE SMOKE NÃO LIMPA O BANCO. Os identificadores levam o instante da execução.
 *
 * Uso:  npx next start -p 3011 &
 *       npx tsx scripts/smoke-ent03c.ts http://localhost:3011 <usuario> <senha>
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const SUF = String(Date.now()).slice(-6);

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

/** `innerText` vem TRANSFORMADO PELO CSS — comparar em caixa baixa prende o conteúdo. */
async function texto(page: Page): Promise<string> {
  const bruto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  return bruto.toLowerCase();
}

/** Navega e devolve o texto. Um `goto` é sempre uma RECARGA — é o que prova persistência. */
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
  readonly tipo?: "select" | "data";
  readonly indice?: number;
}

async function preencherEEnviar(
  page: Page,
  acao: string,
  campos: readonly CampoDoSmoke[]
): Promise<{ readonly tipo: string; readonly texto: string }> {
  const form = `form[data-acao="${acao}"]`;
  await page.waitForSelector(form, { timeout: 20000 });

  for (const campo of campos) {
    const seletor = `${form} ${campo.sel}`;
    await page.waitForSelector(seletor, { timeout: 20000 });
    const alvos = await page.$$(seletor);
    const alvo = alvos[campo.indice ?? 0];
    if (alvo === undefined) {
      throw new Error(
        `"${seletor}" casou ${alvos.length} elemento(s); o smoke pediu o índice ${campo.indice ?? 0}`
      );
    }
    if (campo.tipo === "data") {
      // `<input type="date">` não aceita `type()` com ISO — ver a nota no smoke do ENT03b.
      await page.evaluate(
        (sel, v, i) => {
          const alvos = Array.from(document.querySelectorAll(sel));
          const el = alvos[i];
          if (!(el instanceof HTMLInputElement)) return;
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        seletor,
        campo.valor,
        campo.indice ?? 0
      );
      continue;
    }
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
  if (!enviou) throw new Error(`não achei o botão de envio de "${acao}"`);

  await new Promise((r) => setTimeout(r, 3000));

  const resposta = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const alerta = f?.querySelector('[role="alert"]');
    if (alerta !== null && alerta !== undefined) {
      return { tipo: "erro", texto: (alerta.textContent ?? "").trim() };
    }
    const ps = Array.from(f?.querySelectorAll("p") ?? []);
    const bom = ps.find((x) => x.className.includes("status-ok"));
    return bom !== undefined
      ? { tipo: "ok", texto: (bom.textContent ?? "").trim() }
      : { tipo: "silencio", texto: "" };
  }, form);

  if (resposta.tipo === "erro") {
    console.log(`      [servidor recusou "${acao}"] ${resposta.texto.slice(0, 400)}`);
  } else if (resposta.tipo === "silencio") {
    console.log(`      [sem resposta visível em "${acao}"]`);
  }
  return resposta;
}

async function primeiraOpcao(page: Page, seletor: string): Promise<string> {
  const v = await page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return null;
    for (const o of Array.from(s.options)) {
      if (o.value !== "" && !o.disabled) return o.value;
    }
    return null;
  }, seletor);
  if (v === null) throw new Error(`nenhuma opção utilizável em "${seletor}"`);
  return v;
}

async function opcaoQueCasa(page: Page, seletor: string, pedaco: string): Promise<string> {
  const v = await page.evaluate(
    (sel, p) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return null;
      const uteis = Array.from(s.options).filter((o) => o.value !== "" && !o.disabled);
      const casada = uteis.find((o) => o.textContent?.includes(p));
      return (casada ?? uteis[0])?.value ?? null;
    },
    seletor,
    pedaco
  );
  if (v === null) throw new Error(`nenhuma opção utilizável em "${seletor}"`);
  return v;
}

/**
 * ⚠️ O DIA VEM DA RÉGUA CIVIL, e não de `toISOString().slice(0,10)`.
 *
 * O smoke do ENT03b usava o ISO, e o ISO é UTC: rodando às 22:00 do fuso do ente, ele
 * digitaria o dia SEGUINTE no formulário — e o teste passaria, porque nada confere qual dia
 * foi digitado. Um smoke que digita a data errada em silêncio é pior que um que falha.
 */
function dia(offset = 0): string {
  return diaCivil(somarDiasCivis(new Date(), offset));
}

async function hrefDaAba(page: Page, aba: string): Promise<string> {
  const href = await page.evaluate((a) => {
    const el = document.querySelector(`a[data-aba="${a}"]`);
    return el instanceof HTMLAnchorElement ? el.getAttribute("href") : null;
  }, aba);
  if (href === null) throw new Error(`aba "${aba}" não existe nesta tela`);
  return href;
}

async function primeiroDetalhe(page: Page, rota: string): Promise<string> {
  const href = await page.evaluate((r) => {
    const links = Array.from(document.querySelectorAll("table a"));
    const alvo = links.find((a) => (a.getAttribute("href") ?? "").startsWith(`${r}/`));
    return alvo?.getAttribute("href") ?? null;
  }, rota);
  if (href === null) throw new Error(`nenhum link de detalhe em ${rota}`);
  return href;
}

/** Uma aba que abre em branco passa por qualquer teste que só olhe o status 200. */
async function conferirAsCincoAbas(page: Page, detalhe: string, nome: string): Promise<void> {
  const esperado: readonly [string, string][] = [
    ["campos", "campos adicionais"],
    ["anexos", "anexos"],
    ["historico", "histórico"],
    ["relacionados", "relacionados"],
  ];
  for (const [aba, marcador] of esperado) {
    const href = await hrefDaAba(page, aba);
    const t = await irPara(page, href.replace(BASE, ""));
    conferir(
      `${nome}: a aba "${aba}" abre e traz conteúdo`,
      t.includes(marcador),
      `a aba abriu sem "${marcador}"`
    );
  }
  await irPara(page, detalhe);
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
    // 1 · DÍVIDA FUNDADA
    // ══════════════════════════════════════════════════════════════════════
    const listaDF = await irPara(page, "/divida/fundada");
    conferir(
      "dívida fundada: a listagem abre com os filtros declarados",
      listaDF.includes("dívida fundada") && listaDF.includes("identificador ou credor"),
      "a listagem não trouxe o título ou a barra de filtros"
    );

    const contaPassivo = await opcaoQueCasa(
      page,
      'form[data-acao="criar-divida-fundada"] select[name="contaContabilId"]',
      "2."
    );
    const idDF = `DF-SMOKE-${SUF}`;
    const rDF = await preencherEEnviar(page, "criar-divida-fundada", [
      { sel: 'input[name="identificador"]', valor: idDF },
      { sel: 'select[name="tipo"]', valor: "CONTRATUAL", tipo: "select" },
      { sel: 'input[name="credorNome"]', valor: "Banco de Fomento S.A." },
      { sel: '[data-mascara="cpf-cnpj"]', valor: "11222333000181" },
      { sel: 'input[name="leiAutorizativa"]', valor: `Lei Municipal ${SUF}/2026` },
      { sel: 'textarea[name="objeto"]', valor: "Financiamento de infraestrutura urbana — smoke do ENT03c" },
      { sel: 'select[name="contaContabilId"]', valor: contaPassivo, tipo: "select" },
    ]);
    conferir("dívida fundada: o cadastro foi aceito", rDF.tipo !== "erro", rDF.texto);

    const depoisDF = await irPara(page, "/divida/fundada");
    conferir(
      "dívida fundada: o registro aparece APÓS RECARGA",
      depoisDF.includes(idDF.toLowerCase()),
      "o identificador não apareceu na lista recarregada"
    );

    const detDF = (await primeiroDetalhe(page, "/divida/fundada")).replace(BASE, "");
    const tDetDF = await irPara(page, detDF);
    conferir(
      "dívida fundada: o detalhe mostra o saldo DERIVADO e a lei autorizativa",
      tDetDF.includes("saldo devedor") && tDetDF.includes("lei autorizativa"),
      "o detalhe não trouxe o saldo derivado ou a lei"
    );
    await conferirAsCincoAbas(page, detDF, "dívida fundada");

    // ⚠️ ESTE AMBIENTE NÃO TEM `RoteiroDivida` PARAMETRIZADO, e o que o smoke prova aqui é
    // melhor do que o caminho feliz: a tela ALCANÇA o caso de uso, e o caso de uso RECUSA
    // fail-closed em vez de inventar a conta contábil. O PCASP semeado nesta máquina é o
    // mínimo da POC — 26 contas analíticas, sem a VPD de variação monetária —, e fabricar
    // um código de conta para o smoke passar seria inventar norma da STN dentro de um teste.
    // Pendência ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS.
    const rCorrecao = await preencherEEnviar(page, "atualizacao-monetaria", [
      { sel: 'input[name="competencia"]', valor: "2026-03" },
      { sel: '[data-mascara="valor"]', valor: "1.200,00" },
      { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Correção monetária de março, IPCA informado pelo agente financeiro" },
    ]);
    conferir(
      "dívida fundada: a ação chega ao caso de uso e ele RECUSA sem roteiro parametrizado",
      rCorrecao.tipo === "erro" && rCorrecao.texto.includes("RoteiroDivida"),
      `esperava a recusa por roteiro ausente; veio "${rCorrecao.tipo}": ${rCorrecao.texto}`
    );

    // ⚠️ E A RECUSA TEM DE SER TOTAL. "Nada foi gravado" é a parte que um teste de tela
    // esquece: se o movimento tivesse entrado sem lançamento, o histórico o mostraria.
    //
    // ⚠️ A ASSERÇÃO É SOBRE O HISTÓRICO, E NÃO SOBRE A PÁGINA. A primeira versão procurava
    // "atualização monetária" no texto da página inteira e PASSAVA — porque esse é o RÓTULO
    // de uma linha do painel de dados, que aparece com ou sem movimento. Era a mesma classe
    // de falso-verde do ENT03b: asserção que casa com a moldura em vez do conteúdo.
    const historicoDF = await irPara(page, (await hrefDaAba(page, "historico")).replace(BASE, ""));
    conferir(
      "dívida fundada: a recusa não deixou movimento órfão no histórico",
      !historicoDF.includes("1.200,00"),
      "um movimento apareceu no histórico depois de o servidor ter recusado"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 2 · DÍVIDA ATIVA
    // ══════════════════════════════════════════════════════════════════════
    const listaDA = await irPara(page, "/divida/ativa");
    conferir(
      "dívida ativa: a listagem abre com os filtros declarados",
      listaDA.includes("dívida ativa") && listaDA.includes("identificador ou devedor"),
      "a listagem não trouxe o título ou a barra de filtros"
    );

    const contaAtivo = await opcaoQueCasa(
      page,
      'form[data-acao="criar-divida-ativa"] select[name="contaContabilId"]',
      "1."
    );
    const idDA = `DA-SMOKE-${SUF}`;
    const rDA = await preencherEEnviar(page, "criar-divida-ativa", [
      { sel: 'input[name="identificador"]', valor: idDA },
      { sel: 'input[name="devedorNome"]', valor: "Contribuinte Smoke Ltda" },
      { sel: '[data-mascara="cpf-cnpj"]', valor: "44555666000177" },
      { sel: 'select[name="origem"]', valor: "TRIBUTARIA", tipo: "select" },
      { sel: 'select[name="contaContabilId"]', valor: contaAtivo, tipo: "select" },
    ]);
    conferir("dívida ativa: o cadastro foi aceito", rDA.tipo !== "erro", rDA.texto);

    const depoisDA = await irPara(page, "/divida/ativa");
    conferir(
      "dívida ativa: o registro aparece APÓS RECARGA",
      depoisDA.includes(idDA.toLowerCase()),
      "o identificador não apareceu na lista recarregada"
    );

    const detDA = (await primeiroDetalhe(page, "/divida/ativa")).replace(BASE, "");
    const tDetDA = await irPara(page, detDA);
    conferir(
      "dívida ativa: o detalhe nomeia o art. 39, § 2º e o saldo a receber",
      tDetDA.includes("art. 39") && tDetDA.includes("saldo a receber"),
      "o detalhe não trouxe a base legal ou o saldo"
    );
    await conferirAsCincoAbas(page, detDA, "dívida ativa");

    // Mesma parametrização ausente da dívida fundada — e a mesma recusa fail-closed.
    const rInscricao = await preencherEEnviar(page, "inscrever", [
      { sel: '[data-mascara="valor"]', valor: "10.000,00" },
      { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Inscrição de IPTU 2025 não quitado, notificação esgotada" },
    ]);
    conferir(
      "dívida ativa: a ação chega ao caso de uso e ele RECUSA sem roteiro parametrizado",
      rInscricao.tipo === "erro" && rInscricao.texto.includes("RoteiroDividaAtiva"),
      `esperava a recusa por roteiro ausente; veio "${rInscricao.tipo}": ${rInscricao.texto}`
    );

    // ⚠️ O CANCELAMENTO ACIMA DO SALDO. O motor recusa; o passo existe para provar que a
    // tela não ofereceu um atalho — ela manda o mesmo número pelo mesmo caso de uso.
    const rCancelaDemais = await preencherEEnviar(page, "cancelar", [
      { sel: '[data-mascara="valor"]', valor: "99.999,00" },
      { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Tentativa de cancelar mais do que o inscrito" },
    ]);
    conferir(
      "dívida ativa: cancelar ACIMA do saldo é RECUSADO, e a recusa nomeia o saldo real",
      rCancelaDemais.tipo === "erro" && rCancelaDemais.texto.includes("0.00"),
      `esperava a recusa por saldo; veio "${rCancelaDemais.tipo}": ${rCancelaDemais.texto}`
    );

    // ⚠️ O RECEBIMENTO NÃO É OFERECIDO, E ISSO É A DECISÃO. Ele é receita orçamentária e
    // entra pela guia (M04). Uma ação aqui criaria o segundo caminho para o mesmo fato.
    const semRecebimento = await page.evaluate(
      () => document.querySelector('form[data-acao="receber"]') === null
    );
    conferir(
      "dívida ativa: a tela NÃO oferece receber — o recebimento é receita, e entra pela arrecadação",
      semRecebimento,
      "a tela ofereceu um caminho paralelo para o recebimento"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 3 · OBRAS E MEDIÇÕES
    // ══════════════════════════════════════════════════════════════════════
    const listaOB = await irPara(page, "/licitacoes/obras");
    conferir(
      "obras: a listagem abre com os filtros declarados",
      listaOB.includes("obras e serviços de engenharia") &&
        listaOB.includes("identificador ou descrição"),
      "a listagem não trouxe o título ou a barra de filtros"
    );

    const idOB = `OB-SMOKE-${SUF}`;
    const rOB = await preencherEEnviar(page, "criar-obras", [
      { sel: 'input[name="identificador"]', valor: idOB },
      { sel: 'textarea[name="descricao"]', valor: "Pavimentação da Rua das Acácias — smoke do ENT03c" },
      { sel: 'select[name="tipoObraServico"]', valor: "PAVIMENTACAO_ASFALTICA", tipo: "select" },
    ]);
    conferir("obras: o cadastro foi aceito", rOB.tipo !== "erro", rOB.texto);

    const depoisOB = await irPara(page, "/licitacoes/obras");
    conferir(
      "obras: o registro aparece APÓS RECARGA",
      depoisOB.includes(idOB.toLowerCase()),
      "o identificador não apareceu na lista recarregada"
    );
    conferir(
      "obras: a situação DERIVADA diz 'sem medição' antes da primeira",
      depoisOB.includes("sem medição"),
      "a coluna de situação não trouxe o estado derivado"
    );

    const detOB = (await primeiroDetalhe(page, "/licitacoes/obras")).replace(BASE, "");
    const tDetOB = await irPara(page, detOB);
    conferir(
      "obras: o detalhe nomeia o rol FECHADO da IN/INSS/DC 100/2003",
      tDetOB.includes("in/inss/dc 100/2003") || tDetOB.includes("rol fechado"),
      "o detalhe não explicou de onde vem o rol de tipos"
    );
    await conferirAsCincoAbas(page, detOB, "obras");

    // ⚠️ SEM CONTRATO NO BANCO, A MEDIÇÃO NÃO TEM O QUE MEDIR. O smoke não INVENTA um: ele
    // registra o que achou e segue, porque um contrato fabricado aqui é dado de produção
    // nascido de um teste.
    const temContrato = await page.evaluate(() => {
      const s = document.querySelector(
        'form[data-acao="medir"] select[name="contratoId"]'
      );
      if (!(s instanceof HTMLSelectElement)) return false;
      return Array.from(s.options).some((o) => o.value !== "" && !o.disabled);
    });

    if (!temContrato) {
      ok("obras: sem contrato no banco, a medição não é exercitada — e o smoke diz isso em vez de fingir");
    } else {
      const contratoId = await primeiraOpcao(
        page,
        'form[data-acao="medir"] select[name="contratoId"]'
      );
      const rMedicao = await preencherEEnviar(page, "medir", [
        { sel: 'select[name="contratoId"]', valor: contratoId, tipo: "select" },
        { sel: 'input[name="numero"]', valor: "1" },
        { sel: '[data-mascara="valor"]', valor: "5.000,00" },
        { sel: 'input[type="date"]', valor: dia(-30), tipo: "data", indice: 0 },
        { sel: 'input[type="date"]', valor: dia(-1), tipo: "data", indice: 1 },
        { sel: 'input[name="responsavelTecnico"]', valor: "Eng. Responsável do Smoke" },
        { sel: 'input[name="registroProfissional"]', valor: "CREA-PB 123456" },
      ]);
      conferir("obras: a medição foi registrada", rMedicao.tipo !== "erro", rMedicao.texto);

      const tOB2 = await irPara(page, detOB);
      conferir(
        "obras: a medição aparece no histórico e diz AGUARDANDO APROVAÇÃO",
        tOB2.includes("aguardando aprovação"),
        "a medição não apareceu como pendente de aprovação"
      );

      // ⚠️ O PASSO QUE MAIS IMPORTA DESTE SMOKE. Quem mediu é o usuário da sessão; aprovar
      // com o MESMO crachá tem de ser recusado NO SERVIDOR. Se a tela passasse o aprovador
      // por um campo do formulário, o próprio medidor escolheria quem assina.
      const rAprova = await preencherEEnviar(page, "aprovar", [
        {
          sel: 'select[name="medicaoId"]',
          valor: await primeiraOpcao(
            page,
            'form[data-acao="aprovar"] select[name="medicaoId"]'
          ),
          tipo: "select",
        },
        { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      ]);
      conferir(
        "obras: QUEM MEDIU NÃO APROVA — o servidor recusa a aprovação do próprio medidor",
        rAprova.tipo === "erro",
        "o servidor deixou o próprio medidor aprovar a medição"
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4 · A LISTAGEM DO MOLDE — ordenação e seleção, numa das três telas
    // ══════════════════════════════════════════════════════════════════════
    const ordenada = await irPara(page, "/divida/fundada?ordem=identificador&direcao=desc");
    conferir(
      "a ordenação por URL é aceita e a lista continua respondendo",
      ordenada.includes("dívida fundada"),
      "a lista não respondeu à ordenação por URL"
    );

    const comColunaInvalida = await irPara(page, "/divida/fundada?ordem=objeto");
    conferir(
      "ordenar por coluna NÃO DECLARADA não derruba a tela — cai no padrão",
      comColunaInvalida.includes("dívida fundada"),
      "a tela quebrou com um parâmetro de ordenação inválido"
    );
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
