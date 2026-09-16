// /gtin — copia para a área de transferência o script que corrige os GTINs
// dos itens de uma nota direto no console da Olist.

'use client';

import { useState } from 'react';
import { SCRIPT_GTIN } from '../scriptGtin';

/** Cópia com fallback para navegadores/contextos sem a API de área de transferência. */
async function copiar(texto) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const deuCerto = document.execCommand('copy');
  document.body.removeChild(area);
  if (!deuCerto) throw new Error('o navegador recusou a cópia');
}

export default function AlteradorGtin() {
  const [situacao, setSituacao] = useState(null);

  async function aoClicar() {
    try {
      await copiar(SCRIPT_GTIN);
      setSituacao({ ok: true, texto: 'Script copiado para a área de transferência.' });
    } catch (e) {
      setSituacao({ ok: false, texto: `Não foi possível copiar: ${e.message}` });
    }
  }

  return (
    <>
      <h2>GTIN</h2>

      <button onClick={aoClicar}>Alterador de Gtin</button>

      {situacao && (
        <p className={situacao.ok ? 'marca marca-ok' : 'marca marca-erro'} style={{ marginTop: '0.75rem' }}>
          {situacao.texto}
        </p>
      )}

      <p style={{ marginTop: '1rem' }}>
        Se a nota tiver com erro de Gtin, click no botão acima, va dentro da nota na Olist, aperte Cntrl
        + Shift + i para abrir o console, e aperte Cntrl + V na aba da direita que foi aberta
      </p>
    </>
  );
}
