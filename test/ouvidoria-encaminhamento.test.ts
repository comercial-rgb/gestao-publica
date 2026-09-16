import "dotenv/config";
import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { podeVerProcesso } from "../modules/m21-protocolo/consultas.js";
import { setorAtual, situacaoDoProcesso } from "../modules/m21-protocolo/dominio.js";
import { podeAgirNoSetor } from "../modules/m21-protocolo/escopo-do-protocolo.js";
import {
  acompanharManifestacao,
  cadastrarServicoDaCarta,
  cadastrarVersaoDoServico,
  publicarVersaoDoServico,
  receberProcesso,
  registrarManifestacaoAnonima,
  responderManifestacao,
  tramitar,
  triarManifestacao,
} from "../modules/m21-protocolo/servico.js";

/**
 * ═══ O ENCAMINHAMENTO DA MANIFESTAÇÃO ENTRE SETORES (V9 N3) ═══
 *
 * A ouvidoria recebe a manifestação, tria, e **a maioria dos casos não é dela**: é da saúde, da
 * obra, da fiscalização. Sem encaminhar, a ouvidoria vira uma caixa de entrada que só acumula —
 * e foi por isso que `encaminhamento de ouvidoria` estava na lista de pendências desde o V7.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ═══
 *
 * **Uma fila paralela.** A tentação era uma tabela própria da ouvidoria, com setor, prazo e
 * responsável. Ela perderia de graça o número de protocolo, os anexos, o apensamento, a contagem
 * de prazo pela etapa, o histórico, a notificação e o recebimento — tudo que `tramitar` já faz.
 * O teste E1 afirma que o encaminhamento É o movimento canônico, e que o protocolo não muda.
 *
 * **Sigilo vazando pelo caminho.** Encaminhar não pode abrir a manifestação sigilosa para quem
 * não está no caminho dela. E2 confere o alcance nas DUAS direções: o destino passa a alcançar, o
 * terceiro setor continua fora.
 *
 * **Recebimento pelo remetente.** Quem enviou dar por recebido é declarar entregue o que ninguém
 * abriu — e o prazo passa a correr contra quem não sabe que tem o caso. E3.
 *
 * **O anônimo perdendo o caso de vista.** O segredo é a única identidade que ele tem; se o
 * encaminhamento o invalidasse, a manifestação viraria um buraco. E4 — que também confere que o
 * motivo do encaminhamento, que é interno, NÃO vai para o acompanhamento público.
 *
 * FIXTURE N=2 nos setores de destino: com um só, "o terceiro setor não alcança" não teria terceiro.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "protocolo@cg.pb.gov.br";
const OUVIDOR = "ouvidor@cg.pb.gov.br";
const SAUDE = "servidor.saude@cg.pb.gov.br";
const OBRAS = "servidor.obras@cg.pb.gov.br";
/**
 * ⚠️ O PERFIL MAIS PERIGOSO DA FIXTURE, e ele existe por causa de uma mutação que passou.
 *
 * Este tem as ações NO ENTE INTEIRO (`unidadeOrcId: null`) e **não está lotado em setor nenhum**.
 * É o gestor que "vê tudo" — e é exatamente contra ele que o sigilo da manifestação precisa valer:
 * `podeAgirNoSetor` aceita a ação no ente **quando o processo não é sigiloso**, e recusa quando é.
 *
 * Medido em 16/09/2026: sem esta conta, apagar `if (sigiloso) return false;` de
 * `podeAgirNoSetor` deixava a suíte VERDE — porque as outras contas têm ação por unidade, e para
 * elas aquela linha nunca era alcançada. A mutação não era acusada, e a guarda não guardava nada.
 */
const GESTOR_NO_ENTE = "gestor.ente@cg.pb.gov.br";
const ANO = Number(diaCivil(new Date()).slice(0, 4));
const MOTIVO = "Denúncia sobre fila na unidade básica: compete à Secretaria de Saúde apurar e responder.";
const ANOTACAO = "Triagem interna: procede, encaminhar à saúde.";

const quota = (s: string): string => createHash("sha256").update(`teste-enc:${s}`).digest("hex");
let ids: Record<string, string> = {};

async function conta(identificador: string, acoes: readonly { acao: string; unidadeOrcId?: string }[], setor?: string): Promise<void> {
  const p = await prisma.perfil.create({
    data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((a) => ({ acao: a.acao as never, unidadeOrcId: a.unidadeOrcId ?? null, criadoPor: "SEED" })) } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  ids[identificador] = u.id;
  if (setor !== undefined) await prisma.usuarioDoSetor.create({ data: { usuarioIdent: identificador, setorId: setor, criadoPor: "SEED" } });
}

const manifestar = (relato: string, chave = "origem-1") =>
  registrarManifestacaoAnonima(prisma, { slug: "ouvidoria", tipo: "DENUNCIA", respostas: { relato }, chaveDeQuota: quota(chave) });

async function daManifestacao(protocolo: string): Promise<{ readonly id: string; readonly processoId: string }> {
  return prisma.manifestacaoDeOuvidoria.findFirstOrThrow({
    where: { processo: { numero: Number(protocolo.split("/")[0]) } },
    select: { id: true, processoId: true },
  });
}

async function movimentos(processoId: string) {
  return prisma.movimentoDoProcesso.findMany({
    where: { processoId },
    orderBy: { criadoEm: "asc" },
    select: { id: true, tipo: true, setorOrigemId: true, setorDestinoId: true, usuarioDestino: true, texto: true, respondeAId: true, tornaSemEfeitoId: true, criadoEm: true },
  });
}

beforeEach(async () => {
  await limparBanco(prisma);
  ids = {};
  await prisma.orgao.create({ data: { id: "e-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "e-uo", codigo: "01001", descricao: "Administração", orgaoId: "e-org" } });
  await prisma.exercicio.create({ data: { id: "e-ex", ano: ANO, criadoPor: "SEED" } });
  await prisma.setor.createMany({
    data: [
      { id: "s-ouv", codigo: "OUV", nome: "Ouvidoria", unidadeOrcId: "e-uo", criadoPor: "SEED" },
      { id: "s-saude", codigo: "SAU", nome: "Secretaria de Saúde", unidadeOrcId: "e-uo", criadoPor: "SEED" },
      { id: "s-obras", codigo: "OBR", nome: "Secretaria de Obras", unidadeOrcId: "e-uo", criadoPor: "SEED" },
    ],
  });
  ids["assunto-ouv"] = (
    await prisma.assunto.create({
      data: {
        codigo: "OUV", nome: "Ouvidoria", permiteAnonimo: true, sigiloPadrao: true, criadoPor: "SEED",
        roteiro: { create: [{ ordem: 1, setorId: "s-ouv", prazoDias: 30, descricao: "Triagem da ouvidoria", criadoPor: "SEED" }] },
      },
      select: { id: true },
    })
  ).id;

  const NO_ENTE = { unidadeOrcId: "e-uo" };
  await conta(OUVIDOR, [{ acao: "CONSULTAR_PROTOCOLO", ...NO_ENTE }, { acao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA", ...NO_ENTE }, { acao: "TRAMITAR_PROCESSO", ...NO_ENTE }, { acao: "RECEBER_PROCESSO", ...NO_ENTE }], "s-ouv");
  await conta(SAUDE, [{ acao: "CONSULTAR_PROTOCOLO", ...NO_ENTE }, { acao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA", ...NO_ENTE }, { acao: "TRAMITAR_PROCESSO", ...NO_ENTE }, { acao: "RECEBER_PROCESSO", ...NO_ENTE }], "s-saude");
  await conta(OBRAS, [{ acao: "CONSULTAR_PROTOCOLO", ...NO_ENTE }, { acao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA", ...NO_ENTE }, { acao: "TRAMITAR_PROCESSO", ...NO_ENTE }, { acao: "RECEBER_PROCESSO", ...NO_ENTE }], "s-obras");
  // Sem `unidadeOrcId` e sem lotação: as ações valem no ente inteiro.
  await conta(GESTOR_NO_ENTE, [{ acao: "CONSULTAR_PROTOCOLO" }, { acao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA" }, { acao: "TRAMITAR_PROCESSO" }, { acao: "RECEBER_PROCESSO" }]);

  const { servicoId } = await cadastrarServicoDaCarta(prisma, { slug: "ouvidoria", titulo: "Ouvidoria", categoria: "Atendimento", publico: "CIDADAO", tipo: "MANIFESTACAO_ANONIMA", assuntoId: ids["assunto-ouv"] ?? "", criadoPor: ADMIN });
  const { versaoId } = await cadastrarVersaoDoServico(prisma, {
    servicoId, descricao: "Registre reclamação, denúncia, sugestão ou elogio.", requisitos: "Nenhum.", documentos: [], canais: "Internet.",
    exigeAutenticacao: false, setorDeEntradaId: "s-ouv", campos: [{ nome: "relato", rotulo: "Relato", tipo: "textoLongo", obrigatorio: true }], criadoPor: ADMIN,
  });
  await publicarVersaoDoServico(prisma, { versaoId, criadoPor: ADMIN });
}, 120_000);

describe("encaminhar a manifestação a outro setor", () => {
  it("E1: o encaminhamento É o trâmite canônico — mesmo protocolo, movimento com origem, destino e motivo", async () => {
    const m = await manifestar("Fila de três horas na unidade básica do bairro.");
    const { id, processoId } = await daManifestacao(m.protocolo);
    await triarManifestacao(prisma, { manifestacaoId: id, tipoConfirmado: "DENUNCIA", anotacaoInterna: ANOTACAO, criadoPor: OUVIDOR });

    await tramitar(prisma, { processoId, setorDestinoId: "s-saude", texto: MOTIVO, criadoPor: OUVIDOR });

    const movs = await movimentos(processoId);
    const tramite = movs.find((x) => x.tipo === "TRAMITE");
    expect(
      tramite,
      "o encaminhamento não virou movimento do processo. Uma fila paralela perderia protocolo, " +
        "anexos, apensamento, prazo, histórico e recebimento — tudo que o trâmite já faz."
    ).toBeDefined();
    expect(tramite?.setorOrigemId).toBe("s-ouv");
    expect(tramite?.setorDestinoId).toBe("s-saude");
    expect(tramite?.texto, "o motivo do encaminhamento é o que o destino lê para saber o que se espera dele").toBe(MOTIVO);

    // ⚠️ O PROTOCOLO NÃO MUDA. Se mudasse, o manifestante anônimo perderia o caso — e o número
    // que ele anotou no papel deixaria de existir.
    const proc = await prisma.processo.findUniqueOrThrow({ where: { id: processoId }, select: { numero: true, exercicio: { select: { ano: true } } } });
    expect(`${proc.numero}/${proc.exercicio.ano}`).toBe(m.protocolo);

    expect(setorAtual("s-ouv", movs), "o setor atual não acompanhou o encaminhamento").toBe("s-saude");
    expect(situacaoDoProcesso(movs), "encaminhado e não recebido é EM_TRAMITE — não 'em análise'").toBe("EM_TRAMITE");
  });

  it("E2: o destino passa a alcançar a manifestação sigilosa; um terceiro setor NÃO", async () => {
    const m = await manifestar("Denúncia sobre a fila.");
    const { id, processoId } = await daManifestacao(m.protocolo);
    await triarManifestacao(prisma, { manifestacaoId: id, tipoConfirmado: "DENUNCIA", anotacaoInterna: ANOTACAO, criadoPor: OUVIDOR });

    const antes = await podeVerProcesso(prisma, processoId, SAUDE);
    expect(
      antes.pode,
      "a saúde já alcançava a manifestação sigilosa ANTES do encaminhamento — então o teste " +
        "seguinte não provaria que o encaminhamento é o que abre o acesso"
    ).toBe(false);

    await tramitar(prisma, { processoId, setorDestinoId: "s-saude", texto: MOTIVO, criadoPor: OUVIDOR });

    const depois = await podeVerProcesso(prisma, processoId, SAUDE);
    expect(depois.pode, `o setor de destino não alcançou o caso encaminhado a ele: ${depois.motivo ?? ""}`).toBe(true);

    // ⚠️ A METADE QUE IMPORTA MAIS. Obras tem EXATAMENTE as mesmas ações que a saúde, no mesmo
    // ente — o que as separa é só a lotação. Se o alcance viesse da ação, obras entraria junto.
    const gestor = await podeVerProcesso(prisma, processoId, GESTOR_NO_ENTE);
    expect(
      gestor.pode,
      "o gestor com consulta no ente inteiro leu a manifestação sigilosa. Consulta no ente não " +
        "abre manifestação de ouvidoria — é preciso participar dela"
    ).toBe(false);

    const terceiro = await podeVerProcesso(prisma, processoId, OBRAS);
    expect(
      terceiro.pode,
      "um setor que não está no caminho da manifestação alcançou o conteúdo sigiloso. As ações " +
        "de OBRAS e de SAÚDE são idênticas nesta fixture: o que deveria separá-las é a lotação"
    ).toBe(false);
  });

  it("E3: quem encaminhou NÃO recebe em nome do destino; quem está no destino recebe", async () => {
    const m = await manifestar("Denúncia sobre a fila.");
    const { processoId } = await daManifestacao(m.protocolo);
    await tramitar(prisma, { processoId, setorDestinoId: "s-saude", texto: MOTIVO, criadoPor: OUVIDOR });

    await expect(
      receberProcesso(prisma, { processoId, criadoPor: OUVIDOR }),
      "quem enviou deu por recebido o que ninguém abriu — e o prazo passaria a correr contra " +
        "quem nem sabe que tem o caso"
    ).rejects.toThrow();

    await receberProcesso(prisma, { processoId, criadoPor: SAUDE });
    const movs = await movimentos(processoId);
    expect(movs.some((x) => x.tipo === "RECEBIMENTO")).toBe(true);
    expect(situacaoDoProcesso(movs)).toBe("EM_ANALISE");

    // E o destino consegue TRABALHAR o caso: responder é ato de quem está no setor onde ele está.
    expect(await podeAgirNoSetor(prisma, SAUDE, setorAtual("s-ouv", movs), "TRIAR_MANIFESTACAO_DE_OUVIDORIA", true)).toBe(true);
    expect(
      await podeAgirNoSetor(prisma, OBRAS, setorAtual("s-ouv", movs), "TRIAR_MANIFESTACAO_DE_OUVIDORIA", true),
      "obras agiria num caso sigiloso que não está com ela"
    ).toBe(false);

    // ⚠️ E O GESTOR COM A AÇÃO NO ENTE INTEIRO, que é o caso perigoso. Ele NÃO está lotado em
    // lugar nenhum; num processo comum a ação no ente bastaria. Sigiloso, não basta — e é esta
    // asserção que acusa quem apagar a linha do sigilo.
    expect(
      await podeAgirNoSetor(prisma, GESTOR_NO_ENTE, setorAtual("s-ouv", movs), "TRIAR_MANIFESTACAO_DE_OUVIDORIA", true),
      "quem tem a ação no ente inteiro agiu numa manifestação SIGILOSA sem estar lotado no setor " +
        "dela. Ação no ente abre processo comum; sigiloso exige participar"
    ).toBe(false);
    // A mesma pessoa, no mesmo setor, num processo NÃO sigiloso: aí a ação no ente vale. Sem esta
    // metade, "sempre false" passaria no teste de cima.
    expect(await podeAgirNoSetor(prisma, GESTOR_NO_ENTE, setorAtual("s-ouv", movs), "TRIAR_MANIFESTACAO_DE_OUVIDORIA", false)).toBe(true);
  });

  it("E4: o anônimo continua acompanhando pelo MESMO segredo — e o motivo interno não vaza", async () => {
    const m = await manifestar("Denúncia sobre a fila.");
    const { id, processoId } = await daManifestacao(m.protocolo);
    await triarManifestacao(prisma, { manifestacaoId: id, tipoConfirmado: "DENUNCIA", anotacaoInterna: ANOTACAO, criadoPor: OUVIDOR });
    await tramitar(prisma, { processoId, setorDestinoId: "s-saude", texto: MOTIVO, criadoPor: OUVIDOR });
    await receberProcesso(prisma, { processoId, criadoPor: SAUDE });

    const acompanhamento = await acompanharManifestacao(prisma, m.protocolo, m.segredo);
    expect(acompanhamento, "o segredo deixou de abrir a manifestação depois do encaminhamento").not.toBeNull();

    const texto = JSON.stringify(acompanhamento);
    expect(texto.includes(ANOTACAO), "a anotação interna da triagem apareceu no acompanhamento público").toBe(false);
    expect(
      texto.includes(MOTIVO),
      "o motivo do encaminhamento apareceu para o manifestante. Ele é despacho INTERNO entre " +
        "setores — o que vai ao manifestante é a resposta, e só ela"
    ).toBe(false);

    // E a resposta, essa sim, chega.
    await responderManifestacao(prisma, { manifestacaoId: id, texto: "Apuramos e a escala foi reforçada.", conclusiva: true, criadoPor: SAUDE });
    const depois = await acompanharManifestacao(prisma, m.protocolo, m.segredo);
    expect(JSON.stringify(depois)).toContain("escala foi reforçada");
  });

  it("E5: o setor de destino é NOTIFICADO, e o destino nominal restringe a notificação", async () => {
    const m1 = await manifestar("Primeira denúncia.", "o-1");
    const p1 = await daManifestacao(m1.protocolo);
    await tramitar(prisma, { processoId: p1.processoId, setorDestinoId: "s-saude", texto: MOTIVO, criadoPor: OUVIDOR });
    const porSetor = await prisma.notificacao.findMany({ where: { evento: "TRAMITE_RECEBIDO" }, select: { destinatario: true } });
    expect(porSetor.map((x) => x.destinatario)).toEqual([SAUDE]);

    // ⚠️ N=2: uma segunda manifestação, agora com agente nomeado. Sem a segunda, "notificou o
    // setor" e "notificou a pessoa certa" seriam o mesmo caso — a saúde só tem um servidor aqui.
    await prisma.usuarioDoSetor.create({ data: { usuarioIdent: OBRAS, setorId: "s-saude", criadoPor: "SEED" } });
    const m2 = await manifestar("Segunda denúncia.", "o-2");
    const p2 = await daManifestacao(m2.protocolo);
    await tramitar(prisma, { processoId: p2.processoId, setorDestinoId: "s-saude", usuarioDestino: SAUDE, texto: MOTIVO, criadoPor: OUVIDOR });

    const doSegundo = await prisma.notificacao.findMany({ where: { evento: "TRAMITE_RECEBIDO", rota: `/protocolo/processos/${p2.processoId}` }, select: { destinatario: true } });
    expect(
      doSegundo.map((x) => x.destinatario),
      "com agente designado, a notificação foi para o setor inteiro. Nomear alguém existe " +
        "justamente para dirigir o caso a quem deve tratá-lo"
    ).toEqual([SAUDE]);
  });

  it("E6: encaminhar para o próprio setor é recusado, com motivo", async () => {
    const m = await manifestar("Denúncia sobre a fila.");
    const { processoId } = await daManifestacao(m.protocolo);
    await expect(
      tramitar(prisma, { processoId, setorDestinoId: "s-ouv", texto: MOTIVO, criadoPor: OUVIDOR }),
      "um trâmite que não move nada foi aceito — e o histórico ganharia uma linha que engana"
    ).rejects.toThrow(/já está neste setor/i);

    // ⚠️ ZERO, E NÃO UM. A manifestação anônima abre o processo SEM movimento de abertura — a
    // situação `ABERTO` é derivada da ausência de movimentos, não de um registro. Escrever `1`
    // aqui teria sido escrever o que eu esperava em vez do que o domínio faz.
    expect(await movimentos(processoId), "a recusa gravou movimento — 'nada foi gravado' não valeu").toHaveLength(0);
  });
});
