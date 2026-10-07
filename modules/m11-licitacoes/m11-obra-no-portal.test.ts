import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { anexarArquivo, baixarAnexoPublicoDaObra } from "../m22-documentos/anexos.js";
import { obraNoPortal, obrasNoPortal, publicarObraNoPortal } from "./obra-no-portal.js";

/**
 * V36 — A OBRA NO PORTAL DA TRANSPARÊNCIA (TR 5.10.1.54). N=2 obras, cada uma com um anexo: só a publicada aparece e
 * só o anexo dela sai sem sessão; retirada, as duas somem do portal; o ato que não muda nada é recusado; quem não
 * cadastra obra não publica. E o anexo de obra entra pelo M22 com o dono único de sempre.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "obras@cg.pb.gov.br";
const PDF = (t: string) => new TextEncoder().encode(`%PDF-1.4\n% ${t}\n`);

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

let anexoA = "";
let anexoB = "";

describe("M11 V36 — a obra no portal da transparência", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.obra.createMany({
      data: [
        { id: "obra-a", identificador: "OBR-A", descricao: "Pavimentação da Rua A", tipoObraServico: "PAVIMENTACAO_ASFALTICA", criadoPor: POR },
        { id: "obra-b", identificador: "OBR-B", descricao: "Reforma da praça B", tipoObraServico: "PAVIMENTACAO_ASFALTICA", criadoPor: POR },
      ],
    });
    anexoA = (await anexarArquivo(prisma, { nomeOriginal: "projeto-a.pdf", mimeType: "application/pdf", conteudo: PDF("projeto A"), obraId: "obra-a", criadoPor: POR })).anexoId;
    anexoB = (await anexarArquivo(prisma, { nomeOriginal: "projeto-b.pdf", mimeType: "application/pdf", conteudo: PDF("projeto B"), obraId: "obra-b", criadoPor: POR })).anexoId;
  }, 60000);

  it("t1: só a obra publicada aparece, com o anexo dela; a outra responde como inexistente, e o anexo dela também", async () => {
    await publicarObraNoPortal(prisma, { obraId: "obra-a", publicar: true, criadoPor: POR });
    expect((await obrasNoPortal(prisma)).map((o) => [o.identificador, o.anexos.map((a) => a.nome)])).toEqual([["OBR-A", ["projeto-a.pdf"]]]);
    expect(await obraNoPortal(prisma, "obra-b")).toBeNull();
    const baixado = await baixarAnexoPublicoDaObra(prisma, anexoA);
    expect(new TextDecoder().decode(baixado?.conteudo)).toContain("projeto A");
    expect(await baixarAnexoPublicoDaObra(prisma, anexoB)).toBeNull();
  });

  it("t2: retirada (com o motivo), a obra e o anexo saem do portal; publicar de novo volta; o histórico fica", async () => {
    await publicarObraNoPortal(prisma, { obraId: "obra-a", publicar: true, criadoPor: POR });
    await publicarObraNoPortal(prisma, { obraId: "obra-a", publicar: false, motivo: "Projeto em revisão pela engenharia", criadoPor: POR });
    expect(await obrasNoPortal(prisma)).toEqual([]);
    expect(await baixarAnexoPublicoDaObra(prisma, anexoA)).toBeNull();
    await publicarObraNoPortal(prisma, { obraId: "obra-a", publicar: true, criadoPor: POR });
    expect((await obrasNoPortal(prisma)).map((o) => o.identificador)).toEqual(["OBR-A"]);
    expect(await prisma.publicacaoDaObra.count({ where: { obraId: "obra-a" } })).toBe(3);
  });

  it("t3: recusas com o motivo — publicar a publicada, retirar sem motivo, quem não cadastra obra", async () => {
    await publicarObraNoPortal(prisma, { obraId: "obra-a", publicar: true, criadoPor: POR });
    expect(await recusa(() => publicarObraNoPortal(prisma, { obraId: "obra-a", publicar: true, criadoPor: POR }))).toMatch(/OBR-A já está no portal/);
    expect(await recusa(() => publicarObraNoPortal(prisma, { obraId: "obra-b", publicar: false, motivo: "não deveria estar", criadoPor: POR }))).toMatch(/OBR-B não está no portal/);
    expect(await recusa(() => publicarObraNoPortal(prisma, { obraId: "obra-a", publicar: false, criadoPor: POR }))).toMatch(/Diga por que a obra sai do portal/);
    const u = await prisma.usuario.create({ data: { identificador: "so.le.obras@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_LICIT", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_LICITACOES" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => publicarObraNoPortal(prisma, { obraId: "obra-b", publicar: true, criadoPor: "so.le.obras@cg.pb.gov.br" }))).toMatch(/CADASTRAR_OBRA/);
    expect(await prisma.publicacaoDaObra.count()).toBe(1);
  });

  it("t4: o anexo de obra tem dono único e a obra tem de existir", async () => {
    expect(await recusa(() => anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: PDF("x"), obraId: "nao-existe", criadoPor: POR }))).toMatch(/Obra nao-existe não existe/);
    expect(await recusa(() => anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: PDF("x"), obraId: "obra-a", pessoaId: "p", criadoPor: POR }))).toMatch(/EXATAMENTE UM registro/);
  });
});
