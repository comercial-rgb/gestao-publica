import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { BotaoCsv } from "../../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../../components/ui/BotaoPdf";
import { csvDasTabelas, tabelasDoBalancoOrcamentario } from "../../../../../lib/relatorios/tabelas-dos-demonstrativos";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarBalancoOrcamentario,
  PortaSemBancoError,
  type BalancoOrcamentario,
} from "../../../../../lib/portas/demonstrativos";
import { hrefDaComposicao } from "../../../../../lib/portas/composicao";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { SeletorExercicio } from "../SeletorExercicio";
import { lerExercicio } from "../exercicio";
import { LinkDoBalancete } from "../ContasDaLinha";

/** ANEXO 12 — Balanço Orçamentário (Lei 4.320, art. 102). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

type LinhaReceita = BalancoOrcamentario["receitas"][number];
type LinhaDespesa = BalancoOrcamentario["despesas"][number];

export default async function BalancoOrcamentarioPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const { exercicio, exercicioStr } = lerExercicio(sp);

  const cabecalho = (
    <PageHeader
      titulo="Balanço Orçamentário"
      subtitulo="Receita prevista e realizada, despesa fixada e executada (art. 102 da Lei 4.320)"
      acoes={
        <div className="flex flex-col items-end gap-1">
          <SeletorExercicio exercicio={exercicioStr} />
          <LinkDoBalancete desde={`${exercicioStr}-01-01`} ate={`${exercicioStr}-12-31`} />
        </div>
      }
    />
  );

  let dados: BalancoOrcamentario;
  try {
    dados = await gerarBalancoOrcamentario({ exercicio });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível emitir o Balanço Orçamentário"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}
      {/* V34 — o PDF e o CSV saem da MESMA apuração desta tela (as tabelas de `lib/relatorios/tabelas-dos-demonstrativos.ts`). */}
      <div className="flex justify-end gap-2" data-chrome>
        <BotaoPdf href={`/relatorios/demonstracoes/balanco-orcamentario/pdf?exercicio=${String(exercicio)}`} />
        <BotaoCsv csv={csvDasTabelas(tabelasDoBalancoOrcamentario(dados))} nomeArquivo={`balanco-orcamentario-${String(exercicio)}.csv`} />
      </div>
      <div>
        <Badge status={dados.parcial ? "alerta" : "ok"}>
          {dados.parcial
            ? `Exercício ${dados.exercicio} em andamento — posição parcial`
            : `Exercício ${dados.exercicio} encerrado`}
        </Badge>
      </div>

      {dados.receitas.length === 0 ? (
        <EstadoVazio titulo="Sem receita no exercício" descricao="Não há receita prevista nem arrecadada no exercício selecionado." />
      ) : (
        <TabelaDeDados
          colunas={colunasDaReceita(exercicio)}
          linhas={dados.receitas}
          keyDe={(l, i) => `${l.codigo ?? l.nota ?? "r"}-${i}`}
          ehTotal={(l) => l.nivel === "TOTAL"}
          legenda="Receitas — valores em R$ · (a) previsão inicial · (b) previsão atualizada · (c) realizada · (d) = c − b"
        />
      )}

      {dados.despesas.length === 0 ? (
        <EstadoVazio titulo="Sem despesa no exercício" descricao="Não há dotação nem execução no exercício selecionado." />
      ) : (
        <TabelaDeDados
          colunas={colunasDaDespesa(exercicio)}
          linhas={dados.despesas}
          keyDe={(l, i) => `${l.codigo ?? l.nota ?? "d"}-${i}`}
          ehTotal={(l) => l.nivel === "TOTAL"}
          legenda="Despesas — valores em R$ · (e) dotação inicial · (f) créditos adicionais · (g) = e + f · (h) empenhada · (i) liquidada · (j) paga · (k) = g − h"
        />
      )}
    </div>
  );
}

/** V33 — o código da categoria, da origem e do grupo abre a composição da linha. */
function CodigoDaLinha({ codigo, href }: { readonly codigo: string | null; readonly href: string | null }): React.ReactElement {
  if (codigo === null) return <></>;
  if (href === null) return <>{codigo}</>;
  return (
    <Link className="font-mono text-[color:var(--color-primary)] underline" href={href} title="Abrir os documentos que formam esta linha">
      {codigo}
    </Link>
  );
}

const colunasDaReceita = (exercicio: number): readonly ColunaTabela<LinhaReceita>[] => [
  { chave: "nota", cabecalho: "Nota", celula: (l) => l.nota ?? "" },
  {
    chave: "codigo",
    cabecalho: "Código",
    celula: (l) => (
      <CodigoDaLinha
        codigo={l.codigo}
        href={l.codigo !== null && (l.nivel === "CATEGORIA" || l.nivel === "ORIGEM") ? hrefDaComposicao({ tipo: "BO_RECEITA", codigo: l.codigo }, exercicio) : null}
      />
    ),
  },
  { chave: "rotulo", cabecalho: "Especificação", celula: (l) => l.rotulo ?? "" },
  { chave: "previsaoInicial", cabecalho: "Previsão inicial (a)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.previsaoInicial} /> },
  { chave: "previsaoAtualizada", cabecalho: "Previsão atualizada (b)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.previsaoAtualizada} /> },
  { chave: "realizadas", cabecalho: "Realizada (c)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.realizadas} /> },
  { chave: "saldo", cabecalho: "Saldo (d)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.saldo} /> },
];

const colunasDaDespesa = (exercicio: number): readonly ColunaTabela<LinhaDespesa>[] => [
  { chave: "nota", cabecalho: "Nota", celula: (l) => l.nota ?? "" },
  {
    chave: "codigo",
    cabecalho: "Código",
    celula: (l) => (
      <CodigoDaLinha
        codigo={l.codigo}
        href={l.codigo !== null && (l.nivel === "CATEGORIA" || l.nivel === "GRUPO") ? hrefDaComposicao({ tipo: "BO_DESPESA", codigo: l.codigo }, exercicio) : null}
      />
    ),
  },
  { chave: "rotulo", cabecalho: "Especificação", celula: (l) => l.rotulo },
  { chave: "dotacaoInicial", cabecalho: "Dotação inicial (e)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.dotacaoInicial} /> },
  { chave: "creditosAdicionais", cabecalho: "Créditos adicionais (f)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.creditosAdicionais} /> },
  { chave: "dotacaoAtualizada", cabecalho: "Dotação atualizada (g)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.dotacaoAtualizada} /> },
  { chave: "empenhadas", cabecalho: "Empenhada (h)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.empenhadas} /> },
  { chave: "liquidadas", cabecalho: "Liquidada (i)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.liquidadas} /> },
  { chave: "pagas", cabecalho: "Paga (j)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.pagas} /> },
  { chave: "saldoDotacao", cabecalho: "Saldo (k)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.saldoDotacao} /> },
];
