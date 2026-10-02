import "dotenv/config";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * A FIXTURE DO M06 — o plano mínimo, as duas fichas (fontes 500 e 540) e o atalho de empenhar e liquidar.
 *
 * ⚠️ MORA FORA DO ARQUIVO DE TESTE DE PROPÓSITO (V28, pelo mesmo achado da V27 no M08). Ela vivia em
 * `m06.test.ts`, e `m06-pagamento.test.ts` a importava de lá — importar um arquivo de teste REGISTRA os
 * `describe` dele no arquivo que importa: o `m06-pagamento` rodava 18 testes do `m06.test` além dos seus.
 * Arquivo de teste não exporta fixture.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // A DISPONIBILIDADE de verdade: o pagamento sai do BANCO. Esta fixture usava o
  // "Crédito Disponível" (6.2.2.1.1, classe 6 = ORÇAMENTÁRIA) na perna PATRIMONIAL
  // do pagamento — o razão dizia que o dinheiro saía de uma conta de controle
  // orçamentário. O guard de natureza de informação pegou; ver MODULO.md do M01.
  { id: "c-caixa", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
];
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});

export const FONTE_500 = "fnt-500";
export const FONTE_540 = "fnt-540";
/** Ficha A: fonte 500. Ficha B: fonte 540. */
export const FICHA_500 = "ficha-500";
export const FICHA_540 = "ficha-540";
export const POR = "m06@cg.pb.gov.br";

export async function semearM06(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "EF" },
      { id: "sub-362", codigo: "362", nome: "EM" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "PJ",
    },
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_500, codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE_500 },
      { id: "cb2", codigo: "CC-002", descricao: "FUNDEB", fonteId: FONTE_540 },
    ],
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd",
  };
  await criarFichasDeTeste(prisma, [
    { ...base, id: FICHA_500, numero: 1, subfuncaoId: "sub-361", fonteId: FONTE_500, valorDotado: "100000.00" },
    { ...base, id: FICHA_540, numero: 2, subfuncaoId: "sub-362", fonteId: FONTE_540, valorDotado: "100000.00" },
  ]);
}

/** Empenha + liquida numa data. Devolve o id da liquidação. */
export async function empenharELiquidar(
  deps: M05Deps,
  opts: {
    fichaId: string;
    numero: string;
    valor: string;
    categoria: "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
    dataLiquidacao: string;
  }
): Promise<string> {
  const e = await empenhar(
    {
      fichaId: opts.fichaId,
      numero: `NE-${opts.numero}`,
      tipo: "ORDINARIO",
      valor: opts.valor,
      data: new Date("2026-01-02T12:00:00Z"),
      credorCpfCnpj: "12345678000195",
      historico: `empenho ${opts.numero}`,
      categoriaOrdemCronologica: opts.categoria,
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId,
      numero: opts.numero,
      valor: opts.valor,
      data: new Date(opts.dataLiquidacao),
      responsavelAtesto: "Fulano",
      historico: `liquidação ${opts.numero}`,
      criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}
