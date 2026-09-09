import { Badge } from "../../../../components/ui/Badge";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { lerDecretos, PortaSemBancoError, type DecretoNaLista } from "../../../../lib/portas/creditos";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { dataBr, recorteDe } from "../../../../lib/recorte";
import {
  filtrarAtualizacoes,
  linhasDeAtualizacao,
  opcoesDeFiltro,
  totaisDeAtualizacoes,
  type LinhaAtualizacao,
} from "../../../../lib/relatorios/atualizacoes-orcamentarias";
import { FiltroAtualizacoes } from "./FiltroAtualizacoes";

/**
 * RELATÓRIO DE ATUALIZAÇÕES ORÇAMENTÁRIAS (TR 4.40) — uma linha por MOVIMENTO de crédito, com
 * filtros por ficha, decreto, fonte e UG, e emissão em PDF e CSV.
 *
 * ⚠️ O GRÃO É O MOVIMENTO, não o decreto. A tela de créditos adicionais responde "o que este
 * decreto fez"; o 4.40 responde a pergunta inversa — "o que aconteceu com ESTA ficha / ESTA fonte
 * ao longo do exercício, e por qual decreto". É a mesma leitura (`lerDecretos`), achatada: uma
 * segunda consulta ao banco produziria dois relatórios livres para discordar sobre o mesmo fato.
 *
 * ⚠️ O PDF E O CSV LEVAM O MESMO RECORTE, porque o filtro mora na URL — a rota de PDF relê os
 * mesmos parâmetros, e o CSV é montado das linhas já filtradas desta página. "O PDF é a tela"
 * (7.15) só é verdade se os três nascerem do mesmo recorte.
 */
export const dynamic = "force-dynamic";

const TIPO_ROTULO: Record<string, string> = { SUPLEMENTAR: "Suplementar", ESPECIAL: "Especial", EXTRAORDINARIO: "Extraordinário" };
const ORIGEM_ROTULO: Record<string, string> = {
  ANULACAO: "Anulação", SUPERAVIT_FINANCEIRO: "Superávit financeiro",
  EXCESSO_ARRECADACAO: "Excesso de arrecadação", OPERACAO_CREDITO: "Operação de crédito",
};

export default async function AtualizacoesOrcamentariasPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const { exercicio } = recorteDe(sp);
  const um = (k: string): string => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const filtro = { ficha: um("ficha"), decreto: um("decreto"), fonte: um("fonte"), unidade: um("unidade") };

  let decretos: readonly DecretoNaLista[];
  try {
    decretos = await lerDecretos({ ano: exercicio });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Atualizações orçamentárias" subtitulo={`Exercício ${exercicio} — TR 4.40`} />
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler as atualizações"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const todas = linhasDeAtualizacao(decretos);
  const opcoes = opcoesDeFiltro(todas);
  const linhas = filtrarAtualizacoes(todas, filtro);
  const totais = totaisDeAtualizacoes(linhas);

  const cabecalho = (
    <PageHeader
      titulo="Atualizações orçamentárias"
      subtitulo={`Exercício ${exercicio} — todo movimento de crédito adicional, por ficha, decreto, fonte e UG (TR 4.40)`}
      acoes={<FiltroAtualizacoes {...opcoes} {...filtro} />}
    />
  );

  const query = new URLSearchParams({ exercicio: String(exercicio) });
  for (const [k, v] of Object.entries(filtro)) if (v !== "") query.set(k, v);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cada linha é <strong>um movimento</strong> de um decreto sobre uma ficha. Os totais somam
        <strong> as linhas exibidas</strong> — filtrar muda o total, e é assim que ele se confere.
        Movimentos <strong>estornados</strong> continuam listados (o fato aconteceu) e ficam
        <strong> fora dos totais</strong>, como na tela de créditos.
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo="Sem atualizações"
          descricao={
            todas.length === 0
              ? `Nenhum movimento de crédito adicional no exercício ${exercicio}.`
              : "Nenhum movimento atende aos filtros selecionados. Limpe um dos filtros para ampliar o recorte."
          }
        />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <BotaoCsv csv={csvAtualizacoes(linhas)} nomeArquivo={`atualizacoes-orcamentarias-${exercicio}.csv`} />
            <BotaoPdf href={`/relatorios/atualizacoes-orcamentarias/pdf?${query.toString()}`} />
          </div>
          <TabelaDeDados
            colunas={COLUNAS}
            linhas={linhas}
            keyDe={(l) => l.id}
            legenda={
              `${linhas.length} movimento(s) · valores em R$ · suplementado ${formatarMoeda(totais.suplementado).texto} · ` +
              `anulado ${formatarMoeda(totais.anulado).texto} · efeito líquido no orçamento ${formatarMoeda(totais.liquido).texto}.`
            }
          />
        </>
      )}
    </div>
  );
}

/** ⚠️ O CSV É A TELA: mesmas colunas, mesma ordem, mesmos filtros (TR 7.48). */
function csvAtualizacoes(linhas: readonly LinhaAtualizacao[]): string {
  return paraCsv(
    ["Data", "Decreto", "Lei", "Tipo de crédito", "Origem", "Ficha", "UG", "Fonte", "Movimento", "Valor", "Situação"],
    linhas.map((l) => [
      dataBr(l.data), `${l.decretoNumero}/${l.decretoAno}`, `${l.leiNumero}/${l.leiAno}`,
      TIPO_ROTULO[l.tipoCredito] ?? l.tipoCredito, ORIGEM_ROTULO[l.origemRecurso] ?? l.origemRecurso,
      String(l.fichaNumero), l.unidadeCodigo, l.fonteCodigo,
      l.tipo === "SUPLEMENTACAO" ? "Suplementação" : "Anulação",
      formatarMoeda(l.tipo === "ANULACAO" ? `-${l.valor}` : l.valor).texto,
      l.anulado ? "Estornado" : l.decretoEncerrado ? "Decreto encerrado" : "Vigente",
    ])
  );
}

const COLUNAS: readonly ColunaTabela<LinhaAtualizacao>[] = [
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "6rem", celula: (l) => dataBr(l.data) },
  { chave: "decreto", cabecalho: "Decreto", alinhamento: "esquerda", largura: "7rem", celula: (l) => `${l.decretoNumero}/${l.decretoAno}` },
  { chave: "lei", cabecalho: "Lei", alinhamento: "esquerda", largura: "7rem", celula: (l) => `${l.leiNumero}/${l.leiAno}` },
  { chave: "origem", cabecalho: "Origem", alinhamento: "esquerda", largura: "10rem", celula: (l) => ORIGEM_ROTULO[l.origemRecurso] ?? l.origemRecurso },
  { chave: "ficha", cabecalho: "Ficha", alinhamento: "direita", largura: "4rem", celula: (l) => l.fichaNumero },
  { chave: "ug", cabecalho: "UG", alinhamento: "esquerda", largura: "5rem", celula: (l) => l.unidadeCodigo },
  { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "4rem", celula: (l) => l.fonteCodigo },
  { chave: "movimento", cabecalho: "Movimento", alinhamento: "esquerda", largura: "8rem", celula: (l) => (l.tipo === "SUPLEMENTACAO" ? "Suplementação" : "Anulação") },
  // A anulação entra com sinal −: ela reduz a dotação da ficha, e a coluna de valores tem de somar
  // com o olho até o efeito líquido do rodapé.
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.tipo === "ANULACAO" ? `-${l.valor}` : l.valor} /> },
  {
    chave: "situacao", cabecalho: "Situação", alinhamento: "esquerda", largura: "9rem",
    celula: (l) =>
      l.anulado ? <Badge status="erro">Estornado</Badge>
        : l.decretoEncerrado ? <Badge status="alerta">Dec. encerrado</Badge>
        : <Badge status="ok">Vigente</Badge>,
  },
];
