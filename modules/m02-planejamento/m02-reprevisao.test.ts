import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM02Deps } from "./adapter-prisma.js";
import { reprevisarReceita } from "./servico.js";
import { reprevisaoAcumuladaPorNatureza } from "./consultas.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { anexo1 } from "../m12-relatorios/rreo-anexo1.js";
import { anexo3 } from "../m12-relatorios/rreo-anexo3.js";
import { anexo8 } from "../m12-relatorios/rreo-anexo8.js";
import { anexo12 } from "../m12-relatorios/rreo-anexo12.js";

/**
 * M02 — REPREVISÃO DE RECEITA. A reestimativa (append-only) DESTRAVA a "previsão atualizada".
 *
 * Cenário: IPTU previsão inicial 100.000; reprevisão +20.000 e +5.000 (append-only) → atualizada
 * 125.000. Os quatro consumidores (Anexos 1/3/8/12) passam a mostrar 125.000, não mais 100.000.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const N_IPTU = "11121101"; // categoria 1 (corrente / imposto)

const CONTAS = [
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "RaR", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "RR", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];
const R_ARREC = roteiroArrecadacao({ disponibilidade: "1.1.1.1.2.00.00", variacaoAumentativa: "4.1.1.1.1.00.00", receitaARealizar: "5.2.1.1.1.00.00", receitaRealizada: "6.2.1.1.1.00.00" });

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: N_IPTU, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });
  await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: "fnt-500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "100000.00" } });
  // o Anexo 12/8 mapeiam o IPTU como imposto da base.
  await prisma.deParaBaseImpostoAsps.create({ data: { naturezaCodigo: N_IPTU, chave: "IPTU", criadoPor: "T" } });
  // uma arrecadação mínima faz o IPTU EXISTIR como linha nos Anexos 12/8 (que nascem da realizada).
  await registrarArrecadacao({ exercicio: 2026, naturezaReceita: N_IPTU, fonte: "500", valor: "10000.00", dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: "G1", criadoPor: POR }, R_ARREC, criarM04Deps(prisma));
}

async function reprevisar(ajuste: string, motivo: string): Promise<void> {
  await reprevisarReceita(
    { exercicio: 2026, naturezaReceita: N_IPTU, fonte: "500", tipoReceita: "ORCAMENTARIA", valorAjuste: ajuste, motivo, data: new Date("2026-03-01T12:00:00Z"), criadoPor: POR },
    criarM02Deps(prisma)
  );
}

describe("M02 — reprevisão de receita (destrava a previsão atualizada)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: append-only — a Σ dos ajustes é o acumulado por natureza", async () => {
    await reprevisar("20000.00", "reestimativa de arrecadação do IPTU");
    await reprevisar("5000.00", "segunda reestimativa");
    const mapa = await reprevisaoAcumuladaPorNatureza(prisma, { exercicio: 2026 });
    expect(mapa.get(N_IPTU)!.toFixed(2)).toBe("25000.00"); // 20.000 + 5.000

    // duas linhas (append-only), nunca editadas.
    const linhas = await prisma.receitaReprevista.findMany({ where: { exercicio: 2026 } });
    expect(linhas.length).toBe(2);
  });

  it("t2: a previsão ATUALIZADA passa a inicial + Σ reprevisões nos 4 anexos", async () => {
    await reprevisar("20000.00", "reestimativa do IPTU");
    await reprevisar("5000.00", "segunda reestimativa");
    // esperado: 100.000 + 25.000 = 125.000.

    // Anexo 1 (espécie 111): previsão atualizada 125.000, inicial 100.000.
    const a1 = await anexo1(prisma, { exercicio: 2026, bimestre: 1 });
    const esp = a1.receitas.find((l) => l.nivel === "especie" && l.codigo === "111")!;
    expect(esp.previsaoInicial).toBe("100000.00");
    expect(esp.previsaoAtualizada).toBe("125000.00");

    // Anexo 3: RECEITAS CORRENTES (I) atualizada 125.000.
    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });
    expect(a3.linhas.find((l) => l.chave === "RECEITAS_CORRENTES")!.previsaoAtualizada).toBe("125000.00");

    // Anexo 12: a linha IPTU atualizada 125.000.
    const a12 = await anexo12(prisma, { exercicio: 2026, bimestre: 1 });
    expect(a12.impostos.find((l) => l.chave === "IPTU")!.previsaoAtualizada).toBe("125000.00");

    // Anexo 8: a linha 1.1 (IPTU) atualizada 125.000.
    const a8 = await anexo8(prisma, { exercicio: 2026, bimestre: 1 });
    expect(a8.receitas.find((l) => l.numero === "1.1")!.previsaoAtualizada).toBe("125000.00");
  });

  it("t3: reprevisão negativa REDUZ a previsão atualizada", async () => {
    await reprevisar("-30000.00", "frustração de arrecadação");
    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });
    expect(a3.linhas.find((l) => l.chave === "RECEITAS_CORRENTES")!.previsaoAtualizada).toBe("70000.00"); // 100.000 − 30.000
  });

  it("t4: ajuste zero é REJEITADO (ruído)", async () => {
    await expect(reprevisar("0.00", "sem efeito")).rejects.toThrow(/não pode ser zero/);
  });
});
