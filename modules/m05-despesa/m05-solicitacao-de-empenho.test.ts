import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { AREA_DA_ACAO } from "../../lib/portas/navegacao-permissoes.js";
import { aplicarAtualizacaoDePermissoes } from "../m16-travamento/atualizacoes-de-permissoes.js";
import { criarM05Deps, DIMENSOES_DO_EMPENHO, empenhadoLiquidoDoConvenio } from "./adapter-prisma.js";
import { anularEmpenhoParcial, estornarAnulacaoParcial } from "./anulacao-parcial.js";
import { roteiroEmpenho, type RoteiroContabil } from "./dominio.js";
import { toMoney } from "../../packages/contracts/index.js";
import { anularEmpenho, empenhar } from "./servico.js";
import {
  autorizarSolicitacaoDeEmpenho,
  cancelarSolicitacaoDeEmpenho,
  exigirSolicitacaoParaEmpenho,
  listarSolicitacoesDeEmpenho,
  rejeitarSolicitacaoDeEmpenho,
  situacaoDaSolicitacao,
  solicitarEmpenho,
} from "./solicitacao-de-empenho.js";
import type { M05Deps } from "./ports.js";
import { cadastrarCampanhaPublicitaria, empenhadoLiquidoDaCampanha } from "./campanha-publicitaria.js";

/**
 * V22 — A SOLICITAÇÃO DE EMPENHO: solicitar, autorizar (ou rejeitar), e só então emitir.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 *   · a situação é DERIVADA (sem coluna) e o empenho emitido vence tudo;
 *   · quem solicita NÃO decide a própria solicitação — recusa com o motivo, nada gravado;
 *   · autorizar exige a ação NO ESCOPO da unidade da ficha — recusa nomeando a unidade;
 *   · o empenho só nasce de solicitação AUTORIZADA, e uma autorização vale para UM empenho,
 *     inclusive sob corrida;
 *   · anular o empenho NÃO devolve a solicitação (decisão declarada no módulo);
 *   · o convênio no empenho: a anulação total, a parcial e o estorno da parcial COPIAM o vínculo,
 *     e a soma por convênio fecha (N=2);
 *   · a atualização de permissões v39 leva as duas ações a um perfil legado, no escopo certo.
 *
 * ⚠️ AS IDENTIDADES POSITIVAS são as da fixture (ADMIN: todas as ações). O ATOR NEGATIVO do escopo
 * é um usuário criado AQUI, com perfil restrito — nenhuma identidade da fixture serve para isso.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const SOLICITANTE = "m05@cg.pb.gov.br";
const AUTORIDADE = "m05b@cg.pb.gov.br";
const ORDENADOR_A = "ordenador.a@teste.local";
const UG_A = "sol-uo-a";
const UG_B = "sol-uo-b";
const FICHA_A = "sol-ficha-a";
const FICHA_B = "sol-ficha-b";
const CREDOR = "12345678000199";
const OUTRO_CREDOR = "98765432000110";
const DATA = new Date("2026-04-10T15:00:00Z");

const CONTAS = [
  { id: "s-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "s-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "s-conv", codigo: "8.1.1.1.1.00.00", nome: "Convênios a comprovar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
];
const R_EMPENHO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});

let deps: M05Deps;

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "sol-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: UG_A, codigo: "01001", descricao: "Saúde", orgaoId: "sol-org" },
      { id: UG_B, codigo: "01002", descricao: "Educação", orgaoId: "sol-org" },
    ],
  });
  await prisma.funcao.create({ data: { id: "sol-fun", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sol-sub", codigo: "122", nome: "Administração Geral" } });
  await prisma.programa.create({ data: { id: "sol-prg", codigo: "0001", descricao: "Gestão" } });
  await prisma.acao.create({ data: { id: "sol-aca", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "sol-nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
  });
  await prisma.fonteRecurso.create({ data: { id: "sol-fnt", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  for (const [id, ug, numero] of [[FICHA_A, UG_A, 1], [FICHA_B, UG_B, 2]] as const) {
    await criarFichaDeTeste(prisma, {
      id, exercicio: 2026, numero, orgaoId: "sol-org", unidadeOrcId: ug, funcaoId: "sol-fun", subfuncaoId: "sol-sub",
      programaId: "sol-prg", acaoId: "sol-aca", naturezaDespesaId: "sol-nd", fonteId: "sol-fnt", valorDotado: "100000.00",
    });
  }
  // O ator NEGATIVO do escopo: autoriza solicitação SÓ na Saúde (UG_A).
  const perfil = await prisma.perfil.create({
    data: {
      nome: "ORDENADOR-SAUDE",
      descricao: "autoriza solicitação de empenho só na Saúde",
      criadoPor: "TESTE",
      permissoes: { create: [{ acao: "AUTORIZAR_SOLICITACAO_DE_EMPENHO", unidadeOrcId: UG_A, criadoPor: "TESTE" }] },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: ORDENADOR_A, nome: "Ordenador Saúde", criadoPor: "TESTE" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" } });
  deps = criarM05Deps(prisma);
}, 120_000);

let seq = 0;
async function solicitar(p: { ficha?: string; valor?: string; por?: string; convenioId?: string } = {}): Promise<string> {
  seq += 1;
  const r = await solicitarEmpenho(prisma, {
    fichaId: p.ficha ?? FICHA_A,
    numero: `SOL-${seq}`,
    credorCpfCnpj: "12.345.678/0001-99",
    valor: p.valor ?? "1000.00",
    tipo: "ORDINARIO",
    categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
    historico: "Contratação de serviço de manutenção predial",
    ...(p.convenioId !== undefined ? { convenioId: p.convenioId } : {}),
    criadoPor: p.por ?? SOLICITANTE,
  });
  return r.solicitacaoId;
}

async function emitir(p: { solicitacaoId?: string; valor?: string; credor?: string; ficha?: string; numero?: string; convenioId?: string; campanhaId?: string; data?: Date }) {
  seq += 1;
  return empenhar(
    {
      fichaId: p.ficha ?? FICHA_A,
      numero: p.numero ?? `2026NE${String(seq).padStart(4, "0")}`,
      tipo: "ORDINARIO",
      valor: p.valor ?? "1000.00",
      data: p.data ?? DATA,
      credorCpfCnpj: p.credor ?? CREDOR,
      historico: "Empenho emitido da solicitação",
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      ...(p.solicitacaoId !== undefined ? { solicitacaoDeEmpenhoId: p.solicitacaoId } : {}),
      ...(p.convenioId !== undefined ? { convenioId: p.convenioId } : {}),
      ...(p.campanhaId !== undefined ? { campanhaPublicitariaId: p.campanhaId } : {}),
      criadoPor: AUTORIDADE,
    },
    R_EMPENHO,
    deps
  );
}

async function situacao(id: string): Promise<string> {
  const l = await listarSolicitacoesDeEmpenho(prisma, { exercicio: 2026 });
  return l.find((x) => x.id === id)!.situacao;
}

describe("a situação derivada (pura)", () => {
  it("t0 sem movimento é PENDENTE; o último movimento manda; o empenho vence tudo", () => {
    const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));
    expect(situacaoDaSolicitacao([], false)).toBe("PENDENTE");
    // N=2 na ordem: a mesma dupla em ordens diferentes dá situações diferentes
    expect(situacaoDaSolicitacao([{ tipo: "AUTORIZADA", criadoEm: t(1) }, { tipo: "CANCELADA", criadoEm: t(2) }], false)).toBe("CANCELADA");
    expect(situacaoDaSolicitacao([{ tipo: "CANCELADA", criadoEm: t(2) }, { tipo: "AUTORIZADA", criadoEm: t(1) }], false)).toBe("CANCELADA");
    expect(situacaoDaSolicitacao([{ tipo: "REJEITADA", criadoEm: t(1) }], false)).toBe("REJEITADA");
    expect(situacaoDaSolicitacao([{ tipo: "AUTORIZADA", criadoEm: t(1) }], true)).toBe("EMPENHADA");
    expect(situacaoDaSolicitacao([], true)).toBe("EMPENHADA");
  });
});

describe("solicitar, autorizar, rejeitar — com banco", () => {
  it("t1 solicitar grava PENDENTE, com o documento do credor normalizado e sem compromisso de saldo", async () => {
    const antes = await prisma.movimentoDotacao.count({ where: { fichaId: FICHA_A } });
    const id = await solicitar();
    expect(await situacao(id)).toBe("PENDENTE");
    const s = await prisma.solicitacaoDeEmpenho.findUniqueOrThrow({ where: { id } });
    expect(s.credorCpfCnpj).toBe(CREDOR);
    expect(s.valor.toFixed(2)).toBe("1000.00");
    expect(s.criadoPor).toBe(SOLICITANTE);
    // administrativa: nenhum movimento de dotação, nenhum lançamento
    expect(await prisma.movimentoDotacao.count({ where: { fichaId: FICHA_A } })).toBe(antes);
  });

  it("t2 autorizar (por outra pessoa) torna AUTORIZADA, com autor e observação", async () => {
    const id = await solicitar();
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: id, motivo: "conferido o processo", criadoPor: AUTORIDADE });
    expect(await situacao(id)).toBe("AUTORIZADA");
    const m = await prisma.movimentoDaSolicitacaoDeEmpenho.findFirstOrThrow({ where: { solicitacaoId: id } });
    expect(m).toMatchObject({ tipo: "AUTORIZADA", criadoPor: AUTORIDADE, motivo: "conferido o processo" });
  });

  it("t3 rejeitar exige motivo, grava REJEITADA, e rejeitada não se autoriza depois", async () => {
    const id = await solicitar();
    await expect(rejeitarSolicitacaoDeEmpenho(prisma, { solicitacaoId: id, motivo: "curto", criadoPor: AUTORIDADE })).rejects.toThrow(/mínimo de 10/);
    await rejeitarSolicitacaoDeEmpenho(prisma, { solicitacaoId: id, motivo: "sem pesquisa de preços no processo", criadoPor: AUTORIDADE });
    expect(await situacao(id)).toBe("REJEITADA");
    await expect(autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: id, criadoPor: AUTORIDADE })).rejects.toThrow(/está rejeitada — só se autoriza/);
    const l = await listarSolicitacoesDeEmpenho(prisma, { exercicio: 2026 });
    expect(l.find((x) => x.id === id)).toMatchObject({ motivo: "sem pesquisa de preços no processo", decididaPor: AUTORIDADE });
  });

  it("t4 SEGREGAÇÃO: quem solicitou não autoriza nem rejeita a própria solicitação — recusa com o motivo, nada gravado", async () => {
    const id = await solicitar({ por: SOLICITANTE });
    await expect(autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: id, criadoPor: SOLICITANTE })).rejects.toThrow(
      /SEGREGAÇÃO DE FUNÇÕES: "m05@cg\.pb\.gov\.br" solicitou este empenho e não pode autorizar/
    );
    await expect(
      rejeitarSolicitacaoDeEmpenho(prisma, { solicitacaoId: id, motivo: "desisti do pedido feito", criadoPor: SOLICITANTE })
    ).rejects.toThrow(/não pode rejeitar a própria solicitação.*cancele a solicitação/s);
    expect(await prisma.movimentoDaSolicitacaoDeEmpenho.count({ where: { solicitacaoId: id } })).toBe(0);
    expect(await situacao(id)).toBe("PENDENTE");
    // e o caminho do solicitante é CANCELAR (ação SOLICITAR_EMPENHO)
    await cancelarSolicitacaoDeEmpenho(prisma, { solicitacaoId: id, motivo: "o setor desistiu da contratação", criadoPor: SOLICITANTE });
    expect(await situacao(id)).toBe("CANCELADA");
  });

  it("t5 ESCOPO: quem autoriza só na Saúde é recusado na Educação, nomeando a ação e o escopo — e autoriza na Saúde (N=2)", async () => {
    const naSaude = await solicitar({ ficha: FICHA_A });
    const naEducacao = await solicitar({ ficha: FICHA_B });
    await expect(autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: naEducacao, criadoPor: ORDENADOR_A })).rejects.toThrow(
      /ACESSO NEGADO: o usuário "ordenador\.a@teste\.local" não tem permissão para AUTORIZAR_SOLICITACAO_DE_EMPENHO[\s\S]*O ESCOPO — ele TEM a ação AUTORIZAR_SOLICITACAO_DE_EMPENHO, mas só em: sol-uo-a/
    );
    expect(await prisma.movimentoDaSolicitacaoDeEmpenho.count({ where: { solicitacaoId: naEducacao } })).toBe(0);
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: naSaude, criadoPor: ORDENADOR_A });
    expect(await situacao(naSaude)).toBe("AUTORIZADA");
    expect(await situacao(naEducacao)).toBe("PENDENTE");
    // e sem a ação de solicitar, não solicita — o motivo é a AÇÃO, não o escopo
    await expect(solicitar({ por: ORDENADOR_A })).rejects.toThrow(/não tem permissão para SOLICITAR_EMPENHO[\s\S]*A AÇÃO/);
  });
});

describe("emitir o empenho a partir da solicitação", () => {
  it("t6 N=2: duas solicitações autorizadas viram dois empenhos, cada uma EMPENHADA e ligada ao seu", async () => {
    const s1 = await solicitar({ valor: "1000.00" });
    const s2 = await solicitar({ valor: "400.00" });
    for (const s of [s1, s2]) await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, criadoPor: AUTORIDADE });
    const e1 = await emitir({ solicitacaoId: s1, valor: "1000.00" });
    // menos que o autorizado é permitido; a sobra não fica autorizada
    const e2 = await emitir({ solicitacaoId: s2, valor: "350.00" });
    expect((await prisma.empenho.findUniqueOrThrow({ where: { id: e1.empenhoId } })).solicitacaoDeEmpenhoId).toBe(s1);
    expect((await prisma.empenho.findUniqueOrThrow({ where: { id: e2.empenhoId } })).solicitacaoDeEmpenhoId).toBe(s2);
    expect(await situacao(s1)).toBe("EMPENHADA");
    expect(await situacao(s2)).toBe("EMPENHADA");
    const l = await listarSolicitacoesDeEmpenho(prisma, { exercicio: 2026 });
    expect(l.filter((x) => x.empenhoId !== null).map((x) => x.empenhoId).sort()).toEqual([e1.empenhoId, e2.empenhoId].sort());
  });

  it("t7 RECUSA com motivo: pendente, rejeitada, cancelada e já empenhada — nada gravado", async () => {
    const pendente = await solicitar();
    const rejeitada = await solicitar();
    await rejeitarSolicitacaoDeEmpenho(prisma, { solicitacaoId: rejeitada, motivo: "fora da programação financeira", criadoPor: AUTORIDADE });
    const cancelada = await solicitar();
    await cancelarSolicitacaoDeEmpenho(prisma, { solicitacaoId: cancelada, motivo: "o setor retirou o pedido", criadoPor: SOLICITANTE });
    const usada = await solicitar();
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: usada, criadoPor: AUTORIDADE });
    await emitir({ solicitacaoId: usada });
    const empenhosAntes = await prisma.empenho.count();

    await expect(emitir({ solicitacaoId: pendente })).rejects.toThrow(/está aguardando autorização — o empenho só pode ser emitido a partir de solicitação AUTORIZADA/);
    await expect(emitir({ solicitacaoId: rejeitada })).rejects.toThrow(/está rejeitada — o empenho só pode ser emitido/);
    await expect(emitir({ solicitacaoId: cancelada })).rejects.toThrow(/está cancelada — o empenho só pode ser emitido/);
    await expect(emitir({ solicitacaoId: usada })).rejects.toThrow(/já foi empenhada \(empenho 2026NE\d+\)\. Uma autorização vale para UM empenho/);
    expect(await prisma.empenho.count()).toBe(empenhosAntes);
  });

  it("t8 o empenho é o que foi autorizado: valor maior, outro credor ou outra ficha são recusados nomeando a divergência", async () => {
    const s = await solicitar({ valor: "1000.00" });
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, criadoPor: AUTORIDADE });
    await expect(emitir({ solicitacaoId: s, valor: "1000.01" })).rejects.toThrow(/excede o valor autorizado na solicitação SOL-\d+ \(1000\.00\)/);
    await expect(emitir({ solicitacaoId: s, credor: OUTRO_CREDOR })).rejects.toThrow(/diverge da solicitação SOL-\d+ autorizada em: o credor/);
    await expect(emitir({ solicitacaoId: s, ficha: FICHA_B })).rejects.toThrow(/diverge da solicitação SOL-\d+ autorizada em: a ficha/);
    expect(await situacao(s)).toBe("AUTORIZADA");
  });

  it("t9 CORRIDA: duas emissões da mesma solicitação — exatamente uma vence, a outra é recusada com o motivo", async () => {
    const s = await solicitar();
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, criadoPor: AUTORIDADE });
    const r = await Promise.allSettled([emitir({ solicitacaoId: s, numero: "NE-CORRIDA-1" }), emitir({ solicitacaoId: s, numero: "NE-CORRIDA-2" })]);
    const ok = r.filter((x) => x.status === "fulfilled");
    const nao = r.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(nao).toHaveLength(1);
    expect(String(nao[0]!.reason)).toMatch(/já foi empenhada/);
    expect(await prisma.empenho.count({ where: { solicitacaoDeEmpenhoId: s } })).toBe(1);
  });

  it("t10 CORRIDA: cancelar e emitir a mesma solicitação — exatamente um dos dois grava", async () => {
    const s = await solicitar();
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, criadoPor: AUTORIDADE });
    const r = await Promise.allSettled([
      emitir({ solicitacaoId: s }),
      cancelarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, motivo: "o setor retirou o pedido", criadoPor: SOLICITANTE }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const empenhos = await prisma.empenho.count({ where: { solicitacaoDeEmpenhoId: s } });
    const cancelamentos = await prisma.movimentoDaSolicitacaoDeEmpenho.count({ where: { solicitacaoId: s, tipo: "CANCELADA" } });
    expect(empenhos + cancelamentos).toBe(1);
  });

  /**
   * ⚠️ O t10 SOZINHO NÃO PROVA A TRAVA: o cancelamento é curto e a emissão é longa, e na prática o
   * cancelamento quase sempre termina antes de a emissão derivar a situação — o t10 fica verde com
   * ou sem trava. Este teste torna a janela DETERMINÍSTICA: uma transação que passou pelo guard da
   * emissão (e portanto segura a trava) dorme; o cancelamento, disparado no meio, TEM de esperar.
   */
  it("t10b a trava SERIALIZA: o cancelamento espera a emissão em curso terminar", async () => {
    const s = await solicitar();
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, criadoPor: AUTORIDADE });
    let fimDaEmissao = 0;
    let fimDoCancelamento = 0;
    const emissao = prisma.$transaction(
      async (tx) => {
        await exigirSolicitacaoParaEmpenho(tx, {
          solicitacaoDeEmpenhoId: s, fichaId: FICHA_A, credorCpfCnpj: CREDOR, valor: toMoney("1000.00"), tipo: "ORDINARIO",
        });
        await new Promise((r) => setTimeout(r, 1500));
        fimDaEmissao = Date.now();
      },
      { timeout: 15_000 }
    );
    await new Promise((r) => setTimeout(r, 300));
    const cancelamento = cancelarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, motivo: "o setor retirou o pedido", criadoPor: SOLICITANTE }).then(() => {
      fimDoCancelamento = Date.now();
    });
    await Promise.all([emissao, cancelamento]);
    expect(fimDaEmissao).toBeGreaterThan(0);
    expect(fimDoCancelamento).toBeGreaterThanOrEqual(fimDaEmissao);
  });

  it("t11 ANULAR o empenho NÃO devolve a solicitação: ela segue EMPENHADA (empenho anulado) e não emite de novo", async () => {
    const s = await solicitar();
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, criadoPor: AUTORIDADE });
    const e = await emitir({ solicitacaoId: s });
    await anularEmpenho({ empenhoId: e.empenhoId, numero: "AN-1", data: DATA, historico: "anulação total", criadoPor: AUTORIDADE }, deps);
    const anulacao = await prisma.empenho.findFirstOrThrow({ where: { estornoDeId: e.empenhoId } });
    // a anulação NÃO copia a solicitação (é origem, não dimensão — e a coluna é única)
    expect(anulacao.solicitacaoDeEmpenhoId).toBeNull();
    const l = await listarSolicitacoesDeEmpenho(prisma, { exercicio: 2026 });
    expect(l.find((x) => x.id === s)).toMatchObject({ situacao: "EMPENHADA", empenhoAnulado: true });
    await expect(emitir({ solicitacaoId: s })).rejects.toThrow(/já foi empenhada/);
    await expect(
      cancelarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, motivo: "tentando reabrir o pedido", criadoPor: SOLICITANTE })
    ).rejects.toThrow(/já foi empenhada .* quem o desfaz é a anulação do empenho/);
  });
});

describe("o convênio no empenho", () => {
  async function convenio(identificador: string): Promise<string> {
    const c = await prisma.convenio.create({
      data: {
        identificador, objeto: "Reforma de unidade de saúde", papelDoEnte: "CONVENENTE", partidaNome: "Ministério da Saúde",
        partidaDocumento: "00394544000185", leiAutorizativa: "Lei 1.234/2026", valorRepasse: "50000.00", valorContrapartida: "5000.00",
        vigenciaInicio: new Date("2026-01-01T03:00:00Z"), vigenciaFim: new Date("2027-01-01T02:59:59Z"),
        fonteRecursoId: "sol-fnt", contaContabilId: "s-conv", criadoPor: "TESTE",
      },
      select: { id: true },
    });
    return c.id;
  }

  it("t12 N=2: anulação total, parcial e o estorno da parcial COPIAM o convênio — a soma por convênio fecha", async () => {
    const c = await convenio("CV-001/2026");
    const outro = await convenio("CV-002/2026");
    const e1 = await emitir({ convenioId: c, valor: "1000.00" });
    const e2 = await emitir({ convenioId: c, valor: "500.00" });
    await emitir({ convenioId: outro, valor: "300.00" });
    expect((await empenhadoLiquidoDoConvenio(prisma, c)).toFixed(2)).toBe("1500.00");

    const parcial = await anularEmpenhoParcial(
      { originalId: e1.empenhoId, numero: "ANP-1", valor: "200.00", data: DATA, motivo: "redução do objeto conveniado", criadoPor: AUTORIDADE },
      deps
    );
    await anularEmpenho({ empenhoId: e2.empenhoId, numero: "AN-2", data: DATA, historico: "anulação total do segundo", criadoPor: AUTORIDADE }, deps);
    // 1000 − 200 (parcial) + 0 (o segundo foi anulado inteiro) = 800; o outro convênio não se mistura
    expect((await empenhadoLiquidoDoConvenio(prisma, c)).toFixed(2)).toBe("800.00");
    expect((await empenhadoLiquidoDoConvenio(prisma, outro)).toFixed(2)).toBe("300.00");
    // e a causa, depois do efeito: as linhas de anulação carregam o convênio
    const linhas = await prisma.empenho.findMany({ where: { OR: [{ estornoDeId: e2.empenhoId }, { id: parcial.anulacaoId }] }, select: { convenioId: true } });
    expect(linhas.map((l) => l.convenioId)).toEqual([c, c]);

    await estornarAnulacaoParcial(
      { anulacaoId: parcial.anulacaoId, numero: "EST-1", data: DATA, motivo: "a redução foi lançada por engano", criadoPor: AUTORIDADE, nivel: "EMPENHO" },
      deps
    );
    expect((await empenhadoLiquidoDoConvenio(prisma, c)).toFixed(2)).toBe("1000.00");

    // A PROPRIEDADE (V22): cada linha que nega ou reduz carrega TODAS as dimensões da origem —
    // não só o convênio. A tupla inteira, com os nulos, tem de ser igual.
    const dims = Object.fromEntries(DIMENSOES_DO_EMPENHO.map((d) => [d, true])) as Record<(typeof DIMENSOES_DO_EMPENHO)[number], true>;
    const tupla = async (id: string): Promise<unknown> => prisma.empenho.findUniqueOrThrow({ where: { id }, select: dims });
    const total = await prisma.empenho.findFirstOrThrow({ where: { estornoDeId: e2.empenhoId }, select: { id: true } });
    const estornoDaParcial = await prisma.empenho.findFirstOrThrow({ where: { estornoDeId: parcial.anulacaoId }, select: { id: true } });
    expect(await tupla(total.id)).toEqual(await tupla(e2.empenhoId));
    expect(await tupla(parcial.anulacaoId)).toEqual(await tupla(e1.empenhoId));
    expect(await tupla(estornoDaParcial.id)).toEqual(await tupla(e1.empenhoId));
  });

  it("t13 convênio inexistente é recusado nomeando — nada gravado", async () => {
    const antes = await prisma.empenho.count();
    await expect(emitir({ convenioId: "nao-existe" })).rejects.toThrow(/Convênio nao-existe não existe/);
    expect(await prisma.empenho.count()).toBe(antes);
  });

  it("t14 a solicitação com convênio exige o MESMO convênio no empenho", async () => {
    const c = await convenio("CV-003/2026");
    const s = await solicitar({ convenioId: c });
    await autorizarSolicitacaoDeEmpenho(prisma, { solicitacaoId: s, criadoPor: AUTORIDADE });
    await expect(emitir({ solicitacaoId: s })).rejects.toThrow(/diverge da solicitação SOL-\d+ autorizada em: o convênio/);
    const e = await emitir({ solicitacaoId: s, convenioId: c });
    expect((await prisma.empenho.findUniqueOrThrow({ where: { id: e.empenhoId } })).convenioId).toBe(c);
  });
});

describe("a atualização de permissões v39 (upgrade de instalação existente)", () => {
  it("t15 o perfil legado recebe SOLICITAR onde empenha e AUTORIZAR onde autoriza ordem — e reaplicar é recusado", async () => {
    const p = await prisma.perfil.create({
      data: {
        nome: "LEGADO-EXECUCAO",
        descricao: "perfil de antes da solicitação",
        criadoPor: "TESTE",
        permissoes: {
          create: [
            { acao: "EMPENHAR", unidadeOrcId: UG_A, criadoPor: "TESTE" },
            { acao: "AUTORIZAR_ORDEM_PAGAMENTO", unidadeOrcId: UG_B, criadoPor: "TESTE" },
          ],
        },
      },
      select: { id: true },
    });
    await aplicarAtualizacaoDePermissoes(prisma, { versao: 39, criadoPor: SOLICITANTE, areaDaAcao: AREA_DA_ACAO });
    const ps = await prisma.permissaoDePerfil.findMany({ where: { perfilId: p.id }, select: { acao: true, unidadeOrcId: true } });
    expect(ps.map((x) => `${x.acao} ${x.unidadeOrcId}`).sort()).toEqual(
      [
        `AUTORIZAR_ORDEM_PAGAMENTO ${UG_B}`,
        `AUTORIZAR_SOLICITACAO_DE_EMPENHO ${UG_B}`,
        `EMPENHAR ${UG_A}`,
        `SOLICITAR_EMPENHO ${UG_A}`,
      ].sort()
    );
    await expect(aplicarAtualizacaoDePermissoes(prisma, { versao: 39, criadoPor: SOLICITANTE, areaDaAcao: AREA_DA_ACAO })).rejects.toThrow(/JÁ APLICADA/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// V22 — A CAMPANHA PUBLICITÁRIA (o vínculo da nota de empenho pedido pelo termo de referência)
// ═══════════════════════════════════════════════════════════════════════════
describe("a campanha publicitária no empenho", () => {
  async function campanha(identificador: string, por = AUTORIDADE): Promise<string> {
    const c = await cadastrarCampanhaPublicitaria(prisma, {
      identificador,
      titulo: `Campanha ${identificador}`,
      objetivo: "Divulgar a vacinação contra a gripe",
      inicio: "2026-04-01",
      fim: "2026-06-30",
      criadoPor: por,
    });
    return c.id;
  }

  it("t16 N=2: o empenhado por campanha fecha com anulação total e parcial — e a outra campanha não se mistura", async () => {
    const a = await campanha("CP-001/2026");
    const b = await campanha("CP-002/2026");
    const e1 = await emitir({ campanhaId: a, valor: "1000.00" });
    const e2 = await emitir({ campanhaId: a, valor: "400.00" });
    await emitir({ campanhaId: b, valor: "250.00" });
    expect((await empenhadoLiquidoDaCampanha(prisma, a)).toFixed(2)).toBe("1400.00");

    await anularEmpenhoParcial(
      { originalId: e1.empenhoId, numero: "ANP-C1", valor: "300.00", data: DATA, motivo: "redução da veiculação", criadoPor: AUTORIDADE },
      deps
    );
    await anularEmpenho({ empenhoId: e2.empenhoId, numero: "AN-C2", data: DATA, historico: "campanha cancelada", criadoPor: AUTORIDADE }, deps);
    // 1000 − 300 + 0 = 700; a campanha B continua 250
    expect((await empenhadoLiquidoDaCampanha(prisma, a)).toFixed(2)).toBe("700.00");
    expect((await empenhadoLiquidoDaCampanha(prisma, b)).toFixed(2)).toBe("250.00");
  });

  it("t17 campanha inexistente é recusada nomeando — e nada é gravado", async () => {
    const antes = await prisma.empenho.count();
    await expect(emitir({ campanhaId: "nao-existe" })).rejects.toThrow(/Campanha publicitária nao-existe não existe/);
    expect(await prisma.empenho.count()).toBe(antes);
  });

  it("t18 o cadastro recusa identificador repetido e fim antes do início, com o motivo — e nada é gravado", async () => {
    await campanha("CP-010/2026");
    await expect(campanha("CP-010/2026")).rejects.toThrow(/Já existe a campanha CP-010\/2026 \("Campanha CP-010\/2026"\)/);
    await expect(
      cadastrarCampanhaPublicitaria(prisma, {
        identificador: "CP-011/2026", titulo: "Invertida", objetivo: "Teste de período", inicio: "2026-05-10", fim: "2026-05-01", criadoPor: AUTORIDADE,
      })
    ).rejects.toThrow(/A data de fim \(2026-05-01\) é anterior à de início \(2026-05-10\)/);
    expect(await prisma.campanhaPublicitaria.count()).toBe(1);
  });

  it("t19 NEGATIVO: quem não tem CADASTRAR_CONTRATO não cadastra campanha — recusado pelo motivo", async () => {
    await expect(campanha("CP-020/2026", ORDENADOR_A)).rejects.toThrow(/ACESSO NEGADO.*CADASTRAR_CONTRATO/);
    expect(await prisma.campanhaPublicitaria.count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// V22 — A VIGÊNCIA DO CONVÊNIO NO EMPENHO (Portaria Conjunta MGI/MF/CGU 33/2023, art. 44, I e IX)
// ═══════════════════════════════════════════════════════════════════════════
describe("a vigência do convênio no empenho", () => {
  // Vigência de 1º/03/2026 a 30/06/2026, gravada como o M28 grava: início do dia e fim do dia civil
  // do ente (Brasília, UTC−3).
  async function convenioComVigencia(identificador: string, papel: "CONVENENTE" | "CONCEDENTE"): Promise<string> {
    const c = await prisma.convenio.create({
      data: {
        identificador, objeto: "Aquisição de equipamentos", papelDoEnte: papel, partidaNome: "Ministério da Saúde",
        partidaDocumento: "00394544000185", leiAutorizativa: "Lei 1.234/2026", valorRepasse: "50000.00", valorContrapartida: "5000.00",
        vigenciaInicio: new Date("2026-03-01T03:00:00Z"), vigenciaFim: new Date("2026-07-01T02:59:59Z"),
        fonteRecursoId: "sol-fnt", contaContabilId: "s-conv", criadoPor: "TESTE",
      },
      select: { id: true },
    });
    return c.id;
  }
  // Meio-dia civil de Brasília de cada dia de borda.
  const dia = (d: string): Date => new Date(`${d}T15:00:00Z`);

  it("t20 N=2 bordas: o primeiro e o último dia da vigência são aceitos", async () => {
    const c = await convenioComVigencia("CV-VIG-1/2026", "CONVENENTE");
    await emitir({ convenioId: c, data: dia("2026-03-01") });
    await emitir({ convenioId: c, data: dia("2026-06-30") });
    expect(await prisma.empenho.count({ where: { convenioId: c } })).toBe(2);
  });

  it("t21 NEGATIVO: a véspera do início e o dia seguinte ao fim são recusados, com o motivo e a norma — nada gravado", async () => {
    const c = await convenioComVigencia("CV-VIG-2/2026", "CONVENENTE");
    await expect(emitir({ convenioId: c, data: dia("2026-02-28") })).rejects.toThrow(
      /O empenho de 28\/02\/2026 está fora da vigência do convênio CV-VIG-2\/2026 \(01\/03\/2026 a 30\/06\/2026\).*art\. 44/
    );
    await expect(emitir({ convenioId: c, data: dia("2026-07-01") })).rejects.toThrow(
      /O empenho de 01\/07\/2026 está fora da vigência do convênio CV-VIG-2\/2026/
    );
    expect(await prisma.empenho.count({ where: { convenioId: c } })).toBe(0);
  });

  it("t22 com o ente CONCEDENTE a vedação não se aplica — o empenho do repasse fora da vigência passa", async () => {
    const c = await convenioComVigencia("CV-VIG-3/2026", "CONCEDENTE");
    await emitir({ convenioId: c, data: dia("2026-07-01") });
    expect(await prisma.empenho.count({ where: { convenioId: c } })).toBe(1);
  });
});
