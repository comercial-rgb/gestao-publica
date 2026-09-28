import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import {
  lerServicosParaGuiche,
  lerSetoresParaAtendimento,
  lerUnidadesDeAtendimento,
} from "../../../../lib/portas/guiche";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { FormsDaOrganizacao } from "./FormsDaOrganizacao";

/**
 * A ORGANIZAÇÃO DO ATENDIMENTO PRESENCIAL (M21, TR 5.39.92).
 *
 * ═══ ⚠️ O QUE ESTA TELA MOSTRA, E O QUE ELA NÃO INVENTA ═══
 * Ela mostra a oferta COMO ELA ESTÁ PUBLICADA: unidade, guichê, o que cada um atende, os horários
 * e quantas pessoas cabem em cada um. Um guichê sem oferta aparece dizendo que não oferece
 * horário — e não com um "8h às 17h" plausível. Não existe expediente padrão neste sistema, e a
 * tela é o lugar onde essa ausência precisa aparecer, porque é dela que alguém vai reclamar.
 *
 * ⚠️ ELA NÃO É A AGENDA DA FISCALIZAÇÃO, e a separação é do pedido: aquela é do gestor sobre um
 * fiscal designado; esta é do cidadão sobre um serviço da carta.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const br = (dia: string): string => dia.split("-").reverse().join("/");

export default async function GuichesPage(): Promise<React.ReactElement> {
  let unidades: Awaited<ReturnType<typeof lerUnidadesDeAtendimento>>;
  let setores: Awaited<ReturnType<typeof lerSetoresParaAtendimento>>;
  let servicos: Awaited<ReturnType<typeof lerServicosParaGuiche>>;
  try {
    // ⚠️ O GATE DA POLÍTICA DE LEITURA, NA TELA. A organização do atendimento é dado do ENTE:
    // a unidade de atendimento é um lugar físico, não uma unidade ORÇAMENTÁRIA, e não há recorte
    // por UG a fazer. Sem ele, a tela entregaria a agenda a qualquer sessão — e a porta
    // autorizar por dentro não basta: é a tela que a política vigia (orquestração V3, 4.1).
    await telaExigeLeituraDoEnte("CONSULTAR_PROTOCOLO");
    unidades = await lerUnidadesDeAtendimento();
    setores = await lerSetoresParaAtendimento();
    servicos = await lerServicosParaGuiche();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Atendimento presencial" subtitulo="Unidades, guichês e oferta de horários." />
        <EstadoVazio
          titulo="Não foi possível carregar o atendimento presencial"
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const todosOsGuiches = unidades.flatMap((u) =>
    u.guiches.map((g) => ({ id: g.id, rotulo: `${u.nome} — ${g.nome}` }))
  );

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Atendimento presencial"
        subtitulo="Unidades, guichês e oferta de horários."
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Nesta tela são cadastradas as unidades, os guichês, os serviços atendidos e os horários
        oferecidos. Para agendar um atendimento, abra a agenda do guichê. Somente horários
        publicados ficam disponíveis para agendamento.
      </div>

      <FormsDaOrganizacao
        setores={setores.map((s) => ({ id: s.id, rotulo: `${s.codigo} — ${s.nome}` }))}
        unidades={unidades.map((u) => ({ id: u.id, rotulo: `${u.codigo} — ${u.nome}` }))}
        guiches={todosOsGuiches}
        servicos={servicos.map((s) => ({ id: s.id, rotulo: s.titulo }))}
      />

      {unidades.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma unidade de atendimento"
          descricao="Cadastre a primeira unidade no painel acima. O agendamento exige unidade, guichê e oferta de horários publicada."
        />
      ) : null}

      {unidades.map((u) => (
        <Card key={u.id}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-base">
              <span className="font-mono">{u.codigo}</span> {u.nome}
            </strong>
            <span className="text-xs text-[color:var(--color-ink-3)]">{u.endereco}</span>
            <span className="text-xs text-[color:var(--color-ink-3)]">· responsável: {u.setorNome}</span>
          </div>

          {u.diasFechados.length > 0 ? (
            <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-teste={`dias-fechados-${u.codigo}`}>
              <strong>Exceções no calendário:</strong>{" "}
              {u.diasFechados
                .map((d) =>
                  d.tipo === "EXPEDIENTE_ESPECIAL"
                    ? `${br(d.dia)} abre ${d.horaInicio}–${d.horaFim} (${d.motivo})`
                    : `${br(d.dia)} não abre (${d.motivo})`
                )
                .join("; ")}
            </p>
          ) : null}

          {u.guiches.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">
              Esta unidade ainda não possui guichê cadastrado.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {u.guiches.map((g) => (
                <div key={g.id} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-teste={`guiche-${g.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">{g.nome}</strong>
                    <Link href={`/protocolo/guiches/${g.id}`} className="text-xs underline">
                      Abrir a agenda deste guichê
                    </Link>
                  </div>

                  <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
                    <strong>Atende:</strong>{" "}
                    {g.servicos.length === 0 ? (
                      <span className="text-[color:var(--color-status-erro-fg)]">
                        nenhum serviço habilitado (agendamento indisponível)
                      </span>
                    ) : (
                      g.servicos.map((s) => `${s.titulo}${s.agendamentoPublico ? " (agendamento pela internet)" : ""}`).join("; ")
                    )}
                  </p>

                  {g.janelas.length === 0 ? (
                    <p className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">
                      Sem oferta publicada. Este guichê não possui horários disponíveis.
                    </p>
                  ) : (
                    <table className="mt-2 w-full text-xs" data-teste={`janelas-${g.id}`}>
                      <thead>
                        <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                          <th className="py-1 pr-3">Dia</th>
                          <th className="py-1 pr-3">Horário</th>
                          <th className="py-1 pr-3">Duração</th>
                          <th className="py-1 pr-3">Vagas por horário</th>
                          <th className="py-1">Vigência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.janelas.map((j) => (
                          <tr key={j.id} className="border-b border-[color:var(--color-border)]">
                            <td className="py-1 pr-3">{DIAS[j.diaDaSemana]}</td>
                            <td className="py-1 pr-3 font-mono">
                              {j.horaInicio}–{j.horaFim}
                            </td>
                            <td className="py-1 pr-3">{j.duracaoMinutos} min</td>
                            <td className="py-1 pr-3">
                              <Badge status="neutro">{j.capacidade}</Badge>
                            </td>
                            <td className="py-1 text-[color:var(--color-ink-2)]">
                              de {br(j.vigenciaInicio)}
                              {j.vigenciaFim === null ? ", sem prazo" : ` a ${br(j.vigenciaFim)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
