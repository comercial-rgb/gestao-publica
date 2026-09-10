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

/** `getUTCFullYear`, `getUTCMonth`, `getUTCDate` e o corte do ISO em 10 caracteres. */
const PADRAO =
  /getUTC(?:FullYear|Month|Date)\s*\(|toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/;

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

  // ⚠️ OS ADAPTERS DE TRIBUNAL SÃO LEIAUTE EXTERNO, e o eixo é o que o órgão define.
  // Converter para a data civil do ente aqui produziria arquivo RECUSADO na remessa —
  // e "recusado pelo TCE" é um modo de falha bem pior que um dia de diferença numa tela.
  "adapters/tribunais/tce-pb/index.ts": "leiaute do TCE-PB (SAGRES)",
  "adapters/tribunais/tce-pb/sagres/formatadores.ts": "leiaute do TCE-PB (SAGRES)",
  "adapters/tribunais/tce-pb/sagres/gerador.ts": "leiaute do TCE-PB (SAGRES)",
  "adapters/tribunais/tce-pb/sagres/nomenclatura.ts": "nome de arquivo do leiaute SAGRES",
  "adapters/tribunais/tcm-ba/siga/writer.ts": "leiaute do TCM-BA (SIGA)",
  "adapters/tribunais/tcm-ba/validar.ts": "leiaute do TCM-BA (SIGA)",

  // ⚠️ OS DE BAIXO NÃO SÃO FORMATO EXTERNO — são PENDÊNCIA NOMEADA.
  // Ficaram fora das quatro áreas que a revisão do ENT03a mandou verificar, e mexer
  // neles sem teste de fronteira seria trocar um erro conhecido por um desconhecido.
  // Pendência DATA-CIVIL-RESTANTES; ver o ADR.
  "modules/m08-restos-a-pagar/consultas.ts": "PENDENTE — corte de restos a pagar",
  "modules/m11-licitacoes/dominio.ts": "PENDENTE — vigência de contrato",
  "modules/m12-relatorios/rreo-anexo3.ts": "PENDENTE — bimestre do RREO",
  "modules/m12-relatorios/rreo-anexo13.ts": "PENDENTE — período do demonstrativo",
  "modules/m02-planejamento/programacao.ts": "PENDENTE — data de vigência da versão",
  "modules/m26-designer/gramatica.ts":
    "formata valor ARBITRÁRIO do desenhista, que pode não ser data de domínio",
  "modules/m26-designer/servico.ts": "idem — formatação genérica de valor",
  "modules/m25-campos-adicionais/dominio.ts":
    "o `!==` da linha 104 é ida-e-volta contra a string digitada, e depende de UTC nos " +
    "dois lados; trocar um lado só quebraria a validação",
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
    // ⚠️ A APRESENTAÇÃO CONTINUA PENDENTE, e nomeada: `app/**` e `lib/**` ainda imprimem
    // datas por UTC em ~10 sítios. Pendência DATA-CIVIL-APRESENTACAO — ver o ADR.
    // ⚠️ AS RAÍZES VÊM DE `test/raizes-dominio.ts`, e não escritas à mão aqui. Um scanner
    // que enumera raiz por conta própria PARA DE ENXERGAR o código no dia em que ele se
    // muda de diretório — e para em silêncio, continuando verde. Foi o que aconteceu
    // quando o M15/M18/M19 saíram de `modules/` para `adapters/`.
    for (const raiz of raizesExistentes(RAIZ, [...RAIZES_DE_DOMINIO, "packages"])) {
      for (const p of fontes(raiz)) {
        const rel = relative(RAIZ, p).replace(/\\/g, "/");
        if (rel in EXCECOES) continue;

        const linhas = readFileSync(p, "utf8").split("\n");
        for (const [i, linha] of linhas.entries()) {
          // Comentário não é código: o repositório explica o defeito em prosa, e citar
          // `getUTCMonth()` num comentário que conta a história não pode acusar.
          const semComentario = linha.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
          if (PADRAO.test(semComentario)) novos.push(`${rel}:${i + 1}`);
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
