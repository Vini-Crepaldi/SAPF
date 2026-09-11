// GET /api/pedidos — pedidos recentes, já classificados e com a situação de
// processamento de cada um.

import { listarPedidosRecentes } from '@/lib/integrations/shopify';
import { classificarComListaFranquia, extrairCnpj } from '@/lib/fiscal/classificacao';
import { statusPorPedido, listarCnpjsFranquia } from '@/lib/db';
import { idNumerico, erroJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const limite = Number(new URL(request.url).searchParams.get('limite') ?? 30);
    const pedidos = await listarPedidosRecentes({ limite });

    // Uma consulta só ao Supabase para todos os pedidos da página — tanto para
    // a situação de cada um quanto para a lista de CNPJs de franquia usada na
    // classificação.
    const [situacoes, cnpjsFranquiaResp] = await Promise.all([
      statusPorPedido(pedidos.map((p) => p.id)),
      listarCnpjsFranquia(),
    ]);
    if (!cnpjsFranquiaResp.ok) {
      console.error('[pedidos] Falha ao buscar cnpjs_franquia no Supabase, classificando sem a lista de franquia:', cnpjsFranquiaResp.erro);
    }
    const cnpjsFranquia = cnpjsFranquiaResp.ok ? cnpjsFranquiaResp.cnpjs : [];

    const lista = pedidos.map((p) => {
      const { cnpj, origem } = extrairCnpj(p._bruto);
      const situacao = situacoes[p.id];
      return {
        id: idNumerico(p.id),
        gid: p.id,
        name: p.name,
        createdAt: p.createdAt,
        cliente: p.cliente,
        total: p.total,
        tags: p.tags,
        classificacao: classificarComListaFranquia(p._bruto, cnpjsFranquia),
        cnpj: cnpj,
        origemCnpj: origem,
        status: situacao?.status ?? null,
        tinyNotaId: situacao?.tiny_nota_id ?? null,
        notaEmitida: situacao?.nota_emitida ?? false,
      };
    });

    return Response.json({ pedidos: lista, modo: 'real' });
  } catch (erro) {
    return erroJson(`Não foi possível listar os pedidos: ${erro.message}`);
  }
}
