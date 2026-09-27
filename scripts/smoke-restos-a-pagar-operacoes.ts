import "dotenv/config";
import type { Page } from "puppeteer";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  sair,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * ═══ O PERCURSO DAS OPERAÇÕES DE RESTOS A PAGAR (V15, C38) ═══
 *
 * A V14 abriu a listagem e o detalhe dos restos a pagar, e ali havia um aviso: as ações não estão
 * disponíveis porque a contabilização precisa ser configurada. Era verdade — não havia onde
 * configurá-la. Este percurso cobre o caminho inteiro, e a ORDEM dos passos é a prova:
 *
 *   1. a operação SEM contas informadas é RECUSADA, com o motivo e o caminho;
 *   2. as contas são informadas PELA TELA de configuração;
 *   3. a MESMA operação passa a funcionar.
 *
 * ⚠️ É ESSA SEQUÊNCIA QUE VALE, e não a existência dos formulários. Um percurso que apenas
 * preenchesse os formulários na ordem certa passaria mesmo se a configuração fosse decorativa: a
 * recusa ANTES e o sucesso DEPOIS, sobre o mesmo ato, é o que prova que o cadastro governa a
 * operação. É o mesmo princípio de provar um instrumento por mutação, aplicado à configuração.
 *
 * ⚠️ E ELE AFIRMA VALORES, não presença de título — um detalhe de resto a pagar com os rótulos
 * certos e zero no corpo é o defeito mais fácil de produzir e o mais difícil de ver. Lê o
 * `<main>`, nunca o `document.body`: no corpo, "restos a pagar" aparece como item de MENU, e uma
 * asserção sobre o corpo passaria pelo motivo errado.
 *
 * ⚠️ PAGAMENTO PARCIAL, DE PROPÓSITO. Pagar o valor inteiro de uma vez esconde o saldo: com
 * pagamento total, "saldo zero" é compatível com um sistema que simplesmente zera o campo. O
 * parcial obriga o saldo a ser o resultado de uma conta.
 *
 * ⚠️ O QUE ESTE ARQUIVO NÃO FAZ: preparar o banco. Ele exige um ambiente com exercício encerrado e
 * ao menos DUAS inscrições — uma PROCESSADA e uma NÃO PROCESSADA (fixture N=2: com uma só, a
 * distinção entre os dois eventos de cancelamento passaria por vacuidade). Sem elas, cada passo
 * dependente falha NOMEANDO a ausência, em vez de passar por não ter o que conferir.
 *
 * Uso:  DATABASE_URL=<percursos, papel de runtime> npx next dev -p 3011
 *       PERCURSO_BASE=http://localhost:3011 npx tsx scripts/smoke-restos-a-pagar-operacoes.ts
 */

const BASE = process.env["PERCURSO_BASE"] ?? "http://localhost:3011";
const USUARIO = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";

/** O `<main>`, nunca o corpo: a lição do ENT10. */
async function principal(page: Page): Promise<string> {
  return page.$eval("main", (m) => m.textContent ?? "").catch(() => "");
}

const LIQUIDACAO = "8.2.1.1.2.01.00";
const COMPROMETIDA = "8.2.1.1.3.01.00";
const UTILIZADA = "8.2.1.1.4.01.00";

async function main(): Promise<void> {
  if (SENHA === "") {
    console.error("SEED_ADMIN_SENHA ausente. Sem senha não há sessão, e sem sessão não há percurso.");
    process.exit(1);
  }
  const p = registroDePassos();
  const browser = await lancarNavegadorDoPercurso();
  const page = await browser.newPage();
  const n: Navegador = { base: BASE };

  try {
    await entrar(n, page, USUARIO, SENHA);
    p.ok("1 entrou com o papel de runtime");

    // ── 2) A CONFIGURAÇÃO COMEÇA VAZIA, E A TELA DIZ ISSO ────────────────────
    await irPara(n, page, "/contabilidade/roteiros-de-restos-a-pagar");
    const config = await principal(page);
    p.conferir(
      "2.1 a tela de contas das operações abre com as quatro operações",
      config.includes("liquidação de restos a pagar não processados") &&
        config.includes("pagamento de restos a pagar") &&
        config.includes("cancelamento de restos a pagar processados") &&
        config.includes("cancelamento de restos a pagar não processados"),
      `as quatro operações não apareceram: ${config.slice(0, 400)}`
    );
    p.conferir(
      "2.2 a ausência de contas aparece NOMEADA, não em silêncio",
      config.includes("Não configurada"),
      "nenhuma operação apareceu como não configurada — ou o ambiente já vem configurado, e então este percurso não prova a ordem"
    );
    p.conferir(
      "2.3 no pagamento, a tela DIZ que as contas patrimoniais não se informam ali",
      config.includes("a que a liquidação de origem registrou"),
      "a explicação do pagamento não apareceu"
    );

    // ── 3) A OPERAÇÃO SEM CONTAS É RECUSADA (antes de configurar) ────────────
    const naoProcessado = await acharInscricao(page, "Não processado");
    if (naoProcessado === null) {
      p.falhou(
        "3 achar uma inscrição NÃO PROCESSADA",
        "o ambiente não tem inscrição não processada; os passos 3 a 6 não foram executados"
      );
    } else {
      await irPara(n, page, naoProcessado);
      const antes = await principal(page);
      p.conferir(
        "3.1 o detalhe avisa que a operação não tem contas informadas",
        antes.includes("ainda não tem contas informadas") || antes.includes("ainda não têm contas informadas"),
        `o aviso de configuração ausente não apareceu: ${antes.slice(0, 300)}`
      );

      const recusa = await preencherEEnviar(page, "liquidar-resto", [
        { sel: 'input[name="numero"]', valor: "LIQ-RP-1" },
        { sel: 'input[name="valor"]', valor: "1000,00" },
        { sel: 'input[name="data"]', valor: "2027-03-10", tipo: "data" },
        { sel: 'input[name="responsavelAtesto"]', valor: "fiscal do contrato" },
        { sel: 'input[name="historico"]', valor: "liquidacao de resto nao processado" },
      ]);
      p.conferir(
        "3.2 liquidar SEM contas informadas é RECUSADO, e a recusa diz onde resolver",
        recusa.tipo === "erro" && /não tem contas informadas/i.test(recusa.texto),
        `esperava recusa por falta de configuração; veio ${recusa.tipo}: ${recusa.texto.slice(0, 300)}`
      );

      // ── 4) AS CONTAS SÃO INFORMADAS PELA TELA ─────────────────────────────
      await irPara(n, page, "/contabilidade/roteiros-de-restos-a-pagar");
      const pubLiq = await preencherEEnviar(page, "publicar-contas-LIQUIDACAO_NAO_PROCESSADO", [
        { sel: 'select[name="contaDebitoCodigo"]', valor: "3.3.1.1.1.01.00", tipo: "select" },
        { sel: 'select[name="contaCreditoCodigo"]', valor: "2.1.3.1.1.01.00", tipo: "select" },
        { sel: 'select[name="contaControleDebitoCodigo"]', valor: LIQUIDACAO, tipo: "select" },
        { sel: 'select[name="contaControleCreditoCodigo"]', valor: COMPROMETIDA, tipo: "select" },
        { sel: 'textarea[name="fundamento"]', valor: "Plano de contas do municipio; orientacao do tribunal de contas." },
      ]);
      p.conferir(
        "4.1 as contas da liquidação são publicadas na versão 1",
        pubLiq.tipo === "ok" && /versão 1/i.test(pubLiq.texto),
        `publicação não confirmou a versão 1: ${pubLiq.tipo} ${pubLiq.texto.slice(0, 300)}`
      );

      const pubPag = await preencherEEnviar(page, "publicar-contas-PAGAMENTO", [
        { sel: 'select[name="contaControleDebitoCodigo"]', valor: COMPROMETIDA, tipo: "select" },
        { sel: 'select[name="contaControleCreditoCodigo"]', valor: UTILIZADA, tipo: "select" },
        { sel: 'textarea[name="fundamento"]', valor: "Controle da disponibilidade por destinacao, conforme plano do municipio." },
      ]);
      p.conferir(
        "4.2 as contas do pagamento são publicadas informando SÓ o par de disponibilidade",
        pubPag.tipo === "ok",
        `publicação do pagamento falhou: ${pubPag.tipo} ${pubPag.texto.slice(0, 300)}`
      );

      // ── 5) A MESMA OPERAÇÃO PASSA A FUNCIONAR ─────────────────────────────
      await irPara(n, page, naoProcessado);
      const agora = await preencherEEnviar(page, "liquidar-resto", [
        { sel: 'input[name="numero"]', valor: "LIQ-RP-1" },
        { sel: 'input[name="valor"]', valor: "1000,00" },
        { sel: 'input[name="data"]', valor: "2027-03-10", tipo: "data" },
        { sel: 'input[name="responsavelAtesto"]', valor: "fiscal do contrato" },
        { sel: 'input[name="historico"]', valor: "liquidacao de resto nao processado" },
      ]);
      p.conferir(
        "5.1 COM as contas informadas, a MESMA liquidação é aceita — é a ordem que prova o cadastro",
        agora.tipo === "ok" && /Liquidação LIQ-RP-1 registrada/i.test(agora.texto),
        `esperava sucesso depois de configurar; veio ${agora.tipo}: ${agora.texto.slice(0, 300)}`
      );

      // ── 6) PAGAMENTO PARCIAL, e o saldo é o resultado de uma conta ────────
      await irPara(n, page, naoProcessado);
      const pag = await preencherEEnviar(page, "pagar-resto", [
        { sel: 'select[name="liquidacaoId"]', valor: "", tipo: "select", indice: 1 },
        { sel: 'input[name="numero"]', valor: "PAG-RP-1" },
        { sel: 'input[name="valor"]', valor: "400,00" },
        { sel: 'input[name="data"]', valor: "2027-03-12", tipo: "data" },
        { sel: 'select[name="contaBancaria"]', valor: "", tipo: "select", indice: 1 },
        { sel: 'input[name="historico"]', valor: "pagamento parcial de resto a pagar" },
      ]);
      p.conferir(
        "6.1 o pagamento PARCIAL é aceito e a mensagem nomeia a obrigação de origem",
        pag.tipo === "ok" && /A baixa recaiu sobre a obrigação da liquidação/i.test(pag.texto),
        `pagamento parcial falhou ou não nomeou a origem: ${pag.tipo} ${pag.texto.slice(0, 300)}`
      );

      await irPara(n, page, naoProcessado);
      const depois = await principal(page);
      p.conferir(
        "6.2 o saldo mostra 600,00 — inscrito 1.000,00 menos pago 400,00",
        depois.includes("600,00") && depois.includes("400,00"),
        `o saldo parcial não apareceu: ${depois.slice(0, 500)}`
      );

      // ── 7) ANULAR O PAGAMENTO, e o original continua visível ──────────────
      const anul = await preencherEEnviar(page, "anular-pagamento-resto", [
        { sel: 'select[name="pagamentoId"]', valor: "", tipo: "select", indice: 1 },
        { sel: 'textarea[name="motivo"]', valor: "pagamento registrado em conta errada" },
      ]);
      p.conferir(
        "7.1 a anulação do pagamento é aceita e diz que o original permanece",
        anul.tipo === "ok" && /registro original permanece/i.test(anul.texto),
        `anulação falhou: ${anul.tipo} ${anul.texto.slice(0, 300)}`
      );
      await irPara(n, page, naoProcessado);
      const aposAnular = await principal(page);
      p.conferir(
        "7.2 o saldo volta a 1.000,00 e o estorno aparece como LINHA, não embutido",
        aposAnular.includes("1.000,00") && aposAnular.includes("Estorno de pagamento"),
        `o estorno não apareceu como linha própria: ${aposAnular.slice(0, 500)}`
      );
    }

    // ── 8) O RESTO PROCESSADO: cancelamento e a sua anulação ────────────────
    const processado = await acharInscricao(page, "Processado");
    if (processado === null) {
      p.falhou(
        "8 achar uma inscrição PROCESSADA",
        "o ambiente não tem inscrição processada; os passos 8 e 9 não foram executados"
      );
    } else {
      await irPara(n, page, "/contabilidade/roteiros-de-restos-a-pagar");
      const pubCanc = await preencherEEnviar(page, "publicar-contas-CANCELAMENTO_PROCESSADO", [
        { sel: 'select[name="contaDebitoCodigo"]', valor: "2.1.3.1.1.01.00", tipo: "select" },
        { sel: 'select[name="contaCreditoCodigo"]', valor: "", tipo: "select", indice: 1 },
        { sel: 'textarea[name="fundamento"]', valor: "Cancelamento de resto processado conforme plano do municipio." },
      ]);
      p.conferir(
        "8.1 as contas do cancelamento do PROCESSADO são publicadas",
        pubCanc.tipo === "ok",
        `publicação falhou: ${pubCanc.tipo} ${pubCanc.texto.slice(0, 300)}`
      );

      await irPara(n, page, processado);
      const canc = await preencherEEnviar(page, "cancelar-resto", [
        { sel: 'input[name="valor"]', valor: "100,00" },
        { sel: 'textarea[name="motivo"]', valor: "obrigacao prescrita" },
      ]);
      p.conferir(
        "8.2 o cancelamento é aceito",
        canc.tipo === "ok",
        `cancelamento falhou: ${canc.tipo} ${canc.texto.slice(0, 300)}`
      );

      await irPara(n, page, processado);
      const anulC = await preencherEEnviar(page, "anular-cancelamento-resto", [
        { sel: 'select[name="movimentoId"]', valor: "", tipo: "select", indice: 1 },
        { sel: 'textarea[name="motivo"]', valor: "cancelamento feito por engano" },
      ]);
      p.conferir(
        "9.1 a anulação do cancelamento faz a obrigação VOLTAR a existir",
        anulC.tipo === "ok" && /voltou a existir/i.test(anulC.texto),
        `anulação do cancelamento falhou: ${anulC.tipo} ${anulC.texto.slice(0, 300)}`
      );
    }

    // ── 10) A RECUSA POR PERMISSÃO, com um segundo ator ─────────────────────
    await sair(n, page);
    const outro = process.env["PERCURSO_SEGUNDO_ATOR"] ?? "compras@percursos.local";
    const senhaOutro = process.env["PERCURSO_SEGUNDO_ATOR_SENHA"] ?? SENHA;
    try {
      await entrar(n, page, outro, senhaOutro);
      const r = await irPara(n, page, "/contabilidade/roteiros-de-restos-a-pagar");
      const corpo = await principal(page);
      p.conferir(
        "10.1 quem não tem a ação de contabilidade NÃO alcança a tela de contas",
        !corpo.includes("Contas das operações de restos a pagar") || r.includes("/login"),
        "um ator sem a ação de contabilidade abriu a tela de configuração"
      );
    } catch {
      p.ok("10.1 o segundo ator não existe neste ambiente — recusa por permissão não executada");
    }
  } finally {
    await browser.close();
  }
  p.encerrar();
}

/** Acha o link do detalhe de uma inscrição pelo rótulo do tipo, na listagem. */
async function acharInscricao(page: Page, rotuloDoTipo: string): Promise<string | null> {
  await page.goto(`${BASE}/despesa/restos-a-pagar`, { waitUntil: "domcontentloaded" });
  return page.evaluate((rotulo: string) => {
    const linhas = [...document.querySelectorAll("main tbody tr")];
    for (const tr of linhas) {
      if ((tr.textContent ?? "").includes(rotulo)) {
        const a = tr.querySelector("a[href*='/despesa/restos-a-pagar/']");
        if (a !== null) return (a as HTMLAnchorElement).getAttribute("href");
      }
    }
    return null;
  }, rotuloDoTipo);
}

await main();
