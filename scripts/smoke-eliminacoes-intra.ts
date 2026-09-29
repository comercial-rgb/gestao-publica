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
 * V17/C07 — AS ELIMINAÇÕES INTRAGOVERNAMENTAIS, PELA TELA.
 *
 * ═══ O QUE SÓ A TELA ALCANÇA, E O QUE ESTE PERCURSO NÃO REPETE ═══
 * A regra de classificação (993 contas INTRA OFSS contra as 1.130 do dígito e as 296 do nome) está
 * provada em `modules/m01-core-contabil/m01-consolidacao.test.ts` e em
 * `test/pcasp-oficial.test.ts`; os três pares e a contraparte, em
 * `modules/m12-relatorios/m12-eliminacoes-intra.test.ts` (8 testes, N=2 nas duas pontas). Repetir
 * a aritmética aqui seria segunda conta sobre o mesmo dinheiro.
 *
 * O que só a tela responde, e é o que este arquivo mede:
 *
 *   1. **O ESTADO HONESTO DO VAZIO.** Antes de qualquer fato intra, os três pares dizem *sem dado*
 *      COM MOTIVO — nunca "elimina". Um demonstrativo que mostrasse verde num sistema sem operação
 *      entre unidades mandaria seguir em frente.
 *   2. **O PAR QUE NÃO FECHA, COM O NÚMERO.** Arrecadadas DUAS guias intra (60.000 + 40.000) e
 *      liquidada só parte da despesa intra, a tela mostra o RESÍDUO — e é esse número que o
 *      operador leva para a conferência.
 *   3. **O PAR QUE FECHA.** Liquidado o restante, o resíduo vai a zero e a situação vira *elimina*.
 *   4. **A CONTRAPARTE, IDENTIFICADA E NÃO IDENTIFICADA, NA MESMA TELA.** Dois credores: o CNPJ da
 *      entidade cadastrada e um estranho. A linha do estranho tem de DIZER que não identificou.
 *   5. **A LIGAÇÃO COM A CONSISTÊNCIA.** As três verificações novas aparecem no diagnóstico anual.
 *
 * ⚠️ ACHADO NOMEADO E NÃO CONSERTADO AQUI: o lado PATRIMONIAL (os pares das variações e dos saldos
 * recíprocos) NÃO é alcançável pela tela hoje, e a causa é do caminho de ESCRITA: a contrapartida
 * da liquidação sai de um mapa por ELEMENTO (`CONTRAPARTIDA_DA_LIQUIDACAO`, no M01) que não conhece
 * o nível de consolidação, e a arrecadação credita uma `CONTA_VPA` fixa na porta. Logo a despesa
 * intra liquida na VPD de CONSOLIDAÇÃO, e nenhuma partida chega às contas INTRA OFSS. Os dois pares
 * ficam corretamente em *sem dado* — e o percurso AFIRMA isso, para que a ausência fique medida.
 * Pendência **ROTEIRO-SEM-NIVEL-DE-CONSOLIDACAO**.
 *
 * ⚠️ NÃO LIMPA O BANCO. Os números de guia e de empenho levam o sufixo do instante.
 *
 * ⚠️ PRÉ-REQUISITO: `scripts/preparar-eliminacoes-intra-de-percursos.ts` no MESMO banco.
 *
 * Uso:  npx tsx scripts/smoke-eliminacoes-intra.ts http://localhost:3010
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SUF = String(Date.now()).slice(-6);
const ANO = new Date().getFullYear();
const n: Navegador = { base: BASE };

/** Os mesmos da fixture. O estranho existe para a contraparte NÃO identificada. */
const CNPJ_ENTIDADE = "11222333000181";
const CNPJ_ESTRANHO = "99888777000100";
const NATUREZA_A = "71130211";
const NATUREZA_B = "71130212";
const FICHA_INTRA = "9101";

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
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * O PAR, LIDO PELO MARCADOR — situação, os dois lados e o resíduo.
 *
 * ⚠️ POR MARCADOR, E A PRIMEIRA CORRIDA ENSINOU. A primeira versão achava o bloco pelo TÍTULO,
 * varrendo `div,section,article` — e pegava o container da página inteira. Resultado: "o par
 * fechou" casava com a palavra "Eliminações" do MENU, e o passo ficava verde sem nunca ter olhado
 * o par. O marcador `data-par` nasceu desta corrida.
 */
async function par(
  page: Page,
  chave: string
): Promise<{ readonly situacao: string; readonly esquerda: string; readonly direita: string; readonly residuo: string; readonly motivo: string } | null> {
  // ⚠️ SEM FUNÇÃO NOMEADA DENTRO DO `evaluate`, e a segunda corrida ensinou: o transpilador do
  // `tsx` injeta um helper `__name` em toda arrow function atribuída a `const`, e esse helper NÃO
  // existe no navegador — o passo morria com `__name is not defined`, que não tem nada a ver com a
  // tela. Tudo inline.
  return page.evaluate((c) => {
    const cabeca = document.querySelector(`[data-par="${c}"]`);
    if (cabeca === null) return null;
    const esq = document.querySelector(`[data-lado="${c}-esquerda"]`);
    const dir = document.querySelector(`[data-lado="${c}-direita"]`);
    const res = document.querySelector(`[data-lado="${c}-residuo"]`);
    const motivo = document.querySelector(`[data-motivo="${c}"]`);
    return {
      situacao: cabeca.getAttribute("data-situacao") ?? "",
      esquerda: esq === null ? "" : (esq.textContent ?? "").replace(/\s+/g, " ").trim(),
      direita: dir === null ? "" : (dir.textContent ?? "").replace(/\s+/g, " ").trim(),
      residuo: res === null ? "" : (res.textContent ?? "").replace(/\s+/g, " ").trim(),
      motivo: motivo === null ? "" : (motivo.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  }, chave);
}

/** A página inteira, normalizada — para as afirmações de presença/ausência de frase. */
async function texto(page: Page): Promise<string> {
  return page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " ").trim());
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
    // ⚠️ EM LAÇO, E A LIÇÃO É DA V16: o painel mostra um formulário por atualização pendente e o
    // ajudante clica no PRIMEIRO. Supor que a primeira pendente é a desta unidade fez o percurso
    // anterior aplicar a versão devida de OUTRA rodada — e o sintoma apareceu três passos depois,
    // como acesso negado, longe da causa. O laço esgota a fila.
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

    // ══ 2. O ESTADO INICIAL: SEM DADO, COM MOTIVO — NUNCA "ELIMINA" ══
    const url = `/relatorios/eliminacoes-intra?exercicio=${String(ANO)}&bimestre=6`;
    const inicial = await irPara(n, page, url);
    conferir(
      "2.1 a tela de eliminações abre e se apresenta",
      /Elimina[çc][õo]es intragovernamentais/i.test(inicial),
      inicial.slice(0, 200)
    );
    const paresIniciais = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-par]")).map((x) => x.getAttribute("data-situacao") ?? "")
    );
    nota(`situações no estado inicial: ${paresIniciais.join(", ") || "(nenhuma)"}`);
    conferir(
      "2.2 os três pares aparecem, e NENHUM diz 'elimina' antes de existir fato intra",
      paresIniciais.length === 3 && !paresIniciais.includes("ELIMINA"),
      `as situações lidas foram: ${paresIniciais.join(", ")}`
    );
    conferir(
      "2.3 o vazio vem COM MOTIVO escrito, não em silêncio",
      /nada a eliminar/i.test(inicial),
      inicial.slice(0, 400)
    );
    conferir(
      "2.4 a tela diz que operação com a União, o Estado ou outro município NÃO entra",
      /não entra aqui/i.test(inicial) || /n[ãa]o.*entra aqui/i.test(inicial),
      inicial.slice(0, 400)
    );

    // ══ 3. AS DUAS GUIAS DE RECEITA INTRA, PELA TELA (N=2) ══
    // ⚠️ DUAS, e de naturezas DIFERENTES: com uma só, o total do par fecharia por vacuidade.
    await irPara(n, page, `/receita/arrecadacoes?exercicio=${String(ANO)}`);
    const conta = await page.evaluate(() => {
      const s = document.querySelector('select[name="contaBancaria"]');
      const o = s === null ? null : Array.from(s.querySelectorAll("option")).find((x) => x.value !== "");
      return o === undefined || o === null ? null : o.value;
    });
    if (conta === null) throw new Error("nenhuma conta bancária oferecida no formulário da guia");
    nota(`conta do percurso: ${conta}`);

    for (const [i, [natureza, valor]] of (
      [
        [NATUREZA_A, "60.000,00"],
        [NATUREZA_B, "40.000,00"],
      ] as const
    ).entries()) {
      const r = await preencherEEnviar(page, "registrar-guia", [
        { sel: 'input[name="natureza"]', valor: natureza },
        { sel: 'input[name="fonte"]', valor: "500" },
        { sel: 'select[name="contaBancaria"]', valor: conta, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor },
        { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
        { sel: 'input[name="numeroReceita"]', valor: `GI${String(i + 1)}-${SUF}` },
      ]);
      conferir(
        `3.${String(i + 1)} guia de receita INTRA ${natureza} de ${valor} registrada pela tela`,
        r.tipo === "ok",
        r.texto.slice(0, 250)
      );
      await irPara(n, page, `/receita/arrecadacoes?exercicio=${String(ANO)}`);
    }

    // ══ 4. A DESPESA INTRA: DOIS CREDORES, UM DELES A ENTIDADE CADASTRADA ══
    await irPara(n, page, `/despesa/empenhos?exercicio=${String(ANO)}`);
    const opcaoDaFicha = await page.evaluate((num) => {
      const s = document.querySelector('select[name="fichaId"]');
      const o =
        s === null
          ? undefined
          : Array.from(s.querySelectorAll("option")).find((x) => (x.textContent ?? "").includes(num));
      return o === undefined ? null : o.value;
    }, FICHA_INTRA);
    if (opcaoDaFicha === null) {
      naoExecutado(
        "4 a despesa intra pela tela",
        `a ficha ${FICHA_INTRA} (modalidade 91) não é oferecida no formulário de empenho — rode a fixture neste banco`
      );
    } else {
      for (const [i, [credor, valor]] of (
        [
          [CNPJ_ENTIDADE, "100.000,00"],
          [CNPJ_ESTRANHO, "8.000,00"],
        ] as const
      ).entries()) {
        const r = await preencherEEnviar(page, "empenhar", [
          { sel: 'select[name="fichaId"]', valor: opcaoDaFicha, tipo: "select" },
          { sel: 'input[name="numero"]', valor: `NEI${String(i + 1)}-${SUF}` },
          { sel: '[data-mascara="cpf-cnpj"]', valor: credor },
          { sel: '[data-mascara="valor"]', valor },
          { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
          { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
          { sel: 'input[name="historico"]', valor: `aporte a unidade do proprio ente ${SUF}` },
        ]);
        conferir(
          `4.${String(i + 1)} empenho intra de ${valor} para ${credor} registrado pela tela`,
          r.tipo === "ok",
          r.texto.slice(0, 250)
        );
        await irPara(n, page, `/despesa/empenhos?exercicio=${String(ANO)}`);
      }

      // ── a liquidação PARCIAL: 60.000 dos 100.000 ──
      await irPara(n, page, `/despesa/liquidacoes?exercicio=${String(ANO)}`);
      const opcaoEmpenho = await page.evaluate((num) => {
        const s = document.querySelector('select[name="empenhoId"]');
        const o =
          s === null
            ? undefined
            : Array.from(s.querySelectorAll("option")).find((x) => (x.textContent ?? "").includes(num));
        return o === undefined ? null : o.value;
      }, `NEI1-${SUF}`);
      if (opcaoEmpenho === null) {
        naoExecutado("4.3 liquidar o empenho intra", "o empenho intra não aparece na lista da liquidação");
      } else {
        const r = await preencherEEnviar(page, "liquidar", [
          { sel: 'select[name="empenhoId"]', valor: opcaoEmpenho, tipo: "select" },
          { sel: 'input[name="numero"]', valor: `NLI1-${SUF}` },
          { sel: '[data-mascara="valor"]', valor: "60.000,00" },
          { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
          { sel: 'input[name="atesto"]', valor: "Fiscal do percurso" },
          // ⚠️ OBRIGATÓRIO, e a primeira corrida provou: sem ele o `required` do navegador segura o
          // envio EM SILÊNCIO — nenhum marcador de resultado aparece, e o percurso reporta texto
          // vazio, que manda procurar defeito na ação em vez de no formulário.
          { sel: 'input[name="historico"]', valor: `aporte a unidade do proprio ente ${SUF}` },
        ]);
        conferir("4.3 liquidação PARCIAL de 60.000,00 do empenho intra", r.tipo === "ok", r.texto.slice(0, 250));
      }
    }

    // ══ 5. O RESÍDUO NA TELA — O AJUSTE QUE FALTA EXPLICAR ══
    const comResiduo = await irPara(n, page, url);
    const orcamentario = await par(page, "INTRA_ORCAMENTARIO");
    nota(`par orçamentário: ${JSON.stringify(orcamentario)}`);
    conferir(
      "5.1 o par orçamentário mostra a receita intra ARRECADADA das duas guias (100.000,00)",
      orcamentario !== null && /100\.000,00/.test(orcamentario.esquerda),
      JSON.stringify(orcamentario)
    );
    conferir(
      "5.2 o par mostra a despesa intra LIQUIDADA (60.000,00) e o RESÍDUO de 40.000,00",
      orcamentario !== null &&
        /60\.000,00/.test(orcamentario.direita) &&
        /40\.000,00/.test(orcamentario.residuo) &&
        orcamentario.situacao === "RESIDUO",
      JSON.stringify(orcamentario)
    );
    conferir(
      "5.3 a tela EXPLICA o resíduo em vez de só mostrar o número",
      /ajuste que a consolidação ainda não explica/i.test(comResiduo),
      comResiduo.slice(0, 300)
    );

    // ══ 6. O LADO PATRIMONIAL: AUSÊNCIA MEDIDA, NÃO SUPOSTA ══
    // ⚠️ ISTO É UMA AFIRMAÇÃO DE AUSÊNCIA, e ela vale tanto quanto a de presença: o caminho de
    // ESCRITA não põe partida em conta INTRA OFSS (ver o cabeçalho), então os dois pares
    // patrimoniais TÊM de continuar em "sem dado" mesmo depois de a operação intra existir.
    const variacoes = await par(page, "INTRA_VARIACOES");
    const reciprocos = await par(page, "INTRA_RECIPROCO");
    conferir(
      "6.1 o par das variações segue SEM DADO COM MOTIVO — a liquidação intra não chega à VPD intra",
      variacoes !== null && variacoes.situacao === "SEM_DADO" && /nada a eliminar/i.test(variacoes.motivo),
      JSON.stringify(variacoes)
    );
    conferir(
      "6.2 o par dos saldos recíprocos segue SEM DADO, pelo mesmo motivo",
      reciprocos !== null && reciprocos.situacao === "SEM_DADO" && /nada a eliminar/i.test(reciprocos.motivo),
      JSON.stringify(reciprocos)
    );

    // ══ 7. A CONTRAPARTE: IDENTIFICADA E NÃO IDENTIFICADA, NA MESMA TELA ══
    const linhas = await page.evaluate(() =>
      Array.from(document.querySelectorAll("table tbody tr")).map((tr) =>
        (tr.textContent ?? "").replace(/\s+/g, " ").trim()
      )
    );
    const daEntidade = linhas.find((l) => l.includes("11.222.333/0001-81") || l.includes(CNPJ_ENTIDADE));
    const doEstranho = linhas.find((l) => l.includes("99.888.777/0001-66") || l.includes(CNPJ_ESTRANHO));
    nota(`linha da entidade: ${String(daEntidade)?.slice(0, 180)}`);
    nota(`linha do estranho: ${String(doEstranho)?.slice(0, 180)}`);
    conferir(
      "7.1 a contraparte do CNPJ cadastrado é NOMEADA pela entidade contábil",
      daEntidade !== undefined && /Fundo Previdenciario do Municipio/i.test(daEntidade),
      String(daEntidade)?.slice(0, 250)
    );
    conferir(
      "7.2 o credor que não é entidade cadastrada é dito NÃO IDENTIFICADO, nunca adivinhado",
      doEstranho !== undefined && /não identificada/i.test(doEstranho),
      String(doEstranho)?.slice(0, 250)
    );

    // ══ 8. A LIQUIDAÇÃO DO RESTO FECHA O PAR ══
    await irPara(n, page, `/despesa/liquidacoes?exercicio=${String(ANO)}`);
    const opcaoRestante = await page.evaluate((num) => {
      const s = document.querySelector('select[name="empenhoId"]');
      const o =
        s === null
          ? undefined
          : Array.from(s.querySelectorAll("option")).find((x) => (x.textContent ?? "").includes(num));
      return o === undefined ? null : o.value;
    }, `NEI1-${SUF}`);
    if (opcaoRestante === null) {
      naoExecutado("8 fechar o par", "o empenho intra não está mais na lista da liquidação");
    } else {
      const r = await preencherEEnviar(page, "liquidar", [
        { sel: 'select[name="empenhoId"]', valor: opcaoRestante, tipo: "select" },
        { sel: 'input[name="numero"]', valor: `NLI2-${SUF}` },
        { sel: '[data-mascara="valor"]', valor: "40.000,00" },
        { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
        { sel: 'input[name="atesto"]', valor: "Fiscal do percurso" },
        { sel: 'input[name="historico"]', valor: `restante do aporte ${SUF}` },
      ]);
      conferir("8.1 a segunda liquidação (40.000,00) é registrada", r.tipo === "ok", r.texto.slice(0, 250));

      await irPara(n, page, url);
      const fechado = await par(page, "INTRA_ORCAMENTARIO");
      nota(`par orçamentário depois: ${JSON.stringify(fechado)}`);
      conferir(
        "8.2 com os dois lados iguais, o par passa a ELIMINAR e o resíduo é 0,00",
        fechado !== null && fechado.situacao === "ELIMINA" && fechado.residuo === "0,00",
        JSON.stringify(fechado)
      );
      conferir(
        "8.3 a frase do resíduo DESAPARECE quando não há resíduo",
        !/ajuste que a consolidação ainda não explica/i.test(await texto(page)),
        "a explicação do resíduo continua na tela com o par fechado"
      );
    }

    // ══ 9. A CONSISTÊNCIA ANUAL ENXERGA AS TRÊS VERIFICAÇÕES ══
    const consistencia = await irPara(
      n,
      page,
      `/relatorios/consistencia?exercicio=${String(ANO)}&escopo=ANUAL`
    );
    conferir(
      "9.1 as três verificações de eliminação intragovernamental aparecem na consistência anual",
      (consistencia.match(/Eliminação intragovernamental/gi) ?? []).length >= 3,
      `ocorrências: ${String((consistencia.match(/Eliminação intragovernamental/gi) ?? []).length)}`
    );
    conferir(
      "9.2 a consistência aponta para a tela dona das eliminações",
      /Eliminações intragovernamentais/i.test(consistencia),
      consistencia.slice(0, 300)
    );
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
