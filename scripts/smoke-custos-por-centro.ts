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
 * V19/C05 — O CUSTO POR CENTRO, PELA TELA.
 *
 * ═══ O QUE SÓ A TELA RESPONDE ═══
 * O domínio já está provado por `modules/m12-relatorios/m12-custos-por-centro.test.ts`, que mede a
 * aritmética, o teto, a segregação e a ausência de lançamento no razão. O que nenhum teste de módulo
 * alcança é o CAMINHO — e é ele que decide se um servidor municipal chega ao resultado:
 *
 *   1. publicar uma versão do critério de rateio pela tela, com o ato que a aprovou;
 *   2. a recusa de um critério que NÃO SOMA 100 chega ao operador em português, e sem nada gravado;
 *   3. apropriar o custo de uma liquidação real, escolhida no rol curto do formulário;
 *   4. o acumulado por centro aparece na tela RECARREGADA — persistência, não a mensagem;
 *   5. a COMPOSIÇÃO abre pelo seletor e volta ao FATO: a liquidação e o empenho de onde a parte veio;
 *   6. a segunda apropriação sobre a MESMA liquidação é recusada por exceder a despesa.
 *
 * ⚠️ BANCO DESCARTÁVEL. Este percurso GRAVA critério e apropriação; num banco de apresentação, o
 * critério publicado por ele ficaria para sempre na lista de critérios da tela. O script recusa
 * rodar contra a porta 3010, que é a do ambiente de apresentação.
 *
 * ⚠️ E ELE DEPENDE DE DOIS SETORES E DE UMA LIQUIDAÇÃO — o que o preparador de percursos já semeia
 * (`cenario-ent02.ts` cria PROT, JUR e GAB; `poc-fila.ts` deixa uma despesa liquidada e não paga).
 * Faltando qualquer um dos dois, o percurso PARA nomeando o que falta, em vez de reprovar a tela.
 *
 * Uso:  npx tsx scripts/smoke-custos-por-centro.ts http://localhost:3011
 */
const BASE = process.argv[2] ?? "http://localhost:3011";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const ANO = new Date().getFullYear();
const n: Navegador = { base: BASE };

if (BASE.includes(":3010")) {
  throw new Error(
    "Este percurso GRAVA critério de rateio e apropriação de custo. A porta 3010 é a do ambiente " +
      "de apresentação — rode contra um clone descartável (3011). Nada foi feito."
  );
}

const CHAVE = `Rateio do percurso ${String(Date.now()).slice(-6)}`;
/**
 * ⚠️ `irPara` DEVOLVE O TEXTO DA PÁGINA EM MINÚSCULAS (`percursos-navegador.ts:52`), e a primeira
 * corrida deste percurso reprovou dois passos por causa disso: `texto.includes(CHAVE)` procurava
 * "Rateio do percurso 809557" numa string onde estava "rateio do percurso 809557". Era falso
 * vermelho — a tela mostrava o critério. Comparar em minúsculas é o que o helper pede; um
 * `.includes` de literal capitalizado contra ele nunca casa.
 */
const CHAVE_NA_TELA = CHAVE.toLowerCase();
const ROTA = "/contabilidade/custos";

const falhas: string[] = [];
const passos: string[] = [];

function ok(passo: string): void {
  passos.push(passo);
  console.log(`[ok] ${passo}`);
}
function conferir(passo: string, condicao: boolean, detalhe: string): void {
  if (condicao) ok(passo);
  else {
    falhas.push(`${passo} — ${detalhe}`);
    console.error(`[FALHA] ${passo} — ${detalhe}`);
  }
}
function nota(texto: string): void {
  console.log(`      [${texto}]`);
}

/** Os valores de um `select` do formulário, em ordem — o rol curto que a tela oferece. */
async function opcoes(page: Page, seletor: string): Promise<readonly { valor: string; rotulo: string }[]> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return [];
    return Array.from(s.options)
      .filter((o) => o.value !== "" && !o.disabled)
      .map((o) => ({ valor: o.value, rotulo: (o.textContent ?? "").trim() }));
  }, seletor);
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(n, page, ADMIN, SENHA_ADMIN);
    ok("0.1 login do administrador");

    // ⚠️ AS AÇÕES NOVAS CHEGAM PELA FILA DE ATUALIZAÇÕES, e não por bootstrap: num banco que já
    // existia antes da v35, o administrador não tem PARAMETRIZAR_RATEIO_DE_CUSTO até a fila rodar.
    // Esgotá-la aqui é o que a pessoa faz ao instalar a versão nova.
    await irPara(n, page, "/administracao/perfis");
    for (let i = 0; i < 12; i += 1) {
      const pendente = await page.evaluate(
        () => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null
      );
      if (!pendente) break;
      await preencherEEnviar(page, "aplicar-atualizacao", []);
      await irPara(n, page, "/administracao/perfis");
    }
    ok("0.2 fila de atualizações de permissões esgotada");

    // ══ 1. A TELA ABRE E DIZ O QUE A APROPRIAÇÃO NÃO FAZ ══
    const inicial = await irPara(n, page, `${ROTA}?exercicio=${String(ANO)}`);
    conferir(
      "1.1 a tela do custo por centro abre",
      /custo por centro/i.test(inicial),
      inicial.slice(0, 200)
    );
    conferir(
      "1.2 ⚠️ o recorte declarado é a COMPETÊNCIA do custo, não a data da liquidação",
      /compet[êe]ncia do custo/i.test(inicial) && /n[ãa]o pela data da liquida[çc][ãa]o/i.test(inicial),
      inicial.slice(0, 500)
    );

    const centros = await opcoes(
      page,
      'form[data-acao="publicar-criterio-de-rateio"] select[name="centroDoResiduoId"]'
    );
    nota(`centros de custo oferecidos: ${String(centros.length)}`);
    if (centros.length < 2) {
      throw new Error(
        `O percurso precisa de DOIS setores ativos para um rateio N=2, e a tela oferece ` +
          `${String(centros.length)}. Rode o preparador de percursos (cenario-ent02 cria PROT, JUR ` +
          `e GAB). Nada foi gravado.`
      );
    }
    const [c1, c2] = centros as [{ valor: string; rotulo: string }, { valor: string; rotulo: string }];

    // ══ 2. A RECUSA DO CRITÉRIO QUE NÃO SOMA 100 ══
    //
    // ⚠️ A RECUSA VEM ANTES DA PUBLICAÇÃO CERTA, de propósito: se ela viesse depois, um critério
    // válido já estaria gravado e o percurso não saberia dizer se o "nada gravado" é verdade.
    const rRuim = await preencherEEnviar(page, "publicar-criterio-de-rateio", [
      { sel: 'input[name="chave"]', valor: `${CHAVE} (recusado)` },
      { sel: 'input[name="atoRef"]', valor: "Portaria de percurso, sem efeito" },
      { sel: 'input[name="vigenteDesde"]', valor: `${String(ANO)}-01-01`, tipo: "data" },
      { sel: 'select[name="centroDoResiduoId"]', valor: c1.valor, tipo: "select" },
      { sel: 'select[name="centro-0"]', valor: c1.valor, tipo: "select" },
      { sel: 'input[name="percentual-0"]', valor: "60" },
      { sel: 'select[name="centro-1"]', valor: c2.valor, tipo: "select" },
      { sel: 'input[name="percentual-1"]', valor: "30" },
    ]);
    conferir(
      "2.1 ⚠️ critério que soma 90 é RECUSADO em português, dizendo o total encontrado",
      rRuim.tipo === "erro" && /soma dos percentuais/i.test(rRuim.texto) && /100/.test(rRuim.texto),
      `${rRuim.tipo}: ${rRuim.texto.slice(0, 250)}`
    );
    const depoisDaRecusa = await irPara(n, page, `${ROTA}?exercicio=${String(ANO)}`);
    conferir(
      "2.2 e NADA foi gravado: o critério recusado não aparece na lista",
      !depoisDaRecusa.includes(`${CHAVE_NA_TELA} (recusado)`),
      depoisDaRecusa.slice(0, 300)
    );

    // ══ 3. A PUBLICAÇÃO DO CRITÉRIO 60/40 ══
    const rCriterio = await preencherEEnviar(page, "publicar-criterio-de-rateio", [
      { sel: 'input[name="chave"]', valor: CHAVE },
      { sel: 'input[name="atoRef"]', valor: "Portaria 12/2026 da Secretaria de Financas" },
      { sel: 'input[name="vigenteDesde"]', valor: `${String(ANO)}-01-01`, tipo: "data" },
      { sel: 'select[name="centroDoResiduoId"]', valor: c1.valor, tipo: "select" },
      { sel: 'select[name="centro-0"]', valor: c1.valor, tipo: "select" },
      { sel: 'input[name="percentual-0"]', valor: "60" },
      { sel: 'select[name="centro-1"]', valor: c2.valor, tipo: "select" },
      { sel: 'input[name="percentual-1"]', valor: "40" },
    ]);
    nota(`critério: ${rCriterio.tipo} — ${rCriterio.texto.slice(0, 200)}`);
    conferir(
      "3.1 o critério é publicado na versão 1, com dois centros",
      rCriterio.tipo === "ok" && /vers[ãa]o 1/i.test(rCriterio.texto),
      `${rCriterio.tipo}: ${rCriterio.texto.slice(0, 250)}`
    );

    const comCriterio = await irPara(n, page, `${ROTA}?exercicio=${String(ANO)}`);
    conferir(
      "3.2 a tela recarregada mostra o critério como VIGENTE, com o ato que o aprovou",
      comCriterio.includes(CHAVE_NA_TELA) &&
        /vigente/i.test(comCriterio) &&
        /portaria 12\/2026/i.test(comCriterio),
      comCriterio.slice(0, 400)
    );
    conferir(
      "3.3 e a tela diz qual centro recebe o RESÍDUO em centavos",
      /recebe o res[íi]duo em centavos/i.test(comCriterio),
      comCriterio.slice(0, 400)
    );

    // ══ 4. A APROPRIAÇÃO DO CUSTO DE UMA LIQUIDAÇÃO REAL ══
    const liquidacoes = await opcoes(
      page,
      'form[data-acao="apropriar-custo"] select[name="liquidacaoId"]'
    );
    nota(`liquidações com custo a apropriar: ${String(liquidacoes.length)}`);
    if (liquidacoes.length === 0) {
      throw new Error(
        "Nenhuma liquidação com custo a apropriar no exercício. Rode o preparador de percursos " +
          "(poc-fila deixa uma despesa liquidada e não paga). Nada foi gravado."
      );
    }
    const liq = liquidacoes[0] as { valor: string; rotulo: string };
    nota(`liquidação escolhida: ${liq.rotulo}`);
    // ⚠️ O ROL É CURTO E JÁ TRAZ O DISPONÍVEL no rótulo — é isso que permite ao operador escolher
    // sem abrir outra tela, e é o que a regra de interface pede de um `select`.
    conferir(
      "4.1 o rol de liquidações traz o DISPONÍVEL no rótulo, e não só o número",
      /dispon[íi]vel/i.test(liq.rotulo),
      liq.rotulo
    );

    const rApropriar = await preencherEEnviar(page, "apropriar-custo", [
      { sel: 'select[name="liquidacaoId"]', valor: liq.valor, tipo: "select" },
      { sel: 'select[name="criterioChave"]', valor: CHAVE, tipo: "select" },
      { sel: 'input[name="competencia"]', valor: `${String(ANO)}-08`, tipo: "data" },
      { sel: 'textarea[name="motivo"]', valor: "Apropriacao do custo pelo percurso de navegador" },
    ]);
    nota(`apropriação: ${rApropriar.tipo} — ${rApropriar.texto.slice(0, 220)}`);
    conferir(
      "4.2 o custo é apropriado a DOIS centros de custo",
      rApropriar.tipo === "ok" && /2 centro/i.test(rApropriar.texto),
      `${rApropriar.tipo}: ${rApropriar.texto.slice(0, 250)}`
    );
    conferir(
      "4.3 ⚠️ e a mensagem DIZ que a despesa não foi lançada de novo — o ponto do desenho",
      /n[ãa]o foi lan[çc]ada de novo/i.test(rApropriar.texto),
      rApropriar.texto.slice(0, 250)
    );

    // ══ 5. O ACUMULADO, LIDO DA PERSISTÊNCIA ══
    const comCusto = await irPara(n, page, `${ROTA}?exercicio=${String(ANO)}`);
    const linhas = await page.evaluate(
      () => document.querySelectorAll("tr[data-centro]").length
    );
    nota(`centros com custo na tela: ${String(linhas)}`);
    conferir(
      "5.1 a tela recarregada mostra o acumulado dos DOIS centros — persistência, não a mensagem",
      linhas >= 2,
      `${String(linhas)} linha(s); ${comCusto.slice(0, 250)}`
    );
    const total = await page.evaluate(() => {
      const el = document.querySelector("[data-custo-total]");
      return el === null ? "" : (el.textContent ?? "").trim();
    });
    nota(`total apropriado na tela: ${total}`);
    conferir(
      "5.2 o total apropriado no período aparece somado",
      total !== "" && /\d/.test(total),
      `total lido: "${total}"`
    );

    // ══ 6. A COMPOSIÇÃO VOLTA AO FATO ══
    const centroNaTela = await page.evaluate(() => {
      const s = document.querySelector('[data-seletor="centro"]');
      if (!(s instanceof HTMLSelectElement)) return "";
      const o = Array.from(s.options).find((x) => x.value !== "");
      return o === undefined ? "" : o.value;
    });
    conferir(
      "6.1 o seletor da composição oferece os centros que receberam custo",
      centroNaTela !== "",
      "o seletor não trouxe centro nenhum"
    );
    const comComposicao = await irPara(
      n,
      page,
      `${ROTA}?exercicio=${String(ANO)}&centro=${encodeURIComponent(centroNaTela)}`
    );
    const partes = await page.evaluate(() => document.querySelectorAll("tr[data-parte]").length);
    nota(`partes na composição: ${String(partes)}`);
    conferir(
      "6.2 ⚠️ a COMPOSIÇÃO abre e traz a liquidação de onde a parte veio — o caminho de volta ao fato",
      partes >= 1 && /Composi[çc][ãa]o do custo de/i.test(comComposicao),
      `${String(partes)} parte(s); ${comComposicao.slice(0, 300)}`
    );
    const numeroDaLiquidacao = liq.rotulo.split(" — ")[0]?.trim() ?? "";
    conferir(
      "6.3 e o número da liquidação apropriada está na composição, não só um valor",
      numeroDaLiquidacao !== "" && comComposicao.includes(numeroDaLiquidacao.toLowerCase()),
      `procurado "${numeroDaLiquidacao}" em: ${comComposicao.slice(0, 400)}`
    );
    conferir(
      "6.4 a composição nomeia o CRITÉRIO e a versão pela qual aquela parte foi rateada",
      comComposicao.includes(CHAVE_NA_TELA) && /vers[ãa]o 1/i.test(comComposicao),
      comComposicao.slice(0, 400)
    );

    // ══ 7. O TETO, MEDIDO NUMA SEGUNDA LIQUIDAÇÃO (N=2) ══
    //
    // ⚠️ DUAS COISAS SE MEDEM AQUI, E ELAS SÃO DIFERENTES. A primeira é que a liquidação apropriada
    // POR INTEIRO sai do rol — a tela não oferece o que o serviço recusaria. A segunda é o TETO em
    // si, e ele só se mede numa liquidação com saldo: apropriar uma parte e depois pedir um absurdo
    // tem de ser recusado NOMEANDO o disponível. Sem a segunda, a primeira corrida deste percurso
    // passava pelo caminho fácil e o guard do teto não era exercitado por tela nenhuma.
    await irPara(n, page, `${ROTA}?exercicio=${String(ANO)}`);
    const restantes = await opcoes(
      page,
      'form[data-acao="apropriar-custo"] select[name="liquidacaoId"]'
    );
    nota(`liquidações ainda com saldo: ${String(restantes.length)}`);
    conferir(
      "7.1 ⚠️ a liquidação apropriada por INTEIRO sai do rol — a tela não oferece o que o serviço recusaria",
      !restantes.some((o) => o.valor === liq.valor),
      `a liquidação ${liq.rotulo} continua sendo oferecida`
    );

    const segunda = restantes[0];
    if (segunda === undefined) {
      conferir(
        "7.2 o teto medido numa segunda liquidação",
        false,
        "não há segunda liquidação com saldo para exercitar o teto"
      );
    } else {
      nota(`segunda liquidação: ${segunda.rotulo}`);
      const rParcial = await preencherEEnviar(page, "apropriar-custo", [
        { sel: 'select[name="liquidacaoId"]', valor: segunda.valor, tipo: "select" },
        { sel: 'select[name="criterioChave"]', valor: CHAVE, tipo: "select" },
        { sel: 'input[name="competencia"]', valor: `${String(ANO)}-08`, tipo: "data" },
        { sel: 'input[name="valor"]', valor: "10,00" },
        { sel: 'textarea[name="motivo"]', valor: "Apropriacao PARCIAL para medir o teto (percurso)" },
      ]);
      conferir(
        "7.2 a apropriação PARCIAL é aceita — e o resto da liquidação continua disponível",
        rParcial.tipo === "ok" && /10\.00/.test(rParcial.texto),
        `${rParcial.tipo}: ${rParcial.texto.slice(0, 220)}`
      );

      const rExcesso = await preencherEEnviar(page, "apropriar-custo", [
        { sel: 'select[name="liquidacaoId"]', valor: segunda.valor, tipo: "select" },
        { sel: 'select[name="criterioChave"]', valor: CHAVE, tipo: "select" },
        { sel: 'input[name="competencia"]', valor: `${String(ANO)}-08`, tipo: "data" },
        { sel: 'input[name="valor"]', valor: "99999999,00" },
        { sel: 'textarea[name="motivo"]', valor: "Tentativa de apropriar acima da despesa (percurso)" },
      ]);
      conferir(
        "7.3 ⚠️ apropriar ACIMA da despesa reconhecida é recusado, dizendo o disponível",
        rExcesso.tipo === "erro" &&
          /acima da despesa/i.test(rExcesso.texto) &&
          /dispon[íi]vel/i.test(rExcesso.texto),
        `${rExcesso.tipo}: ${rExcesso.texto.slice(0, 250)}`
      );
      conferir(
        "7.4 e a recusa diz que NADA foi gravado",
        /nada foi gravado/i.test(rExcesso.texto),
        rExcesso.texto.slice(0, 250)
      );
    }
  } finally {
    await navegador.close();
  }

  console.log("\n════════════════════════════════════════════");
  console.log(`passos ok: ${String(passos.length)}`);
  if (falhas.length > 0) {
    console.error(`falhas: ${String(falhas.length)}`);
    for (const f of falhas) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log("falhas: 0");
}

await main();
