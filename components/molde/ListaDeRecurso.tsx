import Link from "next/link";
import { BarraFiltros } from "../ui/BarraFiltros";
import { Badge } from "../ui/Badge";
import { BotaoCsv } from "../ui/BotaoCsv";
import { Card } from "../ui/Card";
import { EstadoVazio } from "../ui/EstadoVazio";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../ui/Formulario";
import { PageHeader } from "../ui/PageHeader";
import { Paginacao } from "../ui/Paginacao";
import { TabelaDeDados, type ColunaTabela } from "../ui/TabelaDeDados";
import { ValorMonetario } from "../ui/ValorMonetario";
import { paraCsv } from "../../lib/csv/csv";
import type {
  ColunaDoMolde,
  DefinicaoDeRecurso,
  FiltroDoMolde,
  LinhaDoMolde,
} from "../../lib/molde/tipos";

/**
 * A LISTAGEM DO MOLDE — filtros compostos, ordenação, exportação, seleção com soma.
 *
 * ⚠️ TUDO NA URL, NADA EM `useState`. Filtro, página, ordenação e seleção são query string,
 * e por isso a lista é LINKÁVEL, sobrevive ao refresh, abre em nova aba e funciona sem JS.
 * É a mesma decisão que a `TabelaDeDados` já tomou para a ordenação (ver o docblock dela) e
 * que a `BarraFiltros` tomou ao ser um `<form method="get">`.
 *
 * ⚠️ ESTE É UM SERVER COMPONENT, e é o que faz a SOMA ser do servidor. O total de uma
 * seleção é dinheiro; somar no browser exigiria float ou embarcar `decimal.js` na ilha. O
 * chamador soma em Decimal pela mesma porta que leu a lista e passa o resultado como string.
 */

// ⚠️ `LinhaDoMolde` MORA EM `lib/molde/tipos.ts`, e não aqui: a PORTA também precisa dele, e
// uma porta que importa um componente inverte a dependência — o dado passando a depender do
// pixel. Foi o que `test/ui/fronteira-ui.test.ts` acusou na primeira versão.
export type { LinhaDoMolde };

export interface ListaDeRecursoProps {
  readonly definicao: DefinicaoDeRecurso;
  readonly linhas: readonly LinhaDoMolde[];
  readonly total: number;
  readonly pagina: number;
  readonly tamanhoPagina: number;
  /** Os valores vigentes dos filtros, por nome. */
  readonly filtrosVigentes: Readonly<Record<string, string>>;
  readonly ordem: string | null;
  readonly direcao: "asc" | "desc";
  /** Os ids marcados, e o total deles POR COLUNA SOMÁVEL — somado no servidor. */
  readonly selecionados: readonly string[];
  readonly somaDaSelecao: Readonly<Record<string, string>>;
  /** O formulário de criação, quando o usuário pode criar. Ausente ⇒ sem botão. */
  readonly formulario?: React.ReactNode;
  /** Motivo pelo qual não há formulário — sempre dito, nunca silencioso. */
  readonly motivoSemCriar?: string;
}

function hrefCom(
  rota: string,
  base: Readonly<Record<string, string>>,
  mudancas: Readonly<Record<string, string | null>>
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== "") p.set(k, v);
  for (const [k, v] of Object.entries(mudancas)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  const q = p.toString();
  return q === "" ? rota : `${rota}?${q}`;
}

function celula(coluna: ColunaDoMolde, linha: LinhaDoMolde, rota: string): React.ReactNode {
  const valor = linha[coluna.nome] ?? "";
  switch (coluna.tipo) {
    case "dinheiro":
      return <ValorMonetario valor={valor === "" ? "0.00" : valor} />;
    case "link":
      return (
        <Link
          href={`${rota}/${linha.id}`}
          className="font-medium text-[color:var(--color-ink)] underline-offset-2 hover:underline"
        >
          {valor}
        </Link>
      );
    case "situacao":
      return valor === "" ? (
        <span className="text-[color:var(--color-ink-3)]">—</span>
      ) : (
        <Badge status={linha[`${coluna.nome}Tom`] === "alerta" ? "alerta" : "neutro"}>
          {valor}
        </Badge>
      );
    case "data":
    case "inteiro":
      return <span className="tabular-nums">{valor === "" ? "—" : valor}</span>;
    default:
      return valor === "" ? <span className="text-[color:var(--color-ink-3)]">—</span> : valor;
  }
}

const ALINHAMENTO = {
  dinheiro: "direita",
  inteiro: "direita",
  data: "esquerda",
  texto: "esquerda",
  link: "esquerda",
  situacao: "esquerda",
} as const;

function CampoDeFiltro({
  filtro,
  valor,
}: {
  readonly filtro: FiltroDoMolde;
  readonly valor: string;
}): React.ReactElement {
  const span =
    filtro.largura === 1
      ? "md:col-span-1"
      : filtro.largura === 3
        ? "md:col-span-3"
        : filtro.largura === 4
          ? "md:col-span-4"
          : "md:col-span-2";
  return (
    <label className={`text-xs text-[color:var(--color-ink-2)] ${span}`}>
      <span className={ROTULO}>{filtro.rotulo}</span>
      {filtro.tipo === "selecao" ? (
        <select name={filtro.nome} defaultValue={valor} className={CAMPO}>
          <option value="">Todos</option>
          {(filtro.opcoes ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={filtro.nome}
          type={filtro.tipo === "data" ? "date" : filtro.tipo === "inteiro" ? "number" : "text"}
          defaultValue={valor}
          className={CAMPO}
          {...(filtro.placeholder !== undefined ? { placeholder: filtro.placeholder } : {})}
        />
      )}
    </label>
  );
}

export function ListaDeRecurso({
  definicao: d,
  linhas,
  total,
  pagina,
  tamanhoPagina,
  filtrosVigentes,
  ordem,
  direcao,
  selecionados,
  somaDaSelecao,
  formulario,
  motivoSemCriar,
}: ListaDeRecursoProps): React.ReactElement {
  const somaveis = d.colunas.filter((c) => c.somavel === true);
  const marcados = new Set(selecionados);

  // ⚠️ A COLUNA DE SELEÇÃO SÓ EXISTE SE HOUVER O QUE SOMAR. Caixas de marcação sem total é
  // interface que promete uma operação que não existe.
  const colunas: readonly ColunaTabela<LinhaDoMolde>[] = [
    ...(somaveis.length > 0
      ? [
          {
            chave: "__selecao",
            cabecalho: "",
            largura: "2.5rem",
            celula: (l: LinhaDoMolde) => (
              <input
                type="checkbox"
                name="sel"
                value={l.id}
                defaultChecked={marcados.has(l.id)}
                aria-label={`Selecionar ${l[d.colunas[0]!.nome] ?? l.id}`}
                className="h-4 w-4"
              />
            ),
          } satisfies ColunaTabela<LinhaDoMolde>,
        ]
      : []),
    ...d.colunas.map(
      (c): ColunaTabela<LinhaDoMolde> => ({
        chave: c.nome,
        cabecalho: c.cabecalho,
        alinhamento: ALINHAMENTO[c.tipo],
        celula: (l) => celula(c, l, d.rota),
        ...(c.ordenavel === true ? { ordenavel: true } : {}),
      })
    ),
  ];

  const csv = paraCsv(
    d.colunas.map((c) => c.cabecalho),
    linhas.map((l) => d.colunas.map((c) => l[c.nome] ?? ""))
  );

  const semFiltro = Object.fromEntries(
    Object.entries(filtrosVigentes).map(([k]) => [k, ""])
  );

  return (
    <div className="space-y-4">
      <PageHeader titulo={d.rotulo} subtitulo={d.descricao} />

      {d.filtros.length > 0 ? (
        <BarraFiltros hrefLimpar={d.rota}>
          {d.filtros.map((f) => (
            <CampoDeFiltro key={f.nome} filtro={f} valor={filtrosVigentes[f.nome] ?? ""} />
          ))}
        </BarraFiltros>
      ) : null}

      {formulario ?? (
        motivoSemCriar !== undefined ? (
          <Card>
            <p className="text-xs text-[color:var(--color-ink-2)]">{motivoSemCriar}</p>
          </Card>
        ) : null
      )}

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo={`Nenhum registro`}
          descricao={
            Object.values(filtrosVigentes).some((v) => v !== "")
              ? "Nenhum registro atende aos filtros aplicados. Limpe os filtros para ver a lista inteira."
              : d.descricao
          }
        />
      ) : (
        <Card>
          {/*
            ⚠️ A SELEÇÃO É UM `<form method="get">`, e o total vem do SERVIDOR.
            Somar no browser exigiria float (proibido para dinheiro) ou embarcar `decimal.js`
            na ilha. Aqui o submit devolve `?sel=a&sel=b`, o servidor soma em Decimal pela
            mesma porta que leu a lista, e o total aparece abaixo — linkável e sem JS.
          */}
          <form method="get" action={d.rota} data-acao={`somar-${d.nome}`}>
            {Object.entries(filtrosVigentes).map(([k, v]) =>
              v === "" ? null : <input key={k} type="hidden" name={k} value={v} />
            )}
            {ordem !== null ? <input type="hidden" name="ordem" value={ordem} /> : null}
            {ordem !== null ? <input type="hidden" name="dir" value={direcao} /> : null}
            <input type="hidden" name="pagina" value={String(pagina)} />

            <TabelaDeDados
              colunas={colunas}
              linhas={linhas}
              keyDe={(l) => l.id}
              legenda={`${d.rotulo} — página ${pagina}`}
              ordenacao={ordem === null ? null : { campo: ordem, direcao }}
              hrefDeOrdenacao={(campo, dir) =>
                hrefCom(d.rota, filtrosVigentes, { ordem: campo, dir, pagina: "1" })
              }
            />

            {somaveis.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)] pt-4">
                <div className="text-xs text-[color:var(--color-ink-2)]">
                  {selecionados.length === 0 ? (
                    <>Marque linhas e clique em somar — o total é calculado no servidor.</>
                  ) : (
                    <span data-soma-selecao>
                      {selecionados.length} selecionada(s):{" "}
                      {somaveis.map((c) => (
                        <span key={c.nome} className="ml-2">
                          {c.cabecalho}{" "}
                          <strong data-soma={c.nome}>
                            <ValorMonetario valor={somaDaSelecao[c.nome] ?? "0.00"} />
                          </strong>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <button type="submit" className={CLASSE_BOTAO_PRIMARIO}>
                  Somar selecionadas
                </button>
              </div>
            ) : null}
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)] pt-4">
            <Paginacao
              pagina={pagina}
              tamanhoPagina={tamanhoPagina}
              total={total}
              rotuloItens={d.rotulo.toLowerCase()}
              hrefDePagina={(p) => hrefCom(d.rota, filtrosVigentes, { pagina: String(p) })}
            />
            {/* ⚠️ O CSV É DA PÁGINA VISÍVEL, e o rótulo diz isso. Exportar "tudo" a partir de
                uma lista paginada é a promessa mais fácil de quebrar: o arquivo sairia com 25
                linhas e o nome diria o contrário. */}
            <BotaoCsv csv={csv} nomeArquivo={`${d.nome}-pagina-${pagina}.csv`} />
          </div>
        </Card>
      )}

      <p className="text-[11px] text-[color:var(--color-ink-3)]">
        Filtros, ordenação, página e seleção ficam no endereço desta tela — o link reproduz
        exatamente o que está à vista. <Link href={hrefCom(d.rota, semFiltro, {})} className="underline underline-offset-2">Ver sem filtro</Link>.
      </p>
    </div>
  );
}
