import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { anexarArquivo } from "../m22-documentos/anexos.js";
import { listarAnexosDaLeiOrcamentaria } from "../m22-documentos/consultas.js";
import { cadastrarLeiOrcamentariaAnual, registrarAprovacaoDaLeiOrcamentaria } from "./lei-orcamentaria.js";

/**
 * M02b — A LEI ORÇAMENTÁRIA ANUAL (V22): o projeto de lei, a lei que o aprovou e os anexos.
 * Regime de rigor: SUPERFÍCIE (cadastro de ato), com a ordem das datas em dia civil do ente, a
 * aprovação única e a autorização positiva e negativa.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "planejamento@cg.pb.gov.br";
const SEM_PODER = "estagiario-plan@cg.pb.gov.br";

const PROJETO = {
  exercicio: 2027,
  numeroDoProjeto: "PL 45/2026",
  dataDoEnvio: "2026-09-30",
  ementa: "Estima a receita e fixa a despesa do Município para o exercício de 2027.",
  criadoPor: POR,
};
const APROVACAO = {
  numeroDaLei: "1.234/2026",
  dataDaSancao: "2026-12-18",
  dataDaPublicacao: "2026-12-19",
  veiculoDePublicacao: "Diário Oficial do Município",
  criadoPor: POR,
};

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("(1) o projeto e a lei — N=2 exercícios, datas em dia civil", () => {
  it("cadastra as LOAs de 2027 e 2028 e registra a lei de cada uma; o que foi digitado volta igual", async () => {
    const a = await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    const b = await cadastrarLeiOrcamentariaAnual(prisma, { ...PROJETO, exercicio: 2028, numeroDoProjeto: "PL 50/2027", dataDoEnvio: "2027-09-29" });
    await registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: a.id });
    await registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: b.id, numeroDaLei: "1.300/2027", dataDaSancao: "2027-12-20", dataDaPublicacao: "2027-12-20" });

    const lidas = await prisma.leiOrcamentariaAnual.findMany({
      orderBy: { exercicio: "asc" },
      select: { exercicio: true, numeroDoProjeto: true, dataDoEnvio: true, aprovacao: { select: { numeroDaLei: true, dataDaSancao: true, dataDaPublicacao: true } } },
    });
    expect(lidas.map((l) => `${l.exercicio} ${l.numeroDoProjeto} ${diaCivil(l.dataDoEnvio)} ${l.aprovacao?.numeroDaLei} ${diaCivil(l.aprovacao!.dataDaSancao)} ${diaCivil(l.aprovacao!.dataDaPublicacao)}`)).toEqual([
      "2027 PL 45/2026 2026-09-30 1.234/2026 2026-12-18 2026-12-19",
      "2028 PL 50/2027 2027-09-29 1.300/2027 2027-12-20 2027-12-20",
    ]);
  });
  it("sanção no mesmo dia do envio é aceita (a borda é inclusiva)", async () => {
    const a = await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    await registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: a.id, dataDaSancao: "2026-09-30", dataDaPublicacao: "2026-09-30" });
    expect(await prisma.aprovacaoDaLeiOrcamentaria.count()).toBe(1);
  });
});

describe("(2) NEGAÇÕES com o motivo, nada gravado", () => {
  it("segunda LOA do mesmo exercício → recusa nomeando o projeto existente", async () => {
    await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    await expect(cadastrarLeiOrcamentariaAnual(prisma, { ...PROJETO, numeroDoProjeto: "PL 99/2026" })).rejects.toThrow(/Já existe a LOA de 2027 \(projeto PL 45\/2026\)/);
    expect(await prisma.leiOrcamentariaAnual.count()).toBe(1);
  });
  it("segunda aprovação da mesma LOA → recusa nomeando a lei já registrada", async () => {
    const a = await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    await registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: a.id });
    await expect(registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: a.id, numeroDaLei: "9.999/2026" })).rejects.toThrow(/já tem a lei que a aprovou \(1\.234\/2026\)/);
    expect(await prisma.aprovacaoDaLeiOrcamentaria.count()).toBe(1);
  });
  it("sanção um dia antes do envio → recusa com as duas datas", async () => {
    const a = await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    await expect(registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: a.id, dataDaSancao: "2026-09-29", dataDaPublicacao: "2026-10-01" })).rejects.toThrow(/sanção \(2026-09-29\) é anterior ao envio do projeto ao Legislativo \(2026-09-30\)/);
    expect(await prisma.aprovacaoDaLeiOrcamentaria.count()).toBe(0);
  });
  it("publicação antes da sanção → recusa antes de abrir a transação; e o CHECK do banco acusa sozinho", async () => {
    const a = await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    await expect(registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: a.id, dataDaPublicacao: "2026-12-17" })).rejects.toThrow(/publicação \(2026-12-17\) é anterior à sanção \(2026-12-18\)/);
    await expect(
      prisma.aprovacaoDaLeiOrcamentaria.create({ data: { leiId: a.id, numeroDaLei: "x", dataDaSancao: new Date("2026-12-18T03:00:00Z"), dataDaPublicacao: new Date("2026-12-17T03:00:00Z"), veiculoDePublicacao: "x", criadoPor: POR } }),
    ).rejects.toThrow(/AprovacaoDaLeiOrcamentaria_publicacao_chk/);
    expect(await prisma.aprovacaoDaLeiOrcamentaria.count()).toBe(0);
  });
  it("campo obrigatório vazio e data inválida → mensagem de tela, nada gravado", async () => {
    await expect(cadastrarLeiOrcamentariaAnual(prisma, { ...PROJETO, numeroDoProjeto: " " })).rejects.toThrow(/Informe o número do projeto de lei\. Nada foi gravado\./);
    await expect(cadastrarLeiOrcamentariaAnual(prisma, { ...PROJETO, dataDoEnvio: "30/09/2026" })).rejects.toThrow(/Informe a data do envio ao Legislativo/);
    expect(await prisma.leiOrcamentariaAnual.count()).toBe(0);
  });
  it("aprovação de LOA que não existe → recusa", async () => {
    await expect(registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: "nao-existe" })).rejects.toThrow(/Lei orçamentária não encontrada/);
  });
});

describe("(3) autorização no servidor — CADASTRAR_LOA", () => {
  it("quem não tem a ação é recusado nos dois atos, pela autorização e não pela validação", async () => {
    const a = await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    await prisma.usuario.create({ data: { identificador: SEM_PODER, nome: "Estagiário", criadoPor: "TESTE" } });
    await expect(cadastrarLeiOrcamentariaAnual(prisma, { ...PROJETO, exercicio: 2030, criadoPor: SEM_PODER })).rejects.toThrow(/CADASTRAR_LOA/);
    await expect(registrarAprovacaoDaLeiOrcamentaria(prisma, { ...APROVACAO, leiId: a.id, criadoPor: SEM_PODER })).rejects.toThrow(/CADASTRAR_LOA/);
    expect(await prisma.leiOrcamentariaAnual.count()).toBe(1);
    expect(await prisma.aprovacaoDaLeiOrcamentaria.count()).toBe(0);
  });
});

describe("(4) os anexos da LOA pelo M22 — dono único, lista por LOA", () => {
  const PDF = new TextEncoder().encode("%PDF-1.4\n% lei orcamentaria\n");
  it("N=2: cada LOA lista só os próprios anexos; a lei precisa existir", async () => {
    const a = await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    const b = await cadastrarLeiOrcamentariaAnual(prisma, { ...PROJETO, exercicio: 2028, numeroDoProjeto: "PL 50/2027", dataDoEnvio: "2027-09-29" });
    await anexarArquivo(prisma, { nomeOriginal: "projeto.pdf", mimeType: "application/pdf", conteudo: PDF, leiOrcamentariaAnualId: a.id, criadoPor: POR });
    await anexarArquivo(prisma, { nomeOriginal: "lei.pdf", mimeType: "application/pdf", conteudo: PDF, leiOrcamentariaAnualId: a.id, criadoPor: POR });
    await anexarArquivo(prisma, { nomeOriginal: "projeto-2028.pdf", mimeType: "application/pdf", conteudo: PDF, leiOrcamentariaAnualId: b.id, criadoPor: POR });
    expect((await listarAnexosDaLeiOrcamentaria(prisma, a.id, POR)).map((x) => x.nome)).toEqual(["projeto.pdf", "lei.pdf"]);
    expect((await listarAnexosDaLeiOrcamentaria(prisma, b.id, POR)).map((x) => x.nome)).toEqual(["projeto-2028.pdf"]);
    await expect(anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: PDF, leiOrcamentariaAnualId: "nao-existe", criadoPor: POR })).rejects.toThrow(/Lei orçamentária nao-existe não existe/);
  });
  it("NEGAÇÃO: anexo com dois donos (LOA e pessoa) → recusa nomeando a regra do dono único", async () => {
    const a = await cadastrarLeiOrcamentariaAnual(prisma, PROJETO);
    await expect(
      anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: PDF, leiOrcamentariaAnualId: a.id, pessoaId: "p", criadoPor: POR }),
    ).rejects.toThrow(/EXATAMENTE UM registro/);
    expect(await prisma.anexo.count()).toBe(0);
  });
});
