/**
 * OS QUATRO INVARIANTES DO NÚCLEO — provados por VIOLAÇÃO DELIBERADA.
 *
 * Um teste que exercita o caminho feliz prova que o feliz funciona. Não prova
 * que o infeliz é barrado, e é o infeliz que corrompe um SIAFIC. Cada bloco
 * aqui tenta fazer exatamente a coisa proibida e espera a recusa.
 *
 * Escrito em ENT00 como baseline: mede o que a base JÁ garante e, onde ela não
 * garante, deixa a lacuna registrada em teste em vez de em prosa.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import { toMoney } from "../packages/contracts/index.js";
import type { Partida } from "../packages/ledger/lancamento.js";
import { validarLancamento } from "../packages/ledger/motor.js";
import {
  criarPrismaDeTeste,
  criarPrismaDoPapelDeRuntime,
  exigirBanco,
} from "./banco.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

function partida(
  conta: string,
  tipo: Partida["tipo"],
  valor: string,
  subsistema: Partida["subsistema"]
): Partida {
  return { conta, tipo, subsistema, valor: toMoney(valor) };
}

// ════════════════════════════════════════════════════════════════════════
// INVARIANTE 1 — dinheiro nunca é float nativo
// ════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 1 · valor monetário em number onde o domínio exige Decimal", () => {
  it("recusa uma partida cujo valor é number cru, e não o silencia", () => {
    // O `as unknown as Partida` é o ponto: em produção esta linha não compila.
    // O teste existe para o caso de alguém alcançar o motor por uma borda sem
    // tipo — JSON de request, linha de banco legada, `any` de um adapter.
    const torta = {
      conta: "1.1.1.1.1.00.00",
      tipo: "DEBITO",
      subsistema: "PATRIMONIAL",
      valor: 1500.0, // ← float nativo
    } as unknown as Partida;

    const par = partida("1.1.2.2.1.00.00", "CREDITO", "1500.00", "PATRIMONIAL");

    // Recusa porque `valor.isFinite` não existe em number. O motor não
    // "converte na dúvida": ele quebra, e quebrar é o comportamento correto.
    expect(() => validarLancamento([torta, par])).toThrow();
  });

  it("float nativo desbalancearia um lançamento que em Decimal fecha", () => {
    // 0.1 + 0.2 === 0.30000000000000004 em IEEE-754. Este é o erro que, somado
    // por milhares de linhas, vira divergência de centavos no balanço.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(toMoney("0.1").plus(toMoney("0.2")).equals(toMoney("0.3"))).toBe(true);

    // E o motor aceita o lançamento equivalente feito em Decimal.
    const partidas = [
      partida("1.1.1.1.1.00.00", "DEBITO", "0.10", "PATRIMONIAL"),
      partida("1.1.1.1.1.19.00", "DEBITO", "0.20", "PATRIMONIAL"),
      partida("1.1.2.2.1.00.00", "CREDITO", "0.30", "PATRIMONIAL"),
    ];
    expect(validarLancamento(partidas)).toHaveLength(3);
  });

  it("recusa NaN e infinito na conversão, sem devolver zero silencioso", () => {
    expect(() => toMoney(Number.NaN)).toThrow(/inválido/i);
    expect(() => toMoney(Number.POSITIVE_INFINITY)).toThrow(/inválido/i);
    // E o zero de verdade continua sendo zero — a recusa acima é do inválido,
    // não de todo valor de borda.
    expect(toMoney("0").equals(new Decimal(0))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// INVARIANTE 4 — balanceamento POR SUBSISTEMA, e o rótulo preso ao PCASP
// (vem antes do 2 e do 3 porque é domínio puro, sem banco)
// ════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 4 · lançamento desbalanceado dentro de um subsistema", () => {
  it("recusa lançamento que fecha no total mas não fecha em cada subsistema", () => {
    // Total: débitos 1000 + 500 = 1500; créditos 500 + 1000 = 1500. Fecha.
    // Mas o PATRIMONIAL tem 1000 de débito contra 500 de crédito, e o
    // ORCAMENTARIO o inverso. Um subsistema estaria financiando o outro.
    const partidas = [
      partida("1.1.1.1.1.00.00", "DEBITO", "1000.00", "PATRIMONIAL"),
      partida("1.1.2.2.1.00.00", "CREDITO", "500.00", "PATRIMONIAL"),
      partida("5.2.1.1.1.00.00", "DEBITO", "500.00", "ORCAMENTARIO"),
      partida("6.2.1.1.1.00.00", "CREDITO", "1000.00", "ORCAMENTARIO"),
    ];
    expect(() => validarLancamento(partidas)).toThrow(/desbalanceado no subsistema/i);
  });

  it("recusa partida simples — só débito, sem contrapartida", () => {
    const partidas = [
      partida("1.1.1.1.1.00.00", "DEBITO", "100.00", "PATRIMONIAL"),
    ];
    expect(() => validarLancamento(partidas)).toThrow(/partida simples/i);
  });

  it("recusa valor zero ou negativo", () => {
    const zerada = [
      partida("1.1.1.1.1.00.00", "DEBITO", "0.00", "PATRIMONIAL"),
      partida("1.1.2.2.1.00.00", "CREDITO", "0.00", "PATRIMONIAL"),
    ];
    expect(() => validarLancamento(zerada)).toThrow(/valor deve ser > 0/i);
  });
});

describe("INVARIANTE 4b · guard de subsistema contra o 1º dígito do PCASP", () => {
  // patrimonial 1-4 · orçamentária 5-6 · controle 7-8.
  // Quando este guard entrou, revelou 85 falhas em 12 arquivos — todas fixtures
  // com a conta errada, nenhuma com o guard errado. Falha nova aqui é fixture
  // suspeita até prova em contrário.

  it("recusa conta de classe 1 rotulada como ORCAMENTARIO", () => {
    const partidas = [
      partida("1.1.1.1.1.00.00", "DEBITO", "100.00", "ORCAMENTARIO"),
      partida("1.1.2.2.1.00.00", "CREDITO", "100.00", "ORCAMENTARIO"),
    ];
    expect(() => validarLancamento(partidas)).toThrow(/classe 1 é PATRIMONIAL/i);
  });

  it("recusa conta de classe 5 rotulada como PATRIMONIAL", () => {
    const partidas = [
      partida("5.2.1.1.1.00.00", "DEBITO", "100.00", "PATRIMONIAL"),
      partida("6.2.1.1.1.00.00", "CREDITO", "100.00", "PATRIMONIAL"),
    ];
    expect(() => validarLancamento(partidas)).toThrow(/é ORCAMENTARIO/i);
  });

  it("recusa conta de classe 9 — fora das oito classes do PCASP", () => {
    const partidas = [
      partida("9.1.1.1.1.00.00", "DEBITO", "100.00", "PATRIMONIAL"),
      partida("1.1.2.2.1.00.00", "CREDITO", "100.00", "PATRIMONIAL"),
    ];
    expect(() => validarLancamento(partidas)).toThrow(/classe PCASP "9" desconhecida/i);
  });

  it("aceita 7/8 como CONTROLE — o guard permite o certo, não só barra o errado", () => {
    const partidas = [
      partida("7.1.1.1.1.00.00", "DEBITO", "250.00", "CONTROLE"),
      partida("8.1.1.1.1.00.00", "CREDITO", "250.00", "CONTROLE"),
    ];
    expect(validarLancamento(partidas)).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════════════════════════
// INVARIANTES 2 e 3 — exigem banco
// ════════════════════════════════════════════════════════════════════════

describe("INVARIANTES 2 e 3 · contra o banco de teste", () => {
  /** O DONO: semeia o alvo e confere o resultado. */
  let prisma: PrismaClient;
  /**
   * A APLICAÇÃO. Os testes de append-only precisam dele, e não do dono: o dono PODE
   * mutar as próprias tabelas — é assim que a fixture limpa o banco. Medir o
   * append-only com o dono é medir com o instrumento errado.
   */
  let app: PrismaClient;

  beforeAll(async () => {
    prisma = criarPrismaDeTeste();
    app = criarPrismaDoPapelDeRuntime();
    await exigirBanco(prisma);
    await exigirBanco(app);
  });

  afterAll(async () => {
    await app.$disconnect();
    await prisma.$disconnect();
  });

  // ── INVARIANTE 3 — idempotência de entrada externa ───────────────────
  describe("INVARIANTE 3 · entrada externa repetida com a mesma chave", () => {
    it("recusa a segunda gravação com o mesmo (fonte, chaveIdemp)", async () => {
      const chave = `ent00-idemp-${Date.now()}`;
      const linha = {
        fonte: "TCE_PB" as const,
        tipoEvento: "TESTE_INVARIANTE",
        chaveIdemp: chave,
        payloadRaw: { origem: "teste de violacao ENT00" },
      };

      await prisma.integracaoInbox.create({ data: linha });

      // A MESMA mensagem chegando de novo — retentativa de rede, redelivery de
      // fila, operador reprocessando. Um fato contábil não pode nascer duas
      // vezes por causa disso.
      await expect(prisma.integracaoInbox.create({ data: linha })).rejects.toThrow();

      const quantas = await prisma.integracaoInbox.count({
        where: { fonte: "TCE_PB", chaveIdemp: chave },
      });
      expect(quantas).toBe(1);

      await prisma.integracaoInbox.deleteMany({ where: { chaveIdemp: chave } });
    });

    it("a mesma chave em fontes diferentes convive — o escopo faz parte da chave", async () => {
      const chave = `ent00-escopo-${Date.now()}`;
      await prisma.integracaoInbox.create({
        data: { fonte: "TCE_PB", tipoEvento: "T", chaveIdemp: chave, payloadRaw: {} },
      });
      await prisma.integracaoInbox.create({
        data: { fonte: "ESOCIAL", tipoEvento: "T", chaveIdemp: chave, payloadRaw: {} },
      });

      expect(await prisma.integracaoInbox.count({ where: { chaveIdemp: chave } })).toBe(2);
      await prisma.integracaoInbox.deleteMany({ where: { chaveIdemp: chave } });
    });

    it("a saída fiscal tem a mesma trava por (destino, chaveIdemp)", async () => {
      const chave = `ent00-outbox-${Date.now()}`;
      const linha = {
        destino: "ESOCIAL" as const,
        tipoEvento: "S-1200",
        chaveIdemp: chave,
        payloadRaw: {},
      };
      await prisma.eventoFiscalOutbox.create({ data: linha });
      await expect(prisma.eventoFiscalOutbox.create({ data: linha })).rejects.toThrow();
      await prisma.eventoFiscalOutbox.deleteMany({ where: { chaveIdemp: chave } });
    });
  });

  // ── INVARIANTE 2 — ledger append-only ────────────────────────────────
  describe("INVARIANTE 2 · UPDATE ou DELETE em lançamento contábil", () => {
    it("o modelo não oferece campo de mutação: estorno é registro novo", () => {
      // A defesa estrutural: não existe `estornadoPorId` no lançamento original.
      // Marcá-lo exigiria um UPDATE nele — e é justamente o UPDATE que não pode
      // existir. "Está estornado?" se responde pela relação inversa.
      const campos = Object.keys(prisma.lancamentoContabil.fields);
      expect(campos).not.toContain("estornadoPorId");
      expect(campos).toContain("estornoDeId");
    });

    /**
     * ⚠️ A LACUNA DO ENT00 — FECHADA NO ENT01, E O TESTE MUDOU DE SINAL.
     *
     * Isto era um `it.fails`: "esta asserção NÃO passa hoje". O que ela pedia era o
     * correto — que o BANCO recusasse um UPDATE em lançamento —, e o banco aceitava,
     * porque a conexão da aplicação era SUPERUSUÁRIA e DONA das tabelas. Varredura do
     * ENT00 por GRANT/REVOKE/CREATE ROLE/ROW LEVEL SECURITY nas 63 migrations: zero.
     *
     * O ENT01 criou o papel de runtime (`prisma/papel-runtime.ts`): sem superusuário,
     * sem posse de tabela, sem DDL, com SELECT/INSERT em tudo e UPDATE/DELETE só num
     * censo de três tabelas que alguém assina. O razão não está nele.
     *
     * ⚠️ E O CLIENT DESTE TESTE MUDOU JUNTO — é o ponto. Ele agora conecta como a
     * APLICAÇÃO, não como o dono. Rodá-lo com o dono continuaria falhando (o dono
     * pode mesmo mutar as próprias tabelas, e é assim que a fixture limpa o banco):
     * seria a mesma lacuna, medida com o instrumento errado.
     *
     * O `it.fails` ficou vermelho quando a proteção chegou — que era exatamente o que
     * ele prometia fazer. Um teste que expira sozinho vale mais que um TODO que
     * ninguém lê.
     */
    it("o banco recusa UPDATE em lançamento pelo papel da aplicação", async () => {
      // O teste cria o próprio alvo: depender de resíduo de outro arquivo faria a
      // recusa acontecer por linha inexistente, e não por falta de privilégio —
      // passando pelo motivo errado.
      const alvo = await prisma.lancamentoContabil.create({
        data: {
          numeroControle: `ENT01-APPEND-${Date.now()}`,
          dataTransacao: new Date("2026-01-02T00:00:00Z"),
          historico: "lancamento alvo do teste de append-only",
          origemTipo: "TESTE_INVARIANTE",
          criadoPor: "ent00",
        },
      });

      try {
        await expect(
          app.lancamentoContabil.update({
            where: { id: alvo.id },
            data: { historico: "MUTACAO INDEVIDA — ENT01" },
          })
        ).rejects.toThrow(/permission denied|permissão negada/i);

        // ...e a linha continua exatamente como nasceu.
        const depois = await prisma.lancamentoContabil.findUniqueOrThrow({
          where: { id: alvo.id },
        });
        expect(depois.historico).toBe("lancamento alvo do teste de append-only");
      } finally {
        await prisma.lancamentoContabil.deleteMany({ where: { id: alvo.id } });
      }
    });

    it("o banco recusa DELETE em lançamento pelo papel da aplicação", async () => {
      const alvo = await prisma.lancamentoContabil.create({
        data: {
          numeroControle: `ENT01-APPEND-DEL-${Date.now()}`,
          dataTransacao: new Date("2026-01-02T00:00:00Z"),
          historico: "lancamento alvo do teste de append-only",
          origemTipo: "TESTE_INVARIANTE",
          criadoPor: "ent00",
        },
      });

      try {
        await expect(
          app.lancamentoContabil.delete({ where: { id: alvo.id } })
        ).rejects.toThrow(/permission denied|permissão negada/i);
        expect(
          await prisma.lancamentoContabil.count({ where: { id: alvo.id } })
        ).toBe(1);
      } finally {
        await prisma.lancamentoContabil.deleteMany({ where: { id: alvo.id } });
      }
    });
  });
});
