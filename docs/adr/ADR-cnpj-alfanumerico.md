# ADR — O CNPJ alfanumérico na cadeia inteira

**Situação:** aceita, 2026-09-13 (sessão noturna V4, seção 7; achado A09 da auditoria de 77cbcc9).

## Contexto

A Receita Federal gera CNPJ alfanumérico desde julho de 2026: doze caracteres [A-Z0-9] e dois
dígitos verificadores numéricos, com o DV calculado sobre o valor ASCII − 48 de cada caractere
(0–9 → 0–9; A–Z → 17–42), pesos 5..2,9..2 e 6..2,9..2, módulo 11 (resto < 2 → 0, senão 11 − resto).
Fontes: o manual "Cálculo dos dígitos verificadores de CNPJ alfanumérico" (SERPRO/Receita
Federal, 05/11/2024) e os arquivos de referência oficiais (`codigos-cnpj.zip`, com o `test.ts` de
vetores), ambos em
https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj.

`normalizarDocumento` removia tudo que não fosse dígito — e mutilava "12ABC34501DE35" em
"123450135" sem erro. Máscara, CHECKs do banco, filtros, três módulos com regex próprio, o vínculo
usuário↔pessoa, o portal da transparência e os exportadores (SAGRES, MANAD, captura) repetiam a
suposição numérica.

## Decisão

1. **O pacote `documento` é a única régua.** `normalizarDocumento` tira só a máscara e põe em
   maiúsculas; `tipoDeDocumento`: CPF `^[0-9]{11}$`, CNPJ `^[A-Z0-9]{12}[0-9]{2}$`;
   `documentoTemDigitoValido` aplica a regra oficial ao CNPJ (numérico incluso — é o subconjunto)
   e a regra de sempre ao CPF; `calcularDvDoCnpj` e `cnpjEhAlfanumerico` exportados. Caractere fora
   de [A-Z0-9] torna o documento INVÁLIDO — não some. Provas contra os vetores oficiais em
   `packages/documento/documento.test.ts`.
2. **Máscara** (`mascararCpfCnpj`, `CampoCpfCnpj`): letras ficam e sobem para maiúsculas; a
   primeira letra já diz que é CNPJ; o hidden submete sem máscara.
3. **Banco:** `Pessoa.documento` (`VarChar(14)`) já cabe; os CHECKs de `Contrato` e
   `CertidaoFornecedor` foram AMPLIADOS (`DROP` do CHECK antigo e `ADD` do mais largo — alteração
   de constraint, não eliminação de dados; tudo o que o antigo aceitava continua aceito).
4. **Módulos:** M28/M29/M30 usam o pacote em vez de regex próprio; M05 (`credorCpfCnpj`) valida o
   formato pelo pacote; M19 mensagem e busca; filtros de termos e acervo normalizam pelo pacote;
   M13 (transparência) identifica pelo pacote e expõe o alfanumérico inteiro como o numérico.
5. **Usuário não é pessoa jurídica.** `vincularPessoaAoUsuario` aceita só CPF; CNPJ é recusado
   nomeando — representar uma organização é vínculo próprio, com escopo, ainda não desenhado
   (pendência `REPRESENTACAO-DE-ORGANIZACAO-PELO-USUARIO`). Vincular não concede permissão.
6. **Integrações com leiaute numérico RECUSAM o alfanumérico nomeando**, em vez de mutilar:
   SAGRES 2026 v11 (campos `cpfCnpjFornecedor`, `cpfOrdenador`, `cnpjGerencia*` passam ao tipo
   `DOCUMENTO`, formatador `documento()`; pendência `SAGRES-CNPJ-ALFANUMERICO`), MANAD L750/L800
   (pendência `MANAD-CNPJ-ALFANUMERICO`). A captura do TCE-PB já aceita `^[A-Z0-9]+$` e passa a
   receber o documento normalizado, não mutilado.

## Consequências

- Um fornecedor com CNPJ alfanumérico entra no cadastro, no contrato, na certidão, no empenho e
  no portal; sai do SAGRES/MANAD com recusa nomeada até os leiautes mudarem.
- `docs/dependencias-externas.md` ganha as duas pendências de leiaute.
- O DV do CPF não mudou; os testes do M19 continuam valendo.

## Provas

`packages/documento/documento.test.ts` (vetores oficiais, colisão antiga, instrumento acusando),
`test/ui/mascaras.test.ts`, `modules/m16-travamento/m16-pessoa-do-usuario.test.ts`,
`modules/m13-transparencia/m13.test.ts`, `adapters/tribunais/tce-pb/sagres/m15-sagres.test.ts`.
