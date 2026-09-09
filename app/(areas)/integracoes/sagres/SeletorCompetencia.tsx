"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * SELETOR DE COMPETÊNCIA DO SAGRES — ilha client sobre a tela (Server Component).
 *
 * ⚠️ POR QUE UMA ILHA, E NÃO LINKS. A tela tinha só uma lista de `<a href="?dia=...">` com seis dias
 * escritos à mão: dava para clicar nos dias que alguém previu, e em mais nenhum. Na demonstração ao
 * vivo a Comissão escolhe O DIA — qualquer dia — e o sistema tem de responder. Um `<input type=
 * "date">` é o único controle que entrega isso; ele exige estado, logo exige client.
 *
 * ⚠️ O DADO MORA NA URL, não neste componente. Ao aplicar, empurra `?dia=&mes=` e o Server Component
 * re-consulta a porta — mesmo padrão do `app/(areas)/relatorios/livros/SeletorPeriodo.tsx`. Assim a
 * competência escolhida é COMPARTILHÁVEL (a Comissão pode copiar o endereço) e o botão de download,
 * que lê os mesmos parâmetros, nunca diverge do que está na tela.
 *
 * ⚠️ DIA E MÊS SÃO INDEPENDENTES. O SAGRES tem duas periodicidades (§ diário e § mensal) e o roteiro
 * pede as duas escolhas: "UM DIA para o diário e UM MÊS para o mensal". Amarrar o mês ao mês do dia
 * — como a tela fazia — tirava da Comissão metade da escolha sem nunca dizer que a tirava.
 */
const CLASSE_CAMPO =
  "h-11 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export function SeletorCompetencia({
  dia,
  mes,
}: {
  /** aaaa-mm-dd atualmente em vigor (vem da URL, já normalizado pelo servidor). */
  readonly dia: string;
  /** aaaa-mm atualmente em vigor. */
  readonly mes: string;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [d, setD] = useState(dia);
  const [m, setM] = useState(mes);

  // Preserva os demais parâmetros da URL: quem chegou aqui com outro recorte não o perde ao trocar
  // de dia. Só `dia` e `mes` são reescritos.
  const aplicar = (proximoDia: string, proximoMes: string): void => {
    const p = new URLSearchParams(params.toString());
    p.set("dia", proximoDia);
    p.set("mes", proximoMes);
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3" data-chrome>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Dia (pacote diário)</span>
        <input
          type="date"
          aria-label="Dia do pacote diário do SAGRES"
          className={CLASSE_CAMPO}
          value={d}
          onChange={(e) => setD(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Mês (pacote mensal)</span>
        <input
          type="month"
          aria-label="Mês do pacote mensal do SAGRES"
          className={CLASSE_CAMPO}
          value={m}
          onChange={(e) => setM(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={() => aplicar(d, m)}
        className="h-11 rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-4 text-sm font-semibold text-[color:var(--color-primary-fg)] hover:bg-[color:var(--color-primary-hover)]"
      >
        Gerar para esta competência
      </button>
      {/*
        ATALHO DE CONVENIÊNCIA: alinhar o mês ao mês do dia escolhido. É o comportamento ANTIGO da
        tela — que era imposto e agora é uma opção explícita, a um clique. Fica visível só quando os
        dois divergem, senão seria um botão que não faz nada.
      */}
      {d.slice(0, 7) !== m && d.length === 10 ? (
        <button
          type="button"
          onClick={() => {
            setM(d.slice(0, 7));
            aplicar(d, d.slice(0, 7));
          }}
          className="h-11 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-sm text-[color:var(--color-ink-2)] hover:border-[color:var(--color-primary)]"
        >
          Usar o mês do dia ({d.slice(0, 7)})
        </button>
      ) : null}
    </div>
  );
}
