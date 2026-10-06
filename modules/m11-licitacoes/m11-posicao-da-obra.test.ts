import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { aprovarMedicao, registrarMedicao } from "./medicoes.js";
import { anularEmpenho, empenhar } from "../m05-despesa/servico.js";
import { registrarAditivo } from "./contratos.js";
import { posicaoFinanceiraDaObra } from "./posicao-da-obra.js";

/**
 * V36 — A POSIÇÃO FINANCEIRA DA OBRA (TR 5.10.1.53). N=2 obras e N=2 contratos na primeira: um com aditivo (o valor
 * contratado é o ATUALIZADO), outro só com medição pendente (entra no contratado, não no executado). A segunda obra
 * não tem contrato: o percentual é nulo, não zero.
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
      contratadoDocumento: "12345678000195", contratadoNome: "Construtora Alfa",
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


async function empenhoDeObra(obraId: string, numero: string, valor: string): Promise<string> {
  const { empenhoId } = await empenhar(
    {
      fichaId: FICHA_OBRA, numero, tipo: "GLOBAL", valor, data: new Date("2026-01-20T12:00:00Z"),
      credorCpfCnpj: "12345678000195", historico: "Execução de obra", categoriaOrdemCronologica: "REALIZACAO_OBRAS", obraId, criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  return empenhoId;
}

async function segundaObraESegundoContrato(): Promise<void> {
  await prisma.obra.create({ data: { id: "obra-2", identificador: "OBR-2026-002", descricao: "Reforma da praça", tipoObraServico: "PAVIMENTACAO_ASFALTICA", orgaoId: "org-01", criadoPor: MEDE } });
  await prisma.contrato.create({
    data: {
      id: "ctr-2", numeroContrato: "CT-2026-002", processoId: "proc-1", contratadoDocumento: "11222333000181", contratadoNome: "Construtora Beta",
      valorInicial: "200000.00", vigenciaInicio: new Date("2026-01-01T12:00:00Z"), vigenciaFimInicial: new Date("2026-12-31T12:00:00Z"),
      categoriaOrdemCronologica: "REALIZACAO_OBRAS", criadoPor: POR,
    },
  });
}

describe("M11 V36 — posição financeira da obra", () => {
  beforeEach(semear, 60000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: contratado atualizado de cada contrato uma vez, empenhado líquido, executado pelo medido aprovado", async () => {
    await segundaObraESegundoContrato();
    await registrarAditivo(prisma, { contratoId: "ctr-1", tipo: "ACRESCIMO_VALOR", valor: "50000.00", data: new Date("2026-02-01T12:00:00Z"), numeroAditivo: "1º TA", motivo: "acréscimo de quantitativos da pavimentação", criadoPor: POR });
    await medicaoAprovada(1, "2026-01-01", "2026-01-31", "200000.00");
    await medicaoAprovada(2, "2026-02-01", "2026-02-28", "100000.00");
    await registrarMedicao(prisma, { ...medicao(3, "2026-03-01", "2026-03-31", "100000.00"), contratoId: "ctr-2" });
    await empenhoDeObra("obra-1", "NE-1", "400000.00");
    const anulado = await empenhoDeObra("obra-1", "NE-2", "100000.00");
    await anularEmpenho({ empenhoId: anulado, numero: "NE-2-A", data: new Date("2026-01-21T12:00:00Z"), historico: "empenho em duplicidade", criadoPor: POR }, deps);
    await empenhoDeObra("obra-2", "NE-3", "50000.00");

    const p1 = await posicaoFinanceiraDaObra(prisma, "obra-1");
    expect(p1.contratos.map((c) => [c.numero, c.valorAtualizado.toFixed(2)])).toEqual([["CT-2026-001", "550000.00"], ["CT-2026-002", "200000.00"]]);
    expect(p1.valorContratado.toFixed(2)).toBe("750000.00");
    expect(p1.valorEmpenhado.toFixed(2)).toBe("400000.00");
    expect(p1.medidoAprovado.toFixed(2)).toBe("300000.00");
    expect(p1.percentualExecutado).toBe("40.00");
    expect(p1.valorDaObra).toBeNull();

    const p2 = await posicaoFinanceiraDaObra(prisma, "obra-2");
    expect(p2.contratos).toEqual([]);
    expect(p2.valorEmpenhado.toFixed(2)).toBe("50000.00");
    expect(p2.percentualExecutado).toBeNull();
  });
});
