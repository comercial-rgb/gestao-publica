import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { listarPessoas } from "./consultas.js";
import { papeisVigentesEm, type PapelDePessoa } from "./dominio.js";

/**
 * A LISTAGEM — e a CONFRONTAÇÃO que ela obriga.
 *
 * A consulta deriva os papéis vigentes em SQL (`DISTINCT ON`); o domínio os deriva em
 * TypeScript (`papeisVigentesEm`). São duas implementações da mesma regra, e o dia em que
 * uma mudar sem a outra, a tela e o detalhe passam a discordar sobre quem é credor — em
 * silêncio, porque as duas "funcionam".
 *
 * O último bloco deste arquivo é a rede: mesmos dados, as duas leituras, comparadas.
 * É a mesma anatomia da `conferirDotacaoContraRazao` — só a confrontação de duas fontes
 * pega esta classe de divergência.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const AUTOR = "ent01@cg.pb.gov.br";

/** Documentos sintéticos, com DV válido. Não pertencem a ninguém. */
const ALFA = "11222333000181";
const BETA = "45723174000110";
const MARIA = "52998224725";

async function pessoa(p: {
  readonly id: string;
  readonly documento: string;
  readonly tipo: "FISICA" | "JURIDICA";
  readonly nomes: readonly string[];
  readonly ativaNoFim?: boolean;
}): Promise<void> {
  await prisma.pessoa.create({
    data: { id: p.id, documento: p.documento, tipo: p.tipo, criadoPor: AUTOR },
  });
  // Várias versões, em ordem: a última é a vigente.
  for (const [i, nome] of p.nomes.entries()) {
    await prisma.versaoDePessoa.create({
      data: {
        id: `${p.id}-v${i}`,
        pessoaId: p.id,
        nome,
        ativa: i === p.nomes.length - 1 ? (p.ativaNoFim ?? true) : true,
        motivo: i === 0 ? null : "renomeada",
        criadoEm: new Date(Date.UTC(2026, 0, i + 1)),
        criadoPor: AUTOR,
      },
    });
  }
}

async function movimento(
  pessoaId: string,
  papel: PapelDePessoa,
  movimento: "CONCEDIDO" | "ENCERRADO",
  data: string
): Promise<void> {
  await prisma.movimentoDePapelDaPessoa.create({
    data: { pessoaId, papel, movimento, data: new Date(data), criadoPor: AUTOR },
  });
}

const AGORA = new Date("2026-06-01T00:00:00Z");

beforeEach(async () => {
  await limparBanco(prisma);

  // "Alfa Ltda" mudou de nome para "Beta Servicos" — é o caso que a listagem ingênua erra.
  await pessoa({
    id: "p-alfa",
    documento: ALFA,
    tipo: "JURIDICA",
    nomes: ["Alfa Ltda", "Beta Servicos Ltda"],
  });
  await pessoa({
    id: "p-gama",
    documento: BETA,
    tipo: "JURIDICA",
    nomes: ["Gama Comercio Ltda"],
  });
  await pessoa({
    id: "p-maria",
    documento: MARIA,
    tipo: "FISICA",
    nomes: ["Maria da Silva"],
    ativaNoFim: false,
  });

  await movimento("p-alfa", "CREDOR", "CONCEDIDO", "2026-01-10");
  await movimento("p-gama", "CREDOR", "CONCEDIDO", "2026-01-10");
  await movimento("p-gama", "CREDOR", "ENCERRADO", "2026-03-10");
  await movimento("p-gama", "CONSIGNATARIO", "CONCEDIDO", "2026-02-10");
  await movimento("p-maria", "SERVIDOR", "CONCEDIDO", "2026-01-10");
  // Data FUTURA: não vale em 2026-06-01.
  await movimento("p-maria", "CREDOR", "CONCEDIDO", "2027-01-10");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("M19 — a listagem lê a versão VIGENTE", () => {
  it("mostra o nome de hoje, não o de ontem", async () => {
    const { itens } = await listarPessoas(prisma, {}, AGORA);
    const alfa = itens.find((i) => i.id === "p-alfa");
    expect(alfa?.nome).toBe("Beta Servicos Ltda");
  });

  it("⚠️ buscar pelo nome ANTIGO não traz a pessoa — ela não se chama mais assim", async () => {
    // É o erro que o `some: { nome: { contains } }` do Prisma cometeria: ele acharia
    // "Alfa" numa versão morta e exibiria "Beta Servicos Ltda" na coluna.
    const { itens } = await listarPessoas(prisma, { busca: "Alfa" }, AGORA);
    expect(itens).toEqual([]);
  });

  it("buscar pelo nome ATUAL traz", async () => {
    const { itens, total } = await listarPessoas(prisma, { busca: "beta" }, AGORA);
    expect(itens.map((i) => i.id)).toEqual(["p-alfa"]);
    expect(total).toBe(1);
  });

  it("a busca é OU: dígitos casam o documento sem exigir que o nome os contenha", async () => {
    const { itens } = await listarPessoas(prisma, { busca: "11.222.333" }, AGORA);
    expect(itens.map((i) => i.id)).toEqual(["p-alfa"]);
  });

  it("a situação vigente vem da última versão", async () => {
    const { itens } = await listarPessoas(prisma, {}, AGORA);
    expect(itens.find((i) => i.id === "p-maria")?.ativa).toBe(false);
    expect(itens.find((i) => i.id === "p-gama")?.ativa).toBe(true);
  });
});

describe("M19 — os filtros", () => {
  it("por papel: traz só quem o exerce HOJE", async () => {
    const { itens } = await listarPessoas(prisma, { papel: "CREDOR" }, AGORA);
    // p-gama teve o papel ENCERRADO; p-maria só o terá em 2027.
    expect(itens.map((i) => i.id)).toEqual(["p-alfa"]);
  });

  it("por situação", async () => {
    const ativas = await listarPessoas(prisma, { ativa: true }, AGORA);
    expect(ativas.itens.map((i) => i.id).sort()).toEqual(["p-alfa", "p-gama"]);

    const inativas = await listarPessoas(prisma, { ativa: false }, AGORA);
    expect(inativas.itens.map((i) => i.id)).toEqual(["p-maria"]);
  });

  it("os filtros se combinam", async () => {
    const { itens } = await listarPessoas(
      prisma,
      { papel: "CONSIGNATARIO", ativa: true },
      AGORA
    );
    expect(itens.map((i) => i.id)).toEqual(["p-gama"]);
  });

  it("o total é o da CONSULTA, não o da página", async () => {
    const pagina = await listarPessoas(prisma, { limite: 1 }, AGORA);
    expect(pagina.itens).toHaveLength(1);
    expect(pagina.total).toBe(3);

    const seguinte = await listarPessoas(prisma, { limite: 1, deslocamento: 1 }, AGORA);
    expect(seguinte.itens[0]?.id).not.toBe(pagina.itens[0]?.id);
    expect(seguinte.total).toBe(3);
  });

  it("página além do fim devolve lista vazia e total zero, sem estourar", async () => {
    const r = await listarPessoas(prisma, { deslocamento: 999 }, AGORA);
    expect(r.itens).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("busca que não casa nada devolve vazio — nunca a lista inteira", async () => {
    // O reflexo de tratar filtro sem resultado como "não filtrei" é o que transforma
    // uma pesquisa infrutífera na tabela toda.
    const r = await listarPessoas(prisma, { busca: "zzzzzz" }, AGORA);
    expect(r.itens).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A CONFRONTAÇÃO — SQL × domínio, sobre os mesmos dados
// ════════════════════════════════════════════════════════════════════════════

describe("M19 — a derivação em SQL concorda com a do domínio", () => {
  it("papel a papel, pessoa a pessoa", async () => {
    const { itens } = await listarPessoas(prisma, {}, AGORA);

    for (const item of itens) {
      const movimentos = await prisma.movimentoDePapelDaPessoa.findMany({
        where: { pessoaId: item.id },
        select: { papel: true, movimento: true, data: true, criadoEm: true },
      });

      const peloDominio = papeisVigentesEm(movimentos, AGORA);

      expect(
        [...item.papeis].sort(),
        `divergência em ${item.nome}: o SQL da listagem e o \`papeisVigentesEm\` ` +
          "discordam sobre os papéis vigentes. As duas derivações existem de propósito " +
          "(uma pagina no banco, a outra é pura) — mas TÊM de dar a mesma resposta."
      ).toEqual([...peloDominio].sort());
    }
  });

  it("e concorda também num instante PASSADO", async () => {
    // Em fevereiro, p-gama ainda era CREDOR (só foi encerrado em março).
    const quando = new Date("2026-02-20T00:00:00Z");
    const { itens } = await listarPessoas(prisma, {}, quando);

    const gama = itens.find((i) => i.id === "p-gama");
    expect(gama?.papeis).toContain("CREDOR");

    for (const item of itens) {
      const movimentos = await prisma.movimentoDePapelDaPessoa.findMany({
        where: { pessoaId: item.id },
        select: { papel: true, movimento: true, data: true, criadoEm: true },
      });
      expect([...item.papeis].sort()).toEqual(
        [...papeisVigentesEm(movimentos, quando)].sort()
      );
    }
  });
});
