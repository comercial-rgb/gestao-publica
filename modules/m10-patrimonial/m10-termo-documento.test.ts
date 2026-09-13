import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { emitirTermoPatrimonial, registrarMovimentoDeGestao } from "./gestao-do-bem.js";
import { registrarEntradaAvulsa } from "./patrimonio.js";
import { documentoDoTermo } from "./termo-documento.js";

/**
 * O DOCUMENTO DO TERMO (V3, pacote 2, unidade 5) — o que vai para o PDF, como dado.
 * N=2 bens com valores diferentes: o total é soma, não cópia; a localização é a derivada
 * de cada um; o responsável aparece com nome e documento formatado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "patrimonio@cg.pb.gov.br";
const CLASSE = "cl-mov";
const BEM_A = "bem-a";
const BEM_B = "bem-b";
const CPF = "11144477735";
let pessoaId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-imob", codigo: "1.2.3.1.1.01.00", nome: "Bens móveis", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: "4.5.9.1.1.00.00", nome: "VPA incorporação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.classeDeBens.create({ data: { id: CLASSE, codigo: "1.2.3.1.1.02", descricao: "Móveis", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR } });
  await prisma.bemPatrimonial.createMany({
    data: [
      { id: BEM_A, numeroTombamento: "TOMB-A", descricao: "Armário de aço", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-01-10T12:00:00Z"), criadoPor: POR },
      { id: BEM_B, numeroTombamento: "TOMB-B", descricao: "Mesa", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-01-10T12:00:00Z"), criadoPor: POR },
    ],
  });
  await prisma.roteiroPatrimonial.create({ data: { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR } });
  for (const [bemId, valor] of [[BEM_A, "1000.00"], [BEM_B, "2500.50"]] as const) {
    await registrarEntradaAvulsa(prisma, { classeDeBensId: CLASSE, bemId, tipo: "AVALIACAO_INICIAL", valor, dataMovimento: new Date("2026-01-15T12:00:00Z"), motivo: "Avaliação inicial.", criadoPor: POR });
  }
  const p = await prisma.pessoa.create({ data: { documento: CPF, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: "Maria Souza", criadoPor: POR } } }, select: { id: true } });
  pessoaId = p.id;
  const sala = await prisma.localizacaoFisica.create({ data: { codigo: "SEC-101", descricao: "Sala 101", criadoPor: POR }, select: { id: true } });
  await registrarMovimentoDeGestao(prisma, { bemId: BEM_A, tipo: "LOCALIZACAO", localizacaoId: sala.id, dataMovimento: new Date("2026-02-01T12:00:00Z"), motivo: "alocação", criadoPor: POR });
}

describe("o documento do termo patrimonial", () => {
  beforeEach(semear);

  it("t1: responsabilidade — cabeçalho com o responsável, uma linha por bem com valor e localização derivados, total somado, declaração e assinaturas", async () => {
    const { termoId } = await emitirTermoPatrimonial(prisma, { numero: "TR-2026-0001", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A, BEM_B], criadoPor: POR });
    const doc = await documentoDoTermo(prisma, termoId, "Município de Teste");
    expect(doc.ente).toBe("Município de Teste");
    expect(doc.titulo).toBe("Termo de responsabilidade nº TR-2026-0001");
    expect(doc.subtitulo).toBe("Responsável: Maria Souza (111.444.777-35)");
    expect(doc.periodo).toBe("Data do termo: 10/03/2026");
    expect(doc.numeroArquivo).toBe("TR-2026-0001");
    const secao = doc.secoes[0]!;
    expect(secao.colunas.map((c) => c.rotulo)).toEqual(["Tombamento", "Descrição", "Classe", "Localização", "Valor contábil (R$)"]);
    expect(secao.linhas).toEqual([
      ["TOMB-A", "Armário de aço", "1.2.3.1.1.02 — Móveis", "SEC-101 — Sala 101", "1000.00"],
      ["TOMB-B", "Mesa", "1.2.3.1.1.02 — Móveis", "—", "2500.50"],
      ["", "", "", "Total", "3500.50"],
    ]);
    expect(doc.notas[0]).toMatch(/^Declaro ter recebido os bens acima relacionados, em 10\/03\/2026/);
    expect(doc.notas.join("\n")).toMatch(/Assinatura do responsável: _+ +Maria Souza \(111\.444\.777-35\)/);
    expect(doc.notas.join("\n")).toMatch(/Emitido por patrimonio@cg\.pb\.gov\.br/);
  });

  it("t2: baixa — sem responsável, com a declaração de baixa; o movimento de situação de cada bem já está registrado", async () => {
    const { termoId } = await emitirTermoPatrimonial(prisma, { numero: "TB-2026-0007", tipo: "BAIXA", data: new Date("2026-04-02T12:00:00Z"), bensId: [BEM_B], criadoPor: POR });
    const doc = await documentoDoTermo(prisma, termoId, "Município de Teste");
    expect(doc.titulo).toBe("Termo de baixa nº TB-2026-0007");
    expect(doc.subtitulo).toBe("Baixa do acervo");
    expect(doc.secoes[0]!.linhas).toHaveLength(2);
    expect(doc.notas[0]).toMatch(/baixados do acervo patrimonial em 02\/04\/2026/);
    expect(await prisma.movimentoDeGestaoDoBem.count({ where: { bemId: BEM_B, tipo: "SITUACAO", situacao: "BAIXADO" } })).toBe(1);
  });

  it("t3: termo inexistente recusa nomeando; o número vira nome de arquivo seguro", async () => {
    await expect(documentoDoTermo(prisma, "nao-existe", "Ente")).rejects.toThrow(/não encontrado/);
    const { termoId } = await emitirTermoPatrimonial(prisma, { numero: "TR 01/2026", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A], criadoPor: POR });
    expect((await documentoDoTermo(prisma, termoId, "Ente")).numeroArquivo).toBe("TR_01_2026");
  });
});
