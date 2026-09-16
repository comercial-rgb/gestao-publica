import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import {
  cadastrarLocalizacaoFisica,
  definirDivulgacaoDaLocalizacao,
  historicoDaDivulgacao,
} from "../modules/m10-patrimonial/gestao-do-bem.js";

/**
 * ═══ A POLÍTICA DE DIVULGAÇÃO DE UMA LOCALIZAÇÃO (V10 T3 · N2) ═══
 *
 * Fecha `LOCALIZACAO-PUBLICAVEL-SO-NA-CRIACAO`: a política só podia ser escolhida no cadastro.
 *
 * ⚠️ O QUE ESTE ARQUIVO IMPEDE:
 *   · **a publicação sem autor.** Divulgar "sala do cofre da tesouraria" é uma decisão, e uma
 *     coluna booleana responde "está divulgável hoje" e nada mais. Quem decidiu, quando e por
 *     quê são as três perguntas que se faz DEPOIS de um vazamento;
 *   · **o poder de carona.** Se a decisão usasse `CADASTRAR_LOCALIZACAO_FISICA`, todo mundo que
 *     mexe no cadastro patrimonial passaria a poder publicar endereço, em silêncio;
 *   · **o sucesso que não fez nada.** Repetir a mesma política é recusado: um aviso de sucesso
 *     faria quem clicou acreditar que mudou alguma coisa.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const POR = "patrimonio@cg.pb.gov.br";

async function localizacao(codigo: string, publicavel: boolean): Promise<string> {
  const r = await cadastrarLocalizacaoFisica(prisma, {
    codigo,
    descricao: `Deposito ${codigo}`,
    publicavelNaTransparencia: publicavel,
    criadoPor: POR,
  });
  return r.localizacaoId;
}

beforeEach(async () => {
  await limparBanco(prisma);
});

describe("a divulgação de uma localização se muda depois do cadastro", () => {
  it("L1: reservada vira divulgada, com autor, motivo e histórico", async () => {
    const id = await localizacao("DEP-01", false);

    const r = await definirDivulgacaoDaLocalizacao(prisma, {
      localizacaoId: id,
      publicavel: true,
      motivo: "Escola municipal — o endereco ja e publico e ajuda a localizar o bem",
      criadoPor: POR,
    });
    expect([r.de, r.para]).toEqual([false, true]);

    const atual = await prisma.localizacaoFisica.findUniqueOrThrow({
      where: { id },
      select: { publicavelNaTransparencia: true },
    });
    expect(atual.publicavelNaTransparencia).toBe(true);

    const h = await historicoDaDivulgacao(prisma, id);
    expect(h).toHaveLength(1);
    expect(h[0]?.de).toBe(false);
    expect(h[0]?.para).toBe(true);
    expect(h[0]?.criadoPor).toBe(POR);
    expect(h[0]?.motivo).toMatch(/Escola municipal/);
  });

  it("⚠️ L2: divulgada vira reservada — e o histórico guarda os DOIS fatos", async () => {
    // O caminho de volta é o que importa: um depósito que nunca deveria ter entrado no portal
    // precisa sair, e sair é um fato tão auditável quanto entrar.
    const id = await localizacao("DEP-02", true);
    await definirDivulgacaoDaLocalizacao(prisma, {
      localizacaoId: id, publicavel: false,
      motivo: "Deposito de provas — o lugar nao pode aparecer no portal publico",
      criadoPor: POR,
    });
    await definirDivulgacaoDaLocalizacao(prisma, {
      localizacaoId: id, publicavel: true,
      motivo: "O material sigiloso foi transferido; o lugar volta a poder aparecer",
      criadoPor: POR,
    });

    const h = await historicoDaDivulgacao(prisma, id);
    expect(h).toHaveLength(2);
    // ⚠️ APPEND-ONLY: o primeiro fato continua lá depois do segundo.
    expect(h.map((x) => [x.de, x.para])).toEqual([[false, true], [true, false]]);
    const atual = await prisma.localizacaoFisica.findUniqueOrThrow({ where: { id }, select: { publicavelNaTransparencia: true } });
    expect(atual.publicavelNaTransparencia).toBe(true);
  });

  it("⚠️ L3: repetir a MESMA política é recusado, e nada é gravado", async () => {
    const id = await localizacao("DEP-03", true);
    await expect(
      definirDivulgacaoDaLocalizacao(prisma, {
        localizacaoId: id, publicavel: true,
        motivo: "Tentativa de marcar como divulgavel o que ja esta divulgavel",
        criadoPor: POR,
      })
    ).rejects.toThrow(/DIVULGACAO-JA-NESSE-ESTADO/);
    expect(await historicoDaDivulgacao(prisma, id)).toHaveLength(0);
  });

  it("L4: motivo curto é recusado — a decisão precisa de explicação", async () => {
    const id = await localizacao("DEP-04", false);
    await expect(
      definirDivulgacaoDaLocalizacao(prisma, { localizacaoId: id, publicavel: true, motivo: "ok", criadoPor: POR })
    ).rejects.toThrow(/ao menos 10 caracteres|too_small|Diga por que/);
    expect(await historicoDaDivulgacao(prisma, id)).toHaveLength(0);
  });

  it("⚠️ L5: quem NÃO tem a ação própria não publica endereço — nem tendo a de cadastrar", async () => {
    const id = await localizacao("DEP-05", false);

    const perfil = await prisma.perfil.create({
      data: {
        nome: "CADASTRO PATRIMONIAL",
        descricao: "cadastra localizacao, mas nao decide o que vai ao portal",
        criadoPor: POR,
        permissoes: { create: [{ acao: "CADASTRAR_LOCALIZACAO_FISICA", criadoPor: POR }] },
      },
      select: { id: true },
    });
    const u = await prisma.usuario.create({
      data: { identificador: "cadastro.patrimonio@teste", nome: "Cadastro", criadoPor: POR },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });

    await expect(
      definirDivulgacaoDaLocalizacao(prisma, {
        localizacaoId: id, publicavel: true,
        motivo: "Tentativa de publicar o endereco com o cracha de cadastro",
        criadoPor: "cadastro.patrimonio@teste",
      })
    ).rejects.toThrow(/ACESSO NEGADO/);

    // ⚠️ NEGAÇÃO COM EFEITO: não basta "não completou". Nada mudou, e nada foi registrado.
    const atual = await prisma.localizacaoFisica.findUniqueOrThrow({ where: { id }, select: { publicavelNaTransparencia: true } });
    expect(atual.publicavelNaTransparencia).toBe(false);
    expect(await historicoDaDivulgacao(prisma, id)).toHaveLength(0);
  });

  it("L6: localização inexistente é recusada antes de qualquer escrita", async () => {
    await expect(
      definirDivulgacaoDaLocalizacao(prisma, {
        localizacaoId: "nao-existe", publicavel: true,
        motivo: "Tentativa de definir politica de lugar que nao existe",
        criadoPor: POR,
      })
    ).rejects.toThrow(/LOCALIZACAO-INEXISTENTE/);
    expect(await prisma.mudancaDaDivulgacaoDaLocalizacao.count()).toBe(0);
  });
});
