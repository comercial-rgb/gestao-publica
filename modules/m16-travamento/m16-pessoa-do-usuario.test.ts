import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { PERFIL_EXECUCAO } from "../../test/usuarios-teste.js";
import { autorizar } from "./autorizacao.js";
import {
  desvincularPessoaDoUsuario,
  pessoaDoUsuario,
  vincularPessoaAoUsuario,
} from "./servico-pessoa-do-usuario.js";

/**
 * O VÍNCULO USUÁRIO ↔ PESSOA (V3, pacote 2) — explícito, opcional, auditável, sem permissão.
 *
 * FIXTURE N=2: duas pessoas homônimas ("João da Silva") com documentos diferentes — é o caso
 * que um vínculo por nome erraria, e o que prova que o vínculo é pelo documento.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "orcamento@cg.pb.gov.br"; // fixture ADMIN — tem VINCULAR_PESSOA_AO_USUARIO
const EXECUTOR = "executor.pessoa@cg.pb.gov.br";
const CPF_A = "11144477735";
const CPF_B = "52998224725";

let usuarioA = "";
let usuarioB = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  for (const [doc, nome] of [[CPF_A, "João da Silva"], [CPF_B, "João da Silva"]] as const) {
    await prisma.pessoa.create({
      data: { documento: doc, tipo: "FISICA", criadoPor: ADMIN, versoes: { create: { nome, criadoPor: ADMIN } } },
    });
  }
  const a = await prisma.usuario.create({ data: { identificador: "joao.a@cg.pb.gov.br", nome: "João A", criadoPor: ADMIN }, select: { id: true } });
  const b = await prisma.usuario.create({ data: { identificador: "joao.b@cg.pb.gov.br", nome: "João B", criadoPor: ADMIN }, select: { id: true } });
  usuarioA = a.id;
  usuarioB = b.id;
  const exec = await prisma.perfil.findFirstOrThrow({ where: { nome: PERFIL_EXECUCAO }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador: EXECUTOR, nome: EXECUTOR, criadoPor: ADMIN }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: exec.id, criadoPor: ADMIN } });
}

describe("vincular a pessoa ao usuário", () => {
  beforeEach(semear);

  it("vincula pelo DOCUMENTO (com máscara) — e dois homônimos não se confundem (N=2)", async () => {
    const r = await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: "111.444.777-35", motivo: "É o servidor da matrícula 1234.", criadoPor: ADMIN });
    expect(r.nome).toBe("João da Silva");
    const p = await pessoaDoUsuario(prisma, "joao.a@cg.pb.gov.br");
    expect(p).toMatchObject({ documento: CPF_A, nome: "João da Silva", vinculadaPor: ADMIN });
    // O homônimo de outro documento NÃO é o mesmo: o usuário B fica sem vínculo.
    expect(await pessoaDoUsuario(prisma, "joao.b@cg.pb.gov.br")).toBeNull();
    // ...e vincular B ao outro documento funciona — são duas pessoas.
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioB, documento: CPF_B, motivo: "É o servidor da matrícula 5678.", criadoPor: ADMIN });
    expect((await pessoaDoUsuario(prisma, "joao.b@cg.pb.gov.br"))?.documento).toBe(CPF_B);
  });

  it("recusa nomeando: documento ilegível, pessoa não cadastrada, já vinculado, outra pessoa, pessoa de outro usuário", async () => {
    await expect(vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: "123", motivo: "motivo qualquer", criadoPor: ADMIN })).rejects.toThrow(/DOCUMENTO ILEGÍVEL/);
    // V4 (§7): CNPJ não é identidade pessoal — um usuário se vincula ao SEU CPF (numérico ou alfanumérico, o CNPJ é recusado)
    await expect(vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: "11.222.333/0001-81", motivo: "motivo qualquer", criadoPor: ADMIN })).rejects.toThrow(/CNPJ NÃO É IDENTIDADE PESSOAL[\s\S]*REPRESENTACAO-DE-ORGANIZACAO-PELO-USUARIO/);
    await expect(vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: "12.ABC.345/01DE-35", motivo: "motivo qualquer", criadoPor: ADMIN })).rejects.toThrow(/CNPJ NÃO É IDENTIDADE PESSOAL/);
    await expect(vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: "00000000191", motivo: "motivo qualquer", criadoPor: ADMIN })).rejects.toThrow(/PESSOA NÃO CADASTRADA/);
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "primeiro vínculo", criadoPor: ADMIN });
    await expect(vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "de novo", criadoPor: ADMIN })).rejects.toThrow(/JÁ VINCULADO/);
    await expect(vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_B, motivo: "troca", criadoPor: ADMIN })).rejects.toThrow(/JÁ VINCULADO A OUTRA PESSOA/);
    await expect(vincularPessoaAoUsuario(prisma, { usuarioId: usuarioB, documento: CPF_A, motivo: "mesma pessoa", criadoPor: ADMIN })).rejects.toThrow(/PESSOA JÁ VINCULADA.*joao\.a/s);
    expect(await prisma.vinculoUsuarioPessoa.count()).toBe(1);
  });

  it("desvincular é linha nova (append-only); depois, a pessoa pode ir para outro usuário", async () => {
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "primeiro vínculo", criadoPor: ADMIN });
    await desvincularPessoaDoUsuario(prisma, { usuarioId: usuarioA, motivo: "o servidor mudou de conta", criadoPor: ADMIN });
    expect(await pessoaDoUsuario(prisma, "joao.a@cg.pb.gov.br")).toBeNull();
    expect(await prisma.vinculoUsuarioPessoa.count({ where: { usuarioId: usuarioA } })).toBe(2);
    await expect(desvincularPessoaDoUsuario(prisma, { usuarioId: usuarioA, motivo: "de novo", criadoPor: ADMIN })).rejects.toThrow(/SEM VÍNCULO/);
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioB, documento: CPF_A, motivo: "conta nova do mesmo servidor", criadoPor: ADMIN });
    expect((await pessoaDoUsuario(prisma, "joao.b@cg.pb.gov.br"))?.documento).toBe(CPF_A);
  });

  it("o vínculo NÃO concede permissão, e quem executa despesa não vincula (família de administração)", async () => {
    await expect(autorizar(prisma, "joao.a@cg.pb.gov.br", "REGISTRAR_MOVIMENTO_DE_GESTAO")).rejects.toThrow(/SEM PERFIL/);
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "vínculo", criadoPor: ADMIN });
    // Depois do vínculo, exatamente o mesmo: sem perfil, sem ação nenhuma.
    await expect(autorizar(prisma, "joao.a@cg.pb.gov.br", "REGISTRAR_MOVIMENTO_DE_GESTAO")).rejects.toThrow(/SEM PERFIL/);
    expect(await prisma.permissaoDePerfil.count({ where: { perfil: { vinculos: { some: { usuarioId: usuarioA } } } } })).toBe(0);
    // O executor (EXECUCAO não herda ADMINISTRACAO) é recusado nomeando a ação.
    await expect(vincularPessoaAoUsuario(prisma, { usuarioId: usuarioB, documento: CPF_B, motivo: "tentativa", criadoPor: EXECUTOR })).rejects.toThrow(/ACESSO NEGADO[\s\S]*VINCULAR_PESSOA_AO_USUARIO/);
  });

  it("cadastro antigo sem vínculo fica PENDENTE — nada é associado por aproximação", async () => {
    // Um usuário cujo nome é igual ao da pessoa: continua sem vínculo até alguém vincular.
    await prisma.usuario.create({ data: { identificador: "joao.silva@cg.pb.gov.br", nome: "João da Silva", criadoPor: ADMIN } });
    expect(await pessoaDoUsuario(prisma, "joao.silva@cg.pb.gov.br")).toBeNull();
  });
});
