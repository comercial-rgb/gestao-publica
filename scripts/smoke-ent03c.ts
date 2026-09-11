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

/**
 * O detalhe do registro cujo texto da LINHA contém o identificador.
 *
 * ⚠️ POR QUE ELE EXISTE, E É UM DEFEITO QUE ESTE SMOKE TINHA. `primeiroDetalhe` devolve a
 * PRIMEIRA linha da lista — que na primeira execução é a que acabou de ser criada e, na
 * segunda, é a de ONTEM. O smoke passou no ENT03c por isso e falhou na primeira reexecução
 * com o banco já povoado: "competência 2026-03 já atualizada" e "o saldo vale 20000, não
 * 10000" não eram defeitos do produto — eram o smoke medindo o registro errado.
 *
 * Um percurso que só passa em banco limpo não prova nada sobre um sistema que vai rodar
 * anos com dado acumulado.
 */
async function detalheDe(page: Page, rota: string, identificador: string): Promise<string> {
  const href = await page.evaluate(
    (r, ident) => {
      const linhas = Array.from(document.querySelectorAll("table tr"));
      for (const tr of linhas) {
        if (!(tr.textContent ?? "").includes(ident)) continue;
        const a = tr.querySelector("a");
        const h = a?.getAttribute("href") ?? "";
        if (h.startsWith(`${r}/`)) return h;
      }
      return null;
    },
    rota,
    identificador
  );
  if (href === null) {
    throw new Error(`nenhuma linha com "${identificador}" em ${rota}`);
  }
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

    const detDF = (await detalheDe(page, "/divida/fundada", idDF)).replace(BASE, "");
    const tDetDF = await irPara(page, detDF);
    conferir(
      "dívida fundada: o detalhe mostra o saldo DERIVADO e a lei autorizativa",
      tDetDF.includes("saldo devedor") && tDetDF.includes("lei autorizativa"),
      "o detalhe não trouxe o saldo derivado ou a lei"
    );
    await conferirAsCincoAbas(page, detDF, "dívida fundada");

    // ⚠️ ATÉ O ENT03c ESTE PASSO PROVAVA A RECUSA, e a recusa era o comportamento certo: o
    // ambiente não tinha `RoteiroDivida` parametrizado, e fabricar um código de conta para
    // o smoke passar seria inventar norma da STN dentro de um teste.
    //
    // O ENT04 tirou o motivo da recusa em vez de contorná-lo: `seed:pcasp-oficial` trouxe
    // as 7.864 contas do PCASP publicado pelo TCE-PB (sha256 conferido contra o MANIFEST),
    // e `seed:roteiros-patrimoniais` parametrizou o roteiro com contas REAIS e ANALÍTICAS —
    // D 3.4.3.1.1.01.00 (variações monetárias de dívida contratual interna) contra
    // C 2.2.2.1.1.02.98 (empréstimos internos em contratos). Agora o caminho feliz é
    // exigível. Fecha ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS.
    const rCorrecao = await preencherEEnviar(page, "atualizacao-monetaria", [
      { sel: 'input[name="competencia"]', valor: "2026-03" },
      { sel: '[data-mascara="valor"]', valor: "1.200,00" },
      { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Correção monetária de março, IPCA informado pelo agente financeiro" },
    ]);
    conferir(
      "dívida fundada: a correção monetária é ACEITA com o roteiro parametrizado",
      rCorrecao.tipo === "ok",
      `esperava sucesso; veio "${rCorrecao.tipo}": ${rCorrecao.texto}`
    );

    // ⚠️ E O SUCESSO TEM DE SER VISÍVEL NO HISTÓRICO. "A tela disse que deu certo" não é
    // persistência — é a mesma classe de falso-verde que o ENT03b pegou.
    //
    // ⚠️ A ASSERÇÃO É SOBRE O HISTÓRICO, E NÃO SOBRE A PÁGINA. A primeira versão procurava
    // "atualização monetária" no texto da página inteira e PASSAVA — porque esse é o RÓTULO
    // de uma linha do painel de dados, que aparece com ou sem movimento.
    const historicoDF = await irPara(page, (await hrefDaAba(page, "historico")).replace(BASE, ""));
    conferir(
      "dívida fundada: o movimento de correção aparece no histórico, com o valor",
      historicoDF.includes("1.200,00"),
      "o servidor aceitou a correção mas ela não apareceu no histórico da dívida"
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

    const detDA = (await detalheDe(page, "/divida/ativa", idDA)).replace(BASE, "");
    const tDetDA = await irPara(page, detDA);
    conferir(
      "dívida ativa: o detalhe nomeia o art. 39, § 2º e o saldo a receber",
      tDetDA.includes("art. 39") && tDetDA.includes("saldo a receber"),
      "o detalhe não trouxe a base legal ou o saldo"
    );
    await conferirAsCincoAbas(page, detDA, "dívida ativa");

    // Mesmo desbloqueio da dívida fundada: o roteiro da INSCRICAO agora existe, com contas
    // reais — D 1.1.2.5.1.01.99 (dívida ativa tributária) contra C 4.6.3.9.1.00.00 (ganho
    // por incorporação de ativos). Inscrever CRIA um crédito que não existia no ativo; não
    // é receita orçamentária, e por isso a contrapartida é VPA e não classe 6.
    const rInscricao = await preencherEEnviar(page, "inscrever", [
      { sel: '[data-mascara="valor"]', valor: "10.000,00" },
      { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Inscrição de IPTU 2025 não quitado, notificação esgotada" },
    ]);
    conferir(
      "dívida ativa: a inscrição é ACEITA com o roteiro parametrizado",
      rInscricao.tipo === "ok",
      `esperava sucesso; veio "${rInscricao.tipo}": ${rInscricao.texto}`
    );

    // ⚠️ O CANCELAMENTO ACIMA DO SALDO. O motor recusa; o passo existe para provar que a
    // tela não ofereceu um atalho — ela manda o mesmo número pelo mesmo caso de uso.
    //
    // ⚠️ E AGORA ELE VALE MAIS DO QUE VALIA. Enquanto a inscrição era recusada, o saldo era
    // ZERO e "cancelar 99.999 de um saldo 0" é recusa trivial — qualquer guarda pega. Com
    // 10.000,00 inscritos de verdade, o que se prova é a comparação com o saldo DERIVADO
    // dos movimentos, que é a asserção que interessa.
    const rCancelaDemais = await preencherEEnviar(page, "cancelar", [
      { sel: '[data-mascara="valor"]', valor: "99.999,00" },
      { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Tentativa de cancelar mais do que o inscrito" },
    ]);
    conferir(
      "dívida ativa: cancelar ACIMA do saldo é RECUSADO, e a recusa nomeia o saldo real",
      rCancelaDemais.tipo === "erro" && rCancelaDemais.texto.includes("10000.00"),
      `esperava a recusa nomeando o saldo 10000.00; veio "${rCancelaDemais.tipo}": ${rCancelaDemais.texto}`
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

    const detOB = (await detalheDe(page, "/licitacoes/obras", idOB)).replace(BASE, "");
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
    // 4 · PROVISÕES  (ENT04 — o quarto cadastro pelo molde)
    //
    // ⚠️ POR QUE ELE ENTRA NESTE ARQUIVO. Este smoke é o percurso dos cadastros do MOLDE,
    // e provisões é um deles. Um segundo arquivo duplicaria as 210 linhas de harness — e
    // duas cópias de um percurso divergem no dia em que uma ganha um passo.
    //
    // ⚠️ E O CADASTRO DE PROVISÕES TEM **TRÊS** ABAS, NÃO CINCO: anexo e campo adicional
    // exigem FK própria, que ele não tem. Por isso `conferirAsCincoAbas` NÃO é chamado
    // aqui — chamá-lo exigiria abas que o descritor nega de propósito.
    // ══════════════════════════════════════════════════════════════════════
    const listaPR = await irPara(page, "/patrimonio/provisoes");
    conferir(
      "provisões: a listagem abre com os filtros declarados",
      listaPR.includes("provisões") && listaPR.includes("identificador ou descrição"),
      "a listagem não trouxe o título ou a barra de filtros"
    );

    const idProv = `PROV-SMOKE-${Date.now().toString().slice(-6)}`;
    // ⚠️ A CONTA TEM DE SER DE PASSIVO — e o `select` só oferece a classe 2 porque o
    // descritor declara `classesDeConta: ["2"]`. Antes disso, com o plano oficial no banco,
    // a lista vinha só com contas do ativo e o cadastro era impossível.
    const contaDaProvisao = await opcaoQueCasa(page, 'select[name="contaContabilId"]', "2.");
    conferir(
      "provisões: o seletor de conta oferece conta de PASSIVO (classe 2)",
      contaDaProvisao !== "",
      "o seletor não ofereceu nenhuma conta da classe 2 — o formulário montaria inútil"
    );

    const rCriaProv = await preencherEEnviar(page, "criar-provisoes", [
      { sel: 'input[name="identificador"]', valor: idProv },
      { sel: 'textarea[name="descricao"]', valor: "Provisão para riscos trabalhistas — reclamações em curso" },
      { sel: 'select[name="contaContabilId"]', valor: contaDaProvisao, tipo: "select" },
    ]);
    conferir(
      "provisões: o cadastro foi aceito",
      rCriaProv.tipo === "ok",
      `esperava sucesso; veio "${rCriaProv.tipo}": ${rCriaProv.texto}`
    );

    const aposRecargaPR = await irPara(page, "/patrimonio/provisoes");
    conferir(
      "provisões: o registro aparece APÓS RECARGA",
      aposRecargaPR.includes(idProv.toLowerCase()),
      "o identificador não apareceu na lista depois de recarregar — não persistiu"
    );

    const detPR = (await detalheDe(page, "/patrimonio/provisoes", idProv)).replace(BASE, "");
    await irPara(page, detPR);

    const rConstituir = await preencherEEnviar(page, "constituir", [
      { sel: '[data-mascara="valor"]', valor: "50.000,00" },
      { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Constituição inicial pelo laudo atuarial de 2026" },
    ]);
    conferir(
      "provisões: constituir é ACEITO e lança contra o passivo",
      rConstituir.tipo === "ok",
      `esperava sucesso; veio "${rConstituir.tipo}": ${rConstituir.texto}`
    );

    // ⚠️ REVERTER ACIMA DO SALDO. O motor recusa; o passo prova que a tela não abriu atalho.
    const rReverteDemais = await preencherEEnviar(page, "reverter", [
      { sel: '[data-mascara="valor"]', valor: "80.000,00" },
      { sel: 'input[type="date"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Tentativa de reverter mais do que foi constituído" },
    ]);
    conferir(
      "provisões: reverter ACIMA do saldo é RECUSADO — a provisão não fica negativa",
      rReverteDemais.tipo === "erro",
      `esperava recusa; veio "${rReverteDemais.tipo}": ${rReverteDemais.texto}`
    );

    const histPR = await irPara(page, (await hrefDaAba(page, "historico")).replace(BASE, ""));
    conferir(
      "provisões: o histórico mostra a constituição e NÃO mostra a reversão recusada",
      histPR.includes("50.000,00") && !histPR.includes("80.000,00"),
      "o histórico não bate com o que o servidor aceitou e recusou"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 5 · A LISTAGEM DO MOLDE — ordenação e seleção, numa das telas
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
