# Melhorias PROD — além do texto do TR

Identificador `PROD-nnn`, separado das 2.037 cláusulas do catálogo (`catalogo-execucao.json`): não
entram no denominador do TR. Cada linha diz o que é, em que capacidade-base se apoia, o estado e a
prova. Estados: `ENTREGUE` (tela + teste + percurso), `PARCIAL`, `PLANEJADA`.

| Id | Melhoria | Capacidade-base | Estado | Prova |
|---|---|---|---|---|
| PROD-001 | Vínculo solicitação × ordem por item e quantidade, com atendimento derivado (ordenado, recebido, cancelado, pendente) nos dois sentidos e no espelho em PDF | 5.17.51–5.17.53 (solicitações), 5.17.96–5.17.105 (ordens) | ENTREGUE (V6 P1.1, `cd70495`) | `m11-alocacao.test.ts` (11, N=2); `smoke-solicitacao-ordem.ts` 35/35 em `867b962` |
| PROD-002 | Apresentação do ente configurável e versionada (nome de exibição, imagem pelos bytes, contatos, tema fechado, canais), com identidade neutra sem cadastro e SHA fora do rodapé comum | 5.8.1 (configurável), 5.38.46 (brasão na transparência) | ENTREGUE (V6 P0.1, `4dcd2dd`) | `m16-apresentacao.test.ts` (10); `smoke-identidade.ts` 46/46 em `b7e2df3` |
| PROD-003 | Minha mesa: pendências, ações autorizadas, processos da lotação e comunicados não lidos, com três estados (dado / sem acesso / indisponível) | M21, M23, M16 leitura por área | ENTREGUE (V6 P0.2) | `smoke-identidade.ts` 2.1–2.3, 8.2 |
| PROD-004 | Mesa unificada de tarefas com prazo e fila rastreáveis por setor | M21 (P3.1) | PLANEJADA | — |
| PROD-005 | Trilha de proveniência de cálculos e documentos (versão do modelo, sha256, autor) exposta ao operador | M10 termos (existe), M26 | PARCIAL (termos e documentos fiscais têm sha256; folha e relatórios não) | `x-documento-sha256` nas rotas de PDF |
