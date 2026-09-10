# M26 — Designer de relatórios

Seção 2.7 do prompt do ENT02. É o ponto onde o prompt exige mais cuidado, e a razão está
escrita lá:

> "M12 entrega os relatórios legais calculados; **não entrega o designer**. São coisas
> separadas e as duas são exigidas."

RREO, RGF e balanços são cálculos **normativos**, com fórmula fixada em lei — ninguém os
"desenha". O designer é a capacidade de o usuário montar um relatório operacional que
ninguém previu. Uma emissão do M12 **não** prova esta capacidade.

O relatório que prova o corte é o que o prompt nomeia: **a relação de processos por
assunto e situação**, gerada pelo designer, com campo calculado — não um PDF fixo.

---

## 1. A gramática segura, e por que ela é um arquivo inteiro

O prompt pede "campos calculados por gramática segura: funções permitidas, limite de
execução, `Decimal`, sem `eval` e sem SQL livre do usuário".

A tentação é `new Function("linha", "return " + expressao)`. Ela funciona no primeiro dia
e entrega o processo no segundo: a expressão do usuário passa a poder ler `process.env`,
abrir arquivos, fazer requisições e derrubar o servidor com um laço. **Nenhuma lista de
proibições em cima de `eval` fecha isso** — a linguagem é grande demais para ser cercada
por fora.

Aqui a linguagem é **pequena por construção**: números, textos, quatro operadores,
comparações, concatenação e nove funções. Não tem variável global, laço, propriedade de
objeto nem `import`. **O que ela não sabe fazer, ela não faz** — e não porque alguém a
proibiu.

O `t1` do teste da gramática prova isso pelo ângulo certo: `process.env.X` morre no
tokenizador (o ponto não é sintaxe fora de um número), `require("fs")` morre na lista de
funções, e `(() => 1)()` morre no parêntese vazio.

### O que mais está fechado

| Defesa | Por quê |
|---|---|
| **Caractere desconhecido é erro**, não é ignorado | Ignorar faria `valor; DROP TABLE x` virar `valor` **em silêncio** — a expressão passaria a significar outra coisa sem avisar ninguém |
| **Limite de 10.000 passos** | Mesmo sem laço, `1+1+1+…` custa tempo. Um relatório que roda para sempre é uma negação de serviço escrita **sem má intenção** |
| **Limite de 500 caracteres**, antes de analisar | Uma expressão de um megabyte custa memória na análise, antes de o limite de passos ter chance de agir |
| **Aritmética em `Decimal`** | `0.1 + 0.2` em float é `0.30000000000000004`. O `t6` mostra os dois lados |
| **Divisão por zero estoura** | `Decimal` devolveria `Infinity`, e um relatório com "Infinity" numa célula é pior que um que falhou: **parece pronto** |
| **`SE` é preguiçoso** | Sem isso, `SE(divisor<>0; total/divisor; 0)` estouraria **mesmo com a guarda escrita corretamente** |
| **Campo inexistente estoura** | Um relatório que soma uma coluna escrita errada devolveria zero — e zero parece um número válido |

---

## 2. Nenhum SQL do usuário chega ao banco

A `fonte` é um **rol fechado**, e cada valor corresponde a uma consulta escrita à mão em
`fontes.ts`. O usuário escolhe a fonte e escreve expressões sobre as colunas que ela
**publica** — nunca a consulta, nunca a tabela, nunca a junção.

A alternativa — um "construtor de consultas" que monta SQL — parece mais poderosa e é a
mesma coisa com passos a mais: basta um campo que escape, no dia em que alguém peça uma
junção que o construtor não previu.

Os **filtros** de execução (`campo=valor` por linha) são confrontados com as colunas
publicadas e comparados **em memória**, sobre a fonte já lida. Filtro sobre campo
inexistente **falha a execução com motivo** (`t10`), em vez de virar SQL.

### O sigilo entra no `where`, não num filtro depois

O `t11` cobre o teste 3 do lote pelo lado do relatório: um usuário sem permissão global e
sem passagem pelo processo **não vê a linha sigilosa** — e o **total** também é 1, porque
o recorte está no `where`. Filtrar a página já lida faria o total contar linhas que quem
pediu não pode ver.

---

## 3. Validar na gravação, não só na execução

Um modelo com expressão inválida gravado hoje só quebraria na primeira execução —
possivelmente às 3h da manhã, para outra pessoa, dentro de um relatório **já
distribuído**. Aqui a análise roda ao salvar, e confere os **campos usados** contra as
colunas da fonte (`t1`, `t2`).

---

## 4. Versão, cópia, distribuição e retirada

| Ato | O que faz | O que **não** faz |
|---|---|---|
| **Nova versão** | mesmo código, `versao + 1` | não reescreve a anterior — é o que torna uma execução antiga **explicável** pelo modelo que a produziu (`t5`) |
| **Copiar** | modelo novo, código próprio, `copiadoDeId` | não toca o original (`t3`) |
| **Distribuir** | dá **acesso** a outra unidade | não copia — copiar faria as duas divergirem na primeira correção, e quem recebeu ficaria com o defeito (`t6`) |
| **Retirar** | encerra a vigência, como fato | não apaga — as execuções antigas continuam disponíveis e processáveis (`t7`) |

### Não há coluna `vigenciaFim`

A versão vigente numa data é a de maior `vigenciaInicio <= data` que não tenha sido
retirada. Uma coluna `vigenciaFim` exigiria UPDATE na versão anterior a cada versão nova
— e o dia em que essa segunda escrita falhasse, **duas versões estariam vigentes ao mesmo
tempo**, com a mais antiga vencendo por acaso.

### A cópia nasce restrita

Mesmo copiando um modelo público. Herdar a visibilidade publicaria, sem que ninguém
decidisse, um rascunho que alguém acabou de derivar de um relatório oficial.

E **modelo restrito não é copiável por terceiros**: as expressões iriam junto, e copiar
viraria a forma mais simples de ler o que o autor decidiu não publicar (`t4`).

---

## 5. Execução em segundo plano

`executarRelatorio` **enfileira e devolve na hora**. Calcular dentro da requisição faria
o navegador esperar por uma varredura que pode levar minutos — e o *timeout* do proxy
mataria o pedido sem deixar rastro de que ele existiu.

`processarExecucoesPendentes` é o trabalhador. Ele **não cobra autorização**, e a razão
está no censo: a autorização aconteceu no **enfileiramento**, com a identidade de quem
pediu. Exigir crachá do trabalhador seria pedir permissão ao processo — e a única saída
seria dar-lhe um de superusuário.

**Cada execução é uma transação.** Uma falha na terceira não desfaz as duas primeiras:
elas concluíram de verdade, e o usuário já foi avisado.

**A falha é gravada fora da transação que falhou.** Dentro dela, o rollback levaria o
registro do erro junto — e a execução ficaria pendente para sempre, retentada
eternamente sem que ninguém soubesse por quê (`t10`).

**A notificação de conclusão vai na mesma transação da conclusão**: avisar sobre um
resultado que o rollback levou embora seria avisar uma mentira.

---

## 6. Sem coluna de situação, de novo

Pendente é a **ausência** de movimento; concluída e falha são movimentos. E o resultado é
uma tabela à parte (1:1), não colunas na execução — guardá-lo na execução exigiria
UPDATE; assim a conclusão é um INSERT, e **uma execução sem resultado é exatamente uma
execução que não concluiu**.

---

## 7. Pendências declaradas

| Pendência | O que falta | Por quê |
|---|---|---|
| `DESIGNER-AGENDAMENTO` | executar o modelo em horário programado | O trabalhador drena a fila; falta quem a alimente por tempo. Sem agendador no repositório, um `setInterval` num servidor web seria um agendador que morre no primeiro *deploy* e ninguém percebe. |
| `DESIGNER-WORKER-CONTINUO` | processo dedicado drenando a fila | Hoje o trabalhador roda por chamada (`npm run relatorios:processar`, e a tela dispara ao abrir a lista). O `saas-municipal` tem BullMQ como referência, mas o prompt manda **não importar o adapter Drizzle**. |
| `DESIGNER-AGREGACAO` | somatórios, contagens e agrupamento | A gramática opera **linha a linha**. Totalizar exige um segundo estágio, e inventá-lo sem consumidor real produziria uma capacidade sem uso. Quem precisa de total por subsistema hoje usa o razão (M12). |
| `DESIGNER-PDF` | saída em PDF | A saída é CSV RFC-4180, como o M13. O pipeline de PDF existe (`lib/pdf`) e o designer é camada acima — falta o layout. |
| `DESIGNER-FONTES` | fontes além de processos e comunicados | Rol fechado por construção: cada fonte é uma consulta revisável. Fonte nova entra com a sua função. |

---

## 8. Onde olhar

| Arquivo | O que é |
|---|---|
| `gramatica.ts` | o analisador, o avaliador com limite de passos e a formatação por tipo de coluna |
| `fontes.ts` | as consultas escritas à mão, já recortadas por unidade e por sigilo |
| `servico.ts` | modelo, versão, cópia, distribuição, retirada, enfileiramento e o trabalhador |
| `m26-gramatica.test.ts` | 14 testes puros — inclusive as expressões maliciosas |
| `m26-designer.test.ts` | 11 testes contra banco, com o relatório que o prompt pede |
