import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ═══ NENHUM LEITOR SOMA O MEDIDO DA ORDEM SEM DESCONTAR A GLOSA (V9 N4) ═══
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE, E É UMA HISTÓRIA CURTA. Ao implementar a liberação de saldo
 * pela glosa, a leitura do código apontou TRÊS lugares que somavam `itemDaOrdem.medidos`. Eram
 * QUATRO: `cancelarSaldoDaOrdemDeServico` ficou de fora, e só apareceu porque um teste de
 * comportamento (G6) o exercitou. O efeito do que passou despercebido seria a tela dizendo
 * "a executar 2,0000" e o cancelamento recusando com "só 0,0000" — dois números do mesmo saldo,
 * discordando, e nenhum erro de compilação entre eles.
 *
 * ⚠️ E O TIPO NÃO PEGA ISSO. `medidos: { select: { quantidade: true } }` compila perfeitamente;
 * ele só devolve menos campos. Um leitor novo escrito por quem não leu esta decisão volta a
 * ignorar a glosa em silêncio — que é exatamente o modo de falha que o repositório chama de
 * "guarda que enumera formas acha só aquelas formas".
 *
 * O que se afirma aqui é a PROPRIEDADE: no M11, ninguém lê `medidos` de um item de ordem sem
 * passar pela derivação única. Quem precisar de uma exceção declara-a com o motivo.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const MODULO = join(RAIZ, "modules", "m11-licitacoes");

/**
 * O arquivo onde a derivação mora — usado só pelo teste que confere que ela EXISTE.
 *
 * ⚠️ ELE NÃO É MAIS EXCLUÍDO DA VARREDURA, e a primeira versão deste guard o excluía. Medido em
 * 16/09/2026: com a exclusão, trocar `medidoLiquido(i.medidosNaOrdem)` por um `reduce` cru
 * DENTRO deste arquivo — que é onde estão três dos quatro leitores — passava verde. O guard
 * dispensava justamente o arquivo que mais precisa dele.
 *
 * A derivação não se auto-acusa porque ela soma o PARÂMETRO (`medidos.reduce`), não a relação
 * (`.medidosNaOrdem.reduce`). A regra distingue as duas sem precisar de exceção.
 */
const ONDE_A_DERIVACAO_MORA = "ordem-de-servico.ts";

/** Exceções declaradas, com o motivo. Vazia hoje — e cada linha futura precisa do porquê. */
const EXCECOES: Readonly<Record<string, string>> = {};

function fontes(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) achados.push(...fontes(p));
    else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) achados.push(p);
  }
  return achados;
}

/**
 * Sem comentários — a prosa deste repositório CITA o padrão errado para explicá-lo —, mas
 * PRESERVANDO as quebras de linha: um comentário apagado sem elas desloca todos os números de
 * linha do arquivo, e o guard passa a apontar para o lugar errado. Foi o que aconteceu na
 * primeira versão deste arquivo, em 16/09/2026.
 */
const codigo = (p: string): string =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

describe("o medido de um item da ordem passa sempre pela derivação única", () => {
  it("nenhum arquivo do M11 seleciona `medidos` sem a conferência e a decisão", () => {
    const achados: string[] = [];
    for (const p of fontes(MODULO)) {
      const rel = p.slice(RAIZ.length).replace(/^\//, "");
      if (rel in EXCECOES) continue;
      const fonte = codigo(p);
      // `medidosNaOrdem: { ... }` escrito à mão, em vez de `medidosNaOrdem: SELECAO_DO_MEDIDO`.
      //
      // ⚠️ O NOME DA RELAÇÃO É O QUE TORNA ESTE GUARD EXATO. `ItemDoContrato.medidos` é outra
      // relação (medição SEM ordem), sem conferência e sem glosa; enquanto as duas se chamavam
      // `medidos`, nenhuma regra textual conseguia separar os quatro leitores que precisam
      // descontar a glosa dos quatro que não têm o que descontar. Ver o comentário do campo em
      // `prisma/schema/m11-fiscalizacao.prisma`.
      for (const m of fonte.matchAll(/medidosNaOrdem:\s*\{[^}]*\}/g)) {
        const trecho = m[0].replace(/\s+/g, " ");
        if (trecho.includes("conferencia")) continue;
        achados.push(`${rel}: ${trecho.slice(0, 120)}`);
      }
    }
    expect(
      achados,
      "\n\n⚠️ SELEÇÃO DE `medidos` SEM A DECISÃO DA CONTROVÉRSIA.\n\n" +
        "Sem `conferencia.decisao` no `select`, quem somar essas linhas soma o BRUTO — e a " +
        "quantidade glosada volta a consumir a autorização da ordem para sempre. Use " +
        "`SELECAO_DO_MEDIDO` e `medidoLiquido` (modules/m11-licitacoes/ordem-de-servico.ts).\n\n" +
        "Sítios:\n"
    ).toEqual([]);
  });

  it("nenhum arquivo do M11 soma `medidos` à mão fora da derivação", () => {
    const achados: string[] = [];
    for (const p of fontes(MODULO)) {
      const rel = p.slice(RAIZ.length).replace(/^\//, "");
      if (rel in EXCECOES) continue;
      for (const [i, linha] of codigo(p).split("\n").entries()) {
        if (/\.medidosNaOrdem\.reduce\(/.test(linha)) achados.push(`${rel}:${i + 1}  ${linha.trim().slice(0, 90)}`);
      }
    }
    expect(
      achados,
      "\n\n⚠️ SOMA DE `medidos` À MÃO.\n\n" +
        "A derivação é `medidoLiquido`, e ela existe porque a glosa desconta. Uma soma à mão " +
        "reintroduz o bruto — e a divergência aparece como dois números do mesmo saldo " +
        "discordando entre a tela e o caso de uso.\n\nSítios:\n"
    ).toEqual([]);
  });

  it("nenhum leitor seleciona `recebidos` sem excluir os recebimentos ESTORNADOS", () => {
    // ⚠️ MESMA ANATOMIA DA GLOSA, outro campo (V9 N4). `recebidos: { select: { quantidade: true } }`
    // compila e soma também o que foi desfeito — e a quantidade estornada continua bloqueando o
    // recebimento correto, em silêncio. A derivação é `SELECAO_DOS_RECEBIDOS`.
    const achados: string[] = [];
    for (const p of fontes(MODULO)) {
      const rel = p.slice(RAIZ.length).replace(/^\//, "");
      if (rel in EXCECOES) continue;
      for (const m of codigo(p).matchAll(/recebidos:\s*\{[^}]*\}/g)) {
        const trecho = m[0].replace(/\s+/g, " ");
        if (trecho.includes("estorno")) continue;
        achados.push(`${rel}: ${trecho.slice(0, 120)}`);
      }
    }
    expect(
      achados,
      "\n\n⚠️ SELEÇÃO DE `recebidos` SEM EXCLUIR OS ESTORNADOS.\n\n" +
        "Use `SELECAO_DOS_RECEBIDOS` (modules/m11-licitacoes/ordem-de-servico.ts). Sem o filtro, " +
        "a quantidade de um termo DESFEITO continua contando como recebida, e o recebimento " +
        "corrigido é recusado por 'acima do elegível'.\n\nSítios:\n"
    ).toEqual([]);
  });

  it("a relação continua se chamando `medidosNaOrdem` — é o nome que torna o guard exato", () => {
    // ⚠️ Renomeá-la de volta para `medidos` deixaria os dois testes acima verdes (nenhuma
    // ocorrência a encontrar) com a regra inteira desligada. É a mesma armadilha de um guard que
    // procura um símbolo que deixou de existir.
    const schema = readFileSync(join(RAIZ, "prisma", "schema", "m11-fiscalizacao.prisma"), "utf8");
    expect(schema).toMatch(/medidosNaOrdem\s+ItemMedidoNaOrdem\[\]/);
  });

  it("a derivação está declarada e é exportada — o guard não vigia um símbolo que sumiu", () => {
    // ⚠️ Sem isto, apagar `medidoLiquido` deixaria os dois testes acima VERDES (nenhuma soma à
    // mão, nenhuma seleção crua) com a regra inteira removida.
    const fonte = readFileSync(join(MODULO, ONDE_A_DERIVACAO_MORA), "utf8");
    expect(fonte).toContain("export function medidoLiquido");
    expect(fonte).toContain("export const SELECAO_DO_MEDIDO");
    expect(fonte).toContain("export const SELECAO_DOS_RECEBIDOS");
    expect(fonte).toMatch(/REJEITADA/);
  });
});
