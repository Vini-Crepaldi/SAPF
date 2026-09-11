// GET/POST /api/config/permitir-emissao — liga/desliga a trava de emissão
// fiscal. Fica no Supabase (não no .env) porque precisa ter efeito imediato,
// sem depender de reiniciar o servidor.

import { obterPermitirEmissao, definirPermitirEmissao } from '@/lib/db';
import { erroJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const permitirEmissao = await obterPermitirEmissao();
  return Response.json({ permitirEmissao });
}

export async function POST(request) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return erroJson('Corpo da requisição inválido: era esperado um JSON.', 400);
  }

  if (typeof corpo?.permitirEmissao !== 'boolean') {
    return erroJson('Envie { permitirEmissao: true|false }.', 400);
  }

  const resultado = await definirPermitirEmissao(corpo.permitirEmissao);
  if (!resultado.ok) return erroJson(`Não foi possível salvar: ${resultado.erro}`, 502);

  return Response.json({ permitirEmissao: resultado.permitirEmissao });
}
