import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { RELACOES_RREO } from "../../../../../lib/navegacao";
import {
  ehBimestre,
  gerarRreoAnexo3,
  PortaSemBancoError,
  type Anexo3,
  type LinhaRcl,
} from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "./SeletorBimestreRreo";

/**
 * RREO — ANEXO 3: DEMONSTRATIVO DA RECEITA CORRENTE LÍQUIDA (LRF art. 53, I; MDF 15ª ed.).
 *
 * A PRIMEIRA fatia de UI REAL do sistema: uma tela que lê o banco, pela PORTA (`lib/portas/rreo`),
 * nunca o domínio direto. Server Component + `force-dynamic` — o relatório reflete o banco a cada
 * carregamento (nada de cache estático sobre número fiscal). O seletor de bimestre é a única ilha
 * client; ele escreve na URL e o servidor re-renderiza.
 *
 * ⚠️ DINHEIRO É STRING de ponta a ponta: a porta devolve string, `ValorMonetario` recebe string.
 * Nenhum `Number()` toca um valor — a regra de ouro do domínio chega até o pixel.
 *
 * Estados: CARREGANDO (o próprio SSR), VAZIO (`EstadoVazio` — sem receita no período), ERRO
 * NOMEADO (banco ausente, ou erro do domínio com a mensagem dele). Nunca uma tela branca.
 */

export const dynamic = "force-dynamic";

const ANO_PADRAO = 2026;
const BIMESTRE_PADRAO = 1;

export default async function RreoAnexo3Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], ANO_PADRAO);
  const bimestreBruto = lerInteiro(sp["bimestre"], BIMESTRE_PADRAO);
  const bimestre = ehBimestre(bimestreBruto) ? bimestreBruto : BIMESTRE_PADRAO;

  const cabecalho = (
    <PageHeader
      titulo="RREO — Anexo 3 · Receita Corrente Líquida"
      subtitulo="Demonstrativo da RCL · LRF art. 53, I · MDF 15ª ed. (STN) · últimos 12 meses"
      acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />}
    />
  );

  let dados: Anexo3;
  try {
    dados = await gerarRreoAnexo3({ exercicio, bimestre });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        {erro instanceof PortaSemBancoError ? (
          <EstadoVazio
            titulo="Banco de dados não configurado"
            descricao="A variável DATABASE_URL não está definida. O relatório não tem de onde ler — configure o banco e recarregue."
          />
        ) : (
          <EstadoVazio
            titulo="Não foi possível gerar o Anexo 3"
            descricao={erro instanceof Error ? erro.message : "Erro desconhecido ao ler o demonstrativo."}
          />
        )}
      </div>
    );
  }

  const temMovimento =
    dados.linhas.some((l) => l.nivel === "item") || dados.rcl.total12m !== "0.00";

  if (!temMovimento) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo="Sem receita no período"
          descricao={`Não há arrecadação nem previsão para os 12 meses encerrados no ${bimestre}º bimestre de ${exercicio}.`}
        />
      </div>
    );
  }

  const colunas = montarColunas(dados);

  return (
    <div>
      {cabecalho}

      <TabelaDeDados<LinhaRcl>
        colunas={colunas}
        linhas={dados.linhas}
        keyDe={(l) => l.chave}
        ehTotal={(l) => l.nivel === "total" || l.nivel === "grupo"}
        recuoDe={(l) => (l.nivel === "item" ? 1 : 0)}
        legenda={`Valores em R$ · janela de 12 meses encerrada no ${bimestre}º bimestre de ${exercicio} · a coluna PREVISÃO ATUALIZADA reflete a LOA (reestimativa é pendência).`}
      />

      {dados.pendencias.length > 0 ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
          <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
          <ul className="list-disc space-y-1 pl-4">
            {dados.pendencias.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <RelatoriosRelacionados relacoes={RELACOES_RREO["/relatorios/rreo/anexo3"] ?? []} />
    </div>
  );
}

/** Lê um inteiro de um query param (string ou array), com fallback. */
function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}

/** As 15 colunas: especificação + 12 meses + TOTAL(12m) + PREVISÃO ATUALIZADA. */
function montarColunas(dados: Anexo3): readonly ColunaTabela<LinhaRcl>[] {
  const meses: ColunaTabela<LinhaRcl>[] = dados.colunas.map((c, i) => ({
    chave: `mes-${c.ano}-${c.mes}`,
    cabecalho: c.rotulo,
    alinhamento: "direita" as const,
    largura: "6.5rem",
    celula: (l: LinhaRcl) => <ValorMonetario valor={l.meses[i] ?? "0.00"} />,
  }));

  return [
    {
      chave: "rotulo",
      cabecalho: "Especificação",
      alinhamento: "esquerda" as const,
      celula: (l: LinhaRcl) => l.rotulo,
    },
    ...meses,
    {
      chave: "total",
      cabecalho: "TOTAL (12m)",
      alinhamento: "direita" as const,
      largura: "8rem",
      celula: (l: LinhaRcl) => <ValorMonetario valor={l.total12m} />,
    },
    {
      chave: "previsao",
      cabecalho: "PREVISÃO ATUALIZADA",
      alinhamento: "direita" as const,
      largura: "8rem",
      celula: (l: LinhaRcl) => <ValorMonetario valor={l.previsaoAtualizada} />,
    },
  ];
}
