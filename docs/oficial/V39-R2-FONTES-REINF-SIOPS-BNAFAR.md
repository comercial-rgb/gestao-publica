# Fontes oficiais da V39-R2 — EFD-Reinf, SIOPS, BNAFAR (e o SIOPE já guardado)

Consulta e download em 10/10/2026. Os arquivos não foram editados.

O que a ordem pede (`docs/lotes/V39-R2-continuidade.md`, "Fontes e parâmetros") é material oficial com origem e versão. Ela também diz que a ausência de material não autoriza inventar leiaute nem declarar transmissão validada. Nada abaixo virou gerador, e nenhuma transmissão foi feita nem simulada como validada.

| Arquivo | Origem | Versão / norma | SHA256 |
|---|---|---|---|
| `receita-federal/efd-reinf/manual-efd-reinf-2.1.2.1.pdf` | http://sped.rfb.gov.br/estatico/28/40FAAC1C636CC110D4C12D2790B43C641C6BCA/Manual%20da%20EFD-Reinf%20vers%C3%A3o%202.1.2.1.pdf | Manual de Orientação do Usuário 2.1.2.1 (anexo aos leiautes 2.1.2; leiautes aprovados pelo ADE COFIS nº 23/2023) | `563e771cf0b48dec156c44bc3582a469c8a7203b2e415a89da7bba1ee27f5977` |
| `receita-federal/efd-reinf/nota-tecnica-efd-reinf-03-2023.pdf` | http://sped.rfb.gov.br/estatico/3B/75ED3DE568E4EA44ECAA1EB2B2B41401C63191/Nota%20t%C3%A9cnica%20EFD-Reinf%203-2023.pdf | NT 03/2023 (ajustes no R-4010 e na tabela de natureza de rendimentos) | `7d9c0ef730f760bbc4ed45bbfc00ee237f14299b864001884139b8bd5f9d67e9` |
| `ministerio-da-saude/siops/manual-sistema-2016-municipal.pdf` | https://www.gov.br/saude/pt-br/acesso-a-informacao/siops/implicacoes-legais/como-declarar-manuais/arquivos/2016/manual-sistema-2016-municipal.pdf | Manual do sistema municipal, exercício 2016 (o mais recente publicado nessa página) | `6b9decf576addf4704136cfa661221d9a551fb37bda22fedcc290a087268ccc7` |
| `ministerio-da-saude/bnafar/portaria-gm-ms-5713-2024.html` | https://bvsms.saude.gov.br/bvs/saudelegis/gm/2024/prt5713_17_12_2024.html | Portaria GM/MS nº 5.713, de 9/12/2024. Modelos de informação da BNAFAR: registro de posição de estoque e de saídas, envio diário, OBM e CATMAT. O texto da BVS avisa que não substitui o DOU. | `d03a04223f1d787da18d71681569f3fd73e05402001596ba56500d3f39c4353b` |

Já estavam no repositório:
- `fnde-siope/Manual_SIOPE_2026.txt` e o tutorial de 2024, do SIOPE;
- as IN RFB 1.234/2012, 2.110/2022 e 2.145/2023, em `receita-federal/`.

## O que NÃO foi obtido, e por quê (pendência nomeada)

- **`FONTE-REINF-LEIAUTES-2.1.2B`.** A Receita publicou a versão 2.1.2b dos leiautes e anexos, com as notas técnicas até a 3/2025 (http://sped.rfb.gov.br/pagina/show/7895). A pasta (http://sped.rfb.gov.br/pasta/show/7893) lista os arquivos por script, e o download direto não foi conseguido nesta rodada.
  - Para baixar: abrir a pasta no navegador e salvar os leiautes, as tabelas e os XSD com o SHA256.
  - Sem eles, a série R-4000 (retenções na fonte, inclusive as do IR de PF e PJ da frente 2) não tem gerador.
- **`FONTE-SIOPS-ESTRUTURA-VIGENTE`.** O manual e os arquivos de estrutura vigentes do SIOPS saem pelo Módulo de Gestores e pelo programa (siops.datasus.gov.br), não por página pública. O de 2016 serve para conhecer a estrutura, não o leiaute de 2026.
- **`FONTE-BNAFAR-MANUAL-DE-INTEGRACAO`.** O manual de integração e o catálogo do SI-BNAFAR (o novo modelo de dados e o envio D-1) ficam no Portal de Serviços do DATASUS (servicos-datasus.saude.gov.br), que exige credencial. O plano operativo de implantação (gov.br/saude, apresentação de 2025) devolveu 404 no download.

## Licenciamento (M35)

A ordem confirma o que o código já trata: M35 é o licenciamento do SOFTWARE (`modules/m35-licenciamento`, módulos contratados por ente). Não é licenciamento municipal (alvarás). Nada foi construído com base no nome.
