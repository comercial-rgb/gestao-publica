import { ambienteDeExecucao, versaoLegivel } from "../../../lib/identidade/produto";

/**
 * ═══ A IDENTIDADE DO QUE ESTÁ NO AR (V10 T5) ═══
 *
 * ⚠️ POR QUE ISTO EXISTE. O aceite pós-DNS precisa responder "o que está servindo é o candidato
 * que eu validei?" — e até aqui ele procurava um `data-build="…"` no HTML da transparência,
 * aceitava não achar, e mesmo assim terminava dizendo que cobria PUBLICADA. Um aceite que
 * aprova sem a evidência indispensável é pior que nenhum: ele certifica o que não conferiu.
 *
 * ⚠️ E ISTO NÃO É UM MARCADOR DECORATIVO. O valor vem de `IDENTIDADE_DO_CANDIDATO`, a variável
 * que a unit do serviço define a partir do MANIFESTO do pacote instalado — o mesmo nome que
 * `npm run release:candidato` gravou. Se alguém trocar os arquivos sem trocar a variável, o
 * aceite passa a mentir; por isso o procedimento de implantação define as duas coisas no mesmo
 * passo, e o manifesto fica no servidor ao lado do pacote.
 *
 * ⚠️ O QUE ELA **NÃO** DEVOLVE: caminho de instalação, variáveis de ambiente, versão de
 * dependência, nome de host, string de conexão. Nada aqui ajuda a atacar a máquina — são três
 * campos, e o terceiro é um rótulo de ambiente que o rodapé já mostra.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const candidato = (process.env["IDENTIDADE_DO_CANDIDATO"] ?? "").trim();
  const corpo = {
    // `null` quando a instalação não declarou a identidade — e o aceite REPROVA nesse caso,
    // em vez de seguir. "Não declarado" é uma resposta; fingir que está tudo bem não é.
    candidato: candidato === "" ? null : candidato,
    commit: versaoLegivel(),
    ambiente: ambienteDeExecucao(),
  };
  return new Response(JSON.stringify(corpo), {
    status: corpo.candidato === null ? 503 : 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
