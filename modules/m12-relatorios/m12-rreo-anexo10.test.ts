import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { anexo10, lerTabelaDaProjecao, registrarProjecaoAtuarialDoRreo, retirarProjecaoAtuarialDoRreo } from "./rreo-anexo10.js";

/**
 * V35 — RREO Anexo 10 (projeção atuarial do regime próprio), pelas regras do Siconfi (STN, 2025).
 *
 * ⚠️ CONTAS À MÃO. RREO de 2026: a projeção começa em 2025 e tem 75 anos (2025 a 2099).
 *   Capitalização: receitas 1.000,00 e despesas 800,00 todo ano → resultado +200,00; saldo anterior 5.000,00
 *     2025: 5.200,00     2026: 5.400,00     2099 (75º): 5.000 + 75 × 200 = 20.000,00
 *   Repartição: receitas 100,00 e despesas 300,00 → resultado −200,00; saldo anterior 1.000,00
 *     2025: 800,00       2099: 1.000 − 75 × 200 = −14.000,00
 * N=2: os dois planos, com sinais opostos.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const DOC = "Avaliação atuarial 2025, data-base 31/12/2024, atuário responsável MIBA 0000 (fixture)";

const anos = (de: number, n: number): number[] => Array.from({ length: n }, (_, i) => de + i);
const tabela = (receitas: string, despesas: string, lista: readonly number[]) => lista.map((ano) => ({ ano, receitas, despesas }));
const registrar = (over: Partial<Parameters<typeof registrarProjecaoAtuarialDoRreo>[1]> = {}) =>
  registrarProjecaoAtuarialDoRreo(prisma, { exercicio: 2026, plano: "CAPITALIZACAO", dataDaAvaliacao: "2025-03-31", documento: DOC, saldoFinanceiroAnterior: "5000.00", linhas: tabela("1000.00", "800.00", anos(2025, 75)), criadoPor: POR, ...over });

describe("M12 — RREO Anexo 10, projeção atuarial do regime próprio", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
  });

  it("t1: os dois planos, com resultado e saldo acumulado derivados; a versão nova substitui e a retirada some", async () => {
    expect(await registrar()).toEqual({ versao: 1, anos: 75 });
    await registrar({ plano: "REPARTICAO", saldoFinanceiroAnterior: "1000.00", linhas: tabela("100.00", "300.00", anos(2025, 75)) });

    const a = await anexo10(prisma, { exercicio: 2026, bimestre: 6 });
    expect(a.disponivel).toBe(true);
    expect(a.quadros.map((q) => q.plano)).toEqual(["CAPITALIZACAO", "REPARTICAO"]);
    const [cap, rep] = a.quadros as [(typeof a.quadros)[number], (typeof a.quadros)[number]];
    expect(cap.linhas[0]).toEqual({ ano: 2025, receitas: "1000.00", despesas: "800.00", resultado: "200.00", saldo: "5200.00" });
    expect(cap.linhas[1]!.saldo).toBe("5400.00");
    expect(cap.linhas[74]).toMatchObject({ ano: 2099, saldo: "20000.00" });
    expect(rep.linhas[0]).toMatchObject({ resultado: "-200.00", saldo: "800.00" });
    expect(rep.linhas[74]!.saldo).toBe("-14000.00");
    expect(cap).toMatchObject({ dataDaAvaliacao: "2025-03-31", documento: DOC, versao: 1 });

    // a versão 2 da capitalização substitui a 1 (o saldo anterior corrigido muda toda a coluna d)
    expect(await registrar({ saldoFinanceiroAnterior: "6000.00" })).toEqual({ versao: 2, anos: 75 });
    // retirar a repartição (ente sem segregação): some do demonstrativo, o histórico fica
    expect(await retirarProjecaoAtuarialDoRreo(prisma, { exercicio: 2026, plano: "REPARTICAO", criadoPor: POR })).toEqual({ versao: 2 });
    const b = await anexo10(prisma, { exercicio: 2026, bimestre: 6 });
    expect(b.quadros.map((q) => [q.plano, q.versao, q.linhas[74]!.saldo])).toEqual([["CAPITALIZACAO", 2, "21000.00"]]);
    expect(await prisma.projecaoAtuarialDoRreo.count()).toBe(4);
    await expect(retirarProjecaoAtuarialDoRreo(prisma, { exercicio: 2026, plano: "REPARTICAO", criadoPor: POR })).rejects.toThrow(/Não há projeção do Fundo em Repartição/);
  });

  it("t2: fora do 6º bimestre o anexo não existe; sem projeção, a pendência diz de onde ela vem", async () => {
    await registrar();
    const quinto = await anexo10(prisma, { exercicio: 2026, bimestre: 5 });
    expect(quinto).toMatchObject({ disponivel: false, quadros: [] });
    expect(quinto.notas[0]).toMatch(/só o RREO do último bimestre/);
    const vazio = await anexo10(prisma, { exercicio: 2027, bimestre: 6 });
    expect(vazio.quadros).toEqual([]);
    expect(vazio.notas[0]).toMatch(/Não há projeção atuarial registrada para o RREO de 2027: ela vem da avaliação atuarial/);
  });

  it("t3: as regras do Siconfi recusam com o motivo, e nada é gravado", async () => {
    await expect(registrar({ linhas: tabela("1000.00", "800.00", anos(2025, 74)) })).rejects.toThrow(/tem 74 anos; o Anexo 10 pede pelo menos 75/);
    await expect(registrar({ linhas: tabela("1000.00", "800.00", anos(2026, 75)) })).rejects.toThrow(/começa em 2025, o ano anterior ao do demonstrativo.*a informada começa em 2026/);
    const comBuraco = tabela("1000.00", "800.00", [...anos(2025, 40), ...anos(2066, 40)]);
    await expect(registrar({ linhas: comBuraco })).rejects.toThrow(/o 2066 está fora da sequência que começa em 2025/);
    const repetido = tabela("1000.00", "800.00", [...anos(2025, 75), 2030]);
    await expect(registrar({ linhas: repetido })).rejects.toThrow(/o 2030 está fora da sequência/);
    await expect(registrar({ linhas: tabela("-1.00", "800.00", anos(2025, 75)) })).rejects.toThrow(/não são negativas/);
    await expect(registrar({ exercicio: 2027, linhas: tabela("1000.00", "800.00", anos(2026, 75)) })).rejects.toThrow(/exercício 2027 não está cadastrado/);
    await expect(registrar({ criadoPor: SEM_PODER })).rejects.toThrow(/CADASTRAR_LINHA_DEMONSTRATIVO/);
    expect(await prisma.projecaoAtuarialDoRreo.count()).toBe(0);
    expect(await prisma.linhaDaProjecaoAtuarialDoRreo.count()).toBe(0);
  });

  it("t4: a tabela colada da avaliação: formato brasileiro, ponto decimal e tabulação; o ambíguo é recusado", () => {
    const lido = lerTabelaDaProjecao("2025;1.234.567,89;987.654,32\n\n2026\tR$ 1500.5\t12,3\r\n2027; 1000 ; 0,00");
    expect(lido).toEqual([
      { ano: 2025, receitas: "1234567.89", despesas: "987654.32" },
      { ano: 2026, receitas: "1500.50", despesas: "12.30" },
      { ano: 2027, receitas: "1000.00", despesas: "0.00" },
    ]);
    expect(() => lerTabelaDaProjecao("2025;1.234;10,00")).toThrow(/Linha 1: o valor "1.234" não é um número em reais legível/);
    expect(() => lerTabelaDaProjecao("2025;10,00")).toThrow(/use três colunas/);
    expect(() => lerTabelaDaProjecao("25;10,00;1,00")).toThrow(/não tem quatro dígitos/);
  });
});
