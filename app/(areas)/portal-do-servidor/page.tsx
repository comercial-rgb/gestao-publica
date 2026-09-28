import Link from "next/link";
import { Card } from "../../../components/ui/Card";
import { EstadoVazio } from "../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../lib/portas/leitura";
import { minhaFichaPara, PortaSemBancoError } from "../../../lib/portas/portal-do-servidor";

/**
 * O PORTAL DO SERVIDOR (V6 P2.4): vínculos, dependentes e contracheques DO PRÓPRIO usuário.
 *
 * ⚠️ NÃO HÁ ID NA ENTRADA. A porta resolve a pessoa pela sessão (vínculo explícito usuário →
 * pessoa do M16) — não há parâmetro a adulterar. Sem vínculo, a tela DIZ que ele está pendente e
 * quem resolve; sem ficha de servidor, diz isso também. Nenhuma das duas mostra a ficha de outra
 * pessoa, e nenhuma finge que o dado não existe.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: tudo depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina(): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraDoEnte("CONSULTAR_PORTAL_DO_SERVIDOR");
  try {
    const ficha = await minhaFichaPara(sessao);
    if (ficha.pessoa === null) {
      return (
        <div className="space-y-6">
          <PageHeader titulo="Portal do Servidor" subtitulo="Consulta de vínculos, dependentes e contracheques do servidor." />
          <EstadoVazio
            titulo="A sua conta ainda não está ligada ao seu cadastro de pessoa"
            descricao="Para exibir suas informações, sua conta precisa estar vinculada ao seu cadastro pelo CPF. Solicite o vínculo à administração do sistema."
          />
        </div>
      );
    }
    if (ficha.semFicha) {
      return (
        <div className="space-y-6">
          <PageHeader titulo="Portal do Servidor" subtitulo={`${ficha.pessoa.nome} · ${ficha.pessoa.documento}`} />
          <EstadoVazio
            titulo="Ficha de servidor não encontrada"
            descricao="Sua conta está vinculada ao seu cadastro, mas o setor de pessoal ainda não registrou sua ficha de servidor. Após o registro, seus vínculos e contracheques serão exibidos aqui."
          />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <PageHeader
          titulo={`Olá, ${ficha.nomeSocial ?? ficha.pessoa.nome}`}
          subtitulo={`${ficha.pessoa.documento}${ficha.nascimento === null ? "" : ` · nascimento ${ficha.nascimento}`}`}
        />

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Meus vínculos</h2>
          <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
            Cargo, lotação, salário e situação atuais, conforme os atos registrados na sua vida funcional.
          </p>
          {ficha.vinculos.length === 0 ? (
            <p className="text-xs text-[color:var(--color-ink-2)]">Nenhuma matrícula registrada na sua ficha.</p>
          ) : (
            <ul className="space-y-3">
              {ficha.vinculos.map((v) => (
                <li key={v.id} data-vinculo={v.matricula} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
                  <p className="text-sm font-medium text-[color:var(--color-ink)]">
                    Matrícula {v.matricula} · {v.situacao}
                  </p>
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      ["Cargo", v.cargo],
                      ["Lotação", v.lotacao],
                      ["Tipo de vínculo", v.tipo],
                      ["Regime jurídico", v.regimeJuridico],
                      ["Previdência", v.regimePrevidenciario],
                      ["Desde", v.desde],
                    ].map(([rotulo, valor]) => (
                      <div key={rotulo}>
                        <dt className="text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">{rotulo}</dt>
                        <dd className="text-sm text-[color:var(--color-ink)]">{valor}</dd>
                      </div>
                    ))}
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">Salário base</dt>
                      <dd className="text-sm text-[color:var(--color-ink)]">
                        {v.salarioBase === "—" ? "—" : <ValorMonetario valor={v.salarioBase} comSimbolo />}
                      </dd>
                    </div>
                  </dl>
                  {v.gratificacoes.length > 0 ? (
                    <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
                      Gratificações: {v.gratificacoes.map((g) => `${g.descricao} ${g.valor}`).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Meus dependentes</h2>
          {ficha.dependentes.length === 0 ? (
            <p className="text-xs text-[color:var(--color-ink-2)]">
              Nenhum dependente registrado na sua ficha. O registro é feito pelo setor de pessoal, mediante apresentação dos documentos.
            </p>
          ) : (
            <ul className="space-y-2">
              {ficha.dependentes.map((d) => (
                <li key={d.id} data-dependente={d.id} className="text-sm text-[color:var(--color-ink)]">
                  {d.nome} · {d.parentesco.toLowerCase()} · nascimento {d.nascimento}
                  <ul className="ml-4 list-disc text-xs text-[color:var(--color-ink-2)]">
                    {d.finalidades.map((f) => (
                      <li key={f.finalidade}>
                        {f.finalidade.toLowerCase().replace(/_/g, " ")}: {f.vale ? "válido atualmente" : `não válido atualmente: ${f.motivo ?? "motivo não informado"}`}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Meus contracheques</h2>
          <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
            São exibidas apenas as folhas já fechadas. Valores de folhas em aberto ainda podem ser alterados.
          </p>
          {ficha.contracheques.length === 0 ? (
            <p className="text-xs text-[color:var(--color-ink-2)]">
              Nenhum contracheque disponível até o momento.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
                    <th scope="col" className="py-2 pr-3 text-left">Competência</th>
                    <th scope="col" className="py-2 pr-3 text-left">Matrícula</th>
                    <th scope="col" className="py-2 pr-3 text-right">Proventos</th>
                    <th scope="col" className="py-2 pr-3 text-right">Descontos</th>
                    <th scope="col" className="py-2 text-right">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.contracheques.map((c) => (
                    <tr key={`${c.folhaId}-${c.matricula}`} data-contracheque={c.competencia} className="border-b border-[color:var(--color-border)]">
                      <td className="py-2 pr-3">
                        <Link href={`/portal-do-servidor/contracheque/${c.folhaId}`} className="font-medium text-[color:var(--color-acento)] underline underline-offset-2">
                          {c.competencia}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">{c.matricula}</td>
                      <td className="py-2 pr-3 text-right"><ValorMonetario valor={c.proventos} /></td>
                      <td className="py-2 pr-3 text-right"><ValorMonetario valor={c.descontos} /></td>
                      <td className="py-2 text-right font-medium"><ValorMonetario valor={c.liquido} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo="Portal do Servidor" subtitulo="Consulta de vínculos, dependentes e contracheques do servidor." />
          <EstadoVazio titulo="Dados indisponíveis no momento" descricao="Não foi possível acessar as informações. Tente novamente mais tarde." />
        </div>
      );
    }
    throw e;
  }
}
