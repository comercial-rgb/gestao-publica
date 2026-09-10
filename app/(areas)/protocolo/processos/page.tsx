import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  lerAssuntos,
  lerCaixaDeProcessos,
  lerExerciciosAbertos,
  lerMeusSetores,
  lerPessoasParaRequerente,
} from "../../../../lib/portas/protocolo";
import { dataBr } from "../../../../lib/recorte";
import { FormAbrirProcesso } from "./FormProcesso";

/**
 * A CAIXA DE PROCESSOS (5.42.49/50/51).
 *
 * ═══ ⚠️ ORDENADA PELA ÚLTIMA MOVIMENTAÇÃO, e não pela abertura ═══
 * Quem abre a caixa quer ver o que se mexeu, não o que está parado desde janeiro. É a
 * cláusula 5.42.51, e ela é uma daquelas em que o catálogo está simplesmente certo.
 *
 * ═══ ⚠️ SEM LOTAÇÃO, A CAIXA É VAZIA — NUNCA "TODAS" ═══
 * O recorte de visibilidade entra no `where` da consulta, não num filtro depois da
 * paginação: filtrar a página já lida faria o total contar processos que quem pergunta
 * não pode ver.
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

const ROTULO_DO_PRAZO: Record<string, string> = {
  SEM_PRAZO: "sem prazo",
  NO_PRAZO: "no prazo",
  PROXIMO_DO_FIM: "prazo perto do fim",
  ATRASADO: "atrasado",
};

function tomDoPrazo(prazo: string): StatusBadge {
  if (prazo === "ATRASADO") return "erro";
  if (prazo === "PROXIMO_DO_FIM") return "alerta";
  if (prazo === "NO_PRAZO") return "ok";
  return "neutro";
}

export default async function ProcessosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const situacao = typeof sp["situacao"] === "string" ? sp["situacao"] : undefined;

  const [caixa, assuntos, setores, pessoas, exercicios] = await Promise.all([
    lerCaixaDeProcessos(
      situacao !== undefined && situacao !== ""
        ? { situacao: situacao as never }
        : {}
    ),
    lerAssuntos(),
    lerMeusSetores(),
    lerPessoasParaRequerente(),
    lerExerciciosAbertos(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Processos"
        subtitulo="Abertura, tramitação, parecer, readequação, encerramento e arquivamento — com a situação derivada dos movimentos, nunca de uma coluna."
      />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Abrir processo
        </h2>
        <FormAbrirProcesso
          assuntos={assuntos}
          setores={setores}
          pessoas={pessoas}
          exercicios={exercicios}
        />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Minha caixa
          </h2>
          <span className="text-xs text-[color:var(--color-ink-2)]">
            {caixa.length} processo(s), do mais recentemente movimentado para o mais antigo.
          </span>
        </div>
        {caixa.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum processo no seu alcance"
            descricao="Você vê os processos dos setores em que está lotado, os que abriu, os que movimentou — e os não sigilosos da sua unidade gestora. Sem lotação, a caixa fica vazia: o sistema não mostra tudo a quem não tem crachá."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                <tr>
                  <th className="py-2 pr-3">Processo</th>
                  <th className="py-2 pr-3">Assunto</th>
                  <th className="py-2 pr-3">Requerente</th>
                  <th className="py-2 pr-3">Setor atual</th>
                  <th className="py-2 pr-3">Situação</th>
                  <th className="py-2 pr-3">Prazo</th>
                  <th className="py-2 pr-3">Último movimento</th>
                </tr>
              </thead>
              <tbody>
                {caixa.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[color:var(--color-border)] last:border-0"
                  >
                    <td className="py-2 pr-3 font-medium">
                      <a
                        className="underline underline-offset-2"
                        href={`/protocolo/processos/${p.id}`}
                      >
                        {p.numero}/{p.ano}
                      </a>
                      {p.sigiloso ? (
                        <span className="ml-2">
                          <Badge status="alerta">sigiloso</Badge>
                        </span>
                      ) : null}
                      {p.apensadoA !== null ? (
                        <span className="ml-2">
                          <Badge status="neutro">apensado</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      {p.assunto}
                      {p.subassunto !== null ? (
                        <span className="text-[color:var(--color-ink-2)]"> · {p.subassunto}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{p.requerente}</td>
                    <td className="py-2 pr-3">{p.setorAtualNome}</td>
                    <td className="py-2 pr-3">
                      <Badge status={TOM_DA_SITUACAO[p.situacao] ?? "neutro"}>
                        {p.situacaoRotulo}
                      </Badge>
                      {p.temTaxaEmAberto ? (
                        <span className="ml-2">
                          <Badge status="alerta">taxa em aberto</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge status={tomDoPrazo(p.prazo)}>
                        {ROTULO_DO_PRAZO[p.prazo] ?? p.prazo}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                      {dataBr(p.ultimoMovimentoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
