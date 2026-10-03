"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UG_CONSOLIDADO, useUiContext } from "../../lib/ui-context";
import { alinharContextoEUrl, type ContextoNaUrl } from "../../lib/contexto-na-url";

/**
 * O CONTEXTO EM TODA A NAVEGAÇÃO (V31) — montado UMA vez, no layout, e por isso vale para as páginas que
 * não montam o `SincronizarContexto`.
 *
 * ⚠️ O DEFEITO QUE ELE FECHA, MEDIDO NO PERCURSO DA V31: só parte das páginas montava a sincronia. Nas
 * outras, (a) um link com `?exercicio=2027` não mudava o cabeçalho, que seguia dizendo 2026, e (b) trocar
 * o exercício no seletor não mudava nada na página — o seletor era inerte, e o contador lia um exercício
 * no cabeçalho e outro na tabela.
 *
 * As duas regras, sem escrever na URL à toa:
 *   · A URL MUDOU (navegação, link, voltar): o contexto ADOTA o exercício e a unidade válidos que ela traz.
 *     Sem parâmetro, nada se escreve — os links do menu já levam o contexto (Sidebar).
 *   · O CONTEXTO MUDOU (o seletor): a URL é reescrita pela mesma regra pura (`alinharContextoEUrl`), que
 *     descarta a seleção de registro e sai do detalhe.
 */
export function ContextoNaNavegacao(): null {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { exercicio, setExercicio, ug, setUg, ugsDisponiveis, exerciciosDisponiveis } = useUiContext();
  const ultimoContexto = useRef<ContextoNaUrl | null>(null);
  const ultimaUrl = useRef<string | null>(null);

  useEffect(() => {
    const codigo = ug === UG_CONSOLIDADO ? null : (ugsDisponiveis.find((u) => u.id === ug)?.codigo ?? null);
    const contexto: ContextoNaUrl = { exercicio, ugCodigo: codigo };
    const url = `${pathname}?${params.toString()}`;

    if (ultimaUrl.current !== url) {
      // Navegação: a URL vence, se trouxer valor válido.
      ultimaUrl.current = url;
      const r = alinharContextoEUrl({
        pathname,
        busca: params.toString(),
        contexto,
        anterior: null,
        exerciciosValidos: exerciciosDisponiveis.map((e) => e.ano),
        ugsValidas: ugsDisponiveis.map((u) => u.codigo),
      });
      let adotado = contexto;
      if (r.adotar !== null) {
        if (r.adotar.exercicio !== undefined) setExercicio(r.adotar.exercicio);
        const u = ugsDisponiveis.find((x) => x.codigo === r.adotar?.ugCodigo);
        if (u !== undefined) setUg(u.id);
        adotado = { exercicio: r.adotar.exercicio ?? exercicio, ugCodigo: u?.codigo ?? codigo };
      }
      ultimoContexto.current = adotado;
      return;
    }

    const antes = ultimoContexto.current;
    if (antes !== null && (antes.exercicio !== contexto.exercicio || antes.ugCodigo !== contexto.ugCodigo)) {
      // O seletor mudou: a página passa a mostrar o recorte escolhido.
      ultimoContexto.current = contexto;
      const r = alinharContextoEUrl({
        pathname,
        busca: params.toString(),
        contexto,
        anterior: antes,
        exerciciosValidos: exerciciosDisponiveis.map((e) => e.ano),
        ugsValidas: ugsDisponiveis.map((u) => u.codigo),
      });
      if (r.destino !== null) router.replace(r.destino);
    }
  }, [exercicio, ug, ugsDisponiveis, exerciciosDisponiveis, params, pathname, router, setExercicio, setUg]);

  return null;
}
