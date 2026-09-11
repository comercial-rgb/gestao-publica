import Link from "next/link";
import { Badge, type StatusBadge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { EstadoVazio } from "../ui/EstadoVazio";
import { PageHeader } from "../ui/PageHeader";
import { ValorMonetario } from "../ui/ValorMonetario";
import {
  ABAS_DO_MOLDE,
  ROTULO_DA_ABA,
  type AbaDoMolde,
  type DadoDoDetalhe,
  type DefinicaoDeRecurso,
  type LinhaDoHistorico,
  type TipoDeDado,
} from "../../lib/molde/tipos";

// ⚠️ OS DTOs VÊM DE `lib/molde/tipos.ts` — ver a nota no `ListaDeRecurso`.
export type { DadoDoDetalhe, LinhaDoHistorico, TipoDeDado };

/**
 * O DETALHE DO MOLDE — cinco abas FIXAS, e é aqui que o molde liga o que hoje se religa
 * à mão em cada tela.
 *
 * ⚠️ AS ABAS SÃO NAVEGAÇÃO POR URL (`?aba=anexos`), não `useState`. Três razões, e a
 * terceira é a que decide: o endereço reproduz a aba (alguém manda o link do histórico),
 * a aba sobrevive ao refresh, e — sobretudo — **cada aba é lida no servidor só quando é
 * pedida**. Com `useState` as cinco leituras aconteceriam a cada abertura do detalhe, e a
 * de anexos custa I/O.
 *
 * ⚠️ O HISTÓRICO VEM DOS MOVIMENTOS DO PRÓPRIO REGISTRO, e não do `RegistroDeOperacao`.
 *
 * Isso é decisão, e ela tem uma causa medida: `RegistroDeOperacao` guarda QUEM, QUANDO,
 * QUAL AÇÃO e o RESULTADO — e **não guarda qual registro**. "Todas as operações sobre este
 * convênio" é pergunta que aquela tabela não responde. Nas tabelas append-only do
 * repositório a auditoria É a tabela (é o que o `m25-campos-adicionais.prisma` já diz da
 * `ValorDeCampoAdicional`), e é de lá que a linha do tempo sai: cada movimento tem autor,
 * instante, data do fato e motivo.
 *
 * A ausência fica NOMEADA: `AUDITORIA-SEM-EIXO-DE-REGISTRO` — ver `docs/adr/`.
 */

export interface DetalheDeRecursoProps {
  readonly definicao: DefinicaoDeRecurso;
  readonly id: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly selos?: readonly { readonly texto: string; readonly tom: StatusBadge }[];
  readonly abaAtiva: AbaDoMolde;
  /** Só as abas com conteúdo real neste registro. */
  readonly dados: readonly DadoDoDetalhe[];
  readonly camposAdicionais?: readonly DadoDoDetalhe[];
  readonly anexos?: React.ReactNode;
  readonly historico?: readonly LinhaDoHistorico[];
  /** Formulários de ação e de edição — montados pela página, com Server Actions. */
  readonly acoes?: React.ReactNode;
}

function valorFormatado(d: DadoDoDetalhe): React.ReactNode {
  if (d.valor === "") return <span className="text-[color:var(--color-ink-3)]">—</span>;
  if (d.tipo === "dinheiro") return <ValorMonetario valor={d.valor} comSimbolo />;
  if (d.tipo === "data" || d.tipo === "inteiro") {
    return <span className="tabular-nums">{d.valor}</span>;
  }
  return d.valor;
}

export function DetalheDeRecurso({
  definicao: def,
  id,
  titulo,
  subtitulo,
  selos,
  abaAtiva,
  dados,
  camposAdicionais,
  anexos,
  historico,
  acoes,
}: DetalheDeRecursoProps): React.ReactElement {
  const disponiveis = ABAS_DO_MOLDE.filter((a) => def.abas.includes(a));
  const base = `${def.rota}/${id}`;

  return (
    <div className="space-y-4">
      <PageHeader titulo={titulo} subtitulo={subtitulo} />

      {selos !== undefined && selos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {selos.map((s) => (
            <Badge key={s.texto} status={s.tom}>
              {s.texto}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* ⚠️ `<nav>` COM LINKS, e o `aria-current` no ativo. Abas feitas de `<button>` sem
          href não são navegáveis por teclado entre páginas nem compartilháveis. */}
      <nav aria-label="Seções do registro" className="flex flex-wrap gap-1 border-b border-[color:var(--color-border)]">
        {disponiveis.map((a) => {
          const ativa = a === abaAtiva;
          return (
            <Link
              key={a}
              href={a === "dados" ? base : `${base}?aba=${a}`}
              aria-current={ativa ? "page" : undefined}
              data-aba={a}
              className={
                ativa
                  ? "-mb-px border-b-2 border-[color:var(--color-acento)] px-3 py-2 text-sm font-semibold text-[color:var(--color-ink)]"
                  : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]"
              }
            >
              {ROTULO_DA_ABA[a]}
            </Link>
          );
        })}
      </nav>

      {abaAtiva === "dados" ? (
        <>
          <Card>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {dados.map((d) => (
                <div key={d.rotulo} className={d.tipo === "longo" ? "sm:col-span-2 lg:col-span-3" : ""}>
                  <dt className="text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
                    {d.rotulo}
                  </dt>
                  <dd className="mt-0.5 text-sm text-[color:var(--color-ink)]">
                    {valorFormatado(d)}
                  </dd>
                  {d.nota !== undefined ? (
                    <dd className="mt-0.5 text-[11px] text-[color:var(--color-ink-2)]">{d.nota}</dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </Card>
          {acoes}
        </>
      ) : null}

      {abaAtiva === "campos" ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
            Campos adicionais
          </h2>
          {/* ⚠️ O QUE APARECE AQUI É O QUE A ENTIDADE DECLAROU, e o valor é append-only: cada
              correção é um valor novo, e o anterior continua visível no histórico. */}
          {(camposAdicionais ?? []).length === 0 ? (
            <p className="text-xs text-[color:var(--color-ink-2)]">
              Esta entidade não declarou campo adicional nenhum para {def.rotuloSingular.toLowerCase()}.
              Campos adicionais se cadastram por unidade gestora — não são coluna do sistema.
            </p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {(camposAdicionais ?? []).map((c) => (
                <div key={c.rotulo}>
                  <dt className="text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
                    {c.rotulo}
                  </dt>
                  <dd className="mt-0.5 text-sm text-[color:var(--color-ink)]">
                    {valorFormatado(c)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      ) : null}

      {abaAtiva === "anexos" ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Anexos</h2>
          <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
            O download passa pelo servidor, que confere a verificação (SHA-256) do arquivo antes
            de entregá-lo: um arquivo trocado no disco depois de anexado é recusado em vez de ser
            servido como se fosse o original.
          </p>
          {anexos}
        </Card>
      ) : null}

      {abaAtiva === "historico" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Histórico</h2>
          {/* ⚠️ AS DUAS DATAS APARECEM, e elas são diferentes: a data do FATO (quando
              aconteceu) e o instante do REGISTRO (quando alguém digitou). Mostrar só uma
              faria o movimento de março, lançado em maio, parecer de maio. */}
          <p className="mb-3 text-[11px] text-[color:var(--color-ink-2)]">
            Cada linha é um movimento gravado — nada aqui se apaga nem se altera. A correção de
            um movimento é outro movimento, que aponta para o original.
          </p>
          {(historico ?? []).length === 0 ? (
            <p className="text-xs text-[color:var(--color-ink-3)]">
              Nenhum movimento registrado ainda.
            </p>
          ) : (
            <ol className="space-y-2">
              {(historico ?? []).map((h) => (
                <li
                  key={h.id}
                  className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-[color:var(--color-ink)]">
                      {h.oQue}
                      {h.valor !== undefined ? (
                        <span className="ml-2">
                          <ValorMonetario valor={h.valor} comSimbolo />
                        </span>
                      ) : null}
                      {h.estornado === true ? (
                        <span className="ml-2">
                          <Badge status="alerta">estornado</Badge>
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums text-[color:var(--color-ink-3)]">
                      fato em {h.quando} · registrado {h.registradoEm} · {h.por}
                    </span>
                  </div>
                  {h.motivo !== undefined && h.motivo !== null ? (
                    <div className="mt-1 text-[color:var(--color-ink-2)]">{h.motivo}</div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Card>
      ) : null}

      {abaAtiva === "relacionados" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
            Relacionados
          </h2>
          {/* ⚠️ NÃO HÁ CONTAGEM PRÓPRIA AQUI, de propósito. Quem soma empenho é o M05, e uma
              segunda contagem nesta tela seria a segunda verdade sobre a mesma execução. O
              link leva à consulta que já existe, com o filtro deste registro aplicado. */}
          <p className="mb-3 text-[11px] text-[color:var(--color-ink-2)]">
            Os números não são recontados aqui: cada link leva à consulta que já responde
            aquela pergunta, com o filtro deste registro aplicado.
          </p>
          {(def.relacionados ?? []).length === 0 ? (
            <EstadoVazio titulo="Nada relacionado" descricao="Este cadastro não aponta para outra consulta." />
          ) : (
            <ul className="space-y-3">
              {(def.relacionados ?? []).map((r) => (
                <li key={r.rotulo}>
                  <Link
                    href={r.href.replace("{id}", id)}
                    className="text-sm font-medium text-[color:var(--color-ink)] underline underline-offset-2"
                  >
                    {r.rotulo}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-[color:var(--color-ink-2)]">
                    {r.explicacao}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
