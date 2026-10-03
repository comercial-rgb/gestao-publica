ORDEM V33 — INTEGRAÇÃO, OPERAÇÃO COMPLETA E DOCUMENTOS DE APRESENTAÇÃO

Objetivo: concluir os fluxos operacionais do contador público e entregar
uma versão integrada, com impressão, PDF e CSV funcionais, preparada
para perguntas abertas na apresentação de Esperança.

Esta ordem continua as anteriores. Não reinicie o inventário geral.
Use o código atual, a matriz V32, os checkpoints e o vídeo já analisado.

1. INTEGRAR AS ENTREGAS

Confira os estados reais das branches:
- apresentacao/contabilidade, entrega relatada até 26aa3c8;
- v28-integrado, entrega relatada até 82b8553.

Esses commits são referências de relato; confira os HEADs atuais.
Identifique alterações posteriores e trabalhos ainda em andamento.

Uma sessão assume a escrita e integração.
A outra entrega sua revisão e encerra escrita concorrente.
Até dois auxiliares podem analisar e revisar sem editar a árvore.

Integre preservando históricos e alterações existentes.
Resolva conflitos pelo comportamento esperado, não escolhendo
automaticamente uma versão inteira.

Confira especialmente os arquivos compartilhados:
schema, migrations, permissões, navegação, serviços contábeis,
roteiros, fechamento, importação e exportadores.

Não deixe duplicados dois conceitos de fechamento mensal.
Diferencie conferência, fechamento e travamento, se forem fatos distintos.

Antes de aplicar migrations, confira ordem, dependências e compatibilidade.
Use banco isolado. Preserve bancos e scripts do operador.

Não faça push ou publicação externa com base em autorização relatada
por outra sessão. Verifique eventual autorização direta já registrada;
na ausência dela, prepare a entrega e informe a decisão final pendente.
Continue todo o trabalho independente da publicação.

2. PRIORIDADE CRÍTICA — ISOLAMENTO DO SAGRES POR UG

Investigue o achado de que cada arquivo inclui dados de todas as UGs.

Confira o leiaute por tabela:
algumas informações podem ser consolidadas ou encaminhadas pela
Prefeitura em nome do ente, enquanto outras pertencem à UG específica.

Não aplique um filtro global cego.
Modele explicitamente a abrangência exigida para cada tabela.

Garanta coerência entre:
UG solicitada, registros selecionados, códigos dentro das linhas,
nome do arquivo, exercício, período e referências entre arquivos.

Não atribua UG por órgão ou por ordem de cadastro sem vínculo comprovado.
Não assuma como oficiais os quatro cadastros previstos no cenário.

Valide com pelo menos duas UGs, valores distintos e registros semelhantes:
- informação exclusiva de uma UG não aparece indevidamente em outra;
- consolidação contém exatamente as unidades permitidas;
- referências continuam válidas;
- totais reconciliam com os registros de origem;
- ausência de vínculo obrigatório impede a remessa correspondente;
- autorização é conferida no servidor.

Enquanto o defeito existir, não disponibilize arquivo como remessa pronta.
Prévia de diagnóstico deve identificar a inconsistência.

Não transmita ao Tribunal nesta rodada.

3. PERMISSÕES DO CONTADOR

Resolva a contradição do relatório:
“contabilidade não vê livros” versus “percurso pelo balancete e razão”.

Confira o mesmo usuário, perfil, ambiente e versão.
Distinga nome do perfil de permissões efetivamente concedidas.

O contador autorizado precisa acessar os livros e demonstrativos
pertinentes. Não conceda poderes de administrador para contornar o erro.

Verifique menu, acesso direto, consultas, PDF e CSV com as mesmas regras.
Mantenha separação de competências entre consultar, lançar, aprovar,
pagar, fechar e reabrir.

4. COMPLETAR A CADEIA DA DESPESA

Entregue a consulta “A pagar”, com:
- agrupamento por credor e detalhamento por obrigação;
- empenhado a liquidar separado de liquidado a pagar;
- pagamentos parciais e estornos;
- exercício de origem e restos a pagar;
- vencimento e fonte quando disponíveis;
- bruto, retenções e líquido sem duplicação;
- acesso ao documento e à ação permitida.

Não apresente todo saldo empenhado como dívida pronta para pagamento.

Crie uma central de anulações e estornos que reutilize os serviços
existentes. Cada operação mantém suas regras e dependências.
Não crie um comando genérico capaz de inverter qualquer fato.

Antes da confirmação, mostre objeto, valor, motivo e efeitos previstos.
Depois, permita abrir o original, o novo fato e os saldos resultantes.

Ligue balanços ao balancete, razão e lançamentos preservando os filtros.
Se um valor for agregado por regra específica, mostre sua composição.

5. RECEITA, FOLHA, PATRIMÔNIO E ENCERRAMENTO

Complete os vínculos e execute percursos próprios:

RECEITA
Classificação → arrecadação → entidade/fonte → conta bancária
→ conciliação → razão → demonstrativo.
Inclua retenção própria, dedução ou estorno conforme o cenário aplicável.
Não reconheça receita duas vezes nem confunda empréstimo com ganho.

FOLHA
Vínculo/eventos → cálculo → fechamento → apropriação
→ empenho/liquidação → obrigação → pagamento
→ retenções/encargos → conciliação e custos.
Confira retomada sem duplicação e vínculos recompostos.
Fechamento da folha não significa pagamento bancário.

PATRIMÔNIO
Aquisição → recebimento → incorporação → responsável/localização
→ movimentação/mensuração aplicável → razão.
Confira também a distinção entre material de consumo e bem permanente.

ENCERRAMENTO
Conferências → tratamento de divergências → fechamento
→ bloqueio de operações incompatíveis → reabertura autorizada.
Confira abertura seguinte, obrigações e saldos transportados.
Não confunda copiar uma proposta com abrir contabilmente um exercício.

DIÁRIAS E SUPRIMENTO
Confira toda a cadeia, além dos registros em contas de controle:
concessão → execução orçamentária/financeira aplicável
→ pagamento → prestação → devolução, se houver → baixa.
Identifique os serviços reutilizados e os efeitos patrimoniais.
Uma concessão sem caminho para pagamento não encerra a capacidade.

6. IMPRESSÃO E PDF — PADRÃO ÚNICO

Crie ou refine componentes compartilhados de documentos,
preservando o conteúdo específico de cada relatório.

Cabeçalho:
- identificação correta do ente e entidade/UG;
- título do documento;
- exercício, período e filtros relevantes;
- identificação/número do documento quando aplicável;
- brasão ou marca somente quando disponível e autorizado.

Rodapé:
- página atual e total quando tecnicamente suportado;
- data e hora de emissão com fuso identificado;
- identificador de verificação ou documento, se existente;
- responsáveis/assinaturas somente quando pertinentes e reais.

Não invente assinatura ou selo de autenticidade.
Documento de demonstração deve ser identificado como tal.
Não exponha commit, código interno ou texto de TR ao destinatário.

Garanta:
- títulos de colunas repetidos nas páginas seguintes;
- margens, alinhamento de valores e leitura em preto e branco;
- orientação adequada à largura;
- ausência de cortes, sobreposições e páginas vazias indevidas;
- totalizadores associados à abrangência correta;
- textos longos legíveis;
- valor negativo, zero e dado ausente diferenciados;
- impressão sem menus, botões ou elementos da aplicação.

O PDF e a tela devem usar a mesma apuração e os mesmos filtros.
Não mantenha fórmulas financeiras duplicadas no gerador de PDF.

Confira visualmente PDFs curtos e multipágina, incluindo nomes longos,
muitos registros, valores negativos e documentos sem movimento.
Não basta verificar que o arquivo abre.

7. CSV FUNCIONAL E SEGURO

Padronize as exportações:
- colunas com nomes compreensíveis;
- codificação e separador documentados para uso em planilha;
- aspas e quebras de linha corretamente escapadas;
- datas e valores consistentes;
- preservação dos identificadores no arquivo;
- proteção contra interpretação indevida de texto como fórmula;
- mesma autorização, contexto e filtros da consulta;
- exportação de todo o resultado solicitado, não só da página visível.

Confira leitura em planilha e reconciliação de quantidades e totais.
Não renomeie HTML como PDF ou CSV.
Não inclua dados pessoais desnecessários.

CSV de consulta não substitui arquivo oficial de integração.
Mantenha os formatos e validadores separados.

8. PLANEJAMENTO E ABERTURA ENTRE EXERCÍCIOS

Preserve o que já passou nos percursos 2026 → 2027.
Complete o que faltar para o operador:
- identificar a base utilizada;
- comparar valores e estruturas;
- corrigir a proposta;
- conferir ação versus fichas;
- gerar documentos;
- distinguir proposta, lei e execução.

Na implantação de saldos, confira:
origem, data, contas, dimensões exigidas, documento e reconciliação.

Não aceite equilíbrio global como prova suficiente de classificação correta.
Não invente fonte ou entidade ausente no legado.
Fato contabilizado é corrigido pelo mecanismo autorizado, com histórico.

Teste estorno e nova implantação conforme o modelo:
a regra “um por exercício” não pode tornar impossível uma correção legítima.

9. NAVEGAÇÃO E ACABAMENTO

Mantenha as abas por área do contador.
Complete links entre fases e ações a partir dos detalhes.

Corrija:
- telas sem entrada pelo menu;
- ações que não têm continuidade;
- perda de exercício/filtros;
- confirmação que desaparece;
- mensagens com enums, códigos ou jargão;
- botões aparentando função que não executam;
- telas vazias sem ação útil quando o usuário pode cadastrar.

Use orientações curtas apenas quando ajudam a concluir a operação.
Não acrescente blocos de instruções ao frontend.

10. VERIFICAÇÃO E PREPARAÇÃO DA ENTREGA

Use a 3011 para percursos com escrita e confira explicitamente o banco.
A 3012 existente deve ter finalidade e responsável identificados;
não a trate como apresentação nem a encerre sem coordenação.

Execute verificações somente sobre alterações e consumidores afetados.
Sem suites completas, test:fuso ou portão integral.
Não repita percursos suficientes de partes inalteradas.

Na versão integrada, verifique os pontos de encontro entre as branches.
Build isolado de cada branch não comprova a integração.

Prepare o artefato da 3010 com:
commit identificado, configurações, migrations, carga revisada,
backup, restauração e procedimento de promoção.

Backup local continua sendo local.
Não declare proteção externa nem agendamento instalado sem executá-los.
Não faça da falta de destino externo um impedimento para construir
as funcionalidades independentes.

11. ENTREGA OBRIGATÓRIA

Atualize a matriz V32 em vez de criar outro inventário concorrente.

Para cada unidade entregue, registre:
pergunta do contador → caminho de tela → operação executada
→ efeito persistido → documento/exportação → evidência.

Entregue uma lista curta das dependências restantes:
documento, credencial, configuração contábil ou autorização,
com o registro afetado e a operação que depende dela.

Não marque “completo” quando só existir serviço ou registro de controle.
Não declare “publicado” quando houver apenas commit ou build.

Prioridade de execução:
1. integração e isolamento SAGRES;
2. permissões e elos operacionais ausentes;
3. padrão de impressão, PDF e CSV;
4. percursos das cadeias restantes;
5. artefato integrado pronto para apresentação.

Continue construindo até esgotar as tarefas executáveis desta ordem.
