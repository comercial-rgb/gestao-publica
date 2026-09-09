import "dotenv/config";
import { lerCredenciais, APP_LEITURA } from "../modules/m17-banco-bb/config.js";
import { criarClienteBb, type EventoChamadaBb } from "../modules/m17-banco-bb/cliente-bb.js";

/**
 * SMOKE DA API DO BB — homologação, REAL. FORA da suíte, e de propósito: a suíte NUNCA toca a rede
 * (vitest roda contra fixtures). Este script é do Winner rodar à mão:
 *
 *   npx tsx scripts/bb-smoke.ts <agencia> <conta> [aaaa-mm-dd_desde] [aaaa-mm-dd_ate]
 *
 * Faz EXATAMENTE 3 chamadas ao BB (dentro do teto de 10/10min da homologação):
 *   1 token (OAuth client_credentials) + 1 extrato + 1 saldo.
 *
 * Pré-requisito: BB_APP_A_APP_KEY / _CLIENT_ID / _CLIENT_SECRET em .env.local (NUNCA commitadas).
 * Se faltar env, `lerCredenciais` estoura BB-ENV-AUSENTE nomeando o que falta — antes de qualquer rede.
 */

async function main(): Promise<void> {
  const [agencia, conta, desdeArg, ateArg] = process.argv.slice(2);
  if (agencia === undefined || conta === undefined) {
    console.error("uso: npx tsx scripts/bb-smoke.ts <agencia> <conta> [aaaa-mm-dd_desde] [aaaa-mm-dd_ate]");
    process.exit(1);
    return;
  }

  const ate = ateArg !== undefined ? new Date(`${ateArg}T00:00:00Z`) : new Date();
  const desde = desdeArg !== undefined ? new Date(`${desdeArg}T00:00:00Z`) : new Date(ate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const cred = lerCredenciais(APP_LEITURA); // fail-hard se faltar env — antes da rede
  const cli = criarClienteBb({
    credenciais: cred,
    appKey: cred.appKey,
    fetch: async (url, init) => {
      const r = await fetch(url, init);
      return { status: r.status, ok: r.ok, json: () => r.json(), text: () => r.text() };
    },
    // Logger de console: só o metadado da chamada — NUNCA token/secret/appKey (o mesmo contrato do log real).
    logger: { registrar: async (e: EventoChamadaBb) => { console.log(`[bb] ${e.acao} endpoint=${e.endpoint} http=${e.httpStatus} qtd=${e.quantidade ?? "-"} ${e.resultado}${e.detalhe !== undefined ? ` (${e.detalhe})` : ""}`); } },
  });

  const agora = Date.now();
  console.log(`[smoke] agência ${agencia} conta ${conta} · ${desde.toISOString().slice(0, 10)} → ${ate.toISOString().slice(0, 10)}`);

  // (1)+(2) token + extrato.
  const extrato = await cli.extratoDoPeriodo({ agencia, conta, desde, ate }, agora);
  console.log(`[smoke] extrato: ${extrato.transacoes.length} lançamento(s).`);
  for (const t of extrato.transacoes.slice(0, 5)) {
    console.log(`  · ${t.dataPostagem.toISOString().slice(0, 10)} ${t.natureza} ${t.valor.toFixed(2)} — ${t.memo}`);
  }

  // (3) saldo (reaproveita o token cacheado — não gasta uma 4ª ida ao OAuth).
  const saldo = await cli.saldoDaConta({ agencia, conta }, agora);
  console.log(`[smoke] saldo: ${saldo}`);

  console.log("[smoke] OK — 3 chamadas (token + extrato + saldo) dentro do teto de homologação.");
}

main().catch((e: unknown) => {
  console.error("[smoke] FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
