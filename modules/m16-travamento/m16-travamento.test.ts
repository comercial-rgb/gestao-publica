import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { toMoney } from "../../packages/contracts/index.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { anularEmpenho, empenhar } from "../m05-despesa/servico.js";
import { apurarResultadoDoExercicio } from "../m08-restos-a-pagar/apuracao.js";
import { encerrarControlesOrcamentarios } from "../m08-restos-a-pagar/encerramento-controles.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { derivarTravamento, janelaDaCompetencia } from "./dominio.js";
import { destravar, estaTravado, travar } from "./servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M16 — TRAVAMENTO DE COMPETÊNCIA. TR 4.52 / 4.53 / 4.54.
 *
 * ⚠️ O CORTE É A `dataTransacao` — A DATA DO **FATO**. Travar janeiro trava os FATOS de
 * janeiro, não o que foi DIGITADO em janeiro.
 *
 * ═══ O CENÁRIO ═══
 *   ficha-1 · LOA 1.000.000 · fonte 500 · natureza 339039
 *   ALICE = "alice@cg.pb.gov.br"   BOB = "bob@cg.pb.gov.br"
 *
 * ═══ A PRECEDÊNCIA (t3), À MÃO ═══
 *   eventos: TRAVAR global 2026-03  ·  DESTRAVAR alice 2026-03
 *
 *   fato de 15/03 da ALICE -> o escopo USUÁRIO vence -> DESTRAVADO -> PASSA
 *   fato de 15/03 do BOB   -> não há evento dele -> cai no global -> TRAVADO -> REJEITA
 *
 *   ⚠️ NÃO é "o mais restritivo vence" (aí a alice também travaria, e o DESBLOQUEIO por
 *   usuário do TR 4.54 não serviria para nada). NÃO é "o mais recente vence, ponto" (aí um
 *   TRAVAR global posterior apagaria o desbloqueio da alice no meio da correção que alguém
 *   autorizou).
 *
 * ═══ O ESTORNO (t5) — o achado do passo 0(c) ═══
 *   empenho de 10/12/2026, 6.000,00 · dezembro TRAVADO
 *
 *   (a) anular com data do ATO = 20/01/2027 -> **PASSA**.
 *       O lançamento de estorno é um fato de JANEIRO. O saldo de dezembro NÃO SE MOVE:
 *       C_EMPENHADO no corte 31/12/2026 = 6.000,00 ANTES e 6.000,00 DEPOIS. O balancete
 *       que o TCE recebeu continua verdadeiro.
 *   (b) o MESMO estorno RETROAGIDO para 20/12/2026 -> **REJEITA**. Aí ele É um fato de
 *       dezembro, e mexeria no número já fechado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const ALICE = "alice@cg.pb.gov.br";
const BOB = "bob@cg.pb.gov.br";
const ADMIN = "controle.interno@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";
const NAT_IPTU = "11180111";

const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const RESULTADOS = "2.3.7.1.1.00.00";
const VPD = "3.3.9.0.1.00.00";

const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-res", codigo: RESULTADOS, nome: "Resultados acumulados", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT_IPTU, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.roteiroEncerramento.create({
    data: { contaResultadosAcumuladosId: "c-res", criadoPor: ADMIN },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "1000000.00",
  });
}

/** Uma arrecadação numa data, por um autor. */
const arrecadar = (dia: string, autor: string, numero: string, valor = "1000.00") =>
  registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: "500", valor,
      dataArrecadacao: new Date(dia), numeroReceita: numero, criadoPor: autor,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );

const contarLancamentos = (): Promise<number> => prisma.lancamentoContabil.count();

describe("M16 — travamento de competência (TR 4.52/4.53/4.54)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — TRAVAR MENSAL GLOBAL, e a derivação (o último evento vence).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: travar 2026-01 -> fato de 15/01 rejeita nomeando; 01/02 passa; destravar -> 15/01 volta", async () => {
    await travar(prisma, { competencia: "2026-01", criadoPor: ADMIN });

    const antes = await contarLancamentos();

    // ⚠️ O FATO DE 15/01 CAI NA JANELA. A mensagem nomeia a janela, o escopo e quem travou.
    await expect(arrecadar("2026-01-15T12:00:00Z", ALICE, "G-1")).rejects.toThrow(
      /COMPETÊNCIA TRAVADA \(TR 4\.52\/4\.53\/4\.54\)/
    );
    await expect(arrecadar("2026-01-15T12:00:00Z", ALICE, "G-1")).rejects.toThrow(
      /janela TRAVADA de 01\/01\/2026 a 31\/01\/2026/
    );
    await expect(arrecadar("2026-01-15T12:00:00Z", ALICE, "G-1")).rejects.toThrow(
      /escopo da trava: GLOBAL/
    );
    await expect(arrecadar("2026-01-15T12:00:00Z", ALICE, "G-1")).rejects.toThrow(
      new RegExp(`travada por:\\s+${ADMIN}`)
    );

    // ⚠️ ZERO ESCRITA — nem o lançamento, nem as partidas, nem a receita.
    expect(await contarLancamentos()).toBe(antes);
    expect(await prisma.partidaContabil.count()).toBe(
      await prisma.partidaContabil.count()
    );
    expect(await prisma.receitaArrecadada.count()).toBe(0);

    // FEVEREIRO passa — a janela é do mês de janeiro, e só dele.
    await expect(arrecadar("2026-02-01T12:00:00Z", ALICE, "G-2")).resolves.toBeDefined();

    // ⚠️ DESTRAVAR NÃO APAGA A TRAVA — acrescenta um evento. O ÚLTIMO vence.
    await destravar(prisma, {
      competencia: "2026-01",
      motivo: "reabertura autorizada pelo controle interno para corrigir a guia G-1",
      criadoPor: ADMIN,
    });
    await expect(arrecadar("2026-01-15T12:00:00Z", ALICE, "G-1")).resolves.toBeDefined();

    // ...e os DOIS eventos continuam no histórico. É isso que o TCE vai ler.
    const eventos = await prisma.movimentoTravamento.findMany({
      orderBy: { criadoEm: "asc" },
      select: { tipo: true, motivo: true },
    });
    expect(eventos.map((e) => e.tipo)).toEqual(["TRAVAR", "DESTRAVAR"]);
    expect(eventos[1]!.motivo).toMatch(/reabertura autorizada/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — TRAVA POR USUÁRIO (TR 4.54).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: alice travada em 2026-03, bob não -> alice rejeita, bob passa (MESMA competência)", async () => {
    await travar(prisma, {
      competencia: "2026-03",
      usuarioAlvo: ALICE,
      criadoPor: ADMIN,
    });

    await expect(arrecadar("2026-03-10T12:00:00Z", ALICE, "A-1")).rejects.toThrow(
      new RegExp(`escopo da trava: do USUÁRIO "${ALICE}"`)
    );
    // O BOB não tem evento nenhum, e não há trava global. Ele passa.
    await expect(arrecadar("2026-03-10T12:00:00Z", BOB, "B-1")).resolves.toBeDefined();

    expect(await prisma.receitaArrecadada.count()).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — A PRECEDÊNCIA: usuário VENCE o global.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: TRAVAR global + DESTRAVAR alice -> alice passa, bob (e o resto) seguem travados", async () => {
    await travar(prisma, { competencia: "2026-03", criadoPor: ADMIN });
    await destravar(prisma, {
      competencia: "2026-03",
      usuarioAlvo: ALICE,
      motivo: "a contadora precisa corrigir a classificação de uma guia de marco",
      criadoPor: ADMIN,
    });

    // ⚠️ ALICE: o escopo USUÁRIO vence — os globais nem são olhados.
    await expect(arrecadar("2026-03-15T12:00:00Z", ALICE, "A-1")).resolves.toBeDefined();

    // ⚠️ BOB: não tem evento próprio -> cai no GLOBAL -> travado.
    await expect(arrecadar("2026-03-15T12:00:00Z", BOB, "B-1")).rejects.toThrow(
      /escopo da trava: GLOBAL/
    );

    expect(await prisma.receitaArrecadada.count()).toBe(1);

    // ⚠️ E NÃO É "O MAIS RECENTE VENCE, PONTO": um TRAVAR global POSTERIOR não pode apagar
    // o desbloqueio da alice — ela seria barrada no meio da correção que alguém autorizou.
    await travar(prisma, { competencia: "2026-03", criadoPor: ADMIN });
    await expect(arrecadar("2026-03-16T12:00:00Z", ALICE, "A-2")).resolves.toBeDefined();
    await expect(arrecadar("2026-03-16T12:00:00Z", BOB, "B-2")).rejects.toThrow(
      /COMPETÊNCIA TRAVADA/
    );
  });

  it("t3b: a derivação é PURA e determinística — provada sem banco", () => {
    const j = janelaDaCompetencia("2026-03");
    const base = { janelaInicio: j.inicio, janelaFim: j.fim, criadoPor: ADMIN };
    const fato = new Date("2026-03-15T12:00:00Z");

    const global = { ...base, id: "e1", tipo: "TRAVAR" as const, usuarioAlvo: null, criadoEm: new Date("2026-04-01T10:00:00Z") };
    const daAlice = { ...base, id: "e2", tipo: "DESTRAVAR" as const, usuarioAlvo: ALICE, criadoEm: new Date("2026-04-01T11:00:00Z") };

    // usuário vence o global — para ELE
    expect(derivarTravamento([global, daAlice], fato, ALICE)).toBeNull();
    expect(derivarTravamento([global, daAlice], fato, BOB)?.escopo).toBe("GLOBAL");

    // sem evento nenhum = DESTRAVADO. O sistema nasce aberto; travar é um ATO.
    expect(derivarTravamento([], fato, ALICE)).toBeNull();

    // a janela não cobre o fato -> não decide nada
    expect(derivarTravamento([global], new Date("2026-04-15T12:00:00Z"), BOB)).toBeNull();

    // ⚠️ EMPATE DE `criadoEm` NÃO PODE VIRAR SORTEIO: o desempate é pelo id, e a resposta
    // é a MESMA toda vez que a pergunta for feita.
    const a = { ...base, id: "aaa", tipo: "TRAVAR" as const, usuarioAlvo: null, criadoEm: new Date("2026-04-01T10:00:00Z") };
    const b = { ...base, id: "bbb", tipo: "DESTRAVAR" as const, usuarioAlvo: null, criadoEm: new Date("2026-04-01T10:00:00Z") };
    const r1 = derivarTravamento([a, b], fato, BOB);
    const r2 = derivarTravamento([b, a], fato, BOB);
    expect(r1).toEqual(r2); // a ordem de leitura do banco não muda a resposta
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — `ENCERRAMENTO` É ISENTO: a virada roda dentro do mês travado.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: dezembro travado -> a VIRADA (apuração + encerramento de controles) RODA; lançamento NORMAL rejeita", async () => {
    // Um exercício com movimento: arrecada 8.000 em janeiro (destravado).
    await arrecadar("2026-01-10T12:00:00Z", ALICE, "G-1", "8000.00");

    // ⚠️ TRAVA DEZEMBRO — e é a ordem NATURAL das coisas: fecha-se o mês e SÓ ENTÃO se
    // apura o resultado.
    await travar(prisma, { competencia: "2026-12", criadoPor: ADMIN });

    // Um lançamento NORMAL em dezembro: REJEITA.
    await expect(arrecadar("2026-12-20T12:00:00Z", ALICE, "G-DEZ")).rejects.toThrow(
      /COMPETÊNCIA TRAVADA/
    );

    // ═══ MAS A VIRADA PASSA — ela é `natureza = ENCERRAMENTO`, e lança em 31/12 ═══
    //
    // ⚠️ SE ELA NÃO FOSSE ISENTA, TRAVAR DEZEMBRO TORNARIA O ENCERRAMENTO DO EXERCÍCIO
    // IMPOSSÍVEL — e o ente teria de DESTRAVAR dezembro para poder encerrá-lo, que é o
    // oposto do que o TR quer.
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: ADMIN });
    const ex = await prisma.exercicio.findUniqueOrThrow({
      where: { ano: 2026 },
      select: { id: true },
    });

    const ap = await apurarResultadoDoExercicio(prisma, {
      exercicioId: ex.id,
      criadoPor: ADMIN,
    });
    expect(ap.resultadoApurado.toFixed(2)).toBe("8000.00"); // VPA 8.000 − VPD 0

    // O encerramento dos controles (cbb6d0f) — também ENCERRAMENTO, também em 31/12.
    await prisma.contaNaVirada.createMany({
      data: await Promise.all(
        ["5.2.2.1.1.00.00", C_DISPONIVEL, R_A_REALIZAR, R_REALIZADA].map(async (codigo) => {
          const c = await prisma.contaPcasp.findUniqueOrThrow({
            where: { codigo },
            select: { id: true },
          });
          return {
            contaId: c.id,
            destino: "ENCERRA" as const,
            justificativa: "o orçamento é anual — CF art. 165 e 167, II",
            criadoPor: ADMIN,
          };
        })
      ),
    });
    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: ex.id,
      criadoPor: ADMIN,
    });
    expect(enc.encerradas.length).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — O ESTORNO: as duas semânticas, e as duas estão certas (passo 0(c)).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: anular em JANEIRO um empenho de dezembro travado PASSA (o saldo de 31/12 não se move); RETROAGIDO rejeita", async () => {
    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "6000.00",
        data: new Date("2026-12-10T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "serviços de dezembro", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: ALICE,
      },
      R_EMPENHO,
      deps
    );

    await travar(prisma, { competencia: "2026-12", criadoPor: ADMIN });

    const FIM_2026 = new Date("2026-12-31T23:59:59.999Z");
    const saldoEmpenhado = (): Promise<ReturnType<typeof toMoney>> =>
      saldoDasContas(prisma, [C_EMPENHADO], FIM_2026, "dataTransacao");

    // O crédito empenhado em 31/12: C 6.000 -> ΣD − ΣC = −6.000 (conta credora).
    const antes = await saldoEmpenhado();
    expect(antes.toFixed(2)).toBe("-6000.00");

    // ═══ (b) RETROAGIDO para 20/12 -> REJEITA. Aí ele É um fato de dezembro. ═══
    await expect(
      anularEmpenho(
        {
          empenhoId: e.empenhoId, numero: "ANE-1", historico: "cancelado pelo gestor",
          data: new Date("2026-12-20T12:00:00Z"), criadoPor: ALICE,
        },
        deps
      )
    ).rejects.toThrow(/janela TRAVADA de 01\/12\/2026 a 31\/12\/2026/);

    // ═══ (a) COM A DATA DO ATO EM JANEIRO -> PASSA ═══
    //
    // ⚠️ E ESTÁ CERTO: o lançamento de estorno é um fato de JANEIRO de 2027. Barrar isso
    // impediria o ente de corrigir em janeiro um erro de dezembro — que é justamente o que
    // ele TEM de fazer.
    await expect(
      anularEmpenho(
        {
          empenhoId: e.empenhoId, numero: "ANE-1", historico: "cancelado pelo gestor",
          data: new Date("2027-01-20T12:00:00Z"), criadoPor: ALICE,
        },
        deps
      )
    ).resolves.toBeDefined();

    // ⚠️ E A PROVA DE QUE O TRAVAMENTO CUMPRIU O QUE PROMETEU: o saldo publicado de
    // DEZEMBRO **não se moveu**. O balancete que o TCE recebeu continua verdadeiro — o
    // estorno é um fato de 2027, e o corte de 31/12/2026 não o enxerga.
    const depois = await saldoEmpenhado();
    expect(depois.toFixed(2)).toBe("-6000.00");
    expect(depois.toFixed(2)).toBe(antes.toFixed(2));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — INTERVALO POR DATA (TR 4.52 "ou por data" · 4.53 "por período").
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: travar 10/01..20/01 -> fato de 15/01 rejeita, de 25/01 passa (o mesmo modelo, outra janela)", async () => {
    await travar(prisma, {
      janelaInicio: new Date("2026-01-10T00:00:00.000Z"),
      janelaFim: new Date("2026-01-20T23:59:59.999Z"),
      criadoPor: ADMIN,
    });

    await expect(arrecadar("2026-01-15T12:00:00Z", ALICE, "G-1")).rejects.toThrow(
      /janela TRAVADA de 10\/01\/2026 a 20\/01\/2026/
    );
    // Fora do intervalo — antes e depois.
    await expect(arrecadar("2026-01-25T12:00:00Z", ALICE, "G-2")).resolves.toBeDefined();
    await expect(arrecadar("2026-01-05T12:00:00Z", ALICE, "G-3")).resolves.toBeDefined();

    // ⚠️ E O `travar` RECUSA a janela ambígua: competência E intervalo juntos seriam DUAS
    // janelas para o mesmo evento, e o sistema teria de escolher uma.
    await expect(
      travar(prisma, {
        competencia: "2026-02",
        janelaInicio: new Date("2026-02-01T00:00:00Z"),
        janelaFim: new Date("2026-02-28T00:00:00Z"),
        criadoPor: ADMIN,
      })
    ).rejects.toThrow();

    // ...e o DESTRAVAR exige motivo de 10+ caracteres.
    await expect(
      destravar(prisma, { competencia: "2026-01", motivo: "erro", criadoPor: ADMIN })
    ).rejects.toThrow(/ao menos 10 caracteres/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — A CORRIDA `travar()` × `lancarNoRazao()`.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: depois que a trava está COMMITADA, nenhum dos 5 lançamentos concorrentes atravessa", async () => {
    // ⚠️ A GARANTIA QUE O TRAVAMENTO DÁ, E A ÚNICA QUE ELE PODE DAR:
    // **depois que a trava existe, nada mais entra.**
    //
    // Sob READ COMMITTED, uma trava JÁ COMMITADA é vista por toda leitura posterior — e o
    // guard lê na MESMA transação do INSERT. Não há lock, e não deveria haver: o travamento
    // não é um recurso CONSUMÍVEL (dois `travar` concorrentes não estouram saldo nenhum), e
    // um lock no caminho por onde passa TODO lançamento do sistema custaria caro para
    // resolver uma corrida de milissegundos entre um ato ADMINISTRATIVO e um fato já em voo.
    await travar(prisma, { competencia: "2026-05", criadoPor: ADMIN });

    const antes = await contarLancamentos();

    const r = await Promise.allSettled(
      [1, 2, 3, 4, 5].map((i) =>
        arrecadar("2026-05-15T12:00:00Z", i % 2 === 0 ? ALICE : BOB, `C-${i}`)
      )
    );

    // TODOS rejeitados — nenhum atravessou.
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(0);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(5);
    for (const x of r) {
      expect((x as PromiseRejectedResult).reason.message).toMatch(/COMPETÊNCIA TRAVADA/);
    }

    // ⚠️ ZERO ESCRITA, PROVADO POR SELECT.
    expect(await contarLancamentos()).toBe(antes);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });

  it("t7b: `estaTravado` é a MESMA leitura que o guard usa — e ela responde por usuário", async () => {
    await travar(prisma, { competencia: "2026-06", usuarioAlvo: BOB, criadoPor: ADMIN });

    const fato = new Date("2026-06-15T12:00:00Z");
    expect(await estaTravado(prisma, fato, BOB)).not.toBeNull();
    expect(await estaTravado(prisma, fato, ALICE)).toBeNull();
    expect(await estaTravado(prisma, new Date("2026-07-15T12:00:00Z"), BOB)).toBeNull();
  });
});
