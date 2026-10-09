import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { designarNoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";
import { situacaoDaOrdem } from "../modules/m11-licitacoes/execucao-do-contrato.js";
import { contratosNoAlcanceDasOrdens, listarOrdensDeServicoDaSessao } from "../modules/m11-licitacoes/ordens-de-servico-da-sessao.js";

/**
 * V38 (AUD-122) — A LISTA DE ORDENS DE SERVIÇO alcança os mesmos contratos que a tela do contrato: designação vigente,
 * administrador da fiscalização, ou visão financeira (ação de empenhar, liquidar, pagar ou ler licitações/despesa).
 * Contratos N=2 (A e B), cada um com o seu fiscal: "só o meu" e "todos" têm de ser distinguíveis. A negação afirma o
 * motivo pela forma do resultado (`todos: false`, `ids` vazio), não só a lista vazia.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "plataforma.admin@teste.local";
const FISCAL_A = "fiscal.a@teste.local";
const FISCAL_B = "fiscal.b@teste.local";
const GESTOR = "gestor@teste.local";
const FINANCEIRO = "tesouraria@teste.local";
const NINGUEM = "planejamento@teste.local";
const INATIVO = "inativo@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));

async function conta(identificador: string, acoes: readonly string[], documento?: string, ativo = true): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, ativo, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  if (documento !== undefined) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: identificador, criadoPor: "SEED" } } } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
  }
}

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO"], "11144477735");
  await conta(FISCAL_A, ["REGISTRAR_OCORRENCIA_DE_FISCALIZACAO"], "52998224725");
  await conta(FISCAL_B, ["REGISTRAR_OCORRENCIA_DE_FISCALIZACAO"], "39053344705");
  // Quem gere não fiscaliza o mesmo contrato (segregação do domínio): um gestor próprio para os dois contratos.
  await conta(GESTOR, ["REGISTRAR_OCORRENCIA_DE_FISCALIZACAO"], "86288366757");
  await conta(FINANCEIRO, ["LIQUIDAR"]);
  await conta(NINGUEM, ["CADASTRAR_LOA"]);
  await conta(INATIVO, ["LIQUIDAR"], undefined, false);
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0300", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços", valorLicitado: "10000.00", criadoPor: "SEED" } });
  for (const [id, numero, fiscal] of [["ctr-a", "CT-A", FISCAL_A], ["ctr-b", "CT-B", FISCAL_B]] as const) {
    await prisma.contrato.create({ data: { id, numeroContrato: numero, processoId: "proc", contratadoDocumento: "12345678000195", contratadoNome: `Serviços ${numero}`, valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-100)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(100)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
    const gestor = await designarNoContrato(prisma, { contratoId: id, papel: "GESTOR", usuarioIdentificador: GESTOR, atoDesignacao: `Portaria G-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN });
    const fisc = await designarNoContrato(prisma, { contratoId: id, papel: "FISCAL", usuarioIdentificador: fiscal, atoDesignacao: `Portaria F-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN });
    // Duas ordens por contrato (rascunhos: a lista não depende da emissão para existir).
    for (const n of [1, 2]) {
      await prisma.ordemDeServicoDoContrato.create({
        data: {
          id: `os-${id}-${String(n)}`, contratoId: id, numero: n, ano: 2026, finalidade: `Serviço ${String(n)} de ${numero}`,
          inicioPrevisto: new Date(`${dia(1)}T15:00:00Z`), fimPrevisto: new Date(`${dia(30)}T15:00:00Z`), condicoesDeRecebimento: "Relatório do fiscal",
          gestorDesignacaoId: gestor.designacaoId, fiscalDesignacaoId: fisc.designacaoId, criadoPor: ADMIN,
        },
      });
    }
  }
}, 120_000);

describe("V38 — as ordens de serviço da sessão (AUD-122)", () => {
  it("cada fiscal vê só as ordens do seu contrato; o financeiro vê as dos dois; quem não alcança nenhum, nem o inativo, vê nada", async () => {
    const ids = async (u: string): Promise<readonly string[]> => (await listarOrdensDeServicoDaSessao(prisma, u)).ordens.map((o) => o.id).sort();
    expect(await ids(FISCAL_A)).toEqual(["os-ctr-a-1", "os-ctr-a-2"]);
    expect(await ids(FISCAL_B)).toEqual(["os-ctr-b-1", "os-ctr-b-2"]);
    expect(await ids(FINANCEIRO)).toEqual(["os-ctr-a-1", "os-ctr-a-2", "os-ctr-b-1", "os-ctr-b-2"]);
    expect(await ids(NINGUEM)).toEqual([]);
    expect(await ids(INATIVO)).toEqual([]);
    // O motivo, pela forma do alcance: designação recorta por contrato; financeiro é "todos"; sem acesso, nada.
    expect(await contratosNoAlcanceDasOrdens(prisma, FISCAL_A)).toEqual({ todos: false, ids: ["ctr-a"] });
    expect(await contratosNoAlcanceDasOrdens(prisma, FINANCEIRO)).toEqual({ todos: true, ids: [] });
    expect(await contratosNoAlcanceDasOrdens(prisma, NINGUEM)).toEqual({ todos: false, ids: [] });
    expect(await contratosNoAlcanceDasOrdens(prisma, INATIVO)).toEqual({ todos: false, ids: [] });

    const a = await listarOrdensDeServicoDaSessao(prisma, FISCAL_A);
    expect(a.todos).toBe(false);
    expect(a.ordens.find((o) => o.id === "os-ctr-a-1")).toMatchObject({ contrato: "CT-A", contratado: "Serviços CT-A", numero: 1, ano: 2026, situacao: "RASCUNHO", emitidaEm: null, empenho: null });
  });

  it("a situação é uma régua só (pura): descartada vence; sem emissão é rascunho; o ÚLTIMO movimento decide entre suspensa e emitida", () => {
    expect(situacaoDaOrdem({ descarte: { id: "d" }, emissao: { data: 1 }, movimentos: [{ tipo: "SUSPENSAO" }] })).toBe("DESCARTADA");
    expect(situacaoDaOrdem({ descarte: null, emissao: null, movimentos: [] })).toBe("RASCUNHO");
    expect(situacaoDaOrdem({ descarte: null, emissao: { data: 1 }, movimentos: [{ tipo: "RETOMADA" }, { tipo: "SUSPENSAO" }] })).toBe("SUSPENSA");
    expect(situacaoDaOrdem({ descarte: null, emissao: { data: 1 }, movimentos: [{ tipo: "SUSPENSAO" }, { tipo: "RETOMADA" }] })).toBe("EMITIDA");
  });
});
