import { Decimal } from "../../packages/contracts/index.js";

/**
 * A SOMA DE UMA SELEÇÃO — em Decimal, e no SERVIDOR.
 *
 * ⚠️ ELA MORA EM `lib/molde/`, E NÃO NUMA PORTA. É aritmética pura sobre linhas JÁ LIDAS: não
 * toca banco, não importa domínio, e por isso é testável sem nada. A primeira versão vivia em
 * `lib/portas/molde.ts`, e a consequência apareceu no typecheck: o teste do molde passou a
 * arrastar `next/headers` para dentro da configuração do backend. Função pura em porta é
 * dependência que viaja.
 *
 * ⚠️ E A SOMA NÃO ACONTECE NO BROWSER. O total de uma seleção é dinheiro, e dinheiro não vira
 * `number` em lugar nenhum deste repositório: `1000.50 + 2000.25` em ponto flutuante é
 * `3000.7499999999995`. Somar na ilha exigiria float ou embarcar `decimal.js` no bundle.
 *
 * ⚠️ ELA RECEBE AS LINHAS DA PÁGINA, e não consulta nada. Somar numa segunda consulta abriria
 * a porta para o total divergir da lista que está à vista: entre as duas leituras alguém pode
 * ter gravado. O rótulo da tela diz quantas linhas entraram na conta — e é essa a promessa
 * que se pode cumprir.
 */
export function somarSelecionadas(
  linhas: readonly Readonly<Record<string, string>>[],
  ids: readonly string[],
  colunas: readonly string[]
): Readonly<Record<string, string>> {
  const marcados = new Set(ids);
  const total: Record<string, Decimal> = {};
  for (const c of colunas) total[c] = new Decimal(0);
  for (const l of linhas) {
    if (!marcados.has(String(l["id"] ?? ""))) continue;
    for (const c of colunas) {
      const bruto = l[c];
      if (bruto === undefined || bruto === "") continue;
      total[c] = total[c]!.plus(new Decimal(bruto));
    }
  }
  return Object.fromEntries(Object.entries(total).map(([c, v]) => [c, v.toFixed(2)]));
}
