# V3 — Orquestração contínua da gestão pública

> Pedido do operador (2026-09-12), guardado como veio, antes de começar. Base de
> referência: `dc7032a12c7490781ffbdca6958eb3fbf422fe48`. A partir deste pedido o modo de
> trabalho muda (seção 1): não se para para revisão a cada lote, o portão integral fica
> para o candidato de homologação, e as decisões técnicas locais já delimitadas aqui não
> esperam humano. `CLAUDE.md` e `docs/LEIA-ME.md` registram a mudança.

## 1. Direção e precedência

Esta instrução atualiza o modo de execução:
- Não parar para revisão a cada cadastro, botão ou pequeno lote.
- Não executar o portão integral a cada pequena entrega.
- Não esperar decisões humanas sobre escolhas técnicas locais, reversíveis e já
  delimitadas neste comando.
- Preservar as invariantes contábeis, segurança e dados.

Atualize CLAUDE.md e docs/LEIA-ME.md para registrar essa mudança de modo de trabalho.
Preserve as decisões anteriores como histórico; não deixe duas instruções operacionais
contraditórias.

Leia primeiro: ESTADO-EXECUCAO.md; docs/instrucoes/PROMPT-MESTRE-IMPLEMENTACAO.md;
docs/edital/catalogo-execucao.json; docs/edital/condicoes-operacionais-e-contexto.json;
ADRs e MODULO.md dos componentes que serão alterados. Não releia toda a documentação a
cada tarefa. O número ENT é lote, não percentual de conclusão do sistema.

## 2. Preservação e reconciliação inicial

Confirme diretório, branch, HEAD, alterações locais e bancos. Não retorne ao SHA de
referência se o trabalho já avançou. Preserve ENT07–ENT12.

Autoriza-se consulta externa somente de leitura: git fetch, leitura de código,
documentação oficial. Não autoriza push, deploy, alteração de visibilidade, pagamentos,
transmissões fiscais ou envio de dados municipais.

Reconciliação DIRECIONADA com siafic-cg @ c04ad5a760dfbce977ef7f28db7e42ee49d85761:
acervo, plurianual, RH, convênios e a composição contrato/reserva/empenho. Decisão por
capacidade: reutilizar, adaptar, equivalente atual, complementar ou substituir. Sem merge
indiscriminado, sem recopiar migrations aplicadas, sem reescrita por diferença de ORM.

No doador saas-municipal, caracterize folha, fixtures e provisionamento que serão
aproveitados. Código adaptado entra no módulo proprietário do produto. A reconciliação
não vira auditoria indefinida.

## 3. Novo regime de verificação

A. Durante a construção, após uma unidade coerente: typecheck dos projetos afetados;
testes específicos do domínio; autorização positiva e negativa; persistência e recarga.
Dinheiro, estoque, autorização, período, idempotência ou transação exigem testes de
integridade. Schema exige validação e aplicação em banco isolado. Catálogo de ações,
perfis ou bootstrap exigem teste de instalação e atualização. Sem test:tudo/test:fuso por
alteração de texto, campo ou botão.

B. Portão integral reservado ao candidato de homologação/implantação. Preserve todos os
testes existentes. A execução final inclui suíte completa, fuso, schema, SQL manual,
permissões, build e percursos de navegador. "10 passos" não é contrato imutável.

C. Nenhum teste de aceite roda contra arquivos sendo editados: árvore congelada ou
worktree fixada em commit. Registre commit ou digest antes e depois. Reutilize o trinco.
Não mate processos alheios.

D. Timeout ou saturação não significa aprovação nem defeito. A ENT12 permanece com a
pendência de validação integral; não gaste uma sessão repetindo o portão.

## 4. Primeiro pacote — correções que destravam a construção

4.1 Autorização de leitura por recurso e ação. Conclua a ENT10. Cada leitura protegida
exige direito explícito de consultar o recurso, no escopo efetivo solicitado. A união dos
locais serve ao seletor; não concede ação. Permissão global em uma ação não concede
leitura global em outra. Política compartilhada de leitura com o catálogo e o domínio
existentes. Aplicar antes de obter ou serializar: listas, detalhes por ID, totais,
seletores, anexos, PDFs, CSV, relatórios, rotas alternativas e Server Actions. Detalhes
derivam o escopo do próprio registro; redirecionamentos também autorizados. Leitura
global do ente exige a ação nesse escopo; agregação parcial identificada como parcial.
Transparência pública por projeção própria. Testes: sem permissão; somente leitura; ação
A na unidade 1 e ação B na unidade 2; global em uma e restrito em outra; revogada; acesso
direto por ID/URL/exportação. Banco sintético isolado.

4.2 Perfis, instalação e atualização. Reutilize deriva-de-perfil.ts e os serviços de
concessão. Para cada capacidade nova: perfis de referência, escopo, quem não recebe, como
instalação e atualização a disponibilizam, se depende de concessão explícita. Templates do
produto com atualização versionada e auditada; perfis personalizados e revogações
deliberadas preservados. Diagnóstico e concessão pela interface. Testes: instalação
limpa, upgrade, somente leitura, ação não concedida, administrador sem direito de ampliar
o próprio escopo.

4.3 Auditoria e resposta verdadeira. Reproduza a falha de comOperacaoRegistrada e do
login: o ato conclui, o log falha, a interface recebe erro. Separe fato + auditoria de
sucesso + outbox na mesma transação; tentativa negada preservada no rollback; telemetria
posterior sem alterar o resultado. Sem transação de fachada com adapters no Prisma
global. Preserve o erro original. Retry idempotente com chave e fingerprint no escopo.

4.4 Massa de teste e configuração contábil. Separe banco de desenvolvimento, de testes
de integração e de percursos. Teste e smoke não escolhem "as duas primeiras contas".
Inventarie roteiros instrumentais e movimentos dependentes. Não apague o razão. Fixture
isolada não é proibida; confundir fixture com configuração de produção é.

4.5 Versionamento dos roteiros. Preserve versão anterior, autor, momento, motivo, vigência
e vínculo com os fatos. Concorrência e repetição do mesmo comando testadas. Separe
validação estrutural, aprovação/publicação e uso em fatos.

## 5. Segundo pacote — cadeia patrimonial utilizável

Sem refazer ENT07–ENT12. Pesquisa do acervo; vínculo explícito Usuario↔Pessoa
(opcional, auditável, sem união por nome, sem obrigar contas técnicas; não concede
permissão; cadastros antigos ficam pendentes); "meus bens"; motivos de baixa ligados ao
ato com texto histórico; reavaliação e impairment; parâmetros versionados de
depreciação; processamento por competência com prévia e memória; alienação integrada;
estorno com análise de dependências; documentos e termos. ETIQUETAS: artefato imprimível,
individual e em lote, com o código verificado por decoder independente. LIQUIDAÇÃO DE
MATERIAL: reexaminar o ramo; escolher e documentar o caso de uso composto sem dupla
contabilização; refatoração de testes permitida com expectativa definida antes.

## 6. Programa completo de construção

A. Fundação e processos. B. Financeiro, planejamento e suprimentos (5.9–5.11, 5.17–5.22).
C. Pessoal (5.12–5.16). D. Tributário e fiscal (5.23–5.36). E. Jurídico e canais
(5.37–5.43). F. Setoriais (5.44–5.47). G. Operação e implantação.

## 7. Arquitetura e contexto

Monólito modular, Prisma, schema por município. Testar dois municípios; Prefeitura,
Câmara e Fundo; dois exercícios; escopos distintos; pool reutilizado; jobs, documentos,
relatórios e exportações. Não habilitar segundo cliente enquanto houver caminhos não
isolados.

## 8. Padrão de entrega funcional

Ator e escopo; rota; campos e validações; ações; persistência; efeitos; autorização;
histórico; erro recuperável; teste. Busca e paginação em seletores volumosos. Sem UUID
para o operador. Sem link sem destino, botão decorativo ou sucesso fictício. Nenhum
número de cláusula, ENT ou selo na interface.

## 9. Integrações e implantação

Contratos externos junto das frentes. Sem credencial: validação, preparação,
armazenamento, consulta, reprocessamento e retornos testáveis localmente; envio pendente.
Preparar implantação: configuração por ambiente, artefato reproduzível, readiness,
migrations, SQL manual, permissões, storage, jobs, segredos, monitoramento, backup e
recuperação. Nenhuma alteração produtiva por interpretação genérica.

## 10. Evidências e continuidade

Catálogo existente, sem matriz concorrente. Classificar implementação, teste local,
interface, publicação, implantação e validação externa. ESTADO-EXECUCAO.md com resumo
atual no início. Commit local por unidade. Checkpoint exato ao encerrar.

## 11. Início imediato

Começar pelo primeiro pacote. Não voltar à ENT00. Não refazer ENT07–ENT12. Não executar
o portão integral como primeira atividade. No retorno: o que passou a funcionar e como
acessar; decisões; arquivos e commits; testes executados e resultados; itens não
executados; pendências; próximo ponto de continuação.
