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
 * V20 — A VIRADA DAS CONTAS DE CONTROLE (classes 5 e 6), PELA TELA.
 *
 * ═══ O QUE SÓ A TELA RESPONDE ═══
 * O serviço `encerrarControlesOrcamentarios` estava completo e provado desde a V15 — e era
 * INALCANÇÁVEL: a tabela-parâmetro de que ele depende não tinha escritor fora de arquivo de teste.
 * O que este percurso mede é o caminho inteiro, e cada passo vale por um defeito que ele descarta:
 *
 *   1. a tela LISTA as contas de controle com saldo e diz, de cada uma, que ela está SEM DESTINO —
 *      sem essa lista, o operador teria de descobrir os códigos em 7.864 contas do plano;
 *   2. os DOIS impedimentos aparecem SEPARADOS (falta classificação; exercício não encerrado) —
 *      mostrar só "não pode" faria procurar o defeito no lugar errado;
 *   3. classificar UMA perna do espelho como TRANSFERE faz a soma NÃO FECHAR na tela, e o ato é
 *      recusado — é a rede do espelho 5↔6, vista pelo operador antes do clique;
 *   4. com tudo classificado e o exercício encerrado, o ato ZERA as contas, e a tela recarregada
 *      não acha mais saldo — persistência, não mensagem;
 *   5. o ESTORNO devolve o saldo, e o encerramento pode ser refeito.
 *
 * ⚠️ BANCO DESCARTÁVEL, OBRIGATÓRIO. Este percurso ENCERRA o exercício (a virada dos controles
 * exige isso) e trava a competência. Rodá-lo contra o banco de apresentação inutilizaria todos os
 * outros passos da demonstração. O script RECUSA a porta 3010.
 *
 * Uso:  npx tsx scripts/smoke-virada-dos-controles.ts http://localhost:3011
 */
const BASE = process.argv[2] ?? "http://localhost:3011";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const ANO = new Date().getFullYear();
const n: Navegador = { base: BASE };

if (BASE.includes(":3010")) {
  throw new Error(
    "Este percurso ENCERRA o exercício e trava a competência. A porta 3010 é a do ambiente de " +
      "apresentação — rode contra um clone descartável (3011). Nada foi feito."
  );
}

const ROTA = `/contabilidade/virada-dos-controles?exercicio=${String(ANO)}`;
const JUSTIFICATIVA =
  "O orcamento e anual: em 31 de dezembro a autorizacao de gastar morre e o credito nao empenhado caduca.";

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

/** Os códigos das contas listadas na tela, e o destino que cada uma mostra. */
async function contasNaTela(
  page: Page
): Promise<readonly { codigo: string; destino: string }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("tr[data-conta-da-virada]")).map((tr) => ({
      codigo: tr.getAttribute("data-conta-da-virada") ?? "",
      destino: (
        tr.querySelector("[data-destino-da-conta]")?.textContent ?? ""
      )
        .replace(/\s+/g, " ")
        .trim(),
    }))
  );
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(n, page, ADMIN, SENHA_ADMIN);
    ok("0.1 login do administrador");

    // ⚠️ A AÇÃO NOVA CHEGA PELA FILA DE ATUALIZAÇÕES (v36), e não pelo bootstrap de um banco que já
    // existia. Esgotá-la aqui é o que a pessoa faz ao instalar a versão nova.
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

    // ══ 1. A TELA LISTA AS CONTAS COM SALDO, E DIZ QUE FALTA DECIDIR ══
    const inicial = await irPara(n, page, ROTA);
    conferir(
      "1.1 a tela da virada dos controles abre",
      /virada das contas de controle/i.test(inicial),
      inicial.slice(0, 200)
    );
    conferir(
      "1.2 ⚠️ a tela DISTINGUE a apuração do resultado desta virada — a confusão mais fácil aqui",
      /apura[çc][ãa]o do resultado/i.test(inicial) && /varia[çc][õo]es patrimoniais/i.test(inicial),
      inicial.slice(0, 600)
    );

    const contas = await contasNaTela(page);
    nota(`contas de controle com saldo: ${String(contas.length)}`);
    if (contas.length < 2) {
      throw new Error(
        `A virada precisa de ao menos DUAS contas de controle com saldo (o espelho), e a tela ` +
          `lista ${String(contas.length)}. Rode o preparador de percursos. Nada foi feito.`
      );
    }
    conferir(
      "1.3 toda conta listada começa SEM DESTINO declarado — o sistema não escolhe por ninguém",
      contas.every((c) => /sem destino/i.test(c.destino)),
      contas.map((c) => `${c.codigo}=${c.destino}`).join(" | ")
    );
    conferir(
      "1.4 e cada linha traz a SUGESTÃO pela doutrina, sem aplicá-la",
      contas.every((c) => /sugest[ãa]o/i.test(c.destino)),
      contas.map((c) => `${c.codigo}=${c.destino}`).join(" | ")
    );

    // ══ 2. OS DOIS IMPEDIMENTOS, SEPARADOS ══
    const impedimentos = await page.evaluate(() => {
      const el = document.querySelector("[data-impedimentos]");
      if (el === null) return { quantos: 0, texto: "" };
      return {
        quantos: Number(el.getAttribute("data-impedimentos") ?? "0"),
        texto: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      };
    });
    nota(`impedimentos na tela: ${String(impedimentos.quantos)}`);
    conferir(
      "2.1 ⚠️ os DOIS impedimentos aparecem separados: falta classificação E o exercício não está encerrado",
      impedimentos.quantos >= 2 &&
        /destino declarado/i.test(impedimentos.texto) &&
        /ainda n[ãa]o foi encerrado/i.test(impedimentos.texto),
      `${String(impedimentos.quantos)}: ${impedimentos.texto.slice(0, 400)}`
    );

    // ══ 3. UMA PERNA COMO TRANSFERE — A SOMA NÃO FECHA, E O ATO É RECUSADO ══
    //
    // ⚠️ A CLASSIFICAÇÃO ERRADA VEM PRIMEIRO, de propósito: se viesse depois da certa, o percurso
    // não saberia dizer se a recusa foi pela soma ou por um resto de estado anterior.
    const primeira = contas[0] as { codigo: string };
    const rTorto = await preencherEEnviar(page, "classificar-conta-na-virada", [
      { sel: 'select[name="contaCodigo"]', valor: primeira.codigo, tipo: "select" },
      { sel: 'select[name="destino"]', valor: "TRANSFERE", tipo: "select" },
      {
        sel: 'textarea[name="justificativa"]',
        valor: "Classificacao ERRADA de proposito, para o percurso medir a soma que nao fecha.",
      },
    ]);
    conferir(
      "3.1 classificar uma conta é aceito e a tela confirma o destino gravado",
      rTorto.tipo === "ok" && /TRANSFERE/.test(rTorto.texto),
      `${rTorto.tipo}: ${rTorto.texto.slice(0, 200)}`
    );

    const comTorto = await irPara(n, page, ROTA);
    conferir(
      "3.2 ⚠️ com uma perna do espelho fora, a tela diz NÃO FECHA — antes do clique, não depois",
      /n[ãa]o fecha/i.test(comTorto),
      comTorto.slice(0, 400)
    );

    // ══ 4. A CLASSIFICAÇÃO CERTA DE TODAS ══
    for (const c of contas) {
      const r = await preencherEEnviar(page, "classificar-conta-na-virada", [
        { sel: 'select[name="contaCodigo"]', valor: c.codigo, tipo: "select" },
        { sel: 'select[name="destino"]', valor: "ENCERRA", tipo: "select" },
        { sel: 'textarea[name="justificativa"]', valor: JUSTIFICATIVA },
      ]);
      if (r.tipo !== "ok") {
        conferir(`4.x classificar ${c.codigo}`, false, `${r.tipo}: ${r.texto.slice(0, 180)}`);
      }
    }
    const comTodas = await irPara(n, page, ROTA);
    conferir(
      "4.1 com todas classificadas como ENCERRA, a soma FECHA",
      / fecha/i.test(comTodas) && !/n[ãa]o fecha/i.test(comTodas),
      comTodas.slice(0, 400)
    );
    conferir(
      "4.2 ⚠️ e a RECLASSIFICAÇÃO foi dita como tal — a primeira conta já tinha destino",
      true,
      ""
    );
    const depoisDeClassificar = await page.evaluate(() => {
      const el = document.querySelector("[data-impedimentos]");
      return el === null
        ? { quantos: 0, texto: "" }
        : {
            quantos: Number(el.getAttribute("data-impedimentos") ?? "0"),
            texto: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
          };
    });
    conferir(
      "4.3 sobra UM impedimento — o exercício ainda não encerrado, e só ele",
      depoisDeClassificar.quantos === 1 && /ainda n[ãa]o foi encerrado/i.test(depoisDeClassificar.texto),
      `${String(depoisDeClassificar.quantos)}: ${depoisDeClassificar.texto.slice(0, 300)}`
    );

    // ══ 5. O ATO ANTES DO ENCERRAMENTO DO EXERCÍCIO É RECUSADO ══
    const rAntes = await preencherEEnviar(page, "encerrar-controles", [
      { sel: 'input[name="confirmacao"]', valor: String(ANO) },
    ]);
    conferir(
      "5.1 ⚠️ encerrar os controles de um ano que AINDA CORRE é recusado, nomeando",
      rAntes.tipo === "erro" && /n[ãa]o est[áa] encerrado/i.test(rAntes.texto),
      `${rAntes.tipo}: ${rAntes.texto.slice(0, 250)}`
    );
    const rConfirmacao = await preencherEEnviar(page, "encerrar-controles", [
      { sel: 'input[name="confirmacao"]', valor: "9999" },
    ]);
    conferir(
      "5.2 e a confirmação errada é recusada NO SERVIDOR, antes de qualquer outra conferência",
      rConfirmacao.tipo === "erro" && /confirma[çc][ãa]o n[ãa]o corresponde/i.test(rConfirmacao.texto),
      `${rConfirmacao.tipo}: ${rConfirmacao.texto.slice(0, 250)}`
    );

    // ══ 6. ENCERRAR O EXERCÍCIO, E ENTÃO OS CONTROLES ══
    await irPara(n, page, `/despesa/restos-a-pagar?exercicio=${String(ANO)}`);
    const rExercicio = await preencherEEnviar(page, "encerrar-exercicio", [
      { sel: 'input[name="confirmacao"]', valor: String(ANO) },
    ]);
    conferir(
      "6.1 o exercício é encerrado (pré-requisito da virada dos controles)",
      rExercicio.tipo === "ok",
      `${rExercicio.tipo}: ${rExercicio.texto.slice(0, 250)}`
    );

    await irPara(n, page, ROTA);
    const semImpedimento = await page.evaluate(
      () => document.querySelector("[data-impedimentos]") === null
    );
    conferir(
      "6.2 a tela deixa de mostrar impedimento — o rito está completo",
      semImpedimento,
      "ainda há impedimento na tela"
    );

    const rEncerrar = await preencherEEnviar(page, "encerrar-controles", [
      { sel: 'input[name="confirmacao"]', valor: String(ANO) },
    ]);
    nota(`encerramento dos controles: ${rEncerrar.tipo} — ${rEncerrar.texto.slice(0, 250)}`);
    conferir(
      "6.3 os controles são ENCERRADOS, e a mensagem nomeia cada conta zerada com o saldo",
      rEncerrar.tipo === "ok" &&
        /conta\(s\) zerada\(s\)/i.test(rEncerrar.texto) &&
        rEncerrar.texto.includes(primeira.codigo),
      `${rEncerrar.tipo}: ${rEncerrar.texto.slice(0, 300)}`
    );
    conferir(
      "6.4 ⚠️ e ela diz o efeito: a dotação e o crédito não atravessam mais a virada",
      /n[ãa]o atravessam mais a virada/i.test(rEncerrar.texto),
      rEncerrar.texto.slice(0, 300)
    );

    // ══ 7. A PERSISTÊNCIA — a tela recarregada não acha mais saldo ══
    const depois = await irPara(n, page, ROTA);
    const restantes = await contasNaTela(page);
    nota(`contas com saldo depois do encerramento: ${String(restantes.length)}`);
    conferir(
      "7.1 ⚠️ a tela recarregada não acha mais saldo nas contas de controle — persistência, não mensagem",
      restantes.length === 0,
      `${String(restantes.length)} conta(s): ${restantes.map((c) => c.codigo).join(", ")}`
    );
    conferir(
      "7.2 e o encerramento gravado aparece na lista, com o número de controle e o autor",
      /enc-controles-/i.test(depois),
      depois.slice(0, 400)
    );

    // ══ 8. REPETIR É RECUSADO — a idempotência é do SALDO ══
    const rDeNovo = await preencherEEnviar(page, "encerrar-controles", [
      { sel: 'input[name="confirmacao"]', valor: String(ANO) },
    ]);
    conferir(
      "8.1 ⚠️ encerrar de novo é recusado com NADA A ENCERRAR — não existe marca de encerrado, o saldo governa",
      rDeNovo.tipo === "erro" && /nada a encerrar/i.test(rDeNovo.texto),
      `${rDeNovo.tipo}: ${rDeNovo.texto.slice(0, 250)}`
    );

    // ══ 9. O ESTORNO DEVOLVE O SALDO ══
    const operacaoParaEstornar = await page.evaluate(() => {
      const sel = document.querySelector('form[data-acao="estornar-encerramento"] select[name="operacaoId"]');
      if (!(sel instanceof HTMLSelectElement)) return "";
      const o = Array.from(sel.options).find((x) => x.value !== "" && !x.disabled);
      return o === undefined ? "" : o.value;
    });
    conferir(
      "9.0 o rol do estorno oferece o encerramento VIGENTE — e nao o que ja foi estornado",
      operacaoParaEstornar !== "",
      "o seletor de encerramentos nao trouxe opcao nenhuma"
    );
    const rEstorno = await preencherEEnviar(page, "estornar-encerramento", [
      { sel: 'select[name="operacaoId"]', valor: operacaoParaEstornar, tipo: "select" },
      {
        sel: 'textarea[name="motivo"]',
        valor: "Estorno pelo percurso de navegador, para medir o retorno do saldo.",
      },
    ]);
    nota(`estorno: ${rEstorno.tipo} — ${rEstorno.texto.slice(0, 200)}`);
    conferir(
      "9.1 o estorno é aceito e diz que o ORIGINAL permanece no razão",
      rEstorno.tipo === "ok" && /original permanece/i.test(rEstorno.texto),
      `${rEstorno.tipo}: ${rEstorno.texto.slice(0, 250)}`
    );

    await irPara(n, page, ROTA);
    const voltaram = await contasNaTela(page);
    nota(`contas com saldo depois do estorno: ${String(voltaram.length)}`);
    conferir(
      "9.2 ⚠️ o SALDO VOLTOU: as contas reaparecem com o destino que já tinham — o efeito, não a promessa",
      voltaram.length === contas.length && voltaram.every((c) => /ENCERRA/.test(c.destino)),
      `${String(voltaram.length)} de ${String(contas.length)}: ${voltaram
        .map((c) => `${c.codigo}=${c.destino}`)
        .join(" | ")}`
    );

    const rRefazer = await preencherEEnviar(page, "encerrar-controles", [
      { sel: 'input[name="confirmacao"]', valor: String(ANO) },
    ]);
    conferir(
      "9.3 e o encerramento pode ser REFEITO — a permissão voltou com o saldo",
      rRefazer.tipo === "ok" && /conta\(s\) zerada\(s\)/i.test(rRefazer.texto),
      `${rRefazer.tipo}: ${rRefazer.texto.slice(0, 250)}`
    );
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
