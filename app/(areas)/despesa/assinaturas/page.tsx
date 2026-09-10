import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  documentosDaDespesa,
  PortaSemBancoError,
  possiveisSignatarios,
} from "../../../../lib/portas/assinatura-despesa";
import { FormAssinar, FormEnviarAssinatura } from "./FormsDeAssinatura";

/**
 * ASSINATURA DE EMPENHO, LIQUIDAÇÃO E ORDEM DE PAGAMENTO — ENT03a, item 4.
 *
 * É o quarto dos quatro percursos da definição de concluído: gerar o documento, pô-lo na
 * **fila do ENT02** e colher as assinaturas, com o estado visível após recarga.
 *
 * ⚠️ A FILA É A MESMA DO ENT02 — `FilaDeAssinatura` do M22, a que o borderô já usava. Não
 * há fila paralela da despesa: uma segunda teria duplicado a ordenação, o "já assinou?" e
 * o significado do hash, e as duas divergiriam na primeira correção feita de um lado só.
 *
 * ⚠️ E O DOCUMENTO É UM ANEXO DE VERDADE (origem SISTEMA), com hash. Ele é baixável pela
 * rota do ENT02, com autorização POR REGISTRO — o anexo do empenho é escopado pelo
 * empenho, não pelo ente.
 */
export const dynamic = "force-dynamic";

const ROTULO: Record<"EMPENHO" | "LIQUIDACAO" | "ORDEM", string> = {
  EMPENHO: "Nota de empenho",
  LIQUIDACAO: "Nota de liquidação",
  ORDEM: "Ordem de pagamento",
};

export default async function AssinaturasPage(): Promise<React.ReactElement> {
  const cabecalho = (
    <PageHeader
      titulo="Assinatura dos documentos da despesa"
      subtitulo="Empenho, liquidação e ordem de pagamento na fila de assinaturas — ordenada, e só conclui com todos"
    />
  );

  try {
    const [docs, signatarios] = await Promise.all([
      documentosDaDespesa(),
      possiveisSignatarios(),
    ]);

    if (docs.length === 0) {
      return (
        <div className="space-y-6">
          {cabecalho}
          <EstadoVazio
            titulo="Nenhum documento da despesa"
            descricao="Emita um empenho, liquide-o ou prepare uma ordem de pagamento para ter o que assinar."
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {cabecalho}

        <div className="grid gap-3">
          {docs.map((d) => (
            <article
              key={`${d.tipo}:${d.registroId}`}
              data-documento={`${d.tipo}:${d.registroId}`}
              className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-1)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
                  {ROTULO[d.tipo]} {d.numero}
                </h2>
                <span className="text-xs tabular-nums text-[color:var(--color-ink-2)]">
                  {d.data} · {d.valor}
                </span>
              </div>

              {d.filaId === null ? (
                <>
                  <p className="mt-1 text-[11px] text-[color:var(--color-ink-2)]">
                    Sem documento gerado. Ao gerar, o texto canônico vira anexo com hash e
                    entra na fila.
                  </p>
                  <FormEnviarAssinatura
                    tipo={d.tipo}
                    registroId={d.registroId}
                    numero={d.numero}
                    signatarios={signatarios}
                  />
                </>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span data-estado-fila={d.completa ? "completa" : "pendente"}>
                      <Badge status={d.completa ? "ok" : "alerta"}>
                        {d.completa ? "todas as assinaturas colhidas" : "aguardando assinatura"}
                      </Badge>
                    </span>
                    <a
                      href={`/documentos/anexos/${d.anexoId ?? ""}`}
                      className="text-xs underline"
                    >
                      baixar o documento
                    </a>
                  </div>
                  <ol className="mt-2 space-y-1 text-xs">
                    {d.assinaturas.map((s) => (
                      <li
                        key={s.ordem}
                        data-signatario={`${d.registroId}:${s.ordem}`}
                        className="flex items-center gap-2"
                      >
                        <span className="tabular-nums text-[color:var(--color-ink-2)]">
                          {s.ordem}.
                        </span>
                        <span>{s.usuario}</span>
                        <Badge status={s.assinou ? "ok" : "neutro"}>
                          {s.assinou ? "assinou" : "pendente"}
                        </Badge>
                      </li>
                    ))}
                  </ol>
                  {d.completa ? null : <FormAssinar filaId={d.filaId} />}
                </>
              )}
            </article>
          ))}
        </div>
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          {cabecalho}
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="A fila de assinaturas vive no banco. Sem ele, esta tela não tem o que mostrar."
          />
        </div>
      );
    }
    throw e;
  }
}
