# V29 — proposta orçamentária do exercício seguinte (2026-10-02)

Pedido como veio, em mensagens seguidas durante a apresentação, quando os avaliadores
perguntaram como o sistema gera o orçamento do ano seguinte:

> gerar um novo loa para 2027 como faco ?
>
> como busca os dados historico e gera uma nova proposta
>
> Como fazemos para gerar o orcamento do proximo ano ?
>
> como transportar o orcamento de 2026 para 2027 e criar isso que eles querem saber
>
> Quero importar fichas ja existente e criar um novo orcamernto baseado nelas e depois alterar
>
> o que eles querem ver e basicamente criar um orcamento para 2027 importando receitas de 2026

## Módulo

M02 (planejamento). A abertura do exercício reutiliza o serviço que já existe no M08
(`abrirExercicio`), que até aqui não tinha tela.

## Por que é uma proposta, e não uma cópia direta das fichas

Criar ficha grava a dotação inicial no razão (`registrarMovimentoDotacao`, 1º de janeiro do
exercício), e o razão é append-only. Copiar 2026 direto para fichas de 2027 transformaria a
proposta em lançamento antes da votação na Câmara, e cada ajuste depois exigiria crédito
adicional. Por isso:

1. a **proposta** importa as receitas previstas e as fichas de um exercício, com a base e o
   percentual escolhidos, e não toca o razão;
2. cada linha se **altera** por ajuste append-only, com motivo;
3. a **efetivação** cria as fichas e a receita prevista do exercício novo, pelo mesmo caminho
   da criação manual, numa transação só, uma vez por exercício.
