import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_REALOCACAO_ACRESCIMO,
  CONTA_REALOCACAO_REDUCAO,
} from "../m01-core-contabil/roteiros.js";
import { conferirDotacaoContraRazao } from "../m05-despesa/conferir-dotacao.js";
import { listarQdd } from "./consultas.js";
import { listarRealocacoes } from "./consultas-realocacao.js";
import { criarRealocacaoDeps } from "./adapter-realocacao.js";
import {
  anularRealocacao,
  registrarRealocacao,
  validarRealocacao,
  type RealocacaoDeps,
  type RegistrarRealocacaoInput,
} from "./realocacao.js";
import { toMoney } from "../../packages/contracts/index.js";
import { balancoOrcamentario } from "../m12-relatorios/balanco-orcamentario.js";
import { anexarArquivo } from "../m22-documentos/anexos.js";
import { lerFatosAtualizacaoOrcamentaria, lerFatosDecretosEOficios } from "../../adapters/tribunais/tce-pb/sagres/gerador-v26.js";

/**
 * M03 V21 — A REALOCAÇÃO DE DOTAÇÃO POR LEI ESPECÍFICA (CF art. 167, VI).
 *
 * Regime: PROFUNDIDADE — mexe no autorizado da ficha e no razão (classes 5 e 6).
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 *   · o ato move dotação entre fichas e o QDD, o saldo da ficha e o razão contam a mesma história
 *     (t1) — com DUAS fontes no mesmo ato, porque o fechamento por fonte só se manifesta em conjunto;
 *   · as recusas dizem o MOTIVO e não gravam nada (t2–t8);
 *   · a anulação é o INVERSO EXATO no razão: as analíticas de acréscimo e redução voltam a zero, e
 *     não ficam as duas infladas (t9) — o erro que um estorno pelo roteiro do tipo oposto faria;
 *   · desfazer não tira de quem já comprometeu o que recebeu (t10), e se desfaz uma vez só (t9);
 *   · quem não tem a ação é recusado pela AÇÃO (t11).
 *
 * A conferência independente é `conferirDotacaoContraRazao` (M05): ela compara o crédito disponível
 * pelo RAZÃO com o que os MOVIMENTOS dizem — duas leituras que não se consultam.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m03@cg.pb.gov.br";
const SEM_CRACHA = "sem-realocacao@cg.pb.gov.br";

const F500 = "fnt-500";
const F540 = "fnt-540";
/** A e B na fonte 500; C e D na 540. A e C cedem; B e D recebem. B é de OUTRA unidade. */
const A = "ficha-a";
const B = "ficha-b";
const C = "ficha-c";
const D = "ficha-d";
/** Despesa de CAPITAL (4.4.90.52), fonte 500 — a outra ponta de uma TRANSFERÊNCIA. */
const E = "ficha-e";
/** Uma ficha do exercício anterior — o ato de 2026 não a move. */
const VELHA = "ficha-2025";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "uo-01", codigo: "01001", descricao: "Educacao", orgaoId: "org-01" },
      { id: "uo-02", codigo: "01002", descricao: "Saude", orgaoId: "org-01" },
    ],
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educacao" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" } });
  await prisma.programa.createMany({
    data: [
      { id: "prg-0012", codigo: "0012", descricao: "Educacao" },
      { id: "prg-0020", codigo: "0020", descricao: "Saude" },
    ],
  });
  await prisma.acao.create({ data: { id: "aca-2001", codigo: "2001", descricao: "Manutencao", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      {
        id: "nd-339039", codCategoria: "3", codNatureza: "3", codModalidade: "90",
        codElemento: "39", codigoCompleto: "339039", descricao: "Servicos PJ",
      },
      {
        id: "nd-449052", codCategoria: "4", codNatureza: "4", codModalidade: "90",
        codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos",
      },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: F500, codigo: "500", descricao: "Nao vinculados", codigoTce: "500" },
      { id: F540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  const base = {
    exercicio: 2026, orgaoId: "org-01", funcaoId: "fun-12", subfuncaoId: "sub-361",
    acaoId: "aca-2001", naturezaDespesaId: "nd-339039",
  };
  await criarFichasDeTeste(prisma, [
    { ...base, id: A, numero: 1, unidadeOrcId: "uo-01", programaId: "prg-0012", fonteId: F500, valorDotado: "10000.00" },
    { ...base, id: B, numero: 2, unidadeOrcId: "uo-02", programaId: "prg-0020", fonteId: F500, valorDotado: "5000.00" },
    { ...base, id: C, numero: 3, unidadeOrcId: "uo-01", programaId: "prg-0012", fonteId: F540, valorDotado: "8000.00" },
    { ...base, id: D, numero: 4, unidadeOrcId: "uo-02", programaId: "prg-0020", fonteId: F540, valorDotado: "2000.00" },
    { ...base, id: E, numero: 5, unidadeOrcId: "uo-01", programaId: "prg-0012", naturezaDespesaId: "nd-449052", fonteId: F500, valorDotado: "1000.00" },
    { ...base, exercicio: 2025, id: VELHA, numero: 1, unidadeOrcId: "uo-01", programaId: "prg-0012", fonteId: F500, valorDotado: "3000.00" },
  ]);

  // O ator NEGATIVO é criado aqui, e não tirado do elenco de `test/usuarios-teste.ts`: todo
  // identificador de lá é ADMIN, e ADMIN tem a ação que se quer ver recusada.
  const perfil = await prisma.perfil.create({
    data: {
      nome: "SO-CREDITO",
      descricao: "Executa credito adicional, nao realoca",
      criadoPor: "SEED",
      permissoes: { create: [{ acao: "EXECUTAR_CREDITO", criadoPor: "SEED" }] },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({
    data: { identificador: SEM_CRACHA, nome: SEM_CRACHA, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "SEED" } });
}

/** O ato de referência: duas fontes, quatro fichas, fecha no total e em cada fonte. */
function atoQueFecha(extra: Partial<RegistrarRealocacaoInput> = {}): RegistrarRealocacaoInput {
  return {
    especie: "REMANEJAMENTO",
    numero: "DEC-10",
    data: new Date("2026-04-10T15:00:00Z"),
    leiNumero: "LEI-55/2026",
    leiDataPublicacao: new Date("2026-04-02T15:00:00Z"),
    justificativa: "Reorganizacao da Secretaria de Saude, com transferencia de atribuicoes.",
    pernas: [
      { fichaId: A, tipo: "REDUCAO", valor: "1500.00", fonteId: F500 },
      { fichaId: B, tipo: "ACRESCIMO", valor: "1500.00", fonteId: F500 },
      { fichaId: C, tipo: "REDUCAO", valor: "700.00", fonteId: F540 },
      { fichaId: D, tipo: "ACRESCIMO", valor: "700.00", fonteId: F540 },
    ],
    criadoPor: POR,
    ...extra,
  };
}

/** Saldo DEVEDOR (ΣD − ΣC) de uma conta no razão, somando todas as partidas. */
async function saldoDevedor(codigo: string): Promise<string> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { conta: { codigo } },
    select: { tipo: true, valor: true },
  });
  let s = toMoney("0.00");
  for (const p of partidas) {
    s = toMoney(p.tipo === "DEBITO" ? s.plus(p.valor.toFixed(2)) : s.minus(p.valor.toFixed(2)));
  }
  return s.toFixed(2);
}

async function atualizadaPorFicha(): Promise<Record<string, string>> {
  const qdd = await listarQdd(prisma, { exercicio: 2026 });
  return Object.fromEntries(qdd.map((l) => [l.fichaId, l.dotacaoAtualizada]));
}

async function contagens(): Promise<{ atos: number; itens: number; movimentos: number; lancamentos: number }> {
  return {
    atos: await prisma.atoDeRealocacao.count(),
    itens: await prisma.itemDeRealocacao.count(),
    movimentos: await prisma.movimentoDotacao.count(),
    lancamentos: await prisma.lancamentoContabil.count(),
  };
}

const CONTAS_DO_ORCAMENTO = {
  disponivel: CONTA_CREDITO_DISPONIVEL,
  reservado: "6.2.2.1.2.00.00",
  empenhado: "6.2.2.1.3.01.00",
};

describe("M03 V21 — realocação de dotação por lei específica", () => {
  let deps: RealocacaoDeps;

  beforeEach(async () => {
    deps = criarRealocacaoDeps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 move dotação em DUAS fontes: QDD, saldo e razão contam a mesma história", async () => {
    const r = await registrarRealocacao(atoQueFecha(), deps);
    expect(r.total).toBe("2200.00");
    expect(r.ano).toBe(2026);

    expect(await atualizadaPorFicha()).toEqual({
      [A]: "8500.00", [B]: "6500.00", [C]: "7300.00", [D]: "2700.00", [E]: "1000.00",
    });
    const qdd = await listarQdd(prisma, { exercicio: 2026 });
    const b = qdd.find((l) => l.fichaId === B)!;
    expect([b.realocadoAcrescimo, b.realocadoReducao, b.realocadoLiquido]).toEqual(["1500.00", "0.00", "1500.00"]);
    const a = qdd.find((l) => l.fichaId === A)!;
    expect([a.realocadoAcrescimo, a.realocadoReducao, a.realocadoLiquido]).toEqual(["0.00", "1500.00", "-1500.00"]);
    // O cache da ficha acompanha (é o saldo contra o qual se empenha).
    const cacheB = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: B }, select: { saldoAutorizado: true } });
    expect(cacheB.saldoAutorizado.toFixed(2)).toBe("6500.00");

    // O razão: o acréscimo DEBITA 5.2.2.1.9.02.01, a redução CREDITA 5.2.2.1.9.02.09 — as contas
    // reais do plano, e não as do crédito adicional.
    expect(await saldoDevedor(CONTA_REALOCACAO_ACRESCIMO)).toBe("2200.00");
    expect(await saldoDevedor(CONTA_REALOCACAO_REDUCAO)).toBe("-2200.00");
    // E o crédito disponível pelo razão bate com os movimentos — a leitura independente.
    await expect(conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO)).resolves.toBeDefined();

    // Cada perna tem o seu movimento e o seu lançamento, com a ficha na partida.
    const itens = await prisma.itemDeRealocacao.findMany({ select: { fichaId: true, movimentoDotacaoId: true } });
    expect(itens).toHaveLength(4);
    for (const i of itens) {
      const l = await prisma.lancamentoContabil.findFirstOrThrow({
        where: { origemId: i.movimentoDotacaoId },
        select: { partidas: { select: { fichaId: true } } },
      });
      expect(l.partidas.every((x) => x.fichaId === i.fichaId)).toBe(true);
    }

    const lista = await listarRealocacoes(prisma, { exercicio: 2026 });
    expect(lista).toHaveLength(1);
    expect(lista[0]!.pernas).toHaveLength(4);
    expect(lista[0]!.anulacao).toBeNull();
  });

  it("t2 recusa o que NÃO FECHA no total, dizendo a diferença — e não grava nada", async () => {
    const antes = await contagens();
    const ato = atoQueFecha();
    await expect(
      registrarRealocacao({ ...ato, pernas: [ato.pernas[0]!, { ...ato.pernas[1]!, valor: "1400.00" }] }, deps)
    ).rejects.toThrow(/NÃO FECHA: .*1400\.00.*1500\.00.*diferença -100\.00/);
    expect(await contagens()).toEqual(antes);
  });

  it("t3 recusa o que fecha no TOTAL mas não em cada FONTE (N=2 fontes)", async () => {
    // 1.500 = 1.500 no total, mas a fonte 500 cede 1.000 e recebe 500.
    const antes = await contagens();
    await expect(
      registrarRealocacao(
        atoQueFecha({
          pernas: [
            { fichaId: A, tipo: "REDUCAO", valor: "1000.00", fonteId: F500 },
            { fichaId: C, tipo: "REDUCAO", valor: "500.00", fonteId: F540 },
            { fichaId: B, tipo: "ACRESCIMO", valor: "500.00", fonteId: F500 },
            { fichaId: D, tipo: "ACRESCIMO", valor: "1000.00", fonteId: F540 },
          ],
        }),
        deps
      )
    ).rejects.toThrow(/NÃO FECHA na fonte fnt-500: recebe 500\.00 e cede 1000\.00/);
    expect(await contagens()).toEqual(antes);
  });

  it("t4 recusa ceder mais do que o disponível da ficha, nomeando o disponível", async () => {
    const antes = await contagens();
    await expect(
      registrarRealocacao(
        atoQueFecha({
          pernas: [
            { fichaId: B, tipo: "REDUCAO", valor: "5000.01", fonteId: F500 },
            { fichaId: A, tipo: "ACRESCIMO", valor: "5000.01", fonteId: F500 },
          ],
        }),
        deps
      )
    ).rejects.toThrow(/ficha 2 não tem saldo para ceder 5000\.01: o disponível agora é 5000\.00/);
    expect(await contagens()).toEqual(antes);
  });

  it("t5 a lei tem de ser PRÉVIA — comparada pelo dia CIVIL do ente, nas duas bordas", () => {
    const pernas = atoQueFecha().pernas.map((p) => ({ ...p, valor: toMoney(p.valor as string) }));
    // Lei às 22h de 28/02 no fuso do ente (01h de 01/03 em UTC) e ato às 12h de 28/02: MESMO dia
    // civil. Uma comparação em UTC recusaria uma lei que foi, sim, prévia.
    expect(() =>
      validarRealocacao({
        leiDataPublicacao: new Date("2026-03-01T01:00:00Z"),
        data: new Date("2026-02-28T15:00:00Z"),
        pernas,
      })
    ).not.toThrow();
    // Ato às 20h30 de 28/02 no fuso do ente (23h30 UTC) e lei às 9h de 01/03: a lei é POSTERIOR.
    // Em UTC os dois "seriam" do dia 28 e 01 — aqui a borda é a outra: o ato ainda é de 28/02.
    expect(() =>
      validarRealocacao({
        leiDataPublicacao: new Date("2026-03-01T12:00:00Z"),
        data: new Date("2026-02-28T23:30:00Z"),
        pernas,
      })
    ).toThrow(/publicada em 2026-03-01, depois do ato \(2026-02-28\).*PRÉVIA/);
  });

  it("t6 o mesmo número no mesmo ano é recusado nomeando o ato — a segunda tentativa não duplica", async () => {
    await registrarRealocacao(atoQueFecha(), deps);
    const depois = await contagens();
    await expect(registrarRealocacao(atoQueFecha(), deps)).rejects.toThrow(/Já existe o ato DEC-10\/2026/);
    expect(await contagens()).toEqual(depois);
  });

  it("t7 recusa a fonte que não é a da ficha, e a ficha em duas pernas", async () => {
    const antes = await contagens();
    await expect(
      registrarRealocacao(
        atoQueFecha({
          pernas: [
            { fichaId: A, tipo: "REDUCAO", valor: "100.00", fonteId: F540 },
            { fichaId: D, tipo: "ACRESCIMO", valor: "100.00", fonteId: F540 },
          ],
        }),
        deps
      )
    ).rejects.toThrow(/fonte informada na perna da ficha 1 não é a fonte da ficha/);
    await expect(
      registrarRealocacao(
        atoQueFecha({
          pernas: [
            { fichaId: A, tipo: "REDUCAO", valor: "100.00", fonteId: F500 },
            { fichaId: A, tipo: "ACRESCIMO", valor: "100.00", fonteId: F500 },
          ],
        }),
        deps
      )
    ).rejects.toThrow(/mesma ficha aparece em mais de uma perna/);
    expect(await contagens()).toEqual(antes);
  });

  it("t8 recusa ficha de outro exercício", async () => {
    const antes = await contagens();
    await expect(
      registrarRealocacao(
        atoQueFecha({
          pernas: [
            { fichaId: VELHA, tipo: "REDUCAO", valor: "100.00", fonteId: F500 },
            { fichaId: B, tipo: "ACRESCIMO", valor: "100.00", fonteId: F500 },
          ],
        }),
        deps
      )
    ).rejects.toThrow(/ficha 1 é do exercício 2025, e o ato é de 2026-04-10/);
    expect(await contagens()).toEqual(antes);
  });

  it("t9 a anulação é o INVERSO EXATO no razão, devolve o QDD e só acontece uma vez", async () => {
    const r = await registrarRealocacao(atoQueFecha(), deps);
    const x = await anularRealocacao(
      { atoId: r.atoId, data: new Date("2026-04-20T15:00:00Z"), motivo: "Lei revogada pela Camara em abril.", criadoPor: POR },
      deps
    );
    expect(x.pernasEstornadas).toBe(4);

    expect(await atualizadaPorFicha()).toEqual({
      [A]: "10000.00", [B]: "5000.00", [C]: "8000.00", [D]: "2000.00", [E]: "1000.00",
    });
    // ⚠️ A PROVA DO INVERSO EXATO: as DUAS analíticas voltam a zero. Um estorno pelo roteiro do tipo
    // oposto deixaria 2.200 devedor no acréscimo E 2.200 credor na redução — o pai fecharia e o
    // balancete por analítica mostraria dois fatos que nunca existiram.
    expect(await saldoDevedor(CONTA_REALOCACAO_ACRESCIMO)).toBe("0.00");
    expect(await saldoDevedor(CONTA_REALOCACAO_REDUCAO)).toBe("0.00");
    await expect(conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO)).resolves.toBeDefined();

    // Cada lançamento de estorno aponta o original; o original continua no razão.
    const estornos = await prisma.lancamentoContabil.findMany({
      where: { origemTipo: "REALOCACAO_DE_DOTACAO", estornoDeId: { not: null } },
      select: { estornoDeId: true },
    });
    expect(estornos).toHaveLength(4);
    expect(await prisma.lancamentoContabil.count({ where: { origemTipo: "REALOCACAO_DE_DOTACAO" } })).toBe(8);

    const lista = await listarRealocacoes(prisma, { exercicio: 2026 });
    expect(lista[0]!.anulacao?.motivo).toBe("Lei revogada pela Camara em abril.");
    expect(lista[0]!.pernas).toHaveLength(4);

    const depois = await contagens();
    await expect(
      anularRealocacao({ atoId: r.atoId, data: new Date("2026-04-21T15:00:00Z"), motivo: "Tentando de novo por engano.", criadoPor: POR }, deps)
    ).rejects.toThrow(/já foi anulado/);
    expect(await contagens()).toEqual(depois);
  });

  it("t10 não desfaz o que a ficha que recebeu já comprometeu (N=2 atos)", async () => {
    // Ato 1: B recebe 1.500 (fica com 6.500). Ato 2: B cede 6.000 para A (fica com 500).
    const um = await registrarRealocacao(atoQueFecha(), deps);
    await registrarRealocacao(
      atoQueFecha({
        numero: "DEC-11",
        data: new Date("2026-04-12T15:00:00Z"),
        pernas: [
          { fichaId: B, tipo: "REDUCAO", valor: "6000.00", fonteId: F500 },
          { fichaId: A, tipo: "ACRESCIMO", valor: "6000.00", fonteId: F500 },
        ],
      }),
      deps
    );
    const antes = await contagens();
    // Desfazer o ato 1 tiraria 1.500 de B, que só tem 500.
    await expect(
      anularRealocacao({ atoId: um.atoId, data: new Date("2026-04-20T15:00:00Z"), motivo: "Tentativa de desfazer o primeiro ato.", criadoPor: POR }, deps)
    ).rejects.toThrow(/ficha 2 recebeu 1500\.00 por este ato e hoje tem só 500\.00 disponível/);
    expect(await contagens()).toEqual(antes);
    expect(await prisma.anulacaoDeRealocacao.count()).toBe(0);
  });

  it("t10b a anulação não pode ser anterior ao ato", async () => {
    const r = await registrarRealocacao(atoQueFecha(), deps);
    await expect(
      anularRealocacao({ atoId: r.atoId, data: new Date("2026-04-09T15:00:00Z"), motivo: "Data errada de proposito aqui.", criadoPor: POR }, deps)
    ).rejects.toThrow(/anulação \(2026-04-09\) não pode ser anterior ao ato .*2026-04-10/);
  });

  it("t12 a TRANSFERÊNCIA entre categorias muda o Anexo 12 por categoria, e soma zero no total", async () => {
    const antes = await balancoOrcamentario(prisma, 2026);
    const linha = (b: typeof antes, nota: string) => b.despesas.find((l) => l.nota === nota)!;
    expect(linha(antes, "VIII").dotacaoAtualizada).toBe("25000.00");
    expect(linha(antes, "IX").dotacaoAtualizada).toBe("1000.00");

    await registrarRealocacao(
      atoQueFecha({
        especie: "TRANSFERENCIA",
        numero: "DEC-12",
        pernas: [
          { fichaId: A, tipo: "REDUCAO", valor: "2000.00", fonteId: F500 },
          { fichaId: E, tipo: "ACRESCIMO", valor: "2000.00", fonteId: F500 },
        ],
      }),
      deps
    );
    const depois = await balancoOrcamentario(prisma, 2026);
    // Correntes perdem 2.000, capital ganha 2.000 — a coluna (g) acompanha o saldo da ficha.
    expect(linha(depois, "VIII").dotacaoAtualizada).toBe("23000.00");
    expect(linha(depois, "IX").dotacaoAtualizada).toBe("3000.00");
    expect(linha(depois, "VIII").dotacaoInicial).toBe("25000.00");
  });

  it("t11 quem só executa crédito adicional NÃO realoca — e o motivo é a ação", async () => {
    const antes = await contagens();
    await expect(registrarRealocacao(atoQueFecha({ criadoPor: SEM_CRACHA }), deps)).rejects.toThrow(
      /REGISTRAR_REALOCACAO_DE_DOTACAO/
    );
    expect(await contagens()).toEqual(antes);

    const r = await registrarRealocacao(atoQueFecha(), deps);
    await expect(
      anularRealocacao({ atoId: r.atoId, data: new Date("2026-04-20T15:00:00Z"), motivo: "Sem permissao para desfazer.", criadoPor: SEM_CRACHA }, deps)
    ).rejects.toThrow(/ANULAR_REALOCACAO_DE_DOTACAO/);
    expect(await prisma.anulacaoDeRealocacao.count()).toBe(0);
  });

  /**
   * V27 — O ATO VAI AO TRIBUNAL (SAGRES §4.5 tipos 12/13, §4.6 com o PDF). Tabela "Tipo Alteração Orçamentária" do
   * TCE-PB: 12 = transposição, remanejamento, transferências — origem; 13 = destino. A perna que cede é a origem.
   */
  it("V27 SAGRES: as pernas saem como 12 (origem) e 13 (destino) com o decreto; sem PDF o decreto é nomeado; o desfazimento no dia fica fora com o motivo", async () => {
    const r = await registrarRealocacao(atoQueFecha(), deps);
    const dia = new Date(Date.UTC(2026, 3, 10));
    const itens = await lerFatosAtualizacaoOrcamentaria(prisma, { codUnidadeGestora: "201078", dia });
    expect(itens.map((i) => `${i.numDecretoOficio} ${i.tipoAlteracao} ${i.codUnidadeOrcamentaria} ${i.codPrograma} ${i.codFonteRecurso} ${i.valor.toFixed(2)}`)).toEqual([
      "000102026 12 01001 0012 500 1500.00",
      "000102026 13 01002 0020 500 1500.00",
      "000102026 12 01001 0012 540 700.00",
      "000102026 13 01002 0020 540 700.00",
    ]);
    await expect(lerFatosDecretosEOficios(prisma, { codUnidadeGestora: "201078", dia })).rejects.toThrow(/decreto\(s\) sem o PDF anexado .*de realocação DEC-10\/2026 \(anexe em Planejamento › Remanejamento, transposição e transferência\)/);
    await anexarArquivo(prisma, { nomeOriginal: "decreto-10.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4\n% decreto 10\n"), atoDeRealocacaoId: r.atoId, criadoPor: POR });
    const dec = await lerFatosDecretosEOficios(prisma, { codUnidadeGestora: "201078", dia });
    expect(dec.fatos.map((f) => `${f.numero} ${f.numLei} ${f.tipo}`)).toEqual(["000102026 00552026 1"]);
    expect(dec.pdfs.map((x) => x.nome)).toEqual(["Decreto201078000102026.pdf"]);

    await anularRealocacao({ atoId: r.atoId, data: new Date("2026-04-20T15:00:00Z"), motivo: "Lei revogada pela Camara em abril.", criadoPor: POR }, deps);
    await expect(lerFatosAtualizacaoOrcamentaria(prisma, { codUnidadeGestora: "201078", dia: new Date(Date.UTC(2026, 3, 20)) })).rejects.toThrow(/realocação desfeita no dia \(DEC-10\/2026\): o leiaute não tem registro/);
    // No dia do ato, o arquivo continua o mesmo: as pernas de estorno não entram como 12/13.
    expect(await lerFatosAtualizacaoOrcamentaria(prisma, { codUnidadeGestora: "201078", dia })).toHaveLength(4);
  });
});
