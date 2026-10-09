import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { ListaDeAnexos } from "../../../../components/ui/ListaDeAnexos";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import type { AnexoNaLista } from "../../../../lib/portas/documentos";
import type { LiquidacaoDaTela, NotaDaLiquidacao } from "../../../../lib/portas/liquidacao";
import { dataBr } from "../../../../lib/recorte";
import { formatarDocumento } from "../../../../packages/documento/index";
import { FormAnexo } from "../../documentos/FormAnexo";

export function SituacaoDaLiquidacao({ l }: { readonly l: LiquidacaoDaTela }): React.ReactElement {
  const situacao = l.anulado ? (
    <Badge status="erro">Anulada</Badge>
  ) : l.saldoAPagar === "0.00" ? (
    <Badge status="ok">Paga</Badge>
  ) : (
    <Badge status="alerta">Na fila</Badge>
  );
  if (!l.despesaSemEmpenhoPrevio) return situacao;
  // V36 — a despesa foi realizada antes do empenho: aparece junto da situação, em toda lista e no resumo.
  return (
    <span className="flex flex-col items-start gap-1" data-sem-empenho-previo>
      {situacao}
      <Badge status="alerta">Sem empenho prévio</Badge>
    </span>
  );
}

/**
 * A LIQUIDAÇÃO NO MODAL (V22) — o mesmo desenho do empenho: os dados da linha organizados, a nota
 * fiscal (número, série, data), e os COMPROVANTES: a lista do que foi anexado e o envio de um novo
 * (o comprovante do banco, a nota digitalizada).
 *
 * ⚠️ O ANEXO NÃO É O PAGAMENTO. Anexar o comprovante guarda o documento com a verificação SHA-256
 * dele; não registra pagamento, não baixa saldo, não mexe na fila. O pagamento é ato próprio, na
 * tela de pagamentos, com a conferência de fonte que ele exige.
 */
export function ResumoDaLiquidacao({
  l,
  credorNome,
  nota,
  anexos,
  aceitos,
  tamanhoMaximoBytes,
}: {
  readonly l: LiquidacaoDaTela;
  readonly credorNome: string | null;
  readonly nota: NotaDaLiquidacao | undefined;
  readonly anexos: readonly AnexoNaLista[];
  readonly aceitos: string;
  readonly tamanhoMaximoBytes: number;
}): React.ReactElement {
  const linha = (rotulo: string, valor: React.ReactNode): React.ReactElement => (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm text-[color:var(--color-ink)]">{valor}</dd>
    </div>
  );
  const temNota = nota !== undefined && (nota.numero !== null || nota.chave !== null);
  return (
    <div className="space-y-5" data-resumo-da-liquidacao={l.numero}>
      <SituacaoDaLiquidacao l={l} />

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {linha("Data", dataBr(l.data))}
        {linha(
          "Empenho",
          <Link href={`/despesa/empenhos/${l.empenhoId}`} className="font-medium text-[color:var(--color-primary)] hover:underline">
            {l.empenhoNumero}
          </Link>
        )}
        {linha(
          "Credor",
          credorNome !== null ? (
            <>
              {credorNome}
              <span className="block text-xs text-[color:var(--color-ink-3)]">{formatarDocumento(l.credorCpfCnpj)}</span>
            </>
          ) : (
            formatarDocumento(l.credorCpfCnpj)
          )
        )}
        {linha("Fonte de recursos", l.fonteCodigo)}
        {linha("Responsável pelo atesto", l.responsavelAtesto)}
      </dl>

      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Nota fiscal</h3>
        {temNota ? (
          <dl className="grid gap-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 sm:grid-cols-4">
            {linha("Número", nota.numero ?? "—")}
            {linha("Série", nota.serie ?? "—")}
            {linha("Emissão", nota.data !== null ? dataBr(nota.data) : "—")}
            {linha("Valor", nota.valor !== null ? <ValorMonetario valor={nota.valor} /> : "—")}
            {nota.chave !== null ? <div className="sm:col-span-4">{linha("Chave de acesso", <span className="font-mono text-xs">{nota.chave}</span>)}</div> : null}
          </dl>
        ) : (
          <p className="text-sm text-[color:var(--color-ink-2)]">Esta liquidação não registrou nota fiscal.</p>
        )}
      </div>

      {/* V38 — a contadora procurou aqui onde informar a retenção: ela é informada ao pagar. */}
      <p data-onde-fica-a-retencao className="text-xs text-[color:var(--color-ink-2)]">
        As retenções na fonte (IR, INSS, ISS e consignações) são informadas no pagamento desta liquidação.{" "}
        <a href={`/despesa/pagamentos?liquidacao=${l.id}`} className="font-medium text-[color:var(--color-primary)] hover:underline">
          Pagar esta liquidação, com as retenções
        </a>
      </p>

      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Valores (R$)</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 sm:grid-cols-4">
          {([
            ["Valor liquidado", l.valor],
            ["Líquido de anulações", l.liquidadoLiquido],
            ["Pago", l.pago],
            ["A pagar", l.saldoAPagar],
          ] as const).map(([r, v]) => (
            <div key={r} className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-[color:var(--color-ink-2)]">{r}</dt>
              <dd className="text-sm font-semibold">
                <ValorMonetario valor={v} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div data-comprovantes>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Comprovantes</h3>
        <ListaDeAnexos anexos={anexos} />
        {l.anulado ? null : (
          <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border-strong)] p-3" data-chrome>
            <FormAnexo dono={{ liquidacaoId: l.id }} accept={aceitos} tamanhoMaximoBytes={tamanhoMaximoBytes} rotulo="Anexar comprovante do banco" />
          </div>
        )}
      </div>
    </div>
  );
}
