# ENT06 item 0 — as telas das três seções do ENT05, pelo molde

> Prompt do lote como veio do chat web, 2026-09-11. Executado pela sessão do VS Code.
> O resultado do lote fica em `ESTADO-EXECUCAO.md`, não aqui: este arquivo registra o que
> foi pedido, para a revisão no gate conferir contra o pedido e não contra a memória.

---

Execute ENT06 item 0 — as telas das três seções do ENT05, pelo molde.

REGRA QUE PASSA A VALER EM TODOS OS LOTES

Uma repo, um sistema. gestao-publica é o sistema de gestão municipal. Todo
requisito que chegar é funcionalidade nova dentro dele, em módulo nomeado —
nunca sistema novo, nunca repositório novo. SIAFIC já é isso: M01 a M14 são
módulos, não produto separado. Quando um lote abrir, diga em QUE módulo o
requisito entra antes de escrever código.

ANTES DE COMEÇAR — duas coisas de ambiente

1. git remote remove doador-saas. As duas extrações previstas em
   docs/doador.md são tradução de fixture e consulta de desenho, não
   sincronização. Um remote convida um subtree pull, e um subtree pull
   reintroduz código do doador no produto.

2. Pare os containers do doador (portas 5434, 5435, 6380). O doador está
   inerte e sem node_modules; eles não servem mais. A máquina está com 9.230
   de 10.240 MB em swap, e este é um lote de superfície: next build roda a
   cada verificação e é o passo que mais pediu heap. Você mesmo mediu a
   diferença — build de 54 s contra 92 s, test:tudo de 703 s contra 1.282 s.

AGENDAMENTO DO PORTÃO

test:fuso não roda em todo portão. Roda quando o diff toca packages/datas,
guards de período, janelas de relatório ou qualquer arquivo que
data-civil.test.ts vigia — e sempre no último portão antes de encerrar o
lote. Implemente a condição lendo o diff, não por escolha manual.

Durante a construção: test:rapido. Portão completo só no fim. É agendamento,
não rigor: nada deixa de rodar antes do lote fechar.

O QUE CONSTRUIR — superfície, nenhum modelo novo

As três seções têm modelo, caso de uso e teste contra banco, e zero tela. É
o único lugar do projeto onde o molde monta sobre chão pronto.

Almoxarifado físico (5.18): material com unidades de medida, marcas
aprovadas e elementos de despesa; depósitos; entrada com lote e validade;
saída com o preço médio aplicado visível; requisição com atendimento
parcial; transferência; inventário com bloqueio de movimentação; posição de
estoque por data; relatório de validade.

Gestão do bem (5.19): bem com localização, responsável e estado; termo de
responsabilidade; movimentação; comissão de inventário com termos de
abertura e fechamento; transferência entre entidades; avaliação pela
fórmula; etiqueta com código de barras.

A compra (5.17): material com CATMAT e histórico de aquisições; requisição
de compra abrindo processo digital; pesquisa de preços; ordem de compra com
reserva, empenho e estorno em cascata; entrada em estoque ou incorporação
patrimonial.

Descritor por recurso. O que não couber no molde, você declara e escreve à
mão, como fez com o consórcio — o molde não cresce para acomodar exceção.

LIGUE AO QUE EXISTE, não recrie

Anexos do M22, campos adicionais do M25, histórico no detalhe, fila de
assinaturas do M22 para os termos de responsabilidade e de inventário,
designer do M26 para os relatórios, protocolo do M21 para a requisição de
compra. Cada um desses já tem caso de uso e teste.

PAINÉIS

Estenda o painel de pendências do ENT04 com o que estes domínios produzem e
que já é dado real: requisições aguardando atendimento, inventários abertos,
bens sem responsável, lotes vencendo no período, ordens de compra sem
entrada. Contagem sobre registro existente, critério em português na tela,
faixa some quando não há nada. Indicador sem origem real não aparece.

A MEDIDA DESTE LOTE

As 54 cláusulas em IMPLEMENTADO_NAO_VALIDADO viram VALIDADO_LOCALMENTE, mais
o que a superfície nova abrir. Cada família de tela com um percurso de
navegador — é o percurso que promove, não o descritor.

Se uma cláusula não puder ser promovida, diga qual e por quê. Promover sem
percurso seria dizer que um servidor municipal consegue usar, e o critério
que você mesmo aplicou no ENT05 é o certo.

O QUE NÃO ENTRA

Modelo novo. As cinco pendências do ENT05 — TRANSFERENCIA-DE-MATERIAL-COM-
LOTE, AJUSTE-DE-INVENTARIO-EM-LOTE, ESTORNO-FISICO-E-CONTABIL-EM-CASCATA,
EMPENHO-APONTA-PARA-ORDEM-DE-COMPRA, FONTES-DESCRICAO-STN-MSC — seguem
fechadas. As três primeiras são recusas com mensagem no código, e mensagem
clara é comportamento aceitável para um lote de superfície.

CONTINUAM VALENDO

Instrumento novo nasce com a prova de que acusa, por mutação, nas duas
direções. Menu concorda com o servidor. Rótulo em todo campo — o CPF/CNPJ
sem rótulo foi achado de smoke, não de teste, e um campo sem rótulo é uma
caixa muda para quem usa leitor de tela. Nada de botão sem handler, contador
estático ou aviso de sucesso sem persistência. Decimal, razão append-only,
período aberto no caso de uso, autorização no servidor, GET sem transição de
estado. Nenhum identificador de catálogo em tela. Sem emoji.

Marcação no catálogo só com comportamento, teste e evidência.

Atualize ESTADO-EXECUCAO.md com a contagem por natureza — este é lote de
superfície, e a medida dele é validação, não cobertura. Pare no gate.
