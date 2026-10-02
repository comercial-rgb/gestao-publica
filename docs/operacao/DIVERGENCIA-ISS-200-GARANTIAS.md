# R$ 200,00 de ISS em Garantias — memória e questão ao contador (V27, 2026-10-01)

Banco: o da apresentação (`gestao_publica_apresentacao`, porta 3010), e a cópia de ensaio
`gestao_publica_ensaio_promocao`. Nada foi alterado em nenhum dos dois; as consultas abaixo só leem.

Esta diferença é só esta. Não tem relação com a diferença de R$ 11.760,00 entre o Anexo II e o demonstrativo da
MDE da LOA de Esperança (ver `docs/oficial/esperanca-pb/loa-2026-deducoes.md`), que é de outro banco e de outro
documento.

## Origem

1. A massa de demonstração (`prisma/seed/sagres-poc.ts`) criou o tipo de consignação ISS com a conta
   2.1.8.8.1.02.00. No PCASP do TCE-PB 2025 essa conta é **GARANTIAS**. A analítica do ISS é a 2.1.8.8.1.01.08.
2. A mesma conta estava fixa no importador de folha (`lib/portas/importadores.ts`, mapa `CONTAS_CONSIGNACAO`).
   **Isso era defeito de software e foi corrigido na V27.** Agora a conta vem da decisão vigente do tipo no
   cadastro, e há teste com mutação provada em `modules/m20-importador/m20-importador.test.ts`. Esse defeito não
   produziu os R$ 200,00: nenhuma folha foi importada no banco da apresentação.

## Registros afetados

| Movimento | Dia | Tipo | Valor | Consignatário | Lançamento | Conta |
|---|---|---|---:|---|---|---|
| `cmumq8zpe002c1sxpg0mtx874` | 14/09/2026 | retenção no pagamento 3 | 500,00 | Municipio de Campina Grande | nº 3 (PAGAMENTO) | C 2.1.8.8.1.02.00 |
| `cmumq8zqr002g1sxptvb65kjg` | 20/09/2026 | recolhimento | 300,00 | Municipio de Campina Grande | `EXTRA-OUT-ISS-2026-09-20` | D 2.1.8.8.1.02.00 |

O recolhimento não tem alocação à retenção (`AlocacaoDoRecolhimento` vazia para os dois).

## Cálculo reproduzível

```sql
select c.codigo, sum(case when p.tipo='CREDITO' then p.valor else -p.valor end) as saldo_credor
  from "PartidaContabil" p join "ContaPcasp" c on c.id = p."contaId"
 where c.codigo = '2.1.8.8.1.02.00' group by 1;
-- 500,00 - 300,00 = 200,00
```

## Efeito contábil hoje

- Garantias (2.1.8.8.1.02.00) tem saldo credor de 200,00 que não é garantia.
- A conta do ISS (2.1.8.8.1.01.08) não tem o saldo.
- O passivo total está certo; está errada só a conta.
- Os arquivos do SAGRES de receita e despesa extraorçamentária desses dois fatos levam a conta 218810200.

## Por que é decisão do contador, e não correção de software

O ente da demonstração é "PREFEITURA MODELO - POC", com **IBGE 2504009, que é Campina Grande**
(`docs/oficial/ibge/municipios-pb.json`) e CNPJ fictício. O consignatário do ISS é "Municipio de Campina Grande".

O sistema classifica a retenção como de terceiro porque compara o nome do consignatário com o nome do ente, e os
dois diferem. O código IBGE, porém, diz que é o mesmo município. Nenhum documento da massa resolve qual das duas
leituras vale.

## Questão ao contador

Na demonstração, o ISS de 500,00 retido em 14/09/2026 no pagamento 3 para "Municipio de Campina Grande" é:

**A) ISS devido a outro município (terceiro).** Fica como consignação.
- Lançamento manual de reclassificação: D 2.1.8.8.1.02.00 / C 2.1.8.8.1.01.08, 200,00, citando os dois movimentos
  (Contabilidade › Lançamentos).
- Antes disso, a redefinição da conta do ISS, que a promoção já faz.
- Consequência: Garantias zera, e os 200,00 continuam devidos a Campina Grande, recolhidos pela conta certa.
- Receita orçamentária e bases da MDE e da saúde não mudam.

**B) ISS do próprio ente (a POC é Campina Grande).** Seria receita orçamentária de ISS, não consignação.
- O recolhimento de 300,00 a si mesmo não deveria existir.
- O caminho no sistema é a regularização da retenção própria (Financeiro › Retenções do município). Hoje ela é
  recusada, porque o nome do ente não é o do consignatário.
- Exigiria antes corrigir a identidade do ente da demonstração, o que a ordem proíbe fazer convertendo os fatos.
- Consequência: muda a receita de ISS e as bases constitucionais de setembro. Os 300,00 continuariam como saída
  sem par, até decisão própria.

**Sem decisão recebida, nada é lançado.** Não se cria ajuste, tolerância ou arredondamento. A promoção da 3010
não depende dessa resposta: ela só redefine a conta para os fatos futuros.
