import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerFaps } from "../../../../../lib/portas/fap";
import { FormAprovarFap, FormCadastrarFap } from "./FormsDoFap";

/**
 * O FATOR ACIDENTÁRIO DE PREVENÇÃO (V24) — o multiplicador do RAT (Decreto 3.048/1999, art. 202-A). A
 * apuração dos encargos usa o aprovado mais recente do CNPJ do ente no ano da competência, nas versões
 * do RAT marcadas para multiplicar pelo FAP.
 */
export const dynamic = "force-dynamic";

export default async function PaginaDoFap(): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FOLHA");
  const { cnpjDoEnte, faps } = await lerFaps();

  return (
    <div className="space-y-4">
      <PageHeader titulo="Fator Acidentário de Prevenção (FAP)" subtitulo="O multiplicador anual do RAT, por CNPJ (Decreto 3.048/1999, art. 202-A)" />

      {cnpjDoEnte === null ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-sm text-[color:var(--color-status-alerta-fg)]">
          O CNPJ do ente não está configurado: a apuração não sabe de qual CNPJ ler o FAP, e o RAT que o aplica fica sem cálculo.
        </p>
      ) : null}

      <Card>
        {faps.length === 0 ? (
          <EstadoVazio titulo="Nenhum FAP cadastrado" descricao="Sem FAP aprovado, o RAT marcado para multiplicar pelo FAP fica sem cálculo na apuração, com o motivo." />
        ) : (
          <table className="w-full text-left text-sm" data-lista="fap">
            <thead>
              <tr className="text-xs text-[color:var(--color-ink-2)]">
                <th className="py-1 pr-3">Ano</th>
                <th className="py-1 pr-3">CNPJ</th>
                <th className="py-1 pr-3">FAP</th>
                <th className="py-1 pr-3">Situação</th>
                <th className="py-1 pr-3">De onde veio</th>
                <th className="py-1">Cadastro e aprovação</th>
              </tr>
            </thead>
            <tbody>
              {faps.map((f) => (
                <tr key={f.id} data-fap-ano={f.ano} className="border-t border-[color:var(--color-border)] align-top">
                  <td className="py-1.5 pr-3">{f.ano}</td>
                  <td className="py-1.5 pr-3">{f.cnpj}</td>
                  <td className="py-1.5 pr-3 font-medium">{f.fator}</td>
                  <td className="py-1.5 pr-3">
                    {f.vigente ? <Badge status="ok">Em uso na apuração</Badge> : f.aprovacao === null ? <Badge status="alerta">Aguardando aprovação</Badge> : <Badge status="neutro">Substituído</Badge>}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">{f.fonte}</td>
                  <td className="py-1.5 text-xs">
                    Cadastrado por {f.cadastro}
                    {f.aprovacao === null ? <FormAprovarFap fatorId={f.id} ano={f.ano} /> : <span className="block">Aprovado por {f.aprovacao}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <FormCadastrarFap cnpjDoEnte={cnpjDoEnte} />
    </div>
  );
}
