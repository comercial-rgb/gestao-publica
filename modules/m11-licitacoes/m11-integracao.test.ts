import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { anularEmpenho, empenhar, reservarDotacao } from "../m05-despesa/servico.js";
import { empenhadoLiquidoPorContrato } from "../m05-despesa/consultas.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { criarM05DepsComContratos } from "./adapter-m05.js";
import {
  cadastrarContrato,
  cadastrarProcesso,
  homologarProcesso,
  registrarAditivo,
  saldoDoContrato,
} from "./contratos.js";

/**
 * M11 — BLOCO 2: INTEGRAÇÃO CONTRATO ↔ EMPENHO.
 * TR 4.41/4.42 (reserva vinculada), 5.6/5.101/5.102/5.112 (vigência e saldo).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O CONTRATO DE TESTE ═══
 *   valor inicial ........ 100.000,00
 *   vigência ............. 01/01/2026 → 31/12/2026T23:59:59Z
 *   categoria ............ PRESTACAO_SERVICOS  (o contrato manda; o empenho herda)
 *
 * ═══ t1 — CICLO FELIZ ═══
 *   empenho 60.000 (categoria OMITIDA pelo chamador)
 *   ⟹ empenho.categoriaOrdemCronologica == PRESTACAO_SERVICOS (herdada; SELECT prova)
 *   ⟹ saldo = 100.000 − 60.000 = 40.000,00
 *
 * ═══ t2 — VIGÊNCIA (a borda do bloco 1, agora bloqueando) ═══
 *   empenho em 31/12/2026T23:59:59Z ....... PASSA (último instante, inclusivo)
 *   empenho em 01/01/2027T00:00:00Z ....... REJEITADO
 *   + PRORROGACAO_PRAZO de 30 dias:
 *     fim = 31/12/2026T23:59:59 + 30 dias = 30/01/2027T23:59:59Z
 *   ⟹ o MESMO empenho de 01/01/2027 agora PASSA (a derivação trabalhando)
 *
 * ═══ t3 — SALDO ═══
 *   60.000 + 40.000 = 100.000 (esgota)
 *   0,01 ⟹ REJEITADO nomeando: atualizado 100.000, empenhado 100.000, saldo 0,00
 *   ⚠️ ANULAÇÃO É **TOTAL** NESTE SISTEMA (o estorno copia o valor do original;
 *      `zAnularEmpenhoInput` não tem campo `valor`). Não existe anulação parcial —
 *      então o teste anula o empenho de 40.000 INTEIRO:
 *   ⟹ empenhado = 60.000, saldo = 40.000, e um empenho de 40.000 volta a passar.
 *
 * ═══ t5 — SUPRESSÃO × EMPENHADO (o guard inócuo do bloco 1, agora com dados) ═══
 *   contrato 100.000, empenhado 60.000 ⟹ saldo 40.000
 *   supressão de 50.000 ⟹ REJEITADA (100.000 − 50.000 = 50.000 < 60.000 empenhado)
 *   supressão de 40.000 ⟹ PASSA (100.000 − 40.000 = 60.000 == empenhado, exato)
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const FICHA = "ficha-1";
const FONTE = "fnt-500";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});

const HOMOLOGADO_EM = new Date("2025-12-01T12:00:00Z");
const INICIO = new Date("2026-01-01T00:00:00Z");
const FIM_INICIAL = new Date("2026-12-31T23:59:59Z");
const DATA_EMPENHO = new Date("2026-02-01T12:00:00Z");

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05DepsComContratos(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
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
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "1000000.00",
  });
}

/** Processo homologado POR EVENTO (o caminho append-only do bloco 2). */
async function processoHomologado(numero = "PROC-001/2025"): Promise<string> {
  const { processoId } = await cadastrarProcesso(prisma, {
    numeroProcesso: numero,
    modalidade: "PREGAO_ELETRONICO",
    objeto: "Prestação de serviços de manutenção predial continuada",
    valorLicitado: "120000.00",
    criadoPor: POR, // SEM dataHomologacao: a homologação vem por EVENTO
  });
  await homologarProcesso(prisma, {
    processoId, data: HOMOLOGADO_EM, criadoPor: POR,
  });
  return processoId;
}

async function contratoDe(
  processoId: string,
  numero = "CT-001/2026",
  valor = "100000.00"
): Promise<string> {
  const { contratoId } = await cadastrarContrato(prisma, {
    numeroContrato: numero,
    processoId,
    contratadoDocumento: "12345678000199",
    contratadoNome: "Manutec Serviços LTDA",
    valorInicial: valor,
    vigenciaInicio: INICIO,
    vigenciaFimInicial: FIM_INICIAL,
    categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
    criadoPor: POR,
  });
  return contratoId;
}

/** Empenha contra o contrato. `categoria` omitida = herda. */
function empenhoDe(
  contratoId: string | undefined,
  numero: string,
  valor: string,
  extras: Record<string, unknown> = {}
) {
  return {
    fichaId: FICHA,
    ...(contratoId !== undefined ? { contratoId } : {}),
    numero,
    tipo: "ORDINARIO" as const,
    valor,
    data: DATA_EMPENHO,
    credorCpfCnpj: "12345678000199",
    historico: "empenho contra contrato",
    criadoPor: POR,
    ...extras,
  };
}

describe("M11 bloco 2 — contrato × empenho", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: ciclo feliz — homologação por EVENTO, herança de categoria, saldo 40.000", async () => {
    const processoId = await processoHomologado();
    const contratoId = await contratoDe(processoId);

    // categoria OMITIDA: o empenho a herda do contrato
    const { empenhoId } = await empenhar(
      empenhoDe(contratoId, "NE-1", "60000.00"),
      R_EMPENHO,
      deps
    );

    const e = await prisma.empenho.findUniqueOrThrow({
      where: { id: empenhoId },
      select: { categoriaOrdemCronologica: true, contratoId: true },
    });
    // ⚠️ HERDADA DO CONTRATO — o chamador não disse nada.
    expect(e.categoriaOrdemCronologica).toBe("PRESTACAO_SERVICOS");
    expect(e.contratoId).toBe(contratoId);

    expect(
      (await empenhadoLiquidoPorContrato(prisma, contratoId)).toFixed(2)
    ).toBe("60000.00");
    // 100.000 − 60.000
    expect((await saldoDoContrato(prisma, contratoId)).toFixed(2)).toBe("40000.00");
  });

  // t2
  it("t2: vigência bloqueia — a borda passa, o dia seguinte não, e a prorrogação libera", async () => {
    const processoId = await processoHomologado();
    const contratoId = await contratoDe(processoId);

    // ÚLTIMO INSTANTE da vigência: passa (borda inclusiva, documentada no bloco 1)
    await empenhar(
      empenhoDe(contratoId, "NE-BORDA", "1000.00", {
        data: new Date("2026-12-31T23:59:59Z"),
      }),
      R_EMPENHO,
      deps
    );

    // um segundo depois: fora da vigência
    const foraDaVigencia = empenhoDe(contratoId, "NE-FORA", "1000.00", {
      data: new Date("2027-01-01T00:00:00Z"),
    });
    await expect(empenhar(foraDaVigencia, R_EMPENHO, deps)).rejects.toThrow(
      /CONTRATO FORA DA VIGÊNCIA/
    );
    expect(await prisma.empenho.count({ where: { numero: "NE-FORA" } })).toBe(0);

    // ═══ PRORROGA 30 DIAS: 31/12/2026 + 30 = 30/01/2027 ═══
    await registrarAditivo(prisma, {
      contratoId, tipo: "PRORROGACAO_PRAZO", dias: 30,
      data: new Date("2026-12-20T12:00:00Z"), numeroAditivo: "1º TA",
      motivo: "prorrogação por interesse na continuidade do serviço",
      criadoPor: POR,
    });

    // o MESMO empenho, agora, passa — nada mudou nele; mudou a DERIVAÇÃO
    await empenhar(foraDaVigencia, R_EMPENHO, deps);
    expect(await prisma.empenho.count({ where: { numero: "NE-FORA" } })).toBe(1);
  });

  // t3
  it("t3: saldo do contrato bloqueia — e a ANULAÇÃO devolve (derivado, nunca flag)", async () => {
    const processoId = await processoHomologado();
    const contratoId = await contratoDe(processoId);

    await empenhar(empenhoDe(contratoId, "NE-1", "60000.00"), R_EMPENHO, deps);
    const segundo = await empenhar(
      empenhoDe(contratoId, "NE-2", "40000.00"),
      R_EMPENHO,
      deps
    );
    // 60.000 + 40.000 = 100.000 → saldo zerado
    expect((await saldoDoContrato(prisma, contratoId)).toFixed(2)).toBe("0.00");

    // um centavo a mais: rejeitado NOMEANDO AS TRÊS PARCELAS
    let erro: unknown;
    try {
      await empenhar(empenhoDe(contratoId, "NE-3", "0.01"), R_EMPENHO, deps);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> SALDO DO CONTRATO (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/SALDO DO CONTRATO INSUFICIENTE/);
    expect(msg).toMatch(/100000\.00/); // valor atualizado E empenhado
    expect(msg).toMatch(/saldo 0\.00/);
    expect(msg).toMatch(/pede 0\.01/);
    expect(await prisma.empenho.count({ where: { numero: "NE-3" } })).toBe(0);

    // ═══ ANULA O EMPENHO DE 40.000 (anulação é TOTAL — ver o cabeçalho) ═══
    await anularEmpenho(
      {
        empenhoId: segundo.empenhoId, numero: "NE-2-ANUL",
        data: new Date("2026-03-01T12:00:00Z"),
        historico: "anulação do empenho 2", criadoPor: POR,
      },
      deps
    );

    // o empenhado CAIU sozinho: é SUM, não flag. E a anulação só entra na conta
    // porque COPIA o contratoId do original.
    expect(
      (await empenhadoLiquidoPorContrato(prisma, contratoId)).toFixed(2)
    ).toBe("60000.00");
    expect((await saldoDoContrato(prisma, contratoId)).toFixed(2)).toBe("40000.00");

    // e o contrato volta a aceitar 40.000
    await empenhar(empenhoDe(contratoId, "NE-4", "40000.00"), R_EMPENHO, deps);
    expect((await saldoDoContrato(prisma, contratoId)).toFixed(2)).toBe("0.00");
  });

  // t4
  it("t4: categoria DIVERGENTE do contrato é erro — nunca sobrescrita em silêncio", async () => {
    const processoId = await processoHomologado();
    const contratoId = await contratoDe(processoId);

    let erro: unknown;
    try {
      await empenhar(
        empenhoDe(contratoId, "NE-1", "1000.00", {
          categoriaOrdemCronologica: "REALIZACAO_OBRAS", // contrato é PRESTACAO_SERVICOS
        }),
        R_EMPENHO,
        deps
      );
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> CATEGORIA DIVERGENTE (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/CATEGORIA DIVERGENTE DO CONTRATO/);
    expect(msg).toMatch(/REALIZACAO_OBRAS/);
    expect(msg).toMatch(/PRESTACAO_SERVICOS/);
    expect(msg).toMatch(/fila do art\. 141/);
    expect(await prisma.empenho.count()).toBe(0);

    // a MESMA categoria do contrato, informada explicitamente: passa
    await empenhar(
      empenhoDe(contratoId, "NE-1", "1000.00", {
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      }),
      R_EMPENHO,
      deps
    );
    expect(await prisma.empenho.count()).toBe(1);
  });

  // t5
  it("t5: o guard da SUPRESSÃO do bloco 1, agora com empenhos de verdade", async () => {
    const processoId = await processoHomologado();
    const contratoId = await contratoDe(processoId);
    await empenhar(empenhoDe(contratoId, "NE-1", "60000.00"), R_EMPENHO, deps);

    // 100.000 − 50.000 = 50.000 < 60.000 empenhado → REJEITADA
    await expect(
      registrarAditivo(prisma, {
        contratoId, tipo: "SUPRESSAO_VALOR", valor: "50000.00",
        data: new Date("2026-06-01T12:00:00Z"), numeroAditivo: "1º TA",
        motivo: "supressão que engoliria empenho já emitido", criadoPor: POR,
      })
    ).rejects.toThrow(/SUPRESSÃO MAIOR QUE O SALDO/);
    expect(await prisma.movimentoContratual.count()).toBe(0);

    // 100.000 − 40.000 = 60.000 == empenhado → PASSA (a borda exata)
    await registrarAditivo(prisma, {
      contratoId, tipo: "SUPRESSAO_VALOR", valor: "40000.00",
      data: new Date("2026-06-01T12:00:00Z"), numeroAditivo: "1º TA",
      motivo: "supressão do saldo não empenhado, por acordo", criadoPor: POR,
    });
    expect((await saldoDoContrato(prisma, contratoId)).toFixed(2)).toBe("0.00");
  });

  // t6
  it("t6: reserva VINCULADA a licitação (TR 4.42) exige contrato DAQUELE processo", async () => {
    const processoA = await processoHomologado("PROC-A/2025");
    const processoB = await processoHomologado("PROC-B/2025");
    const contratoA = await contratoDe(processoA, "CT-A/2026");
    const contratoB = await contratoDe(processoB, "CT-B/2026");

    const reservaId = await reservarDotacao(
      {
        fichaId: FICHA, valor: "50000.00", historico: "reserva do pregão A",
        processoId: processoA, criadoPor: POR,
      },
      deps
    );

    // (1) empenho SEM contrato consumindo reserva vinculada → REJEITADO
    await expect(
      empenhar(
        empenhoDe(undefined, "NE-1", "10000.00", {
          reservaId,
          categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        }),
        R_EMPENHO,
        deps
      )
    ).rejects.toThrow(/RESERVA VINCULADA A LICITAÇÃO/);

    // (2) empenho com contrato de OUTRO processo → REJEITADO
    await expect(
      empenhar(
        empenhoDe(contratoB, "NE-1", "10000.00", { reservaId }),
        R_EMPENHO,
        deps
      )
    ).rejects.toThrow(/RESERVA DE OUTRA LICITAÇÃO/);

    expect(await prisma.empenho.count()).toBe(0);

    // (3) contrato DO MESMO processo → PASSA
    await empenhar(
      empenhoDe(contratoA, "NE-1", "10000.00", { reservaId }),
      R_EMPENHO,
      deps
    );
    expect(await prisma.empenho.count()).toBe(1);
  });

  // t7
  it("t7: DUAS VERDADES de homologação — cadastro × evento, e o duplo evento", async () => {
    // processo que JÁ NASCE homologado no cadastro
    const { processoId } = await cadastrarProcesso(prisma, {
      numeroProcesso: "PROC-CARGA/2025",
      modalidade: "DISPENSA",
      // Bloco 3: DISPENSA sem hipótese do art. 75 é barrada (Zod + CHECK).
      // OUTRAS = emergência (inciso VIII) — dispensa por MOTIVO, sem teto de valor.
      hipoteseDispensa: "OUTRAS",
      objeto: "Contratação direta emergencial de manutenção elétrica",
      valorLicitado: "50000.00",
      dataHomologacao: HOMOLOGADO_EM,
      criadoPor: POR,
    });

    await expect(
      homologarProcesso(prisma, {
        processoId, data: new Date("2025-12-10T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/DUAS VERDADES DE HOMOLOGAÇÃO/);
    expect(await prisma.homologacaoProcesso.count()).toBe(0);

    // ═══ SEGUNDO EVENTO no processo homologado por evento ═══
    const outro = await processoHomologado("PROC-EVENTO/2025");
    await expect(
      homologarProcesso(prisma, {
        processoId: outro, data: new Date("2025-12-15T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ FOI HOMOLOGADO/);

    // e por INSERT DIRETO, driblando o serviço: o @unique do banco barra
    await expect(
      prisma.homologacaoProcesso.create({
        data: {
          processoId: outro, data: new Date("2025-12-15T12:00:00Z"),
          criadoPor: "atacante",
        },
      })
    ).rejects.toThrow(/Unique constraint failed/);

    expect(await prisma.homologacaoProcesso.count()).toBe(1);
  });

  // t8
  it("t8: processo SEM homologação (nem cadastro, nem evento) não vira contrato", async () => {
    const { processoId } = await cadastrarProcesso(prisma, {
      numeroProcesso: "PROC-ABERTO/2026",
      modalidade: "CONCORRENCIA",
      objeto: "Reforma da escola municipal do bairro Bodocongó",
      valorLicitado: "500000.00",
      criadoPor: POR,
    });

    await expect(contratoDe(processoId, "CT-X/2026")).rejects.toThrow(
      /PROCESSO NÃO HOMOLOGADO/
    );
    expect(await prisma.contrato.count()).toBe(0);

    // homologa por EVENTO e o mesmo contrato passa — a leitura é UMA (`homologadoEm`)
    await homologarProcesso(prisma, {
      processoId, data: HOMOLOGADO_EM, criadoPor: POR,
    });
    await contratoDe(processoId, "CT-X/2026");
    expect(await prisma.contrato.count()).toBe(1);
  });

  // fail-closed do wiring
  it("t9: empenhar COM contrato sem o M11 ligado às deps FALHA (nunca passa batido)", async () => {
    const processoId = await processoHomologado();
    const contratoId = await contratoDe(processoId);

    // deps SEM o port de contratos — o caminho de quem nunca ouviu falar do M11.
    // (O port agora vive DENTRO do adapter, então "sem M11" é construir o adapter
    // sem ele — não basta omitir um campo de M05Deps.)
    const semM11: M05Deps = criarM05Deps(prisma);

    await expect(
      empenhar(empenhoDe(contratoId, "NE-1", "1000.00"), R_EMPENHO, semM11)
    ).rejects.toThrow(/módulo de contratos \(M11\) não foi ligado/);
    expect(await prisma.empenho.count()).toBe(0);
  });
});
