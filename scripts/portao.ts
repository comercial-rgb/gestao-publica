import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ═══ O PORTÃO — A SEQUÊNCIA DO GATE, EXECUTÁVEL EM VEZ DE PROSA ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO CORRIGE. Até o ENT03c o "gate" era uma TABELA em
 * `ESTADO-EXECUCAO.md`: nove comandos que alguém precisava lembrar de rodar, na ordem
 * certa, e cujos resultados alguém precisava lembrar de transcrever. Isso tem dois modos
 * de falha, e os dois já aconteceram neste projeto:
 *
 *   · **esquecer um passo** — o `deriva` nasceu porque um índice criado por SQL e não
 *     declarado no modelo passou por três lotes sem que ninguém percebesse;
 *   · **transcrever o resultado errado** — um número copiado à mão não tem procedência,
 *     e um lote inteiro pode ser declarado verde sobre uma execução que ninguém refez.
 *
 * Uma lista de comandos em documento é DISCIPLINA. Disciplina falha no dia cansado — a
 * mesma lição do `grep` que apagou os nomes dos testes intermitentes.
 *
 * ⚠️ E ELE **NÃO PARA NO PRIMEIRO ERRO**, de propósito. A tentação é abortar para poupar
 * tempo, e o efeito é o pior tipo de relatório: "falhou no passo 2" esconde que os passos
 * 5 e 8 também falhariam, e a correção vira uma sequência de rodadas de 11 minutos cada.
 * Só os passos que DEPENDEM de outro são pulados quando o anterior cai — e o relatório diz
 * que foram pulados, em vez de fingir que passaram.
 *
 * ⚠️ TODA SAÍDA VAI PARA DISCO ANTES DE APARECER. Mesma regra do
 * `scripts/trinco-de-maquina.ts`, e pelo mesmo motivo: o que não foi gravado não se
 * investiga.
 *
 * ⚠️ O SMOKE NÃO ENTRA AQUI. Ele exige `next build` + um servidor de pé + navegador, e numa
 * máquina de 8 GB ele não pode dividir a memória com a suíte (ver o trinco). O portão
 * NOMEIA isso no fim em vez de omitir — um gate que silencia o que não rodou mente por
 * omissão.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTA = join(RAIZ, ".registro-de-execucao");

interface Passo {
  readonly nome: string;
  readonly comando: readonly string[];
  /** O que este passo protege — vai para o relatório, para quem não acompanhou. */
  readonly protege: string;
  /** Só roda se estes passos passaram. */
  readonly depende?: readonly string[];
}

const PASSOS: readonly Passo[] = [
  {
    nome: "typecheck:backend",
    comando: ["npx", "tsc", "--noEmit", "-p", "tsconfig.backend.json"],
    protege: "os módulos e os seeds compilam",
  },
  {
    nome: "typecheck:app",
    comando: ["npx", "tsc", "--noEmit", "-p", "tsconfig.json"],
    protege: "as telas e as portas compilam",
  },
  {
    nome: "typecheck:scripts",
    comando: ["npx", "tsc", "--noEmit", "-p", "tsconfig.scripts.json"],
    protege: "os scripts compilam — inclusive este",
  },
  {
    nome: "cobertura-de-tsconfig",
    comando: ["npx", "tsx", "scripts/cobertura-de-tsconfig.ts"],
    protege: "nenhum arquivo .ts fica fora dos três tsconfig — arquivo descoberto não é conferido por ninguém",
  },
  {
    nome: "prisma:validate",
    comando: ["npx", "prisma", "validate"],
    protege: "o schema multi-arquivo é válido",
  },
  {
    nome: "deriva",
    comando: ["npx", "tsx", "scripts/deriva-de-schema.ts"],
    protege: "migrations e modelo dizem a mesma coisa, e o SQL manual está declarado",
    depende: ["prisma:validate"],
  },
  {
    nome: "test:rapido",
    comando: ["npx", "vitest", "run", "-c", "vitest.rapido.config.ts"],
    protege: "o domínio puro — inclui o guard de tabela morta e o de data civil",
  },
  {
    nome: "test:tudo",
    comando: ["npx", "vitest", "run"],
    protege: "a suíte inteira, contra banco",
    depende: ["prisma:validate"],
  },
  {
    nome: "test:fuso",
    comando: ["npx", "vitest", "run"],
    protege:
      "a suíte inteira sob TZ deslocado — a propriedade que pega leitura de relógio do hospedeiro",
    depende: ["test:tudo"],
  },
  {
    nome: "build",
    comando: ["npx", "next", "build"],
    protege: "a aplicação constrói",
    depende: ["typecheck:app"],
  },
];

/** O passo do fuso é o mesmo comando com o relógio deslocado — não um comando diferente. */
const TZ_DO_PASSO: Readonly<Record<string, string>> = {
  "test:fuso": "Pacific/Kiritimati",
};

interface Resultado {
  readonly nome: string;
  readonly estado: "passou" | "falhou" | "pulado";
  readonly segundos: number;
  readonly registro: string;
  readonly motivo?: string;
}

/**
 * ⚠️ ESCRITA **SÍNCRONA**, E ISSO É UMA CORREÇÃO, NÃO UM DETALHE DE ESTILO.
 *
 * A primeira versão usava `createWriteStream`. O arquivo de cada passo NUNCA APARECEU: o
 * `spawnSync` abaixo **bloqueia o event loop** durante os minutos inteiros do passo, e a
 * escrita de um stream é assíncrona — ela fica enfileirada esperando um loop que só volta a
 * girar quando tudo termina. O portão imprimia "FALHOU — ver <caminho>" e o caminho não
 * existia.
 *
 * É EXATAMENTE a classe de defeito que o ITEM 4 deste lote existe para impedir — saída que
 * não chega ao disco — reaparecida dentro da ferramenta construída para impedi-la. E ela só
 * apareceu porque um passo falhou de verdade e alguém foi ler o arquivo apontado.
 *
 * `appendFileSync` devolve só quando os bytes foram escritos. Num orquestrador que já é
 * síncrono de ponta a ponta, o stream não dava nenhuma vantagem e custava a garantia.
 */
function rodar(passo: Passo, registro: string): { ok: boolean; segundos: number } {
  const tz = TZ_DO_PASSO[passo.nome];
  writeFileSync(
    registro,
    `# passo ..... ${passo.nome}\n` +
      `# comando ... ${passo.comando.join(" ")}\n` +
      `# TZ ........ ${tz ?? process.env["TZ"] ?? "(nao definido)"}\n` +
      `# quando .... ${new Date().toISOString()}\n\n`
  );

  const inicio = Date.now();
  const [bin, ...args] = passo.comando;
  const r = spawnSync(bin as string, args, {
    cwd: RAIZ,
    encoding: "utf8",
    env: tz === undefined ? process.env : { ...process.env, TZ: tz },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  appendFileSync(registro, `${r.stdout ?? ""}${r.stderr ?? ""}`);

  const segundos = Math.round((Date.now() - inicio) / 1000);
  // ⚠️ O CÓDIGO DE SAÍDA MANDA. Procurar "0 falhas" no texto seria adivinhação: um comando
  // que morre por falta de memória não imprime nada e não teria falha nenhuma "no texto".
  return { ok: r.status === 0, segundos };
}

mkdirSync(PASTA, { recursive: true });
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const resultados: Resultado[] = [];
const passaram = new Set<string>();

console.log(`\n═══ PORTÃO — ${PASSOS.length} passos ═══\n`);

for (const passo of PASSOS) {
  const pendente = (passo.depende ?? []).filter((d) => !passaram.has(d));
  const registro = join(PASTA, `portao-${carimbo}-${passo.nome.replace(/:/g, "-")}.log`);

  if (pendente.length > 0) {
    const motivo = `depende de ${pendente.join(", ")}, que não passou`;
    console.log(`[pulado ] ${passo.nome.padEnd(22)} ${motivo}`);
    resultados.push({ nome: passo.nome, estado: "pulado", segundos: 0, registro, motivo });
    continue;
  }

  process.stdout.write(`[rodando] ${passo.nome.padEnd(22)} `);
  const { ok, segundos } = rodar(passo, registro);
  console.log(ok ? `ok (${segundos}s)` : `FALHOU (${segundos}s) — ver ${registro}`);
  resultados.push({
    nome: passo.nome,
    estado: ok ? "passou" : "falhou",
    segundos,
    registro,
  });
  if (ok) passaram.add(passo.nome);
}

console.log(`\n═══ RESULTADO ═══\n`);
for (const r of resultados) {
  const marca = r.estado === "passou" ? "ok    " : r.estado === "falhou" ? "FALHOU" : "pulado";
  console.log(
    `  ${marca}  ${r.nome.padEnd(22)} ${String(r.segundos).padStart(4)}s  ${r.motivo ?? ""}`
  );
}

const falhou = resultados.filter((r) => r.estado !== "passou");
console.log(
  `\n${resultados.length - falhou.length} de ${resultados.length} passos.  ` +
    `Saída bruta em ${PASTA}\n`
);
console.log(
  `⚠️ O que o portão NÃO roda, e precisa de execução à parte:\n` +
    `   · o smoke pelo navegador (exige \`next start\` + Chromium; não cabe junto da suíte\n` +
    `     nesta máquina — ver scripts/trinco-de-maquina.ts);\n` +
    `   · os seeds de produção contra um banco limpo (\`test/seed-de-producao.test.ts\` os\n` +
    `     cobre dentro da suíte, mas a instalação real é outro percurso).\n`
);

process.exit(falhou.length === 0 ? 0 : 1);
