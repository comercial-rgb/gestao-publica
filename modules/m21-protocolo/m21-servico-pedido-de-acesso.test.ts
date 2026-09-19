import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { situacaoDoPedido, visaoDoSolicitante, visaoInternaDoPedido, type FatoDoPedido, type PedidoDeAcesso } from "./pedido-de-acesso.js";
import { publicarConfiguracaoDoAcesso } from "./servico-acesso-a-informacao.js";
import {
  decidirRecursoDeAcesso,
  distribuirPedidoDeAcesso,
  interporRecursoDeAcesso,
  prorrogarPedidoDeAcesso,
  protocolarPedidoDeAcesso,
  receberPedidoDeAcesso,
  responderPedidoDeAcesso,
} from "./servico-pedido-de-acesso.js";

/**
 * ═══ O RITO DO ACESSO À INFORMAÇÃO, CONTRA BANCO DE VERDADE (V11 V5.3, Fase B) ═══
 *
 * O domínio puro já tem 25 casos (`m21-pedido-de-acesso.test.ts`). O que ESTE arquivo prova é
 * o que só o banco pode provar:
 *
 *   · que o fato PERSISTE e é relido igual — inclusive o dia civil GRAVADO;
 *   · que o pedido e o PROCESSO andam juntos, na mesma transação (distribuir tramita);
 *   · que a repetição não duplica — e que a segunda chamada não move o processo de novo;
 *   · que a norma congelada no pedido sobrevive à publicação de uma versão nova;
 *   · que o servidor RECUSA sem o crachá, e a recusa diz qual ação falta;
 *   · que o índice único parcial impede a segunda resposta mesmo se o domínio for burlado.
 *
 * ⚠️ A ARMADILHA DA FIXTURE, REPETIDA AQUI PORQUE ELA CUSTA CARO: `semearUsuariosDeTeste` dá
 * ADMIN global às identidades das fixtures, e quem tem permissão global enxerga todo setor. Um
 * teste de autorização escrito com elas passaria sem testar nada. O t7 cria o SEU usuário, com
 * perfil sem a ação.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const BALCAO = "protocolo@cg.pb.gov.br";
const ANALISTA = "juridico@cg.pb.gov.br";

let assuntoId = "";
let requerenteId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.orgao.create({ data: { id: "a-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "a-uo", codigo: "01001", descricao: "Administração", orgaoId: "a-org" },
  });
  await prisma.exercicio.create({ data: { id: "a-ex", ano: 2026, criadoPor: "SEED" } });
  await prisma.setor.createMany({
    data: [
      { id: "sa1", codigo: "SIC", nome: "Serviço de Informação ao Cidadão", unidadeOrcId: "a-uo", criadoPor: "SEED" },
      { id: "sa2", codigo: "OBR", nome: "Secretaria de Obras", unidadeOrcId: "a-uo", criadoPor: "SEED" },
    ],
  });
  await prisma.usuarioDoSetor.createMany({
    data: [
      { usuarioIdent: BALCAO, setorId: "sa1", criadoPor: "SEED" },
      { usuarioIdent: ANALISTA, setorId: "sa2", criadoPor: "SEED" },
    ],
  });
  assuntoId = (
    await prisma.assunto.create({
      data: { codigo: "LAI", nome: "Pedido de acesso à informação", criadoPor: "SEED" },
      select: { id: true },
    })
  ).id;
  requerenteId = (
    await prisma.pessoa.create({
      data: {
        documento: "11144477735",
        tipo: "FISICA",
        criadoPor: "SEED",
        versoes: { create: { nome: "Cidadã Requerente", ativa: true, criadoPor: "SEED" } },
      },
      select: { id: true },
    })
  ).id;
}

const CONFIG = {
  vigenciaInicio: "2026-01-01",
  prazoDeRespostaEmDias: 20,
  prazoDeProrrogacaoEmDias: 10,
  prorrogacoesPermitidas: 1,
  instanciasDeRecurso: 2,
  prazoDeRecursoEmDias: 10,
  normaFederal: "Lei federal de acesso à informação, art. 11",
  normaFederalPublicadaEm: "2011-11-18",
  regulamentacaoLocal: null,
  regulamentacaoLocalPublicadaEm: null,
  observacao: null,
  criadoPor: BALCAO,
};

const PEDIDO = {
  exercicio: 2026,
  assuntoId: "",
  setorAberturaId: "sa1",
  pedido: "Solicito a relação de contratos de obras vigentes no exercício.",
  sufixoDaChave: "balcao-1",
  criadoPor: BALCAO,
};

async function protocolar(sufixo = "balcao-1"): Promise<{ pedidoId: string; processoId: string }> {
  const r = await protocolarPedidoDeAcesso(prisma, {
    ...PEDIDO,
    assuntoId,
    requerenteId,
    sufixoDaChave: sufixo,
  });
  return { pedidoId: r.pedidoId, processoId: r.processoId };
}

/** Relê pedido e fatos do banco, no formato do domínio puro. */
async function reler(pedidoId: string): Promise<{ pedido: PedidoDeAcesso; fatos: readonly FatoDoPedido[] }> {
  const l = await prisma.pedidoDeAcessoAInformacao.findUniqueOrThrow({
    where: { id: pedidoId },
    select: {
      id: true,
      processoId: true,
      protocoladoEm: true,
      configuracaoVersao: true,
      processo: { select: { numero: true, exercicio: { select: { ano: true } } } },
      fatos: { orderBy: { em: "asc" } },
    },
  });
  return {
    pedido: {
      id: l.id,
      processoId: l.processoId,
      protocolo: `${l.processo.numero}/${l.processo.exercicio.ano}`,
      protocoladoEm: l.protocoladoEm,
      configuracaoVersao: l.configuracaoVersao,
    },
    fatos: l.fatos as unknown as readonly FatoDoPedido[],
  };
}

describe("M21 — o rito do acesso à informação, contra banco", () => {
  beforeEach(semear);

  it("s1: a jornada inteira PERSISTE, e a situação relida do banco é a que o domínio calcula", async () => {
    await publicarConfiguracaoDoAcesso(prisma, CONFIG);
    const { pedidoId, processoId } = await protocolar();

    await distribuirPedidoDeAcesso(prisma, {
      pedidoId,
      setorDestinoId: "sa2",
      fundamentoInterno: "A informação está na Secretaria de Obras.",
      sufixoDaChave: "dist-1",
      criadoPor: BALCAO,
    });
    await receberPedidoDeAcesso(prisma, { pedidoId, sufixoDaChave: "rec-1", criadoPor: ANALISTA });
    await responderPedidoDeAcesso(prisma, {
      pedidoId,
      entregar: true,
      classificacao: "ACESSO_CONCEDIDO",
      mensagemAoRequerente: "Segue a relação de contratos vigentes, conforme solicitado.",
      fundamentoInterno: "Relação extraída do sistema de contratos.",
      documentoId: null,
      sufixoDaChave: "resp-1",
      criadoPor: ANALISTA,
    });

    const { fatos } = await reler(pedidoId);
    expect(fatos.map((f) => f.natureza)).toEqual([
      "PEDIDO_PROTOCOLADO",
      "PEDIDO_DISTRIBUIDO",
      "PEDIDO_RECEBIDO",
      "RESPOSTA_ENTREGUE",
    ]);
    expect(situacaoDoPedido(fatos)).toBe("RESPONDIDO");

    // ⚠️ O PROCESSO ANDOU JUNTO. Um fato do rito sem o movimento seria uma trilha que conta o
    // que o processo não viveu.
    const movimentos = await prisma.movimentoDoProcesso.findMany({
      where: { processoId },
      orderBy: { criadoEm: "asc" },
      select: { tipo: true, setorDestinoId: true },
    });
    expect(movimentos.map((m) => m.tipo)).toEqual(["TRAMITE", "RECEBIMENTO"]);
    expect(movimentos[0]?.setorDestinoId).toBe("sa2");
  });

  it("s2: o DIA CIVIL vai GRAVADO, e é o dia do ente — não se recalcula na leitura", async () => {
    await publicarConfiguracaoDoAcesso(prisma, CONFIG);
    const { pedidoId } = await protocolar();
    const { fatos } = await reler(pedidoId);

    // ⚠️ A PROPRIEDADE, não o valor: o dia gravado é o dia civil do ente NAQUELE instante.
    // Comparar com um dia fixo escrito aqui seria uma fixture que envelhece sozinha.
    const esperado = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(fatos[0]!.em);
    expect(fatos[0]!.dia).toBe(esperado);
    expect(fatos[0]!.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("s3: repetir o MESMO ato devolve o mesmo fato — e NÃO tramita o processo de novo", async () => {
    await publicarConfiguracaoDoAcesso(prisma, CONFIG);
    const { pedidoId, processoId } = await protocolar();

    const comando = {
      pedidoId,
      setorDestinoId: "sa2",
      fundamentoInterno: "A informação está na Secretaria de Obras.",
      sufixoDaChave: "dist-1",
      criadoPor: BALCAO,
    };
    const a = await distribuirPedidoDeAcesso(prisma, comando);
    const b = await distribuirPedidoDeAcesso(prisma, comando);

    expect(a.repetido).toBe(false);
    expect(b.repetido).toBe(true);
    expect(b.fatoId).toBe(a.fatoId);

    const { fatos } = await reler(pedidoId);
    expect(fatos.filter((f) => f.natureza === "PEDIDO_DISTRIBUIDO")).toHaveLength(1);
    // ⚠️ A OUTRA PONTA, e é ela que importa: o processo não pode ter tramitado duas vezes.
    // Um replay que devolve o mesmo id e MOVE o processo de novo é pior que um duplicado
    // visível — o duplicado alguém vê.
    expect(await prisma.movimentoDoProcesso.count({ where: { processoId, tipo: "TRAMITE" } })).toBe(1);
  });

  it("s4: N=2 pedidos — a norma congelada de cada um sobrevive à publicação da versão nova", async () => {
    await publicarConfiguracaoDoAcesso(prisma, CONFIG);
    const primeiro = await protocolar("balcao-1");

    await publicarConfiguracaoDoAcesso(prisma, {
      ...CONFIG,
      vigenciaInicio: "2026-06-01",
      prazoDeRespostaEmDias: 5,
      normaFederal: "Lei federal de acesso à informação, art. 11, com a redação nova",
    });
    const segundo = await protocolar("balcao-2");

    const a = await reler(primeiro.pedidoId);
    const b = await reler(segundo.pedidoId);

    // ⚠️ COM N=1 ISTO PASSARIA POR VACUIDADE: um pedido só não mostra que as versões são
    // diferentes entre pedidos — mostraria só que a coluna tem algum número.
    expect(a.pedido.configuracaoVersao).toBe(1);
    expect(b.pedido.configuracaoVersao).toBe(2);
    expect(a.fatos[0]!.configuracaoVersao).toBe(1);
    expect(b.fatos[0]!.configuracaoVersao).toBe(2);
  });

  it("s5: pedido nascido SEM configuração persiste com versão nula, e publicar depois não o alcança", async () => {
    const { pedidoId } = await protocolar();
    const antes = await reler(pedidoId);
    expect(antes.pedido.configuracaoVersao).toBeNull();

    await publicarConfiguracaoDoAcesso(prisma, CONFIG);

    const depois = await reler(pedidoId);
    expect(depois.pedido.configuracaoVersao).toBeNull();
    // E ele continua correndo: o que falta é a DATA, não o direito — e o requerente lê POR QUE.
    const v = visaoDoSolicitante(depois.pedido, null, depois.fatos, new Date());
    expect(v.limite).toBeNull();
    expect(v.avisos.length).toBeGreaterThan(0);
    expect(v.normaFederal).toBeNull();
  });

  it("s6: o recurso persiste com a instância, e a decisão fecha a instância aberta", async () => {
    await publicarConfiguracaoDoAcesso(prisma, CONFIG);
    const { pedidoId } = await protocolar();
    await responderPedidoDeAcesso(prisma, {
      pedidoId,
      entregar: true,
      classificacao: "ACESSO_NEGADO",
      mensagemAoRequerente: "O pedido foi indeferido pelas razões abaixo.",
      fundamentoInterno: "A informação está classificada por decisão fundamentada.",
      documentoId: null,
      sufixoDaChave: "resp-1",
      criadoPor: ANALISTA,
    });

    await interporRecursoDeAcesso(prisma, {
      pedidoId,
      razoes: "A informação pedida não é sigilosa e o indeferimento não indicou a hipótese legal.",
      sufixoDaChave: "rec1",
      criadoPor: BALCAO,
    });
    await decidirRecursoDeAcesso(prisma, {
      pedidoId,
      resultado: "PROVIDO",
      mensagemAoRequerente: "O recurso foi provido e a informação será entregue.",
      fundamentoInterno: null,
      sufixoDaChave: "dec1",
      criadoPor: BALCAO,
    });

    const { fatos } = await reler(pedidoId);
    const interposto = fatos.find((f) => f.natureza === "RECURSO_INTERPOSTO");
    const decidido = fatos.find((f) => f.natureza === "RECURSO_DECIDIDO");
    expect(interposto?.instancia).toBe(1);
    expect(decidido?.instancia).toBe(1);
    expect(decidido?.resultadoDoRecurso).toBe("PROVIDO");
  });

  it("s7: NEGATIVA — sem a ação no perfil o servidor RECUSA, e a recusa diz qual ação falta", async () => {
    await publicarConfiguracaoDoAcesso(prisma, CONFIG);

    // ⚠️ USUÁRIO PRÓPRIO: as identidades da fixture são ADMIN global e passariam por qualquer
    // porta. Este tem perfil com UMA ação, e não é a de protocolar.
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO_CONSULTA",
        descricao: "Perfil que só lê o protocolo",
        criadoPor: "SEED",
        permissoes: { create: [{ acao: "CONSULTAR_PROTOCOLO", criadoPor: "SEED" }] },
      },
      select: { id: true },
    });
    const u = await prisma.usuario.create({
      data: { identificador: "sem-cracha@cg.pb.gov.br", nome: "Sem Crachá", criadoPor: "SEED" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "SEED" },
    });
    await prisma.usuarioDoSetor.create({
      data: { usuarioIdent: "sem-cracha@cg.pb.gov.br", setorId: "sa1", criadoPor: "SEED" },
    });

    await expect(
      protocolarPedidoDeAcesso(prisma, {
        ...PEDIDO,
        assuntoId,
        requerenteId,
        criadoPor: "sem-cracha@cg.pb.gov.br",
      }),
    ).rejects.toThrow(/PROTOCOLAR_PEDIDO_DE_ACESSO_A_INFORMACAO/);

    // ⚠️ E NADA FOI GRAVADO: uma recusa que deixa o processo aberto teria criado o pedido
    // pela metade — o processo existiria sem o pedido.
    expect(await prisma.pedidoDeAcessoAInformacao.count()).toBe(0);
    expect(await prisma.processo.count()).toBe(0);
  });

  it("s8: o ÍNDICE ÚNICO PARCIAL impede a segunda resposta entregue, mesmo por fora do domínio", async () => {
    await publicarConfiguracaoDoAcesso(prisma, CONFIG);
    const { pedidoId, processoId } = await protocolar();
    await responderPedidoDeAcesso(prisma, {
      pedidoId,
      entregar: true,
      classificacao: "ACESSO_CONCEDIDO",
      mensagemAoRequerente: "Segue a informação solicitada, conforme o pedido.",
      fundamentoInterno: null,
      documentoId: null,
      sufixoDaChave: "resp-1",
      criadoPor: ANALISTA,
    });

    // ⚠️ ESCREVENDO DIRETO NA TABELA, de propósito: é assim que se prova que a trava está no
    // BANCO e não só no caso de uso. Chave diferente — então não é o `@unique` da chave que
    // recusa; é o índice parcial da natureza.
    await expect(
      prisma.fatoDoPedidoDeAcesso.create({
        data: {
          pedidoId,
          processoId,
          natureza: "RESPOSTA_ENTREGUE",
          ator: ANALISTA,
          em: new Date(),
          dia: "2026-09-19",
          configuracaoVersao: 1,
          chave: `acesso:${pedidoId}:RESPOSTA_ENTREGUE:segunda`,
          mensagemAoRequerente: "Uma segunda resposta, que não pode existir.",
          classificacao: "ACESSO_NEGADO",
        },
      }),
    ).rejects.toThrow();

    const { fatos } = await reler(pedidoId);
    expect(fatos.filter((f) => f.natureza === "RESPOSTA_ENTREGUE")).toHaveLength(1);
  });

  it("s9: a projeção do REQUERENTE não carrega nada de interno — afirmado por propriedade", async () => {
    await publicarConfiguracaoDoAcesso(prisma, CONFIG);
    const { pedidoId } = await protocolar();
    const SEGREDO = "Consultar a procuradoria antes de responder — risco de litígio.";
    await distribuirPedidoDeAcesso(prisma, {
      pedidoId,
      setorDestinoId: "sa2",
      fundamentoInterno: SEGREDO,
      sufixoDaChave: "dist-1",
      criadoPor: BALCAO,
    });
    await prorrogarPedidoDeAcesso(prisma, {
      pedidoId,
      fundamentoInterno: SEGREDO,
      mensagemAoRequerente: "O prazo foi prorrogado para levantamento dos documentos.",
      sufixoDaChave: "prorr-1",
      criadoPor: BALCAO,
    });

    const { pedido, fatos } = await reler(pedidoId);
    const config = {
      versao: 1,
      vigenciaInicio: CONFIG.vigenciaInicio,
      prazoDeRespostaEmDias: CONFIG.prazoDeRespostaEmDias,
      prazoDeProrrogacaoEmDias: CONFIG.prazoDeProrrogacaoEmDias,
      prorrogacoesPermitidas: CONFIG.prorrogacoesPermitidas,
      instanciasDeRecurso: CONFIG.instanciasDeRecurso,
      prazoDeRecursoEmDias: CONFIG.prazoDeRecursoEmDias,
      normaFederal: CONFIG.normaFederal,
      normaFederalPublicadaEm: new Date(`${CONFIG.normaFederalPublicadaEm}T12:00:00.000Z`),
      regulamentacaoLocal: null,
      regulamentacaoLocalPublicadaEm: null,
      observacao: null,
    };
    const requerente = JSON.stringify(visaoDoSolicitante(pedido, config, fatos, new Date()));
    const interna = JSON.stringify(visaoInternaDoPedido(pedido, config, fatos, "sa1", new Date()));

    // ⚠️ PROPRIEDADE, NÃO LISTA DE EXCLUSÃO: não se confere campo a campo — afirma-se que o
    // TEXTO interno não aparece em lugar nenhum da projeção do requerente. Uma lista acharia
    // só os campos que alguém lembrou de listar.
    expect(interna).toContain(SEGREDO);
    expect(requerente).not.toContain(SEGREDO);
    // Antivacuidade: a projeção do requerente não está vazia.
    expect(requerente).toContain("prorrogado");
  });
});
