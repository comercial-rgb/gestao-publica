import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { roteiroEmpenho } from "./dominio.js";
import { empenhar } from "./servico.js";
import { conferirReferenciaExterna, registrarReferenciaExterna } from "./referencia-externa.js";

/**
 * V39-R3 (R3-017, V39-033) — A REFERÊNCIA EXTERNA DO EMPENHO: declarada por um, conferida por outro, uma vez; a
 * divergência diz o que não confere; o escopo é a UG do empenho; os vínculos internos do empenho não mudam.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "almoxarifado@cg.pb.gov.br";
let empenhoId = "";
let declarante = "";
let conferente = "";
let deFora = "";

async function usuarioCom(identificador: string, acoes: readonly string[], unidadeOrcId: string | null): Promise<string> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
  const p = await prisma.perfil.create({ data: { nome: `PERFIL-${identificador}`, descricao: "perfil restrito do teste", criadoPor: "TESTE", permissoes: { create: acoes.map((acao) => ({ acao: acao as "EMPENHAR", unidadeOrcId, criadoPor: "TESTE" })) } }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
  return identificador;
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "uo-01", codigo: "02016", descricao: "Fundo de Saúde", orgaoId: "org-01" }, { id: "uo-02", codigo: "02007", descricao: "Educação", orgaoId: "org-01" }] });
  await prisma.funcao.create({ data: { id: "fun-10", codigo: "10", nome: "Saúde" } });
  await prisma.subfuncao.create({ data: { id: "sub-301", codigo: "301", nome: "Atenção básica" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "Saúde" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "Atenção básica", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços de terceiros PJ" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, { id: "ficha-1", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-10", subfuncaoId: "sub-301", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "100000.00" });
  empenhoId = (await empenhar({ fichaId: "ficha-1", numero: "NE-1", tipo: "ORDINARIO", valor: "1000.00", data: meioDiaCivil("2026-03-10"), credorCpfCnpj: "12345678000195", historico: "serviço", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" }), criarM05Deps(prisma))).empenhoId;
  declarante = await usuarioCom("declara@cg.pb.gov.br", ["REGISTRAR_REFERENCIA_EXTERNA_DO_EMPENHO"], "uo-01");
  conferente = await usuarioCom("confere@cg.pb.gov.br", ["REGISTRAR_REFERENCIA_EXTERNA_DO_EMPENHO"], "uo-01");
  deFora = await usuarioCom("fora@cg.pb.gov.br", ["REGISTRAR_REFERENCIA_EXTERNA_DO_EMPENHO"], "uo-02");
}, 120000);
afterAll(async () => prisma.$disconnect());

describe("V39-R3 (R3-017) — a referência externa do empenho", { timeout: 120000 }, () => {
  it("declarada não é conferida; quem declarou não confere; outra pessoa confere uma vez; o empenho não muda", async () => {
    const antes = await prisma.empenho.findUniqueOrThrow({ where: { id: empenhoId }, select: { valor: true, contratoId: true, ordemDeCompraId: true } });
    const { id } = await registrarReferenciaExterna(prisma, { empenhoId, sistemaDeOrigem: "Sistema de compras da Saúde", identificador: "REQ-2026/0042", documento: "Despacho 12/2026", criadoPor: declarante });
    expect(await prisma.conferenciaDaReferenciaExterna.count()).toBe(0);
    await expect(registrarReferenciaExterna(prisma, { empenhoId, sistemaDeOrigem: "Sistema de compras da Saúde", identificador: "REQ-2026/0042", documento: "Outro", criadoPor: declarante })).rejects.toThrow(/já tem a referência REQ-2026\/0042/);
    await expect(conferirReferenciaExterna(prisma, { referenciaId: id, resultado: "CONFIRMADA", meio: "Consulta ao sistema de compras", criadoPor: declarante })).rejects.toThrow(/Quem declarou a referência REQ-2026\/0042 não a confere/);
    await expect(conferirReferenciaExterna(prisma, { referenciaId: id, resultado: "DIVERGENTE", meio: "Consulta ao sistema de compras", criadoPor: conferente })).rejects.toThrow(/Na divergência, diga o que não confere/);
    await conferirReferenciaExterna(prisma, { referenciaId: id, resultado: "CONFIRMADA", meio: "Consulta ao sistema de compras", criadoPor: conferente });
    await expect(conferirReferenciaExterna(prisma, { referenciaId: id, resultado: "CONFIRMADA", meio: "De novo", criadoPor: "confere2@cg.pb.gov.br" })).rejects.toThrow();
    expect(await prisma.conferenciaDaReferenciaExterna.count()).toBe(1);
    expect(await prisma.empenho.findUniqueOrThrow({ where: { id: empenhoId }, select: { valor: true, contratoId: true, ordemDeCompraId: true } })).toEqual(antes);
  });

  it("NEGAÇÃO: quem tem a ação em OUTRA unidade não declara nem confere a referência deste empenho", async () => {
    await expect(registrarReferenciaExterna(prisma, { empenhoId, sistemaDeOrigem: "Protocolo", identificador: "P-1", documento: "Ofício 1", criadoPor: deFora })).rejects.toThrow(/ACESSO NEGADO: o usuário "fora@cg\.pb\.gov\.br" não tem permissão para REGISTRAR_REFERENCIA_EXTERNA_DO_EMPENHO/);
    const { id } = await registrarReferenciaExterna(prisma, { empenhoId, sistemaDeOrigem: "Protocolo", identificador: "P-1", documento: "Ofício 1", criadoPor: declarante });
    await expect(conferirReferenciaExterna(prisma, { referenciaId: id, resultado: "CONFIRMADA", meio: "Consulta ao protocolo", criadoPor: deFora })).rejects.toThrow(/ACESSO NEGADO/);
    await conferirReferenciaExterna(prisma, { referenciaId: id, resultado: "DIVERGENTE", meio: "Consulta ao protocolo", observacao: "O protocolo P-1 é de outro credor", criadoPor: conferente });
    expect((await prisma.conferenciaDaReferenciaExterna.findFirstOrThrow({ select: { resultado: true } })).resultado).toBe("DIVERGENTE");
  });
});
