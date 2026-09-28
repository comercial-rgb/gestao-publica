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
 * V18/C13 — A ALTERAÇÃO DO PPA E DA LDO, PELA TELA.
 *
 * ═══ O QUE SÓ A TELA ALCANÇA, E O QUE ESTE PERCURSO NÃO REPETE ═══
 * A aritmética do vigente, os cinco predicados reimpostos, o corte por data e os dois leitores da
 * meta fiscal estão provados em `modules/m02b-plurianual/m02b-alteracao.test.ts` (38 testes, com
 * três mutações). Repetir a conta aqui seria segunda conta sobre o mesmo dinheiro.
 *
 * O que só a tela responde, e é o que este arquivo mede:
 *
 *   1. **QUE O CAMINHO INTEIRO EXISTE PARA UM SERVIDOR.** Registrar a lei que altera a peça, com
 *      autorização de verdade, e ver o comparativo mudar — sem tocar em banco por fora.
 *   2. **QUE O APROVADO CONTINUA NA TELA.** A coluna do valor aprovado tem de seguir exibindo o
 *      número da lei original depois de dois atos: é essa coluna que prova "original preservado".
 *   3. **A FIXTURE N=2 NA SUPERFÍCIE.** Duas linhas alteradas pelo MESMO ato, e o total por
 *      grandeza somando as duas — com uma linha só, qualquer leitura acertaria o total.
 *   4. **QUE A RECUSA CHEGA AO OPERADOR COM A REGRA EM PORTUGUÊS.** O ato que faria a receita
 *      primária ultrapassar a total é recusado NA TELA, e a mensagem diz a regra — não um código.
 *      É a recusa que o banco não daria, porque o ajuste não toca a linha vigiada.
 *   5. **O CORTE POR DATA, QUE É A VERSÃO DA PEÇA.** Com a data anterior ao ato, a tela mostra a
 *      peça como ela estava; sem corte, como está.
 *   6. **QUE O ANEXO DE METAS FISCAIS CONTINUA SAINDO** depois de a meta ser alterada — o leitor
 *      que passou a somar os ajustes é o mesmo que gera o PDF.
 *
 * ⚠️ NÃO LIMPA O BANCO. Os números de ato levam o sufixo do instante.
 *
 * ⚠️ PRÉ-REQUISITO: `scripts/preparar-alteracoes-do-planejamento-de-percursos.ts` no MESMO banco.
 *
 * Uso:  npx tsx scripts/smoke-alteracoes-do-planejamento.ts http://localhost:3010
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SUF = String(Date.now()).slice(-4);
const ANO = new Date().getFullYear();
const n: Navegador = { base: BASE };

const ROTA = "/planejamento/alteracoes";

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

/**
 * UMA LINHA DO COMPARATIVO, LIDA PELOS MARCADORES.
 *
 * ⚠️ POR MARCADOR, NÃO POR TÍTULO — a lição da V17: o ajudante que procurava o bloco pelo texto
 * acabava casando com a palavra do MENU e o passo ficava verde sem ter olhado o número.
 *
 * ⚠️ E NADA DE `const` COM ARROW FUNCTION DENTRO DO `evaluate`: o `tsx` embrulha função nomeada
 * num helper `__name` que não existe no navegador. Tudo inline.
 */
async function linha(
  page: Page,
  chaveParcial: string
): Promise<{ readonly aprovado: string; readonly ajuste: string; readonly vigente: string } | null> {
  return page.evaluate((parcial) => {
    const tr = Array.from(document.querySelectorAll("[data-linha]")).find((x) =>
      (x.getAttribute("data-linha") ?? "").includes(parcial)
    );
    if (tr === undefined) return null;
    const chave = tr.getAttribute("data-linha") ?? "";
    const ap = document.querySelector(`[data-original="${chave}"]`);
    const aj = document.querySelector(`[data-ajuste="${chave}"]`);
    const vi = document.querySelector(`[data-vigente="${chave}"]`);
    return {
      aprovado: ap === null ? "" : (ap.textContent ?? "").replace(/\s+/g, " ").trim(),
      ajuste: aj === null ? "" : (aj.textContent ?? "").replace(/\s+/g, " ").trim(),
      vigente: vi === null ? "" : (vi.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  }, chaveParcial);
}

/** O total de uma grandeza, pelo marcador. */
async function total(
  page: Page,
  grandeza: string
): Promise<{ readonly ajuste: string; readonly vigente: string } | null> {
  return page.evaluate((g) => {
    const tr = document.querySelector(`[data-total="${g}"]`);
    if (tr === null) return null;
    const aj = document.querySelector(`[data-total-ajuste="${g}"]`);
    const vi = document.querySelector(`[data-total-vigente="${g}"]`);
    return {
      ajuste: aj === null ? "" : (aj.textContent ?? "").replace(/\s+/g, " ").trim(),
      vigente: vi === null ? "" : (vi.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  }, grandeza);
}

/** O valor de uma opção do select de linhas, achada pelo texto. */
async function opcaoDaLinha(page: Page, contendo: string, grandeza: string): Promise<string> {
  return page.evaluate(
    (texto, g) => {
      const op = Array.from(
        document.querySelectorAll('form[data-acao="registrar-ato-de-alteracao"] select[name="alvo"] option')
      ).find(
        (x) =>
          (x.textContent ?? "").includes(texto) &&
          (x.getAttribute("value") ?? "").endsWith(`::${g}`)
      );
      return op === undefined ? "" : (op.getAttribute("value") ?? "");
    },
    contendo,
    grandeza
  );
}

async function texto(page: Page): Promise<string> {
  return page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " ").trim());
}

/** O valor da opção da peça no seletor, pelo texto do rótulo. */
async function opcaoDaPeca(page: Page, contendo: string): Promise<string> {
  return page.evaluate((t) => {
    const op = Array.from(document.querySelectorAll('[data-seletor="peca"] option')).find((x) =>
      (x.textContent ?? "").includes(t)
    );
    return op === undefined ? "" : (op.getAttribute("value") ?? "");
  }, contendo);
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(n, page, ADMIN, SENHA_ADMIN);
    ok("0.1 login do administrador");

    // ══ 1. AS ATUALIZAÇÕES DE PERMISSÃO PENDENTES, PELA TELA ══
    // ⚠️ EM LAÇO (lição da V16): o painel mostra um formulário por atualização pendente e o
    // ajudante clica no PRIMEIRO. Sem o laço, a fila sobra e o sintoma aparece três passos
    // depois como acesso negado, longe da causa. A ação desta unidade nasce na v34.
    await irPara(n, page, "/administracao/perfis");
    for (let i = 0; i < 12; i += 1) {
      const pendente = await page.evaluate(
        () => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null
      );
      if (!pendente) break;
      await preencherEEnviar(page, "aplicar-atualizacao", []);
      await irPara(n, page, "/administracao/perfis");
    }
    const aindaPendente = await page.evaluate(
      () => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null
    );
    conferir(
      "1.1 a fila de atualizações de permissões está esgotada, lida da PERSISTÊNCIA",
      !aindaPendente,
      "sobrou atualização pendente no painel depois de doze voltas"
    );

    // ══ 2. A PEÇA APROVADA, SEM ALTERAÇÃO NENHUMA ══
    const inicial = await irPara(n, page, ROTA);
    conferir(
      "2.1 a tela das alterações abre e se apresenta",
      /Altera[çc][õo]es do planejamento/i.test(inicial),
      inicial.slice(0, 200)
    );
    conferir(
      "2.2 sem ato registrado, a tela DIZ que o vigente é igual ao aprovado",
      /Pe[çc]a sem altera[çc][õo]es/i.test(inicial) &&
        /vigente é igual ao aprovado/i.test(inicial),
      inicial.slice(0, 500)
    );
    const semLinhas = await page.evaluate(
      () => document.querySelectorAll("[data-linha]").length
    );
    conferir(
      "2.3 nenhuma linha de comparativo é exibida antes de existir ato",
      semLinhas === 0,
      `linhas encontradas: ${String(semLinhas)}`
    );

    // ══ 3. O PRIMEIRO ATO: A LEI QUE ACRESCE 250.000,00 À PREVISÃO DE 2026 ══
    const alvoA = await opcaoDaLinha(page, String(ANO), "valor");
    if (alvoA === "") {
      naoExecutado(
        "3.x o ato do PPA",
        "o select não ofereceu a previsão de receita do exercício corrente — a fixture rodou neste banco?"
      );
    } else {
      const r1 = await preencherEEnviar(page, "registrar-ato-de-alteracao", [
        { sel: 'input[name="numero"]', valor: `${SUF}-A` },
        { sel: 'input[name="ano"]', valor: String(ANO) },
        { sel: 'input[name="data"]', valor: `${String(ANO)}-06-10`, tipo: "data" },
        { sel: 'input[name="dataPublicacao"]', valor: `${String(ANO)}-06-12`, tipo: "data" },
        { sel: 'select[name="alvo"]', valor: alvoA, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "250.000,00" },
        { sel: 'input[name="fundamento"]', valor: `Lei que revisa o plano ${SUF}` },
        { sel: 'input[name="justificativa"]', valor: "reestimativa da arrecadacao do exercicio" },
      ]);
      conferir("3.1 o ato é registrado pela tela", r1.tipo === "ok", r1.texto.slice(0, 300));

      await irPara(n, page, ROTA);
      const l1 = await linha(page, "PREVISAO_RECEITA_PPA");
      nota(`linha da previsão depois do 1º ato: ${JSON.stringify(l1)}`);
      conferir(
        "3.2 o comparativo mostra APROVADO 1.000.000,00, ajuste 250.000,00 e vigente 1.250.000,00",
        l1 !== null &&
          l1.aprovado === "1.000.000,00" &&
          l1.ajuste === "250.000,00" &&
          l1.vigente === "1.250.000,00",
        JSON.stringify(l1)
      );
      conferir(
        "3.3 o ato aparece na lista cronológica com uma linha",
        await page.evaluate(
          (num) =>
            document.querySelector(`[data-itens-do-ato="${num}/${String(new Date().getFullYear())}"]`)
              ?.textContent?.trim() === "1",
          `${SUF}-A`
        ),
        "a coluna de linhas do ato não disse 1"
      );

      // ══ 4. O SEGUNDO VALOR NO MESMO ATO (N=2) ══
      const alvoB = await opcaoDaLinha(page, String(ANO + 1), "valor");
      const r2 = await preencherEEnviar(page, "acrescentar-valor-ao-ato", [
        { sel: 'select[name="atoId"]', valor: "", tipo: "select", indice: 0 },
        { sel: 'select[name="alvo"]', valor: alvoB, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "-100.000,00" },
      ]);
      if (r2.tipo !== "ok") {
        // O select do ato precisa do id; sem ele, o envio volta com o motivo — e é o motivo que
        // interessa registrar, não um passo verde por acaso.
        const idDoAto = await page.evaluate(
          () =>
            (
              document.querySelector(
                'form[data-acao="acrescentar-valor-ao-ato"] select[name="atoId"] option:nth-child(2)'
              ) as HTMLOptionElement | null
            )?.value ?? ""
        );
        const r2b = await preencherEEnviar(page, "acrescentar-valor-ao-ato", [
          { sel: 'select[name="atoId"]', valor: idDoAto, tipo: "select" },
          { sel: 'select[name="alvo"]', valor: alvoB, tipo: "select" },
          { sel: 'input[data-mascara="valor"]', valor: "-100.000,00" },
        ]);
        conferir(
          "4.1 o segundo valor entra no MESMO ato (a mesma lei, duas linhas)",
          r2b.tipo === "ok",
          r2b.texto.slice(0, 300)
        );
      } else {
        ok("4.1 o segundo valor entra no MESMO ato (a mesma lei, duas linhas)");
      }

      await irPara(n, page, ROTA);
      const quantas = await page.evaluate(
        () => document.querySelectorAll("[data-linha]").length
      );
      conferir(
        "4.2 o comparativo tem DUAS linhas alteradas (fixture N=2 na tela)",
        quantas === 2,
        `linhas: ${String(quantas)}`
      );
      const t = await total(page, "valor");
      nota(`total da previsão de receita: ${JSON.stringify(t)}`);
      conferir(
        "4.3 o total da grandeza soma as duas linhas: ajuste 150.000,00 e vigente 1.550.000,00",
        t !== null && t.ajuste === "150.000,00" && t.vigente === "1.550.000,00",
        JSON.stringify(t)
      );
      conferir(
        "4.4 a tela DIZ que não há total em dinheiro por ato, e por quê",
        /Não há total em dinheiro por ato/i.test(await texto(page)),
        "a explicação da ausência de total por ato não está na tela"
      );

      // ══ 5. A RECUSA DO PPA: REDUZIR MAIS DO QUE EXISTE ══
      const r3 = await preencherEEnviar(page, "registrar-ato-de-alteracao", [
        { sel: 'input[name="numero"]', valor: `${SUF}-X` },
        { sel: 'input[name="ano"]', valor: String(ANO) },
        { sel: 'input[name="data"]', valor: `${String(ANO)}-07-01`, tipo: "data" },
        { sel: 'input[name="dataPublicacao"]', valor: `${String(ANO)}-07-02`, tipo: "data" },
        { sel: 'select[name="alvo"]', valor: alvoA, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "-5.000.000,00" },
        { sel: 'input[name="fundamento"]', valor: `Lei impossivel ${SUF}` },
      ]);
      conferir(
        "5.1 o ato que deixaria a previsão NEGATIVA é recusado na tela",
        r3.tipo === "erro",
        `${r3.tipo}: ${r3.texto.slice(0, 300)}`
      );
      conferir(
        "5.2 a recusa nomeia a linha e diz que nada foi gravado",
        /Previsão de receita ficaria/i.test(r3.texto) && /não foi gravado/i.test(r3.texto),
        r3.texto.slice(0, 400)
      );
      await irPara(n, page, ROTA);
      const depoisDaRecusa = await page.evaluate(
        () => document.querySelectorAll("[data-ato]").length
      );
      conferir(
        "5.3 a recusa não deixou ato nenhum no histórico",
        depoisDaRecusa === 1,
        `atos na lista: ${String(depoisDaRecusa)}`
      );

      // ══ 6. O CORTE POR DATA — A VERSÃO DA PEÇA ══
      const antes = await irPara(n, page, `${ROTA}?ate=${String(ANO)}-01-31`);
      conferir(
        "6.1 com o corte ANTES do ato, a tela mostra a peça como ela estava (sem alterações)",
        /Pe[çc]a sem altera[çc][õo]es/i.test(antes) && /situa[çc][ãa]o at[ée]/i.test(antes),
        antes.slice(0, 400)
      );
      const depois = await irPara(n, page, `${ROTA}?ate=${String(ANO)}-12-31`);
      conferir(
        "6.2 com o corte DEPOIS do ato, as duas linhas voltam",
        (await page.evaluate(() => document.querySelectorAll("[data-linha]").length)) === 2,
        depois.slice(0, 300)
      );
    }

    // ══ 7. A LDO: A RECUSA QUE O BANCO NÃO DARIA ══
    await irPara(n, page, ROTA);
    const pecaLdo = await opcaoDaPeca(page, `LDO ${String(ANO)}`);
    if (pecaLdo === "") {
      naoExecutado("7.x a LDO", "o seletor não ofereceu a LDO do exercício — a fixture rodou?");
    } else {
      await irPara(n, page, `${ROTA}?peca=${encodeURIComponent(pecaLdo)}`);
      const alvoPrimaria = await opcaoDaLinha(page, "metas fiscais", "receitaPrimaria");
      const alvoTotal = await opcaoDaLinha(page, "metas fiscais", "receitaTotal");
      conferir(
        "7.1 a LDO oferece as metas fiscais como linha alterável",
        alvoPrimaria !== "" && alvoTotal !== "",
        `primária: "${alvoPrimaria}" · total: "${alvoTotal}"`
      );

      // ⚠️ A PRIMÁRIA JÁ É IGUAL À TOTAL na fixture: subir só a primária a faria exceder. É a
      // recusa que o CHECK do banco NÃO daria, porque o ajuste não toca a linha vigiada.
      const r4 = await preencherEEnviar(page, "registrar-ato-de-alteracao", [
        { sel: 'input[name="numero"]', valor: `${SUF}-L1` },
        { sel: 'input[name="ano"]', valor: String(ANO) },
        { sel: 'input[name="data"]', valor: `${String(ANO)}-08-01`, tipo: "data" },
        { sel: 'input[name="dataPublicacao"]', valor: `${String(ANO)}-08-02`, tipo: "data" },
        { sel: 'select[name="alvo"]', valor: alvoPrimaria, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "500.000,00" },
        { sel: 'input[name="fundamento"]', valor: `Lei que altera so a primaria ${SUF}` },
      ]);
      conferir(
        "7.2 subir SÓ a receita primária é recusado — a regra que o delta ao lado da linha desligaria",
        r4.tipo === "erro",
        `${r4.tipo}: ${r4.texto.slice(0, 300)}`
      );
      conferir(
        "7.3 a recusa diz a regra em português, com o nome das duas grandezas",
        /Receita primária/i.test(r4.texto) &&
          /Receita total/i.test(r4.texto) &&
          /não pode exceder a total/i.test(r4.texto),
        r4.texto.slice(0, 400)
      );

      // ══ 8. A ALTERAÇÃO LEGÍTIMA DA META: A TOTAL SOBE, E ENTÃO A PRIMÁRIA CABE ══
      const r5 = await preencherEEnviar(page, "registrar-ato-de-alteracao", [
        { sel: 'input[name="numero"]', valor: `${SUF}-L2` },
        { sel: 'input[name="ano"]', valor: String(ANO) },
        { sel: 'input[name="data"]', valor: `${String(ANO)}-08-10`, tipo: "data" },
        { sel: 'input[name="dataPublicacao"]', valor: `${String(ANO)}-08-11`, tipo: "data" },
        { sel: 'select[name="alvo"]', valor: alvoTotal, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "500.000,00" },
        { sel: 'input[name="fundamento"]', valor: `Lei que revisa as metas fiscais ${SUF}` },
      ]);
      conferir("8.1 o ato que sobe a receita TOTAL é aceito", r5.tipo === "ok", r5.texto.slice(0, 300));

      await irPara(n, page, `${ROTA}?peca=${encodeURIComponent(pecaLdo)}`);
      const idDoAtoLdo = await page.evaluate(
        () =>
          (
            document.querySelector(
              'form[data-acao="acrescentar-valor-ao-ato"] select[name="atoId"] option:nth-child(2)'
            ) as HTMLOptionElement | null
          )?.value ?? ""
      );
      const r6 = await preencherEEnviar(page, "acrescentar-valor-ao-ato", [
        { sel: 'select[name="atoId"]', valor: idDoAtoLdo, tipo: "select" },
        { sel: 'select[name="alvo"]', valor: alvoPrimaria, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "500.000,00" },
      ]);
      conferir(
        "8.2 com a total já elevada, a MESMA primária que foi recusada passa a caber",
        r6.tipo === "ok",
        `${r6.tipo}: ${r6.texto.slice(0, 300)}`
      );

      await irPara(n, page, `${ROTA}?peca=${encodeURIComponent(pecaLdo)}`);
      const lPrim = await linha(page, "receitaPrimaria");
      nota(`linha da receita primária: ${JSON.stringify(lPrim)}`);
      conferir(
        "8.3 a meta fiscal mostra o APROVADO preservado (10.000.000,00) e o vigente 10.500.000,00",
        lPrim !== null &&
          lPrim.aprovado === "10.000.000,00" &&
          lPrim.vigente === "10.500.000,00",
        JSON.stringify(lPrim)
      );

      // ══ 9. O ANEXO DE METAS FISCAIS CONTINUA SAINDO ══
      // ⚠️ O LEITOR QUE PASSOU A SOMAR OS AJUSTES É O MESMO QUE GERA ESTE PDF. Se a troca tivesse
      // quebrado a montagem do anexo, o sintoma apareceria aqui — e em nenhum teste dirigido, que
      // testa os geradores como funções puras sobre DTO.
      const ldoId = pecaLdo.split("::")[1] ?? "";
      const pdf = await page.evaluate(async (id) => {
        const r = await fetch(`/planejamento/ldo/${id}/anexos/metas-anuais`, {
          credentials: "include",
        });
        return { status: r.status, tipo: r.headers.get("content-type") ?? "" };
      }, ldoId);
      nota(`anexo de metas anuais: ${JSON.stringify(pdf)}`);
      conferir(
        "9.1 o Anexo de Metas Fiscais em PDF continua sendo gerado depois da alteração",
        pdf.status === 200 && pdf.tipo.includes("pdf"),
        JSON.stringify(pdf)
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
