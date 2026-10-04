import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { declararRoteiroPatrimonial } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "./dominio.js";
import { empenhar } from "./servico.js";
import { liquidar, pagar } from "./servico-bloco2.js";
import { anularEmpenhoParcial, anularLiquidacaoParcial, anularPagamentoParcial } from "./anulacao-parcial.js";
import { aprovarPrestacaoDeAdiantamento, concederAdiantamento, listarAdiantamentos, registrarPrestacaoDeAdiantamento } from "./adiantamentos.js";

/**
 * V34 — DIÁRIA E SUPRIMENTO DE FUNDOS COM MOVIMENTO, DE PONTA A PONTA, COM DADOS SINTÉTICOS DE ENSAIO.
 *
 * concessão → empenho, liquidação e pagamento → prestação de contas → devolução (no suprimento) → baixa. A ausência de
 * concessões reais e de configuração em Esperança é pendência de IMPLANTAÇÃO; este teste prova o MOTOR.
 *
 * Configuração de ensaio (identificada): o roteiro ADIANTAMENTO nas contas de controle do plano oficial —
 * 7.9.1.2.1.00.00 "Controle de adiantamentos/suprimentos de fundos concedidos" e 8.9.1.2.1.01.00 "Adiantamentos
 * concedidos a comprovar" (as do percurso V32, analíticas no plano oficial: `test/contas-contra-o-plano-oficial`). A
 * baixa é o par oposto. A liquidação e o pagamento usam contas de fixture (VPD, obrigação, banco), como os demais
 * testes do M05.
 *
 * Contas à mão:
 *   diária: 2 × 250 = 500, liquidada e paga 500; prestação comprova 500 → controle 0.
 *   suprimento: 1.000 concedido, liquidado e pago; gasta 700 e DEVOLVE 300: o dinheiro volta pela anulação parcial do
 *   pagamento (300), da liquidação (300) e do empenho (300) — empenhado, liquidado e pago líquidos 700; a prestação
 *   explica 700 + 300 = 1.000; a baixa zera o controle. Caixa: −500 − 1.000 + 300 = −1.200; VPD 500 + 700 = 1.200.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const SERVIDORA = "12345678909";
const CONTROLE_D = "7.9.1.2.1.00.00";
const CONTROLE_C = "8.9.1.2.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const VPD = "3.3.2.1.1.01.00";
const OBRIGACAO = "2.1.3.1.1.00.00";
const BANCO = "1.1.1.1.2.00.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: OBRIGACAO, creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: OBRIGACAO, disponibilidade: BANCO, creditoLiquidado: C_LIQUIDADO, creditoPago: C_EMPENHADO });
const FUNDAMENTO = "Ensaio V34: plano oficial — controle de adiantamentos e suprimentos de fundos concedidos a comprovar.";
const D = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const deps = () => criarM05Deps(prisma);
const saldo = async (codigo: string): Promise<string> => (await saldoDasContas(prisma, [codigo], null)).toFixed(2);

let diaria = "";
let suprimento = "";

describe("V34 — diária e suprimento com movimento (ensaio)", () => {
  beforeAll(async () => {
    await limparBanco(prisma);
    await prisma.contaPcasp.createMany({
      data: [
        { codigo: C_DISPONIVEL, nome: "Crédito disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { codigo: C_EMPENHADO, nome: "Crédito empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { codigo: C_LIQUIDADO, nome: "Crédito liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
        { codigo: OBRIGACAO, nome: "Obrigações a pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
        { id: "c-banco", codigo: BANCO, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
        { codigo: CONTROLE_D, nome: "Controle de adiantamentos/suprimentos de fundos concedidos", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
        { codigo: CONTROLE_C, nome: "Adiantamentos concedidos a comprovar", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
      ],
      skipDuplicates: true,
    });
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Gabinete", orgaoId: "org-01" } });
    await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
    await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm. geral" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
    await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
    await prisma.naturezaDespesa.createMany({
      data: [
        { id: "nd-14", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "14", codigoCompleto: "339014", descricao: "Diárias civil" },
        { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Outros serviços de terceiros - PJ" },
      ],
    });
    await prisma.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
    await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: "f500", contaContabilId: "c-banco" } });
    for (const [id, nd, n] of [["ficha-14", "nd-14", 1], ["ficha-39", "nd-39", 2]] as const) {
      await criarFichaDeTeste(prisma, {
        id, numero: n, exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
        programaId: "prg", acaoId: "aca", fonteId: "f500", naturezaDespesaId: nd, valorDotado: "100000.00",
      });
    }
    for (const especie of ["DIARIA", "SUPRIMENTO_DE_FUNDOS"]) {
      await declararRoteiroPatrimonial(prisma, { familia: "ADIANTAMENTO", chave: `CONCESSAO/${especie}`, contaDebitoCodigo: CONTROLE_D, contaCreditoCodigo: CONTROLE_C, historicoPadrao: "Adiantamento concedido", fundamento: FUNDAMENTO, criadoPor: POR });
      await declararRoteiroPatrimonial(prisma, { familia: "ADIANTAMENTO", chave: `BAIXA/${especie}`, contaDebitoCodigo: CONTROLE_C, contaCreditoCodigo: CONTROLE_D, historicoPadrao: "Adiantamento comprovado", fundamento: FUNDAMENTO, criadoPor: POR });
    }
  }, 240000);

  it("m1: diária — concessão, empenho, liquidação, pagamento, prestação e baixa; o controle volta a zero", async () => {
    const e = (await empenhar({ fichaId: "ficha-14", numero: "2026NE000001", tipo: "ORDINARIO", valor: "500.00", data: D("2026-03-02"), credorCpfCnpj: SERVIDORA, historico: "Diárias da capacitação no Tribunal", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, R_EMPENHO, deps())).empenhoId;
    diaria = (await concederAdiantamento(prisma, {
      especie: "DIARIA", numero: "D-ENSAIO-1", empenhoId: e, beneficiarioNome: "Servidora de ensaio", beneficiarioDocumento: SERVIDORA,
      finalidade: "Capacitação no Tribunal de Contas", destino: "João Pessoa", diaInicio: "2026-03-10", diaFim: "2026-03-11",
      quantidadeDeDiarias: "2", valorUnitario: "250.00", valor: "500.00", atoAutorizativo: "Lei Municipal de ensaio 1/2026",
      diaPrazoDePrestacao: "2026-03-20", diaConcessao: "2026-03-05", criadoPor: POR,
    })).concessaoId;
    expect([await saldo(CONTROLE_D), await saldo(CONTROLE_C)]).toEqual(["500.00", "-500.00"]);
    const l = (await liquidar({ empenhoId: e, numero: "NL-D1", valor: "500.00", data: D("2026-03-06"), responsavelAtesto: "Chefe do gabinete", historico: "Diárias atestadas", criadoPor: POR }, R_LIQUIDACAO, deps())).liquidacaoId;
    await pagar({ liquidacaoId: l, numero: "NP-D1", valor: "500.00", data: D("2026-03-07"), contaBancaria: "CC-001", fonteId: "f500", historico: "Pagamento das diárias", criadoPor: POR }, R_PAGAMENTO, deps());

    const p = await registrarPrestacaoDeAdiantamento(prisma, { concessaoId: diaria, valorComprovado: "500.00", valorDevolvido: "0.00", relatorio: "Relatório da viagem com o certificado de participação anexado.", diaApresentacao: "2026-03-15", criadoPor: POR });
    await aprovarPrestacaoDeAdiantamento(prisma, { prestacaoId: p.prestacaoId, motivo: "Prestação conferida pelo controle interno", diaDecisao: "2026-03-16", criadoPor: POR });

    const linha = (await listarAdiantamentos(prisma, D("2026-03-17"))).find((x) => x.id === diaria);
    expect(linha).toMatchObject({ situacao: "COMPROVADA", liquidado: "500.00", pago: "500.00", ultimaDecisao: { aprovada: true } });
    expect([await saldo(CONTROLE_D), await saldo(CONTROLE_C)]).toEqual(["0.00", "0.00"]);
  });

  it("m2: suprimento — prestação parcial com saldo a devolver; a devolução volta ao caixa pelas anulações; a baixa zera o controle", async () => {
    const e = (await empenhar({ fichaId: "ficha-39", numero: "2026NE000002", tipo: "ORDINARIO", valor: "1000.00", data: D("2026-04-01"), credorCpfCnpj: SERVIDORA, historico: "Suprimento de fundos da secretaria", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMPENHO, deps())).empenhoId;
    suprimento = (await concederAdiantamento(prisma, {
      especie: "SUPRIMENTO_DE_FUNDOS", numero: "S-ENSAIO-1", empenhoId: e, beneficiarioNome: "Servidora de ensaio", beneficiarioDocumento: SERVIDORA,
      finalidade: "Pequenas compras de pronto pagamento da secretaria", diaInicio: "2026-04-02", diaFim: "2026-04-30", valor: "1000.00",
      atoAutorizativo: "Decreto Municipal de ensaio 2/2026", diaPrazoDePrestacao: "2026-05-10", diaConcessao: "2026-04-02", criadoPor: POR,
    })).concessaoId;
    const l = (await liquidar({ empenhoId: e, numero: "NL-S1", valor: "1000.00", data: D("2026-04-03"), responsavelAtesto: "Secretária", historico: "Suprimento liquidado", criadoPor: POR }, R_LIQUIDACAO, deps())).liquidacaoId;
    const pg = (await pagar({ liquidacaoId: l, numero: "NP-S1", valor: "1000.00", data: D("2026-04-04"), contaBancaria: "CC-001", fonteId: "f500", historico: "Entrega do suprimento", criadoPor: POR }, R_PAGAMENTO, deps())).pagamentoId;

    // A prestação que não explica o valor inteiro é recusada, e o motivo diz a soma.
    await expect(registrarPrestacaoDeAdiantamento(prisma, { concessaoId: suprimento, valorComprovado: "700.00", valorDevolvido: "200.00", relatorio: "Notas fiscais das compras de pronto pagamento.", diaApresentacao: "2026-05-05", criadoPor: POR }))
      .rejects.toThrow(/somam 900\.00, e a concessão S-ENSAIO-1 foi de 1000\.00/);

    // Gastou 700; os 300 voltam ao caixa: anulação parcial do pagamento, da liquidação e do empenho, nessa ordem.
    const MOTIVO = "Saldo do suprimento devolvido pela servidora (guia de devolução)";
    await anularPagamentoParcial({ originalId: pg, numero: "NP-S1-DEV", valor: "300.00", data: D("2026-05-04"), motivo: MOTIVO, criadoPor: POR }, deps());
    await anularLiquidacaoParcial({ originalId: l, numero: "NL-S1-DEV", valor: "300.00", data: D("2026-05-04"), motivo: MOTIVO, criadoPor: POR }, deps());
    await anularEmpenhoParcial({ originalId: e, numero: "2026NE000002-DEV", valor: "300.00", data: D("2026-05-04"), motivo: MOTIVO, criadoPor: POR }, deps());

    const pr = await registrarPrestacaoDeAdiantamento(prisma, { concessaoId: suprimento, valorComprovado: "700.00", valorDevolvido: "300.00", relatorio: "Notas fiscais das compras de pronto pagamento e a guia de devolução do saldo.", diaApresentacao: "2026-05-05", criadoPor: POR });
    const emAnalise = (await listarAdiantamentos(prisma, D("2026-05-06"))).find((x) => x.id === suprimento);
    expect(emAnalise).toMatchObject({ liquidado: "700.00", pago: "700.00", prestacaoEmAnalise: { valorComprovado: "700.00", valorDevolvido: "300.00" } });
    expect([await saldo(CONTROLE_D), await saldo(CONTROLE_C)]).toEqual(["1000.00", "-1000.00"]); // ainda a comprovar

    await aprovarPrestacaoDeAdiantamento(prisma, { prestacaoId: pr.prestacaoId, motivo: "Despesas comprovadas e saldo devolvido", diaDecisao: "2026-05-07", criadoPor: POR });
    expect((await listarAdiantamentos(prisma, D("2026-05-08"))).find((x) => x.id === suprimento)?.situacao).toBe("COMPROVADA");
    expect([await saldo(CONTROLE_D), await saldo(CONTROLE_C)]).toEqual(["0.00", "0.00"]);

    // Efeito patrimonial das duas concessões: a despesa reconhecida e o dinheiro que saiu, líquidos da devolução.
    expect(await saldo(VPD)).toBe("1200.00");
    expect(await saldo(BANCO)).toBe("-1200.00");
    expect(await saldo(OBRIGACAO)).toBe("0.00");
    // O histórico: dois lançamentos de controle por concessão (concessão e baixa), cada um apontando o seu fato.
    const lancamentos = await prisma.lancamentoContabil.count({ where: { partidas: { some: { conta: { codigo: CONTROLE_D } } } } });
    expect(lancamentos).toBe(4);
  });
});
