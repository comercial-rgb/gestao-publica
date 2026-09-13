# ADR — Roteiros contábeis versionados, e o banco dos percursos separado do de desenvolvimento

**Situação:** aceita, 2026-09-12 (orquestração V3, pacotes 4.4 e 4.5).

## Contexto

`RoteiroPatrimonial` e `RoteiroResultadoAlienacao` tinham uma linha por evento, e a
reparametrização a atualizava em silêncio: versão anterior, autor e motivo se perdiam, e um
lançamento antigo não sabia dizer com que par de contas tinha sido feito.

O banco de desenvolvimento era também o banco dos percursos de navegador. Medido em
2026-09-12: três roteiros patrimoniais (AQUISICAO, AVALIACAO_INICIAL, BAIXA_ALIENACAO)
com o par `1.1.1.1.1.01.00 × 1.1.1.1.1.00.00`, escolhido por `scripts/smoke-roteiros.ts`
como "as duas primeiras analíticas que o seletor oferece", e quatro movimentos com quatro
lançamentos por cima. Uma fixture instrumental disponível como configuração operacional.

## Decisão

1. **Cada parametrização é uma versão, append-only** (`VersaoDeRoteiro`): família, chave,
   número, par de contas, motivo obrigatório, autor e momento da proposta, autor e momento
   da publicação. A única escrita depois da criação é a publicação, por coluna, no censo
   do papel de runtime.
2. **Três atos separados:** propor (validação estrutural pelo motor: contas analíticas,
   pares que formam lançamento, débito diferente de crédito), publicar (a aprovação, ação
   própria `PUBLICAR_ROTEIRO_PATRIMONIAL`) e usar em fatos (o resolvedor lê a versão em
   vigor). A parametrização direta da tela continua como ato composto, e por isso exige os
   dois crachás.
3. **Vigência derivada, nunca gravada:** a versão em vigor é a publicada mais recente; a
   anterior termina onde a seguinte começa. Uma proposta não vigora.
4. **O fato aponta para a versão que usou** (`MovimentoPatrimonial.versaoDeRoteiroId`).
   Trocar o roteiro não reescreve lançamento nenhum.
5. **Concorrência e repetição sem sobrescrita silenciosa:** o número da versão nasce de
   `max + 1` na transação e é único por (família, chave); a proposta idêntica à pendente e
   o par já vigente são recusados nomeando; publicar duas vezes é recusado.
6. **As tabelas legadas ficam só-leitura, como origem.** `scripts/versionar-roteiros-existentes.ts`
   cria a versão 1 de cada linha legada com o autor e o momento originais e o motivo
   nomeando a origem. O resolvedor prefere a versão e só cai na linha legada enquanto não
   há nenhuma.
7. **Três bancos:** desenvolvimento (`DATABASE_URL`), suíte de integração
   (`DATABASE_URL_TEST`, já isolada) e percursos de navegador (`DATABASE_URL_PERCURSOS`,
   novo). `npm run percursos:preparar` cria e povoa o terceiro por uma sequência declarada
   de seeds e recusa coincidir com os outros dois; `npm run percursos:servir` sobe o
   servidor sobre ele.
8. **Configuração de demonstração identificada, não homologação.** `seed:roteiros-demo`
   propõe e publica, pelos serviços e com autor, um par por evento do acervo escolhido pelo
   nome de cada conta no PCASP, com o motivo dizendo que é demonstração. Produção não roda
   esse seed: qual par cada evento debita e credita é decisão do contador do ente.

## Consequências

- A tela do roteiro ganha a aba de histórico com as versões e as ações "propor" e
  "publicar"; `ROTEIRO-SEM-HISTORICO-PROPRIO` fecha.
- Os roteiros instrumentais do banco de desenvolvimento não são apagados nem reescritos:
  viram a versão 1 (origem nomeada) e são substituídos pela versão 2 de demonstração; os
  quatro movimentos continuam apontando para a versão que usaram (nula, por serem
  anteriores ao versionamento) e o razão fica intacto.
- `PUBLICAR_ROTEIRO_PATRIMONIAL` chega aos perfis existentes pela atualização versionada
  v2 (quem parametrizava recebe a publicação no mesmo escopo); a segregação real entre
  propor e publicar é decisão do administrador.

## Provas

`modules/m10-patrimonial/m10-roteiros-versoes.test.ts` (proposta que não vigora,
segregação, versão anterior preservada com o fato apontando para a sua, linha legada como
origem, concorrência, repetição, ato composto), `m10-roteiros.test.ts` (atualizado para ler
a versão em vigor), `m16-atualizacoes.test.ts` (a v2).
