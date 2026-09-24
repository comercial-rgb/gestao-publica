import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  declararNaturezaDaFonte,
  exigirNaturezaDaFonte,
  listarNaturezasDeclaradas,
  naturezaVigenteDaFonte,
} from "./natureza-da-fonte.js";

/**
 * ═══ A NATUREZA DA FONTE — O ATO DO ENTE, CONTRA BANCO (V11 V9.3) ═══
 *
 * `CONTROLE-DDR-POR-NATUREZA-DA-FONTE`. O roteiro da arrecadação debitava `7.2.1.1.0.00.00`,
 * SINTÉTICA no `Pcasp_2025.xlsx`, e em instalação limpa **não havia arrecadação nenhuma**. A
 * correção tem duas metades: a perna do roteiro resolvida pela natureza (provada em
 * `m01-roteiros.test.ts` t9 e `m01-ddr.test.ts` t6/t7) e a correspondência fonte → natureza,
 * que é ATO DO ENTE — e é o que este arquivo mede.
 *
 * ⚠️ FIXTURE N=2, E AQUI ELA NÃO É DECORAÇÃO. Com uma fonte só, uma declaração que ignorasse o
 * `fonteCodigo` — gravando "a natureza do ente" em vez de "a natureza DAQUELA fonte" — passaria
 * por vacuidade: toda leitura acharia a única linha existente. Com 500 e 540 declaradas
 * diferente, o t2 acusa.
 *
 * ⚠️ E A NEGAÇÃO AFIRMA O MOTIVO. "Não deixou arrecadar" é compatível com um servidor que recusa
 * por qualquer outra razão; o t4 exige que a recusa NOMEIE a fonte que falta classificar.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const CONTABIL = "contabil@cg.pb.gov.br";
const SEM_CRACHA = "so.empenha.natureza@cg.pb.gov.br";
const FUNDAMENTO =
  "Lei municipal de diretrizes orcamentarias do exercicio, art. 12 — recurso sem vinculacao.";
const FUNDAMENTO_FUNDEB =
  "CF art. 212-A e Lei 14.113/2020 — recurso do FUNDEB, vinculado a manutencao do ensino.";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fnt-500", codigo: "500", descricao: "Recursos nao vinculados de impostos", codigoTce: "500" },
      { id: "fnt-540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });

  const p = await prisma.perfil.create({
    data: {
      nome: "CONTABILIDADE",
      descricao: "CONTABILIDADE",
      criadoPor: "SEED",
      permissoes: {
        create: [{ acao: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO" as never, criadoPor: "SEED" }],
      },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({
    data: { identificador: CONTABIL, nome: CONTABIL, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" },
  });

  // ⚠️ O ATOR DA NEGATIVA TEM CRACHÁ — o errado. Um usuário sem nenhuma permissão provaria só
  // que o sistema recusa desconhecido; o que se quer provar é que ESTA ação tem dono próprio.
  const outro = await prisma.perfil.create({
    data: {
      nome: "SO_EMPENHA",
      descricao: "SO_EMPENHA",
      criadoPor: "SEED",
      permissoes: { create: [{ acao: "EMPENHAR" as never, criadoPor: "SEED" }] },
    },
    select: { id: true },
  });
  const u2 = await prisma.usuario.create({
    data: { identificador: SEM_CRACHA, nome: SEM_CRACHA, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u2.id, perfilId: outro.id, criadoPor: "SEED" },
  });
}

beforeEach(semear, 120_000);

const declarar = (fonteCodigo: string, natureza: string, fundamento = FUNDAMENTO, por = CONTABIL) =>
  declararNaturezaDaFonte(prisma, {
    fonteCodigo,
    natureza: natureza as never,
    fundamento,
    criadoPor: por,
  });

describe("A natureza da fonte, para o controle da disponibilidade", () => {
  it("t1: sem declaração, a fonte NÃO tem natureza — e o sistema não a supõe", async () => {
    expect(await naturezaVigenteDaFonte(prisma, "500")).toBeNull();
    expect(await naturezaVigenteDaFonte(prisma, "540")).toBeNull();
    expect(await listarNaturezasDeclaradas(prisma)).toHaveLength(0);
  });

  it("t2: N=2 — cada fonte carrega a SUA natureza, e a conta de controle é a dela", async () => {
    await declarar("500", "ORDINARIOS");
    await declarar("540", "VINCULADOS", FUNDAMENTO_FUNDEB);

    const f500 = await naturezaVigenteDaFonte(prisma, "500");
    const f540 = await naturezaVigenteDaFonte(prisma, "540");

    // O esperado vem do `Pcasp_2025.xlsx`, escrito à mão — não do mapa que está sendo testado.
    expect(f500?.natureza).toBe("ORDINARIOS");
    expect(f500?.contaDeControle).toBe("7.2.1.1.1.00.00");
    expect(f540?.natureza).toBe("VINCULADOS");
    expect(f540?.contaDeControle).toBe("7.2.1.1.2.00.00");
    expect(f500?.contaDeControle).not.toBe(f540?.contaDeControle);

    // ⚠️ E O FUNDAMENTO É O DAQUELA FONTE — não o último gravado.
    expect(f500?.fundamento).toBe(FUNDAMENTO);
    expect(f540?.fundamento).toBe(FUNDAMENTO_FUNDEB);
  });

  it("t3: APPEND-ONLY — reclassificar cria versão, e a anterior continua no banco", async () => {
    await declarar("500", "ORDINARIOS");
    const r = await declarar("500", "VINCULADOS", FUNDAMENTO_FUNDEB);

    expect(r.versao).toBe(2);
    expect(r.anterior).toEqual({ natureza: "ORDINARIOS", versao: 1 });

    // A vigente é a de MAIOR versão…
    const vigente = await naturezaVigenteDaFonte(prisma, "500");
    expect(vigente?.natureza).toBe("VINCULADOS");
    expect(vigente?.versao).toBe(2);

    // …e a anterior NÃO foi reescrita: as duas linhas existem.
    const todas = await prisma.deParaFonteNaturezaDdr.findMany({
      where: { fonteCodigo: "500" },
      orderBy: { versao: "asc" },
      select: { versao: true, natureza: true, fundamento: true },
    });
    expect(todas).toEqual([
      { versao: 1, natureza: "ORDINARIOS", fundamento: FUNDAMENTO },
      { versao: 2, natureza: "VINCULADOS", fundamento: FUNDAMENTO_FUNDEB },
    ]);

    // E a listagem da tela mostra UMA linha por fonte — a vigente.
    const lista = await listarNaturezasDeclaradas(prisma);
    expect(lista.filter((l) => l.fonteCodigo === "500")).toHaveLength(1);
    expect(lista.find((l) => l.fonteCodigo === "500")?.versao).toBe(2);
  });

  it("t4: FAIL-CLOSED com MOTIVO — a recusa nomeia a fonte que falta classificar", async () => {
    await declarar("500", "ORDINARIOS");

    // A declarada passa…
    await expect(exigirNaturezaDaFonte(prisma, "500")).resolves.toMatchObject({
      natureza: "ORDINARIOS",
      contaDeControle: "7.2.1.1.1.00.00",
    });

    // …e a NÃO declarada recusa dizendo QUAL é, não "não configurado".
    await expect(exigirNaturezaDaFonte(prisma, "540")).rejects.toThrow(/FONTE 540/);
    await expect(exigirNaturezaDaFonte(prisma, "540")).rejects.toThrow(/natureza declarada/i);
    // E aponta o caminho — sem isso a pessoa fica com a recusa e sem o remédio.
    await expect(exigirNaturezaDaFonte(prisma, "540")).rejects.toThrow(
      /\/contabilidade\/natureza-das-fontes/
    );
  });

  it("t5: AUTORIZAÇÃO — quem não tem o crachá não declara, e nada fica gravado", async () => {
    await expect(declarar("500", "ORDINARIOS", FUNDAMENTO, SEM_CRACHA)).rejects.toThrow();
    expect(await prisma.deParaFonteNaturezaDdr.count()).toBe(0);

    // E o mesmo ato, com o crachá certo, passa — a negativa foi da PERMISSÃO, não da forma.
    await declarar("500", "ORDINARIOS");
    expect(await prisma.deParaFonteNaturezaDdr.count()).toBe(1);
  });

  it("t6: fonte fora do cadastro não se classifica — e a recusa a nomeia", async () => {
    await expect(declarar("999", "ORDINARIOS")).rejects.toThrow(/999/);
    expect(await prisma.deParaFonteNaturezaDdr.count()).toBe(0);
  });

  it("t7: redeclarar a MESMA natureza não é fato novo — e não cria versão", async () => {
    await declarar("500", "ORDINARIOS");
    await expect(declarar("500", "ORDINARIOS")).rejects.toThrow(/já está declarada/i);
    expect(await prisma.deParaFonteNaturezaDdr.count()).toBe(1);
  });

  it("t8: fundamento vazio ou curto é recusado — classificação sem porquê não se grava", async () => {
    await expect(declarar("500", "ORDINARIOS", "")).rejects.toThrow();
    await expect(declarar("500", "ORDINARIOS", "porque sim")).rejects.toThrow();
    expect(await prisma.deParaFonteNaturezaDdr.count()).toBe(0);
  });
});
