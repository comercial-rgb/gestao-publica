import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { semearRoteiroOrcamentario } from "./roteiro-orcamentario.js";
import { criarM02Deps } from "../modules/m02-planejamento/adapter-prisma.js";
import { criarFicha } from "../modules/m02-planejamento/servico.js";
import type { CriarFichaInput } from "../modules/m02-planejamento/dominio.js";
import {
  CLASSIFICACAO_VALIDA,
  SEED_ACOES,
  SEED_COS,
  SEED_FONTES,
  SEED_FUNCOES,
  SEED_NATUREZAS_DESPESA,
  SEED_ORGAOS,
  SEED_PROGRAMAS,
  SEED_SUBFUNCOES,
  SEED_UNIDADES,
} from "../modules/m02-planejamento/seed-minimo.js";
import { criarM03Deps } from "../modules/m03-creditos/adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "../modules/m03-creditos/servico.js";
import { registrarMovimentoDotacao } from "../modules/m05-despesa/dotacao-razao.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";
import type { Identidade } from "../modules/m16-travamento/autenticacao.js";
import { buscarOpcoes, LeituraDoCatalogoNegadaError } from "../lib/portas/opcoes-referenciadas.js";
import { meioDiaCivil } from "../packages/datas/index.js";

/**
 * ═══ A FICHA CRIADA PELA TELA NASCE SEM CRÉDITO (V6.2 U0 — CRIAR-FICHA-SEM-TELA) ═══
 *
 * O que este arquivo existe para impedir:
 *  · que criar ficha vire criar SALDO: a ficha da tela nasce com dotação inicial ZERO e o crédito
 *    dela só aparece por crédito adicional (lei + decreto), com a perna no razão daquele ato;
 *  · que a exceção do zero no razão se alargue: SÓ a dotação inicial zero dispensa a partida —
 *    qualquer outro movimento zero continua recusado pelo motor do M01;
 *  · que o seletor ofereça UO onde a sessão não tem CRIAR_FICHA, ou liste a quem não lê o planejamento;
 *  · que duplicidade, exercício fechado/inexistente, componente inexistente e UO de outra pessoa passem.
 *
 * FIXTURE N=2: duas unidades, duas fontes, dois usuários com escopos diferentes.
 * ⚠️ Prefixo `v62.` nas identidades de escopo: o `limparBanco` dá ADMIN às identidades das fixtures.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "m02@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

async function usuario(identificador: string, permissoes: readonly { acao: AcaoDoSistema; unidadeOrcId: string | null }[]): Promise<Identidade> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "seed-teste" }, select: { id: true, identificador: true } });
  const perfil = await prisma.perfil.create({ data: { nome: `perfil-${identificador}`, descricao: "teste", criadoPor: "seed-teste" }, select: { id: true } });
  for (const p of permissoes) await prisma.permissaoDePerfil.create({ data: { perfilId: perfil.id, acao: p.acao, unidadeOrcId: p.unidadeOrcId, criadoPor: "seed-teste" } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "seed-teste" } });
  return { usuarioId: u.id, identificador: u.identificador };
}

const SEM_CREDITO: CriarFichaInput = {
  exercicio: 2026,
  numero: 90,
  classificacao: { ...CLASSIFICACAO_VALIDA, naturezaDespesa: "319011" },
  exercicioFonte: 1,
  valorDotado: "0.00",
  criadoPor: POR,
};

beforeEach(async () => {
  await limparBanco(prisma);
  await semearRoteiroOrcamentario(prisma);
  await prisma.exercicio.createMany({ data: [{ ano: 2025, criadoPor: "TESTE" }, { ano: 2026, criadoPor: "TESTE" }] });
  const e2025 = await prisma.exercicio.findUniqueOrThrow({ where: { ano: 2025 }, select: { id: true } });
  await prisma.encerramentoExercicio.create({ data: { exercicioId: e2025.id, encerradoPor: "TESTE" } });
  await prisma.orgao.createMany({ data: [...SEED_ORGAOS, { id: "org-02", codigo: "02", nome: "Câmara" }] });
  await prisma.unidadeOrcamentaria.createMany({ data: [...SEED_UNIDADES, { id: "uo-02", codigo: "01002", descricao: "Secretaria de Saúde", orgaoId: "org-01" }] });
  await prisma.funcao.createMany({ data: [...SEED_FUNCOES] });
  await prisma.subfuncao.createMany({ data: [...SEED_SUBFUNCOES] });
  await prisma.programa.createMany({ data: [...SEED_PROGRAMAS] });
  await prisma.acao.createMany({ data: [...SEED_ACOES] });
  await prisma.naturezaDespesa.createMany({
    data: [...SEED_NATUREZAS_DESPESA, { id: "nd-319011", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos e Vantagens Fixas - Pessoal Civil" }],
  });
  await prisma.fonteRecurso.createMany({ data: [...SEED_FONTES] });
  await prisma.codigoAcompanhamento.createMany({ data: [...SEED_COS] });
});

describe("a ficha sem dotação — criar não é abrir crédito", () => {
  it("nasce com UMA dotação inicial ZERO, sem lançamento no razão, e com saldos zero", async () => {
    const id = await criarFicha(SEM_CREDITO, criarM02Deps(prisma));
    const movs = await prisma.movimentoDotacao.findMany({ where: { fichaId: id }, select: { id: true, tipo: true, valor: true } });
    expect(movs.map((m) => `${m.tipo}:${m.valor.toFixed(2)}`)).toEqual(["DOTACAO_INICIAL:0.00"]);
    expect(await prisma.partidaContabil.count({ where: { fichaId: id } })).toBe(0);
    const f = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id }, select: { saldoAutorizado: true, saldoDisponivel: true } });
    expect(`${f.saldoAutorizado.toFixed(2)}/${f.saldoDisponivel.toFixed(2)}`).toBe("0.00/0.00");
  });

  it("o crédito chega por LEI + DECRETO (especial, por anulação) — e esse ato é que lança no razão", async () => {
    const deps2 = criarM02Deps(prisma);
    const origem = await criarFicha({ ...SEM_CREDITO, numero: 1, classificacao: { ...CLASSIFICACAO_VALIDA }, valorDotado: "5000.00" }, deps2);
    const nova = await criarFicha(SEM_CREDITO, deps2);
    const deps3 = criarM03Deps(prisma);
    const lei = await criarLei({ numero: "77", ano: 2026, tipoCredito: "ESPECIAL", valorAutorizado: "1000.00", dataPublicacao: D(2026, 3, 1), criadoPor: POR }, deps3);
    const decreto = await criarDecreto({ leiId: lei, numero: "12", ano: 2026, data: D(2026, 3, 2), origemRecurso: "ANULACAO", criadoPor: POR }, deps3);
    await executarCredito({
      decretoId: decreto,
      criadoPor: POR,
      itens: [
        { fichaId: origem, tipo: "ANULACAO", valor: "1000.00", fonteId: "fnt-500" },
        { fichaId: nova, tipo: "SUPLEMENTACAO", valor: "1000.00", fonteId: "fnt-500" },
      ],
    }, deps3);
    const f = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: nova }, select: { saldoAutorizado: true, saldoDisponivel: true } });
    expect(`${f.saldoAutorizado.toFixed(2)}/${f.saldoDisponivel.toFixed(2)}`).toBe("1000.00/1000.00");
    expect(await prisma.partidaContabil.count({ where: { fichaId: nova } })).toBeGreaterThan(0);
    // O orçamento total NÃO mudou: anulou-se na origem o que se suplementou na nova.
    const o = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: origem }, select: { saldoAutorizado: true } });
    expect(o.saldoAutorizado.toFixed(2)).toBe("4000.00");
  });

  it("INSTRUMENTO: a exceção do zero é SÓ da dotação inicial — outro movimento zero continua indo ao roteiro", async () => {
    // ⚠️ MEDIDO ao escrever este teste: o funil do razão NÃO recusa partida de valor zero (a
    // validação de valor mora nos chamadores — `zValorPositivo` no M03). Por isso a prova da
    // estreiteza é a CONTAGEM de partidas, e não uma recusa: se a exceção se alargasse a qualquer
    // tipo, este movimento deixaria de lançar e a contagem cairia a zero. Pendência nomeada:
    // `MOVIMENTO-DE-DOTACAO-ZERO-NO-RAZAO`.
    const id = await criarFicha(SEM_CREDITO, criarM02Deps(prisma));
    // ⚠️ `tipoCredito` É OBRIGATÓRIO NO CRÉDITO ADICIONAL DESDE A V7.1 — o plano parte a
    // dotação adicional por tipo de crédito, e sem ele o movimento é recusado antes de gravar.
    // Aqui ele é SUPLEMENTAR porque o que se mede é a exceção do ZERO, não a classificação.
    await prisma.$transaction((tx) => registrarMovimentoDotacao(tx, { fichaId: id, tipo: "CREDITO_ADICIONAL", tipoCredito: "SUPLEMENTAR", valor: "0.00", origemTipo: "TESTE", criadoPor: POR, data: D(2026, 4, 1) }));
    expect(await prisma.partidaContabil.count({ where: { fichaId: id } })).toBe(2);
  });
});

describe("as recusas do caso de uso, cada uma com o motivo", () => {
  it("duplicidade: mesma classificação com outro número, e mesmo número com outra classificação", async () => {
    const deps = criarM02Deps(prisma);
    await criarFicha(SEM_CREDITO, deps);
    await expect(criarFicha({ ...SEM_CREDITO, numero: 91 }, deps)).rejects.toThrow(/Ficha duplicada/);
    await expect(criarFicha({ ...SEM_CREDITO, classificacao: { ...SEM_CREDITO.classificacao, fonte: "540" } }, deps)).rejects.toThrow(/Ficha duplicada/);
    expect(await prisma.fichaOrcamentaria.count()).toBe(1);
  });

  it("exercício ENCERRADO e exercício INEXISTENTE", async () => {
    const deps = criarM02Deps(prisma);
    await expect(criarFicha({ ...SEM_CREDITO, exercicio: 2025 }, deps)).rejects.toThrow(/encerrad/i);
    await expect(criarFicha({ ...SEM_CREDITO, exercicio: 2031 }, deps)).rejects.toThrow(/2031/);
    expect(await prisma.fichaOrcamentaria.count()).toBe(0);
  });

  it("componente inexistente e órgão incoerente com a unidade", async () => {
    const deps = criarM02Deps(prisma);
    await expect(criarFicha({ ...SEM_CREDITO, classificacao: { ...SEM_CREDITO.classificacao, naturezaDespesa: "319099" } }, deps)).rejects.toThrow(/naturezaDespesa="319099"/);
    await expect(criarFicha({ ...SEM_CREDITO, classificacao: { ...SEM_CREDITO.classificacao, orgao: "02" } }, deps)).rejects.toThrow(/não é o prefixo da UO/);
  });

  it("a UO de OUTRA pessoa: CRIAR_FICHA só na Saúde não cria na Educação — e cria na Saúde", async () => {
    const saude = await usuario("v62.planejador-saude", [{ acao: "CRIAR_FICHA", unidadeOrcId: "uo-02" }]);
    const deps = criarM02Deps(prisma);
    await expect(criarFicha({ ...SEM_CREDITO, criadoPor: saude.identificador }, deps)).rejects.toThrow(/CRIAR_FICHA/);
    const id = await criarFicha({ ...SEM_CREDITO, criadoPor: saude.identificador, classificacao: { ...SEM_CREDITO.classificacao, unidadeOrc: "01002" } }, deps);
    expect(id).not.toBe("");
  });
});

describe("o seletor referenciado da ficha — recorte e leitura", () => {
  it("a UO oferecida é SÓ onde a sessão tem CRIAR_FICHA; o global vê as duas", async () => {
    const global = await usuario("v62.global", [{ acao: "CRIAR_FICHA", unidadeOrcId: null }, { acao: "CONSULTAR_PLANEJAMENTO", unidadeOrcId: null }]);
    const saude = await usuario("v62.saude", [{ acao: "CRIAR_FICHA", unidadeOrcId: "uo-02" }, { acao: "CONSULTAR_PLANEJAMENTO", unidadeOrcId: null }]);
    const g = await buscarOpcoes(global, "unidades-para-ficha", { q: "", pagina: 1, contexto: {} });
    const s = await buscarOpcoes(saude, "unidades-para-ficha", { q: "", pagina: 1, contexto: {} });
    expect(g.opcoes.map((o) => o.valor)).toEqual(["01001", "01002"]);
    expect(s.opcoes.map((o) => o.valor)).toEqual(["01002"]);
    // Resolver o valor da OUTRA unidade pelo parâmetro direto também não a entrega.
    const direto = await buscarOpcoes(saude, "unidades-para-ficha", { q: "", pagina: 1, valor: "01001", contexto: {} });
    expect(direto.opcoes).toEqual([]);
  });

  it("consulta sem CRIAR_FICHA nenhuma: a lista vem VAZIA (não ofertar o que cairia)", async () => {
    const leitor = await usuario("v62.leitor", [{ acao: "CONSULTAR_PLANEJAMENTO", unidadeOrcId: null }]);
    const r = await buscarOpcoes(leitor, "unidades-para-ficha", { q: "", pagina: 1, contexto: {} });
    expect(r.opcoes).toEqual([]);
  });

  it("sem a leitura do planejamento: RECUSA nomeando, não lista vazia muda", async () => {
    const semLeitura = await usuario("v62.sem-leitura", [{ acao: "CRIAR_FICHA", unidadeOrcId: null }]);
    await expect(buscarOpcoes(semLeitura, "naturezas-de-despesa", { q: "3190", pagina: 1, contexto: {} })).rejects.toThrow(LeituraDoCatalogoNegadaError);
  });

  it("a busca casa código por prefixo e descrição sem caixa; catálogo inexistente recusa", async () => {
    const global = await usuario("v62.busca", [{ acao: "CONSULTAR_PLANEJAMENTO", unidadeOrcId: null }]);
    const porCodigo = await buscarOpcoes(global, "naturezas-de-despesa", { q: "3190", pagina: 1, contexto: {} });
    expect(porCodigo.opcoes.map((o) => o.valor)).toEqual(["319011"]);
    const porTexto = await buscarOpcoes(global, "naturezas-de-despesa", { q: "terceiros", pagina: 1, contexto: {} });
    expect(porTexto.opcoes.map((o) => o.valor)).toEqual(["339039"]);
    await expect(buscarOpcoes(global, "__proto__", { q: "", pagina: 1, contexto: {} })).rejects.toThrow(/Não há lista/);
  });
});
