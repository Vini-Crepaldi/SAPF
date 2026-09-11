// GET /api/pedidos/[id]/situacao — confere no Tiny se a nota já foi emitida
// (não só criada como rascunho) e grava o resultado no Supabase.
//
// Só é útil depois que o rascunho já existe. Chamado sob demanda pela lista
// de pedidos, um pedido por vez, para não atrasar o carregamento da lista.

import { verificarNotaEmitida } from '@/lib/integrations/tiny';
import { jaProcessado, atualizarNotaEmitida } from '@/lib/db';
import { erroJson, paraGid } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const { id } = await params;
  const gid = paraGid(id);

  const situacao = await jaProcessado(gid);
  if (!situacao.processado || !situacao.tinyNotaId) {
    return Response.json({ rascunhoCriado: situacao.status === 'rascunho_criado', notaEmitida: false });
  }

  try {
    const emitida = await verificarNotaEmitida(situacao.tinyNotaId);
    await atualizarNotaEmitida(gid, emitida);
    return Response.json({ rascunhoCriado: true, notaEmitida: emitida, tinyNotaId: situacao.tinyNotaId });
  } catch (erro) {
    return erroJson(`Não foi possível confirmar a emissão no Tiny: ${erro.message}`, 502);
  }
}
