# Auditoria do snapshot 77cbcc9 — Gestão Pública

**Base examinada:** `77cbcc92c569085645025e104b68b8c3882ff0d7`  
**Referência anterior:** `dc7032a12c7490781ffbdca6958eb3fbf422fe48`  
**Trabalho separado:** stash `11b7892e7800281f3ef915ee571a967b9383401b`  
**Data da auditoria:** 13/09/2026

## Parecer executivo

O pacote permite confirmar a identidade do código local, independentemente de ele não estar publicado no GitHub. A evolução não foi um reinício do produto: há implementação real de controles de leitura, atualização de permissões, composição patrimonial, documentos e percursos.

A recomendação é **continuar no repositório atual**, corrigindo primeiro as garantias transversais de comando e o cálculo patrimonial que sustentam as operações seguintes. Não recomendo reiniciar a aplicação, repetir todo o inventário, nem declarar pronta a suíte municipal completa.

A avaliação é dirigida ao incremento V3, ao stash e à qualidade das evidências. Não é uma certificação dos 2.037 itens, nem um pentest completo, nem uma homologação contábil, fiscal ou operacional.

## 1. Cadeia de custódia e verificações executadas aqui

| Verificação | Resultado independente |
|---|---|
| SHA-256 do arquivo recebido | `5798e711d8d0e585526c248dac6113588a7341a6cc3b9660c92a4a5ec8c7a29a` — confere |
| Arquivos cobertos por SHA256SUMS | 31/31 conferem |
| Entradas do tar externo | 40 entradas substantivas e 40 entradas AppleDouble `._` do macOS |
| Árvore interna | 1.659 entradas; 1.284 arquivos regulares; extração com verificação de caminhos |
| Commits do incremento | 10 objetos de commit, encadeados entre a base e o HEAD informados |
| Árvore Git da base | `668a83f8cfa5a01d5811fa189af2282957feaeb3` |
| Árvore Git do HEAD | `77044b4f4cc40b0615c235cb16c3e5a2c13c8b58` |
| Bundle | `git bundle verify` executado nesta auditoria: **is okay** |
| Stash extraído dos objetos × diff fornecido | Idênticos byte a byte |
| Aplicabilidade sobre o HEAD | `git apply --check` passa |
| Aplicação para inspeção | Realizada somente em uma segunda cópia descartável da auditoria |
| Repositório do operador | Não acessado nem alterado por esta auditoria |

O bundle é incremental e depende da base. A árvore anterior foi reconstruída revertendo os dez patches em uma cópia; seus objetos foram calculados e confrontados com a árvore do commit-base obtido no GitHub. O objeto exato do commit-base foi reconstruído a partir desses dados e seu hash conferido; com essa base, a verificação do bundle passou. Não foi inventado um commit substituto.

A árvore excluída de `doador/` mantém o identificador `a0bd45588bcefe3fece4cf468fa71b5805daef18`. Inserindo essa referência na árvore reconstruída, os hashes completos de base e HEAD coincidem com os commits.

**Pequena correção do manifesto:** o bundle incremental preserva a referência à árvore inalterada do doador, mas seus objetos não estão materializados neste pacote. A frase “continua nos objetos do bundle” não deve ser interpretada como um backup autossuficiente do doador. Isso não impediu validar o incremento nem o stash. Não foi realizado `git fsck` de toda a história e de todos os objetos antigos.

## 2. Escopo de execução: o que foi e não foi testado

### Executado nesta auditoria

- Hashes, reconstrução e comparação de árvores/commits.
- Verificação real do bundle.
- Comparação do stash e aplicação em cópia separada.
- Contagem programática do catálogo.
- Leitura dirigida de serviços, portas, migrations, testes e evidências.
- Dez observações executáveis em Node v22.16.0, carregando os arquivos TypeScript originais, sem modificá-los: três comportamentos corretos confirmados e sete fragilidades reproduzidas.

O harness usa portas em memória. **Não usa PostgreSQL, não efetua pagamento e não demonstra, por si só, duplicação de um fato financeiro real no banco.** Ele prova o comportamento do envelope e da função de fingerprint; as regressões de integração devem ser adicionadas pelo executor.

### Não executado nesta auditoria

`npm install/ci`, suíte Vitest oficial, typechecks completos, migrations em PostgreSQL, `test:tudo`, `test:fuso`, `next build`, percursos de navegador ou testes de infraestrutura externa. O ambiente não dispõe das dependências instaladas e do banco da aplicação. Os testes e percursos mencionados no manifesto do executor permanecem **resultados relatados**, não reexecutados aqui. Seus logs brutos não integram o snapshot.

O protocolo não atribui ao autor do código uma certeza de funcionamento baseada em sua própria documentação.

## 3. Avanços confirmados no código

### 3.1 Leitura por ação e escopo

`modules/m16-travamento/leitura.ts:35–79` consulta permissões com `where: { acao }`; a concessão global pertence à ação consultada. A união de todas as ações deixou de ser a autorização desse caminho.

`lib/portas/empenho.ts:385–405` obtém a unidade do empenho e chama `autorizarLeituraDoRegistroPara(..., "CONSULTAR_DESPESA", ...)` antes de compor o dossiê.

`lib/portas/molde.ts:107–109` exige ação de leitura explicitamente. O achado antigo “nome de autorização com corpo de autenticação” foi corrigido nesse componente.

Isto é constatação de código, não conclusão de que todo endpoint do produto foi auditado.

### 3.2 Resposta verdadeira em falha de log posterior

O envelope agora preserva o resultado do ato quando falha a gravação de `CONCLUIDA`. Também conserva o erro original quando o registro da negação falha. A indisponibilidade do registro inicial impede executar o callback.

Os três comportamentos foram **reproduzidos positivamente** pelo harness desta auditoria.

`modules/m01-core-contabil/razao.ts:146–151` grava o sucesso autoritativo utilizando a mesma transação do lançamento. Isso corrige uma parte relevante do problema anterior, mas não encerra toda a idempotência.

### 3.3 Patrimônio e documentos

Há código para os vínculos usuário–pessoa, pesquisa do acervo, parâmetros versionados, memória de cálculo, análise de estorno, termos e etiquetas. A existência desses componentes não é apenas declarada no checkpoint.

As ressalvas a seguir dizem respeito à semântica, às garantias e à extensão da entrega — não à inexistência desses componentes.

## 4. Achados prioritários

### A01 — O envelope não garante execução única concorrente

**Prioridade:** P0 para expansão de comandos que dependam dessa garantia.  
**Evidência:** execução R1; `modules/m16-travamento/operacao.ts:299–319`.  
**Reprodução:** duas chamadas simultâneas, com mesmo usuário, ação, chave e fingerprint, executaram o callback **duas vezes**, retornando `fact-1` e `fact-2`.

A consulta à conclusão anterior e o registro de `INICIADA` não constituem uma reserva atômica. A migration `20260912210508_v3_operacao_em_duas_fases/migration.sql` cria um índice de busca, não uma garantia única de posse do comando.

Constraints de operações específicas podem impedir certas duplicidades. Não foram testadas aqui; não substituem uma garantia geral que o envelope promete entregar.

**Correção indicada:** identidade persistente do comando e aquisição atômica em PostgreSQL, com escopo, estado e conclusão. Sucesso autoritativo/resultados relacionados devem acompanhar o fato na transação efetiva. Validar com conexões distintas, não apenas duas Promises sobre uma porta fake.

### A02 — Replay ainda tem lacunas de persistência, semântica e autorização

**Prioridade:** P0/P1, conforme o efeito do comando.  
**Evidência:** execuções R2, R3 e R4.

- Ato não financeiro concluído, mas `CONCLUIDA` indisponível: duas tentativas executam dois callbacks. O sucesso do funil contábil não cobre automaticamente os cadastros que não passam por esse funil.
- Sequência A → B → A, mesma chave, payloads distintos: três execuções. Mesmo adotando a interpretação atual de “payload distinto é outro comando”, procurar apenas a última conclusão perde a proteção da primeira repetição de A.
- Replay é tratado antes do callback de negócio. Depois de revogar a autorização desse callback, a repetição devolveu `ComandoJaConcluidoError` com a referência anterior, sem verificar novamente essa autorização. A verificação de sessão na borda não resolve a revogação de ação/escopo.

**Decisão proposta para simplificar:** uma chave identifica uma intenção imutável. Mesma chave e payload diferente resulta em conflito de comando; nova intenção recebe nova chave. A repetição autorizada devolve o mesmo resultado estável. Revalidar ação, escopo e acesso à referência antes de revelar o replay.

### A03 — O fingerprint não representa inequivocamente o comando

**Prioridade:** P1.  
**Evidência:** execuções R5/R6; `lib/portas/comando.ts:39–48`.

- Arquivos diferentes são ignorados e produzem o mesmo fingerprint.
- O formato `nome + NUL + valor`, juntado por SOH, aceita duas estruturas distintas com a mesma representação.
- A ordenação indiscriminada também precisa respeitar campos repetidos cuja ordem tenha significado.

**Não é uma colisão criptográfica de SHA-256.** É uma colisão na codificação anterior ao hash.

**Correção:** serialização tipada e sem ambiguidades, preservação da ordem onde for semântica, hash dos bytes de anexos ou de referências imutáveis já verificadas; remover apenas metadados de transporte declarados. Não registrar senhas ou tokens em claro como evidência.

### A04 — A prévia da competência inclui movimentos posteriores e usa o parâmetro mais recente

**Prioridade:** P0 antes de validar depreciação histórica ou expandir a virada mensal.  
**Evidência estática:** `patrimonio.ts:626–647`; `parametros.ts:45–76`.

`preverCompetencia` transforma a competência pedida em data, mas a consulta de movimentos filtra apenas pela classe. Os valores usados na base e no saldo incluem movimentos de outras datas; só a conferência de “já aplicado” é filtrada pela competência.

`parametroVigente` escolhe a maior versão registrada, sem receber a competência de aplicação. Versionamento por ordem de gravação não é, por si só, vigência de negócio.

**Cenário que deve ser testado:** prévia de março ainda aberto, incorporação em abril e novo parâmetro com vigência em maio. O cálculo de março não pode absorver abril nem a versão de maio por serem os dados mais recentes.

Não executei esse cenário com banco. O achado identifica a ausência dos filtros e a seleção temporal na implementação atual.

### A05 — Depreciação de classe e valor individual do bem não estão conciliados

**Prioridade:** P0/P1 antes de declarar a cadeia patrimonial completa.  
**Evidência estática:** `patrimonio.ts:732–759` e `valorContabilDoBem` no mesmo arquivo.

A atualização cria movimento de classe sem `bemId`. A leitura do valor do bem soma movimentos vinculados ao `bemId`. A memória de cálculo não constitui rateio individual.

Logo, o desenho examinado não demonstra que a soma dos saldos individuais acompanha a classe depois da depreciação. Também não demonstra elegibilidade pela data de início de depreciação de cada bem.

O TR pede registro individual de depreciação/reavaliação e cálculo mensal para os bens com início aplicável: cláusulas 5.19.26 e 5.19.38.

**Correção:** processamento por bens elegíveis, memória por item e conciliação item → classe → ledger. Não lançar uma vez por item e novamente o agregado sem uma regra explícita que impeça duplicação. Movimentos históricos sem vínculo individual exigem reconciliação declarada, não distribuição inventada para fechar o saldo.

### A06 — O termo reimpresso usa dados atuais sob a data do termo antigo

**Prioridade:** P1 para documentos operacionais definitivos.  
**Evidência:** `termo-documento.ts:17–21, 43–105`.

A composição consulta nome atual, valor atual e localização atual. A data do termo e sua declaração permanecem antigas. O rodapé informa que os valores são os do momento da impressão — portanto, a mudança não está oculta —, mas o resultado é uma posição atual associada ao termo, não uma segunda via estável do documento emitido.

**Correção:** distinguir “documento original/segunda via” de “posição patrimonial atual”. Preservar o conjunto de dados e a versão do modelo utilizados na emissão; após assinatura, preservar o artefato exato e sua verificação. Não presumir que um anexo assinado será adicionado posteriormente para tornar correta a emissão atual.

### A07 — A análise de estorno é mais conservadora do que “quem ficaria inválido”

**Prioridade:** P1/P2, complementar.  
**Evidência estática:** `estorno.ts:96–102, 190–213`.

A regra considera os movimentos posteriores vivos da classe e combina seus tipos. Um aumento anterior e uma redução posterior são classificados como dependência sem calcular se, retirado o aumento, a redução continuaria válida. O vínculo a outro bem da mesma classe não é excluído por essa regra.

Isso pode ser uma política conservadora deliberada, mas não deve ser descrito como prova matemática de invalidade. A ordenação por `criadoEm` isoladamente também exige desempate estável.

**Correção:** declarar o contrato escolhido; calcular impacto quando o produto promete essa precisão. Testar redução de outro bem não dependente, dependência real e registros com o mesmo timestamp.

### A08 — O stash condiciona o acoplamento do estoque à existência prévia de configuração

**Prioridade:** P0 antes de integrar o stash.  
**Evidência do WIP, não do HEAD:** `modules/m05-despesa/adapter-prisma.ts:1691–1732` após aplicação do diff em cópia separada.

O hook dispara somente quando existe `ClasseDeMaterial` cuja conta coincide com alguma partida de débito. Se a configuração estiver ausente, o bloco é ignorado. A ausência do cadastro passa a ter potencial para suprimir a integração que deveria ser exigida pelo tipo real da operação.

Também precisa ser decidida a regra de soma para documentos mistos: o valor das entradas de estoque não deve ser comparado indiscriminadamente ao bruto de uma liquidação que inclua parcelas sem estoque.

**Correção:** distinguir natureza do item/operação de completude da configuração contábil. Configuração obrigatória ausente deve ser pendência impeditiva explícita. Validar classe, conta, produto, depósito, recebimento e parcela liquidada. Não inventar mapeamentos pelo código do elemento nem pelas necessidades das fixtures.

A decisão de oferecer um ato composto na interface pode ser mantida; isso não torna recebimento físico, liquidação e reconhecimento contábil o mesmo fato sem identidade própria.

### A09 — CNPJ alfanumérico continua sendo mutilado pela normalização

**Prioridade:** P1 transversal.  
**Evidência executada:** R7; `packages/documento/index.ts:26–58`.

Entrada sintética `12ABC34501DE35` resulta em `123450135`. O teste mostra perda de letras, sem consultar cadastro externo e sem afirmar validade desse número como inscrição.

A Receita Federal disponibiliza o formato alfanumérico e sua documentação de DV, preservando os CNPJs numéricos anteriores. A correção exige tratamento de CPF e CNPJ separado, máscaras, banco, constraints, chaves lógicas, importadores e conectores — não apenas aceitar letras em um campo.

Não usar CPF/CNPJ como prova de identidade do usuário. Vínculo administrativo a Pessoa e identidade autenticada permanecem controles distintos.

## 5. Catálogo medido

| Situação | Quantidade |
|---|---:|
| NAO_VERIFICADO | 1.720 |
| AUSENTE_CONFIRMADO | 133 |
| IMPLEMENTADO_NAO_VALIDADO | 76 |
| VALIDADO_LOCALMENTE | 57 |
| PARCIAL | 48 |
| DEPENDENCIA_EXTERNA | 3 |
| **Total** | **2.037** |

317 cláusulas possuem classificação diferente de NAO_VERIFICADO. Isso **não significa** 317 requisitos atendidos, nem permite calcular um percentual confiável de produto pronto.

O campo estruturado `rota_verificada` está vazio nas 57 cláusulas marcadas VALIDADO_LOCALMENTE. Algumas rotas existem no texto da evidência. Trata-se de uma lacuna de rastreabilidade estruturada, não prova de que as 57 funções não existem.

### Promoções que precisam ser revistas

- **5.19.14:** a própria evidência admite que não existe campo/caminho de código do produto, um dos critérios citados pelo texto. Classificar como parcial até cobrir o critério ou documentar formalmente a interpretação de aceite; não apagar essa ressalva.
- **5.19.39:** a evidência ainda declara que a virada como operação única não existe, mas promove após estornar uma competência de classe. O teste prova o caso executado, não automaticamente uma virada mensal completa e sua reversão.
- **5.19.36:** o percurso verifica um termo com um bem, HTTP 200, tipo PDF e tamanho mínimo. Isso não prova sozinho composição correta do documento, variações setorial/por responsável e estabilidade da segunda via. Concluir os critérios e sua evidência antes de afirmar a extensão integral declarada.

A redação do TR e sua interpretação de aceite devem permanecer explícitas. A auditoria de engenharia não substitui decisão formal da comissão sobre itens ambíguos.

### Situação global

No catálogo: pessoal (5.12–5.16) continua integralmente não verificado; o portal de serviços (5.39) tem 116 itens não verificados; o aplicativo (5.40), 52; os principais blocos tributários também permanecem não verificados. Isso não permite declarar cada linha ausente sem inspecioná-la, mas impede concluir que a suíte está demonstrada.

Em compras (5.17), o catálogo registra 77 ausências, 23 implementações não validadas e 13 parciais. Planejamento (5.9) registra 97 não verificados e duas classificações sem validação local. Há base aproveitável; falta construir e demonstrar o escopo completo.

## 6. Direção recomendada

1. Preservar esta base e concluir uma correção curta das garantias de comando.
2. Corrigir os eixos de competência/valor e a geração histórica de documentos; não ampliar cálculos sobre a base temporal atual.
3. Integrar a liquidação composta com o contrato financeiro/físico correto e testes de regressão de seus consumidores.
4. Produzir build estável e percursos operacionais sob o servidor de produção local.
5. Expandir para planejamento → contratação → nota recebida → despesa e, em seguida, RH/portal do servidor e processo/cidadão, reutilizando as origens.
6. Manter o restante do TR como escopo controlado, sem prometer que um roteiro central equivale a todas as funcionalidades.
7. Isolamento por município, integrações reais, restauração e implantação continuam com seus aceites próprios.

## 7. Uso das evidências e do comando noturno

`PROMPT-NOTURNO-V4.md` é a instrução de implementação. Este relatório é sua fundamentação; não deve virar outra tarefa de reauditar tudo.

`evidencias/probe-auditoria.mjs` é diagnóstico, não o gate do projeto. Ele tem asserts que documentam comportamentos observados no snapshot antigo; depois da correção, vários deles devem deixar de passar. Converter os cenários em testes de regressão com a expectativa correta.

Execução do diagnóstico no snapshot original, sem instalar dependências:

```bash
node --experimental-transform-types /caminho/probe-auditoria.mjs /caminho/gestao-publica resultado.json
```

O comando usa Node com suporte à remoção/transformação de tipos. Isso não é recomendação para trocar a versão do runtime produtivo.

## 8. Fontes externas consultadas

- Receita Federal — CNPJ alfanumérico e comunicado de 31/07/2026.
  https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico
- Receita Federal — documentação do cálculo do DV.
  https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj
- Next.js — preparação para produção: `next build` e `next start`.
  https://nextjs.org/docs/app/guides/production-checklist
- GitHub — objeto do commit-base, para confronto criptográfico.
  https://api.github.com/repos/comercial-rgb/gestao-publica/git/commits/dc7032a12c7490781ffbdca6958eb3fbf422fe48

O TR anexado é a fonte funcional. O conteúdo do snapshot é a fonte de implementação. As recomendações de desenho estão identificadas como decisões propostas, não como frases literais do TR.
