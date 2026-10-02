import "dotenv/config";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { roteiroDispendioExtra, roteiroIngressoExtra } from "./dominio.js";

/**
 * A FIXTURE DO M07 — o plano mínimo, as fontes, as contas bancárias e os três tipos de consignação.
 *
 * ⚠️ MORA FORA DO ARQUIVO DE TESTE DE PROPÓSITO (V28, pelo mesmo achado da V27 no M08). Ela vivia em
 * `m07.test.ts`, e `m07-composicao-do-recolhimento.test.ts` a importava de lá — importar um arquivo de teste
 * REGISTRA os `describe` dele no arquivo que importa: a composição rodava 14 testes do `m07.test` além dos seus.
 * Arquivo de teste não exporta fixture. Os ids dos tipos são `let` exportados: o seed os preenche, e quem
 * importa lê o valor vivo.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Ver test/banco.ts.
await exigirBanco(prisma);

export const POR = "m07@cg.pb.gov.br";
export const FONTE_500 = "fnt-500";
export const FONTE_540 = "fnt-540";

/** Contas por PARÂMETRO (padrão do projeto — nada inventado). */
export const CAIXA = "1.1.1.1.2.00.00";
export const PASSIVO = "2.1.8.8.1.01.00";
export const R_IN = roteiroIngressoExtra({
  disponibilidade: CAIXA,
  consignacaoAPagar: PASSIVO,
});
export const R_OUT = roteiroDispendioExtra({
  consignacaoAPagar: PASSIVO,
  disponibilidade: CAIXA,
});

export const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-passivo", codigo: PASSIVO, nome: "Consignações a pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-sintetica", codigo: "2.1.8.0.0.00.00", nome: "Demais obrigações", naturezaSaldo: "CREDORA" as const, nivel: 3, analitica: false },
];

/** ids dos tipos, resolvidos no seed. */
export let T_CAUCAO: string;
export let T_INSS: string;
export let T_INATIVO: string;

export async function semearM07(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
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

  const caucao = await prisma.tipoConsignacao.create({
    data: { codigo: "CAUCAO", descricao: "Caução", criadoPor: "TESTE" },
  });
  const inss = await prisma.tipoConsignacao.create({
    data: { codigo: "INSS", descricao: "INSS", criadoPor: "TESTE" },
  });
  const inativo = await prisma.tipoConsignacao.create({
    data: { codigo: "ANTIGO", descricao: "Tipo desativado", ativo: false, criadoPor: "TESTE" },
  });
  T_CAUCAO = caucao.id;
  T_INSS = inss.id;
  T_INATIVO = inativo.id;
}
