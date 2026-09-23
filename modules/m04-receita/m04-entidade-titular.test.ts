import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  cadastrarEntidadeContabil,
  declararTitularDaContaBancaria,
  entidadesContabeis,
  publicarVersaoDaEntidadeContabil,
  titularVigenteDaConta,
} from "../m01-core-contabil/entidade-contabil.js";
import { criarM04Deps } from "./adapter-prisma.js";
import { atribuirEntidadeAArrecadacao } from "./atribuicao-de-entidade.js";
import { arrecadadoPorEntidade } from "./consultas.js";
import { roteiroArrecadacao, type RoteiroContabil } from "./dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "./servico.js";
import type { M04Deps, RegistrarArrecadacaoInput } from "./index.js";

/**
 * V11 V9 — A ENTIDADE TITULAR DA RECEITA, contra o Postgres de TESTE.
 *
 * ⚠️ FIXTURE N=2 EM TUDO QUE SÓ SE MANIFESTA EM CONJUNTO. São DUAS entidades e DUAS contas, e
 * não uma de cada: com N=1, "agrupado por entidade" e "total do ente" dariam a MESMA linha, e o
 * recorte passaria por vacuidade. E há uma TERCEIRA guia sem conta — o legado —, porque o não
 * atribuído só é uma linha de verdade quando existe algo nele.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const CONTAS_PCASP = [
  { id: "c-cc-a", codigo: "1.1.1.1.2.01.00", nome: "Bancos - CC A", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-cc-b", codigo: "1.1.1.1.2.02.00", nome: "Bancos - CC B", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-caixa", codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.2.1.01.00", nome: "VPA - Impostos", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-a-realizar", codigo: "6.2.1.1.0.00.00", nome: "Receita a Realizar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-realizada", codigo: "6.2.1.2.0.00.00", nome: "Receita Realizada", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
];

const roteiroDe = (disponibilidade: string): RoteiroContabil =>
  roteiroArrecadacao({
    disponibilidade,
    variacaoAumentativa: "4.1.1.2.1.01.00",
    receitaARealizar: "6.2.1.1.0.00.00",
    receitaRealizada: "6.2.1.2.0.00.00",
  });

const POR = "m04@cg.pb.gov.br";
const HOJE = new Date("2026-09-23T12:00:00Z");

const NOME_A = "Fundação Municipal de Saúde";
const NOME_B = "Câmara Municipal";

const ATO_A = {
  atoTipo: "LEI" as const,
  atoNumero: "1.234",
  atoAno: 2005,
  atoDispositivo: "art. 2º",
  atoCitacao: "Fica criada a Fundação Municipal de Saúde, com patrimônio e receita próprios.",
};
const guia = (n: string, valor: string, conta?: string): RegistrarArrecadacaoInput => ({
  exercicio: 2026,
  naturezaReceita: "11121101",
  fonte: "500",
  exercicioFonte: 1,
  valor,
  dataArrecadacao: new Date("2026-03-10T12:00:00Z"),
  numeroReceita: n,
  ...(conta !== undefined ? { contaBancaria: conta } : {}),
  criadoPor: POR,
});

describe("M04 V11 V9 — a entidade titular da receita", () => {
  let deps: M04Deps;
  let entidadeA: string;
  let entidadeB: string;

  beforeEach(async () => {
    deps = criarM04Deps(prisma);
    await limparBanco(prisma);

    await prisma.contaPcasp.createMany({ data: CONTAS_PCASP });
    await prisma.naturezaReceita.createMany({
      data: [{ id: "nr-iptu", codigo: "11121101", descricao: "IPTU - Principal" }],
    });
    await prisma.fonteRecurso.createMany({
      data: [{ id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" }],
    });
    await prisma.contaBancaria.createMany({
      data: [
        { id: "cb-a", codigo: "CC-A", descricao: "Conta da Fundação", fonteId: "fnt-500", contaContabilId: "c-cc-a", banco: "001", agencia: "1234", conta: "567890" },
        { id: "cb-b", codigo: "CC-B", descricao: "Conta da Câmara", fonteId: "fnt-500", contaContabilId: "c-cc-b" },
      ],
    });

    entidadeA = (
      await cadastrarEntidadeContabil(
        prisma,
        { codigo: "02", nome: NOME_A, cnpj: "12345678000199", tipoManad: "08", ...ATO_A, criadoPor: POR },
        HOJE
      )
    ).entidadeId;
    entidadeB = (
      await cadastrarEntidadeContabil(
        prisma,
        {
          codigo: "03",
          nome: NOME_B,
          tipoManad: "02",
          atoTipo: "LEI",
          atoNumero: "0001",
          atoAno: 1990,
          atoDispositivo: "art. 1º",
          atoCitacao: "A Câmara Municipal tem autonomia funcional, administrativa e financeira.",
          criadoPor: POR,
        },
        HOJE
      )
    ).entidadeId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── 1. ENTIDADE INVÁLIDA / FORA DO ESCOPO ─────────────────────────────────────────────────

  it("t1: tipo FORA DO ROL oficial é recusado nomeando o rol — nada é gravado", async () => {
    const antes = await prisma.entidadeContabil.count();
    await expect(
      cadastrarEntidadeContabil(
        prisma,
        { codigo: "09", nome: "Autarquia X", tipoManad: "99", ...ATO_A, criadoPor: POR },
        HOJE
      )
    ).rejects.toThrow(/TIPO DE ENTIDADE INEXISTENTE.*99.*Nada foi gravado/s);
    // ⚠️ A CONTAGEM É A PROVA DE QUE "NADA FOI GRAVADO" NÃO É SÓ UMA FRASE NA MENSAGEM.
    expect(await prisma.entidadeContabil.count()).toBe(antes);
  });

  it("t1b: código repetido é recusado ANTES de criar a identidade — sem entidade órfã", async () => {
    /**
     * ⚠️ O NOME AQUI É O MESMO DE `ATO_A`, E ISSO É CORREÇÃO DE UM DEFEITO **DO TESTE**.
     *
     * A primeira versão passava `nome: "Outra"` com o `ATO_A`, cuja citação fala da Fundação. A
     * régua do ato reprovou ANTES de chegar ao guard do código repetido — corretamente, porque a
     * conferência do ato é pura e roda antes de qualquer I/O — e o teste falhou acusando
     * `ATO_NAO_TRATA_DO_OBJETO` em vez do código duplicado.
     *
     * Ou seja: o instrumento acusou num lugar em que eu não tinha pensado, e acusou certo. Para
     * medir o guard do CÓDIGO é preciso que tudo o mais esteja válido — senão o teste mede a
     * primeira guarda do caminho, não a que ele nomeia.
     */
    await expect(
      cadastrarEntidadeContabil(
        prisma,
        { codigo: "02", nome: NOME_A, tipoManad: "06", ...ATO_A, criadoPor: POR },
        HOJE
      )
    ).rejects.toThrow(/Já existe uma entidade com o código 02/);
    // ⚠️ O QUE ESTE NÚMERO DEFENDE: uma `EntidadeContabil` criada e só depois recusada ficaria
    // SEM VERSÃO — invisível na consulta (que junta pela vigente) e impossível de remover sem
    // DELETE. É o "efeito colateral antes da guarda", e ele já custou um defeito real aqui.
    const semVersao = await prisma.entidadeContabil.count({ where: { versoes: { none: {} } } });
    expect(semVersao).toBe(0);
  });

  it("t1c: declarar titular de entidade INEXISTENTE é recusado, e a conta segue sem titular", async () => {
    await expect(
      declararTitularDaContaBancaria(
        prisma,
        { contaBancariaId: "cb-a", entidadeId: "nao-existe", ...ATO_A, criadoPor: POR },
        HOJE
      )
    ).rejects.toThrow(/A entidade nao-existe não existe.*Nada foi gravado/s);
    expect(await titularVigenteDaConta(prisma, "cb-a")).toBeNull();
  });

  it("t1d: o ATO que não fala da entidade é recusado — e a recusa diz o que falta", async () => {
    await expect(
      declararTitularDaContaBancaria(
        prisma,
        {
          contaBancariaId: "cb-b",
          entidadeId: entidadeB,
          atoTipo: "DECRETO",
          atoNumero: "77",
          atoAno: 2020,
          atoDispositivo: "art. 3º",
          atoCitacao: "Fica aberto crédito adicional suplementar no valor de R$ 100.000,00.",
          criadoPor: POR,
        },
        HOJE
      )
    ).rejects.toThrow(/não menciona.*Câmara Municipal/s);
    expect(await titularVigenteDaConta(prisma, "cb-b")).toBeNull();
  });

  // ── 2. REPETIÇÃO PRESERVANDO A MESMA IDENTIDADE ───────────────────────────────────────────

  it("t2: duas guias na MESMA conta recebem a MESMA entidade — o carimbo não oscila", async () => {
    await declararTitularDaContaBancaria(
      prisma,
      { contaBancariaId: "cb-a", entidadeId: entidadeA, ...ATO_A, criadoPor: POR },
      HOJE
    );

    await registrarArrecadacao(guia("G1", "1000.00", "CC-A"), roteiroDe("1.1.1.1.2.01.00"), deps);
    await registrarArrecadacao(guia("G2", "2000.00", "CC-A"), roteiroDe("1.1.1.1.2.01.00"), deps);

    const guias = await prisma.receitaArrecadada.findMany({
      where: { numeroReceita: { in: ["G1", "G2"] } },
      select: { numeroReceita: true, entidadeTitularId: true },
    });
    expect(guias.every((g) => g.entidadeTitularId === entidadeA)).toBe(true);
  });

  it("t2b: trocar o titular da conta NÃO reescreve as guias já carimbadas", async () => {
    // ⚠️ ESTE É O TESTE QUE JUSTIFICA A COLUNA. Se a entidade fosse resolvida por join na
    // declaração vigente, a guia de março passaria a ser da Câmara no instante em que alguém
    // declarasse a Câmara como titular — e a história inteira seria reescrita em silêncio.
    await declararTitularDaContaBancaria(
      prisma,
      { contaBancariaId: "cb-a", entidadeId: entidadeA, ...ATO_A, criadoPor: POR },
      HOJE
    );
    await registrarArrecadacao(guia("G1", "1000.00", "CC-A"), roteiroDe("1.1.1.1.2.01.00"), deps);

    // A conta muda de dono — versão 2 da declaração, sem apagar a versão 1.
    await declararTitularDaContaBancaria(
      prisma,
      {
        contaBancariaId: "cb-a",
        entidadeId: entidadeB,
        atoTipo: "DECRETO",
        atoNumero: "88",
        atoAno: 2026,
        atoDispositivo: "art. 1º",
        atoCitacao: "A conta corrente 567890, agência 1234, banco 001, passa à Câmara Municipal.",
        criadoPor: POR,
      },
      HOJE
    );

    const g1 = await prisma.receitaArrecadada.findFirstOrThrow({
      where: { numeroReceita: "G1" },
      select: { entidadeTitularId: true },
    });
    expect(g1.entidadeTitularId).toBe(entidadeA);
    // E a declaração vigente é mesmo a nova — senão o teste acima passaria por não ter mudado nada.
    expect((await titularVigenteDaConta(prisma, "cb-a"))?.entidadeId).toBe(entidadeB);
    expect(await prisma.declaracaoDeTitularDaConta.count({ where: { contaBancariaId: "cb-a" } })).toBe(2);
  });

  it("t2c: a versão nova da ENTIDADE não muda o id carimbado — corrigir o nome não move dinheiro", async () => {
    await declararTitularDaContaBancaria(
      prisma,
      { contaBancariaId: "cb-a", entidadeId: entidadeA, ...ATO_A, criadoPor: POR },
      HOJE
    );
    await registrarArrecadacao(guia("G1", "1000.00", "CC-A"), roteiroDe("1.1.1.1.2.01.00"), deps);

    await publicarVersaoDaEntidadeContabil(
      prisma,
      {
        entidadeId: entidadeA,
        nome: "Fundação Municipal de Saúde de Campina Grande",
        cnpj: "12345678000199",
        tipoManad: "08",
        atoTipo: "LEI",
        atoNumero: "9.999",
        atoAno: 2026,
        atoDispositivo: "art. 1º",
        atoCitacao:
          "A Fundação Municipal de Saúde de Campina Grande passa a denominar-se na forma desta lei.",
        criadoPor: POR,
      },
      HOJE
    );

    const lista = await entidadesContabeis(prisma);
    const a = lista.find((e) => e.id === entidadeA);
    expect(a?.nome).toBe("Fundação Municipal de Saúde de Campina Grande");
    expect(a?.versao).toBe(2);
    const g1 = await prisma.receitaArrecadada.findFirstOrThrow({
      where: { numeroReceita: "G1" },
      select: { entidadeTitularId: true },
    });
    expect(g1.entidadeTitularId).toBe(entidadeA);
  });

  // ── 3. O ESTORNO HERDA ────────────────────────────────────────────────────────────────────

  it("t3: a ANULAÇÃO herda a entidade da guia ORIGINAL, mesmo se a conta trocou de dono", async () => {
    await declararTitularDaContaBancaria(
      prisma,
      { contaBancariaId: "cb-a", entidadeId: entidadeA, ...ATO_A, criadoPor: POR },
      HOJE
    );
    const r = await registrarArrecadacao(guia("G1", "1000.00", "CC-A"), roteiroDe("1.1.1.1.2.01.00"), deps);

    await declararTitularDaContaBancaria(
      prisma,
      {
        contaBancariaId: "cb-a",
        entidadeId: entidadeB,
        atoTipo: "DECRETO",
        atoNumero: "88",
        atoAno: 2026,
        atoDispositivo: "art. 1º",
        atoCitacao: "A conta corrente 567890, agência 1234, banco 001, passa à Câmara Municipal.",
        criadoPor: POR,
      },
      HOJE
    );

    await anularArrecadacao(
      { receitaId: r.receitaId, numeroReceita: "G1", dataAnulacao: new Date("2026-04-01T12:00:00Z"), criadoPor: POR },
      deps
    );

    const anulacao = await prisma.receitaArrecadada.findFirstOrThrow({
      where: { tipo: "ANULACAO", estornoDeId: r.receitaId },
      select: { entidadeTitularId: true },
    });
    // ⚠️ SE RE-DERIVASSE PELA CONTA, ESTE SERIA `entidadeB` — e a Fundação ficaria com uma
    // receita que nunca teve, enquanto a Câmara levaria um débito que nunca fez.
    expect(anulacao.entidadeTitularId).toBe(entidadeA);

    // E o líquido por entidade fecha em zero para a Fundação, que é a consequência visível.
    const consulta = await arrecadadoPorEntidade(prisma, { exercicio: 2026 });
    expect(consulta.linhas.find((l) => l.entidadeId === entidadeA)?.arrecadado.toFixed(2)).toBe("0.00");
  });

  it("t3b: anulação de guia NÃO ATRIBUÍDA continua não atribuída — desfazer não cria titular", async () => {
    const r = await registrarArrecadacao(guia("G9", "500.00"), roteiroDe("1.1.1.1.1.00.00"), deps);
    await anularArrecadacao(
      { receitaId: r.receitaId, numeroReceita: "G9", dataAnulacao: new Date("2026-04-01T12:00:00Z"), criadoPor: POR },
      deps
    );
    const anulacao = await prisma.receitaArrecadada.findFirstOrThrow({
      where: { tipo: "ANULACAO", estornoDeId: r.receitaId },
      select: { entidadeTitularId: true },
    });
    expect(anulacao.entidadeTitularId).toBeNull();
  });

  // ── 4. O HISTÓRICO SEM ATRIBUIÇÃO ─────────────────────────────────────────────────────────

  it("t4: a conta SEM titular declarado produz guia NÃO ATRIBUÍDA — e não barra a arrecadação", async () => {
    // ⚠️ NÃO BARRAR É A DECISÃO. Parar a arrecadação para cobrar um cadastro faria o sistema
    // recusar dinheiro que já entrou no banco.
    await registrarArrecadacao(guia("G3", "700.00", "CC-B"), roteiroDe("1.1.1.1.2.02.00"), deps);
    const g = await prisma.receitaArrecadada.findFirstOrThrow({
      where: { numeroReceita: "G3" },
      select: { entidadeTitularId: true, contaBancariaId: true },
    });
    expect(g.contaBancariaId).toBe("cb-b");
    expect(g.entidadeTitularId).toBeNull();
  });

  it("t4b: o legado é ATRIBUÍDO por ato próprio — nunca por UPDATE na guia", async () => {
    const r = await registrarArrecadacao(guia("G9", "500.00"), roteiroDe("1.1.1.1.1.00.00"), deps);

    await atribuirEntidadeAArrecadacao(
      prisma,
      {
        receitaArrecadadaId: r.receitaId,
        entidadeId: entidadeA,
        motivo: "Guia do legado, recolhida na tesouraria da Fundação antes da conta própria.",
        ...ATO_A,
        criadoPor: POR,
      },
      HOJE
    );

    // ⚠️ A COLUNA DA GUIA CONTINUA NULA — o fato não foi reescrito. A atribuição é outro fato.
    const g = await prisma.receitaArrecadada.findUniqueOrThrow({
      where: { id: r.receitaId },
      select: { entidadeTitularId: true, atribuicaoDeEntidade: { select: { entidadeId: true, motivo: true } } },
    });
    expect(g.entidadeTitularId).toBeNull();
    expect(g.atribuicaoDeEntidade?.entidadeId).toBe(entidadeA);

    // E a segunda atribuição é recusada: uma por guia.
    await expect(
      atribuirEntidadeAArrecadacao(
        prisma,
        { receitaArrecadadaId: r.receitaId, entidadeId: entidadeB, motivo: "tentativa dupla", ...ATO_A, criadoPor: POR },
        HOJE
      )
    ).rejects.toThrow(/já foi atribuída/);
  });

  it("t4c: DIVERGÊNCIA com o titular da conta é recusada nomeando as DUAS entidades", async () => {
    await declararTitularDaContaBancaria(
      prisma,
      { contaBancariaId: "cb-a", entidadeId: entidadeA, ...ATO_A, criadoPor: POR },
      HOJE
    );
    // ⚠️ A GUIA ENTRA NA CONTA B **ANTES** DE B TER TITULAR: é assim que nasce uma guia com
    // conta e sem carimbo, que é o único caso em que a divergência pode acontecer.
    const reg = await registrarArrecadacao(guia("G5", "300.00", "CC-B"), roteiroDe("1.1.1.1.2.02.00"), deps);
    await declararTitularDaContaBancaria(
      prisma,
      {
        contaBancariaId: "cb-b",
        entidadeId: entidadeB,
        atoTipo: "LEI",
        atoNumero: "0001",
        atoAno: 1990,
        atoDispositivo: "art. 1º",
        atoCitacao: "A Câmara Municipal tem autonomia funcional, administrativa e financeira.",
        criadoPor: POR,
      },
      HOJE
    );

    await expect(
      atribuirEntidadeAArrecadacao(
        prisma,
        { receitaArrecadadaId: reg.receitaId, entidadeId: entidadeA, motivo: "atribuição divergente", ...ATO_A, criadoPor: POR },
        HOJE
      )
    ).rejects.toThrow(/DIVERGÊNCIA DE TITULARIDADE.*03.*02/s);
  });

  // ── 5. A CONCILIAÇÃO DO RECORTE ───────────────────────────────────────────────────────────

  it("t5: Σ entidades + não atribuído == total do exercício, e o não atribuído tem linha própria", async () => {
    await declararTitularDaContaBancaria(
      prisma,
      { contaBancariaId: "cb-a", entidadeId: entidadeA, ...ATO_A, criadoPor: POR },
      HOJE
    );
    await declararTitularDaContaBancaria(
      prisma,
      {
        contaBancariaId: "cb-b",
        entidadeId: entidadeB,
        atoTipo: "LEI",
        atoNumero: "0001",
        atoAno: 1990,
        atoDispositivo: "art. 1º",
        atoCitacao: "A Câmara Municipal tem autonomia funcional, administrativa e financeira.",
        criadoPor: POR,
      },
      HOJE
    );

    await registrarArrecadacao(guia("G1", "1000.00", "CC-A"), roteiroDe("1.1.1.1.2.01.00"), deps);
    await registrarArrecadacao(guia("G2", "2000.00", "CC-B"), roteiroDe("1.1.1.1.2.02.00"), deps);
    await registrarArrecadacao(guia("G9", "500.00"), roteiroDe("1.1.1.1.1.00.00"), deps);

    const c = await arrecadadoPorEntidade(prisma, { exercicio: 2026 });

    expect(c.total.toFixed(2)).toBe("3500.00");
    expect(c.naoAtribuido.arrecadado.toFixed(2)).toBe("500.00");
    expect(c.naoAtribuido.guias).toBe(1);
    // ⚠️ DUAS LINHAS, E NÃO UMA: é o N=2 que impede o teste de passar por vacuidade.
    expect(c.linhas.map((l) => l.codigo)).toEqual(["02", "03"]);
    expect(c.linhas.find((l) => l.codigo === "02")?.arrecadado.toFixed(2)).toBe("1000.00");
    expect(c.linhas.find((l) => l.codigo === "03")?.arrecadado.toFixed(2)).toBe("2000.00");

    // A identidade, somada de volta — a mesma disciplina do S3 do superávit.
    const soma = c.linhas.reduce((acc, l) => acc + Number(l.arrecadado.toFixed(2)), 0);
    expect(soma + Number(c.naoAtribuido.arrecadado.toFixed(2))).toBe(Number(c.total.toFixed(2)));

    // ⚠️ E O NÃO ATRIBUÍDO NÃO É UMA ENTIDADE. Se ele virasse uma linha com código, uma tela que
    // ordena por código o misturaria às entidades reais e alguém o leria como um ente.
    expect(c.naoAtribuido.entidadeId).toBeNull();
    expect(c.naoAtribuido.codigo).toBeNull();
  });
});
