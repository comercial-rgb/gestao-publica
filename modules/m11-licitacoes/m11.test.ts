import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { MODALIDADES, SINAL_PRAZO_CONTRATUAL, SINAL_VALOR_CONTRATUAL } from "./dominio.js";
import {
  cadastrarContrato,
  cadastrarProcesso,
  estaVigenteEm,
  estornarMovimentoContratual,
  registrarAditivo,
  saldoDoContrato,
  situacaoDoProcesso,
  valorAtualizadoDoContrato,
  vigenciaFimDoContrato,
} from "./contratos.js";

/**
 * M11 — LICITAÇÕES E CONTRATOS (Lei 14.133/2021), bloco 1.
 *
 * ⚠️ TODAS AS CONTAS E DATAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ CENÁRIO DO t1 ═══
 *   Contrato CT-001, valor inicial ............... 100.000,00
 *   vigência 01/01/2026 → 31/12/2026 (último instante: 23:59:59Z)
 *
 *   ACRESCIMO_VALOR   20.000  (01/03/2026)  → 120.000,00
 *   SUPRESSAO_VALOR    5.000  (01/05/2026)  → 115.000,00
 *   PRORROGACAO_PRAZO 90 dias (01/11/2026)
 *
 *   A CONTA DOS 90 DIAS, DIA A DIA (UTC, sem horário de verão):
 *     31/12/2026 + 31 dias = 31/01/2027
 *     31/01/2027 + 28 dias = 28/02/2027   (2027 NÃO é bissexto)  → 59 dias
 *     28/02/2027 + 31 dias = 31/03/2027                          → 90 dias
 *   ⟹ vigênciaFim = 2027-03-31T23:59:59Z
 *
 *   BORDAS (as duas INCLUSIVAS — ver `estaVigente` no domínio):
 *     2026-01-01T00:00:00Z  → VIGENTE (primeiro instante)
 *     2025-12-31T23:59:59Z  → NÃO (antes do início)
 *     2027-03-31T23:59:59Z  → VIGENTE (último instante)
 *     2027-04-01T00:00:00Z  → NÃO (um segundo depois)
 *
 * ═══ CENÁRIO DO t7 (corte) ═══
 *   Os três aditivos acima + ACRESCIMO 10.000 e PRORROGACAO 30 dias, ambos
 *   assinados em 01/06/2027 — DEPOIS do corte de 2026.
 *     no corte 31/12/2026: 115.000,00 e fim 2027-03-31T23:59:59Z
 *     no corte 31/12/2027: 125.000,00 e fim 2027-03-31 + 30 = 2027-04-30T23:59:59Z
 *   (31/03 + 30 dias: abril tem 30 dias → 30/04. Conferido na mão.)
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const HOMOLOGADO_EM = new Date("2025-12-01T12:00:00Z");
const INICIO = new Date("2026-01-01T00:00:00Z");
const FIM_INICIAL = new Date("2026-12-31T23:59:59Z");
const CORTE_2026 = new Date("2026-12-31T23:59:59Z");
const CORTE_2027 = new Date("2027-12-31T23:59:59Z");

/** Um processo HOMOLOGADO e um contrato de 100.000 sobre ele. */
async function contratoDeTeste(valor = "100000.00"): Promise<string> {
  const { processoId } = await cadastrarProcesso(prisma, {
    numeroProcesso: "PROC-001/2025",
    modalidade: "PREGAO_ELETRONICO",
    objeto: "Aquisição de material de expediente para a rede municipal",
    valorLicitado: "120000.00",
    dataHomologacao: HOMOLOGADO_EM,
    criadoPor: POR,
  });

  const { contratoId } = await cadastrarContrato(prisma, {
    numeroContrato: "CT-001/2026",
    processoId,
    contratadoDocumento: "12345678000199",
    contratadoNome: "Papelaria Central LTDA",
    valorInicial: valor,
    vigenciaInicio: INICIO,
    vigenciaFimInicial: FIM_INICIAL,
    categoriaOrdemCronologica: "FORNECIMENTO_BENS",
    criadoPor: POR,
  });
  return contratoId;
}

const iso = (d: Date) => d.toISOString();

describe("M11 — licitações e contratos", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: valor e prazo são DERIVADOS dos movimentos — 115.000 e 31/03/2027", async () => {
    const contratoId = await contratoDeTeste();

    expect((await valorAtualizadoDoContrato(prisma, contratoId)).toFixed(2)).toBe(
      "100000.00"
    );

    await registrarAditivo(prisma, {
      contratoId, tipo: "ACRESCIMO_VALOR", valor: "20000.00",
      data: new Date("2026-03-01T12:00:00Z"), numeroAditivo: "1º TA",
      motivo: "acréscimo de quantitativo do item 3", criadoPor: POR,
    });
    await registrarAditivo(prisma, {
      contratoId, tipo: "SUPRESSAO_VALOR", valor: "5000.00",
      data: new Date("2026-05-01T12:00:00Z"), numeroAditivo: "2º TA",
      motivo: "supressão do item 7, sem interesse da administração", criadoPor: POR,
    });

    // 100.000 + 20.000 − 5.000 = 115.000
    expect((await valorAtualizadoDoContrato(prisma, contratoId)).toFixed(2)).toBe(
      "115000.00"
    );
    // sem vínculo de empenho ainda (bloco 2): saldo == valor atualizado
    expect((await saldoDoContrato(prisma, contratoId)).toFixed(2)).toBe("115000.00");

    // ── O PRAZO ────────────────────────────────────────────────────────────
    expect(iso(await vigenciaFimDoContrato(prisma, contratoId))).toBe(
      "2026-12-31T23:59:59.000Z"
    );

    await registrarAditivo(prisma, {
      contratoId, tipo: "PRORROGACAO_PRAZO", dias: 90,
      data: new Date("2026-11-01T12:00:00Z"), numeroAditivo: "3º TA",
      motivo: "prorrogação por interesse na continuidade do fornecimento",
      criadoPor: POR,
    });

    // 31/12/2026 + 90 dias = 31/03/2027 (31 + 28 + 31; 2027 não é bissexto)
    expect(iso(await vigenciaFimDoContrato(prisma, contratoId))).toBe(
      "2027-03-31T23:59:59.000Z"
    );
    // ⚠️ e o valor NÃO se mexeu: prorrogar não é acrescer (o zero do Record)
    expect((await valorAtualizadoDoContrato(prisma, contratoId)).toFixed(2)).toBe(
      "115000.00"
    );

    // ── AS BORDAS DA VIGÊNCIA (as duas INCLUSIVAS) ─────────────────────────
    const vigente = (s: string) => estaVigenteEm(prisma, contratoId, new Date(s));
    expect(await vigente("2026-01-01T00:00:00Z")).toBe(true); // primeiro instante
    expect(await vigente("2025-12-31T23:59:59Z")).toBe(false); // véspera
    expect(await vigente("2027-03-31T23:59:59Z")).toBe(true); // ÚLTIMO instante
    expect(await vigente("2027-04-01T00:00:00Z")).toBe(false); // um segundo depois
  });

  // t2
  it("t2: contrato em processo NÃO HOMOLOGADO é rejeitado — e nada é gravado", async () => {
    const { processoId } = await cadastrarProcesso(prisma, {
      numeroProcesso: "PROC-002/2026",
      modalidade: "CONCORRENCIA",
      objeto: "Reforma da escola municipal do bairro Bodocongó",
      valorLicitado: "500000.00",
      // SEM dataHomologacao → EM_ANDAMENTO
      criadoPor: POR,
    });

    const p = await prisma.processoLicitatorio.findUniqueOrThrow({
      where: { id: processoId }, select: { dataHomologacao: true },
    });
    expect(situacaoDoProcesso(p.dataHomologacao)).toBe("EM_ANDAMENTO");

    await expect(
      cadastrarContrato(prisma, {
        numeroContrato: "CT-002/2026",
        processoId,
        contratadoDocumento: "98765432000188",
        contratadoNome: "Construtora Borborema",
        valorInicial: "480000.00",
        vigenciaInicio: INICIO,
        vigenciaFimInicial: FIM_INICIAL,
        categoriaOrdemCronologica: "REALIZACAO_OBRAS",
        criadoPor: POR,
      })
    ).rejects.toThrow(/PROCESSO NÃO HOMOLOGADO/);

    // SELECT: nada foi gravado.
    expect(await prisma.contrato.count()).toBe(0);
  });

  // t3
  it("t3: supressão maior que o saldo é rejeitada; IGUAL ao saldo passa; +0,01 depois não", async () => {
    const contratoId = await contratoDeTeste();

    // 100.000,01 > saldo 100.000,00
    await expect(
      registrarAditivo(prisma, {
        contratoId, tipo: "SUPRESSAO_VALOR", valor: "100000.01",
        data: new Date("2026-03-01T12:00:00Z"), numeroAditivo: "1º TA",
        motivo: "supressão além do que o contrato tem", criadoPor: POR,
      })
    ).rejects.toThrow(/SUPRESSÃO MAIOR QUE O SALDO/);
    expect(await prisma.movimentoContratual.count()).toBe(0);

    // EXATAMENTE o saldo: passa, e zera o contrato.
    await registrarAditivo(prisma, {
      contratoId, tipo: "SUPRESSAO_VALOR", valor: "100000.00",
      data: new Date("2026-03-01T12:00:00Z"), numeroAditivo: "1º TA",
      motivo: "supressão integral por acordo entre as partes", criadoPor: POR,
    });
    expect((await valorAtualizadoDoContrato(prisma, contratoId)).toFixed(2)).toBe(
      "0.00"
    );

    // agora não há mais nem um centavo a suprimir
    await expect(
      registrarAditivo(prisma, {
        contratoId, tipo: "SUPRESSAO_VALOR", valor: "0.01",
        data: new Date("2026-04-01T12:00:00Z"), numeroAditivo: "2º TA",
        motivo: "suprimir o que já não existe", criadoPor: POR,
      })
    ).rejects.toThrow(/SUPRESSÃO MAIOR QUE O SALDO/);
    expect(await prisma.movimentoContratual.count()).toBe(1);
  });

  // t4
  it("t4: XOR valor/dias — o Zod barra os dois e barra nenhum; o CHECK barra o INSERT direto", async () => {
    const contratoId = await contratoDeTeste();
    const base = {
      contratoId, data: new Date("2026-03-01T12:00:00Z"),
      numeroAditivo: "1º TA", motivo: "aditivo mal formado de propósito",
      criadoPor: POR,
    };

    // OS DOIS preenchidos num tipo de VALOR
    await expect(
      registrarAditivo(prisma, {
        ...base, tipo: "ACRESCIMO_VALOR", valor: "1000.00", dias: 30,
      })
    ).rejects.toThrow(/não em prazo|não pode vir junto/);

    // NENHUM preenchido
    await expect(
      registrarAditivo(prisma, { ...base, tipo: "ACRESCIMO_VALOR" })
    ).rejects.toThrow(/mexe em VALOR/);
    await expect(
      registrarAditivo(prisma, { ...base, tipo: "PRORROGACAO_PRAZO" })
    ).rejects.toThrow(/mexe em PRAZO/);

    // prazo com valor junto
    await expect(
      registrarAditivo(prisma, {
        ...base, tipo: "PRORROGACAO_PRAZO", dias: 30, valor: "1000.00",
      })
    ).rejects.toThrow(/não em valor/);

    expect(await prisma.movimentoContratual.count()).toBe(0);

    // ═══ O INSERT DIRETO, QUE DRIBLA O SERVIÇO — o CHECK do banco pega ═══
    await expect(
      prisma.movimentoContratual.create({
        data: {
          contratoId, tipo: "ACRESCIMO_VALOR",
          valor: "1000.00", dias: 30, // as DUAS dimensões
          data: new Date("2026-03-01T12:00:00Z"), numeroAditivo: "X",
          motivo: "insert direto", criadoPor: "atacante",
        },
      })
    ).rejects.toThrow(/ck_movimento_contratual_xor/);

    // e o inverso: tipo de prazo com valor
    await expect(
      prisma.movimentoContratual.create({
        data: {
          contratoId, tipo: "PRORROGACAO_PRAZO",
          valor: "1000.00", dias: null,
          data: new Date("2026-03-01T12:00:00Z"), numeroAditivo: "X",
          motivo: "insert direto", criadoPor: "atacante",
        },
      })
    ).rejects.toThrow(/ck_movimento_contratual_xor/);

    expect(await prisma.movimentoContratual.count()).toBe(0);
  });

  // t5
  it("t5: estorno devolve a dimensão CERTA — e o duplo estorno é barrado pelo índice", async () => {
    const contratoId = await contratoDeTeste();

    const acrescimo = await registrarAditivo(prisma, {
      contratoId, tipo: "ACRESCIMO_VALOR", valor: "20000.00",
      data: new Date("2026-03-01T12:00:00Z"), numeroAditivo: "1º TA",
      motivo: "acréscimo de quantitativo do item 3", criadoPor: POR,
    });
    const prorrogacao = await registrarAditivo(prisma, {
      contratoId, tipo: "PRORROGACAO_PRAZO", dias: 90,
      data: new Date("2026-11-01T12:00:00Z"), numeroAditivo: "2º TA",
      motivo: "prorrogação por interesse da administração", criadoPor: POR,
    });

    expect((await valorAtualizadoDoContrato(prisma, contratoId)).toFixed(2)).toBe("120000.00");
    expect(iso(await vigenciaFimDoContrato(prisma, contratoId))).toBe("2027-03-31T23:59:59.000Z");

    // ── ESTORNA A PRORROGAÇÃO: a vigência VOLTA, o valor não se mexe ────────
    await estornarMovimentoContratual(prisma, {
      movimentoId: prorrogacao.movimentoId,
      data: new Date("2026-11-20T12:00:00Z"),
      motivo: "prorrogação assinada por engano no processo errado",
      criadoPor: POR,
    });
    expect(iso(await vigenciaFimDoContrato(prisma, contratoId))).toBe(
      "2026-12-31T23:59:59.000Z" // exatamente o fim inicial
    );
    expect((await valorAtualizadoDoContrato(prisma, contratoId)).toFixed(2)).toBe("120000.00");

    // ── ESTORNA O ACRÉSCIMO: o valor VOLTA, a vigência não se mexe ──────────
    await estornarMovimentoContratual(prisma, {
      movimentoId: acrescimo.movimentoId,
      data: new Date("2026-11-21T12:00:00Z"),
      motivo: "acréscimo lançado no contrato errado",
      criadoPor: POR,
    });
    expect((await valorAtualizadoDoContrato(prisma, contratoId)).toFixed(2)).toBe("100000.00");
    expect(iso(await vigenciaFimDoContrato(prisma, contratoId))).toBe("2026-12-31T23:59:59.000Z");

    // ── DUPLO ESTORNO: pelo serviço (derivação) e por INSERT direto (índice) ──
    await expect(
      estornarMovimentoContratual(prisma, {
        movimentoId: acrescimo.movimentoId,
        data: new Date("2026-11-22T12:00:00Z"),
        motivo: "tentando estornar duas vezes o mesmo aditivo",
        criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ FOI ESTORNADO/);

    // (O Prisma reporta o CAMPO, não o nome do índice — quem barra é o
    // uq_estorno_contratual_unico, o índice parcial de prisma/sql/.)
    await expect(
      prisma.movimentoContratual.create({
        data: {
          contratoId, tipo: "ESTORNO_ACRESCIMO_VALOR", valor: "20000.00",
          data: new Date("2026-11-22T12:00:00Z"), numeroAditivo: "1º TA",
          estornoDeId: acrescimo.movimentoId,
          motivo: "insert direto driblando o serviço", criadoPor: "atacante",
        },
      })
    ).rejects.toThrow(/Unique constraint failed[\s\S]*estornoDeId/);

    // ── ESTORNO DE ESTORNO: o Record devolve null e a função lança ──────────
    const oEstorno = await prisma.movimentoContratual.findFirstOrThrow({
      where: { estornoDeId: acrescimo.movimentoId }, select: { id: true },
    });
    await expect(
      estornarMovimentoContratual(prisma, {
        movimentoId: oEstorno.id,
        data: new Date("2026-11-23T12:00:00Z"),
        motivo: "estornando o estorno, que não existe",
        criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ É um estorno/);

    // 4 linhas: 2 aditivos + 2 estornos. NADA foi apagado (append-only).
    expect(await prisma.movimentoContratual.count()).toBe(4);
  });

  // t6
  it("t6: o rol de modalidades é FECHADO — 8, e os dois Records cobrem os 6 tipos", () => {
    const modalidades = Object.keys(MODALIDADES);
    expect(modalidades).toHaveLength(8);
    expect(modalidades.sort()).toEqual(
      [
        "CONCORRENCIA", "CONCURSO", "DIALOGO_COMPETITIVO", "DISPENSA",
        "INEXIGIBILIDADE", "LEILAO", "PREGAO_ELETRONICO", "PREGAO_PRESENCIAL",
      ].sort()
    );

    // ⚠️ DUAS DIMENSÕES, UM MOVIMENTO: cada tipo é NEUTRO na dimensão que não é a
    // dele. Se um tipo tivesse sinal nas duas, um aditivo somaria em valor E em
    // prazo — e nenhuma das duas somas acusaria nada.
    for (const tipo of Object.keys(SINAL_VALOR_CONTRATUAL) as (keyof typeof SINAL_VALOR_CONTRATUAL)[]) {
      const noValor = SINAL_VALOR_CONTRATUAL[tipo] !== 0;
      const noPrazo = SINAL_PRAZO_CONTRATUAL[tipo] !== 0;
      expect(noValor).not.toBe(noPrazo); // XOR, tipo a tipo
    }
    expect(Object.keys(SINAL_VALOR_CONTRATUAL)).toHaveLength(6);
    expect(Object.keys(SINAL_PRAZO_CONTRATUAL)).toHaveLength(6);
  });

  // t7
  it("t7: o corte é pela data do FATO — o aditivo de 2027 não muda o contrato de 2026", async () => {
    const contratoId = await contratoDeTeste();

    await registrarAditivo(prisma, {
      contratoId, tipo: "ACRESCIMO_VALOR", valor: "20000.00",
      data: new Date("2026-03-01T12:00:00Z"), numeroAditivo: "1º TA",
      motivo: "acréscimo de quantitativo do item 3", criadoPor: POR,
    });
    await registrarAditivo(prisma, {
      contratoId, tipo: "SUPRESSAO_VALOR", valor: "5000.00",
      data: new Date("2026-05-01T12:00:00Z"), numeroAditivo: "2º TA",
      motivo: "supressão do item 7, sem interesse da administração", criadoPor: POR,
    });
    await registrarAditivo(prisma, {
      contratoId, tipo: "PRORROGACAO_PRAZO", dias: 90,
      data: new Date("2026-11-01T12:00:00Z"), numeroAditivo: "3º TA",
      motivo: "prorrogação por interesse na continuidade", criadoPor: POR,
    });

    // ── DEPOIS DO CORTE DE 2026 ────────────────────────────────────────────
    await registrarAditivo(prisma, {
      contratoId, tipo: "ACRESCIMO_VALOR", valor: "10000.00",
      data: new Date("2027-06-01T12:00:00Z"), numeroAditivo: "4º TA",
      motivo: "acréscimo já na vigência prorrogada", criadoPor: POR,
    });
    await registrarAditivo(prisma, {
      contratoId, tipo: "PRORROGACAO_PRAZO", dias: 30,
      data: new Date("2027-06-01T12:00:00Z"), numeroAditivo: "5º TA",
      motivo: "nova prorrogação, já em 2027", criadoPor: POR,
    });

    // ── NO CORTE DE 2026: como se 2027 não existisse ───────────────────────
    expect(
      (await valorAtualizadoDoContrato(prisma, contratoId, CORTE_2026)).toFixed(2)
    ).toBe("115000.00");
    expect(iso(await vigenciaFimDoContrato(prisma, contratoId, CORTE_2026))).toBe(
      "2027-03-31T23:59:59.000Z"
    );

    // ── NO CORTE DE 2027: os dois aditivos novos entram ────────────────────
    expect(
      (await valorAtualizadoDoContrato(prisma, contratoId, CORTE_2027)).toFixed(2)
    ).toBe("125000.00"); // 115.000 + 10.000
    expect(iso(await vigenciaFimDoContrato(prisma, contratoId, CORTE_2027))).toBe(
      "2027-04-30T23:59:59.000Z" // 31/03 + 30 dias
    );
  });
});
