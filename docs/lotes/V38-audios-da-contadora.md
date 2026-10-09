# Análise integral dos nove áudios — Gestão e Contabilidade Pública

Data: 09/10/2026. Destinatário: equipe de desenvolvimento / Claude Code.

Este documento registra **124 itens rastreáveis**, distribuídos pelos nove áudios. São ocorrências e desdobramentos de verificação, **não 124 defeitos confirmados**. Não houve inspeção do repositório ou execução do sistema nesta análise. Não é uma certificação contábil, normativa ou de completude do produto.

## Como ler e usar

Cada item mantém origem, intervalo aproximado, relato, classificação preliminar e ação verificável. As classificações devem ser confirmadas no sistema. Relatos de “não encontrei” não provam ausência de código; opções visíveis não provam funcionamento. Repetições entre áudios foram preservadas: podem apontar para a mesma correção, mas não perder sua rastreabilidade.

A análise usa transcrição automática local de todos os arquivos e uma segunda transcrição de trechos incertos. Ruído, sobreposição e termos técnicos deixam ambiguidades. Elas estão marcadas; não foram preenchidas com suposições. O apêndice preserva a transcrição automática integral usada como apoio, incluindo erros de reconhecimento. O áudio original prevalece. Não atribua nomes de tela, números de fonte, alíquotas ou exigências legais a partir de texto duvidoso.

Os campos “Ação e evidência esperada” são orientação de engenharia desta análise. Não são transcrição literal nem decisão do contador. Os exemplos 2026 → 2027 e 5% são exemplos de uso, não constantes do sistema.

## Fontes

| ID | Arquivo | Duração aproximada |
|---|---|---|
| A01 | WhatsApp Ptt 2026-10-09 at 12.27.27 PM.ogg | 06:17 |
| A02 | WhatsApp Ptt 2026-10-09 at 12.33.08 PM.ogg | 05:39 |
| A03 | WhatsApp Ptt 2026-10-09 at 12.35.23 PM.ogg | 02:08 |
| A04 | WhatsApp Ptt 2026-10-09 at 12.38.42 PM.ogg | 01:45 |
| A05 | WhatsApp Ptt 2026-10-09 at 12.45.31 PM.ogg | 05:15 |
| A06 | WhatsApp Ptt 2026-10-09 at 12.50.09 PM.ogg | 04:36 |
| A07 | WhatsApp Ptt 2026-10-09 at 12.51.16 PM.ogg | 01:07 |
| A08 | WhatsApp Ptt 2026-10-09 at 12.54.06 PM.ogg | 02:40 |
| A09 | WhatsApp Ptt 2026-10-09 at 1.00.01 PM.ogg | 03:31 |

Total: aproximadamente 33:02. Os tempos de cada item são relativos ao início do respectivo arquivo.

## Ordem de execução proposta

Esta ordem organiza o trabalho; não elimina nem substitui nenhum item do inventário.

1. Reproduzir impedimentos da execução: busca de credor, seleção/validação de dotação, gravação do empenho, documentação da liquidação e retenções.
2. Entregar a jornada prioritária da apresentação: aproveitar planejamento anterior, ajustar receitas, ajustar despesas, incluir novas fichas, conferir, aprovar e iniciar a execução do destino preservando a origem.
3. Concluir as operações de tesouraria relatadas: conciliação manual, conciliação por arquivo, recolhimentos e identificação dos realizáveis.
4. Conferir lançamentos manuais, reclassificações, consultas, demonstrativos e prestações, um resultado por documento/integração.
5. Conferir contratação e seus efeitos até a liquidação/pagamento, reorganizando tributação e contabilidade sem retirar funções.

Não aguardar dados externos para construir entradas, validações, configuração e prévias locais. Porém não substituir dados ou decisões oficiais por valores inventados, e não declarar integração externa validada sem retorno real.

## Prompt completo para o Code

```text
Execute esta ordem tomando o inventário integral abaixo como lista de trabalho. Leia também os áudios anexos nos trechos marcados como incertos. Não substitua o inventário por um resumo e não reúna ações distintas em um único item de conclusão.

1. Confira o HEAD, a árvore e a ordem vigente nesta sessão. Preserve alterações de outras sessões, scripts do operador, stash e dados. Relatos anteriores são contexto, não prova do estado atual.
2. Registre cada ID deste documento em uma matriz. Para cada um, classifique separadamente: defeito, melhoria, decisão, verificação de função existente ou dúvida de transcrição. Registre: existe e funciona / existe e falha / existe mas não é encontrável / falta / depende de dado ou decisão / ainda não verificado.
3. Para uma repetição, mantenha os IDs de origem e a evidência comum. Não some ocorrências como defeitos diferentes. Não una critérios independentes apenas porque ficam na mesma tela.
4. Reproduza os defeitos antes de corrigir. Verifique formulário, validação do servidor, persistência, autorização e efeitos nos saldos/lançamentos. Uma função não está concluída só porque tem rota, botão, teste unitário ou tipo compilando.
5. Construa o que falta por ordem de impacto operacional definida neste documento. Reaproveite motores existentes. Conclua entrada, operação, consulta, rastreabilidade e saída documental da capacidade afetada; não entregue apenas infraestrutura.
6. Para retenções, classificações, contas, fontes, leiautes e obrigações fiscais, confira as fontes oficiais aplicáveis ao ente, exercício e versão. O áudio é feedback operacional, não norma. Separe INSS, IR e ISS. Não copie uma cadeia para outra por analogia nem faça contas/alíquotas municipais constantes no código.
7. Se uma informação oficial faltar, construa a configuração e a indicação objetiva da pendência. Bloqueie apenas o ato que depende dela. Continue os demais itens tratáveis. Não use uma dúvida como autorização para inventar o dado.
8. Preserve todas as funções ao reorganizar menus. Textos de tela devem ser claros para o contador, sem números de cláusula do TR, códigos internos, comentários de engenharia ou tutoriais longos. Preserve rótulos de campos, confirmações e mensagens que indiquem como resolver uma recusa.
9. No planejamento, demonstre copiar a base, ajustar receitas, ajustar despesas, criar receita, criar ficha, conferir a proposta, aprovar e abrir a execução. Demonstre que o exercício anterior ficou intacto. Respeite a diferença entre PPA, LDO e LOA e entre proposta e orçamento em execução.
10. Use no máximo dois auxiliares, se disponíveis, para reconhecimento e revisão de frentes separadas. Mantenha um único escritor/integrador na árvore. Não coloque dois agentes commitando no mesmo índice. Serialize processos pesados pelo mecanismo do repositório; enquanto um roda, prossiga com leitura, revisão e trabalho leve.
11. Rode testes dirigidos às alterações e aos consumidores diretamente afetados. Não rode suíte completa, test:fuso ou portão integral. Execute os percursos afetados em ambiente de ensaio autorizado, com perfis operacionais e dados rastreáveis. Confira o efeito persistido, não apenas exit code. Use contraprovas quando resolverem um risco real.
12. Não mate processos de outros produtos nem remova bancos, volumes ou worktrees para abrir espaço sem base e autorização pertinentes. Saturação explica aborto/lentidão; não invalida uma asserção que mostra conteúdo errado.
13. Em exportações tocadas, confira o arquivo gerado: valores e filtros iguais aos da tela, PDF com cabeçalho/rodapé e paginação legíveis, CSV relido sem perda de precisão ou colunas. Não declare todos os relatórios conferidos porque um modelo passou.
14. Publicação deve seguir a autorização direta vigente nesta sessão do Code. Se já estiver autorizada, conclua preparo, backup/restauração pertinente, implantação e verificação da versão sem pedir novamente. Este documento não concede por si só autorização nova para produção, transmissão fiscal ou Tribunal. Não trate geração de arquivo como transmissão.
15. Ao terminar, devolva UMA LINHA POR ID, com classificação final, achado, alteração ou justificativa, teste/percurso, commit e estado de instalação. Diferencie implementado, testado, percorrido, instalado e transmitido. Não declare ecossistema completo com itens pendentes ou não verificados.

Comece pela conferência dos impedimentos da execução e avance pela jornada de planejamento. Continue até esgotar os itens tratáveis desta ordem; as dependências externas devem ficar nomeadas, com dado/ator necessário, sem bloquear as demais frentes.
```

## Inventário integral — um ponto por item

### AUD-001 — Identificar o campo relacionado ao Tribunal

**Origem:** A01, 00:00–00:07.

**Classificação preliminar:** Dúvida.

**Relato:** O início menciona um campo ligado ao Tribunal e uma possível particularidade da Paraíba. O nome exato não ficou seguro na transcrição.

**Ação e evidência esperada:** Localizar a tela e o campo antes de mudar qualquer regra; conferir UF, tribunal e leiaute. Não presumir que a palavra seja lei ou leiaute.

### AUD-002 — Executar o empenho

**Origem:** A01, 00:10–00:19.

**Classificação preliminar:** Verificação funcional.

**Relato:** O empenho é apresentado como etapa principal da execução.

**Ação e evidência esperada:** Conferir a operação completa com dados válidos e documento gravado; sua existência no menu não encerra o item.

### AUD-003 — Executar a liquidação

**Origem:** A01, 00:10–00:19.

**Classificação preliminar:** Verificação funcional.

**Relato:** A liquidação é mencionada como etapa própria da execução.

**Ação e evidência esperada:** Operar a liquidação de um empenho válido, conferindo saldo, documentos e reflexos.

### AUD-004 — Executar o pagamento

**Origem:** A01, 00:10–00:19.

**Classificação preliminar:** Verificação funcional.

**Relato:** O pagamento é mencionado como etapa própria da execução.

**Ação e evidência esperada:** Operar o pagamento de uma obrigação liquidada, com reflexo bancário e contábil verificável.

### AUD-005 — Estornar ou anular empenho

**Origem:** A01, 00:16–00:19.

**Classificação preliminar:** Verificação funcional.

**Relato:** É solicitada a rotina de estorno de empenho.

**Ação e evidência esperada:** Identificar o procedimento pertinente ao estado do fato; executar preservando original, vínculos e saldos.

### AUD-006 — Estornar ou anular liquidação

**Origem:** A01, 00:16–00:19.

**Classificação preliminar:** Verificação funcional.

**Relato:** É solicitada separadamente a rotina de estorno da liquidação.

**Ação e evidência esperada:** Conferir dependências e recomposição de saldos; não tratar como exclusão.

### AUD-007 — Estornar ou anular pagamento

**Origem:** A01, 00:16–00:19.

**Classificação preliminar:** Verificação funcional.

**Relato:** É solicitada separadamente a rotina de estorno de pagamento.

**Ação e evidência esperada:** Conferir o movimento financeiro, retenções e obrigação resultante.

### AUD-008 — Consultar a dotação da LOA ao empenhar

**Origem:** A01, 00:24–00:48.

**Classificação preliminar:** Melhoria ou defeito a confirmar.

**Relato:** O operador deve buscar a dotação criada na LOA, sem digitar uma identificação arbitrária.

**Ação e evidência esperada:** Disponibilizar seleção consultável das dotações válidas para ente e exercício, preservando classificação e fonte.

### AUD-009 — Recusar dotação inexistente ou incompatível

**Origem:** A01, 00:34–00:48.

**Classificação preliminar:** Defeito relatado a reproduzir.

**Relato:** A fala afirma que hoje seria possível colocar qualquer dotação e valor.

**Ação e evidência esperada:** Reproduzir; validar no servidor a existência, pertencimento, situação e limite disponível. Não considerar a acusação provada sem conferir.

### AUD-010 — Corrigir a falha de cadastro do empenho

**Origem:** A01, 00:53–00:59.

**Classificação preliminar:** Defeito relatado.

**Relato:** O avaliador diz que tentou cadastrar o empenho e recebeu erros.

**Ação e evidência esperada:** Reproduzir a tentativa, registrar a causa concreta e concluir um cadastro pelo perfil operacional.

### AUD-011 — Encontrar credor já listado

**Origem:** A01, 01:01–02:36.

**Classificação preliminar:** Defeito relatado.

**Relato:** Um CPF copiado da lista de credores não foi encontrado no formulário, que pediu novo cadastro. A tentativa é repetida durante a conversa.

**Ação e evidência esperada:** Usar a mesma base, entidade e permissão; conferir se a listagem corresponde a registros persistidos e se a busca os encontra.

### AUD-012 — Buscar credor por CPF, CNPJ ou nome no próprio campo

**Origem:** A01, 01:08–01:35.

**Classificação preliminar:** Melhoria.

**Relato:** É descrita a expectativa de digitar o documento ou nome e receber os resultados diretamente; o botão separado não foi considerado funcional.

**Ação e evidência esperada:** Oferecer busca/autocomplete acessível, seleção inequívoca e estado de ausência de resultado. Conferir os três critérios.

### AUD-013 — Aceitar documento com ou sem máscara na busca

**Origem:** A01, 02:03–02:13.

**Classificação preliminar:** Defeito a confirmar.

**Relato:** A tentativa remove a pontuação do documento para verificar se a busca funciona.

**Ação e evidência esperada:** Normalizar a pesquisa de CPF/CNPJ; testar documento mascarado e somente dígitos sem alterar sua identidade.

### AUD-014 — Eliminar discrepância entre demonstração e cadastro real

**Origem:** A01, 02:13–02:31.

**Classificação preliminar:** Verificação de dados.

**Relato:** Os participantes levantam a hipótese de a lista de credores ser fictícia e não alimentar a busca.

**Ação e evidência esperada:** Conferir se há dados estáticos, bases distintas ou filtros incompatíveis; dados de ensaio devem ser reais registros da base de ensaio, identificados como sintéticos.

### AUD-015 — Manter o contexto ao cadastrar credor a partir do empenho

**Origem:** A01, 02:37–02:49.

**Classificação preliminar:** Melhoria; trecho final incompleto.

**Relato:** O botão leva ao cadastro, mas os participantes dizem que a informação já deveria aparecer. O complemento da frase fica incompleto.

**Ação e evidência esperada:** Verificar pré-preenchimento do documento e retorno com o credor selecionado, preservando o rascunho do empenho; tratar essa solução como proposta a validar, não citação literal.

### AUD-016 — Selecionar tipo de empenho

**Origem:** A01, 02:52–03:04.

**Classificação preliminar:** Verificação funcional.

**Relato:** São citados ordinário, global e estimativo.

**Ação e evidência esperada:** Conferir seleção, validações e uso do tipo nas operações posteriores.

### AUD-017 — Esclarecer a categoria associada ao contrato

**Origem:** A01, 03:03–03:07.

**Classificação preliminar:** Dúvida de transcrição.

**Relato:** É mencionada uma categoria exigida quando há contrato, mas a frase não ficou inequívoca.

**Ação e evidência esperada:** Reouvir esse trecho e localizar o campo. Não criar enum ou regra de obrigatoriedade por suposição.

### AUD-018 — Conferir vínculo do empenho com ordem de compra

**Origem:** A01, 03:08–03:24.

**Classificação preliminar:** Verificação funcional.

**Relato:** A ordem de compra é citada ao examinar os vínculos do empenho.

**Ação e evidência esperada:** Localizar e operar o vínculo existente, conferindo fornecedor, itens e valores pertinentes.

### AUD-019 — Conferir vínculo do empenho com convênio

**Origem:** A01, 03:17–03:24.

**Classificação preliminar:** Verificação funcional.

**Relato:** Convênio é mencionado junto dos outros vínculos do empenho; o termo ficou mais claro na segunda transcrição.

**Ação e evidência esperada:** Conferir o vínculo com o instrumento quando aplicável, sem criar duplicidade de cadastro.

### AUD-020 — Conferir vínculo do empenho com obra

**Origem:** A01, 03:17–03:24.

**Classificação preliminar:** Verificação funcional.

**Relato:** Obra é citada entre os vínculos possíveis do empenho.

**Ação e evidência esperada:** Conferir ligação entre empenho e obra e sua consulta posterior.

### AUD-021 — Conferir vínculo do empenho com dívida fundada

**Origem:** A01, 03:17–03:24.

**Classificação preliminar:** Verificação; termo a confirmar.

**Relato:** A transcrição reconhece de forma imperfeita a expressão dívida fundada.

**Ação e evidência esperada:** Confirmar no áudio e localizar o vínculo correspondente antes de implementar regra específica.

### AUD-022 — Exibir a classificação herdada da dotação

**Origem:** A01, 03:24–03:37.

**Classificação preliminar:** Melhoria ou lacuna a conferir.

**Relato:** São citadas natureza, fonte e ficha, com dúvida sobre classificação faltante.

**Ação e evidência esperada:** Ao selecionar a ficha, mostrar os dados herdados e validar coerência; identificar exatamente qual dimensão está ausente.

### AUD-023 — Preservar os indicadores da fila a pagar

**Origem:** A01, 03:54–04:11.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** A conversa observa valores e informações de liquidação, anulação e estorno na fila.

**Ação e evidência esperada:** Conferir significados e valores, preservando a funcionalidade existente; o trecho não comprova um novo defeito.

### AUD-024 — Concluir integração EFD-Reinf, série 2000

**Origem:** A01, 04:13–04:54.

**Classificação preliminar:** Pedido de integração.

**Relato:** É perguntado se existe integração Reinf e citada a série 2000; a resposta informa integrações desligadas no ambiente.

**Ação e evidência esperada:** Inspecionar o adaptador e a documentação oficial vigente; declarar o que está implementado, configurado, validado e transmitido. Não inventar eventos ou credenciais.

### AUD-025 — Concluir integração EFD-Reinf, série 4000

**Origem:** A01, 04:13–04:54.

**Classificação preliminar:** Pedido de integração.

**Relato:** A série 4000 é citada separadamente, no contexto de retenções e imposto de renda.

**Ação e evidência esperada:** Conferir cobertura, dados de entrada, leiaute vigente e retorno. Manter evidência separada da série 2000.

### AUD-026 — Encontrar a ação de retenção na liquidação

**Origem:** A01, 05:00–06:17.

**Classificação preliminar:** Defeito de fluxo relatado.

**Relato:** Os participantes tentam uma liquidação e não localizam onde informar a retenção.

**Ação e evidência esperada:** Reproduzir pelo perfil usado, distinguir ação inexistente de ação escondida ou bloqueada e entregar a entrada adequada ao fluxo confirmado.

### AUD-027 — Ligar a consulta de retenções à entrada dos dados

**Origem:** A02, 00:00–00:20.

**Classificação preliminar:** Defeito de fluxo relatado.

**Relato:** A consulta da liquidação mostra retenções, mas o operador não encontra o lançamento delas.

**Ação e evidência esperada:** Mapear a origem do dado exibido e tornar acessível a operação que o produz, sem duplicar a retenção.

### AUD-028 — Identificar liquidação com ou sem nota fiscal

**Origem:** A02, 00:17–00:54.

**Classificação preliminar:** Melhoria ou lacuna.

**Relato:** A liquidação parece oferecer apenas histórico e não distingue adequadamente a documentação fiscal aplicável.

**Ação e evidência esperada:** Conferir o modelo documental; permitir identificar o suporte pertinente, sem exigir nota fiscal indistintamente para toda despesa.

### AUD-029 — Informar chave do documento fiscal

**Origem:** A02, 00:25–00:40.

**Classificação preliminar:** Lacuna relatada.

**Relato:** A chave é citada como informação que não aparece no formulário.

**Ação e evidência esperada:** Conferir o tipo documental, expor e validar a chave quando aplicável, preservando documentos que não a possuem.

### AUD-030 — Informar número da nota fiscal

**Origem:** A02, 00:25–00:54.

**Classificação preliminar:** Lacuna relatada.

**Relato:** O avaliador não localiza o número da nota fiscal.

**Ação e evidência esperada:** Expor o campo e persistir sua ligação com a liquidação, quando aplicável.

### AUD-031 — Definir o momento da retenção sem duplicar o fato

**Origem:** A02, 00:54–02:21.

**Classificação preliminar:** Decisão de regra a fundamentar.

**Relato:** A retenção é encontrada no pagamento; discute-se permitir antes, na liquidação, dependendo da regra do Tribunal.

**Ação e evidência esperada:** Pesquisar a regra aplicável e distinguir previsão, cálculo e efetivação. Uma retenção informada antes deve ser reaproveitada, não lançada novamente ao pagar.

### AUD-032 — Conferir possível solicitação duplicada do valor retido

**Origem:** A02, 02:18–02:40.

**Classificação preliminar:** Dúvida de transcrição.

**Relato:** Há uma fala reconhecida como 'pede duas vezes' durante o preenchimento da retenção, sem identificação segura dos dois campos.

**Ação e evidência esperada:** Reproduzir a tela e identificar se há duplicação de entrada, repetição da tentativa ou outro contexto. Não afirmar cobrança ou retenção duplicada sem evidência.

### AUD-033 — Consultar a natureza do bem ou serviço por tabela

**Origem:** A02, 03:53–04:27.

**Classificação preliminar:** Defeito de uso relatado.

**Relato:** É solicitado consultar/escolher a natureza pela tabela. Primeiro a opção parece não funcionar; depois há indicação de que conseguiram acessá-la.

**Ação e evidência esperada:** Reproduzir antes de classificar como ausência. Oferecer seleção do domínio vigente e impedir código livre inválido.

### AUD-034 — Localizar configuração tributária do fornecedor

**Origem:** A02, 04:27–05:09.

**Classificação preliminar:** Verificação de fluxo; termos parcialmente incertos.

**Relato:** A conversa passa por ISS, Simples Nacional e cadastro de pessoas ao procurar configuração necessária à retenção.

**Ação e evidência esperada:** Conferir quais atributos existem e onde são editados. Identificar os campos exatos; não presumir alíquotas ou enquadramento do fornecedor.

### AUD-035 — Identificar a configuração que impede avançar

**Origem:** A03, 00:00–01:23.

**Classificação preliminar:** Dúvida; áudio com trechos pouco claros.

**Relato:** A tentativa encontra uma exigência de configuração, mas não é possível identificar o campo. A segunda transcrição também não sustenta associá-lo ao exercício.

**Ação e evidência esperada:** Reouvir e reproduzir a mensagem no sistema. Registrar o campo e a ação de configuração necessários, sem inventar o requisito.

### AUD-036 — Distinguir retenção de pessoa física e jurídica

**Origem:** A03, 00:56–01:52.

**Classificação preliminar:** Defeito ou configuração a confirmar.

**Relato:** Durante o teste com pessoa física, o avaliador relata receber uma opção associada ao cadastro de pessoa jurídica e não conseguir avançar.

**Ação e evidência esperada:** Reproduzir com PF e PJ separadamente, conferir regras e parâmetros aplicáveis e corrigir a seleção de formulário/cálculo, sem utilizar a regra de PJ para PF.

### AUD-037 — Conferir entrada do valor de IR retido

**Origem:** A03, 01:23–02:08.

**Classificação preliminar:** Lacuna relatada; alcance a confirmar.

**Relato:** A fala indica que o sistema pede cálculo e não oferece a possibilidade esperada de informar o valor de imposto de renda retido.

**Ação e evidência esperada:** Conferir se é falta de parâmetro, ausência de entrada manual ou desenho do cálculo. Definir comportamento fundamentado e auditável; não liberar alteração arbitrária de tributo.

### AUD-038 — Classificar a natureza para os dados da Reinf

**Origem:** A04, 00:00–00:22.

**Classificação preliminar:** Verificação funcional.

**Relato:** É destacada a identificação da natureza e das configurações necessárias à Reinf.

**Ação e evidência esperada:** Conferir que a classificação selecionada realmente alimenta os dados exigidos pela integração, com domínio oficial e vigência.

### AUD-039 — Aplicar o enquadramento tributário do fornecedor

**Origem:** A04, 00:11–00:34.

**Classificação preliminar:** Lacuna de configuração relatada.

**Relato:** São citadas diferenças entre regime normal e Simples Nacional e informações que faltam para usar as opções visíveis.

**Ação e evidência esperada:** Conferir captura do enquadramento, vigência e consequências no cálculo, apoiadas em fonte; não concluir que toda optante tem o mesmo tratamento.

### AUD-040 — Demonstrar o efeito da retenção de INSS

**Origem:** A04, 00:34–01:02.

**Classificação preliminar:** Verificação funcional pendente.

**Relato:** INSS é citado entre as retenções cuja geração extraorçamentária não foi possível simular.

**Ação e evidência esperada:** Executar um cenário fundamentado e conferir obrigação, fonte, conta, pagamento e destino do valor.

### AUD-041 — Demonstrar o efeito da retenção de IR

**Origem:** A04, 00:34–01:02.

**Classificação preliminar:** Verificação funcional pendente.

**Relato:** Imposto de renda é citado no mesmo teste não concluído.

**Ação e evidência esperada:** Executar separadamente e conferir o tratamento pertinente à titularidade da receita; não copiar automaticamente a cadeia do INSS.

### AUD-042 — Demonstrar o efeito da retenção de ISS

**Origem:** A04, 00:34–01:02.

**Classificação preliminar:** Verificação funcional pendente.

**Relato:** ISS é citado no mesmo teste não concluído.

**Ação e evidência esperada:** Executar separadamente conforme sujeito ativo, regras aplicáveis e destino do valor retido.

### AUD-043 — Confirmar o código de fonte citado na retenção

**Origem:** A04, 00:50–01:02.

**Classificação preliminar:** Dúvida numérica.

**Relato:** A pessoa corrige conta/dotação para fonte. Uma segunda transcrição reconheceu “1869”, mas isso não confirma o código, sua pontuação nem sua aplicabilidade.

**Ação e evidência esperada:** Ouvir e confrontar com o leiaute e a classificação aplicáveis. Não gravar o número reconhecido automaticamente como código oficial.

### AUD-044 — Distinguir anulação de exclusão

**Origem:** A04, 01:08–01:35.

**Classificação preliminar:** Verificação funcional.

**Relato:** A conversa questiona se há exclusão; a resposta informa que não existe essa possibilidade.

**Ação e evidência esperada:** Confirmar o comportamento e preservar o histórico. Não registrar como defeito comprovado uma exclusão que não foi demonstrada.

### AUD-045 — Conferir cadastro de contas bancárias

**Origem:** A05, 00:00–00:09.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** São reconhecidos o cadastro e as opções bancárias.

**Ação e evidência esperada:** Manter a capacidade e verificar ligação com os movimentos e a conciliação.

### AUD-046 — Conferir movimentação bancária

**Origem:** A05, 00:00–00:09.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** A movimentação bancária é citada como opção existente.

**Ação e evidência esperada:** Operar a consulta e seus vínculos, sem tratar a observação como prova de execução completa.

### AUD-047 — Permitir conciliação manual

**Origem:** A05, 00:09–00:25.

**Classificação preliminar:** Melhoria ou lacuna relatada.

**Relato:** O operador só encontra conciliação condicionada ao upload de extrato e pede conciliação manual.

**Ação e evidência esperada:** Permitir o procedimento manual autorizado, com origem documental, diferenças e histórico; não inventar linhas bancárias.

### AUD-048 — Demonstrar conciliação por arquivo

**Origem:** A05, 00:09–00:41.

**Classificação preliminar:** Verificação funcional pendente.

**Relato:** Existe upload, mas não foi possível entender a execução nem observar resultado.

**Ação e evidência esperada:** Importar arquivo suportado e mostrar correspondências, pendências e efeito da conciliação.

### AUD-049 — Esclarecer e operar a integração de extrato por API

**Origem:** A05, 00:26–00:41.

**Classificação preliminar:** Verificação de integração.

**Relato:** É observada uma opção de API bancária sem comprovação de seu funcionamento.

**Ação e evidência esperada:** Identificar banco, canal e capacidades reais; diferenciar opção visual de conexão e leitura executadas.

### AUD-050 — Disponibilizar exemplo de conciliação concluída

**Origem:** A05, 00:47–00:53.

**Classificação preliminar:** Necessidade de demonstração.

**Relato:** O avaliador não encontra conciliação já realizada para entender o comportamento.

**Ação e evidência esperada:** Criar cenário de ensaio rastreável e concluí-lo pela interface, incluindo pendências tratadas.

### AUD-051 — Conferir consulta de pagamentos

**Origem:** A05, 01:01–01:11.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** A consulta de pagamentos é mencionada durante a navegação; os títulos exatos das telas não ficaram seguros.

**Ação e evidência esperada:** Localizar a consulta correspondente e conferir filtros, valores e acesso à origem com dados. Não inventar seu título oficial.

### AUD-052 — Conferir consulta de movimento diário

**Origem:** A05, 01:01–01:11.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** A consulta de movimento diário é mencionada durante a navegação; os títulos exatos das telas não ficaram seguros.

**Ação e evidência esperada:** Localizar a consulta correspondente e conferir filtros, valores e acesso à origem com dados. Não inventar seu título oficial.

### AUD-053 — Conferir consulta de receitas

**Origem:** A05, 01:01–01:11.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** A consulta de receitas é mencionada durante a navegação; os títulos exatos das telas não ficaram seguros.

**Ação e evidência esperada:** Localizar a consulta correspondente e conferir filtros, valores e acesso à origem com dados. Não inventar seu título oficial.

### AUD-054 — Rastrear a retenção até o movimento extra

**Origem:** A05, 01:12–01:39.

**Classificação preliminar:** Verificação funcional pendente.

**Relato:** É procurado o movimento extra originado pelo valor retido.

**Ação e evidência esperada:** Ligar o fato de retenção ao movimento pertinente e mostrar valor, obrigação e saldo, conforme seu tratamento aplicável.

### AUD-055 — Executar recolhimento da consignação

**Origem:** A05, 01:25–01:58.

**Classificação preliminar:** Verificação funcional pendente.

**Relato:** O operador procura como pagar/recolher o extra e não consegue concluir a demonstração.

**Ação e evidência esperada:** Executar recolhimento total e, se suportado, parcial, com vínculo à origem e saldo remanescente.

### AUD-056 — Localizar realizáveis separadamente de consignações

**Origem:** A05, 02:04–02:27.

**Classificação preliminar:** Lacuna de localização relatada.

**Relato:** A pessoa diz não encontrar os realizáveis e os distingue das consignações.

**Ação e evidência esperada:** Identificar o conceito no modelo e a ação esperada; disponibilizar a consulta/operação pertinente sem renomear consignação como realizável.

### AUD-057 — Conferir restos a pagar pela interface

**Origem:** A05, 02:27–02:52.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** Restos a pagar são reconhecidos entre as opções existentes.

**Ação e evidência esperada:** Preservar a função e confirmar caminho operacional sem declarar execução integral apenas pela presença da opção.

### AUD-058 — Separar arrecadação contábil de cadastro imobiliário

**Origem:** A05, 02:56–03:32.

**Classificação preliminar:** Melhoria de organização.

**Relato:** A tela de receita parece conduzir ao cadastro de imóvel e lançamento de tributos, confundindo a função contábil.

**Ação e evidência esperada:** Distinguir entrada contábil de arrecadação e gestão tributária, mantendo integração e ambas as funcionalidades.

### AUD-059 — Definir origem da importação do cadastro imobiliário

**Origem:** A05, 03:12–03:39.

**Classificação preliminar:** Decisão de integração.

**Relato:** Discute-se obter o cadastro do sistema tributário/banco legado, sem definição comprovada do canal.

**Ação e evidência esperada:** Identificar exportação ou integração autorizada e contrato de dados. Não prometer importação completa sem formato e acesso.

### AUD-060 — Posicionar certidões tributárias na área correta

**Origem:** A05, 03:41–04:33.

**Classificação preliminar:** Melhoria de organização.

**Relato:** Certidões negativas/positivas de débitos são identificadas como função tributária, não rotina contábil principal.

**Ação e evidência esperada:** Reorganizar navegação, preservando emissão, permissões e vínculos; não excluir a capacidade.

### AUD-061 — Preservar a arrecadação com conta, receita e fontes

**Origem:** A05, 04:33–04:47.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** A fala reconhece na arrecadação os dados de conta bancária, receita, divisão por fonte e receitas de retenção.

**Ação e evidência esperada:** Verificar o fluxo com dados e preservar esses campos; presença visual não comprova os efeitos.

### AUD-062 — Separar gestão de dívida ativa de seus efeitos contábeis

**Origem:** A05, 04:49–05:05.

**Classificação preliminar:** Melhoria de organização.

**Relato:** A dívida ativa é descrita como assunto tributário com reflexos nas contas contábeis e de controle.

**Ação e evidência esperada:** Manter os dois lados integrados, com navegação adequada e prevenção de reconhecimento duplicado.

### AUD-063 — Registrar nota de lançamento manual

**Origem:** A06, 00:00–00:16.

**Classificação preliminar:** Melhoria ou capacidade não localizada.

**Relato:** O sistema contabiliza automaticamente, mas o avaliador não encontra com clareza uma nota manual.

**Ação e evidência esperada:** Conferir entrada autorizada e auditável, com documento, histórico, contas, dimensões e partidas consistentes.

### AUD-064 — Corrigir ou reclassificar saldo entre contas

**Origem:** A06, 00:19–00:34.

**Classificação preliminar:** Pedido funcional.

**Relato:** É dado o exemplo de transferir saldo de uma conta para outra.

**Ação e evidência esperada:** Identificar o procedimento contábil correto e executar por novos fatos quando necessário; não editar saldo nem apagar o lançamento original.

### AUD-065 — Consultar plano de contas dentro do lançamento

**Origem:** A06, 00:35–00:57.

**Classificação preliminar:** Melhoria.

**Relato:** O formulário parece exigir digitar a conta inteira e abrir o plano em separado para consultar.

**Ação e evidência esperada:** Oferecer busca por código/descrição e seleção de conta válida no próprio fluxo.

### AUD-066 — Demonstrar o Diário com movimento

**Origem:** A06, 00:59–01:29.

**Classificação preliminar:** Necessidade de demonstração.

**Relato:** Diário é localizado, mas faltam dados para verificar sua operação.

**Ação e evidência esperada:** Gerar fatos no ensaio e percorrer o Diário até o lançamento e sua origem; menu vazio não comprova funcionamento.

### AUD-067 — Demonstrar o Razão com movimento

**Origem:** A06, 00:59–01:29.

**Classificação preliminar:** Necessidade de demonstração.

**Relato:** Razão é localizado, mas faltam dados para verificar sua operação.

**Ação e evidência esperada:** Gerar fatos no ensaio e percorrer o Razão até o lançamento e sua origem; menu vazio não comprova funcionamento.

### AUD-068 — Conferir Balancete de Verificação

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** O balancete de verificação é citado. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-069 — Conferir consulta por fonte de recursos

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** A fonte de recursos é citada nas consultas. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-070 — Conferir Balanço Orçamentário

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** O balanço orçamentário é citado. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-071 — Conferir Balanço Financeiro

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** O balanço financeiro é citado. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-072 — Conferir Balanço Patrimonial / Anexo 14

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** O balanço patrimonial e o Anexo 14 são procurados. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-073 — Conferir Demonstração das Variações Patrimoniais

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** A enumeração parece mencionar variações patrimoniais. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-074 — Conferir demonstrativo da dívida fundada

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** Dívida fundada parece ser citada na enumeração. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-075 — Conferir demonstrativo da dívida flutuante

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** Dívida flutuante parece ser citada na enumeração. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-076 — Conferir Demonstração dos Fluxos de Caixa

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** Fluxo de caixa aparece na enumeração. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-077 — Conferir notas explicativas

**Origem:** A06, 01:05–01:45.

**Classificação preliminar:** Verificação funcional; título a cotejar com o original.

**Relato:** Notas explicativas aparecem na enumeração. A enumeração falada contém trechos com reconhecimento imperfeito.

**Ação e evidência esperada:** Localizar o documento, conferir o modelo aplicável e executar com dados. Manter evidência própria e distinguir ausência de dados de ausência da função.

### AUD-078 — Conferir modelos conforme manuais oficiais

**Origem:** A06, 01:37–01:45.

**Classificação preliminar:** Verificação normativa solicitada.

**Relato:** A pessoa questiona aderência dos demonstrativos ao MCASP e às IPC; a sigla do manual aparece imperfeita na transcrição.

**Ação e evidência esperada:** Pesquisar fontes oficiais aplicáveis à versão/exercício; conferir estrutura e apuração, não apenas cabeçalho.

### AUD-079 — Conferir a gestão de custos

**Origem:** A06, 01:45–01:51.

**Classificação preliminar:** Reconhecimento de capacidade.

**Relato:** A gestão de custos é citada entre as funções básicas disponíveis.

**Ação e evidência esperada:** Verificar alimentação e consulta com dados; preservar a função.

### AUD-080 — Localizar e executar RREO

**Origem:** A06, 01:53–02:02.

**Classificação preliminar:** Verificação funcional.

**Relato:** A conversa procura os relatórios do Siconfi e identifica o RREO.

**Ação e evidência esperada:** Conferir acesso, parâmetros, apuração, exportação e distinção entre gerar e transmitir.

### AUD-081 — Localizar e executar RGF

**Origem:** A06, 01:56–02:08.

**Classificação preliminar:** Verificação funcional.

**Relato:** O RGF é procurado separadamente na navegação.

**Ação e evidência esperada:** Conferir acesso e operação com a abrangência correta, mantendo evidência própria.

### AUD-082 — Conferir SIOPE

**Origem:** A06, 02:02–02:20.

**Classificação preliminar:** Capacidade não localizada.

**Relato:** O nome SIOPE aparece na enumeração das prestações não localizadas.

**Ação e evidência esperada:** Identificar suporte existente, leiaute oficial e dados necessários; separar implementação, configuração e transmissão.

### AUD-083 — Confirmar e conferir SIOPS

**Origem:** A06, 02:02–02:20.

**Classificação preliminar:** Capacidade não localizada; nome a confirmar.

**Relato:** A enumeração parece citar SIOPS junto de SIOPE; o reconhecimento automático repete SIOPE.

**Ação e evidência esperada:** Reouvir o trecho antes de atribuir certeza ao nome. Se confirmado, conferir como integração independente.

### AUD-084 — Conferir Matriz de Saldos Contábeis

**Origem:** A06, 02:08–02:20.

**Classificação preliminar:** Capacidade não localizada.

**Relato:** A pessoa diz não ter visto a Matriz de Saldos Contábeis.

**Ação e evidência esperada:** Localizar ou completar a geração com dimensões e validações oficiais, sem confundir com PDF do balancete.

### AUD-085 — Conferir prestações específicas do estado

**Origem:** A06, 02:21–02:30.

**Classificação preliminar:** Verificação de abrangência.

**Relato:** Além das prestações federais, são mencionadas as específicas do estado.

**Ação e evidência esperada:** Conferir as obrigações aplicáveis à Paraíba e a capacidade real dos adaptadores, sem replicar obrigação de outro estado.

### AUD-086 — Tornar encontrável a preparação do próximo exercício

**Origem:** A06, 02:37–03:40.

**Classificação preliminar:** Melhoria de operação.

**Relato:** Winner relata que sabia que existia a função, mas não sabia demonstrar como preparar/importar o próximo ano.

**Ação e evidência esperada:** Disponibilizar caminho claro e operá-lo com usuário de planejamento, sem depender do desenvolvedor.

### AUD-087 — Abrir o exercício com as dotações da LOA correspondente

**Origem:** A06, 02:55–03:40.

**Classificação preliminar:** Verificação funcional.

**Relato:** A conversa esclarece que a execução do novo exercício deve utilizar as dotações de sua LOA; há autocorreção após citar PPA/LDO.

**Ação e evidência esperada:** Preservar a sequência de planejamento e aprovação; não copiar dotações diretamente do PPA como autorização de execução.

### AUD-088 — Dar acesso à seção Próximo exercício pela jornada de planejamento

**Origem:** A06, 03:41–03:49.

**Classificação preliminar:** Melhoria de localização.

**Relato:** Winner localiza uma seção Próximo exercício já criada para simplificar a demonstração.

**Ação e evidência esperada:** Reutilizar a capacidade; ligar a partir de PPA/LDO/LOA conforme pertinência, em vez de criar assistente duplicado.

### AUD-089 — Reajustar a previsão de receitas na proposta

**Origem:** A06, 03:49–03:58.

**Classificação preliminar:** Pedido funcional.

**Relato:** É relatada a pergunta sobre reajuste de receita.

**Ação e evidência esperada:** Permitir ajustar a proposta com base, abrangência, critério e prévia explícitos; não alterar arrecadações realizadas.

### AUD-090 — Reajustar despesas ou dotações na proposta

**Origem:** A06, 03:49–03:58.

**Classificação preliminar:** Pedido funcional.

**Relato:** É relatada separadamente a pergunta sobre reajuste de despesa/dotação.

**Ação e evidência esperada:** Permitir ajuste com seleção e prévia; conferir total e rastreabilidade, preservando o orçamento de origem.

### AUD-091 — Distinguir alteração da proposta de alteração na execução

**Origem:** A06, 04:02–04:35.

**Classificação preliminar:** Esclarecimento funcional.

**Relato:** A conversa pergunta se o ajuste acontece antes ou depois da abertura e distingue elaboração da LOA de mudanças no decorrer do exercício.

**Ação e evidência esperada:** Separar estados e operações; uma tela de planejamento não pode modificar livremente orçamento aprovado em execução.

### AUD-092 — Localizar a reestimativa da previsão de receita

**Origem:** A07, 00:00–00:12.

**Classificação preliminar:** Verificação funcional.

**Relato:** A segunda transcrição identifica explicitamente reestimativa de receita. A denominação exata da opção inicial ainda não está segura.

**Ação e evidência esperada:** Localizar a reestimativa da previsão e demonstrar seus efeitos no contexto correto; não substituir por uma operação de restituição.

### AUD-093 — Tornar encontrável a seção de fichas

**Origem:** A07, 00:12–00:43.

**Classificação preliminar:** Melhoria de navegação.

**Relato:** O avaliador havia visto a opção de fichas e não consegue reencontrá-la durante a conversa.

**Ação e evidência esperada:** Conferir nome, menu e atalhos; permitir voltar às fichas sem perder ente e exercício.

### AUD-094 — Conferir a opção fonte por natureza de receita

**Origem:** A07, 00:43–01:07.

**Classificação preliminar:** Verificação; final pouco claro.

**Relato:** É citada uma opção de classificação/fonte por natureza de receita; o final da conversa não ficou claro.

**Ação e evidência esperada:** Localizar a tela e identificar se é consulta ou configuração. Não confundir ficha de despesa com natureza de receita.

### AUD-095 — Tratar dotações não previstas originalmente

**Origem:** A08, 00:01–00:19.

**Classificação preliminar:** Decisão de regra a conferir.

**Relato:** O início cita dotações não previstas na LOA, mas depois a conversa volta à elaboração antes de aprovar.

**Ação e evidência esperada:** Separar criação na proposta de inclusão após aprovação, utilizando o procedimento legal aplicável. Não interpretar a fala como licença para criar dotação executável fora da autorização.

### AUD-096 — Cadastrar nova ficha orçamentária na elaboração

**Origem:** A08, 00:01–00:36.

**Classificação preliminar:** Pedido funcional.

**Relato:** É apontado o cadastro de ficha como entrada para novas despesas da LOA do exercício de destino.

**Ação e evidência esperada:** Permitir criar a ficha na proposta correta, validando classificação e vínculos, sem autorizar gasto por simples cadastro.

### AUD-097 — Pré-preencher a proposta com a importação do exercício anterior

**Origem:** A08, 00:37–00:44.

**Classificação preliminar:** Pedido funcional.

**Relato:** A pergunta é se a importação já deixa as informações preenchidas; a resposta é afirmativa.

**Ação e evidência esperada:** Demonstrar o reaproveitamento de dados suportados com seleção, origem e validação, sem exigir redigitação de tudo.

### AUD-098 — Localizar a reestimativa mencionada na LDO

**Origem:** A08, 00:46–00:50.

**Classificação preliminar:** Capacidade não localizada.

**Relato:** O avaliador diz não ter achado onde fazer a reestimativa na LDO.

**Ação e evidência esperada:** Conferir qual valor/etapa se pretende alterar, seu vínculo com as metas e a proposta; localizar ou completar o fluxo fundamentado.

### AUD-099 — Criar exercício de planejamento a partir da LOA

**Origem:** A08, 00:52–01:16.

**Classificação preliminar:** Lacuna de navegação relatada.

**Relato:** Dentro da LOA, a pessoa vê Anexo 1/exercício em execução e não encontra como criar o novo exercício.

**Ação e evidência esperada:** Oferecer ação autorizada de criar proposta/exercício de planejamento no próprio contexto, separada do relatório e da abertura contábil.

### AUD-100 — Editar os valores importados antes da aprovação

**Origem:** A08, 01:16–01:25.

**Classificação preliminar:** Pedido funcional.

**Relato:** Depois de criar o exercício e aproveitar os dados, o operador deve alterar valores antes de aprovar.

**Ação e evidência esperada:** Permitir edição versionada da proposta, com conferência e sem modificar o exercício de origem.

### AUD-101 — Levar os valores aprovados à execução de 2027

**Origem:** A08, 01:27–01:34.

**Classificação preliminar:** Pedido funcional.

**Relato:** A contabilidade de 2027 deve receber os valores aprovados para 2027.

**Ação e evidência esperada:** Vincular a execução à versão aprovada, sem puxar a última versão editável ou uma base de 2026 por engano.

### AUD-102 — Preservar integralmente 2026 ao preparar 2027

**Origem:** A08, 01:31–01:34.

**Classificação preliminar:** Regra funcional explícita.

**Relato:** É dito que a operação não mexe em 2026.

**Ação e evidência esperada:** Comparar registros e totais da origem antes/depois; impedir referências compartilhadas que alterem o ano anterior por edição do destino.

### AUD-103 — Explicitar o que o sistema reaproveita automaticamente

**Origem:** A08, 01:36–01:58.

**Classificação preliminar:** Melhoria de operação.

**Relato:** A preocupação do contador é ter de fazer manualmente o que esperava receber pronto; são citadas 15 prefeituras atendidas por duas pessoas.

**Ação e evidência esperada:** Exibir prévia do que será copiado, ajustado, recusado e exigirá complementação. Automatizar apenas o que tiver regra e dado suficientes.

### AUD-104 — Criar a LDO do exercício com reaproveitamento

**Origem:** A08, 02:05–02:14.

**Classificação preliminar:** Pedido funcional.

**Relato:** A LDO é citada separadamente entre as peças que precisam permitir criação e importação das informações anteriores.

**Ação e evidência esperada:** Conferir o exercício, versões, metas e ligações aplicáveis; preservar a peça de origem.

### AUD-105 — Criar a LOA do exercício com reaproveitamento

**Origem:** A08, 02:05–02:14.

**Classificação preliminar:** Pedido funcional.

**Relato:** A LOA é citada separadamente no pedido de criar e importar.

**Ação e evidência esperada:** Reutilizar o assistente existente se houver; conferir nova proposta, origem e critérios de aproveitamento.

### AUD-106 — Criar ou versionar o PPA com reaproveitamento adequado

**Origem:** A08, 02:05–02:40.

**Classificação preliminar:** Pedido funcional; ciclo a respeitar.

**Relato:** É pedido acesso à criação/importação também no PPA. A tela parece mostrar vigência e campos, mas a criação/importação não fica clara.

**Ação e evidência esperada:** Conferir criação e revisão dentro do ciclo plurianual aplicável; não criar automaticamente um novo PPA a cada ano por analogia com a LOA.

### AUD-107 — Reutilizar o processo de um exercício para o seguinte

**Origem:** A09, 00:00–00:15.

**Classificação preliminar:** Pedido de continuidade.

**Relato:** A conversa descreve repetir o aproveitamento entre exercícios.

**Ação e evidência esperada:** Não limitar a função a um par fixo 2026/2027; parametrizar origem/destino e impedir duplicações ou combinações inválidas.

### AUD-108 — Demonstrar planejamento seguido de execução

**Origem:** A09, 00:15–00:38.

**Classificação preliminar:** Prioridade de apresentação.

**Relato:** O contador pede impacto no dia a dia, não somente cadastro de fornecedor ou empenho.

**Ação e evidência esperada:** Ensaiar a preparação, aprovação e início da execução com efeitos reais, sem suprimir as rotinas cadastrais necessárias.

### AUD-109 — Incluir novas receitas após aproveitar a base

**Origem:** A09, 00:40–00:55.

**Classificação preliminar:** Pedido funcional.

**Relato:** Além de alterar valores, é citada a inclusão de novas receitas.

**Ação e evidência esperada:** Permitir incluir receitas na proposta de destino com classificações válidas e atualização dos totais.

### AUD-110 — Incluir novas despesas após aproveitar a base

**Origem:** A09, 00:40–00:55.

**Classificação preliminar:** Pedido funcional.

**Relato:** A inclusão de novas despesas é citada separadamente.

**Ação e evidência esperada:** Permitir incluir fichas/dotações na proposta de destino e conferir equilíbrio e vínculos.

### AUD-111 — Aplicar percentual em lote às receitas previstas

**Origem:** A09, 00:56–01:21.

**Classificação preliminar:** Pedido funcional.

**Relato:** O exemplo é aumentar o orçamento em 5%, aplicando o percentual às receitas.

**Ação e evidência esperada:** Tratar 5% como exemplo informado pelo operador, nunca constante; permitir recorte, prévia, precisão monetária e confirmação.

### AUD-112 — Aplicar percentual em lote às despesas previstas

**Origem:** A09, 01:06–01:21.

**Classificação preliminar:** Pedido funcional.

**Relato:** O mesmo exemplo aplica aumento às despesas.

**Ação e evidência esperada:** Executar como ação identificável, com seleção e prévia próprias; não pressupor que receitas e despesas sempre usem o mesmo índice.

### AUD-113 — Conferir e ajustar a alocação após o reajuste

**Origem:** A09, 01:18–01:24.

**Classificação preliminar:** Pedido funcional.

**Relato:** Depois do aumento, o contador quer conferir e alocar entre itens o que precisar.

**Ação e evidência esperada:** Permitir ajustes na proposta com reconciliação de totais e histórico, sem distribuir diferenças silenciosamente.

### AUD-114 — Manter a ligação do planejamento com as outras áreas

**Origem:** A09, 01:25–02:01.

**Classificação preliminar:** Esclarecimento de escopo.

**Relato:** É discutido que contratação e folha se relacionam ao planejamento e que a contabilidade recebe os efeitos das demais áreas.

**Ação e evidência esperada:** Conferir os vínculos existentes e as transições reais; não transformar cada área em cadastro desconectado.

### AUD-115 — Vincular a contratação à reserva orçamentária

**Origem:** A09, 02:01–02:17.

**Classificação preliminar:** Pedido funcional.

**Relato:** O processo licitatório é relacionado à reserva e à conferência de saldo da dotação.

**Ação e evidência esperada:** Operar reserva/vínculo e validar disponibilidade no procedimento aplicável, sem duplicar comprometimento ao empenhar.

### AUD-116 — Preservar a sequência resultado da licitação → contrato

**Origem:** A09, 02:17–02:29.

**Classificação preliminar:** Pedido funcional.

**Relato:** A conversa descreve julgamento e geração do contrato antes do empenho vinculado.

**Ação e evidência esperada:** Conferir a passagem de dados e a identidade dos documentos, sem redigitação desnecessária nem perda do vínculo.

### AUD-117 — Vincular contrato e número ao empenho

**Origem:** A09, 02:23–02:37.

**Classificação preliminar:** Pedido funcional.

**Relato:** É explicitamente pedida a possibilidade de informar o contrato no empenho.

**Ação e evidência esperada:** Preferir selecionar contrato cadastrado e compatível; manter seu número e vínculo consultáveis nos dois sentidos.

### AUD-118 — Conferir controles do contrato no empenho

**Origem:** A09, 02:40–02:59.

**Classificação preliminar:** Verificação de integração.

**Relato:** O áudio pede controles contábeis da execução contratual em geral. A separação por empenho é um desdobramento de verificação proposto nesta análise, não uma frase específica do áudio.

**Ação e evidência esperada:** Verificar se esta etapa produz efeito nas contas de controle segundo o roteiro aplicável; demonstrar o efeito devido ou documentar por que não há lançamento nesta etapa. Não criar lançamento só para preencher a matriz.

### AUD-119 — Conferir controles do contrato no liquidação

**Origem:** A09, 02:40–02:59.

**Classificação preliminar:** Verificação de integração.

**Relato:** O áudio pede controles contábeis da execução contratual em geral. A separação por liquidação é um desdobramento de verificação proposto nesta análise, não uma frase específica do áudio.

**Ação e evidência esperada:** Verificar se esta etapa produz efeito nas contas de controle segundo o roteiro aplicável; demonstrar o efeito devido ou documentar por que não há lançamento nesta etapa. Não criar lançamento só para preencher a matriz.

### AUD-120 — Conferir controles do contrato no pagamento

**Origem:** A09, 02:40–02:59.

**Classificação preliminar:** Verificação de integração.

**Relato:** O áudio pede controles contábeis da execução contratual em geral. A separação por pagamento é um desdobramento de verificação proposto nesta análise, não uma frase específica do áudio.

**Ação e evidência esperada:** Verificar se esta etapa produz efeito nas contas de controle segundo o roteiro aplicável; demonstrar o efeito devido ou documentar por que não há lançamento nesta etapa. Não criar lançamento só para preencher a matriz.

### AUD-121 — Conferir controles do contrato no estorno

**Origem:** A09, 02:40–02:59.

**Classificação preliminar:** Verificação de integração.

**Relato:** O áudio pede controles contábeis da execução contratual em geral. A separação por estorno é um desdobramento de verificação proposto nesta análise, não uma frase específica do áudio.

**Ação e evidência esperada:** Verificar se esta etapa produz efeito nas contas de controle segundo o roteiro aplicável; demonstrar o efeito devido ou documentar por que não há lançamento nesta etapa. Não criar lançamento só para preencher a matriz.

### AUD-122 — Relacionar ordem de serviço à execução contratual

**Origem:** A09, 03:00–03:17.

**Classificação preliminar:** Pedido condicional.

**Relato:** A conversa menciona controle do contrato para liquidar mediante ordem de serviço, quando pertinente.

**Ação e evidência esperada:** Conferir a ligação entre ordem, execução/ateste e liquidação conforme o tipo de contrato.

### AUD-123 — Relacionar aquisição/ordem de fornecimento à liquidação

**Origem:** A09, 03:00–03:17.

**Classificação preliminar:** Pedido condicional; termo exato a confirmar.

**Relato:** Aquisição é citada como alternativa à ordem de serviço no controle da execução.

**Ação e evidência esperada:** Confirmar o documento referido e ligar recebimento à liquidação, sem presumir que todos os contratos são serviços.

### AUD-124 — Permitir entrada manual de referências quando não há integração

**Origem:** A09, 03:17–03:31.

**Classificação preliminar:** Decisão de integração.

**Relato:** A fala final admite que certas informações possam ser digitadas, sem integração automática obrigatória com todos os sistemas.

**Ação e evidência esperada:** Identificar quais referências podem ser declaradas com suporte e validação; não exigir integração inexistente nem permitir identificadores arbitrários como se fossem oficialmente confirmados.

## Controle de cobertura

| Áudio | Itens preservados/desdobrados |
|---|---:|
| A01 | 26 |
| A02 | 8 |
| A03 | 3 |
| A04 | 7 |
| A05 | 18 |
| A06 | 29 |
| A07 | 3 |
| A08 | 12 |
| A09 | 18 |

A contagem inclui reconhecimentos de funções, dúvidas e repetições. Não deve ser usada como total de bugs. Os quatro itens de efeitos contratuais são desdobramentos explícitos de verificação; sua existência não pressupõe lançamento em todas as etapas.

## Ambiguidades que não autorizam implementação por suposição

- A01, início: nome do campo relacionado ao Tribunal; não há certeza entre lei, leiaute ou outro termo.
- A01, cerca de 03:03: significado da categoria associada ao contrato. Cerca de 03:17: dívida fundada deve ser cotejada; convênio ficou mais claro na segunda passagem.
- A02, cerca de 02:18: “pede duas vezes” não prova retenção em duplicidade. É preciso identificar os campos.
- A02/A03: configuração tributária e mensagem exigida precisam ser identificadas na tela. Não há base segura para afirmar que o bloqueio era do exercício.
- A04, cerca de 00:50: a pessoa corrige conta/dotação para fonte; “1869” é somente reconhecimento automático, não classificação oficial validada.
- A06, enumeração dos relatórios: títulos e siglas têm reconhecimento imperfeito. RGF e Matriz de Saldos são claros; SIOPS, notas explicativas e siglas dos manuais exigem cotejo do original. Não excluir a hipótese nem declarar a certeza.
- A07: reestimativa de receita ficou mais clara na revisão; o final continua pouco inteligível. Não deduzir uma função de restituição.
- A09, final: confirmar o documento de aquisição/fornecimento mencionado e quais referências podem ser digitadas sem integração.

## Apêndice — transcrição automática integral de apoio

**Atenção:** texto não revisado palavra por palavra e não certificado como literal. Contém termos mal reconhecidos, pausas e possíveis repetições artificiais. Serve para localizar a fala, não para decidir uma regra. As interpretações cuidadosas estão no inventário; trechos revistos por segundo modelo aparecem depois. Não há identificação garantida de cada locutor.

### A01 — WhatsApp Ptt 2026-10-09 at 12.27.27 PM.ogg

- **00:00–00:05:** um campo leia aqui no Tribunal de Contas, deve ser o obstáculo que você estava.
- **00:05–00:10:** - Nem sem a paraíba, né? - É, execução.
- **00:10–00:13:** Aí a gente entra para o principal, o que é execução.
- **00:13–00:15:** Empenho, liquidação e pagamento.
- **00:15–00:20:** Estorno de empenho, estorno de liquidação, estorno de pagamento.
- **00:20–00:26:** Então, é aqui que você vai, no escorno de empenho,
- **00:26–00:30:** você vai buscar a adotação que você criou lá na loa, né?
- **00:30–00:34:** Então ele tem que ter a possibilidade de conseguir consultar de lá
- **00:34–00:39:** a adotação que ele criou na loa, ele não pode simplesmente digitar qualquer número.
- **00:39–00:42:** - Hum hum. - Tem que estar dentro da loa, né?
- **00:42–00:43:** Do município.
- **00:43–00:48:** E hoje você vai colocar qualquer adotação, qualquer valor,
- **00:48–00:52:** quem que é o credor, é...
- **00:52–00:54:** A questão...
- **00:54–00:59:** Eu não consegui cadastrar o empenho no dia que eu fui testada, depois deu alguns erros.
- **00:59–01:01:** - Hum hum. - É...
- **01:01–01:05:** Eu achei a parte de consulta de credora que...
- **01:05–01:07:** Eu achei que ela não está muito funcional.
- **01:07–01:10:** Você foi despegar por CPJ ou CPF?
- **01:10–01:13:** É, tipo...
- **01:13–01:15:** Porque normalmente você é...
- **01:15–01:20:** Normalmente se coloca uma lupa, alguma coisa assim, para fazer a busca, né?
- **01:20–01:26:** Aqui tem um botão a parte, só que ele nunca busca, então eu não sei se na verdade o cadastro credor não tem cadastro.
- **01:26–01:28:** Então...
- **01:28–01:32:** Aqui o que a gente pensou no campo do credor é que quando você digita o CPF,
- **01:32–01:35:** o CPJ ou tal nome dele aparecer.
- **01:35–01:36:** Direto já, sabe?
- **01:36–01:38:** Hum hum. É...
- **01:38–01:43:** Eu até cheguei, tenta olhar o cadastro de credores, né?
- **01:43–01:43:** Hum hum.
- **01:43–01:45:** Para ver, deixa eu ver aqui, você acha?
- **01:45–01:49:** E peguei um CPF no dia e ele não estava buscando,
- **01:49–01:51:** um que estava lá no cadastro de credores.
- **01:51–01:52:** - Deixa eu... - Deixa eu pegar aqui.
- **01:52–01:55:** - Confirmar aqui agora também. - Deixa eu fazer um teste.
- **01:55–01:57:** Hoje eu não sei, no dia que eu fui fazer eu não consegui.
- **01:57–01:58:** Aham.
- **01:58–02:03:** Porque ele não estava dando certo, deixa eu ver aqui.
- **02:03–02:09:** É, ele não está certo.
- **02:09–02:13:** Recopei com a sentuação, deixa eu tirar uma sentuação para ver se ele vai.
- **02:13–02:19:** Bom, eu peguei o CPF que aparece na lista de credor,
- **02:19–02:22:** eu acredito, eu não sei se é uma lista de fictícia,
- **02:22–02:26:** ou seja, de fato existe os cadastros lá do que está demonstrando lá na tela do credor.
- **02:26–02:29:** Ah, pode ser que ele está não está repuxando, que está fictício,
- **02:29–02:31:** mas ele deveria puxar assim.
- **02:31–02:35:** Aí ele não está puxando, então assim, aí ele fala que tem que fazer o cadastro.
- **02:35–02:37:** Aham.
- **02:37–02:44:** E aí deixa eu ver se ele vai permitir fazer o cadastro, cadastrar este credor.
- **02:44–02:48:** Aí ele vai para a parte de cadastrar, mas ele já devia aparecer o...
- **02:48–02:51:** É, já deveria aparecer.
- **02:51–02:59:** Mas ele tem que ocupar de colocar credor, a ficha, que é a dotação,
- **02:59–03:02:** o tipo, se é o dinário global estimativo,
- **03:02–03:06:** a categoria que exige somente o ponto de for de contrato.
- **03:06–03:08:** Deixa eu ver aqui.
- **03:08–03:13:** Eu não vi opção aqui, você vinculou em pênio,
- **03:13–03:16:** ordem de compra,
- **03:16–03:23:** tempo de possibilidade de colocar com pênio, obra de vida soldada,
- **03:23–03:29:** a natureza, a fonte, a ficha,
- **03:29–03:37:** eu acho que falta alguma classificação da...
- **03:37–03:42:** É, eu não vou pegar para a dotação.
- **03:42–03:53:** Em vez de liquidação aqui, liquidação,
- **03:53–04:05:** a fila para pagar, eu vi que ele já demonstra aqui como valor,
- **04:05–04:11:** liquidação, anulação, estorno, anulamento descontável.
- **04:11–04:12:** É...
- **04:12–04:15:** Tem integração com o rinfo?
- **04:15–04:19:** Nossa, as integrações são todas desligadas ainda.
- **04:19–04:22:** A gente já soca esse ambiente só para de apresentação mesmo.
- **04:22–04:25:** Que é o primeiro que a gente tem para o cliente.
- **04:25–04:28:** Mas a gente precisa descender a gração com o rinfo.
- **04:28–04:31:** É, precisa descender a gração com o rinfo para retenções,
- **04:31–04:34:** não feitas na liquidação.
- **04:34–04:35:** É isso, deixa eu ver.
- **04:35–04:39:** Esse FD rinfo, pede esse federal?
- **04:39–04:46:** Rinfo de série 2000 e 4000.
- **04:46–04:54:** Você precisa de IAS sequences, que é IAS-S em Poche-Rena.
- **04:54–04:57:** Eu vou colocar para me integrar isso.
- **04:57–05:00:** É...
- **05:00–05:05:** A liquidação tem a possibilidade de fazer retenção,
- **05:05–05:09:** ver como funciona a retenção aqui.
- **05:09–05:20:** A gente vai fazer uma liquidação.
- **05:20–05:24:** Tem nenhum aqui, a liquida...
- **05:24–05:33:** Se você digitar dentro do campo, acho que vai aparecer clicar dentro dele, parece 4.
- **05:33–05:40:** Não, aqui ele só tem a pagar, o que é o Mãe Mite e o Rolbe aqui.
- **05:40–06:15:** Eu coloco retenção.
- **06:15–06:16:** Não achei.

### A02 — WhatsApp Ptt 2026-10-09 at 12.33.08 PM.ogg

- **00:01–00:02:** dentro de qual aba?
- **00:02–00:03:** A liquidação é isso?
- **00:03–00:05:** Não é liquidação.
- **00:05–00:06:** Pode ser que eu nem tenha visto isso.
- **00:06–00:10:** Eu acho que nem implantei isso no caso.
- **00:10–00:12:** Quando eu consulto a liquidação,
- **00:12–00:14:** ele aparece na informação de retenções,
- **00:14–00:16:** mas eu não achei onde por lanço.
- **00:16–00:18:** Quando eu vou fazer a liquidação, ele está bem simples.
- **00:18–00:21:** Ele não está me dando a opção de colocar a nossa fiscal,
- **00:21–00:24:** só tem histórico, né?
- **00:24–00:27:** A fiscal conferida opcional.
- **00:27–00:32:** Então, tipo, ele não me traz a opção de pôr números de nossa fiscal, chave.
- **00:32–00:33:** E precisa?
- **00:33–00:35:** Peraí, precisa.
- **00:35–00:39:** Só mesmo por questão do rei, se você vai precisar.
- **00:39–00:41:** Aí ele tem que ter opção, né?
- **00:41–00:43:** Se pagamento é com a nossa fiscal ou não,
- **00:43–00:46:** que é o que você define lá no entendo, normalmente.
- **00:46–00:47:** Hum hum.
- **00:47–00:49:** Ou na sua liquidação.
- **00:49–00:53:** Você coloca o seu nosso fiscal, tem que pôr o número da nota e tudo o mais.
- **00:53–00:57:** E aí tem a parte de retenções.
- **00:57–01:00:** Então, quando eu cliquei aqui,
- **01:00–01:02:** será que ele está no pagamento, no seu sistema?
- **01:02–01:07:** Deixa eu aplicar aqui no pagar.
- **01:07–01:17:** O pagamento é empenhado, liquidado, apagar.
- **01:17–01:20:** Tenta fazer um pagamento aqui.
- **01:20–01:35:** Pagamento.
- **01:35–01:38:** Quedação, número da ordem.
- **01:38–01:42:** Valor, data do pagamento.
- **01:42–01:54:** Então, pagamento de ordem para uma lógica, retenção na fonte.
- **01:54–02:00:** Aí ele está fazendo no pagamento.
- **02:00–02:04:** Não posso acreditar para fazer antes também, né?
- **02:04–02:11:** Aí depende muito de como que é a regra do tribunal, né?
- **02:11–02:13:** Do tribunal.
- **02:13–02:16:** Normalmente você coloca a retenção na liquidação.
- **02:16–02:17:** Então.
- **02:17–02:29:** Aí depende muito de consignação, valor retido.
- **02:29–02:35:** Ele perde duas vezes.
- **02:35–02:40:** O que tu aplicou?
- **02:40–03:59:** Que você fala, você tem atrás a possibilidade de colocar qualquer natureza do bem ao serviço, conforme a tabela, né?
- **03:59–04:03:** Mas não tem a tabela para consultar a natureza.
- **04:03–04:06:** Deberia ter no caos também.
- **04:06–04:11:** Mas tem a tabela, né? Para consultar, porque não é um campo digitável.
- **04:11–04:18:** Então, teoricamente, ele tem que trazer os dados para escolher a natureza.
- **04:18–04:24:** Ele tem uma possibilidade aqui, mas ele não está funcionando.
- **04:24–04:27:** O single.
- **04:27–04:31:** Aí ele traz a questão do ISS e tal.
- **04:31–04:38:** Tem cadastral.
- **04:38–04:41:** O conhecedor não tem perdi o cadastral.
- **04:41–04:44:** O simples nacional de Espanha, município, cadastro.
- **04:44–04:47:** Em cadastro de pessoas.
- **04:47–04:48:** Deixa eu ver aqui.
- **04:48–04:49:** Cadastro.
- **04:49–04:54:** Cadastro de pessoas.
- **04:54–05:00:** Cadastro de pessoas.
- **05:00–05:07:** Eu sei que fornecer na área.
- **05:07–05:17:** Eu sei que.
- **05:17–05:29:** Eu invito o itamigre que é o fornecer na área.

### A03 — WhatsApp Ptt 2026-10-09 at 12.35.23 PM.ogg

- **00:06–00:08:** Rafael Costa Nunes
- **00:08–00:27:** Ele fala que eu tenho que definir o que é que é
- **00:27–00:30:** Tanto fiscais
- **00:30–00:55:** Tem a possibilidade de fazer as configurações aqui
- **00:55–00:57:** Vamos ver se ele vai reconhecer
- **00:57–01:14:** O vc do pessoal física deve ser que ele está vendo
- **01:14–01:15:** Não entende
- **01:15–01:18:** O vc do pessoal física
- **01:18–01:25:** Ele quer que eu faça o cal
- **01:25–01:29:** O poste de renda
- **01:29–01:33:** Não me deixa colocar o valor da retenção do poste de renda
- **01:33–01:39:** Não achei aqui onde eu coloco a opção de valor de retenção do poste de renda
- **01:39–01:41:** Precisa esse caminho
- **01:41–01:45:** Ele não traz para mim o valor
- **01:45–01:48:** Ele está me trazendo uma opção conforme o cadágio
- **01:48–01:51:** Quando é pessoa jurídica
- **01:51–01:55:** Não consegui avançar aqui
- **01:55–02:04:** Um minutinho

### A04 — WhatsApp Ptt 2026-10-09 at 12.38.42 PM.ogg

- **00:00–00:10:** Ele tem a possibilidade de identificar qual é a natureza, as configurações necessárias que são exigidas para você poder mandar o reino.
- **00:10–00:22:** Se é a empresa lá, tem diferença nas alíquotas, se é normal, se era do cintos nacional, qual é a disputação que ela tem.
- **00:22–00:29:** Então ele tem visualmente aquele demônso de opções, mas não conseguiu usá-las.
- **00:29–00:31:** Sim.
- **00:31–00:33:** Falta algumas informações.
- **00:33–00:49:** Aí aqui no pagamento, eu não consegui, ele está no pagamento, é a retenção esforçamentária, tanto para INSS, post-renda ou ISS,
- **00:49–01:01:** que aí o sistema tem que gerar retenção na conta de 18,619, na dotação de 18,619, na fonte do Desculpa de 18,619, mas eu não consigo simular para saber se está fazendo de fato.
- **01:01–01:06:** Então você tem como demonstrar que a retenção é feita no pagamento.
- **01:06–01:08:** Entendi.
- **01:08–01:19:** Entendo os restos em liquidação, anulações e stories, então você tem a possibilidade de alular um empenho, uma liquidação em pagamento,
- **01:19–01:30:** que é uma rotina necessária, que é um negócio de empenho, que está deixando excluir.
- **01:30–01:35:** Não, não tem a possibilidade de exclusão, não.
- **01:35–01:39:** Empenhado.
- **01:39–01:43:** Daí eu estou mudando lá, só para quente.
- **01:43–01:45:** Fala, senhor.

### A05 — WhatsApp Ptt 2026-10-09 at 12.45.31 PM.ogg

- **00:00–00:05:** Tem a questão de casas de contas bancárias, tem movimentação bancária,
- **00:05–00:08:** eu vi que ele tem uma possibilidade de conciliação bancária,
- **00:08–00:16:** só que aqui parece que a conciliação bancária ela está atrelada especificamente a subir um estrada bancária.
- **00:16–00:21:** Eu não tenho a possibilidade de fazer uma conciliação manual,
- **00:21–00:25:** sabe o que vai subir o arquivo, e aí eu não consigo saber o que que de fato ela faz, né?
- **00:25–00:26:** Sim.
- **00:26–00:29:** Ele fala que tem a possibilidade de encortar as contradas bancárias,
- **00:29–00:34:** eu vi que você tem a possibilidade da API do banco, né, dos estrados,
- **00:34–00:41:** mas eu não sei o que que... como que é essa conciliação, como que ele executa a conciliação,
- **00:41–00:43:** mas a conciliação bancária tem aqui.
- **00:43–00:46:** Sim, eu pensei simples no caso até aí.
- **00:46–00:53:** É, então eu não consigo ver uma conciliação já feita
- **00:53–00:56:** para entender como que vai se comportar.
- **00:56–00:58:** E aí...
- **01:01–01:10:** Aqui... consultas... aí são consultas, pagamentos, movimento diário, receita-meis amêndo...
- **01:10–01:12:** Então assim, tem o básico.
- **01:12–01:18:** Aí movimento extra, que é o que eu queria ver aqui, é o que vai gerar das retenções, né?
- **01:18–01:20:** Que foi o retido.
- **01:20–01:25:** Aqui tem as opções de você movimentar, e depois tem que ver...
- **01:25–01:29:** Deixa eu ver aqui se ele tem a possibilidade de pagar o extra.
- **01:30–01:32:** O pôr do lançamento.
- **01:32–01:39:** Ele mostra os lançamentos e o recolhimento.
- **01:39–01:41:** O pôr aqui...
- **01:41–01:43:** E ele pante.
- **01:46–01:51:** Aí você faz o pagamento no pôr o recolhimento.
- **01:51–01:53:** Não achei...
- **01:57–02:00:** Ah, deixa eu ver...
- **02:04–02:06:** O consenso retido na folha.
- **02:08–02:16:** Tem aqui nas consignações, eu não achei que são os realizáveis, que são diferentes.
- **02:16–02:18:** O comportamento.
- **02:18–02:21:** Mas deve ser os exemplos aqui que não tem.
- **02:27–02:35:** Então tem a liquidade de apagar, se tornar, tem liquidade de só pôr do pagamento, tem questão de restos apagar.
- **02:35–02:41:** Tem a questão de extra-cementário, que é as retenções.
- **02:41–02:44:** Tem essas opções.
- **02:44–02:51:** Então ele está base... porque a parte contável entra em liquidação para o pagamento.
- **02:51–02:55:** A exedição é básica, e é forçamentário.
- **02:55–02:57:** Aí tem a recadação de receitas.
- **02:57–03:01:** A recadação de receitas eu não entendi porque...
- **03:01–03:11:** Eu acho que o sistema não sei se ele é todo para todas as áreas, mas aqui ele está trazendo meio que o cadácio imobiliário, o cadácio do imóvel.
- **03:11–03:18:** Então ele meio que está trelando lançamentos de tributos para os cadastros imóvels.
- **03:18–03:25:** Então não sei, provavelmente vocês vão fazer uma importação dos cadastros imóvels do sistema tributário para lançar aqui,
- **03:25–03:32:** para já gerar as notas de lançamento de saúde inicial, quando gerar os impostos.
- **03:32–03:36:** Mas... não sei como que vocês vão pegar esses dados.
- **03:36–03:38:** É provavelmente do banco de dados que tem lá deles.
- **03:38–03:40:** Não.
- **03:40–03:42:** Aí certidões...
- **03:42–03:48:** Me parece que essa certidão está mais lentada a parte tributária do que contável.
- **03:48–03:54:** Então eu já acho que já é outro sistema, não é o contabilidade.
- **03:54–03:56:** Eu acho que se não me engano essas certidões são...
- **03:56–04:00:** Da empresa, não é? Está com os tributos indígenas?
- **04:00–04:02:** Do mais que elas certidões de positivos?
- **04:04–04:08:** É, porque essas certidões, quando o município emite, né?
- **04:08–04:14:** Dito que eu estou com as asas indígenas, eu não tenho muito experiência aqui com as casas.
- **04:14–04:22:** É, aqui está mais parecendo que seria uma certidão que o município permite para uma empresa dele.
- **04:22–04:26:** Vamos dizer assim, a empresa precisa de uma certidão negativa de débitos.
- **04:26–04:28:** Me pareceu isso.
- **04:28–04:32:** Aí não é uma função contável, né? Isso é uma função mais tributária.
- **04:32–04:36:** Aí aqui ele tem a parte de regadação de receitas, anulação de estorno.
- **04:38–04:46:** O município forma tudo certinho, qual que é a conta bancária, receita, divisão profunda, receitas de retenção.
- **04:46–04:48:** Então ele tem o básico, né?
- **04:48–04:54:** Dividativo, aqui é uma questão tributária, então ele está meio para ver aqui, porque também vai para contabilidade,
- **04:54–05:00:** para ter contabilidade é mais lançamentos nas contas pecadas, que, né?
- **05:00–05:02:** De controle, que são as nossas lançamentos.
- **05:04–05:08:** O básico tem, né? O básico tem tudo.
- **05:12–05:14:** Contabilidade, tem para as de contas.

### A06 — WhatsApp Ptt 2026-10-09 at 12.50.09 PM.ogg

- **00:00–00:10:** Eu vi que o sistema 5 é contabilização, mostro tudo certinho, mas não sei se eu consigo fazer alguma nota de lançamento,
- **00:10–00:16:** alguma alteração da contabilização de forma manual, tudo o automático e o sistema, entendeu?
- **00:16–00:19:** Precisa fazer manual também, que deixaram o caso habilitado.
- **00:19–00:25:** Teria que deixar, porque se o contador quiser fazer uma aumentação de uma conta diferente do que
- **00:25–00:32:** o transferir o saldo de uma conta para outra, ele tem que ter essa possibilidade, eu não sei se existe essa possibilidade.
- **00:32–00:34:** Ah não, tem que registrar o lançamento original.
- **00:34–00:38:** Deixa eu ver qual é a de conta.
- **00:38–00:45:** Só que ele está dando, eu tenho que digitar a conta inteira, ele não tem uma consulta de conta.
- **00:45–00:50:** Ele tem a possibilidade aqui, mas...
- **00:50–00:53:** - Você melhorou. - Eu tenho que digitar a sua conta.
- **00:53–00:59:** Tem que abrir o plano de conta para ele consultar, ele já fala de conta mais fácil.
- **00:59–01:05:** Livre de área e razão tem aqui, só não tem informação.
- **01:05–01:09:** Diária e razão, balança de verificação, quão de recurso tem?
- **01:09–01:17:** Tem balança por cementário, financeiro, patrimonial, variação de vida fundada, futebolante,
- **01:17–01:21:** futebolante de cacha, futebolante de cacha, educação, nossas aplicativas.
- **01:21–01:25:** Então assim, o básico tem tudo, se funciona a sua função, não é?
- **01:25–01:28:** - Sim, não. - Mas tem todas as informações,
- **01:28–01:30:** tem que básicas principais, né?
- **01:30–01:36:** Eu não vi questão a balança patrimonial para o 14, tem aqui, financeiro.
- **01:36–01:44:** Eu não sei se são as digestões tudo conforme a INCAP e as IPC,
- **01:44–01:51:** que é algo que tem que verificar, custos, tem gestão de custos, dígitos.
- **01:51–01:52:** É o básico a isso.
- **01:52–01:56:** A impressão de contas tem as do SICONF, né?
- **01:56–02:02:** Aqui tem HELL, não achei, cadê a RGF?
- **02:02–02:08:** HELL, a RGF, aí tem SIOPE, SIOPE, que eu não vi aqui.
- **02:08–02:13:** Matriz de São descontáveis, também não vi aqui.
- **02:13–02:19:** Que são as pessoas de contas do SICONF, que é a cenívio federal, né?
- **02:19–02:21:** Todo o país.
- **02:21–02:25:** Aí tem as específicas do estado que tem que verificar.
- **02:25–02:29:** Cadastro de organizade, pessoas.
- **02:29–02:33:** Basicamente é isso, né?
- **02:33–02:34:** O básico.
- **02:34–02:37:** Que que você precisaria que eu desclarecer?
- **02:37–02:40:** Então, ele fez uma pergunta para mim no dia.
- **02:40–02:44:** E aí ele, "Ah, como que eu faço um plano por ano que vem?
- **02:44–02:47:** Como que eu importo o plano que vem?"
- **02:47–02:50:** E aí eu falei, tipo assim, aí eu pensei na minha cabeça.
- **02:50–02:54:** Eu sei que faz isso, mas eu não sei como que eu faria isso, entendeu?
- **02:54–02:58:** Aí o que ele está falando é justamente a questão da LOA, né?
- **02:58–03:03:** Ele fez o PPA, ele deu aí a LOA e ele precisa abrir o próximo exercício.
- **03:03–03:05:** Quando ele abre o próximo exercício,
- **03:05–03:10:** ele tem que abrir com as dotações que ele criou no PPA,
- **03:10–03:11:** e ele dá aí na LOA, né?
- **03:11–03:12:** Na verdade, é a LOA, né?
- **03:12–03:15:** Que ele precisa para abrir o plano por ano que vem.
- **03:15–03:19:** Então, aqui está com o exercício de 2020-6.
- **03:19–03:21:** Ele vai saber como que ele cria.
- **03:21–03:25:** Então, você tem que ir lá, abrir no PPA, um exercício novo,
- **03:25–03:33:** cadastrar as informações da LDO e a LOA para 2027.
- **03:33–03:35:** É quando ele abrir o exercício de 2027,
- **03:35–03:40:** na contabilidade, tem que fazer as dotações que ele criou lá na LOA de 2027.
- **03:40–03:46:** Eu estou vendo aqui agora que tem uma sessão que a gente criou próximo exercício,
- **03:46–03:49:** que era para ficar mais simples de demonstrar para ele.
- **03:49–03:52:** Aí ele perguntou "Ah, mas eu quero colocar um reajuste,
- **03:52–03:58:** quero colocar um reajuste de receita, de despesa, dotação".
- **03:58–04:01:** Enfim, ele fez algumas perguntas lá que eu falei no canal.
- **04:01–04:05:** E Felipe, ele perguntou antes de abrir ou depois de abrir?
- **04:05–04:06:** Sistema?
- **04:06–04:07:** É.
- **04:07–04:11:** Ele perguntou antes de abrir ou depois de abrir o plano que ele te perguntou?
- **04:11–04:14:** Ele perguntou como é que ele ia fazer?
- **04:14–04:17:** É, porque assim, primeiro ele vai fazer a LOA dele,
- **04:17–04:19:** que é na receita predista.
- **04:19–04:21:** Então ele vai ter que abrir um exercício para 2027
- **04:21–04:23:** e cadastrar a LOA dele.
- **04:23–04:26:** Aí ele vai poder mudar o valor de receita e descer para o próprio exercício,
- **04:26–04:28:** incluir novas dotações e tudo mais.
- **04:28–04:34:** No decorrer do exercício, tem uma opção aqui que eu vi, que é...

### A07 — WhatsApp Ptt 2026-10-09 at 12.51.16 PM.ogg

- **00:00–00:06:** receitas, reprevisão. Então ele vai conseguir fazer uma restitucional de receita ali.
- **00:06–00:12:** E aí depois, aí já vai ser lá na onde ele...
- **00:12–00:25:** Deixa eu ver aqui um pouco, eu tinha visto a opção aqui, não achei, agora eu não estou achando.
- **00:25–00:31:** A receita... onde que foi que eu vi?
- **00:31–00:38:** Onde tem fichas?
- **00:38–00:39:** Fichas...
- **00:39–00:42:** Eu tinha me lido era fichas, eu não...
- **00:42–00:52:** A declassificação, fonte por natureza de receita...
- **00:52–00:59:** De qual? A recepção?
- **00:59–01:06:** E sem problema mental.

### A08 — WhatsApp Ptt 2026-10-09 at 12.54.06 PM.ogg

- **00:00–00:09:** É que ele consegue criar novas dotações, né?
- **00:09–00:11:** Que ele não tiver previsto na loa.
- **00:11–00:18:** Essa cadastrar ficha orçamentária, onde você pode indicar pra ele,
- **00:18–00:23:** que é onde ele vai estar criando novas, mas ele tem que fazer a loa.
- **00:23–00:26:** Já de ano 27, no caso dele, ele criou uma loa primeiro,
- **00:26–00:29:** agora ele vim em cadastrar a ficha orçamentária dela.
- **00:29–00:33:** Isso, é no ficha de orçamentárias que ele coloca novas despesas, né?
- **00:33–00:35:** Aham, mas aí...
- **00:35–00:36:** Mas aí...
- **00:36–00:37:** Prevista na loa.
- **00:37–00:39:** Tá, mas no caso, se ele importar tudo de um ano pro outro,
- **00:39–00:41:** não fica errado do preenchido?
- **00:41–00:42:** Fica.
- **00:42–00:44:** Aí já fica errado do preenchido pra ele.
- **00:44–00:46:** Isso, só que é aquele negócio que a gente fazia.
- **00:46–00:49:** Eu não achei que ia fazer a reistima ativa lá na LDO, né?
- **00:49–00:52:** Mas o que ele tem que fazer é tipo assim...
- **00:52–00:56:** Eu não sei se o tema vai permitir, mas por exemplo,
- **00:56–00:59:** você está aqui, você entra ali na loa,
- **00:59–01:00:** lei o orçamentário anual.
- **01:00–01:03:** Aí o que ele tem que conseguir fazer aqui,
- **01:03–01:05:** é abrir um novo exercício aqui,
- **01:05–01:07:** criar um novo exercício.
- **01:07–01:10:** Dentro da loa mesmo, que só está aparecendo a Nexon 1, né?
- **01:10–01:13:** É, aqui só parece exercício em execução.
- **01:13–01:16:** Aí ele tem que conseguir criar um novo exercício.
- **01:16–01:17:** Quando ele criar um novo exercício,
- **01:17–01:20:** todas essas informações vão para um novo exercício,
- **01:20–01:25:** e ele pode alterar os valores antes de aprovar.
- **01:25–01:26:** Entendeu?
- **01:26–01:27:** Entendi.
- **01:27–01:30:** Aí depois de aprovado, ele vai abrir a contabilidade de 2027,
- **01:30–01:34:** e tem que puxar esses valores aprovados pra 2027.
- **01:34–01:36:** E não mexe em 2026.
- **01:36–01:39:** É, na verdade, mas o mais esquisito que ele queria,
- **01:39–01:42:** ele queria que ele saiba o que o sistema ia entregar pra ele automaticamente,
- **01:42–01:44:** porque o medo dele é chegar lá,
- **01:44–01:46:** e se você não fizer nada automaticamente, ele tem que fazer manual.
- **01:46–01:48:** Que igual te falei, ele mexe com 15 prefeituras,
- **01:48–01:50:** pra essa são duas pessoas só.
- **01:50–01:51:** Aí ele, tipo assim, ó,
- **01:51–01:55:** eu tô te dando uma colher de chá pra você entrar aqui na prefeitura,
- **01:55–01:58:** mas eu preciso que o sistema me ajude, né?
- **01:58–01:59:** Exatamente.
- **01:59–02:02:** Aí eu não achei que opção onde que está, né?
- **02:02–02:03:** Mas aí você...
- **02:03–02:05:** Não, eu vou colocar.
- **02:05–02:09:** Você fez, tanto pro PPA, tanto pra LDO quanto pra loa.
- **02:09–02:11:** Ele tem que conseguir abrir um novo exercício,
- **02:11–02:13:** e importando a informação de exercício anterior.
- **02:13–02:14:** Me criando...
- **02:14–02:16:** Clicando nessa javas aqui no caso,
- **02:16–02:18:** plano propriedor de abrir um...
- **02:18–02:19:** E pra abrir um novo exercício,
- **02:19–02:22:** por exemplo, igual aqui no PPA, ele até parece...
- **02:22–02:23:** Vingente de exercício,
- **02:23–02:25:** ele aparece, nem opção pra digitar,
- **02:25–02:28:** mas eu não achei opção de criar.
- **02:28–02:29:** Criar, na verdade, isso.
- **02:29–02:33:** O criar, ele deixa criar aqui o 2027, por exemplo.
- **02:33–02:37:** Aí...
- **02:37–02:40:** Mas eu não sei se ele importa,
- **02:40–02:40:** e isso que tem que ser...

### A09 — WhatsApp Ptt 2026-10-09 at 1.00.01 PM.ogg

- **00:00–00:01:** O próximo exercício.
- **00:01–00:05:** Ele só fica reemportando de um ano para o outro, no caso do VGX para o outro.
- **00:05–00:11:** Um ano para o outro.
- **00:11–00:13:** A pergunta dele era...
- **00:13–00:14:** Na verdade as dúvidas foram que...
- **00:14–00:18:** Como é que eu faço a fase de planejamento, depois eu faço a fase de execução?
- **00:18–00:19:** Porque ele falou assim...
- **00:19–00:24:** "Eu não quero nem que você me mostra como cadastro, como fornecedor, como cadastro no empenho, porque isso aí eu sei o que vai fazer."
- **00:24–00:28:** "Eu só quero ver no meu dia a dia o que iria me impactar."
- **00:28–00:29:** Foi mais ou menos o que ele...
- **00:29–00:31:** O medo dele é...
- **00:31–00:32:** Falei...
- **00:32–00:33:** É...
- **00:33–00:35:** Essa parte do planejamento aí.
- **00:35–00:37:** Que é o PPL de Ail-O.
- **00:37–00:39:** É isso que ele precisa.
- **00:39–00:46:** Ele quer saber se você vai conseguir abrir um novo exercício e puxar do anterior e ele só faz as alterações da liqueira precisar.
- **00:46–00:47:** Só.
- **00:47–00:51:** De valores, como dizer assim, né?
- **00:51–00:55:** E ou inclusão de novas receitas ou inclusão de novas despesas.
- **00:55–00:58:** E a possibilidade, na questão das receitas...
- **01:00–01:02:** De fazer as reestimativas.
- **01:02–01:05:** Na verdade assim, eu acho que você pode colocar as transferências e você pode estar com certeza.
- **01:05–01:10:** Ele vai lá e coloca o percentual que ele quer aumentar as ruas. Depois ele fala da época.
- **01:10–01:13:** Tipo, "Ah, eu vou aumentar meu orçamento em 5%.
- **01:13–01:18:** Então ele vai lá e vai aumentar os 5% as receitas e aumentar os 5% as despesas."
- **01:18–01:21:** É isso que ele quer fazer.
- **01:21–01:25:** Pra ele só conferir no final e alocar entre um e outro o que ele precisa.
- **01:25–01:30:** Entende. A parte da quantabilidade não mexe em si com as outras reestimativas da prefeitura, né?
- **01:30–01:32:** Que entra com...
- **01:32–01:35:** Querela estação, esse tipo de curtação, essas coisas.
- **01:35–01:42:** Não, na verdade assim. A quantabilidade é onde nasce e morre tudo de uma certa forma.
- **01:42–01:46:** Então tudo passa pela quantabilidade na gestão pública.
- **01:46–01:48:** Que começa com o PPA.
- **01:48–01:53:** Então o PPA é onde termina o que o município vai fazer, vai executar,
- **01:53–01:58:** inclui também com esses projetos de manutenção, de folha de pagamento e tudo mais.
- **01:58–02:00:** Então o PPA, a LIDO e a BASIC.
- **02:00–02:05:** A partir daí você vai fazer uma contratação pública, igual você vencer uma licitação.
- **02:05–02:10:** Então pra você vencer uma licitação, o processo licitatório, ele te exige uma reserva orçamentária.
- **02:10–02:10:** Sim.
- **02:10–02:14:** Pra ver se você vai ter saldo, que é suas pichas aqui e suas dotações.
- **02:14–02:16:** Se ele tem saldo na dotação que ele quer comprar.
- **02:16–02:22:** Ah, fez todo o processo licitatório, tudo bonitinho, julgou, gerou contrata, partir daí.
- **02:22–02:26:** Quando for fazer um empenho, eu tenho que vincular esse contrato no empenho.
- **02:26–02:29:** Então...
- **02:29–02:33:** Ele já vem aí uma amarração, vamos dizer assim, uma sequência.
- **02:33–02:36:** Eu tenho que ter a possibilidade de colocar o contrato, o número do contrato no empenho.
- **02:36–02:40:** Ah, eu vou...
- **02:40–02:45:** E aí, quando eu fazer a liquidação e pagamento, é uma questão totalmente contábil.
- **02:45–02:47:** Porque então de contabilização.
- **02:47–02:51:** Existe uma contabilização específica quando tem contrato vinculado.
- **02:51–02:55:** Então tem uma movimentação na conta de controle, que o sistema já deve fazer no isso,
- **02:55–02:59:** que a Vicky tá fazendo movimentação nas contas de controle.
- **02:59–03:00:** Então...
- **03:00–03:07:** Essa ligação, vamos dizer assim, mais crucial.
- **03:07–03:11:** E aí eu acho que essa é a questão de contrato no município, se ele quiser controlar para liquidar,
- **03:11–03:16:** se demetir de uma ordem de serviço ou aquisição.
- **03:16–03:22:** Mas, então, necessariamente a contabilidade precisa estar ligada ao sumo de sistemas.
- **03:22–03:28:** Ela tem informações que podem ser digitadas, não necessariamente integradas, né?
- **03:28–03:30:** Entendi.

## Apêndice — segunda transcrição de trechos incertos

Também automática. É mantida separada para não substituir silenciosamente a primeira leitura. Divergências precisam ser resolvidas pelo áudio e pelo sistema.

### A01 — 02:52–03:41

- **02:52–03:02:** mas ele tem aqui, pode colocar credor, a ficha, que é a dotação, o tipo, se é o dinário global estimativo,
- **03:02–03:06:** a categoria que exige somente quando for de contrato.
- **03:07–03:12:** Deixa eu ver aqui, eu não vi opção, aqui você vincula o empenho.
- **03:14–03:20:** Ordem de compra, tem a possibilidade de colocar convênio, obra de vida assondada.
- **03:22–03:36:** A natureza da fonte, a ficha, eu acho que falta alguma classificação da...
- **03:40–03:41:** É.

### A03 — 00:00–00:32

- **00:00–00:07:** Rafael Costa Nunes
- **00:07–00:26:** Ele fala que eu tenho que definir o que aqui
- **00:26–00:31:** O que é o que é?

### A03 — 01:15–01:54

- **01:15–01:15:** Não entendi.
- **01:16–01:18:** Ele é fornecedor pessoa física.
- **01:22–01:24:** Então ele quer que eu faça o cálculo.
- **01:27–01:33:** Imposto de renda não me deixa colocar o valor da retenção do imposto de renda.
- **01:34–01:39:** Não achei aqui onde eu coloco a opção de valor de retenção do imposto de renda.
- **01:40–01:41:** Precisa ter também.
- **01:42–01:45:** É, ele não traz para mim o valor.
- **01:45–01:51:** Ele está me trazendo uma opção conforme o cadastro, quando é pessoa jurídica.
- **01:52–01:54:** Mas não...

### A04 — 00:30–01:04

- **00:30–00:33:** falta algumas informações.
- **00:33–00:37:** Aí aqui no pagamento, eu não consegui, ele está a retenção,
- **00:38–00:44:** ele está no pagamento, retenção ex-orçamentária,
- **00:44–00:48:** tanto para INSS, Imposto de Renda ou ISS,
- **00:48–00:54:** que aí o sistema tem que gerar retenção na conta 1869,
- **00:54–00:58:** na dotação 1869, na fonte, desculpa, 1869,
- **00:58–01:01:** mas eu não consigo simular para saber se está fazendo de fato.
- **01:01–01:04:** Então você tem como demonstrar que é...

### A06 — 01:00–02:25

- **01:00–01:10:** o diário e razão tem aqui informação de razão balance de verificação onde recurso tem balanço
- **01:10–01:19:** orçamentário financeiro patrimonial variação dívida fundada flutuante com o teste de caixa de
- **01:19–01:29:** questão dos nossos aplicativos assim o básico tem tudo se funciona mas tem todas as informações aqui
- **01:29–01:38:** básicas principais né eu não vi questão a balanço patrimonial 14 tem aqui financeiro eu não sei se
- **01:38–01:49:** os relatórios já estão tudo conforme a ncaf e fpc que é algo que tem que verificar custos tem gestão de
- **01:49–01:57:** custos de o básico é isso aí prestação de contas aí tem tem as do se conf né aqui tem real
- **02:00–02:07:** não achei rgf rgf aí tem esse op se op que eu não vi aqui
- **02:07–02:13:** matriz de saltos contábeis também não vi aqui
- **02:15–02:22:** que são as processões de contas se conf que é a nível federal né todo todo o país aí tem
- **02:22–02:25:** específicos do município do estado que tem que verificar

### A07 — 00:00–01:05

- **00:00–00:02:** receitas, reprevisão.
- **00:02–00:04:** Então ele vai conseguir
- **00:04–00:06:** fazer uma reestimativa de receita ali.
- **00:08–00:10:** E aí, depois,
- **00:10–00:12:** aí já vai ser lá onde ele...
- **00:20–00:21:** Deixa eu ver aqui só um pouquinho.
- **00:22–00:23:** Eu tinha visto a opção aqui, não achei.
- **00:24–00:24:** Agora não estou achando.
- **00:27–00:28:** Receitas...
- **00:29–00:30:** Deixa eu ver onde foi que eu vi.
- **00:36–00:38:** Onde tem fichas?
- **00:38–00:39:** Fichas.
- **00:40–00:42:** Eu tinha lido, era fichas, o nome.
- **00:47–00:47:** Cadê?
- **00:47–00:51:** Classificação, fonte por natureza de receita.
- **00:55–00:56:** De qual?
- **00:58–00:59:** A recepção?
- **00:59–00:59:** A recepção?
- **01:03–01:05:** A recepção?

