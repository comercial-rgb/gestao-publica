import { notFound } from "next/navigation";
import { Badge, type StatusBadge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import {
  lerCaixaDeProcessos,
  lerCamposDoProcesso,
  lerDossieDoProcesso,
  lerSetoresAtivos,
} from "../../../../../lib/portas/protocolo";
import { dataBr } from "../../../../../lib/recorte";
import {
  FormApensamento,
  FormCamposAdicionais,
  FormComplementar,
  FormDesfecho,
  FormParecer,
  FormReadequacao,
  FormReceber,
  FormTornarSemEfeito,
  FormTramitar,
} from "./FormMovimentos";

/**
 * O DOSSIÊ DO PROCESSO — e o gerenciamento acontece AQUI (5.42.52).
 *
 * ═══ ⚠️ A LINHA DO TEMPO MOSTRA OS MOVIMENTOS ANULADOS, MARCADOS ═══
 * Escondê-los faria o "tornar sem efeito" virar um DELETE com outro nome — que é
 * exatamente o que a decisão do módulo recusa. O movimento aparece riscado, com quem o
 * desfez; ele apenas deixa de contar para a situação e para o prazo.
 *
 * ═══ ⚠️ PROCESSO FORA DO ALCANCE DÁ 404, e não "acesso negado" ═══
 * A porta devolve `null` tanto para "não existe" quanto para "você não pode ver".
 * Distingui-los na tela entregaria, a quem tenta identificadores ao acaso, a lista de
 * quais processos existem.
 */
export const dynamic = "force-dynamic";

const TOM_DA_SITUACAO: Record<string, StatusBadge> = {
  ABERTO: "neutro",
  EM_TRAMITE: "alerta",
  EM_ANALISE: "neutro",
  AGUARDANDO_PARECER: "alerta",
  AGUARDANDO_READEQUACAO: "alerta",
  PARALISADO: "erro",
  ENCERRADO: "ok",
  ARQUIVADO: "ok",
  CANCELADO: "erro",
};

function instante(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function ProcessoPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  const dossie = await lerDossieDoProcesso(id);
  if (dossie === null) notFound();

  const [setores, campos, caixa] = await Promise.all([
    lerSetoresAtivos(),
    lerCamposDoProcesso(id),
    lerCaixaDeProcessos(),
  ]);

  // ⚠️ AS PENDÊNCIAS ABERTAS — as que ninguém respondeu ainda. O seletor só oferece
  // essas: oferecer um pedido já respondido faria a pessoa digitar o parecer inteiro
  // para só então o servidor recusar.
  const respondidos = new Set(
    dossie.linhaDoTempo
      .filter((m) => m.respondeAId !== null)
      .map((m) => m.respondeAId as string)
  );
  const pendentesDe = (tipo: string): readonly { id: string; rotulo: string; texto: string }[] =>
    dossie.linhaDoTempo
      .filter((m) => m.tipo === tipo && !m.semEfeito && !respondidos.has(m.id))
      .map((m) => ({
        id: m.id,
        rotulo: `${instante(m.em)} — ${m.texto.slice(0, 70)}`,
        texto: m.texto,
      }));

  const vigentes = dossie.linhaDoTempo.filter((m) => !m.semEfeito);
  const ultimo = vigentes[vigentes.length - 1];
  const anulavel =
    ultimo !== undefined && (ultimo.tipo === "TRAMITE" || ultimo.tipo === "COMPLEMENTO")
      ? { id: ultimo.id, rotulo: `${ultimo.rotulo} — ${instante(ultimo.em)}` }
      : null;

  const candidatosAApensar = caixa
    .filter((p) => p.id !== dossie.id && p.apensadoA === null)
    .filter((p) => !["ENCERRADO", "ARQUIVADO", "CANCELADO"].includes(p.situacao))
    .map((p) => ({ id: p.id, rotulo: `${p.numero}/${p.ano} — ${p.assunto}` }));

  const fechado = ["ENCERRADO", "ARQUIVADO", "CANCELADO"].includes(dossie.situacao);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo={`Processo ${dossie.numero}/${dossie.ano}`}
        subtitulo={`${dossie.assunto}${dossie.subassunto !== null ? ` · ${dossie.subassunto}` : ""} — requerente: ${dossie.requerente}`}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={TOM_DA_SITUACAO[dossie.situacao] ?? "neutro"}>
            {dossie.situacaoRotulo}
          </Badge>
          {dossie.sigiloso ? <Badge status="alerta">sigiloso</Badge> : null}
          {dossie.documentacaoFisica ? (
            <Badge status="neutro">documentação física</Badge>
          ) : null}
          <Badge status="neutro">prioridade {dossie.prioridade.toLowerCase()}</Badge>
          {dossie.apensadoA !== null ? (
            <Badge status="neutro">apensado ao {dossie.apensadoA.rotulo}</Badge>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-[color:var(--color-ink-2)]">Setor atual</dt>
            <dd>{dossie.setorAtual}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-ink-2)]">Aberto em</dt>
            <dd>
              {dataBr(dossie.abertoEm)} por {dossie.abertoPor}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-ink-2)]">Finalidade</dt>
            <dd>
              {dossie.finalidade === "INTERNO" ? "Interno da entidade" : "Atendimento ao público"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-ink-2)]">Código verificador</dt>
            <dd className="font-mono">{dossie.codigoVerificador}</dd>
          </div>
        </dl>

        <p className="mt-4 whitespace-pre-line text-sm text-[color:var(--color-ink)]">
          {dossie.textoAbertura}
        </p>

        {dossie.requerentesAdicionais.length > 0 ? (
          <p className="mt-3 text-xs text-[color:var(--color-ink-2)]">
            Requerentes adicionais: {dossie.requerentesAdicionais.join(", ")}
          </p>
        ) : null}
      </Card>

      {dossie.etapas.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
            Roteiro
          </h2>
          <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
            Copiado do assunto no instante da abertura. Reconfigurar o assunto depois não
            mexe neste processo — se mexesse, um processo em dia ficaria atrasado
            retroativamente, sem que nada tivesse acontecido com ele.
          </p>
          <ol className="text-sm">
            {dossie.etapas.map((e) => (
              <li key={e.ordem} className="border-b border-[color:var(--color-border)] py-2 last:border-0">
                <strong>{e.ordem}.</strong> {e.setor} — {e.descricao}{" "}
                <span className="text-[color:var(--color-ink-2)]">({e.prazoDias} dias)</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {dossie.taxas.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Taxas</h2>
          <table className="w-full text-sm">
            <tbody>
              {dossie.taxas.map((t) => (
                <tr key={t.id} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="py-2">{t.descricao}</td>
                  <td className="py-2 text-right font-mono">{t.valor}</td>
                  <td className="py-2 pl-4">
                    <Badge status={t.situacao === "PAGA" ? "ok" : t.situacao === "CANCELADA" ? "neutro" : "alerta"}>
                      {t.situacao.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="py-2 pl-4 text-xs text-[color:var(--color-ink-2)]">
                    vence {dataBr(t.vencimento)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {dossie.situacao === "EM_TRAMITE" ? <FormReceber processoId={dossie.id} /> : null}
        {!fechado ? <FormTramitar processoId={dossie.id} setores={setores} /> : null}
        {!fechado ? <FormComplementar processoId={dossie.id} /> : null}
        {!fechado ? (
          <FormParecer
            processoId={dossie.id}
            setores={setores}
            pendencias={pendentesDe("PARECER_SOLICITADO")}
          />
        ) : null}
        {!fechado ? (
          <FormReadequacao
            processoId={dossie.id}
            pendencias={pendentesDe("READEQUACAO_SOLICITADA")}
          />
        ) : null}
        <FormDesfecho processoId={dossie.id} situacao={dossie.situacao} />
        {!fechado ? (
          <FormApensamento
            processoId={dossie.id}
            candidatos={candidatosAApensar}
            apensos={dossie.apensos}
          />
        ) : null}
        {!fechado ? (
          <FormTornarSemEfeito processoId={dossie.id} anulavel={anulavel} />
        ) : null}
        <FormCamposAdicionais processoId={dossie.id} campos={campos} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Linha do tempo
        </h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
          Todos os movimentos, inclusive os tornados sem efeito — que aparecem riscados,
          com quem os desfez. Escondê-los faria a anulação virar um DELETE com outro nome.
        </p>
        <ol className="text-sm">
          <li className="border-b border-[color:var(--color-border)] py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong>Abertura</strong>
              <span className="text-xs text-[color:var(--color-ink-2)]">
                {instante(dossie.abertoEm)} · {dossie.abertoPor}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-line text-[color:var(--color-ink-2)]">
              {dossie.textoAbertura}
            </p>
          </li>
          {dossie.linhaDoTempo.map((m) => (
            <li
              key={m.id}
              className="border-b border-[color:var(--color-border)] py-3 last:border-0"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <strong className={m.semEfeito ? "line-through opacity-60" : ""}>
                  {m.rotulo}
                </strong>
                <span className="text-xs text-[color:var(--color-ink-2)]">
                  {instante(m.em)} · {m.autor}
                </span>
                {m.setorOrigem !== null ? (
                  <span className="text-xs text-[color:var(--color-ink-2)]">
                    de {m.setorOrigem}
                  </span>
                ) : null}
                {m.setorDestino !== null ? (
                  <span className="text-xs text-[color:var(--color-ink-2)]">
                    para {m.setorDestino}
                  </span>
                ) : null}
                {m.assinado ? (
                  <Badge status="ok">assinado ({m.modoDaAssinatura?.toLowerCase()})</Badge>
                ) : null}
                {m.semEfeito ? <Badge status="erro">sem efeito</Badge> : null}
              </div>
              <p
                className={`mt-1 whitespace-pre-line text-[color:var(--color-ink-2)] ${m.semEfeito ? "line-through opacity-60" : ""}`}
              >
                {m.texto}
              </p>
              {m.anexos.length > 0 ? (
                <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                  Anexos: {m.anexos.map((a) => a.nome).join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
