import { describe, expect, it } from "vitest";
import { Prisma } from "../../prisma/generated/client/client.js";
import { DIMENSOES_DO_EMPENHO, VINCULOS_QUE_NAO_SAO_DIMENSAO } from "./adapter-prisma.js";

/**
 * AS DIMENSÕES QUE A ANULAÇÃO COPIA (V22) — propriedade, não lista de casos: TODO vínculo do
 * `Empenho` (coluna terminada em `Id`, lida do cliente gerado a partir do schema, e não do
 * adaptador) ou é dimensão copiada para a anulação, ou está declarado como vínculo que não se
 * copia, com o motivo ao lado. Coluna nova no modelo sem essa decisão quebra aqui.
 *
 * Por que importa: a dívida faltava na anulação total, e a obra e a ordem de compra no estorno
 * da anulação parcial — cada cópia era escrita à mão em três lugares. A soma filtrada por uma
 * dimensão esquecida via o empenho e não via a redução dele.
 *
 * A cópia em si (o efeito) é conferida no banco em `m05-solicitacao-de-empenho.test.ts` (t12).
 */
describe("as dimensões do empenho nas anulações", () => {
  const vinculosDoModelo = Object.values(Prisma.EmpenhoScalarFieldEnum).filter((c) => c !== "id" && c.endsWith("Id"));

  it("todo vínculo do Empenho é dimensão copiada ou vínculo declarado como não copiado", () => {
    const declarados = new Set<string>([...DIMENSOES_DO_EMPENHO, ...VINCULOS_QUE_NAO_SAO_DIMENSAO]);
    const semDecisao = vinculosDoModelo.filter((c) => !declarados.has(c));
    expect(semDecisao, `vínculo(s) do Empenho sem decisão sobre a anulação: ${semDecisao.join(", ")}`).toEqual([]);
  });

  it("as duas listas só nomeiam colunas que existem, e nenhuma coluna está nas duas", () => {
    const doModelo = new Set<string>(vinculosDoModelo);
    expect([...DIMENSOES_DO_EMPENHO, ...VINCULOS_QUE_NAO_SAO_DIMENSAO].filter((c) => !doModelo.has(c))).toEqual([]);
    expect(DIMENSOES_DO_EMPENHO.filter((d) => (VINCULOS_QUE_NAO_SAO_DIMENSAO as readonly string[]).includes(d))).toEqual([]);
  });

  it("a dívida, a obra e a ordem de compra — as que faltavam — são dimensões copiadas", () => {
    expect(DIMENSOES_DO_EMPENHO).toEqual(expect.arrayContaining(["dividaId", "obraId", "ordemDeCompraId", "convenioId", "contratoId"]));
  });
});
