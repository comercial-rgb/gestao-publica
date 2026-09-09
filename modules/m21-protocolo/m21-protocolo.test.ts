import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { situacaoDoProcesso } from "./dominio.js";
import {
  abrirProcesso,
  apensarProcesso,
  arquivarProcesso,
  atenderReadequacao,
  complementarProcesso,
  desapensarProcesso,
  encerrarProcesso,
  reabrirProcesso,
  receberProcesso,
  responderParecer,
  solicitarParecer,
  solicitarReadequacao,
  tornarMovimentoSemEfeito,
  tramitar,
} from "./servico.js";

/**
 * M21 — O PROCESSO DIGITAL, contra banco de verdade.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 * Os testes do lote que recaem sobre o protocolo: numeração que reinicia por exercício
 * sem colidir (8), duas aberturas concorrentes que NÃO recebem o mesmo número (9),
 * tramitação recusada no SERVIDOR a quem não é do setor (2), bloqueio por taxa em
 * aberto verificado no caso de uso (6), e apensamento com efeito real sobre a
 * movimentação (7).
 *
 * ⚠️ E UMA ARMADILHA DA PRÓPRIA FIXTURE, DITA EM VOZ ALTA: `semearUsuariosDeTeste` dá
 * ADMIN — permissão GLOBAL — a TODAS as identidades das fixtures. Como quem tem
 * permissão global é gestor (e gestor enxerga todos os setores), um teste de LOTAÇÃO
 * escrito com esses usuários passaria sem testar nada. Por isso o t10 cria o SEU
 * usuário, com perfil escopado numa unidade gestora.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const PROTOCOLO = "protocolo@cg.pb.gov.br";
const JURIDICO = "juridico@cg.pb.gov.br";

let assuntoId = "";
let assuntoComTaxa = "";
let assuntoSigiloso = "";
let assuntoAnonimo = "";
let assuntoComTermo = "";
let requerenteId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.orgao.create({ data: { id: "p-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "p-uo", codigo: "01001", descricao: "Administração", orgaoId: "p-org" },
  });
  await prisma.exercicio.create({ data: { id: "p-ex-2026", ano: 2026, criadoPor: "SEED" } });
  await prisma.exercicio.create({ data: { id: "p-ex-2027", ano: 2027, criadoPor: "SEED" } });

  await prisma.setor.createMany({
    data: [
      { id: "s1", codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "p-uo", criadoPor: "SEED" },
      { id: "s2", codigo: "JUR", nome: "Procuradoria", unidadeOrcId: "p-uo", criadoPor: "SEED" },
      { id: "s3", codigo: "GAB", nome: "Gabinete", unidadeOrcId: "p-uo", criadoPor: "SEED" },
      { id: "s4", codigo: "EXT", nome: "Setor extinto", unidadeOrcId: "p-uo", ativo: false, criadoPor: "SEED" },
    ],
  });

  // As identidades das fixtures (ADMIN/global) recebem lotação de qualquer forma: a
  // lotação é o caminho normal, e o gestor é a exceção.
  await prisma.usuarioDoSetor.createMany({
    data: [
      { usuarioIdent: PROTOCOLO, setorId: "s1", criadoPor: "SEED" },
      { usuarioIdent: PROTOCOLO, setorId: "s3", criadoPor: "SEED" },
      { usuarioIdent: JURIDICO, setorId: "s2", criadoPor: "SEED" },
    ],
  });

  const comum = { criadoPor: "SEED" };
  const a = await prisma.assunto.create({
    data: {
      ...comum,
      codigo: "REQ",
      nome: "Requerimento geral",
      roteiro: {
        create: [
          { ordem: 1, setorId: "s1", prazoDias: 3, descricao: "Triagem", criadoPor: "SEED" },
          { ordem: 2, setorId: "s2", prazoDias: 10, descricao: "Análise jurídica", criadoPor: "SEED" },
        ],
      },
    },
    select: { id: true },
  });
  assuntoId = a.id;

  assuntoComTaxa = (
    await prisma.assunto.create({
      data: { ...comum, codigo: "TAXA", nome: "Alvará", bloqueiaTramiteComTaxaAberta: true },
      select: { id: true },
    })
  ).id;
  assuntoSigiloso = (
    await prisma.assunto.create({
      data: { ...comum, codigo: "SIG", nome: "Denúncia", sigiloPadrao: true },
      select: { id: true },
    })
  ).id;
  assuntoAnonimo = (
    await prisma.assunto.create({
      data: { ...comum, codigo: "ANON", nome: "Manifestação", permiteAnonimo: true },
      select: { id: true },
    })
  ).id;
  assuntoComTermo = (
    await prisma.assunto.create({
      data: { ...comum, codigo: "TERMO", nome: "Adesão", termoDeAceite: "Declaro que li." },
      select: { id: true },
    })
  ).id;

  const pessoa = await prisma.pessoa.create({
    data: {
      documento: "11144477735",
      tipo: "FISICA",
      criadoPor: "SEED",
      versoes: { create: { nome: "Maria Requerente", ativa: true, criadoPor: "SEED" } },
    },
    select: { id: true },
  });
  requerenteId = pessoa.id;
}

const ABERTURA = {
  exercicio: 2026,
  finalidade: "ATENDIMENTO_AO_PUBLICO" as const,
  textoAbertura: "Solicito a análise do pedido anexo.",
  setorAberturaId: "s1",
  criadoPor: PROTOCOLO,
};

beforeEach(semear);

describe("M21 — abertura e numeração", () => {
  it("t1: abre, numera 1/2026 e COPIA o roteiro do assunto para o processo", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });

    expect(p.numero).toBe(1);
    expect(p.ano).toBe(2026);
    expect(p.codigoVerificador).toHaveLength(10);

    // ⚠️ A CÓPIA É O PONTO. Sem ela, reconfigurar o prazo da etapa 2 hoje deixaria
    // atrasado, com efeito retroativo, um processo que estava em dia ontem.
    const etapas = await prisma.etapaDoProcesso.findMany({
      where: { processoId: p.processoId },
      orderBy: { ordem: "asc" },
      select: { ordem: true, setorId: true, prazoDias: true },
    });
    expect(etapas).toEqual([
      { ordem: 1, setorId: "s1", prazoDias: 3 },
      { ordem: 2, setorId: "s2", prazoDias: 10 },
    ]);

    await prisma.etapaDoRoteiro.updateMany({ where: { assuntoId }, data: { prazoDias: 99 } });
    const depois = await prisma.etapaDoProcesso.findFirst({
      where: { processoId: p.processoId, ordem: 1 },
      select: { prazoDias: true },
    });
    expect(depois?.prazoDias).toBe(3);
  });

  it("t2: a numeração REINICIA no exercício seguinte, sem colidir com o anterior", async () => {
    const a = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const b = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const c = await abrirProcesso(prisma, {
      ...ABERTURA, exercicio: 2027, assuntoId, requerenteId,
    });

    expect([a.numero, b.numero]).toEqual([1, 2]);
    expect(c.numero).toBe(1);
    expect(c.ano).toBe(2027);
    // Dois processos "1", e eles são documentos diferentes e legítimos.
    expect(a.processoId).not.toBe(c.processoId);
  });

  it("t3: duas aberturas CONCORRENTES não recebem o mesmo número", async () => {
    // ⚠️ SEM O TRINCO AS DUAS LEEM `MAX(numero)` NO MESMO ESTADO. Sob READ COMMITTED
    // cada transação enxerga o banco como estava quando ELA começou; as duas calculam
    // "próximo = 1" e a segunda morre na unicidade — o usuário veria um erro de banco
    // depois de preencher o formulário inteiro, em vez de receber o número 2.
    const [x, y] = await Promise.all([
      abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId }),
      abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId }),
    ]);
    expect(new Set([x.numero, y.numero]).size).toBe(2);
    expect([x.numero, y.numero].sort()).toEqual([1, 2]);
  });

  it("t4: sigilo do assunto é PISO — desmarcar na abertura não rebaixa", async () => {
    const p = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId: assuntoSigiloso, requerenteId, sigiloso: false,
    });
    const salvo = await prisma.processo.findUniqueOrThrow({
      where: { id: p.processoId },
      select: { sigiloso: true },
    });
    expect(salvo.sigiloso).toBe(true);
  });

  it("t5: anônimo só onde o assunto permite — e nunca com requerente junto", async () => {
    await expect(
      abrirProcesso(prisma, { ...ABERTURA, assuntoId, contatoAnonimo: "(83) 99999-0000" })
    ).rejects.toThrow(/NÃO aceita requerente anônimo/);

    const ok = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId: assuntoAnonimo, contatoAnonimo: "(83) 99999-0000",
    });
    expect(ok.numero).toBe(1);

    await expect(
      abrirProcesso(prisma, {
        ...ABERTURA, assuntoId: assuntoAnonimo, requerenteId, contatoAnonimo: "(83) 99999-0000",
      })
    ).rejects.toThrow(/nunca os dois, nunca nenhum/);
  });

  it("t6: termo de aceite exigido pelo assunto é cobrado no SERVIDOR", async () => {
    await expect(
      abrirProcesso(prisma, { ...ABERTURA, assuntoId: assuntoComTermo, requerenteId })
    ).rejects.toThrow(/ACEITE DO TERMO/);

    const ok = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId: assuntoComTermo, requerenteId, aceitouTermo: true,
    });
    expect(ok.numero).toBe(1);
  });

  it("t7: setor desativado não abre nem recebe processo", async () => {
    await expect(
      abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId, setorAberturaId: "s4" })
    ).rejects.toThrow(/DESATIVADO/);
  });
});

describe("M21 — a cadeia completa", () => {
  it("t8: abertura → trâmite → recebimento → parecer → readequação → encerramento → arquivamento → reabertura", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const id = p.processoId;

    const situacao = async (): Promise<string> => {
      const movs = await prisma.movimentoDoProcesso.findMany({
        where: { processoId: id },
        select: {
          id: true, tipo: true, setorOrigemId: true, setorDestinoId: true,
          respondeAId: true, tornaSemEfeitoId: true, criadoEm: true,
        },
      });
      return situacaoDoProcesso(movs);
    };

    expect(await situacao()).toBe("ABERTO");

    await tramitar(prisma, {
      processoId: id, setorDestinoId: "s2", texto: "Ao jurídico para análise.",
      criadoPor: PROTOCOLO,
    });
    expect(await situacao()).toBe("EM_TRAMITE");

    await receberProcesso(prisma, { processoId: id, criadoPor: JURIDICO });
    expect(await situacao()).toBe("EM_ANALISE");

    const pedido = await solicitarParecer(prisma, {
      processoId: id, setorDestinoId: "s3", texto: "Solicito manifestação do gabinete.",
      criadoPor: JURIDICO,
    });
    expect(await situacao()).toBe("AGUARDANDO_PARECER");

    await responderParecer(prisma, {
      processoId: id, solicitacaoId: pedido.movimentoId,
      texto: "Manifestação favorável ao pedido.", criadoPor: PROTOCOLO,
    });
    expect(await situacao()).toBe("EM_ANALISE");

    const read = await solicitarReadequacao(prisma, {
      processoId: id, texto: "Falta o comprovante de residência.", criadoPor: JURIDICO,
    });
    expect(await situacao()).toBe("AGUARDANDO_READEQUACAO");

    // ⚠️ O REQUERENTE ATENDE COM O CÓDIGO VERIFICADOR — ele não é usuário do sistema.
    await atenderReadequacao(prisma, {
      processoId: id, solicitacaoId: read.movimentoId, texto: "Comprovante anexado.",
      codigoVerificador: p.codigoVerificador, criadoPor: "requerente-externo",
    });
    expect(await situacao()).toBe("EM_ANALISE");

    await encerrarProcesso(prisma, {
      processoId: id, texto: "Pedido deferido nos termos do parecer.", criadoPor: JURIDICO,
    });
    expect(await situacao()).toBe("ENCERRADO");

    await arquivarProcesso(prisma, { processoId: id, texto: "Arquive-se.", criadoPor: JURIDICO });
    expect(await situacao()).toBe("ARQUIVADO");

    await reabrirProcesso(prisma, {
      processoId: id, texto: "Reaberto por decisão superior.", criadoPor: JURIDICO,
    });
    expect(await situacao()).toBe("EM_ANALISE");
  });

  it("t9: processo arquivado não aceita trâmite — e a mensagem ensina a reabrir", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    await encerrarProcesso(prisma, { processoId: p.processoId, texto: "Encerrado.", criadoPor: PROTOCOLO });
    await arquivarProcesso(prisma, { processoId: p.processoId, texto: "Arquive-se.", criadoPor: PROTOCOLO });

    await expect(
      tramitar(prisma, {
        processoId: p.processoId, setorDestinoId: "s2", texto: "Tentativa.", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/ARQUIVADO e não aceita trâmite[\s\S]*REABRA/);
  });

  it("t10: arquivar exige ENCERRADO — encerrar e arquivar são decisões diferentes", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    await expect(
      arquivarProcesso(prisma, { processoId: p.processoId, texto: "Arquive-se.", criadoPor: PROTOCOLO })
    ).rejects.toThrow(/só se arquiva o que já foi ENCERRADO/);
  });

  it("t11: encerrar com parecer PENDENTE é recusado", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    await solicitarParecer(prisma, {
      processoId: p.processoId, setorDestinoId: "s2", texto: "Solicito manifestação.",
      criadoPor: PROTOCOLO,
    });
    await expect(
      encerrarProcesso(prisma, { processoId: p.processoId, texto: "Encerrado.", criadoPor: PROTOCOLO })
    ).rejects.toThrow(/deixaria a pendência sem resposta/);
  });

  it("t12: o trâmite NOTIFICA quem está lotado no destino — de verdade", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    await tramitar(prisma, {
      processoId: p.processoId, setorDestinoId: "s2", texto: "Ao jurídico.", criadoPor: PROTOCOLO,
    });

    const notificacoes = await prisma.notificacao.findMany({
      where: { evento: "TRAMITE_RECEBIDO" },
      select: { destinatario: true, canal: true, entregueEm: true, rota: true },
    });
    expect(notificacoes).toHaveLength(1);
    expect(notificacoes[0]?.destinatario).toBe(JURIDICO);
    expect(notificacoes[0]?.canal).toBe("SISTEMA");
    // O canal interno nasce entregue: a entrega É a gravação.
    expect(notificacoes[0]?.entregueEm).not.toBeNull();
    expect(notificacoes[0]?.rota).toBe(`/protocolo/processos/${p.processoId}`);
  });
});

describe("M21 — os bloqueios que o catálogo pede no CASO DE USO", () => {
  it("t13: taxa em aberto bloqueia a TRAMITAÇÃO — e quitá-la libera", async () => {
    const p = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId: assuntoComTaxa, requerenteId,
    });
    const taxa = await prisma.taxaDoProcesso.create({
      data: {
        processoId: p.processoId, descricao: "Taxa de expediente", valor: "45.00",
        vencimento: new Date("2026-04-01T00:00:00Z"), criadoPor: "SEED",
      },
      select: { id: true },
    });

    await expect(
      tramitar(prisma, {
        processoId: p.processoId, setorDestinoId: "s2", texto: "Ao jurídico.", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/TAXA EM ABERTO/);

    await prisma.movimentoDaTaxa.create({
      data: { taxaId: taxa.id, tipo: "PAGAMENTO", criadoPor: "SEED" },
    });

    const ok = await tramitar(prisma, {
      processoId: p.processoId, setorDestinoId: "s2", texto: "Ao jurídico.", criadoPor: PROTOCOLO,
    });
    expect(ok.alvos).toBe(1);
  });

  it("t14: quem não está lotado no setor NÃO tramita — mesmo tendo a permissão da UG", async () => {
    // ⚠️ ESTE USUÁRIO É CRIADO AQUI, COM PERFIL ESCOPADO NA UG. As identidades das
    // fixtures têm ADMIN GLOBAL, e permissão global é gestor — um teste de lotação
    // escrito com elas passaria sem testar coisa alguma.
    const perfil = await prisma.perfil.create({
      data: {
        nome: "PROTOCOLO_UO",
        descricao: "Só o protocolo, e só nesta unidade gestora.",
        criadoPor: "SEED",
        permissoes: {
          create: [
            { acao: "ABRIR_PROCESSO", unidadeOrcId: "p-uo", criadoPor: "SEED" },
            { acao: "TRAMITAR_PROCESSO", unidadeOrcId: "p-uo", criadoPor: "SEED" },
          ],
        },
      },
      select: { id: true },
    });
    const intruso = await prisma.usuario.create({
      data: { identificador: "estranho@cg.pb.gov.br", nome: "Estranho", criadoPor: "SEED" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: intruso.id, perfilId: perfil.id, criadoPor: "SEED" },
    });

    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });

    // Ele TEM a ação e TEM a unidade gestora certa — e mesmo assim não despacha um
    // documento que não está na mesa dele.
    await expect(
      tramitar(prisma, {
        processoId: p.processoId, setorDestinoId: "s2", texto: "Ao jurídico.",
        criadoPor: "estranho@cg.pb.gov.br",
      })
    ).rejects.toThrow(/LOTAÇÃO: "estranho@cg.pb.gov.br" não está lotado no setor PROT/);

    // E com a lotação, passa. É a prova de que o que barrou foi a lotação, e não a UG.
    await prisma.usuarioDoSetor.create({
      data: { usuarioIdent: "estranho@cg.pb.gov.br", setorId: "s1", criadoPor: "SEED" },
    });
    const ok = await tramitar(prisma, {
      processoId: p.processoId, setorDestinoId: "s2", texto: "Ao jurídico.",
      criadoPor: "estranho@cg.pb.gov.br",
    });
    expect(ok.alvos).toBe(1);
  });

  it("t15: tornar sem efeito — só o ÚLTIMO, só trâmite/complemento, e o histórico FICA", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const c = await complementarProcesso(prisma, {
      processoId: p.processoId, texto: "Complemento indevido.", criadoPor: PROTOCOLO,
    });
    const t = await tramitar(prisma, {
      processoId: p.processoId, setorDestinoId: "s2", texto: "Trâmite errado.", criadoPor: PROTOCOLO,
    });

    // O complemento não é mais o último.
    await expect(
      tornarMovimentoSemEfeito(prisma, {
        processoId: p.processoId, movimentoId: c.movimentoId,
        motivo: "Lançado por engano.", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/Só o ÚLTIMO movimento/);

    await tornarMovimentoSemEfeito(prisma, {
      processoId: p.processoId, movimentoId: t.movimentoId,
      motivo: "Setor de destino errado.", criadoPor: PROTOCOLO,
    });

    // ⚠️ O HISTÓRICO CONTINUA COM OS TRÊS MOVIMENTOS: complemento, trâmite e a anulação.
    // Um DELETE apagaria o trâmite E a prova de que alguém o desfez — e a segunda é o
    // que uma auditoria procura.
    const movs = await prisma.movimentoDoProcesso.findMany({
      where: { processoId: p.processoId },
      select: {
        id: true, tipo: true, setorOrigemId: true, setorDestinoId: true,
        respondeAId: true, tornaSemEfeitoId: true, criadoEm: true,
      },
      orderBy: { criadoEm: "asc" },
    });
    expect(movs.map((m) => m.tipo)).toEqual(["COMPLEMENTO", "TRAMITE", "TORNADO_SEM_EFEITO"]);
    // E o processo voltou ao setor de origem.
    expect(situacaoDoProcesso(movs)).toBe("EM_ANALISE");
  });
});

describe("M21 — apensamento com efeito real", () => {
  it("t16: o apenso SEGUE o principal; tramitá-lo sozinho é recusado; desapensar restabelece", async () => {
    const principal = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const apenso = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });

    await apensarProcesso(prisma, {
      processoPrincipalId: principal.processoId,
      processoApensoId: apenso.processoId,
      motivo: "Mesma matéria, mesmo requerente.",
      criadoPor: PROTOCOLO,
    });

    // ⚠️ MOVIMENTAR O APENSO POR FORA É RECUSADO — aceitar em silêncio dessincronizaria
    // o par, e o catálogo pede que "ambos sigam as mesmas movimentações".
    await expect(
      tramitar(prisma, {
        processoId: apenso.processoId, setorDestinoId: "s2", texto: "Por fora.", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/está APENSADO ao/);

    const t = await tramitar(prisma, {
      processoId: principal.processoId, setorDestinoId: "s2", texto: "Ao jurídico.",
      criadoPor: PROTOCOLO,
    });
    expect(t.alvos).toBe(2);

    const noApenso = await prisma.movimentoDoProcesso.findMany({
      where: { processoId: apenso.processoId },
      select: { tipo: true, setorDestinoId: true },
    });
    expect(noApenso).toEqual([{ tipo: "TRAMITE", setorDestinoId: "s2" }]);

    await desapensarProcesso(prisma, {
      processoPrincipalId: principal.processoId,
      processoApensoId: apenso.processoId,
      motivo: "Matérias se revelaram distintas.",
      criadoPor: PROTOCOLO,
    });

    // Independente de novo: um trâmite do principal já não alcança o apenso.
    const t2 = await tramitar(prisma, {
      processoId: principal.processoId, setorDestinoId: "s3", texto: "Ao gabinete.",
      criadoPor: PROTOCOLO,
    });
    expect(t2.alvos).toBe(1);
  });

  it("t17: cadeia de apensamento é recusada — o elo que falha some sem ninguém ver", async () => {
    const a = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const b = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const c = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });

    await apensarProcesso(prisma, {
      processoPrincipalId: a.processoId, processoApensoId: b.processoId,
      motivo: "Mesma matéria do pedido.", criadoPor: PROTOCOLO,
    });

    // b já é apenso: não pode receber apensos.
    await expect(
      apensarProcesso(prisma, {
        processoPrincipalId: b.processoId, processoApensoId: c.processoId,
        motivo: "Mesma matéria do pedido.", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/é ele mesmo um apenso/);

    // e c não pode ser apensado a b por já... (o inverso: b apenso de outro)
    await expect(
      apensarProcesso(prisma, {
        processoPrincipalId: a.processoId, processoApensoId: b.processoId,
        motivo: "Repetindo o apensamento.", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/já está apensado a outro/);
  });
});
