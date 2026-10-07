import "dotenv/config";
import { Decimal } from "decimal.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { proporCmdPorPercentual } from "./programacao.js";
import { distribuirPorPercentuais } from "./programacao-dominio.js";

/**
 * V36 — O CMD PELO PERCENTUAL DE CADA MÊS (TR 5.9.3.37).
 *
 * Contas à mão: 100.000,00 com jan 10%, fev..nov 8% cada (80%), dez 10% → jan 10.000, fev..nov 8.000, dez 10.000.
 * 1.000,01 com 33,33 / 33,33 / 33,34 nos três primeiros meses e 0% no resto: 333,30 / 333,30 / 333,41 (o centavo vai para
 * março, o último com percentual positivo, e não para dezembro, que tem 0%).
 * N=2 fontes no serviço, cada uma dividida pela sua previsão.
 */

const P = (xs: readonly string[]): Decimal[] => xs.map((x) => new Decimal(x));
const DOZE = ["10", "8", "8", "8", "8", "8", "8", "8", "8", "8", "8", "10"];

describe("M02 V36 — distribuirPorPercentuais (puro)", () => {
  it("t1: 100.000,00 pelos percentuais, ao centavo; o resto no último mês com percentual positivo", () => {
    expect(distribuirPorPercentuais(toMoney("100000.00"), P(DOZE)).map((v) => v.toFixed(2))).toEqual([
      "10000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "10000.00",
    ]);
    const tres = distribuirPorPercentuais(toMoney("1000.01"), P(["33.33", "33.33", "33.34", "0", "0", "0", "0", "0", "0", "0", "0", "0"]));
    expect(tres.map((v) => v.toFixed(2))).toEqual(["333.30", "333.30", "333.41", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00"]);
    const quebrado = distribuirPorPercentuais(toMoney("99999.99"), P(DOZE));
    expect(quebrado.reduce((a, v) => a.plus(v), new Decimal(0)).toFixed(2)).toBe("99999.99");
  });

  it("t2: recusa soma diferente de 100 (dizendo a soma), percentual negativo e quantidade errada", () => {
    expect(() => distribuirPorPercentuais(toMoney("100.00"), P([...DOZE.slice(0, 11), "9.99"]))).toThrow(/somam 99,99%, e têm de somar 100,00%/);
    expect(() => distribuirPorPercentuais(toMoney("100.00"), P(["-1", "11", ...DOZE.slice(2)]))).toThrow(/mês 1 é negativo/);
    expect(() => distribuirPorPercentuais(toMoney("100.00"), P(DOZE.slice(0, 11)))).toThrow(/12 meses \(recebidos 11\)/);
  });
});

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});
const POR = "orcamento@cg.pb.gov.br";

describe("M02 V36 — proporCmdPorPercentual", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.naturezaReceita.create({ data: { id: "nr", codigo: "11130111", descricao: "IPTU" } });
    await prisma.fonteRecurso.createMany({
      data: [
        { id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
        { id: "fnt-540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
      ],
    });
    // A previsão entra direto como fixture: aqui só importa o valor por fonte que `previsaoPorFonte` lê; o lançamento
    // da previsão no razão é do serviço da LOA e tem teste próprio.
    await prisma.receitaPrevista.createMany({
      data: [
        { exercicio: 2026, naturezaReceitaId: "nr", fonteId: "fnt-500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "100000.00" },
        { exercicio: 2026, naturezaReceitaId: "nr", fonteId: "fnt-540", tipoReceita: "ORCAMENTARIA", valorPrevisto: "1000.00" },
      ],
    });
  }, 60000);

  const cotas = async (versaoId: string, fonteId: string): Promise<string[]> =>
    (await prisma.cotaCmd.findMany({ where: { versaoId, fonteId }, orderBy: { mes: "asc" }, select: { valor: true } })).map((c) => c.valor.toFixed(2));

  it("t3: cada fonte dividida pela sua previsão; sem cronograma é a versão 1, depois a seguinte", async () => {
    const r = await proporCmdPorPercentual(prisma, { exercicio: 2026, atoRef: "DEC-CMD-PCT", vigenteDesde: new Date("2026-01-01T03:00:00Z"), percentuais: DOZE, criadoPor: POR });
    expect(r.numero).toBe(1);
    expect(await cotas(r.versaoId, "fnt-500")).toEqual(["10000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "8000.00", "10000.00"]);
    expect(await cotas(r.versaoId, "fnt-540")).toEqual(["100.00", "80.00", "80.00", "80.00", "80.00", "80.00", "80.00", "80.00", "80.00", "80.00", "80.00", "100.00"]);
    const r2 = await proporCmdPorPercentual(prisma, { exercicio: 2026, atoRef: "DEC-CMD-PCT-2", vigenteDesde: new Date("2026-03-01T03:00:00Z"), percentuais: DOZE, criadoPor: POR });
    expect(r2.numero).toBe(2);
    expect(await prisma.versaoCmd.count({ where: { exercicio: 2026 } })).toBe(2);
  });

  it("t4: soma diferente de 100 não grava versão nenhuma; quem não cria cronograma é recusado pela ação", async () => {
    await expect(proporCmdPorPercentual(prisma, { exercicio: 2026, atoRef: "DEC", vigenteDesde: new Date("2026-01-01T03:00:00Z"), percentuais: [...DOZE.slice(0, 11), "9"], criadoPor: POR })).rejects.toThrow(/somam 99,00%/);
    const u = await prisma.usuario.create({ data: { identificador: "so.le@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_PLAN", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_PLANEJAMENTO" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    await expect(proporCmdPorPercentual(prisma, { exercicio: 2026, atoRef: "DEC", vigenteDesde: new Date("2026-01-01T03:00:00Z"), percentuais: DOZE, criadoPor: "so.le@cg.pb.gov.br" })).rejects.toThrow(/CRIAR_VERSAO_CMD/);
    expect(await prisma.versaoCmd.count()).toBe(0);
  });
});
