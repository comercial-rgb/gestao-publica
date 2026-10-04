import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { listarNaturezasDeclaradas } from "../m01-core-contabil/natureza-da-fonte.js";
import { carregarTabelaDeFontes, lerTabelaDeFontes, naturezaDoBloco } from "./fontes-oficiais.js";

/**
 * ═══ A TABELA OFICIAL DE FONTES — LEITURA E CARGA (V35, onda A1) ═══
 *
 * ⚠️ O LEITOR NÃO SE CONFERE CONTRA ELE MESMO. A conferência dos nomes usa outra publicação: os dados abertos do
 * TCE-PB de 2026 de Esperança (`docs/oficial/tce-pb/esperanca-078/fontes-2026-DERIVADO.csv`), onde o próprio
 * município declarou ao Tribunal o código e o nome de cada fonte que usa. Um leitor que trocasse colunas, cortasse
 * nomes ou deslocasse linhas erraria os nomes de 30 fontes de outra fonte de dados.
 *
 * ⚠️ N=2 NA NATUREZA: a carga declara naturezas DIFERENTES por bloco (500 ordinária, 540 vinculada, 869
 * extraorçamentária). Uma carga que gravasse uma natureza só para todas passaria com uma fonte.
 */

const RAIZ = resolve(import.meta.dirname, "../..");
const XLSX = readFileSync(resolve(RAIZ, "docs/oficial/stn-sof/fonte-ou-destinacao-de-recursos-2026.xlsx"));
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const QUEM_CARREGA = "contador.fontes@cg.pb.gov.br";
const SO_EMPENHA = "so.empenha.fontes@cg.pb.gov.br";

async function usuario(identificador: string, acoes: readonly string[]): Promise<void> {
  const p = await prisma.perfil.create({
    data: { nome: identificador, descricao: identificador, criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

describe("m02 — tabela oficial de fontes (V35)", () => {
  it("t1: o leitor confere com os nomes que o município declarou ao TCE-PB (fonte independente)", () => {
    const t = lerTabelaDeFontes(XLSX);
    const porCodigo = new Map(t.fontes.map((f) => [f.codigo, f]));
    const tce = readFileSync(resolve(RAIZ, "docs/oficial/tce-pb/esperanca-078/fontes-2026-DERIVADO.csv"), "utf8")
      .split(/\r?\n/)
      .slice(1)
      .filter((l) => l.trim() !== "")
      .map((l) => l.split(";"));
    expect(tce.length).toBe(30);
    const normal = (s: string): string => s.replace(/\s+/g, " ").replace(/\.$/, "").trim().toLowerCase();
    for (const [codigo, nome] of tce) {
      const f = porCodigo.get(codigo!);
      expect(f, `fonte ${codigo!} ausente da tabela da STN`).toBeDefined();
      expect(normal(f!.nomenclatura), `nome da fonte ${codigo!}`).toBe(normal(nome!));
    }
    // valores à mão, lidos do arquivo aberto na planilha: 98 fontes principais na aba FR (a 863 da aba de síntese é a mesma da FR), CO 1001 do MDE
    expect(t.fontes.length).toBe(98);
    expect(t.cos.find((c) => c.codigo === "1001")?.nomenclatura).toBe("Identificação das despesas com manutenção e desenvolvimento do ensino");
    expect(porCodigo.get("540")?.bloco).toBe("RECURSOS VINCULADOS À EDUCAÇÃO");
  });

  it("t2: a natureza segue o bloco oficial; 898 (a classificar) fica sem natureza", () => {
    const t = lerTabelaDeFontes(XLSX);
    const n = (c: string): string | null => naturezaDoBloco(t.fontes.find((f) => f.codigo === c)!);
    expect(n("500")).toBe("ORDINARIOS");
    expect(n("540")).toBe("VINCULADOS");
    expect(n("600")).toBe("VINCULADOS");
    expect(n("800")).toBe("VINCULADOS");
    expect(n("869")).toBe("EXTRAORCAMENTARIOS");
    expect(n("898")).toBeNull();
    // nenhuma fonte cai fora de um bloco que o mapeamento conheça, além da 898
    expect(t.fontes.filter((f) => naturezaDoBloco(f) === null).map((f) => f.codigo)).toEqual(["898"]);
  });

  describe("contra banco", () => {
    beforeEach(async () => {
      await limparBanco(prisma);
      await usuario(QUEM_CARREGA, ["CADASTRAR_LOA", "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO"]);
      await usuario(SO_EMPENHA, ["EMPENHAR"]);
    });

    it("t3: a carga cria fontes, CO e naturezas; a segunda carga não cria nada; a divergência sai nomeada sem regravar", async () => {
      // uma fonte já cadastrada com outro nome e outra natureza: o cadastro do ente prevalece
      await prisma.fonteRecurso.create({ data: { codigo: "540", descricao: "FUNDEB (nome local)", codigoTce: "540" } });
      const r1 = await carregarTabelaDeFontes(prisma, { conteudo: XLSX, origem: "teste", criadoPor: QUEM_CARREGA });
      expect(r1.fontesCriadas.length).toBe(97);
      expect(r1.fontesDivergentes).toEqual([{ codigo: "540", noCadastro: "FUNDEB (nome local)", naTabela: "Transferências do FUNDEB - Impostos e Transferências de Impostos" }]);
      expect(await prisma.fonteRecurso.count()).toBe(98);
      expect((await prisma.fonteRecurso.findUnique({ where: { codigo: "540" } }))?.descricao).toBe("FUNDEB (nome local)");
      expect(r1.cosCriados.length).toBeGreaterThan(40);
      expect(r1.semNatureza).toEqual(["898"]);

      const naturezas = new Map((await listarNaturezasDeclaradas(prisma)).map((n) => [n.fonteCodigo, n]));
      expect(naturezas.get("500")?.natureza).toBe("ORDINARIOS");
      expect(naturezas.get("540")?.natureza).toBe("VINCULADOS");
      expect(naturezas.get("869")?.natureza).toBe("EXTRAORCAMENTARIOS");
      expect(naturezas.get("500")?.fundamento).toMatch(/RECURSOS LIVRES/);

      const r2 = await carregarTabelaDeFontes(prisma, { conteudo: XLSX, origem: "teste", criadoPor: QUEM_CARREGA });
      expect(r2.fontesCriadas).toEqual([]);
      expect(r2.cosCriados).toEqual([]);
      expect(r2.naturezasDeclaradas).toEqual([]);
      expect(await prisma.fonteRecurso.count()).toBe(98);
    });

    it("t4: quem não cadastra a LOA é recusado, com o motivo, e nada é gravado", async () => {
      await expect(carregarTabelaDeFontes(prisma, { conteudo: XLSX, origem: "teste", criadoPor: SO_EMPENHA })).rejects.toThrow(/CADASTRAR_LOA/);
      expect(await prisma.fonteRecurso.count()).toBe(0);
      expect(await prisma.codigoAcompanhamento.count()).toBe(0);
    });

    it("t5: arquivo que não é a tabela da STN é recusado antes de gravar", async () => {
      const outro = readFileSync(resolve(RAIZ, "docs/oficial/tce-pb/subelementos_2026.xlsx"));
      await expect(carregarTabelaDeFontes(prisma, { conteudo: outro, origem: "teste", criadoPor: QUEM_CARREGA })).rejects.toThrow(/não/);
      expect(await prisma.fonteRecurso.count()).toBe(0);
    });
  });
});
