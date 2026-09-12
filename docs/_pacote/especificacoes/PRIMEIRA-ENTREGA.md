# Primeira entrega - fundação exercitada por uma despesa

## Natureza desta especificação

Este é um recorte de implementação inicial, não o dicionário definitivo de todas as telas da plataforma. Os campos, estados e rotas abaixo são propostas de engenharia para materializar as cláusulas indicadas; o agente deve confrontar cada proposta com o schema/caso de uso existente e com o texto original. Campos adicionais expressamente exigidos no documento não podem ser descartados.

Não alterar o significado de um registro existente apenas para encaixa-lo nestas rotas. Quando uma página ja existir, ampliar e registrar sua rota real no contrato funcional.

## 1. Contextos, identidades e entidades de domínio

| Elemento | Campos/relações propostos | Invariantes |
|---|---|---|
| Município/tenant | ID, identificador, denominacao, UF, situação, configurações | Identidade independente da entidade gestora; não inferir do nome do usuário. |
| Entidade gestora | ID, tenant, denominacao, identificador legal aplicável, tipo, situação | Prefeitura, Câmara e FMS podem coexistir no mesmo tenant. |
| Exercício/período | Entidade, ano, competência/intervalo, estado, abertura e fechamento | Dois exercícios podem estar abertos; fechamento e autorização possuem regras próprias. |
| Vínculo de acesso | Usuário, tenant, entidade, grupo/papel, setor, vigência | Permissão verificada por requisição, não apenas no menu. |
| Pessoa | ID no tenant, PF/PJ, nome/razão, documento validado, contatos, endereços, situação | Mesma pessoa pode ter vários papéis; dados sensíveis não se tornam públicos. |
| Papel da pessoa | Pessoa, tipo, vigência, dados específicos/representação | Credor não equivale a servidor; representação exige vínculo válido. |
| Evento de auditoria | Autor/contexto, operação, registro, instante, diff, correlação | Imutável no papel da aplicação, protegido por escopo e visível no detalhe pertinente. |

A coluna "campos" e proposta, não transcricao literal. Fonte funcional: 5.8.8-5.8.9, 5.8.17, 5.8.19, 5.29.2 e regras dos módulos. O tipo exato, nulabilidade e índices são definidos depois de ler o schema real.

## 2. Catálogo de telas do incremento

### T01 - entrada e contexto

Reaproveitar o login existente com identidade canônica; nenhuma conta com senha padrão distribuida ao usuário. Bootstrap por segredo de ambiente seguro e troca de credencial quando aplicável. Não migrar hash de senha de algoritmo diferente sem verificar o formato e a política de reautenticacao.

No shell: município ativo, entidade, exercício, usuário, notificações reais e menu autorizado. Ao trocar entidade, manter o exercício quando permitido; se indisponível, informar o motivo e solicitar escolha explícita, sem substituir silenciosamente por outro ano.

Ações: entrar, sair, selecionar entidade, selecionar exercício, abrir módulo permitido. Sem novo login para uma entidade ja autorizada. Uma conta sem membership não pode selecionar o contexto por digitação de URL.

### T02 - pessoas e credores

Listagem com pesquisa por nome/documento, filtros de papel e situação, paginação e colunas autorizadas. Formulário com PF/PJ, nome/razão social, documento, contatos, endereço e papéis. Os atributos bancários devem ficar no domínio de credor/conta com permissões próprias, não no perfil público.

Obrigatoriedade e validação derivadas do caso de uso e da cláusula aplicável. O ID, tenant e autor são definidos no servidor. Não confiar em campos escondidos como controle de autorização.

Detalhe com dados, papéis, relacionados e timeline. Ações: cadastrar, editar dados permitidos, adicionar papel, desativar e consultar relações. Exclusão física bloqueada quando houver dependências contabilizadas; não usar isso para remover o histórico.

Campos adicionais e anexos devem reutilizar componentes existentes ou entrar em lote identificado. Não marcar o requisito geral de campos dinâmicos como atendido se o incremento apenas renderiza um campo fixo de observação.

### T03 - dotações e fontes

Consulta do orçamento existente: entidade/exercício, órgão/unidade, classificações, programa/ação, natureza/elemento, fonte/destinação, dotação atualizada, reservado, empenhado e saldo disponível. Definir, com o domínio existente, quais saldos são em data informada e quais são atuais.

Ações: filtrar, consultar origem/alterações e selecionar dotação para empenho. As rotinas de elaborar toda a LDO/PPA/LOA permanecem em ENT03; esta tela não pretende satisfazer os 99 itens de planejamento.

### T04 - gerenciar e emitir empenhos

Filtros: entidade/exercício, número, período, credor, dotação/fonte e situação. Colunas: número/data, credor, tipo, valor, liquidado/pago/estornado e saldo, sem expor dados bancários indevidos.

Formulário base: data, tipo, credor, dotação, fonte/destinação, valor, histórico; vínculos com processo, licitação, contrato e ordem de compra conforme o caso; itens/parcelas e documentos quando aplicáveis. Não inventar obrigatoriedade universal de licitação para todos os tipos de despesa.

Ações: emitir, duplicar como novo registro quando admitido, iniciar liquidação, consultar relacionados, solicitar estorno e emitir documento. Registro definitivo não oferece "Editar valor" como CRUD livre.

Fonte: bloco 5.10.1, especialmente saldo em datas, estorno, duplicação, relacionados e origem das operações. Conferir os subitens antes de vincular a anotacao de atendimento.

### T05 - detalhe do empenho

Resumo com entidade, exercício, credor, data e saldos. Abas/seções: dados/itens, origem, liquidações, retenções, pagamentos, estornos, documentos, lançamentos contábeis e timeline.

A auditoria deve estar dentro do mesmo contexto de detalhe, sem exigir abrir um sistema separado. A nomenclatura de aba "Histórico" e mais natural que "Requisito 5.8.17".

Ao selecionar estornar: abrir dialogo com data, motivo, valor/saldo reversivel, efeitos nas relações e confirmação. O servidor recalcula a disponibilidade no commit; não aceitar o valor de saldo que veio do navegador.

### T06 - liquidação e retenções

Formulário base: empenho/subempenho, data, valor, documento comprobatório/fiscal, itens recebidos ou período de serviço conforme operação, histórico, vencimento e retenções.

Cada retenção deve manter identificação, valor e os dados exigidos pelo tipo e pela origem. Se houver cálculo de alíquota/base, apresentar a regra versionada e memória; para a fixture inicial usar um valor explicitamente informado, sem inventar uma alíquota legal.

Ações: conferir saldo/documentos, liquidar, emitir documento, consultar lançamentos, iniciar registro de pagamento e estornar se permitido. Não permitir liquidar mais que o saldo em duas requisições concorrentes.

### T07 - pagamento e consulta financeira

Formulário base: liquidações/obrigações elegiveis, data, vencimento, conta/fonte, valor bruto, retenções, líquido, modalidade/meio, comprovante e justificativas aplicáveis. Campos derivados não podem ser arbitrados pelo cliente.

Separar "preparar/autorizar ordem", "registrar pagamento administrativo", "enviar ao banco" e "confirmação bancária" conforme os casos de uso existentes. Sem configuração, o envio real deve ficar indisponível com motivo; não substituir por retorno de sucesso local.

Ações: preparar ou registrar conforme permissão, consultar saldos, consultar ordem cronológica, emitir documento e consultar/estornar o fato quando permitido. O produto não deve permitir contornar uma regra de ordem cronológica ou saldo por uma rota secundária.

A fixture não realizá pagamento financeiro externo. O registro sintético pertence apenas ao ambiente de teste/demonstração identificado.

### T08 - razão e conferência do fato

Filtros: entidade, exercício, período, conta, fonte, origem e identificador do fato. Exibir lançamento e cada perna, débito/crédito, subsistema, valor, referência de estorno e documentos de origem. Totalizadores devem evidenciar diferenças por subsistema.

Ações: consultar, detalhar origem, filtrar, selecionar/somar e gerar o relatório existente adequado. Sem editar/apagar partidas. Relatório deve usar o mesmo conjunto de fatos confirmado pela tela.

M12 e candidato para demonstrativo de conferência; não declarar o designer customizavel concluído porque um PDF foi emitido.

### T09 - situação das integrações

Painel simples baseado em registros reais: conector, ambiente, configuração, última tentativa, estado local, estado externo, referência de retorno, erros e próxima ação. Ausência de tentativas não é "100% de sucesso".

Ações: consultar detalhes autorizados, baixar artefato permitido, validar dados e reprocessar quando houver implementação e segurança. Não expor segredos ou XMLs sensíveis a perfis genericos.

Não criar painel estatico listando e-Sfinge, ADN, bancos e BNAFAR como implementados. Conectores ainda não existentes ficam em configuração/backlog técnico, sem rota ou botão de envio ficticio.

## 3. Contratos propostos de rotas e comandos

Os endpoints são propostas; registrar equivalentes reais depois da auditoria. Parâmetros de entidade/exercício nunca substituem o controle de acesso. Todos os comandos devem passar pelos mesmos casos de uso que as server actions existentes.

| Operação | Contrato proposto | Condição/efeito |
|---|---|---|
| Contextos acessíveis | `GET /api/v1/contextos` | Retornar apenas memberships/entidades/exercícios autorizados. |
| Preferência de contexto | `POST /api/v1/preferencias/contexto` | Persistir preferência; não transferir propriedade nem ampliar acesso. |
| Pessoas | `GET/POST /api/v1/pessoas` | Contexto de tenant validado; regras de deduplicacao e papéis. |
| Edição cadastral | `PATCH /api/v1/pessoas/{id}` | So atributos autorizados; diff persistido com autoria. |
| Dotações | `GET /api/v1/entidades/{e}/exercicios/{a}/dotacoes` | Saldos reais por fonte e posição temporal. |
| Emitir empenho | `POST /api/v1/entidades/{e}/exercicios/{a}/empenhos` | Idempotência, período, saldo, origem, ledger e auditoria juntos. |
| Liquidar | `POST /api/v1/empenhos/{id}/liquidacoes` | Resolver propriedade pelo registro; validar saldo e documentos. |
| Registrar pagamento | `POST /api/v1/liquidacoes/{id}/pagamentos` | Estado correto, bruto/retenções/líquido, conta/fonte e ordem. |
| Estornar | `POST /api/v1/empenhos/{id}/estornos` | Data/motivo/valor e efeitos permitidos; novo lançamento, sem apagar. |
| Consultar fato | `GET /api/v1/lancamentos/{id}` | Acesso autorizado e relações de origem/estorno. |
| Histórico | `GET /api/v1/recursos/{tipo}/{id}/historico` | Tipos permitidos em registro controlado por lista de tipos permitidos; sem acesso polimorfico arbitrário. |

Liquidações e pagamentos podem ter endpoints próprios de estorno. Não forcar todo estorno pelo empenho. A semântica de cascata deve vir das dependências reais e nunca desfazer efeito externo silenciosamente.

Respostas: distinguir autenticação, autorização, ausência, validação e conflito concorrente. Preservar convenções existentes quando corretas; não declarar que todo erro fiscal deve ser 409 ou que todo conflito deve ser 422. Escolher e documentar o contrato por classe de erro, com mensagem operacional e correlação, sem segredos.

## 4. Cenário sintético de aceite

Município A: Prefeitura A, Câmara A e Fundo de Saúde A. Município B: Prefeitura B. Usuários com acessos distintos e um consolidador autorizado apenas no município A. Exercícios 2026 e 2027, com períodos abertos/fechados conforme cada teste.

Dotação de teste 10.000,00. Empenho bruto 1.000,00, liquidação de 1.000,00, retenção explicitamente informada de 100,00 e saída de caixa de 900,00. O saldo remanescente de dotação deve refletir as regras do domínio e as reservas existentes da fixture; não apenas subtrair valores na UI.

Registrar os valores esperados por conta/subsistema antes de rodar. A conta do caixa não pode receber 1.000,00 se o desembolso foi 900,00. Ao testar estorno, inverter os fatos corretos sem aumentar caixa pelo bruto. Fatos originais permanecem iguais. Para estorno parcial, explicitar o critério de rateio e o saldo restante sem ultrapassar o original.

Os valores e estados são de engenharia; não representam alíquota, pagamento real ou conformidade com uma tabela tributária municipal.

## 5. Testes mínimos do incremento

1. Usuário so recebê contextos autorizados; entidade/exercício não se amplia por URL.
2. Troca de entidade sem novo login, preservando ano quando autorizado.
3. Duas abas em entidades diferentes não trocam o destino de uma escrita.
4. Município A não le dados de B; tentativa de escrita em B e rejeitada.
5. FK de pessoa/fonte/dotação de outro tenant não é aceita.
6. Usuário sem permissão não executá comando pela API mesmo com botão oculto.
7. Consolidação de entidades autorizadas de A não inclui B.
8. Pool reutilizado depois de uma requisição não reaproveita seu tenant/contexto.
9. Job/exportação/anexo não vaza entre tenants; memberships revogadas são respeitadas.
10. Papel de runtime não altera/apaga ledger/auditoria nem contorna isolamento; fixtures usam papel separado somente no banco descartável.
11. Período fechado bloqueia escrita por API, worker e rota alternativa exposta.
12. Duas requisições concorrentes não excedem saldo de dotação/liquidação/pagamento.
13. Repeticao idempotente retorna o mesmo efeito; payload divergente com mesma chave não duplica.
14. Falha no meio da unidade de trabalho reverte operacional, ledger, auditoria de sucesso e outbox juntos. Registro separado de tentativa falha pode existir sem simular fato efetivado.
15. Ledger balanceia por subsistema e recusa conta/classificação incompatível.
16. Pagamento com retenção preserva bruto, líquido e obrigações em pernas distintas.
17. Estorno preserva valores por perna, original imutável e saldo reversivel.
18. Estorno parcial não é tratado como estorno total por um booleano.
19. Recarregar tela após cada operação encontra dados persistidos, não apenas estado de componente.
20. Relatório corresponde aos registros consultados e respeita contexto/filtros.
21. Timeline apresentá autor, momento e alterações do cadastro, sem exposição de segredo.
22. Serviço externo sem credencial não emite protocolo falso nem marcá aceite.
23. Nenhum GET emite despesa, cancela ou estorná.
24. Rotulos de conformidade e IDs do inventário não aparecem nas telas/saídas; "Licitações" e vocabulario válido continuam disponíveis.
25. Suíte regressiva original continua executada com os mesmos invariantes.

Esses são testes a implementar/executar no código local; não foram executados pela criação deste documento.

## 6. Limites do aceite deste incremento

O gate comprova somente as capacidades efetivamente testadas. Não comprova e-Sfinge, app nas lojas, HSM, designer completo, toda a folha, todos os tributos, infraestrutura de produção ou integralidade do edital. As pendências permanecem explícitas no catálogo.
