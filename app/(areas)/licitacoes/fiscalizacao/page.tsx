import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { administradoresDaFiscalizacaoPara, fiscalizacoesDaSessao } from "../../../../lib/portas/contrato-acompanhado";
import { exigirSessao } from "../../../../lib/portas/sessao";
import { FormDefinirAdministrador, FormRevogarAdministrador } from "./FormulariosDaAdministracao";

/**
 * A FISCALIZAÇÃO DA SESSÃO (V7 M2 U0.1) — os contratos que a pessoa fiscaliza, gere ou recebe, recortados pelo
 * domínio (designação vigente; todos para o administrador da fiscalização). Quem não tem nenhum vê a frase, não uma
 * lista de outros. Abaixo, para quem tem o poder de definir, os administradores da fiscalização.
 */
export const dynamic = "force-dynamic";

const PAPEL: Readonly<Record<string, string>> = { GESTOR: "gestor", FISCAL: "fiscal", RECEBEDOR_DEFINITIVO: "recebedor definitivo" };

export default async function Fiscalizacao(): Promise<React.ReactElement> {
  const sessao = await exigirSessao();
  const [minhas, administracao] = await Promise.all([fiscalizacoesDaSessao(sessao), administradoresDaFiscalizacaoPara()]);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Fiscalização de contratos</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">Os contratos em que você está designado hoje{minhas.administrador ? " — e, como administrador da fiscalização, todos os contratos" : ""}.</p>
      </header>
      <Card>
        {minhas.contratos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-fiscalizacao>Você não tem designação vigente em contrato nenhum nem definição de administrador da fiscalização.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm" data-fiscalizacoes>
              <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Contrato</th><th className="py-1 pr-2">Contratado</th><th className="py-1 pr-2">Vigência</th><th className="py-1">Seu papel</th></tr></thead>
              <tbody>
                {minhas.contratos.map((c) => (
                  <tr key={c.id} data-contrato-fiscalizado={c.numero} className="border-t border-[color:var(--color-border)]">
                    <td className="py-2 pr-2"><Link href={`/licitacoes/contratos/${c.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2">{c.numero}</Link>{c.objeto === null ? null : <span className="block text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{c.objeto}</span>}</td>
                    <td className="py-2 pr-2">{c.contratado}</td>
                    <td className="py-2 pr-2">{c.vigencia}</td>
                    <td className="py-2">{c.papeis.length === 0 ? <Badge status="neutro">administração</Badge> : c.papeis.map((p) => <Badge key={p} status="ok">{PAPEL[p] ?? p}</Badge>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {administracao === null ? null : (
        <section aria-label="Administradores da fiscalização" className="space-y-3">
          <Card>
            <h2 className="mb-2 text-sm font-semibold">Administradores da fiscalização</h2>
            {administracao.lista.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma definição.</p> : (
              <ul className="space-y-3" data-administradores>
                {administracao.lista.map((a) => (
                  <li key={a.id} data-administrador={a.usuario} className="text-sm">
                    <p>{a.nome} <span className="text-xs text-[color:var(--color-ink-2)]">· {a.usuario} · {a.ato} · desde {a.inicio}{a.fim === null ? "" : ` até ${a.fim}`}{a.revogadaEm === null ? "" : ` · revogada com efeito em ${a.revogadaEm}`}</span> <Badge status={a.vigenteHoje ? "ok" : "neutro"}>{a.vigenteHoje ? "vigente" : "sem vigência hoje"}</Badge></p>
                    {a.revogadaEm === null ? <FormRevogarAdministrador administradorId={a.id} nome={a.nome} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <FormDefinirAdministrador usuarios={administracao.usuarios} />
        </section>
      )}
    </div>
  );
}
