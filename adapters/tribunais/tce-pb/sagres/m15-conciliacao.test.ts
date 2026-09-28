import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../../../test/banco.js";
import { limparBanco } from "../../../../test/limpar-banco.js";
import { toMoney } from "../../../../packages/contracts/index.js";
import { serializarRegistro } from "./registry.js";
import { gerarConciliacaoBancariaOuRecusa, lerFatosConciliacaoBancaria } from "./gerador.js";
import {
  LAYOUT_CONCILIACAO_BANCARIA,
  tipoConciliacaoDe,
  type ConciliacaoBancariaFato,
} from "./layout-2026v11.js";

/**
 * V21 — SAGRES ConciliacaoBancaria (§4.27).
 *
 * ⚠️ O REGISTRO NÃO É A LISTA DE VÍNCULOS. É o saldo do extrato (§5.15 tipo 1) e as PENDÊNCIAS que
 * explicam a diferença até o saldo contábil (tipos 2 a 5). A tabela do §5.15 está transcrita À MÃO
 * abaixo, e o mapeamento do gerador é conferido contra ela — não contra ele mesmo.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

/** §5.15 TipoConciliacao, transcrito do leiaute oficial 2026 v1.1. */
const TABELA_5_15: Readonly<Record<string, string>> = {
  "1": "Saldo conforme extrato bancário (neutro)",
  "2": "Entrada não considerada pelo banco (positiva)",
  "3": "Saída não considerada pela contabilidade (positiva)",
  "4": "Entrada não considerada pela contabilidade (negativa)",
  "5": "Saída não considerada pelo banco (negativa)",
};

describe("§5.15 — o tipo pelo LADO e pelo SENTIDO da pendência", () => {
  it("cada combinação cai no código cuja descrição oficial diz exatamente aquilo", () => {
    // O banco registrou e a contabilidade não:
    expect(TABELA_5_15[tipoConciliacaoDe("EXTRATO", toMoney("600.00"))]).toBe("Entrada não considerada pela contabilidade (negativa)");
    expect(TABELA_5_15[tipoConciliacaoDe("EXTRATO", toMoney("-35.00"))]).toBe("Saída não considerada pela contabilidade (positiva)");
    // A contabilidade registrou e o banco não:
    expect(TABELA_5_15[tipoConciliacaoDe("RAZAO", toMoney("400.00"))]).toBe("Entrada não considerada pelo banco (positiva)");
    expect(TABELA_5_15[tipoConciliacaoDe("RAZAO", toMoney("-1200.00"))]).toBe("Saída não considerada pelo banco (negativa)");
  });
});

describe("golden byte a byte — ConciliacaoBancaria (§4.27, 243)", () => {
  it("monta as treze colunas nas posições do leiaute", () => {
    const fato: ConciliacaoBancariaFato = {
      codUnidadeGestora: "999001",
      numeroConta: "987650",
      numeroAgencia: "12345",
      banco: "001",
      numero: 2,
      tipoConciliacao: "3",
      descricao: "TARIFA BANCARIA",
      data: new Date(Date.UTC(2026, 0, 15)),
      valor: toMoney("35.00"),
      tipoContaBancaria: "1",
      cnpjGerencia: "00000000000191",
    };
    const esperado = [
      "999001", //                      codUnidadeGestora 1-6
      "987650".padEnd(13, " "), //      numContaBancaria  7-19
      "12345".padEnd(6, " "), //        numAgencia        20-25
      "001", //                         codBanco          26-28
      "00000002", //                    numero            29-36
      "3", //                           tipoConciliacao   37
      "TARIFA BANCARIA".padEnd(150, " "), // descricao    38-187
      "15012026", //                    data              188-195
      "000000", //                      numCheque         196-201
      " ".repeat(11), //                numDocDebito      202-212
      "0000000000035,00", //            valor             213-228
      "1", //                           tipoContaBancaria 229
      "00000000000191", //              cnpjGerencia      230-243
    ].join("");
    const linha = serializarRegistro(LAYOUT_CONCILIACAO_BANCARIA, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(243);
  });
});

describe("gerador × banco — o saldo do extrato e as pendências do fim do mês", () => {
  const CONTA = "cb-sagres";

  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.contaPcasp.create({
      data: { id: "c-caixa", codigo: "1.1.1.1.1.06.01", nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "F" },
    });
    await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
    await prisma.contaBancaria.create({
      data: {
        id: CONTA, codigo: "CC-SAGRES", descricao: "Movimento", fonteId: "fnt-500", contaContabilId: "c-caixa",
        banco: "001", agencia: "1234", digitoAgencia: "5", conta: "98765", digitoConta: "0",
      },
    });
    const extrato = await prisma.extratoBancario.create({
      data: {
        contaBancariaId: CONTA, arquivoHash: "h-1", importadoPor: "teste",
        periodoInicio: new Date("2026-01-01T12:00:00Z"), periodoFim: new Date("2026-01-31T12:00:00Z"),
      },
    });
    // Duas linhas que a contabilidade não registrou (N=2, sentidos opostos) e uma de FEVEREIRO, que
    // o corte de janeiro não pode enxergar.
    const linhas = [
      { fitid: "F1", dia: "2026-01-10", natureza: "CREDITO" as const, valor: "600.00", memo: "CREDITO NAO IDENTIFICADO" },
      { fitid: "F2", dia: "2026-01-15", natureza: "DEBITO" as const, valor: "35.00", memo: "TARIFA BANCARIA" },
      { fitid: "F3", dia: "2026-02-03", natureza: "DEBITO" as const, valor: "999.00", memo: "FORA DO CORTE" },
    ];
    for (const l of linhas) {
      await prisma.lancamentoExtrato.create({
        data: {
          extratoId: extrato.id, contaBancariaId: CONTA, fitid: l.fitid, dataPostagem: new Date(`${l.dia}T12:00:00Z`),
          valor: l.valor, natureza: l.natureza, memo: l.memo, linhaHash: `h-${l.fitid}`,
        },
      });
    }
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("uma linha do saldo (tipo 1) e uma por pendência, numeradas, com o sentido no tipo", async () => {
    const fatos = await lerFatosConciliacaoBancaria(prisma, {
      codUnidadeGestora: "999001", cnpjGerenciadora: "00000000000191", competencia: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(fatos.map((f) => [f.numero, f.tipoConciliacao, f.valor.toFixed(2), f.descricao])).toEqual([
      [1, "1", "565.00", "Saldo conforme extrato bancario"],
      [2, "4", "600.00", "[CREDITO] CREDITO NAO IDENTIFICADO (FITID F1)"],
      [3, "3", "35.00", "[DEBITO] TARIFA BANCARIA (FITID F2)"],
    ]);
    expect(fatos.every((f) => f.numeroConta === "987650" && f.numeroAgencia === "12345" && f.banco === "001")).toBe(true);
  });

  it("conta que não fecha: o arquivo sai FORA do pacote com a recusa nomeada — nunca com linha inventada", async () => {
    // Um lançamento de caixa que nenhum fato explica quebra a identidade da conciliação.
    await prisma.contaPcasp.create({ data: { id: "c-vpa", codigo: "4.9.9.9.1.01.00", nome: "Outras VPA", naturezaSaldo: "CREDORA", nivel: 7, analitica: true } });
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "INTRUSO-1", dataTransacao: new Date("2026-01-20T12:00:00Z"), historico: "sem fato", origemTipo: "INTRUSO", criadoPor: "teste",
        partidas: {
          create: [
            { contaId: "c-caixa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "100.00" },
            { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "100.00" },
          ],
        },
      },
    });
    const r = await gerarConciliacaoBancariaOuRecusa(prisma, {
      codUnidadeGestora: "999001", cnpjGerenciadora: "00000000000191", competencia: new Date(Date.UTC(2026, 0, 1)),
    });
    expect("recusa" in r && /N[ÃA]O FECHA .*CC-SAGRES/.test(r.recusa)).toBe(true);
  });
});
