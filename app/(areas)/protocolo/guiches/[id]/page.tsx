import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { diaCivil } from "../../../../../packages/datas/index";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerAgendaDoDia } from "../../../../../lib/portas/guiche";
import { AtosDaAgenda, AtosDaReserva, BotaoConfirmar, FormMarcar } from "./AcoesDaAgenda";

/**
 * A AGENDA DE UM DIA NUM GUICHÊ (M21 V11 V8) — onde se marca e onde se atende.
 *
 * ═══ ⚠️ O QUE ELA MOSTRA ═══
 * Os horários publicados para aquele dia, com quantas vagas sobraram, e quem está marcado em cada
 * um. As vagas saem da MESMA contagem que a gravação subtrai dentro da transação — uma tela que
 * somasse por conta própria ofereceria horário que a reserva recusa.
 *
 * ⚠️ AS RESERVAS SÃO AS DO HORÁRIO VIGENTE. Uma que saiu daqui por remarcação não aparece; uma que
 * veio de outro guichê aparece. Listar pelo campo original mostraria gente que não vem mais e
 * esconderia gente que vem.
 *
 * ⚠️ DIA FECHADO DIZ O MOTIVO. "Nenhum horário" e "não abrimos por causa do feriado municipal"
 * são respostas diferentes para quem está na frente do balcão perguntando.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const br = (dia: string): string => dia.split("-").reverse().join("/");

const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = {
  MARCADA: "Marcada",
  CONFIRMADA: "Presença confirmada",
  ATENDIDA: "Atendida",
  CANCELADA: "Cancelada",
};

export default async function AgendaDoGuichePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const sp = await searchParams;
  const pedido = typeof sp["dia"] === "string" ? sp["dia"] : "";
  // ⚠️ O DIA PADRÃO É HOJE NO RELÓGIO DO ENTE, não no do servidor nem no do navegador.
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : diaCivil(new Date());

  let agenda: Awaited<ReturnType<typeof lerAgendaDoDia>>;
  try {
    // ⚠️ O GATE DA POLÍTICA DE LEITURA — ver a tela de organização. Dado do ENTE.
    await telaExigeLeituraDoEnte("CONSULTAR_PROTOCOLO");
    agenda = await lerAgendaDoDia({ guicheId: id, dia });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Agenda do guichê" subtitulo="Atendimento presencial" />
        <EstadoVazio titulo="Não foi possível ler a agenda" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }

  if (agenda === null) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Agenda do guichê" subtitulo="Atendimento presencial" />
        <EstadoVazio titulo="Guichê não encontrado" descricao="Ele pode ter sido criado noutra unidade, ou o endereço está errado." />
      </div>
    );
  }

  const fechado = agenda.oferta.fechado;
  const porHora = new Map<string, typeof agenda.reservas>();
  for (const r of agenda.reservas) porHora.set(r.hora, [...(porHora.get(r.hora) ?? []), r]);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo={`${agenda.unidadeNome} — ${agenda.guicheNome}`}
        subtitulo={`Agenda de ${br(dia)}`}
      />

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
        <label className="text-xs">
          <span className="mb-1 block text-[color:var(--color-ink-2)]">Dia da agenda</span>
          <input
            name="dia"
            type="date"
            defaultValue={dia}
            className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-sm"
          />
        </label>
        {/* ⚠️ GET: trocar o dia é LEITURA, e não produz transição de estado nenhuma. */}
        <button type="submit" className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-1 text-xs">
          Ver este dia
        </button>
        <Link href="/protocolo/guiches" className="ml-auto text-xs underline">
          Voltar à organização do atendimento
        </Link>
      </form>

      {fechado !== null ? (
        <EstadoVazio
          titulo={`A unidade não abre em ${br(dia)}`}
          descricao={`${fechado.motivo}. Nenhum horário é oferecido neste dia, e nada pode ser marcado.`}
        />
      ) : (
        <>
          <FormMarcar
            guicheId={agenda.guicheId}
            dia={dia}
            servicos={agenda.servicosAtendidos}
            horarios={agenda.oferta.horarios.map((h) => ({ hora: h.hora, livres: h.livres, capacidade: h.capacidade }))}
          />

          {agenda.oferta.horarios.length === 0 ? (
            <EstadoVazio
              titulo="Sem oferta publicada para este dia da semana"
              descricao="Este guichê não oferece horário nenhum em dias como este. Publique a oferta na tela de organização — não existe expediente padrão."
            />
          ) : (
            <Card>
              {/* ⚠️ O PROVEDOR ENVOLVE A TABELA INTEIRA, e é aí que mora a confirmação dos atos.
                  Registrar, cancelar e remarcar fazem a LINHA da reserva desaparecer — guardar o
                  aviso dentro dela o mataria junto, e quem enviou leria silêncio. Ver
                  `AtosDaAgenda`. */}
              <AtosDaAgenda>
              <table className="w-full text-sm" data-teste="agenda-do-dia">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                    <th className="py-1.5 pr-4">Horário</th>
                    <th className="py-1.5 pr-4">Vagas</th>
                    <th className="py-1.5">Quem está marcado</th>
                  </tr>
                </thead>
                <tbody>
                  {agenda.oferta.horarios.map((h) => {
                    const doHorario = porHora.get(h.hora) ?? [];
                    return (
                      <tr key={h.hora} className="border-b border-[color:var(--color-border)] align-top">
                        <td className="py-1.5 pr-4 font-mono">{h.hora}</td>
                        <td className="py-1.5 pr-4">
                          <Badge status={h.livres === 0 ? "alerta" : "neutro"}>
                            {h.livres} de {h.capacidade}
                          </Badge>
                        </td>
                        <td className="py-1.5">
                          {doHorario.length === 0 ? (
                            <span className="text-xs text-[color:var(--color-ink-3)]">ninguém</span>
                          ) : (
                            <ul className="space-y-2">
                              {doHorario.map((r) => (
                                <li key={r.id} data-teste={`reserva-${r.codigo}`}>
                                  <span className="text-sm">{r.pessoa}</span>{" "}
                                  <span className="text-xs text-[color:var(--color-ink-3)]">({r.servico})</span>{" "}
                                  <Badge status={r.situacao === "CANCELADA" ? "alerta" : "neutro"}>
                                    {ROTULO_DA_SITUACAO[r.situacao] ?? r.situacao}
                                  </Badge>{" "}
                                  <span className="font-mono text-xs text-[color:var(--color-ink-3)]">{r.codigo}</span>
                                  {/* ⚠️ QUEM ATENDE PRECISA SABER DE ONDE VEIO. Uma marcação do
                                      portal traz nome e documento DECLARADOS, não conferidos por
                                      ninguém — quem está no guichê tem de pedir o documento. */}
                                  {r.pelaInternet ? (
                                    <span className="ml-1 text-xs text-[color:var(--color-ink-3)]">
                                      · pela internet, dados a conferir
                                    </span>
                                  ) : null}
                                  {r.reagendamentos > 0 ? (
                                    <span className="ml-1 text-xs text-[color:var(--color-ink-3)]">
                                      · remarcada {r.reagendamentos}x
                                    </span>
                                  ) : null}
                                  {r.motivoDoCancelamento !== null ? (
                                    <span className="block text-xs text-[color:var(--color-ink-3)]">
                                      cancelada: {r.motivoDoCancelamento}
                                    </span>
                                  ) : null}

                                  {/* ⚠️ OS ATOS SÓ APARECEM ENQUANTO EXISTEM. Cancelada e atendida
                                      não se remarcam nem se cancelam — e quem recusa é o domínio,
                                      dentro da transação; esconder o botão é cortesia, não proteção. */}
                                  {r.situacao === "MARCADA" ? <BotaoConfirmar reservaId={r.id} /> : null}
                                  {r.situacao === "MARCADA" || r.situacao === "CONFIRMADA" ? (
                                    <AtosDaReserva reservaId={r.id} guicheId={agenda.guicheId} dia={dia} />
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </AtosDaAgenda>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
