import "dotenv/config";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  type Navegador,
} from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V19/C22 — A PROGRAMAÇÃO FINANCEIRA E A RECUSA QUE ELA CAUSA, PELA TELA.
 *
 * ═══ O QUE ESTE PERCURSO EXISTE PARA PROVAR ═══
 * A ordem de construção pede, no cenário de apresentação: *"Mostrar CMD/MBA, comparação com
 * realizado e uma recusa causada pela programação ativa"*. O motor da recusa já existia e já era
 * cobrado dentro da transação do empenho; o que não existia era o INTERRUPTOR ao alcance de quem
 * opera — o regime só ligava por script, e a ordem é explícita: a demonstração funciona pela
 * interface, sem INSERT manual para a próxima tela andar.
 *
 * A cadeia inteira, na ordem em que a comissão vai vê-la:
 *
 *   1. o cronograma é PROPOSTO da previsão da lei orçamentária — doze cotas que fecham ao centavo;
 *   2. as metas bimestrais, idem;
 *   3. a limitação de empenho é LIGADA, por ato e com motivo;
 *   4. um empenho ACIMA da cota do mês é RECUSADO no servidor — e a recusa diz a REGRA, não o
 *      número de cláusula nenhuma (V19: a mensagem do guard citava "(TR 4.43)" e foi limpa);
 *   5. o saldo do mês é LIBERADO por ato;
 *   6. o MESMO empenho passa a caber.
 *
 * ⚠️ É O PAR 4/6 QUE VALE, e não cada passo sozinho: um sistema que só recusa pode estar quebrado,
 * e um que só aceita não está guardando nada. A recusa e a aceitação do MESMO valor, separadas por
 * um ato do ente, são a prova de que o cronograma é honrado.
 *
 * ⚠️ NÃO LIMPA O BANCO, E É DE UMA CORRIDA POR BANCO. Os números levam o sufixo do instante, mas o
 * ESTADO não volta: a corrida deixa um empenho de 20.000,00 em novembro, uma liberação e as versões
 * do cronograma. Na segunda corrida o mesmo empenho é recusado com razão (o teto do mês já foi
 * consumido pela primeira), e a recusa é correta — não é defeito, é a memória do banco. Rode contra
 * um CLONE novo, nunca contra o banco de apresentação.
 *
 * ⚠️ PRÉ-REQUISITOS no MESMO banco: a sequência canônica de preparação (que traz a massa de
 * demonstração com a ficha dotada) e `scripts/preparar-programacao-de-apresentacao.ts`, que registra
 * a previsão de receita sem a qual não há o que repartir em cotas.
 *
 * Uso:  npx tsx scripts/smoke-programacao-financeira.ts http://localhost:3010
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SUF = String(Date.now()).slice(-4);
const ANO = new Date().getFullYear();
const n: Navegador = { base: BASE };

/**
 * ⚠️ NOVEMBRO, E A ESCOLHA É MEDIDA: a massa de demonstração empenha em julho, agosto e setembro.
 * Num mês que já tem empenho, a cota estaria consumida antes do percurso começar, e a recusa do
 * passo 4 não distinguiria "estourou por causa do meu empenho" de "já estava estourada".
 */
const MES = 11;
const DIA_DO_EMPENHO = `${String(ANO)}-11-10`;
/** Cota mensal = previsão 150.000,00 / 12 = 12.500,00. O empenho tem de passar disso. */
const VALOR_DO_EMPENHO = "20.000,00";
/** 12.500,00 + 10.000,00 = 22.500,00, que já cobre os 20.000,00 do empenho. */
const VALOR_LIBERADO = "10.000,00";

const falhas: string[] = [];
const passos: string[] = [];
const naoExecutados: string[] = [];

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
function naoExecutado(passo: string, motivo: string): void {
  naoExecutados.push(`${passo} — ${motivo}`);
  console.error(`[NAO EXECUTADO] ${passo} — ${motivo}`);
}
function nota(texto: string): void {
  console.log(`      [${texto}]`);
}

async function texto(page: Page): Promise<string> {
  return page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " ").trim());
}

/** A situação da limitação, lida pelo marcador — nunca pelo título. */
async function situacaoDaLimitacao(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-situacao-da-limitacao]");
    return el === null ? "" : (el.getAttribute("data-situacao-da-limitacao") ?? "");
  });
}

/** A ficha com o maior saldo disponível no seletor do empenho. */
async function fichaComSaldo(page: Page): Promise<{ readonly valor: string; readonly rotulo: string } | null> {
  return page.evaluate(() => {
    const s = document.querySelector('form[data-acao="empenhar"] select[name="fichaId"]');
    if (!(s instanceof HTMLSelectElement)) return null;
    let melhor: { valor: string; rotulo: string; saldo: number } | null = null;
    for (const o of Array.from(s.options)) {
      if (o.value === "" || o.disabled) continue;
      const rotulo = (o.textContent ?? "").trim();
      const m = /disponível\s+(-?[\d]+\.\d{2})\s*$/.exec(rotulo);
      const saldo = m === null ? 0 : Number(m[1]);
      if (melhor === null || saldo > melhor.saldo) melhor = { valor: o.value, rotulo, saldo };
    }
    return melhor === null ? null : { valor: melhor.valor, rotulo: melhor.rotulo };
  });
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(n, page, ADMIN, SENHA_ADMIN);
    ok("0.1 login do administrador");

    // ══ 1. A FILA DE ATUALIZAÇÕES DE PERMISSÃO ══
    await irPara(n, page, "/administracao/perfis");
    for (let i = 0; i < 12; i += 1) {
      const pendente = await page.evaluate(
        () => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null
      );
      if (!pendente) break;
      await preencherEEnviar(page, "aplicar-atualizacao", []);
      await irPara(n, page, "/administracao/perfis");
    }
    conferir(
      "1.1 a fila de atualizações de permissões está esgotada",
      !(await page.evaluate(
        () => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null
      )),
      "sobrou atualização pendente depois de doze voltas"
    );

    // ══ 2. A TELA DA PROGRAMAÇÃO, ANTES DE QUALQUER DECRETO ══
    const rota = `/planejamento/cmd-mba?exercicio=${String(ANO)}`;
    const inicial = await irPara(n, page, rota);
    conferir(
      "2.1 a tela da programação financeira abre e se apresenta",
      /Programa[çc][ãa]o financeira/i.test(inicial),
      inicial.slice(0, 200)
    );
    const antes = await situacaoDaLimitacao(page);
    conferir(
      "2.2 a limitação de empenho começa DESLIGADA, e a tela diz isso",
      antes === "desligada",
      `situação lida: "${antes}"`
    );

    // ══ 3. O CRONOGRAMA — PROPOSTO AGORA, OU JÁ PROPOSTO PELA PREPARAÇÃO ══
    //
    // ⚠️ AS DUAS SAÍDAS SÃO VÁLIDAS, e a distinção importa: `proporCmdDaLoa` grava a versão **1** —
    // é a proposta inicial, não uma retificação. Num banco que já tem a versão 1 (a sequência de
    // preparação semeia a programação, porque o conferidor pré-apresentação cobra cronograma com
    // cotas), propor de novo é recusado pela unicidade, e essa recusa é CERTA. O que este passo
    // afirma, então, é o ESTADO: existe cronograma com as doze cotas. Retificar é publicar versão
    // nova, que é outro ato e tem serviço próprio.
    const r1 = await preencherEEnviar(page, "propor-cronograma", [
      { sel: 'input[name="atoRef"]', valor: `Decreto ${SUF}/${String(ANO)}` },
      { sel: 'input[name="vigenteDesde"]', valor: `${String(ANO)}-01-01`, tipo: "data" },
    ]);
    nota(`propor cronograma: ${r1.tipo} — ${r1.texto.slice(0, 160)}`);
    const propostoAgora = r1.tipo === "ok" && /12 cota/i.test(r1.texto);

    const r2 = await preencherEEnviar(page, "propor-metas", [
      { sel: 'input[name="atoRef"]', valor: `Decreto ${SUF}-M/${String(ANO)}` },
      { sel: 'input[name="vigenteDesde"]', valor: `${String(ANO)}-01-01`, tipo: "data" },
    ]);
    nota(`propor metas: ${r2.tipo} — ${r2.texto.slice(0, 120)}`);

    await irPara(n, page, rota);
    const comCronograma = await texto(page);
    // ⚠️ O ESTADO, E NÃO O CAMINHO: doze cotas de 12.500,00 na matriz — o número que a comissão
    // confere de cabeça (previsão de 150.000,00 repartida em doze).
    conferir(
      "3.1 existe cronograma vigente com as doze cotas da fonte" +
        (propostoAgora ? " (proposto AGORA, pela tela)" : " (proposto na preparação do ambiente)"),
      /500/.test(comCronograma) && /12\.500,00/.test(comCronograma),
      comCronograma.slice(0, 400)
    );
    conferir(
      "3.2 a matriz cobre os doze meses, até dezembro",
      /dezembro|Dez/i.test(comCronograma),
      comCronograma.slice(0, 300)
    );

    // ══ 4. A LIMITAÇÃO LIGADA, POR ATO ══
    const r3 = await preencherEEnviar(page, "configurar-limitacao", [
      { sel: 'select[name="ativo"]', valor: "ligar", tipo: "select" },
      { sel: 'input[name="atoRef"]', valor: `Decreto ${SUF}-L/${String(ANO)}` },
      { sel: 'input[name="motivo"]', valor: "frustracao da meta de arrecadacao do bimestre" },
    ]);
    conferir(
      "4.1 a limitação de empenho é LIGADA por ato, com motivo",
      r3.tipo === "ok" && /ativada/i.test(r3.texto),
      `${r3.tipo}: ${r3.texto.slice(0, 220)}`
    );
    await irPara(n, page, rota);
    const depois = await situacaoDaLimitacao(page);
    conferir(
      "4.2 a tela recarregada lê a situação da PERSISTÊNCIA: ligada",
      depois === "ligada",
      `situação lida: "${depois}"`
    );

    // ══ 5. O EMPENHO ACIMA DA COTA DO MÊS É RECUSADO ══
    await irPara(n, page, `/despesa/empenhos?exercicio=${String(ANO)}`);
    const ficha = await fichaComSaldo(page);
    if (ficha === null) {
      naoExecutado("5.x o empenho", "nenhuma ficha com saldo no seletor — a massa rodou neste banco?");
    } else {
      nota(`ficha escolhida: ${ficha.rotulo.slice(0, 90)}`);
      const camposDoEmpenho = [
        { sel: 'select[name="fichaId"]', valor: ficha.valor, tipo: "select" as const },
        { sel: 'input[name="numero"]', valor: `NE-P${SUF}` },
        { sel: '[data-mascara="cpf-cnpj"]', valor: "11222333000144" },
        { sel: '[data-mascara="valor"]', valor: VALOR_DO_EMPENHO },
        { sel: 'input[name="data"]', valor: DIA_DO_EMPENHO, tipo: "data" as const },
        { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" as const },
        { sel: 'input[name="historico"]', valor: `empenho do percurso da programacao ${SUF}` },
      ];
      const r4 = await preencherEEnviar(page, "empenhar", camposDoEmpenho);
      nota(`empenho com a limitação ligada: ${r4.tipo} — ${r4.texto.slice(0, 200)}`);
      conferir(
        "5.1 o empenho acima da cota do mês é RECUSADO no servidor",
        r4.tipo === "erro" && /limita[çc][ãa]o de empenho/i.test(r4.texto),
        `${r4.tipo}: ${r4.texto.slice(0, 250)}`
      );
      /**
       * ⚠️ A RECUSA NÃO PODE CITAR CLÁUSULA DE EDITAL, e este passo é o motivo de a V19 ter varrido
       * as 65 strings: esta mensagem dizia "(TR 4.43)" e ia inteira para a tela, na frente de quem
       * estivesse olhando.
       */
      conferir(
        "5.2 a recusa diz a REGRA e NÃO cita número de cláusula do edital",
        r4.tipo === "erro" && !/\bTR\s*\d/.test(r4.texto) && /cota/i.test(r4.texto),
        r4.texto.slice(0, 250)
      );

      // ══ 6. O SALDO DO MÊS LIBERADO, E O MESMO EMPENHO PASSANDO ══
      await irPara(n, page, rota);
      const fonteOpcao = await page.evaluate(() => {
        const s = document.querySelector('form[data-acao="liberar-cota"] select[name="fonteId"]');
        if (!(s instanceof HTMLSelectElement)) return "";
        const o = Array.from(s.options).find((x) => x.value !== "");
        return o === undefined ? "" : o.value;
      });
      if (fonteOpcao === "") {
        naoExecutado("6.x a liberação", "o seletor de fonte da liberação veio vazio");
      } else {
        const r5 = await preencherEEnviar(page, "liberar-cota", [
          { sel: 'select[name="fonteId"]', valor: fonteOpcao, tipo: "select" },
          { sel: 'select[name="mes"]', valor: String(MES), tipo: "select" },
          { sel: '[data-mascara="valor"]', valor: VALOR_LIBERADO },
          { sel: 'input[name="atoRef"]', valor: `Decreto ${SUF}-B/${String(ANO)}` },
          { sel: 'input[name="motivo"]', valor: "recomposicao apos o ingresso do repasse" },
        ]);
        conferir(
          "6.1 o saldo do mês é LIBERADO por ato",
          r5.tipo === "ok",
          `${r5.tipo}: ${r5.texto.slice(0, 220)}`
        );

        await irPara(n, page, `/despesa/empenhos?exercicio=${String(ANO)}`);
        const fichaDeNovo = await fichaComSaldo(page);
        const r6 = await preencherEEnviar(page, "empenhar", [
          { sel: 'select[name="fichaId"]', valor: fichaDeNovo?.valor ?? ficha.valor, tipo: "select" },
          { sel: 'input[name="numero"]', valor: `NE-P${SUF}B` },
          { sel: '[data-mascara="cpf-cnpj"]', valor: "11222333000144" },
          { sel: '[data-mascara="valor"]', valor: VALOR_DO_EMPENHO },
          { sel: 'input[name="data"]', valor: DIA_DO_EMPENHO, tipo: "data" },
          { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
          { sel: 'input[name="historico"]', valor: `empenho apos a liberacao ${SUF}` },
        ]);
        nota(`empenho depois da liberação: ${r6.tipo} — ${r6.texto.slice(0, 180)}`);
        conferir(
          "6.2 ⚠️ o MESMO empenho passa a caber depois da liberação — o par que prova o regime",
          r6.tipo === "ok",
          `${r6.tipo}: ${r6.texto.slice(0, 250)}`
        );
      }

      // ══ 7. O RESTABELECIMENTO ══
      await irPara(n, page, rota);
      const r7 = await preencherEEnviar(page, "configurar-limitacao", [
        { sel: 'select[name="ativo"]', valor: "desligar", tipo: "select" },
        { sel: 'input[name="atoRef"]', valor: `Decreto ${SUF}-R/${String(ANO)}` },
        { sel: 'input[name="motivo"]', valor: "restabelecimento do desembolso apos a recomposicao" },
      ]);
      conferir(
        "7.1 a limitação é DESLIGADA por ato — restabelecimento do desembolso",
        r7.tipo === "ok" && /desativada/i.test(r7.texto),
        `${r7.tipo}: ${r7.texto.slice(0, 220)}`
      );
      await irPara(n, page, rota);
      conferir(
        "7.2 a tela recarregada lê desligada, e o histórico dos atos permanece",
        (await situacaoDaLimitacao(page)) === "desligada",
        `situação lida: "${await situacaoDaLimitacao(page)}"`
      );
    }
  } finally {
    await navegador.close();
  }

  console.log("\n════════════════════════════════════════════");
  console.log(`passos ok: ${String(passos.length)}`);
  console.log(`falhas:    ${String(falhas.length)}`);
  console.log(`nao executados: ${String(naoExecutados.length)}`);
  for (const f of falhas) console.log(`  [FALHA] ${f}`);
  for (const x of naoExecutados) console.log(`  [NAO EXECUTADO] ${x}`);
  if (falhas.length > 0) process.exitCode = 1;
}

await main();
