import "dotenv/config";
import { inflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { DIA_DE_BORDA } from "./instantes.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../modules/m05-despesa/dominio.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import type { Identidade } from "../modules/m16-travamento/autenticacao.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";
import { EscopoDeLeituraError } from "../lib/portas/leitura.js";
import {
  ArquivoFederalIndisponivelError,
  arquivoDaMscPara,
  arquivoDoManadPara,
  PedidoDeExportacaoInvalidoError,
  pedidoDaMscDaUrl,
  resumoDaMscPara,
  resumoDoManadPara,
} from "../lib/portas/exportacoes-federais.js";

/**
 * ═══ OS ARQUIVOS FEDERAIS (MSC e MANAD) — A AUTORIZAÇÃO NO SERVIDOR, PELA PORTA DE VERDADE ═══
 *
 * A tela e as rotas de download chamam `resumo...Para` / `arquivo...Para` com a identidade da
 * sessão. Aqui a identidade é dada e as portas são CHAMADAS (não imitadas): `cliente()` lê o
 * banco isolado que o `test/setup.ts` configurou.
 *
 * ⚠️ CADA NEGAÇÃO AFIRMA O MOTIVO — a classe do erro E o trecho que diz o que falta. E a recusa
 * de acesso precede a geração: quem não pode ler recebe a recusa de ACESSO mesmo quando o
 * cadastro do MANAD está incompleto (se o gerador rodasse antes, a mensagem seria a outra).
 *
 * ⚠️ FIXTURE N=2: dois empenhos em duas unidades. A contagem de linhas da matriz vem de dois
 * lançamentos somados nas mesmas contas — com um só, "6 linhas" passaria por vacuidade de soma.
 *
 * ⚠️ PREFIXO `fed.` nas identidades: o `limparBanco` dá ADMIN às identidades das fixtures.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const EXERCICIO = 2026;
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const IBGE = "2504009";
let ugSaudeId = "";

async function usuario(
  identificador: string,
  permissoes: readonly { readonly acao: AcaoDoSistema; readonly unidadeOrcId: string | null }[],
  ativo = true
): Promise<Identidade> {
  const u = await prisma.usuario.create({
    data: { identificador, nome: identificador, ativo, criadoPor: "seed-teste" },
    select: { id: true, identificador: true },
  });
  const perfil = await prisma.perfil.create({
    data: { nome: `perfil-${identificador}`, descricao: "teste", criadoPor: "seed-teste" },
    select: { id: true },
  });
  for (const p of permissoes) {
    await prisma.permissaoDePerfil.create({
      data: { perfilId: perfil.id, acao: p.acao, unidadeOrcId: p.unidadeOrcId, criadoPor: "seed-teste" },
    });
  }
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "seed-teste" } });
  return { usuarioId: u.id, identificador: u.identificador };
}

/** O ente, SEM a indicação de centralização — o MANAD fica bloqueado por cadastro incompleto. */
async function semearEnte(): Promise<void> {
  await prisma.enteConfig.create({
    data: {
      id: "unico",
      codigoIbge: IBGE,
      poderOrgao: "01",
      nome: "Municipio de Teste",
      cnpj: "08993917000146",
      uf: "PB",
      tribunalCodigo: "TCE-PB",
      tribunalUf: "PB",
      planoContasSeed: "pcasp-federal",
      conferidoPor: "contabilidade@teste",
      conferidoEm: new Date("2026-01-05T12:00:00Z"),
    },
  });
}

async function semearExecucao(): Promise<void> {
  const deps = criarM05Deps(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp-fed", codigo: C_DISPONIVEL, nome: "Credito Disponivel", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp-fed", codigo: C_EMPENHADO, nome: "Credito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-fed", codigo: "01", nome: "Prefeitura" } });
  const saude = await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-fed-saude", codigo: "01004", descricao: "Secretaria de Saude", orgaoId: "org-fed" },
  });
  const educacao = await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-fed-educacao", codigo: "01003", descricao: "Secretaria de Educacao", orgaoId: "org-fed" },
  });
  ugSaudeId = saude.id;
  await prisma.funcao.create({ data: { id: "fun-fed", codigo: "04", nome: "Administracao" } });
  await prisma.subfuncao.create({ data: { id: "sub-fed", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg-fed", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca-fed", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-fed", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material" },
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-fed", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const comum = {
    exercicio: EXERCICIO,
    orgaoId: "org-fed",
    funcaoId: "fun-fed",
    subfuncaoId: "sub-fed",
    programaId: "prg-fed",
    acaoId: "aca-fed",
    naturezaDespesaId: "nd-fed",
    fonteId: "fnt-fed",
    valorDotado: "500000.00",
  } as const;
  await criarFichaDeTeste(prisma, { ...comum, id: "ficha-fed-saude", numero: 1, unidadeOrcId: saude.id });
  await criarFichaDeTeste(prisma, { ...comum, id: "ficha-fed-educ", numero: 2, unidadeOrcId: educacao.id });
  for (const [fichaId, numero, valor] of [
    ["ficha-fed-saude", "NE-FED-1", "10000.00"],
    ["ficha-fed-educ", "NE-FED-2", "7000.00"],
  ] as const) {
    await empenhar(
      {
        fichaId,
        numero,
        tipo: "ORDINARIO",
        valor,
        data: DIA_DE_BORDA(EXERCICIO, 2, 1),
        credorCpfCnpj: "12345678000195",
        historico: `empenho ${numero}`,
        categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: "despesa@cg.pb.gov.br",
      },
      R_EMPENHO,
      deps
    );
  }
}

const FEVEREIRO = { exercicio: EXERCICIO, mes: 2, tipo: "MENSAL" } as const;

describe("arquivos federais — quem pode gerar, e por quê", { timeout: 120_000 }, () => {
  // ⚠️ UMA LIMPEZA POR BLOCO, com prazo explícito: nenhum teste deste bloco grava fora da
  // própria identidade (cada um cria o seu usuário, de nome único), e o `limparBanco` desta
  // máquina passa dos 10 s padrão — um gancho vencido seguia truncando enquanto o próximo
  // semeava (deadlock e "Unique constraint" no Perfil, medido na primeira corrida).
  beforeAll(async () => {
    await limparBanco(prisma);
    await semearEnte();
    await semearExecucao();
  }, 180_000);

  it("POSITIVO: CONSULTAR_CONTABILIDADE global gera o resumo e o arquivo da MSC, com o que o razão tem", async () => {
    const quem = await usuario("fed.contador", [{ acao: "CONSULTAR_CONTABILIDADE", unidadeOrcId: null }]);

    // A contagem ESPERADA vem do razão, por consulta própria — não do gerador que se quer conferir.
    // Todos os lançamentos da fixture (a dotação das fichas e os dois empenhos) caem até fevereiro.
    const contasNoRazao = new Set(
      (await prisma.partidaContabil.findMany({ select: { conta: { select: { codigo: true } } } })).map(
        (p) => p.conta.codigo
      )
    );
    expect(contasNoRazao.has(C_DISPONIVEL) && contasNoRazao.has(C_EMPENHADO)).toBe(true);

    const r = await resumoDaMscPara(quem, FEVEREIRO);
    // Uma linha por conta e tipo de valor: a fixture tem uma fonte só, logo nenhuma conta se parte.
    expect(r).toMatchObject({
      instituicao: `${IBGE}EX`,
      periodo: "2026-02",
      contas: contasNoRazao.size,
      linhas: contasNoRazao.size * 3,
    });
    expect(r.porTipoDeValor.map((t) => t.linhas)).toEqual([contasNoRazao.size, contasNoRazao.size, contasNoRazao.size]);
    expect(r.conferencias).toHaveLength(3);
    expect(r.pendencias).toEqual([]);
    expect(r.exigenciasPorContaCarregadas).toBe(false);

    const arq = await arquivoDaMscPara(quem, FEVEREIRO);
    expect(arq.nome).toBe(`msc_${IBGE}EX_2026-02.zip`);
    expect(arq.tipoDeConteudo).toBe("application/zip");
    // O ZIP aberto À MÃO (cabeçalho local da PKWARE + DEFLATE cru), sem o código que o escreveu:
    // assinatura PK\x03\x04, o nome do CSV, e o CSV com o cabeçalho + uma linha por linha do resumo.
    const b = arq.bytes;
    expect(b.readUInt32LE(0)).toBe(0x04034b50);
    const tamNome = b.readUInt16LE(26);
    const tamExtra = b.readUInt16LE(28);
    const tamComprimido = b.readUInt32LE(18);
    expect(b.subarray(30, 30 + tamNome).toString("utf8")).toBe(`msc_${IBGE}EX_2026-02.csv`);
    const inicio = 30 + tamNome + tamExtra;
    const csv = inflateRawSync(b.subarray(inicio, inicio + tamComprimido)).toString("utf8");
    const linhasCsv = csv.split("\r\n").filter((l) => l !== "");
    expect(linhasCsv).toHaveLength(r.linhas + 1);
    expect(linhasCsv.slice(1).every((l) => l.startsWith(`${IBGE}EX,2026-02,`))).toBe(true);
  });

  it("POSITIVO (encerramento): a matriz de encerramento sai com a conferência contra dezembro", async () => {
    const quem = await usuario("fed.contador.enc", [{ acao: "CONSULTAR_CONTABILIDADE", unidadeOrcId: null }]);
    // O mês pedido é ignorado: o encerramento é sempre de dezembro.
    const r = await resumoDaMscPara(quem, { exercicio: EXERCICIO, mes: 3, tipo: "ENCERRAMENTO" });
    expect(r).toMatchObject({ periodo: "2026-12", mes: 12, tipo: "ENCERRAMENTO" });
    expect(r.contas).toBeGreaterThanOrEqual(2);
    expect(r.conferencias.map((c) => c.nome)).toContain("Encerramento e dezembro");
    expect(r.nomeDoArquivo).toBe(`msc_${IBGE}EX_2026-12_encerramento.zip`);
  });

  it("NEGATIVO: sem ação nenhuma — recusa de ACESSO nomeando a ação, antes de gerar qualquer arquivo", async () => {
    const quem = await usuario("fed.sem.permissao", []);
    for (const chamada of [
      () => resumoDaMscPara(quem, FEVEREIRO),
      () => arquivoDaMscPara(quem, FEVEREIRO),
      // ⚠️ O cadastro do MANAD está INCOMPLETO nesta fixture: se o gate rodasse depois do
      // gerador, a recusa seria de cadastro. É de acesso — o gate vem primeiro.
      () => resumoDoManadPara(quem, EXERCICIO),
      () => arquivoDoManadPara(quem, EXERCICIO),
    ]) {
      await expect(chamada()).rejects.toThrow(EscopoDeLeituraError);
      await expect(chamada()).rejects.toThrow(/não tem a ação CONSULTAR_CONTABILIDADE em escopo nenhum/);
    }
  });

  it("NEGATIVO: a leitura da contabilidade SÓ numa unidade não basta — o arquivo é do ente inteiro", async () => {
    const quem = await usuario("fed.contador.saude", [{ acao: "CONSULTAR_CONTABILIDADE", unidadeOrcId: ugSaudeId }]);
    await expect(arquivoDaMscPara(quem, FEVEREIRO)).rejects.toThrow(EscopoDeLeituraError);
    await expect(arquivoDaMscPara(quem, FEVEREIRO)).rejects.toThrow(
      /tem CONSULTAR_CONTABILIDADE só em: 01004.*concessão GLOBAL de CONSULTAR_CONTABILIDADE/s
    );
    await expect(arquivoDoManadPara(quem, EXERCICIO)).rejects.toThrow(/só em: 01004/);
  });

  it("NEGATIVO: a ação global de OUTRA área (integrações, a do arquivo do tribunal) não abre estes arquivos", async () => {
    const quem = await usuario("fed.integracoes", [
      { acao: "CONSULTAR_INTEGRACOES", unidadeOrcId: null },
      { acao: "CONSULTAR_DESPESA", unidadeOrcId: null },
    ]);
    await expect(resumoDaMscPara(quem, FEVEREIRO)).rejects.toThrow(
      /não tem a ação CONSULTAR_CONTABILIDADE em escopo nenhum/
    );
  });

  it("NEGATIVO: acesso revogado — recusa nomeando a revogação, mesmo com a ação global", async () => {
    const quem = await usuario("fed.revogado", [{ acao: "CONSULTAR_CONTABILIDADE", unidadeOrcId: null }], false);
    await expect(arquivoDaMscPara(quem, FEVEREIRO)).rejects.toThrow(/teve o acesso REVOGADO/);
  });

  it("AUTORIZADO, CADASTRO INCOMPLETO: o MANAD recusa dizendo TUDO o que falta cadastrar — e não o gera", async () => {
    const quem = await usuario("fed.contador.manad", [{ acao: "CONSULTAR_CONTABILIDADE", unidadeOrcId: null }]);
    const falha = await arquivoDoManadPara(quem, EXERCICIO).then(
      () => null,
      (e: unknown) => e
    );
    expect(falha).toBeInstanceOf(ArquivoFederalIndisponivelError);
    const faltas = (falha as ArquivoFederalIndisponivelError).faltas;
    expect(faltas).toEqual([
      "a indicação de escrituração centralizada ou descentralizada do ente",
      "o contabilista responsável, com CRC e período de responsabilidade",
      "a empresa ou o técnico responsável pela geração do arquivo",
    ]);
  });

  it("PEDIDO: exercício e mês malformados na URL são recusados com o motivo, não viram o padrão", () => {
    const padrao = { exercicio: 2026, mes: 9 };
    expect(pedidoDaMscDaUrl({}, padrao)).toEqual({ exercicio: 2026, mes: 9, tipo: "MENSAL" });
    expect(pedidoDaMscDaUrl({ exercicio: "2025", mes: "12", tipo: "ENCERRAMENTO" }, padrao)).toEqual({
      exercicio: 2025,
      mes: 12,
      tipo: "ENCERRAMENTO",
    });
    expect(() => pedidoDaMscDaUrl({ exercicio: "20x6" }, padrao)).toThrow(PedidoDeExportacaoInvalidoError);
    expect(() => pedidoDaMscDaUrl({ exercicio: "20x6" }, padrao)).toThrow(/não é um ano válido/);
    expect(() => pedidoDaMscDaUrl({ mes: "13" }, padrao)).toThrow(/Escolha um mês de 1 a 12/);
    expect(() => pedidoDaMscDaUrl({ tipo: "OUTRO" }, padrao)).toThrow(/tipo de matriz pedido não existe/);
  });
});

describe("arquivos federais — o MANAD com o cadastro completo", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await limparBanco(prisma);
    await semearEnte();
    await prisma.enteConfig.update({ where: { id: "unico" }, data: { indCentralizacao: "0" } });
    await prisma.manadContabilista.create({
      data: {
        nome: "Contabilista de Teste",
        cpf: "11122233344",
        crc: "PB012345/O5",
        dtInicio: new Date(Date.UTC(2026, 0, 1)),
        uf: "PB",
        conferidoPor: "contabilidade@teste",
        conferidoEm: new Date("2026-01-05T12:00:00Z"),
      },
    });
    await prisma.manadEmpresaGeradora.create({
      data: {
        empresaOuTecnico: "Equipe de Sistemas",
        cargo: "Analista",
        dtInicioServico: new Date(Date.UTC(2026, 0, 1)),
        cnpj: "08993917000146",
        conferidoPor: "contabilidade@teste",
        conferidoEm: new Date("2026-01-05T12:00:00Z"),
      },
    });
  }, 180_000);

  it("POSITIVO: gera o arquivo em ISO 8859-1, e o resumo conta as linhas que estão no arquivo", async () => {
    const quem = await usuario("fed.contador.manad.ok", [{ acao: "CONSULTAR_CONTABILIDADE", unidadeOrcId: null }]);
    const arq = await arquivoDoManadPara(quem, EXERCICIO);
    expect(arq.nome).toBe("manad_2026.txt");
    expect(arq.tipoDeConteudo).toBe("text/plain; charset=iso-8859-1");
    const texto = arq.bytes.toString("latin1");
    expect(texto.startsWith("0000|Municipio de Teste|08993917000146|")).toBe(true);
    // Contagem INDEPENDENTE: as linhas do próprio arquivo, contra o resumo da porta.
    const linhasNoArquivo = texto.split("\r\n").filter((l) => l !== "").length;
    const r = await resumoDoManadPara(quem, EXERCICIO);
    expect(r.linhas).toBe(linhasNoArquivo);
    expect(r.bytes).toBe(arq.bytes.length);
    expect(r.porBloco.reduce((s, b) => s + b.linhas, 0)).toBe(linhasNoArquivo);
  });
});
