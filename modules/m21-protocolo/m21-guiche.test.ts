import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { travar } from "../../packages/locks/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { cadastrarServicoDaCarta } from "./servico.js";
import {
  cancelarReservaDeAtendimento,
  confirmarReservaDeAtendimento,
  criarGuiche,
  criarUnidadeDeAtendimento,
  definirServicoNoGuiche,
  fecharDiaDeAtendimento,
  ofertaDoGuiche,
  publicarJanelaDeAtendimento,
  reagendarReservaDeAtendimento,
  registrarAtendimentoRealizado,
  reservarAtendimento,
  chaveDoHorario,
} from "./servico-guiche.js";

/** Uma pausa real — o teste do trinco precisa medir que algo NÃO andou. */
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * ═══ M21 — A AGENDA DO GUICHÊ (V11 V8), CONTRA BANCO ═══
 *
 * ⚠️ MARCAR ATENDIMENTO É CONSUMO DE SALDO, e é por isso que este arquivo parece um teste de
 * empenho e não um teste de cadastro. Cada horário tem capacidade; capacidade se estoura
 * exatamente como saldo de ficha — duas pessoas leem "há um lugar", as duas gravam, e três
 * aparecem para dois lugares.
 *
 * FIXTURE N=2 onde a regra só se manifesta em conjunto: DUAS reservas no mesmo horário, DUAS
 * transações concorrentes no ÚLTIMO lugar, DOIS guichês, DOIS reagendamentos encadeados.
 *
 * O que este arquivo existe para impedir:
 *  · que a capacidade seja estourada por concorrência (t5 — e é a razão do trinco);
 *  · que se ofereça horário que o ente não configurou (t1) ou que não cabe na janela;
 *  · que a contagem olhe o horário ORIGINAL em vez do VIGENTE, prendendo lugares para sempre (t11);
 *  · que reagendar seja a porta dos fundos para furar a capacidade (t12);
 *  · que se feche um dia por cima de gente marcada (t15);
 *  · que duas ofertas se sobreponham e deem duas capacidades ao mesmo minuto (t16);
 *  · que quem não tem a ação consiga marcar (t18).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const CHEFIA = "chefia.protocolo@cg.pb.gov.br";
const BALCAO = "balcao@cg.pb.gov.br";
const ATENDENTE = "atendente@cg.pb.gov.br";
const SEM_CRACHA = "so.le@cg.pb.gov.br";

/** 2026-09-21 é uma SEGUNDA-FEIRA; 2026-09-22, terça. */
const SEGUNDA = "2026-09-21";
const TERCA = "2026-09-22";
const SEGUNDA_SEGUINTE = "2026-09-28";

let unidadeId = "";
let guicheA = "";
let guicheB = "";
let servicoId = "";
let outroServicoId = "";
let pessoa1 = "";
let pessoa2 = "";
let pessoa3 = "";

async function usuarioComPerfil(identificador: string, perfil: string, acoes: readonly string[]): Promise<void> {
  const p = await prisma.perfil.create({
    data: {
      nome: perfil,
      descricao: perfil,
      criadoPor: "SEED",
      permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({
    data: { identificador, nome: identificador, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

async function pessoa(documento: string, nome: string): Promise<string> {
  return (
    await prisma.pessoa.create({
      data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome, criadoPor: "SEED" } } },
      select: { id: true },
    })
  ).id;
}

/** Uma janela padrão de segunda: 08:00–10:00, 30 min, a capacidade que o caso pedir. */
async function janelaDeSegunda(guicheId: string, capacidade: number, horas: [string, string] = ["08:00", "10:00"]) {
  return publicarJanelaDeAtendimento(prisma, {
    guicheId,
    diaDaSemana: 1,
    horaInicio: horas[0],
    horaFim: horas[1],
    duracaoMinutos: 30,
    capacidade,
    vigenciaInicio: "2026-01-01",
    criadoPor: CHEFIA,
  });
}

let chave = 0;
/** Reserva com chave de idempotência NOVA a cada chamada — duas intenções são duas reservas. */
async function reservar(p: {
  guicheId?: string;
  pessoaId: string;
  dia?: string;
  hora?: string;
  servico?: string;
  por?: string;
  chaveDeIdempotencia?: string;
}) {
  chave += 1;
  return reservarAtendimento(prisma, {
    guicheId: p.guicheId ?? guicheA,
    servicoId: p.servico ?? servicoId,
    pessoaId: p.pessoaId,
    dia: p.dia ?? SEGUNDA,
    horaInicio: p.hora ?? "08:00",
    chaveDeIdempotencia: p.chaveDeIdempotencia ?? `intencao-${chave}`,
    criadoPor: p.por ?? BALCAO,
  });
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "g-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "g-uo", codigo: "01001", descricao: "Administração", orgaoId: "g-org" },
  });
  await prisma.setor.create({
    data: { id: "g-setor", codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "g-uo", criadoPor: "SEED" },
  });
  const assuntoId = (
    await prisma.assunto.create({
      data: {
        codigo: "REQ",
        nome: "Requerimento geral",
        criadoPor: "SEED",
        roteiro: { create: [{ ordem: 1, setorId: "g-setor", prazoDias: 3, descricao: "Triagem", criadoPor: "SEED" }] },
      },
      select: { id: true },
    })
  ).id;

  await usuarioComPerfil(CHEFIA, "CHEFIA_DO_PROTOCOLO", ["CONFIGURAR_AGENDA_DO_GUICHE", "CONFIGURAR_CARTA_DE_SERVICOS"]);
  await usuarioComPerfil(BALCAO, "BALCAO", ["RESERVAR_ATENDIMENTO_NO_GUICHE"]);
  await usuarioComPerfil(ATENDENTE, "ATENDENTE_DO_GUICHE", ["REGISTRAR_ATENDIMENTO_NO_GUICHE"]);
  await usuarioComPerfil(SEM_CRACHA, "SO_LE_O_PROTOCOLO", ["CONSULTAR_PROTOCOLO"]);

  pessoa1 = await pessoa("11144477735", "Ana Cidadã");
  pessoa2 = await pessoa("52998224725", "Bia Cidadã");
  pessoa3 = await pessoa("39053344705", "Caio Cidadão");

  servicoId = (
    await cadastrarServicoDaCarta(prisma, {
      slug: "segunda-via-de-iptu",
      titulo: "Segunda via de IPTU",
      categoria: "Tributos",
      publico: "CIDADAO",
      tipo: "REQUERIMENTO_ADMINISTRATIVO",
      assuntoId,
      criadoPor: CHEFIA,
    })
  ).servicoId;
  outroServicoId = (
    await cadastrarServicoDaCarta(prisma, {
      slug: "alvara-de-funcionamento",
      titulo: "Alvará de funcionamento",
      categoria: "Licenças",
      publico: "CIDADAO",
      tipo: "REQUERIMENTO_ADMINISTRATIVO",
      assuntoId,
      criadoPor: CHEFIA,
    })
  ).servicoId;

  unidadeId = (
    await criarUnidadeDeAtendimento(prisma, {
      codigo: "SEDE",
      nome: "Sede da Prefeitura",
      endereco: "Praça Central, 1 - Centro",
      setorId: "g-setor",
      criadoPor: CHEFIA,
    })
  ).unidadeId;
  guicheA = (await criarGuiche(prisma, { unidadeId, nome: "Guichê 1", criadoPor: CHEFIA })).guicheId;
  guicheB = (await criarGuiche(prisma, { unidadeId, nome: "Guichê 2", criadoPor: CHEFIA })).guicheId;

  for (const g of [guicheA, guicheB]) {
    await definirServicoNoGuiche(prisma, { guicheId: g, servicoId, habilitado: true, criadoPor: CHEFIA });
  }
}

beforeEach(semear, 120_000);

describe("a oferta de horários", () => {
  it("t1: sem janela publicada o guichê não oferece NADA — e não há expediente padrão", async () => {
    const oferta = await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA });
    expect(oferta.horarios).toEqual([]);
    expect(oferta.fechado).toBeNull();

    // ⚠️ E A RECUSA DIZ ISSO COM TODAS AS LETRAS. Se o sistema "assumisse" 8h–17h, marcaria
    // gente para uma porta que o ente nunca disse que abre.
    await expect(reservar({ pessoaId: pessoa1 })).rejects.toThrow(
      /não tem horário publicado[\s\S]*Não existe\s+expediente padrão/
    );
    expect(await prisma.reservaDeAtendimento.count()).toBe(0);
  });

  it("t2: a oferta sai da JANELA, e o último horário tem de caber inteiro", async () => {
    const { horariosOfertados } = await janelaDeSegunda(guicheA, 2);
    expect(horariosOfertados).toBe(4);

    const oferta = await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA });
    expect(oferta.horarios.map((h) => h.hora)).toEqual(["08:00", "08:30", "09:00", "09:30"]);
    expect(oferta.horarios[0]).toEqual({ hora: "08:00", capacidade: 2, ocupadas: 0, livres: 2 });
  });

  it("t3: a oferta é do DIA DA SEMANA da janela — terça não herda a segunda", async () => {
    await janelaDeSegunda(guicheA, 2);
    expect((await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: TERCA })).horarios).toEqual([]);
    expect((await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA_SEGUINTE })).horarios.length).toBe(4);
  });

  it("t4: horário fora da oferta é recusado LISTANDO os que existem", async () => {
    await janelaDeSegunda(guicheA, 2);
    await expect(reservar({ pessoaId: pessoa1, hora: "11:00" })).rejects.toThrow(
      /11:00 não é um horário[\s\S]*Oferecidos: 08:00, 08:30, 09:00, 09:30/
    );
    expect(await prisma.reservaDeAtendimento.count()).toBe(0);
  });
});

describe("a capacidade — o saldo do horário", () => {
  it("t5: N=2 cabem quando a capacidade é 2, e a TERCEIRA é recusada nomeando o número", async () => {
    await janelaDeSegunda(guicheA, 2);
    await reservar({ pessoaId: pessoa1 });
    await reservar({ pessoaId: pessoa2 });

    await expect(reservar({ pessoaId: pessoa3 })).rejects.toThrow(
      /08:00 de 21\/09\/2026 está lotado[\s\S]*2 de 2 lugar\(es\) ocupado\(s\)/
    );
    expect(await prisma.reservaDeAtendimento.count()).toBe(2);

    // A oferta enxerga o mesmo que o guard recusou — nenhuma segunda aritmética.
    const oferta = await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA });
    expect(oferta.horarios[0]).toEqual({ hora: "08:00", capacidade: 2, ocupadas: 2, livres: 0 });
  });

  it("t6: a reserva ESPERA o trinco do lugar — e é esta espera que impede o estouro", async () => {
    await janelaDeSegunda(guicheA, 1);

    // ═══ ⚠️ POR QUE ESTE TESTE NÃO É UM `Promise.allSettled` DE DUAS RESERVAS ═══
    // Ele foi escrito assim primeiro, passou, e passou TAMBÉM com o trinco REMOVIDO do caso de
    // uso — três corridas seguidas. Duas transações disparadas juntas não se cruzam de forma
    // confiável: a primeira commita antes de a segunda ler, e o teste ficava verde por acidente,
    // provando nada. Um instrumento que não acusa é pior do que nenhum.
    //
    // O que se afirma aqui é a PROPRIEDADE que o trinco tem de ter: enquanto alguém segura o
    // trinco DAQUELE lugar, a reserva daquele lugar NÃO ANDA. É determinístico, usa o caminho de
    // produção inteiro, e cai no instante em que o `travar` sair de lá.
    const outro = criarPrismaDeTeste();
    let liberar: () => void = () => undefined;
    const soltar = new Promise<void>((r) => {
      liberar = r;
    });

    const segurando = outro.$transaction(
      async (tx) => {
        await travar(tx, "HorarioDeGuiche", [chaveDoHorario(guicheA, meioDiaCivil(SEGUNDA), "08:00")]);
        await soltar;
      },
      { timeout: 20_000, maxWait: 10_000 }
    );

    try {
      await esperar(300); // o tempo de a outra transação tomar o trinco

      let concluiu = false;
      const tentativa = reservar({ pessoaId: pessoa1 }).then((v) => {
        concluiu = true;
        return v;
      });

      await esperar(700);
      // ⚠️ A AFIRMAÇÃO: a reserva está PARADA, esperando o lugar. Sem o trinco, ela já teria
      // contado "0 de 1", decidido que cabe, e gravado.
      expect(concluiu).toBe(false);
      expect(await prisma.reservaDeAtendimento.count()).toBe(0);

      liberar();
      await segurando;

      // Solto o trinco, ela anda — e grava.
      await tentativa;
      expect(concluiu).toBe(true);
      expect(await prisma.reservaDeAtendimento.count()).toBe(1);
    } finally {
      liberar();
      await segurando.catch(() => undefined);
      await outro.$disconnect();
    }
  });

  it("t6b: e o trinco é do LUGAR, não do guichê inteiro — outro horário não espera", async () => {
    await janelaDeSegunda(guicheA, 1);

    // ⚠️ A CONTRAPROVA. Um trinco grande demais (o guichê, ou o dia) passaria no t6 e serializaria
    // o balcão inteiro: duas pessoas marcando horários diferentes ficariam em fila uma pela outra.
    const outro = criarPrismaDeTeste();
    let liberar: () => void = () => undefined;
    const soltar = new Promise<void>((r) => {
      liberar = r;
    });
    const segurando = outro.$transaction(
      async (tx) => {
        await travar(tx, "HorarioDeGuiche", [chaveDoHorario(guicheA, meioDiaCivil(SEGUNDA), "08:00")]);
        await soltar;
      },
      { timeout: 20_000, maxWait: 10_000 }
    );

    try {
      await esperar(300);
      // 09:00 é outro lugar: passa sem esperar ninguém.
      const r = await reservar({ pessoaId: pessoa2, hora: "09:00" });
      expect(r.jaExistia).toBe(false);
      expect(await prisma.reservaDeAtendimento.count()).toBe(1);
    } finally {
      liberar();
      await segurando.catch(() => undefined);
      await outro.$disconnect();
    }
  });

  it("t7: CANCELAR devolve o lugar — e só o cancelamento devolve", async () => {
    await janelaDeSegunda(guicheA, 1);
    const primeira = await reservar({ pessoaId: pessoa1 });

    await expect(reservar({ pessoaId: pessoa2 })).rejects.toThrow(/está lotado/);

    // Confirmar NÃO devolve lugar nenhum — quem marcou continua ocupando.
    await confirmarReservaDeAtendimento(prisma, { reservaId: primeira.reservaId, criadoPor: ATENDENTE });
    await expect(reservar({ pessoaId: pessoa2 })).rejects.toThrow(/está lotado/);

    await cancelarReservaDeAtendimento(prisma, {
      reservaId: primeira.reservaId,
      motivo: "A cidadã avisou que não poderá comparecer.",
      criadoPor: BALCAO,
    });
    const segunda = await reservar({ pessoaId: pessoa2 });
    expect(segunda.jaExistia).toBe(false);
    expect((await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA })).horarios[0]?.ocupadas).toBe(1);
  });
});

describe("a idempotência", () => {
  it("t8: a MESMA chave duas vezes é UMA reserva, com o MESMO código", async () => {
    await janelaDeSegunda(guicheA, 2);
    const a = await reservar({ pessoaId: pessoa1, chaveDeIdempotencia: "dois-cliques" });
    const b = await reservar({ pessoaId: pessoa1, chaveDeIdempotencia: "dois-cliques" });

    expect(b.reservaId).toBe(a.reservaId);
    expect(b.codigo).toBe(a.codigo);
    expect(a.jaExistia).toBe(false);
    expect(b.jaExistia).toBe(true);
    expect(await prisma.reservaDeAtendimento.count()).toBe(1);
  });

  it("t9: chaves DIFERENTES são intenções diferentes — duas reservas, dois códigos", async () => {
    await janelaDeSegunda(guicheA, 2);
    const a = await reservar({ pessoaId: pessoa1, chaveDeIdempotencia: "intencao-1" });
    const b = await reservar({ pessoaId: pessoa1, chaveDeIdempotencia: "intencao-2" });
    expect(b.reservaId).not.toBe(a.reservaId);
    expect(b.codigo).not.toBe(a.codigo);
    expect(await prisma.reservaDeAtendimento.count()).toBe(2);
  });
});

describe("o que o guichê atende, e quando a unidade abre", () => {
  it("t10: serviço não habilitado NESTE guichê é recusado nomeando o serviço", async () => {
    await janelaDeSegunda(guicheA, 2);
    await expect(reservar({ pessoaId: pessoa1, servico: outroServicoId })).rejects.toThrow(
      /não atende "Alvará de funcionamento"/
    );
    expect(await prisma.reservaDeAtendimento.count()).toBe(0);

    // Habilitado, passa. E DESABILITAR depois não apaga o que já foi marcado.
    await definirServicoNoGuiche(prisma, { guicheId: guicheA, servicoId: outroServicoId, habilitado: true, criadoPor: CHEFIA });
    const r = await reservar({ pessoaId: pessoa1, servico: outroServicoId });
    await definirServicoNoGuiche(prisma, {
      guicheId: guicheA, servicoId: outroServicoId, habilitado: false,
      motivo: "O alvará passou a ser atendido na Secretaria de Finanças.", criadoPor: CHEFIA,
    });
    expect(await prisma.reservaDeAtendimento.count({ where: { id: r.reservaId } })).toBe(1);
    await expect(reservar({ pessoaId: pessoa2, servico: outroServicoId })).rejects.toThrow(/não atende/);
  });

  it("t10b: repetir a MESMA situação do serviço é recusado — não é fato novo", async () => {
    await expect(
      definirServicoNoGuiche(prisma, { guicheId: guicheA, servicoId, habilitado: true, criadoPor: CHEFIA })
    ).rejects.toThrow(/já está HABILITADO/);
  });

  it("t11: dia FECHADO recusa a reserva com o MOTIVO, e a oferta devolve o motivo em vez de lista vazia", async () => {
    await janelaDeSegunda(guicheA, 2);
    await fecharDiaDeAtendimento(prisma, {
      unidadeId, dia: SEGUNDA, motivo: "Feriado municipal - padroeira da cidade", criadoPor: CHEFIA,
    });

    await expect(reservar({ pessoaId: pessoa1 })).rejects.toThrow(
      /não abre em 21\/09\/2026: Feriado municipal - padroeira da cidade/
    );
    const oferta = await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA });
    expect(oferta.fechado?.motivo).toBe("Feriado municipal - padroeira da cidade");
    expect(oferta.horarios).toEqual([]);
  });

  it("t12: fechar um dia com gente MARCADA é recusado nomeando quantas", async () => {
    await janelaDeSegunda(guicheA, 2);
    await reservar({ pessoaId: pessoa1 });
    await reservar({ pessoaId: pessoa2, hora: "08:30" });

    await expect(
      fecharDiaDeAtendimento(prisma, { unidadeId, dia: SEGUNDA, motivo: "Ponto facultativo", criadoPor: CHEFIA })
    ).rejects.toThrow(/2 reserva\(s\) viva\(s\) em 21\/09\/2026[\s\S]*prédio fechado/);
    expect(await prisma.excecaoDeCalendarioDoAtendimento.count()).toBe(0);
  });
});

describe("o reagendamento", () => {
  it("t13: a ocupação segue o horário VIGENTE — o de origem é LIBERADO, o de destino é tomado", async () => {
    await janelaDeSegunda(guicheA, 1);
    const r = await reservar({ pessoaId: pessoa1, hora: "08:00" });

    await reagendarReservaDeAtendimento(prisma, {
      reservaId: r.reservaId, guicheId: guicheA, dia: SEGUNDA, horaInicio: "09:00",
      motivo: "A cidadã pediu mais tarde.", criadoPor: BALCAO,
    });

    const oferta = await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA });
    const por = new Map(oferta.horarios.map((h) => [h.hora, h.ocupadas]));
    // ⚠️ SE A CONTAGEM OLHASSE O CAMPO ORIGINAL, as 08:00 ficariam presas para sempre e as
    // 09:00 apareceriam livres com gente marcada nelas.
    expect(por.get("08:00")).toBe(0);
    expect(por.get("09:00")).toBe(1);

    // E as 08:00 aceitam outra pessoa, porque estão mesmo livres.
    await reservar({ pessoaId: pessoa2, hora: "08:00" });
    expect((await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA })).horarios[0]?.ocupadas).toBe(1);
  });

  it("t14: reagendar CONFERE a capacidade do destino — a porta dos fundos está fechada", async () => {
    await janelaDeSegunda(guicheA, 1);
    const r1 = await reservar({ pessoaId: pessoa1, hora: "08:00" });
    await reservar({ pessoaId: pessoa2, hora: "09:00" });

    await expect(
      reagendarReservaDeAtendimento(prisma, {
        reservaId: r1.reservaId, guicheId: guicheA, dia: SEGUNDA, horaInicio: "09:00",
        motivo: "Tentativa de empurrar para um horário cheio.", criadoPor: BALCAO,
      })
    ).rejects.toThrow(/09:00 de 21\/09\/2026 está lotado[\s\S]*1 de 1 lugar/);
    expect(await prisma.reagendamentoDaReserva.count()).toBe(0);
  });

  it("t15: reagendamentos encadeados ganham SEQUÊNCIA 1, 2 — e o vigente é o de maior sequência", async () => {
    await janelaDeSegunda(guicheA, 2);
    await janelaDeSegunda(guicheB, 2);
    const r = await reservar({ pessoaId: pessoa1, hora: "08:00" });

    const um = await reagendarReservaDeAtendimento(prisma, {
      reservaId: r.reservaId, guicheId: guicheA, dia: SEGUNDA, horaInicio: "08:30",
      motivo: "Primeiro adiamento.", criadoPor: BALCAO,
    });
    const dois = await reagendarReservaDeAtendimento(prisma, {
      reservaId: r.reservaId, guicheId: guicheB, dia: SEGUNDA, horaInicio: "09:00",
      motivo: "Mudou de guichê: a mesa 1 está em manutenção.", criadoPor: BALCAO,
    });
    expect(um.sequencia).toBe(1);
    expect(dois.sequencia).toBe(2);

    // O vigente é no guichê B às 09:00; o A não tem mais ninguém.
    expect((await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA })).horarios.every((h) => h.ocupadas === 0)).toBe(true);
    const ofertaB = new Map((await ofertaDoGuiche(prisma, { guicheId: guicheB, dia: SEGUNDA })).horarios.map((h) => [h.hora, h.ocupadas]));
    expect(ofertaB.get("09:00")).toBe(1);

    // ⚠️ E O HISTÓRICO CONTINUA LEGÍVEL: os dois reagendamentos estão lá, com os motivos.
    const historico = await prisma.reagendamentoDaReserva.findMany({
      where: { reservaId: r.reservaId }, orderBy: { sequencia: "asc" }, select: { horaInicio: true, motivo: true },
    });
    expect(historico.map((h) => h.horaInicio)).toEqual(["08:30", "09:00"]);
  });

  it("t16: remarcar para o MESMO lugar é recusado — não é fato novo", async () => {
    await janelaDeSegunda(guicheA, 2);
    const r = await reservar({ pessoaId: pessoa1, hora: "08:00" });
    await expect(
      reagendarReservaDeAtendimento(prisma, {
        reservaId: r.reservaId, guicheId: guicheA, dia: SEGUNDA, horaInicio: "08:00",
        motivo: "Sem mudança nenhuma.", criadoPor: BALCAO,
      })
    ).rejects.toThrow(/já está em 21\/09\/2026 às 08:00/);
  });
});

describe("os fatos que fecham a reserva", () => {
  it("t17: cancelada não se confirma, não se remarca e não se atende — cada recusa diz o motivo", async () => {
    await janelaDeSegunda(guicheA, 2);
    const r = await reservar({ pessoaId: pessoa1 });
    await cancelarReservaDeAtendimento(prisma, {
      reservaId: r.reservaId, motivo: "Duplicidade de marcação.", criadoPor: BALCAO,
    });

    await expect(confirmarReservaDeAtendimento(prisma, { reservaId: r.reservaId, criadoPor: ATENDENTE })).rejects.toThrow(
      /foi CANCELADA \(Duplicidade de marcação\.\)/
    );
    await expect(
      registrarAtendimentoRealizado(prisma, { reservaId: r.reservaId, atendidoPor: "Servidora do guichê", criadoPor: ATENDENTE })
    ).rejects.toThrow(/foi CANCELADA/);
    await expect(
      reagendarReservaDeAtendimento(prisma, {
        reservaId: r.reservaId, guicheId: guicheA, dia: SEGUNDA, horaInicio: "09:00", motivo: "Tentativa.", criadoPor: BALCAO,
      })
    ).rejects.toThrow(/foi CANCELADA/);
    await expect(
      cancelarReservaDeAtendimento(prisma, { reservaId: r.reservaId, motivo: "De novo.", criadoPor: BALCAO })
    ).rejects.toThrow(/já foi cancelada/);
  });

  it("t18: ATENDIDA não se cancela — apagar um atendimento devolveria um lugar que foi ocupado", async () => {
    await janelaDeSegunda(guicheA, 2);
    const r = await reservar({ pessoaId: pessoa1 });
    await confirmarReservaDeAtendimento(prisma, { reservaId: r.reservaId, criadoPor: ATENDENTE });
    await registrarAtendimentoRealizado(prisma, {
      reservaId: r.reservaId, atendidoPor: "Servidora do guichê", observacao: "Entregue a segunda via.", criadoPor: ATENDENTE,
    });

    await expect(
      cancelarReservaDeAtendimento(prisma, { reservaId: r.reservaId, motivo: "Tentativa de apagar.", criadoPor: BALCAO })
    ).rejects.toThrow(/já foi ATENDIDA[\s\S]*apagaria um atendimento que aconteceu/);
    await expect(
      registrarAtendimentoRealizado(prisma, { reservaId: r.reservaId, atendidoPor: "Outra pessoa", criadoPor: ATENDENTE })
    ).rejects.toThrow(/já foi registrado/);
    await expect(confirmarReservaDeAtendimento(prisma, { reservaId: r.reservaId, criadoPor: ATENDENTE })).rejects.toThrow(
      /já está confirmada/
    );
  });
});

describe("a publicação da oferta", () => {
  it("t19: janela SOBREPOSTA no mesmo dia da semana é recusada nomeando a que já existe", async () => {
    await janelaDeSegunda(guicheA, 2, ["08:00", "12:00"]);
    await expect(janelaDeSegunda(guicheA, 3, ["11:00", "15:00"])).rejects.toThrow(
      /se sobrepõe à janela 08:00–12:00[\s\S]*duas capacidades para o mesmo lugar/
    );
    expect(await prisma.janelaDeAtendimento.count()).toBe(1);

    // ENCOSTAR não é sobrepor: 12:00–16:00 convive com 08:00–12:00.
    await janelaDeSegunda(guicheA, 3, ["12:00", "16:00"]);
    expect(await prisma.janelaDeAtendimento.count()).toBe(2);
  });

  it("t20: janela que não comporta NENHUM atendimento é recusada — ela esperaria marcação impossível", async () => {
    await expect(
      publicarJanelaDeAtendimento(prisma, {
        guicheId: guicheA, diaDaSemana: 1, horaInicio: "08:00", horaFim: "08:20",
        duracaoMinutos: 30, capacidade: 2, vigenciaInicio: "2026-01-01", criadoPor: CHEFIA,
      })
    ).rejects.toThrow(/não comporta nenhum atendimento de 30 minutos/);
    expect(await prisma.janelaDeAtendimento.count()).toBe(0);
  });

  it("t21: a mesma faixa em vigências que NÃO se cruzam é troca de oferta, e passa", async () => {
    await publicarJanelaDeAtendimento(prisma, {
      guicheId: guicheA, diaDaSemana: 1, horaInicio: "08:00", horaFim: "10:00", duracaoMinutos: 30,
      capacidade: 2, vigenciaInicio: "2026-01-01", vigenciaFim: "2026-02-28", criadoPor: CHEFIA,
    });
    await publicarJanelaDeAtendimento(prisma, {
      guicheId: guicheA, diaDaSemana: 1, horaInicio: "08:00", horaFim: "10:00", duracaoMinutos: 30,
      capacidade: 5, vigenciaInicio: "2026-03-01", criadoPor: CHEFIA,
    });
    expect(await prisma.janelaDeAtendimento.count()).toBe(2);
    // Em setembro vale a NOVA: capacidade 5.
    expect((await ofertaDoGuiche(prisma, { guicheId: guicheA, dia: SEGUNDA })).horarios[0]?.capacidade).toBe(5);
  });
});

describe("a autorização", () => {
  it("t22: quem só LÊ o protocolo não marca, não organiza e não registra — cada recusa NOMEIA a ação", async () => {
    await janelaDeSegunda(guicheA, 2);

    await expect(reservar({ pessoaId: pessoa1, por: SEM_CRACHA })).rejects.toThrow(
      /RESERVAR_ATENDIMENTO_NO_GUICHE/
    );
    await expect(
      criarGuiche(prisma, { unidadeId, nome: "Guichê 3", criadoPor: SEM_CRACHA })
    ).rejects.toThrow(/CONFIGURAR_AGENDA_DO_GUICHE/);

    const r = await reservar({ pessoaId: pessoa1 });
    await expect(
      registrarAtendimentoRealizado(prisma, { reservaId: r.reservaId, atendidoPor: "Alguém", criadoPor: SEM_CRACHA })
    ).rejects.toThrow(/REGISTRAR_ATENDIMENTO_NO_GUICHE/);

    expect(await prisma.guicheDeAtendimento.count()).toBe(2);
    expect(await prisma.realizacaoDoAtendimento.count()).toBe(0);
  });

  it("t23: quem MARCA não é quem CONFIRMA — o crachá do balcão não abre o do guichê", async () => {
    await janelaDeSegunda(guicheA, 2);
    const r = await reservar({ pessoaId: pessoa1 });

    // ⚠️ A SEGREGAÇÃO AFIRMADA NOS DOIS SENTIDOS: o balcão não confirma…
    await expect(confirmarReservaDeAtendimento(prisma, { reservaId: r.reservaId, criadoPor: BALCAO })).rejects.toThrow(
      /REGISTRAR_ATENDIMENTO_NO_GUICHE/
    );
    // …e quem atende não marca.
    await expect(reservar({ pessoaId: pessoa2, por: ATENDENTE })).rejects.toThrow(
      /RESERVAR_ATENDIMENTO_NO_GUICHE/
    );
    expect(await prisma.confirmacaoDaReserva.count()).toBe(0);
  });
});
