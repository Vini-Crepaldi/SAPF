-- schema.sql — rode este arquivo uma vez no SQL Editor do Supabase
-- (Dashboard > SQL Editor > New query > colar > Run).

-- Histórico de tudo que este sistema fez com cada pedido.
-- A unicidade de shopify_order_id é o que impede nota duplicada.
create table if not exists notas_processadas (
  id bigserial primary key,
  shopify_order_id text not null unique,
  shopify_order_name text not null,
  classificacao text not null,            -- atacado | franquia
  status text not null,                   -- preview | rascunho_criado | erro
  tiny_nota_id text,
  nota_emitida boolean not null default false, -- true só depois de confirmado no Tiny
  payload_enviado jsonb,
  resposta_tiny jsonb,
  erro text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- Fila de trabalho do time: SKUs que precisam de cadastro ou de correção no Tiny.
create table if not exists itens_pendentes (
  id bigserial primary key,
  shopify_order_name text not null,
  sku text not null,
  quantidade int not null,
  motivo text not null,                   -- nao_encontrado | multiplos_cadastros
  criado_em timestamptz default now()
);

-- Para quem já rodou este schema antes de a coluna existir.
alter table notas_processadas add column if not exists nota_emitida boolean not null default false;

-- IDs de rascunhos antigos, substituídos por uma recriação (ver "editar
-- rascunho" na tela de rascunhos). A API do Tiny não tem endpoint para
-- alterar nem excluir uma nota — corrigir um rascunho significa criar um novo
-- no Tiny e cancelar/excluir o antigo lá dentro, à mão. Esta coluna é só o
-- registro de quais IDs antigos ainda esperam essa limpeza manual.
alter table notas_processadas add column if not exists tiny_notas_substituidas text[] not null default '{}';

-- Flags de configuração que precisam poder mudar em tempo real, sem depender
-- de reiniciar o servidor (variável de ambiente só é lida na inicialização).
-- PERMITIR_EMISSAO mora aqui, não no .env, por isso.
create table if not exists configuracoes (
  chave text primary key,
  valor boolean not null default false,
  atualizado_em timestamptz default now()
);

create index if not exists idx_notas_status on notas_processadas (status);
create index if not exists idx_pendentes_sku on itens_pendentes (sku);

-- CNPJs dos clientes franqueados. Antes vivia numa constante fixa em
-- classificacao.js; migrado para cá para poder ser editado sem deploy (ver
-- listarCnpjsFranquia em src/lib/db.js).
--
-- Este repositório é público (ou vai ser) — por isso a carga de dados reais
-- NÃO fica aqui. Cadastre os CNPJs direto no SQL Editor do Supabase, fora do
-- controle de versão, algo como:
--   insert into cnpjs_franquia (cnpj, apelido) values ('00000000000000', 'Nome da franquia');
create table if not exists cnpjs_franquia (
  cnpj text primary key,           -- só dígitos, sem máscara
  apelido text,                    -- nome da franquia, só para referência humana
  ativo boolean not null default true,
  criado_em timestamptz default now()
);

-- As tabelas são acessadas só pelo servidor, com a service role key, que ignora
-- RLS. Ligamos RLS mesmo assim para que nenhuma chave pública leia esses dados.
alter table notas_processadas enable row level security;
alter table itens_pendentes  enable row level security;
alter table configuracoes    enable row level security;
alter table cnpjs_franquia   enable row level security;
