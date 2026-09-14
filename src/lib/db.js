// db.js — histórico no Supabase.
//
// Regra de ouro deste arquivo: falha de persistência não pode derrubar o fluxo
// fiscal nem, pior, esconder que uma nota foi criada no Tiny. Por isso as
// funções devolvem { ok, erro } em vez de lançar exceção.

import { createClient } from '@supabase/supabase-js';

let cliente = null;

/** Cria o cliente sob demanda. Devolve null se o Supabase não estiver configurado. */
function obterCliente() {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;

  // A service role key só pode ser usada no servidor (API Routes) — ela ignora
  // as políticas de RLS.
  cliente = createClient(url, chave, {
    auth: { persistSession: false },
    // O Next.js "sequestra" o fetch global e cacheia GETs por padrão — sem
    // isso, uma consulta feita cedo (ex.: lista ainda vazia) fica presa no
    // cache e nunca reflete escritas seguintes, mesmo com dynamic='force-dynamic'.
    global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) },
  });
  return cliente;
}

const SEM_CONFIG = {
  ok: false,
  erro: 'Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes).',
};

/** Grava (ou atualiza) o pedido no status "preview". */
export async function registrarPreview({ orderId, orderName, classificacao, payload }) {
  const db = obterCliente();
  if (!db) return SEM_CONFIG;

  const { data, error } = await db
    .from('notas_processadas')
    .upsert(
      {
        shopify_order_id: orderId,
        shopify_order_name: orderName,
        classificacao,
        status: 'preview',
        payload_enviado: payload ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'shopify_order_id' }
    )
    .select()
    .single();

  return error ? { ok: false, erro: error.message } : { ok: true, registro: data };
}

/**
 * Marca o pedido como rascunho criado e guarda a resposta do Tiny.
 * `notasSubstituidas`, quando informado, grava a lista de tiny_nota_id de
 * rascunhos antigos que este novo rascunho substitui (ver editarRascunho em
 * app/api/pedidos/[id]/rascunho/route.js) — omitido, a coluna não é tocada.
 */
export async function registrarRascunhoCriado({
  orderId,
  orderName,
  classificacao,
  payload,
  tinyNotaId,
  respostaTiny,
  notasSubstituidas,
}) {
  const db = obterCliente();
  if (!db) return SEM_CONFIG;

  const registro = {
    shopify_order_id: orderId,
    shopify_order_name: orderName,
    classificacao,
    status: 'rascunho_criado',
    tiny_nota_id: tinyNotaId,
    payload_enviado: payload ?? null,
    resposta_tiny: respostaTiny ?? null,
    erro: null,
    atualizado_em: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('notas_processadas')
    .upsert(registro, { onConflict: 'shopify_order_id' })
    .select()
    .single();

  return error ? { ok: false, erro: error.message } : { ok: true, registro: data };
}

/** Busca o rascunho já criado deste pedido — usado pela tela de edição, que
 *  precisa do payload realmente enviado ao Tiny (não do pedido recalculado a
 *  partir do Shopify). Devolve rascunho: null quando o pedido ainda não tem
 *  rascunho criado. */
export async function obterRascunhoCriado(orderId) {
  const db = obterCliente();
  if (!db) return { ok: false, erro: SEM_CONFIG.erro, rascunho: null };

  const { data, error } = await db
    .from('notas_processadas')
    .select(
      'shopify_order_name, classificacao, status, tiny_nota_id, nota_emitida, payload_enviado'
    )
    .eq('shopify_order_id', orderId)
    .maybeSingle();

  if (error) return { ok: false, erro: error.message, rascunho: null };
  if (!data || data.status !== 'rascunho_criado') return { ok: true, rascunho: null };
  return { ok: true, rascunho: data };
}

/** Guarda o erro para o pedido aparecer na lista como "erro". */
export async function registrarErro({ orderId, orderName, classificacao, payload, mensagem }) {
  const db = obterCliente();
  if (!db) return SEM_CONFIG;

  const { error } = await db.from('notas_processadas').upsert(
    {
      shopify_order_id: orderId,
      shopify_order_name: orderName,
      classificacao: classificacao ?? 'outro',
      status: 'erro',
      payload_enviado: payload ?? null,
      erro: String(mensagem ?? '').slice(0, 2000),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'shopify_order_id' }
  );

  return error ? { ok: false, erro: error.message } : { ok: true };
}

/**
 * Trava contra nota duplicada. Só considera processado quando o rascunho
 * realmente foi criado — um preview antigo não bloqueia nova tentativa.
 */
export async function jaProcessado(orderId) {
  const db = obterCliente();
  if (!db) return { processado: false, ...SEM_CONFIG };

  const { data, error } = await db
    .from('notas_processadas')
    .select('status, tiny_nota_id')
    .eq('shopify_order_id', orderId)
    .maybeSingle();

  if (error) return { processado: false, ok: false, erro: error.message };
  return {
    ok: true,
    processado: data?.status === 'rascunho_criado',
    tinyNotaId: data?.tiny_nota_id ?? null,
    status: data?.status ?? null,
  };
}

/** Atualiza só a flag de emissão fiscal, sem mexer no restante do registro. */
export async function atualizarNotaEmitida(orderId, emitida) {
  const db = obterCliente();
  if (!db) return SEM_CONFIG;

  const { error } = await db
    .from('notas_processadas')
    .update({ nota_emitida: emitida, atualizado_em: new Date().toISOString() })
    .eq('shopify_order_id', orderId);

  return error ? { ok: false, erro: error.message } : { ok: true };
}

/** Registra os SKUs que precisam de cadastro ou correção no Tiny. */
export async function salvarItensPendentes(orderName, pendencias) {
  const db = obterCliente();
  if (!db) return SEM_CONFIG;
  if (!pendencias?.length) return { ok: true, gravados: 0 };

  const linhas = pendencias.map((p) => ({
    shopify_order_name: orderName,
    sku: p.sku,
    quantidade: p.quantidade ?? 0,
    motivo: p.motivo, // nao_encontrado | multiplos_cadastros
  }));

  const { error } = await db.from('itens_pendentes').insert(linhas);
  return error ? { ok: false, erro: error.message } : { ok: true, gravados: linhas.length };
}

/** Mapa orderId -> status, usado pela lista de pedidos. */
export async function statusPorPedido(orderIds) {
  const db = obterCliente();
  if (!db) return {};

  const { data, error } = await db
    .from('notas_processadas')
    .select('shopify_order_id, status, tiny_nota_id, nota_emitida')
    .in('shopify_order_id', orderIds);

  if (error || !data) return {};
  return Object.fromEntries(data.map((r) => [r.shopify_order_id, r]));
}

/**
 * Trava de emissão fiscal — mora no Supabase, não no .env, porque precisa
 * mudar em tempo real (variável de ambiente só é lida na inicialização do
 * processo). Sem Supabase configurado, o padrão é bloqueado (mais seguro).
 */
export async function obterPermitirEmissao() {
  const db = obterCliente();
  if (!db) return false;

  const { data, error } = await db.from('configuracoes').select('valor').eq('chave', 'permitir_emissao').maybeSingle();
  if (error) return false;
  return data?.valor === true;
}

/** Liga/desliga a emissão fiscal. Some com o "sem Supabase" — exige config. */
export async function definirPermitirEmissao(valor) {
  const db = obterCliente();
  if (!db) return SEM_CONFIG;

  const { error } = await db
    .from('configuracoes')
    .upsert({ chave: 'permitir_emissao', valor: !!valor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });

  return error ? { ok: false, erro: error.message } : { ok: true, permitirEmissao: !!valor };
}

/** Lista os rascunhos já criados no Tiny, mais recentes primeiro. */
export async function listarRascunhosCriados({ limite = 50 } = {}) {
  const db = obterCliente();
  if (!db) return { ok: false, erro: SEM_CONFIG.erro, rascunhos: [] };

  const { data, error } = await db
    .from('notas_processadas')
    .select(
      'shopify_order_id, shopify_order_name, classificacao, tiny_nota_id, nota_emitida, payload_enviado, criado_em, atualizado_em'
    )
    .eq('status', 'rascunho_criado')
    .order('atualizado_em', { ascending: false })
    .limit(limite);

  if (error) return { ok: false, erro: error.message, rascunhos: [] };
  return { ok: true, rascunhos: data ?? [] };
}

/** CNPJs (só dígitos) dos clientes franqueados, para a classificação decidir
 *  atacado x franquia. `ok: false` quando o Supabase não está configurado ou
 *  a consulta falha — quem chama decide o que fazer (ver classificacao.js). */
export async function listarCnpjsFranquia() {
  const db = obterCliente();
  if (!db) return { ok: false, erro: SEM_CONFIG.erro, cnpjs: [] };

  const { data, error } = await db.from('cnpjs_franquia').select('cnpj').eq('ativo', true);

  if (error) return { ok: false, erro: error.message, cnpjs: [] };
  return { ok: true, cnpjs: (data ?? []).map((r) => r.cnpj) };
}

/** Ping usado pelo /api/saude. */
export async function verificarSupabase() {
  const db = obterCliente();
  if (!db) return { servico: 'Supabase', ok: false, detalhe: SEM_CONFIG.erro };

  const { error } = await db.from('notas_processadas').select('id').limit(1);
  if (error) {
    return {
      servico: 'Supabase',
      ok: false,
      detalhe: `${error.message}. Rode supabase/schema.sql no SQL Editor se as tabelas ainda não existem.`,
    };
  }
  return { servico: 'Supabase', ok: true, detalhe: 'Conectado e tabelas acessíveis.' };
}
