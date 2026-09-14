import assert from 'node:assert/strict';
import test from 'node:test';
import filter from '../dist/tree/filter.js';
import prompt from '../dist/tree/prompt.js';
import retrieve from '../dist/tree/retrieve.js';

const { formatShortcut, listMenuPaths } = filter;
const { buildPrompt } = prompt;
const { questionTerms } = retrieve;

function menuItem(title, cmdChar, cmdModifiers = 0) {
  return { role: 'AXMenuItem', title, cmdChar, cmdModifiers };
}

function menuBar(items, title = 'File') {
  return {
    role: 'AXMenuBar',
    children: [
      {
        role: 'AXMenuBarItem',
        title,
        children: [{ role: 'AXMenu', children: items }],
      },
    ],
  };
}

test('formats known shortcut modifiers', () => {
  assert.equal(formatShortcut(menuItem('New Tab', 'T')), '⌘T');
  assert.equal(formatShortcut(menuItem('New Private Window', 'N', 1)), '⇧⌘N');
  assert.equal(formatShortcut(menuItem('Force Quit', '⎋', 2)), '⌥⌘⎋');
  assert.equal(formatShortcut({ ...menuItem('Next Tab', '\t', 12), cmdVirtualKey: 48 }), '⌃⇥');
  assert.equal(formatShortcut({ ...menuItem('Move Left', '', 8), cmdVirtualKey: 123 }), '←');
  assert.equal(formatShortcut({ ...menuItem('Developer Tools', '', 8), cmdVirtualKey: 96 }), 'F5');
});

test('omits shortcut modifiers outside the AX mask', () => {
  assert.equal(formatShortcut(menuItem('Enter Full Screen', 'F', 24)), '');
  assert.equal(formatShortcut({ ...menuItem('Dictation', '🎤', 8), cmdVirtualKey: 128 }), '');
});

test('removes conflicting shortcuts from duplicate menu paths', () => {
  const lines = listMenuPaths(
    menuBar([
      menuItem('Close Window', 'W'),
      menuItem('Close Window', 'W', 1),
      menuItem('Reload', 'R'),
      menuItem('Reload', 'R'),
    ]),
  );

  assert.deepEqual(lines, ['File > Close Window', 'File > Reload  ⌘R']);
});

test('keeps useful question terms once', () => {
  assert.deepEqual(questionTerms('How do I open a new tab in this app?'), ['open', 'new', 'tab']);
  assert.deepEqual(questionTerms('Which tabs are open in these apps?'), ['tab', 'open']);
});

test('ranks matching evidence and drops unrelated screen details', () => {
  const text = buildPrompt({
    appName: 'Safari',
    question: 'How do I open a new tab?',
    menuBar: menuBar([
      menuItem('Print…', 'P'),
      menuItem('Open File…', 'O'),
      menuItem('New Tab', 'T'),
      menuItem('New Tab at End', 'T', 2),
    ]),
    windows: [
      {
        role: 'AXWindow',
        title: 'Example',
        children: [
          {
            role: 'AXToolbar',
            children: [
              { role: 'AXButton', title: 'New Tab', actions: ['AXPress'] },
              { role: 'AXButton', title: 'Picture in Picture', actions: ['AXPress'] },
            ],
          },
        ],
      },
    ],
  });

  const menus = text.split('## Menus\n')[1].split('\n\n## On screen')[0];
  const onScreen = text.split('## On screen\n')[1].split('\n\n## Question')[0];

  assert.ok(menus.startsWith('File > New Tab  ⌘T'));
  assert.match(menus, /File > New Tab at End  ⌥⌘T/);
  assert.match(onScreen, /button "New Tab" \[pressable\]/);
  assert.doesNotMatch(onScreen, /Picture in Picture/);
});

test('ranks the closest menu item above longer alternatives', () => {
  const file = menuBar([menuItem('New Tab', 'T')]).children[0];
  const bookmarks = menuBar(
    [menuItem('Open in New Tabs', '')],
    'Bookmarks',
  ).children[0];
  const text = buildPrompt({
    appName: 'Safari',
    question: 'How do I open a new tab?',
    menuBar: { role: 'AXMenuBar', children: [file, bookmarks] },
  });

  const menus = text.split('## Menus\n')[1].split('\n\n## On screen')[0];
  assert.ok(menus.startsWith('File > New Tab  ⌘T'));
});

test('includes the best matching menu neighborhood', () => {
  const text = buildPrompt({
    appName: 'Browser',
    question: 'How do I make the text bigger?',
    menuBar: menuBar(
      [
        menuItem('Text Encoding', ''),
        menuItem('Zoom In', '+'),
        menuItem('Zoom Out', '-'),
      ],
      'View',
    ),
  });

  assert.match(text, /View > Text Encoding/);
  assert.match(text, /View > Zoom In  ⌘\+/);
  assert.match(text, /View > Zoom Out  ⌘-/);
});

test('matches basic word variants', () => {
  const text = buildPrompt({
    appName: 'Safari',
    question: 'How do I close tabs?',
    menuBar: menuBar([menuItem('Close Tab', 'W'), menuItem('New Window', 'N')]),
  });

  assert.match(text, /File > Close Tab  ⌘W/);
  assert.ok(text.split('## Menus\n')[1].startsWith('File > Close Tab  ⌘W'));
});

test('matches verbs that drop an e before ing', () => {
  const text = buildPrompt({
    appName: 'Editor',
    question: 'How do I keep saving my work?',
    menuBar: menuBar([menuItem('Save', 'S'), menuItem('Print…', 'P')]),
  });

  assert.match(text, /File > Save  ⌘S/);
  assert.ok(text.split('## Menus\n')[1].startsWith('File > Save  ⌘S'));
});

test('keeps the full outline for a general screen question', () => {
  const text = buildPrompt({
    appName: 'Safari',
    question: 'What is on my screen?',
    windows: [
      {
        role: 'AXWindow',
        title: 'Example',
        children: [{ role: 'AXButton', title: 'Picture in Picture' }],
      },
    ],
  });

  assert.match(text, /window "Example"/);
  assert.match(text, /button "Picture in Picture"/);
});

test('keeps all descendants of a matching screen container', () => {
  const text = buildPrompt({
    appName: 'Editor',
    question: 'What is in the inspector?',
    windows: [
      {
        role: 'AXWindow',
        title: 'Main',
        children: [
          {
            role: 'AXGroup',
            title: 'Inspector',
            children: [
              { role: 'AXStaticText', title: 'Width' },
              { role: 'AXTextField', title: '1920' },
            ],
          },
          { role: 'AXGroup', title: 'Sidebar' },
        ],
      },
    ],
  });

  assert.match(text, /group "Inspector"/);
  assert.match(text, /static text "Width"/);
  assert.match(text, /text field "1920"/);
  assert.doesNotMatch(text, /group "Sidebar"/);
});

test('keeps unrelated history and bookmarks out of model context', () => {
  const history = menuBar([menuItem('LineLeap Tickets', '')], 'History').children[0];
  const bookmarks = menuBar([menuItem('Ticket Portal', '')], 'Bookmarks').children[0];
  const app = menuBar([menuItem('Create Profile…', '')], 'Safari').children[0];
  const menu = { role: 'AXMenuBar', children: [history, bookmarks, app] };

  const createPrompt = buildPrompt({
    appName: 'Safari',
    question: 'How do I create a ticket?',
    menuBar: menu,
  });
  assert.doesNotMatch(createPrompt, /LineLeap Tickets|Ticket Portal/);
  assert.match(createPrompt, /Safari > Create Profile/);

  const historyPrompt = buildPrompt({
    appName: 'Safari',
    question: 'What is in my history?',
    menuBar: menu,
  });
  assert.match(historyPrompt, /History > LineLeap Tickets/);
});
