import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { raizesExistentes, RAIZES_DE_DOMINIO } from "./raizes-dominio.js";

/**
 * ═══ COMPARAÇÃO DE DATA NO DOMÍNIO USA A DATA CIVIL DO ENTE, NUNCA UTC ═══
 *
 * Decidido em `docs/adr/ADR-data-civil-do-ente.md`. Este teste é a guarda.
 *
 * ⚠️ O QUE A VARREDURA ACHOU, e nenhum deles aparecia nas fixtures — porque quase toda
 * fixture do repositório usa MEIO-DIA UTC, e ao meio-dia os dois eixos coincidem:
 *
 *   · a trava de dezembro deixava passar o lançamento de **31/12 às 22:00**;
 *   · a cota mensal contava o empenho de **30/06 às 22:00** contra **julho**;
 *   · a ordem cronológica não empatava liquidações do mesmo dia, e o desempate pelo
 *     número — que dá ordem TOTAL ao art. 141 — **nunca rodava**;
 *   · a nota de empenho e o borderô, que são documentos ASSINADOS, imprimiam um dia a
 *     mais para fatos da noite.
 *
 * ⚠️ A LISTA DE EXCEÇÕES TEM UM MOTIVO POR LINHA, e é ela que faz a próxima ocorrência
 * ser uma DECISÃO de alguém em vez de um descuido. Acrescentar um arquivo aqui sem
 * motivo é desligar a guarda com passos extras.
 */

const RAIZ = resolve(import.meta.dirname, "..");

/**
 * ⚠️ TRÊS FORMAS, E A TERCEIRA É A QUE O ENT03a NÃO ENXERGAVA.
 *
 * A guarda nasceu procurando LEITURA por UTC (`getUTCFullYear`) e IMPRESSÃO por UTC
 * (`toISOString().slice(0,10)`). Faltava a forma DOMINANTE: a **construção** da janela por
 * `new Date(Date.UTC(...))`. A varredura do ENT03b achou **35 arquivos** assim — entre eles
 * o `janelaDoBimestre`, que é a régua de OITO anexos do RREO, e o `janelaDoMes` do guard da
 * cota mensal do CMD, que decide aceitar ou recusar um empenho.
 *
 * ⚠️ ERA EXATAMENTE O CASO DO `c2`: uma guarda que dizia vigiar o eixo de data e ficava
 * verde sobre a metade do eixo que ela não sabia ler. Buraco na rede é pior que ausência
 * de rede — a rede dá a sensação oposta.
 */
const PADRAO =
  /getUTC(?:FullYear|Month|Date)\s*\(|toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)|Date\s*\.\s*UTC\s*\(/;

/**
 * ⚠️ A QUARTA FORMA, E ELA É SIMÉTRICA ÀS TRÊS DE CIMA — o ENT03c a encontrou fechando a
 * `DATA-CIVIL-APRESENTACAO`. As três de cima leem o eixo **UTC**; esta lê o eixo do
 * **HOSPEDEIRO**: `toLocaleString("pt-BR")` sem `timeZone`, `getFullYear()`,
 * `new Date(a, m, d)`. São erros de direção oposta, e por isso nenhuma guarda pega as duas:
 *
 *   · o eixo UTC está errado em QUALQUER máquina, de forma estável — e por isso atravessa
 *     a prova de fuso (`npm run test:fuso`) sem um arranhão;
 *   · o eixo do hospedeiro está CERTO nesta máquina, que roda em America/Sao_Paulo, e erra
 *     em qualquer outra. Nenhuma leitura de código o denuncia; só rodar noutro fuso.
 *
 * `npm run test:fuso` roda a suíte inteira sob `Pacific/Kiritimati` e exige resultado
 * idêntico — é a prova da PROPRIEDADE. Este padrão é o aviso barato que chega antes.
 */
/**
 * ⚠️ A QUINTA FORMA, achada ao fechar a `DATA-CIVIL-APRESENTACAO`: colar um dia civil num
 * literal e carimbar `Z` no fim — `new Date(`${dia}T23:59:59.999Z`)`. Ela é a mais
 * traiçoeira das cinco porque PARECE deliberada: tem a hora escrita à mão, com
 * milissegundos, como quem sabe o que está fazendo. E está errada pelo mesmo motivo de
 * sempre: 23:59:59Z é 20:59:59 no ente, e o corte perde as três últimas horas do dia.
 *
 * Use `inicioDoDiaCivil` e `fimDoDiaCivil`.
 */
const PADRAO_LITERAL_Z = /T\s*[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z`/;

const PADRAO_HOSPEDEIRO =
  /toLocale(?:Date|Time)?String\s*\(|(?<![A-Za-z])get(?:FullYear|Month|Date|Hours)\s*\(\s*\)/;

/**
 * Onde `getUTC*` é CORRETO, com o motivo. Formato externo não é comparação de domínio:
 * o órgão define o próprio eixo, e converter para a data civil do ente ali produziria
 * arquivo recusado.
 */
const EXCECOES: Readonly<Record<string, string>> = {
  "packages/datas/index.ts": "é a própria régua — implementa a conversão",
  "packages/ofx/parser.ts": "o OFX declara o próprio fuso; normaliza na fronteira",
  "modules/m14-exports-federais/manad/dominio.ts": "leiaute da Receita",
  "modules/m14-exports-federais/manad/gerador.ts": "leiaute da Receita",
  "modules/m17-banco-bb/normalizar.ts": "leiaute do banco",
  "modules/m17-banco-bb/cliente-bb.ts": "leiaute do banco",
  "modules/m17-banco-bb/fixtures-poc.ts": "fixture do leiaute do banco",

  // ⚠️ OS ADAPTERS DE TRIBUNAL SÃO LEIAUTE EXTERNO, e o eixo é o que o órgão define.
  // Converter para a data civil do ente aqui produziria arquivo RECUSADO na remessa —
  // e "recusado pelo TCE" é um modo de falha bem pior que um dia de diferença numa tela.
  "adapters/tribunais/tce-pb/index.ts": "leiaute do TCE-PB (SAGRES)",
  "adapters/tribunais/tce-pb/sagres/formatadores.ts": "leiaute do TCE-PB (SAGRES)",
  "adapters/tribunais/tce-pb/sagres/gerador.ts": "leiaute do TCE-PB (SAGRES)",
  "adapters/tribunais/tce-pb/sagres/nomenclatura.ts": "nome de arquivo do leiaute SAGRES",
  "adapters/tribunais/tcm-ba/siga/writer.ts": "leiaute do TCM-BA (SIGA)",
  "adapters/tribunais/tcm-ba/validar.ts": "leiaute do TCM-BA (SIGA)",
  "adapters/tribunais/tcm-ba/siga/fixtures/empenho-golden.ts":
    "fixture GOLDEN do leiaute do TCM-BA — o instante é o que o arquivo de referência tem",

  // ⚠️ A DE BAIXO NÃO É FORMATO EXTERNO. É a ÚNICA que sobrou depois que o ENT03b
  // fechou a pendência `DATA-CIVIL-RESTANTES`, e tem decisão registrada.
  "modules/m25-campos-adicionais/dominio.ts":
    "`valorData` é DATA PURA ancorada em meia-noite UTC, por decisão registrada no topo do " +
    "arquivo: nada compara, soma ou corta período por ele, e a ida e a volta usam a MESMA " +
    "âncora — provado em `m25-campos-adicionais.test.ts`",

};

function fontes(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "generated", ".git", ".next"].includes(e.name)) continue;
      achados.push(...fontes(p));
      continue;
    }
    if (!e.name.endsWith(".ts") && !e.name.endsWith(".tsx")) continue;
    if (e.name.includes(".test.")) continue;
    achados.push(p);
  }
  return achados;
}

describe("data civil do ente", () => {
  it("nenhum código de domínio compara ou imprime data por UTC, fora da lista", () => {
    const novos: string[] = [];

    // ⚠️ O ESCOPO É O **DOMÍNIO** — `modules/` e `packages/`. A decisão fala de
    // comparação de data NO DOMÍNIO; `app/` é apresentação e `adapters/tribunais/` é
    // leiaute de órgão, onde o eixo é o que o terceiro define. Alargar o escopo aqui
    // encheria a lista de exceções de coisas que não são a mesma pergunta, e uma lista
    // cheia de exceções legítimas é uma lista que ninguém lê.
    //
    // ⚠️ AS RAÍZES VÊM DE `test/raizes-dominio.ts`, e não escritas à mão aqui. Um scanner
    // que enumera raiz por conta própria PARA DE ENXERGAR o código no dia em que ele se
    // muda de diretório — e para em silêncio, continuando verde. Foi o que aconteceu
    // quando o M15/M18/M19 saíram de `modules/` para `adapters/`.
    // ⚠️ O ESCOPO CRESCEU NO ENT03c, e a pendência que ele fecha explica por quê. Até aqui
    // a guarda varria só `modules/` e `packages/` — "a decisão fala de comparação de data
    // NO DOMÍNIO". Só que a APRESENTAÇÃO também compara e também imprime: o formatador
    // `dataBr` de `lib/recorte.ts`, que quase toda tela usa, imprimia por UTC, e oito telas
    // imprimiam instante pelo relógio da MÁQUINA. Eram 44 sítios, não os ~10 que a
    // pendência DATA-CIVIL-APRESENTACAO estimava — a terceira vez neste projeto em que a
    // estimativa de um padrão ficou muito abaixo da medição.
    for (const raiz of raizesExistentes(RAIZ, [
      ...RAIZES_DE_DOMINIO,
      "packages",
      "lib",
      "app",
      "components",
    ])) {
      for (const p of fontes(raiz)) {
        const rel = relative(RAIZ, p).replace(/\\/g, "/");
        if (rel in EXCECOES) continue;

        const linhas = readFileSync(p, "utf8").split("\n");
        for (const [i, linha] of linhas.entries()) {
          // Comentário não é código: o repositório explica o defeito em prosa, e citar
          // `getUTCMonth()` num comentário que conta a história não pode acusar.
          const semComentario = linha.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
          if (
            PADRAO.test(semComentario) ||
            PADRAO_HOSPEDEIRO.test(semComentario) ||
            PADRAO_LITERAL_Z.test(semComentario)
          ) {
            novos.push(`${rel}:${i + 1}`);
          }
        }
      }
    }

    expect(
      novos,
      "\n\n⚠️ DATA COMPARADA OU IMPRESSA POR UTC EM CÓDIGO DE DOMÍNIO.\n\n" +
        "A data civil do ente e a data em UTC divergem por um dia entre 21:00 e a " +
        "meia-noite — e é justamente aí que moram o fechamento do mês, o último dia do " +
        "exercício e o vencimento. Um fato de 31/12 às 22:00 é dezembro para o ente e " +
        "janeiro para Greenwich.\n\n" +
        "Use `packages/datas`: `diaCivil`, `anoCivil`, `competenciaCivil`, `diaCivilBr`, " +
        "`compararPorDiaCivil`, `janelaCivilDoMes`.\n\n" +
        "Se for FORMATO EXTERNO (leiaute de órgão ou de banco), acrescente o arquivo a " +
        "`EXCECOES` COM O MOTIVO — e não sem ele.\n\nSítios:\n"
    ).toEqual([]);
  });

  /**
   * ⚠️ A LISTA DE EXCEÇÕES TAMBÉM É VIGIADA. Uma exceção para um arquivo que já não tem
   * mais o padrão é lixo que dá cobertura futura de graça: alguém reintroduz `getUTC*`
   * naquele arquivo e a guarda não acusa.
   */
  it("toda exceção declarada ainda é necessária", () => {
    const inuteis: string[] = [];
    for (const rel of Object.keys(EXCECOES)) {
      let fonte: string;
      try {
        fonte = readFileSync(join(RAIZ, rel), "utf8");
      } catch {
        inuteis.push(`${rel} (arquivo não existe mais)`);
        continue;
      }
      const temCodigo = fonte
        .split("\n")
        .some((l) => PADRAO.test(l.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "")));
      if (!temCodigo) inuteis.push(`${rel} (já não usa UTC — remova a exceção)`);
    }
    expect(inuteis, "\n\nExceções que já não são necessárias:\n").toEqual([]);
  });
});
