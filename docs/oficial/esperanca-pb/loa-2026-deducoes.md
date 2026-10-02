# LOA 2026 de Esperança — deduções da receita prevista

Origem dos valores: Anexo II da Lei Municipal 613/2025 (LOA 2026), conforme transcrito na ordem
`docs/lotes/V26-decisoes-da-v25.md`, item 2.5.

**O PDF da lei não está neste repositório.** Os valores abaixo vêm da transcrição da ordem, não de
um arquivo conferido aqui por hash. Pendência: baixar a lei publicada, guardar nesta pasta com URL,
data de acesso e SHA256, e conferir as quatro linhas contra ela.

| Natureza | Descrição | Fonte | Valor (R$) | Tipo no Tribunal | Código no documento |
|---|---|---|---:|---|---|
| 17115111 | FPM mensal | 500 | 10.147.500,00 | 3 — dedução para o Fundeb | 17115111.00 |
| 17215001 | ICMS | 500 | 2.940.300,00 | 3 — dedução para o Fundeb | 17215001.00 |
| 17215101 | IPVA | 500 | 427.900,00 | 3 — dedução para o Fundeb | 17215101.00 |
| 17215201 | IPI | 500 | 1.540,00 | 3 — dedução para o Fundeb | 17215201.00 |
| | **Total** | | **13.517.240,00** | | |

## O que não se carrega, e por quê

- **Tipos 4 e 5:** o anexo não traz dedução não nula desses tipos. Nenhuma linha é criada para
  cobrir a tabela do Tribunal.
- **ITR:** consta com dedução zero no anexo. Os 20% não são preenchidos automaticamente.

## Divergência registrada, não corrigida

O demonstrativo da MDE da mesma lei traz R$ 13.529.000,00 de dedução para o Fundeb; as linhas do
Anexo II somam R$ 13.517.240,00. A diferença é de **R$ 11.760,00**. A carga usa o Anexo II, que é a
previsão por natureza. A LOA não é recalculada para fechar a diferença; cada valor guarda a sua
origem (o detalhe de cada linha aponta o documento).

## Carga

`scripts/demonstracao/carregar-deducoes-loa-esperanca-2026.ts`. É idempotente e fail-closed:
- sem a natureza ou a fonte 500 no cadastro, nada é gravado;
- uma linha que já existe com outro valor para a carga, que não altera nada.
