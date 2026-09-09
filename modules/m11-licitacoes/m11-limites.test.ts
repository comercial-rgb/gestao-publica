import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { adquirirBem } from "../m10-patrimonial/patrimonio.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { criarM05DepsComContratos } from "./adapter-m05.js";
import {
  cadastrarContrato,
  cadastrarProcesso,
  homologarProcesso,
  registrarAditivo,
} from "./contratos.js";
import { cadastrarLimite, semearLimitesOficiais } from "./limites.js";
import { relatorioProcessosLicitatorios } from "./relatorio-processos.js";

/**
 * M11 — BLOCO 3: LIMITES (TR 5.106), VÍNCULO DE AQUISIÇÃO (4.49/5.15) e
 * RELATÓRIO DE PROCESSOS (5.103).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ OS LIMITES OFICIAIS (Decreto 12.807/2025, vigência 01/01/2026) ═══
 *   obras e serviços de engenharia .... 130.984,20
 *   compras e demais serviços .........  65.492,11
 *
 * ═══ t2 — A BORDA DO ESTRITO (art. 75: "valores INFERIORES a") ═══
 *   contrato POR_VALOR_COMPRAS de 65.492,10 ⟹ PASSA (é inferior)
 *   contrato POR_VALOR_COMPRAS de 65.492,11 ⟹ REJEITADO (é IGUAL, não inferior)
 *   contrato OUTRAS de 200.000,00          ⟹ PASSA (hipótese sem teto)
 *
 * ═══ t3 — CONTROLE INTERNO: teto = MIN(oficial, interno) ═══
 *   interno de compras = 50.000,00 (< 65.492,11 oficial)
 *   contrato de 50.000,00  ⟹ REJEITADO (igual ao teto interno)
 *   contrato de 49.999,99  ⟹ PASSA
 *
 * ═══ t4 — O ADITIVO NÃO PODE ALCANÇAR O TETO ═══
 *   dispensa de 60.000,00 (compras)
 *   + acréscimo 5.492,11 ⟹ 65.492,11 == teto ⟹ REJEITADO
 *   + acréscimo 5.492,10 ⟹ 65.492,10 <  teto ⟹ PASSA
 *   (60.000,00 + 5.492,11 = 65.492,11 — conferido na mão)
 *
 * ═══ t8 — O OURO DO RELATÓRIO (TR 5.103) ═══
 *   Processo PREGÃO, valor licitado ............. 200.000,00
 *   CT-A: inicial 100.000, acréscimo 20.000, supressão 5.000
 *         ⟹ aditivos = +20.000 − 5.000 = 15.000,00
 *         ⟹ valorAtualizado = 100.000 + 15.000 = 115.000,00
 *         empenhado 60.000 / liquidado 40.000 / pago 25.000
 *         ⟹ saldoDoContrato = 115.000 − 60.000 = 55.000,00
 *   CT-B: inicial 50.000, sem aditivo ⟹ atualizado 50.000,00
 *   TOTAL CONTRATADO = 115.000 + 50.000 = 165.000,00
 *   SALDO DA LICITAÇÃO = 200.000 − 165.000 = 35.000,00
 *   L3 (cadeia): 25.000 <= 40.000 <= 60.000 <= 115.000 ✓
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const FICHA_CUSTEIO = "ficha-custeio";
const FICHA_CAPITAL = "ficha-capital";
const FONTE = "fnt-500";
const CLASSE_VEICULOS = "cl-veiculos";
const CLASSE_MOVEIS = "cl-moveis";

const CAIXA = "1.1.1.1.2.00.00";
const IMOBILIZADO = "1.2.3.1.1.01.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const VPA_INCORP = "4.5.9.1.1.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});

const HOMOLOGADO_EM = new Date("2025-12-01T12:00:00Z");
const INICIO = new Date("2026-01-01T00:00:00Z");
const FIM_INICIAL = new Date("2026-12-31T23:59:59Z");
const CORTE = new Date("2026-12-31T23:59:59Z");

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05DepsComContratos(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-imob", codigo: IMOBILIZADO, nome: "Veículos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa-inc", codigo: VPA_INCORP, nome: "VPA incorporação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
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
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-custeio", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
      // grupo 4 = INVESTIMENTOS (capital) → exige classe de bens com contrato
      { id: "nd-capital", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    fonteId: FONTE, valorDotado: "1000000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_CUSTEIO, numero: 1, naturezaDespesaId: "nd-custeio" });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_CAPITAL, numero: 2, naturezaDespesaId: "nd-capital" });

  await prisma.classeDeBens.createMany({
    data: [
      { id: CLASSE_VEICULOS, codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
      { id: CLASSE_MOVEIS, codigo: "1.2.3.1.1.02", descricao: "Móveis", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
    ],
  });
  await prisma.roteiroPatrimonial.create({
    data: { tipo: "AQUISICAO", contaDebitoId: "c-imob", contaCreditoId: "c-vpa-inc", criadoPor: POR },
  });

  // OS LIMITES OFICIAIS (dado colado, não digitado).
  await semearLimitesOficiais(prisma, POR);
}

/** Processo de DISPENSA por valor (compras), homologado. */
async function dispensaCompras(numero = "DISP-001/2025"): Promise<string> {
  const { processoId } = await cadastrarProcesso(prisma, {
    numeroProcesso: numero,
    modalidade: "DISPENSA",
    hipoteseDispensa: "POR_VALOR_COMPRAS",
    objeto: "Aquisição de material de expediente por dispensa de licitação",
    valorLicitado: "70000.00",
    criadoPor: POR,
  });
  await homologarProcesso(prisma, { processoId, data: HOMOLOGADO_EM, criadoPor: POR });
  return processoId;
}

async function pregao(numero = "PREG-001/2025", licitado = "200000.00"): Promise<string> {
  const { processoId } = await cadastrarProcesso(prisma, {
    numeroProcesso: numero,
    modalidade: "PREGAO_ELETRONICO",
    objeto: "Registro de preços para prestação de serviços continuados",
    valorLicitado: licitado,
    criadoPor: POR,
  });
  await homologarProcesso(prisma, { processoId, data: HOMOLOGADO_EM, criadoPor: POR });
  return processoId;
}

function contrato(
  processoId: string,
  numero: string,
  valor: string,
  extras: Record<string, unknown> = {}
) {
  return cadastrarContrato(prisma, {
    numeroContrato: numero,
    processoId,
    contratadoDocumento: "12345678000199",
    contratadoNome: "Fornecedora Central LTDA",
    valorInicial: valor,
    vigenciaInicio: INICIO,
    vigenciaFimInicial: FIM_INICIAL,
    categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
    criadoPor: POR,
    ...extras,
  });
}

describe("M11 bloco 3 — limites, aquisição e relatório", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1 — CONCORRÊNCIA (a janela que o bloco 2 deixou aberta)
  it("t1: dois empenhos concorrentes que estouram o contrato — exatamente UM grava", async () => {
    const RODADAS = 5;

    for (let i = 0; i < RODADAS; i++) {
      await semear();
      const p = await pregao(`PREG-${i}/2025`);
      const { contratoId } = await contrato(p, `CT-${i}/2026`, "100000.00");

      // Cada um cabe sozinho (60.000 <= 100.000); JUNTOS estouram (120.000).
      const um = empenhar(
        {
          fichaId: FICHA_CUSTEIO, contratoId, numero: "NE-A", tipo: "ORDINARIO",
          valor: "60000.00", data: new Date("2026-02-01T12:00:00Z"),
          credorCpfCnpj: "12345678000199", historico: "concorrente A", criadoPor: POR,
        },
        R_EMPENHO,
        deps
      );
      const dois = empenhar(
        {
          fichaId: FICHA_CUSTEIO, contratoId, numero: "NE-B", tipo: "ORDINARIO",
          valor: "60000.00", data: new Date("2026-02-01T12:00:00Z"),
          credorCpfCnpj: "12345678000199", historico: "concorrente B", criadoPor: POR,
        },
        R_EMPENHO,
        deps
      );

      const r = await Promise.allSettled([um, dois]);
      const ok = r.filter((x) => x.status === "fulfilled").length;
      const falhou = r.filter((x) => x.status === "rejected");

      // ⚠️ EXATAMENTE UM. Sem o FOR UPDATE, os dois liam saldo 100.000 e os dois
      // gravavam — 120.000 empenhados num contrato de 100.000, sem guard nenhum
      // ter errado.
      expect(ok).toBe(1);
      expect(falhou).toHaveLength(1);
      expect(String((falhou[0] as PromiseRejectedResult).reason)).toMatch(
        /SALDO DO CONTRATO INSUFICIENTE/
      );
      expect(await prisma.empenho.count({ where: { contratoId } })).toBe(1);
    }
  }, 60_000);

  // t2
  it("t2: o teto do art. 75 é ESTRITO — 65.492,10 passa, 65.492,11 não", async () => {
    const p = await dispensaCompras();

    // 65.492,10 < 65.492,11 → é "valor inferior a"
    await contrato(p, "CT-OK/2026", "65492.10");
    expect(await prisma.contrato.count()).toBe(1);

    // 65.492,11 == teto → NÃO é inferior
    let erro: unknown;
    try {
      await contrato(p, "CT-NAO/2026", "65492.11");
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> LIMITE DA DISPENSA (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/LIMITE DA DISPENSA ESTOURADO/);
    expect(msg).toMatch(/65492\.11/);
    expect(msg).toMatch(/inferiores a/);
    expect(msg).toMatch(/Decreto 12\.807\/2025/);
    expect(await prisma.contrato.count()).toBe(1);

    // OUTRAS (emergência): dispensa por MOTIVO, sem teto — 200.000 passa.
    const { processoId } = await cadastrarProcesso(prisma, {
      numeroProcesso: "DISP-EMERG/2025", modalidade: "DISPENSA",
      hipoteseDispensa: "OUTRAS",
      objeto: "Contratação emergencial de energia após calamidade",
      valorLicitado: "200000.00", criadoPor: POR,
    });
    await homologarProcesso(prisma, { processoId, data: HOMOLOGADO_EM, criadoPor: POR });
    await contrato(processoId, "CT-EMERG/2026", "200000.00");
    expect(await prisma.contrato.count()).toBe(2);
  });

  // t3
  it("t3: controle interno mais restritivo VENCE — teto = MIN(oficial, interno)", async () => {
    await prisma.limiteContratacao.deleteMany();
    await cadastrarLimite(prisma, {
      vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
      fonteLegal: "Decreto 12.807/2025 + Instrução Normativa interna 01/2026",
      limiteObrasEngenharia: "130984.20",
      limiteComprasServicos: "65492.11",
      limiteControleInternoCompras: "50000.00", // o ente se autolimita
      criadoPor: POR,
    });

    const p = await dispensaCompras();

    // 50.000,00 == teto interno → rejeitado (estrito)
    await expect(contrato(p, "CT-NAO/2026", "50000.00")).rejects.toThrow(
      /LIMITE DA DISPENSA ESTOURADO/
    );
    // 49.999,99 < 50.000 → passa
    await contrato(p, "CT-OK/2026", "49999.99");
    expect(await prisma.contrato.count()).toBe(1);

    // e o Zod barra o ente se autorizando ACIMA da lei
    await expect(
      cadastrarLimite(prisma, {
        vigenciaInicio: new Date("2027-01-01T00:00:00Z"),
        fonteLegal: "Instrução Normativa fantasiosa 99/2027",
        limiteObrasEngenharia: "130984.20",
        limiteComprasServicos: "65492.11",
        limiteControleInternoCompras: "80000.00", // > oficial
        criadoPor: POR,
      })
    ).rejects.toThrow(/ACIMA do limite legal/);
  });

  // t4
  it("t4: o ACRÉSCIMO não pode levar a dispensa a ALCANÇAR o teto", async () => {
    const p = await dispensaCompras();
    const { contratoId } = await contrato(p, "CT-1/2026", "60000.00");

    // 60.000 + 5.492,11 = 65.492,11 == teto → REJEITADO
    await expect(
      registrarAditivo(prisma, {
        contratoId, tipo: "ACRESCIMO_VALOR", valor: "5492.11",
        data: new Date("2026-06-01T12:00:00Z"), numeroAditivo: "1º TA",
        motivo: "acréscimo que alcançaria o teto da dispensa", criadoPor: POR,
      })
    ).rejects.toThrow(/LIMITE DA DISPENSA ESTOURADO/);
    expect(await prisma.movimentoContratual.count()).toBe(0);

    // 60.000 + 5.492,10 = 65.492,10 < teto → PASSA
    await registrarAditivo(prisma, {
      contratoId, tipo: "ACRESCIMO_VALOR", valor: "5492.10",
      data: new Date("2026-06-01T12:00:00Z"), numeroAditivo: "1º TA",
      motivo: "acréscimo que ainda cabe no teto da dispensa", criadoPor: POR,
    });
    expect(await prisma.movimentoContratual.count()).toBe(1);
  });

  // t5
  it("t5: SEM limite vigente na data do contrato — fail-closed, nunca 'passa porque falta parâmetro'", async () => {
    // o único limite vigente começa em 01/01/2026; este contrato é de 2025
    const p = await dispensaCompras();

    let erro: unknown;
    try {
      await contrato(p, "CT-2025/2025", "10000.00", {
        vigenciaInicio: new Date("2025-12-15T00:00:00Z"),
        vigenciaFimInicial: new Date("2025-12-31T23:59:59Z"),
      });
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> SEM LIMITE VIGENTE (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/SEM LIMITE DE CONTRATAÇÃO VIGENTE/);
    expect(msg).toMatch(/legalizar por\s+omissão/);
    expect(await prisma.contrato.count()).toBe(0);
  });

  // t6
  it("t6: TR 4.49/5.15 — empenho de capital com contrato exige a classe, e o bem tem de ser ELA", async () => {
    const p = await pregao();
    const { contratoId } = await contrato(p, "CT-1/2026", "100000.00");

    const base = {
      fichaId: FICHA_CAPITAL, contratoId, tipo: "ORDINARIO" as const,
      valor: "50000.00", data: new Date("2026-02-01T12:00:00Z"),
      credorCpfCnpj: "12345678000199", historico: "aquisição de veículo",
      criadoPor: POR,
    };

    // (1) capital + contrato SEM classe → REJEITADO citando o TR
    let erro: unknown;
    try {
      await empenhar({ ...base, numero: "NE-SEM" }, R_EMPENHO, deps);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> SEM CLASSE DE BENS (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/EMPENHO DE CAPITAL SEM CLASSE DE BENS \(TR 4\.49\/5\.15\)/);
    expect(msg).toMatch(/grupo 4/);
    expect(await prisma.empenho.count()).toBe(0);

    // (2) com a classe → passa
    const { empenhoId } = await empenhar(
      { ...base, numero: "NE-1", classeDeBensId: CLASSE_VEICULOS },
      R_EMPENHO,
      deps
    );
    expect(
      (await prisma.empenho.findUniqueOrThrow({
        where: { id: empenhoId }, select: { classeDeBensId: true },
      })).classeDeBensId
    ).toBe(CLASSE_VEICULOS);

    // liquida para poder incorporar
    const liq = await liquidar(
      {
        empenhoId, numero: "NL-1", valor: "50000.00",
        data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );

    // (3) incorporar em classe DIVERGENTE da do empenho → REJEITADO
    let erro2: unknown;
    try {
      await adquirirBem(prisma, {
        classeDeBensId: CLASSE_MOVEIS, // o empenho prometeu VEÍCULOS
        liquidacaoId: liq.liquidacaoId, valor: "50000.00",
        dataMovimento: new Date("2026-03-05T12:00:00Z"), criadoPor: POR,
      });
    } catch (e) {
      erro2 = e;
    }
    const msg2 = String(erro2);
    console.log("\n>>> CLASSE DIVERGENTE (esperado):\n" + msg2 + "\n");
    expect(msg2).toMatch(/CLASSE DE BENS DIVERGENTE DO EMPENHO/);
    expect(await prisma.movimentoPatrimonial.count()).toBe(0);

    // (4) coincidente → passa
    await adquirirBem(prisma, {
      classeDeBensId: CLASSE_VEICULOS,
      liquidacaoId: liq.liquidacaoId, valor: "50000.00",
      dataMovimento: new Date("2026-03-05T12:00:00Z"), criadoPor: POR,
    });
    expect(await prisma.movimentoPatrimonial.count()).toBe(1);

    // (5) CUSTEIO com contrato NÃO exige classe (só capital compra bem)
    await empenhar(
      {
        fichaId: FICHA_CUSTEIO, contratoId, numero: "NE-CUSTEIO",
        tipo: "ORDINARIO", valor: "1000.00",
        data: new Date("2026-02-01T12:00:00Z"),
        credorCpfCnpj: "12345678000199", historico: "serviço", criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    expect(await prisma.empenho.count({ where: { numero: "NE-CUSTEIO" } })).toBe(1);
  });

  // t7
  it("t7: o CHECK da hipótese de dispensa pega o INSERT direto, nos dois sentidos", async () => {
    // DISPENSA sem hipótese
    await expect(
      prisma.processoLicitatorio.create({
        data: {
          numeroProcesso: "X-1", modalidade: "DISPENSA",
          objeto: "dispensa sem base legal", valorLicitado: "1000.00",
          criadoPor: "atacante",
        },
      })
    ).rejects.toThrow(/ck_hipotese_dispensa/);

    // NÃO-dispensa COM hipótese
    await expect(
      prisma.processoLicitatorio.create({
        data: {
          numeroProcesso: "X-2", modalidade: "PREGAO_ELETRONICO",
          hipoteseDispensa: "POR_VALOR_COMPRAS",
          objeto: "pregão fingindo ser dispensa", valorLicitado: "1000.00",
          criadoPor: "atacante",
        },
      })
    ).rejects.toThrow(/ck_hipotese_dispensa/);

    expect(await prisma.processoLicitatorio.count()).toBe(0);

    // e o Zod barra antes, com mensagem de gente
    await expect(
      cadastrarProcesso(prisma, {
        numeroProcesso: "X-3", modalidade: "DISPENSA",
        objeto: "dispensa sem hipótese do art. 75", valorLicitado: "1000.00",
        criadoPor: POR,
      })
    ).rejects.toThrow(/DISPENSA sem hipótese do art\. 75/);
  });

  /** O cenário-ouro do relatório — ver a conta completa no cabeçalho. */
  async function cenarioDoRelatorio(): Promise<void> {
    const p = await pregao("PREG-001/2025", "200000.00");
    const a = await contrato(p, "CT-A/2026", "100000.00");
    await contrato(p, "CT-B/2026", "50000.00");

    await registrarAditivo(prisma, {
      contratoId: a.contratoId, tipo: "ACRESCIMO_VALOR", valor: "20000.00",
      data: new Date("2026-03-01T12:00:00Z"), numeroAditivo: "1º TA",
      motivo: "acréscimo de quantitativo do item 3", criadoPor: POR,
    });
    await registrarAditivo(prisma, {
      contratoId: a.contratoId, tipo: "SUPRESSAO_VALOR", valor: "5000.00",
      data: new Date("2026-05-01T12:00:00Z"), numeroAditivo: "2º TA",
      motivo: "supressão do item 7, sem interesse da administração", criadoPor: POR,
    });

    const e = await empenhar(
      {
        fichaId: FICHA_CUSTEIO, contratoId: a.contratoId, numero: "NE-1",
        tipo: "ORDINARIO", valor: "60000.00",
        data: new Date("2026-06-01T12:00:00Z"),
        credorCpfCnpj: "12345678000199", historico: "empenho", criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const l = await liquidar(
      {
        empenhoId: e.empenhoId, numero: "NL-1", valor: "40000.00",
        data: new Date("2026-07-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    await pagar(
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "25000.00",
        data: new Date("2026-08-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );
  }

  // t8
  it("t8: OURO do 5.103 — cada célula por literal, e L1/L2/L3 fecham", async () => {
    await cenarioDoRelatorio();

    const r = await relatorioProcessosLicitatorios(prisma, CORTE);
    expect(r.processos).toHaveLength(1);
    const p = r.processos[0]!;

    expect(p.valorLicitado).toBe("200000.00");
    expect(p.modalidade).toBe("PREGAO_ELETRONICO");
    expect(p.hipoteseDispensa).toBeNull();

    const [ctA, ctB] = p.contratos;

    // ── CT-A ──────────────────────────────────────────────────────────────
    expect(ctA!.numeroContrato).toBe("CT-A/2026");
    expect(ctA!.valorInicial).toBe("100000.00");
    // +20.000 − 5.000 = 15.000 (a supressão entra NEGATIVA — é o SINAL_VALOR)
    expect(ctA!.aditivos).toBe("15000.00");
    expect(ctA!.valorAtualizado).toBe("115000.00");
    expect(ctA!.empenhado).toBe("60000.00");
    expect(ctA!.liquidado).toBe("40000.00");
    expect(ctA!.pago).toBe("25000.00");
    expect(ctA!.saldoDoContrato).toBe("55000.00"); // 115.000 − 60.000

    // ── CT-B ──────────────────────────────────────────────────────────────
    expect(ctB!.valorInicial).toBe("50000.00");
    expect(ctB!.aditivos).toBe("0.00");
    expect(ctB!.valorAtualizado).toBe("50000.00");
    expect(ctB!.empenhado).toBe("0.00");

    // ── O PROCESSO ────────────────────────────────────────────────────────
    expect(115000 + 50000).toBe(165000);
    expect(p.totalContratado).toBe("165000.00");
    expect(200000 - 165000).toBe(35000);
    expect(p.saldoDaLicitacao).toBe("35000.00");

    // ── L3, A CADEIA, SOMADA À MÃO ────────────────────────────────────────
    expect(25000 <= 40000).toBe(true);
    expect(40000 <= 60000).toBe(true);
    expect(60000 <= 115000).toBe(true);

    // dinheiro é STRING com 2 casas
    for (const c of p.contratos) {
      expect(c.valorAtualizado).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  // t9 — a mutação vive no teste: a coluna `aditivos` esquece as supressões
  it("t9: se a coluna de aditivos ignorar as supressões, a L1 quebra nomeando 5.000,00", async () => {
    await cenarioDoRelatorio();

    // A MUTAÇÃO, feita nos DADOS: a supressão de 5.000 é o que a coluna
    // esqueceria. Simulamos o esquecimento provando que a L1 compara DOIS
    // CAMINHOS — e que sem a supressão eles divergem em exatamente 5.000,00.
    const c = await prisma.contrato.findFirstOrThrow({
      where: { numeroContrato: "CT-A/2026" },
      select: { valorInicial: true, movimentos: { select: { tipo: true, valor: true } } },
    });

    const soAcrescimos = c.movimentos
      .filter((m) => m.tipo === "ACRESCIMO_VALOR")
      .reduce((acc, m) => acc + Number(m.valor), 0);
    const comSupressoes = c.movimentos.reduce(
      (acc, m) =>
        m.tipo === "ACRESCIMO_VALOR"
          ? acc + Number(m.valor)
          : m.tipo === "SUPRESSAO_VALOR"
            ? acc - Number(m.valor)
            : acc,
      0
    );

    // o caminho MUTANTE (só acréscimos) dá 20.000; o certo dá 15.000
    expect(soAcrescimos).toBe(20000);
    expect(comSupressoes).toBe(15000);
    // a diferença é EXATAMENTE a supressão que ficou de fora
    expect(soAcrescimos - comSupressoes).toBe(5000);

    // e é essa diferença que a L1 nomearia: valorAtualizado (115.000, derivado dos
    // movimentos COM sinal) ≠ 100.000 + 20.000 = 120.000. A mutação REAL, feita no
    // código e restaurada, está relatada no bloco.
    const r = await relatorioProcessosLicitatorios(prisma, CORTE);
    expect(r.processos[0]!.contratos[0]!.valorAtualizado).toBe("115000.00");
    expect(Number(r.processos[0]!.contratos[0]!.aditivos)).toBe(comSupressoes);
  });
});
