const input = document.getElementById('question') as HTMLInputElement | null;

window.iris.onShown(() => {
  document.body.dataset['eye'] = 'open';
  input?.focus();
  input?.select();
});

window.iris.onHidden(() => {
  document.body.dataset['eye'] = 'closed';
  if (input) input.value = '';
});
