# ENT07 — o acervo: classes de bens, depois o bem

> Pedido do operador nesta sessão (2026-09-12), na mesma instrução que vem valendo desde o
> ENT06 item 1: **construção contínua** — telas, rotas, botões de ação, execuções e módulos
> integrados —, sem parar para revisão a cada gate e fechando o que estiver pendente. O
> CLAUDE.md manda parar no gate e aguardar revisão; o operador dispensou essa parada
> explicitamente, e a dispensa fica registrada aqui em vez de virar hábito silencioso.
>
> Este pedido é escrito **antes** do lote começar, como a regra manda. A pendência
> `PEDIDOS-DE-LOTE-AUSENTES` continua aberta para as levas de §25, §26 e §27, que foram
> executadas sem arquivo de pedido — reconstruí-las depois seria escrever o que se lembra,
> não o que veio.

## O que foi pedido

Continuar a construção do sistema pela ordem que o próprio operador confirmou: fechar as
telas de 5.19 e 5.17, e seguir para protocolo e processo digital, portal do servidor, portal
do cidadão, frota, fiscalização de contratos e a frente tributária.

Deste conjunto, este lote pega **o acervo patrimonial** — o cadastro do bem e o que ele
pressupõe.

## Por que este lote vem agora, e por que ele NÃO é lote de superfície

A leva anterior (§27) entregou os três cadastros de apoio da gestão do bem — localizações,
motivos de baixa, tipos de incorporação — justamente para que a tela do bem não nascesse com
seletor vazio. Ao dimensionar a tela do bem, quatro medições mudaram a natureza do lote:

1. **`ClasseDeBens` tem ZERO registros** no banco de desenvolvimento. O formulário do bem
   precisa de `classeDeBensId` num select, e select sem chave ou sem dado nasce desabilitado
   dizendo "nenhuma opção cadastrada". O cadastro de CLASSES entra antes — é a lição do
   almoxarifado, agora com número em vez de suspeita.
2. **Nenhum serviço de domínio cria um `BemPatrimonial`.** `adquirirBem` exige
   `liquidacaoId` (o bem adquirido nasce de despesa liquidada) e `registrarEntradaAvulsa`
   recebe um `bemId` que já existe — ela registra o MOVIMENTO financeiro, não o bem. Só o
   seed da POC e três arquivos de teste criam bens, por `prisma.bemPatrimonial.create` cru.
3. **Há 1.404 contas analíticas de ativo** no PCASP semeado. `ClasseDeBens.contaContabilAtivoId`
   é obrigatória, e um select sem recorte aqui é exatamente o formulário que a regra do
   descritor descreve como bonito e inútil.
4. **`numeroTombamento` não é gerado por numerador nenhum** no repositório. Todos os sítios
   de criação o informam.

Conclusão: **lote de MODELO mais SUPERFÍCIE**, e isso vai declarado. Rebaixá-lo a superfície
seria a decisão que o CLAUDE.md diz que precisa aparecer, não acontecer.

## O que deve entrar

**Modelo e censo** (a parte de profundidade):

- `cadastrarClasseDeBens` e `cadastrarBem` como casos de uso em `modules/m10-patrimonial/`,
  com autorização cobrada dentro da transação pela própria ação;
- `CADASTRAR_CLASSE_DE_BENS` e `CADASTRAR_BEM` no censo do M16 — união, `NomeDeServico`,
  `ACAO_DO_SERVICO` e `AREA_DA_ACAO` (a classe é tabela de apoio, vai para `cadastros`; o bem
  é o acervo, vai para `patrimonio`);
- os dois valores no enum `AcaoDoSistema` do banco, em **migration aditiva**;
- teste de domínio com negação que afirma o motivo, e o papel de runtime conferido.

**Superfície** (a parte que o servidor municipal alcança):

- descritor e telas de `classes-de-bens`, com o campo de conta do ativo **recortado** às
  analíticas de classe 1;
- descritor e telas do BEM, com `classeDeBensId` e `tipoDeIncorporacaoId` em select POVOADO,
  tombamento informado pelo ente, e o detalhe lendo o eixo de gestão (estado, situação,
  localização e responsável derivam do último movimento de cada tipo);
- entrada no hub da área, na barra lateral e na busca global;
- um percurso de navegador — e ele usa `requestSubmit` mais espera em `page.url()`, nunca
  `page.click` no login (§27.3).

## O que NÃO entra, e por quê

- **A comissão patrimonial.** `cadastrarComissaoPatrimonial` recebe `membros[]`, e o molde
  não tem campo repetidor nem cresce para ganhar um. Fica para a leva do inventário, escrita
  à mão. Pendência `COMISSAO-COM-MEMBROS`.
- **A fórmula de avaliação.** Expressão editável pelo usuário tem regra própria —
  interpretador de universo fechado, nunca `eval` nem lista negra. Superfície para ela é
  decisão de desenho.
- **A rota `/patrimonio/bens`**, que já existe e é a posição patrimonial por classe, com PDF.
  O cadastro do acervo recebe rota própria: sobrepor tela existente seria trocar um
  demonstrativo por um cadastro sem que ninguém pedisse.

## O obstáculo conhecido antes de começar

`verificarDefinicao` cobra `classesDeConta` procurando o campo pelo **nome literal**
`contaContabilId`. A coluna real é `contaContabilAtivoId`, e com esse nome o guard fica mudo
— o select de 1.404 contas montaria sem nada acusar. Guarda que enumera forma acha só aquela
forma. Pendência `RECORTE-DE-CONTA-POR-NOME-LITERAL`, e este lote a encontra de frente.

## Regime de rigor

**Profundidade** para os dois casos de uso novos e para o censo: fixture N=2 onde a regra só
se manifesta em conjunto, negação que afirma o motivo, e o guard do recorte de conta provado
por mutação nas duas direções.

**Superfície** para as telas: teste de caso de uso, teste de autorização no servidor e um
percurso de navegador por família de tela.
