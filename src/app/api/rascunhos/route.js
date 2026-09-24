// GET /api/rascunhos — lista os rascunhos já criados no Tiny. Só lê o
// Supabase (histórico gravado em registrarRascunhoCriado), não chama o Tiny.

import { listarRascunhosCriados } from '@/lib/db';
import { totalDaNota } from '@/lib/fiscal/montarNota';
import { erroJson, idNumerico } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const limite = Number(new URL(request.url).searchParams.get('limite') ?? 50);
  const { ok, erro, rascunhos } = await listarRascunhosCriados({ limite });

  if (!ok) return erroJson(`Não foi possível listar os rascunhos: ${erro}`, 502);

  const lista = rascunhos.map((r) => ({
    id: idNumerico(r.shopify_order_id),
    orderName: r.shopify_order_name,
    razaoSocial: r.payload_enviado?.nota_fiscal?.cliente?.nome || '—',
    classificacao: r.classificacao,
    tinyNotaId: r.tiny_nota_id,
    notaEmitida: r.nota_emitida,
    tinyNotasSubstituidas: r.tiny_notas_substituidas ?? [],
    total: r.payload_enviado ? totalDaNota(r.payload_enviado) : null,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
  }));

  return Response.json({ rascunhos: lista });
}
