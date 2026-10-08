import Link from "next/link";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { lerCodigosReduzidos, type TelaDosCodigosReduzidos } from "../../../../../lib/portas/codigos-reduzidos";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { FormGerarCodigos } from "./FormGerarCodigos";

/**
 * V36 — OS CÓDIGOS REDUZIDOS DA DESPESA DO PPA: o número curto de cada combinação de unidade, função, subfunção,
 * programa e ação. A regra é do M02b (`modules/m02b-plurianual/codigo-reduzido.ts`). Leitura: CONSULTAR_PLANEJAMENTO.
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";

export default async function CodigosReduzidosPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const pedido = typeof sp["plano"] === "string" ? sp["plano"] : "";
  const busca = typeof sp["busca"] === "string" ? sp["busca"] : "";
  const cabecalho = <PageHeader titulo="Códigos reduzidos da despesa" subtitulo="O número curto de cada combinação de unidade, função, subfunção, programa e ação do PPA" />;
  let dados: TelaDosCodigosReduzidos;
  let pode: boolean;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    const [d, permitidas] = await Promise.all([lerCodigosReduzidos(pedido, busca), acoesPermitidas(["CADASTRAR_PROGRAMA_PPA"])]);
    dados = d;
    pode = permitidas.has("CADASTRAR_PROGRAMA_PPA");
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler os códigos reduzidos" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  if (dados.planoId === null) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio titulo="Nenhum plano plurianual cadastrado" descricao="Cadastre o PPA e as ações dele; cada ação nasce com o seu código." />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {cabecalho}
      {dados.planos.length > 1 ? (
        <nav aria-label="Plano" className="flex gap-3 text-sm" data-chrome>
          {dados.planos.map((p) =>
            p.id === dados.planoId ? <strong key={p.id}>{p.rotulo}</strong> : <Link key={p.id} className="underline" href={`/planejamento/ppa/codigos-reduzidos?plano=${p.id}`}>{p.rotulo}</Link>
          )}
        </nav>
      ) : (
        <p className="text-sm">{dados.planos[0]?.rotulo}</p>
      )}
      <form method="get" className="flex flex-wrap items-end gap-3" role="search" data-chrome>
        <input type="hidden" name="plano" value={dados.planoId} />
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Buscar pelo número, pela classificação ou pelo nome</span>
          <input name="busca" defaultValue={busca} placeholder="12, 0012.2001 ou ensino" className={CAMPO} />
        </label>
        <button type="submit" className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 py-2 text-sm">Buscar</button>
        {busca !== "" ? <Link className="text-sm underline" href={`/planejamento/ppa/codigos-reduzidos?plano=${dados.planoId}`}>Limpar</Link> : null}
      </form>
      {dados.codigos.length === 0 ? (
        <EstadoVazio
          titulo={dados.total === 0 ? "Nenhum código reduzido neste plano" : "Nenhum código corresponde à busca"}
          descricao={dados.total === 0 ? "As ações cadastradas no PPA recebem o código no cadastro; as cadastradas antes recebem pelo gerador abaixo." : "Tente outro número ou outro termo."}
        />
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">{dados.codigos.length} de {dados.total} código(s).</p>
          <table className="w-full text-left text-sm" data-tabela-codigos-reduzidos>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                <th scope="col" className={`${celula} text-right`}>Código</th>
                <th scope="col" className={celula}>Classificação</th>
                <th scope="col" className={celula}>Unidade</th>
                <th scope="col" className={celula}>Função e subfunção</th>
                <th scope="col" className={celula}>Programa</th>
                <th scope="col" className={celula}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {dados.codigos.map((c) => (
                <tr key={c.numero} data-codigo-reduzido={c.numero}>
                  <td className={`${celula} text-right font-semibold tabular-nums`}>{c.numero}</td>
                  <td className={`${celula} tabular-nums`}>{c.classificacao}</td>
                  <td className={celula}>{c.unidade}</td>
                  <td className={celula}>{c.funcao}<span className="block text-xs text-[color:var(--color-ink-3)]">{c.subfuncao}</span></td>
                  <td className={celula}>{c.programa}</td>
                  <td className={celula}>{c.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pode ? <FormGerarCodigos planoId={dados.planoId} acoesParaGerar={dados.acoesParaGerar} acoesSemClassificacao={dados.acoesSemClassificacao} /> : null}
    </div>
  );
}
