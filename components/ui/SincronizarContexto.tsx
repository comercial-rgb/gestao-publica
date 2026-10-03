"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UG_CONSOLIDADO, useUiContext } from "../../lib/ui-context";
import { alinharContextoEUrl, type ContextoNaUrl } from "../../lib/contexto-na-url";

/**
 * SINCRONIA UiContext → URL (ilha client, não renderiza nada).
 *
 * ═══ O PROBLEMA QUE ELA RESOLVE ═══
 * As páginas de execução são Server Components (leem as portas), e exercício/UG vivem no
 * UiContext — que é client. Server Component NÃO lê contexto client. Sem esta ponte, o
 * seletor do cabeçalho mudaria de valor e a tela abaixo continuaria mostrando o exercício
 * anterior: dois números na mesma janela, discordando, e o usuário acreditando no de baixo.
 *
 * A ponte empurra o contexto para a URL; o servidor re-renderiza lendo `searchParams`. É a
 * generalização do `SincronizarHome`, que fazia isto só para a home e só para o exercício —
 * aqui vale para qualquer rota (`usePathname`) e leva a UG junto.
 *
 * ⚠️ SÓ NAVEGA QUANDO DIVERGE. Um `replace` incondicional a cada render entraria em laço
 * (replace → render → replace). E é `replace`, não `push`: trocar o exercício não é uma
 * página nova no histórico — o "voltar" do navegador tem de sair da página, não desfazer o
 * seletor.
 *
 * ⚠️ A UG "CONSOLIDADO" SAI DA URL em vez de virar `?ug=CONSOLIDADO`. Consolidado é a
 * AUSÊNCIA de recorte (o ente inteiro) — e a porta o expressa omitindo o filtro. Codificá-lo
 * como valor faria a página ter de traduzir "CONSOLIDADO" para "não filtre" em cada leitura,
 * e um esquecimento viraria uma busca por uma unidade chamada CONSOLIDADO, que não existe:
 * lista vazia, sem erro, sem explicação.
 *
 * ⚠️ A URL LEVA O **CÓDIGO** DA UNIDADE, NÃO O ID DO CONTEXTO. O `UiContext` guarda o `id`
 * (`ugsDisponiveis[].id`); a URL leva o `codigo` (SAGRES, 5 dígitos), que é o identificador de
 * DOMÍNIO — o que a porta entende e o que sobrevive a uma troca de chave primária. A tradução
 * id→código acontece aqui, contra a lista do próprio contexto.
 *
 * ⚠️ E AS UNIDADES DESSA LISTA SÃO AS QUE O USUÁRIO PODE VER. Elas vêm de
 * `lib/portas/contexto.ts`, lidas no servidor contra as permissões reais (TR 6.5) e injetadas no
 * provider por props. Enquanto eram constantes locais, esta ponte podia empurrar para a URL o
 * código de uma unidade que o usuário não tinha direito de ler — e, numa tela de LEITURA (que não
 * chama `autorizar`), ninguém reclamaria. Hoje o que não está na lista não chega à URL.
 */
/*
 * ⚠️ V31 — NA MONTAGEM A URL VENCE; DEPOIS, O SELETOR. E a troca descarta a seleção de registro e
 * sai do detalhe. A regra inteira é pura e testada em `lib/contexto-na-url.ts`; aqui só se aplica.
 */
export function SincronizarContexto(): null {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { exercicio, setExercicio, ug, setUg, ugsDisponiveis, exerciciosDisponiveis } = useUiContext();
  const anterior = useRef<ContextoNaUrl | null>(null);

  useEffect(() => {
    const codigo = ug === UG_CONSOLIDADO ? null : (ugsDisponiveis.find((u) => u.id === ug)?.codigo ?? null);
    const contexto: ContextoNaUrl = { exercicio, ugCodigo: codigo };
    const r = alinharContextoEUrl({
      pathname,
      busca: params.toString(),
      contexto,
      anterior: anterior.current,
      exerciciosValidos: exerciciosDisponiveis.map((e) => e.ano),
      ugsValidas: ugsDisponiveis.map((u) => u.codigo),
    });
    if (r.adotar !== null) {
      // A URL pediu outro recorte válido: o contexto o adota e a próxima passada confirma a URL.
      if (r.adotar.exercicio !== undefined) setExercicio(r.adotar.exercicio);
      const adotada = ugsDisponiveis.find((u) => u.codigo === r.adotar?.ugCodigo);
      if (adotada !== undefined) setUg(adotada.id);
      anterior.current = {
        exercicio: r.adotar.exercicio ?? exercicio,
        ugCodigo: adotada?.codigo ?? codigo,
      };
      return;
    }
    anterior.current = contexto;
    if (r.destino !== null) router.replace(r.destino);
  }, [exercicio, ug, ugsDisponiveis, exerciciosDisponiveis, params, pathname, router, setExercicio, setUg]);

  return null;
}
