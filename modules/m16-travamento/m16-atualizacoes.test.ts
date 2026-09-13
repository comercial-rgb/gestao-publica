import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { AREA_DA_ACAO } from "../../lib/portas/navegacao-permissoes.js";
import { bootstrapUsuario } from "../../prisma/seed/bootstrap-usuario.js";
import { ACOES_DE_LEITURA, TODAS_AS_ACOES } from "./acoes.js";
import {
  acaoDeLeituraDaArea,
  aplicarAtualizacaoDePermissoes,
  derivarDocumentoFiscalRecebido,
  derivarLeituraPorArea,
  derivarPlanejamentoPlurianual,
  derivarPublicarRoteiro,
  situacaoDasAtualizacoes,
  type PerfilComPermissoes,
} from "./atualizacoes-de-permissoes.js";

/**
 * ═══ INSTALAÇÃO LIMPA E ATUALIZAÇÃO — o que o pedido 4.2 manda testar ═══
 *
 *   - instalação limpa: o bootstrap concede o censo INTEIRO, leitura incluída;
 *   - atualização (upgrade): um perfil de antes da leitura recebe CONSULTAR_<ÁREA> em cada
 *     área onde já age, NO MESMO ESCOPO — e nada além;
 *   - reaplicar é recusado nomeando, e é isso que preserva uma revogação deliberada;
 *   - duas aplicações concorrentes: exatamente uma vence, e as concessões existem uma vez;
 *   - quem não pode conceder ação a perfil não aplica.
 *
 * ⚠️ A REGRA É PURA e é provada sem banco primeiro (N=2 em perfis, em áreas e em escopos).
 * Os testes de banco provam o EFEITO do caso de uso — não a papelada do registro.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const UG_A = "ug-a";
const UG_B = "ug-b";

describe("a regra da v1 — leitura por área, no escopo em que o perfil já age (pura)", () => {
  it("mapeia o slug da área para a ação de leitura, inclusive com hífen", () => {
    expect(acaoDeLeituraDaArea("despesa")).toBe("CONSULTAR_DESPESA");
    expect(acaoDeLeituraDaArea("controle-interno")).toBe("CONSULTAR_CONTROLE_INTERNO");
    expect(acaoDeLeituraDaArea("transversal")).toBeNull();
    expect(acaoDeLeituraDaArea("nao-existe")).toBeNull();
  });

  it("N=2: dois perfis, duas áreas, dois escopos — cada leitura cai no perfil e no escopo certos", () => {
    const perfis: readonly PerfilComPermissoes[] = [
      {
        id: "p1",
        nome: "TESOURARIA-SAUDE",
        permissoes: [
          { acao: "EMPENHAR", unidadeOrcId: UG_A },
          { acao: "PAGAR", unidadeOrcId: UG_A },
          { acao: "CADASTRAR_BEM", unidadeOrcId: null },
          { acao: "ANEXAR_ARQUIVO", unidadeOrcId: null },
        ],
      },
      {
        id: "p2",
        nome: "RECEITA-B",
        permissoes: [{ acao: "REGISTRAR_ARRECADACAO", unidadeOrcId: UG_B }],
      },
    ];
    const derivadas = derivarLeituraPorArea(perfis, AREA_DA_ACAO);
    expect(derivadas).toEqual([
      { perfilId: "p1", perfilNome: "TESOURARIA-SAUDE", acao: "CONSULTAR_DESPESA", unidadeOrcId: UG_A },
      { perfilId: "p1", perfilNome: "TESOURARIA-SAUDE", acao: "CONSULTAR_PATRIMONIO", unidadeOrcId: null },
      { perfilId: "p2", perfilNome: "RECEITA-B", acao: "CONSULTAR_RECEITA", unidadeOrcId: UG_B },
    ]);
    // ⚠️ O que NÃO derivou, afirmado: a transversal não vira leitura; a despesa da Saúde não
    // vira despesa global; a Educação (UG_B) não recebe leitura da despesa.
    const acoes = derivadas.map((d) => `${d.acao} ${d.unidadeOrcId ?? "G"}`);
    expect(acoes).not.toContain("CONSULTAR_DESPESA G");
    expect(acoes).not.toContain(`CONSULTAR_DESPESA ${UG_B}`);
    expect(acoes.some((a) => a.includes("TRANSVERSAL"))).toBe(false);
  });

  it("a área sem mutação nenhuma (transparência interna) vai só para quem administra permissões, global", () => {
    const perfis: readonly PerfilComPermissoes[] = [
      { id: "adm", nome: "ADM", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null }] },
      { id: "adm-ug", nome: "ADM-DE-UNIDADE", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: UG_A }] },
      { id: "op", nome: "OPERADOR", permissoes: [{ acao: "EMPENHAR", unidadeOrcId: null }] },
    ];
    const derivadas = derivarLeituraPorArea(perfis, AREA_DA_ACAO);
    expect(derivadas).toEqual([
      { perfilId: "adm", perfilNome: "ADM", acao: "CONSULTAR_ADMINISTRACAO", unidadeOrcId: null },
      { perfilId: "adm", perfilNome: "ADM", acao: "CONSULTAR_TRANSPARENCIA", unidadeOrcId: null },
      { perfilId: "adm-ug", perfilNome: "ADM-DE-UNIDADE", acao: "CONSULTAR_ADMINISTRACAO", unidadeOrcId: UG_A },
      { perfilId: "op", perfilNome: "OPERADOR", acao: "CONSULTAR_DESPESA", unidadeOrcId: null },
    ]);
  });

  it("v2: quem parametriza roteiro recebe PUBLICAR no MESMO escopo — e só quem parametriza", () => {
    const perfis: readonly PerfilComPermissoes[] = [
      { id: "cont", nome: "CONTADOR", permissoes: [{ acao: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL", unidadeOrcId: null }] },
      { id: "cont-ug", nome: "CONTADOR-UG", permissoes: [{ acao: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL", unidadeOrcId: UG_A }] },
      { id: "ja", nome: "JA-PUBLICA", permissoes: [{ acao: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL", unidadeOrcId: null }, { acao: "PUBLICAR_ROTEIRO_PATRIMONIAL", unidadeOrcId: null }] },
      { id: "op", nome: "OPERADOR", permissoes: [{ acao: "EMPENHAR", unidadeOrcId: null }] },
    ];
    expect(derivarPublicarRoteiro(perfis, AREA_DA_ACAO)).toEqual([
      { perfilId: "cont", perfilNome: "CONTADOR", acao: "PUBLICAR_ROTEIRO_PATRIMONIAL", unidadeOrcId: null },
      { perfilId: "cont-ug", perfilNome: "CONTADOR-UG", acao: "PUBLICAR_ROTEIRO_PATRIMONIAL", unidadeOrcId: UG_A },
    ]);
  });

  it("v5: quem cria FICHA no escopo GLOBAL recebe as dez do plurianual, no global — quem só cria ficha numa UG não recebe nada (V4 §8)", () => {
    const perfis: readonly PerfilComPermissoes[] = [
      { id: "plan", nome: "PLANEJADOR", permissoes: [{ acao: "CRIAR_FICHA", unidadeOrcId: null }] },
      { id: "plan-ug", nome: "PLANEJADOR-UG", permissoes: [{ acao: "CRIAR_FICHA", unidadeOrcId: UG_A }] },
      { id: "ja", nome: "JA-TEM-PPA", permissoes: [{ acao: "CRIAR_FICHA", unidadeOrcId: null }, { acao: "CADASTRAR_PPA", unidadeOrcId: null }] },
      { id: "op", nome: "OPERADOR", permissoes: [{ acao: "EMPENHAR", unidadeOrcId: null }] },
    ];
    const derivadas = derivarPlanejamentoPlurianual(perfis, AREA_DA_ACAO);
    expect(derivadas.filter((d) => d.perfilId === "plan").map((d) => d.acao)).toEqual([
      "CADASTRAR_PPA", "CADASTRAR_ESTRUTURA_PPA", "CADASTRAR_PROGRAMA_PPA", "CADASTRAR_RECEITA_PPA", "CADASTRAR_LDO",
      "CADASTRAR_PRIORIDADE_LDO", "CADASTRAR_METAS_FISCAIS_LDO", "CADASTRAR_RISCOS_FISCAIS_LDO", "CADASTRAR_RENUNCIA_RECEITA_LDO", "CADASTRAR_ALIENACAO_LDO",
    ]);
    expect(derivadas.every((d) => d.unidadeOrcId === null)).toBe(true);
    expect(derivadas.some((d) => d.perfilId === "plan-ug")).toBe(false);
    expect(derivadas.some((d) => d.perfilId === "op")).toBe(false);
    // Idempotente: o que já tem não deriva de novo — nove, e não dez.
    expect(derivadas.filter((d) => d.perfilId === "ja")).toHaveLength(9);
    expect(derivadas.some((d) => d.perfilId === "ja" && d.acao === "CADASTRAR_PPA")).toBe(false);
  });

  it("v6: quem registra recebimento recebe registrar+conferir o documento no mesmo escopo; quem estorna recebe cancelar; emitir ordem não deriva (V5 Fila A)", () => {
    const perfis: readonly PerfilComPermissoes[] = [
      { id: "rec", nome: "RECEBEDOR", permissoes: [{ acao: "REGISTRAR_RECEBIMENTO_DE_ORDEM", unidadeOrcId: UG_A }] },
      { id: "est", nome: "ESTORNA", permissoes: [{ acao: "ESTORNAR_ORDEM_DE_COMPRA", unidadeOrcId: UG_A }] },
      { id: "emi", nome: "EMITE", permissoes: [{ acao: "EMITIR_ORDEM_DE_COMPRA", unidadeOrcId: UG_A }] },
      {
        id: "ja",
        nome: "JA-TEM",
        permissoes: [
          { acao: "REGISTRAR_RECEBIMENTO_DE_ORDEM", unidadeOrcId: UG_A },
          { acao: "REGISTRAR_DOCUMENTO_FISCAL", unidadeOrcId: UG_A },
        ],
      },
    ];
    const derivadas = derivarDocumentoFiscalRecebido(perfis, AREA_DA_ACAO);
    expect(derivadas.filter((d) => d.perfilId === "rec").map((d) => d.acao).sort()).toEqual([
      "CONFERIR_DOCUMENTO_FISCAL",
      "REGISTRAR_DOCUMENTO_FISCAL",
    ]);
    expect(derivadas.filter((d) => d.perfilId === "est").map((d) => d.acao)).toEqual(["CANCELAR_DOCUMENTO_FISCAL"]);
    expect(derivadas.some((d) => d.perfilId === "emi")).toBe(false);
    expect(derivadas.filter((d) => d.perfilId === "ja").map((d) => d.acao)).toEqual(["CONFERIR_DOCUMENTO_FISCAL"]);
    expect(derivadas.every((d) => d.unidadeOrcId === UG_A)).toBe(true);
  });

  it("é idempotente: o que o perfil já tem não deriva de novo; leitura existente não gera leitura", () => {
    const perfis: readonly PerfilComPermissoes[] = [
      {
        id: "p1",
        nome: "JA-ATUALIZADO",
        permissoes: [
          { acao: "EMPENHAR", unidadeOrcId: UG_A },
          { acao: "CONSULTAR_DESPESA", unidadeOrcId: UG_A },
        ],
      },
      { id: "p2", nome: "VAZIO", permissoes: [] },
    ];
    expect(derivarLeituraPorArea(perfis, AREA_DA_ACAO)).toEqual([]);
  });

  it("um perfil com o censo inteiro de mutação recebe as 18 leituras, todas globais", () => {
    const perfis: readonly PerfilComPermissoes[] = [
      {
        id: "adm",
        nome: "ADM",
        permissoes: TODAS_AS_ACOES.filter((a) => !a.startsWith("CONSULTAR_")).map((acao) => ({ acao, unidadeOrcId: null })),
      },
    ];
    const derivadas = derivarLeituraPorArea(perfis, AREA_DA_ACAO);
    expect(derivadas.map((d) => d.acao).sort()).toEqual([...ACOES_DE_LEITURA].sort());
    expect(derivadas.every((d) => d.unidadeOrcId === null)).toBe(true);
  });
});

describe("instalação limpa e atualização — no banco", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    // ⚠️ O `limparBanco` SEMEIA usuários de fixture, e o bootstrap RECUSA banco povoado —
    // corretamente. Para provar a instalação limpa, o quadro de acesso é esvaziado aqui,
    // pelo dono do banco de teste, e só ele.
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PermissaoDePerfil", "VinculoUsuarioPerfil", "CredencialDeUsuario", "SessaoAberta", "Perfil", "Usuario" CASCADE'
    );
    await prisma.orgao.create({ data: { id: "org-at", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: UG_A, codigo: "01004", descricao: "Saúde", orgaoId: "org-at" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: UG_B, codigo: "01003", descricao: "Educação", orgaoId: "org-at" } });
  });

  async function instalar(): Promise<string> {
    const r = await bootstrapUsuario(prisma, "senha-de-instalacao-com-tamanho-suficiente");
    return r.identificador;
  }

  async function perfilLegado(): Promise<string> {
    const p = await prisma.perfil.create({
      data: {
        nome: "LEGADO",
        descricao: "perfil de antes da leitura virar permissão",
        criadoPor: "TESTE",
        permissoes: {
          create: [
            { acao: "EMPENHAR", unidadeOrcId: UG_A, criadoPor: "TESTE" },
            { acao: "PAGAR", unidadeOrcId: UG_A, criadoPor: "TESTE" },
            { acao: "CADASTRAR_CONTRATO", unidadeOrcId: null, criadoPor: "TESTE" },
            { acao: "ANEXAR_ARQUIVO", unidadeOrcId: null, criadoPor: "TESTE" },
          ],
        },
      },
      select: { id: true },
    });
    return p.id;
  }

  async function leiturasDe(perfilId: string): Promise<readonly string[]> {
    const ps = await prisma.permissaoDePerfil.findMany({
      where: { perfilId, acao: { in: [...ACOES_DE_LEITURA] } },
      select: { acao: true, unidadeOrcId: true },
      orderBy: { acao: "asc" },
    });
    return ps.map((p) => `${p.acao} ${p.unidadeOrcId ?? "G"}`);
  }

  it("instalação limpa: o bootstrap concede o censo inteiro, com as 18 leituras globais", async () => {
    await instalar();
    const adm = await prisma.perfil.findUniqueOrThrow({ where: { nome: "ADMINISTRADOR" }, select: { id: true } });
    // ⚠️ ORDENADO EM JS DOS DOIS LADOS: o Prisma ordena um enum pela ORDEM DE DECLARAÇÃO,
    // não alfabeticamente — a primeira execução comparou duas listas iguais em ordens
    // diferentes e falhou por isso.
    const leituras = [...(await leiturasDe(adm.id))].sort();
    expect(leituras).toEqual([...ACOES_DE_LEITURA].sort().map((a) => `${a} G`));
    expect(await prisma.permissaoDePerfil.count({ where: { perfilId: adm.id } })).toBe(TODAS_AS_ACOES.length);
    // Nada pendente: a instalação limpa já nasce com a v1 satisfeita para o admin.
    const situacao = await situacaoDasAtualizacoes(prisma, AREA_DA_ACAO);
    expect(situacao.map((s) => ({ versao: s.versao, previa: s.previa, aplicada: s.aplicadaEm !== null }))).toEqual([
      { versao: 1, previa: 0, aplicada: false },
      { versao: 2, previa: 0, aplicada: false },
      { versao: 3, previa: 0, aplicada: false },
      { versao: 4, previa: 0, aplicada: false },
      { versao: 5, previa: 0, aplicada: false },
      { versao: 6, previa: 0, aplicada: false },
    ]);
  });

  it("upgrade: o perfil legado recebe a leitura onde já age, no mesmo escopo — e só ali", async () => {
    const admin = await instalar();
    const legado = await perfilLegado();

    const antes = await situacaoDasAtualizacoes(prisma, AREA_DA_ACAO);
    expect(antes[0]?.previa).toBe(2); // CONSULTAR_DESPESA @ UG_A e CONSULTAR_LICITACOES global (o admin do bootstrap já tem as 18)

    const r = await aplicarAtualizacaoDePermissoes(prisma, { versao: 1, criadoPor: admin, areaDaAcao: AREA_DA_ACAO });
    expect(r).toEqual({ concessoes: 2, perfisAlcancados: 1 });

    expect([...(await leiturasDe(legado))].sort()).toEqual([`CONSULTAR_DESPESA ${UG_A}`, "CONSULTAR_LICITACOES G"]);
    // ⚠️ E O QUE NÃO ENTROU, afirmado: nem a despesa global, nem a Educação, nem a receita.
    const tudo = await prisma.permissaoDePerfil.findMany({ where: { perfilId: legado }, select: { acao: true, unidadeOrcId: true } });
    expect(tudo.some((p) => p.acao === "CONSULTAR_DESPESA" && p.unidadeOrcId === null)).toBe(false);
    expect(tudo.some((p) => p.unidadeOrcId === UG_B)).toBe(false);
    expect(tudo.some((p) => p.acao === "CONSULTAR_RECEITA")).toBe(false);
    // O autor fica em cada permissão concedida.
    expect(tudo.filter((p) => String(p.acao).startsWith("CONSULTAR_")).length).toBe(2);
    const registro = await prisma.atualizacaoDePermissoes.findUniqueOrThrow({ where: { versao: 1 } });
    expect(registro.aplicadaPor).toBe(admin);
    expect(registro.detalhe).toContain("LEGADO: CONSULTAR_DESPESA @ ug-a");

    const depois = await situacaoDasAtualizacoes(prisma, AREA_DA_ACAO);
    expect(depois[0]).toMatchObject({ versao: 1, previa: 0, aplicadaPor: admin, concessoes: 2 });

    // ⚠️ A v2 EM BANCO: o legado não parametriza roteiro, o admin já publica — prévia zero,
    // aplicação registrada com zero concessões, e reaplicar continua recusado.
    expect(depois[1]).toMatchObject({ versao: 2, previa: 0, aplicadaEm: null });
    const v2 = await aplicarAtualizacaoDePermissoes(prisma, { versao: 2, criadoPor: admin, areaDaAcao: AREA_DA_ACAO });
    expect(v2).toEqual({ concessoes: 0, perfisAlcancados: 0 });
    await expect(aplicarAtualizacaoDePermissoes(prisma, { versao: 2, criadoPor: admin, areaDaAcao: AREA_DA_ACAO })).rejects.toThrow(/JÁ APLICADA/);
  });

  it("reaplicar é recusado NOMEANDO — e a revogação deliberada feita depois é preservada", async () => {
    const admin = await instalar();
    const legado = await perfilLegado();
    await aplicarAtualizacaoDePermissoes(prisma, { versao: 1, criadoPor: admin, areaDaAcao: AREA_DA_ACAO });

    // O administrador decide que o LEGADO não deve consultar licitações.
    await prisma.permissaoDePerfil.deleteMany({ where: { perfilId: legado, acao: "CONSULTAR_LICITACOES" } });

    await expect(
      aplicarAtualizacaoDePermissoes(prisma, { versao: 1, criadoPor: admin, areaDaAcao: AREA_DA_ACAO })
    ).rejects.toThrow(/JÁ APLICADA.*versão 1.*reporia o que o administrador tiver revogado/s);

    expect(await leiturasDe(legado)).toEqual([`CONSULTAR_DESPESA ${UG_A}`]);
  });

  it("duas aplicações concorrentes: exatamente uma vence, e cada concessão existe UMA vez", async () => {
    const admin = await instalar();
    const legado = await perfilLegado();

    const resultados = await Promise.allSettled([
      aplicarAtualizacaoDePermissoes(prisma, { versao: 1, criadoPor: admin, areaDaAcao: AREA_DA_ACAO }),
      aplicarAtualizacaoDePermissoes(prisma, { versao: 1, criadoPor: admin, areaDaAcao: AREA_DA_ACAO }),
    ]);
    const venceu = resultados.filter((r) => r.status === "fulfilled");
    const perdeu = resultados.filter((r) => r.status === "rejected");
    expect(venceu).toHaveLength(1);
    expect(perdeu).toHaveLength(1);

    expect(await prisma.atualizacaoDePermissoes.count({ where: { versao: 1 } })).toBe(1);
    expect(await prisma.permissaoDePerfil.count({ where: { perfilId: legado, acao: "CONSULTAR_DESPESA" } })).toBe(1);
  });

  it("quem não pode conceder ação a perfil não aplica — negado nomeando a ação que falta", async () => {
    await instalar();
    await perfilLegado();
    const legado = await prisma.perfil.findUniqueOrThrow({ where: { nome: "LEGADO" }, select: { id: true } });
    const u = await prisma.usuario.create({
      data: { identificador: "legado@cg.pb.gov.br", nome: "Legado", criadoPor: "TESTE" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: legado.id, criadoPor: "TESTE" } });

    await expect(
      aplicarAtualizacaoDePermissoes(prisma, { versao: 1, criadoPor: "legado@cg.pb.gov.br", areaDaAcao: AREA_DA_ACAO })
    ).rejects.toThrow(/ACESSO NEGADO[\s\S]*CONCEDER_ACAO_A_PERFIL/);
    expect(await prisma.atualizacaoDePermissoes.count()).toBe(0);
    expect(await leiturasDe(legado.id)).toEqual([]);
  });

  it("versão desconhecida é recusada nomeando as conhecidas", async () => {
    const admin = await instalar();
    await expect(
      aplicarAtualizacaoDePermissoes(prisma, { versao: 99, criadoPor: admin, areaDaAcao: AREA_DA_ACAO })
    ).rejects.toThrow(/DESCONHECIDA.*1 \(leitura-por-area\), 2 \(publicar-roteiro\), 3 \(vincular-pessoa-ao-usuario\), 4 \(parametro-de-atualizacao\), 5 \(planejamento-plurianual\)/s);
  });
});
