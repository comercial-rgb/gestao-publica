# M16 — bloco 5: a leitura é permissão, e as permissões têm versão

> Orquestração V3 (2026-09-12), pacote 4.1 e 4.2. Este bloco fecha a pendência que o
> cabeçalho de `acoes.ts` carregava desde o bloco 2 ("leituras ficam de fora, nesta fase")
> e a que a ENT10 deixou ("exigir permissão para as leituras do ente é decisão do
> operador"). A decisão foi tomada pelo pedido V3, e está em
> `docs/adr/ADR-leitura-por-acao-e-escopo.md`.

## 1. O que a ENT10 mediu e não fechou

A ENT10 fechou a URL: `?ug=` alheia passou a recusar, e exercício ilegível deixou de
virar 2026 em silêncio. Mas o escopo que ela consultava era a **união** das unidades de
todas as ações do usuário (`listarUgsDoUsuario`). O seletor do cabeçalho precisa dessa
união — "onde ele trabalha?" — e a leitura a tomava como autorização. Um crachá de
EMPENHAR na Saúde lia a Educação se qualquer outra ação do perfil alcançasse a Educação.
E fora do recorte: `exigirLeitura()` do molde era `exigirSessao()`, o dossiê do empenho
saía por id sem pergunta, e as leituras do ente validavam só o exercício.

## 2. A leitura no censo: uma ação por área

`ACOES_DE_LEITURA` — dezoito `CONSULTAR_<ÁREA>`, uma por `SlugDeArea` de
`lib/navegacao.ts`. Elas entram em `TODAS_AS_ACOES` (bootstrap, fixtures, mensagens) e em
`AREA_DA_ACAO` (o menu), e **não** entram em `ACAO_DO_SERVICO`: não há `export async
function` que as cobre. Quem as cobra é a política de leitura, e o grep-teste
`test/ui/leitura-exige-acao.test.ts` faz por elas o que `m16-censo.test.ts` faz pelas
mutações — toda tela e rota de `app/(areas)` declara a sua leitura, ou não importa porta
de dado nenhuma.

Por que uma por área e não uma por consulta: `FORA_DO_CENSO` lista mais de cem leituras.
Um rol desse tamanho ninguém administra, e o administrador concede "tudo" por atrito. A
área é o grão que o menu já usa e que o servidor reconhece.

## 3. O escopo é o da ação cobrada

`escopoDaAcaoDeLeitura(tx, identificador, acao)` (`leitura.ts`) lê as linhas de
`PermissaoDePerfil` **daquela ação**, pelos vínculos do usuário — a mesma tabela de
`autorizar`. Global se alguma linha tem `unidadeOrcId` nulo (e então devolve todas as
unidades, para a pertinência do recorte valer sem ramo especial); senão, as unidades das
linhas. Usuário inexistente ou inativo devolve escopo vazio com `ativo: false`.

A decisão é pura e mora em `lib/recorte.ts`: `exigirEscopoDoEnte`, `exigirAlgumEscopo`,
`exigirEscopoDoRegistro` e o `recorteAutorizado` que a ENT10 já tinha, agora nomeando a
ação. A porta `lib/portas/leitura.ts` junta identidade e escopo. Três níveis:

| Nível | Quando | Gate |
|---|---|---|
| ente | dado sem dimensão de unidade | `exigirLeituraDoEnte` / `telaExigeLeituraDoEnte` / `exigirLeitura` do molde |
| recorte | lista com dimensão de unidade | `recorteDePagina(sp, acao)` |
| algum escopo | caixa por participação | `exigirLeituraEmAlgumEscopo` / `telaExige...EmAlgumEscopo` |
| registro | detalhe por id | `autorizarLeituraDoRegistro(acao, unidadeDoRegistro)` |

Leitura do ente exige a concessão **global** — a mesma regra da escrita do ente. Uma soma
só das unidades autorizadas seria a visão parcial; onde a tela a oferece ela passa pelo
recorte, e nunca é apresentada como consolidado (`CONSOLIDADO-PARCIAL-NAO-EXPRIMIVEL`
continua pendente para o usuário com duas unidades e sem global).

A recusa de um registro nomeia o escopo que o usuário **tem** e não a unidade do registro.
Registro inexistente responde "inexistente" a todos.

## 4. Tela e rota, a mesma recusa

Rota: 403 com o motivo (`lib/rotas/recusa.ts`). Tela: `redirect("/sem-acesso?acao=&nivel=")`,
e a página recalcula a decisão a partir da sessão — o motivo não viaja na URL. Se a
permissão foi concedida entre a recusa e a leitura, a página diz isso e oferece o
caminho de volta.

## 5. As atualizações versionadas de permissões (4.2)

`atualizacoes-de-permissoes.ts`: uma atualização é um número de versão, uma regra pura
(`derivar(perfis, areaDaAcao)`) e um registro (`AtualizacaoDePermissoes`, versão única).
Aplicar exige `CONCEDER_ACAO_A_PERFIL`, grava o autor em cada permissão, cria o registro
na mesma transação das concessões (a unicidade da versão é a trava contra aplicação
concorrente) e recusa reaplicar — é isso que preserva uma revogação deliberada feita
depois.

A v1 (`leitura-por-area`) é a transição explícita: cada perfil recebe `CONSULTAR_<ÁREA>`
em cada área onde já tem alguma ação, **no mesmo escopo**. Transversais não derivam
leitura; perfis sem ação numa área não a ganham; perfis "somente leitura" continuam sendo
compostos à mão. A área que nenhuma mutação alcança (a transparência interna: datasets e
exports do portal) vai, global, só para os perfis com `CONCEDER_ACAO_A_PERFIL` global —
medido no banco de desenvolvimento: sem essa cláusula a v1 deixava `CONSULTAR_TRANSPARENCIA`
sem perfil nenhum, e `deriva:perfil` acusou. Instalação limpa não precisa da v1: o
bootstrap concede o censo inteiro.

Onde: Administração > Perfis (diagnóstico da deriva e as atualizações, com prévia e
botão), `npm run permissoes:atualizar -- 1` (shell, com `SEED_IDENTIDADE`), e
`npm run deriva:perfil` passou a acusar atualização pendente.

## 6. Ninguém amplia o próprio crachá

`concederAcaoAoPerfil` recusa quando quem concede está vinculado ao perfil alvo;
`concederPerfil` recusa a autoconcessão. Regra dos quatro olhos: um perfil é ampliado
por um administrador que não o tem. Para as ações novas de uma versão — que alcançam o
perfil do administrador também — o caminho é a atualização versionada. Numa instalação
de um administrador só, é ela que o atende; para o resto, cria-se um segundo.

## 6b. O registro de operação em duas fases (4.3)

`operacao.ts` deixou de gravar uma linha depois do ato e re-lançar a falha do log. Por
comando: `INICIADA` antes (fora da tx, com chave e fingerprint), `SUCESSO` dentro da
transação do fato — gravada pelo funil `lancarNoRazao` com o `lancamentoId`, via
`AsyncLocalStorage` —, `CONCLUIDA`/`NEGADO`/`ERRO` depois. A conclusão é telemetria: falhou,
o chamador recebe o resultado assim mesmo; a negação que não conseguiu ser registrada
sobe com o erro original. `INICIADA` impossível = ato não roda
(`AuditoriaIndisponivelError`). Replay por (usuário, ação, chave, fingerprint):
`ComandoJaConcluidoError`, sem repetir o fato. O login separa credencial de
infraestrutura (`ehFalhaDeCredencial`). ADR: `docs/adr/ADR-registro-de-operacao-em-duas-fases.md`.

## 6c. O contrato de comando e a reserva atômica (sessão noturna V4, 3)

Corrige os achados A01–A03 da auditoria do snapshot 77cbcc9. A decisão inteira está em
`docs/adr/ADR-contrato-de-comando-e-reserva-atomica.md`; o resumo operacional:

- `ComandoDeBorda` guarda a intenção por `(escopo, usuarioIdent, acao, chave)`, adquirida por
  INSERT sob índice único. Estados `RESERVADO` → `CONCLUIDO` | `LIBERADO`; retomada depois do
  prazo de abandono (15 min) ou de `LIBERADO`, guardada pelo `operacaoId` lido.
- O funil conclui a reserva na transação do lançamento; um ato sem lançamento chama
  `concluirComandoNaTransacao(tx, "resultado", ref)`. Reserva retomada por outro → a transação
  tardia estoura (`ComandoRetomadoError`).
- Erros nomeados: `ComandoJaConcluidoError` (replay, referência tipada, só após `revalidar`),
  `ComandoEmConflitoError` (mesma chave, outro conteúdo), `ComandoEmAndamentoError`,
  `ComandoSemChaveError` (sem `__chave` e sem `semChave` declarado).
- Fingerprint: tuplas tipadas em JSON, ordem do formulário, arquivos digeridos (`lib/portas/comando.ts`).
- Formulários: `<ChaveDeComando />` em todo `<form action={…}>` (75 formulários, 35 arquivos);
  o inventário é derivado em `test/ui/chave-de-comando.test.ts`. A pendência
  `CHAVE-DE-COMANDO-NOS-FORMULARIOS-A-MAO` fecha aqui.
- Pendência `CONCLUSAO-NA-TRANSACAO-DOS-CADASTROS`: os cadastros do molde ainda concluem a
  reserva depois da transação (a janela nomeada no ADR).

## 7. O que este bloco NÃO fez, nomeado

- `CONSOLIDADO-PARCIAL-NAO-EXPRIMIVEL` — continua recusando pedindo que escolha.
- A janela hexagonal do bloco 3 (`6.5-janela`) não muda: a leitura não escreve.
- `listarUgsDoUsuario` continua devolvendo a união — é o seletor, e o seletor pode
  oferecer uma unidade que uma tela específica recusa (o usuário empenha na Saúde e só
  consulta a Educação). A recusa nomeia o escopo; o seletor não é fronteira de segurança.
- A área pública de transparência (`app/transparencia`) segue por projeção própria, sem
  sessão e sem a porta interna — e sem esta política, de propósito.
- `CHAVE-DE-COMANDO-NOS-FORMULARIOS-A-MAO`: só o molde e o formulário de empenho mandam
  `__chave`; os outros formulários à mão passam pelo contexto do comando sem chave (sem
  replay) até serem tocados.

## Provas

`test/ui/recorte-autorizado.test.ts` (puras), `test/leitura-por-acao.test.ts` (os seis
usuários do pedido, banco sintético), `test/ui/leitura-exige-acao.test.ts` (grep),
`m16-atualizacoes.test.ts` (instalação limpa, upgrade, reaplicação, concorrência,
negação), `m16-perfis.test.ts` t12 e `m16-usuarios.test.ts` t3b (quatro olhos).

## 8. Pacote 2 — o usuário é uma pessoa do cadastro (vínculo explícito)

`servico-pessoa-do-usuario.ts`: `vincularPessoaAoUsuario` e `desvincularPessoaDoUsuario`
(ação `VINCULAR_PESSOA_AO_USUARIO`, família de administração; atualização versionada v3
deriva a concessão de quem tem `CRIAR_USUARIO`). Append-only em `VinculoUsuarioPessoa`; a
pessoa vigente é a última linha do usuário, se for VINCULO. Pelo DOCUMENTO, nunca pelo
nome; uma pessoa, um usuário; nada em `PermissaoDePerfil`. Cadastro antigo sem vínculo
fica identificado como pendente em Administração > Usuários, e a tela "meus bens" diz isso
em vez de adivinhar. Prova: `m16-pessoa-do-usuario.test.ts` (homônimos N=2, recusas
nomeadas, executor negado, vínculo não concede) e `test/acervo-pesquisa.test.ts`.
