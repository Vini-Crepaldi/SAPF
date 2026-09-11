// POST /api/pedidos/[id]/emitir — emite a nota no Tiny (dá valor fiscal).
//
// ESTE ENDPOINT É IRREVERSÍVEL. Só funciona com a trava "permitir_emissao"
// ligada (tela de rascunhos) — checada de novo aqui e dentro de
// lib/integrations/tiny.js::emitirNota, então nenhuma das duas pode ser pulada.

import { emitirNota } from '@/lib/integrations/tiny';
import { obterPermitirEmissao, atualizarNotaEmitida } from '@/lib/db';
import { erroJson, paraGid } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const { id } = await params;
  const gid = paraGid(id);

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return erroJson('Corpo da requisição inválido: era esperado um JSON.', 400);
  }

  const { tinyNotaId } = corpo ?? {};
  if (!tinyNotaId) {
    return erroJson('tinyNotaId ausente. Este pedido ainda não tem rascunho criado no Tiny.', 400);
  }

  const permitido = await obterPermitirEmissao();
  if (!permitido) {
    return erroJson('Emissão bloqueada. Ligue "Permitir emissão" no topo da tela de rascunhos.', 403);
  }

  try {
    await emitirNota(tinyNotaId);
  } catch (erro) {
    return erroJson(erro.message, 502);
  }

  const registro = await atualizarNotaEmitida(gid, true);
  if (!registro.ok) {
    console.error(`[emitir] Nota ${tinyNotaId} emitida no Tiny, mas falhou ao registrar no Supabase:`, registro.erro);
  }

  return Response.json({
    ok: true,
    tinyNotaId,
    mensagem: 'Nota emitida no Tiny.',
  });
}
