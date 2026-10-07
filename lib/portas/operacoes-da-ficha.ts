import { toMoney } from "../../packages/contracts/index";
import { criarM05DepsComContratos } from "../../modules/m11-licitacoes/adapter-m05";
import { liberarReserva, reservarDotacao } from "../../modules/m05-despesa/servico";
import { cliente, PortaSemBancoError } from "./cliente";
import { EscopoDeLeituraError } from "./contexto";
import { listarEmpenhosDaExecucao, type EmpenhoDaTela } from "./empenho";
import { autorizarLeituraDoRegistroPara, exigirLeituraEmAlgumEscopo } from "./leitura";
import { comEscritaAutenticada, exigirSessao } from "./sessao";

/**
 * AS OPERAÇÕES DA DOTAÇÃO (V31) — da ficha, abrir as reservas e os empenhos dela; reservar e liberar
 * reserva sem precisar de um processo licitatório.
 *
 * ⚠️ O MESMO SERVIÇO, A MESMA PERMISSÃO E OS MESMOS FATOS DO PROCESSO. A reserva avulsa é a
 * `reservarDotacao` do M05 sem `processoId` (o domínio sempre aceitou); a liberação é a `liberarReserva`.
 * As ações são RESERVAR_DOTACAO e LIBERAR_RESERVA, conferidas por unidade dentro do serviço — o atalho na
 * ficha não cria poder novo.
 *
 * ⚠️ OS EMPENHOS SÓ APARECEM A QUEM LÊ A DESPESA DAQUELA UNIDADE (CONSULTAR_DESPESA no escopo da ficha).
 * Quem só consulta o planejamento vê o saldo empenhado (que a ficha já mostra), não os credores. E os
 * valores vêm de `listarEmpenhosDaExecucao` — a mesma conta da lista de empenhos, sem segunda aritmética.
 *
 * ⚠️ A RESERVA CONSUMIDA é o valor dos empenhos vinculados a ela — a mesma regra do detalhe do processo.
 */

export { PortaSemBancoError };

export interface ReservaDaFicha {
  readonly id: string;
  readonly valor: string;
  readonly consumido: string;
  readonly saldo: string;
  readonly liberada: boolean;
  readonly historico: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly processo: { readonly id: string; readonly numero: string } | null;
  /** V36 — a reserva é o bloqueio de uma prévia de alteração orçamentária: só a prévia a desfaz. */
  readonly previa: { readonly id: string; readonly rotulo: string } | null;
}

export interface OperacoesDaFicha {
  readonly fichaId: string;
  readonly exercicio: number;
  readonly unidadeCodigo: string;
  readonly reservas: readonly ReservaDaFicha[];
  /** null = o usuário não lê a despesa desta unidade; o motivo vai em `motivoSemEmpenhos`. */
  readonly empenhos: readonly EmpenhoDaTela[] | null;
  readonly motivoSemEmpenhos: string | null;
}

export async function lerOperacoesDaFicha(fichaId: string): Promise<OperacoesDaFicha | null> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_PLANEJAMENTO");
  const sessao = await exigirSessao();
  const db = cliente();
  const f = await db.fichaOrcamentaria.findUnique({
    where: { id: fichaId },
    select: { exercicio: true, unidadeOrc: { select: { codigo: true } } },
  });
  if (f === null) return null;
  const linhas = await db.reservaDotacao.findMany({
    where: { fichaId, estornoDeId: null },
    orderBy: { criadoEm: "desc" },
    select: {
      id: true,
      valor: true,
      historico: true,
      criadoEm: true,
      criadoPor: true,
      processo: { select: { id: true, numeroProcesso: true } },
      estornos: { select: { id: true } },
      empenhos: { select: { empenho: { select: { valor: true } } } },
      itemDaPrevia: { select: { previa: { select: { id: true, numero: true, exercicio: true } } } },
    },
  });
  const reservas = linhas.map((r) => {
    const valor = toMoney(r.valor.toFixed(2));
    const consumido = r.empenhos.reduce((s, e) => s.plus(e.empenho.valor.toFixed(2)), toMoney("0"));
    const liberada = r.estornos.length > 0;
    return {
      id: r.id,
      valor: valor.toFixed(2),
      consumido: consumido.toFixed(2),
      saldo: liberada ? "0.00" : valor.minus(consumido).toFixed(2),
      liberada,
      historico: r.historico,
      criadoEm: r.criadoEm,
      criadoPor: r.criadoPor,
      processo: r.processo === null ? null : { id: r.processo.id, numero: r.processo.numeroProcesso },
      previa: r.itemDaPrevia === null ? null : { id: r.itemDaPrevia.previa.id, rotulo: `prévia nº ${String(r.itemDaPrevia.previa.numero)}/${String(r.itemDaPrevia.previa.exercicio)}` },
    };
  });
  let empenhos: readonly EmpenhoDaTela[] | null = null;
  let motivoSemEmpenhos: string | null = null;
  try {
    await autorizarLeituraDoRegistroPara(sessao, "CONSULTAR_DESPESA", f.unidadeOrc.codigo);
    empenhos = await listarEmpenhosDaExecucao({ exercicio: f.exercicio, fichaId });
  } catch (e) {
    if (!(e instanceof EscopoDeLeituraError)) throw e;
    motivoSemEmpenhos = `Os empenhos desta ficha não aparecem: a consulta da despesa da unidade ${f.unidadeOrc.codigo} não está no seu acesso.`;
  }
  return { fichaId, exercicio: f.exercicio, unidadeCodigo: f.unidadeOrc.codigo, reservas, empenhos, motivoSemEmpenhos };
}

/** Reserva avulsa — o mesmo `reservarDotacao` do processo, sem processo. */
export async function reservarNaFicha(input: { readonly fichaId: string; readonly valor: string; readonly historico: string }): Promise<string> {
  return comEscritaAutenticada("RESERVAR_DOTACAO", (criadoPor) =>
    reservarDotacao({ fichaId: input.fichaId, valor: input.valor, historico: input.historico, criadoPor }, criarM05DepsComContratos(cliente()))
  );
}

/** Libera uma reserva DESTA ficha (conferido aqui, no servidor; a autorização é do serviço). */
export async function liberarReservaDaFicha(input: { readonly fichaId: string; readonly reservaId: string; readonly historico: string }): Promise<string> {
  const r = await cliente().reservaDotacao.findUnique({ where: { id: input.reservaId }, select: { fichaId: true } });
  if (r === null || r.fichaId !== input.fichaId) throw new Error("A reserva escolhida não pertence a esta ficha. Nada foi gravado.");
  return comEscritaAutenticada("LIBERAR_RESERVA", (criadoPor) =>
    liberarReserva({ reservaId: input.reservaId, historico: input.historico, criadoPor }, criarM05DepsComContratos(cliente()))
  );
}
