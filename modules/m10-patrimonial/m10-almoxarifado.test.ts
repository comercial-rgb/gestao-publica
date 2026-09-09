import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { criarM05DepsComAlmoxarifado } from "./adapter-m05-almox.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { anularLiquidacao, liquidar } from "../m05-despesa/servico-bloco2.js";
import { empenhar } from "../m05-despesa/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { balancoPatrimonial } from "../m12-relatorios/balanco-patrimonial.js";
import { cadastrarLinhaDemonstrativo } from "../m12-relatorios/cadastro-linhas.js";
import {
  cadastrarClasseDeMaterial,
  conferirAlmoxarifadoContraRazao,
  estornarMovimentoAlmoxarifado,
  registrarAjusteAlmoxarifado,
  registrarEntradaAlmoxarifado,
  registrarSaidaConsumo,
  saldoDaClasseDeMaterial,
  ELEMENTOS_DE_ALMOXARIFADO,
} from "./almoxarifado.js";
import { exigirElementoOficial } from "../m02-planejamento/dominio.js";
import { cadastrarProvisao, constituirProvisao } from "./provisoes.js";
import { demonstrativoPatrimonialPorClasse } from "./demonstrativo.js";

/**
 * M10 — ALMOXARIFADO (TR 5.85/5.86).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O CICLO DO t1 ═══
 *   LIQUIDAÇÃO ....... 5.000,00   ⚠️ D ESTOQUE / C fornecedor
 *     (o roteiro da liquidação vem por PARÂMETRO — para material de consumo a perna
 *      de débito aponta ao estoque em vez de uma VPD. A despesa NÃO nasce na compra.)
 *   ENTRADA .......... 5.000,00   o FATO e o VÍNCULO — SEM lançamento próprio
 *   SAÍDA (consumo) .. 1.800,00   D VPD consumo / C estoque   ← a despesa nasce AQUI
 *   AJUSTE (falta) ......200,00   D VPD / C estoque
 *
 *   SALDO = 5.000 − 1.800 − 200 = 3.000,00
 *
 *   ⚠️ A AMARRAÇÃO — a conta de estoque (DEVEDORA), pelo razão:
 *     ΣD = 5.000 (a liquidação)                       = 5.000,00
 *     ΣC = 1.800 (consumo) + 200 (falta)              = 2.000,00
 *     saldo devedor = 5.000 − 2.000                   = 3.000,00 ✓
 *   As duas leituras batem — e é isso que prova que a ENTRADA não pode ter roteiro
 *   próprio: com um, o estoque seria debitado DUAS VEZES (10.000).
 *
 *   E a VPD do período = 1.800 + 200 = 2.000,00 (a DVP enxerga o consumo, não a
 *   compra — competência do MCASP).
 *
 * ═══ t6 — O INDICADOR DO ESTOQUE NO ANEXO 14, E A ESCOLHA DECLARADA ═══
 *   Estoque é **P** (permanente). Pelo art. 105, § 1º, o ativo FINANCEIRO são
 *   "créditos e valores realizáveis independentemente de autorização orçamentária e os
 *   valores numerários" — material de almoxarifado não é crédito nem numerário: ele
 *   não se realiza, ele se CONSOME. E pelo § 2º ele é BEM, cuja alienação depende de
 *   autorização legislativa. Consequência (provada no teste): **não se paga fornecedor
 *   com caneta** — o superávit financeiro NÃO conta com o estoque.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "almoxarifado@cg.pb.gov.br";
const FICHA = "ficha-1";
const FONTE = "fnt-500";
const FICHA_39 = "ficha-39";
const FICHA_32 = "ficha-32";

const ESTOQUE = "1.1.5.1.1.00.00"; // estoques — almoxarifado
const FORNECEDOR = "2.1.3.1.1.00.00";
const PROVISAO = "2.2.7.1.1.00.00"; // provisões matemáticas previdenciárias
const VPD_CONSUMO = "3.3.1.1.1.00.00"; // consumo de material
const VPD_PROVISAO = "3.5.1.1.1.00.00";
const VPA_SOBRA = "4.5.9.1.1.00.00"; // ganhos com incorporação (sobra de inventário)
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
/**
 * ⚠️ A PERNA DE DÉBITO DA LIQUIDAÇÃO APONTA AO ESTOQUE — não a uma VPD.
 * O roteiro vem por PARÂMETRO (passo 0: nenhum hardcode no M05).
 */
const R_LIQUIDACAO_MATERIAL = roteiroLiquidacao({
  variacaoDiminutiva: ESTOQUE,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});

const INICIO = new Date("2026-01-01T00:00:00Z");
const CORTE = new Date("2026-12-31T23:59:59Z");

let deps: M05Deps;
let classeId: string;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      // ⚠️ P — ver a nota do t6 no cabeçalho.
      { id: "c-estoque", codigo: ESTOQUE, nome: "Almoxarifado", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-provisao", codigo: PROVISAO, nome: "Provisões matemáticas", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd-consumo", codigo: VPD_CONSUMO, nome: "VPD consumo de material", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpd-prov", codigo: VPD_PROVISAO, nome: "VPD provisões", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa-sobra", codigo: VPA_SOBRA, nome: "VPA ganhos com incorporação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  // ⚠️ AS TRÊS NATUREZAS DO GUARD DO ELEMENTO (as descrições são as do SEED oficial):
  //   30  "Material de Consumo"                                 -> ENTRA no almoxarifado
  //   39  "Outros Serviços de Terceiros - Pessoa Jurídica"      -> NÃO entra (t9)
  //   32  "Material, Bem ou Serviço para Distribuição Gratuita" -> NÃO entra (t10 —
  //       a PENDÊNCIA: tem "Material" E "Serviço" no mesmo nome; entra por DECISÃO)
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
      { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Outros Serviços de Terceiros - PJ" },
      { id: "nd-32", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "32", codigoCompleto: "339032", descricao: "Material para distribuição gratuita" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "500000.00",
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA_39, exercicio: 2026, numero: 2, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-39", fonteId: FONTE, valorDotado: "500000.00",
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA_32, exercicio: 2026, numero: 3, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-32", fonteId: FONTE, valorDotado: "500000.00",
  });

  // OS ROTEIROS — por TABELA. A ENTRADA não tem, e é de propósito.
  await prisma.roteiroAlmoxarifado.createMany({
    data: [
      { tipo: "SAIDA_CONSUMO", contaDebitoId: "c-vpd-consumo", contaCreditoId: "c-estoque", criadoPor: POR },
      { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa-sobra", criadoPor: POR },
      { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-vpd-consumo", contaCreditoId: "c-estoque", criadoPor: POR },
    ],
  });
  await prisma.roteiroProvisao.createMany({
    data: [
      { tipo: "CONSTITUICAO", contaDebitoId: "c-vpd-prov", contaCreditoId: "c-provisao", criadoPor: POR },
      { tipo: "ATUALIZACAO", contaDebitoId: "c-vpd-prov", contaCreditoId: "c-provisao", criadoPor: POR },
      { tipo: "REVERSAO", contaDebitoId: "c-provisao", contaCreditoId: "c-vpa-sobra", criadoPor: POR },
    ],
  });

  const c = await cadastrarClasseDeMaterial(prisma, {
    codigo: "30.01", descricao: "Material de expediente",
    contaContabilId: "c-estoque", criadoPor: POR,
  });
  classeId = c.classeDeMaterialId;
}

/** Empenha e liquida material (a perna de débito da liquidação vai ao ESTOQUE). */
async function liquidarMaterial(
  valor: string,
  n: string,
  fichaId: string = FICHA
): Promise<string> {
  const e = await empenhar(
    {
      fichaId, numero: `NE-${n}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "compra de material", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${n}`, valor,
      data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Almoxarife",
      historico: "material recebido e atestado", criadoPor: POR,
    },
    R_LIQUIDACAO_MATERIAL,
    deps
  );
  return l.liquidacaoId;
}

/** O saldo DEVEDOR da conta de estoque, direto do razão. */
async function estoqueNoRazao(): Promise<number> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { conta: { codigo: ESTOQUE } },
    select: { tipo: true, valor: true },
  });
  return partidas.reduce(
    (acc, p) => (p.tipo === "DEBITO" ? acc + Number(p.valor) : acc - Number(p.valor)),
    0
  );
}

/** A VPD de consumo no razão (a despesa que a DVP enxerga). */
async function vpdConsumoNoRazao(): Promise<number> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { conta: { codigo: VPD_CONSUMO } },
    select: { tipo: true, valor: true },
  });
  return partidas.reduce(
    (acc, p) => (p.tipo === "DEBITO" ? acc + Number(p.valor) : acc - Number(p.valor)),
    0
  );
}

describe("M10 — almoxarifado", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: o ciclo — 5.000 − 1.800 − 200 = 3.000; o razão concorda; a VPD é 2.000", async () => {
    const liq = await liquidarMaterial("5000.00", "1");

    // ⚠️ A LIQUIDAÇÃO JÁ DEBITOU O ESTOQUE — antes de qualquer movimento do M10.
    expect(await estoqueNoRazao()).toBe(5000);
    expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe("0.00");

    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, liquidacaoId: liq, valor: "5000.00",
      dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
    });
    // a ENTRADA não tem lançamento próprio
    const ent = await prisma.movimentoAlmoxarifado.findFirstOrThrow({
      where: { tipo: "ENTRADA" }, select: { lancamentoId: true },
    });
    expect(ent.lancamentoId).toBeNull();
    expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe("5000.00");
    // e o razão NÃO se mexeu (o estoque continua 5.000 — não 10.000)
    expect(await estoqueNoRazao()).toBe(5000);

    await registrarSaidaConsumo(prisma, {
      classeDeMaterialId: classeId, valor: "1800.00",
      dataMovimento: new Date("2026-06-01T12:00:00Z"),
      motivo: "requisições das secretarias", criadoPor: POR,
    });
    await registrarAjusteAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, sentido: "FALTA", valor: "200.00",
      dataMovimento: new Date("2026-12-20T12:00:00Z"),
      motivo: "inventário anual: faltou material não localizado", criadoPor: POR,
    });

    // 5.000 − 1.800 − 200
    expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe("3000.00");

    // ⚠️ A AMARRAÇÃO: ΣD 5.000 − ΣC 2.000 = 3.000
    expect(await estoqueNoRazao()).toBe(3000);
    const conf = await conferirAlmoxarifadoContraRazao(prisma, "c-estoque");
    expect(conf.pelosMovimentos.toFixed(2)).toBe("3000.00");
    expect(conf.peloRazao.toFixed(2)).toBe("3000.00");

    // ⚠️ A DESPESA NASCE NO CONSUMO: VPD = 1.800 + 200 = 2.000 (não 5.000 da compra)
    expect(await vpdConsumoNoRazao()).toBe(2000);

    // e o ledger fecha
    const todas = await prisma.partidaContabil.findMany({ select: { tipo: true, valor: true } });
    const d = todas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => a + Number(p.valor), 0);
    const c = todas.filter((p) => p.tipo === "CREDITO").reduce((a, p) => a + Number(p.valor), 0);
    expect(d).toBe(c);
  });

  // t2
  it("t2: uma liquidação abastece VÁRIAS classes — mas não mais do que ela liquidou", async () => {
    const liq = await liquidarMaterial("5000.00", "1");
    const outra = await cadastrarClasseDeMaterial(prisma, {
      codigo: "30.02", descricao: "Material de limpeza",
      contaContabilId: "c-estoque", criadoPor: POR,
    });

    // 3.000 + 2.000 = 5.000 ✓
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, liquidacaoId: liq, valor: "3000.00",
      dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
    });
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: outra.classeDeMaterialId, liquidacaoId: liq, valor: "2000.00",
      dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
    });
    expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe("3000.00");
    expect(
      (await saldoDaClasseDeMaterial(prisma, outra.classeDeMaterialId)).toFixed(2)
    ).toBe("2000.00");
    // as duas leituras batem: razão 5.000, movimentos 3.000 + 2.000
    await conferirAlmoxarifadoContraRazao(prisma, "c-estoque");

    // ⚠️ UM CENTAVO A MAIS ESTOURA A LIQUIDAÇÃO
    let erro: unknown;
    try {
      await registrarEntradaAlmoxarifado(prisma, {
        classeDeMaterialId: classeId, liquidacaoId: liq, valor: "0.01",
        dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
      });
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> ENTRADA > LIQUIDAÇÃO (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/ENTRADA MAIOR QUE A LIQUIDAÇÃO/);
    expect(msg).toMatch(/5000\.00/);
    expect(msg).toMatch(/mesmo dinheiro/);
  });

  // t3
  it("t3: consumo maior que o estoque é rejeitado; IGUAL passa; +0,01 depois não", async () => {
    const liq = await liquidarMaterial("5000.00", "1");
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, liquidacaoId: liq, valor: "5000.00",
      dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
    });

    await expect(
      registrarSaidaConsumo(prisma, {
        classeDeMaterialId: classeId, valor: "5000.01",
        dataMovimento: new Date("2026-06-01T12:00:00Z"),
        motivo: "consumo além do estoque", criadoPor: POR,
      })
    ).rejects.toThrow(/CONSUMO MAIOR QUE O ESTOQUE/);

    // EXATAMENTE o estoque: passa e zera
    await registrarSaidaConsumo(prisma, {
      classeDeMaterialId: classeId, valor: "5000.00",
      dataMovimento: new Date("2026-06-01T12:00:00Z"),
      motivo: "consumo integral", criadoPor: POR,
    });
    expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe("0.00");

    await expect(
      registrarSaidaConsumo(prisma, {
        classeDeMaterialId: classeId, valor: "0.01",
        dataMovimento: new Date("2026-07-01T12:00:00Z"),
        motivo: "consumir o que não há", criadoPor: POR,
      })
    ).rejects.toThrow(/CONSUMO MAIOR QUE O ESTOQUE/);

    await conferirAlmoxarifadoContraRazao(prisma, "c-estoque");
  });

  // t4
  it("t4: dois consumos concorrentes de 2.000 contra estoque de 3.000 — UM só grava", async () => {
    for (let i = 0; i < 5; i++) {
      await semear();
      const liq = await liquidarMaterial("3000.00", "1");
      await registrarEntradaAlmoxarifado(prisma, {
        classeDeMaterialId: classeId, liquidacaoId: liq, valor: "3000.00",
        dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
      });

      const consumir = (n: string) =>
        registrarSaidaConsumo(prisma, {
          classeDeMaterialId: classeId, valor: "2000.00",
          dataMovimento: new Date("2026-06-01T12:00:00Z"),
          motivo: `requisição ${n}`, criadoPor: POR,
        });

      const r = await Promise.allSettled([consumir("A"), consumir("B")]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(
        String((r.filter((x) => x.status === "rejected")[0] as PromiseRejectedResult).reason)
      ).toMatch(/CONSUMO MAIOR QUE O ESTOQUE/);

      // 3.000 − 2.000 = 1.000, sempre
      expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe("1000.00");
      await conferirAlmoxarifadoContraRazao(prisma, "c-estoque");
    }
  }, 90_000);

  // t6
  it("t6: no Anexo 14 o estoque é ATIVO (P) e a provisão é PASSIVO (P) — o superávit ignora os dois", async () => {
    const liq = await liquidarMaterial("5000.00", "1");
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, liquidacaoId: liq, valor: "5000.00",
      dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
    });

    const { provisaoId } = await cadastrarProvisao(prisma, {
      identificador: "RPPS-2026", descricao: "Provisão matemática previdenciária do RPPS",
      contaContabilId: "c-provisao", criadoPor: POR,
    });
    await constituirProvisao(prisma, {
      provisaoId, valor: "100000.00",
      dataMovimento: new Date("2026-12-31T12:00:00Z"),
      motivo: "cálculo atuarial do exercício de 2026", criadoPor: POR,
    });

    for (const l of [
      { codigoLinha: "AC.ESTOQUE", rotulo: "Estoques", grupo: "ATIVO_CIRCULANTE", ordem: 1, prefixos: ["1.1.5"] },
      { codigoLinha: "PC.FORN", rotulo: "Fornecedores", grupo: "PASSIVO_CIRCULANTE", ordem: 1, prefixos: ["2.1.3"] },
      { codigoLinha: "PNC.PROV", rotulo: "Provisões", grupo: "PASSIVO_NAO_CIRCULANTE", ordem: 1, prefixos: ["2.2"] },
      { codigoLinha: "PL.SOCIAL", rotulo: "Patrimônio Social", grupo: "PATRIMONIO_LIQUIDO", ordem: 1, prefixos: ["2.3"] },
    ] as const) {
      await cadastrarLinhaDemonstrativo(prisma, {
        anexo: "ANEXO_14", ...l, prefixos: [...l.prefixos], criadoPor: POR,
      });
    }

    const b = await balancoPatrimonial(prisma, CORTE);
    const q = b.quadroFinanceiroPermanente;

    // ATIVO = estoque 5.000. PASSIVO = fornecedor 5.000 + provisão 100.000.
    expect(b.totalAtivo).toBe("5000.00");
    expect(b.totalPassivo).toBe("105000.00");
    // PL = VPA 0 − VPD 100.000 (a provisão) = −100.000
    expect(b.totalPatrimonioLiquido).toBe("-100000.00");
    // A1: 5.000 == 105.000 + (−100.000) ✓
    expect(5000).toBe(105000 - 100000);

    // ⚠️ O ESTOQUE É PERMANENTE: não se paga fornecedor com caneta.
    expect(q.ativoPermanente).toBe("5000.00");
    expect(q.ativoFinanceiro).toBe("0.00");
    // ⚠️ A PROVISÃO TAMBÉM (2.2 — exigível a longo prazo).
    expect(q.passivoPermanente).toBe("100000.00");
    expect(q.passivoFinanceiro).toBe("5000.00"); // só o fornecedor
    // superávit = 0 (ativo financeiro) − 5.000 (passivo financeiro)
    expect(q.superavitFinanceiro).toBe("-5000.00");
  });

  // t7
  it("t7: o demonstrativo 5.86 ganha a seção do almoxarifado — literais e amarração", async () => {
    const liq = await liquidarMaterial("5000.00", "1");
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, liquidacaoId: liq, valor: "5000.00",
      dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
    });
    await registrarSaidaConsumo(prisma, {
      classeDeMaterialId: classeId, valor: "1800.00",
      dataMovimento: new Date("2026-06-01T12:00:00Z"),
      motivo: "requisições", criadoPor: POR,
    });
    await registrarAjusteAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, sentido: "FALTA", valor: "200.00",
      dataMovimento: new Date("2026-12-20T12:00:00Z"),
      motivo: "inventário anual: material não localizado", criadoPor: POR,
    });

    const d = await demonstrativoPatrimonialPorClasse(prisma, {
      inicio: INICIO, fim: CORTE,
    });

    expect(d.almoxarifado).toHaveLength(1);
    const a = d.almoxarifado[0]!;
    expect(a.codigo).toBe("30.01");
    expect(a.classificacaoContabil).toBe(ESTOQUE);
    expect(a.saldoAnterior).toBe("0.00");
    expect(a.ingressos).toBe("5000.00"); // a entrada
    expect(a.saidas).toBe("-2000.00"); // consumo 1.800 + falta 200, COM SINAL
    expect(a.saldoFinal).toBe("3000.00");
    // a amarração do relatório: 0 + 5.000 + (−2.000) = 3.000
    expect(0 + 5000 - 2000).toBe(3000);

    // aberto por tipo
    const porTipo = new Map(a.porTipo.map((l) => [l.tipo, l.valor]));
    expect(porTipo.get("ENTRADA")).toBe("5000.00");
    expect(porTipo.get("SAIDA_CONSUMO")).toBe("-1800.00");
    expect(porTipo.get("AJUSTE_SAIDA")).toBe("-200.00");

    expect(d.totalAlmoxarifado.saldoFinal).toBe("3000.00");
  });

  // t8 — O FURO, CURADO (era: 'a amarração VÊ a entrada órfã')
  it('t8: anular a liquidação CASCATEIA — a entrada é estornada na mesma transação', async () => {
    // ⚠️ Agora as deps do M05 têm o  ligado (M10).
    deps = criarM05DepsComAlmoxarifado(prisma);

    const liq = await liquidarMaterial('5000.00', '1');
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, liquidacaoId: liq, valor: '5000.00',
      dataMovimento: new Date('2026-03-01T12:00:00Z'), criadoPor: POR,
    });
    await conferirAlmoxarifadoContraRazao(prisma, 'c-estoque'); // 5.000 = 5.000

    // ═══ A PORTA DO ESTORNO AVULSO AGORA ESTÁ FECHADA ═══
    // (ela ficou ABERTA enquanto a cascata não existia — ver o MODULO.md)
    const entrada = await prisma.movimentoAlmoxarifado.findFirstOrThrow({
      where: { tipo: 'ENTRADA' }, select: { id: true },
    });
    let porta: unknown;
    try {
      await estornarMovimentoAlmoxarifado(prisma, {
        movimentoId: entrada.id,
        dataMovimento: new Date('2026-04-01T12:00:00Z'),
        motivo: 'tentando estornar a entrada por fora da liquidação',
        criadoPor: POR,
      });
    } catch (e) {
      porta = e;
    }
    console.log("\n>>> PORTA FECHADA (esperado):\n" + String(porta) + "\n");
    expect(String(porta)).toMatch(/PORTA FECHADA/);
    expect(String(porta)).toMatch(/ANULE A LIQUIDAÇÃO/);

    // ═══ ANULAR A LIQUIDAÇÃO: a entrada cai JUNTO, na mesma transação ═══
    await anularLiquidacao(
      {
        liquidacaoId: liq, numero: 'NL-1-ANUL',
        data: new Date('2026-04-01T12:00:00Z'),
        historico: 'material devolvido ao fornecedor', criadoPor: POR,
      },
      deps
    );

    // razão e movimentos voltaram JUNTOS a zero — a amarração fecha
    expect(await estoqueNoRazao()).toBe(0);
    expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe('0.00');
    expect(
      await prisma.movimentoAlmoxarifado.count({ where: { tipo: 'ESTORNO_ENTRADA' } })
    ).toBe(1);
    const conf = await conferirAlmoxarifadoContraRazao(prisma, 'c-estoque');
    expect(conf.pelosMovimentos.toFixed(2)).toBe('0.00');
    expect(conf.peloRazao.toFixed(2)).toBe('0.00');
  });

  // t8b — FAIL-CLOSED: o material já consumido não deixa a liquidação ser anulada
  it('t8b: anular a liquidação com o material JÁ CONSUMIDO é rejeitado (nada acontece)', async () => {
    deps = criarM05DepsComAlmoxarifado(prisma);

    const liq = await liquidarMaterial('5000.00', '1');
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classeId, liquidacaoId: liq, valor: '5000.00',
      dataMovimento: new Date('2026-03-01T12:00:00Z'), criadoPor: POR,
    });
    await registrarSaidaConsumo(prisma, {
      classeDeMaterialId: classeId, valor: '5000.00',
      dataMovimento: new Date('2026-06-01T12:00:00Z'),
      motivo: 'consumo integral', criadoPor: POR,
    });

    let erro: unknown;
    try {
      await anularLiquidacao(
        {
          liquidacaoId: liq, numero: 'NL-1-ANUL',
          data: new Date('2026-07-01T12:00:00Z'),
          historico: 'devolvendo material que já foi usado', criadoPor: POR,
        },
        deps
      );
    } catch (e) {
      erro = e;
    }
    console.log("\n>>> ESTOQUE NEGATIVO (esperado):\n" + String(erro) + "\n");
    expect(String(erro)).toMatch(/DEIXARIA O ESTOQUE NEGATIVO/);
    expect(String(erro)).toMatch(/JÁ FOI CONSUMIDO/);

    // ⚠️ NADA ACONTECEU: a liquidação segue viva, o estoque segue zerado pelo consumo.
    expect(await prisma.liquidacao.count({ where: { estornoDeId: { not: null } } })).toBe(0);
    expect(
      await prisma.movimentoAlmoxarifado.count({ where: { tipo: 'ESTORNO_ENTRADA' } })
    ).toBe(0);
    await conferirAlmoxarifadoContraRazao(prisma, 'c-estoque');
  });
});

describe("M10 — o guard do ELEMENTO (TR 5.85)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t9
  it("t9: liquidação de SERVIÇO (elemento 39) não entra no almoxarifado", async () => {
    const liq = await liquidarMaterial("5000.00", "1", FICHA_39);

    await expect(
      registrarEntradaAlmoxarifado(prisma, {
        classeDeMaterialId: classeId, liquidacaoId: liq, valor: "5000.00",
        dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(
      /elemento 39 \("Outros Serviços de Terceiros - Pessoa Jurídica"\)/
    );
    // ...e a mensagem mostra o rol vigente, para quem for corrigir
    await expect(
      registrarEntradaAlmoxarifado(prisma, {
        classeDeMaterialId: classeId, liquidacaoId: liq, valor: "5000.00",
        dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/rol vigente é \{30\}/);

    // ⚠️ SELECT prova: ZERO movimento. Uma consultoria de 5.000 NÃO virou estoque.
    expect(await prisma.movimentoAlmoxarifado.count()).toBe(0);
    expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe("0.00");
  });

  // t10 — A PENDÊNCIA, TESTADA
  it("t10: elemento 32 é RECUSADO — e a mensagem aponta DECISÃO, não bug", async () => {
    const liq = await liquidarMaterial("5000.00", "1", FICHA_32);

    // ⚠️ "Material, Bem ou Serviço para Distribuição Gratuita" tem MATERIAL e SERVIÇO no
    // mesmo nome. Parte dele é estoque (a cesta básica que espera no depósito), parte
    // não é (o serviço prestado direto). Qual parte? O rol não diz, e o código não
    // infere — o precedente é o dos benefícios assistenciais em ca052dc.
    await expect(
      registrarEntradaAlmoxarifado(prisma, {
        classeDeMaterialId: classeId, liquidacaoId: liq, valor: "5000.00",
        dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/elemento 32/);

    await expect(
      registrarEntradaAlmoxarifado(prisma, {
        classeDeMaterialId: classeId, liquidacaoId: liq, valor: "5000.00",
        dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/é uma DECISÃO do ente — e ela entra no rol, não neste erro/);

    expect(await prisma.movimentoAlmoxarifado.count()).toBe(0);
  });

  // o rol, direto
  it("ELEMENTOS_DE_ALMOXARIFADO é fechado: só o 30", () => {
    expect(Object.keys(ELEMENTOS_DE_ALMOXARIFADO)).toEqual(["30"]);
    // e o rol oficial responde por ele (o M02 é o dono da classificação)
    expect(exigirElementoOficial("30").nome).toBe("Material de Consumo");
    expect(() => exigirElementoOficial("00")).toThrow(/não existe no rol oficial/);
  });
});
