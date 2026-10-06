import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenharDe2026, FONTE, liquidarDe2026, pagarDe2026, POR, semearM08 } from "../m08-restos-a-pagar/fixture-m08.js";
import { registrarMovimentoBancario } from "../m09-tesouraria/movimentacao.js";
import { anexarArquivo } from "./anexos.js";
import { listarAnexosDoPagamentoOuMovimento } from "./consultas.js";

/**
 * V36 — ANEXOS NO REGISTRO DE PAGAMENTO (TR 5.10.2.68) E NO MOVIMENTO BANCÁRIO (TR 5.10.2.21).
 *
 * O pagamento nasce pelos serviços (empenho, liquidação, pagamento na unidade 01001); o movimento, pela movimentação
 * bancária. A autorização é o ponto: o anexo do pagamento segue a UG do pagamento (quem anexa só na 01002 não anexa
 * no pagamento da 01001), e o do movimento é ato do ente (permissão de unidade não basta). N=2 em anexos e donos.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const PDF = new TextEncoder().encode("%PDF-1.4\n% comprovante de teste\n");
let pagamentoId = "";
let movimentoId = "";

async function usuarioComAnexarNa(identificador: string, unidadeOrcId: string): Promise<string> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
  const p = await prisma.perfil.create({
    data: { nome: `PERFIL-${identificador}`, descricao: "anexa só numa unidade", criadoPor: "TESTE", permissoes: { create: [{ acao: "ANEXAR_ARQUIVO", unidadeOrcId, criadoPor: "TESTE" }] } },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
  return identificador;
}

async function semear(): Promise<void> {
  await semearM08();
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-02", codigo: "01002", descricao: "Saúde", orgaoId: "org-01" } });
  const deps = criarM05Deps(prisma);
  const e = await empenharDe2026(deps, "1/2026", "1000.00");
  const l = await liquidarDe2026(deps, e, "1/2026", "1000.00");
  pagamentoId = await pagarDe2026(deps, l, "1/2026", "1000.00");

  await prisma.exercicio.createMany({ data: [{ ano: 2026, criadoPor: POR }], skipDuplicates: true });
  const bancos = await prisma.contaPcasp.findFirstOrThrow({ where: { codigo: "1.1.1.1.2.00.00" }, select: { id: true } });
  await prisma.contaPcasp.create({ data: { id: "c-rec-fin", codigo: "4.4.1.1.1.00.00", nome: "Receitas financeiras", naturezaSaldo: "CREDORA", nivel: 5, analitica: true } });
  await prisma.contaBancaria.create({ data: { id: "cb-mb", codigo: "CC-MB", descricao: "Movimento", fonteId: FONTE, contaContabilId: bancos.id } });
  await prisma.fonteDaContaBancaria.create({ data: { contaBancariaId: "cb-mb", fonteId: FONTE, criadoPor: POR } });
  const m = await registrarMovimentoBancario(prisma, {
    contaBancariaId: "cb-mb", fonteId: FONTE, tipo: "DEPOSITO", valor: "50.00", data: new Date("2026-09-02T12:00:00Z"),
    historico: "depósito de teste", contaContrapartidaId: "c-rec-fin", criadoPor: POR,
  });
  movimentoId = m.movimentoId;
}

const anexar = (dono: { pagamentoId: string } | { movimentoBancarioId: string }, criadoPor: string, nome = "comprovante.pdf") =>
  anexarArquivo(prisma, { nomeOriginal: nome, mimeType: "application/pdf", conteudo: PDF, ...dono, criadoPor });

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("M22 V36 — anexos no pagamento e no movimento bancário", () => {
  beforeEach(semear, 60000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: dois anexos no pagamento e um no movimento; cada lista traz só os do seu dono", async () => {
    await anexar({ pagamentoId }, POR, "comprovante.pdf");
    await anexar({ pagamentoId }, POR, "autorizacao.pdf");
    await anexar({ movimentoBancarioId: movimentoId }, POR, "aviso-do-banco.pdf");
    const doPagamento = await listarAnexosDoPagamentoOuMovimento(prisma, { pagamentoId }, POR);
    const doMovimento = await listarAnexosDoPagamentoOuMovimento(prisma, { movimentoBancarioId: movimentoId }, POR);
    expect(doPagamento.map((a) => a.nome)).toEqual(["comprovante.pdf", "autorizacao.pdf"]);
    expect(doMovimento.map((a) => a.nome)).toEqual(["aviso-do-banco.pdf"]);
  });

  it("t2: NEGAÇÃO — o anexo do pagamento segue a UG do pagamento: quem anexa só na 01002 é recusado nomeando a ação", async () => {
    const daSaude = await usuarioComAnexarNa("anexa-saude@cg.pb.gov.br", "uo-02");
    const daEducacao = await usuarioComAnexarNa("anexa-educacao@cg.pb.gov.br", "uo-01");
    expect(await recusa(() => anexar({ pagamentoId }, daSaude))).toMatch(/ACESSO NEGADO[\s\S]*ANEXAR_ARQUIVO/);
    await anexar({ pagamentoId }, daEducacao);
    expect(await prisma.anexo.count({ where: { pagamentoId } })).toBe(1);
  });

  it("t3: NEGAÇÃO — o anexo do movimento bancário é ato do ente: permissão de unidade não basta", async () => {
    const daEducacao = await usuarioComAnexarNa("anexa-educacao@cg.pb.gov.br", "uo-01");
    expect(await recusa(() => anexar({ movimentoBancarioId: movimentoId }, daEducacao))).toMatch(/ACESSO NEGADO[\s\S]*ANEXAR_ARQUIVO/);
    expect(await prisma.anexo.count({ where: { movimentoBancarioId: movimentoId } })).toBe(0);
  });

  it("t4: dono inexistente ou dois donos são recusados com o motivo, e nada é gravado", async () => {
    expect(await recusa(() => anexar({ pagamentoId: "nao-existe" }, POR))).toMatch(/Pagamento nao-existe não existe[\s\S]*Nada foi gravado/);
    expect(await recusa(() => anexar({ movimentoBancarioId: "nao-existe" }, POR))).toMatch(/Movimento bancário nao-existe não existe/);
    expect(
      await recusa(() => anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: PDF, pagamentoId, movimentoBancarioId: movimentoId, criadoPor: POR }))
    ).toMatch(/EXATAMENTE UM registro/);
    expect(await prisma.anexo.count()).toBe(0);
  });
});
