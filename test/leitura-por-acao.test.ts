import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { DIA_DE_BORDA } from "./instantes.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import type { M05Deps } from "../modules/m05-despesa/ports.js";
import { roteiroEmpenho } from "../modules/m05-despesa/dominio.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { autorizar } from "../modules/m16-travamento/autorizacao.js";
import type { Identidade } from "../modules/m16-travamento/autenticacao.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";
import {
  autorizarLeituraDoRegistroPara,
  escopoDeLeitura,
  EscopoDeLeituraError,
  exigirLeituraDoEntePara,
  exigirLeituraEmAlgumEscopoPara,
  podeLerPara,
  recorteDePaginaPara,
} from "../lib/portas/leitura.js";
import { lerDossieDoEmpenhoPara } from "../lib/portas/empenho.js";
import { listarUgsDoUsuario } from "../lib/portas/contexto.js";

/**
 * ═══ A POLÍTICA DE LEITURA, EXERCITADA PELAS PORTAS DE VERDADE (orquestração V3, 4.1) ═══
 *
 * Os seis usuários que o pedido nomeia, num banco sintético e isolado:
 *   - sem permissão;
 *   - somente leitura;
 *   - ação A na unidade 1 e ação B na unidade 2;
 *   - global em uma ação, restrito em outra;
 *   - permissão revogada;
 *   - acesso direto por id (o dossiê), por URL (o recorte) e por exportação (o mesmo
 *     recorte que as rotas chamam, com o pedido no formato de `searchParams`).
 *
 * ⚠️ AS PORTAS SÃO CHAMADAS, NÃO IMITADAS. `cliente()` lê `DATABASE_URL`, que o
 * `test/setup.ts` reescreveu para o banco isolado — a lição de `CONTEXTO-UG-REPRODUZ-
 * CONSULTA`. A fixture grava em chamadas discretas, nunca numa transação aberta: a porta
 * lê por outra conexão e veria o banco antes do commit.
 *
 * ⚠️ FIXTURE N=2: duas unidades, uma ficha e um empenho em cada. Com uma unidade só,
 * "leu a unidade certa" é verdade por vacuidade.
 *
 * ⚠️ CADA NEGAÇÃO AFIRMA O MOTIVO. `rejects.toThrow()` seco passaria com um `undefined`
 * em qualquer linha. Cada recusa confere a classe E o trecho que diz o que fazer.
 *
 * ⚠️ PREFIXO `v3.` nas identidades: o `limparBanco` dá ADMIN (global em tudo) às
 * identidades das fixtures; um nome que colidisse chegaria aqui enxergando tudo.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "despesa@cg.pb.gov.br";
const CREDOR = "12345678000195";
const EXERCICIO = 2026;
const COD_SAUDE = "01004";
const COD_EDUCACAO = "01003";
const FICHA_SAUDE = "ficha-v3-saude";
const FICHA_EDUCACAO = "ficha-v3-educacao";
const FONTE = "fnt-v3";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });

let deps: M05Deps;
let ugSaudeId = "";
let ugEducacaoId = "";
let empenhoSaude = "";
let empenhoEducacao = "";

interface Permissao {
  readonly acao: AcaoDoSistema;
  readonly unidadeOrcId: string | null;
}

async function usuario(
  identificador: string,
  permissoes: readonly Permissao[],
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
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "seed-teste" },
  });
  return { usuarioId: u.id, identificador: u.identificador };
}

async function empenha(fichaId: string, numero: string, valor: string): Promise<string> {
  const r = await empenhar(
    {
      fichaId,
      numero,
      tipo: "ORDINARIO",
      valor,
      data: DIA_DE_BORDA(EXERCICIO, 2, 1),
      credorCpfCnpj: CREDOR,
      historico: `empenho ${numero}`,
      categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  return r.empenhoId;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp-v3", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp-v3", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-v3", codigo: "01", nome: "Prefeitura" } });
  const saude = await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-v3-saude", codigo: COD_SAUDE, descricao: "Secretaria de Saude", orgaoId: "org-v3" },
  });
  const educacao = await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-v3-educacao", codigo: COD_EDUCACAO, descricao: "Secretaria de Educacao", orgaoId: "org-v3" },
  });
  ugSaudeId = saude.id;
  ugEducacaoId = educacao.id;

  await prisma.funcao.create({ data: { id: "fun-v3", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-v3", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg-v3", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca-v3", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-v3", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material" },
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });

  const comum = {
    exercicio: EXERCICIO,
    orgaoId: "org-v3",
    funcaoId: "fun-v3",
    subfuncaoId: "sub-v3",
    programaId: "prg-v3",
    acaoId: "aca-v3",
    naturezaDespesaId: "nd-v3",
    fonteId: FONTE,
    valorDotado: "500000.00",
  } as const;
  await criarFichaDeTeste(prisma, { ...comum, id: FICHA_SAUDE, numero: 1, unidadeOrcId: saude.id });
  await criarFichaDeTeste(prisma, { ...comum, id: FICHA_EDUCACAO, numero: 2, unidadeOrcId: educacao.id });

  empenhoSaude = await empenha(FICHA_SAUDE, "NE-V3-SAUDE", "10000.00");
  empenhoEducacao = await empenha(FICHA_EDUCACAO, "NE-V3-EDUC", "7000.00");
}

/** O pedido como as ROTAS de exportação o montam: `Object.fromEntries(req.nextUrl.searchParams)`. */
function pedidoDaRota(query: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(query));
}

describe("a política de leitura — seis usuários, duas unidades, um banco sintético", () => {
  beforeEach(async () => {
    await semear();
  });

  it("SEM PERMISSÃO: escopo vazio, recusa em todo nível, e o dossiê não sai — nomeando o crachá", async () => {
    const quem = await usuario("v3.sem.permissao", []);

    const escopo = await escopoDeLeitura(quem, "CONSULTAR_DESPESA");
    expect(escopo).toMatchObject({ unidades: [], podeConsolidado: false, identidadeAtiva: true });

    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_DESPESA")).rejects.toThrow(EscopoDeLeituraError);
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_DESPESA")).rejects.toThrow(
      /não tem a ação CONSULTAR_DESPESA em escopo nenhum.*é o crachá/s
    );
    await expect(exigirLeituraEmAlgumEscopoPara(quem, "CONSULTAR_DESPESA")).rejects.toThrow(/em escopo nenhum/);
    await expect(recorteDePaginaPara(quem, {}, "CONSULTAR_DESPESA")).rejects.toThrow(
      /não tem leitura em unidade nenhuma.*A ação de leitura cobrada é CONSULTAR_DESPESA/s
    );
    await expect(lerDossieDoEmpenhoPara(quem, empenhoSaude)).rejects.toThrow(
      /em unidade nenhuma.*não pode ler este registro/s
    );
    expect(await podeLerPara(quem, "CONSULTAR_CADASTROS", "ente")).toBe(false);
  });

  it("SOMENTE LEITURA (global): lê o consolidado, qualquer unidade e qualquer dossiê — e não empenha", async () => {
    const quem = await usuario("v3.so.leitura", [{ acao: "CONSULTAR_DESPESA", unidadeOrcId: null }]);

    expect(await recorteDePaginaPara(quem, {}, "CONSULTAR_DESPESA")).toEqual({ exercicio: 2026, unidadeCodigo: undefined });
    expect(await recorteDePaginaPara(quem, { ug: COD_EDUCACAO }, "CONSULTAR_DESPESA")).toEqual({ exercicio: 2026, unidadeCodigo: COD_EDUCACAO });
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_DESPESA")).resolves.toBeUndefined();

    const dossie = await lerDossieDoEmpenhoPara(quem, empenhoEducacao);
    expect(dossie.tipo).toBe("dossie");
    expect((await lerDossieDoEmpenhoPara(quem, empenhoSaude)).tipo).toBe("dossie");

    // ⚠️ SOMENTE leitura: a escrita continua negada, nomeando a ação que falta.
    await expect(autorizar(prisma, quem.identificador, "EMPENHAR", ugSaudeId)).rejects.toThrow(
      /não tem permissão para EMPENHAR/
    );
    // ...e a leitura de OUTRA área não vem de carona: global em uma ação não é global em outra.
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_RECEITA")).rejects.toThrow(/CONSULTAR_RECEITA em escopo nenhum/);
  });

  it("AÇÃO A NA UNIDADE 1, AÇÃO B NA UNIDADE 2: EMPENHAR na Saúde NÃO concede leitura na Saúde", async () => {
    const quem = await usuario("v3.a1.b2", [
      { acao: "EMPENHAR", unidadeOrcId: ugSaudeId },
      { acao: "CONSULTAR_DESPESA", unidadeOrcId: ugEducacaoId },
    ]);

    // O SELETOR vê a união (onde ele trabalha)...
    const { ugs } = await listarUgsDoUsuario(quem);
    expect(ugs.map((u) => u.codigo).sort()).toEqual([COD_EDUCACAO, COD_SAUDE]);
    // ...e a LEITURA vê só a ação de leitura: a Educação.
    expect((await escopoDeLeitura(quem, "CONSULTAR_DESPESA")).unidades).toEqual([COD_EDUCACAO]);

    // Sem `?ug=`: cai na unidade dele — nunca no consolidado.
    expect(await recorteDePaginaPara(quem, {}, "CONSULTAR_DESPESA")).toEqual({ exercicio: 2026, unidadeCodigo: COD_EDUCACAO });
    // `?ug=` da Saúde, onde ele EMPENHA mas não CONSULTA: recusa nomeando onde ele TEM leitura.
    await expect(recorteDePaginaPara(quem, { ug: COD_SAUDE }, "CONSULTAR_DESPESA")).rejects.toThrow(
      /Ele TEM leitura, mas só em: 01003/
    );
    // O dossiê do empenho da Saúde: recusa que NÃO nomeia a unidade do registro.
    let mensagem = "";
    try {
      await lerDossieDoEmpenhoPara(quem, empenhoSaude);
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    expect(mensagem).toMatch(/fora do escopo de leitura.*só em: 01003/s);
    expect(mensagem).not.toContain(COD_SAUDE);
    // O da Educação sai inteiro.
    expect((await lerDossieDoEmpenhoPara(quem, empenhoEducacao)).tipo).toBe("dossie");
    // E o ente inteiro, não.
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_DESPESA")).rejects.toThrow(/do ENTE inteiro.*só em: 01003/s);
    // Escrever na Saúde continua permitido — a política de leitura não mexe na escrita.
    await expect(autorizar(prisma, quem.identificador, "EMPENHAR", ugSaudeId)).resolves.toMatchObject({ unidadeOrcId: ugSaudeId });
  });

  it("GLOBAL EM UMA AÇÃO, RESTRITO EM OUTRA: a receita do ente sai; a despesa do ente não", async () => {
    const quem = await usuario("v3.global.restrito", [
      { acao: "CONSULTAR_RECEITA", unidadeOrcId: null },
      { acao: "CONSULTAR_DESPESA", unidadeOrcId: ugSaudeId },
    ]);

    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_RECEITA")).resolves.toBeUndefined();
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_DESPESA")).rejects.toThrow(
      /do ENTE inteiro.*só em: 01004.*concessão GLOBAL de CONSULTAR_DESPESA/s
    );
    // ⚠️ A GLOBAL DA RECEITA NÃO VIRA CONSOLIDADO DA DESPESA: sem `?ug=`, cai na Saúde.
    expect(await recorteDePaginaPara(quem, {}, "CONSULTAR_DESPESA")).toEqual({ exercicio: 2026, unidadeCodigo: COD_SAUDE });
    expect(await recorteDePaginaPara(quem, {}, "CONSULTAR_RECEITA")).toEqual({ exercicio: 2026, unidadeCodigo: undefined });
    expect(await podeLerPara(quem, "CONSULTAR_RECEITA", "ente")).toBe(true);
    expect(await podeLerPara(quem, "CONSULTAR_DESPESA", "ente")).toBe(false);
    expect(await podeLerPara(quem, "CONSULTAR_DESPESA", "algum")).toBe(true);
  });

  it("PERMISSÃO REVOGADA: o que passava antes recusa depois — sem cache entre as duas leituras", async () => {
    const quem = await usuario("v3.revogavel", [{ acao: "CONSULTAR_DESPESA", unidadeOrcId: null }]);
    expect((await lerDossieDoEmpenhoPara(quem, empenhoSaude)).tipo).toBe("dossie");
    expect(await recorteDePaginaPara(quem, {}, "CONSULTAR_DESPESA")).toEqual({ exercicio: 2026, unidadeCodigo: undefined });

    // A revogação é a ausência da linha — a doutrina do módulo.
    await prisma.permissaoDePerfil.deleteMany({ where: { acao: "CONSULTAR_DESPESA", perfil: { nome: "perfil-v3.revogavel" } } });

    await expect(lerDossieDoEmpenhoPara(quem, empenhoSaude)).rejects.toThrow(/em unidade nenhuma/);
    await expect(recorteDePaginaPara(quem, {}, "CONSULTAR_DESPESA")).rejects.toThrow(/unidade nenhuma/);
  });

  it("IDENTIDADE INATIVA: recusa pela revogação do cadastro, mesmo com a permissão na tabela", async () => {
    const quem = await usuario("v3.inativo", [{ acao: "CONSULTAR_DESPESA", unidadeOrcId: null }], false);
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_DESPESA")).rejects.toThrow(/REVOGADO/);
    await expect(recorteDePaginaPara(quem, {}, "CONSULTAR_DESPESA")).rejects.toThrow(/REVOGADO/);
    await expect(lerDossieDoEmpenhoPara(quem, empenhoSaude)).rejects.toThrow(/REVOGADO/);
  });

  it("ACESSO DIRETO POR EXPORTAÇÃO: o pedido das rotas passa pelo MESMO recorte, e responde o mesmo", async () => {
    const restrito = await usuario("v3.exporta.restrito", [{ acao: "CONSULTAR_DESPESA", unidadeOrcId: ugSaudeId }]);
    const global = await usuario("v3.exporta.global", [{ acao: "CONSULTAR_DESPESA", unidadeOrcId: null }]);

    expect(await recorteDePaginaPara(restrito, pedidoDaRota("exercicio=2026&ug=01004"), "CONSULTAR_DESPESA")).toEqual({ exercicio: 2026, unidadeCodigo: COD_SAUDE });
    await expect(recorteDePaginaPara(restrito, pedidoDaRota("exercicio=2026&ug=01003"), "CONSULTAR_DESPESA")).rejects.toThrow(/só em: 01004/);
    await expect(recorteDePaginaPara(restrito, pedidoDaRota("exercicio=abc"), "CONSULTAR_DESPESA")).rejects.toThrow(/não é um ano/);
    // Anti-regressão: um guard que negasse todos passaria nas asserções acima.
    expect(await recorteDePaginaPara(global, pedidoDaRota("exercicio=2026"), "CONSULTAR_DESPESA")).toEqual({ exercicio: 2026, unidadeCodigo: undefined });
  });

  it("id INEXISTENTE responde 'inexistente' a todos — a existência de um id não vaza pelo escopo", async () => {
    const sem = await usuario("v3.sem.nada", []);
    const global = await usuario("v3.tudo", [{ acao: "CONSULTAR_DESPESA", unidadeOrcId: null }]);
    expect(await lerDossieDoEmpenhoPara(sem, "nao-existe")).toEqual({ tipo: "inexistente" });
    expect(await lerDossieDoEmpenhoPara(global, "nao-existe")).toEqual({ tipo: "inexistente" });
  });

  it("registro do ENTE: a leitura por registro sem unidade cai na regra do ente", async () => {
    const restrito = await usuario("v3.registro.ente", [{ acao: "CONSULTAR_PATRIMONIO", unidadeOrcId: ugSaudeId }]);
    await expect(autorizarLeituraDoRegistroPara(restrito, "CONSULTAR_PATRIMONIO", undefined)).rejects.toThrow(/do ENTE inteiro/);
    await expect(autorizarLeituraDoRegistroPara(restrito, "CONSULTAR_PATRIMONIO", COD_SAUDE)).resolves.toBeUndefined();
  });
});
