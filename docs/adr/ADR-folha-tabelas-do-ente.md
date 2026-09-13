# ADR — Folha de pagamento: algoritmo conciliado do doador, tabelas do ente, cálculo como fato

**Situação:** aceita, 2026-09-13 (V6 P2.3).

## Contexto

O TR 5.12 pede folha mensal com cálculo detalhado por verba (5.12.50–5.12.54), incidências
parametrizáveis (5.12.62/63), salário-família automático (5.12.61), lançamentos fixos e variáveis
(5.12.65/66), enquadramento correto de quem acumula dois cargos (5.12.79) e empenho automático
(5.12.71). O M32 (V6 P2.1/P2.2) entregou o cadastro e a vida funcional; a folha era o bloco 2.

Há um motor pronto fora deste repositório: `packages/folha-engine` do `saas-municipal` (3,7 mil
linhas; 1,7 mil de testes). Ele calcula em `number` (float), resolve tabelas com drizzle em três
camadas (snapshot, override do tenant, federal semeada) e traz as tabelas federais de 2020 a 2026
semeadas no código, com valores que este repositório não tem como conferir contra a fonte oficial.

## Decisão

1. **O doador é doador de ALGORITMO, não de código.** Entraram como ideia, reescritas em Decimal
   (`packages/contracts`) e testadas aqui: faixas progressivas com arredondamento por faixa; os
   três cenários do IRRF (deduções legais, deduções com redutor, desconto simplificado — vence o
   menor); a contribuição por regime (RGPS progressiva com teto, RPPS pela lei do ente, ISENTO);
   o teto agregado entre vínculos da mesma pessoa; o mês fiscal de 30 dias; a memória canônica
   com sha256. Nada é importado do doador; os resolvers drizzle e os seeds não entram.
2. **Nenhum código no código.** Alíquota, faixa, teto, dedução por dependente, desconto
   simplificado, redutor, valor e renda máxima do salário-família vêm de tabelas do ente
   (`TabelaDeContribuicao`, `TabelaIrrf`, `TabelaSalarioFamilia`), vigentes por competência, com
   fundamentação legal obrigatória. Sem tabela vigente, o cálculo RECUSA nomeando a competência
   e o tipo. A aplicabilidade dos cenários do IRRF vem dos campos da tabela (desconto simplificado
   informado ⇒ cenário disponível; redutor com os três campos ⇒ cenário disponível), não de datas
   embutidas.
3. **O cálculo é um fato numerado**, nunca UPDATE: `CalculoDaFolha` numero+1 a cada recálculo;
   `CancelamentoDoCalculo` e `FechamentoDaFolha` são fatos; o fechamento congela UM cálculo e leva
   o sha256 do conjunto. Depois de fechada, a folha não se recalcula. Cada `Contracheque` guarda a
   memória canônica (JSON determinístico) e o seu sha256; cada `LinhaDoContracheque` guarda a
   fórmula em texto.
4. **A mesma pessoa com duas matrículas é UMA pessoa para a contribuição RGPS e UMA fonte
   pagadora para o IRRF:** as bases se somam, a tabela se aplica à soma e o resultado se rateia
   na proporção das bases (o centavo fica no último). RPPS e ISENTO ficam fora da agregação da
   contribuição. A memória de cada contracheque diz que o valor foi imposto pela agregação.
5. **O regime previdenciário mora no VÍNCULO** (`Vinculo.regimePrevidenciario`, opcional para os
   vínculos anteriores): a folha recusa a matrícula sem regime, nomeando-a.
6. **Arredondamento: `toMoney` (half-even), o mesmo do razão.** O doador usava half-up. A diferença
   só aparece no centavo exato; se o ente exigir half-up em conferência, é decisão a registrar
   (pendência `ARREDONDAMENTO-DA-FOLHA`), não constante a trocar.
7. **Não entrou nesta unidade** (pendências nomeadas no MODULO do M33): apropriação contábil
   automática (5.12.71) — próxima unidade, sobre o M05 —; 13º, férias, rescisão; faltas
   (frequência) como redutor de dias; pensão alimentícia por dependente; consignações com margem.

## Provas

`modules/m33-folha/m33-folha.test.ts` (domínio puro com fixtures sintéticas — as tabelas dos
testes são FIXTURES, não a norma — e serviço contra o banco isolado), `scripts/smoke-folha.ts`.
