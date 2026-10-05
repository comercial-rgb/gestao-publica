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
  // V35 — as contas da reprevisão no razão (PCASP do TCE-PB 2025)
  { id: "c-reest", codigo: "5.2.1.2.1.01.00", nome: "REESTIMATIVA", naturezaSaldo: "DEVEDORA" as const, nivel: 7, analitica: true },
  { id: "c-anul", codigo: "5.2.1.2.9.00.00", nome: "(-) ANULAÇÃO DA PREVISÃO DA RECEITA", naturezaSaldo: "CREDORA" as const, nivel: 7, analitica: true },
  { id: "c-areal", codigo: "6.2.1.1.0.00.00", nome: "RECEITA A REALIZAR", naturezaSaldo: "CREDORA" as const, nivel: 7, analitica: true },
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

  it("t-razão (V35): o aumento vai à reestimativa e a redução à anulação da previsão, contra a receita a realizar", async () => {
    await reprevisar("20000.00", "reestimativa do IPTU");
    await reprevisar("-3000.00", "frustração de parte da reestimativa");
    const saldo = async (codigo: string): Promise<string> => {
      const ps = await prisma.partidaContabil.findMany({ where: { conta: { codigo } }, select: { tipo: true, valor: true } });
      let c = 0n;
      for (const p of ps) c += (p.tipo === "DEBITO" ? 1n : -1n) * BigInt(p.valor.toFixed(2).replace(".", ""));
      const t = (c < 0n ? -c : c).toString().padStart(3, "0");
      return `${c < 0n ? "-" : ""}${t.slice(0, -2)}.${t.slice(-2)}`;
    };
    expect(await saldo("5.2.1.2.1.01.00")).toBe("20000.00");
    expect(await saldo("5.2.1.2.9.00.00")).toBe("-3000.00");
    expect(await saldo("6.2.1.1.0.00.00")).toBe("-17000.00");
    const lancs = await prisma.lancamentoContabil.findMany({ where: { origemTipo: "REPREVISAO_DA_RECEITA" }, select: { dataTransacao: true } });
    expect(lancs.map((l) => l.dataTransacao.toISOString())).toEqual(["2026-03-01T12:00:00.000Z", "2026-03-01T12:00:00.000Z"]);
  });

  /**
   * V35 — A REPREVISÃO DE DEDUÇÃO NO RAZÃO. N=2 no tipo: a dedução para o FUNDEB (tipo 3) vai a 5.2.1.2.1.03.01 e a outra
   * (tipo 5) a 5.2.1.2.1.99.00, contra a receita a realizar, com o sinal da redutora (aumento credita a dedução).
   *   FUNDEB: +8.000 e −1.000 → (-) FUNDEB credor 7.000      outras: +500 → credor 500
   *   receita a realizar: D 8.000 − C 1.000 + D 500 → devedor 7.500
   */
  it("t-dedução (V35): a reprevisão da dedução vai à conta do tipo, e sem o detalhe da linha é recusada com o motivo", async () => {
    await prisma.contaPcasp.createMany({
      data: [
        { codigo: "5.2.1.2.1.03.01", nome: "(-) FUNDEB", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
        { codigo: "5.2.1.2.1.99.00", nome: "(-) PREVISÃO DE OUTRAS DEDUÇÕES DA RECEITA", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
      ],
    });
    await prisma.naturezaReceita.create({ data: { id: "nr-fpm", codigo: "17115111", descricao: "FPM" } });
    await prisma.naturezaReceita.create({ data: { id: "nr-itbi", codigo: "11125001", descricao: "ITBI (sem linha de dedução na LOA)" } });
    const fundeb = await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: "nr-fpm", fonteId: "fnt-500", tipoReceita: "DEDUCAO", valorPrevisto: "40000.00" }, select: { id: true } });
    const outra = await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: "fnt-500", tipoReceita: "DEDUCAO", valorPrevisto: "2000.00" }, select: { id: true } });
    const dedu = (natureza: string, ajuste: string) =>
      reprevisarReceita({ exercicio: 2026, naturezaReceita: natureza, fonte: "500", tipoReceita: "DEDUCAO", valorAjuste: ajuste, motivo: "reestimativa da dedução", data: new Date("2026-04-01T12:00:00Z"), criadoPor: POR }, criarM02Deps(prisma));

    // sem o detalhe, o tipo não é conhecido: recusa nomeando o motivo, e nada é gravado
    await expect(dedu("17115111", "8000.00")).rejects.toThrow(/precisa do tipo da dedução \(FUNDEB ou outra\).*ainda não foi registrado/);
    await expect(dedu("11125001", "100.00")).rejects.toThrow(/não existe para esta natureza e fonte/);
    expect(await prisma.receitaReprevista.count({ where: { tipoReceita: "DEDUCAO" } })).toBe(0);

    await prisma.detalheDaReceitaPrevista.create({ data: { receitaPrevistaId: fundeb.id, tipoDeducaoSagres: "3", documento: "LOA (fixture)", criadoPor: POR } });
    await prisma.detalheDaReceitaPrevista.create({ data: { receitaPrevistaId: outra.id, tipoDeducaoSagres: "5", documento: "LOA (fixture)", criadoPor: POR } });
    await dedu("17115111", "8000.00");
    await dedu("17115111", "-1000.00");
    await dedu(N_IPTU, "500.00");

    const saldoCredor = async (codigo: string): Promise<string> => {
      const ps = await prisma.partidaContabil.findMany({ where: { conta: { codigo } }, select: { tipo: true, valor: true } });
      let c = 0n;
      for (const p of ps) c += (p.tipo === "CREDITO" ? 1n : -1n) * BigInt(p.valor.toFixed(2).replace(".", ""));
      const t = (c < 0n ? -c : c).toString().padStart(3, "0");
      return `${c < 0n ? "-" : ""}${t.slice(0, -2)}.${t.slice(-2)}`;
    };
    expect(await saldoCredor("5.2.1.2.1.03.01")).toBe("7000.00");
    expect(await saldoCredor("5.2.1.2.1.99.00")).toBe("500.00");
    expect(await saldoCredor("6.2.1.1.0.00.00")).toBe("-7500.00");
    expect(await saldoCredor("5.2.1.2.1.01.00")).toBe("0.00");
  });
});
