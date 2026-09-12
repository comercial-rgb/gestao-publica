import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import {
  lerDecretos,
  lerLeis,
  lerQdd,
  PortaSemBancoError,
  type DecretoNaLista,
  type LeiNaLista,
  type LinhaQdd,
} from "../../../../lib/portas/creditos";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../lib/portas/contexto";
import { dataBr } from "../../../../lib/recorte";
import { FormEncerrarDecreto } from "./FormEncerrarDecreto";
import { FormDecretoCredito } from "./FormDecretoCredito";

/**
 * CRÉDITOS ADICIONAIS (M03, TR 4.20–4.40) — a lista de decretos com autorizado/utilizado/saldo
 * (4.27–4.28) e o estado de encerramento (derivado do fato, nunca coluna). A tela consome a PORTA
 * (grep trivalente). O domínio (travas 5.111/teto/saldo) já existe no M03; aqui é leitura + emissão.
 */
export const dynamic = "force-dynamic";

const TIPO_ROTULO: Record<string, string> = { SUPLEMENTAR: "Suplementar", ESPECIAL: "Especial", EXTRAORDINARIO: "Extraordinário" };
const ORIGEM_ROTULO: Record<string, string> = {
  ANULACAO: "Anulação (remanejamento)", SUPERAVIT_FINANCEIRO: "Superávit financeiro",
  EXCESSO_ARRECADACAO: "Excesso de arrecadação", OPERACAO_CREDITO: "Operação de crédito",
};

export default async function CreditosAdicionaisPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;

  // ⚠️ O CABEÇALHO NASCE DEPOIS DO TRY — e aqui não é por causa de `descreverRecorte`
  // (o subtítulo desta tela só cita o exercício), mas porque o próprio `exercicio` passa a
  // vir de dentro dele: o recorte autorizado pode RECUSAR um exercício ilegível, e imprimir
  // "Exercício 2026" antes de autorizar seria afirmar um ano que o usuário não pediu.
  let recorte: RecorteDaPagina;
  let decretos: readonly DecretoNaLista[];
  let leis: readonly LeiNaLista[];
  // ⚠️ O QDD serve de VOCABULÁRIO ao form: ele é a única leitura que traz `fonteId` junto da
  // ficha, e a fonte da perna É a da ficha (o adapter do M03 recusa divergência). Uma segunda
  // leitura de fichas só para o form abriria a porta a as duas discordarem.
  let fichas: readonly LinhaQdd[];
  try {
    recorte = await recorteDePagina(sp);
    [decretos, leis, fichas] = await Promise.all([
      lerDecretos({ ano: recorte.exercicio }),
      lerLeis({ ano: recorte.exercicio }),
      lerQdd({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo }),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="Créditos adicionais"
          subtitulo="Decretos, suplementações e anulações"
        />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Banco de dados não configurado"
                  : "Não foi possível ler os créditos adicionais"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  // ⚠️ AQUI: o exercício já foi autorizado, e só agora o cabeçalho pode afirmá-lo.
  const exercicio = recorte.exercicio;
  const cabecalho = <PageHeader titulo="Créditos adicionais" subtitulo={`Exercício ${exercicio} — decretos, suplementações e anulações`} />;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cada decreto executa (parte do) teto de uma <strong>lei</strong>. Num decreto por{" "}
        <strong>anulação</strong>, o suplementado fecha com o anulado <strong>por fonte</strong>.
        A <strong>dotação atualizada</strong> de cada ficha soma automaticamente estes créditos — é o
        mesmo saldo que a emissão de empenho respeita. "Encerrado" é o <strong>fato</strong> de alguém ter
        encerrado (append-only), não um campo editável.
      </div>

      <FormDecretoCredito
        exercicio={exercicio}
        leis={leis.map((l) => ({ id: l.id, numero: l.numero, ano: l.ano, tipoCredito: l.tipoCredito, valorAutorizado: l.valorAutorizado }))}
        fichas={fichas.map((f) => ({
          id: f.fichaId, numero: f.numero, unidadeCodigo: f.unidadeCodigo, fonteId: f.fonteId,
          fonteCodigo: f.fonteCodigo, naturezaCodigo: f.naturezaCodigo, naturezaDescricao: f.naturezaDescricao,
          dotacaoAtualizada: f.dotacaoAtualizada, saldoDisponivel: f.saldoDisponivel,
        }))}
      />

      {decretos.length === 0 ? (
        <EstadoVazio titulo="Sem decretos" descricao={`Nenhum decreto de crédito adicional no exercício ${exercicio}.`} />
      ) : (
        <div className="space-y-3">
          {decretos.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                  <strong className="text-base">Decreto {d.numero}/{d.ano}</strong>
                  <Badge status="neutro">{TIPO_ROTULO[d.tipoCredito] ?? d.tipoCredito}</Badge>
                  {d.encerrado ? <Badge status="erro">Encerrado</Badge> : <Badge status="ok">Ativo</Badge>}
                </div>
                <span className="text-xs text-[color:var(--color-ink-3)]">
                  Lei {d.leiNumero}/{d.leiAno} · {ORIGEM_ROTULO[d.origemRecurso] ?? d.origemRecurso} · {dataBr(d.data)}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <BotaoPdf href={`/planejamento/creditos-adicionais/decreto?id=${d.id}&ano=${d.ano}`} rotulo="Imprimir decreto" />
                  {d.encerrado ? null : <FormEncerrarDecreto decretoId={d.id} />}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span><span className="text-[color:var(--color-ink-2)]">Suplementado:</span> <strong><ValorMonetario valor={d.suplementado} /></strong></span>
                <span><span className="text-[color:var(--color-ink-2)]">Anulado:</span> <strong><ValorMonetario valor={d.anulado} /></strong></span>
                <span><span className="text-[color:var(--color-ink-2)]">Diferença (líquido):</span> <strong><ValorMonetario valor={d.diferenca} /></strong></span>
              </div>

              {d.encerrado && d.encerramento !== null ? (
                <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">Encerrado em {dataBr(d.encerramento.data)} — {d.encerramento.motivo}.</p>
              ) : null}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                      <th className="py-1.5 pr-4">Ficha</th><th className="py-1.5 pr-4">Unidade</th>
                      <th className="py-1.5 pr-4">Fonte</th><th className="py-1.5 pr-4">Tipo</th>
                      <th className="py-1.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {d.itens.map((i) => (
                      <tr key={i.id} className="border-b border-[color:var(--color-border)]">
                        <td className="py-1.5 pr-4">{i.fichaNumero}</td>
                        <td className="py-1.5 pr-4">{i.unidadeCodigo}</td>
                        <td className="py-1.5 pr-4">{i.fonteCodigo}</td>
                        <td className="py-1.5 pr-4">{i.tipo === "SUPLEMENTACAO" ? "Suplementação" : "Anulação"}</td>
                        <td className="py-1.5 text-right"><ValorMonetario valor={i.anulado ? `-${i.valor}` : i.valor} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-[color:var(--color-ink-3)]">
        O cadastro de <strong>decreto + movimentos</strong> já é feito aqui, pela porta de escrita do
        do domínio (as travas de fechamento por fonte, teto, saldo e fonte são aplicadas na
        gravação, dentro da transação). O
        cadastro de <strong>LEIS de crédito</strong> ainda NÃO tem formulário — a porta de escrita
        existe (<code>criarLeiCredito</code>), mas a tela não a chama, e hoje a lei entra pelo
        serviço/seed do M03. Fica <strong>nomeado</strong> como próxima fatia, e não preenchido com
        um default plausível.
      </p>
    </div>
  );
}
