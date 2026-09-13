# ADR — A leitura é permissão: uma ação de consulta por área, no escopo pedido

**Situação:** aceita, 2026-09-12 (orquestração V3, pacote 4.1). Substitui a decisão
implícita do censo do M16 de que "leitura é camada de aplicação, não permissão".

## Contexto

O censo de ações do M16 cobria só as mutações. A leitura era um `where` por consulta, e o
acesso de leitura era derivado de três formas, medidas na ENT10 e neste pacote:

- `recorteDePagina` usava a **união** das unidades de todas as ações do usuário. Um crachá
  de EMPENHAR na Saúde lia a Educação se qualquer outra ação do mesmo perfil alcançasse a
  Educação.
- `exigirLeitura` do molde exigia **sessão** e nada mais: 46 telas abertas a qualquer
  identidade cadastrada.
- `lerDossieDoEmpenho` recebia um id e devolvia o dossiê sem perguntar de quem era.
- Doze leituras do ente (receita, extraorçamentário, conciliação, patrimônio, livros e
  demonstrativos) validavam só o exercício.

## Decisão

1. **Uma ação de leitura por área de navegação**: `CONSULTAR_<ÁREA>`, dezoito ao todo
   (`ACOES_DE_LEITURA`), concedida global ou por unidade gestora como qualquer ação do
   censo. Uma por área, e não uma por consulta: o sistema tem mais de cem leituras, e um
   rol que ninguém administra é concedido "inteiro" por atrito.
2. **O escopo é o da ação cobrada.** Permissão global em EMPENHAR não concede leitura
   global de nada. A união das unidades do usuário continua servindo ao seletor do
   cabeçalho, e a nada mais.
3. **Três níveis, declarados pela tela ou pela porta:**
   - *ente* — dado sem dimensão de unidade (cadastros, livros, demonstrativos, receita,
     tesouraria): só a concessão global autoriza. Uma agregação só das unidades
     autorizadas seria a visão parcial, e onde a tela a oferece ela passa pelo recorte;
     uma soma parcial nunca é apresentada como consolidado.
   - *recorte* — lista com dimensão de unidade: `recorteDePagina(sp, acao)`; o consolidado
     exige a global, `?ug=` fora do escopo recusa nomeando o escopo que o usuário tem.
   - *algum escopo* — caixas por participação (processos, comunicados, chamados): a ação
     em qualquer escopo abre a área; a regra do registro decide o resto.
4. **Detalhe por id deriva o escopo do próprio registro** (a ficha do empenho), nunca da
   URL. Redirecionamentos para o registro de origem também são autorizados. A recusa
   nomeia o escopo que o usuário tem e **não** a unidade do registro.
5. **A decisão é pura** (`lib/recorte.ts`), a resolução do escopo é do domínio
   (`modules/m16-travamento/leitura.ts`, a mesma tabela que `autorizar` lê) e a porta
   (`lib/portas/leitura.ts`) só junta identidade e escopo.
6. **Tela e rota traduzem a mesma recusa de formas diferentes.** Rota de exportação: 403
   com o motivo. Tela: redirecionamento para `/sem-acesso`, que recalcula a decisão a
   partir da sessão — nada de motivo viajando na URL.
7. **Transparência pública** continua por projeção própria (`app/transparencia`), sem
   sessão e sem a porta interna.
8. **A transição dos perfis existentes é explícita e versionada** (atualização v1,
   `modules/m16-travamento/atualizacoes-de-permissoes.ts`): cada perfil recebe a leitura
   de cada área em que já tem alguma ação, no mesmo escopo. A área que nenhuma mutação
   alcança (a transparência interna) vai, global, só para os perfis que administram
   permissões. Não é grant universal, e a atualização roda uma vez por instalação.

## Consequências

- A área "Transparência" interna deixa de ser visível a qualquer sessão: sem a ação,
  some do menu.
- Um usuário com ação de mutação numa unidade e sem a leitura correspondente vê o menu
  da área e recebe a recusa nomeando o que conceder. A atualização v1 evita isso para os
  perfis existentes; perfis novos são compostos ação a ação.
- Leituras do ente que antes eram abertas a qualquer sessão (a fila do art. 141, os
  livros, os demonstrativos) passam a exigir a ação global. É a mudança visível que a
  ENT10 deixou como "decisão devida ao operador", agora tomada pela orquestração V3.
- Pendência preservada: `CONSOLIDADO-PARCIAL-NAO-EXPRIMIVEL` — o consolidado só das
  unidades autorizadas (usuário com duas unidades e sem global) continua recusando com
  a orientação de escolher uma unidade; exprimi-lo pede `unidades: string[]` atravessando
  as consultas.

## Provas

- `test/ui/recorte-autorizado.test.ts` — as decisões puras, sem banco.
- `test/leitura-por-acao.test.ts` — os seis usuários pedidos, em banco sintético.
- `test/ui/leitura-exige-acao.test.ts` — toda tela e rota de `(areas)` declara a leitura.
- `modules/m16-travamento/m16-atualizacoes.test.ts` — instalação limpa e atualização.
