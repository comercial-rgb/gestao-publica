# ENT06 item 1 — conceder uma ação a um perfil

> Pedido do operador em 2026-09-12, nesta sessão. Sem prompt escrito antes: a ordem veio da
> revisão do item 0, que encontrou o bloqueio, e foi confirmada pelo operador com a instrução
> de construir sem parar e sem gate intermediário.

## O que foi pedido

Construção contínua do sistema de gestão pública — telas, rotas, botões de ação, fluxos e
módulos integrados —, começando pelo que destrava todo o resto.

A ordem, confirmada pelo operador:

1. **conceder ação a perfil, com hierarquia de usuários** (este lote);
2. fechar o ENT06 item 0 — entrada de material, depois as telas de 5.19 e 5.17;
3. o defeito de eixo de data do formulário;
4. protocolo e processo digital como espinha;
5. portal do servidor e portal do cidadão;
6. frota, fiscalização de contratos e a frente tributária.

## Por que este lote veio primeiro

A revisão do ENT06 item 0 mediu: **223 ações no censo, 185 concedidas ao perfil de
instalação**. As 38 de diferença eram o ENT05 inteiro — entregue e inalcançável. O
`bootstrap` deriva as permissões do censo, mas é ato de instalação e recusa rodar em banco
já povoado, corretamente. **Não existia caso de uso que concedesse uma AÇÃO a um PERFIL.**

Sem isso, cada tela nova nasceria invisível em qualquer instalação existente — e construir
duzentas telas antes de resolver multiplicaria o problema por duzentas.

## O que entrou

- `CRIAR_PERFIL`, `CONCEDER_ACAO_A_PERFIL` e `REVOGAR_ACAO_DE_PERFIL` no censo do M16, no
  enum do banco (migration aditiva) e no mapa de áreas do menu;
- `modules/m16-travamento/servico-perfis.ts` — os três atos, com recusa nomeada em cada
  porta e a trava da última chave;
- a porta e a tela de `administracao/perfis`, que até aqui só lia;
- `PermissaoDePerfil` no censo assinado de `DELETE` do papel de runtime;
- teste de domínio, teste do papel de runtime e percurso de navegador.

## O que NÃO entrou

Hierarquia de perfis por herança. Um perfil que herda de outro reintroduz, por outro nome, o
"copiar de" que este lote recusou: quem concede uma ação ao perfil pai amplia todos os
filhos sem olhar para nenhum. A separação do TR 6.4 depende de cada concessão ser um ato
visível. Pendência `HIERARQUIA-DE-PERFIS`, e ela precisa de decisão antes de código.
