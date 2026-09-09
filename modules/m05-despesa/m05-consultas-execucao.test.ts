import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import {
  dadosDasLiquidacoes,
  listarEmpenhos,
  listarLiquidacoes,
} from "./consultas.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "./dominio.js";
import { anularEmpenho, empenhar } from "./servico.js";
import { liquidar, pagar, statusDeEmpenho } from "./servico-bloco2.js";
import { anularEmpenhoParcial } from "./anulacao-parcial.js";
import { criarM05Deps } from "./adapter-prisma.js";
import type { M05Deps } from "./ports.js";

/**
 * AS LEITURAS DA EXECUÇÃO (TR 5.17) — o que a UI da 7.1 mostra.
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O CENÁRIO (uma ficha, três empenhos) ═══
 *   NE-1  empenha 10.000 → liquida 6.000 → paga 2.500
 *   NE-2  empenha  8.000 → anulação PARCIAL de 3.000
 *   NE-3  empenha  2.000 → anulação TOTAL
 *
 * ═══ t1 — OS SALDOS DE CADA EMPENHO ═══
 *   NE-1: empenhado 10.000 · liquidado 6.000 · pago 2.500
 *         a liquidar = 10.000 − 6.000 = 4.000,00
 *         a pagar    =  6.000 − 2.500 = 3.500,00
 *         anulações  = 0,00 · status PARCIAL_PAGO (pagou algo, não tudo)
 *   NE-2: empenhado LÍQUIDO = 8.000 − 3.000 = 5.000,00 (a parcial REDUZ, não zera)
 *         anulações = 3.000,00 · a liquidar = 5.000,00 · status EMPENHADO
 *   NE-3: empenhado LÍQUIDO = 0,00 (a total NEGA o fato) · anulações = 2.000,00
 *         status ANULADO
 *
 * ═══ t2 — A LISTA SÓ TEM ORIGINAIS ═══
 * O banco tem 5 linhas de `Empenho` (3 originais + 1 parcial + 1 estorno). A lista tem
 * 3. As anulações ENTRAM na aritmética e FICAM FORA da lista: elas não são despesa, são
 * a negação (ou a redução) de uma. Uma lista com 5 linhas mostraria o mesmo empenho duas
 * vezes e somaria dinheiro que não existe.
 *
 * ═══ t3 — A TELA E O SERVIÇO NÃO PODEM DISCORDAR ═══
 * O `status` da lista tem de ser IDÊNTICO ao de `statusDeEmpenho()` (o serviço), empenho
 * a empenho. São dois caminhos até o mesmo fato; se divergirem, o usuário acredita no que
 * está na frente dele — e o que está na frente dele é a tela.
 *
 * ═══ t4 — A ORIGEM DA LIQUIDAÇÃO, E O QUE A FILA NÃO SABE ═══
 * `listarLiquidacoes` traz o empenho de origem e o credor. `dadosDasLiquidacoes` é o que
 * a fila do art. 141 (M06) NÃO carrega: a `LiquidacaoNaFila` é magra de propósito (a ordem
 * não depende de quem recebe), então o painel pergunta ao dono do dado.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "despesa@cg.pb.gov.br";
const FICHA = "ficha-exec";
const FONTE = "fnt-500";
const CREDOR = "12345678000199";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR,
  disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO,
  creditoPago: C_PAGO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });

  await criarFichaDeTeste(prisma, {
    id: FICHA, numero: 1, exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "500000.00",
  });
}

async function empenhaDe(valor: string, n: string): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: `NE-${n}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
      historico: `empenho ${n}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  return e.empenhoId;
}

const RECORTE = { exercicio: 2026 } as const;

describe("M05 — as leituras da execução (TR 5.17)", () => {
  beforeEach(async () => {
    await semear();
  });

  it("t1: os saldos de cada empenho — anulação parcial REDUZ, total ZERA", async () => {
    const ne1 = await empenhaDe("10000.00", "1");
    const l1 = await liquidar(
      {
        empenhoId: ne1, numero: "NL-1", valor: "6000.00",
        data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    await pagar(
      {
        liquidacaoId: l1.liquidacaoId, numero: "NP-1", valor: "2500.00",
        data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );

    const ne2 = await empenhaDe("8000.00", "2");
    await anularEmpenhoParcial(
      {
        originalId: ne2, numero: "NEA-2", valor: "3000.00",
        data: new Date("2026-05-01T12:00:00Z"),
        motivo: "redução do objeto contratado por acordo entre as partes",
        criadoPor: POR,
      },
      deps
    );

    const ne3 = await empenhaDe("2000.00", "3");
    await anularEmpenho(
      {
        empenhoId: ne3, numero: "NEA-3", data: new Date("2026-05-02T12:00:00Z"),
        historico: "anulação total", criadoPor: POR,
      },
      deps
    );

    const lista = await listarEmpenhos(prisma, RECORTE);
    const por = (numero: string) => lista.find((e) => e.numero === numero)!;

    const a = por("NE-1");
    expect(a.empenhadoLiquido.toFixed(2)).toBe("10000.00");
    expect(a.liquidado.toFixed(2)).toBe("6000.00");
    expect(a.pago.toFixed(2)).toBe("2500.00");
    expect(a.saldoALiquidar.toFixed(2)).toBe("4000.00");
    expect(a.saldoAPagar.toFixed(2)).toBe("3500.00");
    expect(a.anulacoes.toFixed(2)).toBe("0.00");
    expect(a.status).toBe("PARCIAL_PAGO");
    expect(a.anulado).toBe(false);
    // O recorte também descreve a origem — é o que a tela mostra ao lado do valor.
    expect(a.unidadeCodigo).toBe("01001");
    expect(a.fonteCodigo).toBe("500");
    expect(a.fichaNumero).toBe(1);

    // ⚠️ A PARCIAL REDUZ: 8.000 − 3.000 = 5.000. Se ela fosse tratada como estorno, a
    // resposta seria 0,00 — e o empenho inteiro sumiria do saldo por um corte de 3.000.
    const b = por("NE-2");
    expect(b.empenhadoLiquido.toFixed(2)).toBe("5000.00");
    expect(b.anulacoes.toFixed(2)).toBe("3000.00");
    expect(b.saldoALiquidar.toFixed(2)).toBe("5000.00");
    expect(b.status).toBe("EMPENHADO");
    expect(b.anulado).toBe(false);

    // A TOTAL nega o fato inteiro.
    const c = por("NE-3");
    expect(c.empenhadoLiquido.toFixed(2)).toBe("0.00");
    expect(c.anulacoes.toFixed(2)).toBe("2000.00");
    expect(c.anulado).toBe(true);
    expect(c.status).toBe("ANULADO");
  });

  it("t2: a lista traz só os ORIGINAIS — as anulações somam, mas não viram linha", async () => {
    const ne = await empenhaDe("8000.00", "1");
    await anularEmpenhoParcial(
      {
        originalId: ne, numero: "NEA-1", valor: "3000.00",
        data: new Date("2026-05-01T12:00:00Z"),
        motivo: "redução do objeto contratado por acordo entre as partes",
        criadoPor: POR,
      },
      deps
    );
    const ne2 = await empenhaDe("2000.00", "2");
    await anularEmpenho(
      {
        empenhoId: ne2, numero: "NEA-2", data: new Date("2026-05-02T12:00:00Z"),
        historico: "anulação total", criadoPor: POR,
      },
      deps
    );

    // 4 linhas no banco: 2 originais + 1 parcial + 1 estorno.
    expect(await prisma.empenho.count()).toBe(4);
    const lista = await listarEmpenhos(prisma, RECORTE);
    expect(lista.length).toBe(2);
    expect(lista.map((e) => e.numero).sort()).toEqual(["NE-1", "NE-2"]);
  });

  it("t3: o status da LISTA é o mesmo do SERVIÇO — empenho a empenho", async () => {
    const ne1 = await empenhaDe("10000.00", "1");
    await liquidar(
      {
        empenhoId: ne1, numero: "NL-1", valor: "10000.00",
        data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação total", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    const ne2 = await empenhaDe("4000.00", "2");

    const lista = await listarEmpenhos(prisma, RECORTE);
    for (const e of lista) {
      expect(e.status).toBe(await statusDeEmpenho(e.id, deps));
    }
    expect(lista.find((e) => e.numero === "NE-1")!.status).toBe("LIQUIDADO");
    expect(lista.find((e) => e.numero === "NE-2")!.status).toBe("EMPENHADO");
    expect(ne2).toBeTruthy();
  });

  it("t4: a liquidação carrega o empenho de origem; e o credor que a FILA não sabe", async () => {
    const ne = await empenhaDe("10000.00", "1");
    const l = await liquidar(
      {
        empenhoId: ne, numero: "NL-1", valor: "6000.00",
        data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano de Tal",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    await pagar(
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "2500.00",
        data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );

    const lista = await listarLiquidacoes(prisma, RECORTE);
    expect(lista.length).toBe(1);
    const [ql] = lista;
    expect(ql!.empenhoNumero).toBe("NE-1");
    expect(ql!.credorCpfCnpj).toBe(CREDOR);
    expect(ql!.responsavelAtesto).toBe("Fulano de Tal");
    expect(ql!.liquidadoLiquido.toFixed(2)).toBe("6000.00");
    expect(ql!.pago.toFixed(2)).toBe("2500.00");
    // É este saldo que a fila do art. 141 ordena.
    expect(ql!.saldoAPagar.toFixed(2)).toBe("3500.00");
    expect(ql!.fonteCodigo).toBe("500");

    // O enriquecimento do painel da fila: credor e empenho vêm do M05, não do M06.
    const dados = await dadosDasLiquidacoes(prisma, [l.liquidacaoId]);
    const d = dados.get(l.liquidacaoId)!;
    expect(d.empenhoNumero).toBe("NE-1");
    expect(d.credorCpfCnpj).toBe(CREDOR);
    expect(d.valorLiquidado.toFixed(2)).toBe("6000.00");
    expect(d.historico).toBe("empenho 1");
  });

  it("t5: o recorte por UNIDADE filtra — e uma unidade sem ficha devolve vazio", async () => {
    await empenhaDe("1000.00", "1");

    expect(
      (await listarEmpenhos(prisma, { exercicio: 2026, unidadeCodigo: "01001" }))
        .length
    ).toBe(1);
    // Unidade que não tem ficha: lista vazia, não erro. A tela mostra o EstadoVazio.
    expect(
      (await listarEmpenhos(prisma, { exercicio: 2026, unidadeCodigo: "09999" }))
        .length
    ).toBe(0);
    // Exercício sem execução: idem.
    expect((await listarEmpenhos(prisma, { exercicio: 2025 })).length).toBe(0);
  });
});
