import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { registrarMovimentoBancario } from "./movimentacao.js";
import {
  abrirConciliacao,
  conciliacoesDaConta,
  encerrarConciliacao,
  justificarPendencia,
  lerConciliacao,
  registrarPendenciaManual,
} from "./servico-conciliacao.js";
import { estadoDaConciliacao, somarSelecao } from "./conciliacao-periodo.js";

/**
 * M09 — A CONCILIAÇÃO COMO OBJETO DISCRETO (ENT03a).
 *
 * Decidido em `docs/adr/ADR-conciliacao-como-objeto-discreto.md`.
 *
 * ═══ ⚠️ O QUE PRECISA SER PROVADO, E POR QUE N=2 EM QUASE TUDO ═══
 *   · o estado é DERIVADO, sem coluna;
 *   · encerrada é IMUTÁVEL — e só com DUAS operações (uma antes, uma depois) isso se
 *     distingue de "a segunda operação sempre falha";
 *   · a herança é POR REFERÊNCIA — e só com DOIS períodos ela existe;
 *   · a seleção múltipla soma — e com um item só, "soma" e "valor do item" coincidem.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const FONTE = "fnt-cp";
const BANCOS = "1.1.1.1.2.00.00";
const RECEITA_FIN = "4.4.1.1.1.00.00";
const DESPESA_FIN = "3.4.1.1.1.00.00";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "cp-bancos", codigo: BANCOS, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "cp-rec", codigo: RECEITA_FIN, nome: "Receitas Financeiras", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "cp-desp", codigo: DESPESA_FIN, nome: "Despesas Financeiras", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: POR } });
  await prisma.contaBancaria.create({
    data: { id: "cb-cp", codigo: "CC-CP", descricao: "Movimento", fonteId: FONTE, contaContabilId: "cp-bancos" },
  });
  await prisma.fonteDaContaBancaria.create({
    data: { contaBancariaId: "cb-cp", fonteId: FONTE, criadoPor: POR },
  });
}

const EM = (dia: string): Date => new Date(`${dia}T12:00:00Z`);

async function deposito(valor: string, dia: string): Promise<void> {
  await registrarMovimentoBancario(prisma, {
    contaBancariaId: "cb-cp", fonteId: FONTE, tipo: "DEPOSITO", valor,
    data: EM(dia), historico: `depósito ${valor}`,
    contaContrapartidaId: "cp-rec", criadoPor: POR,
  });
}

describe("M09 — a conciliação como objeto discreto", () => {
  beforeEach(semear);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. O ESTADO — derivado, sem coluna
  // ═══════════════════════════════════════════════════════════════════════════

  it("t1: o estado é DERIVADO dos movimentos — não há coluna de status", async () => {
    const { conciliacaoId } = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });

    // ⚠️ A TABELA NÃO TEM `status` NEM `encerrada`. Uma coluna exigiria UPDATE, e a
    // tabela é append-only — derraparia no primeiro encerramento concorrente.
    const colunas = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ConciliacaoBancaria'`
    );
    const nomes = colunas.map((c) => c.column_name);
    expect(nomes).not.toContain("status");
    expect(nomes).not.toContain("encerrada");
    expect(nomes).not.toContain("estado");

    expect((await lerConciliacao(prisma, conciliacaoId)).estado).toBe("ABERTA");

    await encerrarConciliacao(prisma, { conciliacaoId, criadoPor: POR });
    const depois = await lerConciliacao(prisma, conciliacaoId);
    expect(depois.estado).toBe("ENCERRADA");
    expect(depois.encerradaPor).toBe(POR);
    expect(depois.encerradaEm).not.toBeNull();
  });

  it("t2: `estadoDaConciliacao` é pura — sem ENCERRAR é ABERTA", () => {
    expect(estadoDaConciliacao([])).toBe("ABERTA");
    expect(estadoDaConciliacao([{ tipo: "ABRIR", criadoEm: new Date() }])).toBe("ABERTA");
    expect(
      estadoDaConciliacao([
        { tipo: "ABRIR", criadoEm: new Date("2026-07-01") },
        { tipo: "ENCERRAR", criadoEm: new Date("2026-07-05") },
      ])
    ).toBe("ENCERRADA");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ENCERRADA É IMUTÁVEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ N=2: a MESMA operação, uma antes e uma depois do encerramento.
   *
   * Só o par distingue "encerrada é imutável" de "a segunda pendência sempre falha". A
   * primeira TEM de passar; é a segunda que prova a regra.
   */
  it("t3: pendência manual entra ANTES do encerramento e é recusada DEPOIS", async () => {
    const { conciliacaoId } = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });

    await registrarPendenciaManual(prisma, {
      conciliacaoId, descricao: "cheque 4412 não compensado",
      motivo: "emitido em 28/06, o banco só compensa em julho",
      valor: "1200.00", natureza: "DEBITO", criadoPor: POR,
    });
    expect((await lerConciliacao(prisma, conciliacaoId)).pendenciasManuais.length).toBe(1);

    await encerrarConciliacao(prisma, { conciliacaoId, criadoPor: POR });

    await expect(
      registrarPendenciaManual(prisma, {
        conciliacaoId, descricao: "outra coisa",
        motivo: "tentando mexer no periodo fechado",
        valor: "10.00", natureza: "CREDITO", criadoPor: POR,
      })
    ).rejects.toThrow(/está ENCERRADA/);

    // Nada foi acrescentado.
    expect((await lerConciliacao(prisma, conciliacaoId)).pendenciasManuais.length).toBe(1);
  });

  it("t4: encerrar duas vezes é recusado — quem encerrou teria duas respostas", async () => {
    const { conciliacaoId } = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    await encerrarConciliacao(prisma, { conciliacaoId, criadoPor: POR });
    await expect(
      encerrarConciliacao(prisma, { conciliacaoId, criadoPor: POR })
    ).rejects.toThrow(/está ENCERRADA/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. A PENDÊNCIA MANUAL NÃO CRIA LANÇAMENTO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ A REGRA MAIS IMPORTANTE DESTE MODELO. Uma pendência que gerasse lançamento seria
   * um fato contábil nascido de uma ANOTAÇÃO DE TELA — e o razão passaria a conter o que
   * ninguém empenhou, liquidou ou pagou.
   */
  it("t5: a pendência manual NÃO cria lançamento no razão", async () => {
    const { conciliacaoId } = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    const antes = await prisma.lancamentoContabil.count();

    await registrarPendenciaManual(prisma, {
      conciliacaoId, descricao: "depósito em trânsito",
      motivo: "cliente depositou em 30/06, o banco creditou em 01/07",
      valor: "5000.00", natureza: "CREDITO", criadoPor: POR,
    });

    expect(await prisma.lancamentoContabil.count()).toBe(antes);
    expect(await prisma.movimentoBancario.count()).toBe(0);
  });

  it("t6: pendência manual sem motivo de verdade é recusada", async () => {
    const { conciliacaoId } = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    await expect(
      registrarPendenciaManual(prisma, {
        conciliacaoId, descricao: "x", motivo: "erro",
        valor: "1.00", natureza: "CREDITO", criadoPor: POR,
      })
    ).rejects.toThrow(/motivo/i);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. A HERANÇA — POR REFERÊNCIA, e ela exige DOIS períodos
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ "CÓPIA PARA O PERÍODO SEGUINTE" NÃO É CÓPIA — e este teste prova pelo dado.
   *
   * O período de julho vê as pendências de junho, mas **não existe nenhuma linha
   * duplicada**: a contagem de pendências no banco não muda ao abrir julho. Duplicar
   * criaria dois registros da mesma pendência e a soma passaria a contar duas vezes.
   */
  it("t7: o período seguinte HERDA o não resolvido da anterior, sem duplicar linha", async () => {
    // Um depósito em junho, sem extrato importado: ele fica como pendência interna.
    await deposito("1000.00", "2026-06-10");

    const junho = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    const emJunho = await lerConciliacao(prisma, junho.conciliacaoId);
    expect(emJunho.relatorio.internoSemVinculo.length).toBe(1);
    // Junho é o primeiro período: não herda nada.
    expect(emJunho.herdadasDaAnterior).toEqual([]);

    await encerrarConciliacao(prisma, {
      conciliacaoId: junho.conciliacaoId, criadoPor: POR,
    });

    const linhasAntes = await prisma.pendenciaManualDeConciliacao.count();

    const julho = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-07-01", diaFim: "2026-07-31",
      criadoPor: POR,
    });
    const emJulho = await lerConciliacao(prisma, julho.conciliacaoId);

    // ⚠️ JULHO VÊ a pendência de junho...
    expect(emJulho.herdadasDaAnterior.length).toBe(1);
    expect(emJulho.herdadasDaAnterior[0]?.lado).toBe("MOVIMENTO_BANCARIO");

    // ...E NENHUMA LINHA FOI CRIADA para isso. É referência, não cópia.
    expect(await prisma.pendenciaManualDeConciliacao.count()).toBe(linhasAntes);

    // E o encadeamento está gravado.
    const encadeada = await prisma.conciliacaoBancaria.findUniqueOrThrow({
      where: { id: julho.conciliacaoId },
      select: { anteriorId: true },
    });
    expect(encadeada.anteriorId).toBe(junho.conciliacaoId);
  });

  /**
   * ⚠️ NÃO SE ABRE O SEGUINTE COM O ANTERIOR AINDA ABERTO.
   *
   * Encadear a uma conciliação ABERTA faria o conjunto herdado mudar debaixo do período
   * seguinte toda vez que alguém conciliasse mais uma linha lá atrás — e o relatório de
   * julho mudaria sozinho, sem ninguém tocar em julho.
   */
  it("t8: abrir julho com junho ainda ABERTA é recusado, nomeando o período", async () => {
    await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    await expect(
      abrirConciliacao(prisma, {
        contaBancariaId: "cb-cp", diaInicio: "2026-07-01", diaFim: "2026-07-31",
        criadoPor: POR,
      })
    ).rejects.toThrow(/01\/06\/2026 a 30\/06\/2026.*ainda está ABERTA/s);
  });

  it("t9: o mesmo período não é aberto duas vezes na mesma conta", async () => {
    await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    await expect(
      abrirConciliacao(prisma, {
        contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
        criadoPor: POR,
      })
    ).rejects.toThrow();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. O PERÍODO EM DIAS CIVIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ O PERÍODO COBRE OS DIAS CIVIS INTEIROS. Com `Date.UTC`, "junho" começaria às
   * 21:00 de 31/05 e terminaria às 20:59 de 30/06 — deixando de fora o fato da noite do
   * dia 30, que é justamente o que atravessa o fechamento.
   */
  it("t10: o período vai do início do dia civil ao fim do dia civil", async () => {
    const { conciliacaoId } = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    const c = await prisma.conciliacaoBancaria.findUniqueOrThrow({
      where: { id: conciliacaoId },
      select: { periodoInicio: true, periodoFim: true },
    });
    expect(diaCivil(c.periodoInicio)).toBe("2026-06-01");
    expect(diaCivil(c.periodoFim)).toBe("2026-06-30");
    // 01/06 às 00:00 locais = 03:00Z; 30/06 às 23:59:59.999 locais = 01/07 02:59:59.999Z.
    expect(c.periodoInicio.toISOString()).toBe("2026-06-01T03:00:00.000Z");
    expect(c.periodoFim.toISOString()).toBe("2026-07-01T02:59:59.999Z");
  });

  it("t11: período invertido é recusado", async () => {
    await expect(
      abrirConciliacao(prisma, {
        contaBancariaId: "cb-cp", diaInicio: "2026-06-30", diaFim: "2026-06-01",
        criadoPor: POR,
      })
    ).rejects.toThrow(/invertido/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. A JUSTIFICATIVA
  // ═══════════════════════════════════════════════════════════════════════════

  it("t12: a justificativa explica a pendência derivada, e substituí-la não estoura", async () => {
    await deposito("800.00", "2026-06-10");
    const { conciliacaoId } = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    const rel = await lerConciliacao(prisma, conciliacaoId);
    const alvo = rel.relatorio.internoSemVinculo[0];
    expect(alvo).toBeDefined();

    await justificarPendencia(prisma, {
      conciliacaoId, lado: alvo!.tipoInterno, referencia: alvo!.id,
      motivo: "extrato de junho ainda não importado pelo banco",
      criadoPor: POR,
    });

    // ⚠️ SALVAR DE NOVO É O GESTO MAIS NORMAL DO MUNDO. Um `create` cru estouraria no
    // segundo salvamento da mesma tela — por isso o serviço usa `upsert`.
    await justificarPendencia(prisma, {
      conciliacaoId, lado: alvo!.tipoInterno, referencia: alvo!.id,
      motivo: "corrigindo: o banco reemitiu o extrato e ele entra em julho",
      criadoPor: POR,
    });

    const depois = await lerConciliacao(prisma, conciliacaoId);
    expect(depois.justificativas.length).toBe(1);
    expect(depois.justificativas[0]?.motivo).toContain("reemitiu");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. A SELEÇÃO MÚLTIPLA COM SOMA — TR 5.10.2.47
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ N=2 OBRIGATÓRIO: com UM item, "a soma" e "o valor do item" são o mesmo número, e
   * qualquer implementação passa. São três itens de valores diferentes, e só a soma dá o
   * alvo.
   */
  it("t13: a seleção múltipla soma e confere com o alvo", () => {
    const r = somarSelecao(
      [
        { id: "a", valor: toMoney("300.00") },
        { id: "b", valor: toMoney("450.50") },
        { id: "c", valor: toMoney("249.50") },
      ],
      toMoney("1000.00")
    );
    expect(r.quantidade).toBe(3);
    expect(r.soma.toFixed(2)).toBe("1000.00");
    expect(r.confere).toBe(true);
    expect(r.diferenca.toFixed(2)).toBe("0.00");
  });

  it("t14: quando não confere, a diferença é NOMEADA — e com sinal", () => {
    const falta = somarSelecao([{ id: "a", valor: toMoney("300.00") }], toMoney("500.00"));
    expect(falta.confere).toBe(false);
    expect(falta.diferenca.toFixed(2)).toBe("-200.00");

    const sobra = somarSelecao([{ id: "a", valor: toMoney("700.00") }], toMoney("500.00"));
    expect(sobra.diferenca.toFixed(2)).toBe("200.00");
  });

  /**
   * ⚠️ ITEM REPETIDO É RECUSADO. Marcar a mesma linha duas vezes dobraria a soma e faria
   * um vínculo de valor inexistente parecer certo na tela. A tela pode impedir; a tela
   * não é guard.
   */
  it("t15: item repetido na seleção é recusado", () => {
    expect(() =>
      somarSelecao(
        [
          { id: "a", valor: toMoney("300.00") },
          { id: "a", valor: toMoney("300.00") },
        ],
        toMoney("600.00")
      )
    ).toThrow(/aparece duas vezes/);
  });

  it("t16: seleção vazia soma zero — e não estoura", () => {
    const r = somarSelecao([], toMoney("0.00"));
    expect(r.quantidade).toBe(0);
    expect(r.soma.toFixed(2)).toBe("0.00");
    expect(r.confere).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. PERÍODOS ANTERIORES — TR 5.10.2.49
  // ═══════════════════════════════════════════════════════════════════════════

  it("t17: as conciliações da conta são listáveis, da mais recente para a mais antiga", async () => {
    const junho = await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-06-01", diaFim: "2026-06-30",
      criadoPor: POR,
    });
    await encerrarConciliacao(prisma, { conciliacaoId: junho.conciliacaoId, criadoPor: POR });
    await abrirConciliacao(prisma, {
      contaBancariaId: "cb-cp", diaInicio: "2026-07-01", diaFim: "2026-07-31",
      criadoPor: POR,
    });

    const lista = await conciliacoesDaConta(prisma, "cb-cp");
    expect(lista.map((c) => c.rotulo)).toEqual([
      "01/07/2026 a 31/07/2026",
      "01/06/2026 a 30/06/2026",
    ]);
    expect(lista[0]?.estado).toBe("ABERTA");
    expect(lista[1]?.estado).toBe("ENCERRADA");
    expect(lista[1]?.encerradaPor).toBe(POR);
  });
});
