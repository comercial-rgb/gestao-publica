import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  lerCaixa,
  lerMeusSetoresParaComunicado,
  lerTiposDeComunicado,
  type Caixa,
} from "../../../../lib/portas/comunicacao";
import { lerExerciciosAbertos } from "../../../../lib/portas/protocolo";
import { dataBr } from "../../../../lib/recorte";
import { FormNovoComunicado } from "./FormComunicado";

/**
 * AS CAIXAS DA COMUNICAÇÃO INTERNA.
 *
 * ═══ ⚠️ AS CAIXAS SÃO PONTO DE VISTA, NÃO ESTADO ═══
 * O mesmo comunicado está na SAÍDA de quem enviou e na ENTRADA de quem recebeu, ao
 * mesmo tempo — uma coluna `caixa` teria de valer duas coisas de uma vez. A aba é um
 * filtro sobre a mesma consulta, calculada para quem está olhando.
 */
export const dynamic = "force-dynamic";

const ABAS: readonly { readonly chave: Caixa | "TODAS"; readonly rotulo: string }[] = [
  { chave: "ENTRADA", rotulo: "Entrada" },
  { chave: "SAIDA", rotulo: "Saída" },
  { chave: "RASCUNHO", rotulo: "Rascunhos" },
  { chave: "ARQUIVADO", rotulo: "Arquivados" },
  { chave: "TODAS", rotulo: "Todos" },
];

export default async function ComunicadosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const bruto = typeof sp["caixa"] === "string" ? sp["caixa"] : "ENTRADA";
  const aba = ABAS.find((a) => a.chave === bruto)?.chave ?? "ENTRADA";
  const soFavoritos = sp["favoritos"] === "1";

  const [linhas, tipos, setores, exercicios] = await Promise.all([
    lerCaixa(aba),
    lerTiposDeComunicado(),
    lerMeusSetoresParaComunicado(),
    lerExerciciosAbertos(),
  ]);

  const lista = soFavoritos ? linhas.filter((l) => l.favorito) : linhas;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Comunicação interna"
        subtitulo="Memorandos, ofícios e circulares. As caixas são calculadas para quem olha — o mesmo documento está na saída de um e na entrada do outro."
      />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Novo comunicado
        </h2>
        <FormNovoComunicado tipos={tipos} setores={setores} exercicios={exercicios} />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {ABAS.map((a) => (
            <a
              key={a.chave}
              href={`/comunicacao/comunicados?caixa=${a.chave}`}
              className={`rounded-[var(--radius-md)] px-3 py-1 text-xs ${
                a.chave === aba
                  ? "bg-[color:var(--color-accent)] text-[color:var(--color-accent-fg)]"
                  : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-2)]"
              }`}
            >
              {a.rotulo}
            </a>
          ))}
          <a
            href={`/comunicacao/comunicados?caixa=${aba}&favoritos=${soFavoritos ? "0" : "1"}`}
            className={`rounded-[var(--radius-md)] px-3 py-1 text-xs ${
              soFavoritos
                ? "bg-[color:var(--color-accent)] text-[color:var(--color-accent-fg)]"
                : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-2)]"
            }`}
          >
            Favoritos
          </a>
        </div>

        {lista.length === 0 ? (
          <EstadoVazio
            titulo="Nada nesta caixa"
            descricao="Você vê os comunicados dos setores em que está lotado — como remetente ou como destinatário — e os que emitiu. Sem lotação, a caixa fica vazia."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                <tr>
                  <th className="py-2 pr-3">Documento</th>
                  <th className="py-2 pr-3">Assunto</th>
                  <th className="py-2 pr-3">Remetente</th>
                  <th className="py-2 pr-3">Destinos</th>
                  <th className="py-2 pr-3">Situação</th>
                  <th className="py-2 pr-3">Criado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="border-b border-[color:var(--color-border)] last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      <a
                        className="underline underline-offset-2"
                        href={`/comunicacao/comunicados/${c.id}`}
                      >
                        {c.rotulo}
                      </a>
                      {c.favorito ? (
                        <span className="ml-2">
                          <Badge status="alerta">favorito</Badge>
                        </span>
                      ) : null}
                      {c.aosCuidadosDeMim ? (
                        <span className="ml-2">
                          <Badge status="alerta">A/C você</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      {c.assunto}
                      {c.tags.length > 0 ? (
                        <span className="ml-2 text-xs text-[color:var(--color-ink-2)]">
                          #{c.tags.join(" #")}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{c.remetente}</td>
                    <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                      {c.destinatarios.length > 0 ? c.destinatarios.join(", ") : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge status={c.caixa === "RASCUNHO" ? "neutro" : c.lido ? "ok" : "alerta"}>
                        {c.caixa === "RASCUNHO"
                          ? "rascunho"
                          : c.lido
                            ? "lido"
                            : "não lido"}
                      </Badge>
                      {!c.conteudoIntegro ? (
                        <span className="ml-2">
                          <Badge status="erro">texto alterado após o envio</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                      {dataBr(c.em)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
