import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { roteiroArrecadacao, roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { anexo1 } from "./rreo-anexo1.js";
import { anexo3 } from "./rreo-anexo3.js";
import { anexo6 } from "./rreo-anexo6.js";
import { anexo6AbaixoDaLinha } from "./rreo-anexo6-abaixo.js";
import { anexo7 } from "./rreo-anexo7.js";
import { anexo8 } from "./rreo-anexo8.js";
import { anexo11 } from "./rreo-anexo11.js";
import { anexo12 } from "./rreo-anexo12.js";
import { rreoAnexo14 } from "./rreo-anexo14.js";

/**
 * RREO — ANEXO 14: DEMONSTRATIVO SIMPLIFICADO. Teste de IDENTIDADE: cada bloco == o campo do anexo
 * analítico dono. Um fixture MÍNIMO basta — os campos são distinguíveis (o % aplicado ≠ o limite),
 * então ler o campo errado cai aqui mesmo com valores modestos.
 *
 * ═══ O CENÁRIO (2026, bimestre 1) ═══ IPTU corrente 800.000, despesa paga 200.000.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const R_ARR = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });
const R_EMP = roteiroEmpenho();
const R_LIQ = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_PAG = roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: "1.1.1.1.1.00.00" });

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  deps = criarM05Deps(prisma);

  await prisma.orgao.create({ data: { id: "org", codigo: "02", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo", codigo: "02001", descricao: "Adm", orgaoId: "org" } });
  await prisma.funcao.create({ data: { id: "fun", codigo: "04", nome: "Adm" } });
  await prisma.subfuncao.create({ data: { id: "sub", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: "11130111", descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Mov", fonteId: "fnt-500" } });
  for (const ano of [2025, 2026]) await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "T" } });

  await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: "fnt-500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "1000000.00" } });
  await criarFichaDeTeste(prisma, { id: "f1", exercicio: 2026, numero: 1, orgaoId: "org", unidadeOrcId: "uo", funcaoId: "fun", subfuncaoId: "sub", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "500000.00" });
}

async function cenario(): Promise<void> {
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: "11130111", fonte: "500", valor: "800000.00", dataArrecadacao: new Date("2026-01-10T12:00:00Z"), numeroReceita: "IPTU-1", criadoPor: POR },
    R_ARR, criarM04Deps(prisma)
  );
  const e = await empenhar({ fichaId: "f1", numero: "NE-1", tipo: "ORDINARIO", valor: "300000.00", data: new Date("2026-01-15T12:00:00Z"), credorCpfCnpj: "12345678000199", historico: "s", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, R_EMP, deps);
  const l = await liquidar({ empenhoId: e.empenhoId, numero: "NL-1", valor: "250000.00", data: new Date("2026-01-20T12:00:00Z"), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQ, deps);
  await pagar({ liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "200000.00", data: new Date("2026-02-10T12:00:00Z"), contaBancaria: "CC-001", fonteId: "fnt-500", historico: "p", criadoPor: POR }, R_PAG, deps);
}

const bloco = (a14: Awaited<ReturnType<typeof rreoAnexo14>>, chave: string) => a14.linhas.find((l) => l.chave === chave)!;

describe("M12 — RREO Anexo 14 (Demonstrativo Simplificado)", () => {
  beforeEach(async () => {
    await semear();
    await cenario();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 (identidade): balanço orçamentário == os campos do RREO Anexo 1", async () => {
    const a14 = await rreoAnexo14(prisma, { exercicio: 2026, bimestre: 1 });
    const a1 = await anexo1(prisma, { exercicio: 2026, bimestre: 1 });

    expect(bloco(a14, "REC_PREVISTA").valor).toBe(a1.subtotalReceitas.previsaoAtualizada);
    expect(bloco(a14, "REC_REALIZADA").valor).toBe(a1.subtotalReceitas.ateBimestre);
    expect(bloco(a14, "DESP_DOTACAO").valor).toBe(a1.subtotalDespesas.dotacaoAtualizada);
    expect(bloco(a14, "DESP_EMPENHADA").valor).toBe(a1.subtotalDespesas.empenhadasAte);
    expect(bloco(a14, "DESP_LIQUIDADA").valor).toBe(a1.subtotalDespesas.liquidadasAte);
    expect(bloco(a14, "DESP_PAGA").valor).toBe(a1.subtotalDespesas.pagasAte);
  });

  it("t2 (identidade + o furo do XXV): primário do acima, nominal do abaixo", async () => {
    const a14 = await rreoAnexo14(prisma, { exercicio: 2026, bimestre: 1 });
    const a6 = await anexo6(prisma, { exercicio: 2026, bimestre: 1 });
    const a6b = await anexo6AbaixoDaLinha(prisma, { exercicio: 2026, bimestre: 1 });

    // Primário concreto do acima (XXIV); nominal concreto do abaixo (variação da DCL).
    expect(bloco(a14, "RESULTADO_PRIMARIO").valor).toBe(a6.resultadoPrimario);
    expect(bloco(a14, "RESULTADO_NOMINAL").valor).toBe(a6b.resultadoNominal);
    // O acima é null (XXVII) — o simplificado NÃO o usa, e declara o furo na nota.
    expect(a6.resultadoNominal).toBeNull();
    expect(a14.notas.some((n) => n.startsWith("RESULTADO-NOMINAL-XXVII-NULL"))).toBe(true);
  });

  it("t3 (identidade): RP (← Anexo 7), educação (← 8), saúde (← 12), alienação (← 11), RCL (← 3)", async () => {
    const a14 = await rreoAnexo14(prisma, { exercicio: 2026, bimestre: 1 });
    const [a7, a8, a12, a11, a3] = await Promise.all([
      anexo7(prisma, { exercicio: 2026 }),
      anexo8(prisma, { exercicio: 2026, bimestre: 1 }),
      anexo12(prisma, { exercicio: 2026, bimestre: 1 }),
      anexo11(prisma, { exercicio: 2026, bimestre: 1 }),
      anexo3(prisma, { exercicio: 2026, bimestre: 1 }),
    ]);

    expect(bloco(a14, "RP_PROCESSADOS").valor).toBe(a7.total.saldoB1);
    expect(bloco(a14, "RP_NAO_PROCESSADOS").valor).toBe(a7.total.saldoB2);

    // Educação: o simplificado lê o indicador dos PROFISSIONAIS (70%), não o 25% (que o Anexo 8 não computa).
    const edu = bloco(a14, "EDUCACAO_PROFISSIONAIS");
    expect(edu.percentual).toBe(a8.indicadorProfissionais);
    expect(edu.limite).toBe(a8.limiteProfissionais);
    expect(a14.notas.some((n) => n.startsWith("MDE-25-NAO-CONSOLIDADO"))).toBe(true);

    const saude = bloco(a14, "SAUDE_ASPS");
    expect(saude.percentual).toBe(a12.percentualAplicacao);
    expect(saude.limite).toBe(a12.limitePercentual);

    expect(bloco(a14, "ALIENACAO_RECEITA").valor).toBe(a11.totalReceitas.realizada);
    expect(bloco(a14, "ALIENACAO_APLICACAO").valor).toBe(a11.totalAplicacao.paga);

    expect(bloco(a14, "RCL").valor).toBe(a3.rcl.total12m);
  });

  it("t4 (declara a ausência): o bloco RPPS é interruptor ANEXO4-PENDENTE, não zero", async () => {
    const a14 = await rreoAnexo14(prisma, { exercicio: 2026, bimestre: 1 });
    const rpps = bloco(a14, "RPPS");
    expect(rpps.interruptor).toBe(true);
    expect(rpps.valor).toBe("—"); // declarado ausente, não "0.00"
    expect(a14.notas.some((n) => n.startsWith("ANEXO4-PENDENTE"))).toBe(true);
  });
});
