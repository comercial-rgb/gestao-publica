import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearSagresPoc } from "./sagres-poc.js";
import { gerarDespesaExtra, gerarDotacao, gerarEmpenhos, gerarEstornoDespesaExtra, gerarEstornoRetencao, gerarLiquidacao, gerarMovimentacaoEntreContas, gerarPagamentos, gerarReceitaOrcamentaria, gerarRetencao, lerFatosEmpenhos, lerFatosEstornoPagamento } from "../../adapters/tribunais/tce-pb/sagres/index.js";
import { estornarMovimentoExtra, registrarDispendioExtra } from "../../modules/m07-extraorcamentario/extraorcamentario.js";
import { roteiroDispendioExtra } from "../../modules/m07-extraorcamentario/dominio.js";
import { anularPagamento, liquidar, pagar } from "../../modules/m05-despesa/servico-bloco2.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../../modules/m05-despesa/dominio.js";
import { registrarMovimentoDotacao } from "../../modules/m05-despesa/dotacao-razao.js";
import { recalcularCache } from "../../modules/m05-despesa/adapter-prisma.js";
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox.js";
import { empenhoParaCaptura, montarEnvelope, validarEnvelopeCaptura } from "../../adapters/tribunais/tce-pb/captura/index.js";
import { listarDecretos } from "../../modules/m03-creditos/consultas.js";
import { listarSaldosExtra, listarRetencoes, listarDispendios } from "../../modules/m07-extraorcamentario/consultas.js";
import { demonstrativoPatrimonialPorClasse } from "../../modules/m10-patrimonial/demonstrativo.js";
import { Decimal } from "../../packages/contracts/index.js";

/**
 * Prova a MASSA POC (S-massa, F2) ponta a ponta, contra o banco de teste LIMPO (com os usuários das
 * fixtures já semeados por `limparBanco`). A história encadeada nasce pelo funil (dados reais), e os
 * exporters SAGRES enxergam cada elo. Idempotência: rodar duas vezes = mesmo estado, sem duplicar.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const UG = "999001";
const CNPJ = "12345678000195"; // CNPJ fictício do ente gerenciador (POC).
const DIA = new Date(Date.UTC(2026, 6, 15));
// Identidade das fixtures (o `limparBanco` a semeia com ADMIN). O seed NÃO cria usuários (t5).
const POR = "m05@cg.pb.gov.br";

describe("massa POC SAGRES — a história encadeada", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await semearSagresPoc(prisma, { criadoPor: POR });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cria a UG, a ficha (dotação), o empenho→liquidação→pagamento, as 2 contas e a transferência", async () => {
    expect(await prisma.orgao.findUnique({ where: { id: "org-poc" } })).not.toBeNull();
    expect(await prisma.fichaOrcamentaria.count()).toBe(1);
    // AMPLIADA: jul (50k) + ago (20k) + set (10k c/ retenção, TRAVA-2) → 3 empenhos/liq/pag; 1 ficha.
    expect(await prisma.empenho.count()).toBe(3);
    expect(await prisma.liquidacao.count()).toBe(3);
    expect(await prisma.pagamento.count()).toBe(3);
    expect(await prisma.receitaArrecadada.count()).toBe(1); // arrecadação de 05/jul (F3)
    expect(await prisma.contaBancaria.count()).toBe(2);
    const transf = await prisma.transferenciaEntreContas.findMany();
    expect(transf).toHaveLength(1);
    expect(transf[0]!.valor.toFixed(2)).toBe("2500.00");
  });

  it("TRAVA-1 — a massa tem 1 decreto de crédito lido pela camada de leitura (balanceado, 5.111)", async () => {
    const decretos = await listarDecretos(prisma, { ano: 2026 });
    expect(decretos).toHaveLength(1);
    const d = decretos[0]!;
    expect(d.numero).toBe("0001");
    expect(d.tipoCredito).toBe("SUPLEMENTAR");
    expect(d.encerrado).toBe(false);
    // remanejamento: supl 5k == anul 5k → diferença 0 (balanceado por fonte, TR 5.111).
    expect(d.suplementado).toBe("5000.00");
    expect(d.anulado).toBe("5000.00");
    expect(d.diferenca).toBe("0.00");
    expect(d.itens).toHaveLength(2);
  });

  it("TRAVA-2 — retenção ISS na cadeia de setembro: saldo próprio, vínculo 5.25 e recolhimento com trava", async () => {
    // Saldo por consignatário: reteve 500, recolheu 300 → deve 200 ao consignatário (5.41).
    const saldos = await listarSaldosExtra(prisma);
    const iss = saldos.find((s) => s.tipoCodigo === "ISS");
    expect(iss).toBeDefined();
    expect(iss!.ingressado).toBe("500.00");
    expect(iss!.dispendido).toBe("300.00");
    expect(iss!.saldo).toBe("200.00");

    // Retenção com DRILL ao documento (5.25): nasce dentro do pagamento nº3 / empenho nº3.
    const ret = await listarRetencoes(prisma, { exercicio: 2026 });
    expect(ret).toHaveLength(1);
    expect(ret[0]!.valor).toBe("500.00");
    expect(ret[0]!.pagamentoNumero).toBe("3");
    expect(ret[0]!.empenhoNumero).toBe("3");

    // Despesa extra (recolhimento parcial).
    const disp = await listarDispendios(prisma, { exercicio: 2026 });
    expect(disp).toHaveLength(1);
    expect(disp[0]!.valor).toBe("300.00");
  });

  // ── S-fechamento (F1): os DOIS exporters novos, contra a massa real ────────────────────────────
  // A cadeia de setembro é exatamente o que alimenta §4.14 e §4.20. O golden byte a byte da
  // serialização vive em m15-sagres.test.ts; aqui a prova é a LEITURA do banco + nomenclatura.

  it("SAGRES §4.14 Retencao — lê a retenção de 14/09 e serializa o registro (52 posições)", async () => {
    const arq = await gerarRetencao(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 8, 14)) });
    expect(arq.registros).toBe(1);
    expect(arq.nome).toBe("99900114092026Retencao.txt");
    const esperado = [
      "999001", //           1-6   UG (parâmetro export)
      "2026", //             7-10  anoEmissaoEmpenho
      "99001", //            11-15 codUnidadeOrcamentaria (a UO da massa POC)
      "0000003", //          16-22 numEmpenho (nº3, setembro)
      "0000003", //          23-29 numPagamento (nº3)
      "0000000000500,00", // 30-45 valor retido
      "1", //                46    tipo: ISS → §5.24 código 1 (pelo de-para)
      "000000", //           47-52 reservado
    ].join("");
    expect(arq.conteudo.toString("utf8")).toBe(esperado + "\r\n");
  });

  it("SAGRES §4.20 DespesaExtra — lê o recolhimento de 20/09 e serializa o registro (637 posições)", async () => {
    const arq = await gerarDespesaExtra(prisma, {
      codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869",
      dia: new Date(Date.UTC(2026, 8, 20)),
    });
    expect(arq.registros).toBe(1);
    expect(arq.nome).toBe("99900120092026DespesaExtra.txt");
    const linha = arq.conteudo.toString("utf8").replace(/\r\n$/, "");
    expect(linha).toHaveLength(637);
    // Campos-chave conferidos por POSIÇÃO (o golden completo está no m15-sagres.test.ts).
    expect(linha.slice(0, 6)).toBe("999001"); //                        1-6    UG
    expect(linha.slice(6, 13)).toBe("0000001"); //                      7-13   numero (1º do exercício)
    expect(linha.slice(13, 22)).toBe("218810200"); //                   14-22  conta 2.1.8.8.1.02.00 (consignação ISS a pagar)
    expect(linha.slice(22, 30)).toBe("20092026"); //                    23-30  data
    expect(linha.slice(30, 44)).toBe("00000000000000"); //              31-44  cpfCnpj: recolhimento sem o documento de quem recebe → zeros
    expect(linha.slice(45, 48)).toBe("869"); //                         46-48  fonte STN (parâmetro export)
    expect(linha.slice(48, 61)).toBe("111111".padEnd(13, " ")); //      49-61  conta CC-POC-A + dígito
    expect(linha.slice(71, 87)).toBe("0000000000300,00"); //            72-87  valor recolhido
    expect(linha.slice(587, 595)).toBe("20000017"); //                  588-595 §5.3 Consignações
    expect(linha.slice(595, 599)).toBe("2026"); //                      596-599 exercício
    expect(linha.slice(599, 602)).toBe("500"); //                       600-602 fonte REAL que paga
    expect(linha.slice(606, 623)).toBe(" ".repeat(17)); //              607-623 vínculo ReceitaExtra não exigido → espaços
    expect(linha.slice(623, 637)).toBe(CNPJ); //                        624-637 CNPJ gerenciador
  });

  it("SAGRES — dia sem retenção/dispêndio gera arquivo VAZIO (0 registros), não erro", async () => {
    const r = await gerarRetencao(prisma, { codUnidadeGestora: UG, dia: DIA }); // 15/07: sem retenção
    expect(r.registros).toBe(0);
    const d = await gerarDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: DIA });
    expect(d.registros).toBe(0);
  });

  it("SAGRES §4.20 — fonte fora do domínio STN é recusada nomeando as admitidas", async () => {
    await expect(
      gerarDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "500", dia: new Date(Date.UTC(2026, 8, 20)) })
    ).rejects.toThrow(/860, 861, 862, 869/);
  });

  it("TRAVA-3 — posição patrimonial 5.86: 2 classes; anterior + ingressos + atualizações = final", async () => {
    const dem = await demonstrativoPatrimonialPorClasse(prisma, 2026);
    // 2 bens em 2 classes (móvel + imóvel).
    expect(dem.classes.length).toBe(2);
    // A IDENTIDADE 5.86 vale em cada classe e no total.
    for (const c of [...dem.classes, { saldoAnterior: dem.total.saldoAnterior, ingressos: dem.total.ingressos, atualizacoes: dem.total.atualizacoes, saldoFinal: dem.total.saldoFinal }]) {
      const esperado = new Decimal(c.saldoAnterior).plus(c.ingressos).plus(c.atualizacoes);
      expect(esperado.toFixed(2)).toBe(new Decimal(c.saldoFinal).toFixed(2));
    }
    // Ingressos totais = 50k (móvel, avaliação) + 200k (imóvel, avaliação) + 20k (imóvel, reavaliação
    // de aumento — o demonstrativo classifica o aumento como INGRESSO, não atualização acumulada).
    expect(new Decimal(dem.total.ingressos).toFixed(2)).toBe("270000.00");
    // Imóvel: avaliação 200k + reavaliação 20k = ingressos 220k; sem depreciação → final 220k.
    // ⚠️ PELO CÓDIGO DA CLASSE, NÃO PELA DESCRIÇÃO (V11 V8.14). A descrição da classe da POC passou
    // a acompanhar a conta que ela resolve estruturalmente no plano oficial — e um teste que
    // procura por texto quebra quando o texto muda por um motivo legítimo. O código `1.2.3.2.1.01`
    // é o ramo dos bens IMÓVEIS, e é ele que identifica a classe.
    const imovel = dem.classes.find((c) => c.codigo === "1.2.3.2.1.01")!;
    expect(new Decimal(imovel.ingressos).toFixed(2)).toBe("220000.00");
    expect(new Decimal(imovel.atualizacoes).toFixed(2)).toBe("0.00");
    expect(new Decimal(imovel.saldoFinal).toFixed(2)).toBe("220000.00");
    // Móvel: avaliação 50k, depreciação (atualização negativa) → final < 50k.
    const movel = dem.classes.find((c) => c.codigo === "1.2.3.1.1.01")!;
    expect(new Decimal(movel.ingressos).toFixed(2)).toBe("50000.00");
    expect(new Decimal(movel.atualizacoes).lessThan(0)).toBe(true); // depreciação de outubro
  });

  it("F1/F2 (banco real) — Pagamentos (14/jul, 08/ago) e ReceitaOrcamentaria (05/jul) saem da massa", async () => {
    const UG_CNPJ = { codUnidadeGestora: UG, cnpjGerenciadora: "12345678000195" };
    const pagJul = await gerarPagamentos(prisma, { ...UG_CNPJ, dia: new Date(Date.UTC(2026, 6, 14)) });
    expect(pagJul.registros).toBe(1);
    expect(pagJul.nome).toBe("99900114072026Pagamentos.txt");
    expect(pagJul.conteudo.toString("utf8")).toContain("0000000050000,00"); // valor do pagamento
    expect(pagJul.conteudo.toString("utf8")).toContain("111111"); // conta A (11111+1), débito

    const pagAgo = await gerarPagamentos(prisma, { ...UG_CNPJ, dia: new Date(Date.UTC(2026, 7, 8)) });
    expect(pagAgo.registros).toBe(1); // segundo mês

    const rec = await gerarReceitaOrcamentaria(prisma, { ...UG_CNPJ, codContaArrecadadora: "CC-POC-A", dia: new Date(Date.UTC(2026, 6, 5)) });
    expect(rec.registros).toBe(1);
    expect(rec.nome).toBe("99900105072026ReceitaOrcamentaria.txt");
    expect(rec.conteudo.toString("utf8")).toContain("11130211"); // código STN da receita
    expect(rec.conteudo.toString("utf8")).toContain("0000000080000,00"); // valor arrecadado
  });

  it("os exporters SAGRES enxergam a massa (dotação, empenho, liquidação, transferência)", async () => {
    const dot = await gerarDotacao(prisma, { codUnidadeGestora: UG, exercicio: 2026, competencia: DIA });
    expect(dot.registros).toBe(1);
    expect(dot.conteudo.toString("utf8")).toContain("0000000150000,00"); // valor dotado 150k

    const emp = await gerarEmpenhos(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 6, 10)) });
    expect(emp.registros).toBe(1);

    const liq = await gerarLiquidacao(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 6, 12)) });
    expect(liq.registros).toBe(1);

    const mov = await gerarMovimentacaoEntreContas(prisma, { codUnidadeGestora: UG, dia: DIA });
    expect(mov.registros).toBe(1);
    expect(mov.conteudo.toString("utf8")).toContain("111111"); // conta origem A (11111+1)
  });

  it("F3 — o extrato entra via importarExtratoBb (origem API_BB) e o pagamento fica CONCILIADO", async () => {
    const extrato = await prisma.extratoBancario.findFirstOrThrow({ where: { contaBancariaId: "cb-poc-a" } });
    expect(extrato.origem).toBe("API_BB");
    const linhas = await prisma.lancamentoExtrato.findMany({ where: { contaBancariaId: "cb-poc-a" } });
    expect(linhas).toHaveLength(3); // repasse 80k (C), pagamento 50k (D), transferência 2.5k (D)

    // Conciliação: a linha de 50k D está vinculada ao pagamento (o vínculo existe e é PAGAMENTO).
    const vinculos = await prisma.vinculoConciliacao.findMany({ where: { tipoInterno: "PAGAMENTO" } });
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]!.valor.toFixed(2)).toBe("50000.00");
  });

  it("S6 — o empenho herda o cpfOrdenador do ente, e o Empenhos JSON valida LIMPO (gap da S3 quitado)", async () => {
    const empenhos = await lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 6, 10)) });
    expect(empenhos[0]!.cpfOrdenador).toBe("11144477735"); // herdado do EnteConfig (S6)
    const env = montarEnvelope(empenhos.map((e) => empenhoParaCaptura(e)), "2026-07-19T10:00:00.000000");
    expect(validarEnvelopeCaptura("empenhos", env)).toEqual([]); // cpfOrdenador presente → schema oficial limpo
  });

  it("IDEMPOTÊNCIA: rodar o seed de novo é no-op — não duplica", async () => {
    await semearSagresPoc(prisma, { criadoPor: POR }); // 2ª vez
    expect(await prisma.fichaOrcamentaria.count()).toBe(1);
    expect(await prisma.empenho.count()).toBe(3);
    expect(await prisma.receitaArrecadada.count()).toBe(1);
    expect(await prisma.contaBancaria.count()).toBe(2);
    expect(await prisma.transferenciaEntreContas.count()).toBe(1);
  });
});

/**
 * V23 — OS ESTORNOS EXTRAORÇAMENTÁRIOS NO SAGRES (EstornoRetencao §4.15, EstornoDespesaExtra §4.22).
 *
 * Sobre a massa: ISS 500 retido no pagamento 3 (14/09) e recolhimento de 300 em 20/09 (DespesaExtra nº 1).
 *   · estornar o recolhimento em 21/09 → EstornoDespesaExtra: numDespesaExtra 1, numero 1, o motivo;
 *   · anular o pagamento 3 em 22/09   → a retenção volta: EstornoRetencao do empenho 3, parcela 3,
 *     tipo 1 (ISS), numero 1, 500,00.
 * E a numeração: um dispêndio lançado DEPOIS com data ANTERIOR (15/09) não renumera o de 20/09.
 */
describe("V23 — estornos extraorçamentários no SAGRES", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await semearSagresPoc(prisma, { criadoPor: POR });
  });

  const D = (mes: number, dia: number): Date => new Date(Date.UTC(2026, mes - 1, dia, 12, 0, 0));

  async function ids(): Promise<{ tipoIss: string; fonte: string; recolhimento: string; pag3: string }> {
    const tipoIss = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "ISS" }, select: { id: true } });
    const rec = await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "DISPENDIO" }, select: { id: true, fonteId: true } });
    const pag3 = await prisma.pagamento.findFirstOrThrow({ where: { numero: "3", estornoDeId: null }, select: { id: true } });
    return { tipoIss: tipoIss.id, fonte: rec.fonteId!, recolhimento: rec.id, pag3: pag3.id };
  }

  it("estornar o recolhimento e anular o pagamento: os dois arquivos saem nas posições, apontando a origem", async () => {
    const { recolhimento, pag3 } = await ids();
    await estornarMovimentoExtra(prisma, { movimentoId: recolhimento, data: D(9, 21), motivo: "Guia recolhida em duplicidade no banco", criadoPor: POR });
    await anularPagamento({ pagamentoId: pag3, numero: "4", data: D(9, 22), historico: "Pagamento ao credor errado", criadoPor: POR }, criarM05DepsComAlmoxarifado(prisma));

    const ed = await gerarEstornoDespesaExtra(prisma, { codUnidadeGestora: UG, dia: D(9, 21) });
    expect(ed.nome).toBe("99900121092026EstornoDespesaExtra.txt");
    const l1 = ed.conteudo.toString("utf8").split("\r\n").filter((x) => x !== "");
    expect(l1).toHaveLength(1);
    const a = l1[0]!;
    expect(a.length).toBe(305);
    expect(a.slice(6, 13)).toBe("0000001"); //          numDespesaExtra 7-13 — o nº que a DespesaExtra deu ao recolhimento
    expect(a.slice(13, 20)).toBe("0000001"); //         numero 14-20
    expect(a.slice(20, 28)).toBe("21092026"); //        data 21-28
    expect(a.slice(28, 44)).toBe("0000000000300,00"); // valor 29-44
    expect(a.slice(44, 299).trimEnd()).toBe("Guia recolhida em duplicidade no banco");
    const dx = await gerarDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: D(9, 20) });
    expect(dx.conteudo.toString("utf8").slice(6, 13)).toBe("0000001");

    const er = await gerarEstornoRetencao(prisma, { codUnidadeGestora: UG, dia: D(9, 22) });
    const l2 = er.conteudo.toString("utf8").split("\r\n").filter((x) => x !== "");
    expect(l2).toHaveLength(1);
    const b = l2[0]!;
    expect(b.length).toBe(59);
    expect(b.slice(6, 10)).toBe("2026");
    expect(b.slice(15, 22)).toBe("0000003"); //         numEmpenho 16-22
    expect(b.slice(22, 29)).toBe("0000003"); //         numPagamento 23-29 — a parcela ANULADA
    expect(b.slice(29, 30)).toBe("1"); //               tipoRetencao 30 — ISS
    expect(b.slice(30, 37)).toBe("0000001"); //         numero 31-37
    expect(b.slice(37, 53)).toBe("0000000000500,00"); // valor 38-53
    // O pagamento anulado também sai no EstornoPagamento do mesmo dia.
    expect((await lerFatosEstornoPagamento(prisma, { codUnidadeGestora: UG, dia: D(9, 22) })).map((f) => f.numPagamento)).toEqual(["3"]);
  });

  it("a numeração segue a ordem de gravação: o dispêndio lançado depois com data anterior NÃO renumera o já exportado", async () => {
    const { tipoIss, fonte } = await ids();
    await registrarDispendioExtra(
      prisma,
      { tipoConsignacaoId: tipoIss, credorConsignatario: "Municipio de Campina Grande", contaBancaria: "CC-POC-A", fonteId: fonte, valor: "100.00", data: D(9, 15), historico: "Recolhimento lancado depois", criadoPor: POR },
      roteiroDispendioExtra({ consignacaoAPagar: "2.1.8.8.1.02.00", disponibilidade: "1.1.1.1.1.19.00" })
    );
    const numeroEm = async (mes: number, dia: number): Promise<string> =>
      (await gerarDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: D(mes, dia) })).conteudo.toString("utf8").slice(6, 13);
    expect(await numeroEm(9, 20)).toBe("0000001"); // o de 20/09 continua sendo o 1 — foi o que o tribunal recebeu
    expect(await numeroEm(9, 15)).toBe("0000002");
  });

  it("o motivo do estorno extra que o arquivo não aceita é recusado na entrada — nada é gravado", async () => {
    const { recolhimento } = await ids();
    const antes = await prisma.movimentoExtraorcamentario.count();
    await expect(
      estornarMovimentoExtra(prisma, { movimentoId: recolhimento, data: D(9, 21), motivo: 'Pedido do "tesoureiro" da prefeitura', criadoPor: POR })
    ).rejects.toThrow(/aspas nem apóstrofo/);
    await expect(
      estornarMovimentoExtra(prisma, { movimentoId: recolhimento, data: D(9, 21), motivo: "m".repeat(256), criadoPor: POR })
    ).rejects.toThrow(/256 caracteres.*até 255/);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(antes);
  });
});

/**
 * V24 — DESPESAEXTRA (§4.20) COM O BENEFICIÁRIO E O CO. O CPF/CNPJ de quem recebe vem do recolhimento
 * (exigido pela tela); o CO, da ficha do pagamento que reteve, pelas alocações do recolhimento.
 */
describe("V24 — o beneficiário e o CO da despesa extra", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await semearSagresPoc(prisma, { criadoPor: POR });
  }, 120000);

  const D = (mes: number, dia: number): Date => new Date(Date.UTC(2026, mes - 1, dia, 12, 0, 0));
  const R_DISP = roteiroDispendioExtra({ consignacaoAPagar: "2.1.8.8.1.02.00", disponibilidade: "1.1.1.1.1.19.00" });

  async function coNaFicha(fichaId: string, codigo: string): Promise<void> {
    const co = await prisma.codigoAcompanhamento.upsert({ where: { codigo }, update: {}, create: { codigo, descricao: `CO ${codigo} (fixture)` } });
    await prisma.fichaOrcamentaria.update({ where: { id: fichaId }, data: { coId: co.id } });
  }
  async function retencaoDoPag3(): Promise<{ tipoIss: string; fonte: string; ingresso: string }> {
    const tipoIss = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "ISS" }, select: { id: true } });
    const fonte = await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "DISPENDIO" }, select: { fonteId: true } });
    const ingresso = await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "INGRESSO", pagamento: { numero: "3" } }, select: { id: true } });
    return { tipoIss: tipoIss.id, fonte: fonte.fonteId!, ingresso: ingresso.id };
  }

  it("o recolhimento com o CNPJ de quem recebe e composto da retenção do pagamento 3: 31-44 é o CNPJ, 603-606 o CO da ficha", async () => {
    await coNaFicha("ficha-poc", "1001");
    const r = await retencaoDoPag3();
    await registrarDispendioExtra(prisma, { tipoConsignacaoId: r.tipoIss, credorConsignatario: "Municipio de Campina Grande", contaBancaria: "CC-POC-A", fonteId: r.fonte, valor: "150.00", data: D(9, 25), historico: "Recolhimento de ISS com beneficiario", criadoPor: POR, documentoDoFavorecido: "08.993.917/0001-46", alocacoes: [{ ingressoId: r.ingresso, valor: "150.00" }] } as never, R_DISP);
    const arq = await gerarDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: new Date(Date.UTC(2026, 8, 25)) });
    const linha = arq.conteudo.toString("utf8").replace(/\r\n$/, "");
    expect(linha).toHaveLength(637);
    expect(linha.slice(30, 44)).toBe("08993917000146"); // 31-44 cpfCnpjFornecedor (beneficiário)
    expect(linha.slice(602, 606)).toBe("1001"); //         603-606 co da ficha que pagou
    // O recolhimento antigo (20/09, sem documento nem alocação) continua com zeros — gap nomeado, não inventado.
    const antigo = (await gerarDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: new Date(Date.UTC(2026, 8, 20)) })).conteudo.toString("utf8");
    expect(antigo.slice(30, 44)).toBe("00000000000000");
  });

  it("CNPJ do beneficiário com dígito errado é recusado na entrada — nada é gravado", async () => {
    const r = await retencaoDoPag3();
    const antes = await prisma.movimentoExtraorcamentario.count();
    await expect(registrarDispendioExtra(prisma, { tipoConsignacaoId: r.tipoIss, credorConsignatario: "Municipio de Campina Grande", contaBancaria: "CC-POC-A", fonteId: r.fonte, valor: "10.00", data: D(9, 25), historico: "Recolhimento", criadoPor: POR, documentoDoFavorecido: "08993917000100", alocacoes: [{ ingressoId: r.ingresso, valor: "10.00" }] } as never, R_DISP)).rejects.toThrow(/de quem recebe o recolhimento .* não é válido/);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(antes);
  });

  it("retenções de fichas com CO DIFERENTE num recolhimento só: o arquivo recusa nomeando os dois (N=2); de mesmo CO, sai", async () => {
    await coNaFicha("ficha-poc", "1001");
    const r = await retencaoDoPag3();
    // A segunda retenção vem de OUTRA ficha (CO 2002), por empenho, liquidação e pagamento reais.
    const base = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: "ficha-poc" } });
    const sub = await prisma.empenho.findFirstOrThrow({ where: { numero: "3" }, select: { subelementoId: true, credorCpfCnpj: true } });
    // Outra AÇÃO: a classificação da ficha é única por exercício, e a segunda ficha precisa de outra.
    const acao2 = await prisma.acao.create({ data: { id: "aca-v24", codigo: "2999", descricao: "Acao da segunda ficha (fixture V24)", tipo: "ATIVIDADE" } });
    await prisma.$transaction(async (tx) => {
      await tx.fichaOrcamentaria.create({ data: { id: "ficha-poc-2", exercicio: 2026, numero: 9002, orgaoId: base.orgaoId, unidadeOrcId: base.unidadeOrcId, funcaoId: base.funcaoId, subfuncaoId: base.subfuncaoId, programaId: base.programaId, acaoId: acao2.id, naturezaDespesaId: base.naturezaDespesaId, fonteId: base.fonteId, exercicioFonte: 1, valorDotado: "5000.00" } });
      await registrarMovimentoDotacao(tx, { fichaId: "ficha-poc-2", tipo: "DOTACAO_INICIAL", valor: "5000.00", origemTipo: "LOA", origemId: "ficha-poc-2", criadoPor: POR, data: D(1, 1), historico: "Dotacao da segunda ficha (fixture V24)" });
      await recalcularCache(tx, "ficha-poc-2");
    });
    await coNaFicha("ficha-poc-2", "2002");
    const deps = criarM05DepsComAlmoxarifado(prisma);
    const R_EMP = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
    const R_LIQ = roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.01.01", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });
    const R_PAG = roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.01.01", disponibilidade: "1.1.1.1.1.19.00", creditoLiquidado: "6.2.2.1.3.03.00", creditoPago: "6.2.2.1.3.04.00" });
    const e = await empenhar({ fichaId: "ficha-poc-2", numero: "9", tipo: "ORDINARIO", valor: "1000.00", data: D(9, 15), credorCpfCnpj: sub.credorCpfCnpj, historico: "Empenho da segunda ficha", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", subelementoId: sub.subelementoId!, criadoPor: POR }, R_EMP, deps);
    const l = await liquidar({ empenhoId: e.empenhoId, numero: "9", valor: "1000.00", data: D(9, 16), responsavelAtesto: "Ordenador POC", historico: "Liquidacao da segunda ficha", criadoPor: POR }, R_LIQ, deps);
    const pg = await pagar({ liquidacaoId: l.liquidacaoId, numero: "9", valor: "1000.00", data: D(9, 17), contaBancaria: "CC-POC-A", fonteId: r.fonte, historico: "Pagamento da segunda ficha com ISS", criadoPor: POR }, R_PAG, deps, { contaDisponibilidade: "1.1.1.1.1.19.00", retencoes: [{ tipoConsignacaoId: r.tipoIss, credorConsignatario: "Municipio de Campina Grande", valor: "50.00", contaConsignacaoAPagar: "2.1.8.8.1.02.00" }] });
    const ingresso2 = await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { pagamentoId: pg.pagamentoId, tipo: "INGRESSO" }, select: { id: true } });

    await registrarDispendioExtra(prisma, { tipoConsignacaoId: r.tipoIss, credorConsignatario: "Municipio de Campina Grande", contaBancaria: "CC-POC-A", fonteId: r.fonte, valor: "80.00", data: D(9, 26), historico: "Recolhimento de duas fichas", criadoPor: POR, documentoDoFavorecido: "08993917000146", alocacoes: [{ ingressoId: r.ingresso, valor: "30.00" }, { ingressoId: ingresso2.id, valor: "50.00" }] } as never, R_DISP);
    await expect(gerarDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: new Date(Date.UTC(2026, 8, 26)) })).rejects.toThrow(/CO diferente \((1001, 2002|2002, 1001)\)/);

    // Com o mesmo CO nas duas fichas, a mesma composição sai com ele.
    await coNaFicha("ficha-poc-2", "1001");
    const ok = (await gerarDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: new Date(Date.UTC(2026, 8, 26)) })).conteudo.toString("utf8");
    expect(ok.slice(602, 606)).toBe("1001");
  }, 120000);
});
