import Link from "next/link";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { fichasParaPrevia, leisParaPrevia, lerPrevia, type PreviaDetalhada } from "../../../../../lib/portas/previas";
import { diaCivil } from "../../../../../packages/datas/index";
import { FormAcrescentarLote, FormAprovarPrevia, FormDescartarPrevia, FormEfetivarPrevia, type FichaSugerida } from "../FormsDaPrevia";
import { ORIGEM, SITUACAO, TIPO } from "../rotulos";

/** V36 — uma prévia de alteração orçamentária: os movimentos por lote, o bloqueio de cada anulação e os passos seguintes. */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";
const br = (d: Date): string => diaCivil(d).split("-").reverse().join("/");

export default async function PreviaPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  const { id } = await params;
  let p: PreviaDetalhada | null;
  let permitidas: ReadonlySet<string>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    [p, permitidas] = await Promise.all([lerPrevia(id), acoesPermitidas(["CRIAR_DECRETO_DE_CREDITO", "EXECUTAR_CREDITO"])]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Prévia de alteração orçamentária" subtitulo="" />
        <EstadoVazio titulo="Não foi possível ler a prévia" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  if (p === null) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Prévia de alteração orçamentária" subtitulo="" />
        <EstadoVazio titulo="Prévia não encontrada" descricao="Volte à lista de prévias do exercício." />
      </div>
    );
  }
  const prepara = permitidas.has("CRIAR_DECRETO_DE_CREDITO");
  const executa = permitidas.has("EXECUTAR_CREDITO");
  const hoje = diaCivil(new Date());
  const [fichas, leis]: [readonly FichaSugerida[], readonly { readonly id: string; readonly rotulo: string }[]] = await Promise.all([
    p.situacao === "EM_ELABORACAO" && prepara ? fichasParaPrevia(p.exercicio) : Promise.resolve([]),
    p.situacao === "APROVADA" && executa && prepara ? leisParaPrevia(p.exercicio, p.tipoCredito) : Promise.resolve([]),
  ]);
  const lotes = [...new Set(p.itensDetalhados.map((i) => i.lote))];

  return (
    <div className="space-y-4" data-previa-detalhe={p.numero}>
      <PageHeader titulo={`Prévia nº ${String(p.numero)}/${String(p.exercicio)}`} subtitulo={p.descricao} />
      <p className="text-sm">
        Crédito {TIPO[p.tipoCredito].toLowerCase()} · {ORIGEM[p.origemRecurso]} · <strong data-situacao={p.situacao}>{SITUACAO[p.situacao]}</strong>
        {p.decreto !== null ? <> · decreto {p.decreto.numero}/{p.decreto.ano}</> : null}
      </p>
      <p className="text-xs text-[color:var(--color-ink-2)]">
        Registrada em {br(p.criadoEm)} por {p.criadoPor}.
        {p.aprovacao !== null ? ` Aprovada em ${br(p.aprovacao.data)} por ${p.aprovacao.criadoPor}${p.aprovacao.parecer !== null ? ` (${p.aprovacao.parecer})` : ""}.` : ""}
        {p.desfechoDetalhe !== null ? ` ${p.desfechoDetalhe.tipo === "EFETIVADA" ? "Efetivada" : "Descartada"} em ${br(p.desfechoDetalhe.criadoEm)} por ${p.desfechoDetalhe.criadoPor}${p.desfechoDetalhe.motivo !== null ? `: ${p.desfechoDetalhe.motivo}` : ""}.` : ""}
      </p>
      <div className="flex gap-3 text-sm" data-chrome>
        <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/previas/${p.id}/minuta?documento=decreto`}>Minuta de decreto</Link>
        <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/previas/${p.id}/minuta?documento=projeto`}>Minuta de projeto de lei</Link>
        <Link className="text-[color:var(--color-primary)] underline" href="/planejamento/previas">Todas as prévias</Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-tabela-itens-da-previa>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
              <th scope="col" className={celula}>Lote</th>
              <th scope="col" className={celula}>Ficha</th>
              <th scope="col" className={celula}>Classificação</th>
              <th scope="col" className={celula}>Movimento</th>
              <th scope="col" className={`${celula} text-right`}>Valor</th>
              <th scope="col" className={celula}>Bloqueio</th>
            </tr>
          </thead>
          <tbody>
            {p.itensDetalhados.map((i, k) => (
              <tr key={k} data-item-ficha={i.fichaNumero} data-item-tipo={i.tipo}>
                <td className={celula}>{i.lote}</td>
                <td className={celula}>{i.fichaNumero}</td>
                <td className={`${celula} text-xs`}>UG {i.unidade} · ação {i.acao} · {i.natureza} · fonte {i.fonte}</td>
                <td className={celula}>{i.tipo === "SUPLEMENTACAO" ? "Suplementação" : "Anulação"}</td>
                <td className={`${celula} text-right tabular-nums`}><ValorMonetario valor={i.valor.toFixed(2)} /></td>
                <td className={celula} data-bloqueio={i.bloqueio === null ? "" : i.bloqueio.desfeito ? "desfeito" : "ativo"}>
                  {i.bloqueio === null ? "—" : i.bloqueio.desfeito ? "Desfeito" : "Valor bloqueado na ficha"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[color:var(--color-ink-2)]">{lotes.length} lote(s).</p>

      <div className="overflow-x-auto">
        <table className="w-full max-w-xl text-left text-sm" data-tabela-por-fonte>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
              <th scope="col" className={celula}>Fonte</th>
              <th scope="col" className={`${celula} text-right`}>Suplementado</th>
              <th scope="col" className={`${celula} text-right`}>Anulado</th>
            </tr>
          </thead>
          <tbody>
            {p.porFonte.map((f) => (
              <tr key={f.fonte} data-fonte={f.fonte}>
                <td className={celula}>{f.fonte}</td>
                <td className={`${celula} text-right tabular-nums`}><ValorMonetario valor={f.suplementado.toFixed(2)} /></td>
                <td className={`${celula} text-right tabular-nums`}><ValorMonetario valor={f.anulado.toFixed(2)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {p.situacao === "EM_ELABORACAO" && prepara ? <FormAcrescentarLote previaId={p.id} fichas={fichas} /> : null}
      {p.situacao === "EM_ELABORACAO" && executa ? <FormAprovarPrevia previaId={p.id} hoje={hoje} /> : null}
      {p.situacao === "APROVADA" && executa && prepara ? <FormEfetivarPrevia previaId={p.id} hoje={hoje} leis={leis} /> : null}
      {(p.situacao === "EM_ELABORACAO" || p.situacao === "APROVADA") && prepara ? <FormDescartarPrevia previaId={p.id} /> : null}
    </div>
  );
}
