# Ordem V11 V9.2 — executar a jornada do 13o e a J9 da receita

Recebida em 2026-09-23, sobre o HEAD efetivo `1a2fb5a`. Guardada como veio, antes de comecar,
conforme `CLAUDE.md` ("Guarde o pedido de cada orquestracao em `docs/lotes/`").

Continuacao da ordem guarda-chuva `V11-motores-folha-contabilidade-esocial-e-aws.md`. As duas
rodadas anteriores desta mesma ordem (V9 — receita com entidade arrecadadora; V9.1 — o 13o em
duas parcelas e a recuperacao da verificacao) estao relatadas nas secoes 84 e 85 do
`ESTADO-EXECUCAO.md`.

---

## O pedido, na forma em que chegou

Continue o gestao-publica a partir do HEAD efetivo, relatado em 1a2fb5a. Objetivo: executar a
jornada do 13o e a J9 da receita, corrigindo apenas os impedimentos e defeitos encontrados.

Ate dois agentes totais:
- gerente full stack/integrador: ambiente, build e integracao;
- auxiliar funcional: roteiro, execucao e correcoes das jornadas.

Uma execucao pesada por vez. Preserve processos de outros produtos, stash, scripts do operador,
bancos e trabalho das demais worktrees. Sem push, publicacao, suites completas, fuso completo ou
portao.

### 1. IDENTIFICAR O BLOQUEIO REAL DO BUILD

Confira a execucao mais recente: comando, processo, log, termino, sinal e etapa da falha. Nao
atribua o bloqueio ao heap apenas porque o typecheck anterior sofreu OOM.

Inspecione a versao instalada do Next e sua configuracao. Identifique onde ocorre a conferencia de
tipos e quais processos recebem as opcoes de memoria. Consulte a documentacao dessa versao se
necessario, sem atualizar dependencias.

Ajuste somente o necessario, com limite compativel com a maquina. Nao desabilite a conferencia de
tipos nem configure ignoreBuildErrors. Nao volte a modificar o trinco: a causa anterior foi
corrigida no diagnostico e deve permanecer assim.

Nos comandos de verificacao, preserve o codigo de saida real. Imprimir o resultado nao pode
substituir sua propagacao.

### 2. PREPARAR UM CANDIDATO PARA OS PERCURSOS

Confira as worktrees existentes antes de escolher o ambiente. Nao crie a decima oitava
automaticamente.

Use banco sintetico dedicado, configuracao identificada e runtime da aplicacao. Registre commit,
estado do diff e identidade do servidor para nao testar uma aplicacao antiga.

Se o build continuar inviavel exclusivamente por recursos:
- nao repetir a mesma execucao sem mudanca concreta;
- avaliar se o servidor de desenvolvimento permite verificar as jornadas com fidelidade suficiente;
- se utilizado, identificar a evidencia como percurso em desenvolvimento, mantendo build de
  producao e prontidao de release pendentes.

Nao apresentar percurso em desenvolvimento como publicacao validada.

### 3. EXECUTAR O ROTEIRO DO 13o

Localize o roteiro de quinze passos ja guardado. Distinguir roteiro escrito de automacao
executavel: aproveitar o que existe, completar somente o necessario e executar pela interface.

Percurso minimo:
- configurar parametro e ato aplicavel no ambiente sintetico;
- cadastrar a rubrica de abatimento pela tela;
- recusar sua classificacao incompativel;
- preparar e calcular a primeira parcela;
- conferir avos, base, percentual, memoria e contracheque;
- fechar, certificar e apropriar pelas acoes existentes;
- preparar e calcular a parcela final;
- conferir a origem e o valor do abatimento;
- conferir memoria, contracheque e integracoes;
- repetir a acao pertinente sem duplicar efeito.

Use valores esperados calculados independentemente do motor.

Antes de afirmar que a parcela final desconta o que foi pago: rastreie qual fato torna o
adiantamento elegivel ao abatimento. Diferencie calculado, fechado, empenhado, liquidado e pago.
Confronte o comportamento com a regra aplicavel ja documentada.

Inclua um caso em que o adiantamento existe, mas ainda nao chegou ao estado exigido, e outro com
cancelamento/estorno pertinente. Nao invente pagamento para fazer o cenario passar. Nenhuma ordem
bancaria ou pagamento externo nesta rodada.

Confirme que alterar parametros nao modifica silenciosamente a memoria ja fechada e que outro
operador sem permissao e recusado.

### 4. EXECUTAR A J9 DA RECEITA

Use o roteiro existente e as capacidades realmente entregues: declaracao versionada de
titularidade, arrecadacao identificada, consulta e estorno.

Conferir pela interface e persistencia:
- vinculo valido e opcao explicita quando necessaria;
- historico sem atribuicao preservado;
- mudanca de titularidade sem reescrever arrecadacao anterior;
- estorno herdando a identificacao do fato original;
- repeticao sem duplicidade;
- recusa fora do escopo autorizado.

Nao ligar a apuracao de superavit nesta rodada. Preserve as cinco lacunas identificadas para essa
integracao.

### 5. CORRIGIR E CONCLUIR

Defeito encontrado deve receber correcao no contrato responsavel, teste dirigido e repeticao
somente do trecho afetado da jornada. Nao abrir campanha de guards ou mutacoes.

Conferir tambem se os acessos recem-expostos na landing levam as telas corretas e respeitam as
permissoes existentes.

Atualize o catalogo segundo a evidencia efetiva. Nao promova a clausula inteira por um percurso que
cobre apenas parte de seus criterios. Registre o alcance validado e o que ainda falta.

### ENTREGA

Comece com URL/local real, papel e acoes que foram executadas. Informe candidato, modo de execucao,
resultado dos dois percursos, defeitos corrigidos e pendencias restantes.

Se houver bloqueio, informe o ponto exato e a evidencia. Nao encerrar apenas dizendo que o roteiro
esta escrito.

---

## Restricoes permanentes que continuam valendo nesta rodada

Vindas das ordens anteriores e nao revogadas por esta:

- Preservar o `stash@{0}` sem aplicar nem remover.
- Nao executar, versionar nem remover os tres scripts do operador (`scripts/fix-claude-cli.sh`,
  `scripts/fix-cursor-extensao.sh`, `scripts/manter-claude-cursor.sh`).
- Nao usar `git add .` para consolidar trabalho.
- Sem push, mensagens reais, pagamentos, transmissao fiscal/eSocial, importacao de dados produtivos
  ou alteracao de infraestrutura de outros produtos.
- Nao apagar `gestao_publica_instalacao_v7m2_v85`.
- Nao remover worktrees ou bancos para liberar recursos sem verificar propriedade, finalidade e
  conteudo.
- Nao contornar uma ferramenta que recusa por shell, outro agente ou outro mecanismo.
