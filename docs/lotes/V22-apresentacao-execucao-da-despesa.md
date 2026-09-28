# V22 — apresentação: marca Engine e a execução da despesa de ponta a ponta

Pedido recebido em 2026-09-28, executado no worktree `gestao-publica-apresentacao` (branch
`apresentacao/contabilidade`, a partir de `3cf102a`), com banco próprio `gestao_publica_local`
(cópia de `gestao_publica_apresentacao`), sem colidir com a sessão que trabalha em
`gestao-publica-v21`.

## O pedido, como veio

> o outro agente esta trabalhando mas voce executar as funcoes e criacoes abaixo sem colidir com ele:
> aplicar visual de marca da MSFrota "C:\Users\winer\OneDrive\Área de Trabalho\MS Frotas"
> em empenhos ao aperecer o dropdown da ficha (dotacao) aplicar mascara real em dispovel hoje esta 10000.00
> em credor ao inserir cpf ou cnpj listar os fornecedores para selecionar ja criar para teste.
> criar uma ordem de compra para listar, e tambem opcao de ao inserir o numero filtrar por ela, em contrato tambem e reserva dotacao tambem, criar textos para o historico puxar e autopreencer. Os empenhos criados e listados abaixo, a opcao de clicar e abrir o empenho com informacoes, opcao de exportar pdf e excel e tambem layout de impressao.
> Em liquidacoes, opcoes de incluir comprovante do banco para consultar, ao clicar abrir modal igual em empenhos.
> confirmar que conseguimos apresentar este fluxo abaixo, confirmas, telas, botoes, modal ao clicar, impresses layout, para apresentarmos a solucao: SISTEMA DE CONTABILIDADE PÚBLICA. [segue o texto do termo de referência: registro contábil, demonstrações, Módulo 1 Planejamento, Módulo 2 Alterações do Orçamento, Módulo 3 Execução Orçamentária, Módulo 4 Extraorçamentário — truncado em "Retenções a Recolher: ... permitindo o controle da composicao"]

## Decisão tomada no pedido

Marca: **sistema inteiro** (resposta de Winner em 2026-09-28). A cor de ação passa a ser o laranja
forte da marca (`#C24F00`, único que aceita texto branco); barra lateral grafite com o laranja
oficial; títulos em Exo 2. A instituição continua vindo do cadastro.

## Em que módulo entra

| Parte | Módulo |
|---|---|
| marca | casca de UI (`app/globals.css`, `components/ui/`) |
| ficha formatada, vínculos com busca, histórico composto, modal, Excel, impressão | M05 despesa (telas) |
| busca de credor por CPF/CNPJ | M19 pessoas (catálogo de opções) |
| comprovante bancário na liquidação | M22 documentos (anexo com dono `liquidacaoId`, já no schema) |
