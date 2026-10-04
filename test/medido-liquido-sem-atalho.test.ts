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
      const rel = p.slice(RAIZ.length).replace(/\\/g, "/").replace(/^\//, "");
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
      const rel = p.slice(RAIZ.length).replace(/\\/g, "/").replace(/^\//, "");
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
      const rel = p.slice(RAIZ.length).replace(/\\/g, "/").replace(/^\//, "");
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

/**
 * ═══ A PROPRIEDADE DERIVADA DO SCHEMA (V11 V5.2) — porque os dois guards acima não bastaram ═══
 *
 * ⚠️ O DEFEITO QUE ESTE BLOCO EXISTE PARA NÃO DEIXAR VOLTAR, e ele é do próprio instrumento. Os
 * dois guards acima vigiam DOIS NOMES: `recebidos` e `medidosNaOrdem`. Em 2026-09-18, ao escrever
 * o percurso da glosa, apareceu um terceiro caminho que nenhum dos dois alcança:
 *
 *     modules/m11-licitacoes/fiscalizacao.ts — projecaoPublicaDoContrato
 *     medicoes: { select: { recebimentosDefinitivos: { select: { itens: { select: { valor: true } } } } } }
 *
 * Sem filtro de estorno em NENHUM dos dois níveis. Efeito: uma medição estornada e um termo de
 * recebimento desfeito continuavam somando no "recebido" que essa função PUBLICA no portal do
 * cidadão. É o modo de falha que o CLAUDE.md nomeia em uma linha — "guarda que enumera formas acha
 * só aquelas formas" — e ele mordeu dentro do arquivo escrito para impedi-lo.
 *
 * ⚠️ POR ISSO A LISTA DE RELAÇÕES VIGIADAS É DERIVADA DO SCHEMA, não escrita aqui. O teste lê os
 * `.prisma` do M11, acha TODO modelo que declara uma relação `estorno`, e daí acha TODA relação que
 * aponta para esses modelos. Uma relação nova para um modelo estornável entra na varredura sozinha,
 * no dia em que nascer — sem ninguém lembrar de acrescentá-la.
 */
describe("o filtro de estorno, derivado do schema", () => {
  const SCHEMAS = ["m11-fiscalizacao.prisma", "m11-medicao-pela-planilha.prisma"];

  /** Os modelos do M11 que declaram uma relação `estorno` — logo, cujo registro pode ser desfeito. */
  function modelosEstornaveis(): readonly string[] {
    const achados = new Set<string>();
    for (const arq of SCHEMAS) {
      const texto = readFileSync(join(RAIZ, "prisma", "schema", arq), "utf8");
      for (const m of texto.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
        if (/^\s*estorno\s+\w+\?/m.test(m[2]!)) achados.add(m[1]!);
      }
    }
    return [...achados].sort();
  }

  /** As relações (em qualquer modelo do M11) que apontam para um modelo estornável. */
  function relacoesVigiadas(): readonly string[] {
    const estornaveis = new Set(modelosEstornaveis());
    const achados = new Set<string>();
    for (const arq of SCHEMAS) {
      const texto = readFileSync(join(RAIZ, "prisma", "schema", arq), "utf8");
      for (const linha of texto.split("\n")) {
        const m = /^\s*(\w+)\s+(\w+)\[\]/.exec(linha);
        if (m !== null && estornaveis.has(m[2]!)) achados.add(m[1]!);
      }
    }
    return [...achados].sort();
  }

  /**
   * ⚠️ O MESMO NOME DE RELAÇÃO APONTA PARA MODELOS DIFERENTES, e a primeira versão deste bloco não
   * sabia disso. `medicoes` é `MedicaoDaOrdemDeServico` quando sai de `OrdemDeServico` — estornável —
   * e `MedicaoDeObra` quando sai de `Contrato` — que NÃO tem estorno. O guard, casando só pelo nome,
   * acusou dois sítios corretos de `Contrato.medicoes`. Um guard que grita onde não há defeito é
   * tão inútil quanto um que se cala onde há: o segundo esconde, o primeiro ensina a ignorar.
   *
   * ⚠️ A EXCEÇÃO É POR SÍTIO, COM MOTIVO, E COM ÂNCORA. Não se exclui o arquivo — `fiscalizacao.ts`
   * é justamente onde o defeito real morava. Exclui-se o trecho que seleciona `valorMedido`, que é
   * campo de `MedicaoDeObra`. E o teste seguinte ANCORA a premissa: no dia em que `MedicaoDeObra`
   * ganhar estorno, ele fica vermelho e obriga a rever esta exceção, em vez de deixá-la
   * silenciosamente errada.
   */
  const CONFERIDOS: readonly { readonly arquivo: string; readonly contem: string; readonly motivo: string }[] = [
    {
      arquivo: "modules/m11-licitacoes/fiscalizacao.ts",
      contem: "valorMedido: true",
      motivo:
        "`Contrato.medicoes` aponta para `MedicaoDeObra` (a medição só por valor), que não tem relação `estorno` — " +
        "o que se desfaz é a medição DA ORDEM. `valorMedido` é campo exclusivo dela e distingue os dois sítios.",
    },
  ];

  it("a premissa da exceção continua verdadeira: MedicaoDeObra NÃO é estornável", () => {
    // ⚠️ SEM ESTA ÂNCORA a exceção acima envelheceria em silêncio. No dia em que a medição só por
    // valor ganhar estorno, o `contem: "valorMedido"` passaria a esconder um defeito real.
    expect(modelosEstornaveis()).not.toContain("MedicaoDeObra");
  });

  it("o schema ainda declara modelos estornáveis e relações para eles — senão a regra está desligada", () => {
    // ⚠️ SEM ESTA ÂNCORA, renomear `estorno` no schema deixaria o teste seguinte verde com zero
    // relações a varrer: a regra inteira desligada, e nenhum vermelho para avisar. É a mesma
    // armadilha do guard que procura um símbolo que deixou de existir.
    expect(modelosEstornaveis().length).toBeGreaterThan(0);
    expect(relacoesVigiadas().length).toBeGreaterThan(0);
    expect(modelosEstornaveis()).toContain("MedicaoDaOrdemDeServico");
    expect(modelosEstornaveis()).toContain("RecebimentoDefinitivo");
  });

  it("nenhum leitor do M11 seleciona uma relação ESTORNÁVEL sem filtrar o estorno", () => {
    const relacoes = relacoesVigiadas();
    const achados: string[] = [];

    for (const p of fontes(MODULO)) {
      const rel = p.slice(RAIZ.length).replace(/\\/g, "/").replace(/^\//, "");
      if (rel in EXCECOES) continue;
      const fonte = codigo(p);
      for (const nome of relacoes) {
        // O `select`/`include` daquela relação, com o seu bloco balanceado até o `select:` interno.
        for (const m of fonte.matchAll(new RegExp(`\\b${nome}:\\s*\\{`, "g"))) {
          const inicio = m.index!;
          let nivel = 0;
          let fim = inicio;
          for (let i = inicio + m[0].length - 1; i < fonte.length; i += 1) {
            if (fonte[i] === "{") nivel += 1;
            else if (fonte[i] === "}") {
              nivel -= 1;
              if (nivel === 0) { fim = i + 1; break; }
            }
          }
          const trecho = fonte.slice(inicio, fim).replace(/\s+/g, " ");
          // Uma relação só precisa do filtro quando o leitor SOMA alguma coisa dela. Selecionar
          // apenas `id` para conferir existência (as guardas de dependente fazem isso) não infla
          // número nenhum — e exigir o filtro ali obrigaria a guarda a ignorar o que ela procura.
          const soma = /\b(valor|quantidade|valorMedido|valorRecebido)\b/.test(trecho);
          if (!soma) continue;
          if (trecho.includes("estorno")) continue;
          if (CONFERIDOS.some((c) => rel === c.arquivo && trecho.includes(c.contem))) continue;
          const linha = fonte.slice(0, inicio).split("\n").length;
          achados.push(`${rel}:${linha}  ${trecho.slice(0, 130)}`);
        }
      }
    }

    expect(
      achados,
      "\n\n⚠️ SELEÇÃO DE RELAÇÃO ESTORNÁVEL, COM VALOR OU QUANTIDADE, SEM FILTRAR O ESTORNO.\n\n" +
        "Um registro DESFEITO continua somando. Quando o leitor é uma projeção pública, o número " +
        "errado sai para o portal do cidadão — foi o que aconteceu em `projecaoPublicaDoContrato` " +
        "e o que este bloco existe para impedir.\n\nAcrescente `where: { estorno: null }` no nível " +
        "da relação, ou declare a exceção com o motivo em `EXCECOES`.\n\nSítios:\n"
    ).toEqual([]);
  });
});
