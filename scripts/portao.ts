import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decidirFuso, diffDoRepositorio } from "./fuso-do-diff.js";

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
  /**
   * ⚠️ AGENDAMENTO — passo que pode ser pulado por decisão MEDIDA, nunca por escolha de
   * quem roda. A função lê o diff e devolve o porquê; o relatório imprime esse porquê
   * junto do passo, para que "pulado" nunca apareça sem a razão ao lado.
   */
  readonly agendamento?: () => { readonly roda: boolean; readonly porque: string };
}

/** Onde fica gravado o commit do último portão inteiramente verde. */
const MARCA_DO_ULTIMO_VERDE = join(PASTA, "ultimo-portao-verde");

/** `--fim-de-lote` obriga o fuso. É o único ponto manual, e ele só ADICIONA rigor. */
const FIM_DE_LOTE = process.argv.includes("--fim-de-lote");

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
    agendamento: () => decidirFuso(diffDoRepositorio(RAIZ, MARCA_DO_ULTIMO_VERDE, FIM_DE_LOTE)),
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

/**
 * ⚠️ O HEAP DO `tsc`, E POR QUE ELE PRECISOU SER DECLARADO (ENT05).
 *
 * O Node usa ~2 GB de heap velho por padrão. Com os três domínios novos do ENT05
 * (almoxarifado físico, gestão do bem, compras), o cliente gerado do Prisma cresceu o
 * bastante para que `tsc -p tsconfig.scripts.json` ESTOURASSE — e o modo de falha é o
 * pior possível: o processo morre com "JavaScript heap out of memory" e exit != 0, o
 * portão marca o passo como FALHOU, e **os erros de tipo reais ficam invisíveis**.
 *
 * Foi literalmente o que aconteceu: sob 2 GB o passo morria; sob 3 GB ele rodou e acusou
 * 54 chaves duplicadas em `scripts/marcar-catalogo.ts`. O estouro estava MASCARANDO
 * defeito de verdade.
 *
 * 3 GB é o teto medido nesta máquina de 8 GB — e ele cabe porque o trinco garante que
 * nada pesado roda junto. Se um dia não couber, o sinal é o mesmo: o passo morre, e a
 * resposta é medir de novo, nunca baixar o número até "passar".
 */
const HEAP_DO_PASSO: Readonly<Record<string, number>> = {
  "typecheck:backend": 3072,
  "typecheck:app": 3072,
  "typecheck:scripts": 3072,
  // ⚠️ O `next build` ESTOUROU PELO MESMO MOTIVO, e no mesmo lote: ele typechecka o app
  // inteiro durante a compilação. O log dizia apenas "Ineffective mark-compacts near heap
  // limit" — nenhuma linha sobre qual arquivo, porque o processo morre antes de reportar.
  build: 4096,
};

interface Resultado {
  readonly nome: string;
  readonly estado: "passou" | "falhou" | "pulado" | "agendado";
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
  const heap = HEAP_DO_PASSO[passo.nome];
  writeFileSync(
    registro,
    `# passo ..... ${passo.nome}\n` +
      `# comando ... ${passo.comando.join(" ")}\n` +
      `# TZ ........ ${tz ?? process.env["TZ"] ?? "(nao definido)"}\n` +
      `# heap ...... ${heap === undefined ? "(padrao do node)" : `${heap} MB`}\n` +
      `# quando .... ${new Date().toISOString()}\n\n`
  );

  const inicio = Date.now();
  const [bin, ...args] = passo.comando;
  const r = spawnSync(bin as string, args, {
    cwd: RAIZ,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(tz === undefined ? {} : { TZ: tz }),
      ...(heap === undefined
        ? {}
        : {
            NODE_OPTIONS: `${process.env["NODE_OPTIONS"] ?? ""} --max-old-space-size=${heap}`.trim(),
          }),
    },
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

  const agenda = passo.agendamento?.();
  if (agenda !== undefined && !agenda.roda) {
    // ⚠️ "agendado" E NÃO "pulado", e a distinção é o ponto. `pulado` aqui em cima quer
    // dizer "não pôde rodar porque algo quebrou antes"; `agendado` quer dizer "não
    // precisava rodar, por esta razão medida". Somar os dois no mesmo balde faria o
    // relatório mentir por ambiguidade.
    console.log(`[agenda ] ${passo.nome.padEnd(22)} não roda — ${agenda.porque}`);
    resultados.push({
      nome: passo.nome,
      estado: "agendado",
      segundos: 0,
      registro,
      motivo: agenda.porque,
    });
    continue;
  }
  if (agenda !== undefined) {
    console.log(`[agenda ] ${passo.nome.padEnd(22)} roda — ${agenda.porque}`);
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
  const marca =
    r.estado === "passou"
      ? "ok    "
      : r.estado === "falhou"
        ? "FALHOU"
        : r.estado === "agendado"
          ? "agenda"
          : "pulado";
  console.log(
    `  ${marca}  ${r.nome.padEnd(22)} ${String(r.segundos).padStart(4)}s  ${r.motivo ?? ""}`
  );
}

const falhou = resultados.filter((r) => r.estado === "falhou" || r.estado === "pulado");
const agendados = resultados.filter((r) => r.estado === "agendado");
const passaramTodos = resultados.filter((r) => r.estado === "passou");

// ⚠️ A CONTA NÃO ESCONDE O AGENDADO. "10 de 10" com o fuso pulado seria verdadeiro e
// enganoso ao mesmo tempo — a mesma mentira por omissão que o aviso do smoke lá embaixo
// existe para não cometer. O agendado sai FORA do numerador e nomeado.
const alvo = resultados.length - agendados.length;
console.log(
  `\n${passaramTodos.length} de ${alvo} passos` +
    (agendados.length === 0
      ? ""
      : `, ${agendados.length} agendado${agendados.length > 1 ? "s" : ""} para fora desta rodada`) +
    `.  Saída bruta em ${PASTA}\n`
);
if (agendados.length > 0) {
  console.log(
    `⚠️ NÃO RODOU NESTA RODADA, POR AGENDAMENTO — e roda no portão de fechamento:\n` +
      agendados.map((r) => `   · ${r.nome}: ${r.motivo ?? ""}`).join("\n") +
      `\n   Para obrigar agora: \`npm run portao -- --fim-de-lote\`.\n`
  );
}
console.log(
  `⚠️ O que o portão NÃO roda, e precisa de execução à parte:\n` +
    `   · o smoke pelo navegador (exige \`next start\` + Chromium; não cabe junto da suíte\n` +
    `     nesta máquina — ver scripts/trinco-de-maquina.ts);\n` +
    `   · os seeds de produção contra um banco limpo (\`test/seed-de-producao.test.ts\` os\n` +
    `     cobre dentro da suíte, mas a instalação real é outro percurso).\n`
);

// ⚠️ A MARCA SÓ AVANÇA EM PORTÃO VERDE, e é o que faz o agendamento ser seguro: o diff da
// próxima rodada parte daqui, então uma mudança de relógio feita num portão vermelho
// continua dentro do diff da rodada seguinte, em vez de ficar para trás sem nunca ter sido
// medida sob fuso deslocado.
if (falhou.length === 0) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: RAIZ, encoding: "utf8" });
  if (r.status === 0) writeFileSync(MARCA_DO_ULTIMO_VERDE, `${(r.stdout ?? "").trim()}\n`);
}

process.exit(falhou.length === 0 ? 0 : 1);
