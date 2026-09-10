import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
 * Uso como comando: `tsx scripts/trinco-de-maquina.ts <tarefa> -- <comando...>`
 *
 * Ele toma o trinco, roda o comando herdando o terminal, e solta. O código de saída é o
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
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(comando as string, args, { stdio: "inherit" });
  trinco.liberar();
  process.exit(r.status ?? 1);
}
