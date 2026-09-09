import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { gerarReprevisoes, PortaSemBancoError, type ReprevisaoRegistrada } from "../../../../lib/portas/planejamento";
import { FormReprevisao } from "./FormReprevisao";

/**
 * REPREVISÃO DE RECEITA — histórico append-only (LRF art. 12). Server Component, força-dinâmica.
 * ⚠️ Só LEITURA: o registro de uma reprevisão é ato autorizado, e depende da sessão (6.3). Até lá,
 * a lista é o histórico; o formulário de registro entra com o login.
 */
export const dynamic = "force-dynamic";

export default async function ReprevisaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const bruto = Array.isArray(sp["exercicio"]) ? sp["exercicio"][0] : sp["exercicio"];
  const exercicio = bruto !== undefined && !Number.isNaN(Number.parseInt(bruto, 10)) ? Number.parseInt(bruto, 10) : 2026;

  const cabecalho = <PageHeader titulo="Reprevisão de Receita" subtitulo={`Reestimativas do exercício ${exercicio} (LRF art. 12) — append-only`} />;

  let reprevisoes: readonly ReprevisaoRegistrada[];
  try {
    reprevisoes = await gerarReprevisoes({ exercicio });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler as reprevisões"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }

  return (
    <div className="space-y-4">
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A previsão <strong>atualizada</strong> dos demonstrativos (Anexos 1, 3, 8, 12) é a inicial mais a soma destas reestimativas.
        {" "}O registro exige sessão e fica auditado (quem, quando).
      </div>

      <FormReprevisao exercicio={exercicio} />

      {reprevisoes.length === 0 ? (
        <EstadoVazio titulo="Sem reprevisões" descricao={`Nenhuma reestimativa registrada para ${exercicio}. A previsão atualizada é igual à inicial.`} />
      ) : (
        <TabelaDeDados
          colunas={COLUNAS}
          linhas={reprevisoes.map((r) => ({ ...r, dataFmt: r.data.toISOString().slice(0, 10).split("-").reverse().join("/") }))}
          keyDe={(l) => l.id}
          legenda={`${reprevisoes.length} reestimativa(s) · valores em R$ (com sinal: + aumenta, − reduz).`}
        />
      )}
    </div>
  );
}

type LinhaR = ReprevisaoRegistrada & { dataFmt: string };
const COLUNAS: readonly ColunaTabela<LinhaR>[] = [
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "6rem", celula: (l) => l.dataFmt },
  { chave: "nat", cabecalho: "Natureza", alinhamento: "esquerda", largura: "8rem", celula: (l) => l.naturezaCodigo },
  { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "5rem", celula: (l) => l.fonteCodigo },
  { chave: "ajuste", cabecalho: "Ajuste", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valorAjuste} /> },
  { chave: "motivo", cabecalho: "Motivo", alinhamento: "esquerda", celula: (l) => l.motivo },
  { chave: "por", cabecalho: "Registrado por", alinhamento: "esquerda", largura: "12rem", celula: (l) => l.criadoPor },
];
