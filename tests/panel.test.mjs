import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../dist/renderer/panel.js', import.meta.url), 'utf8');

function element(tag) {
  return {
    tag,
    className: '',
    value: '',
    scrollTop: 0,
    scrollHeight: 0,
    dataset: {},
    nodes: [],
    own: '',
    listeners: new Map(),
    focused: false,
    get textContent() {
      return this.nodes.length ? this.nodes.map((node) => node.textContent).join('') : this.own;
    },
    set textContent(text) {
      this.own = text;
      this.nodes = [];
    },
    append(...nodes) {
      this.nodes.push(...nodes);
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    focus() {
      this.focused = true;
    },
    select() {},
    press(key) {
      this.listeners.get('keydown')?.({ key, isComposing: false });
    },
  };
}

// run the built file rather than importing it: every test needs its own copy of
// the panel's module state, and an import would be cached across all of them
function mount() {
  const question = element('input');
  const response = element('section');
  const status = element('span');
  const body = element('body');
  const asked = [];
  const bridge = {};

  const document = {
    body,
    getElementById: (id) =>
      ({ question, response, status })[id] ?? null,
    createElement: element,
  };

  const window = {
    iris: {
      ask: (text) => asked.push(text),
      cancel() {},
      close() {},
      onShown: (handler) => (bridge.shown = handler),
      onHidden: (handler) => (bridge.hidden = handler),
      onStatus: (handler) => (bridge.status = handler),
      onChunk: (handler) => (bridge.chunk = handler),
      onDone: (handler) => (bridge.done = handler),
      onError: (handler) => (bridge.error = handler),
    },
  };

  new Function('window', 'document', source)(window, document);
  return { question, response, status, body, asked, bridge };
}

test('listens for everything the main process sends back', () => {
  const { bridge } = mount();

  for (const name of ['shown', 'hidden', 'status', 'chunk', 'done', 'error']) {
    assert.equal(typeof bridge[name], 'function', `nothing is listening for ${name}`);
  }
});

test('sends the typed question on enter', () => {
  const { question, asked } = mount();

  question.value = '  how do I open a new tab?  ';
  question.press('Enter');

  assert.deepEqual(asked, ['how do I open a new tab?']);
});

test('ignores an empty question and any key that is not enter', () => {
  const { question, asked } = mount();

  question.value = '   ';
  question.press('Enter');
  question.value = 'how do I print?';
  question.press('a');

  assert.deepEqual(asked, []);
});

test('takes one question at a time', () => {
  const { question, asked, body, bridge } = mount();

  question.value = 'how do I print?';
  question.press('Enter');
  assert.equal(body.dataset['busy'], 'true');

  question.press('Enter');
  assert.deepEqual(asked, ['how do I print?']);

  bridge.done();
  assert.equal(body.dataset['busy'], 'false');

  question.press('Enter');
  assert.equal(asked.length, 2);
});

test('joins streamed chunks into one answer', () => {
  const { response, bridge } = mount();

  bridge.status('reading the screen');
  bridge.chunk('Use File > New Tab');
  bridge.chunk(' (⌘T).');

  assert.equal(response.textContent, 'Use File > New Tab (⌘T).');
  assert.equal(response.nodes.at(-1).className, 'answer');
});

test('shows an error in place of the answer', () => {
  const { response, status, body, bridge } = mount();

  bridge.chunk('half an answer');
  bridge.error('Cannot reach Ollama at http://127.0.0.1:11434. Is it running?');

  assert.equal(
    response.textContent,
    'Cannot reach Ollama at http://127.0.0.1:11434. Is it running?',
  );
  assert.equal(response.nodes.at(-1).className, 'error');
  assert.equal(status.textContent, '');
  assert.equal(body.dataset['busy'], 'false');
});

test('opens on the input and forgets the last answer on close', () => {
  const { question, response, body, bridge } = mount();

  bridge.shown();
  assert.equal(body.dataset['eye'], 'open');
  assert.equal(question.focused, true);

  question.value = 'how do I print?';
  bridge.chunk('Use File > Print…');
  bridge.hidden();

  assert.equal(body.dataset['eye'], 'closed');
  assert.equal(question.value, '');
  assert.equal(response.textContent, 'Iris has not read anything yet.');
});
