import "dotenv/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anularPagamento, liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { anularLiquidacaoParcial } from "../m05-despesa/anulacao-parcial.js";
import {
  autorizarOrdemDePagamento,
  cancelarOrdemDePagamento,
  prepararOrdemDePagamento,
} from "../m05-despesa/ordem-pagamento.js";
import { travar } from "../../packages/locks/index.js";
import { assinarNaFila } from "../m22-documentos/assinatura.js";
import {
  conteudoDoBordero,
  estadoDasAssinaturas,
  estadoDoLote,
} from "./lote.js";
import {
  criarLoteDePagamento,
  enviarBordero,
  fecharLote,
  gerarBordero,
  incluirNoLote,
  processarRetornoBancario,
  registrarRejeicaoBancaria,
} from "./servico-lote.js";
import { toMoney } from "../../packages/contracts/index.js";

/**
 * M09 — LOTE DE PAGAMENTO, BORDERÔ E RETORNO BANCÁRIO (ENT03, 2.2).
 *
 * ═══ O QUE ESTE ARQUIVO PROVA — os testes 4, 5 e 6 do lote ═══
 *   4. o lote respeita a ordem cronológica, e ele NÃO é a rota alternativa que a contorna;
 *   5. borderô sem as assinaturas exigidas não é gerado nem enviado;
 *   6. o retorno baixa SOMENTE os itens correspondentes, e o repetido não duplica.
 *
 * ═══ ⚠️ O CENÁRIO TEM DUAS LIQUIDAÇÕES DE PROPÓSITO ═══
 * Uma de 01/03 e outra de 10/03, na mesma fonte e categoria. A de 10 está ATRÁS na fila —
 * e é ela que o teste tenta incluir no lote. Sem a segunda liquidação não haveria fila, e
 * o guard da ordem cronológica passaria por vacuidade: o teste ficaria verde provando nada.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

// O borderô grava um arquivo (ele vira um Anexo de origem SISTEMA). Fora da pasta do repo.
const RAIZ_TEMPORARIA = mkdtempSync(join(tmpdir(), "bordero-teste-"));
beforeAll(() => {
  process.env["ANEXOS_DIR"] = RAIZ_TEMPORARIA;
});

const POR = "despesa@cg.pb.gov.br";
const TESOUREIRO = "tesouraria@cg.pb.gov.br";
/** Quem AUTORIZA a ordem — nunca quem a preparou. Ver `ordemAutorizada`. */
const ORDENADOR = "m08@cg.pb.gov.br";
const FICHA = "ficha-lote";
const FONTE = "fnt-lote";
const CREDOR = "12345678000195";
const CONTA = "CC-LOTE";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";

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

let deps: M05Deps;
let contaId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "lc-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "lc-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "lc-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "lc-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "lc-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "lc-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "lo-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "lu-01", codigo: "01001", descricao: "Administração", orgaoId: "lo-01" },
  });
  await prisma.funcao.create({ data: { id: "lf-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "ls-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "lp-1", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "la-1", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "ln-1", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  contaId = (
    await prisma.contaBancaria.create({
      data: { id: "cb-lote", codigo: CONTA, descricao: "Movimento", fonteId: FONTE, contaContabilId: "lc-caixa" },
      select: { id: true },
    })
  ).id;

  await criarFichaDeTeste(prisma, {
    id: FICHA, numero: 1, exercicio: 2026, orgaoId: "lo-01", unidadeOrcId: "lu-01",
    funcaoId: "lf-04", subfuncaoId: "ls-122", programaId: "lp-1", acaoId: "la-1",
    naturezaDespesaId: "ln-1", fonteId: FONTE, valorDotado: "500000.00",
  });
}

/** Empenha, liquida na data pedida e devolve o id da liquidação. */
async function liquidacaoEm(dia: string, n: string, valor: string): Promise<string> {
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
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${n}`, valor,
      data: new Date(`${dia}T12:00:00Z`), responsavelAtesto: "Fulano",
      historico: `liquidação ${n}`, criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

/**
 * Prepara e AUTORIZA uma ordem sobre a liquidação.
 *
 * ⚠️ DUAS PESSOAS, e não por estilo: o M05 tem SEGREGAÇÃO DE FUNÇÕES — quem prepara a
 * ordem não pode autorizá-la. A primeira versão deste helper usava o mesmo usuário nos
 * dois atos e foi recusada pelo domínio, com a mensagem certa. O teste é que estava
 * errado: é o que separa quem PEDE o pagamento de quem o CONSENTE.
 */
async function ordemAutorizada(liquidacaoId: string, n: string, valor: string): Promise<string> {
  const o = await prepararOrdemDePagamento(prisma, {
    liquidacaoId, numero: `OP-${n}`, valor,
    dataPrevista: new Date("2026-04-01T12:00:00Z"),
    contaBancaria: CONTA, fonteId: FONTE,
    historico: `ordem ${n}`, criadoPor: POR,
  });
  await autorizarOrdemDePagamento(prisma, { ordemId: o.ordemId, criadoPor: ORDENADOR });
  return o.ordemId;
}

async function loteAberto(): Promise<string> {
  const l = await criarLoteDePagamento(prisma, {
    exercicio: 2026,
    dataVencimento: new Date("2026-04-10T12:00:00Z"),
    contaBancariaId: contaId,
    descricao: "Remessa de teste",
    criadoPor: TESOUREIRO,
  });
  return l.loteId;
}

beforeEach(semear);

// ═══════════════════════════════════════════════════════════════════════════
describe("M09 — o lote AGRUPA o que já existe", () => {
  it("t1: o lote nasce ABERTO e numera por exercício, sem reaproveitar", async () => {
    const a = await criarLoteDePagamento(prisma, {
      exercicio: 2026, dataVencimento: new Date("2026-04-10T12:00:00Z"),
      contaBancariaId: contaId, descricao: "Primeira", criadoPor: TESOUREIRO,
    });
    const b = await criarLoteDePagamento(prisma, {
      exercicio: 2026, dataVencimento: new Date("2026-04-11T12:00:00Z"),
      contaBancariaId: contaId, descricao: "Segunda", criadoPor: TESOUREIRO,
    });
    expect([a.numero, b.numero]).toEqual([1, 2]);

    // ⚠️ O ESTADO É DERIVADO: nasce ABERTO pela AUSÊNCIA de movimento.
    const mov = await prisma.movimentoDoLote.findMany({ where: { loteId: a.loteId } });
    expect(mov).toEqual([]);
    expect(estadoDoLote([])).toBe("ABERTO");
  });

  it("t2: um item é UMA ordem OU UMA nota — nunca as duas, nunca nenhuma", async () => {
    const loteId = await loteAberto();
    await expect(
      incluirNoLote(prisma, { loteId, criadoPor: TESOUREIRO })
    ).rejects.toThrow(/EXATAMENTE UM registro|UMA ordem de pagamento OU UMA nota/);
  });

  it("t3: a MESMA ordem não entra em dois lotes", async () => {
    const liq = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const ordemId = await ordemAutorizada(liq, "1", "1000.00");

    const primeiro = await loteAberto();
    await incluirNoLote(prisma, { loteId: primeiro, ordemId, criadoPor: TESOUREIRO });

    const segundo = await loteAberto();
    // ⚠️ O `@@unique([ordemId])` é o que impede a MESMA autorização de ir ao banco duas
    // vezes. Sem ele, o segundo borderô pareceria legítimo até o extrato chegar.
    await expect(
      incluirNoLote(prisma, { loteId: segundo, ordemId, criadoPor: TESOUREIRO })
    ).rejects.toThrow();
  });

  it("t4: só ordem AUTORIZADA entra — a PREPARADA é recusada", async () => {
    const liq = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const o = await prepararOrdemDePagamento(prisma, {
      liquidacaoId: liq, numero: "OP-P", valor: "1000.00",
      dataPrevista: new Date("2026-04-01T12:00:00Z"),
      contaBancaria: CONTA, fonteId: FONTE, historico: "sem autorizar", criadoPor: POR,
    });
    const loteId = await loteAberto();

    await expect(
      incluirNoLote(prisma, { loteId, ordemId: o.ordemId, criadoPor: TESOUREIRO })
    ).rejects.toThrow(/está PREPARADA — só ordem AUTORIZADA entra em lote/);
  });

  it("t5: lote VAZIO não fecha — um borderô sem linha seria remessa sem pagamento", async () => {
    const loteId = await loteAberto();
    await expect(
      fecharLote(prisma, { loteId, criadoPor: TESOUREIRO })
    ).rejects.toThrow(/não tem item nenhum/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 4 DO LOTE — a ordem cronológica, e o lote NÃO a contorna
// ═══════════════════════════════════════════════════════════════════════════
describe("M09 — o lote NÃO é rota alternativa à ordem cronológica (art. 141)", () => {
  /**
   * ⚠️ ESTE É O TESTE QUE A CARACTERIZAÇÃO TORNOU NECESSÁRIO.
   *
   * `docs/caracterizacao/01-financeiro.md` (3.4) registrou que `avaliarOrdem` **relata** a
   * quebra e não bloqueia — quem bloqueia é quem chama. Um lote de pagamento que não
   * chamasse o guard furaria a regra sem que nada no M06 acusasse.
   *
   * O cenário: duas liquidações na MESMA fonte e categoria, de 01/03 e 10/03. Incluir a de
   * 10 no lote, com a de 01 ainda a pagar, é preterir quem tem exigibilidade anterior.
   */
  it("t6: incluir quem NÃO é a cabeça da fila é RECUSADO, nomeando a preterida", async () => {
    const antiga = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const nova = await liquidacaoEm("2026-03-10", "2", "500.00");
    expect(antiga).not.toBe(nova);

    const ordemNova = await ordemAutorizada(nova, "2", "500.00");
    const loteId = await loteAberto();

    await expect(
      incluirNoLote(prisma, { loteId, ordemId: ordemNova, criadoPor: TESOUREIRO })
    ).rejects.toThrow(/QUEBRA DA ORDEM CRONOLÓGICA \(art\. 141\)/);

    // E nada foi gravado.
    expect(await prisma.itemDoLote.count({ where: { loteId } })).toBe(0);
  });

  it("t6c: (V33) a liquidação glosada inteira pela anulação parcial sai da fila — a seguinte entra no lote", async () => {
    // A fila do lote é a do M06. A cópia que morava no lote lia a liquidação pelo BRUTO e somava o pago por
    // `estornoDeId === null`: a antiga, sem saldo depois da glosa, continuava cabeça da fila, e a nova era
    // recusada por "quebra da ordem" para sempre.
    const antiga = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const nova = await liquidacaoEm("2026-03-10", "2", "500.00");
    await anularLiquidacaoParcial(
      { originalId: antiga, numero: "NL-1-AP1", valor: "1000.00", data: new Date("2026-03-05T12:00:00Z"), motivo: "glosa integral registrada pela fiscalização", criadoPor: POR },
      deps
    );
    const ordemNova = await ordemAutorizada(nova, "2", "500.00");
    const loteId = await loteAberto();
    const item = await incluirNoLote(prisma, { loteId, ordemId: ordemNova, criadoPor: TESOUREIRO });
    expect(item.itemId).toBeTruthy();
  });

  it("t7: a CABEÇA da fila entra normalmente — o guard permite o certo", async () => {
    const antiga = await liquidacaoEm("2026-03-01", "1", "1000.00");
    await liquidacaoEm("2026-03-10", "2", "500.00");

    const ordemAntiga = await ordemAutorizada(antiga, "1", "1000.00");
    const loteId = await loteAberto();

    const item = await incluirNoLote(prisma, {
      loteId, ordemId: ordemAntiga, criadoPor: TESOUREIRO,
    });
    expect(item.itemId).toBeTruthy();
  });

  it("t8: ordem de OUTRA conta bancária é recusada — um lote, um banco", async () => {
    await prisma.fonteRecurso.create({
      data: { id: "fnt-outra", codigo: "600", descricao: "Outra", codigoTce: "600" },
    });
    await prisma.contaBancaria.create({
      data: { id: "cb-outra", codigo: "CC-OUTRA", descricao: "Outra", fonteId: "fnt-outra", contaContabilId: "lc-caixa" },
    });

    const liq = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const o = await prepararOrdemDePagamento(prisma, {
      liquidacaoId: liq, numero: "OP-X", valor: "1000.00",
      dataPrevista: new Date("2026-04-01T12:00:00Z"),
      contaBancaria: "CC-OUTRA", fonteId: "fnt-outra", historico: "outra conta", criadoPor: POR,
    });
    await autorizarOrdemDePagamento(prisma, { ordemId: o.ordemId, criadoPor: ORDENADOR });

    const loteId = await loteAberto();
    await expect(
      incluirNoLote(prisma, { loteId, ordemId: o.ordemId, criadoPor: TESOUREIRO })
    ).rejects.toThrow(/Um lote com duas contas viraria dois borderôs/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 5 DO LOTE — o borderô e as assinaturas
// ═══════════════════════════════════════════════════════════════════════════
describe("M09 — o borderô e as assinaturas exigidas", () => {
  async function loteFechadoComUmItem(): Promise<string> {
    const liq = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const ordemId = await ordemAutorizada(liq, "1", "1000.00");
    const loteId = await loteAberto();
    await incluirNoLote(prisma, { loteId, ordemId, criadoPor: TESOUREIRO });
    await fecharLote(prisma, { loteId, criadoPor: TESOUREIRO });
    return loteId;
  }

  /**
   * ⚠️ ACHADO PELA VARREDURA "EFEITO COLATERAL ANTES DA OPERAÇÃO GUARDADA" (ENT03a).
   *
   * `gerarBordero` grava o `Bordero` numa transação e SÓ DEPOIS cria o anexo e a fila —
   * as três não cabem numa transação só (transação aninhada no Prisma não compõe).
   *
   * Se a fila for recusada, o borderô JÁ EXISTE. E `gerarBordero` recusa um segundo
   * borderô no mesmo lote ("já tem borderô", e com razão: enviaria os mesmos pagamentos
   * duas vezes). Resultado: **o lote fica impossível de transmitir, para sempre.**
   *
   * É EXATAMENTE a forma do defeito do `porNaFila` (M05), que este lote já corrigiu — e
   * a varredura existe porque a mesma forma tende a repetir onde há efeito colateral
   * antes de uma operação que pode recusar.
   *
   * ⚠️ A PORTA DE ENTRADA AQUI NÃO É O MODO: `zGerarBordero` já recusa QUALIFICADA no
   * Zod, antes de qualquer escrita. É o **signatário repetido**, que só é conferido lá
   * dentro, por `criarFilaDeAssinatura`.
   */
  it("t8b: signatário repetido não pode deixar o lote sem borderô para sempre", async () => {
    const loteId = await loteFechadoComUmItem();

    // A tentativa errada: o mesmo signatário duas vezes.
    await expect(
      gerarBordero(prisma, {
        loteId,
        signatarios: [TESOUREIRO, TESOUREIRO],
        modo: "AVANCADA",
        criadoPor: TESOUREIRO,
      })
    ).rejects.toThrow(/Signatário repetido/);

    // ⚠️ NADA PODE TER FICADO PARA TRÁS — nem borderô, nem anexo.
    expect(await prisma.bordero.count()).toBe(0);
    expect(await prisma.anexo.count()).toBe(0);

    // E a tentativa CORRETA tem de funcionar.
    const b = await gerarBordero(prisma, {
      loteId,
      signatarios: [TESOUREIRO, POR],
      modo: "AVANCADA",
      criadoPor: TESOUREIRO,
    });
    expect(b.borderoId).toBeTruthy();
    expect(await prisma.bordero.count()).toBe(1);
  });

  it("t9: borderô SEM signatário não é sequer GERADO", async () => {
    const loteId = await loteFechadoComUmItem();
    // ⚠️ O "nem gerado" do teste 5 do lote. `[].every(...)` é `true` em JavaScript: uma
    // fila vazia passaria por "todas as assinaturas colhidas" e o documento seria enviado.
    await expect(
      gerarBordero(prisma, { loteId, signatarios: [], modo: "AVANCADA", criadoPor: TESOUREIRO })
    ).rejects.toThrow();
  });

  it("t10: lote ABERTO não gera borderô — o hash carimbado deixaria de valer", async () => {
    const liq = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const ordemId = await ordemAutorizada(liq, "1", "1000.00");
    const loteId = await loteAberto();
    await incluirNoLote(prisma, { loteId, ordemId, criadoPor: TESOUREIRO });

    await expect(
      gerarBordero(prisma, { loteId, signatarios: [POR], modo: "AVANCADA", criadoPor: TESOUREIRO })
    ).rejects.toThrow(/não está FECHADO/);
  });

  it("t11: gerado, o borderô vira DOCUMENTO com hash e fila — e o envio é recusado", async () => {
    const loteId = await loteFechadoComUmItem();
    const b = await gerarBordero(prisma, {
      loteId, signatarios: [POR, TESOUREIRO], modo: "AVANCADA", criadoPor: TESOUREIRO,
    });

    expect(b.hash).toHaveLength(64);

    // ⚠️ O BORDERÔ É UM ANEXO DE VERDADE — baixável pela rota do ENT02 e assinável pela
    // fila do M22. Um caminho só para documentos.
    const anexo = await prisma.anexo.findFirstOrThrow({
      where: { borderoId: b.borderoId },
      select: { nomeOriginal: true, origem: true, mimeType: true },
    });
    expect(anexo.origem).toBe("SISTEMA");
    expect(anexo.nomeOriginal).toBe(`bordero-${b.numero}.txt`);

    const bordero = await prisma.bordero.findUniqueOrThrow({
      where: { id: b.borderoId },
      select: { filaAssinaturaId: true, hashConteudo: true },
    });
    expect(bordero.filaAssinaturaId).not.toBeNull();
    expect(bordero.hashConteudo).toBe(b.hash);

    // ⚠️ COM ZERO ASSINATURAS COLHIDAS, o envio recusa pela ASSINATURA — e não pelo
    // convênio. A ordem das conferências importa: se o "indisponível" viesse antes, o
    // guard de assinatura nunca seria exercitado, e no dia em que o convênio existisse o
    // borderô sem assinatura seria transmitido.
    await expect(
      enviarBordero(prisma, { borderoId: b.borderoId, criadoPor: TESOUREIRO })
    ).rejects.toThrow(/BORDERÔ SEM AS ASSINATURAS EXIGIDAS: 0 de 2/);
  });

  it("t12: assinatura PARCIAL mantém o estado pendente — o envio continua recusado", async () => {
    const loteId = await loteFechadoComUmItem();
    const b = await gerarBordero(prisma, {
      loteId, signatarios: [POR, TESOUREIRO], modo: "AVANCADA", criadoPor: TESOUREIRO,
    });

    // O PRIMEIRO da fila assina. A fila é ordenada: só ele pode agora.
    await assinarNaFila(prisma, { filaId: (await filaDo(b.borderoId)), criadoPor: POR });

    await expect(
      enviarBordero(prisma, { borderoId: b.borderoId, criadoPor: TESOUREIRO })
    ).rejects.toThrow(/BORDERÔ SEM AS ASSINATURAS EXIGIDAS: 1 de 2/);
  });

  it("t13: com TODAS as assinaturas, o bloqueio passa a ser o CONVÊNIO — indisponível, com motivo", async () => {
    const loteId = await loteFechadoComUmItem();
    const b = await gerarBordero(prisma, {
      loteId, signatarios: [POR, TESOUREIRO], modo: "AVANCADA", criadoPor: TESOUREIRO,
    });
    const filaId = await filaDo(b.borderoId);
    await assinarNaFila(prisma, { filaId, criadoPor: POR });
    await assinarNaFila(prisma, { filaId, criadoPor: TESOUREIRO });

    // ⚠️ AGORA a mensagem muda: as assinaturas estão completas, e o que falta é o canal.
    // Um "ENVIADO" gravado aqui apareceria na tela como transmissão, e o dinheiro não
    // teria saído — a mesma doutrina da assinatura qualificada e do envio ao banco do T07.
    await expect(
      enviarBordero(prisma, { borderoId: b.borderoId, criadoPor: TESOUREIRO })
    ).rejects.toThrow(/TRANSMISSÃO AO BANCO INDISPONÍVEL/);

    // E o estado NÃO virou "enviado": não há movimento nenhum.
    expect(await prisma.movimentoDoBordero.count({ where: { borderoId: b.borderoId } })).toBe(0);
  });

  async function filaDo(borderoId: string): Promise<string> {
    const b = await prisma.bordero.findUniqueOrThrow({
      where: { id: borderoId },
      select: { filaAssinaturaId: true },
    });
    return b.filaAssinaturaId as string;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 6 DO LOTE — o retorno bancário
// ═══════════════════════════════════════════════════════════════════════════
describe("M09 — o retorno bancário baixa só o que é dele, e o repetido não duplica", () => {
  async function borderoComDoisItens(): Promise<{ borderoId: string; itens: string[] }> {
    const l1 = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const l2 = await liquidacaoEm("2026-03-02", "2", "500.00");
    const o1 = await ordemAutorizada(l1, "1", "1000.00");
    const o2 = await ordemAutorizada(l2, "2", "500.00");

    const loteId = await loteAberto();
    const i1 = await incluirNoLote(prisma, { loteId, ordemId: o1, criadoPor: TESOUREIRO });
    const i2 = await incluirNoLote(prisma, { loteId, ordemId: o2, criadoPor: TESOUREIRO });
    await fecharLote(prisma, { loteId, criadoPor: TESOUREIRO });

    const b = await gerarBordero(prisma, {
      loteId, signatarios: [POR], modo: "AVANCADA", criadoPor: TESOUREIRO,
    });
    return { borderoId: b.borderoId, itens: [i1.itemId, i2.itemId] };
  }

  it("t14: o retorno baixa os itens informados, e o REPETIDO não duplica", async () => {
    const { borderoId, itens } = await borderoComDoisItens();
    const linha = {
      itemId: itens[0] as string,
      dataLiquidacaoBanco: new Date("2026-04-12T00:00:00Z"),
      identificadorBanco: "BB-000123",
    };

    const primeira = await processarRetornoBancario(prisma, {
      borderoId, linhas: [linha], criadoPor: TESOUREIRO,
    });
    expect(primeira).toEqual({ baixados: 1, jaBaixados: 0 });

    // ⚠️ A IDEMPOTÊNCIA É DO BANCO (`@@unique([itemId])`), não de um `if`. Um `if` lido
    // antes do insert perderia a corrida entre dois processamentos simultâneos.
    const segunda = await processarRetornoBancario(prisma, {
      borderoId, linhas: [linha], criadoPor: TESOUREIRO,
    });
    expect(segunda).toEqual({ baixados: 0, jaBaixados: 1 });

    expect(await prisma.baixaDeRetornoBancario.count({ where: { borderoId } })).toBe(1);
    // E só UM movimento de retorno: o segundo processamento não inventou histórico.
    expect(
      await prisma.movimentoDoBordero.count({ where: { borderoId, tipo: "RETORNO_PROCESSADO" } })
    ).toBe(1);
  });

  it("t15: o retorno NÃO baixa item de outro borderô — nada é gravado", async () => {
    const a = await borderoComDoisItens();

    // Um segundo borderô, com item próprio.
    const l3 = await liquidacaoEm("2026-03-03", "3", "300.00");
    const o3 = await ordemAutorizada(l3, "3", "300.00");
    const outroLote = await loteAberto();
    const alheio = await incluirNoLote(prisma, {
      loteId: outroLote, ordemId: o3, criadoPor: TESOUREIRO,
    });

    await expect(
      processarRetornoBancario(prisma, {
        borderoId: a.borderoId,
        linhas: [
          {
            itemId: alheio.itemId,
            dataLiquidacaoBanco: new Date("2026-04-12T00:00:00Z"),
            identificadorBanco: "BB-999",
          },
        ],
        criadoPor: TESOUREIRO,
      })
    ).rejects.toThrow(/NÃO pertencem ao borderô/);

    expect(await prisma.baixaDeRetornoBancario.count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
/**
 * V39-R3 (R3-027) — O RETORNO QUE DIZ "NÃO CREDITADO". N=2 no borderô: o banco paga um item e rejeita o outro. Contas:
 * a ordem rejeitada (500,00) se cancela no mesmo ato, a liquidação dela volta a comportar uma ordem de 500,00, e a nova
 * ordem entra num lote novo; o item pago não se rejeita, o rejeitado não se baixa, e a rejeição repetida não duplica.
 */
describe("V39-R3 — a rejeição do banco no retorno", () => {
  async function borderoComDoisItens(): Promise<{ borderoId: string; itens: string[]; ordens: string[]; liquidacoes: string[] }> {
    const l1 = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const l2 = await liquidacaoEm("2026-03-02", "2", "500.00");
    const o1 = await ordemAutorizada(l1, "1", "1000.00");
    const o2 = await ordemAutorizada(l2, "2", "500.00");
    const loteId = await loteAberto();
    const i1 = await incluirNoLote(prisma, { loteId, ordemId: o1, criadoPor: TESOUREIRO });
    const i2 = await incluirNoLote(prisma, { loteId, ordemId: o2, criadoPor: TESOUREIRO });
    await fecharLote(prisma, { loteId, criadoPor: TESOUREIRO });
    const b = await gerarBordero(prisma, { loteId, signatarios: [POR], modo: "AVANCADA", criadoPor: TESOUREIRO });
    return { borderoId: b.borderoId, itens: [i1.itemId, i2.itemId], ordens: [o1, o2], liquidacoes: [l1, l2] };
  }
  const DIA = new Date("2026-04-12T12:00:00Z");
  const cancelamentos = (ordemId: string) => prisma.movimentoDaOrdemDePagamento.findMany({ where: { ordemId, tipo: "CANCELAMENTO" }, select: { id: true, motivo: true } });

  it("t19: um item pago e outro rejeitado — a ordem rejeitada se cancela e a liquidação aceita ordem nova em lote novo", async () => {
    const { borderoId, itens, ordens, liquidacoes } = await borderoComDoisItens();
    const [i1, i2] = itens as [string, string];
    const [o1, o2] = ordens as [string, string];

    const r = await registrarRejeicaoBancaria(prisma, { borderoId, linhas: [{ itemId: i2, dataRejeicao: DIA, ocorrencia: "BD - conta do favorecido encerrada" }], criadoPor: TESOUREIRO });
    expect(r).toEqual({ rejeitados: 1, jaRejeitados: 0, ordensCanceladas: 1 });
    const canc = await cancelamentos(o2);
    expect(canc).toHaveLength(1);
    expect(canc[0]?.motivo).toMatch(/rejeitado pelo banco no borderô .*BD - conta do favorecido encerrada/);
    const rej = await prisma.rejeicaoDeRetornoBancario.findUniqueOrThrow({ where: { itemId: i2 }, select: { ocorrencia: true, movimentoDaOrdemId: true } });
    expect(rej).toEqual({ ocorrencia: "BD - conta do favorecido encerrada", movimentoDaOrdemId: canc[0]?.id });
    expect(await cancelamentos(o1)).toHaveLength(0);

    // o outro item, o banco pagou
    expect(await processarRetornoBancario(prisma, { borderoId, linhas: [{ itemId: i1, dataLiquidacaoBanco: DIA, identificadorBanco: "BB-1" }], criadoPor: TESOUREIRO })).toEqual({ baixados: 1, jaBaixados: 0 });

    // o rejeitado não se baixa; o pago não se rejeita; nada é gravado nas recusas
    await expect(processarRetornoBancario(prisma, { borderoId, linhas: [{ itemId: i2, dataLiquidacaoBanco: DIA, identificadorBanco: "BB-2" }], criadoPor: TESOUREIRO })).rejects.toThrow(/O banco já rejeitou 1 destes item\(ns\): .*não se baixa como pago/);
    await expect(registrarRejeicaoBancaria(prisma, { borderoId, linhas: [{ itemId: i1, dataRejeicao: DIA, ocorrencia: "XX - tentativa" }], criadoPor: TESOUREIRO })).rejects.toThrow(/O banco já liquidou OP-1 neste borderô: um crédito baixado como pago não se rejeita depois/);
    expect(await prisma.baixaDeRetornoBancario.count({ where: { itemId: i2 } })).toBe(0);
    expect(await prisma.rejeicaoDeRetornoBancario.count({ where: { itemId: i1 } })).toBe(0);

    // a repetida não duplica: nem rejeição, nem cancelamento
    expect(await registrarRejeicaoBancaria(prisma, { borderoId, linhas: [{ itemId: i2, dataRejeicao: DIA, ocorrencia: "BD - conta do favorecido encerrada" }], criadoPor: TESOUREIRO })).toEqual({ rejeitados: 0, jaRejeitados: 1, ordensCanceladas: 0 });
    expect(await cancelamentos(o2)).toHaveLength(1);

    // o novo crédito: ordem nova da mesma liquidação, em lote novo — COM OUTRA LIQUIDAÇÃO ATRÁS DELA NA FILA (N=2 na
    // fila): o item rejeitado não pode tirar a liquidação da fila, senão a de trás passa a ser a cabeça e o novo
    // crédito é recusado por "quebra da ordem cronológica" para sempre (medido pelo percurso da folha até o banco).
    await liquidacaoEm("2026-03-03", "3", "300.00");
    const nova = await ordemAutorizada(liquidacoes[1] as string, "2B", "500.00");
    const lote2 = await loteAberto();
    const item = await incluirNoLote(prisma, { loteId: lote2, ordemId: nova, criadoPor: TESOUREIRO });
    expect(item.itemId).not.toBe(i2);
    // e a ordem rejeitada não volta a lote nenhum, nem se paga
    await expect(incluirNoLote(prisma, { loteId: lote2, ordemId: o2, criadoPor: TESOUREIRO })).rejects.toThrow(/A ordem OP-2 está CANCELADA — só ordem AUTORIZADA entra em lote/);
    await prisma.contaPcasp.create({ data: { id: "lc-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true } });
    await expect(
      pagar(
        { liquidacaoId: liquidacoes[1] as string, numero: "2026OP-REJ", valor: "500.00", data: new Date("2026-04-13T12:00:00Z"), contaBancaria: CONTA, fonteId: FONTE, historico: "tentativa sobre a ordem rejeitada", criadoPor: ORDENADOR, ordemDePagamentoId: o2 },
        roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: "6.2.2.1.3.04.00" }),
        deps
      )
    ).rejects.toThrow(/estado CANCELADA/);
  });

  it("t20: recusas sem gravar — item de outro borderô e ordem já paga", async () => {
    const a = await borderoComDoisItens();
    const l3 = await liquidacaoEm("2026-03-03", "3", "300.00");
    const o3 = await ordemAutorizada(l3, "3", "300.00");
    const outroLote = await loteAberto();
    const alheio = await incluirNoLote(prisma, { loteId: outroLote, ordemId: o3, criadoPor: TESOUREIRO });
    await expect(registrarRejeicaoBancaria(prisma, { borderoId: a.borderoId, linhas: [{ itemId: alheio.itemId, dataRejeicao: DIA, ocorrencia: "BD - teste" }], criadoPor: TESOUREIRO })).rejects.toThrow(/NÃO pertencem ao borderô/);

    // a ordem do item 1 é paga antes de o retorno chegar: a rejeição é recusada e nada é gravado (nem a do item 2)
    await prisma.contaPcasp.create({ data: { id: "lc-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true } });
    await pagar(
      { liquidacaoId: a.liquidacoes[0] as string, numero: "2026OP-P1", valor: "1000.00", data: new Date("2026-04-11T12:00:00Z"), contaBancaria: CONTA, fonteId: FONTE, historico: "pago antes do retorno", criadoPor: ORDENADOR, ordemDePagamentoId: a.ordens[0] as string },
      roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: "6.2.2.1.3.04.00" }),
      deps
    );
    await expect(
      registrarRejeicaoBancaria(prisma, {
        borderoId: a.borderoId,
        linhas: [
          { itemId: a.itens[1] as string, dataRejeicao: DIA, ocorrencia: "BD - conta encerrada" },
          { itemId: a.itens[0] as string, dataRejeicao: DIA, ocorrencia: "BD - conta encerrada" },
        ],
        criadoPor: TESOUREIRO,
      })
    ).rejects.toThrow(/A ordem OP-1 já tem pagamento registrado\. .*anule-o primeiro/);
    expect(await prisma.rejeicaoDeRetornoBancario.count()).toBe(0);
    expect(await prisma.movimentoDaOrdemDePagamento.count({ where: { tipo: "CANCELAMENTO" } })).toBe(0);

    // quem não tem a permissão do retorno não rejeita, e nada é gravado
    const SEM = "estagiario@cg.pb.gov.br";
    await prisma.usuario.create({ data: { identificador: SEM, nome: SEM, criadoPor: POR } });
    await expect(registrarRejeicaoBancaria(prisma, { borderoId: a.borderoId, linhas: [{ itemId: a.itens[1] as string, dataRejeicao: DIA, ocorrencia: "BD - conta encerrada" }], criadoPor: SEM })).rejects.toThrow(/PROCESSAR_RETORNO_BANCARIO/);
    expect(await prisma.rejeicaoDeRetornoBancario.count()).toBe(0);
  });

  it("t21: o pagamento registrado antes do retorno e depois anulado — a rejeição se grava sem cancelamento, e o novo crédito entra em lote novo", async () => {
    const a = await borderoComDoisItens();
    const [i1] = a.itens as [string, string];
    const [o1] = a.ordens as [string, string];
    const [l1] = a.liquidacoes as [string, string];
    await prisma.contaPcasp.create({ data: { id: "lc-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true } });
    const pago = await pagar(
      { liquidacaoId: l1, numero: "2026OP-P1", valor: "1000.00", data: new Date("2026-04-11T12:00:00Z"), contaBancaria: CONTA, fonteId: FONTE, historico: "pago antes do retorno", criadoPor: ORDENADOR, ordemDePagamentoId: o1 },
      roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: "6.2.2.1.3.04.00" }),
      deps
    );
    const rejeitar = () => registrarRejeicaoBancaria(prisma, { borderoId: a.borderoId, linhas: [{ itemId: i1, dataRejeicao: DIA, ocorrencia: "BD - conta encerrada" }], criadoPor: TESOUREIRO });
    await expect(rejeitar()).rejects.toThrow(/A ordem OP-1 já tem pagamento registrado\. .*anule-o primeiro/);

    await anularPagamento({ pagamentoId: pago.pagamentoId, numero: "2026OP-ANUL", data: new Date("2026-04-12T12:00:00Z"), historico: "o banco não creditou", criadoPor: ORDENADOR }, deps);
    expect(await rejeitar()).toEqual({ rejeitados: 1, jaRejeitados: 0, ordensCanceladas: 0 });
    expect((await prisma.rejeicaoDeRetornoBancario.findUniqueOrThrow({ where: { itemId: i1 }, select: { movimentoDaOrdemId: true } })).movimentoDaOrdemId).toBeNull();
    expect(await prisma.movimentoDaOrdemDePagamento.count({ where: { ordemId: o1, tipo: "CANCELAMENTO" } })).toBe(0);

    // a anulação devolveu o saldo; com outra liquidação atrás na fila, a ordem nova da 1 entra em lote novo
    await liquidacaoEm("2026-03-03", "3", "300.00");
    const nova = await ordemAutorizada(l1, "1B", "1000.00");
    const lote2 = await loteAberto();
    await expect(incluirNoLote(prisma, { loteId: lote2, ordemId: nova, criadoPor: TESOUREIRO })).resolves.toEqual({ itemId: expect.any(String) });
  });

  it("t22: A TRAVA EXISTE — com a liquidação travada por outra transação, o cancelamento manual da ordem espera", async () => {
    const l = await liquidacaoEm("2026-03-01", "1", "1000.00");
    const o = await ordemAutorizada(l, "1", "1000.00");
    let soltar: () => void = () => undefined;
    const presa = new Promise<void>((r) => { soltar = r; });
    let travou: () => void = () => undefined;
    const jaTravou = new Promise<void>((r) => { travou = r; });
    const segurando = prisma.$transaction(async (tx) => { await travar(tx, "Liquidacao", [l]); travou(); await presa; }, { timeout: 20_000 });
    await jaTravou;
    let terminou = false;
    const c = cancelarOrdemDePagamento(prisma, { ordemId: o, motivo: "cancelada durante a trava", criadoPor: POR }).then(() => { terminou = true; });
    await new Promise((r) => setTimeout(r, 800));
    expect(terminou).toBe(false);
    soltar();
    await segurando;
    await c;
    expect(terminou).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("M09 — as regras puras do lote", () => {
  it("t16: fila VAZIA não é 'completa' — `[].every` seria `true`", () => {
    expect(estadoDasAssinaturas([]).completa).toBe(false);
    expect(estadoDasAssinaturas([]).exigidas).toBe(0);

    const uma = estadoDasAssinaturas([
      { ordem: 1, usuarioIdent: "a@x", assinouEm: new Date() },
    ]);
    expect(uma.completa).toBe(true);
    expect(uma.proximo).toBeNull();
  });

  it("t17: o CANCELAMENTO do lote é terminal — reabrir não o ressuscita", () => {
    const t = (n: number): Date => new Date(2026, 3, n);
    expect(
      estadoDoLote([
        { tipo: "FECHADO", criadoEm: t(1) },
        { tipo: "CANCELADO", criadoEm: t(2) },
        { tipo: "REABERTO", criadoEm: t(3) },
      ])
    ).toBe("CANCELADO");
  });

  it("t18: o conteúdo do borderô é DETERMINÍSTICO e ordenado", () => {
    const base = {
      numero: 7,
      dataVencimento: new Date("2026-04-10T12:00:00Z"),
      contaBancaria: CONTA,
    };
    const linhas = [
      { ordemOuNota: "OP-2", favorecido: "B", valor: toMoney("500.00") },
      { ordemOuNota: "OP-1", favorecido: "A", valor: toMoney("1000.50") },
    ];

    const a = conteudoDoBordero({ ...base, linhas });
    const b = conteudoDoBordero({ ...base, linhas: [...linhas].reverse() });
    expect(a).toBe(b);

    // ⚠️ DUAS CASAS SEMPRE. `Money.toString()` de "1000.50" pode devolver "1000.5", e um
    // hash sobre isso mudaria por formatação, não por conteúdo.
    expect(a).toContain("OP-1;A;1000.50");
    expect(a).toContain("TOTAL;1500.50;2");
  });
});
