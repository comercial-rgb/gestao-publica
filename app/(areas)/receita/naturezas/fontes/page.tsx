import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { lerFontesDasNaturezas, type TelaDasFontesDaNatureza } from "../../../../../lib/portas/fontes-da-natureza";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { FormDaComposicao } from "./FormDaComposicao";

/**
 * V36 — AS FONTES DE CADA NATUREZA DA RECEITA, COM PERCENTUAL. A regra é do M04 (`modules/m04-receita/fontes-da-natureza.ts`).
 * Leitura: CONSULTAR_RECEITA. O formulário aparece para quem cadastra as naturezas.
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";

export default async function FontesDasNaturezasPage(): Promise<React.ReactElement> {
  const cabecalho = <PageHeader titulo="Fontes por natureza da receita" subtitulo="Em que fontes de recursos a receita de cada natureza se reparte, e em que percentual" />;
  let dados: TelaDasFontesDaNatureza;
  let podeRegistrar: boolean;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_RECEITA");
    const [d, permitidas] = await Promise.all([lerFontesDasNaturezas(), acoesPermitidas(["PARAMETRIZAR_ROTEIRO_ORCAMENTARIO"])]);
    dados = d;
    podeRegistrar = permitidas.has("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO");
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler as fontes das naturezas" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}
      <p className="text-xs text-[color:var(--color-ink-2)]">
        A composição com soma de 100% permite informar a previsão da receita da natureza por um valor só, que o sistema reparte pelas fontes (na tela da receita prevista). Cada parte é calculada sem arredondar para cima, e o centavo que sobra vai à fonte indicada.
      </p>
      {dados.composicoes.length === 0 ? (
        <EstadoVazio titulo="Nenhuma natureza com fontes registradas" descricao="Registre abaixo as fontes de uma natureza da receita." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-tabela-composicoes>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                <th scope="col" className={celula}>Natureza</th>
                <th scope="col" className={celula}>Fontes</th>
                <th scope="col" className={`${celula} text-right`}>Soma</th>
                <th scope="col" className={celula}>Centavo de sobra</th>
                <th scope="col" className={celula}>Fundamento</th>
                <th scope="col" className={celula}>Registro</th>
              </tr>
            </thead>
            <tbody>
              {dados.composicoes.map((c) => (
                <tr key={c.naturezaCodigo} data-composicao={c.naturezaCodigo}>
                  <td className={celula}>
                    <span className="font-mono text-xs">{c.naturezaCodigo}</span> {c.naturezaDescricao}
                  </td>
                  <td className={celula}>
                    <ul>
                      {c.itens.map((i) => (
                        <li key={i.fonte} data-item-fonte={i.fonte}>
                          {i.fonte} — {i.fonteDescricao}: {i.percentual}%
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className={`${celula} text-right tabular-nums`}>
                    {c.soma}%{c.completa ? null : <span className="block text-xs text-[color:var(--color-status-alerta-fg)]">incompleta: não rateia</span>}
                  </td>
                  <td className={celula}>{c.fonteDoResiduo}</td>
                  <td className={celula}>{c.fundamento}</td>
                  <td className={celula}>
                    {c.registradaEm} por {c.registradaPor}
                    {c.versoes > 1 ? <span className="block text-xs text-[color:var(--color-ink-2)]">{c.versoes} versões; vale a mais recente</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeRegistrar ? <FormDaComposicao naturezas={dados.naturezas} fontes={dados.fontes} /> : null}
    </div>
  );
}
