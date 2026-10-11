import { describe, expect, it } from "vitest";
import { ESCRITA_MUTAVEL_DO_RUNTIME } from "../prisma/papel-runtime.js";
import { escritasDoTexto, escritasMutaveis, type EscritaMutavel } from "./varredura-de-escrita.js";

/**
 * V39-R3 — TODO `update`/`updateMany` TEM AS COLUNAS NO CENSO DE ESCRITA DO PAPEL DE RUNTIME, E TODO `delete`/`deleteMany`
 * TEM A TABELA COM `delete: true`.
 *
 * ⚠️ O DEFEITO QUE ISTO VIGIA FOI MEDIDO NA BASE DE ENSAIO DA R3 (11/10/2026), operando pela tela com o papel de runtime:
 * "permission denied for table InventarioDeEstoque" ao FECHAR o inventário do almoxarifado. O fechamento faz UPDATE da
 * data de fechamento, e a tabela não estava no censo. A suíte chama o domínio como dono e nunca acusou; em produção,
 * fechar inventário nunca funcionou. A guarda do `upsert` (V39) não via o `update` simples — e havia mais sete.
 *
 * Propriedade, não lista: varre o código de produção e exige cada coluna escrita no censo. O leitor de chaves está em
 * `varredura-de-escrita.ts`, e a prova de que ele acusa (comentário, aspas, espalhamento condicional e de variável)
 * está aqui, com trechos sintéticos.
 */

function faltas(escritas: readonly EscritaMutavel[]): string[] {
  return escritas.flatMap((x) => {
    const c = ESCRITA_MUTAVEL_DO_RUNTIME[x.modelo];
    if (x.op === "delete") return c?.delete === true ? [] : [`${x.onde} DELETE ${x.modelo}`];
    if (x.op === "upsert") return [];
    return x.colunas.filter((col) => !(c?.update ?? []).includes(col)).map((col) => `${x.onde} ${x.modelo}.${col}`);
  });
}

describe("V39-R3 — update e delete no censo de escrita do papel de runtime", () => {
  it("a varredura acha as escritas mutáveis conhecidas (senão o teste passaria por vacuidade)", () => {
    const e = escritasMutaveis();
    expect(e.some((x) => x.modelo === "Usuario" && x.op === "update")).toBe(true);
    expect(e.some((x) => x.modelo === "InventarioDeEstoque" && x.op === "update" && x.colunas.includes("dataFechamento"))).toBe(true);
    expect(e.some((x) => x.modelo === "ProvidenciaDaIrregularidade" && x.colunas.includes("motivoDaRecusa"))).toBe(true);
    expect(e.length).toBeGreaterThanOrEqual(15);
  });

  it("A GUARDA ACUSA: coluna fora do censo atrás de comentário, entre aspas, em espalhamento condicional e por variável", () => {
    const trecho = `
      await tx.usuario.update({ where: { id }, data: {
        // um comentário antes da coluna
        "nome": x,
        ...(c ? { email: y } : {}),
        ativo: false,
      } });
      await tx.usuario.updateMany({ where: { id }, data: dados });
      await tx.usuario.update({ where: { id }, data: { ...resto } });
      await tx.lancamentoContabil.delete({ where: { id } });
    `;
    expect(faltas(escritasDoTexto(trecho))).toEqual([
      "trecho:2 Usuario.nome",
      "trecho:2 Usuario.email",
      "trecho:8 Usuario.<data não literal>",
      "trecho:9 Usuario.<...resto>",
      "trecho:10 DELETE LancamentoContabil",
    ]);
  });

  it("toda coluna atualizada está no censo, e toda tabela apagada tem delete no censo", () => {
    expect(faltas(escritasMutaveis())).toEqual([]);
  });
});
