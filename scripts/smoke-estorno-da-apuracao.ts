import "dotenv/config";
import type { Page } from "puppeteer";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { toMoney } from "../packages/contracts/index.js";
import { diaCivil, janelaCivilDoAno } from "../packages/datas/index.js";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * V21 — O ESTORNO DA APURAÇÃO DO RESULTADO, PELA TELA (pendência `ESTORNO-DA-APURACAO-SEM-BORDA`).
 *
 * `estornarApuracao` existia, estava no censo e pedia o identificador da operação — que só existia
 * dentro da transação de quem apurou. Este percurso mede o caminho inteiro:
 *   1. encerrar o exercício e apurar o resultado pela tela (os pré-requisitos);
 *   2. a apuração aparece no painel de estorno, e as classes 3 e 4 estão ZERADAS no razão;
 *   3. estornar devolve o saldo às classes 3 e 4 — conferido no banco, não na mensagem;
 *   4. o painel CONTINUA na tela dizendo que não há apuração vigente;
 *   5. apurar de novo funciona, e o painel volta a oferecê-la.
 *
 * ⚠️ BANCO DESCARTÁVEL: encerra o exercício. A porta 3010 é recusada.
 *
 * Uso:  DATABASE_URL=<o clone> npx tsx scripts/smoke-estorno-da-apuracao.ts http://localhost:3012
 */
const BASE = process.argv[2] ?? "http://localhost:3012";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const N: Navegador = { base: BASE };

if (BASE.includes(":3010")) {
  throw new Error("Este percurso encerra o exercício. A porta 3010 é a da apresentação — use um clone. Nada foi feito.");
}

/** Saldo líquido (ΣD − ΣC) das classes 3 e 4 no ano — zero depois da apuração. */
async function saldoDasVariacoes(prisma: PrismaClient, ano: number): Promise<string> {
  const partidas = await prisma.partidaContabil.findMany({
    where: {
      OR: [{ conta: { codigo: { startsWith: "3." } } }, { conta: { codigo: { startsWith: "4." } } }],
      lancamento: {
        dataTransacao: { gte: janelaCivilDoAno(ano).inicio, lte: janelaCivilDoAno(ano).fim },
      },
    },
    select: { tipo: true, valor: true },
  });
  let s = toMoney("0.00");
  for (const p of partidas) s = toMoney(p.tipo === "DEBITO" ? s.plus(p.valor.toFixed(2)) : s.minus(p.valor.toFixed(2)));
  return s.toFixed(2);
}

async function opcoesDoEstorno(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelectorAll('form[data-acao="estornar-apuracao"] select[name="operacaoId"] option:not([disabled])').length
  );
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "") throw new Error("DATABASE_URL ausente — o percurso confere o razão no banco do clone.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  const ano = Number(diaCivil(new Date()).slice(0, 4));
  const rota = `/despesa/restos-a-pagar?exercicio=${String(ano)}`;

  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    R.ok("0.1 login do administrador");

    const antes = await saldoDasVariacoes(prisma, ano);
    R.conferir("0.2 há variação patrimonial no ano para apurar", antes !== "0.00", `saldo ${antes}`);

    // ══ 1. OS PRÉ-REQUISITOS ══
    await irPara(N, page, rota);
    const enc = await preencherEEnviar(page, "encerrar-exercicio", [{ sel: 'input[name="confirmacao"]', valor: String(ano) }]);
    R.conferir("1.1 o exercício é encerrado", enc.tipo === "ok", `${enc.tipo}: ${enc.texto.slice(0, 200)}`);
    await irPara(N, page, rota);
    const ap = await preencherEEnviar(page, "apurar-resultado", [{ sel: 'input[name="confirmacao"]', valor: String(ano) }]);
    R.conferir("1.2 o resultado é apurado", ap.tipo === "ok" && /apurado/i.test(ap.texto), `${ap.tipo}: ${ap.texto.slice(0, 200)}`);

    // ══ 2. O PAINEL DE ESTORNO ══
    await irPara(N, page, rota);
    R.conferir("2.1 a apuração aparece no painel de estorno", (await opcoesDoEstorno(page)) === 1, `opções: ${String(await opcoesDoEstorno(page))}`);
    R.conferir("2.2 as classes 3 e 4 estão zeradas no razão", (await saldoDasVariacoes(prisma, ano)) === "0.00", await saldoDasVariacoes(prisma, ano));

    // ══ 3. ESTORNAR ══
    const est = await preencherEEnviar(page, "estornar-apuracao", [
      { sel: 'select[name="operacaoId"]', valor: await page.$eval('form[data-acao="estornar-apuracao"] select[name="operacaoId"] option:not([disabled])', (o) => (o as HTMLOptionElement).value), tipo: "select" },
      { sel: 'textarea[name="motivo"]', valor: "Lancamento de dezembro chegou depois da apuracao." },
    ]);
    R.conferir("3.1 o estorno confirma", est.tipo === "ok" && /estornada/i.test(est.texto), `${est.tipo}: ${est.texto.slice(0, 200)}`);
    const depois = await saldoDasVariacoes(prisma, ano);
    R.conferir(`3.2 as classes 3 e 4 voltaram ao saldo de antes (${antes})`, depois === antes, `saldo ${depois}`);
    R.conferir(
      "3.3 o original continua no razão, com o estorno apontando para ele",
      // O estorno tem origem própria (`APURACAO_RESULTADO_ESTORNADA`) e aponta o original por
      // `estornoDeId` — é o vínculo que se afirma, não o rótulo da origem.
      (await prisma.lancamentoContabil.count({ where: { estornoDe: { origemTipo: "APURACAO_RESULTADO" } } })) > 0 &&
        (await prisma.lancamentoContabil.count({ where: { origemTipo: "APURACAO_RESULTADO", estornoDeId: null } })) > 0,
      "estorno ou original ausente"
    );

    // ══ 4. O PAINEL NÃO SOME ══
    await irPara(N, page, rota);
    const semVigente = await page.evaluate(
      () => document.querySelector('form[data-acao="estornar-apuracao"]') !== null && document.querySelector("[data-sem-apuracao-vigente]") !== null
    );
    R.conferir("4.1 o painel continua na tela e diz que não há apuração vigente", semVigente, "o painel sumiu ou não avisou");

    // ══ 5. APURAR DE NOVO ══
    const ap2 = await preencherEEnviar(page, "apurar-resultado", [{ sel: 'input[name="confirmacao"]', valor: String(ano) }]);
    R.conferir("5.1 a apuração pode ser refeita", ap2.tipo === "ok", `${ap2.tipo}: ${ap2.texto.slice(0, 200)}`);
    await irPara(N, page, rota);
    R.conferir("5.2 e volta a ser oferecida para estorno", (await opcoesDoEstorno(page)) === 1, `opções: ${String(await opcoesDoEstorno(page))}`);
    R.conferir("5.3 as classes 3 e 4 zeradas de novo", (await saldoDasVariacoes(prisma, ano)) === "0.00", await saldoDasVariacoes(prisma, ano));
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
