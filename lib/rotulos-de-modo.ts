/**
 * O MODO DE UMA INTEGRAÇÃO, EM PORTUGUÊS.
 *
 * ⚠️ `MOCK`, `SANDBOX` e `LIVE` são o vocabulário INTERNO das integrações (o tipo `ModoBb` do M17,
 * o modo da Captura), e ele estava chegando cru à tela: "modo MOCK" num painel que a comissão vai
 * ler. O valor guardado continua o mesmo — o que muda é a leitura, num lugar só.
 *
 * ⚠️ E O NOME NÃO SUAVIZA O QUE O MODO SIGNIFICA. "Simulação" diz exatamente o que é: nenhuma
 * chamada externa aconteceu. Trocar por algo que sugerisse operação real seria o oposto da
 * honestidade que estas telas carregam no topo.
 */
const ROTULO: Readonly<Record<string, string>> = {
  MOCK: "Simulação",
  SANDBOX: "Homologação",
  LIVE: "Produção",
};

export function rotuloDoModoDeIntegracao(modo: string): string {
  return ROTULO[modo] ?? modo;
}
