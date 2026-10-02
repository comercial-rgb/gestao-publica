import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { EFEITOS_ESCOLHIVEIS, lerElementosEAsContas } from "../../../../lib/portas/contas-da-liquidacao";
import { FormContaDaLiquidacao } from "./FormContaDaLiquidacao";

/**
 * AS CONTAS DA LIQUIDAÇÃO POR ELEMENTO — onde a contabilidade diz em que cada despesa se
 * transforma ao ser liquidada (M01, V28).
 *
 * ⚠️ POR QUE ESTA TELA EXISTE. A liquidação de obras, equipamentos e de todo elemento fora de
 * 30, 39 e 71 era recusada, e a recusa não tinha saída. Aqui a decisão do contador é escrita,
 * com fundamento e versão, e a liquidação passa a lê-la.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const SITUACAO: Readonly<Record<string, { readonly rotulo: string; readonly status: "ok" | "alerta" | "neutro" }>> = {
  FIXA: { rotulo: "Regra fixa", status: "neutro" },
  DECLARADA: { rotulo: "Declarada", status: "ok" },
  PENDENTE: { rotulo: "Sem conta", status: "alerta" },
};

export default async function ContasDaLiquidacaoPage(): Promise<React.ReactElement> {
  let elementos: Awaited<ReturnType<typeof lerElementosEAsContas>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    elementos = await lerElementosEAsContas();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Contas da liquidação por elemento" subtitulo="Em que cada despesa se transforma ao ser liquidada" />
        <EstadoVazio titulo="Não foi possível ler os elementos" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  const pendentes = elementos.filter((e) => e.situacao === "PENDENTE");

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Contas da liquidação por elemento" subtitulo="Em que cada despesa se transforma ao ser liquidada" />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Ao liquidar, a despesa vira despesa do período, bem do imobilizado, ativo intangível ou a baixa de uma
        obrigação, conforme o elemento. <strong>A liquidação de elemento sem conta declarada não é aceita.</strong>{" "}
        Uma nova declaração cria outra versão, sem alterar as liquidações já feitas.
      </div>

      {pendentes.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="elementos-sem-conta">
          <strong>
            {pendentes.length} elemento(s) com dotação e sem conta de liquidação: {pendentes.map((e) => e.elemento).join(", ")}
          </strong>
          . A liquidação desses elementos não é aceita até a declaração.
        </div>
      ) : null}

      <FormContaDaLiquidacao efeitos={EFEITOS_ESCOLHIVEIS} {...(pendentes[0] !== undefined ? { elementoInicial: pendentes[0].elemento } : {})} />

      <Card>
        {elementos.length === 0 ? (
          <EstadoVazio titulo="Nenhum elemento com dotação" descricao="Os elementos aparecem aqui quando houver ficha orçamentária com eles." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Elementos de despesa e a conta debitada na liquidação de cada um</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3">Elemento</th>
                  <th scope="col" className="py-2 pr-3">Situação</th>
                  <th scope="col" className="py-2 pr-3">Conta debitada</th>
                  <th scope="col" className="py-2 pr-3">Efeito</th>
                  <th scope="col" className="py-2 pr-3">Fundamento</th>
                </tr>
              </thead>
              <tbody>
                {elementos.map((e) => (
                  <tr key={e.elemento} data-elemento={e.elemento} className="border-t border-[color:var(--color-border)] align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {e.elemento}
                      {e.exemplo !== null ? <span className="block text-[color:var(--color-ink-3)]">{e.exemplo}</span> : null}
                      {e.fichas > 0 ? <span className="block text-[color:var(--color-ink-3)]">{e.fichas} ficha(s)</span> : null}
                    </th>
                    <td className="py-2 pr-3" data-papel="situacao">
                      <Badge status={SITUACAO[e.situacao]!.status}>{SITUACAO[e.situacao]!.rotulo}</Badge>
                      {e.versao !== null ? <span className="ml-2 text-[color:var(--color-ink-3)]">versão {String(e.versao)}</span> : null}
                    </td>
                    <td className="py-2 pr-3" data-papel="conta">
                      {e.contaCodigo === null ? "—" : `${e.contaCodigo}${e.contaNome !== null ? ` — ${e.contaNome}` : ""}`}
                    </td>
                    <td className="py-2 pr-3">{e.efeitoRotulo ?? "—"}</td>
                    <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                      {e.fundamento ?? "—"}
                      {e.criadoPor !== null ? <span className="block text-[color:var(--color-ink-3)]">por {e.criadoPor}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
