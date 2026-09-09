import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao } from "./sessao";
import { criarRegistroDeOperacaoPrisma } from "../../modules/m16-travamento/operacao";
import { lerCredenciais, APP_LEITURA } from "../../modules/m17-banco-bb/config";
import { criarClienteBb, type EventoChamadaBb, type LoggerBb } from "../../modules/m17-banco-bb/cliente-bb";
import { importarExtratoBb } from "../../modules/m09-tesouraria/extrato";

/**
 * PORTA — PROVEDOR BANCÁRIO (leitura). M17-a: Banco do Brasil, homologação.
 *
 * ⚠️ SÓ LEITURA nesta sessão: extrato e saldo. A ESCRITA (pagamento, TR 5.38) é o M17-b. A porta é a
 * ÚNICA superfície que o app enxerga — o adapter M17 (OAuth, rate-limit, normalização) vive em
 * `modules/m17-banco-bb/` e nunca é importado por `app/` direto (grep trivalente).
 *
 * ⚠️ O LOG (TR 4.12.2) sai da própria chamada, via `LoggerBb` → `RegistroDeOperacao`, com endpoint,
 * período, http status e contagem — NUNCA token/secret/appKey (o teste do F4 prova o logger cego).
 */

export { PortaSemBancoError };

export interface PeriodoConta {
  readonly agencia: string;
  readonly conta: string;
  readonly desde: Date;
  readonly ate: Date;
}

/** O contrato de leitura do provedor bancário — o que a tela consome. */
export interface PortaBancoProvider {
  readonly extratoDoPeriodo: (p: PeriodoConta) => Promise<ExtratoDaTela>;
  readonly saldoDaConta: (p: { agencia: string; conta: string; desde: Date; ate: Date }) => Promise<string>;
}

export interface LancamentoExtratoTela {
  readonly fitid: string;
  readonly data: Date;
  readonly valor: string;
  readonly natureza: "CREDITO" | "DEBITO";
  readonly memo: string;
  readonly documento: string | null;
}
export interface ExtratoDaTela {
  readonly conta: string;
  readonly origem: "API_BB";
  readonly lancamentos: readonly LancamentoExtratoTela[];
}

/** O logger da porta: cada chamada à API vira `RegistroDeOperacao`, sem credencial no texto. */
function loggerDaPorta(ident: string): LoggerBb {
  const registro = criarRegistroDeOperacaoPrisma(cliente());
  return {
    async registrar(e: EventoChamadaBb): Promise<void> {
      await registro.registrar({
        usuarioIdent: ident,
        acao: e.acao,
        resultado: e.resultado === "SUCESSO" ? "SUCESSO" : "ERRO",
        // ⚠️ Só metadado da chamada — endpoint (path, sem a query com o appKey), período, status, contagem.
        detalhe: `endpoint=${e.endpoint} periodo=${e.periodo ?? "-"} http=${e.httpStatus} qtd=${e.quantidade ?? "-"}${e.detalhe !== undefined ? ` (${e.detalhe})` : ""}`,
      });
    },
  };
}

/** Constrói o cliente BB de PRODUÇÃO (fetch real + relógio real), logando como `ident`. */
function clienteReal(ident: string) {
  const cred = lerCredenciais(APP_LEITURA); // fail-hard se faltar env
  return criarClienteBb({
    credenciais: cred,
    appKey: cred.appKey,
    // O fetch nativo do Node, adaptado ao FetchLike (só os campos que o cliente usa).
    fetch: async (url, init) => {
      const r = await fetch(url, init);
      return { status: r.status, ok: r.ok, json: () => r.json(), text: () => r.text() };
    },
    logger: loggerDaPorta(ident),
  });
}

/**
 * IMPORTAR o extrato do BB para a conciliação — escrita autenticada (IMPORTAR_EXTRATO). Busca na API
 * e ingere pelo MESMO núcleo do OFX; a origem gravada é API_BB.
 */
export async function importarExtratoDoBb(p: { readonly contaBancariaId: string } & PeriodoConta): Promise<{
  readonly extratoId: string;
  readonly jaImportado: boolean;
  readonly inseridas: number;
  readonly puladas: number;
}> {
  return comEscritaAutenticada("IMPORTAR_EXTRATO", async (ident) => {
    const bb = clienteReal(ident);
    const extrato = await bb.extratoDoPeriodo({ agencia: p.agencia, conta: p.conta, desde: p.desde, ate: p.ate }, Date.now());
    const r = await importarExtratoBb(cliente(), { contaBancariaId: p.contaBancariaId, extrato, importadoPor: ident });
    return { extratoId: r.extratoId, jaImportado: r.jaImportado, inseridas: r.inseridas, puladas: r.puladas };
  });
}

/** LER o extrato/saldo do BB para o painel (TR 5.72) — exige sessão (a identidade que loga a chamada). */
export async function consultarExtratoDoBb(p: PeriodoConta): Promise<ExtratoDaTela> {
  const ident = (await exigirSessao()).identificador;
  const bb = clienteReal(ident);
  const extrato = await bb.extratoDoPeriodo(p, Date.now());
  return {
    conta: p.conta,
    origem: "API_BB",
    lancamentos: extrato.transacoes.map((t) => ({
      fitid: t.fitid,
      data: t.dataPostagem,
      valor: t.valor.toFixed(2),
      natureza: t.natureza,
      memo: t.memo,
      documento: t.documento ?? null,
    })),
  };
}

export async function consultarSaldoDoBb(p: { agencia: string; conta: string; desde: Date; ate: Date }): Promise<string> {
  const ident = (await exigirSessao()).identificador;
  const bb = clienteReal(ident);
  return bb.saldoDaConta({ agencia: p.agencia, conta: p.conta }, Date.now());
}
