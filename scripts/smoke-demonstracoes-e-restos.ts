import "dotenv/config";
import type { Page } from "puppeteer";
import {
  barrado,
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  sair,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * ═══ O PERCURSO DAS QUATRO DEMONSTRAÇÕES CONTÁBEIS E DOS RESTOS A PAGAR (V14) ═══
 *
 * Cinco telas que nasceram nesta ordem e nunca foram abertas por ninguém:
 *   · Balanço Orçamentário (Anexo 12)      · Balanço Patrimonial (Anexo 14)
 *   · Balanço Financeiro (Anexo 13)        · Variações Patrimoniais (Anexo 15)
 *   · Restos a Pagar (listagem e detalhe)
 *
 * ⚠️ ELE AFIRMA VALORES, NÃO A PRESENÇA DE TÍTULO. Uma tela de demonstrativo com o título certo e
 * zero no corpo é o defeito mais fácil de produzir e o mais difícil de ver — e a ordem desta rodada
 * proíbe explicitamente "emitir PDF vazio com título correto como prova de atendimento". Então cada
 * passo procura o NÚMERO que a porta mediu contra o banco dos percursos.
 *
 * ⚠️ E ELE LÊ O `<main>`, NÃO O `document.body` — a lição do ENT10. O corpo inclui a barra lateral e
 * o seletor de contexto do cabeçalho, onde rótulos como "restos a pagar" aparecem como ITEM DE MENU.
 * Uma asserção sobre o corpo passaria pelo motivo errado: acharia o menu, não a tela.
 *
 * ⚠️ A CONCILIAÇÃO ENTRE DOIS RELATÓRIOS É O PASSO QUE MAIS VALE. O `resultadoDoExercicio` do
 * Anexo 14 e o `resultadoPatrimonial` do Anexo 15 têm de ser o MESMO número, lidos de DUAS telas
 * diferentes. É esse par que o defeito de corte da V14 r1 quebrava — e ele quebrava em silêncio,
 * porque cada balanço, isolado, continuava fechando.
 *
 * Uso:  DATABASE_URL=<percursos, papel de runtime> npx next dev -p 3011
 *       PERCURSO_BASE=http://localhost:3011 npx tsx scripts/smoke-demonstracoes-e-restos.ts
 */

const BASE = process.env["PERCURSO_BASE"] ?? "http://localhost:3011";
const USUARIO = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";

/**
 * O SEGUNDO ATOR, e sem ele a autorização não é medida. O `admin` tem permissão GLOBAL: sob ele
 * nenhuma das cinco telas dispara recusa, e um percurso de um ator só ficaria verde com o guard
 * inteiramente desligado. Medido no banco dos percursos: `compras@percursos.local` NÃO tem
 * `CONSULTAR_RELATORIOS` nem `CONSULTAR_DESPESA`.
 */
const RESTRITO = "compras@percursos.local";
const SENHA_RESTRITO = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";

if (SENHA === "") {
  console.error("SEED_ADMIN_SENHA ausente — o percurso entra pela tela de login e precisa dela.");
  process.exit(2);
}

/** O `<main>` do layout das áreas, em minúsculas e com espaços colapsados. */
async function principal(page: Page): Promise<string> {
  return page.evaluate(() => {
    const m = document.querySelector("main");
    return (m instanceof HTMLElement ? m.innerText : document.body.innerText)
      .replace(/\s+/g, " ")
      .toLowerCase();
  });
}

const falhas: string[] = [];
let passos = 0;

function conferir(rotulo: string, corpo: string, esperados: readonly string[]): void {
  passos += 1;
  const ausentes = esperados.filter((e) => !corpo.includes(e.toLowerCase()));
  if (ausentes.length === 0) {
    console.log(`  OK   ${rotulo}`);
    return;
  }
  falhas.push(`${rotulo}: não achei ${ausentes.map((a) => `"${a}"`).join(", ")}`);
  console.log(`  FALHA ${rotulo} — ausentes: ${ausentes.join(" | ")}`);
}

async function main(): Promise<void> {
  const navegador = await lancarNavegadorDoPercurso();
  const n: Navegador = { base: BASE };
  const page = await navegador.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  try {
    await entrar(n, page, USUARIO, SENHA);
    console.log(`[percurso] entrou como ${USUARIO} em ${BASE}`);

    // ── ANEXO 12 ──────────────────────────────────────────────────────────────────
    await irPara(n, page, "/relatorios/demonstracoes/balanco-orcamentario?exercicio=2026");
    const a12 = await principal(page);
    conferir("Anexo 12 — título, situação e os valores da execução", a12, [
      "balanço orçamentário",
      "660.000,00", // dotação atualizada
      "80.000,00", // empenhada = liquidada = paga
      "em andamento", // exercício aberto: posição parcial, e a tela diz isso
    ]);

    // ── ANEXO 13 ──────────────────────────────────────────────────────────────────
    await irPara(n, page, "/relatorios/demonstracoes/balanco-financeiro?exercicio=2026");
    const a13 = await principal(page);
    conferir("Anexo 13 — ingressos, dispêndios e o saldo em espécie", a13, [
      "balanço financeiro",
      "80.500,00", // ingressos e dispêndios
      "200,00", // saldo em espécie para o exercício seguinte
      "caixa apurado pelos lançamentos contábeis",
    ]);

    // ── ANEXO 14 ──────────────────────────────────────────────────────────────────
    await irPara(n, page, "/relatorios/demonstracoes/balanco-patrimonial?corte=2026-12-31");
    const a14 = await principal(page);
    conferir("Anexo 14 — a equação, o quadro do art. 105 e o superávit por fonte", a14, [
      "balanço patrimonial",
      "268.325,00", // total do ativo
      "268.125,00", // patrimônio líquido e resultado do exercício
      "ativo financeiro",
      "superávit (déficit) financeiro",
      "superávit financeiro por fonte", // a legenda do quadro que a r1 apurava e jogava fora
    ]);
    // ⚠️ O ESTADO VAZIO NÃO PODE ESTAR NA TELA. Ele é o texto que a r1 mostrava SEMPRE que o
    // quadro existia — porque o lado positivo não tinha sido escrito.
    passos += 1;
    if (a14.includes("superávit financeiro por fonte não apurado")) {
      falhas.push("Anexo 14: mostrou 'não apurado' mesmo com o rol de disponibilidades configurado");
      console.log("  FALHA Anexo 14 — o aviso de 'não apurado' apareceu com o rol presente");
    } else {
      console.log("  OK   Anexo 14 — o aviso de 'não apurado' NÃO aparece (o quadro saiu)");
    }

    // ── ANEXO 15 ──────────────────────────────────────────────────────────────────
    await irPara(n, page, "/relatorios/demonstracoes/variacoes-patrimoniais?desde=2026-01-01&ate=2026-12-31");
    const a15 = await principal(page);
    conferir("Anexo 15 — VPA, VPD e o resultado patrimonial", a15, [
      "variações patrimoniais",
      "350.000,00", // total VPA
      "81.875,00", // total VPD
      "268.125,00", // resultado patrimonial
      "impostos, taxas e contribuições de melhoria", // rótulo OFICIAL vindo do plano do TCE-PB
    ]);

    // ── A CONCILIAÇÃO ENTRE AS DUAS TELAS ─────────────────────────────────────────
    passos += 1;
    if (a14.includes("268.125,00") && a15.includes("268.125,00")) {
      console.log("  OK   Anexos 14 e 15 conciliam: o mesmo resultado 268.125,00 nas DUAS telas");
    } else {
      falhas.push("os Anexos 14 e 15 não mostraram o mesmo resultado do exercício");
      console.log("  FALHA a conciliação entre o Anexo 14 e o Anexo 15");
    }

    // ── O CORTE, PELA TELA ────────────────────────────────────────────────────────
    //
    // ⚠️ A PRIMEIRA VERSÃO DESTE PASSO ESTAVA ERRADA, E O ERRO ERA MEU, não do produto. Ela
    // comparava 30/12 com 31/12 esperando números diferentes — mas os fatos deste banco vão de
    // 01/01 a 15/10/2026, então os dois cortes incluem TUDO e dão o mesmo total, corretamente.
    // Um percurso que exige diferença onde não deve haver acusa o produto por um defeito do
    // roteiro; a régua tem de cair ANTES do último fato para discriminar.
    //
    // 30/06 fica antes da maior parte dos fatos: a posição tem de ser MENOR que a de 31/12. O
    // corte por dia exato está caracterizado em `test/demonstracoes-contabeis.test.ts`, que mede
    // o fim do dia do corte contra o dia seguinte; aqui a pergunta é só se a TELA aplica o filtro.
    await irPara(n, page, "/relatorios/demonstracoes/balanco-patrimonial?corte=2026-06-30");
    const a14meio = await principal(page);
    passos += 1;
    if (a14meio.includes("268.325,00")) {
      falhas.push("o corte não filtra pela tela: 30/06 mostrou o mesmo ativo de 31/12");
      console.log("  FALHA o seletor de corte não mudou a posição");
    } else {
      console.log("  OK   o corte filtra pela tela: 30/06 NÃO repete o ativo de 31/12");
    }

    // ── RESTOS A PAGAR ────────────────────────────────────────────────────────────
    await irPara(n, page, "/despesa/restos-a-pagar");
    const rp = await principal(page);
    conferir("Restos a pagar — a tela abre e diz a verdade sobre as ações", rp, [
      "restos a pagar",
      // Sem inscrição neste banco, o estado vazio tem de EXPLICAR de onde vem a inscrição,
      // em vez de deixar a tela muda.
      "encerramento do exercício",
      // E a limitação das ações precisa estar dita em linguagem de operação.
      "contabilização",
    ]);

    // ── SAGRES: DIÁRIO E MENSAL DOS FATOS DESTA BASE ──────────────────────────────
    //
    // ⚠️ DOIS RECORTES DIFERENTES, porque a prova de conceito do edital diz que a Comissão escolhe
    // o dia e o mês. Um arquivo pronto para uma data só não responde a isso.
    //
    // ⚠️ E A GERAÇÃO NÃO É VERIFICÁVEL FORA DA REQUISIÇÃO: a porta do SAGRES resolve o contexto do
    // ente pela sessão (`cookies`), então um script avulso estoura com "cookies was called outside a
    // request scope". Isso é o desenho certo — tenant e entidade vêm do servidor, não do chamador —
    // e é por isso que este trecho mora num percurso de navegador e não num script.
    //
    // Nada aqui transmite, e nada finge recibo: a tela gera e valida LOCALMENTE.
    const recortes: readonly { readonly rot: string; readonly dia: string; readonly mes: string }[] = [
      { rot: "pagamento de julho", dia: "2026-07-14", mes: "2026-07" },
      { rot: "empenho de setembro", dia: "2026-09-10", mes: "2026-09" },
    ];
    for (const r of recortes) {
      await irPara(n, page, `/integracoes/sagres?dia=${r.dia}&mes=${r.mes}`);
      const sg = await principal(page);
      conferir(`SAGRES — ${r.rot} (dia ${r.dia}, mês ${r.mes})`, sg, [
        "sagres",
        r.dia, // a competência DIÁRIA escolhida aparece na tela
        r.mes, // e a MENSAL, que é independente dela
      ]);
      // O dia escolhido tem fato: o pacote não pode estar inteiramente vazio.
      passos += 1;
      if (sg.includes("não há movimento registrado neste dia")) {
        falhas.push(`SAGRES ${r.dia}: a tela disse "sem movimento" num dia que TEM fato na base`);
        console.log(`  FALHA SAGRES ${r.dia} — disse "sem movimento" e a base tem fato`);
      } else {
        console.log(`  OK   SAGRES ${r.dia} — pacote gerado com movimento`);
      }
    }

    // ⚠️ O DIA SEM MOVIMENTO TAMBÉM É CONTRATO, e o oposto do que a intuição sugere: o arquivo do
    // dia é gerado VAZIO, não omitido, porque a ausência de movimento é informação. A tela tem de
    // DIZER isso em vez de parecer falha — e não pode impedir a escolha do dia para esconder o
    // vazio. 2026-02-02 não tem fato nesta base (os fatos são de 01/01 e de julho em diante).
    await irPara(n, page, "/integracoes/sagres?dia=2026-02-02&mes=2026-02");
    const vazio = await principal(page);
    conferir("SAGRES — dia sem movimento é DITO, não escondido", vazio, [
      "não há movimento registrado",
      "2026-02-02",
    ]);

    // ── A RECUSA NO SERVIDOR ──────────────────────────────────────────────────────
    //
    // ⚠️ E ELA AFIRMA O MOTIVO, não só que "não abriu". "Não completou" é compatível com o
    // servidor tendo entregado o demonstrativo a quem não podia vê-lo e a tela só não ter
    // renderizado. O `barrado` confere redirecionamento para `/sem-acesso` ou `/login`, ou a
    // recusa no corpo — é o servidor respondendo, não o menu escondendo o botão.
    await sair(n, page);
    await entrar(n, page, RESTRITO, SENHA_RESTRITO);
    console.log(`[percurso] agora como ${RESTRITO} (sem CONSULTAR_RELATORIOS e sem CONSULTAR_DESPESA)`);

    for (const rota of [
      "/relatorios/demonstracoes/balanco-orcamentario",
      "/relatorios/demonstracoes/balanco-financeiro",
      "/relatorios/demonstracoes/balanco-patrimonial",
      "/relatorios/demonstracoes/variacoes-patrimoniais",
      "/despesa/restos-a-pagar",
      "/integracoes/sagres",
    ]) {
      const r = await barrado(n, page, rota);
      passos += 1;
      if (r.barrado) {
        console.log(`  OK   recusa no servidor: ${rota} -> ${r.url.replace(BASE, "")} (${r.status})`);
      } else {
        falhas.push(`${rota} NÃO recusou quem não tem a ação (foi para ${r.url}, status ${r.status})`);
        console.log(`  FALHA ${rota} abriu para quem não tem a ação`);
      }
    }

    console.log(`\n[percurso] ${passos} asserções, ${falhas.length} falha(s).`);
    if (falhas.length > 0) {
      console.error("\nFALHAS:");
      for (const f of falhas) console.error(`  · ${f}`);
      process.exitCode = 1;
    }
  } finally {
    await page.close().catch(() => undefined);
    await navegador.close().catch(() => undefined);
  }
}

await main();
