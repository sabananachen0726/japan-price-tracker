// Load the existing snapshot before starting modules that read it synchronously.
const response = await fetch(new URL('../data/planner-seed.json', import.meta.url));
if (!response.ok) throw new Error('Cannot load planner snapshot: ' + response.status);
document.getElementById('seed').textContent = await response.text();
await import('./bootstrap.js');
