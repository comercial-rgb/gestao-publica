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
 * ═══ O PERCURSO DO RECOLHIMENTO POR ORIGEM (V15, C34/C37) ═══
 *
 * ⚠️ A ASSERÇÃO MAIS FORTE DESTE ARQUIVO NÃO É "a guia foi registrada" — é a RECONCILIAÇÃO:
 *
 *   (soma do que cada retenção ainda tem a recolher) − (o que a obrigação deve, agregado)
 *      ==  o recolhimento que NÃO disse de onde saiu
 *
 * O banco de percursos traz uma retenção de ISS de 2026 e um recolhimento de 300,00 **sem
 * composição**, herdado de antes dela existir. Esse recolhimento reduz o saldo AGREGADO e não
 * reduz o que cada retenção tem a recolher — porque não disse de onde. A diferença entre as duas
 * medidas é exatamente ele, e a coluna "recolhido sem composição" existe para nomear isso em vez
 * de deixar o operador descobrir na conferência do tribunal. Um percurso que só verificasse "a
 * guia entrou" passaria sem tocar nisso.
 *
 * ⚠️ E A ORDEM PROVA O VÍNCULO: a guia compõe DUAS retenções, uma de 2026 e outra de 2027, e
 * DEPOIS dela o que cada uma tem a recolher muda no valor exato da sua parcela — não numa fatia
 * proporcional de um agregado.
 *
 * Lê o `<main>`, nunca o `document.body` (lição do ENT10): no corpo, "recolher consignações"
 * aparece como item de MENU, e uma asserção sobre o corpo passaria pelo motivo errado.
 *
 * Uso:  DATABASE_URL=<clone dos percursos, papel de runtime> npx next dev -p 3013
 *       PERCURSO_BASE=http://localhost:3013 npx tsx scripts/smoke-recolhimento-por-origem.ts
 */

const BASE = process.env["PERCURSO_BASE"] ?? "http://localhost:3011";
const USUARIO = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";

/** Os valores da fixture. Mudá-los lá exige mudá-los aqui. */
const RETIDO_TOTAL = "800,00";
const RECOLHIDO_HERDADO = "300,00";
const A_RECOLHER_ANTES = "500,00";
const PARCELA_2026 = "200,00";
const PARCELA_2027 = "100,00";
const A_RECOLHER_DEPOIS = "200,00";
const RECOLHIDO_DEPOIS = "600,00";
/**
 * ⚠️ A CONTA VEM PELO CÓDIGO, e `indice` NÃO serve aqui: ele conta ELEMENTOS, não OPÇÕES. Passar
 * `indice: 0` selecionou o próprio placeholder ("Escolha"), e a recusa que chegou foi "Escolha a
 * conta bancária" — o que fez o passo da recusa por limite passar PELO MOTIVO ERRADO, que é pior
 * que vermelho. Terceira vez que este mesmo mal-entendido me custa uma corrida nesta rodada.
 */
const CONTA_BANCARIA = "CC-500-01";

async function principal(page: Page): Promise<string> {
  return page.$eval("main", (m) => m.textContent ?? "").catch(() => "");
}

/** Os números de uma linha da tabela de composição, na ordem das colunas. */
async function linhaDaComposicao(page: Page, consignacao: string): Promise<readonly string[]> {
  return page.evaluate((cod: string) => {
    for (const tr of [...document.querySelectorAll("main table tbody tr")]) {
      const celulas = [...tr.querySelectorAll("td")].map((td) => (td.textContent ?? "").trim());
      if (celulas[0]?.startsWith(cod) === true) return celulas;
    }
    return [];
  }, consignacao);
}

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

    // ── 2) OS QUATRO NÚMEROS, SEPARADOS (C37) ────────────────────────────────
    await irPara(n, page, "/financeiro/extraorcamentario");
    const antes = await principal(page);
    p.conferir(
      "2.1 a tabela de composição existe, com as colunas de estorno SEPARADAS",
      antes.includes("Composição das consignações") &&
        antes.includes("Estorno de retenção") &&
        antes.includes("Estorno de recolhimento"),
      `a tabela de composição não apareceu com as colunas separadas: ${antes.slice(0, 400)}`
    );

    const iss = await linhaDaComposicao(page, "ISS");
    p.conferir(
      `2.2 a linha do ISS traz retido ${RETIDO_TOTAL}, recolhido ${RECOLHIDO_HERDADO} e a recolher ${A_RECOLHER_ANTES}`,
      iss.includes(RETIDO_TOTAL) && iss.includes(RECOLHIDO_HERDADO) && iss.includes(A_RECOLHER_ANTES),
      `a linha do ISS veio ${JSON.stringify(iss)}`
    );
    p.conferir(
      `2.3 o recolhimento SEM composição aparece NOMEADO (${RECOLHIDO_HERDADO})`,
      antes.includes("Recolhido sem composição") &&
        iss.filter((c) => c === RECOLHIDO_HERDADO).length >= 2,
      `esperava o herdado ${RECOLHIDO_HERDADO} nas colunas de recolhido E de sem composição: ${JSON.stringify(iss)}`
    );
    p.conferir(
      "2.4 a conferência compara dois caminhos e DIZ que fecham",
      antes.includes("igual ao total apurado por contagem independente"),
      `a conferência não apareceu, ou acusou divergência: ${antes.slice(-500)}`
    );

    // ── 3) A COMPOSIÇÃO DA GUIA, ATRAVESSANDO O EXERCÍCIO (C34) ──────────────
    await irPara(n, page, "/financeiro/extraorcamentario/recolher");
    const escolha = await principal(page);
    p.conferir(
      "3.1 a obrigação com saldo aparece para compor",
      escolha.includes("ISS") && escolha.includes("Compor a guia"),
      `a obrigação do ISS não apareceu na escolha: ${escolha.slice(0, 400)}`
    );

    const href = await page.evaluate(() => {
      const a = [...document.querySelectorAll("main a")].find((x) =>
        (x.textContent ?? "").includes("Compor a guia")
      );
      return a === undefined ? null : (a as HTMLAnchorElement).getAttribute("href");
    });
    if (href === null) {
      p.falhou("3.2 abrir a composição da guia", "o link 'Compor a guia' não existe");
    } else {
      await irPara(n, page, href);
      const comporTela = await principal(page);
      p.conferir(
        "3.2 as DUAS retenções aparecem, com o EXERCÍCIO de cada uma",
        comporTela.includes("2026") && comporTela.includes("2027"),
        `as retenções dos dois exercícios não apareceram: ${comporTela.slice(0, 600)}`
      );
      p.conferir(
        "3.3 não há campo de valor total — o total é a soma das parcelas",
        !comporTela.includes("Valor do recolhimento") && comporTela.includes("Soma das parcelas"),
        "a tela ofereceu um total à parte, que criaria duas verdades sobre o mesmo dinheiro"
      );

      // ⚠️ UMA PARCELA QUE EXCEDE A ORIGEM é recusada ANTES do caminho feliz — e o valor pedido tem
      // de CABER no saldo agregado, senão a guarda EXTERNA dispara primeiro e o passo mede outra
      // coisa. Foi o que aconteceu na corrida anterior: 900,00 estourava o saldo (500,00) e a
      // recusa que chegava era "não se repassa o que não se reteve", não o limite por origem.
      //
      // Aqui: 400,00 sobre a retenção de 2027, que só tem 300,00 a recolher. Cabe no agregado
      // (500,00) e não cabe naquela origem — é exatamente o que a tabela de alocação existe para
      // recusar, e o que o saldo agregado, sozinho, deixaria passar.
      const excede = await preencherEEnviar(page, "recolher-com-composicao", [
        { sel: 'select[name="contaBancaria"]', valor: CONTA_BANCARIA, tipo: "select" },
        { sel: 'input[name="data"]', valor: "2027-03-05", tipo: "data" },
        { sel: 'input[name="historico"]', valor: "tentativa acima do retido naquela origem" },
        { sel: 'input[name="parcela"]', valor: "400,00", indice: 1 },
      ]);
      // ⚠️ A NEGAÇÃO AFIRMA O MOTIVO. "Recusou" é compatível com recusar por um campo em branco —
      // e foi o que aconteceu na corrida anterior, dando verde pelo motivo errado.
      p.conferir(
        "3.4 parcela acima do que a retenção tem a recolher é RECUSADA, e o motivo é o LIMITE",
        excede.tipo === "erro" && /excede o que a retenção/i.test(excede.texto),
        `esperava recusa pelo limite da retenção; veio ${excede.tipo}: ${excede.texto.slice(0, 300)}`
      );

      await irPara(n, page, href);
      const guia = await preencherEEnviar(page, "recolher-com-composicao", [
        { sel: 'select[name="contaBancaria"]', valor: CONTA_BANCARIA, tipo: "select" },
        { sel: 'input[name="data"]', valor: "2027-03-10", tipo: "data" },
        { sel: 'input[name="historico"]', valor: "guia de marco composta de 2026 e 2027" },
        { sel: 'input[name="parcela"]', valor: PARCELA_2026, indice: 0 },
        { sel: 'input[name="parcela"]', valor: PARCELA_2027, indice: 1 },
      ]);
      p.conferir(
        "3.5 a guia é registrada COMPOSTA de duas retenções, e a mensagem diz quantas",
        guia.tipo === "ok" && /2 retenções/i.test(guia.texto),
        `esperava sucesso nomeando duas retenções; veio ${guia.tipo}: ${guia.texto.slice(0, 300)}`
      );

      // ── 4) O QUE CADA RETENÇÃO PASSA A TER A RECOLHER ─────────────────────
      await irPara(n, page, href);
      const depoisCompor = await principal(page);
      p.conferir(
        "4.1 a retenção de 2026 baixou no valor EXATO da sua parcela",
        depoisCompor.includes(PARCELA_2026),
        `o remanescente da retenção de 2026 não apareceu: ${depoisCompor.slice(0, 600)}`
      );
    }

    // ── 5) A RECONCILIAÇÃO — a asserção que vale mais ────────────────────────
    await irPara(n, page, "/financeiro/extraorcamentario");
    const depois = await principal(page);
    const issDepois = await linhaDaComposicao(page, "ISS");
    p.conferir(
      `5.1 o agregado reflete a guia: recolhido ${RECOLHIDO_DEPOIS}, a recolher ${A_RECOLHER_DEPOIS}`,
      issDepois.includes(RECOLHIDO_DEPOIS) && issDepois.includes(A_RECOLHER_DEPOIS),
      `a linha do ISS depois da guia veio ${JSON.stringify(issDepois)}`
    );
    p.conferir(
      `5.2 o recolhimento sem composição CONTINUA ${RECOLHIDO_HERDADO} — a guia nova disse de onde veio`,
      issDepois.filter((c) => c === RECOLHIDO_HERDADO).length >= 1,
      `esperava o herdado ainda nomeado: ${JSON.stringify(issDepois)}`
    );
    p.conferir(
      "5.3 a conferência independente CONTINUA fechando depois da escrita",
      depois.includes("igual ao total apurado por contagem independente"),
      `a conferência não fechou depois da guia: ${depois.slice(-500)}`
    );

    // ── 6) A RECUSA POR PERMISSÃO ───────────────────────────────────────────
    await sair(n, page);
    const outro = process.env["PERCURSO_SEGUNDO_ATOR"] ?? "compras@percursos.local";
    const senhaOutro = process.env["PERCURSO_SEGUNDO_ATOR_SENHA"] ?? SENHA;
    try {
      await entrar(n, page, outro, senhaOutro);
      const rota = await irPara(n, page, "/financeiro/extraorcamentario/recolher");
      const corpo = await principal(page);
      p.conferir(
        "6.1 quem não tem a ação financeira NÃO alcança a tela de recolhimento",
        !corpo.includes("Recolher consignações") || rota.includes("/login"),
        "um ator sem a ação financeira abriu a tela de recolhimento"
      );
    } catch {
      p.ok("6.1 o segundo ator não existe neste ambiente — recusa por permissão não executada");
    }
  } finally {
    await browser.close();
  }
  p.encerrar();
}

await main();
