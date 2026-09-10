import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { raizesExistentes, RAIZES_DE_ESCRITA } from "./raizes-dominio.js";

/**
 * ═══ EFEITO COLATERAL ANTES DA OPERAÇÃO GUARDADA ═══
 *
 * ⚠️ A FORMA DO DEFEITO, e ela mordeu DUAS VEZES no ENT03a:
 *
 * Uma operação grava algo **e só depois** chama outra que pode RECUSAR. Como as duas não
 * cabem numa transação só (transação aninhada no Prisma não compõe), a recusa deixa o
 * primeiro efeito gravado. E aí vem a parte cara: se existir uma **guarda de unicidade**
 * sobre esse primeiro efeito, ela passa a recusar a tentativa SEGUINTE — a correta.
 *
 * O resultado não é "erro que o usuário repete": é **um fato que fica impossível de
 * completar, para sempre**.
 *
 *   · `porNaFila` (M05) — gravava o `Anexo` e depois abria a fila. Uma tentativa com
 *     modo QUALIFICADA deixava o anexo órfão, e "um documento por fato" recusava a
 *     tentativa seguinte. **O empenho ficava impossível de assinar.**
 *   · `gerarBordero` (M09) — gravava o `Bordero` e depois abria a fila. Com signatário
 *     repetido, o borderô ficava órfão, e "o lote já tem borderô" recusava a seguinte.
 *     **O lote ficava impossível de transmitir.** Este foi achado pela varredura, e não
 *     por um usuário.
 *
 * ⚠️ A CORREÇÃO NÃO É "APAGAR O ÓRFÃO NO ERRO". Um `catch` que limpa depende de o
 * processo continuar vivo, e o modo de falha que importa é justamente o que mata o
 * processo. A correção é **conferir antes de gravar**, com a MESMA função que a operação
 * guardada usa — nunca uma cópia da regra, que divergiria na primeira mudança de um lado.
 *
 * Este teste é o grep que impede a forma de voltar. Ele é grosseiro de propósito: uma
 * heurística que às vezes pede um comentário a mais é melhor que um defeito que deixa um
 * empenho sem assinatura para sempre.
 */

const RAIZ = resolve(import.meta.dirname, "..");

/**
 * As operações que RECUSAM e que, por isso, não podem vir depois de uma escrita sem
 * conferência prévia. A chave é a função; o valor é a pré-condição que a torna segura.
 */
const OPERACOES_QUE_RECUSAM: Readonly<Record<string, string>> = {
  criarFilaDeAssinatura: "exigirFilaViavel",
};

/** Os arquivos onde a própria pré-condição e a operação nascem — não se auditam. */
const DONOS = new Set(["modules/m22-documentos/assinatura.ts"]);

function fontes(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "generated", ".git", ".next"].includes(e.name)) continue;
      achados.push(...fontes(p));
      continue;
    }
    if (!e.name.endsWith(".ts") || e.name.endsWith(".test.ts")) continue;
    achados.push(p);
  }
  return achados;
}

describe("efeito colateral antes da operação guardada", () => {
  it("quem chama uma operação que RECUSA confere as pré-condições ANTES de gravar", () => {
    const faltando: string[] = [];

    // ⚠️ AS RAÍZES VÊM DE `test/raizes-dominio.ts` — ver a lição registrada lá. Aqui vale
    // `RAIZES_DE_ESCRITA`, a mais larga: quem chama a operação guardada pode ser uma
    // server action, e `app/` é o lugar mais fácil de escrever a sequência errada.
    for (const raiz of raizesExistentes(RAIZ, RAIZES_DE_ESCRITA)) {
      for (const p of fontes(raiz)) {
        const rel = relative(RAIZ, p).replace(/\\/g, "/");
        if (DONOS.has(rel)) continue;

        const fonte = readFileSync(p, "utf8");
        for (const [operacao, precondicao] of Object.entries(OPERACOES_QUE_RECUSAM)) {
          // Chamada de verdade, não import nem menção em comentário.
          const chama = new RegExp(`await\\s+${operacao}\\s*\\(`).test(fonte);
          if (!chama) continue;
          if (fonte.includes(`${precondicao}(`)) continue;
          faltando.push(`${rel} chama ${operacao} sem ${precondicao}`);
        }
      }
    }

    expect(
      faltando,
      "\n\n⚠️ EFEITO COLATERAL ANTES DA OPERAÇÃO GUARDADA.\n\n" +
        "Este arquivo chama uma operação que pode RECUSAR, e não confere as " +
        "pré-condições dela antes. Se ele gravar alguma coisa primeiro — um anexo, um " +
        "borderô, um número — a recusa deixa esse efeito para trás; e se houver guarda " +
        "de unicidade sobre ele, a tentativa SEGUINTE, correta, passa a ser recusada. O " +
        "fato fica impossível de completar, para sempre.\n\n" +
        "Chame a pré-condição ANTES de gravar (a MESMA função, nunca uma cópia da " +
        "regra). Ver `exigirFilaViavel` em modules/m22-documentos/assinatura.ts.\n\n" +
        "Sítios:\n"
    ).toEqual([]);
  });
});
