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
          <PageHeader titulo="Portal do Servidor" subtitulo="O que é seu: vínculos, dependentes e contracheques." />
          <EstadoVazio
            titulo="A sua conta ainda não está ligada ao seu cadastro de pessoa"
            descricao="O portal mostra o que é SEU, e para isso precisa saber qual pessoa do cadastro único você é. Esse vínculo é feito pelo administrador, pelo CPF — nunca pelo nome. Procure a administração do sistema."
          />
        </div>
      );
    }
    if (ficha.semFicha) {
      return (
        <div className="space-y-6">
          <PageHeader titulo="Portal do Servidor" subtitulo={`${ficha.pessoa.nome} · ${ficha.pessoa.documento}`} />
          <EstadoVazio
            titulo="Você não tem ficha de servidor neste ente"
            descricao="A sua conta está ligada ao seu cadastro de pessoa, mas o setor de pessoal ainda não abriu a sua ficha de servidor. Enquanto ela não existir, não há vínculo nem contracheque a mostrar."
          />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <PageHeader
          titulo={`Olá, ${ficha.nomeSocial ?? ficha.pessoa.nome}`}
          subtitulo={`${ficha.pessoa.documento}${ficha.nascimento === null ? "" : ` · nascimento ${ficha.nascimento}`} · o que aparece aqui é o que o sistema tem sobre você`}
        />

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Meus vínculos</h2>
          <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
            Cargo, lotação, salário e situação são os de HOJE, derivados dos atos registrados na sua vida funcional.
          </p>
          {ficha.vinculos.length === 0 ? (
            <p className="text-xs text-[color:var(--color-ink-2)]">Sua ficha existe, mas ainda não há matrícula registrada nela.</p>
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
              Não há dependente registrado na sua ficha. Quem registra é o setor de pessoal, com os documentos.
            </p>
          ) : (
            <ul className="space-y-2">
              {ficha.dependentes.map((d) => (
                <li key={d.id} data-dependente={d.id} className="text-sm text-[color:var(--color-ink)]">
                  {d.nome} · {d.parentesco.toLowerCase()} · nascimento {d.nascimento}
                  <ul className="ml-4 list-disc text-xs text-[color:var(--color-ink-2)]">
                    {d.finalidades.map((f) => (
                      <li key={f.finalidade}>
                        {f.finalidade.toLowerCase().replace(/_/g, " ")}: {f.vale ? "vale hoje" : `não vale hoje — ${f.motivo ?? "sem motivo declarado"}`}
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
            Só aparecem as folhas já FECHADAS pelo ente. Um cálculo ainda aberto pode ser cancelado e refeito — mostrá-lo
            aqui seria prometer um valor que a competência ainda pode mudar.
          </p>
          {ficha.contracheques.length === 0 ? (
            <p className="text-xs text-[color:var(--color-ink-2)]">
              Nenhuma folha fechada com pagamento para você até agora.
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
          <PageHeader titulo="Portal do Servidor" subtitulo="O que é seu: vínculos, dependentes e contracheques." />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê a sua ficha e os seus contracheques. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
