import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inicioDoDiaCivil, diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { limparBanco } from "./limpar-banco.js";
import { criarM05DepsComContratos } from "../modules/m11-licitacoes/adapter-m05.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../modules/m05-despesa/dominio.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { liquidar, pagar } from "../modules/m05-despesa/servico-bloco2.js";
import { anularEmpenho } from "../modules/m05-despesa/servico.js";
import { anularEmpenhoParcial } from "../modules/m05-despesa/anulacao-parcial.js";
import type { M05Deps } from "../modules/m05-despesa/ports.js";
import {
  CAMPOS_NUNCA_PUBLICOS_DA_DESPESA,
  CAMPOS_PUBLICOS_DA_DESPESA,
  documentoPublicavelDoCredor,
  listarDespesasPublicas,
} from "../lib/portas/despesas-publicas.js";

/**
 * ═══ A CONSULTA PÚBLICA DE DESPESAS (V9 N2) ═══
 *
 * ⚠️ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR É ARITMÉTICO, e é o mais comum em portal de
 * transparência: listar empenho, liquidação e pagamento como se fossem despesas distintas. Eles
 * são três ESTÁGIOS da mesma despesa. Um empenho de R$ 1.000,00, liquidado e pago, vira
 * "R$ 3.000,00 de despesa" para quem soma a coluna — e o número sai em jornal.
 *
 * ⚠️ E O SEGUNDO É A ANULAÇÃO. Anulação TOTAL zera o fato; anulação PARCIAL o reduz sem zerar, e
 * no M05 as duas são LINHAS de empenho. Listá-las como empenhos mostraria "despesas" que são
 * correções de outras, e publicar só o bruto mostraria despesa que foi desfeita.
 *
 * ⚠️ O terceiro é dado pessoal: o CPF de um credor pessoa física não é coluna de portal.
 *
 * FIXTURE N=2 em tudo que se manifesta em conjunto: dois empenhos (um com a cadeia inteira, outro
 * anulado), duas naturezas de anulação (total e parcial), dois tipos de credor (CNPJ e CPF).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const CNPJ = "12345678000195";
const CPF = "11144477735";
const FONTE = "fnt-500";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISP = "6.2.2.1.1.00.00";
const C_EMP = "6.2.2.1.3.01.00";
const C_LIQ = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISP, creditoEmpenhado: C_EMP });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMP, creditoLiquidado: C_LIQ });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQ, creditoPago: C_PAGO });

let deps: M05Deps;

beforeEach(async () => {
  await limparBanco(prisma);
  deps = criarM05DepsComContratos(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISP, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMP, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQ, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "uo-01", codigo: "01001", descricao: "Saúde", orgaoId: "org-01" },
      { id: "uo-02", codigo: "01002", descricao: "Educação", orgaoId: "org-01" },
    ],
  });
  await prisma.funcao.create({ data: { id: "fun-10", codigo: "10", nome: "Saúde" } });
  await prisma.subfuncao.create({ data: { id: "sub-301", codigo: "301", nome: "Atenção básica" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE } });
  const base = { exercicio: 2026, orgaoId: "org-01", funcaoId: "fun-10", subfuncaoId: "sub-301", programaId: "prg", acaoId: "aca", fonteId: FONTE, naturezaDespesaId: "nd-39", valorDotado: "50000.00" };
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-a", numero: 1, unidadeOrcId: "uo-01" });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-b", numero: 2, unidadeOrcId: "uo-02" });

  await prisma.pessoa.create({ data: { documento: CNPJ, tipo: "JURIDICA", criadoPor: POR, versoes: { create: { nome: "Serviços Técnicos Beta Ltda", criadoPor: POR } } } });
  await prisma.pessoa.create({ data: { documento: CPF, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: "Marta Nogueira da Silva", criadoPor: POR } } } });
}, 180_000);

const empenho = (id: string, fichaId: string, numero: string, valor: string, credor: string) =>
  empenhar({ fichaId, numero, tipo: "GLOBAL", valor, data: inicioDoDiaCivil(dia(-20)), credorCpfCnpj: credor, historico: `Despesa do empenho ${id}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMPENHO, deps);

describe("a consulta pública de despesas não soma as fases", () => {
  it("D1: um empenho liquidado e pago é UMA linha, com os estágios em colunas", async () => {
    const e = await empenho("A", "ficha-a", "2026NE000100", "1000.00", CNPJ);
    const l = await liquidar({ empenhoId: e.empenhoId, numero: "2026NL000100", valor: "1000.00", data: inicioDoDiaCivil(dia(-10)), responsavelAtesto: "Chefe do setor", historico: "Liquidação", criadoPor: POR }, R_LIQUIDACAO, deps);
    await pagar({ liquidacaoId: l.liquidacaoId, numero: "2026NP000100", valor: "1000.00", data: inicioDoDiaCivil(dia(-5)), contaBancaria: "CC-001", fonteId: FONTE, historico: "Pagamento", criadoPor: POR }, R_PAGAMENTO, deps);

    const p = await listarDespesasPublicas();
    expect(
      p.total,
      "a liquidação e o pagamento apareceram como linhas próprias — quem somasse a coluna contaria " +
        "a mesma despesa três vezes"
    ).toBe(1);

    const linha = p.linhas[0]!;
    expect([linha.empenhado, linha.liquidado, linha.pago]).toEqual(["1000.00", "1000.00", "1000.00"]);
    expect(linha.fase).toBe("Paga");
    expect(p.totais).toEqual({ empenhado: "1000.00", liquidado: "1000.00", pago: "1000.00" });
  });

  it("D2: anulação TOTAL e anulação PARCIAL não são despesas — reduzem o empenho de origem", async () => {
    const total = await empenho("A", "ficha-a", "2026NE000100", "1000.00", CNPJ);
    const parcial = await empenho("B", "ficha-b", "2026NE000200", "800.00", CNPJ);

    await anularEmpenho({ empenhoId: total.empenhoId, numero: "2026NE000100A", data: inicioDoDiaCivil(dia(-9)), historico: "Anulado por engano na classificação", criadoPor: POR }, deps);
    await anularEmpenhoParcial({ originalId: parcial.empenhoId, numero: "2026NE000200A", valor: "300.00", data: inicioDoDiaCivil(dia(-9)), motivo: "Redução do saldo não utilizado do empenho", criadoPor: POR }, deps);

    const p = await listarDespesasPublicas();
    expect(
      p.total,
      "as anulações entraram na lista como se fossem empenhos. No M05 elas SÃO linhas de empenho — " +
        "listá-las mostra 'despesas' que são correções de outras"
    ).toBe(2);

    const a = p.linhas.find((x) => x.numero === "2026NE000100")!;
    expect([a.empenhadoOriginal, a.anulado, a.empenhado, a.fase]).toEqual(["1000.00", "1000.00", "0.00", "Anulada"]);

    const b = p.linhas.find((x) => x.numero === "2026NE000200")!;
    expect(
      [b.empenhadoOriginal, b.anulado, b.empenhado],
      "a anulação PARCIAL zerou o empenho (ela reduz, não zera) ou foi ignorada (aí o portal " +
        "mostraria despesa que foi desfeita)"
    ).toEqual(["800.00", "300.00", "500.00"]);

    expect(p.totais?.empenhado, "0 + 500").toBe("500.00");
  });

  it("D3: o CPF do credor pessoa física NÃO sai; o CNPJ sai inteiro", async () => {
    await empenho("A", "ficha-a", "2026NE000100", "1000.00", CNPJ);
    await empenho("B", "ficha-b", "2026NE000200", "500.00", CPF);

    const p = await listarDespesasPublicas();
    const bruto = JSON.stringify(p);

    expect(
      bruto.includes(CPF),
      "o CPF do credor pessoa física saiu inteiro na consulta pública. Numa página pública, " +
        "'chegou ao navegador' é 'foi publicado'"
    ).toBe(false);
    expect(bruto, "o CNPJ de quem contrata com o poder público é informação pública").toContain("12.345.678/0001-95");

    const pf = p.linhas.find((x) => x.numero === "2026NE000200")!;
    expect(pf.credorDocumento).toBe("***.444.777-**");
    expect(pf.credorNome, "o NOME do credor é público — o que se protege é o número do documento").toBe("Marta Nogueira da Silva");

    for (const proibido of CAMPOS_NUNCA_PUBLICOS_DA_DESPESA) {
      expect(bruto.includes(`"${proibido}"`), `o campo "${proibido}" apareceu na projeção pública`).toBe(false);
    }
  });

  it("D4: a projeção tem exatamente os campos do contrato público", async () => {
    await empenho("A", "ficha-a", "2026NE000100", "1000.00", CNPJ);
    const p = await listarDespesasPublicas();
    for (const linha of p.linhas) {
      expect(Object.keys(linha).sort()).toEqual([...CAMPOS_PUBLICOS_DA_DESPESA].sort());
    }
  });

  it("D5: os filtros e a paginação são do servidor, e os totais são do RECORTE", async () => {
    await empenho("A", "ficha-a", "2026NE000100", "1000.00", CNPJ);
    await empenho("B", "ficha-b", "2026NE000200", "500.00", CNPJ);

    const porUnidade = await listarDespesasPublicas({ unidade: "uo-02" });
    expect(porUnidade.total).toBe(1);
    expect(porUnidade.totais?.empenhado, "o total acompanhou o filtro").toBe("500.00");

    const p1 = await listarDespesasPublicas({ porPagina: 1, pagina: 1, ordem: "valor", direcao: "desc" });
    const p2 = await listarDespesasPublicas({ porPagina: 1, pagina: 2, ordem: "valor", direcao: "desc" });
    expect(p1.linhas[0]?.numero).toBe("2026NE000100");
    expect(p2.linhas[0]?.numero).toBe("2026NE000200");
    expect(
      p1.totais?.empenhado,
      "o total veio da PÁGINA, não do recorte — um rodapé que muda ao virar a página não é total de nada"
    ).toBe("1500.00");

    expect((await listarDespesasPublicas({ q: "inexistente" })).total).toBe(0);
    expect((await listarDespesasPublicas({ exercicio: "2025" })).total).toBe(0);
  });

  it("D6: as bordas do período são do DIA CIVIL do ente, não do UTC", async () => {
    // ⚠️ O CASO QUE A PRIMEira VERSÃO ERRAVA. Um empenho registrado às 22h do dia (hora local do
    // ente, UTC−3) é 01h do dia SEGUINTE em UTC. Com a borda em `T23:59:59Z`, ele caía fora da
    // consulta do próprio dia — e reaparecia na do dia seguinte. O total de um mês sairia errado
    // nas duas pontas, e bateria com o do mês seguinte, porque o viés se repete.
    const quando = dia(-3);
    await empenhar(
      { fichaId: "ficha-a", numero: "2026NE000900", tipo: "GLOBAL", valor: "700.00", data: new Date(`${quando}T23:30:00-03:00`), credorCpfCnpj: CNPJ, historico: "Empenho no fim do dia civil", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
      R_EMPENHO,
      deps
    );

    const noDia = await listarDespesasPublicas({ de: quando, ate: quando });
    expect(
      noDia.total,
      `o empenho das 23h30 do dia ${quando} (hora do ente) ficou fora da consulta desse dia — a ` +
        `borda foi calculada em UTC`
    ).toBe(1);
    expect((await listarDespesasPublicas({ de: dia(-2), ate: dia(-2) })).total, "e reapareceu no dia seguinte").toBe(0);
  });
});

describe("o documento do credor para o público", () => {
  it("CNPJ inteiro, CPF mascarado, e nada estoura com lixo", () => {
    expect(documentoPublicavelDoCredor("12345678000195")).toBe("12.345.678/0001-95");
    expect(documentoPublicavelDoCredor("11144477735")).toBe("***.444.777-**");
    // ⚠️ N=2 no CPF: sem o segundo, um retorno constante ("***.444.777-**") passaria.
    expect(documentoPublicavelDoCredor("52998224725")).toBe("***.982.247-**");
    expect(documentoPublicavelDoCredor("")).toBe("não informado");
    expect(documentoPublicavelDoCredor("123")).toBe("não informado");
  });
});
