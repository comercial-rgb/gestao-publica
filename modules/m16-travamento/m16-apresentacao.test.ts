import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { PERFIL_EXECUCAO } from "../../test/usuarios-teste.js";
import {
  apresentacaoVigente,
  historicoDaApresentacao,
  imagemDaApresentacaoVigente,
  registrarApresentacaoDoEnte,
  tipoDaImagem,
  TETO_DA_IMAGEM,
} from "./apresentacao-do-ente.js";
import { derivarApresentacaoDoEnte } from "./atualizacoes-de-permissoes.js";
import { AREA_DA_ACAO } from "../../lib/portas/navegacao-permissoes.js";

/**
 * ═══ A APRESENTAÇÃO DO ENTE (V6 P0.1) — o que ela prova ═══
 *   · versionada, append-only: a segunda gravação é a versão 2, e a vigente é ela;
 *   · autorização no servidor: sem CONFIGURAR_APRESENTACAO_DO_ENTE, recusa nomeando a ação;
 *   · fail-closed sem ente: sem `EnteConfig`, recusa dizendo o que semear;
 *   · a imagem é validada pelos BYTES (PNG/JPEG), não pela extensão; SVG não entra; teto de 256 KiB;
 *   · a projeção pública NÃO carrega CNPJ, CPF de responsável nem bytes;
 *   · concorrência (N=2): duas gravações ao mesmo tempo produzem versões DISTINTAS — nunca duas "vigentes".
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const ADMIN = "orcamento@cg.pb.gov.br"; // fixture com o perfil ADMIN (todas as ações)
const SEM_A_ACAO = "sem-apresentacao@teste.local";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');

async function semearEnte(): Promise<void> {
  await prisma.enteConfig.create({
    data: {
      id: "unico", codigoIbge: "2504009", poderOrgao: "20111", nome: "MUNICIPIO DE TESTE", cnpj: "12345678000199", uf: "PB",
      nomeOrdenador: "ORDENADOR", cpfOrdenador: "11144477735",
      tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-federal", conferidoPor: "TESTE", conferidoEm: new Date(),
    },
  });
}

async function usuarioComPerfil(email: string, nomePerfil: string): Promise<void> {
  const perfil = await prisma.perfil.findFirstOrThrow({ where: { nome: nomePerfil }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador: email, nome: email, ativo: true, criadoPor: "TESTE" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" } });
}

const BASE = {
  nomeDeExibicao: "Prefeitura Municipal de Teste",
  tema: "PADRAO" as const,
  manterImagem: true,
  canalTransparencia: true,
  canalConsultaPublica: false,
  criadoPor: ADMIN,
};

describe("M16 — apresentação do ente (V6 P0.1)", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: sem ente semeado, a vigente é null e registrar recusa dizendo o que semear", async () => {
    expect(await apresentacaoVigente(prisma)).toBeNull();
    await expect(registrarApresentacaoDoEnte(prisma, BASE)).rejects.toThrow(/ENTE NÃO CONFIGURADO.*Semeie/);
    expect(await historicoDaApresentacao(prisma)).toHaveLength(0);
  });

  it("t2: com ente e sem apresentação, a vigente continua null (identidade neutra) — nunca uma prefeitura ao acaso", async () => {
    await semearEnte();
    expect(await apresentacaoVigente(prisma)).toBeNull();
  });

  it("t3: versionada e append-only — a segunda gravação é a versão 2 e passa a ser a vigente; a 1 continua no histórico", async () => {
    await semearEnte();
    const v1 = await registrarApresentacaoDoEnte(prisma, BASE);
    expect(v1.numero).toBe(1);
    const v2 = await registrarApresentacaoDoEnte(prisma, { ...BASE, nomeDeExibicao: "Prefeitura Renomeada", orgao: "Secretaria de Finanças", canalConsultaPublica: true });
    expect(v2.numero).toBe(2);

    const vigente = await apresentacaoVigente(prisma);
    expect(vigente?.numero).toBe(2);
    expect(vigente?.nomeDeExibicao).toBe("Prefeitura Renomeada");
    expect(vigente?.orgao).toBe("Secretaria de Finanças");
    expect(vigente?.canalConsultaPublica).toBe(true);
    expect(vigente?.ente).toEqual({ nome: "MUNICIPIO DE TESTE", uf: "PB", codigoIbge: "2504009" });
    expect(vigente?.criadoPor).toBe(ADMIN);

    const historico = await historicoDaApresentacao(prisma);
    expect(historico.map((h) => h.numero)).toEqual([2, 1]);
    // A versão 1 NÃO foi tocada: append-only.
    const linha1 = await prisma.versaoDaApresentacaoDoEnte.findUniqueOrThrow({ where: { enteId_numero: { enteId: "unico", numero: 1 } } });
    expect(linha1.nomeDeExibicao).toBe("Prefeitura Municipal de Teste");
  });

  it("t4: a projeção pública NÃO carrega CNPJ, CPF de responsável nem bytes de imagem", async () => {
    await semearEnte();
    await registrarApresentacaoDoEnte(prisma, { ...BASE, imagem: PNG });
    const vigente = await apresentacaoVigente(prisma);
    const chaves = JSON.stringify(vigente);
    expect(chaves).not.toContain("12345678000199");
    expect(chaves).not.toContain("11144477735");
    expect(chaves).not.toContain("imagem\":");
    expect(vigente?.temImagem).toBe(true);
    const img = await imagemDaApresentacaoVigente(prisma);
    expect(img?.mime).toBe("image/png");
    expect(Buffer.from(img?.bytes ?? []).equals(Buffer.from(PNG))).toBe(true);
  });

  it("t5: autorização no servidor — sem CONFIGURAR_APRESENTACAO_DO_ENTE a recusa nomeia a ação, e nada é gravado", async () => {
    await semearEnte();
    await usuarioComPerfil(SEM_A_ACAO, PERFIL_EXECUCAO);
    await expect(registrarApresentacaoDoEnte(prisma, { ...BASE, criadoPor: SEM_A_ACAO })).rejects.toThrow(/CONFIGURAR_APRESENTACAO_DO_ENTE/);
    expect(await prisma.versaoDaApresentacaoDoEnte.count()).toBe(0);
  });

  it("t6: a imagem é validada pelos BYTES — SVG recusado, JPEG aceito, PNG com extensão errada aceito, teto de 256 KiB", async () => {
    await semearEnte();
    expect(tipoDaImagem(SVG)).toBeNull();
    expect(tipoDaImagem(PNG)).toBe("image/png");
    expect(tipoDaImagem(JPEG)).toBe("image/jpeg");
    await expect(registrarApresentacaoDoEnte(prisma, { ...BASE, imagem: SVG })).rejects.toThrow(/IMAGEM RECUSADA.*PNG ou JPEG/);
    const grande = new Uint8Array(TETO_DA_IMAGEM + 1);
    grande.set(PNG, 0);
    await expect(registrarApresentacaoDoEnte(prisma, { ...BASE, imagem: grande })).rejects.toThrow(/IMAGEM RECUSADA.*teto/);
    expect(await prisma.versaoDaApresentacaoDoEnte.count()).toBe(0);
    await registrarApresentacaoDoEnte(prisma, { ...BASE, imagem: JPEG });
    expect((await imagemDaApresentacaoVigente(prisma))?.mime).toBe("image/jpeg");
  });

  it("t7: sem imagem nova, `manterImagem` herda a anterior; `false` deixa a versão sem imagem", async () => {
    await semearEnte();
    await registrarApresentacaoDoEnte(prisma, { ...BASE, imagem: PNG });
    await registrarApresentacaoDoEnte(prisma, { ...BASE, manterImagem: true });
    expect((await apresentacaoVigente(prisma))?.temImagem).toBe(true);
    await registrarApresentacaoDoEnte(prisma, { ...BASE, manterImagem: false });
    expect((await apresentacaoVigente(prisma))?.temImagem).toBe(false);
    expect(await imagemDaApresentacaoVigente(prisma)).toBeNull();
  });

  it("t8: validação — nome curto, sítio sem https e tema fora do conjunto são recusados antes de gravar", async () => {
    await semearEnte();
    await expect(registrarApresentacaoDoEnte(prisma, { ...BASE, nomeDeExibicao: "PM" })).rejects.toThrow(/3 caracteres/);
    await expect(registrarApresentacaoDoEnte(prisma, { ...BASE, sitio: "http://prefeitura.gov.br" })).rejects.toThrow(/https/);
    await expect(registrarApresentacaoDoEnte(prisma, { ...BASE, tema: "NEON" as never })).rejects.toThrow();
    expect(await prisma.versaoDaApresentacaoDoEnte.count()).toBe(0);
  });

  it("t9 (N=2): duas gravações concorrentes produzem versões DISTINTAS — a vigente é uma só, e a recusa (se houver) nomeia a concorrência", async () => {
    await semearEnte();
    const resultados = await Promise.allSettled([
      registrarApresentacaoDoEnte(prisma, { ...BASE, nomeDeExibicao: "Concorrente A" }),
      registrarApresentacaoDoEnte(prisma, { ...BASE, nomeDeExibicao: "Concorrente B" }),
    ]);
    const ok = resultados.filter((r): r is PromiseFulfilledResult<{ readonly versaoId: string; readonly numero: number }> => r.status === "fulfilled");
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    // Ou as duas entraram com números diferentes, ou uma foi recusada por concorrência — nunca duas com o mesmo número.
    const numeros = ok.map((r) => r.value.numero);
    expect(new Set(numeros).size).toBe(numeros.length);
    for (const f of falhas) expect(String(f.reason)).toMatch(/CONCORRÊNCIA/);
    expect(await prisma.versaoDaApresentacaoDoEnte.count()).toBe(ok.length);
    const vigente = await apresentacaoVigente(prisma);
    expect(vigente?.numero).toBe(Math.max(...numeros));
  });

  it("t10: a v7 deriva CONFIGURAR_APRESENTACAO_DO_ENTE só para quem concede ação a perfil no GLOBAL, e é idempotente", () => {
    const perfis = [
      { id: "adm", nome: "ADM", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null }] },
      { id: "adm-ug", nome: "ADM-UG", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: "ug-a" }] },
      { id: "exec", nome: "EXEC", permissoes: [{ acao: "EMPENHAR", unidadeOrcId: null }] },
      { id: "ja", nome: "JA", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null }, { acao: "CONFIGURAR_APRESENTACAO_DO_ENTE", unidadeOrcId: null }] },
    ];
    const derivadas = derivarApresentacaoDoEnte(perfis, AREA_DA_ACAO);
    expect(derivadas).toEqual([{ perfilId: "adm", perfilNome: "ADM", acao: "CONFIGURAR_APRESENTACAO_DO_ENTE", unidadeOrcId: null }]);
  });
});
