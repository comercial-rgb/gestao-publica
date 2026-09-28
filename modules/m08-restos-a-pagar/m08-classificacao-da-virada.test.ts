import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { toMoney } from "../../packages/contracts/index.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_DOTACAO_INICIAL,
} from "../m01-core-contabil/roteiros.js";
import {
  classificarContaNaVirada,
  contasDaVirada,
  destinoSugerido,
  pernaQueZera,
} from "./classificacao-da-virada.js";
import { encerrarControlesOrcamentarios } from "./encerramento-controles.js";
import { encerrarExercicioComRestos } from "./encerramento.js";

/**
 * ═══ M08/V20 — A CLASSIFICAÇÃO DA CONTA DE CONTROLE NA VIRADA, CONTRA BANCO ═══
 *
 * `encerrarControlesOrcamentarios` já era maduro e provado (`m08-encerramento-controles.test.ts`).
 * O que não existia era o ESCRITOR da tabela-parâmetro de que ele depende: medido antes de
 * construir, `contaNaVirada.create` aparecia em QUATRO lugares, todos arquivos de teste. Em
 * instalação real a tabela ficava vazia para sempre, e a virada recusava sem caminho para resolver.
 *
 * Este arquivo prova as quatro decisões da unidade, e cada uma existe porque a alternativa produz um
 * defeito silencioso:
 *
 *   · a PERNA que a consulta mostra é a MESMA que o encerramento grava (t7) — mostrar uma na tela e
 *     gravar outra é pior do que não mostrar nada, e a perna sai do SINAL do saldo, não de uma
 *     tabela de "que lado essa conta costuma ter";
 *   · a SOMA da consulta conta SÓ o que encerra (t5/t6) — e quando ela não fecha, o encerramento é
 *     recusado pelo motor do M01. É a rede de graça do espelho 5↔6, e o teste a exercita nas duas
 *     direções;
 *   · classificar RECUSA classe fora de 5/6 e conta SINTÉTICA (t3/t4), nomeando o que escolher — o
 *     encerramento também recusaria a sintética, mas só em 31 de dezembro, no dia sem tempo;
 *   · RECLASSIFICAR troca destino e justificativa e NADA MAIS (t8), e vale para a próxima virada.
 */

const prisma = criarPrismaDeTeste();
// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Ver test/banco.ts.
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabil.virada@cg.pb.gov.br";
const SEM_CRACHA = "so.consulta@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-virada";

const DOT_INICIAL = CONTA_DOTACAO_INICIAL;
const C_DISPONIVEL = CONTA_CREDITO_DISPONIVEL;
/** Uma conta da classe 1 — para provar que o destino na virada não existe fora de 5 e 6. */
const CAIXA = "1.1.1.1.2.00.00";
/** Uma SINTÉTICA de controle, e a analítica sob ela — o par do teste de recusa. */
const SINTETICA = "6.3.1.1.0.00.00";
const SOB_A_SINTETICA = "6.3.1.1.1.00.00";

const CONTAS = [
  { id: "v-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "v-sint", codigo: SINTETICA, nome: "RP NAO PROCESSADOS A LIQUIDAR", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: false },
  { id: "v-sob", codigo: SOB_A_SINTETICA, nome: "RP NAO PROCESSADOS A LIQUIDAR - DETALHE", naturezaSaldo: "CREDORA" as const, nivel: 6, analitica: true },
];

async function usuarioComPerfil(
  identificador: string,
  perfil: string,
  acoes: readonly string[]
): Promise<void> {
  const p = await prisma.perfil.create({
    data: {
      nome: perfil,
      descricao: perfil,
      criadoPor: "SEED",
      permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({
    data: { identificador, nome: identificador, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" },
  });
}

let exercicio2026 = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educacao", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educacao" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino fundamental" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "Programa" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "Acao", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Servicos",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  // ⚠️ A FICHA JÁ TRAZ A DOTAÇÃO NO RAZÃO: `criarFichaDeTeste` semeia o roteiro orçamentário e
  // lança a dotação inicial (D 5.2.2.1.1.01 / C 6.2.2.1.1). É essa a fixture N=2 de que a virada
  // precisa — duas contas de controle com saldo, que se ESPELHAM.
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });
  exercicio2026 = (
    await prisma.exercicio.findUniqueOrThrow({ where: { ano: 2026 }, select: { id: true } })
  ).id;

  await usuarioComPerfil(POR, "CONTABILIDADE_DA_VIRADA", [
    "PARAMETRIZAR_VIRADA_DOS_CONTROLES",
    "ENCERRAR_CONTROLES_ORCAMENTARIOS",
    "ENCERRAR_EXERCICIO",
  ]);
  await usuarioComPerfil(SEM_CRACHA, "SO_CONSULTA", ["CONSULTAR_CONTABILIDADE"]);
}

beforeEach(semear, 120_000);

const classificar = (p: {
  conta?: string;
  destino?: "ENCERRA" | "TRANSFERE";
  justificativa?: string;
  por?: string;
}) =>
  classificarContaNaVirada(prisma, {
    contaCodigo: p.conta ?? DOT_INICIAL,
    destino: p.destino ?? "ENCERRA",
    justificativa:
      p.justificativa ??
      "O orcamento e anual: em 31 de dezembro a autorizacao de gastar morre e o credito nao empenhado caduca.",
    criadoPor: p.por ?? POR,
  });

// ═══════════════════════════════════════════════════════════════════════════
// A SUGESTÃO E A PERNA — puras, sem banco, porque não precisam de um
// ═══════════════════════════════════════════════════════════════════════════

describe("a sugestao de destino e a perna que zera (puras)", () => {
  it("t0a sugere TRANSFERE para os ramos de restos a pagar, e ENCERRA para o resto", () => {
    // ⚠️ N=2 NOS DOIS LADOS: dois ramos que transferem (5.3 e 6.3) e duas contas que encerram.
    // Com um exemplo de cada, uma regra que devolvesse sempre o mesmo passaria por vacuidade.
    expect(destinoSugerido("5.3.1.1.0.00.00").destino).toBe("TRANSFERE");
    expect(destinoSugerido("6.3.2.1.0.00.00").destino).toBe("TRANSFERE");
    expect(destinoSugerido(DOT_INICIAL).destino).toBe("ENCERRA");
    expect(destinoSugerido(C_DISPONIVEL).destino).toBe("ENCERRA");

    // e a RAZÃO vem escrita, em português, porque é ela que a tela mostra ao lado do campo
    expect(destinoSugerido("6.3.1.1.0.00.00").razao).toMatch(/restos a pagar/i);
    expect(destinoSugerido(DOT_INICIAL).razao).toMatch(/167/);
  });

  it("t0b a perna sai do SINAL do saldo, e o saldo NEGATIVO troca a perna", () => {
    // devedora positiva morre com CRÉDITO; credora positiva, com DÉBITO
    expect(pernaQueZera("DEVEDORA", toMoney("100.00"))).toBe("CREDITO");
    expect(pernaQueZera("CREDORA", toMoney("100.00"))).toBe("DEBITO");
    // ⚠️ E OS SINAIS INVERTIDOS TROCAM A PERNA. Uma conta credora que ficou devedora existe de
    // verdade — foi medida no banco de apresentação (6.2.1.1.0.00.00, credora, -80.000,00).
    expect(pernaQueZera("CREDORA", toMoney("-100.00"))).toBe("CREDITO");
    expect(pernaQueZera("DEVEDORA", toMoney("-100.00"))).toBe("DEBITO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O ATO DE CLASSIFICAR
// ═══════════════════════════════════════════════════════════════════════════

describe("classificar a conta de controle na virada", () => {
  it("t1 grava o destino com a justificativa e o autor", async () => {
    const r = await classificar({});
    expect(r.codigo).toBe(DOT_INICIAL);
    expect(r.destino).toBe("ENCERRA");
    expect(r.reclassificada).toBe(false);

    const gravada = await prisma.contaNaVirada.findFirstOrThrow({
      where: { conta: { codigo: DOT_INICIAL } },
      select: { destino: true, justificativa: true, criadoPor: true },
    });
    expect(gravada.destino).toBe("ENCERRA");
    expect(gravada.criadoPor).toBe(POR);
    expect(gravada.justificativa).toMatch(/caduca/i);
  });

  it("t2 recusa quem NAO tem a acao — e o motivo e a permissao, nao o cadastro", async () => {
    await expect(classificar({ por: SEM_CRACHA })).rejects.toThrow();
    expect(await prisma.contaNaVirada.count()).toBe(0);
  });

  it("t3 recusa conta FORA das classes 5 e 6, dizendo onde cada classe e tratada", async () => {
    let msg = "";
    try {
      await classificar({ conta: CAIXA });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/classe 1/i);
    expect(msg).toMatch(/APURA[ÇC][ÃA]O DO RESULTADO/i);
    expect(msg).toMatch(/Nada foi gravado/i);
    expect(await prisma.contaNaVirada.count()).toBe(0);
  });

  it("t4 recusa conta SINTETICA e LISTA a analitica sob ela", async () => {
    // ⚠️ RECUSAR SEM MOSTRAR O QUE ESCOLHER é o que mantém pendência de parâmetro aberta por
    // lotes neste repositório. A recusa nomeia a analítica.
    let msg = "";
    try {
      await classificar({ conta: SINTETICA });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/SINT[ÉE]TICA/i);
    expect(msg).toContain(SOB_A_SINTETICA);
    expect(await prisma.contaNaVirada.count()).toBe(0);
  });

  it("t4b recusa conta INEXISTENTE no plano, e nao cria conta", async () => {
    await expect(classificar({ conta: "9.9.9.9.9.99.99" })).rejects.toThrow(
      /n[ãa]o existe no plano de contas/i
    );
    expect(await prisma.contaNaVirada.count()).toBe(0);
  });

  it("t4c recusa justificativa curta — a decisao sem razao escrita e um chute com forca de norma", async () => {
    await expect(classificar({ justificativa: "porque sim" })).rejects.toThrow();
    expect(await prisma.contaNaVirada.count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A CONSULTA, E A AMARRAÇÃO COM O ENCERRAMENTO
// ═══════════════════════════════════════════════════════════════════════════

describe("as contas da virada, e o que elas dizem ao encerramento", () => {
  it("t5 lista SO as contas com saldo, marca as sem destino e a soma conta so o que ENCERRA", async () => {
    const antes = await contasDaVirada(prisma, { ano: 2026 });
    // A dotação inicial e o crédito disponível — o par que a LOA criou. N=2.
    expect(antes.contas.map((c) => c.codigo).sort()).toEqual([DOT_INICIAL, C_DISPONIVEL].sort());
    expect(antes.contas.every((c) => c.destino === null)).toBe(true);
    // ⚠️ SEM CLASSIFICAÇÃO, A SOMA É ZERO — e não a soma dos saldos. A soma conta o que ENCERRA, e
    // nada encerra ainda: mostrar os saldos aqui faria a tela prometer um fechamento que não existe.
    expect(antes.somaDebito.toFixed(2)).toBe("0.00");
    expect(antes.somaCredito.toFixed(2)).toBe("0.00");
    expect(antes.exercicioEncerrado).toBe(false);

    await classificar({ conta: DOT_INICIAL });
    await classificar({ conta: C_DISPONIVEL, destino: "ENCERRA" });

    const depois = await contasDaVirada(prisma, { ano: 2026 });
    expect(depois.contas.every((c) => c.destino === "ENCERRA")).toBe(true);
    expect(depois.somaDebito.toFixed(2)).toBe("100000.00");
    expect(depois.somaCredito.toFixed(2)).toBe("100000.00");
    expect(depois.somaDebito.equals(depois.somaCredito)).toBe(true);
  });

  it("t6 UMA perna do espelho como TRANSFERE faz a soma NAO fechar — e o encerramento RECUSA", async () => {
    // ⚠️ É A REDE DE GRAÇA DO ESPELHO 5↔6, exercitada nas DUAS direções. Classificar só uma perna
    // como TRANSFERE deixa o lançamento desequilibrado, e quem recusa é o motor do M01.
    await classificar({ conta: DOT_INICIAL, destino: "ENCERRA" });
    await classificar({
      conta: C_DISPONIVEL,
      destino: "TRANSFERE",
      justificativa: "Classificacao ERRADA de proposito, para provar que a soma deixa de fechar.",
    });

    const torto = await contasDaVirada(prisma, { ano: 2026 });
    expect(torto.somaDebito.toFixed(2)).toBe("0.00");
    expect(torto.somaCredito.toFixed(2)).toBe("100000.00");
    expect(torto.somaDebito.equals(torto.somaCredito)).toBe(false);

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    await expect(
      encerrarControlesOrcamentarios(prisma, { exercicioId: exercicio2026, criadoPor: POR })
    ).rejects.toThrow();
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "ENCERRAMENTO_CONTROLES" } })
    ).toBe(0);

    // e CONSERTANDO a classificação, o mesmo ato passa — a outra direção da prova
    await classificar({ conta: C_DISPONIVEL, destino: "ENCERRA" });
    const certo = await contasDaVirada(prisma, { ano: 2026 });
    expect(certo.somaDebito.equals(certo.somaCredito)).toBe(true);
    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026,
      criadoPor: POR,
    });
    expect(enc.encerradas).toHaveLength(2);
  });

  it("t7 a PERNA que a consulta mostra e a MESMA que o encerramento grava", async () => {
    // ⚠️ A DUPLICAÇÃO DA DERIVAÇÃO SÓ É ACEITÁVEL PORQUE ESTE TESTE EXISTE. Mostrar uma perna na
    // tela e gravar outra é pior do que não mostrar nada: o operador confere o que a tela disse.
    await classificar({ conta: DOT_INICIAL });
    await classificar({ conta: C_DISPONIVEL });
    const previsto = new Map(
      (await contasDaVirada(prisma, { ano: 2026 })).contas.map((c) => [c.codigo, c.pernaSeEncerrar])
    );

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026,
      criadoPor: POR,
    });
    for (const c of enc.encerradas) {
      expect(previsto.get(c.codigo)).toBe(c.perna);
    }

    // e as PARTIDAS gravadas no razão confirmam, pelo efeito e não pelo retorno da função
    const partidas = await prisma.partidaContabil.findMany({
      where: { lancamento: { origemTipo: "ENCERRAMENTO_CONTROLES" } },
      select: { tipo: true, conta: { select: { codigo: true } } },
    });
    expect(partidas).toHaveLength(2);
    for (const p of partidas) {
      expect(previsto.get(p.conta.codigo)).toBe(p.tipo);
    }

    // depois do encerramento, a consulta não acha mais saldo — a idempotência é do SALDO
    expect((await contasDaVirada(prisma, { ano: 2026 })).contas).toHaveLength(0);
  });

  it("t8 RECLASSIFICAR troca destino e justificativa, e NAO cria linha nova", async () => {
    await classificar({ conta: DOT_INICIAL, destino: "ENCERRA" });
    const r = await classificar({
      conta: DOT_INICIAL,
      destino: "TRANSFERE",
      justificativa: "Decisao revista pela contabilidade, com fundamento no parecer do controle.",
    });
    expect(r.reclassificada).toBe(true);

    // UMA linha, não duas: a unicidade é do banco, e a decisão é VIGENTE, não histórico
    expect(await prisma.contaNaVirada.count({ where: { conta: { codigo: DOT_INICIAL } } })).toBe(1);
    const atual = await prisma.contaNaVirada.findFirstOrThrow({
      where: { conta: { codigo: DOT_INICIAL } },
      select: { destino: true, justificativa: true },
    });
    expect(atual.destino).toBe("TRANSFERE");
    expect(atual.justificativa).toMatch(/parecer do controle/i);
  });

  it("t9 o exercicio ENCERRADO aparece na consulta — e sem ele o encerramento recusa nomeando", async () => {
    await classificar({ conta: DOT_INICIAL });
    await classificar({ conta: C_DISPONIVEL });
    expect((await contasDaVirada(prisma, { ano: 2026 })).exercicioEncerrado).toBe(false);

    // ⚠️ NÃO SE ENTERRA O ORÇAMENTO DE UM ANO QUE AINDA CORRE, e a recusa diz isso.
    await expect(
      encerrarControlesOrcamentarios(prisma, { exercicioId: exercicio2026, criadoPor: POR })
    ).rejects.toThrow(/N[ÃA]O est[áa] encerrado/i);

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    expect((await contasDaVirada(prisma, { ano: 2026 })).exercicioEncerrado).toBe(true);
    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026,
      criadoPor: POR,
    });
    expect(enc.encerradas).toHaveLength(2);
  });

  it("t10 a consulta de um ano SEM exercicio cadastrado nao explode — devolve vazio nomeando", async () => {
    const r = await contasDaVirada(prisma, { ano: 2024 });
    expect(r.exercicioId).toBeNull();
    expect(r.exercicioEncerrado).toBe(false);
    expect(r.contas).toHaveLength(0);
    expect(r.somaDebito.toFixed(2)).toBe("0.00");
  });
});
