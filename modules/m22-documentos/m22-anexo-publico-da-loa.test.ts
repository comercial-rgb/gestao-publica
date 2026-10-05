import "dotenv/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { anexarArquivo, baixarAnexoPublicoDaLoa } from "./anexos.js";

/**
 * V35 C9 — o documento público da LOA. A rota não tem sessão, então a regra inteira está aqui: só sai o anexo de LOA
 * com lei de aprovação. N=2 na negação: o anexo da LOA ainda em projeto e o anexo de outro dono (uma pessoa).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

beforeAll(() => {
  process.env["ANEXOS_DIR"] = mkdtempSync(join(tmpdir(), "anexos-loa-"));
});

const POR = "contabilidade@cg.pb.gov.br";
const PDF = new TextEncoder().encode("%PDF-1.7\nLei orcamentaria anual\n");

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "SEED" } });
});

describe("M22 — o anexo público da LOA", () => {
  it("só a LOA com lei de aprovação entrega o documento; projeto e anexo de outro dono respondem inexistente", async () => {
    const loa = await prisma.leiOrcamentariaAnual.create({ data: { exercicio: 2026, numeroDoProjeto: "PL 10/2025", dataDoEnvio: new Date("2025-09-30T03:00:00Z"), ementa: "Estima a receita e fixa a despesa para 2026", criadoPor: POR }, select: { id: true } });
    const daLoa = await anexarArquivo(prisma, { nomeOriginal: "lei-orcamentaria.pdf", mimeType: "application/pdf", conteudo: PDF, leiOrcamentariaAnualId: loa.id, criadoPor: POR });
    const pessoa = await prisma.pessoa.create({ data: { documento: "11144477735", tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: "Maria", ativa: true, criadoPor: "SEED" } } }, select: { id: true } });
    const daPessoa = await anexarArquivo(prisma, { nomeOriginal: "documento-pessoal.pdf", mimeType: "application/pdf", conteudo: PDF, pessoaId: pessoa.id, criadoPor: POR });

    expect(await baixarAnexoPublicoDaLoa(prisma, daLoa.anexoId)).toBeNull();
    expect(await baixarAnexoPublicoDaLoa(prisma, daPessoa.anexoId)).toBeNull();

    await prisma.aprovacaoDaLeiOrcamentaria.create({ data: { leiId: loa.id, numeroDaLei: "613/2025", dataDaSancao: new Date("2025-12-20T03:00:00Z"), dataDaPublicacao: new Date("2025-12-22T03:00:00Z"), veiculoDePublicacao: "Diário Oficial do Município", criadoPor: POR } });

    const entregue = await baixarAnexoPublicoDaLoa(prisma, daLoa.anexoId);
    expect(entregue?.nomeOriginal).toBe("lei-orcamentaria.pdf");
    expect(new TextDecoder().decode(entregue!.conteudo)).toContain("Lei orcamentaria anual");
    expect(await baixarAnexoPublicoDaLoa(prisma, daPessoa.anexoId)).toBeNull();
    expect(await baixarAnexoPublicoDaLoa(prisma, "inexistente")).toBeNull();
  });
});
