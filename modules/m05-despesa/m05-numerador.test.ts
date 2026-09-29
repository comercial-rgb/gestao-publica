import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { MAIOR_NUMERO, numeroJaReservado, reservarNumero } from "./numerador.js";

/**
 * O NUMERADOR DOS DOCUMENTOS QUE O SISTEMA NUMERA (V22) — o número que o SAGRES aceita (numérico,
 * 7 posições), com a identidade do documento na reserva.
 *
 * O que este arquivo existe para impedir: a retomada que ganha número novo (e empenha de novo); duas
 * reservas simultâneas com o mesmo número; a folha pegando um número que o operador já digitou;
 * o número de outro exercício ou de texto contando como "o maior"; e o oitavo dígito.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";

/** Um empenho gravado com o número dado, sem o caminho do M05 (aqui só o NÚMERO importa). */
async function empenhoComNumero(fichaId: string, numero: string): Promise<void> {
  const l = await prisma.lancamentoContabil.create({
    data: { numeroControle: `T-${fichaId}-${numero}`, dataTransacao: new Date("2026-03-10T15:00:00Z"), historico: "fixture", origemTipo: "TESTE", criadoPor: POR },
    select: { id: true },
  });
  await prisma.empenho.create({
    data: {
      fichaId, numero, tipo: "ORDINARIO", valor: "10.00", data: new Date("2026-03-10T15:00:00Z"), credorCpfCnpj: "11222333000181",
      historico: "fixture", categoriaOrdemCronologica: "FORNECIMENTO_BENS", lancamentoId: l.id, criadoPor: POR,
    },
  });
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administracao", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administracao" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.createMany({ data: [{ id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" }, { id: "aca2", codigo: "2002", descricao: "B", tipo: "ATIVIDADE" }] });
  await prisma.naturezaDespesa.create({ data: { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material" } });
  await prisma.fonteRecurso.create({ data: { id: "fonte-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const base = { orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-30", fonteId: "fonte-500", valorDotado: "1000.00" };
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-a", exercicio: 2026, numero: 1 });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-b", exercicio: 2026, numero: 2, acaoId: "aca2" });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-2025", exercicio: 2025, numero: 1 });
}, 60_000);

describe("o numerador do exercício", () => {
  it("t1: a MESMA chave devolve sempre o mesmo número — é o que mantém a retomada idempotente", async () => {
    const a = await reservarNumero(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: "FP/2026-05/MAT-A", criadoPor: POR });
    const de_novo = await reservarNumero(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: "FP/2026-05/MAT-A", criadoPor: POR });
    expect(de_novo).toBe(a);
    expect(await numeroJaReservado(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: "FP/2026-05/MAT-A" })).toBe(a);
    expect(await prisma.numeroReservado.count()).toBe(1);
  });

  it("t2: N=2 — duas identidades, dois números distintos e seguidos; a ficha entra na chave", async () => {
    const a = await reservarNumero(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: "FP/2026-05/MAT-A", criadoPor: POR });
    const b = await reservarNumero(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: "FP/2026-05/MAT-B", criadoPor: POR });
    // a mesma identidade em OUTRA ficha é outro documento (a unicidade do empenho é por ficha)
    const c = await reservarNumero(prisma, { fichaId: "ficha-b", especie: "EMPENHO", identidade: "FP/2026-05/MAT-A", criadoPor: POR });
    expect([a, b, c]).toEqual(["1", "2", "3"]);
  });

  it("t3: começa ACIMA do maior número digitado no exercício — e ignora número de texto e de outro exercício", async () => {
    await empenhoComNumero("ficha-a", "41");
    await empenhoComNumero("ficha-b", "7");
    await empenhoComNumero("ficha-a", "2026NE000999"); // texto: não é número do SAGRES, não conta
    await empenhoComNumero("ficha-2025", "5000"); // outro exercício, não conta
    expect(await reservarNumero(prisma, { fichaId: "ficha-b", especie: "EMPENHO", identidade: "X", criadoPor: POR })).toBe("42");
    // e o de 2025 segue o próprio exercício
    expect(await reservarNumero(prisma, { fichaId: "ficha-2025", especie: "EMPENHO", identidade: "X", criadoPor: POR })).toBe("5001");
  });

  it("t4: as espécies não se misturam — a liquidação tem o próprio sequencial", async () => {
    await empenhoComNumero("ficha-a", "41");
    expect(await reservarNumero(prisma, { fichaId: "ficha-a", especie: "LIQUIDACAO", identidade: "AL1", criadoPor: POR })).toBe("1");
    expect(await reservarNumero(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: "AE1", criadoPor: POR })).toBe("42");
  });

  it("t5: dez reservas SIMULTÂNEAS de identidades diferentes — dez números distintos, de 1 a 10", async () => {
    const numeros = await Promise.all(
      Array.from({ length: 10 }, (_, i) => reservarNumero(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: `ID-${i}`, criadoPor: POR }))
    );
    expect([...numeros].map(Number).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("t6: a MESMA identidade pedida cinco vezes ao mesmo tempo — um número só, uma reserva só", async () => {
    const numeros = await Promise.all(
      Array.from({ length: 5 }, () => reservarNumero(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: "FP/2026-05/MAT-A", criadoPor: POR }))
    );
    expect(new Set(numeros).size).toBe(1);
    expect(await prisma.numeroReservado.count()).toBe(1);
  });

  it("t7: o oitavo dígito é recusado nomeando o limite do SAGRES — e nada é reservado", async () => {
    await empenhoComNumero("ficha-a", String(MAIOR_NUMERO));
    await expect(reservarNumero(prisma, { fichaId: "ficha-a", especie: "EMPENHO", identidade: "X", criadoPor: POR })).rejects.toThrow(
      /NUMERADOR-ESGOTADO: o exercício 2026 já usou o número 9999999 na espécie EMPENHO/
    );
    expect(await prisma.numeroReservado.count()).toBe(0);
  });
});
