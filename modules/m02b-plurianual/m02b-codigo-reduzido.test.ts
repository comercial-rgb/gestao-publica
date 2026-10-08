import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { travar } from "../../packages/locks/index.js";
import { criarAcaoPpa } from "./servico.js";
import { gerarCodigosReduzidosDoPlano, listarCodigosReduzidos } from "./codigo-reduzido.js";

/**
 * V36 (TR 5.9.1.8) — O CÓDIGO REDUZIDO DA DESPESA DO PPA: automático no cadastro da ação, e o gerador para as que já
 * existiam. Fixture N=2: dois órgãos, duas unidades, dois programas; ações cadastradas fora da ordem da classificação.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const POR = "planejamento@cg.pb.gov.br";
const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    return (e as Error).message;
  }
  return "(não recusou)";
};

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.createMany({ data: [{ id: "o2", codigo: "02", nome: "Educação" }, { id: "o3", codigo: "03", nome: "Saúde" }] });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "u2", codigo: "02001", descricao: "Secretaria de Educação", orgaoId: "o2" }, { id: "u3", codigo: "03001", descricao: "Fundo de Saúde", orgaoId: "o3" }] });
  await prisma.funcao.createMany({ data: [{ id: "f10", codigo: "10", nome: "Saúde" }, { id: "f12", codigo: "12", nome: "Educação" }] });
  await prisma.subfuncao.createMany({ data: [{ id: "s301", codigo: "301", nome: "Atenção básica" }, { id: "s361", codigo: "361", nome: "Ensino fundamental" }] });
  await prisma.programa.createMany({ data: [{ id: "p12", codigo: "0012", descricao: "Educação de qualidade" }, { id: "p20", codigo: "0020", descricao: "Saúde em dia" }] });
  await prisma.acao.createMany({ data: [{ id: "a2001", codigo: "2001", descricao: "Manutenção do ensino", tipo: "ATIVIDADE" }, { id: "a1001", codigo: "1001", descricao: "Construção de escola", tipo: "PROJETO" }, { id: "a2010", codigo: "2010", descricao: "Atenção básica", tipo: "ATIVIDADE" }] });
  await prisma.planoPlurianual.create({ data: { id: "ppa", anoInicio: 2026, anoFim: 2029, leiRef: "Lei 1/2025", dataPublicacao: new Date("2025-12-20T15:00:00Z"), criadoPor: POR } });
  await prisma.eixoEstruturante.create({ data: { id: "eixo", codigo: "E1", descricao: "Eixo", criadoPor: POR } });
  await prisma.areaTematica.create({ data: { id: "area", codigo: "A1", descricao: "Área", eixoId: "eixo", criadoPor: POR } });
  await prisma.programaPpa.createMany({
    data: [
      { id: "pp12", planoId: "ppa", programaId: "p12", areaTematicaId: "area", valorPrevisto: "1000.00", criadoPor: POR },
      { id: "pp20", planoId: "ppa", programaId: "p20", areaTematicaId: "area", valorPrevisto: "1000.00", criadoPor: POR },
    ],
  });
}, 120000);

const acao = (programaPpaId: string, acaoId: string, unidadeExecutoraId: string, funcaoId: string, subfuncaoId: string, criadoPor = POR) =>
  criarAcaoPpa(prisma, { programaPpaId, acaoId, unidadeExecutoraId, funcaoId, subfuncaoId, produto: "Produto da ação", unidadeMedida: "un", metaFisica: "10", metaFinanceira: "100.00", criadoPor });

describe("M02b — código reduzido da despesa do PPA", () => {
  it("t1: a ação nasce com o código, sequencial no plano (N=2), e a lista mostra a classificação inteira", async () => {
    const a = await acao("pp20", "a2010", "u3", "f10", "s301");
    const b = await acao("pp12", "a2001", "u2", "f12", "s361");
    expect([a.codigoReduzido, b.codigoReduzido]).toEqual([1, 2]);
    const l = await listarCodigosReduzidos(prisma, "ppa");
    expect(l.map((c) => `${String(c.numero)}=${c.classificacao}`)).toEqual(["1=03.03001.10.301.0020.2010", "2=02.02001.12.361.0012.2001"]);
    expect(l[1]).toMatchObject({ unidade: "02001 — Secretaria de Educação", acao: "2001 — Manutenção do ensino" });
  });

  it("t2: o gerador atribui às ações antigas na ordem da classificação, depois dos números já dados; a sem classificação fica nomeada; rodar de novo não muda nada", async () => {
    await acao("pp20", "a2010", "u3", "f10", "s301"); // código 1
    // Ações cadastradas antes do código (sem ele), fora da ordem; uma sem subfunção.
    await prisma.acaoPpa.createMany({
      data: [
        { programaPpaId: "pp12", acaoId: "a2001", unidadeExecutoraId: "u2", funcaoId: "f12", subfuncaoId: "s361", produto: "Ensino", unidadeMedida: "un", metaFisica: "1", metaFinanceira: "1.00", criadoPor: POR },
        { programaPpaId: "pp12", acaoId: "a1001", unidadeExecutoraId: "u2", funcaoId: "f12", subfuncaoId: "s361", produto: "Escola", unidadeMedida: "un", metaFisica: "1", metaFinanceira: "1.00", criadoPor: POR },
        { programaPpaId: "pp20", acaoId: "a1001", unidadeExecutoraId: "u3", funcaoId: "f10", subfuncaoId: null, produto: "Posto", unidadeMedida: "un", metaFisica: "1", metaFinanceira: "1.00", criadoPor: POR },
      ],
    });
    const r = await gerarCodigosReduzidosDoPlano(prisma, { planoId: "ppa", criadoPor: POR });
    expect([r.atribuidos, r.jaTinham]).toEqual([2, 1]);
    expect(r.semClassificacao).toEqual(["ação 1001 do programa 0020 (Posto): falta subfunção"]);
    const l = await listarCodigosReduzidos(prisma, "ppa");
    // 02... vem antes de 03..., e dentro dele a ação 1001 antes da 2001: os números 2 e 3 seguem a classificação.
    expect(l.map((c) => `${String(c.numero)}=${c.classificacao}`)).toEqual(["1=03.03001.10.301.0020.2010", "2=02.02001.12.361.0012.1001", "3=02.02001.12.361.0012.2001"]);
    const de_novo = await gerarCodigosReduzidosDoPlano(prisma, { planoId: "ppa", criadoPor: POR });
    expect([de_novo.atribuidos, de_novo.jaTinham]).toEqual([0, 3]);
    expect(await prisma.codigoReduzidoDaDespesaPpa.count()).toBe(3);
  });

  it("t3: duas ações cadastradas ao mesmo tempo — a segunda espera a trava do plano e recebe o número seguinte", async () => {
    let pegou = (): void => undefined;
    let liberar = (): void => undefined;
    const pronto = new Promise<void>((r) => (pegou = r));
    const segura = new Promise<void>((r) => (liberar = r));
    const primeira = prisma.$transaction(
      async (tx) => {
        await travar(tx, "PlanoPlurianual", ["ppa"]);
        await tx.codigoReduzidoDaDespesaPpa.create({ data: { planoId: "ppa", numero: 1, unidadeExecutoraId: "u3", funcaoId: "f10", subfuncaoId: "s301", programaId: "p20", acaoId: "a2010", criadoPor: POR } });
        pegou();
        await segura;
      },
      { timeout: 60000 }
    );
    await pronto;
    const segunda = acao("pp12", "a2001", "u2", "f12", "s361").then((r) => r.codigoReduzido, (e: unknown) => (e as Error).message);
    let vista = false;
    for (let i = 0; i < 400 && !vista; i += 1) {
      const [l] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND datname = current_database()`;
      vista = (l?.n ?? 0n) > 0n;
      if (!vista) await new Promise((r) => setTimeout(r, 25));
    }
    liberar();
    await primeira;
    expect(vista, "a segunda atribuição não chegou a esperar a trava do plano").toBe(true);
    expect(await segunda).toBe(2);
  });

  it("t4: quem só consulta o planejamento não gera os códigos; a recusa nomeia a ação", async () => {
    const u = await prisma.usuario.create({ data: { identificador: "so.le.ppa@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_PPA", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_PLANEJAMENTO" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => gerarCodigosReduzidosDoPlano(prisma, { planoId: "ppa", criadoPor: "so.le.ppa@cg.pb.gov.br" }))).toMatch(/CADASTRAR_PROGRAMA_PPA/);
    expect(await recusa(() => acao("pp12", "a2001", "u2", "f12", "s361", "so.le.ppa@cg.pb.gov.br"))).toMatch(/CADASTRAR_PROGRAMA_PPA/);
    expect(await prisma.codigoReduzidoDaDespesaPpa.count()).toBe(0);
  });

  it("t5: a ordem da classificação compara os algarismos como números — o órgão 9 vem antes do 10", async () => {
    await prisma.orgao.createMany({ data: [{ id: "o9", codigo: "9", nome: "Nove" }, { id: "o10", codigo: "10", nome: "Dez" }] });
    await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "u9", codigo: "9001", descricao: "Unidade nove", orgaoId: "o9" }, { id: "u10", codigo: "10001", descricao: "Unidade dez", orgaoId: "o10" }] });
    await prisma.acaoPpa.createMany({
      data: [
        { programaPpaId: "pp12", acaoId: "a2001", unidadeExecutoraId: "u10", funcaoId: "f12", subfuncaoId: "s361", produto: "Dez", unidadeMedida: "un", metaFisica: "1", metaFinanceira: "1.00", criadoPor: POR },
        { programaPpaId: "pp20", acaoId: "a2001", unidadeExecutoraId: "u9", funcaoId: "f12", subfuncaoId: "s361", produto: "Nove", unidadeMedida: "un", metaFisica: "1", metaFinanceira: "1.00", criadoPor: POR },
      ],
    });
    await gerarCodigosReduzidosDoPlano(prisma, { planoId: "ppa", criadoPor: POR });
    expect((await listarCodigosReduzidos(prisma, "ppa")).map((c) => `${String(c.numero)}=${c.classificacao.split(".")[0] ?? ""}`)).toEqual(["1=9", "2=10"]);
  });
});
