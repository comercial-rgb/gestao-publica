import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NENHUMA RECUSA DO DOMÍNIO CITA NÚMERO DE CLÁUSULA DO EDITAL.
 *
 * ═══ POR QUE ESTE GUARD EXISTE SEPARADO DO CENSO DE RÓTULOS ═══
 * `test/ui/rotulos-de-conformidade.test.ts` varre a camada de apresentação (`app`, `components`,
 * `lib`). Só que **mensagem de erro de serviço também é texto de tela**: o domínio lança
 * `throw new Error("...")`, a porta repassa, a Server Action devolve em `estado.erro` e o formulário
 * imprime. Medido antes da apresentação: o guard da limitação de empenho recusava com
 * *"LIMITAÇÃO DE EMPENHO (TR 4.43): a fonte … NÃO tem cota"* — e essa string ia inteira para o
 * `<p role="alert">` na frente de quem estivesse olhando.
 *
 * Eram **65 strings** com número de cláusula fora de comentário, em 14 arquivos: recusas de guard,
 * títulos de relatório (`"TR 5.103 — PROCESSOS LICITATÓRIOS"`), descrições das atualizações de
 * permissão (que aparecem no painel de perfis) e prosa do tipo *"a TR 5.18.9 pede atendimento
 * parcial"*. Ficaram nove, todas no censo interno — ver a exceção nomeada.
 *
 * ⚠️ COMENTÁRIO CONTINUA PERMITIDO, e é onde a rastreabilidade tem de morar. Este teste apaga os
 * comentários antes de varrer, pela mesma razão que o censo de rótulos: um guard que proibisse
 * `@req` empurraria a rastreabilidade para fora do código, que é onde ela para de ser mantida.
 */

/**
 * A EXCEÇÃO, NOMEADA — e a razão é verificável.
 *
 * `modules/m16-travamento/acoes.ts` carrega `FORA_DO_CENSO`: um `Record` de MOTIVOS, um por função
 * de leitura, consumido **pelo teste do censo** (`m16-censo.test.ts`) para provar que nenhuma função
 * de mutação ficou sem ação. Nenhuma tela lê essas strings — `ACOES_DE_LEITURA` é importado por
 * `lib/portas/leitura.ts` como LISTA DE NOMES de ação, para autorizar, nunca pela descrição.
 * Aquele Record é documentação dentro de uma estrutura de dados, da mesma natureza de um comentário.
 */
const EXCECOES_NOMEADAS: readonly string[] = ["modules/m16-travamento/acoes.ts"];

/** A numeração do edital: `TR 4.43`, `TR 5.18.9`. A LEI não casa — ela não leva o prefixo `TR`. */
const CLAUSULA_DO_EDITAL = /\bTR\s*\d+\.\d+(?:\.\d+)*/g;

function semComentarios(fonte: string): string {
  const semBloco = fonte.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return semBloco.replace(/(^|[^:])\/\/[^\n]*/gm, (m, antes: string) =>
    antes + " ".repeat(m.length - antes.length)
  );
}

/** Os literais de string do arquivo, com a linha — é neles que a mensagem de recusa mora. */
function literais(fonte: string): readonly { readonly linha: number; readonly texto: string }[] {
  const saida: { linha: number; texto: string }[] = [];
  for (const [i, linha] of semComentarios(fonte).split("\n").entries()) {
    for (const m of linha.matchAll(/"([^"\\]{6,}?)"|'([^'\\]{6,}?)'|`([^`\\]{6,}?)`/g)) {
      saida.push({ linha: i + 1, texto: m[1] ?? m[2] ?? m[3] ?? "" });
    }
  }
  return saida;
}

function arquivosDeDominioEPorta(): readonly string[] {
  const RAIZ = resolve(import.meta.dirname, "..", "..");
  return execSync(`find "${RAIZ}/modules" "${RAIZ}/lib" -name "*.ts"`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((a) => a !== "" && !a.endsWith(".test.ts") && !a.endsWith(".test.tsx"))
    .map((a) => relative(RAIZ, a).replace(/\\/g, "/"))
    .sort();
}

describe("recusa sem cláusula — a mensagem que o operador lê não cita o edital", () => {
  it("⚠️ nenhum literal de domínio ou de porta cita número de cláusula do edital", () => {
    const infratores: string[] = [];
    for (const arquivo of arquivosDeDominioEPorta()) {
      if (EXCECOES_NOMEADAS.includes(arquivo)) continue;
      for (const { linha, texto } of literais(readFileSync(arquivo, "utf8"))) {
        const achados = texto.match(CLAUSULA_DO_EDITAL);
        if (achados !== null) {
          infratores.push(`${arquivo}:${linha} → ${achados.join(", ")}\n    ${texto.trim().slice(0, 130)}`);
        }
      }
    }
    expect(
      infratores,
      "\n\n⚠️ NÚMERO DE CLÁUSULA DO EDITAL DENTRO DE UMA STRING DE DOMÍNIO.\n\n" +
        "Mensagem de recusa é TEXTO DE TELA: o serviço lança, a porta repassa, a ação devolve e o\n" +
        "formulário imprime. Uma recusa que cita o número da cláusula declara conformidade a quem\n" +
        "não tem como conferir — e aparece na frente de quem estiver olhando a tela.\n\n" +
        "Como corrigir: diga a REGRA, não o número. \"a primária não pode exceder a total\" em vez\n" +
        "de \"(TR 5.9)\". Para rastrear de onde a regra veio, use COMENTÁRIO — este teste não o vê.\n\n" +
        "A LEI continua permitida: \"LRF art. 42\", \"Lei 4.320/1964\", \"CF art. 165\".\n\n" +
        "Ocorrências:\n"
    ).toEqual([]);
  });

  it("a exceção nomeada continua sendo UMA, e ela continua sendo censo interno", () => {
    expect(EXCECOES_NOMEADAS).toHaveLength(1);
    const fonte = readFileSync("modules/m16-travamento/acoes.ts", "utf8");
    expect(
      fonte.includes("FORA_DO_CENSO"),
      "a exceção se justifica porque o arquivo é o CENSO — se `FORA_DO_CENSO` saiu dele, a razão " +
        "da exceção saiu também."
    ).toBe(true);
  });

  /**
   * ⚠️ E A LEI NÃO PODE TER SIDO VARRIDA JUNTO. Citar a norma que rege um demonstrativo é
   * linguagem de contabilidade pública; se uma limpeza futura apagar isso por excesso de zelo, o
   * produto fica mudo sobre o fundamento do que faz.
   */
  it("a citação da LEI continua nos literais do domínio", () => {
    const fontes = arquivosDeDominioEPorta()
      .map((a) => readFileSync(a, "utf8"))
      .join("\n");
    for (const citacao of ["LRF", "4.320", "art."]) {
      expect(
        fontes.includes(citacao),
        `"${citacao}" sumiu do domínio. O que sai é o número do edital, não o da lei.`
      ).toBe(true);
    }
  });
});
