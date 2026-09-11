import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { aprovarMedicao, registrarMedicao } from "./medicoes.js";

/**
 * M11 — MEDIÇÃO DE OBRA (Lei 14.133, art. 140). REGIME: **PROFUNDIDADE**.
 *
 * ⚠️ O GUARD MORA NA TRANSAÇÃO DA LIQUIDAÇÃO, e é isso que os testes de negação provam: se a
 * medição não serve, a LIQUIDAÇÃO INTEIRA aborta — não existe "liquidou sem medir".
 *
 * ═══ AS CONTAS À MÃO ═══
 *   contrato de 500.000 · medições de 300.000 e 200.000 ⟹ acumulado 500.000
 *   terceira medição de 1,00 ⟹ RECUSADA (acumulado ficaria 500.001)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const MEDE = "obras@cg.pb.gov.br";
const APROVA = "controle.interno@cg.pb.gov.br";
const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA_OBRA = "ficha-obra";
const FICHA_CUSTEIO = "ficha-custeio";

const VPD = "3.3.1.1.1.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-vpd", codigo: VPD, nome: "VPD serviços", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Obras", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-15", codigo: "15", nome: "Urbanismo" } });
  await prisma.subfuncao.create({ data: { id: "sub-451", codigo: "451", nome: "Infraestrutura" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0015", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "0001", descricao: "A", tipo: "PROJETO" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      // elemento 51 = OBRAS E INSTALAÇÕES → exige obraId (TR 4.50)
      { id: "nd-51", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "51", codigoCompleto: "449051", descricao: "Obras e instalações" },
      { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-15", subfuncaoId: "sub-451", programaId: "prg", acaoId: "aca",
    fonteId: FONTE, valorDotado: "2000000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_OBRA, numero: 1, naturezaDespesaId: "nd-51" });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_CUSTEIO, numero: 2, naturezaDespesaId: "nd-39" });

  await prisma.obra.create({
    data: {
      id: "obra-1", identificador: "OBR-2026-001",
      descricao: "Pavimentação asfáltica da Rua das Acácias",
      tipoObraServico: "PAVIMENTACAO_ASFALTICA", orgaoId: "org-01", criadoPor: MEDE,
    },
  });
  await prisma.processoLicitatorio.create({
    data: {
      id: "proc-1", numeroProcesso: "2026/0001", modalidade: "CONCORRENCIA",
      objeto: "Pavimentação asfáltica da Rua das Acácias", valorLicitado: "500000.00",
      criadoPor: POR,
    },
  });
  await prisma.contrato.create({
    data: {
      id: "ctr-1", numeroContrato: "CT-2026-001", processoId: "proc-1",
      contratadoDocumento: "12345678000199", contratadoNome: "Construtora Alfa",
      valorInicial: "500000.00",
      vigenciaInicio: new Date("2026-01-01T12:00:00Z"),
      vigenciaFimInicial: new Date("2026-12-31T12:00:00Z"),
      categoriaOrdemCronologica: "REALIZACAO_OBRAS",
      criadoPor: POR,
    },
  });
}

const medicao = (numero: number, de: string, ate: string, valor: string) => ({
  obraId: "obra-1", contratoId: "ctr-1", numero,
  diaInicio: de, diaFim: ate, valorMedido: valor,
  responsavelTecnico: "Eng. Marta Nunes", registroProfissional: "CREA-SC 123456",
  criadoPor: MEDE,
});

async function medicaoAprovada(numero: number, de: string, ate: string, valor: string): Promise<string> {
  const { medicaoId } = await registrarMedicao(prisma, medicao(numero, de, ate, valor));
  await aprovarMedicao(prisma, { medicaoId, diaAprovacao: ate, criadoPor: APROVA });
  return medicaoId;
}

async function empenhoDeObra(numero: string, valor: string): Promise<string> {
  const { empenhoId } = await empenhar(
    {
      fichaId: FICHA_OBRA, numero, tipo: "GLOBAL", valor,
      data: new Date("2026-01-20T12:00:00Z"),
      credorCpfCnpj: "12345678000199", historico: "Execução de obra",
      categoriaOrdemCronologica: "REALIZACAO_OBRAS", obraId: "obra-1",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  return empenhoId;
}

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("M11 — a medição de obra", () => {
  it("t1: OURO — duas medições esgotam o contrato, e a terceira é recusada pelo acumulado", async () => {
    const primeira = await registrarMedicao(prisma, medicao(1, "2026-01-01", "2026-01-31", "300000.00"));
    expect(primeira.acumulado).toBe("300000.00");
    const segunda = await registrarMedicao(prisma, medicao(2, "2026-02-01", "2026-02-28", "200000.00"));
    expect(segunda.acumulado).toBe("500000.00");

    await expect(
      registrarMedicao(prisma, medicao(3, "2026-03-01", "2026-03-31", "1.00"))
    ).rejects.toThrow(/MEDIÇÃO ACIMA DO CONTRATADO[\s\S]*ADITIVO ANTES[\s\S]*Nada foi gravado/);
    expect(await prisma.medicaoDeObra.count({ where: { obraId: "obra-1" } })).toBe(2);
  });

  it("t2: o PERÍODO SOBREPOSTO é recusado — e a borda é inclusiva", async () => {
    await registrarMedicao(prisma, medicao(1, "2026-01-01", "2026-01-31", "100000.00"));
    // ⚠️ COMEÇAR NO MESMO DIA EM QUE A ANTERIOR ACABOU já sobrepõe: aquele dia seria medido
    // duas vezes. É o caso mais comum — quem digita períodos consecutivos repete o dia.
    await expect(
      registrarMedicao(prisma, medicao(2, "2026-01-31", "2026-02-28", "100000.00"))
    ).rejects.toThrow(/PERÍODO SOBREPOSTO[\s\S]*bordas são INCLUSIVAS[\s\S]*Nada foi gravado/);
    expect(await prisma.medicaoDeObra.count({ where: { obraId: "obra-1" } })).toBe(1);
  });

  it("t3: SEGREGAÇÃO — quem mede NÃO aprova", async () => {
    const { medicaoId } = await registrarMedicao(prisma, medicao(1, "2026-01-01", "2026-01-31", "100000.00"));
    await expect(
      aprovarMedicao(prisma, { medicaoId, diaAprovacao: "2026-02-05", criadoPor: MEDE })
    ).rejects.toThrow(/SEGREGAÇÃO DE FUNÇÃO[\s\S]*atestar o próprio serviço[\s\S]*Nada foi gravado/);

    const m = await prisma.medicaoDeObra.findUniqueOrThrow({
      where: { id: medicaoId }, select: { aprovadaEm: true },
    });
    expect(m.aprovadaEm).toBeNull();
  });

  it("t3b: aprovar DUAS VEZES é recusado — a segunda apagaria quem aprovou primeiro", async () => {
    const { medicaoId } = await registrarMedicao(prisma, medicao(1, "2026-01-01", "2026-01-31", "100000.00"));
    await aprovarMedicao(prisma, { medicaoId, diaAprovacao: "2026-02-05", criadoPor: APROVA });
    await expect(
      aprovarMedicao(prisma, { medicaoId, diaAprovacao: "2026-02-06", criadoPor: POR })
    ).rejects.toThrow(/JÁ FOI APROVADA[\s\S]*controle interno vai querer[\s\S]*Nada foi gravado/);
  });

  it("t4: LIQUIDAR OBRA SEM MEDIÇÃO é recusado — e a liquidação INTEIRA aborta", async () => {
    const empenhoId = await empenhoDeObra("2026NE000001", "300000.00");
    await expect(
      liquidar(
        {
          empenhoId, numero: "2026NL000001", valor: "100000.00",
          data: new Date("2026-02-10T12:00:00Z"),
          responsavelAtesto: "Eng. Marta Nunes", historico: "Liquidação sem medição",
          criadoPor: POR,
        },
        R_LIQUIDACAO,
        deps
      )
    ).rejects.toThrow(/LIQUIDAÇÃO DE OBRA SEM MEDIÇÃO[\s\S]*art\. 140[\s\S]*Nada foi gravado/);

    // ⚠️ NADA FICOU GRAVADO — nem a liquidação, nem o lançamento. "Não completou" é
    // compatível com o banco fora do ar; o que se prende aqui é o efeito.
    expect(await prisma.liquidacao.count({ where: { empenhoId } })).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "LIQUIDACAO" } })
    ).toBe(0);
  });

  it("t5: liquidar sobre medição NÃO APROVADA é recusado", async () => {
    const empenhoId = await empenhoDeObra("2026NE000002", "300000.00");
    const { medicaoId } = await registrarMedicao(prisma, medicao(1, "2026-01-01", "2026-01-31", "100000.00"));
    await expect(
      liquidar(
        {
          empenhoId, numero: "2026NL000002", valor: "100000.00", medicaoId,
          data: new Date("2026-02-10T12:00:00Z"),
          responsavelAtesto: "Eng. Marta Nunes", historico: "Liquidação sobre medição pendente",
          criadoPor: POR,
        },
        R_LIQUIDACAO,
        deps
      )
    ).rejects.toThrow(/NÃO FOI APROVADA[\s\S]*pagar o que ninguém atestou[\s\S]*Nada foi gravado/);
  });

  it("t6: liquidar ACIMA do medido é recusado — o direito do credor é o que foi medido", async () => {
    const empenhoId = await empenhoDeObra("2026NE000003", "300000.00");
    const medicaoId = await medicaoAprovada(1, "2026-01-01", "2026-01-31", "100000.00");
    await expect(
      liquidar(
        {
          empenhoId, numero: "2026NL000003", valor: "150000.00", medicaoId,
          data: new Date("2026-02-10T12:00:00Z"),
          responsavelAtesto: "Eng. Marta Nunes", historico: "Liquidação acima do medido",
          criadoPor: POR,
        },
        R_LIQUIDACAO,
        deps
      )
    ).rejects.toThrow(/LIQUIDAÇÃO ACIMA DO MEDIDO[\s\S]*Nada foi gravado/);
  });

  it("t6b: a medição de OUTRA OBRA é recusada", async () => {
    await prisma.obra.create({
      data: {
        id: "obra-2", identificador: "OBR-2026-002", descricao: "Drenagem da Rua B",
        tipoObraServico: "DRENAGEM", orgaoId: "org-01", criadoPor: MEDE,
      },
    });
    const { medicaoId } = await registrarMedicao(prisma, {
      ...medicao(1, "2026-01-01", "2026-01-31", "50000.00"),
      obraId: "obra-2",
    });
    await aprovarMedicao(prisma, { medicaoId, diaAprovacao: "2026-02-01", criadoPor: APROVA });

    const empenhoId = await empenhoDeObra("2026NE000004", "300000.00");
    await expect(
      liquidar(
        {
          empenhoId, numero: "2026NL000004", valor: "10000.00", medicaoId,
          data: new Date("2026-02-10T12:00:00Z"),
          responsavelAtesto: "Eng. Marta Nunes", historico: "Liquidação com medição trocada",
          criadoPor: POR,
        },
        R_LIQUIDACAO,
        deps
      )
    ).rejects.toThrow(/é da obra OBR-2026-002[\s\S]*pagar serviço de outra[\s\S]*Nada foi gravado/);
  });

  it("t7: COM medição aprovada, a liquidação PASSA — e guarda o vínculo", async () => {
    const empenhoId = await empenhoDeObra("2026NE000005", "300000.00");
    const medicaoId = await medicaoAprovada(1, "2026-01-01", "2026-01-31", "100000.00");
    const { liquidacaoId } = await liquidar(
      {
        empenhoId, numero: "2026NL000005", valor: "100000.00", medicaoId,
        data: new Date("2026-02-10T12:00:00Z"),
        responsavelAtesto: "Eng. Marta Nunes", historico: "Medição 1 — pavimentação",
        criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    const liq = await prisma.liquidacao.findUniqueOrThrow({
      where: { id: liquidacaoId }, select: { medicaoId: true },
    });
    expect(liq.medicaoId).toBe(medicaoId);
  });

  it("t8: a liquidação de CUSTEIO (sem obra) IGNORA a medição — o guard é unidirecional", async () => {
    // ⚠️ SEM ISTO O GUARD QUEBRARIA A EXECUÇÃO INTEIRA. A esmagadora maioria das liquidações
    // — custeio, material, serviço — não tem medição nenhuma.
    const { empenhoId } = await empenhar(
      {
        fichaId: FICHA_CUSTEIO, numero: "2026NE000099", tipo: "ORDINARIO", valor: "10000.00",
        data: new Date("2026-01-20T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "Serviço de limpeza", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const { liquidacaoId } = await liquidar(
      {
        empenhoId, numero: "2026NL000099", valor: "10000.00",
        data: new Date("2026-02-10T12:00:00Z"),
        responsavelAtesto: "Fiscal do contrato", historico: "Serviço prestado em janeiro",
        criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    expect(liquidacaoId).toBeTruthy();
  });

  it("t9: o PERÍODO da medição é civil — 31/01 termina às 23:59:59 do ente", async () => {
    const { medicaoId } = await registrarMedicao(prisma, medicao(1, "2026-01-01", "2026-01-31", "100000.00"));
    const m = await prisma.medicaoDeObra.findUniqueOrThrow({
      where: { id: medicaoId }, select: { periodoInicio: true, periodoFim: true },
    });
    expect(m.periodoInicio.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(m.periodoFim.toISOString()).toBe("2026-02-01T02:59:59.999Z");
  });
});
