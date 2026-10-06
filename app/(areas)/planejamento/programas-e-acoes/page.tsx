import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerProgramasEAcoesDoOrcamento, OBJETIVO_MILENIO_2026 } from "../../../../lib/portas/programas-e-acoes";
import { anoCivil } from "../../../../packages/datas/index";
import { FormDaAcao, FormDoPrograma } from "./Forms";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V26 — PROGRAMAS E AÇÕES DO ORÇAMENTO, com o objetivo, o objetivo da Agenda 2030, a meta e a unidade de medida que a
 * prestação de contas pede. Os que têm ficha no exercício; sem declaração, a linha diz o que falta.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function ProgramasEAcoesPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = /^\d{4}$/.test(sp["exercicio"] ?? "") ? Number(sp["exercicio"]) : anoCivil(new Date());
  let dados: Awaited<ReturnType<typeof lerProgramasEAcoesDoOrcamento>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    dados = await lerProgramasEAcoesDoOrcamento(exercicio);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Programas e ações" subtitulo="Os dados de cada programa e ação do orçamento para a prestação de contas" />
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const objetivos = Object.entries(OBJETIVO_MILENIO_2026).map(([codigo, descricao]) => ({ codigo, descricao }));
  const programasSem = dados.programas.filter((p) => p.vigente === null).length;
  const acoesSem = dados.acoes.filter((a) => a.vigente === null).length;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Programas e ações" subtitulo={`Os programas e ações do orçamento de ${exercicio}, com os dados da prestação de contas`} />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O Tribunal de Contas pede, de cada programa, a denominação, o objetivo e o objetivo da Agenda 2030 a que ele se
        liga; de cada ação, a denominação e, quando houver, a meta e a unidade de medida. Os dados vêm do PPA e da LOA.
        Declarar de novo cria uma versão nova, com a data desde quando vale; a anterior continua registrada.
      </div>
      {programasSem + acoesSem > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="sem-declaracao">
          <strong>{programasSem} programa(s) e {acoesSem} ação(ões) sem dados declarados.</strong> Esses arquivos ficam fora da remessa ao Tribunal até a declaração.
        </div>
      ) : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Programas</h2>
        {dados.programas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhum programa com ficha no exercício.</p>
        ) : (
          <table className="w-full text-sm" data-lista="programas">
            <tbody>
              {dados.programas.map((p) => (
                <tr key={p.id} className="border-b border-[color:var(--color-border)] align-top" data-programa={p.codigo} data-declarado={p.vigente === null ? "nao" : "sim"}>
                  <td className="py-1.5 pr-4 font-mono">{p.codigo}</td>
                  <td className="py-1.5">
                    {p.vigente === null ? (
                      <>
                        {p.descricaoDoCadastro}
                        <span className="block text-xs text-[color:var(--color-status-erro-fg)]">sem objetivo declarado</span>
                      </>
                    ) : (
                      <>
                        <strong>{p.vigente.descricao}</strong>
                        <span className="block text-xs">{p.vigente.objetivo}</span>
                        <span className="block text-xs text-[color:var(--color-ink-3)]">Agenda 2030: {p.vigente.ods} · desde {p.vigente.desde} · por {p.vigente.por}</span>
                      </>
                    )}
                    <FormDoPrograma
                      programaId={p.id}
                      codigo={p.codigo}
                      objetivos={objetivos}
                      atual={{ descricao: p.vigente?.descricao ?? p.descricaoDoCadastro.slice(0, 70), objetivo: p.vigente?.objetivo ?? "", ods: p.vigente?.ods.slice(0, 2) ?? "" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Ações</h2>
        {dados.acoes.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma ação com ficha no exercício.</p>
        ) : (
          <table className="w-full text-sm" data-lista="acoes">
            <tbody>
              {dados.acoes.map((a) => (
                <tr key={a.id} className="border-b border-[color:var(--color-border)] align-top" data-acao-do-orcamento={a.codigo} data-declarado={a.vigente === null ? "nao" : "sim"}>
                  <td className="py-1.5 pr-4 font-mono">{a.codigo}</td>
                  <td className="py-1.5">
                    {a.vigente === null ? (
                      <>
                        {a.descricaoDoCadastro} <span className="text-xs text-[color:var(--color-ink-3)]">({a.tipo})</span>
                        <span className="block text-xs text-[color:var(--color-status-erro-fg)]">sem dados declarados</span>
                      </>
                    ) : (
                      <>
                        <strong>{a.vigente.descricao}</strong> <span className="text-xs text-[color:var(--color-ink-3)]">({a.tipo})</span>
                        {a.vigente.meta !== null ? <span className="block text-xs">Meta: {a.vigente.meta} ({a.vigente.unidade})</span> : null}
                        <span className="block text-xs text-[color:var(--color-ink-3)]">desde {a.vigente.desde} · por {a.vigente.por}</span>
                      </>
                    )}
                    <FormDaAcao acaoId={a.id} codigo={a.codigo} atual={{ descricao: a.vigente?.descricao ?? a.descricaoDoCadastro.slice(0, 70), meta: a.vigente?.meta ?? "", unidade: a.vigente?.unidade ?? "" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
