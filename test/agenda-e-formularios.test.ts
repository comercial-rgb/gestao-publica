import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { agendaDaFiscalizacao, cancelarFiscalizacao, reagendarFiscalizacao, registrarRealizacaoDaFiscalizacao } from "../modules/m11-licitacoes/agenda-da-fiscalizacao.js";
import { cadastrarTipoDeOcorrencia, mudarSituacaoDoTipoDeOcorrencia, publicarVersaoDoTipoDeOcorrencia, tiposDeOcorrenciaDoEnte } from "../modules/m11-licitacoes/formularios-de-ocorrencia.js";
import { designarNoContrato, programarFiscalizacao, registrarOcorrencia, revogarDesignacaoNoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";

/**
 * ═══ A AGENDA DA FISCALIZAÇÃO E OS FORMULÁRIOS VERSIONADOS (V7 M2 U8) ═══
 *
 * Contrato sintético com gestora, fiscal e um segundo fiscal; compromissos com horário, duração e local. As três vistas
 * (dia, semana, mês) são a MESMA leitura com períodos diferentes — o teste prova que os mesmos compromissos aparecem nas
 * três e que a troca de dia e de horário anda com eles.
 *   AG01 — programa com horário; dia, semana e mês mostram o mesmo compromisso; o conflito do mesmo fiscal é APONTADO;
 *   AG02 — reagendar muda o dia e a hora e guarda o histórico; cancelar e realizar são finais;
 *   AG03 — designação revogada, outro setor e outro fiscal: recusas nomeadas;
 *   FO01 — tipo do ente, versão 1 com perguntas, ocorrência responde e as respostas ficam presas à versão;
 *   FO02 — versão 2 não reinterpreta o preenchido; a versão não vigente é recusada; tipo desativado não serve a nova.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "admin.u8@teste.local";
const GESTORA = "gestora.u8@teste.local";
const FISCAL = "fiscal.u8@teste.local";
const FISCAL2 = "fiscal2.u8@teste.local";
const OUTRO = "outro.u8@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);
const TODAS = ["PROGRAMAR_FISCALIZACAO_DO_CONTRATO", "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO"];

async function conta(identificador: string, acoes: readonly string[], documento?: string): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  if (documento !== undefined) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: identificador.split("@")[0]!, criadoPor: "SEED" } } } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
  }
}

let fiscalDesignacao = "";
let fiscal2Designacao = "";

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO", "GERIR_TIPOS_DE_OCORRENCIA"]);
  await conta(GESTORA, TODAS, "11144477735");
  await conta(FISCAL, TODAS, "52998224725");
  await conta(FISCAL2, TODAS, "86288366757");
  await conta(OUTRO, TODAS, "39053344705");
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0800", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços com fiscalização", valorLicitado: "1000.00", criadoPor: "SEED" } });
  await prisma.contrato.create({ data: { id: "ctr", numeroContrato: "CT-U8", processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Serviços Delta", valorInicial: "1000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
  await designarNoContrato(prisma, { contratoId: "ctr", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria G-U8", vigenciaInicio: dia(-30), criadoPor: ADMIN });
  fiscalDesignacao = (await designarNoContrato(prisma, { contratoId: "ctr", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria F-U8", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
  fiscal2Designacao = (await designarNoContrato(prisma, { contratoId: "ctr", papel: "FISCAL", usuarioIdentificador: FISCAL2, atoDesignacao: "Portaria F2-U8", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
}, 120_000);

const programar = (extra: Record<string, unknown> = {}) =>
  programarFiscalizacao(prisma, { contratoId: "ctr", fiscalDesignacaoId: fiscalDesignacao, dataPrevista: HOJE, objetivo: "Visita de acompanhamento da execução", horaInicio: "09:00", duracaoMinutos: 90, local: "Unidade básica de saúde central", criadoPor: GESTORA, ...extra } as never);

const agenda = (de: string, ate: string, extra: Record<string, unknown> = {}) => agendaDaFiscalizacao(prisma, { de, ate, ...extra } as never);

describe("U8 — a agenda da fiscalização", () => {
  it("AG01: o compromisso tem horário, duração e local; dia, semana e mês mostram o mesmo; o conflito do fiscal é apontado, não proibido", async () => {
    const a = await programar();
    const b = await programar({ horaInicio: "10:00", duracaoMinutos: 60, objetivo: "Conferência do relatório mensal de execução" });
    const c = await programar({ fiscalDesignacaoId: fiscal2Designacao, horaInicio: "09:30", objetivo: "Visita do segundo fiscal, outra frente" });
    expect([a.numero, b.numero, c.numero]).toEqual([1, 2, 3]);
    const doDia = await agenda(HOJE, HOJE);
    expect(doDia.map((x) => [x.numero, x.data, x.horaInicio, x.horaFim, x.local, x.situacao])).toEqual([
      [1, HOJE, "09:00", "10:30", "Unidade básica de saúde central", "PROGRAMADA"],
      [3, HOJE, "09:30", "11:00", "Unidade básica de saúde central", "PROGRAMADA"],
      [2, HOJE, "10:00", "11:00", "Unidade básica de saúde central", "PROGRAMADA"],
    ]);
    // 1 e 2 são do MESMO fiscal e se cruzam (09:00–10:30 × 10:00–11:00); 3 é de outro fiscal e não conflita.
    expect(doDia.map((x) => [x.numero, [...x.conflitos]])).toEqual([[1, [2]], [3, []], [2, [1]]]);
    // A semana e o mês são a MESMA leitura, com o período maior: os três continuam lá.
    const daSemana = await agenda(dia(-3), dia(3));
    const doMes = await agenda(dia(-15), dia(15));
    expect([daSemana.length, doMes.length]).toEqual([3, 3]);
    expect(doMes.map((x) => x.numero)).toEqual(doDia.map((x) => x.numero));
    // O filtro por fiscal e por situação recorta a mesma leitura.
    expect((await agenda(dia(-15), dia(15), { fiscalUsuario: FISCAL2 })).map((x) => x.numero)).toEqual([3]);
    expect(await agenda(dia(-15), dia(15), { situacoes: ["CANCELADA"] })).toEqual([]);
    // Fora do período, nada.
    expect(await agenda(dia(5), dia(9))).toEqual([]);
  });

  it("AG02: reagendar muda dia e hora com motivo e histórico; cancelar e realizar são finais e não se desfazem", async () => {
    const a = await programar();
    const r = await reagendarFiscalizacao(prisma, { ordemId: (await prisma.ordemDeFiscalizacao.findFirstOrThrow({ where: { numero: a.numero }, select: { id: true } })).id, dataPrevista: dia(2), horaInicio: "14:00", duracaoMinutos: 120, local: "Almoxarifado central", motivo: "Responsável da unidade em licença", criadoPor: GESTORA });
    expect(r).toMatchObject({ numero: 1, data: dia(2) });
    expect(await agenda(HOJE, HOJE)).toEqual([]);
    const depois = (await agenda(dia(2), dia(2)))[0]!;
    expect([depois.data, depois.horaInicio, depois.horaFim, depois.local, depois.situacao]).toEqual([dia(2), "14:00", "16:00", "Almoxarifado central", "REAGENDADA"]);
    expect(depois.historico).toEqual([{ data: dia(2), motivo: "Responsável da unidade em licença", por: expect.stringContaining("gestora.u8") }]);
    // Realizada: final. Não se reagenda nem se cancela depois.
    const ordemId = depois.id;
    await expect(registrarRealizacaoDaFiscalizacao(prisma, { ordemId, data: HOJE, horaInicio: "14:05", horaFim: "15:30", relato: "Visita feita com o responsável da unidade", criadoPor: FISCAL })).resolves.toMatchObject({ numero: 1 });
    await expect(registrarRealizacaoDaFiscalizacao(prisma, { ordemId, data: HOJE, relato: "Segunda tentativa de registrar a mesma visita", criadoPor: FISCAL })).rejects.toThrow(/FISCALIZACAO-JA-REALIZADA/);
    // A visita registrada no futuro é recusada: a realização é do que já aconteceu.
    await expect(registrarRealizacaoDaFiscalizacao(prisma, { ordemId: "x", data: dia(1), relato: "Visita que ainda não aconteceu", criadoPor: FISCAL })).rejects.toThrow(/REALIZACAO-NO-FUTURO/);
    await expect(reagendarFiscalizacao(prisma, { ordemId, dataPrevista: dia(4), motivo: "Tentativa depois da realização", criadoPor: GESTORA })).rejects.toThrow(/FISCALIZACAO-JA-REALIZADA/);
    await expect(cancelarFiscalizacao(prisma, { ordemId, motivo: "Tentativa depois da realização", criadoPor: GESTORA })).rejects.toThrow(/FISCALIZACAO-JA-REALIZADA/);
    const realizada = (await agenda(dia(2), dia(2)))[0]!;
    expect(realizada.situacao).toBe("REALIZADA");
    expect(realizada.realizacao).toMatchObject({ data: HOJE, horaInicio: "14:05", horaFim: "15:30", relato: "Visita feita com o responsável da unidade" });
    // Outro compromisso: cancelar também é final, e o cancelado sai dos conflitos.
    const b = await programar({ horaInicio: "09:15" });
    const ordemB = (await prisma.ordemDeFiscalizacao.findFirstOrThrow({ where: { numero: b.numero }, select: { id: true } })).id;
    await expect(cancelarFiscalizacao(prisma, { ordemId: ordemB, motivo: "Serviço suspenso pela administração", criadoPor: GESTORA })).resolves.toMatchObject({ numero: 2 });
    await expect(cancelarFiscalizacao(prisma, { ordemId: ordemB, motivo: "Serviço suspenso pela administração", criadoPor: GESTORA })).rejects.toThrow(/FISCALIZACAO-JA-CANCELADA/);
    await expect(registrarRealizacaoDaFiscalizacao(prisma, { ordemId: ordemB, data: HOJE, relato: "Tentativa de realizar o cancelado", criadoPor: FISCAL })).rejects.toThrow(/FISCALIZACAO-CANCELADA/);
    const cancelado = (await agenda(HOJE, HOJE))[0]!;
    expect([cancelado.situacao, cancelado.cancelamento?.motivo]).toEqual(["CANCELADA", "Serviço suspenso pela administração"]);
  });

  it("AG03: quem não é designado não mexe na agenda — outro setor, outro fiscal e designação revogada", async () => {
    const a = await programar();
    const ordemId = (await prisma.ordemDeFiscalizacao.findFirstOrThrow({ where: { numero: a.numero }, select: { id: true } })).id;
    await expect(reagendarFiscalizacao(prisma, { ordemId, dataPrevista: dia(1), motivo: "Tentativa de outro setor", criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-GESTOR/);
    await expect(cancelarFiscalizacao(prisma, { ordemId, motivo: "Tentativa de outro setor", criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-GESTOR/);
    await expect(registrarRealizacaoDaFiscalizacao(prisma, { ordemId, data: HOJE, relato: "Tentativa de quem não é fiscal deste contrato", criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
    // O segundo fiscal é designado do contrato, mas o compromisso é de outro fiscal.
    await expect(registrarRealizacaoDaFiscalizacao(prisma, { ordemId, data: HOJE, relato: "Visita que eu não fiz, do compromisso do colega", criadoPor: FISCAL2 })).rejects.toThrow(/FISCALIZACAO-DE-OUTRO-FISCAL/);
    // Revogada a designação do fiscal, o compromisso não se reagenda para depois do efeito.
    await revogarDesignacaoNoContrato(prisma, { designacaoId: fiscalDesignacao, dataEfeito: HOJE, motivo: "Fiscal removido do contrato", criadoPor: ADMIN });
    await expect(reagendarFiscalizacao(prisma, { ordemId, dataPrevista: dia(3), motivo: "Reagendamento depois da revogação", criadoPor: GESTORA })).rejects.toThrow(/FISCAL-SEM-VIGENCIA-NA-DATA/);
    expect(await prisma.reagendamentoDeFiscalizacao.count()).toBe(0);
    expect(await prisma.realizacaoDeFiscalizacao.count()).toBe(0);
  });
});

describe("U8 — os tipos de ocorrência e os formulários versionados", () => {
  const perguntas = [
    { codigo: "local", rotulo: "Onde foi constatado", tipoDeResposta: "TEXTO" as const, obrigatoria: true, opcoes: [] },
    { codigo: "qtd", rotulo: "Quantos dias de atraso", tipoDeResposta: "NUMERO" as const, obrigatoria: true, opcoes: [] },
    { codigo: "risco", rotulo: "Risco identificado", tipoDeResposta: "OPCAO" as const, obrigatoria: false, opcoes: ["Nenhum", "Ambiental", "Segurança do trabalho"] },
  ];
  const tipoComVersao = async (vigencia = dia(-10)) => {
    const { tipoId } = await cadastrarTipoDeOcorrencia(prisma, { codigo: "ATRASO-OBRA", nome: "Atraso na execução", natureza: "ATRASO", criadoPor: ADMIN });
    const v = await publicarVersaoDoTipoDeOcorrencia(prisma, { tipoId, exigeGravidade: true, encaminhamentoPadrao: "GESTOR", vigenciaInicio: vigencia, motivo: "Formulário aprovado pela fiscalização", perguntas, criadoPor: ADMIN });
    return { tipoId, ...v };
  };

  it("FO01: o tipo do ente com formulário; a ocorrência responde, e o obrigatório, o formato e a gravidade são cobrados", async () => {
    const { tipoId, versaoId } = await tipoComVersao();
    const tipos = await tiposDeOcorrenciaDoEnte(prisma);
    expect(tipos.map((t) => [t.codigo, t.ativo, t.versaoVigente?.versao, t.versaoVigente?.perguntas.length])).toEqual([["ATRASO-OBRA", true, 1, 3]]);
    const p = (codigo: string) => tipos[0]!.versaoVigente!.perguntas.find((x) => x.codigo === codigo)!.id;
    const base = { contratoId: "ctr", data: dia(-1), tipo: "ATRASO" as const, descricao: "Serviço parado na frente norte", encaminhamento: "GESTOR" as const, versaoDoTipoId: versaoId, criadoPor: FISCAL };
    await expect(registrarOcorrencia(prisma, { ...base, gravidade: "ALTA", respostas: [{ perguntaId: p("local"), valor: "Frente norte" }] })).rejects.toThrow(/PERGUNTA-OBRIGATORIA-SEM-RESPOSTA: falta responder "Quantos dias de atraso"/);
    await expect(registrarOcorrencia(prisma, { ...base, gravidade: "ALTA", respostas: [{ perguntaId: p("local"), valor: "Frente norte" }, { perguntaId: p("qtd"), valor: "cinco" }] })).rejects.toThrow(/RESPOSTA-INVALIDA: a resposta de "Quantos dias de atraso" precisa ser um número/);
    await expect(registrarOcorrencia(prisma, { ...base, gravidade: "ALTA", respostas: [{ perguntaId: p("local"), valor: "Frente norte" }, { perguntaId: p("qtd"), valor: "5" }, { perguntaId: p("risco"), valor: "Elétrico" }] })).rejects.toThrow(/RESPOSTA-INVALIDA: .*uma das opções: Nenhum, Ambiental, Segurança do trabalho/);
    await expect(registrarOcorrencia(prisma, { ...base, respostas: [{ perguntaId: p("local"), valor: "Frente norte" }, { perguntaId: p("qtd"), valor: "5" }] })).rejects.toThrow(/GRAVIDADE-EXIGIDA/);
    expect(await prisma.ocorrenciaDeFiscalizacao.count()).toBe(0);
    const ok = await registrarOcorrencia(prisma, { ...base, gravidade: "ALTA", respostas: [{ perguntaId: p("local"), valor: "Frente norte" }, { perguntaId: p("qtd"), valor: "5" }, { perguntaId: p("risco"), valor: "Segurança do trabalho" }] });
    expect(ok).toMatchObject({ numero: 1, respostas: 3 });
    const gravada = await prisma.ocorrenciaDeFiscalizacao.findUniqueOrThrow({ where: { id: ok.ocorrenciaId }, select: { gravidade: true, versaoDoTipoId: true, respostas: { select: { valor: true, pergunta: { select: { codigo: true, versaoId: true } } } } } });
    expect(gravada.gravidade).toBe("ALTA");
    expect(gravada.versaoDoTipoId).toBe(versaoId);
    expect(gravada.respostas.map((x) => [x.pergunta.codigo, x.valor, x.pergunta.versaoId === versaoId]).sort()).toEqual([["local", "Frente norte", true], ["qtd", "5", true], ["risco", "Segurança do trabalho", true]]);
    // Sem tipo configurado, respostas e gravidade não existem.
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr", data: dia(-1), tipo: "ATRASO", descricao: "Ocorrência sem formulário", encaminhamento: "NENHUM", gravidade: "BAIXA", criadoPor: FISCAL })).rejects.toThrow(/RESPOSTA-SEM-FORMULARIO/);
    expect(tipoId).not.toBe("");
  });

  it("FO02: a versão nova não reinterpreta o respondido; versão não vigente e tipo desativado são recusados", async () => {
    const { tipoId, versaoId } = await tipoComVersao();
    const tipos1 = await tiposDeOcorrenciaDoEnte(prisma);
    const p1 = (codigo: string) => tipos1[0]!.versaoVigente!.perguntas.find((x) => x.codigo === codigo)!.id;
    const primeira = await registrarOcorrencia(prisma, { contratoId: "ctr", data: dia(-5), tipo: "ATRASO", descricao: "Atraso constatado na frente norte", encaminhamento: "GESTOR", versaoDoTipoId: versaoId, gravidade: "MEDIA", respostas: [{ perguntaId: p1("local"), valor: "Frente norte" }, { perguntaId: p1("qtd"), valor: "3" }], criadoPor: FISCAL });
    // Versão 2: outra pergunta, sem gravidade, valendo de hoje.
    const v2 = await publicarVersaoDoTipoDeOcorrencia(prisma, { tipoId, exigeGravidade: false, encaminhamentoPadrao: "NENHUM", vigenciaInicio: HOJE, motivo: "Formulário revisado pela fiscalização", perguntas: [{ codigo: "resumo", rotulo: "Resumo do atraso", tipoDeResposta: "TEXTO", obrigatoria: true, opcoes: [] }], criadoPor: ADMIN });
    expect(v2.versao).toBe(2);
    await expect(publicarVersaoDoTipoDeOcorrencia(prisma, { tipoId, exigeGravidade: false, encaminhamentoPadrao: "NENHUM", vigenciaInicio: dia(-20), motivo: "Tentativa de intercalar versão antiga", perguntas: [{ codigo: "x", rotulo: "Qualquer", tipoDeResposta: "TEXTO", obrigatoria: false, opcoes: [] }], criadoPor: ADMIN })).rejects.toThrow(/VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE/);
    // O que foi respondido continua como estava, na versão 1.
    const antiga = await prisma.ocorrenciaDeFiscalizacao.findUniqueOrThrow({ where: { id: primeira.ocorrenciaId }, select: { gravidade: true, versaoDoTipo: { select: { versao: true } }, respostas: { select: { valor: true, pergunta: { select: { codigo: true, rotulo: true } } } } } });
    expect([antiga.versaoDoTipo?.versao, antiga.gravidade]).toEqual([1, "MEDIA"]);
    expect(antiga.respostas.map((r) => r.pergunta.codigo).sort()).toEqual(["local", "qtd"]);
    // Hoje vale a versão 2: a 1 não se usa mais em ocorrência nova, e a 2 não pede gravidade.
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr", data: HOJE, tipo: "ATRASO", descricao: "Nova ocorrência pela versão antiga", encaminhamento: "GESTOR", versaoDoTipoId: versaoId, gravidade: "ALTA", respostas: [{ perguntaId: p1("local"), valor: "Frente sul" }, { perguntaId: p1("qtd"), valor: "1" }], criadoPor: FISCAL })).rejects.toThrow(/VERSAO-DO-FORMULARIO-NAO-VIGENTE: em .* vale a versão 2 .*não a versão 1/);
    const tipos2 = await tiposDeOcorrenciaDoEnte(prisma);
    const resumo = tipos2[0]!.versaoVigente!.perguntas[0]!;
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr", data: HOJE, tipo: "ATRASO", descricao: "Ocorrência pela versão nova", encaminhamento: "NENHUM", versaoDoTipoId: v2.versaoId, gravidade: "ALTA", respostas: [{ perguntaId: resumo.id, valor: "Duas frentes paradas" }], criadoPor: FISCAL })).rejects.toThrow(/GRAVIDADE-NAO-APLICAVEL/);
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr", data: HOJE, tipo: "ATRASO", descricao: "Ocorrência pela versão nova", encaminhamento: "NENHUM", versaoDoTipoId: v2.versaoId, respostas: [{ perguntaId: p1("local"), valor: "Frente sul" }], criadoPor: FISCAL })).rejects.toThrow(/PERGUNTA-DE-OUTRA-VERSAO/);
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr", data: HOJE, tipo: "ATRASO", descricao: "Ocorrência pela versão nova", encaminhamento: "NENHUM", versaoDoTipoId: v2.versaoId, respostas: [{ perguntaId: resumo.id, valor: "Duas frentes paradas" }], criadoPor: FISCAL })).resolves.toMatchObject({ numero: 2, respostas: 1 });
    // Desativar: o tipo sai da lista de quem vai preencher, e a ocorrência anterior continua íntegra.
    await expect(mudarSituacaoDoTipoDeOcorrencia(prisma, { tipoId, ativo: true, motivo: "Tentativa de ativar o que já está ativo", criadoPor: ADMIN })).rejects.toThrow(/SITUACAO-JA-E-ESSA/);
    await mudarSituacaoDoTipoDeOcorrencia(prisma, { tipoId, ativo: false, motivo: "Tipo substituído pelo novo fluxo de atraso", criadoPor: ADMIN });
    expect(await tiposDeOcorrenciaDoEnte(prisma, { apenasAtivos: true })).toEqual([]);
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr", data: HOJE, tipo: "ATRASO", descricao: "Ocorrência com tipo desativado", encaminhamento: "NENHUM", versaoDoTipoId: v2.versaoId, respostas: [{ perguntaId: resumo.id, valor: "Tentativa" }], criadoPor: FISCAL })).rejects.toThrow(/TIPO-DESATIVADO/);
    expect((await prisma.ocorrenciaDeFiscalizacao.findUniqueOrThrow({ where: { id: primeira.ocorrenciaId }, select: { respostas: { select: { id: true } } } })).respostas).toHaveLength(2);
    // O cadastro recusa duplicidade de código e formulário malformado.
    await expect(cadastrarTipoDeOcorrencia(prisma, { codigo: "ATRASO-OBRA", nome: "Outro atraso", natureza: "ATRASO", criadoPor: ADMIN })).rejects.toThrow(/TIPO-JA-CADASTRADO/);
    await expect(publicarVersaoDoTipoDeOcorrencia(prisma, { tipoId, exigeGravidade: false, encaminhamentoPadrao: "NENHUM", vigenciaInicio: HOJE, motivo: "Formulário com lista sem opções", perguntas: [{ codigo: "risco", rotulo: "Risco", tipoDeResposta: "OPCAO", obrigatoria: true, opcoes: ["Único"] }], criadoPor: ADMIN })).rejects.toThrow(/PERGUNTA-SEM-OPCOES/);
    await expect(publicarVersaoDoTipoDeOcorrencia(prisma, { tipoId, exigeGravidade: false, encaminhamentoPadrao: "NENHUM", vigenciaInicio: HOJE, motivo: "Formulário com opções em pergunta de texto", perguntas: [{ codigo: "t", rotulo: "Texto", tipoDeResposta: "TEXTO", obrigatoria: true, opcoes: ["a", "b"] }], criadoPor: ADMIN })).rejects.toThrow(/OPCOES-EM-PERGUNTA-QUE-NAO-E-LISTA/);
    // E o cadastro é da administração: o fiscal não cadastra tipo nem publica versão.
    await expect(cadastrarTipoDeOcorrencia(prisma, { codigo: "NOVO-TIPO", nome: "Tipo do fiscal", natureza: "OUTRO", criadoPor: FISCAL })).rejects.toThrow(/ACESSO NEGADO[\s\S]*GERIR_TIPOS_DE_OCORRENCIA/);
  });
});
