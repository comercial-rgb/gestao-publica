import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { hashDoComunicado } from "./dominio.js";
import {
  integridadeDoEnvio,
  leiturasDoComunicado,
  listarCaixaDeComunicados,
} from "./consultas.js";
import {
  arquivarComunicado,
  criarTipoDeComunicado,
  editarRascunho,
  encaminharComunicado,
  enviarComunicado,
  etiquetarComunicado,
  favoritarComunicado,
  marcarLeitura,
  rascunharComunicado,
  responderComunicado,
} from "./servico.js";

/**
 * M23 — COMUNICAÇÃO INTERNA, contra banco de verdade.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 * Os testes do lote que recaem sobre a comunicação: circular NÃO aceita resposta e a
 * resposta a memorando só alcança os setores já envolvidos (10); a consulta de leitura
 * mostra usuário, instante e origem sem expor segredo (11).
 *
 * E mais três coisas que o catálogo pede e que só se provam com banco: a numeração por
 * ano/tipo/setor (dois setores podem ter o memorando 1/2026 e é legítimo), a caixa
 * calculada por ponto de vista (o mesmo documento na saída de um e na entrada de outro)
 * e o carimbo de conteúdo que denuncia a edição de um documento já enviado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const PROTOCOLO = "protocolo@cg.pb.gov.br";
const JURIDICO = "juridico@cg.pb.gov.br";
const GABINETE = "gabinete@cg.pb.gov.br";

let memorando = "";
let circular = "";
let comAssinatura = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.orgao.create({ data: { id: "c-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "c-uo", codigo: "01001", descricao: "Administração", orgaoId: "c-org" },
  });
  await prisma.exercicio.create({ data: { id: "c-ex", ano: 2026, criadoPor: "SEED" } });
  await prisma.setor.createMany({
    data: [
      { id: "c-s1", codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "c-uo", criadoPor: "SEED" },
      { id: "c-s2", codigo: "JUR", nome: "Procuradoria", unidadeOrcId: "c-uo", criadoPor: "SEED" },
      { id: "c-s3", codigo: "GAB", nome: "Gabinete", unidadeOrcId: "c-uo", criadoPor: "SEED" },
    ],
  });
  await prisma.usuarioDoSetor.createMany({
    data: [
      { usuarioIdent: PROTOCOLO, setorId: "c-s1", criadoPor: "SEED" },
      { usuarioIdent: JURIDICO, setorId: "c-s2", criadoPor: "SEED" },
      { usuarioIdent: GABINETE, setorId: "c-s3", criadoPor: "SEED" },
    ],
  });

  memorando = (
    await criarTipoDeComunicado(prisma, {
      codigo: "MEMO", nome: "Memorando", criadoPor: PROTOCOLO,
    })
  ).tipoId;
  circular = (
    await criarTipoDeComunicado(prisma, {
      codigo: "CIRC", nome: "Circular", aceitaResposta: false, criadoPor: PROTOCOLO,
    })
  ).tipoId;
  comAssinatura = (
    await criarTipoDeComunicado(prisma, {
      codigo: "OFIC", nome: "Ofício", modoDeAssinaturaExigido: "AVANCADA",
      criadoPor: PROTOCOLO,
    })
  ).tipoId;
}

const RASCUNHO = {
  exercicio: 2026,
  setorRemetenteId: "c-s1",
  assunto: "Solicitação de parecer",
  corpo: "Solicitamos manifestação sobre o pedido em anexo.",
  criadoPor: PROTOCOLO,
};

beforeEach(semear);

describe("M23 — numeração, rascunho e envio", () => {
  it("t1: a numeração é por ANO, TIPO e SETOR — dois setores podem ter o número 1", async () => {
    const a = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    const b = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    // Mesmo setor, mesmo tipo: a fila anda.
    expect([a.numero, b.numero]).toEqual([1, 2]);

    // Outro SETOR: fila própria. O memorando 1 da Procuradoria é outro documento, e é
    // legítimo — uma sequência única no ente faria dois setores disputarem a mesma fila.
    const c = await rascunharComunicado(prisma, {
      ...RASCUNHO, tipoId: memorando, setorRemetenteId: "c-s2", criadoPor: JURIDICO,
    });
    expect(c.numero).toBe(1);

    // Outro TIPO, mesmo setor: fila própria também.
    const d = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: circular });
    expect(d.numero).toBe(1);
  });

  it("t2: duas emissões CONCORRENTES do mesmo tipo e setor não colidem", async () => {
    const [x, y] = await Promise.all([
      rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando }),
      rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando }),
    ]);
    expect([x.numero, y.numero].sort()).toEqual([1, 2]);
  });

  it("t3: o rascunho é editável ANTES de enviar, e nunca depois", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });

    await editarRascunho(prisma, {
      comunicadoId: r.comunicadoId,
      assunto: "Solicitação de parecer (corrigida)",
      corpo: "Solicitamos manifestação sobre o pedido, com a correção devida.",
      criadoPor: PROTOCOLO,
    });

    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId,
      destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });

    await expect(
      editarRascunho(prisma, {
        comunicadoId: r.comunicadoId, assunto: "Depois do envio",
        corpo: "Texto trocado depois que alguém já leu.", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/JÁ FOI ENVIADO e não se edita mais/);
  });

  it("t4: o envio CARIMBA o hash do conteúdo — e a edição por fora é denunciada", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId,
      destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });

    const antes = await integridadeDoEnvio(prisma, r.comunicadoId);
    expect(antes).toEqual({ enviado: true, integro: true });

    // ⚠️ ALGUÉM EDITA POR FORA DO CASO DE USO — é o cenário que o grant por coluna
    // permite e que o guard do serviço recusa. O hash é o que torna isso VISÍVEL.
    await prisma.comunicado.update({
      where: { id: r.comunicadoId },
      data: { corpo: "Texto adulterado depois do envio." },
    });

    const depois = await integridadeDoEnvio(prisma, r.comunicadoId);
    expect(depois).toEqual({ enviado: true, integro: false });
  });

  it("t5: o tipo que EXIGE assinatura recusa o envio sem ela — e recusa o modo errado", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: comAssinatura });

    await expect(
      enviarComunicado(prisma, {
        comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
        criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/EXIGE assinatura AVANCADA e ela não veio/);

    await expect(
      enviarComunicado(prisma, {
        comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
        modoDeAssinatura: "SIMPLES", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/não são intercambiáveis/);

    const ok = await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
      modoDeAssinatura: "AVANCADA", criadoPor: PROTOCOLO,
    });
    expect(ok.destinatarios).toBe(1);

    // A assinatura aponta para o movimento de envio, e carrega o hash do conteúdo.
    const ass = await prisma.assinaturaDeDocumento.findFirstOrThrow({
      where: { movimentoComunicadoId: ok.movimentoId },
      select: { modo: true, assinadoPor: true, hashConteudo: true },
    });
    expect(ass.modo).toBe("AVANCADA");
    expect(ass.hashConteudo).toBe(
      hashDoComunicado(RASCUNHO.assunto, RASCUNHO.corpo)
    );
  });
});

describe("M23 — resposta e encaminhamento", () => {
  it("t6: CIRCULAR não aceita resposta — e a recusa é do servidor", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: circular });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId,
      destinatarios: [{ setorId: "c-s2" }, { setorId: "c-s3" }],
      criadoPor: PROTOCOLO,
    });

    await expect(
      responderComunicado(prisma, {
        comunicadoId: r.comunicadoId, setorRemetenteId: "c-s2",
        assunto: "Re: circular", corpo: "Tentando responder a uma circular.",
        criadoPor: JURIDICO,
      })
    ).rejects.toThrow(/NÃO aceita resposta[\s\S]*lista de\s*\n?\s*discussão/);
  });

  it("t7: a resposta ao memorando só alcança os setores JÁ ENVOLVIDOS", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId,
      destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });

    const resposta = await responderComunicado(prisma, {
      comunicadoId: r.comunicadoId, setorRemetenteId: "c-s2",
      assunto: "Re: Solicitação de parecer",
      corpo: "Manifestação favorável, nos termos do pedido.",
      criadoPor: JURIDICO,
    });

    const destinos = await prisma.destinatarioDoComunicado.findMany({
      where: { comunicadoId: resposta.comunicadoId },
      select: { setorId: true },
    });
    // ⚠️ SÓ O REMETENTE ORIGINAL. O Gabinete (c-s3) NÃO entra: ele nunca esteve na
    // conversa, e se a resposta pudesse incluí-lo, "responder" seria "encaminhar" sem
    // o registro que o encaminhamento deixa.
    expect(destinos.map((d) => d.setorId)).toEqual(["c-s1"]);

    // O setor de fora não pode nem responder.
    await expect(
      responderComunicado(prisma, {
        comunicadoId: r.comunicadoId, setorRemetenteId: "c-s3",
        assunto: "Intrometido", corpo: "Respondendo sem ter sido chamado.",
        criadoPor: GABINETE,
      })
    ).rejects.toThrow(/tem de estar entre os já envolvidos/);
  });

  it("t8: ENCAMINHAR é o ato que inclui alguém novo — e fica marcado como tal", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });

    await encaminharComunicado(prisma, {
      comunicadoId: r.comunicadoId, setorDestinoId: "c-s3", criadoPor: JURIDICO,
    });

    const destinos = await prisma.destinatarioDoComunicado.findMany({
      where: { comunicadoId: r.comunicadoId },
      select: { setorId: true, porEncaminhamento: true },
      orderBy: { setorId: "asc" },
    });
    expect(destinos).toEqual([
      { setorId: "c-s2", porEncaminhamento: false },
      { setorId: "c-s3", porEncaminhamento: true },
    ]);

    // E agora o Gabinete PODE responder: ele passou a fazer parte da conversa.
    const resp = await responderComunicado(prisma, {
      comunicadoId: r.comunicadoId, setorRemetenteId: "c-s3",
      assunto: "Re: Solicitação de parecer", corpo: "Ciente do encaminhamento recebido.",
      criadoPor: GABINETE,
    });
    expect(resp.numero).toBe(1);
  });

  it("t9: o A/C destaca, mas NÃO restringe o setor", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId,
      destinatarios: [{ setorId: "c-s2", aosCuidadosDe: JURIDICO }],
      criadoPor: PROTOCOLO,
    });

    // ⚠️ UM MEMORANDO ENDEREÇADO AO SETOR É DO SETOR, mesmo quando alguém é nomeado
    // nele. Tratar o A/C como restrição faria o documento sumir para o resto do setor.
    const outroDoSetor = await prisma.usuario.create({
      data: { identificador: "colega@cg.pb.gov.br", nome: "Colega", criadoPor: "SEED" },
      select: { id: true },
    });
    void outroDoSetor;
    await prisma.usuarioDoSetor.create({
      data: { usuarioIdent: "colega@cg.pb.gov.br", setorId: "c-s2", criadoPor: "SEED" },
    });

    const doColega = await listarCaixaDeComunicados(prisma, "colega@cg.pb.gov.br", "ENTRADA");
    expect(doColega).toHaveLength(1);
    expect(doColega[0]?.aosCuidadosDeMim).toBe(false);

    const doNomeado = await listarCaixaDeComunicados(prisma, JURIDICO, "ENTRADA");
    expect(doNomeado[0]?.aosCuidadosDeMim).toBe(true);
  });
});

describe("M23 — as caixas são ponto de vista, e a leitura é registrada", () => {
  it("t10: o MESMO comunicado está na SAÍDA de um e na ENTRADA do outro", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });

    // Antes do envio: rascunho para quem escreve, invisível para o destino.
    expect((await listarCaixaDeComunicados(prisma, PROTOCOLO, "RASCUNHO"))).toHaveLength(1);
    expect((await listarCaixaDeComunicados(prisma, JURIDICO, "ENTRADA"))).toHaveLength(0);

    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });

    const saida = await listarCaixaDeComunicados(prisma, PROTOCOLO, "SAIDA");
    const entrada = await listarCaixaDeComunicados(prisma, JURIDICO, "ENTRADA");
    expect(saida).toHaveLength(1);
    expect(entrada).toHaveLength(1);
    // ⚠️ É O MESMO DOCUMENTO. Uma coluna `caixa` teria de valer duas coisas ao mesmo
    // tempo — e é por isso que ela não existe.
    expect(saida[0]?.id).toBe(entrada[0]?.id);
    expect(saida[0]?.rotulo).toBe("MEMO 1/2026");
  });

  it("t11: arquivar e favoritar são POR USUÁRIO — não somem para os outros", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });

    await arquivarComunicado(prisma, { comunicadoId: r.comunicadoId, criadoPor: JURIDICO });
    await favoritarComunicado(prisma, { comunicadoId: r.comunicadoId, criadoPor: PROTOCOLO });

    expect(await listarCaixaDeComunicados(prisma, JURIDICO, "ENTRADA")).toHaveLength(0);
    expect(await listarCaixaDeComunicados(prisma, JURIDICO, "ARQUIVADO")).toHaveLength(1);
    // ⚠️ PARA O REMETENTE NADA MUDOU. Uma coluna `arquivado` no comunicado o esconderia
    // de todo mundo porque UMA pessoa o arquivou.
    const doRemetente = await listarCaixaDeComunicados(prisma, PROTOCOLO, "SAIDA");
    expect(doRemetente).toHaveLength(1);
    expect(doRemetente[0]?.favorito).toBe(true);
  });

  it("t12: a leitura registra usuário, instante e ORIGEM — e a primeira é a que vale", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });

    const primeira = await marcarLeitura(prisma, {
      comunicadoId: r.comunicadoId, origem: "SISTEMA", criadoPor: JURIDICO,
    });
    expect(primeira.jaLida).toBe(false);

    // ⚠️ A SEGUNDA ABERTURA NÃO GRAVA. Um registro por abertura afogaria o dado que o
    // catálogo pede — QUANDO aquela pessoa tomou ciência — num histórico de ruído.
    const segunda = await marcarLeitura(prisma, {
      comunicadoId: r.comunicadoId, origem: "APLICATIVO", criadoPor: JURIDICO,
    });
    expect(segunda.jaLida).toBe(true);
    expect(segunda.movimentoId).toBe(primeira.movimentoId);

    const leituras = await leiturasDoComunicado(prisma, r.comunicadoId, PROTOCOLO);
    expect(leituras).toHaveLength(1);
    expect(leituras?.[0]?.usuario).toBe(JURIDICO);
    expect(leituras?.[0]?.origem).toBe("SISTEMA");
    expect(leituras?.[0]?.setor).toBe("JUR — Procuradoria");
    expect(leituras?.[0]?.em).toBeInstanceOf(Date);

    // ⚠️ QUEM NÃO PARTICIPA NÃO PERGUNTA. Um relatório de leitura aberto a qualquer
    // usuário do ente diria quem está trabalhando em quê.
    expect(await leiturasDoComunicado(prisma, r.comunicadoId, GABINETE)).toBeNull();
  });

  it("t13: quem não participa não encaminha, não etiqueta e não marca leitura", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });

    const foraDaConversa = /não participa do comunicado MEMO 1\/2026/;
    await expect(
      marcarLeitura(prisma, { comunicadoId: r.comunicadoId, criadoPor: GABINETE })
    ).rejects.toThrow(foraDaConversa);
    await expect(
      etiquetarComunicado(prisma, {
        comunicadoId: r.comunicadoId, tag: "urgente", criadoPor: GABINETE,
      })
    ).rejects.toThrow(foraDaConversa);
    await expect(
      encaminharComunicado(prisma, {
        comunicadoId: r.comunicadoId, setorDestinoId: "c-s1", criadoPor: GABINETE,
      })
    ).rejects.toThrow(foraDaConversa);
  });

  it("t14: a tag é visível a todos os envolvidos", async () => {
    const r = await rascunharComunicado(prisma, { ...RASCUNHO, tipoId: memorando });
    await enviarComunicado(prisma, {
      comunicadoId: r.comunicadoId, destinatarios: [{ setorId: "c-s2" }],
      criadoPor: PROTOCOLO,
    });
    await etiquetarComunicado(prisma, {
      comunicadoId: r.comunicadoId, tag: "prazo curto", criadoPor: JURIDICO,
    });

    const doRemetente = await listarCaixaDeComunicados(prisma, PROTOCOLO, "SAIDA");
    expect(doRemetente[0]?.tags).toEqual(["prazo curto"]);
  });
});
