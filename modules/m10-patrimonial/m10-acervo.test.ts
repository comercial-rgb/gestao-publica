import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  cadastrarBem,
  cadastrarClasseDeBens,
  cadastrarTipoDeIncorporacao,
} from "./gestao-do-bem.js";

/**
 * M10 — O ACERVO: CLASSE E BEM, CONTRA BANCO (ENT07).
 *
 * ⚠️ ESTES DOIS CASOS DE USO NÃO EXISTIAM. O modelo do bem é do começo do M10, mas só o seed
 * da POC e os testes criavam bens, por escrita crua: `adquirirBem` exige liquidação e
 * `registrarEntradaAvulsa` recebe um bem que JÁ existe. Faltava o ato de cadastrar.
 *
 * ⚠️ E NENHUM DOS DOIS TOCA O RAZÃO — o t3 prova contando `LancamentoContabil` e
 * `MovimentoPatrimonial` antes e depois. Cadastrar e AVALIAR são atos distintos: se cadastrar
 * criasse valor, todo bem nasceria com um lançamento que ninguém pediu, e a posição
 * patrimonial passaria a contar o acervo duas vezes — uma pelo cadastro, outra pela aquisição.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "patrimonio@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  // ⚠️ TRÊS CONTAS, E CADA UMA EXISTE PARA UMA NEGAÇÃO DIFERENTE. Uma fixture com só a
  // conta boa provaria o caminho feliz e deixaria as duas recusas sem sujeito.
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-ativo", codigo: "1.2.3.1.1.01.00", nome: "Bens móveis", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
      { id: "c-sintetica", codigo: "1.2.3.1.1", nome: "Bens móveis (sintética)", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, indicadorSuperavit: "P" },
      { id: "c-passivo", codigo: "2.1.1.1.1.01.00", nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, indicadorSuperavit: "F" },
    ],
  });

  const perfilVazio = await prisma.perfil.create({
    data: { nome: "SEM_PODERES", descricao: "Perfil sem permissão alguma", criadoPor: POR },
    select: { id: true },
  });
  const estagiario = await prisma.usuario.create({
    data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: estagiario.id, perfilId: perfilVazio.id, criadoPor: POR },
  });
}

beforeEach(semear);

const CLASSE_BOA = {
  codigo: "1.2.3",
  descricao: "Móveis e utensílios",
  especie: "MOVEL" as const,
  contaContabilAtivoId: "c-ativo",
  criadoPor: POR,
};

async function quantasClasses(): Promise<number> {
  return prisma.classeDeBens.count();
}

describe("t1 · a classe de bens, e a conta que ela aponta", () => {
  it("cadastra com conta ANALÍTICA do ativo, e grava o que foi informado", async () => {
    const { classeId } = await cadastrarClasseDeBens(prisma, CLASSE_BOA);

    const gravada = await prisma.classeDeBens.findUniqueOrThrow({
      where: { id: classeId },
      select: { codigo: true, descricao: true, especie: true, contaContabilAtivoId: true, ativa: true },
    });
    expect(gravada.codigo).toBe("1.2.3");
    expect(gravada.especie).toBe("MOVEL");
    expect(gravada.contaContabilAtivoId).toBe("c-ativo");
    expect(gravada.ativa).toBe(true);
  });

  it("⚠️ RECUSA conta SINTÉTICA nomeando o motivo — e nada fica gravado", async () => {
    const antes = await quantasClasses();
    await expect(
      cadastrarClasseDeBens(prisma, { ...CLASSE_BOA, contaContabilAtivoId: "c-sintetica" })
    ).rejects.toThrow(/é SINTÉTICA e não recebe lançamento/);
    expect(await quantasClasses()).toBe(antes);
  });

  it("⚠️ RECUSA conta fora do ATIVO nomeando o motivo — e nada fica gravado", async () => {
    const antes = await quantasClasses();
    await expect(
      cadastrarClasseDeBens(prisma, { ...CLASSE_BOA, contaContabilAtivoId: "c-passivo" })
    ).rejects.toThrow(/não é do ATIVO/);
    expect(await quantasClasses()).toBe(antes);
  });

  it("⚠️ RECUSA conta inexistente — a conferência vem ANTES da escrita", async () => {
    const antes = await quantasClasses();
    await expect(
      cadastrarClasseDeBens(prisma, { ...CLASSE_BOA, contaContabilAtivoId: "nao-existe" })
    ).rejects.toThrow(/não existe/);
    expect(await quantasClasses()).toBe(antes);
  });

  it("⚠️ RECUSA quem não tem a ação, nomeando a AÇÃO como o que faltou", async () => {
    await expect(
      cadastrarClasseDeBens(prisma, { ...CLASSE_BOA, criadoPor: SEM_PERMISSAO })
    ).rejects.toThrow(/não tem permissão para CADASTRAR_CLASSE_DE_BENS/);
    expect(await quantasClasses()).toBe(0);
  });
});

describe("t2 · o bem entra no acervo", () => {
  it("cadastra na classe ativa, com e sem tipo de incorporação", async () => {
    const { classeId } = await cadastrarClasseDeBens(prisma, CLASSE_BOA);
    const { tipoId } = await cadastrarTipoDeIncorporacao(prisma, {
      codigo: "INC-01",
      descricao: "Recebido em doação",
      criadoPor: POR,
    });

    const { bemId } = await cadastrarBem(prisma, {
      numeroTombamento: "TOMB-0001",
      descricao: "Armário de aço",
      classeDeBensId: classeId,
      dataAquisicao: new Date("2026-03-10T12:00:00Z"),
      tipoDeIncorporacaoId: tipoId,
      criadoPor: POR,
    });

    // ⚠️ N=2 — o segundo SEM tipo de incorporação, porque o campo é opcional e um cadastro
    // com N=1 não distingue "opcional" de "sempre informado por acaso".
    const { bemId: bem2 } = await cadastrarBem(prisma, {
      numeroTombamento: "TOMB-0002",
      descricao: "Mesa de reunião",
      classeDeBensId: classeId,
      dataAquisicao: new Date("2026-03-11T12:00:00Z"),
      criadoPor: POR,
    });

    const gravados = await prisma.bemPatrimonial.findMany({
      where: { id: { in: [bemId, bem2] } },
      select: { numeroTombamento: true, tipoDeIncorporacaoId: true, classeDeBensId: true },
      orderBy: { numeroTombamento: "asc" },
    });
    expect(gravados.map((b) => b.numeroTombamento)).toEqual(["TOMB-0001", "TOMB-0002"]);
    expect(gravados[0]?.tipoDeIncorporacaoId).toBe(tipoId);
    expect(gravados[1]?.tipoDeIncorporacaoId).toBeNull();
    expect(gravados.every((b) => b.classeDeBensId === classeId)).toBe(true);
  });

  it("⚠️ RECUSA tombamento repetido nomeando qual — e o primeiro bem continua lá", async () => {
    const { classeId } = await cadastrarClasseDeBens(prisma, CLASSE_BOA);
    const base = {
      descricao: "Armário de aço",
      classeDeBensId: classeId,
      dataAquisicao: new Date("2026-03-10T12:00:00Z"),
      criadoPor: POR,
    };
    await cadastrarBem(prisma, { ...base, numeroTombamento: "TOMB-0001" });

    await expect(
      cadastrarBem(prisma, { ...base, numeroTombamento: "TOMB-0001", descricao: "Outro bem" })
    ).rejects.toThrow(/Já existe bem com o tombamento TOMB-0001/);

    expect(await prisma.bemPatrimonial.count()).toBe(1);
  });

  it("⚠️ RECUSA classe DESATIVADA nomeando o efeito — bem invisível no relatório por classe", async () => {
    const { classeId } = await cadastrarClasseDeBens(prisma, CLASSE_BOA);
    await prisma.classeDeBens.update({ where: { id: classeId }, data: { ativa: false } });

    await expect(
      cadastrarBem(prisma, {
        numeroTombamento: "TOMB-0009",
        descricao: "Bem de classe morta",
        classeDeBensId: classeId,
        dataAquisicao: new Date("2026-03-10T12:00:00Z"),
        criadoPor: POR,
      })
    ).rejects.toThrow(/está DESATIVADA/);
    expect(await prisma.bemPatrimonial.count()).toBe(0);
  });

  it("⚠️ RECUSA classe e tipo de incorporação inexistentes", async () => {
    const { classeId } = await cadastrarClasseDeBens(prisma, CLASSE_BOA);
    const base = {
      numeroTombamento: "TOMB-0010",
      descricao: "Bem qualquer",
      dataAquisicao: new Date("2026-03-10T12:00:00Z"),
      criadoPor: POR,
    };

    await expect(
      cadastrarBem(prisma, { ...base, classeDeBensId: "nao-existe" })
    ).rejects.toThrow(/Classe de bens nao-existe não existe/);

    await expect(
      cadastrarBem(prisma, {
        ...base,
        classeDeBensId: classeId,
        tipoDeIncorporacaoId: "nao-existe",
      })
    ).rejects.toThrow(/Tipo de incorporação nao-existe não existe/);

    expect(await prisma.bemPatrimonial.count()).toBe(0);
  });

  it("⚠️ RECUSA quem não tem a ação — e a ação cobrada é a DO BEM, não a da classe", async () => {
    const { classeId } = await cadastrarClasseDeBens(prisma, CLASSE_BOA);
    await expect(
      cadastrarBem(prisma, {
        numeroTombamento: "TOMB-0011",
        descricao: "Bem sem permissão",
        classeDeBensId: classeId,
        dataAquisicao: new Date("2026-03-10T12:00:00Z"),
        criadoPor: SEM_PERMISSAO,
      })
    ).rejects.toThrow(/não tem permissão para CADASTRAR_BEM/);
    expect(await prisma.bemPatrimonial.count()).toBe(0);
  });
});

describe("t3 · cadastrar não é avaliar — o razão não se move", () => {
  it("⚠️ nem LancamentoContabil nem MovimentoPatrimonial nascem do cadastro", async () => {
    const lancamentosAntes = await prisma.lancamentoContabil.count();
    const movimentosAntes = await prisma.movimentoPatrimonial.count();

    const { classeId } = await cadastrarClasseDeBens(prisma, CLASSE_BOA);
    await cadastrarBem(prisma, {
      numeroTombamento: "TOMB-0100",
      descricao: "Bem sem valor atribuído",
      classeDeBensId: classeId,
      dataAquisicao: new Date("2026-03-10T12:00:00Z"),
      criadoPor: POR,
    });

    expect(await prisma.lancamentoContabil.count()).toBe(lancamentosAntes);
    expect(await prisma.movimentoPatrimonial.count()).toBe(movimentosAntes);

    // ⚠️ A OUTRA METADE DA AFIRMAÇÃO, contra vacuidade: o bem EXISTE e está sem valor —
    // não é que nada tenha acontecido, é que o que aconteceu não foi contábil.
    expect(await prisma.bemPatrimonial.count()).toBe(1);
  });
});
