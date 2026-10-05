import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { csvDasTabelas, type TabelasDoDocumento } from "../../../../lib/relatorios/tabelas-dos-demonstrativos";
import { SeletorExercicio } from "./SeletorExercicio";

/**
 * V35 — a tela de um demonstrativo que já sai montado em tabelas (`TabelasDoDocumento`): as mesmas seções do PDF e do CSV,
 * desenhadas com a tabela padrão. A recusa do motor (dívida sem conta que diga interna ou externa, conta bancária sem
 * conta contábil) aparece com o motivo, nunca como erro técnico.
 */

interface LinhaDaSecao {
  readonly i: number;
  readonly celulas: readonly string[];
}

export function QuadrosDoDocumento({
  titulo,
  subtitulo,
  exercicio,
  rotaPdf,
  nomeArquivo,
  resultado,
}: {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly exercicio: number;
  readonly rotaPdf: string;
  readonly nomeArquivo: string;
  readonly resultado: { readonly tabelas: TabelasDoDocumento } | { readonly recusa: string };
}): React.ReactElement {
  const cabecalho = <PageHeader titulo={titulo} subtitulo={subtitulo} acoes={<SeletorExercicio exercicio={String(exercicio)} />} />;
  if ("recusa" in resultado) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio titulo={`Não foi possível emitir: ${titulo}`} descricao={resultado.recusa} />
      </div>
    );
  }
  const t = resultado.tabelas;
  return (
    <div className="space-y-4">
      {cabecalho}
      <div className="flex justify-end gap-2" data-chrome>
        <BotaoPdf href={`${rotaPdf}?exercicio=${String(exercicio)}`} />
        <BotaoCsv csv={csvDasTabelas(t)} nomeArquivo={`${nomeArquivo}-${String(exercicio)}.csv`} />
      </div>
      {t.secoes.map((s, n) => {
        const colunas: readonly ColunaTabela<LinhaDaSecao>[] = s.colunas.map((c, k) => ({
          chave: `c${String(k)}`,
          cabecalho: c.rotulo,
          ...(c.alinhamento === "direita" ? { alinhamento: "direita" as const } : {}),
          celula: (l: LinhaDaSecao) => l.celulas[k] ?? "",
        }));
        const totais = new Set(s.totais ?? []);
        return (
          <TabelaDeDados
            key={`${s.titulo ?? ""}-${String(n)}`}
            colunas={colunas}
            linhas={s.linhas.map((celulas, i) => ({ i, celulas }))}
            keyDe={(l) => String(l.i)}
            ehTotal={(l) => totais.has(l.i)}
            legenda={s.titulo ?? titulo}
          />
        );
      })}
      <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text-muted)]">
        {t.notas.map((nota) => (
          <li key={nota}>{nota}</li>
        ))}
      </ul>
    </div>
  );
}

/** Roda o gerador e devolve as tabelas, ou a recusa com o motivo. */
export async function tabelasOuRecusa<T>(gerar: () => Promise<T>, montar: (d: T) => TabelasDoDocumento): Promise<{ readonly tabelas: TabelasDoDocumento } | { readonly recusa: string }> {
  try {
    return { tabelas: montar(await gerar()) };
  } catch (e) {
    return { recusa: e instanceof Error ? e.message : "Erro desconhecido." };
  }
}
