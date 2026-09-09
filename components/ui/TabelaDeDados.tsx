import Link from "next/link";

/**
 * TABELA DE DADOS — o componente central de um sistema contábil: densa, alinhada por tipo,
 * pronta para impressão.
 *
 * ⚠️ ALINHAMENTO POR TIPO, e ele não é estético: número à DIREITA (com `tabular-nums`, para os
 * dígitos alinharem coluna a coluna), texto à ESQUERDA, e a linha de TOTAL com peso maior e um
 * filete acima. É como o balancete e o RREO são lidos há um século — a coluna de valores forma
 * uma régua vertical, e o olho encontra a diferença de um centavo.
 *
 * ⚠️ IMPRESSÃO LIMPA: a tabela não tem cromo (`data-chrome`), então sobrevive ao `@media print`
 * que esconde sidebar/header. O relatório em papel é o mesmo da tela, sem a moldura do app.
 *
 * É genérica em `T` (a linha) e declarativa nas COLUNAS — quem usa descreve as colunas, e a
 * tabela cuida do alinhamento, da zebra e dos totais.
 */

export type AlinhamentoColuna = "esquerda" | "direita" | "centro";

export type DirecaoOrdenacao = "asc" | "desc";

export interface OrdenacaoTabela {
  readonly campo: string;
  readonly direcao: DirecaoOrdenacao;
}

export interface ColunaTabela<T> {
  readonly chave: string;
  readonly cabecalho: string;
  /** número → "direita" por convenção; texto → "esquerda". */
  readonly alinhamento?: AlinhamentoColuna;
  /** Renderiza a célula. Recebe a linha inteira (para compor ValorMonetario etc.). */
  readonly celula: (linha: T) => React.ReactNode;
  /** Largura fixa opcional (ex.: "10rem"), para colunas de valor. */
  readonly largura?: string;
  /**
   * A coluna é ordenável? Só tem efeito com `hrefDeOrdenacao` — sem ele não há para onde o
   * cabeçalho apontar, e um cabeçalho que parece clicável e não é seria pior que um estático.
   */
  readonly ordenavel?: boolean;
}

/**
 * Um GRUPO de colunas para o cabeçalho de DOIS NÍVEIS (ex.: RREO Anexo 7 — "RP Processados" abrange
 * várias colunas). Os grupos particionam as colunas da esquerda para a direita; a Σ dos `colSpan`
 * tem de igualar o número de colunas. Um grupo com `rotulo` vazio vira uma célula em branco (para
 * colunas soltas, como a de rótulo ou a de total). Omitir `grupos` = cabeçalho de UM nível (o
 * comportamento de sempre).
 */
export interface GrupoColuna {
  readonly rotulo: string;
  readonly colSpan: number;
}

export interface TabelaDeDadosProps<T> {
  readonly colunas: readonly ColunaTabela<T>[];
  readonly linhas: readonly T[];
  /** Extrai a key React estável de cada linha. */
  readonly keyDe: (linha: T, indice: number) => string;
  /** Marca uma linha como TOTAL/subtotal (peso maior, filete acima). */
  readonly ehTotal?: (linha: T) => boolean;
  /** Recuo hierárquico (px) por linha — para função → subfunção etc. */
  readonly recuoDe?: (linha: T) => number;
  /** Cabeçalho de DOIS níveis: grupos de colunas acima dos cabeçalhos individuais. */
  readonly grupos?: readonly GrupoColuna[];
  readonly legenda?: string;

  /**
   * A ordenação VIGENTE — vem de fora, e `null` = nenhuma.
   *
   * ⚠️ SEM ESTADO INTERNO, e o motivo não é pureza: no scaffold a ordenação vive na URL
   * (`?ordem=numero&dir=desc`), para a lista ser LINKÁVEL e sobreviver ao refresh. Um `useState`
   * aqui quebraria isso em silêncio — alguém compartilharia um link que abre ordenado de outro
   * jeito, e o defeito só apareceria quando duas pessoas comparassem a mesma tela.
   */
  readonly ordenacao?: OrdenacaoTabela | null;

  /**
   * O HREF de cada cabeçalho ordenável. Recebe o campo e a direção que o clique deve PRODUZIR.
   *
   * ⚠️ É LINK, NÃO `onOrdenar`. A especificação original pedia um callback — mas um callback
   * obrigaria `"use client"` nesta tabela, e ela é consumida por 30+ páginas, entre elas o RREO,
   * o RGF, o balancete e o razão. Todas elas passariam a hidratar no browser tabelas que hoje
   * saem prontas do servidor.
   *
   * E o callback seria um link PIOR: o objetivo declarado é a URL ordenável, então o `onClick`
   * teria de empurrar para a URL de qualquer forma — perdendo, no caminho, o "abrir em nova aba",
   * o funcionamento sem JS e o SSR. O link entrega o objetivo inteiro sem custo nenhum.
   */
  readonly hrefDeOrdenacao?: (campo: string, direcao: DirecaoOrdenacao) => string;
}

const CLASSE_ALINHAMENTO: Record<AlinhamentoColuna, string> = {
  esquerda: "text-left",
  direita: "text-right",
  centro: "text-center",
};

/** `aria-sort` só existe no cabeçalho ATIVO; os demais são `none`. */
const ARIA_SORT: Record<DirecaoOrdenacao, "ascending" | "descending"> = {
  asc: "ascending",
  desc: "descending",
};

export function TabelaDeDados<T>({
  colunas,
  linhas,
  keyDe,
  ehTotal,
  recuoDe,
  grupos,
  legenda,
  ordenacao,
  hrefDeOrdenacao,
}: TabelaDeDadosProps<T>): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--color-border)]">
      <table className="w-full border-collapse text-sm">
        {legenda !== undefined ? (
          <caption className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
            {legenda}
          </caption>
        ) : null}
        <thead>
          {grupos !== undefined ? (
            <tr className="bg-[color:var(--color-surface-2)]">
              {grupos.map((g, gi) => (
                <th
                  key={`grupo-${gi}`}
                  scope="colgroup"
                  colSpan={g.colSpan}
                  className={`border-b border-[color:var(--color-border)] px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)] ${
                    gi > 0 ? "border-l border-[color:var(--color-border-strong)]" : ""
                  }`}
                >
                  {g.rotulo}
                </th>
              ))}
            </tr>
          ) : null}
          <tr className="bg-[color:var(--color-surface-2)]">
            {colunas.map((c) => {
              const ativa = ordenacao?.campo === c.chave;
              const ordenavel = c.ordenavel === true && hrefDeOrdenacao !== undefined;

              // ⚠️ CLICAR NA COLUNA ATIVA INVERTE; clicar noutra começa ASCENDENTE. Manter a
              // direção anterior ao trocar de coluna faria o primeiro clique numa coluna nova
              // parecer aleatório — às vezes cresce, às vezes decresce, conforme o que veio antes.
              const proxima: DirecaoOrdenacao =
                ativa && ordenacao?.direcao === "asc" ? "desc" : "asc";

              return (
                <th
                  key={c.chave}
                  scope="col"
                  {...(ordenavel
                    ? { "aria-sort": ativa ? ARIA_SORT[ordenacao!.direcao] : ("none" as const) }
                    : {})}
                  style={c.largura !== undefined ? { width: c.largura } : undefined}
                  className={`border-b border-[color:var(--color-border-strong)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)] ${
                    CLASSE_ALINHAMENTO[c.alinhamento ?? "esquerda"]
                  }`}
                >
                  {ordenavel ? (
                    <Link
                      href={hrefDeOrdenacao(c.chave, proxima)}
                      data-ordenar={c.chave}
                      className="inline-flex items-center gap-1 hover:text-[color:var(--color-primary)]"
                    >
                      {c.cabecalho}
                      {/* ⚠️ O indicador é `aria-hidden`: quem usa leitor já recebe a informação
                          pelo `aria-sort` do `<th>`. Anunciá-la duas vezes vira ruído. */}
                      <span aria-hidden className="text-[0.9em] leading-none">
                        {ativa ? (ordenacao!.direcao === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </Link>
                  ) : (
                    c.cabecalho
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => {
            const total = ehTotal?.(linha) ?? false;
            const recuo = recuoDe?.(linha) ?? 0;
            return (
              <tr
                key={keyDe(linha, i)}
                className={
                  total
                    ? "border-t-2 border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] font-semibold"
                    : "border-t border-[color:var(--color-border)] odd:bg-[color:var(--color-surface)] even:bg-[color:var(--color-surface-2)]/60 hover:bg-[color:var(--color-primary-soft)]/35"
                }
              >
                {colunas.map((c, ci) => {
                  const alinhamento = c.alinhamento ?? "esquerda";
                  const numerica = alinhamento === "direita";
                  return (
                    <td
                      key={c.chave}
                      style={
                        ci === 0 && recuo > 0 ? { paddingLeft: `${0.75 + recuo}rem` } : undefined
                      }
                      className={`min-h-11 px-4 py-3 text-[color:var(--color-ink)] ${
                        CLASSE_ALINHAMENTO[alinhamento]
                      } ${numerica ? "tabular" : ""}`}
                    >
                      {c.celula(linha)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
