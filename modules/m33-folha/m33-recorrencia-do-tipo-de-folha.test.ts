import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { NATUREZA_DO_TIPO_DE_FOLHA, TIPOS_DE_FOLHA, type TipoDeFolha } from "./dominio.js";

/**
 * ═══ M33 / V11 V9.4 — O CHECK DO BANCO COBRE TODO TIPO DE FOLHA, E COBRE O QUE O RECORD DIZ ═══
 *
 * ⚠️ ESTE ARQUIVO EXISTE PORQUE `ck_folha_exercicio_por_tipo` E `NATUREZA_DO_TIPO_DE_FOLHA` SÃO
 * DUAS LISTAS DA MESMA VERDADE, e uma delas não é TypeScript. O `Record<TipoDeFolha, ...>` é
 * exaustivo — um tipo novo não compila até ser classificado —, mas o compilador não alcança um
 * `CHECK` escrito em SQL dentro de uma migration. Sem este arquivo, o Record e o SQL divergem no
 * primeiro tipo novo, que é exatamente o defeito que esta empreitada já pagou com listas paralelas
 * (`ABATIMENTO_DO_ADIANTAMENTO_DO_13` entrou em duas listas e faltou na terceira, V11 V9.1).
 *
 * ⚠️ E A AFIRMAÇÃO É POR EFEITO, NUNCA PELO TEXTO DO `CHECK`. Casar o `pg_get_constraintdef` com
 * uma expressão regular seria atestar pela papelada que declara — a régua que este repositório
 * proíbe por escrito, depois de três guards que ficaram verdes casando com o comentário que
 * explicava a exclusão. O que se afirma aqui é o que o banco FAZ: para cada valor do enum, as duas
 * formas são tentadas e exatamente uma tem de ser aceita.
 *
 * ⚠️ OS VALORES VÊM DO `pg_enum`, NÃO DE `TIPOS_DE_FOLHA`. Se viessem da constante do TypeScript,
 * um valor que existisse SÓ no Postgres (migration aplicada, enum do domínio esquecido) nunca
 * seria testado — e é justamente esse valor que entraria sem classificação. A comparação dos dois
 * conjuntos é o primeiro caso abaixo.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const AUTOR = "contabilidade@cg.pb.gov.br";
/** Um ano folgado no futuro: qualquer competência real do banco de teste fica longe daqui. */
const ANO = 2099;
const COMPETENCIA = `${ANO}-01`;

class RevertidoDeProposito extends Error {}

/**
 * Tenta gravar UMA folha com a forma dada e diz se o banco a aceitou — desfazendo sempre.
 *
 * ⚠️ A TRANSAÇÃO É ABORTADA DE PROPÓSITO, e nada fica. Um teste que gravasse de verdade deixaria
 * folhas sintéticas de 2099 no banco compartilhado da suíte e a próxima corrida esbarraria no
 * `@@unique([competencia, tipo])` — falha sem defeito nenhum, que é pior que teste nenhum.
 *
 * ⚠️ E A RECUSA É CONFERIDA PELO MOTIVO. "Não gravou" é compatível com o `INSERT` ter esbarrado
 * numa unicidade, numa FK ou num erro de digitação do próprio teste: só vale como recusa o erro
 * que NOMEIA a constraint que este arquivo vigia.
 */
async function bancoAceita(tipo: string, exercicio: number | null): Promise<{ readonly aceitou: boolean; readonly motivo: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "FolhaDePagamento" ("id", "competencia", "tipo", "exercicio", "criadoPor")
         VALUES ($1, $2, $3::"TipoDeFolha", $4, $5)`,
        `sonda-${tipo}-${String(exercicio)}`,
        COMPETENCIA,
        tipo,
        exercicio,
        AUTOR
      );
      throw new RevertidoDeProposito();
    });
    return { aceitou: true, motivo: "" };
  } catch (e) {
    if (e instanceof RevertidoDeProposito) return { aceitou: true, motivo: "" };
    return { aceitou: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

async function valoresDoEnumNoBanco(): Promise<readonly string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ readonly enumlabel: string }[]>(
    `SELECT e.enumlabel AS "enumlabel"
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'TipoDeFolha'
      ORDER BY e.enumsortorder`
  );
  if (linhas.length === 0) throw new Error("não achei o tipo enumerado TipoDeFolha no banco — o leitor deste teste precisa ser corrigido antes de o teste valer");
  return linhas.map((l) => l.enumlabel);
}

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("o enum do Postgres e o do domínio são o mesmo conjunto", () => {
  it("nenhum valor existe só num dos dois lados", async () => {
    const doBanco = await valoresDoEnumNoBanco();
    expect([...doBanco].sort()).toEqual([...TIPOS_DE_FOLHA].sort());
  });

  it("o Record de classificação tem exatamente esses valores como chaves, e nenhuma a mais", () => {
    // O `Record<TipoDeFolha, ...>` já impede que FALTE uma chave (não compila). O que ele não
    // impede é uma chave SOBRANDO de um tipo que saiu do enum — e uma classificação órfã é a
    // linha que o próximo leitor acredita estar valendo.
    expect(Object.keys(NATUREZA_DO_TIPO_DE_FOLHA).sort()).toEqual([...TIPOS_DE_FOLHA].sort());
  });
});

describe("o CHECK do banco classifica TODO valor do enum — e do mesmo jeito que o Record", () => {
  it("para cada tipo, exatamente UMA das duas formas é aceita, e é a que o Record declara", async () => {
    const doBanco = await valoresDoEnumNoBanco();
    for (const tipo of doBanco) {
      const semExercicio = await bancoAceita(tipo, null);
      const comExercicio = await bancoAceita(tipo, ANO);

      /**
       * ⚠️ A PROPRIEDADE, E NÃO A FORMA: "exatamente uma". Um tipo que aceitasse as DUAS ficaria
       * sem regra nenhuma (o banco deixaria gravar uma folha por exercício E por competência, e o
       * `@@unique([exercicio, tipo])` valeria ou não conforme o operador preenchesse o campo); um
       * que não aceitasse NENHUMA é o tipo novo não classificado — que é a falha fechada por
       * desenho, e é assim que ela aparece: como este caso vermelho.
       */
      const quantas = [semExercicio.aceitou, comExercicio.aceitou].filter(Boolean).length;
      expect(
        quantas,
        `o tipo ${tipo} aceitou ${quantas} das duas formas (exercício nulo: ${semExercicio.aceitou}; exercício ${ANO}: ${comExercicio.aceitou}). ` +
          `Se aceitou NENHUMA, ele é um valor do enum que o CHECK ck_folha_exercicio_por_tipo não classifica — ` +
          `acrescente-o à lista certa na migration e a NATUREZA_DO_TIPO_DE_FOLHA. ` +
          `Recusas: [${semExercicio.motivo.slice(0, 200)}] [${comExercicio.motivo.slice(0, 200)}]`
      ).toBe(1);

      const declarado = NATUREZA_DO_TIPO_DE_FOLHA[tipo as TipoDeFolha].recorrencia;
      const observado = semExercicio.aceitou ? "POR_COMPETENCIA" : "POR_EXERCICIO";
      expect(observado, `o tipo ${tipo} está declarado como ${declarado} em NATUREZA_DO_TIPO_DE_FOLHA e o banco o trata como ${observado}`).toBe(declarado);

      // ⚠️ E A RECUSA TEM DE SER A DESTE CHECK. Sem isto, um `INSERT` que falhasse por outro
      // motivo (unicidade, coluna obrigatória, erro de digitação deste teste) contaria como
      // "classificado" e o arquivo ficaria verde sem vigiar nada.
      const recusada = semExercicio.aceitou ? comExercicio : semExercicio;
      expect(recusada.motivo, `a recusa do tipo ${tipo} não nomeou ck_folha_exercicio_por_tipo: ${recusada.motivo.slice(0, 400)}`).toContain("ck_folha_exercicio_por_tipo");
    }
  });

  it("nos tipos POR EXERCÍCIO, o exercício ainda tem de COINCIDIR com o ano da competência", async () => {
    /**
     * ⚠️ A METADE QUE UM CHECK SÓ DE PRESENÇA PERDERIA. Sem a coincidência, uma folha de 13º de
     * 2099 poderia ser gravada com `exercicio = 2098`: o cálculo leria os avos de um ano e a
     * memória citaria outro, e nada acusaria. Este caso existe para que "o exercício está
     * preenchido" não seja confundido com "o exercício está certo".
     */
    const porExercicio = TIPOS_DE_FOLHA.filter((t) => NATUREZA_DO_TIPO_DE_FOLHA[t].recorrencia === "POR_EXERCICIO");
    expect(porExercicio.length, "nenhum tipo é POR_EXERCICIO — este caso passaria por vacuidade").toBeGreaterThan(0);
    for (const tipo of porExercicio) {
      const errado = await bancoAceita(tipo, ANO - 1);
      expect(errado.aceitou, `o tipo ${tipo} aceitou exercício ${ANO - 1} numa competência de ${ANO}`).toBe(false);
      expect(errado.motivo).toContain("ck_folha_exercicio_por_tipo");
    }
  });
});
