# Roteiro de apresentação (20–30 minutos)

Candidato de **demonstração**. Senhas não são publicadas neste arquivo: vêm do ambiente
(`SEED_ADMIN_SENHA` no servidor) ou são geradas na criação do usuário, entregues em
canal privado. O administrador do seed **não** substitui os demais papéis no teste
de restrição.

## Acesso local (sem URL pública)

1. Banco em `localhost:5436`, migrations + `npm run db:sql` + `npm run db:papel`.
2. Atualização de permissões v6: `npm run permissoes:atualizar -- 6` com `SEED_IDENTIDADE`
   de um usuário que possa `CONCEDER_ACAO_A_PERFIL`.
3. `npx next build` no SHA congelado; `NODE_ENV=production npx next start`.
   Percursos isolados: `npm run percursos:preparar` e `npm run percursos:servir` (porta 3010).
4. Abrir `/login`. Identidade inicial do bootstrap: `admin@cg.pb.gov.br`.
5. Demais papéis (planejador, compras, fiscal/recebedor, contador, tesouraria, auditor):
   criar em Administração > Usuários, com perfil e senha gerada na hora. Não versionar senha.

## Sequência sugerida

1. **Login e contexto** — exercício e unidade visíveis; o menu só mostra o que o servidor autoriza.
2. **Planejamento / dotação** — PPA ou ficha da LOA já existente (não reconstruir).
3. **Contratação e empenho** — processo homologado, contrato, empenho com contrato.
4. **Ordem → nota → recebimento → liquidação**
   - Emitir ordem com **dois itens** (ou uma ordem e uma nota de duas linhas).
   - Registrar documento fiscal (ou importar XML de teste). Mostrar que **não** liquidou.
   - Tentar gravar o mesmo número/série do mesmo emitente: recusa de duplicidade.
   - Conferir a nota. Abrir o PDF: “sem validade fiscal”.
   - Empenhar a partir da ordem (`Empenhar esta ordem`). Ordinária: um empenho pelo total.
   - Receber **parte** de um item, apontando para a nota. O pendente cai.
   - Liquidar parcela da nota conferida. Segunda parcela. Terceira acima do saldo: recusa.
5. **Pagamento administrativo** — se a cadeia V4 do empenho já tiver saldo liquidado; senão,
   mostrar o dossiê e não improvisar pagamento fictício.
6. **Patrimônio** — termo existente; PDF de posição atual distinto da emissão congelada.
7. **Relatório / exportação** — lista de empenhos em CSV/PDF (o PDF é a tela).
8. **Consulta pública** — `/consulta` com número e verificador de um processo sintético;
   `/transparencia/demonstrativos` se houver publicação no exercício.

Inclua, em algum momento: uma recusa de saldo ou duplicidade; um usuário sem a ação
tentando a URL direta; a trilha em Administração > Auditoria do ato recusado.

## Exploração sem roteiro

Deixar o visitante cadastrar outro fornecedor, outro item e um recibo parcial.
Nada depende de UUID colado nem de SQL entre cliques.

## O que dizer com clareza

- Isto é demonstração comercial com dados sintéticos.
- XML importado não é autorização fiscal.
- Não há folha nem portal de servidor transacional nesta oferta.
- Sem alvo autorizado, não há endereço na internet.
