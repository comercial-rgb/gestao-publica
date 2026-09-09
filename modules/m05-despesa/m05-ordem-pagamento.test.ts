import "dotenv/config";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "./adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  type RoteiroContabil,
} from "./dominio.js";
import { empenhar } from "./servico.js";
import { liquidar, pagar, anularPagamento } from "./servico-bloco2.js";
import {
  autorizarOrdemDePagamento,
  cancelarOrdemDePagamento,
  estadoDaOrdem,
  prepararOrdemDePagamento,
} from "./ordem-pagamento.js";
import type { M05Deps } from "./ports.js";

/**
 * T07 — A ORDEM DE PAGAMENTO: preparar, autorizar, pagar.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 * Que as etapas são SEPARADAS de verdade, e não rótulos na tela:
 *   · preparar e autorizar são ações distintas, e a MESMA pessoa não faz as duas;
 *   · pagar contra ordem não autorizada, cancelada, de outra liquidação ou de outro
 *     valor é recusado pelo CASO DE USO, dentro da transação;
 *   · uma autorização paga UMA vez — a segunda é recusada.
 *
 * ⚠️ E QUE O CAMINHO SEM ORDEM CONTINUA INTACTO. A opcionalidade é decisão declarada:
 * tornar a ordem obrigatória quebraria todo pagamento anterior a ela existir e obrigaria
 * a inventar autorização retroativa. Um ente que queira exigi-la nega a ação `PAGAR` a
 * quem não a tiver.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const CAIXA = "1.1.1.1.2.00.00";
/** ⚠️ DUAS IDENTIDADES — é o teste da segregação, e ele não existe com uma só. */
const PREPARADOR = "m05@cg.pb.gov.br";
const ORDENADOR = "m05b@cg.pb.gov.br";
const FICHA = "ficha-ordem";

const CONTAS = [
  { id: "o-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "o-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "o-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "o-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "o-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD - Serviços", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "o-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores a Pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "o-banco", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_LIQUIDACAO: RoteiroContabil = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00",
});
const R_PAGAMENTO: RoteiroContabil = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: CAIXA,
  creditoLiquidado: "6.2.2.1.3.03.00", creditoPago: "6.2.2.1.3.04.00",
});

let deps: M05Deps;
let liquidacaoId: string;
let fonteDoTeste: string;
let contaDoTeste: string;
let n = 0;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "o-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "o-uo", codigo: "01001", descricao: "Administração", orgaoId: "o-org" },
  });
  await prisma.funcao.create({ data: { id: "o-fun", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "o-sub", codigo: "122", nome: "Administração Geral" } });
  await prisma.programa.create({ data: { id: "o-prg", codigo: "0001", descricao: "Gestão" } });
  await prisma.acao.create({ data: { id: "o-aca", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "o-nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  // Uma conta de OUTRA fonte — para o guard da TR 5.23 ter o que recusar.
  await prisma.fonteRecurso.create({
    data: { id: "fnt-outra", codigo: "600", descricao: "Vinculada", codigoTce: "600" },
  });
  await prisma.contaBancaria.create({
    data: { id: "o-cb2", codigo: "CC-OUTRA", descricao: "Vinculada", fonteId: "fnt-outra" },
  });
  deps = criarM05Deps(prisma);
}

/**
 * Empenha e liquida 1.000 numa FONTE PRÓPRIA. Devolve a liquidação.
 *
 * ⚠️ FONTE POR TESTE, e não é zelo: a fila do art. 141 é por (fonte, categoria).
 * Compartilhando a fonte, a liquidação de cada teste entra atrás das que os testes
 * anteriores deixaram sem pagar, e o pagamento passa a ser recusado por QUEBRA DE ORDEM
 * — não pelo motivo que o teste queria medir. Foi o que aconteceu na primeira execução
 * deste arquivo: cinco testes falharam pelo art. 141.
 */
async function novaLiquidacao(): Promise<string> {
  n += 1;
  const suf = String(n).padStart(3, "0");
  fonteDoTeste = `fnt-ordem-${suf}`;
  contaDoTeste = `CC-ORD-${suf}`;
  await prisma.fonteRecurso.create({
    data: { id: fonteDoTeste, codigo: String(500 + n), descricao: `Fonte ${suf}`, codigoTce: String(500 + n) },
  });
  await prisma.contaBancaria.create({
    data: { id: `o-cb-${suf}`, codigo: contaDoTeste, descricao: "Movimento", fonteId: fonteDoTeste },
  });
  const fichaId = `${FICHA}-${suf}`;
  await criarFichaDeTeste(prisma, {
    id: fichaId, exercicio: 2026, numero: 100 + n,
    orgaoId: "o-org", unidadeOrcId: "o-uo", funcaoId: "o-fun", subfuncaoId: "o-sub",
    programaId: "o-prg", acaoId: "o-aca", naturezaDespesaId: "o-nd", fonteId: fonteDoTeste,
    valorDotado: "100000.00",
  });

  const e = await empenhar(
    {
      fichaId, numero: `2026NE${suf}`, tipo: "ORDINARIO", valor: "1000.00",
      data: new Date("2026-04-10T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho da ordem", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: PREPARADOR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `2026NL${suf}`, valor: "1000.00",
      data: new Date("2026-05-01T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação da ordem", criadoPor: PREPARADOR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

/** Prepara uma ordem sobre a liquidação corrente. */
async function preparar(valor = "1000.00", numero = `OP-${n}`): Promise<string> {
  const r = await prepararOrdemDePagamento(prisma, {
    liquidacaoId, numero, valor,
    dataPrevista: new Date("2026-06-01T12:00:00Z"),
    contaBancaria: contaDoTeste, fonteId: fonteDoTeste,
    historico: "ordem preparada pelo setor", criadoPor: PREPARADOR,
  });
  return r.ordemId;
}

async function estadoDe(ordemId: string) {
  const o = await prisma.ordemDePagamento.findUniqueOrThrow({
    where: { id: ordemId },
    select: {
      movimentos: { select: { tipo: true, criadoEm: true } },
      pagamentos: { select: { id: true } },
    },
  });
  return estadoDaOrdem(o.movimentos, o.pagamentos.length > 0);
}

function pagamentoDe(ordemId: string | undefined, valor = "1000.00") {
  return {
    liquidacaoId, numero: `2026OP-${n}`, valor,
    data: new Date("2026-06-01T12:00:00Z"), contaBancaria: contaDoTeste, fonteId: fonteDoTeste,
    historico: "pagamento contra ordem", criadoPor: ORDENADOR,
    ...(ordemId !== undefined ? { ordemDePagamentoId: ordemId } : {}),
  };
}

beforeAll(semear);
beforeEach(async () => {
  liquidacaoId = await novaLiquidacao();
});

describe("T07 — o estado da ordem é DERIVADO, nunca coluna", () => {
  it("sem movimento é PREPARADA; o último movimento manda; paga vence tudo", () => {
    const t0 = new Date("2026-06-01T10:00:00Z");
    const t1 = new Date("2026-06-01T11:00:00Z");

    expect(estadoDaOrdem([], false)).toBe("PREPARADA");
    expect(estadoDaOrdem([{ tipo: "AUTORIZACAO", criadoEm: t0 }], false)).toBe("AUTORIZADA");
    expect(
      estadoDaOrdem(
        [{ tipo: "AUTORIZACAO", criadoEm: t0 }, { tipo: "CANCELAMENTO", criadoEm: t1 }],
        false
      )
    ).toBe("CANCELADA");
    // Append-only: cancelar e autorizar de novo é possível, e a leitura é a do FIM da fila.
    expect(
      estadoDaOrdem(
        [{ tipo: "CANCELAMENTO", criadoEm: t0 }, { tipo: "AUTORIZACAO", criadoEm: t1 }],
        false
      )
    ).toBe("AUTORIZADA");
    // PAGA vence: cancelar o papel não desfaz o desembolso.
    expect(
      estadoDaOrdem([{ tipo: "AUTORIZACAO", criadoEm: t0 }], true)
    ).toBe("PAGA");
  });
});

describe("T07 — preparar e autorizar são atos de pessoas diferentes", () => {
  it("preparar cria a ordem em PREPARADA, e ela não autoriza nada", async () => {
    const id = await preparar();
    expect(await estadoDe(id)).toBe("PREPARADA");
    // ⚠️ A ORDEM NÃO TOCA O RAZÃO. Autorizar não é fato patrimonial.
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "ORDEM_PAGAMENTO" } })
    ).toBe(0);
  });

  it("QUEM PREPAROU NÃO AUTORIZA — e a recusa é do domínio, não da tela", async () => {
    const id = await preparar();
    await expect(
      autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: PREPARADOR })
    ).rejects.toThrow(/SEGREGAÇÃO DE FUNÇÕES/);
    expect(await estadoDe(id)).toBe("PREPARADA");
  });

  it("outra pessoa autoriza, e a ordem passa a AUTORIZADA", async () => {
    const id = await preparar();
    await autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR });
    expect(await estadoDe(id)).toBe("AUTORIZADA");
  });

  it("autorizar duas vezes é recusado — só se autoriza o que está PREPARADO", async () => {
    const id = await preparar();
    await autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR });
    await expect(
      autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR })
    ).rejects.toThrow(/estado AUTORIZADA/);
  });

  it("cancelar EXIGE motivo — e o motivo fica, com autor e instante", async () => {
    const id = await preparar();
    await expect(
      cancelarOrdemDePagamento(prisma, { ordemId: id, motivo: "erro", criadoPor: ORDENADOR })
    ).rejects.toThrow();

    await cancelarOrdemDePagamento(prisma, {
      ordemId: id, motivo: "credor apresentou certidão vencida", criadoPor: ORDENADOR,
    });
    expect(await estadoDe(id)).toBe("CANCELADA");

    const m = await prisma.movimentoDaOrdemDePagamento.findFirstOrThrow({
      where: { ordemId: id, tipo: "CANCELAMENTO" },
      select: { motivo: true, criadoPor: true },
    });
    expect(m.motivo).toMatch(/certidão vencida/);
    expect(m.criadoPor).toBe(ORDENADOR);
  });
});

describe("T07 — pagar contra a ordem", () => {
  it("ordem AUTORIZADA: o pagamento acontece e fica AMARRADO a ela", async () => {
    const id = await preparar();
    await autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR });

    const r = await pagar(pagamentoDe(id), R_PAGAMENTO, deps);
    const pago = await prisma.pagamento.findUniqueOrThrow({
      where: { id: r.pagamentoId },
      select: { ordemDePagamentoId: true },
    });
    expect(pago.ordemDePagamentoId).toBe(id);
    expect(await estadoDe(id)).toBe("PAGA");
  });

  it("ordem apenas PREPARADA: recusa — não se paga o que ninguém autorizou", async () => {
    const id = await preparar();
    await expect(pagar(pagamentoDe(id), R_PAGAMENTO, deps)).rejects.toThrow(
      /estado PREPARADA/
    );
    expect(await prisma.pagamento.count({ where: { liquidacaoId } })).toBe(0);
  });

  it("ordem CANCELADA: recusa", async () => {
    const id = await preparar();
    await autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR });
    await cancelarOrdemDePagamento(prisma, {
      ordemId: id, motivo: "pagamento suspenso por determinação do controle interno",
      criadoPor: ORDENADOR,
    });
    await expect(pagar(pagamentoDe(id), R_PAGAMENTO, deps)).rejects.toThrow(
      /estado CANCELADA/
    );
  });

  it("valor diferente do autorizado: recusa — pagar menos deixa o resto sem autorização", async () => {
    const id = await preparar("1000.00");
    await autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR });
    await expect(
      pagar(pagamentoDe(id, "600.00"), R_PAGAMENTO, deps)
    ).rejects.toThrow(/tem de ser exatamente o autorizado/);
  });

  it("ordem de OUTRA liquidação: recusa — autorização não é transferível", async () => {
    const daOutra = await preparar();
    await autorizarOrdemDePagamento(prisma, { ordemId: daOutra, criadoPor: ORDENADOR });

    // Uma liquidação nova, e o pagamento dela tentando usar a ordem da anterior.
    const anterior = liquidacaoId;
    liquidacaoId = await novaLiquidacao();
    await expect(pagar(pagamentoDe(daOutra), R_PAGAMENTO, deps)).rejects.toThrow(
      /é da liquidação/
    );
    expect(anterior).not.toBe(liquidacaoId);
  });

  it("UMA autorização, UM desembolso: a segunda tentativa é recusada", async () => {
    // ⚠️ SEM ISTO, a mesma assinatura lastrearia dois pagamentos — e os dois pareceriam
    // regulares. O primeiro consome a ordem; o segundo encontra o estado PAGA.
    const id = await preparar();
    await autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR });
    await pagar(pagamentoDe(id), R_PAGAMENTO, deps);

    await expect(
      pagar({ ...pagamentoDe(id), numero: "2026OP-DUPLO" }, R_PAGAMENTO, deps)
    ).rejects.toThrow(/estado PAGA/);
  });

  it("ordem PAGA não se cancela — o papel não desfaz o desembolso", async () => {
    const id = await preparar();
    await autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR });
    await pagar(pagamentoDe(id), R_PAGAMENTO, deps);

    await expect(
      cancelarOrdemDePagamento(prisma, {
        ordemId: id, motivo: "tentativa de cancelar ordem já paga", criadoPor: ORDENADOR,
      })
    ).rejects.toThrow(/já PAGA/);
  });

  it("SEM ordem: o caminho de sempre continua intacto", async () => {
    const r = await pagar(pagamentoDe(undefined), R_PAGAMENTO, deps);
    const pago = await prisma.pagamento.findUniqueOrThrow({
      where: { id: r.pagamentoId },
      select: { ordemDePagamentoId: true },
    });
    expect(pago.ordemDePagamentoId).toBeNull();
  });
});

describe("T07 — o teto da ordem", () => {
  it("duas ordens não podem somar mais que o saldo a pagar", async () => {
    await preparar("700.00", "OP-A");
    await expect(preparar("400.00", "OP-B")).rejects.toThrow(/já comprometido em ordens/);
  });

  it("cancelada a primeira, a segunda cabe — o comprometido é das ordens VIVAS", async () => {
    const a = await preparar("700.00", "OP-A");
    await cancelarOrdemDePagamento(prisma, {
      ordemId: a, motivo: "substituída por ordem de outro valor", criadoPor: ORDENADOR,
    });
    const b = await preparar("400.00", "OP-B");
    expect(await estadoDe(b)).toBe("PREPARADA");
  });

  it("a fonte da ordem casa com a da conta bancária — o guard é o da TR 5.23", async () => {
    await expect(
      prepararOrdemDePagamento(prisma, {
        liquidacaoId, numero: "OP-FONTE", valor: "100.00",
        dataPrevista: new Date("2026-06-01T12:00:00Z"),
        // conta da fonte 600, ordem declarando a fonte do teste
        contaBancaria: "CC-OUTRA", fonteId: fonteDoTeste,
        historico: "ordem com fonte trocada", criadoPor: PREPARADOR,
      })
    ).rejects.toThrow(/não é a da conta bancária/);
  });

  it("anulado o pagamento, o saldo volta a caber numa ordem nova", async () => {
    const id = await preparar();
    await autorizarOrdemDePagamento(prisma, { ordemId: id, criadoPor: ORDENADOR });
    const r = await pagar(pagamentoDe(id), R_PAGAMENTO, deps);

    // Enquanto o pagamento vale, não há saldo para outra ordem.
    await expect(preparar("1000.00", "OP-DEPOIS")).rejects.toThrow(/excede o que resta/);

    await anularPagamento(
      {
        pagamentoId: r.pagamentoId, numero: "2026OP-ANUL",
        data: new Date("2026-06-15T12:00:00Z"),
        historico: "anulação para reemissão", criadoPor: ORDENADOR,
      },
      deps
    );

    // ⚠️ A ORDEM ORIGINAL CONTINUA PAGA. Ela não "volta" a ser autorizável: o que
    // renasce é o SALDO da liquidação, e ele pede uma ordem NOVA — com autorização nova.
    expect(await estadoDe(id)).toBe("PAGA");
    const nova = await preparar("1000.00", "OP-REEMISSAO");
    expect(await estadoDe(nova)).toBe("PREPARADA");
  });
});
