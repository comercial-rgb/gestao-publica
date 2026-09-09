import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { alvoDoBanco } from "./db-teste.js";
import {
  papelDoAmbiente,
  urlDoRuntime,
} from "../prisma/papel-runtime.js";

/**
 * O BANCO DE TESTE É OBRIGATÓRIO. Sem ele, a suíte NÃO RODA — ela FALHA.
 *
 * ═══ O FALSO-VERDE, E COMO ELE ERA POSSÍVEL ═══
 * Cada um dos 45 arquivos de integração trazia uma cópia disto:
 *
 *     async function bancoAcessivel(): Promise<boolean> {
 *       try { await prisma.$queryRaw`SELECT 1`; return true; } catch { return false; }
 *     }
 *     const temBanco = await bancoAcessivel();
 *     describe.skipIf(!temBanco)(...)
 *
 * Com o Postgres parado, isso não falha: ele PULA. E uma suíte inteiramente pulada
 * o Vitest reporta como **passando**, com **exit code 0**:
 *
 *     Test Files  1 passed (1)
 *     Tests  1 passed | 14 skipped (15)
 *
 * Um "verde" que não executou nada. É o pior resultado que um teste pode dar — pior do
 * que vermelho, porque vermelho manda consertar e este manda seguir em frente. Um SIAFIC
 * que publica dado fiscal à União não pode ter uma suíte que diz "tudo certo" quando não
 * conferiu coisa alguma.
 *
 * ⚠️ E O GUARDA-CHUVA DO `global-setup` NÃO BASTAVA SOZINHO. Ele de fato derruba a
 * execução (o `connect()` estoura), mas ele é UMA linha de defesa: bastava alguém rodar
 * com outra config, ou o worker perder a conexão depois do setup, e os 700 testes
 * voltavam a evaporar em silêncio. A rede tem de estar onde o teste está.
 *
 * ═══ A REGRA, AGORA ═══
 * Banco indisponível = **THROW**, nunca skip. Aqui e no `global-setup`, com a MESMA
 * mensagem — e ela diz o que fazer, não só o que quebrou.
 */

/**
 * ⚠️ A URL DE TESTE, JÁ VALIDADA — E POR QUE NÃO SE CHAMA O GUARDA-CHUVA DE NOVO.
 *
 * `urlDoBancoDeTeste()` recusa quando `DATABASE_URL_TEST` aponta para o MESMO alvo que
 * `DATABASE_URL`. Só que o `setup.ts` **já reescreveu** `process.env.DATABASE_URL` para a
 * URL de teste, em cada worker — de propósito, para que a suíte fisicamente não alcance o
 * banco de dev. Depois disso, as duas variáveis SÃO iguais, e chamar o guarda-chuva outra
 * vez o faria acusar exatamente a colisão que ele mesmo criou.
 *
 * O guarda-chuva roda UMA vez por processo (no `setup.ts`), e é ali que ele decide. Aqui
 * a URL já passou por ele: o que resta é usá-la.
 */
function urlDeTesteJaValidada(): string {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url.trim() === "") {
    throw new Error(
      "DATABASE_URL não está definida no processo de teste — o que significa que o " +
        "`test/setup.ts` NÃO rodou. Ele é quem aplica o guarda-chuva e aponta a suíte " +
        "para o banco de teste. Confira `setupFiles` no vitest.config.ts."
    );
  }
  return url;
}

/**
 * A mensagem ÚNICA. O `global-setup` e cada arquivo de teste usam esta.
 *
 * A URL vem por PARÂMETRO porque os dois a obtêm de lugares diferentes: o `global-setup`
 * roda no processo principal (onde `DATABASE_URL` ainda é a de DEV) e calcula a de teste
 * pelo guarda-chuva; os arquivos de teste rodam no worker, onde o `setup.ts` já a
 * reescreveu. Ler `process.env` aqui dentro faria o `global-setup` denunciar o banco
 * ERRADO na mensagem.
 */
/**
 * ⚠️ O MOTIVO REAL, e ele NÃO sai de `causa.message`.
 *
 * Quando o Postgres está parado, o Node tenta ::1 e 127.0.0.1 e falha nos dois — e
 * embrulha as duas falhas num `AggregateError` cuja `.message` é **string vazia**. Ler só
 * `.message` imprimiria `erro:` seguido de nada, que é o tipo de diagnóstico que faz o
 * humano abrir o depurador para descobrir o óbvio ("ECONNREFUSED"). As causas moram no
 * `.errors`.
 */
function motivoLegivel(causa: unknown): string {
  if (causa instanceof AggregateError) {
    const dentro = causa.errors.map(motivoLegivel).filter((m) => m !== "");
    const unicos = [...new Set(dentro)];
    if (unicos.length > 0) return unicos.join(" / ");
  }
  if (causa instanceof Error) {
    return causa.message !== "" ? causa.message : causa.constructor.name;
  }
  return String(causa);
}

export function erroDeBancoInacessivel(url: string, causa: unknown): Error {
  const alvo = alvoDoBanco(url);
  const motivo = motivoLegivel(causa);

  return new Error(
    `BANCO DE TESTE INACESSÍVEL — a suíte NÃO RODA sem ele.\n` +
      `\n` +
      `  alvo: ${alvo.host}:${alvo.porta}/${alvo.database}?schema=${alvo.schema}\n` +
      `  erro: ${motivo}\n` +
      `\n` +
      `O Postgres deste projeto roda no container "pg-siafic". Suba-o:\n` +
      `\n` +
      `  docker start pg-siafic\n` +
      `  docker exec pg-siafic pg_isready -U postgres\n` +
      `\n` +
      `(Se o Docker Desktop estiver parado, suba-o antes.)\n` +
      `\n` +
      `⚠️ ESTA FALHA É DELIBERADA. Antes, os testes de banco eram PULADOS quando o ` +
      `Postgres não respondia — e uma suíte inteiramente pulada o Vitest reporta como ` +
      `PASSANDO, com exit code 0. Um verde que não executou nada é pior que um vermelho: ` +
      `o vermelho manda consertar; aquele mandava seguir em frente.`
  );
}

/**
 * O client do banco de TESTE. A URL é a que o `setup.ts` já validou pelo guarda-chuva —
 * nunca um `?? "postgresql://ausente"`, que era só o falso-verde esperando a vez dele: com
 * ele, um `DATABASE_URL` ausente virava um client que não conecta, e o `skipIf` engolia.
 */
export function criarPrismaDeTeste(): PrismaClient {
  return criarPrismaClient(urlDeTesteJaValidada());
}

/**
 * FAIL-HARD: o banco responde, ou a suíte cai.
 *
 * Chamado no topo de cada arquivo de integração (`await exigirBanco(prisma)`), num
 * top-level await: se ele estoura, o Vitest reporta o ARQUIVO como falho — e não há
 * caminho em que os testes dele simplesmente não apareçam.
 */
export async function exigirBanco(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (causa) {
    throw erroDeBancoInacessivel(urlDeTesteJaValidada(), causa);
  }
}

/**
 * O client do banco de teste conectado como o PAPEL DE RUNTIME — a conta com que a
 * APLICAÇÃO fala com o banco: sem superusuário, sem posse de tabela, sem DDL.
 *
 * ⚠️ POR QUE ELE NÃO É O CLIENT PADRÃO DA SUÍTE. As fixtures TRUNCAM (o `limparBanco` do
 * `beforeEach`), e truncar é exatamente um dos poderes que o papel de runtime não tem —
 * de propósito. Fixture e aplicação querem coisas OPOSTAS do banco, e por isso usam
 * papéis diferentes: o dono semeia e limpa o banco descartável; o papel de runtime
 * executa os casos de uso. Um teste que semeasse com o papel restrito provaria só que a
 * fixture não roda; um que operasse com o dono provaria só que superusuário passa.
 */
export function criarPrismaDoPapelDeRuntime(): PrismaClient {
  return criarPrismaClient(
    urlDoRuntime(urlDeTesteJaValidada(), papelDoAmbiente())
  );
}
