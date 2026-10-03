import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, registroDePassos, type Navegador } from "./percursos-navegador.js";

/**
 * V33 — A CONFERÊNCIA DEPOIS DA SUBIDA DA PROMOÇÃO DA 3010, ENSAIADA NA 3011 SOBRE A CÓPIA DO BANCO DA APRESENTAÇÃO.
 * Somente leitura: abre as telas novas e as que a promoção não pode quebrar, como o administrador da apresentação.
 * Uso: DATABASE_URL=<cópia> npx tsx scripts/percurso-v33-promocao.ts http://localhost:3011 <senha-admin>
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SENHA = process.argv[3] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const N: Navegador = { base: BASE };

const TELAS: readonly { readonly rota: string; readonly marca: RegExp; readonly passo: string }[] = [
  { rota: "/?exercicio=2026", marca: /Planejamento/i, passo: "P.1 a entrada abre com o menu do contador" },
  { rota: "/planejamento/fichas?exercicio=2026", marca: /Ficha|ficha/i, passo: "P.2 as fichas de 2026 continuam" },
  { rota: "/planejamento/proposta-orcamentaria?exercicio=2026", marca: /[Pp]roposta/i, passo: "P.3 a proposta orçamentária (V29) abre" },
  { rota: "/despesa/a-pagar?exercicio=2026", marca: /Liquidado a pagar/i, passo: "P.4 A pagar por credor abre" },
  { rota: "/despesa/anulacoes?exercicio=2026", marca: /Anulações registradas/i, passo: "P.5 a central de anulações abre" },
  { rota: "/contabilidade/fechamento-mensal?exercicio=2026", marca: /Fechamento mensal/i, passo: "P.6 o fechamento mensal (V32) abre" },
  { rota: "/contabilidade/unidades-gestoras", marca: /De qual unidade gestora é cada unidade orçamentária/i, passo: "P.7 o vínculo unidade -> UG (V33) abre" },
  { rota: "/despesa/adiantamentos", marca: /[Dd]iária|[Ss]uprimento/i, passo: "P.8 diárias e suprimento (V32) abre" },
  { rota: "/integracoes/sagres", marca: /SAGRES/i, passo: "P.9 o SAGRES abre" },
  { rota: "/relatorios/demonstracoes/balanco-patrimonial?exercicio=2026", marca: /Balanço Patrimonial/i, passo: "P.10 o Balanço Patrimonial abre" },
];

async function main(): Promise<void> {
  if (SENHA === "") throw new Error("A senha do administrador é obrigatória.");
  const R = registroDePassos();
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(N, page, "admin@cg.pb.gov.br", SENHA);
    for (const t of TELAS) {
      const texto = await irPara(N, page, t.rota).catch((e: unknown) => `ERRO: ${e instanceof Error ? e.message : String(e)}`);
      R.conferir(t.passo, t.marca.test(texto) && !/não foi possível|application error/i.test(texto), texto.slice(0, 200));
    }
  } finally {
    await navegador.close();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
