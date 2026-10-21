/**
 * CppTerminal - the source of truth for the Room 2 code terminal.
 *
 * The module owns two things and nothing else:
 *   - the C++ snippet the terminal shows on screen
 *   - the pure evaluation of that snippet, plus the multiple-choice answer
 *     table used by the terminal UI
 *
 * Rendering lives in the environment/UI layers; this file is deliberately free
 * of Three.js and DOM code so the puzzle can be unit tested directly.
 */

/**
 * The snippet shown on the terminal screen.
 *
 * The player has to work out which three elements of `values` are picked up
 * by the index list and sum them: values[0] + values[2] + values[4] = 3+4+5.
 */
export const CPP_TERMINAL_LINES = [
  '#include <iostream>',
  '',
  'int main() {',
  '    int values[] = {3, 6, 4, 7, 5};',
  '    int idx[] = {0, 2, 4};',
  '    int total = 0;',
  '    for (int i = 0; i < 3; i++) {',
  '        total += values[idx[i]];',
  '    }',
  '    std::cout << total << std::endl;',
  '    return 0;',
  '}',
];

/** Heading printed above the snippet. */
export const CPP_TERMINAL_TITLE = 'ROOM 2 - COMPILER DIAGNOSTIC';

/** Prompt shown under the snippet. */
export const CPP_TERMINAL_PROMPT = 'What does this program print?';

/**
 * The multiple-choice options. `value` is the number each option claims is
 * printed; `correct` marks the right one.
 */
export const CPP_TERMINAL_OPTIONS = [
  { id: 'A', label: 'A) 10', value: 10, correct: false },
  { id: 'B', label: 'B) 12', value: 12, correct: true },
  { id: 'C', label: 'C) 14', value: 14, correct: false },
  { id: 'D', label: 'D) 16', value: 16, correct: false },
];

const ARRAY_DECL = /int\s+(\w+)\s*\[\s*\]\s*=\s*\{([^}]*)\}\s*;/;
const INDEX_DECL = /int\s+(\w+)\s*\[\s*\]\s*=\s*\{([^}]*)\}\s*;/;
const LOOP_BOUND = /for\s*\(\s*int\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*(\d+)\s*;/;

/**
 * Evaluate the terminal snippet.
 *
 * Not a C++ interpreter - it recognises the single shape the snippet has
 * (two int arrays plus a counted sum loop) and returns the number the program
 * prints. Anything unrecognised returns null so the caller can fail loudly
 * instead of accepting a wrong answer.
 *
 * @param {string[]} [lines]
 * @returns {number|null}
 */
export function evaluateCppTerminal(lines = CPP_TERMINAL_LINES) {
  const arrays = new Map();
  let loopBound = null;

  for (const line of lines) {
    const match = ARRAY_DECL.exec(line);
    if (match) {
      const values = match[2]
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n));
      arrays.set(match[1], values);
      continue;
    }
    const bound = LOOP_BOUND.exec(line);
    if (bound) loopBound = Number(bound[1]);
  }

  if (arrays.size < 2) return null;
  if (loopBound === null) return null;

  // The first array is the data, the second is the index list - both are
  // declared the same way, so the order they appear in the source decides.
  const names = [...arrays.keys()];
  const values = arrays.get(names[0]);
  const indices = arrays.get(names[1]);
  if (!values || !indices) return null;

  let total = 0;
  for (let i = 0; i < loopBound && i < indices.length; i++) {
    const idx = indices[i];
    if (!Number.isInteger(idx) || idx < 0 || idx >= values.length) return null;
    total += values[idx];
  }
  return total;
}

/** The correct option id, derived from the evaluated snippet. */
export function getCorrectOptionId(lines = CPP_TERMINAL_LINES) {
  const total = evaluateCppTerminal(lines);
  if (total === null) return null;
  const match = CPP_TERMINAL_OPTIONS.find((opt) => opt.value === total);
  return match ? match.id : null;
}

/**
 * Check a submitted answer.
 *
 * Accepts the option id ("B"), the option label ("B) 12") or the bare number
 * (12), because the terminal UI can offer any of those. Returns a result
 * object so the caller can show the right feedback without re-deriving it.
 *
 * @param {string|number} answer
 * @param {string[]} [lines]
 * @returns {{correct: boolean, expected: number|null, optionId: string|null}}
 */
export function checkCppTerminalAnswer(answer, lines = CPP_TERMINAL_LINES) {
  const expected = evaluateCppTerminal(lines);
  const optionId = getCorrectOptionId(lines);

  if (expected === null || optionId === null) {
    return { correct: false, expected: null, optionId: null };
  }

  let id = null;
  if (typeof answer === 'number') {
    const match = CPP_TERMINAL_OPTIONS.find((opt) => opt.value === answer);
    id = match ? match.id : null;
  } else {
    const text = String(answer).trim().toUpperCase();
    const byId = CPP_TERMINAL_OPTIONS.find((opt) => opt.id === text);
    if (byId) id = byId.id;
    else {
      const byLabel = CPP_TERMINAL_OPTIONS.find((opt) => opt.label.toUpperCase() === text);
      if (byLabel) id = byLabel.id;
      else {
        const byNumber = CPP_TERMINAL_OPTIONS.find((opt) => String(opt.value) === text);
        if (byNumber) id = byNumber.id;
      }
    }
  }

  return { correct: id === optionId, expected, optionId };
}
