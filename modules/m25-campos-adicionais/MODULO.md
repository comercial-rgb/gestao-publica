# M25 — Campos adicionais definidos pelo usuário

Seção 2.3 do prompt do ENT02, cláusula 5.29.7 do catálogo. O prompt é explícito:

> "Um campo de observação fixo não satisfaz esta capacidade. Se o incremento entregar
> menos, registre `PARCIAL` com o motivo."

Este módulo entrega os **sete tipos**, persistidos, filtráveis na listagem, exibidos no
detalhe, versionados e auditados.

---

## 1. Por que um `observacao TEXT` não serve

Um campo de texto livre aceita qualquer coisa, **não filtra**, não valida, não versiona
e não diz o que significa. Um campo declarado `DATA` que aceita "amanhã" é um campo de
texto com rótulo de data — e ele mente no primeiro filtro por período.

| Tipo | Coluna | O que a conversão recusa |
|---|---|---|
| `VALOR` | `valorNumero Decimal(18,2)` | qualquer coisa que não seja monetário. **Decimal, nunca float** — regra do núcleo |
| `DATA` | `valorData DateTime` | "amanhã", e também **31/02** (a conferência de volta pega o que um `new Date` complacente aceitaria como 03/03) |
| `HORA` | `valorTexto` ("HH:MM") | 25:00. Em texto porque **assim ordena certo**, e porque hora sem data não é instante |
| `BOOLEANO` | `valorBooleano` | "talvez" |
| `LISTA` | `valorTexto` | o que não está nas opções cadastradas |
| `LISTA_DINAMICA` | `valorTexto` | o que não está no cadastro de origem, **na unidade certa** |
| `ALFANUMERICO` | `valorTexto` | nada — é o único que é texto livre de verdade |

### Quatro colunas, e não um `valor String`

A tentação é uma coluna só e conversão na leitura. O preço aparece no primeiro filtro:
"acima de 1.000" viraria comparação de texto, e **"900" seria maior que "1.000"**. Data
em texto ordena errado do mesmo jeito.

---

## 2. O valor é append-only. O histórico é a tabela.

O catálogo pede o campo "versionado e auditado". Com append-only, **a auditoria é a
tabela** — não há uma segunda estrutura de diffs para alguém esquecer de escrever, e que
mente exatamente no caminho que esqueceram. É a mesma escolha da `VersaoDePessoa` (M19).

Efeito colateral que importa: o papel de runtime **não precisa de UPDATE** nos valores.
Corrigir um campo é gravar outro; o anterior continua visível.

**Apagar também é um fato** (`apagado: true`, todas as colunas nulas). Sem essa linha,
"apagar" seria deletar a anterior e o histórico perderia que o dado existiu (`t8`).

---

## 3. O isolamento entre entidades não é um filtro. É impossibilidade.

`DefinicaoDeCampoAdicional` é `@@unique([unidadeOrcId, cadastro, codigo])` — o eixo é o
mesmo do ENT01, sem coluna de tenant e sem unicidade reescopada.

`preencherCamposAdicionais` só **enxerga** as definições da unidade gestora **do
registro**. Um código que exista noutra unidade simplesmente não é encontrado, e a
mensagem diz isso — em vez de gravar em silêncio no campo de outra entidade.

O `t6` prova as duas metades: o processo da Saúde não consegue usar o campo `turma` da
Educação, **e** o mesmo código pode existir nas duas unidades significando coisas
diferentes ("Turma" × "Turma de vacinação").

A lista dinâmica herda o mesmo escopo: um campo da Educação não oferece o setor da
Saúde. Isso mordeu a primeira versão do `t5`, que tentou trocar o valor para um setor de
outra unidade — o comportamento estava certo, o teste é que estava errado.

---

## 4. Código desconhecido é recusado, não ignorado

Ignorar em silêncio faria a tela dizer **"salvo com sucesso"** sobre um formulário cujo
campo não foi gravado — e o usuário só descobriria dias depois, procurando o dado que
tem certeza de ter digitado (`t7`).

---

## 5. Desativar, não apagar

Apagar a definição levaria os valores junto, e com eles o histórico de um dado que a
entidade coletou de verdade.

Um campo desativado:
- **some do formulário** de registros novos — a entidade parou de perguntar aquilo;
- **continua visível** onde já foi respondido. Escondê-lo apagaria da tela um dado que
  continua no banco, e o usuário concluiria que se perdeu;
- **recusa** preenchimento novo.

O `t10` cobre os três.

---

## 6. As três ações, e por que são três

`DEFINIR_CAMPO_ADICIONAL` · `DESATIVAR_CAMPO_ADICIONAL` · `PREENCHER_CAMPOS_ADICIONAIS`

Definir e preencher são **poderes diferentes**: quem preenche o formulário não é quem
decide o que o formulário pergunta. Uma ação única deixaria qualquer atendente criar
campo novo no cadastro do ente.

---

## 7. Pendências declaradas

| Pendência | O que falta | Por quê |
|---|---|---|
| `CAMPO-ADICIONAL-PESSOA-NO-ENTE` | qual unidade define os campos do cadastro de **pessoas** | O cadastro de pessoas é do **ente**, não de uma unidade (M19): o mesmo fornecedor é credor da Educação e da Saúde. Hoje o serviço é **fail-closed** — se duas unidades definirem campos de PESSOA, ele recusa nomeando o conflito em vez de escolher uma em silêncio e gravar no lugar errado. |
| `CAMPO-ADICIONAL-FILTRO-RANGE` | filtros por faixa (entre X e Y, antes de, depois de) | O `registrosComCampo` compara igualdade. As colunas são tipadas justamente para suportar faixa; falta a superfície de consulta. |
| `CAMPO-ADICIONAL-OUTROS-CADASTROS` | campos em cadastros além de pessoa, processo e comunicado | O enum `CadastroComCamposAdicionais` é rol fechado porque cada valor corresponde a uma **FK real** — um `registroTipo String` livre aceitaria qualquer coisa e o banco deixaria de garantir que o registro existe. Cadastro novo entra com a sua FK. |

---

## 8. Onde olhar

| Arquivo | O que é |
|---|---|
| `prisma/schema/m25-campos-adicionais.prisma` | os modelos, e o porquê das quatro colunas |
| `dominio.ts` | puro: os sete tipos, a conversão, a recusa e a exibição |
| `servico.ts` | definir, desativar e preencher — com o isolamento por unidade |
| `consultas.ts` | valor vigente, histórico e o filtro sobre a coluna tipada |
| `m25-campos-adicionais.test.ts` | 10 testes (4 puros, 6 contra banco) |
