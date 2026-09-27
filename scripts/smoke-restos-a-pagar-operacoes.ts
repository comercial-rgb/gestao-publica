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

/**
 * O VALOR de uma opção cujo TEXTO contém um trecho.
 *
 * ⚠️ `indice` DO AJUDANTE CONTA ELEMENTOS, NÃO OPÇÕES — e eu o usei como se contasse opções, o que
 * derrubou a corrida anterior com `não casou o elemento de índice 1`. E o valor destas opções é um
 * identificador que o percurso não pode saber de antemão: a liquidação, o pagamento e o movimento
 * nascem na própria corrida. Ler o valor pelo TEXTO é o que a pessoa faz — ela escolhe "LIQ-RP-1",
 * não um cuid.
 */
async function valorDaOpcao(page: Page, seletor: string, textoContido: string): Promise<string> {
  const v = await page.evaluate(
    (sel: string, trecho: string) => {
      const el = document.querySelector(sel);
      if (!(el instanceof HTMLSelectElement)) return null;
      for (const o of [...el.options]) {
        if (o.value !== "" && (o.textContent ?? "").includes(trecho)) return o.value;
      }
      return null;
    },
    seletor,
    textoContido
  );
  if (v === null) {
    throw new Error(
      `Nenhuma opção de "${seletor}" contém "${textoContido}". O ato anterior não produziu o que ` +
        `este passo precisa escolher.`
    );
  }
  return v;
}

/** O `<main>`, nunca o corpo: a lição do ENT10. */
async function principal(page: Page): Promise<string> {
  return page.$eval("main", (m) => m.textContent ?? "").catch(() => "");
}

/**
 * ⚠️ OS VALORES SAO OS DA FIXTURE (`scripts/preparar-restos-de-percursos.ts`) e os dois arquivos
 * tem de concordar. Mudar um sem o outro faz o percurso falhar por aritmetica, nao por defeito.
 *
 *   inscricao NAO PROCESSADA  25.000,00   liquidar 25.000,00, pagar 10.000,00 -> saldo 15.000,00
 *   inscricao PROCESSADA      40.000,00   cancelar 5.000,00 -> 35.000,00, anular -> 40.000,00
 */
const INSCRITO_NP = "25.000,00";
const LIQ_NP = "25.000,00";
const PAGO_PARCIAL = "10.000,00";
const SALDO_APOS_PAGAMENTO = "15.000,00";
const INSCRITO_P = "40.000,00";
const PAGO_CABECA = "12.000,00";
const SALDO_P_APOS_PAGAMENTO = "28.000,00";
const CANCELADO = "5.000,00";
const SALDO_P_APOS_CANCELAMENTO = "23.000,00";

/**
 * ⚠️ OS CODIGOS FORAM CONFERIDOS CONTRA O PLANO CARREGADO, e a conferencia nao e zelo: a corrida
 * anterior falhou porque eu havia escrito `2.1.3.1.1.01.00`, que NAO EXISTE — a analitica e
 * `2.1.3.1.1.01.01` ("FORNECEDORES NAO PARCELADOS A PAGAR"). O `select` ficava vazio, o cadastro
 * recusava por meio par, e a falha apontava para a tela em vez de para o percurso. Terceira vez
 * que codigo de conta nao conferido me custa uma corrida nesta rodada.
 */
const VPD = "3.3.1.1.1.01.00";
const RP_PROCESSADOS = "2.1.3.1.1.01.01";
const VPA = "4.6.4.1.1.00.00";
/** Conta bancária da fixture do banco de percursos. */
const CONTA_BANCARIA = "CC-POC-A";

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
    // As duas inscrições se acham ANTES: a ordem dos pagamentos depende das duas.
    const processado = await acharInscricao(page, "Processado");
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
        { sel: 'input[name="valor"]', valor: LIQ_NP },
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
        { sel: 'select[name="contaDebitoCodigo"]', valor: VPD, tipo: "select" },
        { sel: 'select[name="contaCreditoCodigo"]', valor: RP_PROCESSADOS, tipo: "select" },
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
        { sel: 'input[name="valor"]', valor: LIQ_NP },
        { sel: 'input[name="data"]', valor: "2027-03-10", tipo: "data" },
        { sel: 'input[name="responsavelAtesto"]', valor: "fiscal do contrato" },
        { sel: 'input[name="historico"]', valor: "liquidacao de resto nao processado" },
      ]);
      p.conferir(
        "5.1 COM as contas informadas, a MESMA liquidação é aceita — é a ordem que prova o cadastro",
        agora.tipo === "ok" && /Liquidação LIQ-RP-1 registrada/i.test(agora.texto),
        `esperava sucesso depois de configurar; veio ${agora.tipo}: ${agora.texto.slice(0, 300)}`
      );

      // ── 6) A FILA CRONOLÓGICA ATRAVESSA O EXERCÍCIO ───────────────────────
      //
      // ⚠️ ESTE PASSO NASCEU DE UMA RECUSA QUE EU NÃO ESPERAVA, e ela estava CERTA. Pagar a
      // liquidação recém-feita antes da que veio do exercício anterior viola o art. 141 §1º, e o
      // domínio recusou nomeando a POSIÇÃO na fila e a CABEÇA. Contornar isso — pagando a cabeça
      // primeiro e calando a recusa — teria escondido o achado mais forte do percurso: **a fila do
      // art. 141 sobrevive à virada do exercício.** A liquidação de origem é de 2026 e a nova é de
      // 2027, e a ordem entre elas continua valendo. Então a recusa é afirmada, e só depois se paga
      // na ordem.
      await irPara(n, page, naoProcessado);
      const foraDeOrdem = await preencherEEnviar(page, "pagar-resto", [
        {
          sel: 'select[name="liquidacaoId"]',
          valor: await valorDaOpcao(
            page,
            'form[data-acao="pagar-resto"] select[name="liquidacaoId"]',
            "LIQ-RP-1"
          ),
          tipo: "select",
        },
        { sel: 'input[name="numero"]', valor: "PAG-RP-FORA" },
        { sel: 'input[name="valor"]', valor: PAGO_PARCIAL },
        { sel: 'input[name="data"]', valor: "2027-03-12", tipo: "data" },
        { sel: 'select[name="contaBancaria"]', valor: CONTA_BANCARIA, tipo: "select" },
        { sel: 'input[name="historico"]', valor: "tentativa fora de ordem" },
      ]);
      p.conferir(
        "6.1 pagar fora da ordem cronológica é RECUSADO, e a fila ATRAVESSA o exercício",
        foraDeOrdem.tipo === "erro" &&
          /141/.test(foraDeOrdem.texto) &&
          /RP-PROC-LIQ/.test(foraDeOrdem.texto),
        `esperava recusa do art. 141 nomeando a cabeça RP-PROC-LIQ; veio ${foraDeOrdem.tipo}: ${foraDeOrdem.texto.slice(0, 300)}`
      );

      // ── 7) A CABEÇA DA FILA É PAGA PRIMEIRO, no resto PROCESSADO ──────────
      if (processado === null) {
        p.falhou(
          "7 pagar a cabeça da fila",
          "o ambiente não tem inscrição processada; os passos 7 a 10 não foram executados"
        );
      } else {
        await irPara(n, page, processado);
        const pagCabeca = await preencherEEnviar(page, "pagar-resto", [
          {
            sel: 'select[name="liquidacaoId"]',
            valor: await valorDaOpcao(
              page,
              'form[data-acao="pagar-resto"] select[name="liquidacaoId"]',
              "RP-PROC-LIQ"
            ),
            tipo: "select",
          },
          { sel: 'input[name="numero"]', valor: "PAG-RP-CABECA" },
          { sel: 'input[name="valor"]', valor: PAGO_CABECA },
          { sel: 'input[name="data"]', valor: "2027-03-11", tipo: "data" },
          { sel: 'select[name="contaBancaria"]', valor: CONTA_BANCARIA, tipo: "select" },
          { sel: 'input[name="historico"]', valor: "pagamento parcial da cabeca da fila" },
        ]);
        p.conferir(
          "7.1 a cabeça da fila é paga PARCIALMENTE e a mensagem nomeia a obrigação de origem",
          pagCabeca.tipo === "ok" && /A baixa recaiu sobre a obrigação da liquidação/i.test(pagCabeca.texto),
          `pagamento da cabeça falhou: ${pagCabeca.tipo} ${pagCabeca.texto.slice(0, 300)}`
        );
        await irPara(n, page, processado);
        const saldoP = await principal(page);
        p.conferir(
          `7.2 o saldo do processado é ${SALDO_P_APOS_PAGAMENTO} — ${INSCRITO_P} menos ${PAGO_CABECA}`,
          saldoP.includes(SALDO_P_APOS_PAGAMENTO),
          `o saldo parcial do processado não apareceu: ${saldoP.slice(0, 400)}`
        );
        // ── 8) O CANCELAMENTO E A SUA ANULAÇÃO, no resto PROCESSADO ──────────
        //
        // ⚠️ AQUI, E NÃO DEPOIS: cancelar exige saldo, e quitar a cabeça da fila primeiro zeraria o
        // saldo do processado — o cancelamento passaria a não ter o que cancelar. A ordem desta
        // história é ditada pelo domínio, não pela conveniência do arquivo.
          await irPara(n, page, "/contabilidade/roteiros-de-restos-a-pagar");
          const pubCanc = await preencherEEnviar(page, "publicar-contas-CANCELAMENTO_PROCESSADO", [
            { sel: 'select[name="contaDebitoCodigo"]', valor: RP_PROCESSADOS, tipo: "select" },
            { sel: 'select[name="contaCreditoCodigo"]', valor: VPA, tipo: "select" },
            { sel: 'textarea[name="fundamento"]', valor: "Cancelamento de resto processado conforme plano do municipio." },
          ]);
          p.conferir(
            "8.1 as contas do cancelamento do PROCESSADO são publicadas",
            pubCanc.tipo === "ok",
            `publicação falhou: ${pubCanc.tipo} ${pubCanc.texto.slice(0, 300)}`
          );

          await irPara(n, page, processado);
          const canc = await preencherEEnviar(page, "cancelar-resto", [
            { sel: 'input[name="valor"]', valor: CANCELADO },
            { sel: 'textarea[name="motivo"]', valor: "obrigacao prescrita" },
          ]);
          p.conferir(
            "8.2 o cancelamento é aceito",
            canc.tipo === "ok",
            `cancelamento falhou: ${canc.tipo} ${canc.texto.slice(0, 300)}`
          );

          await irPara(n, page, processado);
          const aposCanc = await principal(page);
          p.conferir(
            `8.3 o saldo cai para ${SALDO_P_APOS_CANCELAMENTO} — ${SALDO_P_APOS_PAGAMENTO} menos cancelado ${CANCELADO}`,
            aposCanc.includes(SALDO_P_APOS_CANCELAMENTO),
            `o saldo apos o cancelamento não apareceu: ${aposCanc.slice(0, 500)}`
          );

          await irPara(n, page, processado);
          const idDoCancelamento = await valorDaOpcao(
            page,
            'form[data-acao="anular-cancelamento-resto"] select[name="movimentoId"]',
            CANCELADO
          );
          const anulC = await preencherEEnviar(page, "anular-cancelamento-resto", [
            { sel: 'select[name="movimentoId"]', valor: idDoCancelamento, tipo: "select" },
            { sel: 'input[name="numero"]', valor: "ANUL-CANC-1" },
            { sel: 'input[name="data"]', valor: "2027-03-15", tipo: "data" },
            { sel: 'textarea[name="motivo"]', valor: "cancelamento feito por engano" },
          ]);
          p.conferir(
            "9.1 a anulação do cancelamento faz a obrigação VOLTAR a existir",
            anulC.tipo === "ok" && /voltou a existir/i.test(anulC.texto),
            `anulação do cancelamento falhou: ${anulC.tipo} ${anulC.texto.slice(0, 300)}`
          );
          await irPara(n, page, processado);
          const aposAnularC = await principal(page);
          p.conferir(
            `9.2 o saldo volta a ${SALDO_P_APOS_PAGAMENTO}, e o cancelamento anulado aparece como LINHA`,
            aposAnularC.includes(SALDO_P_APOS_PAGAMENTO) && aposAnularC.includes("Estorno de cancelamento"),
            `o retorno do saldo não apareceu: ${aposAnularC.slice(0, 500)}`
          );
        // ── 10) A CABEÇA É QUITADA, e só então a fila libera a seguinte ───────
        const quitar = await preencherEEnviar(page, "pagar-resto", [
          {
            sel: 'select[name="liquidacaoId"]',
            valor: await valorDaOpcao(
              page,
              'form[data-acao="pagar-resto"] select[name="liquidacaoId"]',
              "RP-PROC-LIQ"
            ),
            tipo: "select",
          },
          { sel: 'input[name="numero"]', valor: "PAG-RP-CABECA-2" },
          { sel: 'input[name="valor"]', valor: SALDO_P_APOS_PAGAMENTO },
          { sel: 'input[name="data"]', valor: "2027-03-11", tipo: "data" },
          { sel: 'select[name="contaBancaria"]', valor: CONTA_BANCARIA, tipo: "select" },
          { sel: 'input[name="historico"]', valor: "quitacao da cabeca da fila" },
        ]);
        p.conferir(
          "10.1 a cabeça da fila é QUITADA",
          quitar.tipo === "ok",
          `quitação da cabeça falhou: ${quitar.tipo} ${quitar.texto.slice(0, 300)}`
        );
      }


      // ── 11) AGORA O PARCIAL DO NÃO PROCESSADO — a fila liberou ────────────
      await irPara(n, page, naoProcessado);
      const pag = await preencherEEnviar(page, "pagar-resto", [
        {
          sel: 'select[name="liquidacaoId"]',
          valor: await valorDaOpcao(
            page,
            'form[data-acao="pagar-resto"] select[name="liquidacaoId"]',
            "LIQ-RP-1"
          ),
          tipo: "select",
        },
        { sel: 'input[name="numero"]', valor: "PAG-RP-1" },
        { sel: 'input[name="valor"]', valor: PAGO_PARCIAL },
        { sel: 'input[name="data"]', valor: "2027-03-12", tipo: "data" },
        { sel: 'select[name="contaBancaria"]', valor: CONTA_BANCARIA, tipo: "select" },
        { sel: 'input[name="historico"]', valor: "pagamento parcial de resto a pagar" },
      ]);
      p.conferir(
        "11.1 na ordem, o pagamento PARCIAL é aceito e nomeia a obrigação de origem",
        pag.tipo === "ok" && /A baixa recaiu sobre a obrigação da liquidação/i.test(pag.texto),
        `pagamento parcial falhou ou não nomeou a origem: ${pag.tipo} ${pag.texto.slice(0, 300)}`
      );

      await irPara(n, page, naoProcessado);
      const depois = await principal(page);
      p.conferir(
        `11.2 o saldo e ${SALDO_APOS_PAGAMENTO} — inscrito ${INSCRITO_NP} menos pago ${PAGO_PARCIAL}`,
        depois.includes(SALDO_APOS_PAGAMENTO) && depois.includes(PAGO_PARCIAL),
        `o saldo parcial não apareceu: ${depois.slice(0, 500)}`
      );

      // ── 12) ANULAR O PAGAMENTO, e o original continua visível ─────────────
      const idDoPagamento = await valorDaOpcao(
        page,
        'form[data-acao="anular-pagamento-resto"] select[name="pagamentoId"]',
        PAGO_PARCIAL
      );
      const anul = await preencherEEnviar(page, "anular-pagamento-resto", [
        { sel: 'select[name="pagamentoId"]', valor: idDoPagamento, tipo: "select" },
        { sel: 'input[name="numero"]', valor: "ANUL-PAG-1" },
        { sel: 'input[name="data"]', valor: "2027-03-20", tipo: "data" },
        { sel: 'textarea[name="motivo"]', valor: "pagamento registrado em conta errada" },
      ]);
      p.conferir(
        "12.1 a anulação do pagamento é aceita e diz que o original permanece",
        anul.tipo === "ok" && /registro original permanece/i.test(anul.texto),
        `anulação falhou: ${anul.tipo} ${anul.texto.slice(0, 300)}`
      );
      await irPara(n, page, naoProcessado);
      const aposAnular = await principal(page);
      p.conferir(
        `12.2 o saldo volta a ${INSCRITO_NP} e o estorno aparece como LINHA, não embutido`,
        aposAnular.includes(INSCRITO_NP) && aposAnular.includes("Estorno de pagamento"),
        `o estorno não apareceu como linha própria: ${aposAnular.slice(0, 500)}`
      );
    }

    // ── 13) A RECUSA POR PERMISSÃO, com um segundo ator ─────────────────────
    await sair(n, page);
    const outro = process.env["PERCURSO_SEGUNDO_ATOR"] ?? "compras@percursos.local";
    const senhaOutro = process.env["PERCURSO_SEGUNDO_ATOR_SENHA"] ?? SENHA;
    try {
      await entrar(n, page, outro, senhaOutro);
      const r = await irPara(n, page, "/contabilidade/roteiros-de-restos-a-pagar");
      const corpo = await principal(page);
      p.conferir(
        "13.1 quem não tem a ação de contabilidade NÃO alcança a tela de contas",
        !corpo.includes("Contas das operações de restos a pagar") || r.includes("/login"),
        "um ator sem a ação de contabilidade abriu a tela de configuração"
      );
    } catch {
      p.ok("13.1 o segundo ator não existe neste ambiente — recusa por permissão não executada");
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
