import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
  CONTA_CREDITO_LIQUIDADO_A_PAGAR,
  CONTA_CREDITO_LIQUIDADO_PAGO,
  CONTA_CREDITO_RESERVADO,
  CONTA_DOTACAO_ADICIONAL,
  CONTA_DOTACAO_INICIAL,
  CONTA_RECEITA_A_REALIZAR,
  CONTA_RECEITA_REALIZADA,
} from "../m01-core-contabil/roteiros.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { anularEmpenhoParcial, anularLiquidacaoParcial, anularPagamentoParcial, estornarAnulacaoParcial } from "../m05-despesa/anulacao-parcial.js";
import { fimDoDiaCivil, janelaCivilDoAno } from "../../packages/datas/index.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import { apurarResultadoDoExercicio } from "./apuracao.js";
import { encerrarControlesOrcamentarios } from "./encerramento-controles.js";
import { classificarContaNaVirada } from "./classificacao-da-virada.js";
import { abrirExercicio } from "./exercicio.js";
import { roteiroPagamentoRestos } from "./dominio.js";
import { pagarRestosAPagar, saldoDosRestos } from "./restos.js";

/**
 * V34 — O ENCERRAMENTO ANUAL DE PONTA A PONTA, COM ANULAÇÃO PARCIAL, EM BANCO ISOLADO.
 *
 * empenho → liquidação e pagamento PARCIAIS → anulação parcial nos três níveis (uma delas estornada) → encerramento →
 * inscrição dos restos → apuração do resultado → virada das contas de controle → abertura de 2027 → pagamento de
 * parte do resto. Afirma os valores inscritos, a obrigação, os controles e o razão a cada passo.
 *
 * ═══ O QUE É REGRA, O QUE É ROTEIRO, O QUE É DECISÃO DO ENTE (e qual foi usada aqui) ═══
 *   · REGRA TÉCNICA (código): RP processado = liquidado − pago; não processado = empenhado − liquidado; a família
 *     de cada fato pela régua dos estornáveis; apuração zera as classes 3 e 4 contra a conta de resultado; a virada
 *     zera as contas 5/6 classificadas ENCERRA e deixa as TRANSFERE.
 *   · ROTEIRO OFICIAL (MCASP Parte IV, citado nas justificativas): dotação, crédito disponível e execução do exercício
 *     encerram com ele (CF art. 167, II; anualidade).
 *   · CONFIGURAÇÃO MUNICIPAL — AQUI, DE ENSAIO: a conta de resultados acumulados (`RoteiroEncerramento`) e a
 *     classificação de cada conta na virada (`ContaNaVirada`). Os valores abaixo são os do teste de controles
 *     (`m08-encerramento-controles.test.ts`, DESTINOS), compatíveis com o plano adotado; NÃO são a decisão de
 *     Esperança, que continua pendente de implantação (docs/operacao/ENSAIO-ENCERRAMENTO-V34.md).
 *
 * ═══ AS CONTAS À MÃO ═══
 *   receita 8.000. NE-1 10.000: parcial de 1.000 viva e de 500 ESTORNADA → empenhado 9.000. NL-1 6.000 com parcial
 *   de 800 → liquidado 5.200. NP-1 3.000 com parcial de 300 → pago 2.700. NE-2 2.000 liquidado e pago inteiro.
 *   RP de NE-1: não processado 9.000 − 5.200 = 3.800; processado 5.200 − 2.700 = 2.500. NE-2: nenhum.
 *   Fornecedores = 7.200 liquidados − 4.700 pagos = 2.500 (o processado). Caixa = 8.000 − 4.700 = 3.300.
 *   Resultado = VPA 8.000 − VPD 7.200 = 800 de superávit.
 *   2027: paga 1.000 do processado → saldo do resto 1.500; fornecedores 1.500; caixa 2.300.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-2026";
const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const RESULTADOS = "2.3.7.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const VPA = "4.1.1.2.1.01.00";
const D = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const FIM_2026 = fimDoDiaCivil("2026-12-31");
const MOTIVO = "glosa registrada pela fiscalização do contrato";

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-res", codigo: RESULTADOS, nome: "Resultados acumulados", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: CONTA_RECEITA_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: CONTA_RECEITA_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: CONTA_CREDITO_LIQUIDADO_A_PAGAR, nome: "Crédito liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: CONTA_CREDITO_LIQUIDADO_PAGO, nome: "Crédito pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];
const R_ARRECADACAO = roteiroArrecadacao({ disponibilidade: CAIXA, variacaoAumentativa: VPA, receitaARealizar: CONTA_RECEITA_A_REALIZAR, receitaRealizada: CONTA_RECEITA_REALIZADA });
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: CONTA_CREDITO_DISPONIVEL, creditoEmpenhado: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR, creditoLiquidado: CONTA_CREDITO_LIQUIDADO_A_PAGAR });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: CONTA_CREDITO_LIQUIDADO_A_PAGAR, creditoPago: CONTA_CREDITO_LIQUIDADO_PAGO });
const R_PAG_RP = roteiroPagamentoRestos({ restosAPagarProcessados: FORNECEDOR, disponibilidade: CAIXA });

/** A configuração de ensaio da virada: tudo do exercício ENCERRA (MCASP Parte IV; ver o cabeçalho). */
const VIRADA_DE_ENSAIO: readonly string[] = [
  CONTA_DOTACAO_INICIAL,
  CONTA_DOTACAO_ADICIONAL,
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_RESERVADO,
  CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
  CONTA_CREDITO_LIQUIDADO_A_PAGAR,
  CONTA_CREDITO_LIQUIDADO_PAGO,
  CONTA_RECEITA_A_REALIZAR,
  CONTA_RECEITA_REALIZADA,
];

/** Saldo D − C de uma conta até o fim de 2026 (ou de 2027), pela data do fato. */
const saldo = async (codigo: string, ate = FIM_2026): Promise<string> => (await saldoDasContas(prisma, [codigo], ate, "dataTransacao")).toFixed(2);

let ne1 = "";
let nl1 = "";
let exercicio2026 = "";

describe("V34 — o encerramento anual de ponta a ponta, com anulação parcial", () => {
  beforeAll(async () => {
    await limparBanco(prisma);
    const deps = criarM05Deps(prisma);
    await prisma.contaPcasp.createMany({ data: CONTAS, skipDuplicates: true });
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
    await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
    await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
    await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
    await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
    await prisma.naturezaReceita.create({ data: { id: "nr", codigo: "11130111", descricao: "IPTU" } });
    await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
    await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE, contaContabilId: "c-caixa" } });
    await criarFichaDeTeste(prisma, {
      id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361",
      programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
    });
    exercicio2026 = (await prisma.exercicio.findUniqueOrThrow({ where: { ano: 2026 }, select: { id: true } })).id;
    await prisma.roteiroEncerramento.create({ data: { contaResultadosAcumuladosId: "c-res", criadoPor: POR } });
    for (const contaCodigo of VIRADA_DE_ENSAIO) {
      await classificarContaNaVirada(prisma, { contaCodigo, destino: "ENCERRA", justificativa: "Ensaio V34: execução e autorização do exercício encerram com ele (MCASP Parte IV; CF art. 167, II).", criadoPor: POR });
    }

    await registrarArrecadacao({ exercicio: 2026, naturezaReceita: "11130111", fonte: "500", valor: "8000.00", dataArrecadacao: D("2026-01-10"), numeroReceita: "GUIA-1", contaBancaria: "CC-001", criadoPor: POR }, R_ARRECADACAO, criarM04Deps(prisma));

    const emp = async (numero: string, valor: string, data: string, categoria: "PRESTACAO_SERVICOS" | "FORNECIMENTO_BENS") =>
      (await empenhar({ fichaId: FICHA, numero, tipo: "ORDINARIO", valor, data: D(data), credorCpfCnpj: "12345678000195", historico: `empenho ${numero}`, categoriaOrdemCronologica: categoria, criadoPor: POR }, R_EMPENHO, deps)).empenhoId;
    const liq = async (empenhoId: string, numero: string, valor: string, data: string) =>
      (await liquidar({ empenhoId, numero, valor, data: D(data), responsavelAtesto: "Fiscal", historico: `liquidação ${numero}`, criadoPor: POR }, R_LIQUIDACAO, deps)).liquidacaoId;
    const pag = async (liquidacaoId: string, numero: string, valor: string, data: string) =>
      (await pagar({ liquidacaoId, numero, valor, data: D(data), contaBancaria: "CC-001", fonteId: FONTE, historico: `pagamento ${numero}`, criadoPor: POR }, R_PAGAMENTO, deps)).pagamentoId;

    ne1 = await emp("NE-1", "10000.00", "2026-06-01", "PRESTACAO_SERVICOS");
    nl1 = await liq(ne1, "NL-1", "6000.00", "2026-08-01");
    const np1 = await pag(nl1, "NP-1", "3000.00", "2026-09-01");
    await anularEmpenhoParcial({ originalId: ne1, numero: "NE-1-AP1", valor: "1000.00", data: D("2026-09-10"), motivo: MOTIVO, criadoPor: POR }, deps);
    const ap2 = await anularEmpenhoParcial({ originalId: ne1, numero: "NE-1-AP2", valor: "500.00", data: D("2026-09-11"), motivo: MOTIVO, criadoPor: POR }, deps);
    await estornarAnulacaoParcial({ nivel: "EMPENHO", anulacaoId: ap2.anulacaoId, numero: "NE-1-AP2-E", data: D("2026-09-12"), motivo: "redução desfeita pelo aditivo", criadoPor: POR }, deps);
    await anularLiquidacaoParcial({ originalId: nl1, numero: "NL-1-AP1", valor: "800.00", data: D("2026-09-15"), motivo: MOTIVO, criadoPor: POR }, deps);
    await anularPagamentoParcial({ originalId: np1, numero: "NP-1-AP1", valor: "300.00", data: D("2026-09-20"), motivo: "pagamento a maior devolvido pelo fornecedor", criadoPor: POR }, deps);

    const ne2 = await emp("NE-2", "2000.00", "2026-06-02", "FORNECIMENTO_BENS");
    const nl2 = await liq(ne2, "NL-2", "2000.00", "2026-08-02");
    await pag(nl2, "NP-2", "2000.00", "2026-09-02");
  }, 300000);

  it("c1: antes de encerrar, o razão e os controles batem com as contas à mão", async () => {
    expect(await saldo(CAIXA)).toBe("3300.00");
    expect(await saldo(FORNECEDOR)).toBe("-2500.00");
    expect(await saldo(VPD)).toBe("7200.00");
    expect(await saldo(VPA)).toBe("-8000.00");
    // controles: a liquidar = RP não processado; liquidado a pagar = RP processado
    expect(await saldo(CONTA_CREDITO_EMPENHADO_A_LIQUIDAR)).toBe("-3800.00");
    expect(await saldo(CONTA_CREDITO_LIQUIDADO_A_PAGAR)).toBe("-2500.00");
    expect(await saldo(CONTA_CREDITO_LIQUIDADO_PAGO)).toBe("-4700.00");
  });

  it("c2: o encerramento inscreve 3.800 não processados e 2.500 processados do NE-1, e nada do NE-2", async () => {
    const r = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    expect(r.inscricoes.map((i) => `${i.numeroEmpenho} ${i.tipo} ${i.valorInscrito.toFixed(2)}`).sort()).toEqual(["NE-1 NAO_PROCESSADO 3800.00", "NE-1 PROCESSADO 2500.00"]);
    // o inscrito é o que os controles diziam (oráculo independente: o razão)
    expect((await saldo(CONTA_CREDITO_EMPENHADO_A_LIQUIDAR))).toBe("-3800.00");
    expect((await saldo(CONTA_CREDITO_LIQUIDADO_A_PAGAR))).toBe("-2500.00");
  });

  it("c3: a apuração leva 800 de superávit aos resultados acumulados e zera as classes 3 e 4", async () => {
    const a = await apurarResultadoDoExercicio(prisma, { exercicioId: exercicio2026, criadoPor: POR });
    expect(a.resultadoApurado.toFixed(2)).toBe("800.00");
    expect(await saldo(RESULTADOS)).toBe("-800.00");
    expect([await saldo(VPD), await saldo(VPA)]).toEqual(["0.00", "0.00"]);
  });

  it("c4: a virada zera as contas de controle do exercício; o patrimonial (caixa, fornecedores) atravessa", async () => {
    await encerrarControlesOrcamentarios(prisma, { exercicioId: exercicio2026, criadoPor: POR });
    for (const c of [CONTA_CREDITO_DISPONIVEL, CONTA_CREDITO_EMPENHADO_A_LIQUIDAR, CONTA_CREDITO_LIQUIDADO_A_PAGAR, CONTA_CREDITO_LIQUIDADO_PAGO, CONTA_RECEITA_A_REALIZAR, CONTA_RECEITA_REALIZADA, CONTA_DOTACAO_INICIAL]) {
      expect(await saldo(c), c).toBe("0.00");
    }
    expect(await saldo(CAIXA)).toBe("3300.00");
    expect(await saldo(FORNECEDOR)).toBe("-2500.00");
  });

  it("c5: aberto 2027, paga-se 1.000 do processado — saldo do resto 1.500, obrigação e caixa acompanham", async () => {
    await abrirExercicio(prisma, { ano: 2027, criadoPor: POR });
    await pagarRestosAPagar(prisma, { liquidacaoId: nl1, numero: "NP-RP-1", valor: "1000.00", data: D("2027-02-01"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento de resto processado", criadoPor: POR }, R_PAG_RP);
    const fim2027 = janelaCivilDoAno(2027).fim;
    const insc = await prisma.inscricaoRestosAPagar.findFirstOrThrow({ where: { empenhoId: ne1, tipo: "PROCESSADO" }, select: { id: true } });
    expect((await saldoDosRestos(prisma, insc.id)).saldo.toFixed(2)).toBe("1500.00");
    expect(await saldo(FORNECEDOR, fim2027)).toBe("-1500.00");
    expect(await saldo(CAIXA, fim2027)).toBe("2300.00");
  });
});
