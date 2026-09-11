import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DIRETORIOS_INERTES, ehInerte, raizesExistentes } from "./raizes-dominio.js";

/**
 * ═══ O DOADOR ESTÁ DESLIGADO, E CONTINUA DESLIGADO ═══
 *
 * `doador/saas-municipal` é um repositório ABSORVIDO com histórico, preservado para duas
 * extrações futuras e deliberadamente fora do build. Ver `docs/doador.md` — inclusive a
 * condição de remoção.
 *
 * ⚠️ O QUE ESTE GUARD DEFENDE, E POR QUE UM `.gitignore` NÃO BASTARIA. Um diretório grande
 * de código plausível dentro do repositório é um convite silencioso: o arquivo do doador
 * resolve um problema parecido, está ali, e um import relativo de três `../` compila. No
 * dia em que isso acontecer, o produto passa a depender de código que NÃO está no gate de
 * tipos, NÃO está na suíte, NÃO tem dependências instaladas e NÃO tem quem o mantenha.
 * A quebra não apareceria aqui: apareceria em produção, no primeiro `npm ci` de uma máquina
 * limpa.
 *
 * ⚠️ E O DOADOR NÃO RODA DE PROPÓSITO. Ele usa pnpm com workspaces e foi importado SEM
 * dependências instaladas. Isso é parte do que o torna inerte — e é por isso que a segunda
 * asserção existe: bastaria declará-lo como workspace do produto para que `npm install`
 * começasse a resolvê-lo, e a inércia acabaria sem que ninguém tivesse decidido acabá-la.
 */

const RAIZ = resolve(import.meta.dirname, "..");

/** Extensões em que um import pode morar. */
const CODIGO = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs)$/;

/**
 * Os especificadores de import/require de um conteúdo, com a linha em que aparecem.
 *
 * ⚠️ ESPECIFICADOR, E NÃO TEXTO CRU — e a diferença é a razão de esta função existir
 * separada da varredura. A palavra `doador/` aparece legitimamente em prosa por todo o
 * repositório: neste arquivo, em `docs/doador.md`, nos comentários de exclusão dos seis
 * instrumentos, nas mensagens de commit. Um grep de texto acusaria todos eles e seria
 * desligado na primeira semana — que é como um guard morre.
 */
export function especificadoresDe(conteudo: string): readonly { linha: number; spec: string }[] {
  const achados: { linha: number; spec: string }[] = [];
  const padrao =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
  for (const [i, linha] of conteudo.split("\n").entries()) {
    padrao.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = padrao.exec(linha)) !== null) {
      const spec = m[1];
      if (spec !== undefined) achados.push({ linha: i + 1, spec });
    }
  }
  return achados;
}

/** Se um especificador aponta para dentro de um diretório inerte. */
export function apontaParaInerte(spec: string): boolean {
  const semBarraFinal = spec.replace(/\/+$/, "");
  return DIRETORIOS_INERTES.some((d) =>
    new RegExp(`(?:^|/)${d}/`).test(`${semBarraFinal}/`)
  );
}

/** Todo arquivo VERSIONADO — o git é a autoridade, e ele já ignora node_modules. */
function arquivosVersionados(): readonly string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" })
    .split("\0")
    .filter((a) => a !== "");
}

describe("inércia do doador", () => {
  it("nenhum arquivo fora de doador/ importa de doador/", () => {
    const violacoes: string[] = [];

    for (const rel of arquivosVersionados()) {
      if (ehInerte(rel) || !CODIGO.test(rel)) continue;
      const conteudo = readFileSync(resolve(RAIZ, rel), "utf8");
      for (const { linha, spec } of especificadoresDe(conteudo)) {
        if (apontaParaInerte(spec)) violacoes.push(`${rel}:${linha} -> ${spec}`);
      }
    }

    expect(
      violacoes,
      "Arquivo de PRODUTO importando do doador. O doador é código absorvido, fora do " +
        "gate de tipos e da suíte, e SEM dependências instaladas — o import compila aqui " +
        "e quebra no primeiro `npm ci` limpo. Se o que está lá é necessário, ele é " +
        "EXTRAÍDO para o produto por um commit próprio (docs/doador.md), não importado " +
        "de onde está:\n" +
        violacoes.map((v) => `  · ${v}`).join("\n")
    ).toEqual([]);
  });

  it("nenhum package.json do produto declara o doador como workspace ou dependência", () => {
    const violacoes: string[] = [];

    for (const rel of arquivosVersionados()) {
      if (ehInerte(rel)) continue;
      if (!rel.endsWith("package.json") && rel !== "pnpm-workspace.yaml") continue;

      const bruto = readFileSync(resolve(RAIZ, rel), "utf8");

      if (rel === "pnpm-workspace.yaml") {
        // O produto não usa pnpm. Se este arquivo existir na raiz, já é sinal de que
        // alguém começou a ligar o doador — ele é quem traz workspaces consigo.
        violacoes.push(`${rel} -> o produto não usa pnpm workspaces; o doador usa`);
        continue;
      }

      const pkg: unknown = JSON.parse(bruto);
      if (typeof pkg !== "object" || pkg === null) continue;
      const p = pkg as Record<string, unknown>;

      const listas: readonly (readonly [string, unknown])[] = [
        ["workspaces", p["workspaces"]],
        ["dependencies", p["dependencies"]],
        ["devDependencies", p["devDependencies"]],
        ["optionalDependencies", p["optionalDependencies"]],
      ];

      for (const [campo, valor] of listas) {
        if (valor === undefined) continue;
        const textos = Array.isArray(valor)
          ? valor.map(String)
          : Object.values(valor as Record<string, unknown>).map(String);
        for (const t of textos) {
          if (apontaParaInerte(t.replace(/^(?:file|link|workspace):/, ""))) {
            violacoes.push(`${rel} -> ${campo}: ${t}`);
          }
        }
      }
    }

    expect(
      violacoes,
      "O doador entrou no grafo de dependências do produto. Declará-lo como workspace faz " +
        "`npm install` passar a resolvê-lo, e a inércia acaba sem que ninguém tenha " +
        "decidido acabá-la:\n" + violacoes.map((v) => `  · ${v}`).join("\n")
    ).toEqual([]);
  });

  it("doador não é raiz de varredura de nenhum guard de domínio", () => {
    // ⚠️ É ISTO QUE TORNA A EXCLUSÃO DELIBERADA EM VEZ DE ACIDENTAL. Os guards deste
    // repositório enxergam por LISTA BRANCA (`raizes-dominio.ts`), e na absorção quatro
    // deles ficaram verdes sozinhos — não por defesa, por sorte de ancoragem. Aqui a sorte
    // vira asserção: pedir `doador` como raiz devolve NADA, com motivo declarado.
    expect(raizesExistentes(RAIZ, ["modules", "doador"])).toEqual(
      raizesExistentes(RAIZ, ["modules"])
    );
    expect(raizesExistentes(RAIZ, [...DIRETORIOS_INERTES])).toEqual([]);
  });

  it("os instrumentos que excluem o doador excluem DE FATO — e não só na prosa", async () => {
    // ⚠️ ESTE TESTE NASCEU ERRADO E A MUTAÇÃO O PEGOU. A primeira versão procurava a
    // palavra "doador" no texto de cada arquivo. Ao comentar a exclusão real do varredor
    // de cobertura, ele continuou VERDE — porque o comentário que EXPLICA a exclusão
    // também contém a palavra. Estava atestando a exclusão pela papelada que a declara,
    // exatamente como o guard de CONQUISTAS do ENT05 atestava um leitor pelo registro que
    // o nomeia. O que se afirma aqui agora é EFEITO, e efeito se derruba.

    // Os três tsconfig: a exclusão tem de estar DENTRO do array `exclude`, e não num
    // comentário ao lado dele.
    for (const cfg of ["tsconfig.json", "tsconfig.backend.json", "tsconfig.scripts.json"]) {
      const bruto = readFileSync(resolve(RAIZ, cfg), "utf8");
      const semComentario = bruto.replace(/^\s*\/\/.*$/gm, "");
      const m = /"exclude"\s*:\s*\[([^\]]*)\]/.exec(semComentario);
      expect(m, `${cfg} não tem array "exclude"`).not.toBeNull();
      const itens = [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1] ?? "");
      expect(itens, `${cfg}: "doador" saiu do array exclude`).toContain(
        DIRETORIOS_INERTES[0]
      );
    }

    // As duas configurações do vitest: lido da configuração REAL que o runner usa.
    for (const cfg of ["../vitest.config.js", "../vitest.rapido.config.js"]) {
      const mod: { default?: { test?: { exclude?: readonly string[] } } } = await import(cfg);
      const exclude = mod.default?.test?.exclude ?? [];
      expect(exclude, `${cfg}: o exclude parou de listar o doador`).toContain(
        `${DIRETORIOS_INERTES[0]}/**`
      );
    }

    // O caminhador da partição: nenhum arquivo de teste do doador entra na conta que
    // `particao-da-suite.test.ts` cobra de uma das duas partições.
    const { arquivosDeTeste } = await import("./particao-da-suite.js");
    const testes = arquivosDeTeste(RAIZ);
    expect(testes.length).toBeGreaterThan(150);
    expect(testes.filter((t) => ehInerte(t))).toEqual([]);
  });

  /**
   * ⚠️ A PROVA DE QUE O INSTRUMENTO ACUSA — nas duas direções, sobre conteúdo sintético.
   *
   * Um guard que varre o disco e diz "nenhuma violação" está sempre verde nos dois casos
   * que importam: quando não há violação, e quando ele parou de enxergar. Estes dois testes
   * separam os dois casos sem depender do estado do disco.
   *
   * ⚠️ OS ESPECIFICADORES SÃO MONTADOS POR CONCATENAÇÃO, e não escritos inteiros. Escrito
   * inteiro, o literal deste arquivo seria, ele próprio, um import de doador aos olhos da
   * varredura acima — e a saída seria isentar o guard de si mesmo, que é um buraco no lugar
   * exato onde não pode haver um.
   */
  const DENTRO = `${DIRETORIOS_INERTES[0]}/saas-municipal/packages/folha-engine/src/index.js`;

  it("acusa: um import do doador num arquivo de produto é apontado com linha", () => {
    const falso = ["const a = 1;", `import { x } from "../../${DENTRO}";`, "export { a };"].join(
      "\n"
    );

    const achados = especificadoresDe(falso).filter((e) => apontaParaInerte(e.spec));

    expect(achados).toHaveLength(1);
    expect(achados[0]?.linha).toBe(2);
    expect(achados[0]?.spec).toContain(DIRETORIOS_INERTES[0]);
  });

  it("não acusa: a palavra em prosa, em caminho parecido e no próprio produto", () => {
    // Prosa e documentação citam o diretório o tempo todo — inclusive este arquivo.
    expect(especificadoresDe(`// o ${DENTRO} não entra no build`)).toEqual([]);

    // Import legítimo do produto, e um caminho que só COMEÇA parecido.
    const legitimo = [
      'import { Decimal } from "decimal.js";',
      'import { x } from "../doadores-de-sangue/porta.js";',
      'import { y } from "./doador.js";',
    ].join("\n");
    expect(especificadoresDe(legitimo).filter((e) => apontaParaInerte(e.spec))).toEqual([]);
  });

  it("a varredura real alcança o produto inteiro — não está olhando para o vazio", () => {
    // ⚠️ A AMARRAÇÃO DE SANIDADE. Sem ela, um `git ls-files` que devolvesse lista vazia
    // deixaria as duas primeiras asserções verdes por vacuidade — o modo de falha que
    // `raizes-dominio.ts` documenta como pior que teste vermelho.
    const versionados = arquivosVersionados();
    const doProduto = versionados.filter((a) => !ehInerte(a) && CODIGO.test(a));
    const doDoador = versionados.filter((a) => ehInerte(a));

    expect(doProduto.length).toBeGreaterThan(400);
    expect(doDoador.length).toBeGreaterThan(200);
    expect(doProduto.some((a) => a === "modules/m01-core-contabil/roteiros.ts")).toBe(true);
  });
});
