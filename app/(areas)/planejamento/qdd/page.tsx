import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { lerQdd, PortaSemBancoError, type LinhaQdd } from "../../../../lib/portas/creditos";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../lib/portas/contexto";
import { descreverRecorte } from "../../../../lib/recorte";

/**
 * QDD — QUADRO DE DETALHAMENTO DA DESPESA, com a coluna que o M03 existe para produzir:
 * a **DOTAÇÃO ATUALIZADA** de cada ficha (TR 4.20–4.40).
 *
 *   dotação inicial (LOA)  +  suplementações  −  anulações  =  dotação ATUALIZADA
 *
 * ⚠️ AS QUATRO COLUNAS SÃO A MESMA LEITURA, e é isso que faz a linha fechar na horizontal. Elas
 * vêm todas do `MovimentoDotacao` (o FATO), somadas pelo `calcularSaldos` do M05 — a mesma função
 * que escreve o cache de saldo da ficha e a mesma que a `reconciliarFicha` usa para conferi-lo.
 * Se a atualizada viesse de uma soma própria desta tela, ela poderia divergir do teto contra o
 * qual o empenho é de fato julgado, e o servidor público planejaria contra um número que o sistema
 * não honra.
 *
 * ⚠️ "DISPONÍVEL" É CACHE, E A LEGENDA DIZ ISSO. Ele é atualizada − reservado − empenhado, lido da
 * coluna de cache da ficha: ORIENTAÇÃO para escolher onde empenhar, nunca a decisão. Quem decide
 * se cabe é o domínio, contra o SUM real, dentro da transação do empenho.
 *
 * ⚠️ SEM COLUNA DE EXECUÇÃO (empenhado/liquidado/pago). O QDD é o quadro do ORÇAMENTO — o que foi
 * autorizado e o que os créditos fizeram com isso. A execução é a tela de empenhos, e o RREO
 * Anexo 1/2 a cruza com a dotação. Misturar as duas aqui daria um quadro que não é nem um nem o
 * outro. Fica NOMEADO, com o caminho, na nota ao pé.
 */
export const dynamic = "force-dynamic";

export default async function QddPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;

  // ⚠️ O CABEÇALHO NASCE DEPOIS DO TRY. Ele imprime `descreverRecorte(recorte)`, e um
  // recorte que ainda não foi autorizado não existe para ser descrito: montá-lo antes
  // afirmaria "consolidado (ente)" na tela de quem acabou de ser recusado.
  let recorte: RecorteDaPagina;
  let linhas: readonly LinhaQdd[];
  try {
    recorte = await recorteDePagina(sp);
    linhas = await lerQdd({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="QDD — Quadro de Detalhamento da Despesa"
          subtitulo="Dotação inicial, créditos e dotação atualizada por ficha"
        />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Banco de dados não configurado"
                  : "Não foi possível ler o QDD"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  // ⚠️ AQUI: agora `recorte` existe e foi autorizado. As três saídas que já o usavam
  // (cabeçalho, estado vazio e o nome do CSV) ficam intocadas.
  const cabecalho = (
    <PageHeader
      titulo="QDD — Quadro de Detalhamento da Despesa"
      subtitulo={`${descreverRecorte(recorte)} — dotação inicial, créditos e dotação atualizada por ficha`}
    />
  );

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A <strong>dotação atualizada</strong> é a inicial mais as suplementações menos as anulações
        dos decretos de crédito adicional — a linha fecha na horizontal porque as quatro colunas saem
        dos <strong>mesmos movimentos de dotação</strong>, não de somas separadas. É este o teto
        contra o qual o empenho é julgado. O <strong>disponível</strong> é cache (atualizada −
        reservado − empenhado): serve para escolher a ficha, nunca para decidir se cabe.
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo="Sem fichas"
          descricao={`Nenhuma ficha orçamentária em ${descreverRecorte(recorte).toLowerCase()}. Ou a LOA do exercício não foi cadastrada, ou a unidade selecionada não tem fichas.`}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <BotaoCsv csv={csvQdd(linhas)} nomeArquivo={`qdd-${recorte.exercicio}.csv`} />
          </div>
          <TabelaDeDados
            colunas={COLUNAS}
            linhas={linhas}
            keyDe={(l) => l.fichaId}
            legenda={`${linhas.length} ficha(s) · valores em R$ · atualizada = inicial + suplementações − anulações.`}
          />
        </>
      )}

      <p className="text-xs text-[color:var(--color-ink-3)]">
        A <strong>execução</strong> de cada ficha (empenhado, liquidado, pago) fica de propósito FORA
        deste quadro — o QDD é o orçamento autorizado. Ela está em{" "}
        <a href="/despesa/empenhos" className="text-[color:var(--color-primary)] hover:underline">Despesa · Empenhos</a>, e cruzada
        com a dotação no RREO Anexo 1.
      </p>
    </div>
  );
}

/** ⚠️ O CSV É A TELA: as mesmas colunas, na mesma ordem, formatadas igual (TR 7.48). */
function csvQdd(linhas: readonly LinhaQdd[]): string {
  return paraCsv(
    // ⚠️ No CSV cada componente da chave é COLUNA PRÓPRIA: quem abre em planilha filtra por função
    // ou por programa, e não conseguiria fazê-lo sobre a string composta que a tela exibe.
    ["Ficha", "Órgão", "Órgão (nome)", "Unidade", "Unidade (nome)", "Programa", "Função", "Subfunção", "Ação", "Fonte", "CO", "Natureza", "Descrição", "Dotação inicial", "Suplementações", "Anulações", "Dotação atualizada", "Disponível (cache)"],
    linhas.map((l) => [
      String(l.numero),
      l.orgaoCodigo, l.orgaoNome, l.unidadeCodigo, l.unidadeNome,
      l.programaCodigo, l.funcaoCodigo, l.subfuncaoCodigo, l.acaoCodigo,
      l.fonteCodigo, l.coCodigo ?? "", l.naturezaCodigo, l.naturezaDescricao,
      formatarMoeda(l.dotacaoInicial).texto,
      formatarMoeda(l.creditoSuplementado).texto,
      formatarMoeda(l.creditoAnulado).texto,
      formatarMoeda(l.dotacaoAtualizada).texto,
      formatarMoeda(l.saldoDisponivel).texto,
    ])
  );
}

/**
 * A CHAVE ORÇAMENTÁRIA, em uma célula só.
 *
 * ⚠️ POR QUE COMPOSTA, E NÃO NOVE COLUNAS. A chave tem nove componentes; nove colunas empurrariam
 * as cinco colunas de dinheiro para fora da tela, e é o dinheiro que o leitor do QDD compara entre
 * linhas. Composta em monoespaçado com separador "›", ela se lê da esquerda para a direita na ordem
 * OFICIAL da `uq_ficha_sagres` e cabe ao lado dos valores. Os nomes por extenso vão no `title` (o
 * hover) e cada componente vira COLUNA PRÓPRIA no CSV — a tela otimiza para comparação, o CSV para
 * filtro em planilha.
 */
function Chave({ l }: { readonly l: LinhaQdd }): React.ReactElement {
  const partes = [l.orgaoCodigo, l.unidadeCodigo, l.programaCodigo, l.funcaoCodigo, l.subfuncaoCodigo, l.acaoCodigo, l.fonteCodigo, l.coCodigo ?? "—", l.naturezaCodigo];
  const porExtenso = [
    `Órgão ${l.orgaoCodigo} — ${l.orgaoNome}`,
    `Unidade ${l.unidadeCodigo} — ${l.unidadeNome}`,
    `Programa ${l.programaCodigo} — ${l.programaDescricao}`,
    `Função ${l.funcaoCodigo} — ${l.funcaoNome}`,
    `Subfunção ${l.subfuncaoCodigo} — ${l.subfuncaoNome}`,
    `Ação ${l.acaoCodigo} — ${l.acaoDescricao}`,
    `Fonte ${l.fonteCodigo}`,
    l.coCodigo !== null ? `CO ${l.coCodigo} — ${l.coDescricao ?? ""}` : "CO: a ficha não tem",
    `Natureza ${l.naturezaCodigo} — ${l.naturezaDescricao}`,
  ].join("\n");
  return (
    <span className="font-mono text-xs text-[color:var(--color-ink-2)]" title={porExtenso}>
      {partes.join("›")}
    </span>
  );
}

const COLUNAS: readonly ColunaTabela<LinhaQdd>[] = [
  { chave: "ficha", cabecalho: "Ficha", alinhamento: "direita", largura: "4rem", celula: (l) => l.numero },
  { chave: "chave", cabecalho: "Órgão›Unidade›Programa›Função›Subfunção›Ação›Fonte›CO›Natureza", alinhamento: "esquerda", celula: (l) => <Chave l={l} /> },
  { chave: "descricao", cabecalho: "Descrição", alinhamento: "esquerda", celula: (l) => l.naturezaDescricao },
  { chave: "inicial", cabecalho: "Dotação inicial", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.dotacaoInicial} /> },
  { chave: "suplementado", cabecalho: "Suplementações", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.creditoSuplementado} /> },
  // ⚠️ A anulação vai com sinal −: ela REDUZ a dotação, e a coluna tem de deixar isso óbvio para
  // quem soma a linha com o olho. O `ValorMonetario` a imprime entre parênteses (convenção contábil).
  { chave: "anulado", cabecalho: "Anulações", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.creditoAnulado === "0.00" ? "0.00" : `-${l.creditoAnulado}`} /> },
  { chave: "atualizada", cabecalho: "Dotação atualizada", alinhamento: "direita", largura: "10rem", celula: (l) => <strong><ValorMonetario valor={l.dotacaoAtualizada} /></strong> },
  { chave: "disponivel", cabecalho: "Disponível (cache)", alinhamento: "direita", largura: "10rem", celula: (l) => <ValorMonetario valor={l.saldoDisponivel} /> },
];
