import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NATUREZAS_DA_RUBRICA, NATUREZAS_QUE_SAO_DESCONTO, TIPOS_DE_FOLHA, zAbrirFolhaInput, zCadastrarRubricaInput } from "./dominio.js";

/**
 * ═══ AS LISTAS DA MESMA VERDADE TÊM DE CONCORDAR (V11 V9.1) ═══
 *
 * ⚠️ ESTE ARQUIVO NASCE DE UM DEFEITO REAL, E O DEFEITO NÃO ERA DE COMPILAÇÃO.
 * `NaturezaDaRubrica` existia em TRÊS lugares: o `type` do domínio, o `z.enum` de
 * `zCadastrarRubricaInput` e o enum de `prisma/schema/m33-folha.prisma`. Na V11 V9.1 o valor
 * `ABATIMENTO_DO_ADIANTAMENTO_DO_13` entrou nos dois primeiros e faltou no terceiro — e nada
 * ficou vermelho. O `parse` recusaria a natureza na ENTRADA; a única rubrica que o motor do 13º
 * sabe ler seria incadastrável; a 2ª parcela nunca abateria a 1ª; **o ente pagaria o 13º inteiro
 * a quem já recebeu metade**. Com o domínio inteiro verde.
 *
 * ⚠️ E A PRIMEIRA PROVIDÊNCIA NÃO FOI ESTE TESTE — FOI APAGAR UMA DAS LISTAS. O `type` e o
 * `z.enum` agora DERIVAM de `NATUREZAS_DA_RUBRICA`, e divergir entre eles virou impossível. Teste
 * que vigia duas cópias é pior que uma cópia a menos: ele permite a cópia continuar existindo.
 *
 * Sobra a lista que NÃO é TypeScript — o enum do arquivo `.prisma` —, e é ela que este arquivo
 * afirma. Ela não pode ser derivada: o schema do Prisma é outro idioma, lido por outra ferramenta,
 * e é ele que vira o tipo do Postgres.
 *
 * ⚠️ E O `.PRISMA` É LIDO DO ARQUIVO, NÃO DO CLIENTE GERADO. `prisma/generated/` é produto de um
 * `generate` que pode estar velho: conferir o schema contra o cliente gerado a partir dele é o
 * parser conferindo o próprio parser — o defeito que este repositório já registrou. A fonte é o
 * texto que a migration acompanha.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Extrai os valores de um enum de um arquivo `.prisma`. Implementação independente: nada aqui
 * importa o cliente gerado nem o próprio domínio.
 *
 * Descarta comentários de documentação (`///`) e de linha (`//`), e aceita só identificadores —
 * um enum do Prisma não tem vírgula nem aspas, então qualquer outra coisa na linha é sinal de que
 * este leitor deixou de entender o arquivo, e aí é melhor não achar nada do que achar errado.
 */
function valoresDoEnumPrisma(arquivo: string, nome: string): readonly string[] {
  const texto = readFileSync(`${RAIZ}${arquivo}`, "utf8");
  const bloco = new RegExp(`\\benum\\s+${nome}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(texto);
  if (bloco === null) throw new Error(`não achei o enum ${nome} em ${arquivo} — o leitor deste teste precisa ser corrigido antes de o teste valer`);
  return bloco[1]!
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//"))
    .map((l) => {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(l);
      if (m === null) throw new Error(`linha inesperada dentro do enum ${nome}: ${JSON.stringify(l)}`);
      return m[1]!;
    });
}

describe("as listas de NaturezaDaRubrica concordam", () => {
  it("o enum do .prisma tem exatamente as naturezas do domínio", () => {
    const doPrisma = valoresDoEnumPrisma("prisma/schema/m33-folha.prisma", "NaturezaDaRubrica");
    // Ordenadas: o que importa é o CONJUNTO. A ordem do enum do Postgres é significativa para
    // comparação (`<`), e nada no M33 compara natureza por ordem — se um dia comparar, este
    // teste tem de virar `toEqual` sem ordenar, e o comentário fica aqui para quem o mudar.
    expect([...doPrisma].sort()).toEqual([...NATUREZAS_DA_RUBRICA].sort());
  });

  it("o Zod de cadastro aceita exatamente as mesmas, porque DERIVA da mesma lista", () => {
    // ⚠️ ESTE CASO NÃO É REDUNDANTE COM O ANTERIOR: ele afirma que a derivação continua de pé. O
    // dia em que alguém "desderivar" o `z.enum` para acrescentar uma natureza só ao cadastro, é
    // aqui que aparece.
    const forma = zCadastrarRubricaInput as unknown as { readonly _def: { readonly schema?: { readonly shape?: Record<string, { readonly options?: readonly string[] }> } } };
    const opcoes = forma._def.schema?.shape?.["natureza"]?.options;
    if (opcoes === undefined) {
      // A introspecção do Zod mudou de forma entre versões. Em vez de passar em silêncio (que é
      // o teste que não acusa nada), afirmamos pelo COMPORTAMENTO: toda natureza é aceita e uma
      // inventada é recusada.
      for (const n of NATUREZAS_DA_RUBRICA) {
        const r = zCadastrarRubricaInput.safeParse(entradaValida(n));
        expect(r.success, `a natureza ${n} deveria ser aceita pelo cadastro`).toBe(true);
      }
      expect(zCadastrarRubricaInput.safeParse(entradaValida("NATUREZA_QUE_NAO_EXISTE")).success).toBe(false);
      return;
    }
    expect([...opcoes].sort()).toEqual([...NATUREZAS_DA_RUBRICA].sort());
  });

  it("toda natureza declarada é de fato cadastrável — o defeito da V11 V9.1, afirmado pelo efeito", () => {
    // ⚠️ AFIRMAR PELO EFEITO, e não pela papelada: "a lista tem o valor" não prova que o cadastro
    // o aceita. Foi exatamente essa distância que deixou o abatimento do 13º incadastrável.
    for (const n of NATUREZAS_DA_RUBRICA) {
      const r = zCadastrarRubricaInput.safeParse(entradaValida(n));
      expect(r.success, `a natureza ${n} está declarada e o cadastro a recusa`).toBe(true);
    }
  });
});

describe("as listas de TipoDeFolha concordam", () => {
  it("o enum do .prisma tem exatamente os tipos do domínio", () => {
    const doPrisma = valoresDoEnumPrisma("prisma/schema/m33-folha.prisma", "TipoDeFolha");
    expect([...doPrisma].sort()).toEqual([...TIPOS_DE_FOLHA].sort());
  });

  it("abrir folha aceita exatamente esses tipos, e recusa um inventado", () => {
    for (const t of TIPOS_DE_FOLHA) {
      const r = zAbrirFolhaInput.safeParse({ competencia: "2026-12", tipo: t, criadoPor: "teste" });
      expect(r.success, `o tipo ${t} está declarado e abrirFolha o recusa`).toBe(true);
    }
    expect(zAbrirFolhaInput.safeParse({ competencia: "2026-12", tipo: "FERIAS", criadoPor: "teste" }).success).toBe(false);
  });
});

/**
 * Uma entrada de cadastro de rubrica VÁLIDA para a natureza dada — o mínimo para que a única
 * recusa possível seja a da natureza. As naturezas com regra própria (percentual obrigatório,
 * tipo imposto) recebem o que a regra pede, senão o teste mediria a regra e não a lista.
 */
function entradaValida(natureza: string): Record<string, unknown> {
  /**
   * ⚠️ V13 — DERIVA DO DOMÍNIO, e esta linha era uma TERCEIRA cópia da mesma lista. Ela ficou
   * para trás quando `ABATIMENTO_DO_ADIANTAMENTO_SALARIAL` nasceu: o helper montava a rubrica
   * como PROVENTO, o cadastro a recusava com razão, e o caso acusava "natureza declarada e
   * incadastrável" — um vermelho VERDADEIRO sobre um fato FALSO. Um teste que carrega a própria
   * cópia da regra afirma a cópia, não a regra.
   */
  const desconto = (NATUREZAS_QUE_SAO_DESCONTO as readonly string[]).includes(natureza);
  return {
    codigo: "X1",
    descricao: "Rubrica de teste",
    tipo: desconto ? "DESCONTO" : "PROVENTO",
    natureza,
    ...(natureza === "PERCENTUAL_DO_VENCIMENTO" ? { percentual: "0.20" } : {}),
    incideContribuicao: false,
    incideIrrf: false,
    proporcionalAosDias: false,
    ordem: 1,
    fundamentacaoLegal: "fixture sintetica deste teste",
    criadoPor: "teste",
  };
}
