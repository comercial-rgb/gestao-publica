import "dotenv/config";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { calcularInscricoes, saldoDaInscricao } from "./dominio.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * A FIXTURE DO M08 — o plano mínimo, a ficha, as fontes e os atalhos de empenhar, liquidar e pagar em 2026.
 *
 * ⚠️ MORA FORA DO ARQUIVO DE TESTE DE PROPÓSITO (V27). Ela vivia em `m08-encerramento.test.ts`, e oito arquivos a
 * importavam de lá — importar um arquivo de teste REGISTRA os `describe` dele no arquivo que importa: o
 * `m15-restos` rodava 14 testes do M08 (e só 5 dele), com o hook de 10 s do M08 estourando sob carga. Essa era a
 * "intermitência do SAGRES". Arquivo de teste não exporta fixture.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m08@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";
export const FONTE_540 = "fnt-540";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // A DISPONIBILIDADE de verdade: o pagamento (e o de RP) sai do BANCO. Esta fixture
  // usava o "Crédito Disponível" (6.2.2.1.1, classe 6 = ORÇAMENTÁRIA) na perna
  // PATRIMONIAL — o guard de natureza de informação pegou. Ver MODULO.md do M01.
  { id: "c-caixa", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  // PCASP 4.6.4 — "ganhos com desincorporação de passivos, INCLUSIVE as baixas de
  // passivo decorrentes do cancelamento de restos a pagar". É a contrapartida certa
  // do cancelamento; a fixture creditava "Crédito Liquidado" (6.2.2.1.3.03).
  { id: "c-vpa-desinc", codigo: "4.6.4.1.1.00.00", nome: "Ganhos com Desincorporação de Passivos", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
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
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.2.00.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
  creditoPago: "6.2.2.1.3.01.00",
});

export async function semearM08(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "PJ",
    },
  });
  // ⚠️ A SEGUNDA FONTE (e a conta dela) existem para o guard de fonte do PAGAMENTO DE
  // RP: o pagamento de restos NÃO passa pelo `pagar()` do M05, e sem uma fonte
  // alternativa não havia como provar que o guard está lá também. Ver `guard-fonte.ts`.
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE },
      { id: "cb2", codigo: "CC-002", descricao: "FUNDEB", fonteId: FONTE_540 },
    ],
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1,
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });
}

export async function empenharDe2026(
  deps: M05Deps,
  numero: string,
  valor: string,
  /** V35: GLOBAL quando o caso liquida em parcelas (o ordinário se liquida de uma vez, MCASP Parte I, 4.4.2.1). */
  tipo: "ORDINARIO" | "GLOBAL" = "ORDINARIO"
): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero, tipo, valor,
      data: new Date("2026-06-01T12:00:00Z"), credorCpfCnpj: "12345678000195",
      historico: `empenho ${numero}`,
      categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  return e.empenhoId;
}

export async function liquidarDe2026(
  deps: M05Deps,
  empenhoId: string,
  numero: string,
  valor: string,
  data = "2026-08-01T12:00:00Z"
): Promise<string> {
  const l = await liquidar(
    {
      empenhoId, numero, valor, data: new Date(data),
      responsavelAtesto: "Fulano", historico: `liq ${numero}`, criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

export async function pagarDe2026(
  deps: M05Deps,
  liquidacaoId: string,
  numero: string,
  valor: string
): Promise<string> {
  const p = await pagar(
    {
      liquidacaoId, numero, valor, data: new Date("2026-09-01T12:00:00Z"),
      contaBancaria: "CC-001", fonteId: FONTE,
      historico: `pgto ${numero}`, criadoPor: POR,
    },
    R_PAGAMENTO,
    deps
  );
  return p.pagamentoId;
}

export { R_EMPENHO, R_LIQUIDACAO, R_PAGAMENTO, FONTE, FICHA, POR };
