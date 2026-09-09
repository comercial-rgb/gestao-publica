# RREO Anexos 11 (Alienação) e 13 (PPP) — decisões e pendências

## Anexo 11 — Alienação de Ativos (LRF art. 44 e 53 §1º III)

O motor ([rreo-anexo11.ts](rreo-anexo11.ts)) mostra as receitas de alienação (I) e a aplicação
dos recursos (II), com o saldo financeiro a aplicar.

- **Receitas (I):** as arrecadações de **origem 2 da categoria de capital** (alienação — a MESMA
  classificação que o M10 exige ao sustentar a baixa de um bem, TR 4.65), mais os rendimentos de
  aplicação (origem 13). O `DeParaReceitaAlienacao` amarra a natureza às sub-linhas
  móveis/imóveis/intangíveis/rendimentos (rol fechado). **R3 é "uma classificação, dois
  consumidores"**: a natureza que o Anexo 11 conta é a que o guard do M10 aceita — se uma divergisse
  da outra, a baixa de patrimônio estaria amarrada a um dinheiro que entrou por outro motivo.

- **Aplicação (II) — interruptor nomeado:** o art. 44 vincula os recursos de alienação a despesa de
  **capital**. O sistema não tem uma fonte "de alienação" pré-definida; o `DeParaFonteAlienacao`
  **diz quais fontes são recursos de alienação**. **Vazio = quadro II zerado NOMEADO** (não há
  aplicação a mostrar), nunca um zero silencioso.

- **Saldo:** anterior (i) é tabela-parâmetro (superávit de exercícios anteriores) — vazio = 0 com
  nota. Do exercício (j) = i + receitas realizadas − (pagas + pagamento de RP). **Conferência do
  saldo contra o modelo da 15ª ed. é pendência de dado** nomeada no demonstrativo.

## Anexo 13 — PPP (Lei 11.079/2004 art. 28) — esqueleto honesto

Campina Grande **não tem PPP ativa**. A tabela `ContratoPPP` é o mínimo declarável (identificação,
objeto, vigência, valor global e a contraprestação anual). O motor ([rreo-anexo13.ts](rreo-anexo13.ts))
apura o **teto do art. 28**: Σ contraprestações anuais / RCL ≤ 5%. A RCL vem do **mesmo motor do
Anexo 3** (as páginas conversam — uma segunda apuração de RCL divergiria no primeiro corte furado).

> **⚠️ PENDÊNCIA DE DADO NOMEADA:** o **layout completo da Tabela 13 da 15ª ed.** (as linhas de
> ativos/passivos/garantias e o fluxo plurianual) NÃO foi reconstruído — só o esqueleto declarado
> na tabela. Ele entra quando houver um contrato real para modelá-lo contra, não de memória. Sem
> contrato, o demonstrativo é um estado vazio nomeado.

## Seeds

Os dois de-paras do Anexo 11 (`DeParaReceitaAlienacao`, `DeParaFonteAlienacao`) e a `ContratoPPP`
são **dado do ente** — o ente os preenche com o seu plano de receita e os seus contratos. Não há
seed de produção (diferente dos de-paras de ASPS/MDE, que trazem um mínimo convencional): a
alienação depende do plano de bens do ente, e a PPP, da existência de contrato.
