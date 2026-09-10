import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { lerUnidades } from "../../../../lib/portas/designer";
import { lerChamados, lerSeveridades } from "../../../../lib/portas/suporte";
import { dataBr } from "../../../../lib/recorte";
import { FormAbrirChamado } from "./FormChamado";

export const dynamic = "force-dynamic";

export default async function ChamadosPage(): Promise<React.ReactElement> {
  const [chamados, severidades, unidades] = await Promise.all([
    lerChamados(),
    lerSeveridades(),
    lerUnidades(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Chamados de suporte"
        subtitulo="Número único no produto inteiro, severidade cadastrada pela entidade e histórico consultável por quem abriu."
      />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Abrir chamado
        </h2>
        <FormAbrirChamado unidades={unidades} severidades={severidades} />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Meus chamados
          </h2>
          <span className="text-xs text-[color:var(--color-ink-2)]">
            Ordenados pela severidade — o mais grave primeiro.
          </span>
        </div>
        {chamados.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum chamado"
            descricao="Você vê os chamados que abriu. Quem atende o suporte vê todos — um chamado costuma descrever o que a pessoa não conseguiu fazer, e isso não é assunto do setor dela."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
              <tr>
                <th className="py-2 pr-3">Nº</th>
                <th className="py-2 pr-3">Título</th>
                <th className="py-2 pr-3">Severidade</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">Aberto</th>
                <th className="py-2 pr-3">Nota</th>
              </tr>
            </thead>
            <tbody>
              {chamados.map((c) => (
                <tr key={c.id} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="py-2 pr-3 font-medium">
                    <a className="underline underline-offset-2" href={`/suporte/chamados/${c.id}`}>
                      {c.numero}
                    </a>
                  </td>
                  <td className="py-2 pr-3">{c.titulo}</td>
                  <td className="py-2 pr-3">{c.severidade}</td>
                  <td className="py-2 pr-3">
                    <Badge
                      status={
                        c.situacao === "ENCERRADO"
                          ? "ok"
                          : c.situacao === "RESPONDIDO"
                            ? "alerta"
                            : "neutro"
                      }
                    >
                      {c.situacao.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                    {dataBr(c.abertoEm)}
                  </td>
                  <td className="py-2 pr-3">{c.nota ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
