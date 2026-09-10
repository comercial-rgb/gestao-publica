import { Client } from "pg";
import { alvoDoBanco } from "./db-teste.js";

/**
 * A TRAVA DA SUÍTE — um processo de teste por banco de teste, e o segundo é AVISADO.
 *
 * ═══ ⚠️ O QUE ELA IMPEDE, MEDIDO ═══
 * Em 2026-09-09 esta suíte deu **13 falhas em M05, M08, M12, M16, M19 e M20** e demorou
 * **107 minutos** (6406 s), contra os ~12 s habituais desses arquivos. Nenhum daqueles
 * módulos tinha sido tocado. A causa não estava no código: havia **duas execuções do
 * Vitest contra o mesmo `gestao_publica_test`**, porque um subconjunto foi lançado
 * enquanto a suíte completa ainda rodava.
 *
 * O modo de falha é o pior possível para quem lê o resultado:
 *
 *   · a limpeza de um processo apaga a semente do outro NO MEIO do teste, então a falha
 *     aparece num arquivo que ninguém mexeu, com uma mensagem que não tem nada a ver com
 *     a causa ("REJEITA criar ficha em exercício INEXISTENTE" falhando porque o exercício
 *     foi truncado por outro processo);
 *   · a distribuição das falhas é ALEATÓRIA entre execuções, o que convida a chamá-las de
 *     "instáveis" e rodar de novo — exatamente a conclusão errada;
 *   · e o tempo explode, porque os dois processos disputam locks de TRUNCATE.
 *
 * Horas de investigação de um defeito que não existia. A trava abaixo troca isso por uma
 * frase.
 *
 * ═══ ⚠️ POR QUE ADVISORY LOCK DE SESSÃO, E NÃO UM ARQUIVO DE TRINCO ═══
 * O recurso disputado é o BANCO, não a máquina. Um arquivo em `/tmp` erraria nos dois
 * sentidos: não veria um processo em outro checkout do mesmo repositório apontando para o
 * mesmo banco, e barraria duas suítes que usam bancos DIFERENTES. Além disso, arquivo de
 * trinco sobrevive a `kill -9` e deixa a suíte travada até alguém apagá-lo à mão — o
 * advisory lock morre com a conexão, sempre, inclusive quando o processo é morto.
 *
 * ⚠️ É `pg_try_advisory_lock`, DE SESSÃO — não `_xact_`. O trinco tem de durar a suíte
 * inteira, e não há uma transação que dure isso. Ele é liberado no teardown do Vitest e,
 * se o processo morrer antes, pelo fim da conexão.
 *
 * ⚠️ E A CHAVE NÃO COLIDE COM `packages/locks`. Aquelas usam a forma de DOIS int4
 * (`pg_advisory_xact_lock(posto, hashtext(id))`); esta usa a forma de UM bigint. O
 * Postgres trata as duas como espaços de chave SEPARADOS (`pg_locks.objsubid` vale 1 para
 * a primeira e 2 para a segunda), então nem por acidente uma trava de ficha orçamentária
 * encontra esta.
 */

/**
 * A chave do trinco. Constante e arbitrária: o que a torna única é ser a única chamada de
 * `pg_advisory_lock` na forma de um argumento em todo o repositório.
 */
const CHAVE_DA_SUITE = 728_113_355;

/** Quem está segurando o trinco, quando há alguém. */
interface DonoDoTrinco {
  readonly pid: number;
  readonly aplicacao: string;
  readonly desde: Date | null;
}

async function donoDoTrinco(cliente: Client): Promise<DonoDoTrinco | null> {
  // classid/objid são a chave de 64 bits partida em duas metades de 32. Como a chave cabe
  // em 32 bits, classid é 0. `objsubid = 1` é a forma de UM argumento — ver o cabeçalho.
  const r = await cliente.query<{
    pid: number;
    application_name: string;
    backend_start: Date | null;
  }>(
    `SELECT a.pid, a.application_name, a.backend_start
       FROM pg_locks l
       JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory'
        AND l.classid = 0
        AND l.objid = $1
        AND l.objsubid = 1
        AND l.granted`,
    [CHAVE_DA_SUITE]
  );
  const linha = r.rows[0];
  if (linha === undefined) return null;
  return {
    pid: linha.pid,
    aplicacao: linha.application_name,
    desde: linha.backend_start,
  };
}

export interface TravaDaSuite {
  /** Libera o trinco e fecha a conexão dedicada. Idempotente. */
  readonly liberar: () => Promise<void>;
}

/**
 * TOMA O TRINCO, ou FALHA DIZENDO QUEM O TEM.
 *
 * ⚠️ ELE FALHA EM VEZ DE ESPERAR, e é uma escolha. Uma suíte que espera em silêncio parece
 * travada — quem a lançou vê o cursor parado e não sabe se está compilando, conectando ou
 * enfileirado atrás de outra execução. E esperar é quase sempre a resposta errada aqui: o
 * caso real não é "duas pessoas rodando ao mesmo tempo", é a MESMA pessoa esquecendo que a
 * suíte completa ainda está rodando noutra janela. Ela precisa saber disso, não aguardar
 * 107 minutos por um resultado que vai chegar contaminado de qualquer jeito.
 */
export async function travarASuite(urlDeTeste: string): Promise<TravaDaSuite> {
  const alvo = alvoDoBanco(urlDeTeste);

  const cliente = new Client({
    connectionString: urlDeTeste,
    // ⚠️ O NOME VIAJA ATÉ A OUTRA EXECUÇÃO. É ele que o segundo processo lê em
    // `pg_stat_activity` para dizer QUAL processo tem o trinco — sem isso a mensagem seria
    // "alguém está rodando", que não ajuda ninguém a decidir o que fazer.
    application_name: `suite-vitest pid=${process.pid}`,
  });
  await cliente.connect();

  const tomou = await cliente.query<{ ok: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS ok",
    [CHAVE_DA_SUITE]
  );

  if (tomou.rows[0]?.ok !== true) {
    const dono = await donoDoTrinco(cliente);
    await cliente.end();

    const quem =
      dono === null
        ? "outro processo (que soltou o trinco entre a tentativa e a consulta)"
        : `o processo ${dono.pid} ("${dono.aplicacao}")` +
          (dono.desde !== null
            ? `, conectado desde ${dono.desde.toLocaleString("pt-BR")}`
            : "");

    throw new Error(
      `\n\n⚠️ JÁ HÁ UMA SUÍTE RODANDO CONTRA ESTE BANCO.\n\n` +
        `Banco: ${alvo.host}:${alvo.porta}/${alvo.database}\n` +
        `Quem o tem: ${quem}\n\n` +
        `Duas execuções do Vitest contra o mesmo banco de teste NÃO se atrapalham um ` +
        `pouco: elas se destroem. Cada arquivo de integração limpa e semeia as mesmas ` +
        `tabelas no seu \`beforeEach\`, então a limpeza de um apaga a semente do outro no ` +
        `meio do teste. O resultado é um punhado de falhas em módulos que ninguém tocou, ` +
        `com mensagens que não têm relação com a causa, e uma suíte que leva HORAS.\n\n` +
        `Isso aconteceu de verdade aqui em 09/09/2026: 13 falhas em M05, M08, M12, M16, ` +
        `M19 e M20, e 107 minutos de execução. Nenhuma delas era um defeito.\n\n` +
        `O que fazer: espere a outra execução terminar, ou encerre-a. Para rodar as duas ` +
        `de verdade, aponte esta para outro banco em DATABASE_URL_TEST — o trinco é por ` +
        `banco, não por máquina.\n`
    );
  }

  let liberado = false;
  return {
    liberar: async (): Promise<void> => {
      if (liberado) return;
      liberado = true;
      try {
        await cliente.query("SELECT pg_advisory_unlock($1)", [CHAVE_DA_SUITE]);
      } finally {
        // ⚠️ O `end()` no `finally`: se o unlock falhar (conexão já derrubada), o trinco
        // morre com a sessão de qualquer forma. O que não pode é a conexão vazar e o
        // processo do Vitest ficar pendurado sem terminar.
        await cliente.end();
      }
    },
  };
}
