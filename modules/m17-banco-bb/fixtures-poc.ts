import { normalizarExtratoBb, type ContextoConta } from "./normalizar.js";
import type { ExtratoOfx } from "../../packages/ofx/index.js";

/**
 * FIXTURE POC — extrato sintético do Banco do Brasil no formato SPEC_BB (a resposta que a API de
 * Extratos devolveria). Cobre os fatos da massa POC (S-massa) da conta A: o repasse que entra, o
 * pagamento de serviços que sai e a transferência para a conta B. NENHUM dado real — é massa POC.
 *
 * ⚠️ Formato SPEC_BB (M17-a): `listaLancamento` com `dataLancamento` (ddmmaaaa numérico),
 * `valorLancamento` (número), `indicadorTipoLancamento` ("C"/"D"), histórico, documento, sequência.
 */
export const RESPOSTA_BB_POC_CONTA_A: Record<string, unknown> = {
  numeroPaginaAtual: 1,
  listaLancamento: [
    { dataLancamento: 5072026, valorLancamento: 80000.0, indicadorTipoLancamento: "C", textoDescricaoHistorico: "REPASSE RECURSOS ORDINARIOS POC", numeroDocumento: 1001, numeroLancamento: 1 },
    { dataLancamento: 14072026, valorLancamento: 50000.0, indicadorTipoLancamento: "D", textoDescricaoHistorico: "PAGAMENTO SERVICOS POC", numeroDocumento: 2001, numeroLancamento: 2 },
    { dataLancamento: 15072026, valorLancamento: 2500.0, indicadorTipoLancamento: "D", textoDescricaoHistorico: "TRANSFERENCIA P/ CONTA B POC", numeroDocumento: 3001, numeroLancamento: 3 },
  ],
};

/** O contexto (agência/conta/período) da conta A da massa POC. */
export const CTX_POC_CONTA_A: ContextoConta = {
  agencia: "1234",
  conta: "11111",
  desde: new Date(Date.UTC(2026, 6, 1)),
  ate: new Date(Date.UTC(2026, 6, 31)),
};

/** O extrato POC da conta A, já normalizado para `ExtratoOfx` (o que `importarExtratoBb` ingere). */
export function extratoPocContaA(): ExtratoOfx {
  return normalizarExtratoBb(RESPOSTA_BB_POC_CONTA_A, CTX_POC_CONTA_A);
}
