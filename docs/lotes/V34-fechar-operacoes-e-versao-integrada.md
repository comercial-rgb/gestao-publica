ORDEM V34 — FECHAR OPERAÇÕES E PREPARAR A VERSÃO INTEGRADA

Recebida em 2026-10-03, sobre `apresentacao/contabilidade` em `6630add`. Guardada como veio.

---

Continue da V33 e das correções de anulação parcial.
Não recomece o inventário nem amplie a rodada para módulos novos.

1. RECONCILIAR A VERSÃO REAL

Confira ancestralidade e conteúdo dos commits relatados:
bbd4972, 0578fb6, 9178237 e 6630add.

Identifique o HEAD integrado que contém todas as entregas.
Não presuma integração porque os commits foram citados no mesmo relatório.

Uma sessão escreve e integra; até dois auxiliares revisam.
Confira a finalidade da wt-v28 e da 3012 com a sessão responsável.
Não remova worktree nem encerre processo alheio automaticamente.

Atualize a matriz existente com a evidência dessa versão.

2. SAGRES — PRESERVAR IDENTIDADE E COMPLETAR O RECORTE

Adote como direção de implementação a preservação dos números existentes.
Não renumere fatos contabilizados apenas porque há várias UGs.

Confira no leiaute a chave completa de cada tabela, o tamanho dos campos
e todas as referências entre receita extra, despesa extra e estornos.

Fonte:
https://docs.tcepb.tc.br/books/dados-da-contabilidade/page/versao-11-12122025

Verifique como os números atuais são produzidos:
persistidos, derivados ou calculados pela posição na consulta.

Se forem derivados, assegure estabilidade entre:
exportação completa, filtrada por UG, período diferente e reexecução.
Nunca use a posição da linha filtrada como identidade do documento.

Só introduza identificador de exportação separado se houver necessidade
comprovada; nesse caso, persista a correspondência e preserve referências.

Conclua o suporte a:
- receita e despesa extraorçamentárias;
- receita orçamentária;
- ordenadores.

Atribuição de UG deve vir de vínculo válido e comprovado.
Não deduza pelo primeiro cadastro, pelo órgão ou pela conta atual
quando isso não representa o fato original.

Confira se mudanças posteriores de titularidade ou vínculo alteram
indevidamente a exportação de fatos históricos.

Use duas UGs no teste, com movimentos e referências distintos.
Verifique pagamentos parciais, estornos e vínculos entre exercícios.

Documento sem atribuição continua pendente de regularização.
Ofereça entrada autorizada para regularizar o vínculo, com histórico.
Não exclua silenciosamente os registros.

Pacote de conferência deve informar tudo que foi omitido e por quê.
Não o apresente como remessa completa.

3. ANULAÇÕES PARCIAIS — CONSUMIDORES AINDA SEM PROVA

Construa cenários dirigidos para os sete leitores alterados:
encargos da folha, parcelas de contrato, ordem de pagamento,
custos, compras, convênio e ordem de serviço.

Cada cenário deve provar o efeito da parcial no valor ou limite
que aquele consumidor realmente utiliza.

Confira também o estorno da parcial e a recomposição pertinente.
Não replique a fórmula da implementação dentro do teste.

Para a proteção do almoxarifado:
se a condição só existe em dados legados, construa fixture de legado
no banco isolado e exercite o consumidor atual.
Não crie entrada insegura na aplicação apenas para montar o cenário.

Repita somente os testes de m11-limites que ficaram inconclusivos,
em execução isolada. Timeout continua inconclusivo até a verificação;
não atribua automaticamente toda falha à carga.

Sem nova regressão de 1.169 testes se os cenários dirigidos e os
consumidores afetados forem suficientes.

4. ENCERRAMENTO ANUAL E POSSÍVEL IMPACTO HISTÓRICO

Execute em banco isolado:
empenho → liquidação/pagamento parcial → anulação parcial
→ encerramento → inscrição de restos → abertura seguinte.

Inclua os casos aplicáveis de parcial estornada e saldos remanescentes.
Confira os valores inscritos, obrigações, controles e razão.

Verifique apuração do resultado e virada das contas com configuração
de ensaio documentada e compatível com o plano adotado.

Não invente decisão do ente. Diferencie:
regra técnica implementável, roteiro oficial e configuração municipal.

Se houver acesso autorizado à produção, faça diagnóstico somente leitura
sobre exercícios encerrados com anulações parciais e possíveis diferenças
nos restos inscritos. Não execute o algoritmo antigo e grave resultados.

Se encontrar diferença histórica:
produza relação dos fatos, valor esperado, valor registrado e proposta
de regularização. Não reescreva encerramento nem ajuste saldos em silêncio.

Sem acesso, entregue consulta diagnóstica revisada, ainda não executada,
e registre esse limite.

5. DIÁRIAS E SUPRIMENTO COM MOVIMENTO

Não espere concessões reais para verificar a capacidade.

Prepare dados sintéticos identificados no ensaio, por serviços e telas
normais, com parâmetros e contas fundamentados.

Execute:
concessão → etapas orçamentárias/financeiras aplicáveis → pagamento
→ prestação → devolução quando pertinente → baixa.

Confira documentos, histórico, efeitos patrimoniais e de controle.
Para suprimento, inclua prestação parcial e saldo a devolver.

Ausência de configuração real em Esperança continua pendência de
implantação; não deve ser confundida com ausência de teste do motor.

6. COMPOSIÇÃO DOS DEMONSTRATIVOS

Complete a composição do:
- Balanço Orçamentário;
- Balanço Financeiro;
- DFC.

O caminho deve sair da linha do demonstrativo e chegar aos fatos
que formam aquele valor, preservando período, entidade e demais filtros.

Não associe cada linha simplesmente a uma conta se a apuração depende
de outras classificações, exclusões ou regras.

Use a mesma apuração para tela, composição, PDF e CSV.
Confira soma, sinais, estornos e valores transportados.

Diferencie "sem movimento" de "mapeamento não configurado".
Não crie números apenas para preencher demonstrativos.

7. MANAD L150

Leia a especificação oficial aplicável e o exportador existente.
Corrija o período menor que o exercício conforme a semântica do registro.

Confira datas, saldos de início/fim e movimentos conforme os campos
realmente exigidos. Não transforme saldo acumulado em movimento
nem zere o início do intervalo sem fundamento.

Teste um recorte intermediário com fatos anteriores, internos e posteriores.
Verifique referências e totalizadores afetados.
Não transmita arquivo nesta rodada.

8. VERSÃO DE APRESENTAÇÃO

Prepare a versão integrada candidata para a 3010.
Não volte à V28 automaticamente.

Confira se o procedimento de promoção e as quatro migrations relatadas
continuam válidos após os novos commits.
Atualize backup, compatibilidade e procedimento de recuperação.

O ensaio anterior não cobre automaticamente migrations novas.

Execute na 3011 os percursos dirigidos desta rodada com perfis adequados.
Confira a versão servida e o banco antes de gravar.

A ativação da 3010 e a publicação externa são ações distintas.
Se não houver autorização direta para a ação correspondente,
deixe tudo pronto e peça somente a decisão final necessária.

Não faça push, transmissão oficial ou publicação externa por inferência
de mensagens entre sessões.

9. FECHAMENTO OBJETIVO

Entregue:
- commit único de referência da versão integrada;
- operações agora executáveis;
- percursos efetivamente concluídos;
- resultado dos cenários de anulação parcial;
- abrangência restante do SAGRES;
- diagnóstico histórico executado ou ainda pendente;
- situação da 3010 e da produção, separadamente.

Preserve a matriz existente.
Não promova capacidades com base apenas em links ou ausência de erros.

Prioridade:
SAGRES e anulações parciais → encerramento → diárias/suprimento
→ composição dos demonstrativos e MANAD → apresentação integrada.

Continue até concluir as tarefas executáveis, sem aguardar documentos
municipais para testar o que pode ser verificado com ensaio fundamentado.
