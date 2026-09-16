import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../../components/ui/ResultadosDosAtos";
import { tiposParaTela } from "../../../../../lib/portas/agenda-da-fiscalizacao";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { FormCadastrarTipo, FormMudarSituacaoDoTipo, FormPublicarVersao } from "../agenda/FormulariosDaAgenda";

/**
 * OS TIPOS DE OCORRÊNCIA DO ENTE E OS FORMULÁRIOS (V7 M2 U8) — cadastro, versões com perguntas e a situação de cada
 * tipo. O que já foi respondido fica na versão em que foi preenchido: publicar outra versão não reinterpreta nada.
 */
export const dynamic = "force-dynamic";

const NATUREZA: Readonly<Record<string, string>> = { CONFORMIDADE: "conformidade", NAO_CONFORMIDADE: "não conformidade", ATRASO: "atraso", IMPEDIMENTO: "impedimento", OUTRO: "outro" };
const RESPOSTA: Readonly<Record<string, string>> = { TEXTO: "texto", NUMERO: "número", DATA: "data", OPCAO: "lista de opções", SIM_NAO: "sim ou não" };
const br = (dia: string): string => dia.split("-").reverse().join("/");

export default async function TiposDeOcorrencia(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const t = await tiposParaTela();
  return (
    <ResultadosDosAtos>
      <div className="space-y-4" data-tipos-de-ocorrencia={t.tipos.length}>
        <nav aria-label="Trilha" className="text-xs text-[color:var(--color-ink-2)]">
          <Link href="/licitacoes/fiscalizacao" className="underline underline-offset-2">Fiscalização</Link> / Tipos de ocorrência
        </nav>
        <header>
          <h1 className="text-xl font-semibold">Tipos de ocorrência e formulários</h1>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">O que o fiscal escolhe ao registrar uma ocorrência, e as perguntas que ele responde. Cada mudança é uma versão nova, com a data em que passa a valer.</p>
        </header>
        <AvisosDosAtos />

        <Card>
          {t.tipos.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-tipos>Nenhum tipo cadastrado. Sem tipo com formulário, a ocorrência continua sendo registrada pelo vocabulário fixo do sistema.</p> : (
            <ul className="space-y-4">
              {t.tipos.map((x) => (
                <li key={x.tipoId} data-tipo={x.codigo} className="border-t border-[color:var(--color-border)] pt-3 first:border-t-0 first:pt-0">
                  <p className="text-sm">
                    <strong>{x.codigo}</strong> — {x.nome} · {NATUREZA[x.natureza] ?? x.natureza} <Badge status={x.ativo ? "ok" : "neutro"}>{x.ativo ? "ativo" : "inativo"}</Badge>
                    {x.versaoVigente === null ? <Badge status="alerta">sem formulário publicado</Badge> : <Badge status="neutro">versão {x.versaoVigente.versao} desde {br(x.versaoVigente.vigenciaInicio)}</Badge>}
                  </p>
                  {x.versaoVigente === null ? null : (
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full min-w-[32rem] text-left text-xs" data-perguntas-do-tipo={x.codigo}>
                        <thead><tr className="text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Pergunta</th><th className="py-1 pr-2">Resposta</th><th className="py-1 pr-2">Obrigatória</th><th className="py-1">Opções</th></tr></thead>
                        <tbody>
                          {x.versaoVigente.perguntas.map((p) => (
                            <tr key={p.id} className="border-t border-[color:var(--color-border)]">
                              <td className="py-1 pr-2 [overflow-wrap:anywhere]">{p.rotulo}</td>
                              <td className="py-1 pr-2">{RESPOSTA[p.tipoDeResposta] ?? p.tipoDeResposta}</td>
                              <td className="py-1 pr-2">{p.obrigatoria ? "sim" : "não"}</td>
                              <td className="py-1 [overflow-wrap:anywhere]">{p.opcoes.length === 0 ? "—" : p.opcoes.join(" · ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{x.versaoVigente.exigeGravidade ? "Exige a gravidade da ocorrência." : "Não classifica gravidade."} Encaminhamento sugerido: {x.versaoVigente.encaminhamentoPadrao === "GESTOR" ? "ao gestor" : "só registro"}. {x.versoes} versão(ões) no histórico.</p>
                    </div>
                  )}
                  {t.podeGerir ? (
                    <>
                      <FormPublicarVersao tipoId={x.tipoId} codigo={x.codigo} proximaVersao={x.versoes + 1} hoje={t.hoje} />
                      <FormMudarSituacaoDoTipo tipoId={x.tipoId} codigo={x.codigo} ativo={x.ativo} />
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {t.podeGerir ? null : <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-motivo-dos-tipos>Cadastrar tipos e publicar formulários é da administração da fiscalização (a ação de gerir tipos de ocorrência no seu perfil).</p>}
        </Card>
        {t.podeGerir ? <FormCadastrarTipo /> : null}
      </div>
    </ResultadosDosAtos>
  );
}
