# M19 — Pessoas (cadastro único) e representação

O cadastro compartilhado que a despesa, as consignações, a folha e o protocolo usam: uma `Pessoa`
por documento (CPF ou CNPJ, com dígito verificador conferido), versões append-only (`VersaoDePessoa`,
alterar cria versão com motivo) e papéis como movimentos (`MovimentoDePapelDaPessoa`).

## A representação — V6.2 P3 (`representacao.ts`)

Quem age em nome de outra pessoa pela carta de serviços o faz por `RepresentacaoDePessoa`: a CONTA de
uma pessoa física (vínculo usuário → pessoa do M16), a pessoa representada, o documento que
fundamenta e a vigência. O papel `REPRESENTANTE` diz que alguém PODE representar; não diz quem, por
qual ato nem até quando.

- **Recusas nomeadas:** `REPRESENTANTE-SEM-CONTA-ATIVA`, `REPRESENTANTE-SEM-PESSOA`,
  `REPRESENTANTE-NAO-E-PESSOA-FISICA`, `REPRESENTACAO-DE-SI-MESMO`, `REPRESENTACAO-JA-REVOGADA`,
  `REVOGACAO-ANTES-DO-INICIO`.
- **Vigência derivada, nunca coluna** (`representacaoVigenteEm`, dia civil do ente): início, fim e
  revogação com data de efeito. Revogada, a conta não protocola, não acompanha e não baixa documento
  da representada; o que foi protocolado continua registrado com a representação usada.
- **A proposta de alteração cadastral** (`PropostaDeAlteracaoCadastral`) guarda o que o requerente
  quer mudar e a versão base; só a decisão de deferir, no M21, cria a versão nova.

Ação: `REGISTRAR_REPRESENTACAO` (registrar e revogar). Tela: `/cadastros/representacoes`, com
seletores referenciados `pessoas` e `contas-com-pessoa-fisica`. Testes: `m21-carta.test.ts` t9–t11,
`test/carta-de-servicos.test.ts` t4.

Pendências: `REPRESENTACAO-POR-ESCOPO` (a representação vale para todos os serviços da carta; poderes
por tipo de ato não existem), `REPRESENTACAO-ANEXO-DO-FUNDAMENTO` (o fundamento é texto; o documento
digitalizado não é anexado).
