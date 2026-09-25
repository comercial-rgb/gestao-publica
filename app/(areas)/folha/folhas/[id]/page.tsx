import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { FOLHAS } from "../../../../../lib/portas/recursos/folha";
import { abrangenciaDosCalculos, disponibilidadeDaFolha, verFolha } from "../../../../../lib/portas/recursos/folha-dados";
import { folhasAction } from "../actions";
import { lerEncargosDaFolha } from "../../../../../lib/portas/recursos/encargos-dados";
import { CertificacaoDaFolha } from "./CertificacaoDaFolha";
import { EncargosDaFolha } from "./EncargosDaFolha";
import { ObrigacoesDaFolha } from "./ObrigacoesDaFolha";
import { lerObrigacoesDaFolha, totaisDasObrigacoes } from "../../../../../lib/portas/recursos/obrigacoes-dos-encargos";
import { AbrangenciaDosCalculos } from "./AbrangenciaDosCalculos";
import { Contracheques } from "./Contracheques";
import { EmpenhosDaFolha } from "./EmpenhosDaFolha";
import { PainelDaCompetencia, type EtapaDoPainel } from "./PainelDaCompetencia";
import { formatarMoeda } from "../../../../../lib/format/moeda";

/**
 * O DETALHE DA FOLHA: a situação derivada, o cálculo vivo com o seu sha256, as ações (calcular,
 * cancelar o cálculo, fechar) e a LISTA DE CONTRACHEQUES do cálculo vivo — cada um com link para
 * a sua memória de cálculo.
 *
 * ⚠️ A LISTA DE CONTRACHEQUES É ESCRITA À MÃO, fora do molde (limite 2): ela é uma segunda coleção
 * dentro de um detalhe, e não cabe nas cinco abas fixas sem torcer o significado de "anexos". O
 * mesmo vale para o atesto (V6.1) e para os empenhos.
 *
 * ⚠️ AS DIMENSÕES APARECEM SEPARADAS — cálculo, certificação, apropriação e liquidação. Uma coluna
 * única que as somasse faria a tela dizer "liquidada" sobre folha que ninguém atestou, e "paga"
 * sobre dinheiro que não saiu.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(FOLHAS, await searchParams);
  const [detalhe, permitidas] = await Promise.all([verFolha(id), acoesPermitidas([...FOLHAS.acoes.map((a) => a.acaoDoCenso), "DESIGNAR_NA_FOLHA", "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA", "GERIR_GUIA_DE_RECOLHIMENTO", "ANULAR_LIQUIDACAO_PARCIAL", "ANULAR_EMPENHO_PARCIAL"])]);
  if (detalhe === null) notFound();
  // ⚠️ FALHAR A CONFERÊNCIA NÃO LIBERA A BARRA: `null` faz o molde travar cada ato com o motivo.
  const disponibilidade = await disponibilidadeDaFolha(id, permitidas).catch(() => null);
  const naAbaDados = consulta.aba === "dados";
  const [encargos, obrigacoes, abrangencia] = naAbaDados
    ? await Promise.all([lerEncargosDaFolha(id), detalhe.situacao === "FECHADA" ? lerObrigacoesDaFolha(id) : Promise.resolve(null), abrangenciaDosCalculos(id)])
    : [null, null, null];
  const brl = (v: string): string => `R$ ${formatarMoeda(v).texto}`;
  const etapas: EtapaDoPainel[] = naAbaDados ? [
    { nome: "Cálculo", situacao: detalhe.situacao === "FECHADA" ? "fechado" : detalhe.situacao === "CALCULADA" ? "calculado, aberto" : "sem cálculo", tom: detalhe.situacao === "SEM_CALCULO" ? "alerta" : "ok", detalhe: detalhe.subtitulo, ancora: "contracheques" },
    { nome: "Atesto salarial", situacao: detalhe.certificacao === null ? "não se aplica ainda" : detalhe.certificacao.situacao.toLowerCase(), tom: detalhe.certificacao?.situacao === "CERTIFICADA" ? "ok" : detalhe.certificacao === null ? "neutro" : "alerta", ...(detalhe.certificacao !== null ? { ancora: "certificacao" } : {}) },
    { nome: "Empenho e liquidação", situacao: detalhe.apropriacao === null ? "não apropriada" : `${detalhe.liquidacao?.liquidadas ?? 0} de ${detalhe.apropriacao.empenhos.length} liquidado(s)`, tom: detalhe.apropriacao === null ? "neutro" : (detalhe.liquidacao?.pendentes ?? 1) === 0 ? "ok" : "alerta", ...(detalhe.apropriacao !== null ? { detalhe: `empenhado ${brl(detalhe.apropriacao.total)}`, ancora: "empenhos" } : {}) },
    { nome: "Encargos do empregador", situacao: encargos?.vigente === null || encargos === null ? "não apurados" : `apuração nº ${encargos.vigente.numero} · ${encargos.vigente.situacao.toLowerCase()}`, tom: encargos?.vigente?.situacao === "CERTIFICADA" && encargos.vigente.completa ? "ok" : encargos?.vigente === null ? "neutro" : "alerta", ...(encargos?.vigente !== null && encargos !== null ? { detalhe: `total ${brl(encargos.vigente.total)} · ${encargos.empenhos.length} empenho(s), ${encargos.empenhos.filter((x) => x.liquidacao !== null).length} liquidado(s)`, ancora: "encargos" } : { ancora: "encargos" }) },
    ...(obrigacoes === null ? [] : [{
      nome: "Obrigações e guias",
      situacao: obrigacoes.length === 0 ? "sem obrigação liquidada" : `${obrigacoes.reduce((n, o) => n + o.guias.filter((g) => g.situacao === "BAIXADA").length, 0)} guia(s) baixada(s) de ${obrigacoes.reduce((n, o) => n + o.guias.filter((g) => g.situacao !== "CANCELADA").length, 0)}`,
      tom: (obrigacoes.length === 0 ? "neutro" : "alerta") as EtapaDoPainel["tom"],
      detalhe: obrigacoes.length === 0 ? "receber guia não paga nada" : `liquidado ${brl(totaisDasObrigacoes(obrigacoes).liquidado)} · pago ${brl(totaisDasObrigacoes(obrigacoes).pago)}`,
      ancora: "obrigacoes",
    }]),
  ] : [];
  return (
    <div className="space-y-4">
      <DetalheDeRecurso
        definicao={FOLHAS}
        id={id}
        titulo={detalhe.titulo}
        subtitulo={detalhe.subtitulo}
        selos={detalhe.selos}
        abaAtiva={consulta.aba as AbaDoMolde}
        dados={detalhe.dados}
        historico={detalhe.historico}
        {...(naAbaDados ? { resumo: <PainelDaCompetencia etapas={etapas} acoes={FOLHAS.acoes} disponibilidade={disponibilidade} permitidas={permitidas} /> } : {})}
        acoes={<FormsDoRecurso definicao={FOLHAS} permitidas={[...permitidas]} opcoes={{}} registroId={id} action={folhasAction} modo="acoes" disponibilidade={disponibilidade} />}
      />
      {consulta.aba === "dados" && detalhe.certificacao !== null ? <div id="certificacao" data-ancora className="scroll-mt-24"><CertificacaoDaFolha situacao={detalhe.certificacao.situacao} fatos={detalhe.certificacao.fatos} /></div> : null}
      {consulta.aba === "dados" && detalhe.apropriacao !== null ? <div id="empenhos" data-ancora className="scroll-mt-24"><EmpenhosDaFolha apropriacao={detalhe.apropriacao} liquidacoes={detalhe.liquidacao?.porEmpenho ?? {}} /></div> : null}
      {encargos !== null ? <div id="encargos" data-ancora className="scroll-mt-24"><EncargosDaFolha encargos={encargos} /></div> : null}
      {obrigacoes !== null ? <div id="obrigacoes" data-ancora className="scroll-mt-24"><ObrigacoesDaFolha folhaId={id} obrigacoes={obrigacoes} podeGerir={permitidas.has("GERIR_GUIA_DE_RECOLHIMENTO")} /></div> : null}
      {consulta.aba === "dados" && detalhe.situacao === "FECHADA" ? (
        <p data-resumo-da-folha className="flex flex-wrap gap-3 text-sm">
          <a href={`/folha/folhas/${id}/resumo?formato=pdf`} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--color-primary)] hover:underline">Resumo da folha (PDF): bruto, descontos, líquido e patronal</a>
          <a href={`/folha/folhas/${id}/resumo?formato=csv`} className="font-medium text-[color:var(--color-primary)] hover:underline">Resumo da folha (CSV)</a>
        </p>
      ) : null}
      {abrangencia !== null ? <div id="abrangencia" data-ancora className="scroll-mt-24"><AbrangenciaDosCalculos calculos={abrangencia} /></div> : null}
      {consulta.aba === "dados" ? <div id="contracheques" data-ancora className="scroll-mt-24"><Contracheques folhaId={id} linhas={detalhe.contracheques} /></div> : null}
    </div>
  );
}
