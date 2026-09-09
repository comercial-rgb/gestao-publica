import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { verificacoesDaLoa } from "./consistencia-loa.js";

/**
 * M12 — CONSISTÊNCIA DA LOA (TR 4.17). Contas à mão:
 *
 * ═══ A LOA EQUILIBRADA (limpa) ═══
 *   Receita prevista: fonte 500 IPTU 1.000.000 · fonte 600 FPM 200.000  → Σ 1.200.000
 *   Dotação fixada:   fonte 500 (educ) 300.000 + (adm) 700.000 · fonte 600 200.000 → Σ 1.200.000
 *   EQUILÍBRIO: 1.200.000 == 1.200.000  → OK
 *   POR FONTE: 500 → receita 1.000.000 × despesa 1.000.000 ✓ · 600 → 200.000 × 200.000 ✓ → OK
 *
 * ═══ A FONTE FURADA (plantada) ═══ + ficha de 50.000 na fonte 500 → despesa 1.050.000 × receita
 *   1.000.000: desalinhamento 50.000 na fonte 500 → POR FONTE DIVERGE.
 *
 * ═══ MDE 25% (com de-para) ═══ base prevista (IPTU+FPM mapeados) = 1.200.000; mínimo 25% = 300.000;
 *   dotação educação (função 12) = 300.000 → OK (atinge o piso). Sem de-para → SEM_DADO.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";

async function semearBase(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.orgao.create({ data: { id: "org", codigo: "02", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo", codigo: "02001", descricao: "Adm", orgaoId: "org" } });
  await prisma.funcao.createMany({ data: [{ id: "fun-04", codigo: "04", nome: "Adm" }, { id: "fun-12", codigo: "12", nome: "Educação" }, { id: "fun-26", codigo: "26", nome: "Transporte" }] });
  await prisma.subfuncao.create({ data: { id: "sub", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.naturezaReceita.createMany({ data: [{ id: "nr-iptu", codigo: "11180111", descricao: "IPTU" }, { id: "nr-fpm", codigo: "17210151", descricao: "FPM" }] });
  await prisma.fonteRecurso.createMany({ data: [{ id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" }, { id: "f600", codigo: "600", descricao: "SUS", codigoTce: "600" }] });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "T" } });

  // Receita prevista.
  await prisma.receitaPrevista.createMany({
    data: [
      { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: "f500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "1000000.00" },
      { exercicio: 2026, naturezaReceitaId: "nr-fpm", fonteId: "f600", tipoReceita: "ORCAMENTARIA", valorPrevisto: "200000.00" },
    ],
  });

  const ficha = (id: string, numero: number, fonteId: string, funcaoId: string, valor: string) =>
    criarFichaDeTeste(prisma, { id, exercicio: 2026, numero, orgaoId: "org", unidadeOrcId: "uo", funcaoId, subfuncaoId: "sub", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd39", fonteId, valorDotado: valor });
  // Dotação: 300k educação (fonte 500) + 700k adm (fonte 500) + 200k (fonte 600).
  await ficha("fic-edu", 1, "f500", "fun-12", "300000.00");
  await ficha("fic-adm", 2, "f500", "fun-04", "700000.00");
  await ficha("fic-600", 3, "f600", "fun-04", "200000.00");
}

const acha = (vs: readonly Awaited<ReturnType<typeof verificacoesDaLoa>>[number][], chave: string) => vs.find((v) => v.chave === chave)!;

describe("M12 — Consistência da LOA (TR 4.17)", () => {
  beforeEach(async () => {
    await semearBase();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 (LOA equilibrada → OK): equilíbrio e por-fonte batem", async () => {
    const vs = await verificacoesDaLoa(prisma, { exercicio: 2026 });
    const eq = acha(vs, "LOA_EQUILIBRIO");
    expect(eq.resultado).toBe("OK");
    expect(eq.esquerda).toBe("1200000.00");
    expect(eq.direita).toBe("1200000.00");
    expect(acha(vs, "LOA_POR_FONTE").resultado).toBe("OK");
  });

  it("t2 (fonte furada plantada → DIVERGE com os dois lados)", async () => {
    // Uma ficha extra de 50.000 na fonte 500 — a despesa da fonte passa a superar a receita dela.
    await criarFichaDeTeste(prisma, { id: "fic-furo", exercicio: 2026, numero: 9, orgaoId: "org", unidadeOrcId: "uo", funcaoId: "fun-26", subfuncaoId: "sub", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd39", fonteId: "f500", valorDotado: "50000.00" });
    const vs = await verificacoesDaLoa(prisma, { exercicio: 2026 });
    const pf = acha(vs, "LOA_POR_FONTE");
    expect(pf.resultado).toBe("DIVERGE");
    // O desalinhamento é 50.000, e o detalhe nomeia a fonte furada.
    expect(pf.diferenca).toBe("50000.00");
    expect(pf.detalhe).toMatch(/fonte f500/);
  });

  it("t3 (previsão sem de-para de base → MDE/Saúde SEM_DADO): nunca projeta sobre base inexistente", async () => {
    const vs = await verificacoesDaLoa(prisma, { exercicio: 2026 });
    expect(acha(vs, "LOA_MDE_25").resultado).toBe("SEM_DADO");
    expect(acha(vs, "LOA_MDE_25").detalhe).toContain("SEM-DEPARA");
    expect(acha(vs, "LOA_SAUDE_15").resultado).toBe("SEM_DADO");
    // FUNDEB/VAAT e Pessoal×RCL também são interruptores nomeados.
    expect(acha(vs, "LOA_FUNDEB_VAAT").resultado).toBe("SEM_DADO");
    expect(acha(vs, "LOA_PESSOAL_RCL").resultado).toBe("SEM_DADO");
  });

  it("t4 (MDE com de-para semeado → piso projetado): 300.000 == 25% de 1.200.000 → OK", async () => {
    // Semeia o de-para de base de impostos (natureza → chave) — o MESMO do Anexo 8/12.
    await prisma.deParaBaseImpostoAsps.createMany({
      data: [{ naturezaCodigo: "11180111", chave: "IPTU", criadoPor: POR }, { naturezaCodigo: "17210151", chave: "FPM", criadoPor: POR }],
    });
    const vs = await verificacoesDaLoa(prisma, { exercicio: 2026 });
    const mde = acha(vs, "LOA_MDE_25");
    expect(mde.resultado).toBe("OK"); // 300.000 (educação) ≥ 300.000 (25% de 1.200.000)
    expect(mde.esquerda).toBe("300000.00");
    expect(mde.direita).toBe("300000.00");
  });
});
