import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { gerarReprevisoes, PortaSemBancoError, type ReprevisaoRegistrada } from "../../../../lib/portas/planejamento";
import { FormReprevisao } from "./FormReprevisao";
import { diaCivilBr } from "../../../../packages/datas/index";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { exercicioAutorizado } from "../../../../lib/recorte";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * REPREVISÃO DE RECEITA — histórico append-only (LRF art. 12). Server Component, força-dinâmica.
 * A lista é o histórico; o registro de uma reprevisão é ato autorizado pela sessão (o formulário abaixo).
 */
export const dynamic = "force-dynamic";

export default async function ReprevisaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const sp = await searchParams;
  // V38 — o exercício é o do contexto da sessão (antes, 2026 fixo quando a URL não o trazia).
  const exercicio = ((): number | null => { try { return exercicioAutorizado(sp); } catch { return null; } })();
  if (exercicio === null) return <div><PageHeader titulo="Reprevisão de Receita" subtitulo="Reestimativas da receita (LRF art. 12)." /><EstadoVazio titulo="O exercício pedido não é um ano" descricao="Escolha o exercício no cabeçalho." /></div>;

  const cabecalho = <PageHeader titulo="Reprevisão de Receita" subtitulo={`Reestimativas da receita do exercício ${exercicio} (LRF art. 12).`} />;

  let reprevisoes: readonly ReprevisaoRegistrada[];
  try {
    reprevisoes = await gerarReprevisoes({ exercicio });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível ler as reprevisões"} descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} /></div>;
  }

  return (
    <div className="space-y-4">
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A previsão <strong>atualizada</strong> dos demonstrativos (Anexos 1, 3, 8 e 12) corresponde à previsão inicial somada às reestimativas.
        {" "}Cada registro guarda o responsável e a data.
      </div>

      <FormReprevisao exercicio={exercicio} />

      {reprevisoes.length === 0 ? (
        <EstadoVazio titulo="Sem reprevisões" descricao={`Nenhuma reestimativa registrada para ${exercicio}. A previsão atualizada é igual à inicial.`} />
      ) : (
        <TabelaDeDados
          colunas={COLUNAS}
          linhas={reprevisoes.map((r) => ({ ...r, dataFmt: diaCivilBr(r.data) }))}
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
