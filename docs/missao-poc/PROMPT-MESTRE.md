# Prompt mestre para o Claude Code - POC SIAFIC SEFIN Campina Grande/PB

Copie todo o conteúdo abaixo para o Claude Code na raiz do repositório.

---

Você está trabalhando no codebase do SIAFIC destinado à POC do **Pregão Eletrônico 330/2026 - SEFIN Campina Grande/PB**.

## Contexto confirmado pela auditoria de 18/07/2026

- Foram auditados 92 requisitos.
- 10 atendem integralmente, 54 atendem parcialmente, 21 são gaps, 2 são não aplicáveis e 5 não foram classificados.
- O principal risco de reprovação é o requisito **12.1 - SAGRES Diário + Mensal**: existem campos e de-paras, mas não existe exporter/importer executável.
- A integração Banco do Brasil está parcial: existem `modules/m09-tesouraria` e `packages/ofx`, com importação OFX, idempotência e conciliação genérica, mas não há cliente BB ponta a ponta demonstrável.
- Ativos que devem ser reaproveitados:
  - `packages/ledger/*`: partidas dobradas, append-only e estorno por reversão;
  - `modules/m01-core-contabil/razao.ts`: funil central de lançamentos;
  - `modules/m12-relatorios/consistencia*.ts`: validações contábeis e constitucionais;
  - `modules/m09-tesouraria` e `packages/ofx`: extrato, idempotência e conciliação;
  - `prisma/schema/_base.prisma`: inbox/outbox inicial;
  - `modules/m16-travamento`: autorização, segregação por UG, travamentos e auditoria;
  - `modules/m14-exports-federais`: padrão de exports já testados.
- `npm run typecheck`, `npm run typecheck:app` e `npm run prisma:validate` passaram na auditoria.
- A suíte geral não está verde: 645/1.049 testes passaram e 404 falharam. Não atribua falhas preexistentes às novas mudanças e não tente corrigir os 404 testes fora do escopo sem antes isolar o baseline.

## Objetivo desta missão

Implementar uma **vertical slice auditável e demonstrável** para provar, durante a POC, estas seis capacidades:

1. **SAGRES 2026:** gerar arquivos TXT diário e mensal conforme o layout oficial vigente;
2. **SAGRES Captura 2.0:** gerar JSON válido e deixar a transmissão real pronta para ativação por credenciais;
3. **API TCE-PB:** consultar dados reais quando houver token e demonstrar hoje com fixtures contratuais explícitas;
4. **API Banco do Brasil:** consultar extrato/saldo e preparar pagamento/transferência conforme as APIs já existentes no projeto;
5. **Contabilização automática:** transformar movimentação bancária ou retorno de integração em lançamento contábil pelo funil oficial do razão;
6. **Validação e log:** validar dados antes do envio e registrar toda a operação, sem fabricar sucesso externo.

O resultado não pode ser apenas schema, interface TypeScript, tela estática, JSON ilustrativo ou botão sem serviço executável. Cada capacidade precisa ter **rota/tela + serviço real + persistência quando aplicável + teste + evidência gerada**.

## Fontes oficiais obrigatórias

Antes de codificar o layout, consulte e registre no código/README a versão e a data das fontes oficiais:

- SAGRES Captura - layouts oficiais: `https://tce.pb.gov.br/layout-sagres-2/`
- SAGRES Contabilidade 2026, versão 1.1 de 12/12/2025: `https://docs.tcepb.tc.br/books/dados-da-contabilidade/page/versao-11-12122025`
- Catálogo oficial de APIs: `https://docs-api.tce.pb.gov.br/`
- Documentação SAGRES Captura 2.0: `https://docs.tcepb.tc.br/shelves/sagres-captura-20`
- Apresentação TCE-PB de 09/07/2026: `https://tce.pb.gov.br/wp-content/uploads/2026/07/SAGRES-Captura-2.0.pdf`

Não invente campos, posições, domínios, endpoints ou respostas. Se a documentação não estiver acessível no ambiente, implemente somente o que puder ser comprovado pelo material já versionado no repositório e marque o restante como bloqueado, indicando precisamente a fonte que falta.

## Regra central de arquitetura

Crie um **modelo canônico interno** da integração contábil e adaptadores separados para cada protocolo:

```text
Dados do SIAFIC/razão
        |
        v
DTO canônico versionado
   |         |          |
   v         v          v
TXT 2026   JSON 2.0   consultas TCE
        
API BB -> normalização bancária -> regras contábeis -> razao.ts
```

Não duplique regra de negócio entre TXT e JSON. A extração do SIAFIC, a normalização e as validações de domínio devem ser compartilhadas; somente serialização e transporte devem variar.

Use os padrões existentes no repositório. Antes de criar pastas, procure convenções equivalentes em `modules/m14-exports-federais`, `modules/m09-tesouraria`, `packages/ledger`, rotas do Next.js, schemas Prisma e testes. Não reescreva componentes que já funcionam.

## Modos de execução obrigatórios

Toda integração externa deve operar com um modo explícito:

- `MOCK`: fixtures locais, sem chamada externa;
- `SANDBOX`: ambiente de homologação oficial;
- `LIVE`: ambiente real autorizado.

Regras:

- O modo deve aparecer com destaque na UI e nos logs.
- `MOCK` nunca pode exibir status “Transmitido ao TCE”, “Recebido pelo Banco” ou equivalente. Use “Simulação concluída”.
- Uma transmissão só pode ser marcada como aceita quando houver resposta externa válida, identificador/recibo e data/hora.
- A troca de `MOCK` para `SANDBOX` ou `LIVE` deve exigir apenas configuração segura/credenciais, sem alteração de código.
- Tokens, secrets, certificados, contas e dados bancários não podem aparecer em logs, fixtures, screenshots ou respostas de API.
- Não criar fallback silencioso de `LIVE` para `MOCK`.

## Escopo técnico por capacidade

### 1. SAGRES 2026 - TXT diário e mensal

Implemente um gerador executável e versionado do layout 2026 v1.1.

Requisitos mínimos:

- arquivos texto em UTF-8, sem BOM, com largura fixa e preenchimento exatamente conforme a documentação;
- nomes oficiais por periodicidade:
  - diário: `[codUG][ddmmaaaa][NomeArquivo].txt`;
  - mensal: `[codUG][mmaaaa][NomeArquivo].txt`;
  - anual: `[codUG][aaaa][NomeArquivo].txt`;
- valores, inteiros, datas, espaços para campos opcionais e posições inicial/final conforme layout oficial;
- serialização determinística: o mesmo conjunto de dados deve produzir os mesmos bytes;
- pacote ZIP opcional com manifesto, versão do layout, competência, UG, arquivos, quantidade de registros e SHA-256;
- pré-visualização de registros e download individual ou em lote;
- validação antes da geração final.

Implemente primeiro uma vertical slice coerente, cobrindo ao menos:

- `UnidadeOrcamentaria`;
- `Dotacao`;
- `Empenhos`;
- `Liquidacao`;
- `Pagamentos`;
- `EstornoPagamento`;
- `Retencao`;
- `ReceitaOrcamentaria`;
- `DespesaExtra`;
- `CadastroContaBancaria`;
- `SaldoMensal`;
- `ConciliacaoBancaria`;
- `MovimentacaoEntreContasBancarias`.

Se uma entidade ainda não tiver dados suficientes no modelo atual, não gere linha vazia falsa. Exiba “não suportada por ausência de origem” e registre o campo/modelo faltante na matriz de cobertura.

Crie uma registry declarativa por versão do layout, com nome da entidade, periodicidade, campos, posição inicial/final, tipo, tamanho, obrigatoriedade, origem e função de transformação. Evite dezenas de `substring` e concatenações dispersas.

### 2. SAGRES Captura 2.0 - JSON e transmissão

O Captura 2.0 substitui gradualmente o TXT por schemas JSON e comunicação máquina a máquina. Implemente:

- DTOs/schemas locais derivados das fontes oficiais e com versão registrada;
- geração de JSON determinística a partir do mesmo modelo canônico usado pelo TXT;
- validação local do payload antes do transporte;
- cliente de autenticação separado do cliente de submissão;
- transport interface com implementações `Mock`, `Sandbox` e `Live`;
- idempotency key/correlation ID por submissão;
- registro do request sanitizado, hash do payload, status HTTP, recibo externo, erros de validação e tentativas;
- tratamento de validação assíncrona, com consulta de status quando previsto pela API oficial;
- nenhuma suposição de endpoint: use apenas o catálogo/documentação oficial.

Em `MOCK`, utilize fixtures que obedeçam ao schema real. Inclua ao menos os cenários: aceito, rejeitado por campo, não autorizado, timeout e indisponibilidade.

### 3. API TCE-PB - consultas

Não confunda a API de consulta do SAGRES vigente com a API de submissão do Captura 2.0. Modele gateways separados.

Implemente, conforme endpoints oficiais disponíveis:

- autenticação por configuração segura;
- consulta por UG e período;
- limite de período de até 31 dias quando aplicável à API vigente;
- paginação, timeout, retry apenas para operações seguras, circuit breaker simples e mensagens de erro úteis;
- normalização do retorno para consultas de orçamento, empenho, liquidação, pagamento, receita, restos/envios ou somente os recursos efetivamente documentados;
- armazenamento opcional de snapshot/hash para prova de consulta, sem duplicar a fonte oficial;
- tela que compare “dados locais” versus “dados retornados pelo TCE”, destacando divergências.

Sem token, a tela deve executar fixtures contratuais e exibir claramente `MODO MOCK`. Com token, deve haver botão de teste de conectividade e consulta real sem mudança de código.

### 4. API Banco do Brasil

Primeiro localize o cliente/API BB já existente e documente o que ele realmente suporta. Não substitua a integração real por OFX; OFX pode permanecer como fallback explícito de importação, não como prova de API.

Crie uma interface bancária orientada a capacidade, por exemplo:

- `testConnection`;
- `listAccounts` quando suportado;
- `getBalance`;
- `getStatement` por período;
- `getTransaction` quando suportado;
- `createPayment` somente se a API contratada suportar;
- `createTransfer` somente se a API contratada suportar;
- `getOperationStatus`.

Para cada método, marque `SUPPORTED`, `NOT_CONTRACTED` ou `NOT_IMPLEMENTED`. Não crie falsa cobertura.

Implemente:

- normalização das transações BB para o modelo bancário interno já usado por OFX/conciliação;
- idempotência por identificador bancário + conta + data + valor;
- consulta de extrato e saldo;
- identificação de transferência entre contas da mesma UG;
- geração/armazenamento do extrato destinado ao TCE, inclusive a nomenclatura oficial quando aplicável;
- mascaramento de agência/conta na UI e nos logs;
- mock contratual com fixtures derivadas do formato real da API utilizada pelo projeto;
- adapters `Mock`, `Sandbox` e `Live` selecionados por configuração.

Operações financeiras reais devem exigir confirmação explícita, perfil autorizado e ambiente não mock. Em POC, deixe pagamento/transferência em `DRY_RUN` por padrão.

### 5. Contabilização automática

Use obrigatoriamente `modules/m01-core-contabil/razao.ts` e `packages/ledger/*` como funil de escrituração. Nenhuma integração pode gravar partidas diretamente no banco ignorando o motor contábil.

Implemente o fluxo:

1. importar/consultar movimentação bancária;
2. normalizar;
3. aplicar regra de parametrização por UG, conta bancária, histórico, natureza, documento, sinal e contraparte;
4. apresentar prévia do lançamento;
5. validar competência, travamento, saldo, conta PCASP e autorização;
6. contabilizar pelo razão;
7. vincular transação bancária, regra aplicada e lançamento contábil;
8. conciliar;
9. impedir duplicidade;
10. permitir estorno pelo mecanismo oficial, nunca por exclusão.

Cubra na POC ao menos três casos:

- receita orçamentária identificada no extrato;
- pagamento de despesa previamente empenhada e liquidada;
- transferência entre duas contas bancárias da mesma UG, sem duplicar receita/despesa.

Exija aprovação humana quando a regra não alcançar nível de confiança determinístico. Não use IA generativa para escolher conta contábil ou efetuar lançamento automaticamente.

### 6. Validação, rastreabilidade e log

Reaproveite `modules/m16-travamento` e a estrutura inbox/outbox existente. Crie ou complete uma entidade de execução de integração, sem duplicar o que já houver, contendo no mínimo:

- ID interno;
- correlation ID/idempotency key;
- UG;
- competência/período;
- integração e operação;
- modo `MOCK`, `SANDBOX` ou `LIVE`;
- versão do layout/schema;
- usuário solicitante;
- datas de início e fim;
- status interno;
- hash SHA-256 do payload/arquivo;
- contagem de registros;
- recibo/ID externo quando existir;
- tentativas;
- erros estruturados e sanitizados;
- referência ao lançamento e à conciliação quando aplicável.

Estados sugeridos:

`DRAFT -> VALIDATING -> VALIDATED -> READY -> SUBMITTING -> ACCEPTED | REJECTED | FAILED`

Para mock use um terminal distinto, como `SIMULATED`, e nunca `ACCEPTED`.

As validações SAGRES devem cobrir, no mínimo:

- tamanho e posição;
- tipo de dado;
- campo obrigatório;
- domínio oficial;
- chave e duplicidade;
- integridade referencial entre empenho, liquidação e pagamento;
- competência e UG;
- totalizadores e reconciliação com o razão;
- conta bancária e movimentação;
- consistência entre arquivos do mesmo pacote.

## Central de Integrações para a POC

Crie uma área autenticada chamada **Central de Integrações SIAFIC**, respeitando os componentes visuais existentes, com:

### Cabeçalho

- UG selecionada;
- competência/período;
- ambiente/mode destacado;
- versão do layout SAGRES;
- status das credenciais TCE e BB sem revelar secrets.

### Seis cartões operacionais

1. SAGRES 2026 TXT;
2. Captura 2.0 JSON;
3. Consultas TCE-PB;
4. Banco do Brasil;
5. Contabilização automática;
6. Validações e histórico.

### Jornada demonstrável

- selecionar UG e competência;
- escolher uma massa de dados POC versionada;
- gerar e validar pacote diário e mensal TXT;
- abrir prévia monoespaçada de um arquivo e baixar o ZIP/manifesto;
- gerar o JSON equivalente do Captura 2.0;
- simular submissão e exibir que foi `SIMULATED`, não transmitido;
- consultar dados TCE em mock contratual ou ambiente real quando houver token;
- consultar extrato BB em mock contratual ou ambiente real quando houver token;
- selecionar movimentação, visualizar regra e prévia das partidas;
- contabilizar, conciliar e mostrar o vínculo com o razão;
- abrir o histórico completo, hashes, validações e recibos.

Nenhum botão pode ser decorativo. A UI deve consumir serviços/rotas reais do projeto.

## Massa de demonstração

Crie fixtures/seeds determinísticos para uma UG fictícia claramente identificada como POC. Não use dados pessoais ou bancários reais.

A massa deve conter uma história contábil encadeada:

- LOA/dotação suficiente;
- um empenho;
- uma liquidação;
- um pagamento;
- uma retenção, se suportada pelo fluxo atual;
- uma receita orçamentária;
- duas contas bancárias da mesma UG;
- uma transferência entre essas contas;
- transações de extrato correspondentes;
- um erro proposital de validação corrigível para demonstrar o validador.

## Testes obrigatórios

Adicione testes novos e focados, sem esconder o baseline quebrado:

- unitários para formatação de cada tipo de campo;
- golden files byte a byte para TXT;
- snapshots/fixtures contratuais para JSON;
- validação contra schema quando disponível;
- contrato dos transports mock/sandbox/live;
- idempotência de consulta/importação/transmissão;
- contabilização dos três casos da POC;
- transferência entre contas sem gerar receita/despesa indevida;
- segurança: segregação por UG, autorização e redaction;
- integração da rota ao serviço;
- E2E mínimo da jornada da Central de Integrações.

Golden file não deve ser atualizado automaticamente para fazer teste passar. Toda alteração precisa ser revisada contra a fonte oficial do layout.

Execute os testes novos isoladamente e também os comandos que já passavam:

- `npm run typecheck`;
- `npm run typecheck:app`;
- `npm run prisma:validate`;
- testes novos por arquivo/suite.

Execute a suíte geral somente para comparar com o baseline. Informe separadamente: falhas preexistentes, falhas novas e eventuais testes corrigidos por efeito legítimo da implementação.

## Artefatos de prova da POC

Ao final, gere em diretório versionável de evidências, usando a convenção existente do repo:

- `README-POC.md` com roteiro de demonstração de 8 a 12 minutos;
- matriz requisito -> tela -> rota -> serviço -> schema/tabela -> teste -> evidência;
- pacote TXT diário;
- pacote TXT mensal;
- JSON Captura 2.0;
- manifesto com SHA-256;
- exemplo sanitizado de consulta TCE;
- exemplo sanitizado de extrato BB;
- exemplo de contabilização e conciliação;
- relatório de validação com um caso aceito e um rejeitado;
- histórico/log sanitizado;
- lista de variáveis de ambiente, sem valores secretos;
- lista objetiva do que depende de token/contratação externa.

## Definition of Done

Só classifique uma capacidade como atendida quando houver evidência ponta a ponta.

### SAGRES TXT pronto

- arquivo real gerado a partir do banco/seed;
- layout e nome validados;
- teste golden byte a byte;
- download pela UI;
- log e hash.

### Captura 2.0 pronto para credencial

- JSON real gerado do mesmo DTO canônico;
- schema validado;
- transport implementado;
- mock contratual claramente sinalizado;
- configuração sandbox/live sem mudança de código;
- status/recibo tratados.

### API TCE pronta para credencial

- cliente real implementado conforme documentação;
- token apenas por configuração segura;
- conectividade e consulta real ativáveis sem alteração de código;
- fixture contratual e testes;
- comparação local x TCE.

### API BB pronta para credencial

- cliente existente localizado e integrado, ou gap documentado com precisão;
- extrato/saldo normalizados;
- dry-run de pagamento/transferência quando suportado;
- fixture contratual e testes;
- nenhuma credencial exposta.

### Contabilização automática pronta

- usa o funil `razao.ts`/ledger;
- prévia, aprovação, lançamento, vínculo, conciliação e estorno;
- idempotência comprovada;
- três cenários da POC testados.

### Auditoria pronta

- execução persistida;
- modo claramente registrado;
- arquivo/payload com hash;
- erros estruturados;
- recibo externo somente quando verdadeiro;
- rastreabilidade até usuário, UG e lançamento.

## Forma de trabalho

1. Leia `AGENTS.md`, instruções do repositório e os módulos citados.
2. Faça uma inspeção inicial e entregue um plano curto com os arquivos reais que serão reutilizados e alterados.
3. Não pare no plano: implemente a vertical slice por fases, começando pelo SAGRES TXT diário/mensal, pois é a trava da POC.
4. Preserve mudanças existentes e não faça refatorações amplas fora do escopo.
5. Faça migrations compatíveis com o padrão existente e sem perda de dados.
6. Após cada fase, rode testes focados e typecheck.
7. Não declare cobertura com base somente em schema, interface ou mock.
8. Registre limitações honestamente. A ausência de token externo deve resultar em “pronto para credencial + mock contratual”, não em “integração real concluída”.
9. Ao terminar, apresente:
   - resumo do que ficou funcional;
   - arquivos principais alterados;
   - comandos/testes e resultados;
   - evidências geradas;
   - gaps restantes;
   - roteiro exato da POC;
   - tabela “antes x depois” para os requisitos 12.1, 12.2, 7.3, 6D.2, 6D.3, 6D.4, 7.14 a 7.17, 7.29, 7.31 a 7.33, 7.44, 7.45 e 7.47, ajustando os IDs à matriz real do repositório.

Prioridade absoluta: **uma demonstração executável, honesta e rastreável do fluxo SAGRES diário/mensal, seguida da prontidão técnica das integrações TCE-PB e Banco do Brasil para ativação imediata quando as credenciais reais forem fornecidas.**

