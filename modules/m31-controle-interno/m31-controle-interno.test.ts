import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { estadoDaAuditoria, type TipoMovimentoDaAuditoria } from "./dominio.js";
import {
  abrirAuditoria,
  apreciarProvidencia,
  emitirRelatorioCircunstanciado,
  encerrarAuditoria,
  registrarIrregularidade,
  registrarProvidencia,
  responderItemDoChecklist,
} from "./servico.js";

/**
 * M31 — CONTROLE INTERNO (CF art. 74). REGIME: **SUPERFÍCIE**, e a declaração é explícita.
 *
 * ⚠️ ELE NÃO MOVE O RAZÃO — não há lançamento, saldo nem período contábil a respeitar, e por
 * isso não há amarração contábil a provar. O que estes testes cobram é o que este módulo
 * promete: caso de uso, autorização no servidor, e que nada do juízo registrado se apague.
 *
 * Sem tripwire mutado e sem caracterização prévia — é o regime de superfície, e rebaixá-lo
 * seria a decisão que o checkpoint tem de mostrar. Aqui ele é o regime CERTO: não há
 * comportamento contábil anterior a caracterizar.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const AUDITOR = "controle.interno@cg.pb.gov.br";
const AUDITADO = "obras@cg.pb.gov.br";
const OUTRO_AUDITOR = "contabilidade@cg.pb.gov.br";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Secretaria de Obras" } });
}

async function auditoriaDeTeste(comItens = true): Promise<string> {
  const { auditoriaId } = await abrirAuditoria(prisma, {
    identificador: "AI-2026-001",
    objeto: "Execução dos contratos de pavimentação do exercício de 2025",
    tipo: "PROGRAMADA",
    orgaoId: "org-01",
    diaPeriodoInicio: "2025-01-01",
    diaPeriodoFim: "2025-12-31",
    responsavel: AUDITOR,
    diaAbertura: "2026-02-01",
    motivo: "Plano anual de auditoria interna, item 3.",
    itens: comItens
      ? [
          { pergunta: "As medições foram aprovadas antes da liquidação?", baseLegal: "Lei 14.133, art. 140" },
          { pergunta: "A ordem cronológica de pagamentos foi respeitada?", baseLegal: "Lei 14.133, art. 141" },
        ]
      : [],
    criadoPor: AUDITOR,
  });
  return auditoriaId;
}

async function itens(auditoriaId: string): Promise<readonly { readonly id: string; readonly ordem: number }[]> {
  return prisma.itemDeChecklist.findMany({
    where: { auditoriaId }, select: { id: true, ordem: true }, orderBy: { ordem: "asc" },
  });
}

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("M31 — a auditoria interna", () => {
  it("t1: abrir grava o MOVIMENTO de abertura na mesma transação — o estado é derivado", async () => {
    const auditoriaId = await auditoriaDeTeste();
    const movs = await prisma.movimentoDaAuditoria.findMany({
      where: { auditoriaId }, select: { tipo: true, dataMovimento: true, criadoEm: true },
    });
    expect(movs).toHaveLength(1);
    expect(
      estadoDaAuditoria(
        movs.map((m) => ({
          tipo: m.tipo as TipoMovimentoDaAuditoria,
          dataMovimento: m.dataMovimento,
          criadoEm: m.criadoEm,
        }))
      )
    ).toBe("ABERTA");
    // ⚠️ O PERÍODO AUDITADO É CIVIL: 31/12/2025 termina às 23:59:59 do ente.
    const a = await prisma.auditoriaInterna.findUniqueOrThrow({
      where: { id: auditoriaId }, select: { periodoFim: true },
    });
    expect(a.periodoFim.toISOString()).toBe("2026-01-01T02:59:59.999Z");
  });

  it("t2: a resposta é APPEND-ONLY — 'conforme' que vira 'não conforme' deixa as duas", async () => {
    const auditoriaId = await auditoriaDeTeste();
    const [i1] = await itens(auditoriaId);
    await responderItemDoChecklist(prisma, {
      itemId: i1!.id, resposta: "CONFORME", criadoPor: AUDITOR,
    });
    await responderItemDoChecklist(prisma, {
      itemId: i1!.id, resposta: "NAO_CONFORME",
      observacao: "Duas liquidações de 2025 foram feitas antes da aprovação da medição.",
      criadoPor: AUDITOR,
    });
    const respostas = await prisma.respostaDeChecklist.findMany({
      where: { itemId: i1!.id }, select: { resposta: true }, orderBy: { criadoEm: "asc" },
    });
    expect(respostas.map((r) => r.resposta)).toEqual(["CONFORME", "NAO_CONFORME"]);
  });

  it("t3: 'não conforme' SEM observação é recusado — sem dizer o que se viu, é acusação", async () => {
    const auditoriaId = await auditoriaDeTeste();
    const [i1] = await itens(auditoriaId);
    await expect(
      responderItemDoChecklist(prisma, {
        itemId: i1!.id, resposta: "NAO_CONFORME", criadoPor: AUDITOR,
      })
    ).rejects.toThrow(/SEM OBSERVAÇÃO[\s\S]*é acusação[\s\S]*Nada foi gravado/);
    expect(await prisma.respostaDeChecklist.count({ where: { itemId: i1!.id } })).toBe(0);
  });

  it("t3b: 'não aplicável' também exige observação — é o item pulado com aparência de examinado", async () => {
    const auditoriaId = await auditoriaDeTeste();
    const [i1] = await itens(auditoriaId);
    await expect(
      responderItemDoChecklist(prisma, {
        itemId: i1!.id, resposta: "NAO_APLICAVEL", criadoPor: AUDITOR,
      })
    ).rejects.toThrow(/SEM OBSERVAÇÃO/);
  });

  it("t4: ENCERRAR com item pendente é recusado — o relatório diria por OMISSÃO que está tudo certo", async () => {
    // ⚠️ N=2 NO CHECKLIST. Com um item só, "encerrar recusa se houver pendente" e "encerrar
    // recusa sempre" dão a mesma resposta — é com dois, um respondido e um não, que elas
    // divergem.
    const auditoriaId = await auditoriaDeTeste();
    const [i1] = await itens(auditoriaId);
    await responderItemDoChecklist(prisma, { itemId: i1!.id, resposta: "CONFORME", criadoPor: AUDITOR });

    await expect(
      encerrarAuditoria(prisma, {
        auditoriaId, diaEncerramento: "2026-06-30",
        motivo: "Encerramento do trabalho de campo.", criadoPor: AUDITOR,
      })
    ).rejects.toThrow(/SEM RESPOSTA: #2[\s\S]*POR OMISSÃO[\s\S]*Nada foi gravado/);
    expect(
      await prisma.movimentoDaAuditoria.count({ where: { auditoriaId, tipo: "ENCERRAMENTO" } })
    ).toBe(0);
  });

  it("t5: com o checklist inteiro respondido, encerra — e depois nada mais entra", async () => {
    const auditoriaId = await auditoriaDeTeste();
    for (const i of await itens(auditoriaId)) {
      await responderItemDoChecklist(prisma, { itemId: i.id, resposta: "CONFORME", criadoPor: AUDITOR });
    }
    await encerrarAuditoria(prisma, {
      auditoriaId, diaEncerramento: "2026-06-30",
      motivo: "Trabalho de campo concluído e relatório emitido.", criadoPor: AUDITOR,
    });

    await expect(
      registrarIrregularidade(prisma, {
        auditoriaId, descricao: "Achado tardio, depois do encerramento da auditoria.",
        gravidade: "FORMAL", providencia: "Corrigir o procedimento.",
        diaPrazo: "2026-08-30", criadoPor: AUDITOR,
      })
    ).rejects.toThrow(/está ENCERRADA[\s\S]*REABRA a auditoria[\s\S]*Nada foi gravado/);
  });

  it("t6: SEGREGAÇÃO — quem relata a providência NÃO a aprecia", async () => {
    const auditoriaId = await auditoriaDeTeste();
    const { irregularidadeId } = await registrarIrregularidade(prisma, {
      auditoriaId,
      descricao: "Liquidação de obra sem medição aprovada nos contratos CT-2025-004 e 007.",
      gravidade: "GRAVE",
      providencia: "Regularizar as medições e instaurar apuração de responsabilidade.",
      diaPrazo: "2026-04-30",
      criadoPor: AUDITOR,
    });
    const { providenciaId } = await registrarProvidencia(prisma, {
      irregularidadeId, relato: "Medições regularizadas e processo de apuração aberto.",
      diaProvidencia: "2026-04-20", criadoPor: AUDITADO,
    });

    await expect(
      apreciarProvidencia(prisma, { providenciaId, aceita: true, criadoPor: AUDITADO })
    ).rejects.toThrow(/SEGREGAÇÃO DE FUNÇÃO[\s\S]*própria irregularidade[\s\S]*Nada foi gravado/);

    const p = await prisma.providenciaDaIrregularidade.findUniqueOrThrow({
      where: { id: providenciaId }, select: { aceita: true },
    });
    expect(p.aceita).toBeNull();
  });

  it("t6b: RECUSAR sem motivo é recusado, e apreciar DUAS VEZES também", async () => {
    const auditoriaId = await auditoriaDeTeste();
    const { irregularidadeId } = await registrarIrregularidade(prisma, {
      auditoriaId, descricao: "Ordem cronológica de pagamentos não observada em três casos.",
      gravidade: "GRAVE", providencia: "Publicar a ordem cronológica mensal.",
      diaPrazo: "2026-04-30", criadoPor: AUDITOR,
    });
    const { providenciaId } = await registrarProvidencia(prisma, {
      irregularidadeId, relato: "Publicação feita no portal.",
      diaProvidencia: "2026-04-20", criadoPor: AUDITADO,
    });

    await expect(
      apreciarProvidencia(prisma, { providenciaId, aceita: false, criadoPor: OUTRO_AUDITOR })
    ).rejects.toThrow(/RECUSA SEM MOTIVO[\s\S]*prazo continua correndo[\s\S]*Nada foi gravado/);

    await apreciarProvidencia(prisma, {
      providenciaId, aceita: false,
      motivoDaRecusa: "A publicação cobre apenas dois dos três meses apontados.",
      criadoPor: OUTRO_AUDITOR,
    });
    await expect(
      apreciarProvidencia(prisma, { providenciaId, aceita: true, criadoPor: OUTRO_AUDITOR })
    ).rejects.toThrow(/JÁ FOI APRECIADA[\s\S]*Nada foi gravado/);
  });

  it("t7: o RELATÓRIO é versionado e tem hash do texto — e o curto é recusado", async () => {
    const auditoriaId = await auditoriaDeTeste();
    await expect(
      emitirRelatorioCircunstanciado(prisma, {
        auditoriaId, texto: "Tudo certo.", criadoPor: AUDITOR,
      })
    ).rejects.toThrow(/CIRCUNSTANCIADO COM 11 CARACTERES[\s\S]*Nada foi gravado/);

    const texto =
      "Relatório circunstanciado da auditoria AI-2026-001. Examinou-se a execução dos " +
      "contratos de pavimentação do exercício de 2025, com foco na aprovação das medições e " +
      "na ordem cronológica dos pagamentos. Achados e providências determinadas constam do " +
      "quadro anexo.";
    const primeira = await emitirRelatorioCircunstanciado(prisma, { auditoriaId, texto, criadoPor: AUDITOR });
    expect(primeira.versao).toBe(1);
    expect(primeira.hashConteudo).toMatch(/^[0-9a-f]{64}$/);

    // ⚠️ REFAZER É OUTRA VERSÃO, e a anterior FICA: é ela que o auditado recebeu.
    const segunda = await emitirRelatorioCircunstanciado(prisma, {
      auditoriaId, texto: `${texto} Retificação: o contrato CT-2025-007 foi excluído do escopo.`,
      criadoPor: AUDITOR,
    });
    expect(segunda.versao).toBe(2);
    expect(segunda.hashConteudo).not.toBe(primeira.hashConteudo);
    expect(await prisma.relatorioCircunstanciado.count({ where: { auditoriaId } })).toBe(2);
  });

  it("t8: AUTORIZAÇÃO NO SERVIDOR — sem a ação, abrir auditoria é NEGADO", async () => {
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO_RESPONDE",
        descricao: "Responde checklist e NÃO abre auditoria — a segregação exercitada.",
        criadoPor: "TESTE",
        permissoes: { create: [{ acao: "RESPONDER_CHECKLIST_DE_AUDITORIA", criadoPor: "TESTE" }] },
      },
      select: { id: true },
    });
    const usuario = await prisma.usuario.create({
      data: { identificador: "so.responde@cg.pb.gov.br", nome: "Só responde", criadoPor: "TESTE" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: "TESTE" },
    });

    await expect(
      abrirAuditoria(prisma, {
        identificador: "AI-2026-999",
        objeto: "Auditoria aberta por quem não pode abrir auditoria",
        tipo: "EXTRAORDINARIA", orgaoId: "org-01",
        diaPeriodoInicio: "2026-01-01", diaPeriodoFim: "2026-06-30",
        responsavel: "so.responde@cg.pb.gov.br", diaAbertura: "2026-07-01",
        motivo: "Tentativa sem permissão.", criadoPor: "so.responde@cg.pb.gov.br",
      })
    ).rejects.toThrow(/ACESSO NEGADO/);
    expect(await prisma.auditoriaInterna.count({ where: { identificador: "AI-2026-999" } })).toBe(0);
  });

  it("t9: o item do checklist SEM base legal é recusado no Zod", async () => {
    await expect(
      abrirAuditoria(prisma, {
        identificador: "AI-2026-002", objeto: "Auditoria com roteiro sem fundamento",
        tipo: "PROGRAMADA", orgaoId: "org-01",
        diaPeriodoInicio: "2026-01-01", diaPeriodoFim: "2026-06-30",
        responsavel: AUDITOR, diaAbertura: "2026-07-01",
        motivo: "Plano anual, item 4.",
        itens: [{ pergunta: "Está tudo certo?", baseLegal: "" }],
        criadoPor: AUDITOR,
      })
    ).rejects.toThrow();
  });
});
