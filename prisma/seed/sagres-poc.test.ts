import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearSagresPoc } from "./sagres-poc.js";
import { gerarDespesaExtra, gerarDotacao, gerarEmpenhos, gerarLiquidacao, gerarMovimentacaoEntreContas, gerarPagamentos, gerarReceitaOrcamentaria, gerarRetencao, lerFatosEmpenhos } from "../../adapters/tribunais/tce-pb/sagres/index.js";
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
const CNPJ = "12345678000199"; // CNPJ fictício do ente gerenciador (POC).
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
    expect(linha.slice(30, 44)).toBe("00000000000000"); //              31-44  cpfCnpj (GAP nomeado → zeros)
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
    const imovel = dem.classes.find((c) => c.descricao.includes("Edifica"))!;
    expect(new Decimal(imovel.ingressos).toFixed(2)).toBe("220000.00");
    expect(new Decimal(imovel.atualizacoes).toFixed(2)).toBe("0.00");
    expect(new Decimal(imovel.saldoFinal).toFixed(2)).toBe("220000.00");
    // Móvel: avaliação 50k, depreciação (atualização negativa) → final < 50k.
    const movel = dem.classes.find((c) => c.descricao.includes("Veic"))!;
    expect(new Decimal(movel.ingressos).toFixed(2)).toBe("50000.00");
    expect(new Decimal(movel.atualizacoes).lessThan(0)).toBe(true); // depreciação de outubro
  });

  it("F1/F2 (banco real) — Pagamentos (14/jul, 08/ago) e ReceitaOrcamentaria (05/jul) saem da massa", async () => {
    const UG_CNPJ = { codUnidadeGestora: UG, cnpjGerenciadora: "12345678000199" };
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
