import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { apagarLicenciamentoDeTeste } from "./licenciamento-teste.js";
import { ID_DO_ENTE_UNICO } from "../modules/m01-core-contabil/contexto-do-ente.js";
import {
  ACOES_DO_ENTE,
  ACOES_DO_FORNECEDOR,
  TODAS_AS_ACOES,
  ehAcaoDoFornecedor,
} from "../modules/m16-travamento/acoes.js";
import { concederAcaoAoPerfil } from "../modules/m16-travamento/servico-perfis.js";
import {
  dependenciasFaltantes,
  dependentesContratados,
  podeEscrever,
  podeLer,
  situacaoDoModulo,
} from "../modules/m35-licenciamento/dominio.js";
import {
  CATALOGO_DE_MODULOS,
  MODULOS_LICENCIAVEIS,
  MODULO_DA_ACAO,
  moduloDoCatalogo,
} from "../modules/m35-licenciamento/modulos.js";
import { instalarLicenciamento, modulosEmUso } from "../modules/m35-licenciamento/instalacao.js";
import {
  habilitarModuloContratado,
  lerLicenciamento,
  programarVigenciaDeModulo,
  reativarModuloContratado,
  registrarContratoComercial,
  situacaoDoModuloNaImplantacao,
  suspenderModuloContratado,
} from "../modules/m35-licenciamento/servico.js";

/**
 * ═══ O LICENCIAMENTO COMERCIAL (V10 T1 · N6.1) ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, defeito a defeito:
 *
 * **O município habilitando a si próprio.** Se a habilitação coubesse na tela de permissões do
 * ente, quem administra permissões se daria o contrato num clique. L1 e L2 afirmam a recusa
 * pelos DOIS lados: a ação é reservada no censo, e a tela de permissões a recusa nomeando.
 *
 * **Cascata clandestina.** Habilitar "Compras" ligando o núcleo contábil "porque ele precisa"
 * entregaria de graça um módulo que ninguém contratou. L5 afirma a recusa e L6 a simetria —
 * suspender a base com o dependente vigente também é recusado.
 *
 * **Suspensão virando apagamento.** Módulo suspenso não pode fechar a leitura: o ente segue
 * obrigado a prestar contas do que já escriturou. L8 separa as duas perguntas.
 *
 * **Vigência em UTC.** Uma comparação com `new Date()` faria o contrato vencer às 21h do dia
 * anterior para um ente que ainda está nele. L9 exercita as bordas pelo dia civil, com fixture
 * N=2 (um dia antes e o próprio dia).
 *
 * **Idempotência que apaga histórico.** Repetir a operação não pode duplicar evento — nem
 * engolir um fato diferente. L10 prova os dois.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const OPERADOR = "u"; // do elenco das fixtures: tem TODAS_AS_ACOES pelo perfil ADMIN.
const HOJE = "2026-09-16";

/**
 * ⚠️ ESTE ARQUIVO PARTE DO ZERO, e é o único que precisa disso. `limparBanco` semeia o contrato
 * das fixtures (senão a suíte inteira cairia no gate); aqui o assunto É o contrato, então ele
 * é apagado antes de cada caso — e cada teste monta o estado que quer afirmar.
 */

async function contratoComNucleo(): Promise<string> {
  const r = await registrarContratoComercial(prisma, {
    enteId: ID_DO_ENTE_UNICO,
    numero: "CT-2026-001",
    cliente: "Município de teste",
    inicio: "2026-01-01",
    fim: null,
    observacao: null,
    demonstracao: true,
    criadoPor: OPERADOR,
  });
  await habilitarModuloContratado(prisma, {
    contratoId: r.contratoId,
    modulo: "NUCLEO_CONTABIL",
    inicio: "2026-01-01",
    fim: null,
    motivo: "Contratado no instrumento original.",
    criadoPor: OPERADOR,
  });
  return r.contratoId;
}

beforeEach(async () => {
  await limparBanco(prisma);
  await apagarLicenciamentoDeTeste(prisma);
});

// ════════════════════════════════════════════════════════════════════════════
// L1–L2 — O MUNICÍPIO NÃO CONCEDE A SI PRÓPRIO
// ════════════════════════════════════════════════════════════════════════════

describe("L1 — as ações do fornecedor são reservadas no censo", () => {
  it("nenhuma delas entra em ACOES_DO_ENTE, e ACOES_DO_ENTE é o censo menos elas", () => {
    for (const a of ACOES_DO_FORNECEDOR) {
      expect(ACOES_DO_ENTE).not.toContain(a);
      expect(TODAS_AS_ACOES).toContain(a);
    }
    expect(ACOES_DO_ENTE.length).toBe(TODAS_AS_ACOES.length - ACOES_DO_FORNECEDOR.length);
  });

  it("⚠️ a lista reservada é uma PROPRIEDADE do censo, não um prefixo de nome", () => {
    // Guarda que enumera FORMAS acha só aquelas formas. Aqui se afirma que o discriminador
    // usado pelo bootstrap, pela recusa e por este teste é o MESMO — uma constante só.
    for (const a of TODAS_AS_ACOES) {
      expect(ehAcaoDoFornecedor(a)).toBe((ACOES_DO_FORNECEDOR as readonly string[]).includes(a));
    }
  });

  it("⚠️ e nenhuma delas é licenciável: o próprio licenciamento é PLATAFORMA", () => {
    // Se fosse licenciável, uma suspensão trancaria a tela que a desfaz.
    for (const a of ACOES_DO_FORNECEDOR) expect(MODULO_DA_ACAO[a]).toBe("PLATAFORMA");
  });
});

describe("L2 — a tela de permissões do ENTE recusa concedê-las", () => {
  it("o administrador municipal NÃO concede HABILITAR_MODULO_CONTRATADO a perfil nenhum", async () => {
    const alvo = await prisma.perfil.create({
      data: { nome: "SECRETARIA", descricao: "perfil municipal", criadoPor: OPERADOR },
      select: { id: true },
    });
    await expect(
      concederAcaoAoPerfil(prisma, {
        perfilId: alvo.id,
        acao: "HABILITAR_MODULO_CONTRATADO",
        unidadeOrcId: null,
        criadoPor: OPERADOR,
      })
    ).rejects.toThrow(/AÇÃO RESERVADA AO FORNECEDOR/);
    expect(await prisma.permissaoDePerfil.count({ where: { perfilId: alvo.id } })).toBe(0);
  });

  it("⚠️ e a recusa vale para as SEIS, não só para a que alguém lembrou de testar", async () => {
    const alvo = await prisma.perfil.create({
      data: { nome: "OUTRA", descricao: "perfil municipal", criadoPor: OPERADOR },
      select: { id: true },
    });
    for (const acao of ACOES_DO_FORNECEDOR) {
      await expect(
        concederAcaoAoPerfil(prisma, { perfilId: alvo.id, acao, unidadeOrcId: null, criadoPor: OPERADOR })
      ).rejects.toThrow(/AÇÃO RESERVADA AO FORNECEDOR/);
    }
    expect(await prisma.permissaoDePerfil.count({ where: { perfilId: alvo.id } })).toBe(0);
  });

  it("uma ação MUNICIPAL continua sendo concedida normalmente — a recusa é específica", async () => {
    const alvo = await prisma.perfil.create({
      data: { nome: "TESOURARIA", descricao: "perfil municipal", criadoPor: OPERADOR },
      select: { id: true },
    });
    const r = await concederAcaoAoPerfil(prisma, {
      perfilId: alvo.id,
      acao: "PAGAR",
      unidadeOrcId: null,
      criadoPor: OPERADOR,
    });
    expect(r.permissaoId).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L3–L4 — O ATO, A AUTORIZAÇÃO E O UM-CONTRATO-POR-IMPLANTAÇÃO
// ════════════════════════════════════════════════════════════════════════════

describe("L3 — habilitar exige a ação, e quem não a tem é recusado", () => {
  it("o operador do fornecedor habilita; um usuário sem a ação não", async () => {
    const contratoId = await contratoComNucleo();

    const perfilMunicipal = await prisma.perfil.create({
      data: {
        nome: "ADMIN MUNICIPAL",
        descricao: "o censo do ENTE, como o bootstrap concede",
        criadoPor: OPERADOR,
        permissoes: { create: ACOES_DO_ENTE.map((acao) => ({ acao, criadoPor: OPERADOR })) },
      },
      select: { id: true },
    });
    const municipal = await prisma.usuario.create({
      data: { identificador: "admin.municipal@teste", nome: "Admin municipal", criadoPor: OPERADOR },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: municipal.id, perfilId: perfilMunicipal.id, criadoPor: OPERADOR },
    });

    await expect(
      habilitarModuloContratado(prisma, {
        contratoId,
        modulo: "COMPRAS_E_CONTRATOS",
        inicio: "2026-01-01",
        fim: null,
        motivo: "Tentativa do administrador municipal.",
        criadoPor: "admin.municipal@teste",
      })
    ).rejects.toThrow(/ACESSO NEGADO/);

    // ⚠️ NEGAÇÃO COM MOTIVO: não basta "não completou". Nada foi gravado.
    expect(await prisma.habilitacaoDeModulo.count({ where: { modulo: "COMPRAS_E_CONTRATOS" } })).toBe(0);

    const ok = await habilitarModuloContratado(prisma, {
      contratoId,
      modulo: "COMPRAS_E_CONTRATOS",
      inicio: "2026-01-01",
      fim: null,
      motivo: "Contratado por aditivo.",
      criadoPor: OPERADOR,
    });
    expect(ok.novo).toBe(true);
  });
});

describe("L4 — um contrato ativo por implantação", () => {
  it("registrar um segundo contrato ativo é recusado nomeando o primeiro", async () => {
    await contratoComNucleo();
    await expect(
      registrarContratoComercial(prisma, {
        enteId: ID_DO_ENTE_UNICO,
        numero: "CT-2026-002",
        cliente: "Outro",
        inicio: "2026-01-01",
        fim: null,
        observacao: null,
        demonstracao: false,
        criadoPor: OPERADOR,
      })
    ).rejects.toThrow(/JÁ HÁ CONTRATO ATIVO/);
    expect(await prisma.contratoComercial.count()).toBe(1);
  });

  it("vigência invertida é recusada antes de qualquer escrita", async () => {
    await expect(
      registrarContratoComercial(prisma, {
        enteId: ID_DO_ENTE_UNICO,
        numero: "CT-INVERTIDO",
        cliente: "X",
        inicio: "2026-05-01",
        fim: "2026-04-30",
        observacao: null,
        demonstracao: false,
        criadoPor: OPERADOR,
      })
    ).rejects.toThrow(/VIGÊNCIA INVERTIDA/);
    expect(await prisma.contratoComercial.count()).toBe(0);
    expect(await prisma.eventoDeLicenciamento.count()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L5–L6 — DEPENDÊNCIAS: NOMEADAS, NUNCA HABILITADAS
// ════════════════════════════════════════════════════════════════════════════

describe("L5 — dependência faltante recusa, e NÃO habilita em cascata", () => {
  it("habilitar Compras sem o núcleo contratado é recusado, e o núcleo não nasce", async () => {
    const r = await registrarContratoComercial(prisma, {
      enteId: ID_DO_ENTE_UNICO,
      numero: "CT-SEM-NUCLEO",
      cliente: "Município",
      inicio: "2026-01-01",
      fim: null,
      observacao: null,
      demonstracao: true,
      criadoPor: OPERADOR,
    });
    await expect(
      habilitarModuloContratado(prisma, {
        contratoId: r.contratoId,
        modulo: "COMPRAS_E_CONTRATOS",
        inicio: "2026-01-01",
        fim: null,
        motivo: "Sem a base contratada.",
        criadoPor: OPERADOR,
      })
    ).rejects.toThrow(/DEPENDÊNCIA NÃO CONTRATADA/);

    // ⚠️ O EFEITO, e não a mensagem: NADA foi habilitado — nem o pedido, nem a dependência.
    expect(await prisma.habilitacaoDeModulo.count()).toBe(0);
  });
});

describe("L6 — suspender quem sustenta outro é recusado", () => {
  it("o núcleo não é suspenso enquanto Compras estiver vigente", async () => {
    const contratoId = await contratoComNucleo();
    await habilitarModuloContratado(prisma, {
      contratoId,
      modulo: "COMPRAS_E_CONTRATOS",
      inicio: "2026-01-01",
      fim: null,
      motivo: "Contratado.",
      criadoPor: OPERADOR,
    });

    await expect(
      suspenderModuloContratado(
        prisma,
        { contratoId, modulo: "NUCLEO_CONTABIL", motivo: "Inadimplência do contrato.", criadoPor: OPERADOR },
        () => new Date("2026-09-16T12:00:00-03:00")
      )
    ).rejects.toThrow(/SUSPENSÃO INCOERENTE/);

    const h = await prisma.habilitacaoDeModulo.findFirst({ where: { modulo: "NUCLEO_CONTABIL" }, select: { ativa: true } });
    expect(h?.ativa).toBe(true);
  });

  it("suspenso o dependente primeiro, a base é suspensa — a sequência é a que a mensagem indica", async () => {
    const contratoId = await contratoComNucleo();
    await habilitarModuloContratado(prisma, {
      contratoId,
      modulo: "COMPRAS_E_CONTRATOS",
      inicio: "2026-01-01",
      fim: null,
      motivo: "Contratado.",
      criadoPor: OPERADOR,
    });
    const relogio = (): Date => new Date("2026-09-16T12:00:00-03:00");
    await suspenderModuloContratado(
      prisma,
      { contratoId, modulo: "COMPRAS_E_CONTRATOS", motivo: "Suspensão do aditivo.", criadoPor: OPERADOR },
      relogio
    );
    const r = await suspenderModuloContratado(
      prisma,
      { contratoId, modulo: "NUCLEO_CONTABIL", motivo: "Inadimplência do contrato.", criadoPor: OPERADOR },
      relogio
    );
    expect(r.novo).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L7 — O GATE: NÃO CONTRATADO × SUSPENSO × VIGÊNCIA
// ════════════════════════════════════════════════════════════════════════════

describe("L7 — a situação de cada módulo, lida do banco", () => {
  it("contratado e vigente = HABILITADO; o não contratado = NAO_CONTRATADO", async () => {
    await contratoComNucleo();
    const relogio = (): Date => new Date("2026-09-16T12:00:00-03:00");
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "NUCLEO_CONTABIL", relogio)
    ).toBe("HABILITADO");
    // ⚠️ FIXTURE N=2: dois módulos NÃO contratados, e não um só — a regra que só vale para o
    // primeiro da lista passaria com N=1.
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "PESSOAL_E_FOLHA", relogio)
    ).toBe("NAO_CONTRATADO");
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "TRIBUTOS_E_ARRECADACAO", relogio)
    ).toBe("NAO_CONTRATADO");
  });

  it("⚠️ a PLATAFORMA é HABILITADA mesmo sem contrato nenhum", async () => {
    // Sem isto, um contrato mal configurado tiraria do município a administração dos próprios
    // usuários — e a saída seria mexer no banco à mão.
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "PLATAFORMA")
    ).toBe("HABILITADO");
  });

  it("a leitura é keyed pelo ENTE: um contrato de outra implantação não habilita esta", async () => {
    // ⚠️ ISTO NÃO É MULTITENANCY, e não inventa seletor de tenant. O ente continua vindo de
    // `ID_DO_ENTE_UNICO` (uma constante do processo), nunca de URL, cabeçalho ou formulário. O
    // que se afirma aqui é que a CONSULTA é recortada pelo ente — a propriedade que, em
    // implantações separadas por banco, torna o vazamento impossível por construção.
    const outro = await registrarContratoComercial(prisma, {
      enteId: "outro",
      numero: "CT-OUTRO",
      cliente: "Outro município",
      inicio: "2026-01-01",
      fim: null,
      observacao: null,
      demonstracao: true,
      criadoPor: OPERADOR,
    });
    await habilitarModuloContratado(prisma, {
      contratoId: outro.contratoId,
      modulo: "NUCLEO_CONTABIL",
      inicio: "2026-01-01",
      fim: null,
      motivo: "Do outro contrato.",
      criadoPor: OPERADOR,
    });

    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "NUCLEO_CONTABIL")
    ).toBe("NAO_CONTRATADO");
    expect(await situacaoDoModuloNaImplantacao(prisma, "outro", "NUCLEO_CONTABIL")).toBe("HABILITADO");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L8 — SUSPENDER NÃO APAGA, E NÃO FECHA A LEITURA
// ════════════════════════════════════════════════════════════════════════════

describe("L8 — suspensão preserva fato e leitura histórica", () => {
  it("SUSPENSO bloqueia escrita e PERMITE leitura; NAO_CONTRATADO fecha os dois", () => {
    expect(podeEscrever("HABILITADO")).toBe(true);
    expect(podeEscrever("SUSPENSO")).toBe(false);
    expect(podeEscrever("FORA_DE_VIGENCIA")).toBe(false);
    expect(podeEscrever("NAO_CONTRATADO")).toBe(false);

    expect(podeLer("HABILITADO")).toBe(true);
    expect(podeLer("SUSPENSO")).toBe(true);
    expect(podeLer("FORA_DE_VIGENCIA")).toBe(true);
    expect(podeLer("NAO_CONTRATADO")).toBe(false);
  });

  it("a habilitação e os eventos sobrevivem à suspensão — nada é apagado", async () => {
    const contratoId = await contratoComNucleo();
    const antes = await prisma.habilitacaoDeModulo.findFirstOrThrow({
      where: { contratoId, modulo: "NUCLEO_CONTABIL" },
      select: { id: true, inicio: true, fim: true, criadoEm: true, criadoPor: true },
    });
    await suspenderModuloContratado(
      prisma,
      { contratoId, modulo: "NUCLEO_CONTABIL", motivo: "Suspensão comercial.", criadoPor: OPERADOR },
      () => new Date("2026-09-16T12:00:00-03:00")
    );
    const depois = await prisma.habilitacaoDeModulo.findFirstOrThrow({
      where: { contratoId, modulo: "NUCLEO_CONTABIL" },
      select: { id: true, inicio: true, fim: true, criadoEm: true, criadoPor: true, ativa: true },
    });
    expect(depois.id).toBe(antes.id);
    expect(depois.inicio).toBe(antes.inicio);
    expect(depois.criadoEm.toISOString()).toBe(antes.criadoEm.toISOString());
    expect(depois.criadoPor).toBe(antes.criadoPor);
    expect(depois.ativa).toBe(false);

    // O contrato encerrado põe FORA DE VIGÊNCIA, e não NAO_CONTRATADO: é o que preserva a leitura.
    const visao = await lerLicenciamento(prisma, ID_DO_ENTE_UNICO, () => new Date("2026-09-16T12:00:00-03:00"));
    const nucleo = visao.modulos.find((m) => m.modulo === "NUCLEO_CONTABIL");
    expect(nucleo?.situacao).toBe("SUSPENSO");
    expect(nucleo?.contratado).toBe(true);
  });

  it("reativar volta a HABILITADO sem estender a vigência registrada", async () => {
    const contratoId = await contratoComNucleo();
    const relogio = (): Date => new Date("2026-09-16T12:00:00-03:00");
    await suspenderModuloContratado(prisma, { contratoId, modulo: "NUCLEO_CONTABIL", motivo: "Suspensão comercial.", criadoPor: OPERADOR }, relogio);
    await reativarModuloContratado(prisma, { contratoId, modulo: "NUCLEO_CONTABIL", motivo: "Acordo cumprido.", criadoPor: OPERADOR }, relogio);
    const h = await prisma.habilitacaoDeModulo.findFirstOrThrow({
      where: { contratoId, modulo: "NUCLEO_CONTABIL" },
      select: { ativa: true, inicio: true, fim: true },
    });
    expect(h.ativa).toBe(true);
    expect(h.inicio).toBe("2026-01-01");
    expect(h.fim).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L9 — VIGÊNCIA PELO DIA CIVIL, NAS BORDAS
// ════════════════════════════════════════════════════════════════════════════

describe("L9 — a vigência é comparada por DIA CIVIL, e as bordas são inclusivas", () => {
  const contrato = { numero: "X", ativo: true, inicio: "2026-01-01", fim: "2026-12-31" } as const;
  const hab = [{ modulo: "NUCLEO_CONTABIL", ativa: true, inicio: "2026-03-01", fim: "2026-03-31" }] as const;

  it("o primeiro e o último dia estão DENTRO; o anterior e o seguinte, fora", () => {
    const em = (hoje: string): string =>
      situacaoDoModulo({ modulo: "NUCLEO_CONTABIL", hoje, contrato, habilitacoes: hab });
    // ⚠️ FIXTURE N=2 nas duas bordas: só o par (véspera, primeiro dia) distingue "≥" de ">".
    expect(em("2026-02-28")).toBe("FORA_DE_VIGENCIA");
    expect(em("2026-03-01")).toBe("HABILITADO");
    expect(em("2026-03-31")).toBe("HABILITADO");
    expect(em("2026-04-01")).toBe("FORA_DE_VIGENCIA");
  });

  it("⚠️ o último dia do módulo às 23h de Kiritimati continua sendo o dia civil do ENTE", async () => {
    // O relógio é injetado: o serviço nunca chama `new Date()` direto na decisão. Este teste
    // fixa um instante que, em UTC, JÁ É o dia seguinte — e o dia civil do ente ainda é o 31.
    const contratoId = await contratoComNucleo();
    await programarVigenciaDeModulo(prisma, {
      contratoId,
      modulo: "NUCLEO_CONTABIL",
      inicio: "2026-01-01",
      fim: "2026-03-31",
      motivo: "Vigência com termo.",
      criadoPor: OPERADOR,
    });
    // 2026-03-31 21:30 em São Paulo (UTC-3) = 2026-04-01 00:30 UTC.
    const quaseMeiaNoite = (): Date => new Date("2026-04-01T00:30:00Z");
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "NUCLEO_CONTABIL", quaseMeiaNoite)
    ).toBe("HABILITADO");
    // E no dia seguinte, civil, já venceu.
    const dia1 = (): Date => new Date("2026-04-01T15:00:00Z");
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "NUCLEO_CONTABIL", dia1)
    ).toBe("FORA_DE_VIGENCIA");
  });

  it("contrato encerrado põe FORA DE VIGÊNCIA — nunca NAO_CONTRATADO", () => {
    const s = situacaoDoModulo({
      modulo: "NUCLEO_CONTABIL",
      hoje: "2026-03-15",
      contrato: { ...contrato, ativo: false },
      habilitacoes: hab,
    });
    expect(s).toBe("FORA_DE_VIGENCIA");
    expect(podeLer(s)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L10 — IDEMPOTÊNCIA QUE NÃO ENGOLE FATO
// ════════════════════════════════════════════════════════════════════════════

describe("L10 — repetir não duplica; mudar é fato novo", () => {
  it("a MESMA habilitação, duas vezes, grava UM evento e responde 'nada foi gravado'", async () => {
    const contratoId = await contratoComNucleo();
    const primeira = await habilitarModuloContratado(prisma, {
      contratoId,
      modulo: "PATRIMONIO_E_ALMOXARIFADO",
      inicio: "2026-02-01",
      fim: null,
      motivo: "Contratado por aditivo.",
      criadoPor: OPERADOR,
    });
    const segunda = await habilitarModuloContratado(prisma, {
      contratoId,
      modulo: "PATRIMONIO_E_ALMOXARIFADO",
      inicio: "2026-02-01",
      fim: null,
      motivo: "Contratado por aditivo.",
      criadoPor: OPERADOR,
    });
    expect(primeira.novo).toBe(true);
    expect(segunda.novo).toBe(false);
    expect(
      await prisma.eventoDeLicenciamento.count({
        where: { contratoId, modulo: "PATRIMONIO_E_ALMOXARIFADO", tipo: "MODULO_HABILITADO" },
      })
    ).toBe(1);
  });

  it("⚠️ uma vigência DIFERENTE é fato novo, e o histórico registra os dois", async () => {
    // Se a chave não levasse a vigência, a segunda operação colidiria com a primeira e a
    // prorrogação sumiria do histórico — idempotência virando perda de registro.
    const contratoId = await contratoComNucleo();
    await programarVigenciaDeModulo(prisma, {
      contratoId,
      modulo: "NUCLEO_CONTABIL",
      inicio: "2026-01-01",
      fim: "2026-06-30",
      motivo: "Primeira vigência.",
      criadoPor: OPERADOR,
    });
    await programarVigenciaDeModulo(prisma, {
      contratoId,
      modulo: "NUCLEO_CONTABIL",
      inicio: "2026-01-01",
      fim: "2026-12-31",
      motivo: "Prorrogação.",
      criadoPor: OPERADOR,
    });
    const eventos = await prisma.eventoDeLicenciamento.findMany({
      where: { contratoId, tipo: "VIGENCIA_PROGRAMADA" },
      select: { vigenciaFim: true },
      orderBy: { criadoEm: "asc" },
    });
    expect(eventos.map((e) => e.vigenciaFim)).toEqual(["2026-06-30", "2026-12-31"]);
    const h = await prisma.habilitacaoDeModulo.findFirstOrThrow({
      where: { contratoId, modulo: "NUCLEO_CONTABIL" },
      select: { fim: true },
    });
    expect(h.fim).toBe("2026-12-31");
  });

  it("suspender duas vezes no mesmo dia não grava dois eventos", async () => {
    const contratoId = await contratoComNucleo();
    const relogio = (): Date => new Date("2026-09-16T12:00:00-03:00");
    const a = await suspenderModuloContratado(prisma, { contratoId, modulo: "NUCLEO_CONTABIL", motivo: "Inadimplência.", criadoPor: OPERADOR }, relogio);
    const b = await suspenderModuloContratado(prisma, { contratoId, modulo: "NUCLEO_CONTABIL", motivo: "Inadimplência.", criadoPor: OPERADOR }, relogio);
    expect(a.novo).toBe(true);
    expect(b.novo).toBe(false);
    expect(await prisma.eventoDeLicenciamento.count({ where: { contratoId, tipo: "MODULO_SUSPENSO" } })).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L11 — A INSTALAÇÃO DE COMPATIBILIDADE
// ════════════════════════════════════════════════════════════════════════════

describe("L11 — a atualização não tranca ninguém, e não libera em silêncio", () => {
  it("os módulos em uso saem das permissões já concedidas, com as dependências junto", () => {
    const m = modulosEmUso(["EMPENHAR", "CADASTRAR_CONTRATO"]);
    expect(m).toContain("NUCLEO_CONTABIL");
    expect(m).toContain("COMPRAS_E_CONTRATOS");
    // ⚠️ E o que NINGUÉM usa fica de fora — senão a "compatibilidade" seria liberação geral.
    expect(m).not.toContain("PESSOAL_E_FOLHA");
    expect(m).not.toContain("TRIBUTOS_E_ARRECADACAO");
  });

  it("uma ação de PLATAFORMA sozinha não contrata módulo nenhum", () => {
    expect(modulosEmUso(["CRIAR_USUARIO", "CADASTRAR_PESSOA", "ANEXAR_ARQUIVO"])).toEqual([]);
  });

  it("⚠️ num banco com perfil de censo inteiro, a dedução devolve TUDO — e é a verdade", async () => {
    // As fixtures semeiam um perfil com o censo completo, como o bootstrap de uma instalação
    // real faz com o ADMINISTRADOR. A dedução então contrata todos os módulos, e isso NÃO é
    // defeito: um ente cujo administrador tem todas as ações estava mesmo operando com tudo
    // aberto, e escrever outro contrato seria inventar uma contratação que não houve.
    //
    // ⚠️ É por isso que o script PRÉ-VISUALIZA por padrão e só grava com `--aplicar`: quem
    // instala vê a dedução antes, e declara `--modulos` quando o contrato real é menor.
    const acoes = (
      await prisma.permissaoDePerfil.findMany({ select: { acao: true }, distinct: ["acao"] })
    ).map((p) => String(p.acao));
    expect(modulosEmUso(acoes)).toEqual([...MODULOS_LICENCIAVEIS].sort());
  });

  it("instalar com os módulos DECLARADOS grava só eles, e o resto fica não contratado", async () => {
    const r = await instalarLicenciamento(prisma, {
      enteId: ID_DO_ENTE_UNICO,
      numero: "CT-INSTALACAO",
      cliente: "Município",
      criadoPor: OPERADOR,
      demonstracao: true,
      modulos: ["NUCLEO_CONTABIL", "PATRIMONIO_E_ALMOXARIFADO"],
      agora: new Date("2026-09-16T12:00:00-03:00"),
    });
    expect(r.instalado).toBe(true);
    expect(r.modulos).toEqual(["NUCLEO_CONTABIL", "PATRIMONIO_E_ALMOXARIFADO"]);
    const relogio = (): Date => new Date("2026-09-16T12:00:00-03:00");
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "PATRIMONIO_E_ALMOXARIFADO", relogio)
    ).toBe("HABILITADO");
    // ⚠️ FIXTURE N=2 do lado negativo também: dois módulos fora do contrato declarado.
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "PESSOAL_E_FOLHA", relogio)
    ).toBe("NAO_CONTRATADO");
    expect(
      await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, "COMPRAS_E_CONTRATOS", relogio)
    ).toBe("NAO_CONTRATADO");
  });

  it("a segunda execução é INERTE — e diz qual contrato já existe", async () => {
    await contratoComNucleo();
    const r = await instalarLicenciamento(prisma, {
      enteId: ID_DO_ENTE_UNICO,
      numero: "CT-OUTRO-NOME",
      cliente: "Município",
      criadoPor: OPERADOR,
      demonstracao: true,
    });
    expect(r.instalado).toBe(false);
    expect(r.numero).toBe("CT-2026-001");
    expect(await prisma.contratoComercial.count()).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L12 — O CATÁLOGO É EXAUSTIVO E COERENTE
// ════════════════════════════════════════════════════════════════════════════

describe("L12 — o catálogo comercial", () => {
  it("toda ação do censo tem módulo, e todo módulo do mapa está no catálogo", () => {
    const ids = CATALOGO_DE_MODULOS.map((m) => m.id);
    for (const acao of TODAS_AS_ACOES) {
      const m = MODULO_DA_ACAO[acao];
      expect(m, `ação sem módulo comercial: ${acao}`).toBeDefined();
      expect(ids).toContain(m);
    }
  });

  it("a PLATAFORMA é o ÚNICO módulo não licenciável", () => {
    expect(CATALOGO_DE_MODULOS.filter((m) => !m.licenciavel).map((m) => m.id)).toEqual(["PLATAFORMA"]);
    expect(MODULOS_LICENCIAVEIS).not.toContain("PLATAFORMA");
  });

  it("nenhuma dependência aponta para módulo não licenciável nem para si mesmo", () => {
    for (const m of CATALOGO_DE_MODULOS) {
      expect(m.depende).not.toContain(m.id);
      for (const d of m.depende) expect(moduloDoCatalogo(d).licenciavel).toBe(true);
    }
  });

  it("dependenciasFaltantes e dependentesContratados são inversas coerentes", () => {
    expect(dependenciasFaltantes("COMPRAS_E_CONTRATOS", [])).toEqual(["NUCLEO_CONTABIL"]);
    expect(dependenciasFaltantes("COMPRAS_E_CONTRATOS", ["NUCLEO_CONTABIL"])).toEqual([]);
    expect(dependentesContratados("NUCLEO_CONTABIL", ["COMPRAS_E_CONTRATOS", "PESSOAL_E_FOLHA"])).toEqual([
      "COMPRAS_E_CONTRATOS",
      "PESSOAL_E_FOLHA",
    ]);
    expect(dependentesContratados("ATENDIMENTO_AO_CIDADAO", ["COMPRAS_E_CONTRATOS"])).toEqual([]);
  });

  it("⚠️ o dia de hoje da projeção é o dia CIVIL, e não a data em UTC", async () => {
    await contratoComNucleo();
    const visao = await lerLicenciamento(prisma, ID_DO_ENTE_UNICO, () => new Date("2026-04-01T00:30:00Z"));
    expect(visao.hoje).toBe("2026-03-31");
  });
});

void HOJE;
