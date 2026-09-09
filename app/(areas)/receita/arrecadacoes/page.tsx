import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import {
  TabelaDeDados,
  type ColunaTabela,
} from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  lerArrecadacoes,
  lerNaturezasPrevistas,
  PortaSemBancoError,
  type ArrecadacaoDaTela,
  type ArrecadacaoDoPeriodo,
  type NaturezaDaTela,
} from "../../../../lib/portas/arrecadacao";
import { dataBr, recorteDe } from "../../../../lib/recorte";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { FormArrecadacao } from "./FormArrecadacao";
import { FormAnularReceita } from "./FormAnularReceita";

/**
 * ARRECADAÇÃO — as guias do exercício e o total realizado LÍQUIDO (TR 4.59).
 *
 * ⚠️ ESTA PÁGINA IGNORA O SELETOR DE UNIDADE, DE PROPÓSITO. A receita é do ENTE (CF art. 167,
 * IV): a `ReceitaArrecadada` tem natureza e fonte, e NÃO tem unidade orçamentária — a
 * Secretaria de Saúde não "possui" o IPTU que entrou. Filtrar receita por UG ensinaria ao
 * usuário um conceito que a Constituição não tem. A vinculação por FONTE é outra coisa, e ela
 * está na tabela.
 *
 * ⚠️ A ANULAÇÃO (4.61) é ato PRÓPRIO, com guia própria e total (o serviço não tem parcial). Cada
 * arrecadação viva ganha a ação "Anular"; a guia já anulada não a mostra (não se anula duas vezes).
 */
export const dynamic = "force-dynamic";

export default async function ArrecadacoesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const { exercicio } = recorteDe(await searchParams);

  const cabecalho = (
    <PageHeader
      titulo="Arrecadação"
      subtitulo={`Exercício ${exercicio} — guias do ente, por natureza e fonte (a receita não tem UG)`}
    />
  );

  let periodo: ArrecadacaoDoPeriodo;
  let naturezas: readonly NaturezaDaTela[];
  try {
    [periodo, naturezas] = await Promise.all([
      lerArrecadacoes({ exercicio }),
      lerNaturezasPrevistas({ exercicio }),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível ler a arrecadação"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O registro é <strong>append-only</strong>: a guia anulada continua na lista, e a anulação
        aparece ao lado dela com sinal negativo. O <strong>total</strong> é a receita realizada
        líquida — Σ(arrecadações) − Σ(anulações). O corte é pela{" "}
        <strong>data de arrecadação</strong> (o fato), nunca pela data de digitação. O rol da
        LOA é <strong>sugestão</strong>, não restrição: receita não prevista existe, e é o que
        o Anexo 1 mostra como arrecadado além do previsto.
      </div>

      <FormArrecadacao
        exercicio={exercicio}
        naturezas={naturezas.map((n) => ({
          naturezaCodigo: n.naturezaCodigo,
          naturezaDescricao: n.naturezaDescricao,
          fonteCodigo: n.fonteCodigo,
        }))}
      />

      {periodo.linhas.length === 0 ? (
        <EstadoVazio
          titulo="Sem arrecadação"
          descricao={`Nenhuma guia registrada no exercício ${exercicio}.`}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <BotaoCsv csv={csvArrecadacoes(periodo.linhas)} nomeArquivo={`arrecadacoes-${exercicio}.csv`} />
              <BotaoPdf href={`/receita/arrecadacoes/pdf?exercicio=${exercicio}`} />
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[color:var(--color-ink-2)]">Receita realizada líquida:</span>
              <strong className="text-base"><ValorMonetario valor={periodo.total} comSimbolo /></strong>
            </span>
          </div>
          <TabelaDeDados
            colunas={colunasArrecadacao(
              // As receitas JÁ anuladas: a `anulacaoDeId` de uma linha de anulação aponta a guia que ela nega.
              new Set(periodo.linhas.filter((l) => l.anulacaoDeId !== null).map((l) => l.anulacaoDeId!)),
              exercicio
            )}
            linhas={periodo.linhas}
            keyDe={(l) => l.id}
            legenda={`${periodo.linhas.length} guia(s) · valores em R$ · o total desconta as anulações.`}
          />
        </>
      )}
    </div>
  );
}

function colunasArrecadacao(anuladas: ReadonlySet<string>, exercicio: number): readonly ColunaTabela<ArrecadacaoDaTela>[] {
  return [...COLUNAS, colunaAcoes(anuladas, exercicio)];
}

function colunaAcoes(anuladas: ReadonlySet<string>, exercicio: number): ColunaTabela<ArrecadacaoDaTela> {
  return {
    chave: "acoes",
    cabecalho: "Ações",
    alinhamento: "esquerda",
    largura: "9rem",
    // Toda guia emite o seu documento (F3). Só a ARRECADAÇÃO viva se anula: não a própria anulação
    // (sinal −1), nem uma guia já anulada.
    celula: (l) => (
      <span className="flex flex-wrap items-center gap-2">
        <a href={`/receita/arrecadacoes/guia?id=${l.id}&exercicio=${exercicio}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[color:var(--color-primary)] hover:underline">
          Emitir guia
        </a>
        {l.sinal === -1 || anuladas.has(l.id) ? null : <FormAnularReceita receitaId={l.id} />}
      </span>
    ),
  };
}

const COLUNAS: readonly ColunaTabela<ArrecadacaoDaTela>[] = [
  {
    chave: "data",
    cabecalho: "Data",
    alinhamento: "esquerda",
    largura: "6rem",
    celula: (l) => dataBr(l.dataArrecadacao),
  },
  {
    chave: "guia",
    cabecalho: "Guia",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => l.numeroReceita,
  },
  {
    chave: "natureza",
    cabecalho: "Natureza",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => l.naturezaCodigo,
  },
  {
    chave: "descricao",
    cabecalho: "Descrição",
    alinhamento: "esquerda",
    celula: (l) => l.naturezaDescricao,
  },
  {
    chave: "fonte",
    cabecalho: "Fonte",
    alinhamento: "esquerda",
    largura: "4rem",
    celula: (l) => l.fonteCodigo,
  },
  {
    chave: "co",
    cabecalho: "CO",
    alinhamento: "esquerda",
    largura: "4rem",
    celula: (l) => l.coCodigo ?? "—",
  },
  {
    chave: "tipo",
    cabecalho: "Tipo",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) =>
      l.sinal === -1 ? (
        <Badge status="erro">Anulação</Badge>
      ) : (
        <Badge status="neutro">Arrecadação</Badge>
      ),
  },
  {
    chave: "valor",
    cabecalho: "Valor",
    alinhamento: "direita",
    largura: "10rem",
    // ⚠️ O SINAL ENTRA AQUI, não no dado: a anulação é gravada com valor POSITIVO
    // (o valor da guia que ela anula) e sinal −1. A tela mostra o efeito dela sobre
    // o total — que é o que o leitor está somando com o olho.
    celula: (l) => (
      <ValorMonetario valor={l.sinal === -1 ? `-${l.valor}` : l.valor} />
    ),
  },
];

/** ⚠️ O CSV É A TELA (TR 7.48) — a anulação leva o sinal −, como na coluna Valor. */
function csvArrecadacoes(linhas: readonly ArrecadacaoDaTela[]): string {
  return paraCsv(
    ["Data", "Guia", "Natureza", "Descrição", "Fonte", "CO", "Tipo", "Valor"],
    linhas.map((l) => [
      dataBr(l.dataArrecadacao), l.numeroReceita, l.naturezaCodigo, l.naturezaDescricao, l.fonteCodigo,
      l.coCodigo ?? "—", l.sinal === -1 ? "Anulação" : "Arrecadação",
      formatarMoeda(l.sinal === -1 ? `-${l.valor}` : l.valor).texto,
    ])
  );
}
