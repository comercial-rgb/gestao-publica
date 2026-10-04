import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * V35 — `npx`/`npm` no Windows: pelo node, com o cli do npm que vem junto dele (`<pasta do node>/node_modules/npm/bin`).
 * Qualquer outro comando, e qualquer comando fora do Windows, sobe como veio.
 */
export function resolverNoWindows(comando: string, args: readonly string[]): [string, string[]] {
  if (process.platform !== "win32" || (comando !== "npx" && comando !== "npm")) return [comando, [...args]];
  const cli = join(dirname(process.execPath), "node_modules", "npm", "bin", `${comando}-cli.js`);
  return [process.execPath, [cli, ...args]];
}

/**
 * O TRINCO DE MÁQUINA — um trabalho pesado por vez, porque o recurso escasso é a RAM.
 *
 * ═══ ⚠️ ELE NÃO SUBSTITUI A TRAVA DA SUÍTE, E NÃO É A MESMA COISA ═══
 * `test/trava-da-suite.ts` protege o BANCO: duas suítes contra o mesmo
 * `gestao_publica_test` apagam a semente uma da outra. É um advisory lock do Postgres, e
 * ele é por BANCO — duas suítes em bancos diferentes podem correr juntas sem problema.
 *
 * Este protege a MÁQUINA. Duas suítes em bancos diferentes não se corrompem, mas nesta
 * máquina elas se matam de outro jeito: por memória. São problemas diferentes, com
 * granularidades diferentes, e por isso são dois trincos.
 *
 * ═══ ⚠️ OS NÚMEROS QUE MOTIVARAM ISTO, MEDIDOS EM 2026-09-10 ═══
 * Máquina: 8 GB de RAM, 8 CPUs, macOS.
 *
 *   · em repouso ....... 7,4 GB dos 8 GB de swap em uso, ~69 MB de RAM livre;
 *   · Docker ........... 3,825 GiB reservados para a VM, dos quais `pg-gestao-publica`
 *                        sozinho ocupa 803 MB;
 *   · durante a suíte .. RAM livre entre **29 MB e 232 MB** (média 70);
 *   · durante o smoke .. RAM livre entre **52 MB e 70 MB**, e o swap chega a
 *                        **7857 MB de 8192** — 96% dele.
 *
 * Cada um passa sozinho. Os dois juntos não passam, e o modo de falha é o pior que existe
 * para diagnosticar: o renderer do Chromium é paginado para o disco, o runtime dele PARA,
 * e o puppeteer devolve `Runtime.callFunctionOn timed out`. **Isso se lê como "a tela não
 * respondeu"** — e manda a pessoa procurar o defeito no React, na Server Action, na porta.
 * Foi o que aconteceu no ENT02, e custou uma investigação inteira.
 *
 * ═══ ⚠️ POR QUE NÃO "LIMITAR A CONCORRÊNCIA DA SUÍTE" ═══
 * Era a saída mais óbvia e renderia pouco. O RSS somado dos processos node no pico da
 * suíte foi **538 MB** — ela não é a maior consumidora da máquina. Os 3,8 GiB do Docker e
 * o editor são. Cortar workers da suíte a deixaria mais lenta sem devolver a memória que
 * falta; o que devolve memória é **não sobrepor**.
 *
 * (A suíte já roda com `fileParallelism: false`, e isso continua — por causa do banco
 * compartilhado, não por causa da memória.)
 *
 * ═══ ⚠️ POR QUE ARQUIVO, E NÃO ADVISORY LOCK ═══
 * A trava da suíte pôde ser um advisory lock porque o Postgres já estava aberto e o alvo
 * ERA ele. Aqui o alvo é a máquina, e nem todo trabalho pesado fala com o banco de teste —
 * `next build` não fala com banco nenhum. Exigir Postgres para poder buildar seria
 * inventar uma dependência.
 *
 * ⚠️ E O `kill -9` NÃO DEIXA O TRINCO PRESO. O arquivo guarda o PID, e quem chega confere
 * se aquele processo ainda vive (`kill(pid, 0)`). Um trinco órfão é tomado, com aviso — é
 * a defesa que falta a um arquivo de trinco ingênuo, e é justamente por ela que arquivos
 * de trinco têm má fama.
 *
 * ═══ ⚠️ SE VOCÊ VAI ESCREVER UM WRAPPER PARA CHAMAR ISTO, LEIA ESTAS LINHAS ═══
 *
 * **Um invólucro que imprime o código do filho como TEXTO e termina em `echo` sai 0 — e
 * transforma este registro num mentiroso sem que ele tenha culpa.**
 *
 *     ERRADO                              CERTO
 *     npx vitest run ...                  npx vitest run ...
 *     echo "### exit=$?"   ← sai 0        rc=$?; echo "### exit=$rc"; exit $rc
 *
 * Custou seis leituras enganosas em 23/09/2026 e duas quase-viradas em verde falso — e a
 * investigação acusou ESTE arquivo por um dia antes de alguém cruzar `# comando` com
 * `# desfecho` e ver que, com filho DIRETO, ele sempre disse a verdade (inclusive o SIGABRT
 * do OOM e o SIGTERM). A propagação sempre esteve certa; o wrapper é que mentia.
 *
 * A guarda de `divergenciasComCodigoZero` existe para que isso não dependa de ninguém
 * lembrar — mas ela é rede, não desculpa. Escreva o `exit $rc`.
 */

const CAMINHO = join(tmpdir(), "gestao-publica-trabalho-pesado.trinco");

/**
 * ⚠️ O PID DO DONO, HERDADO PELOS DESCENDENTES. Ver `travarAMaquina` — é o que distingue
 * "um segundo trabalho pesado" de "um pedaço do trabalho que já está rodando".
 */
export const VARIAVEL_DO_DONO = "TRINCO_DE_MAQUINA_DONO";

interface Dono {
  readonly pid: number;
  readonly tarefa: string;
  readonly desde: string;
}

/** O processo ainda existe? `kill(pid, 0)` não envia sinal: só pergunta. */
function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function donoAtual(): Dono | null {
  if (!existsSync(CAMINHO)) return null;
  try {
    const d = JSON.parse(readFileSync(CAMINHO, "utf8")) as Dono;
    return typeof d.pid === "number" ? d : null;
  } catch {
    // Arquivo truncado por uma escrita interrompida. Trata como ausente — e o
    // `tomar` abaixo o sobrescreve.
    return null;
  }
}

export interface TrincoDeMaquina {
  readonly liberar: () => void;
}

/**
 * TOMA O TRINCO, ou FALHA dizendo quem o tem e há quanto tempo.
 *
 * ⚠️ FALHA EM VEZ DE ESPERAR, pela mesma razão da trava da suíte: uma espera silenciosa
 * parece travamento, e quem lançou o comando não sabe se está compilando, conectando ou
 * enfileirado. O caso real não são duas pessoas — é a mesma pessoa com duas janelas.
 */
export function travarAMaquina(tarefa: string): TrincoDeMaquina {
  const dono = donoAtual();

  // ═══ ⚠️ UM DESCENDENTE DO DONO NÃO É UM SEGUNDO TRABALHO PESADO ═══
  //
  // O CASO REAL, medido em 11/09/2026 no portão do ENT04. `test/registro-de-execucao.test.ts`
  // roda o próprio trinco como filho para provar que a saída bruta chega ao disco. Sozinho
  // ele passava (654/654). **Dentro do portão ele falhava sempre** — porque o portão roda
  // sob o trinco, o trinco aninhado encontrava o dono vivo e recusava, e o filho saía com
  // código 1 em vez do 3 que o script pediu. O portão inteiro ficava vermelho por isso, nas
  // duas suítes: 1 falha em 654 e 1 em 1.910, o mesmo arquivo.
  //
  // ⚠️ E O DEFEITO NÃO ERA DO TESTE. O trinco conta MÁQUINA, não processo: quando o dono é
  // um ancestral, a máquina JÁ ESTÁ contabilizada por ele. Recusar ali não protegia memória
  // nenhuma — só impedia que qualquer trabalho pesado invocasse a si mesmo. Era uma armadilha
  // latente para qualquer passo futuro do portão que chamasse um comando com trinco.
  //
  // ⚠️ POR QUE ISTO NÃO É UMA PORTA DOS FUNDOS. A variável não é uma dispensa que alguém
  // liga: ela só vale se apontar para o PID QUE DE FATO DETÉM o trinco agora e que ainda
  // está vivo. Um valor herdado de um shell antigo, ou forjado para um PID qualquer, não
  // casa com o dono do arquivo e é recusado como qualquer outro — há teste de negação para
  // exatamente isso.
  //
  // ⚠️ O QUE ELA NÃO PROTEGE, DITO EM VOZ ALTA: um trabalho pesado que dispare OUTRO trabalho
  // pesado **em paralelo consigo mesmo** passa agora. Nada no repositório faz isso — os passos
  // do portão são sequenciais — e o dia em que alguém fizer, esta é a linha a reler.
  const herdado = Number.parseInt(process.env[VARIAVEL_DO_DONO] ?? "", 10);
  if (
    dono !== null &&
    Number.isInteger(herdado) &&
    dono.pid === herdado &&
    vivo(dono.pid)
  ) {
    // Não toma e NÃO LIBERA: o arquivo é do ancestral, e apagá-lo aqui soltaria a máquina
    // enquanto o trabalho dele ainda corre.
    return { liberar: (): void => {} };
  }

  if (dono !== null && dono.pid !== process.pid) {
    if (vivo(dono.pid)) {
      throw new Error(
        `\n\n⚠️ JÁ HÁ TRABALHO PESADO RODANDO NESTA MÁQUINA.\n\n` +
          `Tarefa em curso: ${dono.tarefa} (processo ${dono.pid}, desde ${dono.desde})\n` +
          `Tarefa recusada: ${tarefa}\n\n` +
          `Esta máquina tem 8 GB de RAM e opera no teto: medido em 10/09/2026, ela fica ` +
          `com 29 a 70 MB de RAM livre durante a suíte e chega a 96% do swap durante o ` +
          `smoke. Suíte e navegador ao mesmo tempo NÃO cabem.\n\n` +
          `E o modo de falha engana: o renderer do Chromium é paginado para o disco, o ` +
          `runtime dele para, e o puppeteer devolve "Runtime.callFunctionOn timed out" — ` +
          `que se lê como "a tela não respondeu" e manda procurar o defeito no código. ` +
          `Custou uma investigação inteira no ENT02.\n\n` +
          `O que fazer: espere a outra tarefa terminar. Se ela morreu sem soltar o ` +
          `trinco, o próximo comando o toma sozinho — o arquivo guarda o PID e ele é ` +
          `conferido.\n`
      );
    }
    // ⚠️ TRINCO ÓRFÃO. O dono morreu sem liberar (kill -9, queda de energia). Toma, mas
    // AVISA — silêncio aqui esconderia um padrão: se isto aparece toda vez, algo está
    // matando as tarefas, e é isso que precisa ser investigado.
    console.warn(
      `[trinco] o processo ${dono.pid} (${dono.tarefa}) não existe mais; assumindo o ` +
        `trinco órfão deixado por ele.`
    );
  }

  writeFileSync(
    CAMINHO,
    JSON.stringify({
      pid: process.pid,
      tarefa,
      desde: new Date().toLocaleString("pt-BR"),
    } satisfies Dono)
  );

  // ⚠️ DAQUI PARA BAIXO, TODO DESCENDENTE HERDA O PID DO DONO. `process.env` é copiado para
  // cada filho no `spawn`, então não há nada a passar à mão: o portão, o vitest, os workers
  // do vitest e o que eles dispararem já chegam sabendo de quem é o trinco.
  process.env[VARIAVEL_DO_DONO] = String(process.pid);

  let liberado = false;
  const liberar = (): void => {
    if (liberado) return;
    liberado = true;
    // ⚠️ SÓ LIBERA O QUE É SEU. Se outro processo assumiu o trinco no meio (porque este
    // aqui foi dado como morto), apagar o arquivo tiraria o trinco DELE.
    const atual = donoAtual();
    if (atual?.pid === process.pid && existsSync(CAMINHO)) unlinkSync(CAMINHO);
  };

  // Solta em qualquer saída — inclusive Ctrl+C, que é como a maioria das execuções
  // longas termina de verdade.
  process.on("exit", liberar);
  process.on("SIGINT", () => {
    liberar();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    liberar();
    process.exit(143);
  });

  return { liberar };
}

/**
 * ═══ O REGISTRO BRUTO — GRAVAR PRIMEIRO, FILTRAR DEPOIS ═══
 *
 * ⚠️ O QUE ACONTECEU, E É O MOTIVO DESTE TRECHO EXISTIR. No fechamento do ENT03c, uma
 * execução do `test:fuso` acusou **2 falhas em 1.869** e os NOMES DOS TESTES QUE FALHARAM
 * SE PERDERAM. Não porque o Vitest não os tenha impresso: porque o comando que os
 * capturava era `npm run test:fuso | grep ...`, e o `grep` descartou tudo que não casava
 * ANTES de qualquer coisa ser gravada. Duas execuções seguintes no mesmo commit vieram
 * limpas, e a falha ficou **não isolada** — registrada como intermitência sem nome.
 *
 * **Falha intermitente sem nome é falha que não se investiga.** Uma intermitência só é
 * descartável com o motivo junto; sem o nome do teste não há nem por onde começar.
 *
 * ⚠️ A CORREÇÃO NÃO É "LEMBRAR DE NÃO USAR GREP". Isso é disciplina, e disciplina falha
 * exatamente no dia cansado em que a falha rara aparece. A correção é ESTRUTURAL: o
 * runner não pode mais entregar a saída só ao terminal. Ele a escreve em disco ANTES de
 * ela passar por qualquer cano — e então quem filtrar, filtra a cópia.
 *
 * Por isso `stdio: "inherit"` saiu do stdout/stderr. Ele era a causa: o filho escrevia
 * direto no terminal do chamador, e o que o chamador fizesse com aquilo era irreversível.
 * (A ENTRADA continua herdada — sem isso um comando que pergunta algo trava mudo.)
 *
 * ⚠️ E O AVISO DO CAMINHO VAI PARA `stderr`. Se fosse para `stdout`, o mesmo `| grep` que
 * causou o problema esconderia a única pista de como recuperá-lo.
 */
/**
 * OS NÚMEROS DOS SINAIS QUE APARECEM AQUI. O Node entrega o NOME (`"SIGABRT"`), e a
 * convenção do shell para "morreu por sinal" é `128 + numero`. Só os que esta máquina
 * produz de verdade estão na tabela; um sinal fora dela cai em `128`, que é o
 * comportamento antigo, e o NOME continua no rodapé do registro de qualquer jeito.
 */
const SINAIS: Readonly<Record<string, number>> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGABRT: 6,
  SIGBUS: 10,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
};

const RAIZ_DO_REPO = fileURLToPath(new URL("..", import.meta.url));
const PASTA_DE_REGISTRO = join(RAIZ_DO_REPO, ".registro-de-execucao");

export function caminhoDoRegistro(tarefa: string, quando = new Date()): string {
  const apelido =
    tarefa
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "trabalho-pesado";
  // Carimbo ordenável, sem os dois-pontos que atrapalham nome de arquivo.
  const carimbo = quando.toISOString().replace(/[:.]/g, "-");
  return join(PASTA_DE_REGISTRO, `${apelido}-${carimbo}.log`);
}

/**
 * As linhas que NOMEIAM o que falhou. É a parte "filtrar depois" — e ela roda sobre o
 * texto já gravado, nunca no lugar da gravação.
 */
export function linhasDeFalha(bruto: string): readonly string[] {
  // eslint-disable-next-line no-control-regex
  const semCor = bruto.replace(/\[[0-9;]*m/g, "");
  return semCor
    .split("\n")
    .filter((l) => /^\s*FAIL\s|^\s*(Test Files|Tests)\s+\d+\s+failed/.test(l))
    .map((l) => l.trimEnd());
}

/**
 * ═══ ⚠️ A GUARDA DA DIVERGÊNCIA: CÓDIGO 0 COM CONTEÚDO DE FALHA É INCONCLUSIVO ═══
 *
 * ⚠️ O CASO REAL, 23/09/2026 (V11 V9), e ele acusou o instrumento errado por um dia inteiro.
 * Seis corridas foram lidas como "código 0" enquanto o trabalho dentro delas falhava. A culpa
 * **não era deste arquivo** — ele propagava certo, e foi ele que denunciou o SIGABRT do OOM e o
 * SIGTERM. A culpa era do wrapper de quem chamou, que terminava em `echo "### exit=$?"`: o
 * `echo` tem sucesso, e o script saía 0 de verdade.
 *
 * Esta guarda existe para que isso não dependa de ninguém lembrar: se o filho sai 0 mas o que
 * foi GRAVADO contradiz esse zero, o desfecho vira **INCONCLUSIVO** e o trinco sai não-zero.
 * "Resultado correspondente ao conteúdo verificado" — e, na divergência, nunca verde.
 *
 * ═══ ⚠️ POR QUE A LISTA É CURTA, E POR QUE `error TS` NÃO ESTÁ NELA ═══
 * "Propriedade, não padrão": uma guarda que enumera formas de falha casa com texto que apenas
 * PARECE falha — e guarda que grita à toa é desligada em três semanas, o que a torna pior que
 * guarda nenhuma, porque enquanto viveu deu conforto.
 *
 * A propriedade que qualifica um sinal aqui é estreita: **ele não pode aparecer numa corrida
 * que terminou em 0 de verdade.** Por isso:
 *
 *   · `### exit-…=<não-zero>` — a convenção de wrapper que originou o defeito;
 *   · o SUMÁRIO do vitest (`Tests N failed`) — o vitest que soma falha não sai 0;
 *   · o `FATAL ERROR … heap out of memory` do V8 — processo que aborta não sai 0.
 *
 * **`error TS` e `FAIL ` ficam DE FORA de propósito.** Um `tsc` com erro já sai 2, então o
 * sinal não acrescenta nada quando o código é 0 — e as duas cadeias aparecem legitimamente em
 * saída de teste que fala SOBRE erros de tipo (este repositório tem grep-testes assim).
 * Incluí-las trocaria um defeito raro por ruído frequente. A contraprova está em
 * `test/trinco-desfecho.test.ts`, e ela vale tanto quanto os casos de acusação.
 */

/**
 * O código com que o trinco sai quando o conteúdo contradiz o zero do filho.
 *
 * ⚠️ NÃO É 1, e não é estética. `1` se confunde com "a suíte reprovou", que é um resultado
 * legítimo e já tem dono. Este número diz outra coisa: **a medição não vale**. Quem automatiza
 * precisa distinguir "falhou" de "não dá para saber".
 */
const CODIGO_INCONCLUSIVO = 3;

const DIVERGENCIAS: readonly { readonly nome: string; readonly re: RegExp }[] = [
  { nome: "wrapper imprimiu codigo de falha e saiu 0", re: /^###\s*exit[A-Za-z0-9_-]*\s*=\s*([1-9][0-9]*)\s*$/ },
  { nome: "sumario do vitest acusa falha", re: /^\s*(Test Files|Tests)\s+\d+\s+failed\b/ },
  { nome: "aborto do V8 por memoria", re: /FATAL ERROR:.*heap out of memory/ },
];

/**
 * As linhas que CONTRADIZEM um código de saída zero. Vazio = não há divergência.
 *
 * ⚠️ Só faz sentido chamar quando o filho saiu 0. Com código não-zero não há nada a
 * reconciliar: o próprio código já disse que falhou.
 */
export function divergenciasComCodigoZero(bruto: string): readonly string[] {
  // eslint-disable-next-line no-control-regex
  const semCor = bruto.replace(/\[[0-9;]*m/g, "").replace(/\[[0-9;]*m/g, "");
  const achados: string[] = [];
  for (const linha of semCor.split("\n")) {
    const l = linha.trimEnd();
    for (const d of DIVERGENCIAS) {
      if (d.re.test(l)) achados.push(`${d.nome}: ${l.trim()}`);
    }
  }
  return achados;
}

/**
 * Uso como comando: `tsx scripts/trinco-de-maquina.ts <tarefa> -- <comando...>`
 *
 * Ele toma o trinco, roda o comando GRAVANDO a saída bruta, e solta. O código de saída é o
 * do comando — um wrapper que engolisse o exit code faria a suíte "passar" quando falhou.
 */
if (process.argv[1]?.endsWith("trinco-de-maquina.ts") === true) {
  const separador = process.argv.indexOf("--");
  if (separador === -1 || separador === process.argv.length - 1) {
    console.error(
      "uso: tsx scripts/trinco-de-maquina.ts <tarefa> -- <comando> [args...]"
    );
    process.exit(2);
  }
  const tarefa = process.argv[2] ?? "trabalho pesado";
  const [comando, ...args] = process.argv.slice(separador + 1);

  const trinco = travarAMaquina(tarefa);
  mkdirSync(PASTA_DE_REGISTRO, { recursive: true });
  const registro = caminhoDoRegistro(tarefa);
  const arquivo = createWriteStream(registro, { flags: "a" });

  arquivo.write(
    `# tarefa .... ${tarefa}\n` +
      `# comando ... ${[comando, ...args].join(" ")}\n` +
      `# quando .... ${new Date().toISOString()}\n` +
      `# TZ ........ ${process.env["TZ"] ?? "(nao definido)"}\n` +
      `# node ...... ${process.version}\n\n`
  );
  console.error(`[registro] saida bruta em ${registro}`);

  const { spawn } = await import("node:child_process");
  // V35 — no Windows, `npx`/`npm` são `.cmd`, e desde o Node 20 um `.cmd` não sobe sem shell (medido: "o comando nao
  // pode ser iniciado: spawn npx ENOENT"). Shell não serve: ele junta os argumentos sem escape e quebraria um
  // `node -e "<script>"`. Então os dois sobem pelo próprio node, com o cli do npm ao lado dele. Fora do Windows, nada muda.
  const [exe, argv] = resolverNoWindows(comando as string, args);
  const filho = spawn(exe, argv, {
    stdio: ["inherit", "pipe", "pipe"],
  });

  // ⚠️ AS DUAS PONTAS, NESTA ORDEM: disco primeiro, terminal depois. Cada pedaço é escrito
  // assim que chega — a saída da suíte passa de 1 MB e não é acumulada só em memória.
  let bruto = "";
  const encaminhar = (
    fluxo: NodeJS.ReadableStream,
    saida: NodeJS.WriteStream
  ): void => {
    fluxo.on("data", (pedaco: Buffer) => {
      arquivo.write(pedaco);
      bruto += pedaco.toString("utf8");
      saida.write(pedaco);
    });
  };
  if (filho.stdout !== null) encaminhar(filho.stdout, process.stdout);
  if (filho.stderr !== null) encaminhar(filho.stderr, process.stderr);

  /**
   * ═══ ⚠️ O DESFECHO DO FILHO TAMBÉM É SAÍDA BRUTA — E ELE SE PERDIA ═══
   *
   * ⚠️ O CASO REAL, 15/09/2026 (V8 I0). Três `next build` seguidos morreram no passo de
   * conferência de tipos. O que o terminal mostrava era o despejo do V8 e nada mais; o
   * wrapper saía com **128**, um número que não diz NADA sobre o que aconteceu. A frase que
   * explicava tudo — `Next.js build worker exited with code: null and signal: SIGABRT` — só
   * apareceu porque o worker do Next, por conta própria, a imprimiu. Se o morto fosse o
   * processo do topo, o registro terminaria mudo.
   *
   * **Um registro que guarda o que o filho disse mas não guarda COMO ELE MORREU é meio
   * registro.** O nome do sinal é a diferença entre "estourou a memória" (SIGABRT/SIGKILL
   * atrás de um OOM) e "alguém apertou Ctrl+C" (SIGINT) — e essas duas leituras mandam a
   * investigação para lados opostos.
   *
   * ⚠️ E O CÓDIGO DE SAÍDA PASSA A SER `128 + sinal`, a convenção do shell, em vez do 128
   * cravado. Com o 128 fixo, morte por SIGABRT (134), por SIGKILL do OOM killer (137) e por
   * SIGINT (130) eram o MESMO número para quem automatiza em cima. Nada no repositório
   * dependia do 128 — foi conferido antes de mudar.
   */
  const desfecho = await new Promise<{ codigo: number; sinal: NodeJS.Signals | null }>(
    (resolve) => {
      // ⚠️ `error` COBRE O QUE `close` NÃO COBRE: comando inexistente (ENOENT) e permissão
      // negada não geram `close`. Sem isto, o evento subia como exceção não tratada e o
      // registro terminava sem uma linha dizendo por quê.
      filho.on("error", (e) => {
        const texto = `\n[trinco] o comando nao pode ser iniciado: ${e.message}\n`;
        arquivo.write(texto);
        process.stderr.write(texto);
        resolve({ codigo: 127, sinal: null });
      });
      filho.on("close", (c, sinal) => {
        if (sinal !== null) resolve({ codigo: 128 + (SINAIS[sinal] ?? 0), sinal });
        else resolve({ codigo: c ?? 1, sinal: null });
      });
    }
  );

  // ⚠️ A GUARDA DA DIVERGÊNCIA — só quando o filho saiu 0 e sem sinal. Ver o cabeçalho de
  // `divergenciasComCodigoZero`: com código não-zero ou com sinal não há nada a reconciliar.
  const divergencias =
    desfecho.codigo === 0 && desfecho.sinal === null
      ? divergenciasComCodigoZero(bruto)
      : [];
  const inconclusivo = divergencias.length > 0;

  // O RODAPÉ VAI PARA O ARQUIVO ANTES DE FECHÁ-LO. Quem abrir o log meses depois lê o
  // desfecho no mesmo lugar em que lê o cabeçalho, sem precisar do terminal que já sumiu.
  const rodape =
    `\n# ─────────────────────────────────────────────\n` +
    `# desfecho ... ${
      desfecho.sinal !== null
        ? `MORTO POR SINAL ${desfecho.sinal}`
        : inconclusivo
          ? "INCONCLUSIVO: o codigo do filho diverge do conteudo gravado"
          : desfecho.codigo === 0
            ? "terminou com codigo 0"
            : `terminou com codigo ${desfecho.codigo}`
    }\n` +
    `# codigo ..... ${inconclusivo ? `${desfecho.codigo} (do filho) -> ${CODIGO_INCONCLUSIVO} (deste trinco)` : desfecho.codigo}\n` +
    `# sinal ...... ${desfecho.sinal ?? "(nenhum)"}\n` +
    (inconclusivo ? `# divergencia${divergencias.map((d) => `\n#   · ${d}`).join("")}\n` : "") +
    `# fim ........ ${new Date().toISOString()}\n`;
  arquivo.write(rodape);

  await new Promise<void>((resolve) => arquivo.end(() => resolve()));
  trinco.liberar();

  // O resumo vai para `stderr` junto com o caminho — pelo mesmo motivo do aviso de cima.
  const falhas = linhasDeFalha(bruto);
  if (falhas.length > 0) {
    console.error(`\n[registro] o que falhou, extraido do que foi gravado:`);
    for (const l of falhas) console.error(`  ${l}`);
  }
  // ⚠️ DITO EM VOZ ALTA NO TERMINAL, e não só no arquivo: morte por sinal não é reprovação
  // de teste nem aprovação de nada. É execução que NÃO ACONTECEU, e a regra do repositório
  // manda registrar e investigar, nunca marcar como validado.
  if (desfecho.sinal !== null) {
    console.error(
      `\n[registro] ⚠️ O PROCESSO FOI MORTO PELO SINAL ${desfecho.sinal} ` +
        `(codigo ${desfecho.codigo}). Isto NAO e aprovacao nem reprovacao: e execucao que ` +
        `nao terminou. SIGABRT/SIGKILL aqui costumam ser memoria (esta maquina tem 8 GB); ` +
        `SIGINT e interrupcao humana.`
    );
  }
  // ⚠️ DITO NO TERMINAL, E NÃO SÓ NO ARQUIVO: um zero que o conteúdo contradiz é o pior
  // resultado possível, porque ele PARECE bom. Quem automatiza em cima lê o código — então o
  // código tem de deixar de dizer "passou".
  if (inconclusivo) {
    console.error(
      `\n[registro] ⚠️ INCONCLUSIVO: o comando saiu com codigo 0, mas o que foi GRAVADO ` +
        `contradiz esse zero. Isto NAO e aprovacao — e resultado que nao corresponde ao ` +
        `conteudo verificado. Causa mais comum: wrapper que imprime o codigo do filho como ` +
        `TEXTO e termina em "echo", saindo 0 de verdade. Use: rc=$?; echo ...; exit $rc`
    );
    for (const d of divergencias) console.error(`  ${d}`);
  }
  console.error(`[registro] saida bruta preservada em ${registro}`);

  process.exit(inconclusivo ? CODIGO_INCONCLUSIVO : desfecho.codigo);
}
