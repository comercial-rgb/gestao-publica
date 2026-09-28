import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { raizesExistentes } from "../raizes-dominio.js";
import { describe, expect, it } from "vitest";

/**
 * NENHUM IDENTIFICADOR DO CATÁLOGO APARECE EM TELA.
 *
 * ═══ A REGRA, E O QUE ELA NÃO PROÍBE ═══
 * O que não pode aparecer em tela, mensagem, notificação, documento operacional, rota ou
 * atributo acessível: número de cláusula como rótulo de atendimento, selo de conformidade,
 * percentual de cobertura, identificador do catálogo.
 *
 * O que CONTINUA disponível, e é vocabulário legítimo do negócio:
 *   · "Licitação", "Edital", "Pregão", "Contrato", "Termo de referência de uma compra";
 *   · a LEI — "LRF art. 8º", "Lei 14.133/2021, art. 141", "CF art. 212". Citar a norma que
 *     rege um demonstrativo é linguagem de contabilidade pública, não declaração de
 *     atendimento contratual;
 *   · o NOME dos demonstrativos — "RREO Anexo 3", "RGF Anexo 5". É como o documento se
 *     chama, não um carimbo.
 *
 * ⚠️ COMENTÁRIO É PERMITIDO, E DE PROPÓSITO. `@req` e as notas de código servem para
 * RASTREAR — dizer de onde veio uma regra. O que não podem é DECLARAR atendimento na
 * cara do usuário. Por isso este teste remove os comentários antes de varrer: um teste
 * que os proibisse empurraria a rastreabilidade para fora do código, que é onde ela
 * deixa de ser mantida.
 *
 * ═══ POR QUE UM GREP, E NÃO REVISÃO ═══
 * Havia 85 ocorrências em 21 arquivos quando isto foi escrito — subtítulos de página,
 * legendas de tabela, descrições de menu, subtítulos de PDF. Nenhuma foi posta com má
 * intenção: cada uma parecia útil sozinha. É exatamente o tipo de coisa que volta na
 * próxima tela, e que só um teste segura.
 */

/**
 * PENDÊNCIA NOMEADA — `IDENTIFICADOR-DE-MODULO-EM-TELA`.
 *
 * Sobraram 15 ocorrências de código INTERNO de módulo ("M03", "M07", "M10") em texto de
 * ajuda de tela. Não são identificador do catálogo — o catálogo é a numeração de cláusula,
 * e é ela que este teste proíbe —, mas também não dizem nada a quem usa o sistema: "atos do
 * domínio (M09)" é uma frase escrita para quem conhece o repositório.
 *
 * Não foram removidas aqui de propósito: sair varrendo texto de ajuda por conta própria é
 * como se perde a explicação junto com o código. Fica registrado para o lote que revisar
 * cada uma das telas.
 */

/** O que se procura: a numeração do NOSSO catálogo. */
const PADRAO_DE_CATALOGO =
  /\bTR\s*\d+(?:\.\d+)+[a-z]?|§\s?\d+(?:\.\d+)+|\b\d+(?:\.\d+)+\s*%\s*de\s*(?:conformidade|cobertura)/gi;

/**
 * A ÚNICA EXCEÇÃO, NOMEADA — e nomear é o ponto.
 *
 * A tela do SAGRES cita as seções do **leiaute publicado pelo TCE-PB**: documento
 * normativo EXTERNO, da mesma natureza que "LRF art. 8º". Quando o tribunal rejeita um
 * arquivo, rejeita citando a seção; sem ela na tela, o operador fica sem o vocabulário
 * para responder. A coluna diz "Seção do leiaute do TCE", para não ficar ambíguo.
 *
 * ⚠️ EXCEÇÃO DECLARADA É DECISÃO; EXCEÇÃO SILENCIOSA É BURACO. Se esta lista crescer,
 * cresce à vista de quem revisa o diff.
 */
const EXCECOES_NOMEADAS: readonly string[] = [
  "app/(areas)/integracoes/sagres/page.tsx",
];

/**
 * Onde o usuário enxerga: telas, componentes e a camada que monta texto para eles.
 *
 * ⚠️ AS RAÍZES PASSAM POR `raizesExistentes`, E NÃO VÃO CRUAS PARA O `find`. Até a
 * absorção do doador elas eram três nomes escritos à mão aqui dentro — exatamente o que
 * `test/raizes-dominio.ts` documenta como o jeito de um guard parar de guardar em
 * silêncio, e o que fez o censo do M16 e o funil do M01 cegarem quando o M15/M18/M19
 * mudaram de diretório.
 *
 * ⚠️ E É DAÍ QUE VEM A EXCLUSÃO DO DOADOR, em vez de um filtro escrito aqui.
 * `raizesExistentes` RECUSA raiz inerte, então o dia em que `doador/` — ou qualquer
 * repositório absorvido depois dele — for acrescentado a esta lista por engano, ele é
 * descartado com motivo declarado em vez de ter suas telas cobradas por um catálogo que
 * nunca prometeu cumprir. A prova por mutação dessa recusa está em `raizes-dominio.test.ts`
 * e em `inercia-do-doador.test.ts`; MEDIDO na absorção, este guard ficou verde sozinho,
 * porque o `find` nunca chegou perto do doador.
 */
export const RAIZES_DE_APRESENTACAO = ["app", "components", "lib"] as const;

function arquivosDaCamadaDeApresentacao(
  raizes: readonly string[] = RAIZES_DE_APRESENTACAO
): readonly string[] {
  const RAIZ_REPO = resolve(import.meta.dirname, "..", "..");
  const dirs = raizesExistentes(RAIZ_REPO, raizes);
  if (dirs.length === 0) return [];

  return execSync(`find ${dirs.map((d) => JSON.stringify(d)).join(" ")} -name "*.tsx" -o -name "*.ts"`, {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((a) => a !== "")
    .map((a) => relative(RAIZ_REPO, a).replace(/\\/g, "/"))
    .filter((a) => !a.endsWith(".test.ts") && !a.endsWith(".test.tsx"))
    .sort();
}

/**
 * Apaga comentários preservando as quebras de linha (para o número da linha continuar
 * verdadeiro na mensagem de falha).
 *
 * ⚠️ O `(?<!:)` antes de `//` evita comer `https://` — sem ele, toda URL viraria
 * comentário daí em diante e o teste ficaria cego para o resto do arquivo.
 */
function semComentarios(fonte: string): string {
  const semBloco = fonte.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " ")
  );
  return semBloco.replace(/(^|[^:])\/\/[^\n]*/gm, (m, antes: string) =>
    antes + " ".repeat(m.length - antes.length)
  );
}

/**
 * ═══ O TEXTO QUE O USUÁRIO REALMENTE VÊ ═══
 *
 * ⚠️ VARRER A LINHA INTEIRA NÃO SERVE PARA ESTA SEGUNDA GUARDA, e a diferença é a que separa um
 * instrumento de um estorvo: `modo === "MOCK"` é comparação interna legítima e `<Badge>MOCK</Badge>`
 * é vazamento. A primeira guarda deste arquivo (número de cláusula) podia varrer a linha porque o
 * padrão dela quase não existe fora de prosa; jargão de desenvolvimento existe o tempo todo em
 * código, e um guard que não distinguisse ensinaria a desligá-lo.
 *
 * Então aqui se extrai o que é CANDIDATO A SER LIDO por gente:
 *   · literal de string com pelo menos dois espaços — prosa, não identificador;
 *   · texto de JSX entre `>` e `<`.
 *
 * E se descarta o que é notoriamente máquina: classe de estilo (`var(--…)`) e a interpolação de
 * template (`${…}`), que carrega nome de campo por construção e não é o que se lê na tela.
 */
function textoVisivel(fonte: string): readonly { readonly linha: number; readonly texto: string }[] {
  const saida: { linha: number; texto: string }[] = [];
  for (const [i, linha] of semComentarios(fonte).split("\n").entries()) {
    for (const m of linha.matchAll(/"([^"\\]{8,}?)"|'([^'\\]{8,}?)'|`([^`\\]{8,}?)`/g)) {
      const bruto = m[1] ?? m[2] ?? m[3] ?? "";
      if (bruto.includes("var(--")) continue;
      const texto = bruto.replace(/\$\{[^}]*\}/g, " ");
      if ((texto.match(/ /g)?.length ?? 0) >= 2) saida.push({ linha: i + 1, texto });
    }
    for (const m of linha.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)) {
      saida.push({ linha: i + 1, texto: m[1] ?? "" });
    }
  }
  return saida;
}

/**
 * NÚMERO DE CLÁUSULA **NU** — o furo que a V17 nomeou como `CLAUSULA-NUA-FORA-DO-PADRAO`.
 *
 * O padrão de cima exige `TR` ou `§` na frente. Faltava o caso mais comum: o número entre
 * parênteses, sozinho — "Posição patrimonial por classe (5.86)", "Pré-envio (7.27)". Medido: 12
 * ocorrências em seis arquivos, incluindo títulos de PDF que podem ser impressos e entregues.
 *
 * ⚠️ TRÊS COISAS NÃO CASAM, E AS TRÊS EXCLUSÕES FORAM MEDIDAS na primeira execução deste teste:
 *
 *   · **dinheiro** — o parêntese só pode conter dígito, ponto, espaço e separador; `(1.000,00)` tem
 *     vírgula e sai. Um guard que acusa valor é um guard que alguém desliga na primeira semana.
 *   · **código de conta do PCASP** — `(5.2.2.1.3)` e `(3.1 — pessoal)` são vocabulário contábil
 *     legítimo, e apareciam no formulário do roteiro e nos descritores da folha. O que os separa de
 *     uma cláusula é a forma: conta tem grupos de UM dígito (`X.X.X.X.X.NN.NN`), cláusula tem um
 *     grupo de DOIS OU MAIS logo depois do primeiro ponto (`5.86`, `7.27`, `5.128`). Daí o
 *     `\d{1,2}\.\d{2,}`. E o parêntese com letra dentro (`— pessoal`) sai pela espreita.
 *   · **percentual de exemplo** — `(0.20 = 20%)` tem `=` e `%`, que não estão no conjunto.
 *
 * ⚠️ E O QUE ELE NÃO PEGA, DITO: cláusula de quatro grupos com todos os tails de um dígito —
 * `(5.9.1.3)` — é indistinguível de um prefixo de conta pela FORMA. Para essas continua valendo o
 * padrão com `TR`/`§` acima. Pendência nomeada: `CLAUSULA-DE-QUATRO-GRUPOS-INDISTINGUIVEL`.
 */
const CLAUSULA_NUA = /\((?=[\d\s.;–\-/]+\))[\d\s.;–\-/]*?(\d{1,2}\.\d{2,}(?:\.\d+)*)/g;

/**
 * JARGÃO DE DESENVOLVIMENTO — o que não se diz a um servidor municipal.
 *
 * ⚠️ `JSON Schema` NÃO ENTRA, e a exceção é do tribunal: o TCE-PB publica os JSON Schemas da
 * Captura 2.0 com esse nome, e é assim que o operador vai procurá-los. O que sai é `schema` solto.
 *
 * ⚠️ `Prisma` E `DMMF` SAÍRAM DA LISTA na primeira execução, e o motivo é bom: eles não aparecem
 * em prosa nenhuma — são identificadores de código — e produziam FALSO POSITIVO em template de SQL
 * (`Prisma.sql`…`), onde o extrator lê o trecho ENTRE dois templates como se fosse texto. Guard que
 * acusa o que não é o alvo é guard que alguém desliga.
 *
 * ⚠️ `SEM-DADO` E OUTROS DE DOIS SEGMENTOS TAMBÉM NÃO ENTRAM: rótulo curto em caixa alta é
 * vocabulário de tela legítimo ("SEM DADO", "A PAGAR"). O que denuncia nome de pendência interna é
 * a terceira perna — `DEFINICAO-JA-REVOGADA`, `ROTEIRO-SEM-NIVEL-DE-CONSOLIDACAO`.
 */
const JARGAO: readonly { readonly nome: string; readonly padrao: RegExp }[] = [
  { nome: "MOCK", padrao: /\bMOCK\b/g },
  { nome: "POC", padrao: /\bPOC\b/g },
  { nome: "fixture", padrao: /\bfixtures?\b/gi },
  { nome: "fail-closed", padrao: /\bfail-closed\b/gi },
  { nome: "append-only", padrao: /\bappend-only\b/gi },
  { nome: "invariante", padrao: /\binvariante\b/gi },
  { nome: "smoke", padrao: /\bsmoke\b/gi },
  { nome: "TODO/FIXME", padrao: /\b(?:TODO|FIXME)\b/g },
  { nome: "schema (fora de \"JSON Schema\")", padrao: /(?<!JSON )\bschemas?\b/gi },
  { nome: "nome de constraint do banco", padrao: /\b(?:ck|uq|fk|pk|idx)_[a-z0-9_]{3,}\b/g },
  // ⚠️ A MÁSCARA DE DATA NÃO É PENDÊNCIA: `AAAA-MM-DD` tem a mesma forma e é rótulo legítimo de
  // campo. A espreita negativa tira as máscaras (só A, M, D, Y) e mantém `DEFINICAO-JA-REVOGADA`.
  { nome: "nome de pendência interna", padrao: /\b(?![AMDY]+(?:-[AMDY]+)+\b)[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}(?:-[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9]{2,}){2,}\b/g },
  { nome: "arquivo de código", padrao: /\b[\w.-]+\.tsx?\b/g },
  { nome: "caminho de módulo", padrao: /\bmodules\/m\d+/g },
];

describe("rótulos de conformidade — nenhum identificador de catálogo em tela", () => {
  it("nenhum número de cláusula do catálogo em texto renderizado", () => {
    const infratores: string[] = [];

    for (const arquivo of arquivosDaCamadaDeApresentacao()) {
      if (EXCECOES_NOMEADAS.includes(arquivo)) continue;

      const fonte = readFileSync(arquivo, "utf8");
      const original = fonte.split("\n");
      const linhas = semComentarios(fonte).split("\n");

      for (const [i, linha] of linhas.entries()) {
        const achados = linha.match(PADRAO_DE_CATALOGO);
        if (achados !== null) {
          infratores.push(
            `${arquivo}:${i + 1} → ${achados.join(", ")}\n    ${original[i]?.trim().slice(0, 140) ?? ""}`
          );
        }
      }
    }

    expect(
      infratores,
      "\n\n⚠️ IDENTIFICADOR DO CATÁLOGO EM TEXTO RENDERIZADO.\n\n" +
        "Número de cláusula não é rótulo de tela: ele declara atendimento a quem lê, e\n" +
        "quem lê não tem como conferir. O que a tela deve dizer é o que ela FAZ.\n\n" +
        "Como corrigir: remova a referência e, se a frase depender dela, reescreva em\n" +
        "vocabulário de negócio — \"a limitação de empenho\", e não \"a limitação do TR 4.43\".\n" +
        "Para RASTREAR de onde veio a regra, use COMENTÁRIO: ele é permitido, e este teste\n" +
        "não o vê.\n\n" +
        "Continuam permitidos: a lei (LRF art. 8º, Lei 14.133/2021 art. 141), o nome dos\n" +
        "demonstrativos (RREO Anexo 3) e o vocabulário de negócio (edital, pregão, contrato).\n\n" +
        "Ocorrências:\n"
    ).toEqual([]);
  });

  it("a exceção nomeada continua sendo UMA, e o arquivo dela existe", () => {
    // Uma lista de exceções que cresce sem ninguém notar é a forma como um teste destes
    // morre: ele continua verde enquanto deixa de proibir qualquer coisa.
    expect(EXCECOES_NOMEADAS).toHaveLength(1);

    for (const arquivo of EXCECOES_NOMEADAS) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(
        fonte.includes("Seção do leiaute do TCE"),
        `${arquivo} é exceção porque cita o leiaute EXTERNO do tribunal — e a tela tem de ` +
          "dizer isso ao usuário. Se o rótulo da coluna sumiu, a exceção deixou de se justificar."
      ).toBe(true);
    }
  });

  /**
   * ⚠️ ESTE TESTE NASCEU DE UM FURO MEDIDO. O padrão de cima exige `TR` ou `§`; "Pré-envio (7.27)"
   * e "Posição patrimonial por classe (5.86)" passavam por ele — e estavam em tela e em PDF.
   */
  it("nenhum número de cláusula NU (entre parênteses, sem TR nem §) em texto visível", () => {
    const infratores: string[] = [];
    for (const arquivo of arquivosDaCamadaDeApresentacao()) {
      if (EXCECOES_NOMEADAS.includes(arquivo)) continue;
      for (const { linha, texto } of textoVisivel(readFileSync(arquivo, "utf8"))) {
        const achados = texto.match(CLAUSULA_NUA);
        if (achados !== null) {
          infratores.push(`${arquivo}:${linha} → ${achados.join(", ")}\n    ${texto.trim().slice(0, 140)}`);
        }
      }
    }
    expect(
      infratores,
      "\n\n⚠️ NÚMERO DE CLÁUSULA NU EM TEXTO VISÍVEL.\n\n" +
        "O número entre parênteses no fim de um título — \"Posição patrimonial por classe (5.86)\" —\n" +
        "é a mesma declaração de atendimento que \"TR 5.86\", só sem o prefixo. Quem lê não tem como\n" +
        "conferir, e num PDF impresso ele fica no papel.\n\n" +
        "Como corrigir: apague o número. Se a rastreabilidade importa, ela vai para COMENTÁRIO.\n\n" +
        "Ocorrências:\n"
    ).toEqual([]);
  });

  /**
   * ⚠️ E ESTE NASCEU DE UM PEDIDO EXPLÍCITO ANTES DE UMA APRESENTAÇÃO: nenhum texto de instrução
   * de código nas telas. O levantamento achou vinte ocorrências — `FIXTURE POC (modo MOCK)`,
   * `DRAFT → VALIDATED_LOCAL`, `fail-closed`, `invariante do motor de partidas`.
   */
  it("nenhum jargão de desenvolvimento em texto visível", () => {
    const infratores: string[] = [];
    for (const arquivo of arquivosDaCamadaDeApresentacao()) {
      if (EXCECOES_NOMEADAS.includes(arquivo)) continue;
      for (const { linha, texto } of textoVisivel(readFileSync(arquivo, "utf8"))) {
        const achados = JARGAO.flatMap((j) => (j.padrao.test(texto) ? [j.nome] : []));
        // ⚠️ `test` com `/g` guarda `lastIndex`: reiniciar é obrigatório, senão a segunda linha
        // é examinada do meio para a frente e o guard passa a cegar em silêncio.
        for (const j of JARGAO) j.padrao.lastIndex = 0;
        if (achados.length > 0) {
          infratores.push(`${arquivo}:${linha} → ${achados.join(", ")}\n    ${texto.trim().slice(0, 140)}`);
        }
      }
    }
    expect(
      infratores,
      "\n\n⚠️ JARGÃO DE DESENVOLVIMENTO EM TEXTO VISÍVEL.\n\n" +
        "MOCK, POC, fixture, fail-closed, append-only, nome de constraint, nome de arquivo .ts:\n" +
        "nada disso diz o que o sistema FAZ para quem opera. Estado interno de máquina de estados\n" +
        "(DRAFT, VALIDATED_LOCAL) precisa de rótulo em português.\n\n" +
        "Ocorrências:\n"
    ).toEqual([]);
  });

  it("o vocabulário de negócio NÃO foi varrido junto", () => {
    // A regra proíbe o identificador do catálogo — não a linguagem do negócio. Se uma
    // limpeza futura apagar "licitação" e "contrato" das telas por excesso de zelo, este
    // teste cai: o produto ficaria mudo sobre o que ele faz.
    const fontes = arquivosDaCamadaDeApresentacao()
      .map((a) => readFileSync(a, "utf8"))
      .join("\n");

    for (const palavra of ["Licitações", "Contrato", "Empenho", "Liquidação"]) {
      expect(
        fontes.includes(palavra),
        `"${palavra}" sumiu da camada de apresentação. Vocabulário de negócio permanece ` +
          "disponível — o que sai é o número de cláusula, não a palavra."
      ).toBe(true);
    }
  });
});
