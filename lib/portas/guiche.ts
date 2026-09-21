import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";
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
  type OfertaDoGuiche,
} from "../../modules/m21-protocolo/servico-guiche.js";
import { cliente } from "./cliente";
import { exigirLeituraEmAlgumEscopo } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ A AGENDA DO GUICHÊ NA TELA (V11 V8, TR 5.39.92) ═══
 *
 * ⚠️ A LEITURA É A DA ÁREA (`CONSULTAR_PROTOCOLO`), e as escritas passam pelo funil único
 * (`comEscritaAutenticada`), que resolve identidade, licenciamento, permissão e escopo. Nenhuma
 * regra de negócio mora aqui: capacidade, oferta, dia fechado e os estados da reserva são do
 * domínio, conferidos DENTRO da transação.
 *
 * ⚠️ A PESSOA ENTRA PELO DOCUMENTO, NÃO POR UM SELECT. Listar o cadastro de pessoas numa tela de
 * balcão despejaria o registro de cidadãos do município inteiro num `<select>` — e um select com
 * quinhentos itens é um formulário bonito e inútil, além de expor nome e documento de quem nunca
 * pediu nada. Quem atende digita o CPF/CNPJ de quem está na frente dele, e o servidor resolve.
 */

export interface GuicheNaTela {
  readonly id: string;
  readonly nome: string;
  readonly servicos: readonly { readonly id: string; readonly titulo: string; readonly agendamentoPublico: boolean }[];
  readonly janelas: readonly {
    readonly id: string;
    readonly diaDaSemana: number;
    readonly horaInicio: string;
    readonly horaFim: string;
    readonly duracaoMinutos: number;
    readonly capacidade: number;
    readonly vigenciaInicio: string;
    readonly vigenciaFim: string | null;
  }[];
}

export interface UnidadeNaTela {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly endereco: string;
  readonly setorNome: string;
  readonly guiches: readonly GuicheNaTela[];
  readonly diasFechados: readonly { readonly dia: string; readonly motivo: string }[];
}

/** As unidades com os guichês, a oferta publicada e os dias fechados — a tela de organização. */
export async function lerUnidadesDeAtendimento(): Promise<readonly UnidadeNaTela[]> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  const prisma = cliente();

  const unidades = await prisma.unidadeDeAtendimento.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true, codigo: true, nome: true, endereco: true,
      setor: { select: { nome: true } },
      excecoes: { orderBy: { dia: "asc" }, select: { dia: true, motivo: true } },
      guiches: {
        orderBy: { nome: "asc" },
        select: {
          id: true, nome: true,
          janelas: {
            orderBy: [{ diaDaSemana: "asc" }, { horaInicio: "asc" }],
            select: {
              id: true, diaDaSemana: true, horaInicio: true, horaFim: true,
              duracaoMinutos: true, capacidade: true, vigenciaInicio: true, vigenciaFim: true,
            },
          },
          servicos: {
            orderBy: { criadoEm: "asc" },
            select: { servicoId: true, habilitado: true, agendamentoPublico: true, servico: { select: { titulo: true } } },
          },
        },
      },
    },
  });

  return unidades.map((u) => ({
    id: u.id, codigo: u.codigo, nome: u.nome, endereco: u.endereco, setorNome: u.setor.nome,
    diasFechados: u.excecoes.map((e) => ({ dia: diaCivil(e.dia), motivo: e.motivo })),
    guiches: u.guiches.map((g) => {
      // ⚠️ O VIGENTE É O ÚLTIMO FATO de cada serviço — a tabela é append-only, e a lista traz a
      // habilitação e a desabilitação. Mostrar todas as linhas exibiria como "atendido" um
      // serviço que o guichê deixou de atender.
      const porServico = new Map<string, { titulo: string; habilitado: boolean; publico: boolean }>();
      for (const s of g.servicos) {
        porServico.set(s.servicoId, { titulo: s.servico.titulo, habilitado: s.habilitado, publico: s.agendamentoPublico });
      }
      return {
        id: g.id,
        nome: g.nome,
        servicos: [...porServico.entries()]
          .filter(([, v]) => v.habilitado)
          .map(([id, v]) => ({ id, titulo: v.titulo, agendamentoPublico: v.publico }))
          .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR")),
        janelas: g.janelas.map((j) => ({
          ...j,
          vigenciaInicio: diaCivil(j.vigenciaInicio),
          vigenciaFim: j.vigenciaFim === null ? null : diaCivil(j.vigenciaFim),
        })),
      };
    }),
  }));
}

export interface ReservaNaAgenda {
  readonly id: string;
  readonly codigo: string;
  readonly hora: string;
  readonly servico: string;
  readonly pessoa: string;
  readonly documento: string;
  /** `true` quando a marcação veio do portal: nome e documento são DECLARADOS, não conferidos. */
  readonly pelaInternet: boolean;
  readonly situacao: "MARCADA" | "CONFIRMADA" | "ATENDIDA" | "CANCELADA";
  readonly motivoDoCancelamento: string | null;
  readonly reagendamentos: number;
}

export interface AgendaDoDia {
  readonly guicheId: string;
  readonly guicheNome: string;
  readonly unidadeNome: string;
  readonly dia: string;
  readonly oferta: OfertaDoGuiche;
  readonly reservas: readonly ReservaNaAgenda[];
  readonly servicosAtendidos: readonly { readonly id: string; readonly titulo: string }[];
}

/**
 * A AGENDA DE UM DIA num guichê: a oferta (com vagas) e quem está marcado.
 *
 * ⚠️ AS RESERVAS SÃO AS DO HORÁRIO VIGENTE — as que saíram daqui por reagendamento não aparecem,
 * e as que vieram de outro lugar aparecem. É a mesma regra que a contagem de capacidade usa.
 */
export async function lerAgendaDoDia(p: {
  readonly guicheId: string;
  readonly dia: string;
}): Promise<AgendaDoDia | null> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  const prisma = cliente();

  const guiche = await prisma.guicheDeAtendimento.findUnique({
    where: { id: p.guicheId },
    select: {
      id: true, nome: true, unidade: { select: { nome: true } },
      servicos: { orderBy: { criadoEm: "asc" }, select: { servicoId: true, habilitado: true, servico: { select: { titulo: true } } } },
    },
  });
  if (guiche === null) return null;

  const oferta = await ofertaDoGuiche(prisma, { guicheId: p.guicheId, dia: p.dia });

  const candidatas = await prisma.reservaDeAtendimento.findMany({
    where: {
      OR: [
        // ⚠️ IGUALDADE, NÃO FAIXA. A coluna guarda o MEIO-DIA CIVIL do ente (`meioDiaCivil`),
        // que é a âncora do dia; montar uma faixa com literal "Z" traria de volta o fuso que a
        // âncora existe para eliminar — e é o que o guard de data civil acusa.
        { guicheId: p.guicheId, dia: meioDiaCivil(p.dia) },
        { reagendamentos: { some: { guicheId: p.guicheId } } },
      ],
    },
    select: {
      id: true, codigo: true, guicheId: true, dia: true, horaInicio: true,
      servico: { select: { titulo: true } },
      // ⚠️ AS DUAS FORMAS DE TITULAR. Quem marcou pelo BALCÃO está no cadastro; quem marcou pelo
      // PORTAL declarou nome e documento e não tem `Pessoa` — ver `ck_reserva_titular_xor`. A
      // agenda de quem atende precisa das duas, ou metade das pessoas do dia sumiria da tela.
      nomeDeclarado: true,
      documentoDeclarado: true,
      pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } },
      confirmacao: { select: { id: true } },
      cancelamento: { select: { motivo: true } },
      realizacao: { select: { id: true } },
      reagendamentos: { orderBy: { sequencia: "desc" }, select: { guicheId: true, dia: true, horaInicio: true } },
    },
  });

  const reservas: ReservaNaAgenda[] = [];
  for (const r of candidatas) {
    const ultimo = r.reagendamentos[0];
    const vigente = ultimo ?? { guicheId: r.guicheId, dia: r.dia, horaInicio: r.horaInicio };
    if (vigente.guicheId !== p.guicheId || diaCivil(vigente.dia) !== p.dia) continue;
    reservas.push({
      id: r.id,
      codigo: r.codigo,
      hora: vigente.horaInicio,
      servico: r.servico.titulo,
      pessoa: r.pessoa === null ? (r.nomeDeclarado ?? "") : (r.pessoa.versoes[0]?.nome ?? "(sem nome na versão vigente)"),
      documento: r.pessoa === null ? (r.documentoDeclarado ?? "") : r.pessoa.documento,
      // ⚠️ QUEM ATENDE PRECISA SABER DA ONDE VEIO. Uma marcação do portal traz nome e documento
      // DECLARADOS, não conferidos por ninguém: quem está no guichê tem de pedir o documento.
      // Uma do balcão já foi conferida por um servidor.
      pelaInternet: r.pessoa === null,
      situacao:
        r.cancelamento !== null ? "CANCELADA" : r.realizacao !== null ? "ATENDIDA" : r.confirmacao !== null ? "CONFIRMADA" : "MARCADA",
      motivoDoCancelamento: r.cancelamento?.motivo ?? null,
      reagendamentos: r.reagendamentos.length,
    });
  }
  reservas.sort((a, b) => (a.hora === b.hora ? a.pessoa.localeCompare(b.pessoa, "pt-BR") : a.hora < b.hora ? -1 : 1));

  const porServico = new Map<string, { titulo: string; habilitado: boolean }>();
  for (const s of guiche.servicos) porServico.set(s.servicoId, { titulo: s.servico.titulo, habilitado: s.habilitado });

  return {
    guicheId: guiche.id,
    guicheNome: guiche.nome,
    unidadeNome: guiche.unidade.nome,
    dia: p.dia,
    oferta,
    reservas,
    servicosAtendidos: [...porServico.entries()]
      .filter(([, v]) => v.habilitado)
      .map(([id, v]) => ({ id, titulo: v.titulo }))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR")),
  };
}

/** Os setores, para abrir uma unidade de atendimento. */
export async function lerSetoresParaAtendimento(): Promise<readonly { readonly id: string; readonly codigo: string; readonly nome: string }[]> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  return cliente().setor.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } });
}

/** Os serviços da carta, para dizer o que cada guichê atende. */
export async function lerServicosParaGuiche(): Promise<readonly { readonly id: string; readonly titulo: string }[]> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  return cliente().servicoDaCarta.findMany({ orderBy: { titulo: "asc" }, select: { id: true, titulo: true } });
}

// ═══════════════════════════════════════════════════════════════════════════
// OS ATOS
// ═══════════════════════════════════════════════════════════════════════════

export async function abrirUnidadeDeAtendimento(input: {
  readonly codigo: string; readonly nome: string; readonly endereco: string; readonly setorId: string;
}): Promise<string> {
  await comEscritaAutenticada("CONFIGURAR_AGENDA_DO_GUICHE", (criadoPor) =>
    criarUnidadeDeAtendimento(cliente(), { ...input, criadoPor })
  );
  return `Unidade de atendimento ${input.codigo} aberta.`;
}

export async function abrirGuiche(input: { readonly unidadeId: string; readonly nome: string }): Promise<string> {
  await comEscritaAutenticada("CONFIGURAR_AGENDA_DO_GUICHE", (criadoPor) =>
    criarGuiche(cliente(), { ...input, criadoPor })
  );
  return `Guichê "${input.nome}" criado. Ele ainda não atende serviço nenhum e não tem horário publicado.`;
}

export async function definirServicoDoGuiche(input: {
  readonly guicheId: string; readonly servicoId: string; readonly habilitado: boolean;
  readonly agendamentoPublico: boolean; readonly motivo?: string;
}): Promise<string> {
  await comEscritaAutenticada("CONFIGURAR_AGENDA_DO_GUICHE", (criadoPor) =>
    definirServicoNoGuiche(cliente(), {
      guicheId: input.guicheId, servicoId: input.servicoId, habilitado: input.habilitado,
      agendamentoPublico: input.agendamentoPublico, criadoPor,
      ...(input.motivo === undefined || input.motivo === "" ? {} : { motivo: input.motivo }),
    })
  );
  if (!input.habilitado) return "Serviço desabilitado neste guichê. As reservas já marcadas continuam valendo.";
  return input.agendamentoPublico
    ? "Serviço habilitado neste guichê, e ABERTO à marcação pelo portal do cidadão."
    : "Serviço habilitado neste guichê, atendido SÓ pelo balcão — o cidadão não o marca pela internet.";
}

export async function publicarOfertaDeHorarios(input: {
  readonly guicheId: string; readonly diaDaSemana: number; readonly horaInicio: string; readonly horaFim: string;
  readonly duracaoMinutos: number; readonly capacidade: number; readonly vigenciaInicio: string; readonly vigenciaFim: string | null;
}): Promise<string> {
  const r = await comEscritaAutenticada("CONFIGURAR_AGENDA_DO_GUICHE", (criadoPor) =>
    publicarJanelaDeAtendimento(cliente(), { ...input, criadoPor })
  );
  return `Oferta publicada: ${r.horariosOfertados} horário(s) por dia, ${input.capacidade} lugar(es) em cada.`;
}

export async function fecharDia(input: { readonly unidadeId: string; readonly dia: string; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("CONFIGURAR_AGENDA_DO_GUICHE", (criadoPor) =>
    fecharDiaDeAtendimento(cliente(), { ...input, criadoPor })
  );
  return `${input.dia.split("-").reverse().join("/")} fechado: ${input.motivo}.`;
}

/**
 * MARCA um atendimento para quem está no balcão.
 *
 * ⚠️ A PESSOA VEM PELO DOCUMENTO, e a resolução é do SERVIDOR. Se o documento não estiver no
 * cadastro, a recusa diz isso — e não cria uma pessoa em silêncio: um cadastro nascido de um
 * agendamento entraria sem nome, sem endereço e sem quem responde por ele.
 */
export async function marcarAtendimento(input: {
  readonly guicheId: string; readonly servicoId: string; readonly documento: string;
  readonly dia: string; readonly horaInicio: string; readonly chaveDeComando: string;
}): Promise<string> {
  const documento = input.documento.replace(/\D/g, "");
  const pessoa = await cliente().pessoa.findUnique({ where: { documento }, select: { id: true } });
  if (pessoa === null) {
    throw new Error(
      `Não há pessoa com o documento ${input.documento} no cadastro. Cadastre-a antes de marcar — ` +
        `uma pessoa criada aqui entraria sem nome e sem endereço. Nada foi reservado.`
    );
  }

  const r = await comEscritaAutenticada("RESERVAR_ATENDIMENTO_NO_GUICHE", (criadoPor) =>
    reservarAtendimento(cliente(), {
      guicheId: input.guicheId,
      servicoId: input.servicoId,
      pessoaId: pessoa.id,
      dia: input.dia,
      horaInicio: input.horaInicio,
      // ⚠️ O ESCOPO DENTRO DA CHAVE: a intenção é "esta pessoa, neste lugar, neste horário",
      // amarrada ao comando do formulário. Dois cliques no mesmo botão são uma reserva.
      chaveDeIdempotencia: `guiche:${input.chaveDeComando}`,
      criadoPor,
    })
  );
  // ⚠️ O CÓDIGO DE ACOMPANHAMENTO SAI UMA VEZ, para o atendente ENTREGAR (V11 V8.5). Sem ele, quem
  // foi atendido no balcão tinha de VOLTAR ao balcão para desmarcar — cortesia virando
  // deslocamento. Numa repetição da chave nada foi gravado, e o segredo da marcação original não é
  // relido de lugar nenhum: o banco guarda só o hash.
  return r.jaExistia
    ? `Esta marcação já tinha sido feita — código ${r.codigo}. Nada foi duplicado.`
    : `Atendimento marcado para ${input.dia.split("-").reverse().join("/")} às ${input.horaInicio}. ` +
      `Número de atendimento ${r.codigo}. ENTREGUE à pessoa o código de acompanhamento ` +
      `${r.segredo ?? ""} — é com ele que ela consulta e cancela pela internet, e ele não se recupera.`;
}

export async function confirmarPresenca(reservaId: string): Promise<string> {
  await comEscritaAutenticada("REGISTRAR_ATENDIMENTO_NO_GUICHE", (criadoPor) =>
    confirmarReservaDeAtendimento(cliente(), { reservaId, criadoPor })
  );
  return "Presença confirmada. A vaga continua ocupada — confirmar não libera lugar.";
}

export async function registrarAtendimento(input: {
  readonly reservaId: string; readonly atendidoPor: string; readonly observacao?: string;
}): Promise<string> {
  await comEscritaAutenticada("REGISTRAR_ATENDIMENTO_NO_GUICHE", (criadoPor) =>
    registrarAtendimentoRealizado(cliente(), {
      reservaId: input.reservaId, atendidoPor: input.atendidoPor, criadoPor,
      ...(input.observacao === undefined || input.observacao === "" ? {} : { observacao: input.observacao }),
    })
  );
  return "Atendimento registrado. A partir daqui a reserva não se cancela nem se remarca.";
}

export async function cancelarMarcacao(input: { readonly reservaId: string; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("RESERVAR_ATENDIMENTO_NO_GUICHE", (criadoPor) =>
    cancelarReservaDeAtendimento(cliente(), { ...input, criadoPor })
  );
  return "Marcação cancelada, com o motivo no histórico. O lugar voltou a ficar livre.";
}

export async function remarcarAtendimento(input: {
  readonly reservaId: string; readonly guicheId: string; readonly dia: string; readonly horaInicio: string; readonly motivo: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("RESERVAR_ATENDIMENTO_NO_GUICHE", (criadoPor) =>
    reagendarReservaDeAtendimento(cliente(), { ...input, criadoPor })
  );
  return (
    `Remarcado para ${input.dia.split("-").reverse().join("/")} às ${input.horaInicio} ` +
    `(remarcação nº ${r.sequencia}). O horário anterior e o motivo ficam no histórico.`
  );
}
