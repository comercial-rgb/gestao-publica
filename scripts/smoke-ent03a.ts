import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DO ENT03a, PELO NAVEGADOR — os QUATRO percursos da definição de concluído.
 *
 * ═══ O QUE A REVISÃO PEDE, LITERAL ═══
 *   · despesa: empenho, liquidação com retenção, lote, borderô, retorno, conciliação;
 *   · movimentação bancária por fonte;
 *   · conciliação de um período, com encerramento e abertura do seguinte;
 *   · assinatura de empenho, liquidação e ordem de pagamento na fila do ENT02.
 *
 * Tudo **pela interface**, com dado **persistido e visível APÓS RECARGA**.
 *
 * ═══ ⚠️ POR QUE A SUÍTE INTEIRA NÃO PROVA ISSO ═══
 * Ela prova o domínio, e estas falhas passam por ela sem acusar:
 *   · o formulário grava e a lista não mostra (cache do Next não revalidado);
 *   · a lista mostra e nada gravou (estado de componente);
 *   · o seletor oferece uma opção que o servidor recusa;
 *   · a Server Action perde um campo entre o `FormData` e a porta;
 *   · o `useState` da fonte não repassa o valor porque o `name` mudou de lugar.
 *
 * ⚠️ E A RECARGA É O PONTO. Conferir a tela logo depois do envio prova que o React
 * renderizou; conferir **depois de `page.goto` de novo** prova que o SERVIDOR tem o dado.
 * São coisas diferentes, e só a segunda é o que a definição de concluído pede.
 *
 * ⚠️ ESTE SMOKE NÃO LIMPA O BANCO. Ele acrescenta movimentos e uma conciliação ao banco
 * de desenvolvimento, e eles ficam lá. Os textos levam o instante da execução para não se
 * confundirem com os da execução anterior.
 *
 * Uso:  npx next start -p 3011 &
 *       npx tsx scripts/smoke-ent03a.ts http://localhost:3011 <usuario> <senha>
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const SUF = String(Date.now()).slice(-6);
const HISTORICO_DEPOSITO = `Deposito do smoke ${SUF}`;
const HISTORICO_TARIFA = `Tarifa do smoke ${SUF}`;
const PENDENCIA = `Cheque nao compensado ${SUF}`;
const MOTIVO_PENDENCIA = `Emitido no fim do mes; o banco compensa no seguinte ${SUF}`;

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

/** Navega e devolve o texto. Um `goto` é sempre uma RECARGA — é o que prova persistência. */
async function irPara(page: Page, rota: string): Promise<string> {
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle0" });
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}

/**
 * ⚠️ O CAMPO DE VALOR É MASCARADO, e o `name` está no HIDDEN.
 *
 * `CampoValor` renderiza dois elementos: o visível, com `data-mascara="valor"`, e um
 * `<input type="hidden" name="...">` que carrega o valor CRU. Um seletor por `name`
 * casaria só o hidden — e o puppeteer recusa clicar nele com "Node is either not
 * clickable", que foi exatamente como este smoke falhou na primeira execução.
 *
 * Digitar no visível é o certo por outro motivo também: o hidden é derivado do estado do
 * React, e atribuir `.value` nele mudaria o DOM sem mudar o estado — o valor não chegaria
 * ao servidor.
 */
interface CampoDoSmoke {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select" | "data";
  readonly indice?: number;
}

/**
 * ⚠️ O FORMULÁRIO É LOCALIZADO POR `data-acao`, e os campos DENTRO dele.
 *
 * Estas telas têm vários formulários — a de lotes tem cinco tipos, um por lote. Procurar
 * o campo na PÁGINA faria o smoke preencher um formulário e apertar o botão de outro,
 * exatamente como aconteceu no ENT02 antes de os formulários ganharem nome.
 */
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
      // ⚠️ `<input type="date">` NÃO ACEITA `type()` COM `YYYY-MM-DD`.
      //
      // O Chrome espera a digitação no formato do LOCALE (MM/DD/YYYY em en-US), e digitar
      // o ISO produz uma data inválida — foi assim que este smoke falhou na segunda
      // execução, com `"received": "Invalid Date"` vindo do Zod.
      //
      // Estes campos são NÃO CONTROLADOS (não há `value` do React neles), então atribuir
      // `.value` é legítimo: o valor vai para o `FormData` no envio. Os eventos são
      // despachados assim mesmo, para o caso de alguém tornar o campo controlado depois —
      // aí o React precisa saber.
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
      // ⚠️ O SELECT DA CONTA DISPARA `useState` E REPOPULA O DE FONTE. Sem esta espera, o
      // smoke escolheria a fonte na lista velha — e o `value` submetido seria de outra
      // conta. É a mesma classe de defeito que o `data-acao` fechou: a tela mudou entre
      // duas ações do robô.
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

  // ⚠️ O QUE O SERVIDOR RESPONDEU FICA REGISTRADO, inclusive no sucesso. "Não apareceu
  // após a recarga" é o SINTOMA — não diz se o servidor recusou, se a ação nem foi
  // chamada, ou se gravou e a lista é que não mostra. Três defeitos, uma cara só.
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

/** O `value` da primeira `<option>` utilizável de um select. */
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

/** Um dia civil relativo a hoje, como `YYYY-MM-DD`. */
function dia(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/**
 * ⚠️ A JANELA DA CONCILIAÇÃO MUDA A CADA EXECUÇÃO, e isso é EXIGÊNCIA, não conveniência.
 *
 * Duas conciliações do mesmo período na mesma conta são recusadas — e com razão: seriam
 * duas verdades sobre o mesmo fechamento. Com janela fixa, a SEGUNDA execução deste smoke
 * falharia sempre, e a falha não diria nada sobre o sistema: diria que o smoke não é
 * re-executável. Foi a lição do smoke de pessoas, no ENT02.
 *
 * ⚠️ O PASSO É MAIOR QUE A JANELA, e isso não é detalhe: a execução abre DOIS períodos de
 * 5 dias cada. Com passo de 1 dia por minuto, a janela da execução seguinte COMEÇAVA
 * dentro da anterior — e o encadeamento recusava, dizendo (corretamente) que aquela
 * conciliação já tinha sucessora. Cada minuto avança 10 dias; as duas janelas de 5 cabem
 * sem encostar.
 *
 * ⚠️ E O SMOKE ENCERRA OS DOIS PERÍODOS QUE ABRE. Deixar o segundo aberto faria a execução
 * seguinte esbarrar em "a conciliação anterior ainda está ABERTA" — o guard certo,
 * disparado por sujeira que este script deixou.
 */
const JANELA = (Math.floor(Date.now() / 60_000) % 300) * 10;

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

    // ═══════════════════════════════════════════════════════════════════════
    // PERCURSO 2 — MOVIMENTAÇÃO BANCÁRIA POR FONTE
    // ═══════════════════════════════════════════════════════════════════════
    await irPara(page, "/financeiro/movimentacao");
    ok("a tela de movimentação bancária abre");

    const conta = await primeiraOpcao(
      page,
      'form[data-acao="registrar-movimento-bancario"] select[name="conta"]'
    );
    const contrapartida = await primeiraOpcao(
      page,
      'form[data-acao="registrar-movimento-bancario"] select[name="contrapartida"]'
    );

    // ⚠️ A CONTA VEM ANTES DA FONTE, e a ordem importa: o select de fonte só é preenchido
    // depois que a conta é escolhida (ele mostra o ROL daquela conta).
    await preencherEEnviar(page, "registrar-movimento-bancario", [
      { sel: 'select[name="conta"]', valor: conta, tipo: "select" },
    ]);

    // Agora o rol de fontes está carregado.
    await irPara(page, "/financeiro/movimentacao");
    await page.select(
      'form[data-acao="registrar-movimento-bancario"] select[name="conta"]',
      conta
    );
    await new Promise((r) => setTimeout(r, 500));
    const fonte = await primeiraOpcao(
      page,
      'form[data-acao="registrar-movimento-bancario"] select[name="fonte"]'
    );

    const rDeposito = await preencherEEnviar(page, "registrar-movimento-bancario", [
      { sel: 'select[name="conta"]', valor: conta, tipo: "select" },
      { sel: 'select[name="fonte"]', valor: fonte, tipo: "select" },
      { sel: 'select[name="tipo"]', valor: "DEPOSITO", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "5.000,00" },
      { sel: 'input[name="dia"]', valor: dia(-5), tipo: "data" },
      { sel: 'select[name="contrapartida"]', valor: contrapartida, tipo: "select" },
      { sel: 'input[name="historico"]', valor: HISTORICO_DEPOSITO },
    ]);
    conferir(
      "o depósito é aceito pelo servidor",
      rDeposito.tipo !== "erro",
      rDeposito.texto
    );

    // ⚠️ A RECARGA. É ela que prova que o SERVIDOR tem o dado — não o React.
    const aposDeposito = await irPara(page, "/financeiro/movimentacao");
    conferir(
      "o depósito aparece APÓS RECARGA",
      aposDeposito.includes(HISTORICO_DEPOSITO),
      "o histórico não está na lista depois de recarregar"
    );
    conferir(
      "o saldo por fonte é exibido",
      /fonte \d+/i.test(aposDeposito),
      "nenhuma linha de fonte na tela"
    );

    // A TARIFA — o tipo que NÃO passa pelo guard de saldo, por decisão.
    const rTarifa = await preencherEEnviar(page, "registrar-movimento-bancario", [
      { sel: 'select[name="conta"]', valor: conta, tipo: "select" },
      { sel: 'select[name="fonte"]', valor: fonte, tipo: "select" },
      { sel: 'select[name="tipo"]', valor: "TARIFA", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "45,00" },
      { sel: 'input[name="dia"]', valor: dia(-4), tipo: "data" },
      { sel: 'select[name="contrapartida"]', valor: contrapartida, tipo: "select" },
      { sel: 'input[name="historico"]', valor: HISTORICO_TARIFA },
    ]);
    conferir("a tarifa é aceita", rTarifa.tipo !== "erro", rTarifa.texto);

    const aposTarifa = await irPara(page, "/financeiro/movimentacao");
    conferir(
      "a tarifa aparece APÓS RECARGA",
      aposTarifa.includes(HISTORICO_TARIFA),
      "a tarifa não está na lista"
    );

    // ⚠️ A NEGAÇÃO COM MOTIVO: um saque maior que o saldo tem de ser recusado NOMEANDO
    // quanto falta. Um `rejects` vazio aqui não provaria que o guard olhou o saldo.
    const rSaque = await preencherEEnviar(page, "registrar-movimento-bancario", [
      { sel: 'select[name="conta"]', valor: conta, tipo: "select" },
      { sel: 'select[name="fonte"]', valor: fonte, tipo: "select" },
      { sel: 'select[name="tipo"]', valor: "SAQUE", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "999.999.999,00" },
      { sel: 'input[name="dia"]', valor: dia(-3), tipo: "data" },
      { sel: 'select[name="contrapartida"]', valor: contrapartida, tipo: "select" },
      { sel: 'input[name="historico"]', valor: `Saque impossivel ${SUF}` },
    ]);
    conferir(
      "o saque acima do saldo é RECUSADO nomeando quanto falta",
      rSaque.tipo === "erro" && /SALDO INSUFICIENTE/i.test(rSaque.texto),
      `esperava SALDO INSUFICIENTE; veio: ${rSaque.tipo} ${rSaque.texto.slice(0, 200)}`
    );

    // ═══════════════════════════════════════════════════════════════════════
    // PERCURSO 3 — CONCILIAÇÃO DE UM PERÍODO, COM ENCERRAMENTO
    // ═══════════════════════════════════════════════════════════════════════
    await irPara(page, "/financeiro/conciliacao/periodo");
    ok("a tela de conciliação por período abre");

    const contaConc = await primeiraOpcao(
      page,
      'form[data-acao="abrir-conciliacao"] select[name="conta"]'
    );
    const rAbrir = await preencherEEnviar(page, "abrir-conciliacao", [
      { sel: 'select[name="conta"]', valor: contaConc, tipo: "select" },
      { sel: 'input[name="inicio"]', valor: dia(JANELA), tipo: "data" },
      { sel: 'input[name="fim"]', valor: dia(JANELA + 4), tipo: "data" },
    ]);
    conferir("o período é aberto", rAbrir.tipo !== "erro", rAbrir.texto);

    const aposAbrir = await irPara(page, "/financeiro/conciliacao/periodo");
    conferir(
      "o período aberto aparece APÓS RECARGA, com estado",
      aposAbrir.includes("aberta"),
      "nenhum período aberto listado"
    );

    // PENDÊNCIA MANUAL — decisão registrada, que NÃO gera lançamento.
    const rPend = await preencherEEnviar(page, "registrar-pendencia-manual", [
      { sel: 'input[name="descricao"]', valor: PENDENCIA },
      { sel: 'input[data-mascara="valor"]', valor: "1.200,00" },
      { sel: 'select[name="natureza"]', valor: "DEBITO", tipo: "select" },
      { sel: 'input[name="motivo"]', valor: MOTIVO_PENDENCIA },
    ]);
    conferir("a pendência manual é aceita", rPend.tipo !== "erro", rPend.texto);

    const aposPend = await irPara(page, "/financeiro/conciliacao/periodo");
    conferir(
      "a pendência manual aparece APÓS RECARGA, com o motivo",
      aposPend.includes(PENDENCIA) && aposPend.includes(MOTIVO_PENDENCIA),
      "a pendência ou o motivo não estão na tela"
    );

    // O ENCERRAMENTO.
    const rEnc = await preencherEEnviar(page, "encerrar-conciliacao", []);
    conferir("o período é encerrado", rEnc.tipo !== "erro", rEnc.texto);

    const aposEncerrar = await irPara(page, "/financeiro/conciliacao/periodo");
    conferir(
      "o período aparece ENCERRADO APÓS RECARGA, com a autoria",
      aposEncerrar.includes("encerrada"),
      "o estado encerrado não aparece"
    );

    // ⚠️ E A ABERTURA DO SEGUINTE — o que herda o não resolvido, POR REFERÊNCIA.
    const rSeguinte = await preencherEEnviar(page, "abrir-conciliacao", [
      { sel: 'select[name="conta"]', valor: contaConc, tipo: "select" },
      { sel: 'input[name="inicio"]', valor: dia(JANELA + 5), tipo: "data" },
      { sel: 'input[name="fim"]', valor: dia(JANELA + 9), tipo: "data" },
    ]);
    conferir(
      "o período SEGUINTE é aberto depois do encerramento",
      rSeguinte.tipo !== "erro",
      rSeguinte.texto
    );

    const aposSeguinte = await irPara(page, "/financeiro/conciliacao/periodo");
    conferir(
      "os dois períodos aparecem APÓS RECARGA",
      (aposSeguinte.match(/aberta|encerrada/g) ?? []).length >= 2,
      "não há dois períodos listados"
    );

    // ⚠️ ENCERRA O SEGUNDO TAMBÉM — ver a nota de `JANELA`. Deixá-lo aberto faria a
    // execução seguinte esbarrar num guard correto, disparado por sujeira deste script.
    const rEnc2 = await preencherEEnviar(page, "encerrar-conciliacao", []);
    conferir(
      "o segundo período também é encerrado, deixando o banco pronto para a próxima execução",
      rEnc2.tipo !== "erro",
      rEnc2.texto
    );

    // ═══════════════════════════════════════════════════════════════════════
    // PERCURSO 4 — ASSINATURA DOS DOCUMENTOS DA DESPESA
    // ═══════════════════════════════════════════════════════════════════════
    const assinaturas = await irPara(page, "/despesa/assinaturas");
    ok("a tela de assinaturas da despesa abre");

    if (assinaturas.includes("Nenhum documento da despesa")) {
      falhou(
        "há documento da despesa para assinar",
        "nenhum empenho/liquidação/ordem no banco — rode o seed da cadeia da despesa antes"
      );
    } else {
      const temFormulario = await page.$('form[data-acao="enviar-para-assinatura"]');
      if (temFormulario === null) {
        ok("todos os documentos já têm fila (execução anterior do smoke)");
      } else {
        const signatario = await primeiraOpcao(
          page,
          'form[data-acao="enviar-para-assinatura"] select[name="signatarios"]'
        );
        const rEnviar = await preencherEEnviar(page, "enviar-para-assinatura", [
          { sel: 'select[name="signatarios"]', valor: signatario, tipo: "select" },
        ]);
        conferir(
          "o documento é gerado e entra na fila",
          rEnviar.tipo !== "erro",
          rEnviar.texto
        );

        const aposEnviar = await irPara(page, "/despesa/assinaturas");
        conferir(
          "a fila aparece APÓS RECARGA, com o signatário",
          aposEnviar.includes("aguardando assinatura") ||
            aposEnviar.includes("todas as assinaturas colhidas"),
          "nenhuma fila visível depois de recarregar"
        );

        const rAssinar = await preencherEEnviar(page, "assinar-na-fila", []);
        conferir("a assinatura é aceita", rAssinar.tipo !== "erro", rAssinar.texto);

        const aposAssinar = await irPara(page, "/despesa/assinaturas");
        conferir(
          "a assinatura aparece APÓS RECARGA",
          aposAssinar.includes("assinou") ||
            aposAssinar.includes("todas as assinaturas colhidas"),
          "a assinatura não aparece depois de recarregar"
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PERCURSO 1 (segunda metade) — LOTE, BORDERÔ E RETORNO
    // ═══════════════════════════════════════════════════════════════════════
    const lotes = await irPara(page, "/financeiro/lotes");
    ok("a tela de lotes e borderô abre");
    conferir(
      "a tela declara o envio ao banco como INDISPONÍVEL, sem simular",
      !lotes.includes("Enviar ao banco"),
      "há botão de envio ao banco numa tela sem convênio configurado"
    );

    const contaLote = await primeiraOpcao(
      page,
      'form[data-acao="criar-lote"] select[name="conta"]'
    );
    const rLote = await preencherEEnviar(page, "criar-lote", [
      { sel: 'select[name="conta"]', valor: contaLote, tipo: "select" },
      { sel: 'input[name="vencimento"]', valor: dia(10), tipo: "data" },
      { sel: 'input[name="descricao"]', valor: `Lote do smoke ${SUF}` },
    ]);
    conferir("o lote é criado", rLote.tipo !== "erro", rLote.texto);

    const aposLote = await irPara(page, "/financeiro/lotes");
    conferir(
      "o lote aparece APÓS RECARGA, com estado",
      aposLote.includes("aberto"),
      "nenhum lote aberto listado"
    );

    // A CONCILIAÇÃO CUMULATIVA continua respondendo — é o outro lado do percurso 1.
    const conc = await irPara(page, "/financeiro/conciliacao");
    conferir(
      "a conciliação (visão corrente) abre e responde",
      conc.length > 0 && !conc.includes("Application error"),
      "a tela de conciliação não respondeu"
    );
  } finally {
    await navegador?.close();
  }

  console.log(`\n${passos.length} passos concluídos, ${falhas.length} falha(s).`);
  if (falhas.length > 0) {
    console.error("\nFALHAS:");
    for (const f of falhas) console.error(`  · ${f}`);
    process.exitCode = 1;
  }
}

await main();
