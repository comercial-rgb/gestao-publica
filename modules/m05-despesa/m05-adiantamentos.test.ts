import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { declararRoteiroPatrimonial } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { roteiroEmpenho } from "./dominio.js";
import { empenhar } from "./servico.js";
import {
  aprovarPrestacaoDeAdiantamento,
  concederAdiantamento,
  listarAdiantamentos,
  registrarPrestacaoDeAdiantamento,
  rejeitarPrestacaoDeAdiantamento,
} from "./adiantamentos.js";
import { listarDiariasPublicas } from "../../lib/portas/diarias-publicas.js";

/**
 * V32 — DIÁRIAS E SUPRIMENTO DE FUNDOS. REGIME: PROFUNDIDADE (saldo do empenho, trinco, razão de controle).
 *
 * À mão, t1 — um empenho de diárias de 1.000,00 do servidor S:
 *   concessão D-1: 2 × 200,00 = 400,00   · concessão D-2: 2,5 × 200,00 = 500,00   → concedido 900,00
 *   terceira de 200,00: cabem 100,00 → RECUSA.  Controle: responsabilidade a comprovar 900,00 (D 7 × C 8).
 *   aprovar a prestação de D-1 (comprovado 300 + devolvido 100): baixa 400,00 → a comprovar 500,00.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const LEITOR = "so.consulta.adiantamento@cg.pb.gov.br";
const SERVIDOR = "12345678909";
const OUTRO = "98765432100";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const A_COMPROVAR = "7.9.1.1.1.00.00";
const RESPONSAVEL = "8.9.1.1.1.00.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const FUNDAMENTO = "Plano do Tribunal: responsabilidade por adiantamento concedido a comprovar, em contas de controle.";

let numero = 0;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-acomp", codigo: A_COMPROVAR, nome: "Adiantamentos a comprovar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-resp", codigo: RESPONSAVEL, nome: "Responsáveis por adiantamentos", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
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
      { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  for (const [id, nd, n] of [["ficha-14", "nd-14", 1], ["ficha-30", "nd-30", 2]] as const) {
    await criarFichaDeTeste(prisma, {
      id, numero: n, exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
      programaId: "prg", acaoId: "aca", fonteId: "f500", naturezaDespesaId: nd, valorDotado: "100000.00",
    });
  }
  const perfil = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_ADIANTAMENTO", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_DESPESA", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
}

async function roteiros(): Promise<void> {
  for (const especie of ["DIARIA", "SUPRIMENTO_DE_FUNDOS"]) {
    await declararRoteiroPatrimonial(prisma, { familia: "ADIANTAMENTO", chave: `CONCESSAO/${especie}`, contaDebitoCodigo: A_COMPROVAR, contaCreditoCodigo: RESPONSAVEL, historicoPadrao: "Adiantamento concedido", fundamento: FUNDAMENTO, criadoPor: POR });
    await declararRoteiroPatrimonial(prisma, { familia: "ADIANTAMENTO", chave: `BAIXA/${especie}`, contaDebitoCodigo: RESPONSAVEL, contaCreditoCodigo: A_COMPROVAR, historicoPadrao: "Adiantamento comprovado", fundamento: FUNDAMENTO, criadoPor: POR });
  }
}

async function empenho(ficha: "ficha-14" | "ficha-30", valor: string, credor = SERVIDOR): Promise<string> {
  numero += 1;
  const r = await empenhar(
    {
      fichaId: ficha, numero: `2026NE${String(numero).padStart(6, "0")}`, tipo: "ESTIMATIVO", valor,
      data: new Date("2026-03-02T12:00:00Z"), credorCpfCnpj: credor, historico: "Adiantamento a servidor",
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMPENHO,
    criarM05Deps(prisma)
  );
  return r.empenhoId;
}

const diaria = (empenhoId: string, num: string, qtd: string, o: { por?: string; doc?: string } = {}) =>
  concederAdiantamento(prisma, {
    especie: "DIARIA", numero: num, empenhoId, beneficiarioNome: "Servidora Maria", beneficiarioDocumento: o.doc ?? SERVIDOR,
    finalidade: "Capacitação no Tribunal de Contas", destino: "João Pessoa", diaInicio: "2026-03-10", diaFim: "2026-03-12",
    quantidadeDeDiarias: qtd, valorUnitario: "200.00", valor: (Number(qtd.replace(",", ".")) * 200).toFixed(2),
    atoAutorizativo: "Lei Municipal 1.000/2020", diaPrazoDePrestacao: "2026-03-20", diaConcessao: "2026-03-05", criadoPor: o.por ?? POR,
  });

const suprimento = (empenhoId: string, num: string, valor: string, diaConcessao: string, diaPrazo: string) =>
  concederAdiantamento(prisma, {
    especie: "SUPRIMENTO_DE_FUNDOS", numero: num, empenhoId, beneficiarioNome: "Servidora Maria", beneficiarioDocumento: SERVIDOR,
    finalidade: "Pequenas compras de pronto pagamento da secretaria", diaInicio: diaConcessao, diaFim: diaPrazo, valor,
    atoAutorizativo: "Decreto Municipal 50/2026", diaPrazoDePrestacao: diaPrazo, diaConcessao, criadoPor: POR,
  });

async function saldo(codigo: string, credora = false): Promise<string> {
  const s = await saldoDasContas(prisma, [codigo], null);
  return (credora ? s.negated() : s).toFixed(2);
}

describe("V32 — diárias e suprimento de fundos", () => {
  beforeEach(semear);

  it("t1: N=2 diárias num empenho — o controle soma, a terceira que não cabe é recusada, a aprovação baixa", async () => {
    await roteiros();
    const e = await empenho("ficha-14", "1000.00");
    await diaria(e, "D-1", "2");
    await diaria(e, "D-2", "2,5");
    await expect(diaria(e, "D-3", "1")).rejects.toThrow(/cabem 100\.00[\s\S]*pede 200\.00/);
    expect(await saldo(A_COMPROVAR)).toBe("900.00");
    expect(await saldo(RESPONSAVEL, true)).toBe("900.00");

    const d1 = (await prisma.concessaoDeAdiantamento.findFirstOrThrow({ where: { numero: "D-1" }, select: { id: true } })).id;
    const registrar = (comprovado: string, devolvido: string) =>
      registrarPrestacaoDeAdiantamento(prisma, { concessaoId: d1, valorComprovado: comprovado, valorDevolvido: devolvido, relatorio: "Relatório de viagem com certificado de participação.", diaApresentacao: "2026-03-15", criadoPor: POR });
    await expect(registrar("300.00", "50.00")).rejects.toThrow(/somam 350\.00[\s\S]*400\.00/);
    const p1 = await registrar("300.00", "100.00");
    await expect(registrar("400.00", "0.00")).rejects.toThrow(/em análise/);
    await rejeitarPrestacaoDeAdiantamento(prisma, { prestacaoId: p1.prestacaoId, motivo: "Falta o certificado assinado.", diaDecisao: "2026-03-16", criadoPor: POR });
    expect(await saldo(A_COMPROVAR)).toBe("900.00");
    // V35: a aprovação confere a devolução contra as anulações; aqui não há pagamento, então a prestação aprovada
    // comprova o valor inteiro (a devolução conferida é medida em m05-adiantamentos-movimento m3).
    const p2 = await registrar("400.00", "0.00");
    await aprovarPrestacaoDeAdiantamento(prisma, { prestacaoId: p2.prestacaoId, motivo: "Comprovantes conferidos.", diaDecisao: "2026-03-18", criadoPor: POR });
    await expect(aprovarPrestacaoDeAdiantamento(prisma, { prestacaoId: p2.prestacaoId, motivo: "Segunda aprovação.", diaDecisao: "2026-03-18", criadoPor: POR })).rejects.toThrow(/já foi decidida/);
    expect(await saldo(A_COMPROVAR)).toBe("500.00");
    const lista = await listarAdiantamentos(prisma, new Date("2026-03-19T12:00:00Z"));
    expect(lista.map((l) => [l.numero, l.situacao])).toEqual([["D-1", "COMPROVADA"], ["D-2", "A_COMPROVAR"]]);
  });

  it("t2: duas concessões simultâneas que juntas passam do empenho — só uma grava", async () => {
    await roteiros();
    const e = await empenho("ficha-14", "1000.00");
    const r = await Promise.allSettled([diaria(e, "C-1", "3"), diaria(e, "C-2", "3")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected").map((x) => String((x as PromiseRejectedResult).reason))).toEqual([expect.stringMatching(/cabem 400\.00/)]);
    expect(await prisma.concessaoDeAdiantamento.count()).toBe(1);
    expect(await saldo(A_COMPROVAR)).toBe("600.00");
  });

  it("t3: suprimento — quem está em atraso ou já responde por dois não recebe outro (art. 69)", async () => {
    await roteiros();
    const e = await empenho("ficha-30", "5000.00");
    await suprimento(e, "S-1", "500.00", "2026-02-01", "2026-02-28");
    await expect(suprimento(e, "S-2", "500.00", "2026-03-05", "2026-03-31")).rejects.toThrow(/S-1 vencida[\s\S]*art\. 69/);
    const s1 = (await prisma.concessaoDeAdiantamento.findFirstOrThrow({ where: { numero: "S-1" }, select: { id: true } })).id;
    const p = await registrarPrestacaoDeAdiantamento(prisma, { concessaoId: s1, valorComprovado: "500.00", valorDevolvido: "0.00", relatorio: "Notas fiscais das compras de pronto pagamento.", diaApresentacao: "2026-03-01", criadoPor: POR });
    await aprovarPrestacaoDeAdiantamento(prisma, { prestacaoId: p.prestacaoId, motivo: "Notas conferidas.", diaDecisao: "2026-03-02", criadoPor: POR });
    await suprimento(e, "S-2", "500.00", "2026-03-05", "2026-04-30");
    await suprimento(e, "S-3", "500.00", "2026-03-06", "2026-04-30");
    await expect(suprimento(e, "S-4", "500.00", "2026-03-07", "2026-04-30")).rejects.toThrow(/dois suprimentos sem prestação aprovada \(S-2, S-3\)/);
  });

  it("t4: as recusas nomeiam o motivo e nada é gravado", async () => {
    const e14 = await empenho("ficha-14", "1000.00");
    await expect(diaria(e14, "R-0", "1")).rejects.toThrow(/Não há roteiro para a concessão de diária/);
    await roteiros();
    const e30 = await empenho("ficha-30", "1000.00");
    await expect(diaria(e30, "R-1", "1")).rejects.toThrow(/elemento 14 ou 15[\s\S]*339030/);
    await expect(suprimento(e14, "R-2", "100.00", "2026-03-05", "2026-03-31")).rejects.toThrow(/não se paga com empenho de diárias/);
    await expect(diaria(e14, "R-3", "1", { doc: OUTRO })).rejects.toThrow(/empenhe em nome do beneficiário/);
    await expect(diaria(e14, "R-4", "1", { por: LEITOR })).rejects.toThrow(/ACESSO NEGADO[\s\S]*EMPENHAR/);
    expect(await prisma.concessaoDeAdiantamento.count()).toBe(0);
    expect(await saldo(A_COMPROVAR)).toBe("0.00");
  });

  it("t5: o portal publica as diárias do exercício com o CPF mascarado — o número cru nunca sai", async () => {
    await roteiros();
    const e = await empenho("ficha-14", "1000.00");
    await diaria(e, "P-1", "2");
    await diaria(e, "P-2", "0,5");
    const pub = await listarDiariasPublicas(2026);
    expect(pub.linhas.map((l) => [l.numero, l.valor, l.quantidade, l.beneficiarioDocumento, l.prestacaoAprovada])).toEqual([
      ["P-1", "400.00", "2.0", "***.456.789-**", false],
      ["P-2", "100.00", "0.5", "***.456.789-**", false],
    ]);
    expect(pub.total).toBe("500.00");
    expect(JSON.stringify(pub)).not.toContain(SERVIDOR);
    expect((await listarDiariasPublicas(2025)).linhas).toEqual([]);
  });
});
