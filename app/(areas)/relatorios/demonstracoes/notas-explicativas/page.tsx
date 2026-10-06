import { BotaoPdf } from "../../../../../components/ui/BotaoPdf";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import {
  DEMONSTRACOES_DA_NOTA,
  lerNotasExplicativas,
  ROTULO_DA_DEMONSTRACAO,
  ROTULO_DA_SECAO,
  SECOES_DAS_NOTAS,
  TEMAS_OBRIGATORIOS,
  type NotasExplicativas,
} from "../../../../../lib/portas/notas-explicativas";
import { lerExercicio } from "../exercicio";
import { SeletorExercicio } from "../SeletorExercicio";
import { FormNota, FormRetirar } from "./Formularios";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
/**
 * V35 C2 — NOTAS EXPLICATIVAS ÀS DEMONSTRAÇÕES CONTÁBEIS (MCASP 11ª ed., Parte V, item 8). O contador redige; o sistema
 * acrescenta o que já sabe por cadastro, com a origem; os temas que o manual manda divulgar e ainda não foram redigidos
 * aparecem como pendência. Server Component, força-dinâmica.
 */
export const dynamic = "force-dynamic";

export default async function NotasExplicativasPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const { exercicio } = lerExercicio(await searchParams);
  const cabecalho = (
    <PageHeader
      titulo="Notas Explicativas"
      subtitulo="Parte integrante das demonstrações contábeis · MCASP 11ª ed., Parte V, item 8"
      acoes={<SeletorExercicio exercicio={String(exercicio)} />}
    />
  );
  let doc: NotasExplicativas;
  let permitidas: ReadonlySet<string>;
  try {
    [doc, permitidas] = await Promise.all([lerNotasExplicativas(exercicio), acoesPermitidas(["CADASTRAR_LINHA_DEMONSTRATIVO"])]);
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler as notas" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const podeEscrever = permitidas.has("CADASTRAR_LINHA_DEMONSTRATIVO");
  const secoes = SECOES_DAS_NOTAS.map((s) => ({ valor: s, rotulo: ROTULO_DA_SECAO[s] }));
  const demonstracoes = DEMONSTRACOES_DA_NOTA.map((d) => ({ valor: d, rotulo: ROTULO_DA_DEMONSTRACAO[d] }));
  const temas = doc.temasPendentes.map((t) => {
    const secao = TEMAS_OBRIGATORIOS.find((o) => o.chave === t.chave)?.secao;
    return { valor: t.chave, rotulo: secao === undefined ? t.titulo : `${t.titulo} (${ROTULO_DA_SECAO[secao]})` };
  });
  return (
    <div className="space-y-6">
      {cabecalho}
      <div className="flex justify-end gap-2" data-chrome>
        <BotaoPdf href={`/relatorios/demonstracoes/notas-explicativas/pdf?exercicio=${String(exercicio)}`} />
      </div>
      {doc.temasPendentes.length > 0 ? (
        <section aria-label="Temas ainda não redigidos" className="rounded border border-[color:var(--color-border)] p-3 text-sm">
          <h2 className="font-semibold">Temas que o manual manda divulgar e ainda não foram redigidos</h2>
          <ul className="mt-1 list-disc pl-5">
            {doc.temasPendentes.map((t) => (
              <li key={t.chave}>
                {t.titulo} <span className="text-[color:var(--color-text-muted)]">({t.fonte})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {podeEscrever ? (
        <section aria-label="Nova nota" className="space-y-2" data-chrome>
          <h2 className="text-sm font-semibold">Nova nota</h2>
          <FormNota exercicio={exercicio} secoes={secoes} demonstracoes={demonstracoes} temas={temas} />
        </section>
      ) : null}
      {doc.secoes.map((s) => (
        <section key={s.secao} aria-label={s.rotulo} className="space-y-3">
          <h2 className="text-base font-semibold">{s.rotulo}</h2>
          {s.notas.length === 0 ? <p className="text-sm text-[color:var(--color-text-muted)]">Nenhuma nota nesta seção.</p> : null}
          {s.notas.map((n) => (
            <article key={n.chave} aria-label={`Nota ${String(n.numero)}`} className="space-y-1">
              <h3 className="text-sm font-semibold">
                Nota {n.numero}. {n.titulo}
              </h3>
              {n.texto.map((p, i) => (
                <p key={i} className="text-sm">
                  {p}
                </p>
              ))}
              <p className="text-xs text-[color:var(--color-text-muted)]">
                {ROTULO_DA_DEMONSTRACAO[n.demonstracao]} · {n.origem === "SISTEMA" ? `escrita pelo sistema a partir de: ${n.referencia}` : `redigida, ${n.referencia.toLowerCase()}`}
              </p>
              {podeEscrever && n.origem === "REDIGIDA" ? (
                <details className="text-xs" data-chrome>
                  <summary className="cursor-pointer">Revisar ou retirar</summary>
                  <div className="mt-2 space-y-3">
                    <FormNota
                      exercicio={exercicio}
                      secoes={secoes}
                      demonstracoes={demonstracoes}
                      temas={[]}
                      inicial={{ chave: n.chave, secao: s.secao, demonstracao: n.demonstracao, ordem: n.ordem, titulo: n.titulo, texto: n.texto.join("\n\n") }}
                    />
                    <FormRetirar exercicio={exercicio} chave={n.chave} />
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
