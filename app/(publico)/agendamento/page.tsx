import Link from "next/link";
import { Card } from "../../../components/ui/Card";
import { EstadoVazio } from "../../../components/ui/EstadoVazio";
import { diaCivil } from "../../../packages/datas/index";
import { lerGuichesAbertos, lerHorariosPublicos } from "../../../lib/portas/guiche-publico";
import { FormAgendamento } from "./FormAgendamento";

/**
 * O AGENDAMENTO DE ATENDIMENTO PRESENCIAL PELO CIDADÃO (TR 5.39.92).
 *
 * ═══ ⚠️ SEM CONTA, E POR QUÊ ═══
 * A seção 5.39 do TR é o portal de AUTOATENDIMENTO. Marcar um lugar na fila não é um ato que
 * dependa de cadastro: a identificação de verdade acontece no guichê, com o documento na mão.
 * Exigir conta para isso afastaria exatamente quem mais precisa do atendimento presencial.
 *
 * ⚠️ O QUE APARECE AQUI É SÓ O QUE O ENTE ABRIU. Um serviço atendido no guichê e não marcado
 * como agendável pela internet não aparece — e um guichê sem nenhum serviço aberto também não,
 * porque levaria a pessoa a uma tela sem o que escolher.
 *
 * ⚠️ A ESCOLHA DO DIA É **GET**. Trocar de data é leitura; `GET` não produz transição de estado,
 * e é o que deixa a pessoa voltar, adiantar e compartilhar o endereço de um dia.
 *
 * ⚠️ `force-dynamic`: as vagas mudam a cada marcação. Uma página estática ofereceria horário que
 * já foi tomado.
 */
export const dynamic = "force-dynamic";

const br = (dia: string): string => dia.split("-").reverse().join("/");

export default async function AgendamentoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const texto = (k: string): string => (typeof sp[k] === "string" ? sp[k] : "");
  const guicheId = texto("guiche");
  const servicoId = texto("servico");
  const diaPedido = texto("dia");
  const hoje = diaCivil(new Date());
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(diaPedido) ? diaPedido : hoje;

  let guiches: Awaited<ReturnType<typeof lerGuichesAbertos>>;
  try {
    guiches = await lerGuichesAbertos();
  } catch {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Agendar atendimento presencial</h1>
        <EstadoVazio
          titulo="O agendamento está indisponível no momento"
          descricao="Tente novamente mais tarde, ou procure o atendimento presencial da prefeitura."
        />
      </div>
    );
  }

  const escolhido = guiches.find((g) => g.guicheId === guicheId);
  const servico = escolhido?.servicos.find((s) => s.id === servicoId);

  // ── A ESCOLHA DO SERVIÇO ───────────────────────────────────────────────────
  if (escolhido === undefined || servico === undefined) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Agendar atendimento presencial</h1>
        <p className="text-sm text-[color:var(--color-ink-2)]">
          Escolha o serviço que você precisa resolver. Você recebe um horário e um código de
          acompanhamento — não é preciso ter conta.{" "}
          <Link href="/agendamento/acompanhar" className="underline">
            Já tenho uma marcação
          </Link>
          .
        </p>

        {guiches.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum atendimento aberto para marcação pela internet"
            descricao="A prefeitura ainda não abriu serviços para agendamento on-line. Procure o atendimento presencial."
          />
        ) : null}

        {guiches.map((g) => (
          <Card key={g.guicheId}>
            <strong className="text-base">{g.unidade}</strong>{" "}
            <span className="text-xs text-[color:var(--color-ink-3)]">{g.endereco} · {g.guiche}</span>
            <ul className="mt-3 space-y-1" data-teste={`servicos-${g.guicheId}`}>
              {g.servicos.map((s) => (
                <li key={s.id}>
                  <Link href={`/agendamento?guiche=${g.guicheId}&servico=${s.id}`} className="text-sm underline">
                    {s.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    );
  }

  // ── O DIA E OS HORÁRIOS ────────────────────────────────────────────────────
  const oferta = await lerHorariosPublicos({ guicheId, dia });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{servico.titulo}</h1>
      <p className="text-sm text-[color:var(--color-ink-2)]">
        {escolhido.unidade} — {escolhido.endereco} ({escolhido.guiche}).{" "}
        <Link href="/agendamento" className="underline">Escolher outro serviço</Link>
      </p>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
        <input type="hidden" name="guiche" value={guicheId} />
        <input type="hidden" name="servico" value={servicoId} />
        <label className="text-xs">
          <span className="mb-1 block text-[color:var(--color-ink-2)]">Dia do atendimento</span>
          <input
            name="dia"
            type="date"
            min={hoje}
            defaultValue={dia}
            className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-sm"
          />
        </label>
        <button type="submit" className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-1 text-xs">
          Ver horários
        </button>
      </form>

      {oferta.fechado !== null ? (
        <EstadoVazio
          titulo={`Não há atendimento em ${br(dia)}`}
          descricao={`${oferta.fechado.motivo}. Escolha outra data.`}
        />
      ) : (
        <FormAgendamento
          guicheId={guicheId}
          servicoId={servicoId}
          servicoTitulo={servico.titulo}
          unidade={escolhido.unidade}
          endereco={escolhido.endereco}
          dia={dia}
          horarios={oferta.horarios}
        />
      )}
    </div>
  );
}
