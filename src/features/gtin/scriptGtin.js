// Script que o usuário cola no console do navegador, dentro da nota na Olist.
// Ele percorre os itens da nota e grava "SEM GTIN" nos dois campos de GTIN.
// Mantido como texto puro: não roda aqui, só é copiado para a área de transferência.

export const SCRIPT_GTIN = `//GYIN SLAYER V1
(async () => {
  window.__meuBotStop = false;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const COMECAR_DO_ITEM = 0;

  function setNativeValue(el, value) {
    el.value = value;
    if (el.id === 'gtin') atualizarItemTemp('gtin', value);
    if (el.id === 'gtinEmbalagem') atualizarItemTemp('gtinEmbalagem', value);
  }

  async function esperarElemento(seletor, timeout = 8000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      const el = document.querySelector(seletor);
      if (el) return el;
      await sleep(150);
    }
    return null;
  }

  async function esperarSumirModal() {
    for (let i = 0; i < 60; i++) {
      const modal = document.querySelector('#bs-modal .modal-content');
      if (!modal) return true;
      await sleep(200);
    }
    return false;
  }

  async function editarItem(linha, index, total) {
    console.log(\`👉 (\${index}/\${total}) abrindo item...\`);

    const btnEditar = linha.querySelectorAll("a, button")[0];
    if (!btnEditar) { console.warn("❌ botão editar não encontrado na linha"); return; }
    btnEditar.click();

    const modal = await esperarElemento('#bs-modal .modal-content');
    if (!modal) { console.warn("❌ modal não abriu"); return; }
    await sleep(400);

    const abaOutros = [...modal.querySelectorAll("a")]
      .find(a => a.innerText.toLowerCase().includes("outros"));
    if (!abaOutros) { console.warn("❌ aba outros não encontrada"); return; }
    abaOutros.click();
    await sleep(500);

    const campoGtin = document.querySelector('input#gtin');
    const campoGtinTrib = document.querySelector('input#gtinEmbalagem');

    if (!campoGtin || !campoGtinTrib) {
      console.warn("❌ campos GTIN não encontrados");
      return;
    }

    setNativeValue(campoGtin, "SEM GTIN");
    await sleep(150);
    setNativeValue(campoGtinTrib, "SEM GTIN");
    await sleep(150);

    const btnSalvar = [...modal.querySelectorAll("button")]
      .find(b => b.getAttribute('onclick')?.includes('salvarItemEdicao'));
    if (!btnSalvar) { console.warn("❌ botão salvar item não encontrado"); return; }
    btnSalvar.click();
    console.log(\`✓ (\${index}/\${total}) salvo\`);

    await esperarSumirModal();
    await sleep(300);
  }

  const linhas = [...document.querySelectorAll("tr.linhaItemNota")];
  const total = linhas.length;
  console.log(\`🚀 Total: \${total} itens — começando do item \${COMECAR_DO_ITEM + 1}\`);

  for (let i = COMECAR_DO_ITEM; i < total; i++) {
    if (window.__meuBotStop === true) {
      console.warn(\`🛑 Interrompido no item \${i + 1}. Para continuar, rode novamente com COMECAR_DO_ITEM = \${i}\`);
      break;
    }
    await editarItem(linhas[i], i + 1, total);
    await sleep(200);
  }

  console.log("%c[Bot] ✅ Todos os GTINs atualizados!", "color: green; font-weight: bold;");
})();
`;
