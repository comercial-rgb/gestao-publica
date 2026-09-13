import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { emitirTermoPatrimonial, registrarMovimentoDeGestao } from "./gestao-do-bem.js";
import { registrarEntradaAvulsa, registrarReavaliacao } from "./patrimonio.js";
import { documentoDoTermo, sha256DoDocumento } from "./termo-documento.js";
import { anexarArquivo, baixarAnexo } from "../m22-documentos/anexos.js";
import { listarAnexosDoTermo } from "../m22-documentos/consultas.js";

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
    const { termoId } = await emitirTermoPatrimonial(prisma, { ente: "Município de Teste", numero: "TR-2026-0001", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A, BEM_B], criadoPor: POR });
    const lido = await documentoDoTermo(prisma, termoId, "Município de Teste");
    expect(lido.via).toBe("EMITIDO");
    const doc = lido.documento;
    expect(doc.ente).toBe("Município de Teste");
    expect(doc.titulo).toBe("Termo de responsabilidade nº TR-2026-0001");
    expect(doc.subtitulo).toBe("Responsável: Maria Souza (111.444.777-35) · recorte por responsável");
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
    const { termoId } = await emitirTermoPatrimonial(prisma, { ente: "Município de Teste", numero: "TB-2026-0007", tipo: "BAIXA", data: new Date("2026-04-02T12:00:00Z"), bensId: [BEM_B], criadoPor: POR });
    const doc = (await documentoDoTermo(prisma, termoId, "Município de Teste")).documento;
    expect(doc.titulo).toBe("Termo de baixa nº TB-2026-0007");
    expect(doc.subtitulo).toBe("Baixa do acervo · recorte individual");
    expect(doc.secoes[0]!.linhas).toHaveLength(2);
    expect(doc.notas[0]).toMatch(/baixados do acervo patrimonial em 02\/04\/2026/);
    expect(await prisma.movimentoDeGestaoDoBem.count({ where: { bemId: BEM_B, tipo: "SITUACAO", situacao: "BAIXADO" } })).toBe(1);
  });

  it("t3: termo inexistente recusa nomeando; o número vira nome de arquivo seguro", async () => {
    await expect(documentoDoTermo(prisma, "nao-existe", "Ente")).rejects.toThrow(/não encontrado/);
    const { termoId } = await emitirTermoPatrimonial(prisma, { ente: "Município de Teste", numero: "TR 01/2026", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A], criadoPor: POR });
    expect((await documentoDoTermo(prisma, termoId, "Ente")).documento.numeroArquivo).toBe("TR_01_2026");
  });

  // ═══ V4 (§5) — a emissão congelada, a posição atual e o termo assinado ═══
  it("t4: emissão → o bem muda de sala, é reavaliado e a pessoa muda de nome → a segunda via NÃO muda (mesmo sha256); a posição atual muda e tem data própria", async () => {
    const { termoId } = await emitirTermoPatrimonial(prisma, { ente: "Município de Teste", numero: "TR-2026-0002", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A, BEM_B], criadoPor: POR });
    const original = await documentoDoTermo(prisma, termoId, "Município de Teste");
    expect(original.via).toBe("EMITIDO");
    expect(original.emitidoEm).not.toBeNull();
    expect(original.sha256).toBe(sha256DoDocumento(original.documento));
    expect(original.documento.secoes[0]!.linhas[0]).toEqual(["TOMB-A", "Armário de aço", "1.2.3.1.1.02 — Móveis", "SEC-101 — Sala 101", "1000.00"]);

    // O MUNDO MUDA DEPOIS DA EMISSÃO.
    const galpao = await prisma.localizacaoFisica.create({ data: { codigo: "GAL-01", descricao: "Galpão", criadoPor: POR }, select: { id: true } });
    await registrarMovimentoDeGestao(prisma, { bemId: BEM_A, tipo: "LOCALIZACAO", localizacaoId: galpao.id, dataMovimento: new Date("2026-04-01T12:00:00Z"), motivo: "transferência para o galpão", criadoPor: POR });
    await prisma.roteiroPatrimonial.create({ data: { tipo: "REAVALIACAO_REDUCAO", contaDebitoId: "c-vpa", contaCreditoId: "c-imob", criadoPor: POR } });
    await registrarReavaliacao(prisma, { classeDeBensId: CLASSE, bemId: BEM_A, sentido: "REDUCAO", valor: "300.00", dataMovimento: new Date("2026-04-02T12:00:00Z"), motivo: "Laudo de avaliação apontou desvalorização.", criadoPor: POR });
    await prisma.versaoDePessoa.create({ data: { pessoaId, nome: "Maria Souza Lima", criadoPor: POR } });

    // A SEGUNDA VIA: idêntica à emissão — dados e sha256.
    const segundaVia = await documentoDoTermo(prisma, termoId, "Município de Teste");
    expect(segundaVia.via).toBe("EMITIDO");
    expect(segundaVia.documento).toEqual(original.documento);
    expect(segundaVia.sha256).toBe(original.sha256);
    expect(segundaVia.documento.subtitulo).toContain("Maria Souza (");
    // A POSIÇÃO ATUAL: outro documento, com a data de hoje, e diz que não é o termo.
    const hoje = new Date("2026-05-20T12:00:00Z");
    const atual = await documentoDoTermo(prisma, termoId, "Município de Teste", "ATUAL", hoje);
    expect(atual.via).toBe("ATUAL");
    expect(atual.documento.titulo).toBe("Posição patrimonial atual — bens do termo de responsabilidade nº TR-2026-0002");
    expect(atual.documento.periodo).toBe("Posição em 20/05/2026 (o termo é de 10/03/2026)");
    expect(atual.documento.secoes[0]!.linhas[0]).toEqual(["TOMB-A", "Armário de aço", "1.2.3.1.1.02 — Móveis", "GAL-01 — Galpão", "700.00"]);
    expect(atual.documento.subtitulo).toContain("Maria Souza Lima (");
    expect(atual.documento.notas[0]).toMatch(/NÃO é o termo nº TR-2026-0002 nem uma segunda via/);
    expect(atual.sha256).not.toBe(original.sha256);
    expect(atual.documento.numeroArquivo).toBe("TR-2026-0002-posicao-atual");
  });

  it("t5: a emissão adulterada no banco é recusada na leitura; o termo anterior à V4 (sem emissão) é composto agora e DIZ que não é segunda via", async () => {
    // O adulterador: uma linha cujo sha256 gravado não confere com o JSON (inserida direto — o runtime só INSERE aqui).
    const emissaoFalsa = { ente: "Ente", titulo: "Termo de responsabilidade nº TR-ADULT", subtitulo: "x", periodo: "x", secoes: [], notas: [], numeroArquivo: "TR-ADULT" };
    const adulterado = await prisma.termoPatrimonial.create({
      data: { numero: "TR-ADULT", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), criadoPor: POR, emissao: emissaoFalsa, emissaoSha256: "0".repeat(64), modeloDaEmissao: "termo-patrimonial/1", emitidoEm: new Date(), itens: { create: [{ bemId: BEM_A, criadoPor: POR }] } },
      select: { id: true },
    });
    await expect(documentoDoTermo(prisma, adulterado.id, "Ente")).rejects.toThrow(/EMISSÃO ADULTERADA/);
    // Um termo ANTIGO (anterior ao registro da emissão): sem emissão congelada.
    const antigoId = (await prisma.termoPatrimonial.create({
      data: { numero: "TR-ANTIGO", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), criadoPor: POR, itens: { create: [{ bemId: BEM_A, criadoPor: POR }] } },
      select: { id: true },
    })).id;
    const antigo = await documentoDoTermo(prisma, antigoId, "Ente");
    expect(antigo.via).toBe("SEM_EMISSAO");
    expect(antigo.emitidoEm).toBeNull();
    expect(antigo.documento.notas.at(-1)).toMatch(/SEM EMISSÃO CONGELADA/);
    expect(antigo.documento.secoes[0]!.linhas[0]?.[0]).toBe("TOMB-A");
  });

  it("t6: os recortes — individual (um bem), setorial (setor) e por responsável (vários bens) — aparecem no documento", async () => {
    await prisma.orgao.create({ data: { id: "org-t", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-t", codigo: "01001", descricao: "Educação", orgaoId: "org-t" } });
    const setor = await prisma.setor.create({ data: { codigo: "SEC-EDU", nome: "Secretaria de Educação", unidadeOrcId: "uo-t", criadoPor: POR }, select: { id: true } });
    const individual = await emitirTermoPatrimonial(prisma, { ente: "Ente", numero: "TR-I", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A], criadoPor: POR });
    const setorial = await emitirTermoPatrimonial(prisma, { ente: "Ente", numero: "TR-S", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, setorId: setor.id, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A, BEM_B], criadoPor: POR });
    const porResponsavel = await emitirTermoPatrimonial(prisma, { ente: "Ente", numero: "TR-R", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A, BEM_B], criadoPor: POR });
    expect((await documentoDoTermo(prisma, individual.termoId, "Ente")).documento.subtitulo).toMatch(/recorte individual$/);
    expect((await documentoDoTermo(prisma, setorial.termoId, "Ente")).documento.subtitulo).toMatch(/Setor: SEC-EDU — Secretaria de Educação · recorte setorial$/);
    expect((await documentoDoTermo(prisma, porResponsavel.termoId, "Ente")).documento.subtitulo).toMatch(/recorte por responsável$/);
  });

  it("t7: o termo ASSINADO é anexado ao termo, listado com o sha256 e entregue conferido; dois donos são recusados", async () => {
    const { termoId } = await emitirTermoPatrimonial(prisma, { ente: "Ente", numero: "TR-2026-0004", tipo: "RESPONSABILIDADE", responsavelId: pessoaId, data: new Date("2026-03-10T12:00:00Z"), bensId: [BEM_A], criadoPor: POR });
    const pdf = new TextEncoder().encode("%PDF-1.4\n% termo assinado, digitalizado\n%%EOF");
    const r = await anexarArquivo(prisma, { nomeOriginal: "TR-2026-0004-assinado.pdf", mimeType: "application/pdf", conteudo: pdf, origem: "DIGITALIZACAO", termoPatrimonialId: termoId, criadoPor: POR });
    const lista = await listarAnexosDoTermo(prisma, termoId, POR);
    expect(lista.map((a) => [a.nome, a.sha256])).toEqual([["TR-2026-0004-assinado.pdf", r.sha256]]);
    const entregue = await baixarAnexo(prisma, r.anexoId, POR);
    expect(entregue?.sha256).toBe(r.sha256);
    expect(entregue === null ? "" : new TextDecoder().decode(entregue.conteudo)).toContain("termo assinado");
    await expect(
      anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: pdf, termoPatrimonialId: termoId, pessoaId, criadoPor: POR })
    ).rejects.toThrow(/EXATAMENTE UM registro/);
    await expect(
      anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: pdf, termoPatrimonialId: "nao-existe", criadoPor: POR })
    ).rejects.toThrow(/não existe/);
  });
});
