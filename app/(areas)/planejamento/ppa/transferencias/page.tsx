import Link from "next/link";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { lerTransferenciasDoPpa, type TelaDasTransferencias } from "../../../../../lib/portas/transferencias-ppa";
import { FormDaTransferencia } from "./FormDaTransferencia";

/**
 * V36 — AS TRANSFERÊNCIAS FINANCEIRAS PREVISTAS NO PPA, por entidade de destino e ano. A regra é do M02b
 * (`modules/m02b-plurianual/transferencias-previstas.ts`). Leitura: CONSULTAR_PLANEJAMENTO no ente.
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";

export default async function TransferenciasDoPpaPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const pedido = typeof sp["plano"] === "string" ? sp["plano"] : "";
  const cabecalho = <PageHeader titulo="Transferências financeiras previstas no PPA" subtitulo="O que o ente prevê transferir a cada entidade, em cada ano do quadriênio" />;
  let dados: TelaDasTransferencias;
  let pode: boolean;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    const [d, permitidas] = await Promise.all([lerTransferenciasDoPpa(pedido), acoesPermitidas(["CADASTRAR_PPA"])]);
    dados = d;
    pode = permitidas.has("CADASTRAR_PPA");
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler as transferências previstas" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  if (dados.planoId === null || dados.quadro === null) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio titulo="Nenhum plano plurianual cadastrado" descricao="Cadastre o PPA antes de prever as transferências." />
      </div>
    );
  }
  const q = dados.quadro;
  return (
    <div className="space-y-4">
      {cabecalho}
      {dados.planos.length > 1 ? (
        <nav aria-label="Plano" className="flex gap-3 text-sm" data-chrome>
          {dados.planos.map((p) =>
            p.id === dados.planoId ? <strong key={p.id}>{p.rotulo}</strong> : <Link key={p.id} className="underline" href={`/planejamento/ppa/transferencias?plano=${p.id}`}>{p.rotulo}</Link>
          )}
        </nav>
      ) : (
        <p className="text-sm">{dados.planos[0]?.rotulo}</p>
      )}
      {q.linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma transferência prevista neste plano" descricao="Registre abaixo a previsão de cada entidade por ano." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-tabela-transferencias>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                <th scope="col" className={celula}>Entidade de destino</th>
                {q.anos.map((a) => (
                  <th key={a} scope="col" className={`${celula} text-right`}>{a}</th>
                ))}
                <th scope="col" className={`${celula} text-right`}>Quadriênio</th>
              </tr>
            </thead>
            <tbody>
              {q.linhas.map((l) => (
                <tr key={l.entidadeId} data-transferencia-entidade={l.entidade}>
                  <td className={celula}>{l.entidade}</td>
                  {l.porAno.map((a) => (
                    <td key={a.ano} className={`${celula} text-right tabular-nums`} data-ano={a.ano}>
                      {a.valor === null ? "—" : <ValorMonetario valor={a.valor.toFixed(2)} />}
                      {a.versoes > 1 ? <span className="block text-xs text-[color:var(--color-ink-3)]">{a.versoes} versões</span> : null}
                    </td>
                  ))}
                  <td className={`${celula} text-right tabular-nums`}><ValorMonetario valor={l.total.toFixed(2)} /></td>
                </tr>
              ))}
              <tr className="font-semibold" data-transferencias-total>
                <td className={celula}>Total</td>
                {q.totalPorAno.map((t, i) => (
                  <td key={i} className={`${celula} text-right tabular-nums`}><ValorMonetario valor={t.toFixed(2)} /></td>
                ))}
                <td className={celula} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {pode ? <FormDaTransferencia planoId={dados.planoId} anos={q.anos} entidades={dados.entidades} /> : null}
    </div>
  );
}
