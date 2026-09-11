import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  lerColunasDaFonte,
  lerExecucoes,
  lerFuncoesDaGramatica,
  lerModelos,
  lerResultado,
  lerUnidades,
} from "../../../../lib/portas/designer";
import {
  FormCopiar,
  FormDistribuir,
  FormExecutar,
  FormNovoModelo,
  FormRetirar,
} from "./FormDesigner";
import { instanteCivilBr } from "../../../../packages/datas/index";

/**
 * O DESIGNER DE RELATÓRIOS.
 *
 * ═══ ⚠️ ISTO NÃO É O M12 ═══
 * RREO, RGF e balanços são cálculos NORMATIVOS, com fórmula fixada em lei — ninguém os
 * desenha. Esta tela é a capacidade de o usuário montar um relatório operacional que
 * ninguém previu. As duas são exigidas, e nenhuma substitui a outra.
 */
export const dynamic = "force-dynamic";

function instante(d: Date): string {
  // ⚠️ SEM `timeZone`, o `Intl` usa o relógio de QUEM RENDERIZA — a máquina, num
  // componente de servidor. `instanteCivilBr` fixa o fuso do ente.
  return instanteCivilBr(d);
}

export default async function DesignerPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const verId = typeof sp["ver"] === "string" ? sp["ver"] : undefined;

  const [modelos, execucoes, unidades] = await Promise.all([
    lerModelos(),
    lerExecucoes(),
    lerUnidades(),
  ]);

  const csv = verId !== undefined ? await lerResultado(verId) : null;

  const colunasPorFonte = {
    PROCESSOS: lerColunasDaFonte("PROCESSOS"),
    COMUNICADOS: lerColunasDaFonte("COMUNICADOS"),
  };
  const funcoes = lerFuncoesDaGramatica();

  const executaveis = modelos
    .filter((m) => !m.retirado)
    .map((m) => ({ id: m.id, rotulo: `${m.codigo} v${m.versao} — ${m.nome}` }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Designer de relatórios"
        subtitulo="Modelos desenhados pelo usuário, com campos calculados por gramática segura. Os relatórios legais (RREO, RGF, balanços) são outra coisa e ficam em Relatórios."
      />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Novo modelo
        </h2>
        <FormNovoModelo
          unidades={unidades}
          colunasPorFonte={colunasPorFonte}
          funcoes={funcoes}
        />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Executar
        </h2>
        <FormExecutar modelos={executaveis} unidades={unidades} />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Modelos
        </h2>
        {modelos.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum modelo ainda"
            descricao="Você vê os modelos públicos e os seus. Um modelo restrito não aparece para terceiros nem em cinza — o nome de um relatório costuma dizer o que ele mede."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {modelos.map((m) => (
              <div
                key={m.id}
                className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <strong className="text-sm">
                    {m.codigo} v{m.versao}
                  </strong>
                  <span className="text-sm text-[color:var(--color-ink-2)]">{m.nome}</span>
                  <Badge status={m.visibilidade === "PUBLICO" ? "ok" : "neutro"}>
                    {m.visibilidade === "PUBLICO" ? "público" : "restrito ao autor"}
                  </Badge>
                  <Badge status="neutro">{m.fonte.toLowerCase()}</Badge>
                  {m.retirado ? <Badge status="erro">retirado de vigência</Badge> : null}
                  {m.copiadoDe !== null ? (
                    <Badge status="neutro">cópia de {m.copiadoDe}</Badge>
                  ) : null}
                  {m.distribuidoPara.length > 0 ? (
                    <Badge status="alerta">
                      distribuído para {m.distribuidoPara.join(", ")}
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                  Vigente desde {instante(m.vigenciaInicio)}
                  {m.descricao !== null ? ` · ${m.descricao}` : ""}
                </p>

                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {m.colunas.map((c) => (
                      <tr key={c.ordem}>
                        <td className="py-1 pr-3 text-[color:var(--color-ink-2)]">
                          {c.ordem}
                        </td>
                        <td className="py-1 pr-3">{c.rotulo}</td>
                        <td className="py-1 pr-3 font-mono">{c.expressao}</td>
                        <td className="py-1 text-[color:var(--color-ink-2)]">{c.tipo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {m.meu || m.visibilidade === "PUBLICO" ? (
                  <FormCopiar modeloId={m.id} />
                ) : null}
                {m.meu && !m.retirado ? (
                  <>
                    <FormDistribuir modeloId={m.id} unidades={unidades} />
                    <FormRetirar modeloId={m.id} />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Minhas execuções
        </h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
          A execução é enfileirada e roda em segundo plano; abrir esta tela drena a fila.
          Não há processo dedicado neste ambiente — pendência declarada, e é por isso que
          a lista, e não a requisição do formulário, é quem processa.
        </p>
        {execucoes.length === 0 ? (
          <EstadoVazio titulo="Nenhuma execução ainda" />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
              <tr>
                <th className="py-2 pr-3">Modelo</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">Linhas</th>
                <th className="py-2 pr-3">Pedida em</th>
                <th className="py-2 pr-3">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {execucoes.map((e) => (
                <tr key={e.id} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="py-2 pr-3">{e.modelo}</td>
                  <td className="py-2 pr-3">
                    <Badge
                      status={
                        e.situacao === "CONCLUIDA"
                          ? "ok"
                          : e.situacao === "FALHOU"
                            ? "erro"
                            : "alerta"
                      }
                    >
                      {e.situacao.toLowerCase()}
                    </Badge>
                    {e.detalhe !== null && e.situacao === "FALHOU" ? (
                      <p className="mt-1 whitespace-pre-line text-xs text-[color:var(--color-ink-2)]">
                        {e.detalhe}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{e.linhas ?? "—"}</td>
                  <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                    {instante(e.criadoEm)}
                  </td>
                  <td className="py-2 pr-3">
                    {e.situacao === "CONCLUIDA" ? (
                      <a
                        className="underline underline-offset-2"
                        href={`/relatorios/designer?ver=${e.id}`}
                      >
                        ver
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {csv !== null ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
            Resultado
          </h2>
          <pre className="overflow-x-auto rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink)]">
            {csv}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
