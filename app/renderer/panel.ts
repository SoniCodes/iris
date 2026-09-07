const input = document.getElementById('question') as HTMLInputElement | null;
const response = document.getElementById('response') as HTMLElement | null;
const statusLine = document.getElementById('status') as HTMLElement | null;

let answer = '';
let busy = false;

function setPlaceholder(text: string): void {
  if (!response) return;
  response.textContent = '';
  const paragraph = document.createElement('p');
  paragraph.className = 'placeholder';
  paragraph.textContent = text;
  response.append(paragraph);
}

function setAnswer(text: string): void {
  if (!response) return;
  response.textContent = '';
  const paragraph = document.createElement('p');
  paragraph.className = 'answer';
  // textContent, never innerHTML: this text came out of another app's UI
  paragraph.textContent = text;
  response.append(paragraph);
  response.scrollTop = response.scrollHeight;
}

function setStatus(text: string): void {
  if (statusLine) statusLine.textContent = text;
}

function reset(): void {
  answer = '';
  busy = false;
  document.body.dataset['busy'] = 'false';
  setStatus('');
  setPlaceholder('Iris has not read anything yet.');
}

input?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  const question = input.value.trim();
  if (!question || busy) return;

  busy = true;
  answer = '';
  document.body.dataset['busy'] = 'true';
  setPlaceholder('');
  window.iris.ask(question);
});

window.iris.onStatus((text) => {
  setStatus(text);
  if (!answer) setPlaceholder(`${text}…`);
});

window.iris.onChunk((text) => {
  answer += text;
  setAnswer(answer);
});

window.iris.onDone(() => {
  busy = false;
  document.body.dataset['busy'] = 'false';
  setStatus('');
});

window.iris.onError((message) => {
  busy = false;
  document.body.dataset['busy'] = 'false';
  setStatus('');
  if (!response) return;
  response.textContent = '';
  const paragraph = document.createElement('p');
  paragraph.className = 'error';
  paragraph.textContent = message;
  response.append(paragraph);
});

window.iris.onShown(() => {
  document.body.dataset['eye'] = 'open';
  input?.focus();
  input?.select();
});

window.iris.onHidden(() => {
  document.body.dataset['eye'] = 'closed';
  if (input) input.value = '';
  reset();
});
