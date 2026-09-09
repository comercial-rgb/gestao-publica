import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
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

/** Onde o usuário enxerga: telas, componentes e a camada que monta texto para eles. */
function arquivosDaCamadaDeApresentacao(): readonly string[] {
  return execSync('find app components lib -name "*.tsx" -o -name "*.ts"', {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((a) => a !== "")
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
