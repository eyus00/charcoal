const status = document.getElementById('status');
const grant = document.getElementById('grant');
const v = chrome.runtime.getManifest().version;

async function render() {
  const ok = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  status.className = ok ? 'ok' : 'warn';
  status.textContent = ok ? `Active (v${v}). Open Charcoal and play something.` : 'Needs access to streaming sites to work.';
  grant.hidden = ok;
}
grant.addEventListener('click', async () => {
  await chrome.permissions.request({ origins: ['<all_urls>'] });
  render();
});
render();
