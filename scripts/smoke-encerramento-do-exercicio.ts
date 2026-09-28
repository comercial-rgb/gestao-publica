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
 * V19 — O ENCERRAMENTO DO EXERCÍCIO E A INSCRIÇÃO DOS RESTOS, PELA TELA.
 *
 * ═══ O QUE SÓ A TELA RESPONDE ═══
 * O domínio do M08 é maduro e testado; o que não existia era o CAMINHO. Este percurso mede quatro
 * coisas que nenhum teste de módulo alcança:
 *
 *   1. a tela oferece o encerramento **mesmo sem inscrição nenhuma** — que é o estado em que ele é
 *      necessário, e era justamente a tela em que o operador não tinha como produzir a primeira;
 *   2. a **confirmação digitada é conferida no servidor**: ano errado não encerra;
 *   3. o encerramento **inscreve** os restos, e a tela recarregada mostra as inscrições;
 *   4. o exercício **trava**: repetir o ato é recusado nomeando, e é o servidor que recusa.
 *
 * ⚠️ BANCO DESCARTÁVEL, OBRIGATÓRIO. Este percurso ENCERRA o exercício — depois dele, empenho,
 * liquidação e pagamento com data naquele ano são recusados pelo controle de período. Rodá-lo
 * contra o banco de apresentação inutilizaria todos os outros passos da demonstração. O script
 * RECUSA rodar contra a porta 3010, que é a do ambiente de apresentação.
 *
 * Uso:  npx tsx scripts/smoke-encerramento-do-exercicio.ts http://localhost:3011
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

    await irPara(n, page, "/administracao/perfis");
    for (let i = 0; i < 12; i += 1) {
      const pendente = await page.evaluate(
        () => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null
      );
      if (!pendente) break;
      await preencherEEnviar(page, "aplicar-atualizacao", []);
      await irPara(n, page, "/administracao/perfis");
    }
    ok("1.1 fila de atualizações de permissões esgotada");

    // ══ 2. A TELA OFERECE O ENCERRAMENTO ══
    const rota = `/despesa/restos-a-pagar?exercicio=${String(ANO)}`;
    const inicial = await irPara(n, page, rota);
    conferir(
      "2.1 a tela dos restos a pagar abre",
      /restos a pagar/i.test(inicial),
      inicial.slice(0, 200)
    );
    const temForm = await page.evaluate(
      () => document.querySelector('form[data-acao="encerrar-exercicio"]') !== null
    );
    conferir(
      "2.2 ⚠️ o encerramento é oferecido MESMO sem inscrição nenhuma — o estado em que ele é necessário",
      temForm,
      "o formulário de encerramento não está na tela"
    );
    /**
     * ⚠️ O AVISO MORA DENTRO DO `<details>` FECHADO, e a primeira corrida deste percurso reprovou
     * aqui por causa disso: o texto que o helper devolve é o `innerText`, que NÃO inclui conteúdo
     * oculto. Ler a página inteira e procurar a frase daria falso vermelho para sempre. Abrir o
     * detalhe é o que a pessoa faz antes de ler — e é o que o percurso passa a fazer.
     */
    const aviso = await page.evaluate(() => {
      const d = document.querySelector("[data-encerramento]");
      if (!(d instanceof HTMLDetailsElement)) return "";
      d.open = true;
      return (d.textContent ?? "").replace(/\s+/g, " ").trim();
    });
    conferir(
      "2.3 abrindo o detalhe, a consequência está escrita ANTES do campo: a competência trava",
      /passam a ser recusados pelo controle de per[íi]odo/i.test(aviso),
      aviso.slice(0, 400)
    );

    // ══ 3. A CONFIRMAÇÃO ERRADA NÃO ENCERRA ══
    const r1 = await preencherEEnviar(page, "encerrar-exercicio", [
      { sel: 'input[name="confirmacao"]', valor: "9999" },
    ]);
    conferir(
      "3.1 ⚠️ confirmação errada é RECUSADA no servidor, e nada é gravado",
      r1.tipo === "erro" && /confirmação não corresponde/i.test(r1.texto),
      `${r1.tipo}: ${r1.texto.slice(0, 200)}`
    );

    // ══ 4. O ENCERRAMENTO ══
    const r2 = await preencherEEnviar(page, "encerrar-exercicio", [
      { sel: 'input[name="confirmacao"]', valor: String(ANO) },
    ]);
    nota(`encerramento: ${r2.tipo} — ${r2.texto.slice(0, 200)}`);
    conferir(
      "4.1 o exercício é encerrado e os restos são INSCRITOS",
      r2.tipo === "ok" && /inscritos/i.test(r2.texto),
      `${r2.tipo}: ${r2.texto.slice(0, 250)}`
    );
    conferir(
      "4.2 a mensagem diz quantos processados e quantos não processados",
      /processado\(s\)/i.test(r2.texto) && /não processado\(s\)/i.test(r2.texto),
      r2.texto.slice(0, 250)
    );

    // ══ 5. AS INSCRIÇÕES APARECEM, LIDAS DA PERSISTÊNCIA ══
    const depois = await irPara(n, page, rota);
    const linhas = await page.evaluate(() => document.querySelectorAll("table tbody tr").length);
    nota(`linhas de resto na tela: ${String(linhas)}`);
    conferir(
      "5.1 a tela recarregada mostra as inscrições — não a mensagem, a PERSISTÊNCIA",
      linhas > 0,
      `${String(linhas)} linha(s); texto: ${depois.slice(0, 200)}`
    );

    // ══ 6. REPETIR É RECUSADO ══
    const r3 = await preencherEEnviar(page, "encerrar-exercicio", [
      { sel: 'input[name="confirmacao"]', valor: String(ANO) },
    ]);
    conferir(
      "6.1 ⚠️ encerrar de novo é RECUSADO nomeando — o ato não se repete",
      r3.tipo === "erro" && /já está encerrado/i.test(r3.texto),
      `${r3.tipo}: ${r3.texto.slice(0, 200)}`
    );

    // ══ 7. A COMPETÊNCIA TRAVOU — o efeito, e não a promessa ══
    await irPara(n, page, `/despesa/empenhos?exercicio=${String(ANO)}`);
    const fichaId = await page.evaluate(() => {
      const s = document.querySelector('form[data-acao="empenhar"] select[name="fichaId"]');
      if (!(s instanceof HTMLSelectElement)) return "";
      const o = Array.from(s.options).find((x) => x.value !== "" && !x.disabled);
      return o === undefined ? "" : o.value;
    });
    if (fichaId === "") {
      conferir("7.1 empenho no exercício encerrado", false, "sem ficha no seletor para tentar");
    } else {
      const r4 = await preencherEEnviar(page, "empenhar", [
        { sel: 'select[name="fichaId"]', valor: fichaId, tipo: "select" },
        { sel: 'input[name="numero"]', valor: `NE-POS-${String(Date.now()).slice(-4)}` },
        { sel: '[data-mascara="cpf-cnpj"]', valor: "11222333000144" },
        { sel: '[data-mascara="valor"]', valor: "100,00" },
        { sel: 'input[name="data"]', valor: `${String(ANO)}-12-20`, tipo: "data" },
        { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
        { sel: 'input[name="historico"]', valor: "empenho depois do encerramento (percurso)" },
      ]);
      nota(`empenho depois do encerramento: ${r4.tipo} — ${r4.texto.slice(0, 160)}`);
      conferir(
        "7.1 ⚠️ empenhar no exercício ENCERRADO é recusado — o efeito do ato, medido",
        r4.tipo === "erro",
        `${r4.tipo}: ${r4.texto.slice(0, 220)}`
      );
    }
  } finally {
    await navegador.close();
  }

  console.log("\n════════════════════════════════════════════");
  console.log(`passos ok: ${String(passos.length)}`);
  console.log(`falhas:    ${String(falhas.length)}`);
  for (const f of falhas) console.log(`  [FALHA] ${f}`);
  if (falhas.length > 0) process.exitCode = 1;
}

await main();
