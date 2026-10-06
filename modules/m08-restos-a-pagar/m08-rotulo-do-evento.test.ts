import { describe, expect, it } from "vitest";
import { RoteiroDeRestosAusenteError } from "./servico-roteiro.js";

/**
 * V36 — A RECUSA POR FALTA DE CONTAS CONCORDA COM A OPERAÇÃO. O percurso do cancelamento de resto leu
 * "A cancelamento de restos a pagar processados ainda não tem contas informadas": o artigo era fixo. N=2 nos gêneros.
 */
describe("M08 — a recusa sem roteiro nomeia a operação com o artigo dela", () => {
  it("a liquidação (feminino) e o pagamento e os dois cancelamentos (masculino)", () => {
    expect(new RoteiroDeRestosAusenteError("LIQUIDACAO_NAO_PROCESSADO").message).toMatch(/^A liquidação de restos a pagar não processados ainda não tem contas informadas\./);
    expect(new RoteiroDeRestosAusenteError("PAGAMENTO").message).toMatch(/^O pagamento de restos a pagar ainda não tem contas informadas\./);
    expect(new RoteiroDeRestosAusenteError("CANCELAMENTO_PROCESSADO").message).toMatch(/^O cancelamento de restos a pagar processados ainda não tem contas informadas\./);
    expect(new RoteiroDeRestosAusenteError("CANCELAMENTO_NAO_PROCESSADO").message).toMatch(/^O cancelamento de restos a pagar não processados ainda não tem contas informadas\.[\s\S]*Nada foi gravado\.$/);
  });
});
