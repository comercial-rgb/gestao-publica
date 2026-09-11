import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
  const filho = spawn(comando as string, args, {
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

  const codigo = await new Promise<number>((resolve) => {
    filho.on("close", (c, sinal) => resolve(c ?? (sinal !== null ? 128 : 1)));
  });

  await new Promise<void>((resolve) => arquivo.end(() => resolve()));
  trinco.liberar();

  // O resumo vai para `stderr` junto com o caminho — pelo mesmo motivo do aviso de cima.
  const falhas = linhasDeFalha(bruto);
  if (falhas.length > 0) {
    console.error(`\n[registro] o que falhou, extraido do que foi gravado:`);
    for (const l of falhas) console.error(`  ${l}`);
  }
  console.error(`[registro] saida bruta preservada em ${registro}`);

  process.exit(codigo);
}
