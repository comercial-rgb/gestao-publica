import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { designarNoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";
import { situacaoDaOrdem } from "../modules/m11-licitacoes/execucao-do-contrato.js";
import { contratosNoAlcanceDasOrdens, listarOrdensDeServicoDaSessao, ORDENS_POR_PAGINA } from "../modules/m11-licitacoes/ordens-de-servico-da-sessao.js";

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
const fiscalDe: Record<string, string> = {};

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
    fiscalDe[id] = fisc.designacaoId;
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

  /**
   * V39-050 — além de uma página. N = uma página inteira + 5 no contrato A: as duas páginas juntas dão TODAS, sem
   * repetir, e o total é o do conjunto, não o da página. O fiscal de B, buscando pelo contrato de A, continua sem nada:
   * o filtro não abre alcance.
   */
  it("V39-050: mais de uma página de ordens se alcança pela página seguinte, e o filtro não abre alcance", async () => {
    const extras = ORDENS_POR_PAGINA + 3;
    const ordem0 = await prisma.ordemDeServicoDoContrato.findUniqueOrThrow({ where: { id: "os-ctr-a-1" } });
    await prisma.ordemDeServicoDoContrato.createMany({
      data: Array.from({ length: extras }, (_, i) => ({
        contratoId: "ctr-a", numero: i + 3, ano: 2026, finalidade: `Extra ${String(i + 3)}`, inicioPrevisto: ordem0.inicioPrevisto, fimPrevisto: ordem0.fimPrevisto,
        condicoesDeRecebimento: "Relatório do fiscal", gestorDesignacaoId: ordem0.gestorDesignacaoId, fiscalDesignacaoId: ordem0.fiscalDesignacaoId, criadoPor: ADMIN,
      })),
    });
    const p1 = await listarOrdensDeServicoDaSessao(prisma, FISCAL_A, { pagina: 1 });
    const p2 = await listarOrdensDeServicoDaSessao(prisma, FISCAL_A, { pagina: 2 });
    expect([p1.total, p1.paginas, p1.ordens.length, p2.pagina, p2.ordens.length]).toEqual([extras + 2, 2, ORDENS_POR_PAGINA, 2, extras + 2 - ORDENS_POR_PAGINA]);
    const todas = new Set([...p1.ordens, ...p2.ordens].map((o) => o.id));
    expect(todas.size).toBe(extras + 2);
    expect(todas.has("os-ctr-a-1") && todas.has("os-ctr-a-2")).toBe(true);
    // página fora do intervalo vira a última, não uma lista vazia que pareceria "acabou"
    expect((await listarOrdensDeServicoDaSessao(prisma, FISCAL_A, { pagina: 99 })).pagina).toBe(2);
    // o fiscal de B não alcança A nem buscando por ele
    const b = await listarOrdensDeServicoDaSessao(prisma, FISCAL_B, { busca: "CT-A" });
    expect([b.total, b.ordens.length]).toEqual([0, 0]);
  });

  it("V39-050: a busca e a situação filtram no banco, com a MESMA régua da situação (N=2 por situação)", async () => {
    const emitir = async (ordemId: string, contrato: string): Promise<void> => {
      await prisma.emissaoDaOrdemDeServico.create({ data: { ordemId, data: new Date(`${dia(0)}T15:00:00Z`), inicioAutorizado: new Date(`${dia(1)}T15:00:00Z`), designacaoId: fiscalDe[contrato] ?? "", manifesto: { teste: true }, sha256: "0".repeat(64), criadoPor: ADMIN } });
    };
    await emitir("os-ctr-a-1", "ctr-a");
    await emitir("os-ctr-a-2", "ctr-a");
    // a-2: suspensa e retomada e suspensa de novo (o ÚLTIMO decide); a-1: suspensa e retomada (emitida)
    let n = 0;
    const mover = async (ordemId: string, contrato: string, tipo: "SUSPENSAO" | "RETOMADA"): Promise<void> => {
      n += 1;
      await prisma.movimentoDeExecucaoDaOrdem.create({ data: { ordemId, tipo, data: new Date(`${dia(0)}T1${String(n)}:00:00Z`), motivo: `movimento ${String(n)}`, designacaoId: fiscalDe[contrato] ?? "", criadoPor: ADMIN } });
    };
    await mover("os-ctr-a-1", "ctr-a", "SUSPENSAO");
    await mover("os-ctr-a-1", "ctr-a", "RETOMADA");
    await mover("os-ctr-a-2", "ctr-a", "SUSPENSAO");
    await mover("os-ctr-a-2", "ctr-a", "RETOMADA");
    await mover("os-ctr-a-2", "ctr-a", "SUSPENSAO");
    await prisma.descarteDaOrdemDeServico.create({ data: { ordemId: "os-ctr-b-1", motivo: "descartada no teste", criadoPor: ADMIN } });

    const ids = async (f: Parameters<typeof listarOrdensDeServicoDaSessao>[2]): Promise<readonly string[]> =>
      (await listarOrdensDeServicoDaSessao(prisma, FINANCEIRO, f)).ordens.map((o) => o.id).sort();
    expect(await ids({ situacao: "EMITIDA" })).toEqual(["os-ctr-a-1"]);
    expect(await ids({ situacao: "SUSPENSA" })).toEqual(["os-ctr-a-2"]);
    expect(await ids({ situacao: "DESCARTADA" })).toEqual(["os-ctr-b-1"]);
    expect(await ids({ situacao: "RASCUNHO" })).toEqual(["os-ctr-b-2"]);
    // cada uma, lida sem filtro, tem a situação pela qual foi filtrada
    const todas = (await listarOrdensDeServicoDaSessao(prisma, FINANCEIRO)).ordens;
    expect(Object.fromEntries(todas.map((o) => [o.id, o.situacao]))).toEqual({ "os-ctr-a-1": "EMITIDA", "os-ctr-a-2": "SUSPENSA", "os-ctr-b-1": "DESCARTADA", "os-ctr-b-2": "RASCUNHO" });
    expect(await ids({ busca: "2/2026" })).toEqual(["os-ctr-a-2", "os-ctr-b-2"]);
    expect(await ids({ busca: "ct-b" })).toEqual(["os-ctr-b-1", "os-ctr-b-2"]);
    expect(await ids({ busca: "Serviço 1 de" })).toEqual(["os-ctr-a-1", "os-ctr-b-1"]);
    expect(await ids({ ano: 2025 })).toEqual([]);
    expect(await ids({ busca: "ct-a", situacao: "SUSPENSA" })).toEqual(["os-ctr-a-2"]);
  });

  it("a situação é uma régua só (pura): descartada vence; sem emissão é rascunho; o ÚLTIMO movimento decide entre suspensa e emitida", () => {
    expect(situacaoDaOrdem({ descarte: { id: "d" }, emissao: { data: 1 }, movimentos: [{ tipo: "SUSPENSAO" }] })).toBe("DESCARTADA");
    expect(situacaoDaOrdem({ descarte: null, emissao: null, movimentos: [] })).toBe("RASCUNHO");
    expect(situacaoDaOrdem({ descarte: null, emissao: { data: 1 }, movimentos: [{ tipo: "RETOMADA" }, { tipo: "SUSPENSAO" }] })).toBe("SUSPENSA");
    expect(situacaoDaOrdem({ descarte: null, emissao: { data: 1 }, movimentos: [{ tipo: "SUSPENSAO" }, { tipo: "RETOMADA" }] })).toBe("EMITIDA");
  });
});
