import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { lerFatosReceitaOrcamentaria } from "../../adapters/tribunais/tce-pb/sagres/gerador.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { parcelasDaReceitaRealizada } from "../m12-relatorios/composicao.js";
import { gerarDeParasDaLrf } from "../m12-relatorios/deparas-pelo-ementario.js";
import { anexo3 } from "../m12-relatorios/rreo-anexo3.js";
import { criarM04Deps } from "./adapter-prisma.js";
import { estornarDeducaoDaReceita, registrarDeducaoDaReceita } from "./deducao-da-receita.js";
import { roteiroArrecadacao } from "./dominio.js";
import { registrarArrecadacao } from "./servico.js";

/**
 * ═══ A DEDUÇÃO DA RECEITA REALIZADA — O FUNDEB RETIDO NA ORIGEM (V35, onda B1) ═══
 *
 * Contas à mão, antes do código. N=2 guias de FPM (1.000,00 em 10/03 e 500,00 em 20/03), uma dedução de 300,00:
 *   orçamentária  6.2.1.3.1.01.00 D 300   |  6.2.1.1 C 300
 *   patrimonial   3.5.2.2.4.00.00 D 300   |  banco   C 300  → banco = 1.500 − 300 = 1.200
 *   controle      8.2.1.1.1.01.00 D 300   |  8.2.1.1.4.04.00 C 300
 *   receita realizada pelo balanço = 1.500 − 300 = 1.200 (MCASP: líquida das deduções)
 * O que cabe: 1.500 − 300 = 1.200; uma segunda dedução de 1.200,01 é recusada nomeando o que cabe.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m04@cg.pb.gov.br";
const SO_EMPENHA = "so.empenha.deducao@cg.pb.gov.br";
const BANCO = "1.1.1.1.1.00.00";
const DOC = "Demonstrativo de distribuição da arrecadação BB — FPM março/2026";

const CONTAS = [
  { id: "c-banco", codigo: BANCO, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: "4.5.2.1.1.00.00", nome: "VPA - Transferências", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { codigo: "6.2.1.1.0.00.00", nome: "Receita a Realizar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { codigo: "6.2.1.2.0.00.00", nome: "Receita Realizada", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: "6.2.1.3.1.01.00", nome: "(-) FUNDEB", naturezaSaldo: "DEVEDORA" as const, nivel: 7, analitica: true },
  { codigo: "3.5.2.2.4.00.00", nome: "Transferências ao Fundeb - Inter OFSS - Estado", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: "8.2.1.1.1.01.00", nome: "Recursos disponíveis para o exercício", naturezaSaldo: "CREDORA" as const, nivel: 7, analitica: true },
  { codigo: "8.2.1.1.4.04.00", nome: "Utilizada por dedução da receita orçamentária", naturezaSaldo: "CREDORA" as const, nivel: 7, analitica: true },
];
const ROTEIRO = roteiroArrecadacao({ disponibilidade: BANCO, variacaoAumentativa: "4.5.2.1.1.00.00", receitaARealizar: "6.2.1.1.0.00.00", receitaRealizada: "6.2.1.2.0.00.00" });
const saldo = async (c: string): Promise<string> => (await saldoDasContas(prisma, [c], null)).toFixed(2);

describe("M04 — a dedução da receita realizada (FUNDEB)", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
    await prisma.naturezaReceita.create({ data: { id: "nr-fpm", codigo: "17115111", descricao: "Cota-Parte do FPM - Cota Mensal - Principal" } });
    await prisma.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Recursos não Vinculados de Impostos", codigoTce: "500" } });
    await prisma.codigoAcompanhamento.create({ data: { codigo: "0001", descricao: "Execução direta" } });
    await prisma.contaBancaria.create({ data: { codigo: "CC-FPM", descricao: "FPM", fonteId: "f500", contaContabilId: "c-banco", banco: "001", agencia: "1234", conta: "56789", digitoConta: "0" } });
    const deps = criarM04Deps(prisma);
    for (const [valor, numero, dia] of [["1000.00", "0000001", "10"], ["500.00", "0000002", "20"]] as const) {
      await registrarArrecadacao(
        { exercicio: 2026, naturezaReceita: "17115111", fonte: "500", co: "0001", exercicioFonte: 1, valor, dataArrecadacao: new Date(`2026-03-${dia}T12:00:00Z`), numeroReceita: numero, criadoPor: POR },
        ROTEIRO,
        deps
      );
    }
    const p = await prisma.perfil.create({ data: { nome: "SO_EMPENHA_DED", descricao: "x", criadoPor: "SEED", permissoes: { create: [{ acao: "EMPENHAR" as never, criadoPor: "SEED" }] } }, select: { id: true } });
    const u = await prisma.usuario.create({ data: { identificador: SO_EMPENHA, nome: SO_EMPENHA, criadoPor: "SEED" }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const deduzir = (valor: string, dia = "2026-03-21", por = POR) =>
    registrarDeducaoDaReceita(prisma, { naturezaReceita: "17115111", fonte: "500", valor, dia, contaBancaria: "CC-FPM", documento: DOC, criadoPor: por });

  it("t1: as três naturezas de informação; o banco fica com o líquido; o balanço lê a receita líquida", async () => {
    await deduzir("300.00");
    expect([await saldo("6.2.1.3.1.01.00"), await saldo("3.5.2.2.4.00.00"), await saldo(BANCO)]).toEqual(["300.00", "300.00", "1200.00"]);
    expect([await saldo("8.2.1.1.1.01.00"), await saldo("8.2.1.1.4.04.00")]).toEqual(["300.00", "-300.00"]);
    const parcelas = await parcelasDaReceitaRealizada(prisma, 2026, null);
    expect(parcelas.filter((p) => p.tipo === "DEDUCAO").map((p) => p.valor.toFixed(2))).toEqual(["-300.00"]);
    expect(parcelas.reduce((s, p) => s.plus(p.valor), parcelas[0]!.valor.minus(parcelas[0]!.valor)).toFixed(2)).toBe("1200.00");
  });

  it("t2: a dedução cabe no arrecadado até a data — a que passa é recusada dizendo quanto cabe", async () => {
    await deduzir("300.00");
    await expect(deduzir("1200.01")).rejects.toThrow(/1500\.00 arrecadados e 300\.00 já deduzidos[\s\S]*cabem 1200\.00/);
    // em 15/03 só a guia de 10/03 existe (1.000,00) e a dedução já registrada conta: cabem 700,00
    await expect(deduzir("1000.01", "2026-03-15")).rejects.toThrow(/1000\.00 arrecadados e 300\.00 já deduzidos[\s\S]*cabem 700\.00/);
    expect(await prisma.deducaoDaReceitaRealizada.count()).toBe(1);
  });

  it("t3: o estorno devolve as três naturezas e o balanço; o segundo estorno é recusado", async () => {
    const { deducaoId } = await deduzir("300.00");
    await estornarDeducaoDaReceita(prisma, { deducaoId, dia: "2026-03-25", motivo: "Valor lançado em duplicidade no demonstrativo", criadoPor: POR });
    expect([await saldo("6.2.1.3.1.01.00"), await saldo(BANCO), await saldo("8.2.1.1.4.04.00")]).toEqual(["0.00", "1500.00", "0.00"]);
    const parcelas = await parcelasDaReceitaRealizada(prisma, 2026, null);
    expect(parcelas.reduce((s, p) => s.plus(p.valor), parcelas[0]!.valor.minus(parcelas[0]!.valor)).toFixed(2)).toBe("1500.00");
    await expect(estornarDeducaoDaReceita(prisma, { deducaoId, dia: "2026-03-26", motivo: "Segunda tentativa de estorno", criadoPor: POR })).rejects.toThrow(/já foi estornada/);
  });

  it("t4: quem não arrecada é recusado com o nome da ação, e nada é gravado", async () => {
    await expect(deduzir("300.00", "2026-03-21", SO_EMPENHA)).rejects.toThrow(/REGISTRAR_ARRECADACAO/);
    expect(await prisma.deducaoDaReceitaRealizada.count()).toBe(0);
  });

  it("t5: a remessa do SAGRES do dia leva a dedução como tipo 3, com a natureza e a fonte da receita deduzida", async () => {
    await deduzir("300.00");
    const fatos = await lerFatosReceitaOrcamentaria(prisma, { codUnidadeGestora: "201078", cnpjGerenciadora: "08993909000108", codContaArrecadadora: "CC-FPM", dia: new Date("2026-03-21T12:00:00Z") });
    expect(fatos.map((f) => [f.numeroReceita, f.codReceitaOrcamentaria, f.codFonteRecurso, f.tipoReceitaLancada, f.tipoLancamento, f.valor.toFixed(2)])).toEqual([
      ["9000001", "17115111", "500", "3", "ARRECADACAO", "300.00"],
    ]);
  });

  it("t6: a RCL (RREO Anexo 3) mostra o FPM bruto na I, a dedução na linha própria da II, e a RCL líquida", async () => {
    await deduzir("300.00");
    await gerarDeParasDaLrf(prisma, { criadoPor: POR });
    const a = await anexo3(prisma, { exercicio: 2026, bimestre: 2 });
    const linha = (chave: string) => a.linhas.find((l) => l.chave === chave);
    expect(linha("FPM")?.total12m).toBe("1500.00");
    expect(linha("DED_FUNDEB")?.total12m).toBe("300.00");
    expect(a.rcl.total12m).toBe("1200.00");
  });
});
