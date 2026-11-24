(() => {
  if (!('modelContext' in document) || !document.modelContext) return;
  const ASK_FIRST = new Set(['cancel_order', 'remove_photo', 'remove_sample_purses', 'set_store_photo', 'update_store_settings', 'add_purse', 'update_purse', 'update_order', 'set_cover_photo', 'setup_store', 'undo_change']);
  let id = 0;
  const call = async (method, params, signal) => {
    const res = await fetch('/admin/tools', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      redirect: 'manual',
      signal,
    });
    if (res.type === 'opaqueredirect' || res.status === 403) throw new Error('Signed out. Sign in to the store manager again.');
    const body = await res.json().catch(() => ({ error: { message: `The store answered ${res.status}.` } }));
    if (body.error) throw new Error(body.error.message || String(body.error));
    return body.result;
  };
  const controller = new AbortController();
  addEventListener('pagehide', () => controller.abort(), { once: true });
  call('tools/list', {}, controller.signal)
    .then(({ tools }) => {
      for (const t of tools) {
        const hints = t.annotations || {};
        document.modelContext
          .registerTool(
            {
              name: t.name,
              description: t.description || t.title || t.name,
              inputSchema: t.inputSchema || { type: 'object', properties: {} },
              annotations: { readOnlyHint: !!hints.readOnlyHint, consequentialHint: !!hints.destructiveHint || ASK_FIRST.has(t.name) },
              execute: async (input, options) => {
                try {
                  const result = await call('tools/call', { name: t.name, arguments: input || {} }, options && options.signal);
                  const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
                  if (result.isError) return { error: text || 'That did not work.' };
                  try {
                    return JSON.parse(text);
                  } catch {
                    return { result: text };
                  }
                } catch (e) {
                  return { error: e instanceof Error ? e.message : 'That did not work.' };
                }
              },
            },
            { signal: controller.signal },
          )
          ?.catch?.(() => {});
      }
    })
    .catch(() => {});
})();
