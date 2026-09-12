import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { diaCivil, FUSO_DO_ENTE, inicioDoDiaCivil } from "../packages/datas/index.js";

/**
 * ═══ ⚠️ A DATA DO FORMULÁRIO NÃO PODE CHEGAR CRUA AO DOMÍNIO ═══
 *
 * `EIXO-DE-DATA-NA-ENTRADA-DO-ENT05`, caracterizado em
 * `modules/m10-patrimonial/m10-eixo-de-data-da-entrada.test.ts` e corrigido aqui.
 *
 * `<input type="date">` entrega `YYYY-MM-DD`. Entregue CRUA a um `z.coerce.date()`, ela vira
 * meia-noite **UTC**, e no fuso do ente (UTC-3) o dia civil desse instante é o ANTERIOR: o
 * operador digita 11 e o sistema guarda um instante cujo dia civil é 10. Como
 * `posicaoDeEstoque` corta por dia civil, o movimento digitado como 11 entrava na posição
 * pedida "até 10".
 *
 * ═══ ⚠️ POR QUE ESTE GUARD É DE FRONTEIRA, E NÃO UMA QUARTA FORMA PROIBIDA ═══
 *
 * O ENT06 tentou acrescentar `z.coerce.date` às formas que `test/data-civil.test.ts` proíbe
 * no código-fonte. Acusou **96 sítios**, 54 deles nos módulos do ENT05, e foi revertido — com
 * razão: `z.coerce.date` é INÓCUO quando recebe um `Date` ou um instante ISO completo, que é
 * o que testes, seeds e serviços internos passam. O defeito não é a forma no texto: é o FLUXO
 * DE DADOS — uma string `YYYY-MM-DD` crua atravessando a fronteira do formulário.
 *
 * Então o guard vigia a FRONTEIRA, que são os arquivos onde o molde monta a entrada dos
 * serviços a partir de `Campos` (que é `Record<string, string>`). Ali, e só ali, um campo de
 * data tem de passar pela âncora civil.
 */

const RAIZ = resolve(import.meta.dirname, "..");

/**
 * Os arquivos onde o molde converte `Campos` (strings do formulário) em entrada de serviço.
 *
 * ⚠️ A LISTA É EXPLÍCITA, e não um glob: um arquivo novo de fronteira é uma DECISÃO, e quem
 * o criar tem de vir aqui dizer que ele existe. Um glob daria cobertura silenciosa e
 * enganosa — o dia em que alguém movesse a fronteira, o guard continuaria verde vigiando o
 * lugar errado.
 */
const FRONTEIRAS: readonly string[] = [
  "lib/portas/recursos/almoxarifado-dados.ts",
  "lib/portas/recursos/dados.ts",
];

/** Os campos que são DIA civil, pelo nome — é a convenção do repositório inteiro. */
const CAMPO_DE_DATA =
  /\b(data[A-Za-z]*|vigencia[A-Za-z]*|inicio|fim|validade[A-Za-z]*)\s*:\s*t\(\s*c\s*,/g;

/** O mesmo campo, já ancorado. Serve à amarração contra vacuidade. */
const CAMPO_ANCORADO =
  /\b(data[A-Za-z]*|vigencia[A-Za-z]*|inicio|fim|validade[A-Za-z]*)\s*:\s*dia\(\s*c\s*,/g;

function ocorrencias(conteudo: string, padrao: RegExp): readonly string[] {
  return [...conteudo.matchAll(padrao)].map((m) => m[0]);
}

describe("o eixo da data na fronteira do molde", () => {
  it("nenhum campo de data do formulário chega ao serviço sem a âncora civil", () => {
    const crus: string[] = [];

    for (const rel of FRONTEIRAS) {
      const conteudo = readFileSync(resolve(RAIZ, rel), "utf8");
      for (const achado of ocorrencias(conteudo, CAMPO_DE_DATA)) {
        crus.push(`${rel}: ${achado}`);
      }
    }

    expect(
      crus,
      "\n\n⚠️ DATA DO FORMULÁRIO ENTREGUE CRUA AO DOMÍNIO.\n\n" +
        "Um campo `YYYY-MM-DD` passado por `t(c, ...)` vira meia-noite UTC no " +
        "`z.coerce.date()` do serviço — e no fuso do ente esse instante é do dia ANTERIOR. " +
        "O operador digita um dia e o sistema guarda outro, sem erro e sem aviso.\n\n" +
        "Use `dia(c, ...)`, que ancora com `inicioDoDiaCivil` na meia-noite DO ENTE.\n\n" +
        "Crus:\n"
    ).toEqual([]);
  });

  /**
   * ⚠️ A AMARRAÇÃO CONTRA VACUIDADE. Sem ela, apagar os campos de data das fronteiras
   * deixaria o teste acima verde — e um guard que fica verde quando o que ele vigia
   * desaparece não vigia nada.
   */
  it("e a fronteira realmente converte datas — o guard não passa por ausência", () => {
    let ancorados = 0;
    for (const rel of FRONTEIRAS) {
      const conteudo = readFileSync(resolve(RAIZ, rel), "utf8");
      ancorados += ocorrencias(conteudo, CAMPO_ANCORADO).length;
    }

    // Sete no almoxarifado (bloqueio, encerramento, requisição, movimento, abertura e
    // fechamento de inventário). Os demais cadastros recebem `zDia` no domínio e não
    // convertem aqui — por isso o piso, e não a igualdade.
    expect(
      ancorados,
      "nenhum campo de data ancorado nas fronteiras: ou elas mudaram de lugar, ou o guard " +
        "passou a vigiar arquivo que não converte data nenhuma"
    ).toBeGreaterThanOrEqual(7);
  });

  /**
   * O EFEITO, e não a forma: é esta asserção que descreve por que as duas acima existem.
   */
  it("a âncora civil guarda o dia que o operador digitou; a crua guarda o anterior", () => {
    const digitado = "2026-09-11";

    const ancorado = inicioDoDiaCivil(digitado);
    expect(diaCivil(ancorado, FUSO_DO_ENTE)).toBe(digitado);

    const cru = z.coerce.date().parse(digitado);
    expect(diaCivil(cru, FUSO_DO_ENTE)).toBe("2026-09-10");
  });
});
