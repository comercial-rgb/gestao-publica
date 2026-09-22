"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  abrirGuiche,
  abrirUnidadeDeAtendimento,
  cancelarMarcacao,
  confirmarPresenca,
  definirServicoDoGuiche,
  declararExcecaoDoCalendario,
  marcarAtendimento,
  publicarOfertaDeHorarios,
  registrarAtendimento,
  remarcarAtendimento,
} from "../../../../lib/portas/guiche";

/**
 * AS AÇÕES DA AGENDA DO GUICHÊ (V11 V8).
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Capacidade, oferta publicada, dia fechado, serviço atendido e
 * os estados da reserva são conferidos DENTRO da transação, e a recusa do domínio sobe inteira —
 * é ela que diz "08:00 está lotado: 2 de 2 lugares", e nenhuma tela consegue dizer isso melhor.
 * Esta camada confere FORMA (campo em branco, número que não é número) e traduz o `FormData`.
 */

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const inteiro = (f: FormData, k: string): number => Number.parseInt(t(f, k), 10);

function recarregar(): void {
  revalidatePath("/protocolo/guiches");
}

/** Executa o ato e traduz a recusa — o motivo do domínio sobe inteiro. */
async function ato(corpo: () => Promise<string>, padrao: string): Promise<EstadoDoAto> {
  try {
    const sucesso = await corpo();
    recarregar();
    return { sucesso };
  } catch (e) {
    return { erro: mensagemDoErro(e, padrao) };
  }
}

export async function abrirUnidadeAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "codigo") === "") return { erro: "Informe o código da unidade." };
    if (t(f, "nome") === "") return { erro: "Informe o nome da unidade." };
    if (t(f, "endereco") === "") return { erro: "Informe o endereço — é ele que a pessoa vai procurar." };
    if (t(f, "setorId") === "") return { erro: "Escolha o setor responsável pela unidade." };
    return ato(
      () =>
        abrirUnidadeDeAtendimento({
          codigo: t(f, "codigo").toUpperCase(),
          nome: t(f, "nome"),
          endereco: t(f, "endereco"),
          setorId: t(f, "setorId"),
        }),
      "Não foi possível abrir a unidade. Nada foi gravado."
    );
  });
}

export async function abrirGuicheAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "unidadeId") === "") return { erro: "Escolha a unidade." };
    if (t(f, "nome") === "") return { erro: "Informe o nome do guichê." };
    return ato(
      () => abrirGuiche({ unidadeId: t(f, "unidadeId"), nome: t(f, "nome") }),
      "Não foi possível criar o guichê. Nada foi gravado."
    );
  });
}

export async function definirServicoAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "guicheId") === "") return { erro: "Escolha o guichê." };
    if (t(f, "servicoId") === "") return { erro: "Escolha o serviço." };
    const habilitado = t(f, "habilitado") === "sim";
    return ato(
      () =>
        definirServicoDoGuiche({
          guicheId: t(f, "guicheId"),
          servicoId: t(f, "servicoId"),
          habilitado,
          // ⚠️ AUSENTE = NÃO. O serviço só vai para a internet quando alguém marcar que vai.
          agendamentoPublico: t(f, "agendamentoPublico") === "sim",
          motivo: t(f, "motivo"),
        }),
      "Não foi possível definir o serviço. Nada foi gravado."
    );
  });
}

export async function publicarOfertaAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "guicheId") === "") return { erro: "Escolha o guichê." };
    const dia = inteiro(f, "diaDaSemana");
    if (!Number.isInteger(dia)) return { erro: "Escolha o dia da semana." };
    if (t(f, "horaInicio") === "" || t(f, "horaFim") === "") return { erro: "Informe a hora de início e a de fim." };
    const duracao = inteiro(f, "duracaoMinutos");
    const capacidade = inteiro(f, "capacidade");
    if (!Number.isInteger(duracao) || duracao <= 0) return { erro: "Informe a duração de cada atendimento, em minutos." };
    if (!Number.isInteger(capacidade) || capacidade <= 0) return { erro: "Informe quantas pessoas cabem em cada horário." };
    if (t(f, "vigenciaInicio") === "") return { erro: "Informe a partir de quando esta oferta vale." };
    const fim = t(f, "vigenciaFim");
    return ato(
      () =>
        publicarOfertaDeHorarios({
          guicheId: t(f, "guicheId"),
          diaDaSemana: dia,
          horaInicio: t(f, "horaInicio"),
          horaFim: t(f, "horaFim"),
          duracaoMinutos: duracao,
          capacidade,
          vigenciaInicio: t(f, "vigenciaInicio"),
          vigenciaFim: fim === "" ? null : fim,
        }),
      "Não foi possível publicar a oferta. Nada foi gravado."
    );
  });
}

/**
 * A EXCEÇÃO DE CALENDÁRIO (V11 V8.12) — três decisões sobre o mesmo dia, uma ação só.
 *
 * ⚠️ NENHUMA REGRA AQUI. A ação confere FORMA (campo em branco, tipo fora da lista) e traduz o
 * `FormData`; quem cobra as horas juntas, a ordem delas e as reservas que deixariam de caber é o
 * domínio — e a mensagem dele sobe inteira.
 */
const TIPOS_DE_EXCECAO = ["FECHADO", "EXPEDIENTE_ESPECIAL", "EXPEDIENTE_NORMAL"] as const;

export async function fecharDiaAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "unidadeId") === "") return { erro: "Escolha a unidade." };
    if (t(f, "dia") === "") return { erro: "Informe o dia." };
    const tipo = t(f, "tipo");
    if (!(TIPOS_DE_EXCECAO as readonly string[]).includes(tipo)) {
      return { erro: "Escolha o que fazer com o dia: fechar, expediente especial ou voltar ao normal." };
    }
    if (t(f, "motivo") === "") return { erro: "Diga por quê — é isso que a tela mostra a quem procurar horário." };
    if (tipo === "EXPEDIENTE_ESPECIAL" && (t(f, "horaInicio") === "" || t(f, "horaFim") === "")) {
      return { erro: "O expediente especial precisa da hora de início E da hora de fim." };
    }
    return ato(
      () =>
        declararExcecaoDoCalendario({
          unidadeId: t(f, "unidadeId"),
          dia: t(f, "dia"),
          tipo: tipo as (typeof TIPOS_DE_EXCECAO)[number],
          motivo: t(f, "motivo"),
          ...(tipo === "EXPEDIENTE_ESPECIAL"
            ? { horaInicio: t(f, "horaInicio"), horaFim: t(f, "horaFim") }
            : {}),
        }),
      "Não foi possível declarar a exceção. Nada foi gravado."
    );
  });
}

export async function marcarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "servicoId") === "") return { erro: "Escolha o serviço." };
    if (t(f, "documento") === "") return { erro: "Informe o CPF ou CNPJ de quem vai ser atendido." };
    if (t(f, "horaInicio") === "") return { erro: "Escolha o horário." };
    // ⚠️ A CHAVE DO COMANDO VAI PARA DENTRO DA CHAVE DE IDEMPOTÊNCIA: é ela que faz dois cliques
    // no mesmo botão serem UMA reserva, e dois envios deliberados serem duas.
    const chave = t(f, "__chave");
    if (chave === "") return { erro: "A tela ainda está carregando. Tente de novo em um instante." };
    return ato(
      () =>
        marcarAtendimento({
          guicheId: t(f, "guicheId"),
          servicoId: t(f, "servicoId"),
          documento: t(f, "documento"),
          dia: t(f, "dia"),
          horaInicio: t(f, "horaInicio"),
          chaveDeComando: chave,
        }),
      "Não foi possível marcar o atendimento. Nada foi reservado."
    );
  });
}

export async function confirmarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () =>
    ato(() => confirmarPresenca(t(f, "reservaId")), "Não foi possível confirmar. Nada foi gravado.")
  );
}

export async function registrarAtendimentoAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "atendidoPor") === "") return { erro: "Informe quem atendeu." };
    return ato(
      () =>
        registrarAtendimento({
          reservaId: t(f, "reservaId"),
          atendidoPor: t(f, "atendidoPor"),
          observacao: t(f, "observacao"),
        }),
      "Não foi possível registrar o atendimento. Nada foi gravado."
    );
  });
}

export async function cancelarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "motivo") === "") return { erro: "Diga por que a marcação está sendo cancelada." };
    return ato(
      () => cancelarMarcacao({ reservaId: t(f, "reservaId"), motivo: t(f, "motivo") }),
      "Não foi possível cancelar. Nada foi gravado."
    );
  });
}

export async function remarcarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "dia") === "" || t(f, "horaInicio") === "") return { erro: "Informe o novo dia e o novo horário." };
    if (t(f, "motivo") === "") return { erro: "Diga por que está sendo remarcado — o motivo fica no histórico." };
    return ato(
      () =>
        remarcarAtendimento({
          reservaId: t(f, "reservaId"),
          guicheId: t(f, "guicheId"),
          dia: t(f, "dia"),
          horaInicio: t(f, "horaInicio"),
          motivo: t(f, "motivo"),
        }),
      "Não foi possível remarcar. Nada foi gravado."
    );
  });
}
