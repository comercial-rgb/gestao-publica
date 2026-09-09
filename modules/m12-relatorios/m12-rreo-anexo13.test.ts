import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { anexo13 } from "./rreo-anexo13.js";

/**
 * RREO — ANEXO 13: PPP (Lei 11.079/2004 art. 28). Esqueleto honesto: sem contrato = vazio; com
 * contrato = teto de 5% da RCL. A RCL vem do MESMO motor do Anexo 3 (as páginas conversam).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tributos@cg.pb.gov.br";
const N_CORRENTE = "11130111"; // categoria 1 (corrente) — entra na RCL

const CONTAS = [
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "RaR", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "RR", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];
const R_ARREC = roteiroArrecadacao({ disponibilidade: "1.1.1.1.2.00.00", variacaoAumentativa: "4.1.1.1.1.00.00", receitaARealizar: "5.2.1.1.1.00.00", receitaRealizada: "6.2.1.1.1.00.00" });

let m04: ReturnType<typeof criarM04Deps>;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  m04 = criarM04Deps(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.naturezaReceita.create({ data: { id: "nr-c", codigo: N_CORRENTE, descricao: "Imposto corrente" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });
  // RCL: arrecada 1.000.000 de receita corrente ao longo do ano.
  await registrarArrecadacao({ exercicio: 2026, naturezaReceita: N_CORRENTE, fonte: "500", valor: "1000000.00", dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: "G1", criadoPor: POR }, R_ARREC, m04);
}

describe("M12 — RREO Anexo 13 (PPP, Lei 11.079/2004)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: sem contrato de PPP — vazio, 0,00%, com nota", async () => {
    const a13 = await anexo13(prisma, { exercicio: 2026, bimestre: 6 });
    expect(a13.contratos.length).toBe(0);
    expect(a13.totalContraprestacoes).toBe("0.00");
    expect(a13.percentualDaRcl).toBe("0.00");
    expect(a13.dentroDoLimite).toBe(true);
    expect(a13.notas.some((n) => /não possui parceria/.test(n))).toBe(true);
  });

  it("t2: com contrato — teto de 5% da RCL (contraprestação 40.000 / RCL 1.000.000 = 4,00%)", async () => {
    await prisma.contratoPPP.create({
      data: {
        numero: "PPP-01", objeto: "Iluminação pública", parceiroPrivado: "Concessionária X",
        vigenciaInicio: new Date("2024-01-01T00:00:00Z"), vigenciaFim: new Date("2039-12-31T00:00:00Z"),
        valorGlobal: "600000000.00", contraprestacaoAnual: "40000.00", criadoPor: "TESTE",
      },
    });
    const a13 = await anexo13(prisma, { exercicio: 2026, bimestre: 6 });
    expect(a13.contratos.length).toBe(1);
    expect(a13.contratos[0]!.vigencia).toBe("2024–2039");
    expect(a13.totalContraprestacoes).toBe("40000.00");
    expect(a13.rcl).toBe("1000000.00"); // do Anexo 3 (mesmo motor)
    expect(a13.percentualDaRcl).toBe("4.00"); // 40.000 / 1.000.000
    expect(a13.dentroDoLimite).toBe(true);
    // mutação: o literal errado não bate.
    expect("4.01").not.toBe(a13.percentualDaRcl);
  });
});
