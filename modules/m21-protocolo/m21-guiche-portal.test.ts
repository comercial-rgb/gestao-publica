import "dotenv/config";
import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { travar } from "../../packages/locks/index.js";
import { cadastrarServicoDaCarta } from "./servico.js";
import {
  agendarPeloPortal,
  cancelarPeloPortal,
  consultarReservaPeloSegredo,
  criarGuiche,
  criarUnidadeDeAtendimento,
  definirServicoNoGuiche,
  declararExcecaoDeCalendario,
  guichesAbertosAoPortal,
  ofertaDoGuiche,
  publicarJanelaDeAtendimento,
  reagendarPeloPortal,
  reagendarReservaDeAtendimento,
  registrarAtendimentoRealizado,
  reservarAtendimento,
  QUOTA_DE_AGENDAMENTOS_POR_HORA,
} from "./servico-guiche.js";

/**
 * ═══ M21 — O AGENDAMENTO PELO CIDADÃO (V11 V8.1), CONTRA BANCO ═══
 *
 * A seção 5.39 do TR é o portal de AUTOATENDIMENTO: quem marca é o cidadão, sem conta. Não há
 * usuário a autorizar, e por isso TODA a proteção mora no corpo do caso de uso. Este arquivo
 * existe para afirmar cada camada dela, uma por vez:
 *
 *   · o que NÃO foi aberto ao portal não é agendável, ainda que o guichê atenda (t3);
 *   · o caminho público e o do balcão disputam a MESMA capacidade (t5 — e é a porta dos fundos
 *     mais óbvia de todas);
 *   · uma pessoa sozinha não esvazia a agenda (t6);
 *   · o segredo é a credencial, e o `codigo` NÃO serve para cancelar (t9);
 *   · segredo errado e inexistente respondem IGUAL (t8);
 *   · o cidadão vê o compromisso VIGENTE, não o que ele marcou (t11);
 *   · o cadastro de pessoas NÃO é tocado nem consultado (t2).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const CHEFIA = "chefia.protocolo@cg.pb.gov.br";
const BALCAO = "balcao@cg.pb.gov.br";
const ATENDENTE = "atendente@cg.pb.gov.br";

const SEGUNDA = "2026-09-21";
/** Terça: a janela é só de segunda, então nenhum horário existe nela. */
const TERCA_FECHADA = "2026-09-22";
const CPF_A = "11144477735";
const CPF_B = "52998224725";

let unidadeId = "";
let guiche = "";
let outroGuiche = "";
let servicoAberto = "";
let servicoSoNoBalcao = "";
let pessoaDoBalcao = "";

let quota = 0;
/** Uma chave de quota NOVA a cada chamada — origens diferentes não se limitam entre si. */
const novaChave = (): string => {
  quota += 1;
  return createHash("sha256").update(`origem-${quota}`).digest("hex");
};
/** Uma pausa real — os testes de trinco precisam medir que algo NÃO andou. */
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A MESMA chave, para provar a quota. */
const MESMA_ORIGEM = createHash("sha256").update("uma-origem-so").digest("hex");

async function usuarioComPerfil(identificador: string, perfil: string, acoes: readonly string[]): Promise<void> {
  const p = await prisma.perfil.create({
    data: {
      nome: perfil, descricao: perfil, criadoPor: "SEED",
      permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

async function agendar(p: { servico?: string; hora?: string; nome?: string; documento?: string; guicheId?: string; dia?: string; chave?: string } = {}) {
  return agendarPeloPortal(prisma, {
    guicheId: p.guicheId ?? guiche,
    servicoId: p.servico ?? servicoAberto,
    nome: p.nome ?? "Ana Cidada da Silva",
    documento: p.documento ?? CPF_A,
    dia: p.dia ?? SEGUNDA,
    horaInicio: p.hora ?? "08:00",
    chaveDeQuota: p.chave ?? novaChave(),
  });
}

async function janela(guicheId: string, capacidade: number): Promise<void> {
  await publicarJanelaDeAtendimento(prisma, {
    guicheId, diaDaSemana: 1, horaInicio: "08:00", horaFim: "10:00",
    duracaoMinutos: 30, capacidade, vigenciaInicio: "2026-01-01", criadoPor: CHEFIA,
  });
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "g-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "g-uo", codigo: "01001", descricao: "Administração", orgaoId: "g-org" } });
  await prisma.setor.create({ data: { id: "g-setor", codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "g-uo", criadoPor: "SEED" } });
  const assuntoId = (
    await prisma.assunto.create({
      data: {
        codigo: "REQ", nome: "Requerimento geral", criadoPor: "SEED",
        roteiro: { create: [{ ordem: 1, setorId: "g-setor", prazoDias: 3, descricao: "Triagem", criadoPor: "SEED" }] },
      },
      select: { id: true },
    })
  ).id;

  await usuarioComPerfil(CHEFIA, "CHEFIA", ["CONFIGURAR_AGENDA_DO_GUICHE", "CONFIGURAR_CARTA_DE_SERVICOS"]);
  await usuarioComPerfil(BALCAO, "BALCAO", ["RESERVAR_ATENDIMENTO_NO_GUICHE"]);
  await usuarioComPerfil(ATENDENTE, "ATENDENTE", ["REGISTRAR_ATENDIMENTO_NO_GUICHE"]);

  pessoaDoBalcao = (
    await prisma.pessoa.create({
      data: { documento: CPF_B, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: "Bia do Balcao", criadoPor: "SEED" } } },
      select: { id: true },
    })
  ).id;

  const criarServico = async (slug: string, titulo: string): Promise<string> =>
    (await cadastrarServicoDaCarta(prisma, {
      slug, titulo, categoria: "Tributos", publico: "CIDADAO",
      tipo: "REQUERIMENTO_ADMINISTRATIVO", assuntoId, criadoPor: CHEFIA,
    })).servicoId;
  servicoAberto = await criarServico("segunda-via", "Segunda via de IPTU");
  servicoSoNoBalcao = await criarServico("isencao", "Isencao de IPTU");

  unidadeId = (await criarUnidadeDeAtendimento(prisma, {
    codigo: "SEDE", nome: "Sede da Prefeitura", endereco: "Praca Central, 1 - Centro",
    setorId: "g-setor", criadoPor: CHEFIA,
  })).unidadeId;
  guiche = (await criarGuiche(prisma, { unidadeId, nome: "Guichê 1", criadoPor: CHEFIA })).guicheId;
  outroGuiche = (await criarGuiche(prisma, { unidadeId, nome: "Guichê 2", criadoPor: CHEFIA })).guicheId;

  // Um serviço ABERTO ao portal, e outro atendido SÓ no balcão — a diferença é o teste t3.
  await definirServicoNoGuiche(prisma, { guicheId: guiche, servicoId: servicoAberto, habilitado: true, agendamentoPublico: true, criadoPor: CHEFIA });
  await definirServicoNoGuiche(prisma, { guicheId: guiche, servicoId: servicoSoNoBalcao, habilitado: true, criadoPor: CHEFIA });
}

beforeEach(semear, 120_000);

describe("o que o portal oferece", () => {
  it("t1: só aparece guichê com serviço ABERTO ao portal — e só os serviços abertos dele", async () => {
    const abertos = await guichesAbertosAoPortal(prisma);
    expect(abertos.length).toBe(1);
    expect(abertos[0]?.guiche).toBe("Guichê 1");
    // ⚠️ "Isencao de IPTU" é atendida no guichê e NÃO é agendável pela internet: ela não entra.
    expect(abertos[0]?.servicos.map((s) => s.titulo)).toEqual(["Segunda via de IPTU"]);
    // O Guichê 2 não tem serviço nenhum: não aparece, em vez de aparecer vazio.
    expect(abertos.some((g) => g.guiche === "Guichê 2")).toBe(false);
  });

  it("t1b: desabilitar o serviço FECHA o portal junto — não sobra fila para uma porta que sumiu", async () => {
    await definirServicoNoGuiche(prisma, {
      guicheId: guiche, servicoId: servicoAberto, habilitado: false,
      motivo: "Passou a ser atendido na Secretaria de Financas.", criadoPor: CHEFIA,
    });
    expect(await guichesAbertosAoPortal(prisma)).toEqual([]);
    await janela(guiche, 2);
    await expect(agendar()).rejects.toThrow(/SERVICO-NAO-ATENDIDO/);
  });

  it("t1c: abrir e fechar SÓ o portal é um fato novo — não é repetição", async () => {
    // Mudar apenas "aceita marcação pela internet" precisa passar; recusar como repetição
    // deixaria o ente sem caminho para fechar o portal de um serviço que continua atendido.
    await definirServicoNoGuiche(prisma, { guicheId: guiche, servicoId: servicoAberto, habilitado: true, agendamentoPublico: false, criadoPor: CHEFIA });
    expect(await guichesAbertosAoPortal(prisma)).toEqual([]);
    await definirServicoNoGuiche(prisma, { guicheId: guiche, servicoId: servicoAberto, habilitado: true, agendamentoPublico: true, criadoPor: CHEFIA });
    expect((await guichesAbertosAoPortal(prisma)).length).toBe(1);
    // E aí sim, repetir o MESMO par é recusado.
    await expect(
      definirServicoNoGuiche(prisma, { guicheId: guiche, servicoId: servicoAberto, habilitado: true, agendamentoPublico: true, criadoPor: CHEFIA })
    ).rejects.toThrow(/já está HABILITADO.*com marcação pela internet/);
  });
});

describe("o agendamento do cidadão", () => {
  it("t2: marca sem conta, devolve o segredo UMA vez — e NÃO toca no cadastro de pessoas", async () => {
    await janela(guiche, 2);
    const antes = await prisma.pessoa.count();
    const r = await agendar();

    expect(r.codigo).toMatch(/^[A-Z0-9X]{10,}$/);
    expect(r.segredo).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    // ⚠️ O CADASTRO NÃO CRESCEU. Criar uma `Pessoa` a partir de um formulário público encheria o
    // registro de cidadãos com dado não conferido.
    expect(await prisma.pessoa.count()).toBe(antes);

    const gravada = await prisma.reservaDeAtendimento.findUniqueOrThrow({
      where: { codigo: r.codigo },
      select: { pessoaId: true, nomeDeclarado: true, documentoDeclarado: true, segredoHash: true, criadoPor: true },
    });
    expect(gravada.pessoaId).toBeNull();
    expect(gravada.nomeDeclarado).toBe("Ana Cidada da Silva");
    expect(gravada.documentoDeclarado).toBe(CPF_A);
    expect(gravada.criadoPor).toBe("PORTAL-DO-CIDADAO");
    // ⚠️ O SEGREDO NÃO ESTÁ NO BANCO — só o hash dele.
    expect(gravada.segredoHash).not.toBe(r.segredo);
    expect(gravada.segredoHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("t3: serviço atendido no guichê mas NÃO aberto ao portal é recusado, dizendo onde procurar", async () => {
    await janela(guiche, 2);
    await expect(agendar({ servico: servicoSoNoBalcao })).rejects.toThrow(
      /AGENDAMENTO-NAO-ABERTO.*não é marcado pela internet.*Sede da Prefeitura/s
    );
    expect(await prisma.reservaDeAtendimento.count()).toBe(0);
  });

  it("t4: sem oferta publicada, e em dia fechado, a recusa nomeia o motivo", async () => {
    await expect(agendar()).rejects.toThrow(/HORARIO-INEXISTENTE/);

    await janela(guiche, 2);
    await declararExcecaoDeCalendario(prisma, { tipo: "FECHADO", unidadeId, dia: SEGUNDA, motivo: "Feriado municipal", criadoPor: CHEFIA });
    await expect(agendar()).rejects.toThrow(/UNIDADE-FECHADA.*Feriado municipal/s);
    expect(await prisma.reservaDeAtendimento.count()).toBe(0);
  });

  it("t5: o portal e o BALCÃO disputam a MESMA capacidade — nos dois sentidos", async () => {
    await janela(guiche, 1);

    // O balcão ocupa; o portal não entra.
    await reservarAtendimento(prisma, {
      guicheId: guiche, servicoId: servicoAberto, pessoaId: pessoaDoBalcao,
      dia: SEGUNDA, horaInicio: "08:00", chaveDeIdempotencia: "balcao-1", criadoPor: BALCAO,
    });
    await expect(agendar()).rejects.toThrow(/HORARIO-LOTADO/);

    // E o contrário: o portal ocupa as 08:30, e o balcão não entra.
    await agendar({ hora: "08:30" });
    await expect(
      reservarAtendimento(prisma, {
        guicheId: guiche, servicoId: servicoAberto, pessoaId: pessoaDoBalcao,
        dia: SEGUNDA, horaInicio: "08:30", chaveDeIdempotencia: "balcao-2", criadoPor: BALCAO,
      })
    ).rejects.toThrow(/está lotado/);

    expect(await prisma.reservaDeAtendimento.count()).toBe(2);
  });

  it("t6: UM atendimento vivo por documento, por serviço — uma pessoa não esvazia a agenda", async () => {
    await janela(guiche, 5);
    const primeira = await agendar({ hora: "08:00" });
    await expect(agendar({ hora: "08:30" })).rejects.toThrow(
      new RegExp(`JA-TEM-MARCACAO.*${primeira.codigo}`, "s")
    );

    // ⚠️ POR SERVIÇO, e não por pessoa: quem precisa de dois atendimentos diferentes marca os dois.
    await definirServicoNoGuiche(prisma, { guicheId: guiche, servicoId: servicoSoNoBalcao, habilitado: true, agendamentoPublico: true, criadoPor: CHEFIA });
    const outra = await agendar({ hora: "08:30", servico: servicoSoNoBalcao });
    expect(outra.codigo).not.toBe(primeira.codigo);

    // E depois de CANCELAR, a mesma pessoa marca de novo o mesmo serviço.
    await cancelarPeloPortal(prisma, { segredo: primeira.segredo, motivo: "Nao poderei comparecer." });
    const terceira = await agendar({ hora: "09:00" });
    expect(terceira.codigo).not.toBe(primeira.codigo);
  });

  it("t6b: o limite por documento ESPERA o trinco — dois envios simultâneos não o furam", async () => {
    await janela(guiche, 5);

    // ⚠️ POR QUE NÃO UM `Promise.allSettled` DE DOIS AGENDAMENTOS: porque ele passaria com o
    // trinco REMOVIDO. Duas transações disparadas juntas não se cruzam de forma confiável — foi
    // medido no percurso do guichê (V11 V8) e custou um teste de concorrência que provava nada.
    // A afirmação aqui é a PROPRIEDADE: enquanto alguém segura o trinco DAQUELE documento para
    // AQUELE serviço, o agendamento daquele documento não anda.
    const outro = criarPrismaDeTeste();
    let liberar: () => void = () => undefined;
    const soltar = new Promise<void>((r) => {
      liberar = r;
    });
    const segurando = outro.$transaction(
      async (tx) => {
        await travar(tx, "AtendimentoPorDocumento", [`${CPF_A}:${servicoAberto}`]);
        await soltar;
      },
      { timeout: 20_000, maxWait: 10_000 }
    );

    try {
      await esperar(300);
      let concluiu = false;
      const tentativa = agendar({ hora: "08:00" }).then((v) => {
        concluiu = true;
        return v;
      });

      await esperar(700);
      expect(concluiu).toBe(false);
      expect(await prisma.reservaDeAtendimento.count()).toBe(0);

      liberar();
      await segurando;
      await tentativa;
      expect(concluiu).toBe(true);
      expect(await prisma.reservaDeAtendimento.count()).toBe(1);
    } finally {
      liberar();
      await segurando.catch(() => undefined);
      await outro.$disconnect();
    }
  });

  it("t6c: e o trinco é do PAR documento+serviço — outro serviço do mesmo documento não espera", async () => {
    await janela(guiche, 5);
    await definirServicoNoGuiche(prisma, { guicheId: guiche, servicoId: servicoSoNoBalcao, habilitado: true, agendamentoPublico: true, criadoPor: CHEFIA });

    // ⚠️ A CONTRAPROVA. Um trinco só do documento serializaria quem precisa de dois atendimentos
    // diferentes — e passaria no t6b sem ninguém notar.
    const outro = criarPrismaDeTeste();
    let liberar: () => void = () => undefined;
    const soltar = new Promise<void>((r) => {
      liberar = r;
    });
    const segurando = outro.$transaction(
      async (tx) => {
        await travar(tx, "AtendimentoPorDocumento", [`${CPF_A}:${servicoAberto}`]);
        await soltar;
      },
      { timeout: 20_000, maxWait: 10_000 }
    );

    try {
      await esperar(300);
      const r = await agendar({ hora: "08:00", servico: servicoSoNoBalcao });
      expect(r.codigo).toBeTruthy();
    } finally {
      liberar();
      await segurando.catch(() => undefined);
      await outro.$disconnect();
    }
  });

  it("t7: a QUOTA por origem barra a enxurrada, e outra origem não é afetada", async () => {
    await janela(guiche, 10);
    for (let i = 0; i < QUOTA_DE_AGENDAMENTOS_POR_HORA; i += 1) {
      // Documentos diferentes para não esbarrar no limite por documento.
      await agendar({ documento: `1114447773${i}`, nome: `Pessoa Numero ${i}`, hora: "08:00", chave: MESMA_ORIGEM });
    }
    await expect(agendar({ documento: "98765432100", nome: "Mais Uma Pessoa", chave: MESMA_ORIGEM })).rejects.toThrow(
      /QUOTA-DE-AGENDAMENTOS/
    );
    // Outra origem passa — a quota é da origem, não do sistema.
    const outra = await agendar({ documento: "98765432100", nome: "Mais Uma Pessoa", hora: "08:30" });
    expect(outra.codigo).toBeTruthy();
  });
});

describe("o que o segredo abre", () => {
  it("t8: segredo errado e segredo INEXISTENTE respondem IGUAL — a consulta não é oráculo", async () => {
    await janela(guiche, 2);
    const r = await agendar();

    expect(await consultarReservaPeloSegredo(prisma, "AAAAA-BBBBB-CCCCC-DDDDD")).toBeNull();
    expect(await consultarReservaPeloSegredo(prisma, "")).toBeNull();
    expect(await consultarReservaPeloSegredo(prisma, "qualquer coisa")).toBeNull();
    expect((await consultarReservaPeloSegredo(prisma, r.segredo))?.codigo).toBe(r.codigo);
  });

  it("t9: o CÓDIGO não cancela — só o segredo. É o que separa o cidadão de quem lê a agenda", async () => {
    await janela(guiche, 2);
    const r = await agendar();

    // ⚠️ O `codigo` aparece na agenda interna para quem tem CONSULTAR_PROTOCOLO. Se ele bastasse,
    // qualquer um deles desmarcaria o atendimento de um cidadão de forma anônima.
    await expect(cancelarPeloPortal(prisma, { segredo: r.codigo, motivo: "Tentativa pelo codigo." })).rejects.toThrow(
      /MARCACAO-NAO-ENCONTRADA/
    );
    expect(await prisma.cancelamentoDaReserva.count()).toBe(0);

    await cancelarPeloPortal(prisma, { segredo: r.segredo, motivo: "Nao poderei comparecer." });
    expect(await prisma.cancelamentoDaReserva.count()).toBe(1);
    expect((await consultarReservaPeloSegredo(prisma, r.segredo))?.situacao).toBe("CANCELADA");
  });

  it("t10: cancelar devolve o LUGAR, e o autor do ato é o portal — não um servidor", async () => {
    await janela(guiche, 1);
    const r = await agendar();
    expect((await ofertaDoGuiche(prisma, { guicheId: guiche, dia: SEGUNDA })).horarios[0]?.livres).toBe(0);

    await cancelarPeloPortal(prisma, { segredo: r.segredo, motivo: "Resolvi pela internet." });
    expect((await ofertaDoGuiche(prisma, { guicheId: guiche, dia: SEGUNDA })).horarios[0]?.livres).toBe(1);

    const c = await prisma.cancelamentoDaReserva.findFirstOrThrow({ select: { criadoPor: true, motivo: true } });
    expect(c.criadoPor).toBe("PORTAL-DO-CIDADAO");
    expect(c.motivo).toBe("Resolvi pela internet.");
  });

  it("t11: o cidadão vê o compromisso VIGENTE — se o ente remarcou, é o novo", async () => {
    await janela(guiche, 2);
    await janela(outroGuiche, 2);
    const r = await agendar({ hora: "08:00" });

    await reagendarReservaDeAtendimento(prisma, {
      reservaId: (await prisma.reservaDeAtendimento.findUniqueOrThrow({ where: { codigo: r.codigo }, select: { id: true } })).id,
      guicheId: outroGuiche, dia: SEGUNDA, horaInicio: "09:00",
      motivo: "A mesa 1 esta em manutencao.", criadoPor: BALCAO,
    });

    const vista = await consultarReservaPeloSegredo(prisma, r.segredo);
    // ⚠️ MOSTRAR O ORIGINAL MANDARIA A PESSOA NO HORÁRIO ERRADO — e ela chegaria a uma mesa
    // desmontada, tendo feito tudo certo.
    expect(vista?.hora).toBe("09:00");
    expect(vista?.guiche).toBe("Guichê 2");
    expect(vista?.dia).toBe(SEGUNDA);
  });

  it("t12: atendida não se cancela pelo portal, e cancelar duas vezes é recusado com motivo", async () => {
    await janela(guiche, 2);
    const r = await agendar();
    const id = (await prisma.reservaDeAtendimento.findUniqueOrThrow({ where: { codigo: r.codigo }, select: { id: true } })).id;
    await registrarAtendimentoRealizado(prisma, { reservaId: id, atendidoPor: "Servidora do guichê", criadoPor: ATENDENTE });

    await expect(cancelarPeloPortal(prisma, { segredo: r.segredo, motivo: "Tentativa depois de atendida." })).rejects.toThrow(
      /JA-ATENDIDA.*reescreveria um fato/s
    );
    expect((await consultarReservaPeloSegredo(prisma, r.segredo))?.situacao).toBe("ATENDIDA");
  });

  it("t13: a projeção pública é MÍNIMA — não devolve o documento declarado", async () => {
    await janela(guiche, 2);
    const r = await agendar();
    const vista = await consultarReservaPeloSegredo(prisma, r.segredo);
    expect(vista).not.toBeNull();
    // ⚠️ Quem tem o segredo já sabe o próprio documento; imprimi-lo de volta só amplia o estrago
    // de um segredo que vaze — um print de tela passa a valer um CPF.
    expect(JSON.stringify(vista)).not.toContain(CPF_A);
    expect(vista?.nome).toBe("Ana Cidada da Silva");
    expect(vista?.endereco).toBe("Praca Central, 1 - Centro");
  });
});

describe("o cidadão remarca e o balcão entrega o código (V11 V8.5)", () => {
  it("t16: a marcação do BALCÃO também devolve um código de acompanhamento — e ele ABRE a consulta", async () => {
    // ⚠️ A PREMISSA DA V8.1 ESTAVA ERRADA. O CHECK de então dizia que uma marcação do balcão não
    // tem segredo a entregar, porque a pessoa foi identificada ali. A primeira metade é verdade e
    // a conclusão não segue: ela vai embora e continua precisando consultar e cancelar, e
    // obrigá-la a voltar ao balcão para desmarcar transforma cortesia em deslocamento.
    await janela(guiche, 2);
    const r = await reservarAtendimento(prisma, {
      guicheId: guiche, servicoId: servicoAberto, pessoaId: pessoaDoBalcao,
      dia: SEGUNDA, horaInicio: "08:00", chaveDeIdempotencia: "balcao-com-codigo", criadoPor: BALCAO,
    });
    expect(r.segredo).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const vista = await consultarReservaPeloSegredo(prisma, r.segredo ?? "");
    expect(vista?.codigo).toBe(r.codigo);
    expect(vista?.situacao).toBe("MARCADA");

    // E o código continua guardado SÓ por hash.
    const g = await prisma.reservaDeAtendimento.findUniqueOrThrow({
      where: { id: r.reservaId }, select: { segredoHash: true, pessoaId: true },
    });
    expect(g.segredoHash).not.toBe(r.segredo);
    expect(g.pessoaId).toBe(pessoaDoBalcao);
  });

  it("t17: o cidadão REMARCA pelo portal — um ato só, sem devolver o lugar à fila no meio", async () => {
    // ⚠️ O BURACO QUE ISTO FECHA: com "cancele e marque de novo", entre os dois atos o lugar volta
    // para a fila e outra pessoa pode tomá-lo. Quem só queria mudar de horário ficaria sem nenhum.
    await janela(guiche, 1);
    const r = await agendar({ hora: "08:00" });

    const rem = await reagendarPeloPortal(prisma, { segredo: r.segredo, dia: SEGUNDA, horaInicio: "09:00" });
    expect(rem.sequencia).toBe(1);
    expect(rem.de).toEqual({ dia: SEGUNDA, hora: "08:00" });

    const vista = await consultarReservaPeloSegredo(prisma, r.segredo);
    expect(vista?.hora).toBe("09:00");

    // O horário de ORIGEM voltou a ficar livre, e o de DESTINO está tomado.
    const oferta = new Map((await ofertaDoGuiche(prisma, { guicheId: guiche, dia: SEGUNDA })).horarios.map((h) => [h.hora, h.livres]));
    expect(oferta.get("08:00")).toBe(1);
    expect(oferta.get("09:00")).toBe(0);

    // ⚠️ E O HISTÓRICO DIZ QUEM REMARCOU. Não se atribui a um servidor um ato do cidadão.
    const fato = await prisma.reagendamentoDaReserva.findFirstOrThrow({
      where: { reservaId: (await prisma.reservaDeAtendimento.findUniqueOrThrow({ where: { codigo: r.codigo }, select: { id: true } })).id },
      select: { criadoPor: true, motivo: true },
    });
    expect(fato.criadoPor).toBe("PORTAL-DO-CIDADAO");
    expect(fato.motivo).toContain("próprio cidadão");
  });

  it("t18: remarcar para horário LOTADO é recusado — e a marcação continua onde estava", async () => {
    await janela(guiche, 1);
    const r = await agendar({ hora: "08:00" });
    await agendar({ hora: "09:00", documento: CPF_B, nome: "Bia Cidada do Portal" });

    await expect(
      reagendarPeloPortal(prisma, { segredo: r.segredo, dia: SEGUNDA, horaInicio: "09:00" })
    ).rejects.toThrow(/HORARIO-LOTADO[\s\S]*continua como está/);

    // ⚠️ A GARANTIA DO "UM ATO SÓ": a recusa não deixou a pessoa sem horário nenhum.
    expect((await consultarReservaPeloSegredo(prisma, r.segredo))?.hora).toBe("08:00");
  });

  it("t19: remarcar para o MESMO horário, para dia fechado, ou já atendida/cancelada é recusado", async () => {
    await janela(guiche, 2);
    const r = await agendar({ hora: "08:00" });

    await expect(reagendarPeloPortal(prisma, { segredo: r.segredo, dia: SEGUNDA, horaInicio: "08:00" })).rejects.toThrow(
      /MESMO-HORARIO/
    );
    await expect(reagendarPeloPortal(prisma, { segredo: r.segredo, dia: TERCA_FECHADA, horaInicio: "08:30" })).rejects.toThrow(
      /HORARIO-INEXISTENTE/
    );
    await expect(reagendarPeloPortal(prisma, { segredo: "AAAAA-BBBBB-CCCCC-DDDDD", dia: SEGUNDA, horaInicio: "08:30" })).rejects.toThrow(
      /MARCACAO-NAO-ENCONTRADA/
    );

    await cancelarPeloPortal(prisma, { segredo: r.segredo, motivo: "Nao poderei comparecer." });
    await expect(reagendarPeloPortal(prisma, { segredo: r.segredo, dia: SEGUNDA, horaInicio: "08:30" })).rejects.toThrow(
      /JA-CANCELADA/
    );
  });
});

describe("a forma do que o cidadão digita", () => {
  it("t14: documento que não é CPF nem CNPJ é recusado, e a máscara é aceita", async () => {
    await janela(guiche, 2);
    await expect(agendar({ documento: "123" })).rejects.toThrow();
    await expect(agendar({ documento: "" })).rejects.toThrow();
    // Com pontuação, passa — e é gravado só com os dígitos.
    const r = await agendar({ documento: "111.444.777-35" });
    const g = await prisma.reservaDeAtendimento.findUniqueOrThrow({ where: { codigo: r.codigo }, select: { documentoDeclarado: true } });
    expect(g.documentoDeclarado).toBe(CPF_A);
  });

  it("t15: nome curto demais é recusado — 'a' não identifica ninguém no balcão", async () => {
    await janela(guiche, 2);
    await expect(agendar({ nome: "a" })).rejects.toThrow();
    expect(await prisma.reservaDeAtendimento.count()).toBe(0);
  });
});
