# Notas de atacado — Shopify para Tiny (Olist)

Protótipo que lê pedidos de atacado e de franquia, monta a nota fiscal e cria o
**rascunho** dentro do Tiny. A conferência e a emissão continuam manuais, no
próprio Tiny — este sistema nunca emite nota.

Cobre apenas o primeiro dos três processos fiscais de hoje. Notas de
transferência entre lojas e de devolução ficam para depois; a estrutura de
pastas foi pensada para receber esses fluxos sem reescrever nada.

---



| Operação | Endpoint do Tiny | Risco |
|---|---|---|

| Consultar nota | `nota.fiscal.obter.php` | Nenhum, só lê |
| Criar rascunho | `nota.fiscal.incluir.php` | **Cria uma nota real na conta de produção** |
| Emitir nota | `nota.fiscal.emitir.php` | Nunca chamado neste protótipo |

### Travas de segurança

São duas, independentes:

1. **Confirmação na tela.** Criar o rascunho exige marcar uma caixa de
   confirmação no preview. Sem ela, o botão fica desabilitado e o endpoint
   recusa a requisição. Existe porque o pedido é fictício mas a nota gerada não
   é: ela aparece no Tiny de produção e precisa ser excluída lá depois do teste.
2. **`PERMITIR_EMISSAO=false`.** Trava só a emissão fiscal. A função
  `emitirNota` existe em `src/server/integrations/tiny.js` para o dia em que o fluxo for aprovado,
   mas lança erro enquanto a variável não for `true`. Nenhuma rota do protótipo
   a chama.

---

## Pré-requisitos

- Node.js 18.17 ou superior
- Uma conta no Supabase (plano gratuito serve)
- Token da API 2.0 do Tiny
- Conta no Vercel para publicar

---

|env_exemplo |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | Deixe como está. Não é usado nesta fase. |
| `SHOPIFY_ADMIN_TOKEN` | Deixe vazio. Ainda não disponível. |
| `SHOPIFY_API_VERSION` | `2025-07` |
| `TINY_API_TOKEN` | Token em Configurações > Geral > Tokens no Tiny |
| `TINY_API_BASE` | `https://api.tiny.com.br/api2` |
| `SUPABASE_URL` | Project Settings > API > Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings > API > `service_role`. Nunca exponha no navegador. |
| `PERMITIR_EMISSAO` | `false`. Não mude sem alinhar com o time fiscal. |
| `NATUREZA_OPERACAO_ATACADO` | Texto exato cadastrado no Tiny |
| `NATUREZA_OPERACAO_FRANQUIA` | Texto exato cadastrado no Tiny |

O sistema funciona sem Supabase, mas sem histórico e sem a proteção contra nota
duplicada. A página inicial avisa quando ele não está configurado.

### Criando as tabelas no Supabase

No painel do Supabase: **SQL Editor > New query**, cole o conteúdo de
`supabase/schema.sql` e clique em **Run**. São duas tabelas,
`notas_processadas` e `itens_pendentes`.

---

## Como publicar no Vercel

1. Suba o repositório para o GitHub.
2. No Vercel: **Add New > Project**, escolha o repositório. O framework é
   detectado como Next.js sozinho.
3. Em **Environment Variables**, cadastre todas as variáveis do `.env.example`
   com os valores reais, para os ambientes Production e Preview.
4. **Deploy**. A cada push na branch principal o Vercel republica.

Se algo falhar depois do deploy, abra `/api/saude` na URL publicada: a resposta
diz qual serviço está com problema e por quê.

---

## Mapa do projeto

O projeto segue uma organização orientada a **features**: cada domínio
(`pedidos`, `rascunhos`) tem sua própria pasta de componentes em
`src/features/`, e o que é compartilhado entre eles (integrações externas,
acesso a dados, utilitários) fica isolado em `src/server/`. As rotas em
`src/app/` são só a "casca" de roteamento do Next.js — cada `page.js` apenas
reexporta o componente da feature correspondente, e cada `route.js` de API
importa o que precisa de `src/server/`.

```
src/
  app/
    page.js                    Entrada da rota inicial -> features/inicio
    pedidos/page.js             Entrada da rota da lista -> features/pedidos
    pedidos/[id]/page.js        Entrada da rota do preview -> features/pedidos
    rascunhos/page.js           Entrada da rota de rascunhos -> features/rascunhos
    api/saude/route.js          Testa Shopify, Tiny e Supabase
    api/pedidos/route.js        Lista pedidos + classificação + situação
    api/pedidos/[id]/preview/   Monta o payload da nota (só leitura)
    api/pedidos/[id]/rascunho/  Cria o rascunho no Tiny (escreve em produção)
    globals.css                 Todo o estilo do projeto

  features/
    inicio/components/
      Inicio.js                 Página inicial: status das integrações
    pedidos/components/
      ListaPedidos.js            Lista de pedidos classificados, com filtro
      PreviewPedido.js            Preview da nota: campos editáveis, itens, envio
    rascunhos/components/
      IncluirRascunho.js          Último passo: grava o rascunho no Tiny
      EditarRascunho.js           Corrige um rascunho já criado no Tiny
      ListaRascunhos.js           Histórico de rascunhos + emissão da nota

  server/
    classificacao.js            Atacado, franquia ou outro, a partir do CNPJ
    montarNota.js                Pedido do Shopify -> JSON do nota.fiscal.incluir
    db.js                        Histórico no Supabase
    util.js                      Formatação de valor, data, CEP, CNPJ, endereço
    integrations/
      shopify.js                 Fonte dos pedidos. Hoje simulada; troca isolada aqui
      tiny.js                    API 2.0 do Tiny, com as travas de segurança

supabase/
  schema.sql                    As duas tabelas do histórico
```

Novos fluxos fiscais (transferência entre lojas, devolução) entram como uma
nova pasta em `src/features/<fluxo>/`, reaproveitando o que já existe em
`src/server/` sem reescrever nada.

### Casos cobertos por `pedidos-fake.json`

| Pedido | O que testa |
|---|---|
| `#72101` | Atacado simples, CNPJ no `company` do endereço de cobrança |
| `#72102` | Franquia, CNPJ em metafield do cliente, presente na lista fixa |
| `#72103` | Varejo sem CNPJ — precisa cair em "outro" |
| `#72104` | 120 itens: paginação da leitura e da tela |
| `#72105` | Um SKU inexistente no Tiny: alerta e bloqueio do botão |
| `#72106` | Desconto de 35%: confirma que o valor vem do preço com desconto |

---

## Quando o token do Shopify chegar

Toda a mudança acontece dentro de `src/server/integrations/shopify.js`. O arquivo já contém a
função `shopifyGraphQL`, as duas queries finais e a versão real de
`obterPedidoCompleto` comentada no fim. Os passos:

1. Preencher `SHOPIFY_STORE_DOMAIN` e `SHOPIFY_ADMIN_TOKEN`.
2. Trocar o corpo de `listarPedidosRecentes` e `obterPedidoCompleto` pelas
   versões que usam `shopifyGraphQL`.
3. Ajustar `verificarShopify` para fazer uma consulta real em vez de ler o
   arquivo local.
4. Remover o comentário de MODO SIMULADO do topo.

As assinaturas das funções não mudam, então páginas e rotas continuam iguais.

---

### No Shopify

- **Onde fica o CNPJ do cliente**: metafield, `company` do endereço, atributo do
  pedido ou conta B2B? Hoje o código lê os quatro, nessa ordem, e usa o primeiro
  que tiver 14 dígitos — mas o campo definitivo precisa ser confirmado.
- **Bairro**: o Shopify não tem esse campo por padrão e o Tiny costuma pedir.
  De onde ele sai?

Todos esses pontos estão marcados com `// TODO` no código.
