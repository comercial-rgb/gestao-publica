import { statSync } from "node:fs";
import { join } from "node:path";

/**
 * ONDE O CÓDIGO DE DOMÍNIO MORA — A LISTA ÚNICA, E O PORQUÊ DE ELA SER ÚNICA.
 *
 * ═══ ⚠️ A LIÇÃO QUE CUSTOU DOIS GUARDAS ═══
 * Vários grep-testes deste repositório defendem invariantes varrendo o disco: o censo das ações
 * (M16), o funil do razão (M01), a fronteira UI↔domínio. Todos eles enumeravam `"modules"` à mão.
 *
 * Quando o M15/M18/M19 saíram de `modules/mNN/` para `adapters/tribunais/tce-pb/`, os dois
 * primeiros pararam de enxergar o código movido — e o modo de falha foi PIOR que um teste vermelho:
 *
 *   · o censo (M16) acusou `submeterCaptura` como ação FANTASMA (visível), mas ao mesmo tempo fez
 *     t6/t6b PULAREM a verificação de autorização dele, em silêncio, porque para eles o serviço
 *     tinha deixado de existir;
 *   · o funil (M01) simplesmente deixou de varrer o gerador SAGRES: um `lancamentoContabil.create()`
 *     escrito ali passaria sem que nada acusasse. O guard continuou VERDE enquanto a promessa que
 *     ele existe para defender ficava sem defesa.
 *
 * Um guarda que silenciosamente para de guardar é pior que guarda nenhum: ninguém vai conferir de
 * novo, porque a suíte diz que está tudo certo.
 *
 * ═══ A REGRA ═══
 * Nenhum scanner enumera raiz de domínio à mão. Todos importam DAQUI. O próximo diretório de
 * domínio (um `adapters/bancos/`, um `adapters/tribunais/tcm-ba/`) entra NESTA lista, uma vez, e
 * todos os guardas passam a enxergá-lo no mesmo commit.
 *
 * O `raizes-dominio.test.ts` faz cumprir isso: ele falha se um scanner voltar a escrever "modules"
 * na mão.
 */
/**
 * ═══ ⚠️ DIRETÓRIOS INERTES — CÓDIGO QUE MORA AQUI E NÃO É NOSSO ═══
 *
 * `doador/` guarda repositórios ABSORVIDOS com histórico, preservados para extração
 * futura e deliberadamente desligados do build. Não é código de produção, não é código de
 * apoio, não é dependência: é material de consulta versionado.
 *
 * ⚠️ POR QUE UMA LISTA, E NÃO O NOME `doador` ESCRITO EM CADA VARREDOR. É a mesma lição
 * que custou dois guardas acima, na direção contrária: o varredor que escreve o nome à mão
 * é o varredor que esquece de atualizá-lo. Aqui a consequência de esquecer seria varrer
 * código de terceiro como se fosse nosso — e cobrar dele disciplina de data civil, censo de
 * ação e rótulo de conformidade que ele nunca prometeu cumprir.
 *
 * ⚠️ E A EXCLUSÃO É EXECUTADA, NÃO APENAS DECLARADA. `raizesExistentes` abaixo RECUSA
 * devolver raiz que caia aqui dentro, e é por onde passam o guard de data civil
 * (`RAIZES_DE_DOMINIO`) e o de tabela morta (`RAIZES_DE_ESCRITA`). Uma constante que
 * ninguém consulta seria decoração com aparência de rede.
 *
 * A condição de remoção do diretório está em `docs/doador.md`.
 */
export const DIRETORIOS_INERTES = ["doador"] as const;

export const RAIZES_DE_DOMINIO = ["modules", "adapters"] as const;

/**
 * As raízes que os greps de CÓDIGO varrem — domínio + o resto do que é código de produção ou de
 * apoio versionado. É o conjunto do funil (M01): ele precisa alcançar seeds e testes também,
 * porque um `create` direto num seed fura a promessa do mesmo jeito.
 */
export const RAIZES_DE_CODIGO = [...RAIZES_DE_DOMINIO, "packages", "prisma/seed", "test"] as const;

/**
 * TODO O CÓDIGO DE PRODUÇÃO QUE PODE FALAR COM O BANCO — inclusive a borda.
 *
 * ⚠️ POR QUE ELA É MAIS LARGA QUE `RAIZES_DE_CODIGO`. Aquela lista serve aos guards que
 * defendem invariantes do DOMÍNIO (o funil do razão, o censo das ações), e o domínio não
 * mora em `app/` nem em `lib/`. Mas alguns invariantes são sobre a ESCRITA em si — "só o
 * módulo X cria linhas na tabela Y" — e a escrita pode ser tentada de uma server action,
 * de uma porta ou de um script de manutenção. Um guard desses que não varresse `app/`
 * deixaria de fora justamente o lugar mais fácil de escrever um `create` apressado.
 *
 * A regra do arquivo continua a mesma, e é ela que importa: a lista mora AQUI, uma vez, e
 * o próximo diretório entra numa linha só — não em cada scanner.
 */
export const RAIZES_DE_ESCRITA = [
  ...RAIZES_DE_DOMINIO,
  "packages",
  "lib",
  "app",
  "prisma/seed",
  "scripts",
  "test",
] as const;

/**
 * Os caminhos absolutos que EXISTEM, a partir de uma lista de raízes relativas.
 *
 * Um diretório ausente não é falha (checkout parcial, build limpo) — mas também não pode ser
 * ignorado em silêncio quando TODOS somem: quem chama deve conferir que achou algo, e os testes
 * que usam isto já o fazem (`expect(arquivos.length).toBeGreaterThan(...)`).
 */
export function raizesExistentes(
  raizRepo: string,
  raizes: readonly string[] = RAIZES_DE_DOMINIO
): string[] {
  const achadas: string[] = [];
  for (const raiz of raizes) {
    // ⚠️ RECUSA ANTES DO `statSync`, e de propósito. Uma raiz inerte não é "ausente": ela
    // EXISTE no disco e seria varrida. Quem a pedir — hoje ninguém, e é essa a questão —
    // recebe silêncio aqui em vez de centenas de arquivos de terceiro na acusação.
    if (ehInerte(raiz)) continue;
    const abs = join(raizRepo, raiz);
    try {
      if (statSync(abs).isDirectory()) achadas.push(abs);
    } catch {
      /* raiz ausente — checkout parcial */
    }
  }
  return achadas;
}

/** Se um caminho relativo (com "/") cai dentro de um diretório inerte. */
export function ehInerte(caminhoRelativo: string): boolean {
  const p = caminhoRelativo.replace(/\\/g, "/").replace(/^\.\//, "");
  return DIRETORIOS_INERTES.some((d) => p === d || p.startsWith(`${d}/`));
}
