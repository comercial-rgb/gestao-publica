import { Card } from "../../../../../components/ui/Card";
import { Badge, type StatusBadge } from "../../../../../components/ui/Badge";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";

export interface FatoDoAtesto {
  readonly id: string;
  readonly tipo: string;
  readonly motivo: string | null;
  readonly sha256: string;
  readonly vinculos: number;
  readonly totalLiquido: string;
  readonly ato: string;
  readonly responsavel: string;
  readonly criadoPor: string;
  readonly quando: string;
}

/**
 * A CERTIFICAÇÃO (ATESTO) DA FOLHA (V6.1) — quem respondeu por ela, sob qual ato, e o que conferiu.
 *
 * ⚠️ ESCRITA À MÃO, fora do molde (limite 2): é uma segunda coleção dentro de um detalhe, com um
 * manifesto por linha. E o estado PENDENTE precisa de texto próprio — uma tabela vazia sob o
 * título "certificação" deixaria o leitor supondo que o atesto existe e não foi carregado.
 *
 * ⚠️ ELA DIZ O QUE FALTA, não só o que há. Sem designação cadastrada, quem abre esta tela é quem
 * pode resolver; a mensagem manda ao lugar certo em vez de repetir "pendente".
 */
export function CertificacaoDaFolha({ situacao, fatos }: { readonly situacao: string; readonly fatos: readonly FatoDoAtesto[] }): React.ReactElement {
  const tom: StatusBadge = situacao === "CERTIFICADA" ? "ok" : situacao === "DEVOLVIDA" ? "erro" : "alerta";
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Certificação (atesto)</h2>
        <Badge status={tom}>{situacao}</Badge>
      </div>
      {fatos.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Esta folha ainda não foi certificada. O atesto é de quem o ente designou por ato administrativo — portaria,
          decreto ou delegação —, e o sistema não escolhe um cargo por conta própria. Cadastre a designação em
          Folha · Designações; sem ela, o ato de certificar recusa dizendo o que falta. Quem calculou ou fechou esta
          folha não a certifica.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
            O atesto se prende ao CÁLCULO conferido, não à folha: o manifesto abaixo tem entidade, competência, cálculo,
            totais, os vínculos e onde a despesa cai — e o sha256 é dele. Um cálculo novo é outro objeto, e o atesto
            anterior não o alcança.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3 text-left">Ato</th>
                  <th scope="col" className="py-2 pr-3 text-left">Quando</th>
                  <th scope="col" className="py-2 pr-3 text-left">Responsável</th>
                  <th scope="col" className="py-2 pr-3 text-left">Designação</th>
                  <th scope="col" className="py-2 pr-3 text-right">Vínculos</th>
                  <th scope="col" className="py-2 text-right">Líquido conferido</th>
                </tr>
              </thead>
              <tbody>
                {fatos.map((f) => (
                  <tr key={f.id} data-atesto={f.tipo} className="border-b border-[color:var(--color-border)] align-top">
                    <td className="py-2 pr-3 font-medium">{f.tipo === "CERTIFICACAO" ? "Certificação" : "Devolução"}</td>
                    <td className="py-2 pr-3 tabular-nums">{f.quando}</td>
                    <td className="py-2 pr-3">
                      {f.responsavel}
                      <span className="block text-[11px] text-[color:var(--color-ink-3)]">conta {f.criadoPor}</span>
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                      {f.ato}
                      {f.motivo === null ? null : <span className="mt-0.5 block text-[11px] break-words [overflow-wrap:anywhere] text-[color:var(--color-ink-3)]">motivo: {f.motivo}</span>}
                      <span className="mt-0.5 block text-[11px] break-words [overflow-wrap:anywhere] text-[color:var(--color-ink-3)]">sha256 do manifesto: {f.sha256}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.vinculos}</td>
                    <td className="py-2 text-right"><ValorMonetario valor={f.totalLiquido} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
