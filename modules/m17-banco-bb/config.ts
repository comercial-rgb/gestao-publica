import { z } from "zod";

/**
 * M17 — CONFIG DA API DO BANCO DO BRASIL (homologação, LEITURA).
 *
 * ═══ ⚠️ ENV VALIDADO, JAMAIS DEFAULT SILENCIOSO ═══
 * Uma credencial ausente é ERRO NOMEADO no boot do adapter — nunca um `undefined` que vira um
 * request quebrado três camadas adiante. O Zod é a fronteira: ou as três credenciais existem, ou o
 * adapter recusa dizendo QUAL falta.
 *
 * ═══ ⚠️ O SPEC DA API EXTRATOS É SUPOSIÇÃO NOMEADA (Passo 0.b) ═══
 * O Swagger oficial NÃO foi acessível deste ambiente (cert/403/SPA/DNS — ver o relatório do Passo
 * 0). Os paths, o scope, os NOMES DE CAMPO e os formatos abaixo são o shape público bem-documentado
 * da API Extratos v1 — **assumidos**, para o Winner CONFIRMAR contra o Swagger baixado no portal
 * logado. Estão TODOS aqui, num lugar só, de propósito: confirmar/corrigir é editar este objeto, e
 * nada mais. O que NÃO é suposição (veio do bloco oficial da sessão) está marcado OFICIAL.
 */

/** Zod: as três credenciais de uma app. Ausência/vazio = erro nomeado. */
const zCredenciaisBb = z.object({
  appKey: z.string().min(1, "APP_KEY ausente"),
  clientId: z.string().min(1, "CLIENT_ID ausente"),
  clientSecret: z.string().min(1, "CLIENT_SECRET ausente"),
});
export type CredenciaisBb = z.infer<typeof zCredenciaisBb>;

export type AppBb = "A" | "B";

/**
 * Lê e VALIDA as credenciais de uma app do ambiente. Fail-hard, nomeando o que falta e QUAL app —
 * o mesmo padrão do `exigirSenhaDoAmbiente` do bootstrap.
 *
 * ⚠️ A app da LEITURA (Extratos) é a **App A** (suposição do Passo 0.d: o portal não foi acessível
 * para confirmar qual das duas está habilitada em Extratos). App B fica para o M17-b (pagamentos).
 */
export function lerCredenciais(app: AppBb, env: NodeJS.ProcessEnv = process.env): CredenciaisBb {
  const prefixo = `BB_APP_${app}`;
  const bruto = {
    appKey: env[`${prefixo}_APP_KEY`],
    clientId: env[`${prefixo}_CLIENT_ID`],
    clientSecret: env[`${prefixo}_CLIENT_SECRET`],
  };
  const r = zCredenciaisBb.safeParse(bruto);
  if (!r.success) {
    const faltando = r.error.issues.map((i) => `${prefixo}_${String(i.path[0]).toUpperCase()} (${i.message})`).join(", ");
    throw new Error(
      `BB-ENV-AUSENTE: credencial(is) da App ${app} não configurada(s): ${faltando}. Defina em .env.local ` +
        `(NUNCA no git). Nada foi chamado — o adapter recusa antes de tocar a rede.`
    );
  }
  return r.data;
}

/** A app da leitura desta sessão — ver `lerCredenciais`. */
export const APP_LEITURA: AppBb = "A";

/**
 * O SPEC da API. ⚠️ Os campos marcados SUPOSIÇÃO aguardam confirmação no Swagger (Passo 0.b).
 */
export const SPEC_BB = {
  /** OFICIAL (bloco da sessão): endpoint de token, client_credentials. */
  oauthTokenUrl: "https://oauth.hm.bb.com.br/oauth/token",
  /** OFICIAL-ish: host de homologação. ⚠️ Alguns produtos usam api.sandbox.bb.com.br — o Swagger decide. */
  apiBaseUrl: "https://api.hm.bb.com.br",
  /** OFICIAL (bloco): 10 chamadas / 10 minutos em homologação. */
  rateLimite: { chamadas: 10, janelaMs: 10 * 60 * 1000 },
  /** OFICIAL (bloco): margem de 60s antes do expiry para renovar o token. */
  margemTokenMs: 60 * 1000,

  /** ⚠️ SUPOSIÇÃO — o scope da API Extratos. Confirmar no Swagger. */
  scopeExtratos: "extrato-info",
  /** ⚠️ SUPOSIÇÃO — o path do extrato de conta corrente (v1). `{agencia}`/`{conta}` são substituídos. */
  pathExtrato: "/extratos/v1/conta-corrente/agencia/{agencia}/conta/{conta}",
  /**
   * ⚠️ SUPOSIÇÃO — os NOMES DE CAMPO da resposta e os formatos. O shape público da Extratos v1:
   *   resposta: { numeroPaginaAtual, quantidadeRegistro, listaLancamento: [...] }
   *   entrada:  { dataLancamento: ddmmaaaa (número), valorLancamento: número, indicadorTipoLancamento: "C"|"D",
   *              textoDescricaoHistorico: string, numeroDocumento: número, numeroLancamento: número, textoInformacaoComplementar }
   *   saldo:    a Extratos v1 NÃO tem endpoint de saldo separado — o saldo do dia é o último lançamento
   *             informado (indicadorTipoLancamento com o saldo) OU o campo `valorSaldoUltimo` da resposta.
   *             ⚠️ CONFIRMAR: se houver endpoint próprio de saldo, o `saldoDaConta` passa a chamá-lo.
   */
  campos: {
    lista: "listaLancamento",
    data: "dataLancamento",
    valor: "valorLancamento",
    indicador: "indicadorTipoLancamento",
    historico: "textoDescricaoHistorico",
    documento: "numeroDocumento",
    sequencia: "numeroLancamento",
    complemento: "textoInformacaoComplementar",
    indicadorCredito: "C",
  },
  /** ⚠️ SUPOSIÇÃO — paginação. */
  paginacao: { paramPagina: "numeroPaginaSolicitacao", paramTamanho: "quantidadeRegistroPaginaSolicitacao", campoPaginaAtual: "numeroPaginaAtual" },
} as const;
