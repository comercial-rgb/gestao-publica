import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { EscopoDeLeituraError } from "../../../../lib/portas/contexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import {
  lerExerciciosCadastrados,
  lerPropostasOrcamentarias,
  PortaSemBancoError,
  type PropostaNaLista,
} from "../../../../lib/portas/proposta-orcamentaria";
import { dataBr } from "../../../../lib/recorte";
import { FormElaborarProposta } from "./Forms";

/**
 * A PROPOSTA ORÇAMENTÁRIA DO EXERCÍCIO SEGUINTE (M02 V29).
 *
 * Importa as receitas previstas e as fichas de um exercício, com a base e o percentual escolhidos;
 * cada linha se altera na proposta; a efetivação gera as fichas e a receita prevista do exercício.
 */
export const dynamic = "force-dynamic";

const TITULO = "Proposta orçamentária";
const SUBTITULO = "O orçamento do exercício seguinte, montado a partir de um exercício já executado";

const COLUNAS: readonly ColunaTabela<PropostaNaLista>[] = [
  {
    chave: "proposta",
    cabecalho: "Proposta",
    alinhamento: "esquerda",
    celula: (p) => (
      <Link className="font-semibold text-[color:var(--color-primary)] underline" href={`/planejamento/proposta-orcamentaria/${p.id}`}>
        {p.descricao}
      </Link>
    ),
  },
  { chave: "exercicio", cabecalho: "Orçamento de", alinhamento: "esquerda", largura: "7rem", celula: (p) => String(p.exercicio) },
  { chave: "origem", cabecalho: "Importado de", alinhamento: "esquerda", largura: "7rem", celula: (p) => String(p.exercicioDeOrigem) },
  { chave: "receitas", cabecalho: "Receitas", alinhamento: "direita", largura: "6rem", celula: (p) => String(p.linhasDeReceita) },
  { chave: "fichas", cabecalho: "Fichas", alinhamento: "direita", largura: "6rem", celula: (p) => String(p.linhasDeDespesa) },
  { chave: "criada", cabecalho: "Criada em", alinhamento: "esquerda", largura: "8rem", celula: (p) => dataBr(p.criadoEm) },
  {
    chave: "situacao",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    largura: "11rem",
    celula: (p) =>
      p.efetivadaEm === null ? <Badge status="neutro">Em elaboração</Badge> : <Badge status="ok">Orçamento gerado em {dataBr(p.efetivadaEm)}</Badge>,
  },
];

export default async function PropostaOrcamentariaPage(): Promise<React.ReactElement> {
  // Dado do ENTE: a proposta reúne as fichas de todas as unidades.
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  let propostas: readonly PropostaNaLista[];
  let exercicios: readonly { readonly ano: number; readonly encerrado: boolean }[];
  let podeElaborar: boolean;
  try {
    [propostas, exercicios, podeElaborar] = await Promise.all([
      lerPropostasOrcamentarias(),
      lerExerciciosCadastrados(),
      acoesPermitidas(["CADASTRAR_LOA"]).then((x) => x.has("CADASTRAR_LOA")),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "O planejamento não está no seu acesso"
              : erro instanceof PortaSemBancoError
                ? "Banco de dados não configurado"
                : "Não foi possível ler as propostas"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const anos = exercicios.map((e) => e.ano);
  const sugestao = (anos[0] ?? new Date().getFullYear()) + 1;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Como funciona.</strong> 1) Escolha o exercício de onde partir e
        o valor de partida: a previsão de receita (inicial ou atualizada) e a dotação das fichas (inicial, autorizada ou o
        que foi empenhado), com um percentual de reajuste. 2) Altere o que precisar, linha por linha, com o motivo; cada
        alteração fica registrada. 3) Quando a proposta estiver pronta, gere o orçamento: as fichas e a receita prevista do
        exercício são criadas de uma vez, com a dotação inicial lançada em 1º de janeiro.
      </div>

      {podeElaborar ? <FormElaborarProposta exercicios={anos} sugestaoDeDestino={sugestao} /> : null}

      {propostas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma proposta ainda" descricao="Crie a primeira a partir de um exercício cadastrado." />
      ) : (
        <TabelaDeDados colunas={COLUNAS} linhas={propostas} keyDe={(p) => p.id} legenda={`${String(propostas.length)} proposta(s)`} />
      )}
    </div>
  );
}
