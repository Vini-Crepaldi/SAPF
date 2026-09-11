// GET /api/pedidos/[id]/danfe?tinyNotaId=... — resolve o link do DANFE no
// Tiny e redireciona pra lá.
//
// O link do Tiny NÃO é um PDF cru: é uma página HTML com impressão
// automática (window.print()), pensada pra abrir direto no navegador — a
// pessoa salva como PDF pelo próprio diálogo de impressão. Por isso aqui só
// se resolve o link (mantendo o token da API fora do navegador) e redireciona,
// em vez de tentar reembrulhar os bytes como se fossem um PDF de verdade.

import { obterLinkDanfe } from '@/lib/integrations/tiny';
import { erroJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const tinyNotaId = new URL(request.url).searchParams.get('tinyNotaId');
  if (!tinyNotaId) return erroJson('tinyNotaId ausente na URL.', 400);

  let link;
  try {
    link = await obterLinkDanfe(tinyNotaId);
  } catch (erro) {
    return erroJson(`Não foi possível obter o DANFE: ${erro.message}`, 502);
  }

  return Response.redirect(link, 302);
}
