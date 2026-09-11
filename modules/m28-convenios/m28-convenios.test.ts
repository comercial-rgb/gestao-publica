import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { pendenteDePrestacao, saldoALiberar } from "./dominio.js";
import {
  aprovarPrestacaoDeContas,
  cadastrarConvenio,
  estornarMovimentoConvenio,
  glosar,
  liberarParcela,
  registrarDevolucao,
} from "./servico.js";

/**
 * M28 — CONVÊNIOS DE REPASSE (LRF art. 25). REGIME: **PROFUNDIDADE**.
 *
 * Ele move o razão (controle, classe 8), tem teto próprio e vínculo obrigatório com o empenho
 * — e por isso vale a régua cheia: fixture N=2 em tudo que só se manifesta em conjunto, teste
 * de negação que AFIRMA O MOTIVO, e o guard cobrado no caso de uso.
 *
 * ═══ AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO ═══
 *   termo de 100.000 · duas parcelas de 40.000 e 30.000
 *   depois das duas: a liberar 30.000 · a prestar 70.000
 *   prestação aprovada de 40.000: a liberar 30.000 (INALTERADO) · a prestar 30.000
 *   glosa de 5.000: nenhum dos dois muda · glosado 5.000
 *   devolução de 5.000: a liberar 35.000 · glosado 0
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const OUTRO = "controle.interno@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-conv";

const C_CONTROLE_A = "8.1.1.1.1.00.00";
const C_CONTROLE_B = "8.1.1.2.1.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-ctrl-a", codigo: C_CONTROLE_A, nome: "Convênios a prestar contas", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-ctrl-b", codigo: C_CONTROLE_B, nome: "Convênios — execução", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Gabinete", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm. geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "0001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-41", codCategoria: "3", codNatureza: "3", codModalidade: "50", codElemento: "43", codigoCompleto: "335043", descricao: "Subvenções sociais" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, numero: 1, exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    fonteId: FONTE, naturezaDespesaId: "nd-41", valorDotado: "500000.00",
  });

  // ⚠️ O ROTEIRO É POR TABELA, e por PAR (tipo, papel do ente): o controle do concedente é
  // "a haver de prestação de contas"; o do convenente é "a prestar contas".
  await prisma.roteiroConvenio.createMany({
    data: (["PRESTACAO_APROVADA", "GLOSA", "DEVOLUCAO"] as const).map((tipo) => ({
      tipo,
      papelDoEnte: "CONCEDENTE" as const,
      contaDebitoId: "c-ctrl-b",
      contaCreditoId: "c-ctrl-a",
      historicoPadrao: `Convênio — ${tipo}`,
    })),
  });
}

async function convenioDeTeste(
  papel: "CONCEDENTE" | "CONVENENTE" = "CONCEDENTE"
): Promise<string> {
  const { convenioId } = await cadastrarConvenio(prisma, {
    identificador: `CV-2026-${papel === "CONCEDENTE" ? "001" : "002"}`,
    objeto: "Repasse para custeio da rede socioassistencial do município",
    papelDoEnte: papel,
    partidaNome: "Associação Casa de Apoio",
    partidaDocumento: "12345678000199",
    leiAutorizativa: "Lei Municipal 8.100/2025",
    valorRepasse: "100000.00",
    valorContrapartida: "10000.00",
    diaVigenciaInicio: "2026-01-01",
    diaVigenciaFim: "2026-06-30",
    fonteRecursoId: FONTE,
    contaContabilId: "c-ctrl-a",
    criadoPor: POR,
  });
  return convenioId;
}

/** Um empenho VINCULADO ao convênio — é o que a liberação do concedente exige. */
async function empenhoDoConvenio(
  convenioId: string,
  numero: string,
  valor: string
): Promise<string> {
  const { empenhoId } = await empenhar(
    {
      fichaId: FICHA, numero, tipo: "ORDINARIO", valor,
      data: new Date("2026-02-10T12:00:00Z"),
      credorCpfCnpj: "12345678000199",
      historico: "Repasse de convênio",
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  await prisma.empenho.update({ where: { id: empenhoId }, data: { convenioId } });
  return empenhoId;
}

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("M28 — o convênio de repasse", () => {
  it("t1: OURO — duas parcelas, prestação, glosa e devolução, com os três saldos por literal", async () => {
    const convenioId = await convenioDeTeste();

    // ── as DUAS parcelas (N=2: é com duas que os saldos divergem) ──
    const e1 = await empenhoDoConvenio(convenioId, "2026NE000001", "40000.00");
    await liberarParcela(prisma, {
      convenioId, valor: "40000.00", parcela: 1, diaMovimento: "2026-02-15",
      competencia: "2026-02", empenhoId: e1,
      motivo: "Primeira parcela conforme cronograma de desembolso.", criadoPor: POR,
    });
    const e2 = await empenhoDoConvenio(convenioId, "2026NE000002", "30000.00");
    await liberarParcela(prisma, {
      convenioId, valor: "30000.00", parcela: 2, diaMovimento: "2026-03-15",
      competencia: "2026-03", empenhoId: e2,
      motivo: "Segunda parcela conforme cronograma de desembolso.", criadoPor: POR,
    });

    const depoisDasParcelas = await movimentos(convenioId);
    expect(saldoALiberar(toMoney("100000.00"), depoisDasParcelas).toFixed(2)).toBe("30000.00");
    expect(pendenteDePrestacao(depoisDasParcelas).toFixed(2)).toBe("70000.00");

    // ── a prestação de contas da 1ª parcela: baixa a pendência, NÃO devolve saldo ──
    const prestacao = await aprovarPrestacaoDeContas(prisma, {
      convenioId, valor: "40000.00", diaMovimento: "2026-04-10", competencia: "2026-04",
      motivo: "Prestação de contas da primeira parcela aprovada pelo controle interno.",
      criadoPor: POR,
    });
    expect(prestacao.lancamentoId).toBeTruthy();

    const depoisDaPrestacao = await movimentos(convenioId);
    expect(saldoALiberar(toMoney("100000.00"), depoisDaPrestacao).toFixed(2)).toBe("30000.00");
    expect(pendenteDePrestacao(depoisDaPrestacao).toFixed(2)).toBe("30000.00");

    // ── glosa e devolução ──
    await glosar(prisma, {
      convenioId, valor: "5000.00", diaMovimento: "2026-04-20", competencia: "2026-04",
      motivo: "Despesa com combustível fora do objeto do convênio.", criadoPor: POR,
    });
    await registrarDevolucao(prisma, {
      convenioId, valor: "5000.00", diaMovimento: "2026-05-05", competencia: "2026-05",
      motivo: "Devolução do valor glosado, guia de recolhimento 4412.", criadoPor: POR,
    });
    const fim = await movimentos(convenioId);
    expect(saldoALiberar(toMoney("100000.00"), fim).toFixed(2)).toBe("35000.00");

    // ⚠️ A AMARRAÇÃO: os três movimentos COM lançamento estão no razão, e os dois de
    // liberação NÃO — quem contabiliza a despesa é o M05.
    const comLancamento = await prisma.movimentoConvenio.count({
      where: { convenioId, lancamentoId: { not: null } },
    });
    expect(comLancamento).toBe(3);
  });

  it("t2: liberar ACIMA do termo é RECUSADO, e a recusa diz quanto há", async () => {
    const convenioId = await convenioDeTeste();
    const e1 = await empenhoDoConvenio(convenioId, "2026NE000010", "90000.00");
    await liberarParcela(prisma, {
      convenioId, valor: "90000.00", parcela: 1, diaMovimento: "2026-02-15",
      competencia: "2026-02", empenhoId: e1, motivo: "Parcela única antecipada.", criadoPor: POR,
    });
    const e2 = await empenhoDoConvenio(convenioId, "2026NE000011", "20000.00");

    await expect(
      liberarParcela(prisma, {
        convenioId, valor: "20000.00", parcela: 2, diaMovimento: "2026-03-15",
        competencia: "2026-03", empenhoId: e2, motivo: "Complemento fora do termo.", criadoPor: POR,
      })
    ).rejects.toThrow(/SALDO A LIBERAR INSUFICIENTE[\s\S]*disponível 10000\.00[\s\S]*Nada foi gravado/);

    // ⚠️ TESTE DE NEGAÇÃO QUE AFIRMA O MOTIVO **E** O EFEITO. "Não completou" é compatível
    // com o banco fora do ar — o que se prende aqui é que NADA ficou gravado.
    expect(await prisma.movimentoConvenio.count({ where: { convenioId } })).toBe(1);
  });

  it("t3: a MESMA PARCELA duas vezes é recusada — mesmo com valor que cabe no saldo", async () => {
    // ⚠️ O SALDO NÃO PEGARIA ISTO. Duas liberações de 40.000 num termo de 100.000 somam
    // 80.000 e passam pelo teto — e o extrato mostraria a parcela 1 paga duas vezes, com a
    // mesma justificativa. A idempotência é pelo NÚMERO da parcela.
    const convenioId = await convenioDeTeste();
    const e1 = await empenhoDoConvenio(convenioId, "2026NE000020", "40000.00");
    await liberarParcela(prisma, {
      convenioId, valor: "40000.00", parcela: 1, diaMovimento: "2026-02-15",
      competencia: "2026-02", empenhoId: e1, motivo: "Primeira parcela do cronograma.", criadoPor: POR,
    });
    const e2 = await empenhoDoConvenio(convenioId, "2026NE000021", "40000.00");

    await expect(
      liberarParcela(prisma, {
        convenioId, valor: "40000.00", parcela: 1, diaMovimento: "2026-03-15",
        competencia: "2026-03", empenhoId: e2, motivo: "Primeira parcela do cronograma.", criadoPor: POR,
      })
    ).rejects.toThrow(/PARCELA 1 JÁ LIBERADA[\s\S]*Nada foi gravado/);
    expect(await prisma.movimentoConvenio.count({ where: { convenioId } })).toBe(1);
  });

  it("t4: como CONCEDENTE, liberar SEM empenho é recusado — e o motivo é a dotação", async () => {
    const convenioId = await convenioDeTeste();
    await expect(
      liberarParcela(prisma, {
        convenioId, valor: "10000.00", parcela: 1, diaMovimento: "2026-02-15",
        competencia: "2026-02", motivo: "Repasse direto, sem empenho.", criadoPor: POR,
      })
    ).rejects.toThrow(/LIBERAÇÃO SEM EMPENHO[\s\S]*despesa sem dotação[\s\S]*Nada foi gravado/);
    expect(await prisma.movimentoConvenio.count({ where: { convenioId } })).toBe(0);
  });

  it("t4b: o empenho de OUTRO convênio é recusado", async () => {
    const a = await convenioDeTeste("CONCEDENTE");
    const b = await convenioDeTeste("CONVENENTE");
    const doB = await empenhoDoConvenio(b, "2026NE000030", "10000.00");

    await expect(
      liberarParcela(prisma, {
        convenioId: a, valor: "10000.00", parcela: 1, diaMovimento: "2026-02-15",
        competencia: "2026-02", empenhoId: doB, motivo: "Parcela com empenho trocado.", criadoPor: POR,
      })
    ).rejects.toThrow(/é de OUTRO CONVÊNIO[\s\S]*Nada foi gravado/);
  });

  it("t5: aprovar prestação ACIMA do liberado é recusado — quitação de dinheiro que não saiu", async () => {
    const convenioId = await convenioDeTeste();
    const e1 = await empenhoDoConvenio(convenioId, "2026NE000040", "40000.00");
    await liberarParcela(prisma, {
      convenioId, valor: "40000.00", parcela: 1, diaMovimento: "2026-02-15",
      competencia: "2026-02", empenhoId: e1, motivo: "Primeira parcela do cronograma.", criadoPor: POR,
    });

    await expect(
      aprovarPrestacaoDeContas(prisma, {
        convenioId, valor: "60000.00", diaMovimento: "2026-04-10", competencia: "2026-04",
        motivo: "Prestação de contas do termo inteiro, antecipada.", criadoPor: POR,
      })
    ).rejects.toThrow(/PRESTAÇÃO ACIMA DO PENDENTE[\s\S]*dinheiro que não saiu[\s\S]*Nada foi gravado/);
  });

  it("t6: o ESTORNO devolve os dois saldos, e o segundo estorno é recusado", async () => {
    const convenioId = await convenioDeTeste();
    const e1 = await empenhoDoConvenio(convenioId, "2026NE000050", "40000.00");
    const { movimentoId } = await liberarParcela(prisma, {
      convenioId, valor: "40000.00", parcela: 1, diaMovimento: "2026-02-15",
      competencia: "2026-02", empenhoId: e1, motivo: "Primeira parcela do cronograma.", criadoPor: POR,
    });

    await estornarMovimentoConvenio(prisma, {
      movimentoId, diaMovimento: "2026-02-20",
      motivo: "Ordem bancária devolvida pelo banco — conta do convenente encerrada.",
      criadoPor: POR,
    });
    const depois = await movimentos(convenioId);
    expect(saldoALiberar(toMoney("100000.00"), depois).toFixed(2)).toBe("100000.00");
    expect(pendenteDePrestacao(depois).toFixed(2)).toBe("0.00");

    // ⚠️ O SEGUNDO ESTORNO DOBRARIA O SALDO. A trava é do banco
    // (`uq_estorno_convenio_unico.sql`) e do caso de uso — as duas.
    await expect(
      estornarMovimentoConvenio(prisma, {
        movimentoId, diaMovimento: "2026-02-21", motivo: "Tentativa de estornar de novo.",
        criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ FOI ESTORNADO[\s\S]*em dobro[\s\S]*Nada foi gravado/);
  });

  it("t7: a parcela liberada e depois ESTORNADA pode ser liberada de novo", async () => {
    // ⚠️ É A OUTRA PONTA DO t3. Se a idempotência olhasse só "existe parcela 1?", o estorno
    // de uma liberação errada deixaria aquela parcela IMPOSSÍVEL de refazer para sempre — o
    // mesmo defeito que o `porNaFila` do ENT03a tinha com a guarda de unicidade.
    const convenioId = await convenioDeTeste();
    const e1 = await empenhoDoConvenio(convenioId, "2026NE000060", "40000.00");
    const { movimentoId } = await liberarParcela(prisma, {
      convenioId, valor: "40000.00", parcela: 1, diaMovimento: "2026-02-15",
      competencia: "2026-02", empenhoId: e1, motivo: "Primeira parcela, valor errado.", criadoPor: POR,
    });
    await estornarMovimentoConvenio(prisma, {
      movimentoId, diaMovimento: "2026-02-16", motivo: "Valor da parcela digitado errado.",
      criadoPor: POR,
    });

    const e2 = await empenhoDoConvenio(convenioId, "2026NE000061", "35000.00");
    const refeita = await liberarParcela(prisma, {
      convenioId, valor: "35000.00", parcela: 1, diaMovimento: "2026-02-17",
      competencia: "2026-02", empenhoId: e2, motivo: "Primeira parcela, valor corrigido.", criadoPor: POR,
    });
    expect(refeita.movimentoId).toBeTruthy();
  });

  it("t8: SEM ROTEIRO cadastrado o movimento é RECUSADO — e nada fica gravado", async () => {
    // ⚠️ FAIL-CLOSED NA CONTA. Uma conta plausível escolhida pelo código produziria um
    // balanço que fecha e mente — e ninguém procuraria o defeito num balanço que fecha.
    await prisma.roteiroConvenio.deleteMany({ where: { tipo: "GLOSA" } });
    const convenioId = await convenioDeTeste();
    const e1 = await empenhoDoConvenio(convenioId, "2026NE000070", "40000.00");
    await liberarParcela(prisma, {
      convenioId, valor: "40000.00", parcela: 1, diaMovimento: "2026-02-15",
      competencia: "2026-02", empenhoId: e1, motivo: "Primeira parcela do cronograma.", criadoPor: POR,
    });

    await expect(
      glosar(prisma, {
        convenioId, valor: "1000.00", diaMovimento: "2026-04-20", competencia: "2026-04",
        motivo: "Despesa fora do objeto, sem roteiro cadastrado.", criadoPor: POR,
      })
    ).rejects.toThrow(/Não há RoteiroConvenio cadastrado para GLOSA[\s\S]*Nada foi gravado/);
    expect(await prisma.movimentoConvenio.count({ where: { convenioId, tipo: "GLOSA" } })).toBe(0);
  });

  it("t9: AUTORIZAÇÃO NO SERVIDOR — quem não tem a ação é NEGADO, e nada fica gravado", async () => {
    // ⚠️ O PERFIL É MONTADO AQUI, RESTRITO DE PROPÓSITO. As identidades das fixtures recebem
    // ADMIN por padrão (senão todo teste tropeçaria em permissão e testaria a coisa errada);
    // este é sobre permissão, e por isso cria o seu.
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO_LE_CONVENIO",
        descricao: "Perfil sem nenhuma ação de convênio — o contrapeso do t9.",
        criadoPor: "TESTE",
        permissoes: { create: [{ acao: "CADASTRAR_PRECATORIO", criadoPor: "TESTE" }] },
      },
      select: { id: true },
    });
    const usuario = await prisma.usuario.create({
      data: { identificador: "sem.convenio@cg.pb.gov.br", nome: "Sem convênio", criadoPor: "TESTE" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: "TESTE" },
    });

    await expect(
      cadastrarConvenio(prisma, {
        identificador: "CV-2026-999",
        objeto: "Convênio cadastrado por quem não pode cadastrar convênio",
        papelDoEnte: "CONCEDENTE",
        partidaNome: "Associação Qualquer",
        partidaDocumento: "12345678000199",
        leiAutorizativa: "Lei 1/2026",
        valorRepasse: "1000.00",
        valorContrapartida: "0.00",
        diaVigenciaInicio: "2026-01-01",
        diaVigenciaFim: "2026-12-31",
        fonteRecursoId: FONTE,
        contaContabilId: "c-ctrl-a",
        criadoPor: "sem.convenio@cg.pb.gov.br",
      })
    ).rejects.toThrow(/ACESSO NEGADO/);

    expect(await prisma.convenio.count({ where: { identificador: "CV-2026-999" } })).toBe(0);
  });

  it("t10: a VIGÊNCIA é gravada no calendário do ente — 30/06 termina às 23:59:59 dele", async () => {
    const convenioId = await convenioDeTeste();
    const c = await prisma.convenio.findUniqueOrThrow({
      where: { id: convenioId },
      select: { vigenciaInicio: true, vigenciaFim: true },
    });
    // 01/01/2026 00:00 em São Paulo = 03:00Z; 30/06/2026 23:59:59.999 = 01/07T02:59:59.999Z.
    expect(c.vigenciaInicio.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(c.vigenciaFim.toISOString()).toBe("2026-07-01T02:59:59.999Z");
  });
});

async function movimentos(
  convenioId: string
): Promise<readonly { readonly tipo: never; readonly valor: ReturnType<typeof toMoney> }[]> {
  const linhas = await prisma.movimentoConvenio.findMany({
    where: { convenioId },
    select: { tipo: true, valor: true },
  });
  return linhas.map((m) => ({
    tipo: m.tipo as never,
    valor: toMoney(m.valor.toFixed(2)),
  }));
}

void OUTRO;
