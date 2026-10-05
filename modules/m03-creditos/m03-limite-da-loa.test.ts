import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM03Deps } from "./adapter-prisma.js";
import { anularCredito, criarDecreto, criarLei, executarCredito } from "./servico.js";
import { declararFonteForaDoLimiteDeSuplementacao } from "./limite-de-suplementacao.js";
import { criarRealocacaoDeps } from "./adapter-realocacao.js";
import { anularRealocacao, registrarRealocacao } from "./realocacao.js";
import type { M03Deps } from "./ports.js";

/**
 * V35 — O LIMITE PERCENTUAL DE SUPLEMENTAÇÃO DA LOA (Lei 4.320, art. 7º, I; Lei 613/2025 de Esperança, art. 5º, II e § 2º).
 *
 * ⚠️ CONTAS À MÃO. Quatro fichas de 2026 com dotação inicial:
 *   A 10.000 (fonte 500) · B 5.000 (500) · C 8.000 (540) · D 2.000 (540)  ⇒  despesa fixada 25.000
 *   Lei SUPLEMENTAR com percentual 10% e teto em reais folgado (100.000) ⇒ limite 2.500.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m03@cg.pb.gov.br";
const F500 = "fnt-500";
const F540 = "fnt-540";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" },
      { id: "sub-362", codigo: "362", nome: "Ensino Médio" },
      { id: "sub-363", codigo: "363", nome: "Ensino Profissional" },
      { id: "sub-365", codigo: "365", nome: "Educação Infantil" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg-0012", codigo: "0012", descricao: "Educação" } });
  await prisma.acao.create({ data: { id: "aca-2001", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-339039", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: F500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: F540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  const base = { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", programaId: "prg-0012", acaoId: "aca-2001", naturezaDespesaId: "nd-339039" };
  await criarFichasDeTeste(prisma, [
    { ...base, id: "A", numero: 1, subfuncaoId: "sub-361", fonteId: F500, valorDotado: "10000.00" },
    { ...base, id: "B", numero: 2, subfuncaoId: "sub-362", fonteId: F500, valorDotado: "5000.00" },
    { ...base, id: "C", numero: 3, subfuncaoId: "sub-363", fonteId: F540, valorDotado: "8000.00" },
    { ...base, id: "D", numero: 4, subfuncaoId: "sub-365", fonteId: F540, valorDotado: "2000.00" },
  ]);
}

async function lei(deps: M03Deps, percentual: string | undefined): Promise<string> {
  return criarLei(
    {
      numero: "613", ano: 2026, tipoCredito: "SUPLEMENTAR", valorAutorizado: "100000.00",
      ...(percentual !== undefined ? { percentualLimite: percentual } : {}),
      dataPublicacao: new Date("2025-12-19T12:00:00Z"), criadoPor: POR,
    },
    deps
  );
}

let n = 0;
/** Um decreto por anulação: anula `valor` de `de` e suplementa o mesmo valor em `para`. */
async function remanejar(deps: M03Deps, leiId: string, de: string, para: string, fonte: string, valor: string): Promise<string> {
  n += 1;
  const decretoId = await criarDecreto(
    { leiId, numero: `D-${String(n)}`, ano: 2026, data: new Date("2026-03-01T12:00:00Z"), origemRecurso: "ANULACAO", criadoPor: POR },
    deps
  );
  await executarCredito(
    {
      decretoId,
      itens: [
        { fichaId: de, tipo: "ANULACAO", valor, fonteId: fonte },
        { fichaId: para, tipo: "SUPLEMENTACAO", valor, fonteId: fonte },
      ],
      criadoPor: POR,
    },
    deps
  );
  return decretoId;
}

describe("M03 — limite percentual de suplementação da LOA", () => {
  let deps: M03Deps;
  beforeEach(async () => {
    deps = criarM03Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("acumula os decretos da lei e recusa o que passa de 10% de 25.000, dizendo o restante; o valor exato do limite passa", async () => {
    const leiId = await lei(deps, "10");
    await remanejar(deps, leiId, "A", "B", F500, "1500.00");
    await expect(remanejar(deps, leiId, "A", "B", F500, "1100.00")).rejects.toThrow(
      /ACIMA DO LIMITE DA LOA: 1100\.00 excede o restante de 1000\.00 \(10\.00% de 25000\.00 fixados = 2500\.00; já suplementado 1500\.00/
    );
    // a recusa não gravou nada do decreto recusado
    expect(await prisma.itemCredito.count({ where: { tipo: "SUPLEMENTACAO" } })).toBe(1);
    await remanejar(deps, leiId, "A", "B", F500, "1000.00");
    expect(await prisma.itemCredito.count({ where: { tipo: "SUPLEMENTACAO" } })).toBe(2);
  });

  it("a fonte que a LOA exclui do limite não consome nem é barrada; sem a declaração, ela conta", async () => {
    const leiId = await lei(deps, "10");
    await expect(remanejar(deps, leiId, "C", "D", F540, "3000.00")).rejects.toThrow(/ACIMA DO LIMITE DA LOA: 3000\.00 excede o restante de 2500\.00/);

    const r = await declararFonteForaDoLimiteDeSuplementacao(prisma, { exercicio: 2026, fonteCodigo: "540", fundamento: "Lei 613/2025, art. 5º, § 2º: transferência", criadoPor: POR });
    expect(r.jaDeclarada).toBe(false);
    await remanejar(deps, leiId, "C", "D", F540, "3000.00");
    // a fonte 500 continua com o limite inteiro: 2.500
    await remanejar(deps, leiId, "A", "B", F500, "2500.00");
    await expect(remanejar(deps, leiId, "A", "B", F500, "0.01")).rejects.toThrow(/excede o restante de 0\.00/);
  });

  it("anular o decreto devolve o limite (a soma é líquida de estornos)", async () => {
    const leiId = await lei(deps, "10");
    const d1 = await remanejar(deps, leiId, "A", "B", F500, "2500.00");
    await expect(remanejar(deps, leiId, "A", "B", F500, "100.00")).rejects.toThrow(/excede o restante de 0\.00/);
    await anularCredito({ decretoId: d1, data: new Date("2026-03-05T12:00:00Z"), motivo: "decreto revogado", criadoPor: POR }, deps);
    await remanejar(deps, leiId, "A", "B", F500, "2500.00");
  });

  it("lei sem percentual fica só no teto em reais", async () => {
    const leiId = await lei(deps, undefined);
    await remanejar(deps, leiId, "A", "B", F500, "5000.00");
  });

  it("a declaração é recusada para fonte que não existe, nomeando-a", async () => {
    await expect(
      declararFonteForaDoLimiteDeSuplementacao(prisma, { exercicio: 2026, fonteCodigo: "999", fundamento: "Lei 613/2025, art. 5º, § 2º", criadoPor: POR })
    ).rejects.toThrow(/Fonte 999 não cadastrada/);
  });

  it("realocação por decreto sob a autorização da LOA: o mesmo percentual, num limite próprio; anular devolve; a de lei específica fica fora", async () => {
    const leiId = await lei(deps, "10");
    const rdeps = criarRealocacaoDeps(prisma);
    let k = 0;
    const realocar = (valor: string, autorizacaoDaLoaId: string | null) => {
      k += 1;
      return registrarRealocacao(
        {
          especie: "REMANEJAMENTO", numero: `DR-${String(k)}`, data: new Date("2026-04-10T15:00:00Z"),
          leiNumero: autorizacaoDaLoaId === null ? "Lei 55/2026" : "Lei 613/2025", leiDataPublicacao: new Date("2025-12-19T15:00:00Z"),
          ...(autorizacaoDaLoaId === null ? {} : { autorizacaoDaLoaId }),
          justificativa: "Remanejamento entre programas por decreto, na forma da LOA.",
          pernas: [
            { fichaId: "A", tipo: "REDUCAO", valor, fonteId: F500 },
            { fichaId: "B", tipo: "ACRESCIMO", valor, fonteId: F500 },
          ],
          criadoPor: POR,
        },
        rdeps
      );
    };
    const r1 = await realocar("1500.00", leiId);
    await expect(realocar("1100.00", leiId)).rejects.toThrow(/REALOCAÇÃO ACIMA DO LIMITE DA LOA: 1100\.00 excede o restante de 1000\.00/);
    expect(await prisma.atoDeRealocacao.count()).toBe(1);
    // limite próprio: a suplementação da mesma lei ainda tem os 2.500 inteiros
    await remanejar(deps, leiId, "A", "B", F500, "2500.00");
    await anularRealocacao({ atoId: r1.atoId, data: new Date("2026-04-20T15:00:00Z"), motivo: "Decreto revogado pelo Executivo.", criadoPor: POR }, rdeps);
    await realocar("2500.00", leiId);
    // a realocação por lei específica (CF, art. 167, VI) não corre contra o percentual
    await realocar("3000.00", null);
  });
});
