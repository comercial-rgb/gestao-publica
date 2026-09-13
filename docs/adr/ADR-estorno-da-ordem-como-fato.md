# ADR — O estorno da ordem de compra é um fato, não um DELETE

**Situação:** aceita, 2026-09-13 (V6 P1.1, `cd70495`).

## Contexto

`estornarOrdemDeCompra` (ENT05/V4, decisão D12) apagava a ordem e seus itens. O teste passava porque
`criarPrismaDeTeste` conecta como DONO do banco. O papel de runtime `gestao_app` só tem SELECT/INSERT
fora do censo assinado em `prisma/papel-runtime.ts` — e `OrdemDeCompra` não está no censo. Pela tela,
o estorno falharia com "permission denied" no município. Nenhum percurso o exercitava com sucesso: o
smoke das compras só provava a RECUSA (ordem com recebimento).

O vínculo solicitação × ordem (P1.1) tornou o problema visível: uma alocação aponta para o item da
ordem por FK; apagar a ordem exigiria apagar as alocações e perderia o histórico do que a solicitação
já teve ordenado.

## Decisão

1. O estorno vira **movimento** (`MovimentoDaOrdemDeCompra`, tipo `ESTORNO`, com data, motivo e
   autor). A ordem e os itens continuam existindo. "Estornada" é derivado (`ordemEstornada`).
2. Os controles que impediam o estorno (recebimento existente; empenho vivo — a TR 5.17.100) continuam
   como estavam. Estornar duas vezes recusa nomeando.
3. **Cada leitor exclui a estornada**: `guardsDaOrdem` do empenho (M05), `conferirVinculos` do
   documento fiscal, `registrarRecebimentoDeOrdem`, o vínculo de solicitação, as opções de empenho e
   de documento, o painel de pendências, e as listas (filtro "só as vivas / só as estornadas").
4. As solicitações que a ordem atendia recebem `MovimentoDaSolicitacao` **`ORDEM_ESTORNADA`**
   (informativo; `situacaoDaSolicitacao` só olha AUTORIZACAO/ANULACAO). As parcelas viram
   canceladas e o pendente volta — sem apagar linha nenhuma.
5. Nenhuma tabela nova entra no censo de DELETE do runtime. O censo continua assinado.

## Consequências

- `m11-compras.test.ts` t5 passou a afirmar a existência da ordem e o movimento (antes afirmava
  `count === 0`). O smoke do vínculo prova o estorno pela tela pela primeira vez (8.1–8.4).
- O `MODULO.md` do M11 nomeia `ESTORNO-DA-ORDEM-E-FATO`; a D12 (direção da cascata) permanece.
- Lição para o repositório: **um serviço que apaga linha só é real se a tabela está no censo do
  runtime** — o teste como dono não prova isso. Candidato a guard: `test/papel-runtime.test.ts`
  varrer `.delete(`/`.deleteMany(` em `modules/` contra o censo.
