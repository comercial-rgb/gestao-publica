import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../modules/m05-despesa/dominio.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { anularLiquidacao, liquidar } from "../modules/m05-despesa/servico-bloco2.js";
import { anularEmpenhoParcial, estornarAnulacaoParcial } from "../modules/m05-despesa/anulacao-parcial.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import { listarAnulacoesDoExercicio } from "../lib/portas/anulacao.js";

/**
 * V33 — A METADE "DEPOIS" DA CENTRAL DE ANULAÇÕES: cada anulação registrada aponta o ORIGINAL certo e o próprio
 * lançamento. N=2 empenhos; num deles, uma anulação parcial e o estorno dela (que aponta a PARCIAL, e cujo original
 * para abrir é o empenho); no outro, a liquidação anulada inteira. Uma ficha de outro exercício não entra.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "despesa@cg.pb.gov.br";
const FONTE = "fnt-500";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO });
const D = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
let ids: { ne1: string; ne2: string; parcial: string; estorno: string; liq: string } = { ne1: "", ne2: "", parcial: "", estorno: "", liq: "" };

beforeEach(async () => {
  await limparBanco(prisma);
  const deps = criarM05Deps(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const comum = { orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "500000.00" };
  await criarFichaDeTeste(prisma, { ...comum, id: "f26", numero: 1, exercicio: 2026 });
  await criarFichaDeTeste(prisma, { ...comum, id: "f25", numero: 1, exercicio: 2025 });
  const emp = async (ficha: string, numero: string, valor: string, data: string): Promise<string> =>
    (await empenhar({ fichaId: ficha, numero, tipo: "ORDINARIO", valor, data: D(data), credorCpfCnpj: "12345678000195", historico: numero, categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMPENHO, deps)).empenhoId;

  const ne1 = await emp("f26", "NE-1", "10000.00", "2026-02-01");
  const parcial = (await anularEmpenhoParcial({ originalId: ne1, numero: "1001", valor: "3000.00", data: D("2026-03-01"), motivo: "redução do objeto por acordo entre as partes", criadoPor: POR }, deps)).anulacaoId;
  const estorno = (await estornarAnulacaoParcial({ anulacaoId: parcial, numero: "1002", data: D("2026-03-02"), motivo: "a redução foi desfeita pelo aditivo", criadoPor: POR, nivel: "EMPENHO" }, deps)).estornoId;
  const ne2 = await emp("f26", "NE-2", "4000.00", "2026-02-02");
  const liq = (await liquidar({ empenhoId: ne2, numero: "NL-2", valor: "4000.00", data: D("2026-04-01"), responsavelAtesto: "Fiscal", historico: "liquidação", criadoPor: POR }, R_LIQUIDACAO, deps)).liquidacaoId;
  await anularLiquidacao({ liquidacaoId: liq, numero: "1003", data: D("2026-04-02"), historico: "nota fiscal cancelada pelo emitente", criadoPor: POR }, deps);
  // Outro exercício: não entra.
  const ne25 = await emp("f25", "NE-25", "1000.00", "2025-05-01");
  await anularEmpenhoParcial({ originalId: ne25, numero: "2001", valor: "100.00", data: D("2025-06-01"), motivo: "redução do objeto por acordo entre as partes", criadoPor: POR }, deps);
  ids = { ne1, ne2, parcial, estorno, liq };
}, 180000);

describe("anulações registradas no exercício", () => {
  it("t1: cada anulação aponta o original certo, o lançamento, e se é integral", async () => {
    const r = await listarAnulacoesDoExercicio({ exercicio: 2026 });
    const por = new Map(r.map((a) => [a.numero, a]));
    expect([...por.keys()].sort()).toEqual(["1001", "1002", "1003"]);
    expect(por.get("1001")).toMatchObject({ tipo: "empenho", integral: false, valor: "3000.00", originalId: ids.ne1, originalHref: `/despesa/empenhos/${ids.ne1}` });
    // O estorno da parcial aponta a parcial; o que se abre é o empenho.
    expect(por.get("1002")).toMatchObject({ tipo: "empenho", integral: true, originalId: ids.parcial, originalHref: `/despesa/empenhos/${ids.ne1}` });
    expect(por.get("1003")).toMatchObject({ tipo: "liquidacao", integral: true, originalId: ids.liq, originalHref: `/despesa/empenhos/${ids.ne2}#liquidacao-${ids.liq}`, motivo: "nota fiscal cancelada pelo emitente" });
    for (const a of r) expect(await prisma.lancamentoContabil.count({ where: { id: a.lancamentoId } })).toBe(1);
  });
});
