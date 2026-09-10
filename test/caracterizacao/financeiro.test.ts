import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { criarFichaDeTeste } from "../ficha-teste.js";
import { criarM05Deps } from "../../modules/m05-despesa/adapter-prisma.js";
import type { M05Deps } from "../../modules/m05-despesa/ports.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../../modules/m05-despesa/dominio.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import {
  saldosCorrentesDaFicha,
  saldosDaFichaPorCompetencia,
  saldosDaFichaPorRegistro,
} from "../../modules/m05-despesa/servico.js";
import { avaliarOrdem, ordenarFila } from "../../modules/m06-ordem-cronologica/dominio.js";
import {
  exigirCompetenciaEmExercicioAberto,
  exigirExercicioAberto,
} from "../../modules/m08-restos-a-pagar/guard-exercicio.js";
import { encerrarExercicio } from "../../modules/m08-restos-a-pagar/exercicio.js";
import { gerarAnulacaoParcial, gerarEstorno } from "../../packages/ledger/index.js";
import { toMoney } from "../../packages/contracts/index.js";

/**
 * CARACTERIZAÇÃO DO FINANCEIRO — o que o código faz HOJE, antes do ENT03 ampliar.
 *
 * ═══ ⚠️ ISTO NÃO É UM TESTE DE REQUISITO ═══
 * Um teste de requisito afirma o que o sistema DEVE fazer e falha quando o código está
 * errado. Um teste de caracterização afirma o que o sistema FAZ e falha quando o
 * comportamento MUDA — mesmo que a mudança seja uma melhoria.
 *
 * A diferença importa aqui por uma razão específica: **três dos cinco pontos abaixo
 * registram limitações**, não garantias. Se alguém as corrigir, estes testes vão falhar —
 * e é esse o serviço que eles prestam: a correção passa a ser uma decisão consciente, com
 * o antes e o depois à vista, em vez de uma mudança silenciosa de semântica no meio de
 * outro trabalho.
 *
 * ═══ POR QUE ELE EXISTE AGORA ═══
 * Em 2026-09-09, M01, M04, M05, M06, M07, M08, M12 e M14 apareceram com 13 falhas. A
 * leitura apressada teria sido "há defeitos no financeiro". Não havia: eram duas suítes
 * disputando o mesmo banco. Medido de novo com o banco quieto e a trava tomada:
 * **61 arquivos, 647 testes, 0 falhas, 190s** (2026-09-10).
 *
 * Nada novo entra nesses módulos sobre suíte que ninguém mediu — e "medida" quer dizer
 * isto: o comportamento atual escrito num teste que falha quando ele mudar.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "despesa@cg.pb.gov.br";
const FICHA = "ficha-carac";
const FONTE = "fnt-carac";
const CREDOR = "12345678000199";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR,
  disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO,
  creditoPago: C_PAGO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "cc-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "cc-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "cc-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "cc-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "cc-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "cc-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "cc-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "og-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "ud-01", codigo: "01001", descricao: "Administração", orgaoId: "og-01" },
  });
  await prisma.funcao.create({ data: { id: "fn-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sf-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "pg-1", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "ac-1", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-1", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb-carac", codigo: "CC-900", descricao: "Movimento", fonteId: FONTE },
  });

  await criarFichaDeTeste(prisma, {
    id: FICHA, numero: 1, exercicio: 2026, orgaoId: "og-01", unidadeOrcId: "ud-01",
    funcaoId: "fn-04", subfuncaoId: "sf-122", programaId: "pg-1", acaoId: "ac-1",
    naturezaDespesaId: "nd-1", fonteId: FONTE, valorDotado: "500000.00",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SALDO DE DOTAÇÃO POR DATA
// ═══════════════════════════════════════════════════════════════════════════

describe("caracterização · saldo de dotação por data", () => {
  beforeEach(semear);

  /**
   * ═══ ⚠️ ESTA CARACTERIZAÇÃO FOI SUPERADA EM 2026-09-10, DE PROPÓSITO ═══
   *
   * O que c1 e c2 registravam, e que era verdade quando foram escritos:
   *
   *   · `MovimentoDotacao` não tinha data de competência, só `criadoEm`;
   *   · `saldosDaFicha(fichaId, deps)` tinha dois parâmetros, nenhum temporal;
   *   · logo, não havia saldo de dotação por data — havia saldo total.
   *
   * O teste ACUSOU, que é a função dele, e a acusação virou decisão registrada em
   * `docs/adr/ADR-competencia-no-movimento-de-dotacao.md` (aceito, alternativa A).
   * Os testes abaixo passam a caracterizar o comportamento NOVO.
   *
   * ═══ ⚠️ E UMA CONFISSÃO SOBRE O c2 ANTIGO, QUE IMPORTA MAIS QUE A MUDANÇA ═══
   * O c2 original afirmava, no docblock, que "se alguém acrescentar uma
   * `dataCompetencia`, este teste falha". Ele NÃO teria falhado. A asserção era:
   *
   *     expect(nomes.filter((n) => /^data/i.test(n))).toEqual([])
   *
   * A coluna que este lote acrescentou chama-se `competencia` — não começa com "data",
   * não casa com a regex, e o teste teria passado VERDE sobre a mudança exata que ele
   * dizia vigiar. O guard era mais estreito que a promessa do seu próprio comentário.
   *
   * A lição não é sobre esta regex: **um teste de caracterização que vigia um NOME de
   * coluna vigia a grafia, não o conceito.** O c2 abaixo passa a afirmar o conjunto
   * EXATO de colunas — sobra e falta acusam igual, e nenhuma grafia nova escapa.
   */
  it("c1: o saldo da ficha aceita corte por COMPETÊNCIA e por REGISTRO", async () => {
    const antes = await saldosCorrentesDaFicha(FICHA, deps);
    expect(antes.autorizado.toFixed(2)).toBe("500000.00");
    expect(antes.disponivel.toFixed(2)).toBe("500000.00");

    // Um empenho com data de FEVEREIRO, gravado AGORA. É a assimetria inteira num
    // fato só: a competência é de fevereiro, o registro é de hoje.
    await empenhar(
      {
        fichaId: FICHA, numero: "NE-C1", tipo: "ORDINARIO", valor: "30000.00",
        data: new Date("2026-02-10T12:00:00Z"), credorCpfCnpj: CREDOR,
        historico: "empenho de fevereiro", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );

    const corrente = await saldosCorrentesDaFicha(FICHA, deps);
    expect(corrente.empenhado.toFixed(2)).toBe("30000.00");
    expect(corrente.disponivel.toFixed(2)).toBe("470000.00");

    // ⚠️ O QUE ANTES NÃO EXISTIA. Em 31/01 o empenho de 10/02 ainda não competia.
    const emJaneiro = await saldosDaFichaPorCompetencia(
      FICHA,
      new Date("2026-01-31T23:59:59Z"),
      deps
    );
    expect(emJaneiro.empenhado.toFixed(2)).toBe("0.00");
    expect(emJaneiro.disponivel.toFixed(2)).toBe("500000.00");

    // Em 28/02 ele já competia.
    const emFevereiro = await saldosDaFichaPorCompetencia(
      FICHA,
      new Date("2026-02-28T23:59:59Z"),
      deps
    );
    expect(emFevereiro.empenhado.toFixed(2)).toBe("30000.00");

    // ⚠️ E OS DOIS EIXOS DIVERGEM — é isto que prova que são dois, e não um com
    // dois nomes. Por REGISTRO, em 28/02 o empenho ainda não estava gravado (ele foi
    // gravado agora, neste teste), então o empenhado é ZERO. Por COMPETÊNCIA, é 30.000.
    const registradoAteFevereiro = await saldosDaFichaPorRegistro(
      FICHA,
      new Date("2026-02-28T23:59:59Z"),
      deps
    );
    expect(registradoAteFevereiro.empenhado.toFixed(2)).toBe("0.00");
    expect(emFevereiro.empenhado.toFixed(2)).not.toBe(
      registradoAteFevereiro.empenhado.toFixed(2)
    );

    // ⚠️ A ASSINATURA ANTIGA NÃO SOBREVIVEU. `saldosDaFicha` foi RETIRADA — não ganhou
    // um terceiro parâmetro opcional. Um opcional teria deixado todo chamador de hoje
    // respondendo pelo eixo antigo sem que ninguém decidisse isso.
    const servico = await import("../../modules/m05-despesa/servico.js");
    expect(Object.keys(servico)).not.toContain("saldosDaFicha");
    expect(saldosDaFichaPorCompetencia.length).toBe(3);
  });

  it("c2: `MovimentoDotacao` guarda os DOIS eixos — competência e registro", async () => {
    const movimentos = await prisma.movimentoDotacao.findMany({
      where: { fichaId: FICHA },
      select: { tipo: true, valor: true, criadoEm: true, competencia: true },
    });
    expect(movimentos.length).toBeGreaterThan(0);

    const colunas = Object.keys(movimentos[0] as object).sort();
    expect(colunas).toEqual(["competencia", "criadoEm", "tipo", "valor"]);

    // ⚠️ O CONJUNTO EXATO, e não uma regex sobre nomes — ver o docblock acima. Sobra
    // acusa (coluna nova sem decisão) e falta acusa (coluna removida). Nenhuma grafia
    // futura escapa porque não casou com um prefixo.
    const campos = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'MovimentoDotacao' ORDER BY column_name`
    );
    expect(campos.map((c) => c.column_name)).toEqual([
      "competencia",
      "competenciaDerivada",
      "criadoEm",
      "criadoPor",
      "estornoDeId",
      "fichaId",
      "id",
      "origemId",
      "origemTipo",
      "tipo",
      "valor",
    ]);

    // ⚠️ A DOTAÇÃO INICIAL COMPETE EM 1º DE JANEIRO, não no dia da digitação. Sem isto,
    // a MSC de março mostraria a LOA "entrando" em março.
    const loa = movimentos.find((m) => m.tipo === "DOTACAO_INICIAL");
    expect(loa).toBeDefined();
    expect(loa!.competencia.toISOString().slice(0, 10)).toBe("2026-01-01");
    // E os dois eixos são MESMO diferentes nesta linha — a prova de que não é um alias.
    expect(loa!.competencia.getTime()).not.toBe(loa!.criadoEm.getTime());
  });

  it("c3a: movimento com competência em exercício ENCERRADO é recusado", async () => {
    // ⚠️ O VETOR QUE A COMPETÊNCIA ABRIU, e que o guard antigo não via: a ficha é de
    // 2026 (aberto), mas o FATO é datado de 2025 (encerrado). `exigirExercicioDaFichaAberto`
    // olharia 2026 e deixaria passar.
    await prisma.exercicio.upsert({
      where: { ano: 2025 },
      update: {},
      create: { ano: 2025, criadoPor: POR },
    });
    await encerrarExercicio(prisma, { ano: 2025, encerradoPor: POR });

    await expect(
      empenhar(
        {
          fichaId: FICHA, numero: "NE-C3A", tipo: "ORDINARIO", valor: "100.00",
          data: new Date("2025-12-20T12:00:00Z"), credorCpfCnpj: CREDOR,
          historico: "empenho antedatado", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
          criadoPor: POR,
        },
        R_EMPENHO,
        deps
      )
    ).rejects.toThrow(/ENCERRADO/);
  });

  /**
   * ⚠️ E A FRONTEIRA DO GUARD, QUE UM TESTE EXISTENTE ME CORRIGIU.
   *
   * A primeira versão de `exigirCompetenciaEmExercicioAberto` recusava exercício
   * ENCERRADO **e também** exercício INEXISTENTE. Ela derrubou o `t5` do M16 — "anular em
   * JANEIRO um empenho de dezembro travado PASSA" —, cuja anulação tem data de
   * **20/01/2027**, ano ainda não aberto.
   *
   * O teste estava certo e o guard errado: recusar ali impediria o ente de **corrigir em
   * janeiro um erro de dezembro**, que é precisamente o que ele tem de poder fazer.
   *
   * A condição do ADR é "competência em período **FECHADO**". Um ano que ninguém abriu não
   * é um período fechado — é um período que não começou. Este teste prende a distinção,
   * para que a próxima pessoa que quiser "endurecer o guard" veja o preço antes.
   */
  it("c3b: competência em ano AINDA NÃO ABERTO passa — não é a mesma coisa que fechado", async () => {
    const semExercicio = await prisma.exercicio.findUnique({ where: { ano: 2028 } });
    expect(semExercicio, "2028 não deve estar aberto neste fixture").toBeNull();

    await expect(
      exigirCompetenciaEmExercicioAberto(
        prisma,
        new Date("2028-01-20T12:00:00Z"),
        "correção de janeiro"
      )
    ).resolves.toBeUndefined();

    // E o exercício ENCERRADO continua sendo recusado — o guard não virou decoração.
    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });
    await expect(
      exigirCompetenciaEmExercicioAberto(
        prisma,
        new Date("2026-06-15T12:00:00Z"),
        "movimento retroativo"
      )
    ).rejects.toThrow(/ENCERRADO/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. GERAÇÃO DE LANÇAMENTO POR EVENTO
// ═══════════════════════════════════════════════════════════════════════════

describe("caracterização · geração de lançamento por evento", () => {
  beforeEach(semear);

  /**
   * O ROTEIRO É PARÂMETRO, NÃO TABELA — e é a decisão mais consequente do M01.
   *
   * `empenhar(params, ROTEIRO, deps)` recebe o roteiro contábil de fora. Não há uma tabela
   * `EventoContabil` que o serviço consulte: quem chama diz quais contas usar, e o motor
   * (`validarLancamento`) recusa o que não fecha.
   *
   * O efeito para o ENT03: **cada evento novo (convênio, precatório, dívida fundada, PPP)
   * traz o seu roteiro no código que o chama** — não se cadastra um evento numa tabela e
   * espera que o lançamento apareça. Quem for implementar 2.4 precisa saber disso antes de
   * modelar, porque a alternativa (tabela de eventos configurável) é uma reescrita do M01,
   * e o prompt proíbe reescrever o ledger para acomodar funcionalidade nova.
   */
  it("c3: o lançamento nasce de um ROTEIRO passado ao serviço, não de tabela de eventos", async () => {
    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-C3", tipo: "ORDINARIO", valor: "1000.00",
        data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
        historico: "empenho", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );

    const lanc = await prisma.lancamentoContabil.findFirstOrThrow({
      where: { empenho: { id: e.empenhoId } },
      select: {
        partidas: {
          select: { tipo: true, subsistema: true, valor: true, conta: { select: { codigo: true } } },
          orderBy: { tipo: "asc" },
        },
      },
    });

    // As duas pernas do empenho vêm EXATAMENTE das contas que o roteiro nomeou.
    expect(
      lanc.partidas.map((p) => `${p.tipo} ${p.conta.codigo} ${p.subsistema}`).sort()
    ).toEqual([
      `CREDITO ${C_EMPENHADO} ORCAMENTARIO`,
      `DEBITO ${C_DISPONIVEL} ORCAMENTARIO`,
    ]);

    // ⚠️ NÃO EXISTE TABELA QUE MAPEIE EVENTO → PARTIDAS. As duas tabelas com "evento" no
    // nome são outra coisa, e vale registrar quais são — a primeira é um achado útil para
    // o ENT03:
    //
    //   · `EventoLimitacaoEmpenho` (M02) — o CONTINGENCIAMENTO, append-only: cada linha
    //     LIGA ou DESLIGA a limitação de empenho de um exercício, e a vigente é a última
    //     por `criadoEm`. O item 2.5 do ENT03 pede contingenciamento com liberação: a base
    //     já existe, e construir outra seria o segundo caminho para o mesmo fato;
    //   · `EventoFiscalOutbox` (base) — a fila de saída das integrações, com
    //     `@@unique([destino, chaveIdemp])`. É idempotência de transmissão, não roteiro.
    //
    // A asserção é sobre o CONJUNTO exato: se aparecer uma terceira, este teste falha e
    // alguém decide se ela é (ou não) a tabela de roteiros que este desenho recusa.
    const tabelas = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name ILIKE '%evento%'
        ORDER BY table_name`
    );
    expect(tabelas.map((t) => t.table_name)).toEqual([
      "EventoFiscalOutbox",
      "EventoLimitacaoEmpenho",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. REGRA DE ESTORNO POR PERNA
// ═══════════════════════════════════════════════════════════════════════════

describe("caracterização · regra de estorno por perna", () => {
  /**
   * ESTORNO INVERTE **CADA PERNA**, preservando conta, subsistema e valor DAQUELA perna.
   *
   * O que isto garante, e o prompt do ENT03 cobra explicitamente ("não recarimbar valor
   * único nas pernas de um estorno"): um pagamento COM RETENÇÃO tem pernas de valores
   * DIFERENTES — o caixa leva o líquido, a obrigação morre pelo bruto, o retido vira
   * passivo. O estorno preserva cada valor no seu lugar.
   */
  it("c4: o estorno preserva o valor DE CADA perna — nada é recarimbado", () => {
    // Um pagamento com retenção: bruto 1000, retido 100, líquido 900.
    const original = {
      id: "l-orig",
      numeroControle: "2026/000123",
      dataTransacao: new Date("2026-03-01T12:00:00Z"),
      historico: "pagamento com retenção",
      estornos: [] as readonly string[],
      partidas: [
        { conta: FORNECEDOR, tipo: "DEBITO" as const, subsistema: "PATRIMONIAL" as const, valor: toMoney("1000.00") },
        { conta: CAIXA, tipo: "CREDITO" as const, subsistema: "PATRIMONIAL" as const, valor: toMoney("900.00") },
        { conta: "2.1.8.8.1.01.00", tipo: "CREDITO" as const, subsistema: "PATRIMONIAL" as const, valor: toMoney("100.00") },
      ],
    };

    const estorno = gerarEstorno(original, {
      idEstorno: "l-est",
      numeroControleEstorno: "2026/000124",
      dataEstorno: new Date("2026-04-01T12:00:00Z"),
    });

    const porConta = Object.fromEntries(
      estorno.partidas.map((p) => [p.conta, { tipo: p.tipo, valor: p.valor.toFixed(2) }])
    );
    expect(porConta[FORNECEDOR]).toEqual({ tipo: "CREDITO", valor: "1000.00" });
    expect(porConta[CAIXA]).toEqual({ tipo: "DEBITO", valor: "900.00" });
    expect(porConta["2.1.8.8.1.01.00"]).toEqual({ tipo: "DEBITO", valor: "100.00" });

    // ⚠️ A DATA DO ESTORNO É A DO ATO, não a do fato original. É ela que decide em que
    // período o estorno cai — o travamento e os relatórios cortam por `dataTransacao`.
    expect(estorno.dataTransacao.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(estorno.estornoDeId).toBe("l-orig");
  });

  it("c5: estornar duas vezes o mesmo lançamento é RECUSADO", () => {
    const jaEstornado = {
      id: "l-x", numeroControle: "2026/000200", dataTransacao: new Date("2026-03-01T12:00:00Z"),
      historico: "x", estornos: ["l-y"] as readonly string[],
      partidas: [
        { conta: C_DISPONIVEL, tipo: "DEBITO" as const, subsistema: "ORCAMENTARIO" as const, valor: toMoney("10.00") },
        { conta: C_EMPENHADO, tipo: "CREDITO" as const, subsistema: "ORCAMENTARIO" as const, valor: toMoney("10.00") },
      ],
    };
    expect(() =>
      gerarEstorno(jaEstornado, {
        idEstorno: "l-z", numeroControleEstorno: "2026/000201",
        dataEstorno: new Date("2026-04-01T12:00:00Z"),
      })
    ).toThrow(/já foi estornado/);
  });

  /**
   * ⚠️ A ANULAÇÃO PARCIAL DE LANÇAMENTO COMPOSTO É UMA PORTA FECHADA, de propósito.
   *
   * Reduzir proporcionalmente um pagamento com retenção exigiria decidir de QUEM sai o
   * pedaço anulado — do fornecedor ou do INSS —, e a resposta não está no lançamento.
   * O motor recusa nomeando, em vez de escolher em silêncio.
   *
   * Registro isto porque o ENT03 mexe com lote de pagamento e borderô, e a tentação de
   * "anular parcialmente um item do lote" vai aparecer.
   */
  it("c6: anulação parcial de lançamento COMPOSTO é recusada, com motivo", () => {
    const comRetencao = {
      id: "l-r", numeroControle: "2026/000300", dataTransacao: new Date("2026-03-01T12:00:00Z"),
      historico: "pagamento com retenção", estornos: [] as readonly string[],
      partidas: [
        { conta: FORNECEDOR, tipo: "DEBITO" as const, subsistema: "PATRIMONIAL" as const, valor: toMoney("1000.00") },
        { conta: CAIXA, tipo: "CREDITO" as const, subsistema: "PATRIMONIAL" as const, valor: toMoney("900.00") },
        { conta: "2.1.8.8.1.01.00", tipo: "CREDITO" as const, subsistema: "PATRIMONIAL" as const, valor: toMoney("100.00") },
      ],
    };
    expect(() =>
      gerarAnulacaoParcial(comRetencao, toMoney("500.00"), {
        idEstorno: "l-p", numeroControleEstorno: "2026/000301",
        dataEstorno: new Date("2026-04-01T12:00:00Z"),
      })
    ).toThrow(/ANULAÇÃO PARCIAL DE LANÇAMENTO COMPOSTO/);
  });

  it("c7: a anulação parcial NÃO é estorno — não marca `estornoDeId` e admite repetição", () => {
    const simples = {
      id: "l-s", numeroControle: "2026/000400", dataTransacao: new Date("2026-03-01T12:00:00Z"),
      historico: "empenho", estornos: [] as readonly string[],
      partidas: [
        { conta: C_DISPONIVEL, tipo: "DEBITO" as const, subsistema: "ORCAMENTARIO" as const, valor: toMoney("1000.00") },
        { conta: C_EMPENHADO, tipo: "CREDITO" as const, subsistema: "ORCAMENTARIO" as const, valor: toMoney("1000.00") },
      ],
    };
    const p1 = gerarAnulacaoParcial(simples, toMoney("300.00"), {
      idEstorno: "l-p1", numeroControleEstorno: "2026/000401",
      dataEstorno: new Date("2026-04-01T12:00:00Z"),
    });
    // ⚠️ SEM `estornoDeId`: um fato pode ser REDUZIDO várias vezes, e marcá-lo como
    // estornado faria a segunda parcial ser recusada como "já estornado".
    expect(p1.estornoDeId).toBeUndefined();

    const p2 = gerarAnulacaoParcial(simples, toMoney("200.00"), {
      idEstorno: "l-p2", numeroControleEstorno: "2026/000402",
      dataEstorno: new Date("2026-05-01T12:00:00Z"),
    });
    expect(p2.partidas[0]?.valor.toFixed(2)).toBe("200.00");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. ORDEM CRONOLÓGICA
// ═══════════════════════════════════════════════════════════════════════════

describe("caracterização · ordem cronológica (art. 141)", () => {
  const fila = [
    { liquidacaoId: "L3", numero: "NL-003", dataLiquidacao: new Date("2026-03-10"), fonteId: FONTE, categoria: "FORNECIMENTO_BENS" as const, saldoAPagar: toMoney("100.00") },
    { liquidacaoId: "L1", numero: "NL-001", dataLiquidacao: new Date("2026-03-01"), fonteId: FONTE, categoria: "FORNECIMENTO_BENS" as const, saldoAPagar: toMoney("100.00") },
    { liquidacaoId: "L2", numero: "NL-002", dataLiquidacao: new Date("2026-03-01"), fonteId: FONTE, categoria: "FORNECIMENTO_BENS" as const, saldoAPagar: toMoney("100.00") },
  ];

  /**
   * O MARCO É A **LIQUIDAÇÃO**, não o empenho nem o vencimento — é a exigibilidade do
   * caput do art. 141. O desempate é pelo número da liquidação, porque duas liquidações do
   * mesmo dia precisam de uma ordem TOTAL: sem ela, "a cabeça da fila" seria ambígua e a
   * regra viraria loteria.
   */
  it("c8: a fila ordena por data de LIQUIDAÇÃO, desempatando pelo número", () => {
    expect(ordenarFila(fila).map((l) => l.liquidacaoId)).toEqual(["L1", "L2", "L3"]);
  });

  it("c9: pagar quem não é a cabeça da fila é relatado como quebra, com a preterida", () => {
    const cabeca = avaliarOrdem(fila, "L1");
    expect(cabeca.ehCabecaDaFila).toBe(true);
    expect(cabeca.preterida).toBeNull();

    const fora = avaliarOrdem(fila, "L3");
    expect(fora.ehCabecaDaFila).toBe(false);
    expect(fora.posicao).toBe(3);
    expect(fora.preterida?.liquidacaoId).toBe("L1");
  });

  /**
   * ⚠️ **A FUNÇÃO PURA RELATA; ELA NÃO BLOQUEIA.** `avaliarOrdem` devolve
   * `{ ehCabecaDaFila, posicao, preterida }` — quem decide recusar é o SERVIÇO.
   *
   * Isto é o ponto da caracterização para o teste 4 do ENT03 ("pagamento em lote respeita
   * ordem cronológica; rota alternativa não a contorna"): a garantia **não** está no
   * domínio puro. Ela está em quem o chama. Um lote de pagamento novo que não chamasse o
   * serviço certo passaria por fora da regra sem que nada aqui acusasse.
   */
  it("c10: `avaliarOrdem` RELATA a quebra — o bloqueio é de quem chama", () => {
    const r = avaliarOrdem(fila, "L3");
    // Nenhuma exceção: a função devolve o diagnóstico e segue.
    expect(r).toEqual({
      ehCabecaDaFila: false,
      posicao: 3,
      preterida: expect.objectContaining({ liquidacaoId: "L1" }),
    });
  });

  it("c11: liquidação fora da fila devolve posição nula e aponta a cabeça", () => {
    const r = avaliarOrdem(fila, "INEXISTENTE");
    expect(r.posicao).toBeNull();
    expect(r.ehCabecaDaFila).toBe(false);
    expect(r.preterida?.liquidacaoId).toBe("L1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. ENCERRAMENTO DE EXERCÍCIO
// ═══════════════════════════════════════════════════════════════════════════

describe("caracterização · encerramento de exercício", () => {
  beforeEach(semear);

  /**
   * "ENCERRADO" É DERIVADO da existência de um `EncerramentoExercicio` — não há coluna
   * `status`. Uma coluna exigiria UPDATE, e o encerramento é um FATO (quem encerrou,
   * quando), não um atributo.
   */
  it("c12: encerrar é um FATO append-only; não há coluna de status", async () => {
    const campos = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Exercicio'`
    );
    const nomes = campos.map((c) => c.column_name);
    expect(nomes).not.toContain("status");
    expect(nomes).not.toContain("encerrado");

    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });
    const e = await prisma.exercicio.findUniqueOrThrow({
      where: { ano: 2026 },
      select: { encerramento: { select: { encerradoPor: true } } },
    });
    expect(e.encerramento?.encerradoPor).toBe(POR);
  });

  /**
   * ⚠️ EXERCÍCIO **INEXISTENTE** TAMBÉM É RECUSADO, e não criado na hora. Um erro de
   * digitação (2062 em vez de 2026) viraria um exercício novo em silêncio, com orçamento
   * próprio e sem lei nenhuma por trás.
   */
  it("c13: o guard recusa exercício encerrado E exercício inexistente", async () => {
    await expect(
      exigirExercicioAberto(prisma, 2062, "empenhar")
    ).rejects.toThrow(/não existe/);

    await exigirExercicioAberto(prisma, 2026, "empenhar"); // aberto: passa

    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });
    await expect(
      exigirExercicioAberto(prisma, 2026, "empenhar")
    ).rejects.toThrow(/ENCERRADO/);
  });

  /**
   * ⚠️ O GUARD É COBRADO NO CASO DE USO, DENTRO DA TRANSAÇÃO — e é isso que faz dele uma
   * garantia, e não uma conferência de tela. Este teste prova pelo caminho real: empenhar
   * num exercício encerrado é recusado, e NADA fica gravado.
   */
  it("c14: exercício encerrado bloqueia a escrita pelo caso de uso, sem gravar nada", async () => {
    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });

    const antes = await prisma.empenho.count();
    await expect(
      empenhar(
        {
          fichaId: FICHA, numero: "NE-BLOQ", tipo: "ORDINARIO", valor: "100.00",
          data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
          historico: "não deve gravar", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
          criadoPor: POR,
        },
        R_EMPENHO,
        deps
      )
    ).rejects.toThrow(/ENCERRADO/);

    expect(await prisma.empenho.count()).toBe(antes);
  });

  /**
   * ⚠️ O CORTE É POR `dataTransacao`, NÃO pelo instante da gravação — e isto fecha o
   * círculo com o c1/c2: o LANÇAMENTO tem data de competência, a DOTAÇÃO não tem.
   */
  it("c15: o lançamento carrega `dataTransacao` — é por ela que os cortes acontecem", async () => {
    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-DT", tipo: "ORDINARIO", valor: "500.00",
        data: new Date("2026-06-20T12:00:00Z"), credorCpfCnpj: CREDOR,
        historico: "empenho de junho", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );

    const lanc = await prisma.lancamentoContabil.findFirstOrThrow({
      where: { empenho: { id: e.empenhoId } },
      select: { dataTransacao: true, criadoEm: true },
    });
    expect(lanc.dataTransacao.toISOString().slice(0, 10)).toBe("2026-06-20");
    // ⚠️ E ELAS SÃO DIFERENTES: `criadoEm` é hoje, `dataTransacao` é o fato. É essa
    // distinção que falta ao `MovimentoDotacao` — ver c2.
    expect(lanc.criadoEm.getTime()).toBeGreaterThan(lanc.dataTransacao.getTime());
  });
});
