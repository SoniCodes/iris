import assert from 'node:assert/strict';
import test from 'node:test';
import filter from '../dist/tree/filter.js';

const { formatShortcut, listMenuPaths } = filter;

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
