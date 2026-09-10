import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { abrirProcesso, encerrarProcesso, tramitar } from "../m21-protocolo/servico.js";
import {
  copiarModeloDeRelatorio,
  criarModeloDeRelatorio,
  distribuirModeloDeRelatorio,
  executarRelatorio,
  novaVersaoDoModelo,
  processarExecucoesPendentes,
  retirarModeloDeRelatorio,
} from "./servico.js";

/**
 * M26 — O DESIGNER, contra banco de verdade.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 * Os testes do lote: cópia de modelo não altera o original e modelo restrito não é
 * visível a terceiros (17); relatório em segundo plano notifica ao terminar e o
 * resultado corresponde aos filtros aplicados (18); campo calculado com expressão
 * maliciosa é rejeitado pela gramática, sem acesso ao banco (19).
 *
 * ⚠️ E O RELATÓRIO PROVADO AQUI É O QUE O PROMPT PEDE — "a relação de processos por
 * assunto e situação", gerada PELO DESIGNER. Não é um PDF fixo com cara de designer, e
 * não é uma emissão do M12 rotulada como se fosse.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const PROTOCOLO = "protocolo@cg.pb.gov.br";
const JURIDICO = "juridico@cg.pb.gov.br";
let assuntoId = "";
let assuntoObra = "";
let requerenteId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "r-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "r-uo1", codigo: "01001", descricao: "Administração", orgaoId: "r-org" },
      { id: "r-uo2", codigo: "01002", descricao: "Saúde", orgaoId: "r-org" },
    ],
  });
  await prisma.exercicio.create({ data: { id: "r-ex", ano: 2026, criadoPor: "SEED" } });
  await prisma.setor.createMany({
    data: [
      { id: "r-s1", codigo: "PROT", nome: "Protocolo", unidadeOrcId: "r-uo1", criadoPor: "SEED" },
      { id: "r-s2", codigo: "JUR", nome: "Procuradoria", unidadeOrcId: "r-uo1", criadoPor: "SEED" },
    ],
  });
  await prisma.usuarioDoSetor.createMany({
    data: [
      { usuarioIdent: PROTOCOLO, setorId: "r-s1", criadoPor: "SEED" },
      { usuarioIdent: PROTOCOLO, setorId: "r-s2", criadoPor: "SEED" },
      { usuarioIdent: JURIDICO, setorId: "r-s2", criadoPor: "SEED" },
    ],
  });
  assuntoId = (
    await prisma.assunto.create({
      data: { codigo: "REQ", nome: "Requerimento", criadoPor: "SEED" },
      select: { id: true },
    })
  ).id;
  assuntoObra = (
    await prisma.assunto.create({
      data: { codigo: "OBRA", nome: "Alvará de obra", criadoPor: "SEED" },
      select: { id: true },
    })
  ).id;
  requerenteId = (
    await prisma.pessoa.create({
      data: {
        documento: "11144477735", tipo: "FISICA", criadoPor: "SEED",
        versoes: { create: { nome: "Maria", ativa: true, criadoPor: "SEED" } },
      },
      select: { id: true },
    })
  ).id;
}

const ABERTURA = {
  exercicio: 2026,
  finalidade: "ATENDIMENTO_AO_PUBLICO" as const,
  textoAbertura: "Processo para o relatório do designer.",
  setorAberturaId: "r-s1",
  criadoPor: PROTOCOLO,
};

/** O modelo que o prompt do lote pede: processos por assunto e situação. */
const RELACAO_DE_PROCESSOS = {
  unidadeOrcId: "r-uo1",
  codigo: "processos_por_assunto",
  nome: "Relação de processos por assunto e situação",
  fonte: "PROCESSOS" as const,
  colunas: [
    { ordem: 1, rotulo: "Processo", expressao: 'numero & "/" & ano', tipo: "TEXTO" as const },
    { ordem: 2, rotulo: "Assunto", expressao: "assunto", tipo: "TEXTO" as const },
    { ordem: 3, rotulo: "Situação", expressao: "situacao", tipo: "TEXTO" as const },
    { ordem: 4, rotulo: "Movimentos", expressao: "movimentos", tipo: "NUMERO" as const },
    {
      ordem: 5,
      rotulo: "Atenção",
      // ⚠️ CAMPO CALCULADO DE VERDADE: uma condição sobre outra coluna, avaliada pela
      // gramática. É o que distingue um designer de uma lista de colunas fixas.
      expressao: 'SE(movimentos = 0, "Sem movimento", "Em andamento")',
      tipo: "TEXTO" as const,
    },
  ],
  criadoPor: PROTOCOLO,
};

beforeEach(semear);

describe("M26 — o modelo, a cópia e a visibilidade", () => {
  it("t1: a expressão é validada NA GRAVAÇÃO — campo inexistente não vira modelo", async () => {
    await expect(
      criarModeloDeRelatorio(prisma, {
        ...RELACAO_DE_PROCESSOS,
        codigo: "quebrado",
        colunas: [{ ordem: 1, rotulo: "Total", expressao: "total * 2", tipo: "NUMERO" }],
      })
    ).rejects.toThrow(/campo\(s\) inexistente\(s\) na fonte PROCESSOS: total/);

    // ⚠️ NADA FOI GRAVADO. Sem esta validação, `total` só estouraria na primeira
    // execução — possivelmente para outra pessoa, num modelo já distribuído.
    expect(await prisma.modeloDeRelatorio.count()).toBe(0);
  });

  it("t2: expressão MALICIOSA é rejeitada pela gramática, sem tocar no banco", async () => {
    const maliciosas = [
      "process.env.DATABASE_URL",
      'require("fs")',
      "assunto; DROP TABLE Processo",
      "(() => 1)()",
    ];
    for (const expressao of maliciosas) {
      await expect(
        criarModeloDeRelatorio(prisma, {
          ...RELACAO_DE_PROCESSOS,
          codigo: "malicioso",
          colunas: [{ ordem: 1, rotulo: "X", expressao, tipo: "TEXTO" }],
        })
      ).rejects.toThrow(/Coluna "X":/);
    }
    expect(await prisma.modeloDeRelatorio.count()).toBe(0);
  });

  it("t3: COPIAR não altera o original — e a cópia nasce restrita", async () => {
    const original = await criarModeloDeRelatorio(prisma, {
      ...RELACAO_DE_PROCESSOS, visibilidade: "PUBLICO",
    });

    const copia = await copiarModeloDeRelatorio(prisma, {
      modeloId: original.modeloId,
      novoCodigo: "processos_do_juridico",
      novoNome: "Processos do jurídico",
      criadoPor: JURIDICO,
    });

    const antes = await prisma.modeloDeRelatorio.findUniqueOrThrow({
      where: { id: original.modeloId },
      select: { nome: true, visibilidade: true, versao: true, colunas: { select: { id: true } } },
    });
    expect(antes.nome).toBe("Relação de processos por assunto e situação");
    expect(antes.visibilidade).toBe("PUBLICO");
    expect(antes.versao).toBe(1);
    expect(antes.colunas).toHaveLength(5);

    const nova = await prisma.modeloDeRelatorio.findUniqueOrThrow({
      where: { id: copia.modeloId },
      select: { nome: true, visibilidade: true, copiadoDeId: true, colunas: { select: { id: true } } },
    });
    expect(nova.nome).toBe("Processos do jurídico");
    // ⚠️ A CÓPIA NASCE `AUTOR`, mesmo copiando um público. Herdar a visibilidade
    // publicaria um rascunho que alguém acabou de derivar de um relatório oficial.
    expect(nova.visibilidade).toBe("AUTOR");
    expect(nova.copiadoDeId).toBe(original.modeloId);
    expect(nova.colunas).toHaveLength(5);
  });

  it("t4: modelo RESTRITO não é copiável nem executável por terceiro", async () => {
    const restrito = await criarModeloDeRelatorio(prisma, {
      ...RELACAO_DE_PROCESSOS, visibilidade: "AUTOR",
    });

    await expect(
      copiarModeloDeRelatorio(prisma, {
        modeloId: restrito.modeloId, novoCodigo: "roubado", novoNome: "Cópia",
        criadoPor: JURIDICO,
      })
    ).rejects.toThrow(/RESTRITO ao autor[\s\S]*expressões iriam junto/);

    await expect(
      executarRelatorio(prisma, {
        modeloId: restrito.modeloId, unidadeOrcId: "r-uo1", criadoPor: JURIDICO,
      })
    ).rejects.toThrow(/RESTRITO ao autor/);

    // E o autor executa normalmente.
    const meu = await executarRelatorio(prisma, {
      modeloId: restrito.modeloId, unidadeOrcId: "r-uo1", criadoPor: PROTOCOLO,
    });
    expect(meu.execucaoId).toBeTruthy();
  });

  it("t5: VERSÃO NOVA não reescreve a anterior — a execução antiga continua explicável", async () => {
    const v1 = await criarModeloDeRelatorio(prisma, RELACAO_DE_PROCESSOS);
    const v2 = await novaVersaoDoModelo(prisma, {
      modeloId: v1.modeloId,
      nome: "Relação de processos (revisada)",
      colunas: [{ ordem: 1, rotulo: "Processo", expressao: "numero", tipo: "NUMERO" }],
      criadoPor: PROTOCOLO,
    });

    expect(v2.versao).toBe(2);
    const antiga = await prisma.modeloDeRelatorio.findUniqueOrThrow({
      where: { id: v1.modeloId },
      select: { versao: true, nome: true, colunas: { select: { id: true } } },
    });
    expect(antiga.versao).toBe(1);
    expect(antiga.nome).toBe("Relação de processos por assunto e situação");
    expect(antiga.colunas).toHaveLength(5);
  });

  it("t6: DISTRIBUIR dá acesso a outra unidade — e sem isso a execução é recusada", async () => {
    const m = await criarModeloDeRelatorio(prisma, {
      ...RELACAO_DE_PROCESSOS, visibilidade: "PUBLICO",
    });

    await expect(
      executarRelatorio(prisma, {
        modeloId: m.modeloId, unidadeOrcId: "r-uo2", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/não pertence a esta unidade gestora nem lhe foi distribuído/);

    await distribuirModeloDeRelatorio(prisma, {
      modeloId: m.modeloId, unidadeOrcId: "r-uo2", criadoPor: PROTOCOLO,
    });

    const e = await executarRelatorio(prisma, {
      modeloId: m.modeloId, unidadeOrcId: "r-uo2", criadoPor: PROTOCOLO,
    });
    expect(e.execucaoId).toBeTruthy();
  });

  it("t7: modelo RETIRADO não produz relatório novo, e as execuções antigas ficam", async () => {
    const m = await criarModeloDeRelatorio(prisma, RELACAO_DE_PROCESSOS);
    const antes = await executarRelatorio(prisma, {
      modeloId: m.modeloId, unidadeOrcId: "r-uo1", criadoPor: PROTOCOLO,
    });

    await retirarModeloDeRelatorio(prisma, {
      modeloId: m.modeloId, motivo: "Substituído pelo painel de processos.",
      criadoPor: PROTOCOLO,
    });

    await expect(
      executarRelatorio(prisma, {
        modeloId: m.modeloId, unidadeOrcId: "r-uo1", criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/foi RETIRADO de vigência/);

    // A execução anterior continua lá — e ainda processável.
    await processarExecucoesPendentes(prisma);
    const r = await prisma.resultadoDaExecucao.findUnique({
      where: { execucaoId: antes.execucaoId },
      select: { linhas: true },
    });
    expect(r).not.toBeNull();
  });
});

describe("M26 — a execução em segundo plano", () => {
  it("t8: o relatório do PROMPT sai pelo designer, notifica ao terminar e confere com os filtros", async () => {
    const p1 = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const p2 = await abrirProcesso(prisma, { ...ABERTURA, assuntoId: assuntoObra, requerenteId });
    await tramitar(prisma, {
      processoId: p2.processoId, setorDestinoId: "r-s2", texto: "Ao jurídico.",
      criadoPor: PROTOCOLO,
    });
    await encerrarProcesso(prisma, {
      processoId: p1.processoId, texto: "Deferido nos termos do pedido.",
      criadoPor: PROTOCOLO,
    });

    const m = await criarModeloDeRelatorio(prisma, RELACAO_DE_PROCESSOS);
    const e = await executarRelatorio(prisma, {
      modeloId: m.modeloId, unidadeOrcId: "r-uo1", criadoPor: PROTOCOLO,
    });

    // ⚠️ ENFILEIRAR NÃO CALCULA. Antes do trabalhador rodar, não há resultado — e é
    // isso que "execução em segundo plano" significa.
    expect(
      await prisma.resultadoDaExecucao.findUnique({ where: { execucaoId: e.execucaoId } })
    ).toBeNull();

    const r = await processarExecucoesPendentes(prisma);
    expect(r).toEqual({ processadas: 1, falhas: 0 });

    const resultado = await prisma.resultadoDaExecucao.findUniqueOrThrow({
      where: { execucaoId: e.execucaoId },
      select: { csv: true, linhas: true },
    });
    expect(resultado.linhas).toBe(2);

    const linhas = resultado.csv.split("\r\n");
    expect(linhas[0]).toBe("Processo,Assunto,Situação,Movimentos,Atenção");
    // O campo CALCULADO funcionou: p1 tem movimento (encerramento), p2 tem trâmite.
    expect(linhas.some((l) => l.startsWith("2/2026,Alvará de obra,Em trâmite"))).toBe(true);
    expect(linhas.some((l) => l.startsWith("1/2026,Requerimento,Encerrado"))).toBe(true);
    expect(linhas.every((l) => !l.includes("Sem movimento"))).toBe(true);

    // ⚠️ A NOTIFICAÇÃO É REAL, e ela leva ao resultado.
    const aviso = await prisma.notificacao.findFirstOrThrow({
      where: { evento: "RELATORIO_CONCLUIDO" },
      select: { destinatario: true, corpo: true, rota: true, entregueEm: true },
    });
    expect(aviso.destinatario).toBe(PROTOCOLO);
    expect(aviso.corpo).toBe("2 linha(s).");
    expect(aviso.rota).toBe(`/relatorios/execucoes/${e.execucaoId}`);
    expect(aviso.entregueEm).not.toBeNull();
  });

  it("t9: o RESULTADO corresponde aos filtros aplicados", async () => {
    await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    await abrirProcesso(prisma, { ...ABERTURA, assuntoId: assuntoObra, requerenteId });

    const m = await criarModeloDeRelatorio(prisma, RELACAO_DE_PROCESSOS);
    const e = await executarRelatorio(prisma, {
      modeloId: m.modeloId, unidadeOrcId: "r-uo1",
      filtros: "assunto=Alvará", criadoPor: PROTOCOLO,
    });
    await processarExecucoesPendentes(prisma);

    const r = await prisma.resultadoDaExecucao.findUniqueOrThrow({
      where: { execucaoId: e.execucaoId },
      select: { csv: true, linhas: true },
    });
    expect(r.linhas).toBe(1);
    expect(r.csv).toContain("Alvará de obra");
    expect(r.csv).not.toContain("Requerimento");
  });

  it("t10: filtro sobre campo inexistente FALHA a execução, com motivo e notificação", async () => {
    const m = await criarModeloDeRelatorio(prisma, RELACAO_DE_PROCESSOS);
    const e = await executarRelatorio(prisma, {
      modeloId: m.modeloId, unidadeOrcId: "r-uo1",
      filtros: "inventado=x", criadoPor: PROTOCOLO,
    });

    const r = await processarExecucoesPendentes(prisma);
    expect(r).toEqual({ processadas: 0, falhas: 1 });

    // ⚠️ A FALHA FICA GRAVADA. Sem isso a execução ficaria pendente para sempre, sendo
    // retentada eternamente sem que ninguém soubesse por quê.
    const mov = await prisma.movimentoDaExecucao.findFirstOrThrow({
      where: { execucaoId: e.execucaoId },
      select: { tipo: true, detalhe: true },
    });
    expect(mov.tipo).toBe("FALHA");
    expect(mov.detalhe).toMatch(/campo inexistente na fonte PROCESSOS: "inventado"/);

    const aviso = await prisma.notificacao.findFirstOrThrow({
      where: { evento: "RELATORIO_FALHOU" },
      select: { destinatario: true },
    });
    expect(aviso.destinatario).toBe(PROTOCOLO);

    // E ela não é reprocessada: já tem movimento.
    expect(await processarExecucoesPendentes(prisma)).toEqual({ processadas: 0, falhas: 0 });
  });

  it("t11: processo SIGILOSO não entra no relatório de quem não é envolvido", async () => {
    const sigiloso = await prisma.assunto.create({
      data: { codigo: "SIG", nome: "Denúncia", sigiloPadrao: true, criadoPor: "SEED" },
      select: { id: true },
    });
    await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId: sigiloso.id, requerenteId, setorAberturaId: "r-s1",
    });

    // ⚠️ O EXECUTOR NÃO É DO PROTOCOLO E NÃO TEM PERMISSÃO GLOBAL — é o cenário do
    // teste 3 do lote ("sigiloso não aparece em relatório de quem não é envolvido").
    const forasteiro = await prisma.usuario.create({
      data: { identificador: "forasteiro@cg.pb.gov.br", nome: "Forasteiro", criadoPor: "SEED" },
      select: { id: true },
    });
    const perfil = await prisma.perfil.create({
      data: {
        nome: "RELATORIOS_UO", descricao: "Executa relatório nesta unidade.", criadoPor: "SEED",
        permissoes: {
          create: [{ acao: "EXECUTAR_RELATORIO", unidadeOrcId: "r-uo1", criadoPor: "SEED" }],
        },
      },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: forasteiro.id, perfilId: perfil.id, criadoPor: "SEED" },
    });
    await prisma.usuarioDoSetor.create({
      data: { usuarioIdent: "forasteiro@cg.pb.gov.br", setorId: "r-s2", criadoPor: "SEED" },
    });

    const m = await criarModeloDeRelatorio(prisma, {
      ...RELACAO_DE_PROCESSOS, visibilidade: "PUBLICO",
    });
    const e = await executarRelatorio(prisma, {
      modeloId: m.modeloId, unidadeOrcId: "r-uo1", criadoPor: "forasteiro@cg.pb.gov.br",
    });
    await processarExecucoesPendentes(prisma);

    const r = await prisma.resultadoDaExecucao.findUniqueOrThrow({
      where: { execucaoId: e.execucaoId },
      select: { csv: true, linhas: true },
    });
    // Só o não sigiloso. E o TOTAL também é 1 — o recorte está no `where`, não num
    // filtro depois da paginação.
    expect(r.linhas).toBe(1);
    expect(r.csv).toContain("Requerimento");
    expect(r.csv).not.toContain("Denúncia");
  });
});
