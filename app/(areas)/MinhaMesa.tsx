import Link from "next/link";
import { EscopoDeLeituraError } from "../../lib/recorte";
import { PortaSemBancoError } from "../../lib/portas/cliente";
import { lerCaixa } from "../../lib/portas/comunicacao";
import { carregarContextoDoUsuario } from "../../lib/portas/contexto";
import { permitidos } from "../../lib/portas/busca-global";
import { areasVisiveis } from "../../lib/portas/navegacao-permissoes";
import { lerCaixaDeProcessos } from "../../lib/portas/protocolo";
import { instanteCivilBr } from "../../packages/datas/index";

/**
 * ═══ MINHA MESA (V6 P0.2) — o que é DE QUEM ABRIU A TELA ═══
 *
 * Três blocos, cada um lido pela porta com a permissão do usuário, e cada um com TRÊS estados
 * distintos, porque são coisas diferentes:
 *   · o dado — a lista (ou "nada por aqui", quando a consulta respondeu vazio);
 *   · SEM ACESSO — a política de leitura recusou: a faixa diz isso, e não finge lista vazia;
 *   · INDISPONÍVEL — a consulta falhou (banco, porta): a faixa diz isso, e não mostra zero.
 * Falha de consulta não é zero; falta de permissão não é lista vazia disfarçada.
 *
 * ⚠️ Nada aqui é estático: as ações frequentes são os destinos da busca que o usuário PODE
 * (a mesma tabela de `autorizar`); os processos são os da lotação dele; os comunicados, os
 * dirigidos a ele e ainda não lidos.
 */

type Estado<T> = { readonly tipo: "dado"; readonly valor: T } | { readonly tipo: "sem-acesso"; readonly motivo: string } | { readonly tipo: "indisponivel" };

async function ler<T>(fn: () => Promise<T>): Promise<Estado<T>> {
  try {
    return { tipo: "dado", valor: await fn() };
  } catch (e) {
    if (e instanceof EscopoDeLeituraError) return { tipo: "sem-acesso", motivo: e.message };
    if (e instanceof PortaSemBancoError) return { tipo: "indisponivel" };
    // Qualquer outra falha é INDISPONIBILIDADE, nunca "zero". O motivo vai para o console do
    // servidor (telemetria), não para a tela.
    console.error("[minha-mesa]", e);
    return { tipo: "indisponivel" };
  }
}

function Faixa({ estado, vazio, children }: { readonly estado: Estado<unknown>; readonly vazio: string; readonly children?: React.ReactNode }): React.ReactElement {
  if (estado.tipo === "sem-acesso") {
    return <p className="text-sm text-[color:var(--color-ink-3)]" data-estado="sem-acesso">Não está no seu acesso.</p>;
  }
  if (estado.tipo === "indisponivel") {
    return <p className="text-sm text-[color:var(--color-status-alerta-fg)]" data-estado="indisponivel">Indisponível agora — a consulta falhou; não é zero.</p>;
  }
  if (Array.isArray(estado.valor) && estado.valor.length === 0) {
    return <p className="text-sm text-[color:var(--color-ink-3)]" data-estado="vazio">{vazio}</p>;
  }
  return <>{children}</>;
}

const TETO = 6;

export async function AcoesFrequentes(): Promise<React.ReactElement> {
  const estado = await ler(async () => {
    const contexto = await carregarContextoDoUsuario();
    const visiveis = areasVisiveis(contexto.acoes);
    return permitidos({ acoes: new Set(contexto.acoes), areas: new Set<string>(visiveis) })
      .filter((d) => d.acao !== null)
      .slice(0, 8);
  });
  return (
    <section aria-label="Ações frequentes" data-mesa="acoes">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Ações que você pode fazer</h2>
      <Faixa estado={estado} vazio="Nenhuma ação de registro no seu perfil — as consultas continuam no menu.">
        {estado.tipo === "dado" ? (
          <ul className="flex flex-wrap gap-2">
            {estado.valor.map((d) => (
              <li key={d.href}>
                <Link href={d.href} className="inline-block rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-1.5 text-sm text-[color:var(--color-primary)] hover:border-[color:var(--color-primary)]">
                  {d.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Faixa>
    </section>
  );
}

export async function ProcessosSobMinhaResponsabilidade(): Promise<React.ReactElement> {
  const estado = await ler(async () =>
    (await lerCaixaDeProcessos({ somenteMeusSetores: true })).filter((p) => p.situacao !== "ENCERRADO" && p.situacao !== "ARQUIVADO").slice(0, TETO)
  );
  return (
    <section aria-label="Processos sob minha responsabilidade" data-mesa="processos">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Processos na minha lotação</h2>
        <Link href="/protocolo/processos" className="text-xs text-[color:var(--color-primary)] hover:underline">Todos</Link>
      </div>
      <Faixa estado={estado} vazio="Nenhum processo em aberto na sua lotação.">
        {estado.tipo === "dado" ? (
          <ul className="divide-y divide-[color:var(--color-border)] rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            {estado.valor.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                <Link href={`/protocolo/processos/${p.id}`} className="tabular font-medium text-[color:var(--color-primary)] hover:underline">
                  {p.numero}/{p.ano}
                </Link>
                <span className="min-w-0 flex-1 truncate text-[color:var(--color-ink)]">{p.assunto}</span>
                <span className="text-xs text-[color:var(--color-ink-3)]">{p.situacaoRotulo} · {p.setorAtualNome}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Faixa>
    </section>
  );
}

export async function ComunicadosAguardandoLeitura(): Promise<React.ReactElement> {
  const estado = await ler(async () => (await lerCaixa("ENTRADA")).filter((c) => !c.lido).slice(0, TETO));
  return (
    <section aria-label="Comunicados aguardando leitura" data-mesa="comunicados">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Comunicados não lidos</h2>
        <Link href="/comunicacao/comunicados" className="text-xs text-[color:var(--color-primary)] hover:underline">Caixa de entrada</Link>
      </div>
      <Faixa estado={estado} vazio="Nada aguardando a sua leitura.">
        {estado.tipo === "dado" ? (
          <ul className="divide-y divide-[color:var(--color-border)] rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            {estado.valor.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                <Link href={`/comunicacao/comunicados/${c.id}`} className="font-medium text-[color:var(--color-primary)] hover:underline">
                  {c.rotulo}
                </Link>
                <span className="min-w-0 flex-1 truncate text-[color:var(--color-ink)]">{c.assunto}</span>
                <span className="text-xs text-[color:var(--color-ink-3)]">{c.remetente} · {instanteCivilBr(c.em)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Faixa>
    </section>
  );
}
