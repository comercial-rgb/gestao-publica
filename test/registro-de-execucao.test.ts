import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  VARIAVEL_DO_DONO,
  caminhoDoRegistro,
  linhasDeFalha,
} from "../scripts/trinco-de-maquina.js";

/**
 * ═══ A SAÍDA BRUTA TEM DE EXISTIR EM DISCO ANTES DE PASSAR POR QUALQUER CANO ═══
 *
 * ⚠️ O CASO REAL. No fechamento do ENT03c, uma execução do `test:fuso` acusou **2 falhas
 * em 1.869** e os NOMES dos testes se perderam: o comando era
 * `npm run test:fuso | grep …`, e o `grep` descartou tudo que não casava antes de nada
 * ser gravado. Duas execuções seguintes no mesmo commit vieram limpas — e a falha ficou
 * sem nome, portanto sem investigação possível.
 *
 * A causa estava no runner: `stdio: "inherit"` entregava a saída do filho DIRETO ao
 * terminal do chamador. O que o chamador fizesse com ela era irreversível.
 *
 * ⚠️ ESTE ARQUIVO NÃO TESTA "LEMBRAR DE NÃO USAR GREP". Testa a propriedade que torna o
 * grep inofensivo: **o arquivo existe e tem a saída inteira**, aconteça o que acontecer
 * com o fluxo do terminal. É a mesma escolha da suíte sob outro fuso — vigiar a
 * propriedade, não enumerar as formas de errar.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTA = join(RAIZ, ".registro-de-execucao");
const TAREFA = "prova automatizada do registro";

function rodar(
  script: string,
  extras: Readonly<Record<string, string>> = {}
): { saida: string; codigo: number } {
  try {
    const saida = execFileSync(
      "npx",
      ["tsx", "scripts/trinco-de-maquina.ts", TAREFA, "--", "node", "-e", script],
      {
        cwd: RAIZ,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...extras },
      }
    );
    return { saida, codigo: 0 };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { saida: `${err.stdout ?? ""}${err.stderr ?? ""}`, codigo: err.status ?? -1 };
  }
}

/** O trinco de verdade — o mesmo arquivo que `scripts/trinco-de-maquina.ts` usa. */
const CAMINHO_DO_TRINCO = join(tmpdir(), "gestao-publica-trabalho-pesado.trinco");

/**
 * Põe um dono conhecido no trinco, roda `f`, e devolve o arquivo ao estado anterior.
 *
 * ⚠️ ELE MEXE NO TRINCO DE VERDADE, e isso é deliberado: um trinco de mentira, em outro
 * caminho, provaria que o código funciona num caminho que ninguém usa. A janela é de
 * segundos, a suíte roda com `fileParallelism: false`, e o `finally` devolve o conteúdo
 * original — inclusive quando quem o detinha era o portão que está rodando esta suíte.
 */
function comDonoNoTrinco<T>(pid: number, f: () => T): T {
  const anterior = existsSync(CAMINHO_DO_TRINCO)
    ? readFileSync(CAMINHO_DO_TRINCO, "utf8")
    : null;
  writeFileSync(
    CAMINHO_DO_TRINCO,
    JSON.stringify({ pid, tarefa: "dono da prova", desde: new Date().toLocaleString("pt-BR") })
  );
  try {
    return f();
  } finally {
    if (anterior !== null) writeFileSync(CAMINHO_DO_TRINCO, anterior);
    else rmSync(CAMINHO_DO_TRINCO, { force: true });
  }
}

/** Os registros desta tarefa — e só desta, para não apagar execuções de verdade. */
function registrosDaProva(): readonly string[] {
  if (!existsSync(PASTA)) return [];
  return readdirSync(PASTA)
    .filter((f) => f.startsWith("prova-automatizada-do-registro-"))
    .map((f) => join(PASTA, f));
}

afterAll(() => {
  for (const f of registrosDaProva()) rmSync(f, { force: true });
});

describe("registro bruto da execução pesada", () => {
  it("grava a saída em disco MESMO com stdout do chamador descartado", () => {
    const marca = `MARCA-QUE-NAO-PODE-SE-PERDER-${Date.now()}`;
    // ⚠️ `stdio` com stdout em "pipe" e a saída JOGADA FORA aqui embaixo reproduz o que o
    // `| grep` fez: o terminal não guarda nada. O arquivo tem de guardar.
    const { codigo } = rodar(
      `console.log(${JSON.stringify(marca)}); process.exit(3)`
    );
    expect(codigo, "o código de saída do filho é o do wrapper").toBe(3);

    const achados = registrosDaProva().filter((f) =>
      readFileSync(f, "utf8").includes(marca)
    );
    expect(
      achados.length,
      `nenhum registro em ${PASTA} contém "${marca}". A saída bruta precisa chegar ao ` +
        `disco ANTES de passar por qualquer cano — foi assim que os nomes dos 2 testes ` +
        `intermitentes do ENT03c se perderam.`
    ).toBeGreaterThan(0);

    const bruto = readFileSync(achados[0] as string, "utf8");
    // O cabeçalho é o que torna a execução REPRODUTÍVEL: sem o fuso, uma intermitência de
    // data não se distingue de uma intermitência de máquina.
    expect(bruto).toContain("# comando ...");
    expect(bruto).toContain("# TZ ........");
  }, 60_000);

  it("o caminho do registro é ordenável e não tem dois-pontos", () => {
    const p = caminhoDoRegistro("suíte sob outro fuso", new Date("2026-09-11T12:00:00Z"));
    expect(p).toContain("suite-sob-outro-fuso-2026-09-11T12-00-00-000Z.log");
    expect(p.split("/").pop()).not.toContain(":");
  });

  it("o filtro roda DEPOIS e nomeia o que falhou", () => {
    // `\u2713` é o caractere que o PRÓPRIO Vitest imprime na linha verde — é dado de
    // entrada do filtro, não enfeite. Escapado para não haver símbolo literal no código.
    const bruto = [
      " \u2713 test/a.test.ts > tudo bem",
      " FAIL  test/b.test.ts > modulo > O TESTE QUE FALHOU",
      "      Tests  2 failed | 1867 passed (1869)",
    ].join("\n");
    const linhas = linhasDeFalha(bruto);
    expect(linhas.join("\n")).toContain("O TESTE QUE FALHOU");
    expect(linhas.join("\n")).toContain("2 failed");
    // Uma linha verde não é falha — o filtro não pode inventar investigação.
    expect(linhas.join("\n")).not.toContain("tudo bem");
  });
});

/**
 * ═══ O TRINCO CONTA MÁQUINA, NÃO PROCESSO ═══
 *
 * ⚠️ O CASO REAL, 11/09/2026, no portão do ENT04. O primeiro teste deste arquivo roda o
 * trinco como filho. Sozinho ele passava; **dentro do portão falhava sempre**, porque o
 * portão roda sob o trinco e o trinco aninhado recusava o próprio descendente. Deu 1 falha
 * em 654 e 1 em 1.910 — o portão inteiro vermelho, com o `test:fuso` pulado por dependência,
 * por uma recusa que não protegia memória nenhuma.
 *
 * A memória da máquina já estava contabilizada pelo ancestral. Estes dois testes fixam a
 * distinção nos DOIS sentidos, porque só o primeiro seria uma dispensa disfarçada de
 * correção.
 */
describe("reentrância do trinco de máquina", () => {
  it("o descendente do dono passa — e NÃO fica com o trinco na mão", () => {
    const marca = `DESCENDENTE-${Date.now()}`;
    const { r, donoDepois } = comDonoNoTrinco(process.pid, () => {
      const r = rodar(`console.log(${JSON.stringify(marca)}); process.exit(3)`, {
        [VARIAVEL_DO_DONO]: String(process.pid),
      });
      // Lido AQUI DENTRO: o restaurador do `finally` apagaria a evidência.
      const donoDepois = existsSync(CAMINHO_DO_TRINCO)
        ? (JSON.parse(readFileSync(CAMINHO_DO_TRINCO, "utf8")) as { pid: number }).pid
        : null;
      return { r, donoDepois };
    });

    expect(
      r.codigo,
      `o descendente foi recusado. Esta é a falha exata que deixou o portão do ENT04 ` +
        `vermelho: código 1 (recusa do trinco) no lugar do 3 que o script pediu.`
    ).toBe(3);

    // ⚠️ A METADE QUE IMPORTA MAIS. Se o aninhado TOMASSE o trinco, ele o soltaria ao sair —
    // e a máquina ficaria liberada no meio do trabalho do ancestral, que é exatamente o
    // estado que o trinco existe para impedir.
    expect(
      donoDepois,
      "o trinco mudou de dono por causa de um descendente — ele devolveria a máquina no " +
        "meio do trabalho de quem ainda está rodando"
    ).toBe(process.pid);
  }, 60_000);

  it("dono FORJADO não abre o trinco alheio", () => {
    // O trinco é do `process.pid` e ele está vivo; a variável aponta para outro processo
    // vivo. Só o casamento com o dono de verdade vale — herança de shell antigo ou valor
    // inventado não viram passe livre.
    const r = comDonoNoTrinco(process.pid, () =>
      rodar(`process.exit(3)`, { [VARIAVEL_DO_DONO]: String(process.ppid) })
    );

    expect(
      r.codigo,
      "um PID qualquer na variável abriu o trinco — a reentrância virou porta dos fundos " +
        "e a proteção de memória da máquina deixou de existir"
    ).not.toBe(3);
    expect(r.saida).toContain("JÁ HÁ TRABALHO PESADO RODANDO");
  }, 60_000);
});
