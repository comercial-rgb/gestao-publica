import { BotaoImprimir } from "../../../../../../components/ui/BotaoImprimir";
import { EstadoVazio } from "../../../../../../components/ui/EstadoVazio";
import { formatarMoeda } from "../../../../../../lib/format/moeda";
import { telaExigeLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { lerPrevia } from "../../../../../../lib/portas/previas";
import { ORIGEM, TIPO } from "../../rotulos";

/**
 * V36 — A MINUTA da prévia para impressão: decreto ou projeto de lei, conforme o caso escolhido por quem imprime. Traz
 * só os dados da prévia (tipo, origem, objeto, movimentos por ficha e totais por fonte) e deixa em branco o número, a
 * data e o texto legal — a redação do ato é do ente, e o sistema não a escreve por ele.
 */
export const dynamic = "force-dynamic";

const celula = "border border-[color:var(--color-border)] px-2 py-1";
const reais = (v: { toFixed(n: number): string }): string => formatarMoeda(v.toFixed(2)).texto;

export default async function MinutaDaPrevia({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  const sp = await searchParams;
  const projeto = sp["documento"] === "projeto";
  const p = await lerPrevia(id);
  if (p === null) return <EstadoVazio titulo="Prévia não encontrada" descricao="Volte à lista de prévias do exercício." />;
  const sup = p.itensDetalhados.filter((i) => i.tipo === "SUPLEMENTACAO");
  const anu = p.itensDetalhados.filter((i) => i.tipo === "ANULACAO");
  const tabela = (itens: typeof sup, marca: string): React.ReactElement => (
    <table className="w-full border-collapse text-sm" data-minuta-tabela={marca}>
      <thead>
        <tr>
          <th scope="col" className={celula}>Ficha</th>
          <th scope="col" className={celula}>Unidade</th>
          <th scope="col" className={celula}>Ação</th>
          <th scope="col" className={celula}>Natureza</th>
          <th scope="col" className={celula}>Fonte</th>
          <th scope="col" className={`${celula} text-right`}>Valor</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((i, k) => (
          <tr key={k}>
            <td className={celula}>{i.fichaNumero}</td>
            <td className={celula}>{i.unidade}</td>
            <td className={celula}>{i.acao}</td>
            <td className={celula}>{i.natureza}</td>
            <td className={celula}>{i.fonte}</td>
            <td className={`${celula} text-right tabular-nums`}>{reais(i.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <article className="mx-auto max-w-3xl space-y-4 bg-[color:var(--color-surface)] p-6" data-minuta={projeto ? "projeto" : "decreto"}>
      <div className="flex justify-end" data-chrome>
        <BotaoImprimir />
      </div>
      <h1 className="text-center text-lg font-semibold">{projeto ? "Minuta de projeto de lei" : "Minuta de decreto"} nº ______ , de ____ de ______________ de {p.exercicio}</h1>
      <p className="text-sm">
        Crédito adicional {TIPO[p.tipoCredito].toLowerCase()} no valor de <strong>{reais(p.suplementado)}</strong>, para {p.descricao.charAt(0).toLowerCase() + p.descricao.slice(1)}. Origem do recurso: {ORIGEM[p.origemRecurso].toLowerCase()}
        {anu.length > 0 ? <>, no valor de {reais(p.anulado)}, conforme as dotações abaixo</> : null}.
      </p>
      <h2 className="text-sm font-semibold">Dotações suplementadas</h2>
      {tabela(sup, "suplementadas")}
      {anu.length > 0 ? (
        <>
          <h2 className="text-sm font-semibold">Dotações anuladas</h2>
          {tabela(anu, "anuladas")}
        </>
      ) : null}
      <h2 className="text-sm font-semibold">Totais por fonte de recursos</h2>
      <table className="w-full border-collapse text-sm" data-minuta-tabela="fontes">
        <thead>
          <tr>
            <th scope="col" className={celula}>Fonte</th>
            <th scope="col" className={`${celula} text-right`}>Suplementado</th>
            <th scope="col" className={`${celula} text-right`}>Anulado</th>
          </tr>
        </thead>
        <tbody>
          {p.porFonte.map((f) => (
            <tr key={f.fonte}>
              <td className={celula}>{f.fonte}</td>
              <td className={`${celula} text-right tabular-nums`}>{reais(f.suplementado)}</td>
              <td className={`${celula} text-right tabular-nums`}>{reais(f.anulado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-[color:var(--color-ink-3)]">Prévia nº {p.numero}/{p.exercicio}. O texto do ato, a numeração e a data são preenchidos pelo ente.</p>
    </article>
  );
}
