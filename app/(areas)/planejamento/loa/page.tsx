import { Alerta } from "../../../../components/ui/Alerta";
import { BotaoExcel } from "../../../../components/ui/BotaoExcel";
import { BotaoImprimir } from "../../../../components/ui/BotaoImprimir";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { CardEstatistica } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  ConferenciaDaLoaError,
  lerLoa,
  PortaSemBancoError,
  type AnexoDaTela,
  type LinhaDoQuadroDaTela,
  type LoaDaTela,
  type QuadroDaTela,
} from "../../../../lib/portas/loa";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { exercicioAutorizado, ExercicioIlegivelError } from "../../../../lib/recorte";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * LEI ORÇAMENTÁRIA ANUAL — a LOA do exercício consolidada: receita prevista × despesa fixada, o
 * equilíbrio, e os anexos da Lei 4.320/64 que os dados sustentam.
 *
 * ⚠️ SEM SEGUNDA FONTE DE VERDADE: a despesa é a dotação inicial das fichas e a receita é a
 * previsão inicial; esta tela só lê (a elaboração é feita nas fichas e na receita prevista).
 *
 * ⚠️ SEM UNIDADE ORÇAMENTÁRIA, DE PROPÓSITO: a receita prevista é do ente e a LOA é uma lei só. O
 * seletor de unidade do cabeçalho não recorta esta tela, e o subtítulo diz isso.
 *
 * ⚠️ O QUE NÃO SAI É DITO: os demonstrativos que os dados não sustentam aparecem ao fim, com o motivo.
 */
export const dynamic = "force-dynamic";

const TITULO = "Lei Orçamentária Anual";

export default async function LoaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const sp = await searchParams;

  let exercicio: number;
  let loa: LoaDaTela;
  try {
    exercicio = exercicioAutorizado(sp);
    loa = await lerLoa({ exercicio });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo={TITULO} subtitulo="Receita prevista, despesa fixada e anexos da Lei nº 4.320/1964" />
        <EstadoVazio
          titulo={
            erro instanceof ExercicioIlegivelError
              ? "Exercício inválido"
              : erro instanceof PortaSemBancoError
                ? "Serviço indisponível"
                : erro instanceof ConferenciaDaLoaError
                  ? "Os anexos não fecham com os totais da lei"
                  : "Não foi possível carregar a Lei Orçamentária Anual"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  const semDados = loa.resumo.fichas === 0 && loa.resumo.naturezasDeReceita === 0;
  const acoes = semDados ? undefined : (
    <>
      <BotaoPdf href={`/planejamento/loa/pdf?exercicio=${exercicio}`} />
      <BotaoImprimir />
    </>
  );

  return (
    <div className="space-y-6">
      <SincronizarContexto />
      <PageHeader
        titulo={TITULO}
        subtitulo={`Exercício ${exercicio}, consolidado do ente — receita prevista, despesa fixada e anexos da Lei nº 4.320/1964.`}
        acoes={acoes}
      />

      {semDados ? (
        <EstadoVazio
          titulo="Nenhuma previsão cadastrada para o exercício"
          descricao={`Não há fichas orçamentárias nem receita prevista em ${exercicio}. A despesa é fixada em Planejamento › Fichas orçamentárias, e a receita é prevista por natureza e fonte de recurso.`}
        />
      ) : (
        <>
          <Resumo loa={loa} />
          <nav aria-label="Anexos da lei" data-chrome className="flex flex-wrap gap-2 text-xs">
            {loa.anexos.map((a) => (
              <a
                key={a.numero}
                href={`#anexo-${a.numero}`}
                className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1 text-[color:var(--color-primary)] hover:bg-[color:var(--color-surface-2)]"
              >
                Anexo {a.numero}
              </a>
            ))}
          </nav>
          {loa.anexos.map((a) => (
            <Anexo key={a.numero} anexo={a} exercicio={exercicio} />
          ))}
          <NaoEmitidos loa={loa} />
        </>
      )}
    </div>
  );
}

function Resumo({ loa }: { readonly loa: LoaDaTela }): React.ReactElement {
  const r = loa.resumo;
  return (
    <section aria-label="Resumo da lei" className="space-y-3">
      <h2 className="text-base font-semibold text-[color:var(--color-ink)]">Resumo</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <CardEstatistica rotulo="Receita prevista" nota={`${r.naturezasDeReceita} natureza(s) de receita`}>
          <ValorMonetario valor={r.receitaPrevista} />
        </CardEstatistica>
        <CardEstatistica rotulo="Despesa fixada" nota={`${r.fichas} ficha(s) orçamentária(s)`}>
          <ValorMonetario valor={r.despesaFixada} />
        </CardEstatistica>
        <CardEstatistica rotulo="Diferença (receita − despesa)">
          <ValorMonetario valor={r.diferenca} />
        </CardEstatistica>
      </div>
      {r.situacao === "EQUILIBRADA" ? (
        <Alerta status="ok" titulo="Orçamento equilibrado">
          A receita prevista é igual à despesa fixada.
        </Alerta>
      ) : (
        <Alerta status="alerta" titulo="Orçamento desequilibrado">
          {r.situacao === "DESPESA_MAIOR"
            ? "A despesa fixada supera a receita prevista. Revise as fichas orçamentárias ou a previsão da receita antes do envio da lei."
            : "A receita prevista supera a despesa fixada. A diferença não está programada em nenhuma dotação."}
        </Alerta>
      )}
      <p className="text-xs text-[color:var(--color-ink-3)]">
        Valores da lei aprovada: dotação inicial das fichas e previsão inicial da receita. Créditos adicionais e reprevisões
        posteriores constam do Quadro de Detalhamento da Despesa e da reprevisão da receita. Antes de exibidos, todos os anexos
        são conferidos contra estes dois totais.
      </p>
    </section>
  );
}

function colunasDoQuadro(q: QuadroDaTela): ColunaTabela<LinhaDoQuadroDaTela>[] {
  return [
    {
      chave: "codigo",
      cabecalho: "Código",
      alinhamento: "esquerda",
      largura: "9rem",
      celula: (l) => <span className="font-mono text-xs text-[color:var(--color-ink-2)]">{l.codigo}</span>,
    },
    {
      chave: "especificacao",
      cabecalho: "Especificação",
      alinhamento: "esquerda",
      celula: (l) => (
        <span style={{ paddingLeft: `${l.profundidade * 1.25}rem` }} className="inline-block">
          {l.nivel === "nivel1" || l.nivel === "total" ? <strong>{l.especificacao}</strong> : l.especificacao}
        </span>
      ),
    },
    ...q.colunas.map<ColunaTabela<LinhaDoQuadroDaTela>>((c, i) => ({
      chave: `v${i}`,
      cabecalho: c,
      alinhamento: "direita",
      largura: "9.5rem",
      celula: (l) => <ValorMonetario valor={l.valores[i] ?? "0.00"} />,
    })),
  ];
}

function Anexo({ anexo, exercicio }: { readonly anexo: AnexoDaTela; readonly exercicio: number }): React.ReactElement {
  return (
    <section id={`anexo-${anexo.numero}`} aria-label={`Anexo ${anexo.numero}`} className="space-y-3 scroll-mt-4">
      <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] pb-2">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
            Anexo {anexo.numero} — {anexo.titulo}
          </h2>
          <p className="text-xs text-[color:var(--color-ink-3)]">{anexo.fundamento}</p>
        </div>
        <BotaoExcel href={`/planejamento/loa/xlsx?exercicio=${exercicio}&anexo=${anexo.numero}`} />
      </div>
      {anexo.quadros.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma ficha orçamentária no exercício para compor este anexo.</p>
      ) : (
        anexo.quadros.map((q, i) => (
          <div key={`${anexo.numero}-${i}`} className="space-y-1">
            <h3 className="text-sm font-medium text-[color:var(--color-ink-2)]">{q.titulo}</h3>
            <TabelaDeDados
              colunas={colunasDoQuadro(q)}
              linhas={q.linhas}
              keyDe={(l, j) => `${j}-${l.codigo}`}
              ehTotal={(l) => l.nivel === "total"}
              legenda={`${anexo.titulo} — ${q.titulo}. Valores em reais.`}
            />
          </div>
        ))
      )}
      {anexo.notas.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-[color:var(--color-ink-3)]">
          {anexo.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function NaoEmitidos({ loa }: { readonly loa: LoaDaTela }): React.ReactElement | null {
  if (loa.indisponiveis.length === 0) return null;
  return (
    <section aria-label="Demonstrativos não emitidos" className="space-y-3">
      <h2 className="border-b border-[color:var(--color-border)] pb-2 text-base font-semibold text-[color:var(--color-ink)]">
        Demonstrativos não emitidos
      </h2>
      <p className="text-xs text-[color:var(--color-ink-3)]">
        Demonstrativos exigidos para a LOA que dependem de informações ainda não registradas no sistema.
      </p>
      <ul className="space-y-2">
        {loa.indisponiveis.map((i) => (
          <li key={i.titulo} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-sm">
            <p className="font-medium text-[color:var(--color-ink)]">
              {i.numero !== null ? `Anexo ${i.numero} — ` : ""}
              {i.titulo}
            </p>
            <p className="text-xs text-[color:var(--color-ink-3)]">{i.fundamento}</p>
            <p className="mt-1 text-[color:var(--color-ink-2)]">{i.motivo}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
