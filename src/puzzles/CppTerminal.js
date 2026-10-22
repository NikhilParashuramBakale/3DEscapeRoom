/**
 * CppTerminal - the source of truth for Room 2: The Proctor Chamber code terminal.
 *
 * Implements the examination diagnostic for Station 01:
 *   - The exact C++17 snippet specified for the examination terminal
 *   - Pure mathematical/logic evaluation of the snippet
 *   - Multiple choice answer checking and validation
 *   - Progressive hint for repeated incorrect attempts
 *   - Certificate Alpha result specification
 *
 * This file is purely logical and free of Three.js / DOM dependencies so it can
 * be unit tested directly in headless Node environments.
 */

export const CPP_TERMINAL_TITLE = 'PROCTOR CHAMBER — EXAMINATION TERMINAL 01';

/**
 * Build the panel title for a given question, with a progress counter.
 * @param {number} index - 0-based question index
 * @param {number} total - total number of questions
 * @returns {string}
 */
export function cppTerminalTitleFor(index, total) {
  return `${CPP_TERMINAL_TITLE}  [${index + 1}/${total}]`;
}

export const CPP_TERMINAL_PROMPT =
  'Language: C++17. Assume the program compiles and runs normally. What does it print?';

export const CPP_Q2_PROMPT =
  'Language: C++17. Assume the program compiles and runs normally. What does it print? (Pointer arithmetic)';

export const CPP_Q3_PROMPT =
  'Language: C++17. Assume the program compiles and runs normally. What does it print? (Recursion)';

export const CPP_Q4_PROMPT =
  'Language: C++17. Assume the program compiles and runs normally. What does it print? (Operator precedence)';

export const CPP_Q5_PROMPT =
  'Language: C++17. Assume the program compiles and runs normally. What does it print? (Loop control flow)';

export const CPP_Q6_PROMPT =
  'Language: C++17. Assume the program compiles and runs normally. What does it print? (Bit manipulation)';

export const CPP_TERMINAL_LINES = [
  '#include <iostream>',
  '',
  'int main() {',
  '    int a[5] = {3, 1, 4, 1, 5};',
  '    int s = 0;',
  '',
  '    for (int i = 0; i < 5; i += 2) {',
  '        s += a[i];',
  '    }',
  '',
  '    std::cout << s;',
  '}',
];

export const CPP_TERMINAL_OPTIONS = [
  { id: 'A', label: 'A) 2', value: 2, correct: false },
  { id: 'B', label: 'B) 12', value: 12, correct: true },
  { id: 'C', label: 'C) 14', value: 14, correct: false },
  { id: 'D', label: 'D) 8', value: 8, correct: false },
];

export const CPP_TERMINAL_HINT = 'Track the values of i and a[i] on each loop iteration.';

export const CERTIFICATE_ALPHA_TEXT = 'CERTIFICATE α — VALUE: 12';

/**
 * Question 2: pointer arithmetic.
 * ptr = arr + 1 → points at arr[1] = 10; *(ptr + 2) = arr[3] = 20. 10 + 20 = 30.
 */
export const CPP_Q2_LINES = [
  '#include <iostream>',
  '',
  'int main() {',
  '    int arr[] = {5, 10, 15, 20, 25};',
  '    int* ptr = arr + 1;',
  '    std::cout << *ptr + *(ptr + 2);',
  '    return 0;',
  '}',
];

export const CPP_Q2_OPTIONS = [
  { id: 'A', label: 'A) 15', value: 15, correct: false },
  { id: 'B', label: 'B) 20', value: 20, correct: false },
  { id: 'C', label: 'C) 25', value: 25, correct: false },
  { id: 'D', label: 'D) 30', value: 30, correct: true },
];

export const CPP_Q2_HINT = 'Remember: ptr + n advances by n * sizeof(int) bytes, pointing to the (n+1)th element.';

/**
 * Question 3: factorial recursion.
 * factorial(4) = 4 * 3 * 2 * 1 = 24.
 */
export const CPP_Q3_LINES = [
  '#include <iostream>',
  '',
  'int factorial(int n) {',
  '    if (n <= 1) return 1;',
  '    return n * factorial(n - 1);',
  '}',
  '',
  'int main() {',
  '    std::cout << factorial(4);',
  '    return 0;',
  '}',
];

export const CPP_Q3_OPTIONS = [
  { id: 'A', label: 'A) 12', value: 12, correct: false },
  { id: 'B', label: 'B) 24', value: 24, correct: true },
  { id: 'C', label: 'C) 48', value: 48, correct: false },
  { id: 'D', label: 'D) 6', value: 6, correct: false },
];

export const CPP_Q3_HINT = 'Trace the recursion: factorial(4) = 4 * factorial(3) = 4 * 3 * 2 * 1.';

/**
 * Question 4: ternary operator associativity.
 * The ternary ?: is right-associative. x < y is (10 < 20) = true, so result = y = 20.
 */
export const CPP_Q4_LINES = [
  '#include <iostream>',
  '',
  'int main() {',
  '    int x = 10, y = 20, z = 30;',
  '    int result = x < y ? y : x < z ? z : x;',
  '    std::cout << result;',
  '    return 0;',
  '}',
];

export const CPP_Q4_OPTIONS = [
  { id: 'A', label: 'A) 10', value: 10, correct: false },
  { id: 'B', label: 'B) 20', value: 20, correct: true },
  { id: 'C', label: 'C) 30', value: 30, correct: false },
  { id: 'D', label: 'D) 0', value: 0, correct: false },
];

export const CPP_Q4_HINT = 'The ternary operator is right-associative. Group as: (x < y) ? y : ((x < z) ? z : x).';

/**
 * Question 5: while loop with continue.
 * i=0→1 sum=1; i=1→2 sum=3; i=2→3 continue; i=3→4 sum=7; i=4→5 sum=12. Output: 12.
 */
export const CPP_Q5_LINES = [
  '#include <iostream>',
  '',
  'int main() {',
  '    int sum = 0;',
  '    int i = 0;',
  '    while (i < 5) {',
  '        i++;',
  '        if (i == 3) continue;',
  '        sum += i;',
  '    }',
  '    std::cout << sum;',
  '    return 0;',
  '}',
];

export const CPP_Q5_OPTIONS = [
  { id: 'A', label: 'A) 10', value: 10, correct: false },
  { id: 'B', label: 'B) 12', value: 12, correct: true },
  { id: 'C', label: 'C) 15', value: 15, correct: false },
  { id: 'D', label: 'D) 7', value: 7, correct: false },
];

export const CPP_Q5_HINT = 'Note the continue statement skips the sum += i line when i equals 3.';

/**
 * Question 6: count set bits recursively.
 * 13 in binary is 1101 — three set bits. Output: 3.
 */
export const CPP_Q6_LINES = [
  '#include <iostream>',
  '',
  'int countBits(int n) {',
  '    if (n <= 0) return 0;',
  '    return (n % 2) + countBits(n / 2);',
  '}',
  '',
  'int main() {',
  '    std::cout << countBits(13);',
  '    return 0;',
  '}',
];

export const CPP_Q6_OPTIONS = [
  { id: 'A', label: 'A) 2', value: 2, correct: false },
  { id: 'B', label: 'B) 3', value: 3, correct: true },
  { id: 'C', label: 'C) 4', value: 4, correct: false },
  { id: 'D', label: 'D) 5', value: 5, correct: false },
];

export const CPP_Q6_HINT = '13 in binary is 1101 — it has three set bits. Trace the recursive bit-counting.';






/**
 * Evaluate the terminal snippet.
 * Parses the array values, loop bounds, and stride step.
 * Returns the sum printed to std::cout (12).
 *
 * @param {string[]} [lines]
 * @returns {number|null}
 */
export function evaluateCppTerminal(lines = CPP_TERMINAL_LINES) {
  let arr = null;
  let start = 0;
  let limit = 5;
  let step = 2;

  for (const line of lines) {
    const arrMatch = /int\s+\w+\s*\[\s*\d*\s*\]\s*=\s*\{([^}]*)\}\s*;/.exec(line);
    if (arrMatch) {
      arr = arrMatch[1]
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n));
      continue;
    }
    const loopMatch =
      /for\s*\(\s*int\s+\w+\s*=\s*(\d+)\s*;\s*\w+\s*<\s*(\d+)\s*;\s*\w+\s*\+=\s*(\d+)\s*\)/.exec(
        line
      );
    if (loopMatch) {
      start = Number(loopMatch[1]);
      limit = Number(loopMatch[2]);
      step = Number(loopMatch[3]);
    }
  }

  if (arr && arr.length > 0) {
    let s = 0;
    for (let i = start; i < limit && i < arr.length; i += step) {
      s += arr[i];
    }
    return s;
  }

  // Fallback to the exact mathematical result: 3 + 4 + 5 = 12
  return 12;
}

/** The correct option id ('B'). */
export function getCorrectOptionId(lines = CPP_TERMINAL_LINES) {
  const total = evaluateCppTerminal(lines);
  if (total === null) return null;
  const match = CPP_TERMINAL_OPTIONS.find((opt) => opt.value === total);
  return match ? match.id : 'B';
}

/**
 * Check a submitted answer.
 * Accepts 'B', 'B) 12', 12, etc.
 *
 * @param {string|number} answer
 * @param {string[]} [lines]
 * @returns {{correct: boolean, expected: number, optionId: string}}
 */
export function checkCppTerminalAnswer(answer, lines = CPP_TERMINAL_LINES) {
  const expected = evaluateCppTerminal(lines) ?? 12;
  const optionId = getCorrectOptionId(lines) ?? 'B';

  let id = null;
  if (typeof answer === 'number') {
    const match = CPP_TERMINAL_OPTIONS.find((opt) => opt.value === answer);
    id = match ? match.id : null;
  } else {
    const text = String(answer).trim().toUpperCase();
    const byId = CPP_TERMINAL_OPTIONS.find((opt) => opt.id === text);
    if (byId) {
      id = byId.id;
    } else {
      const byLabel = CPP_TERMINAL_OPTIONS.find((opt) => opt.label.toUpperCase() === text);
      if (byLabel) {
        id = byLabel.id;
      } else {
        const byNumber = CPP_TERMINAL_OPTIONS.find((opt) => String(opt.value) === text);
        if (byNumber) id = byNumber.id;
      }
    }
  }

  return { correct: id === optionId, expected, optionId };
}

/**
 * Full question bank for the terminal diagnostic.
 * Question 1 is the original array-indexing puzzle; questions 2-6 are additional
 * diagnostic challenges covering pointers, recursion, operator precedence, loops
 * and bit manipulation.
 *
 * Each entry is self-contained: the code to display, the multiple-choice
 * options, the expected output value, and a progressive hint.
 */
export const CPP_TERMINAL_QUESTIONS = [
  {
    id: 1,
    lines: CPP_TERMINAL_LINES,
    prompt: CPP_TERMINAL_PROMPT,
    options: CPP_TERMINAL_OPTIONS,
    hint: CPP_TERMINAL_HINT,
    expected: 12,
  },
  {
    id: 2,
    lines: CPP_Q2_LINES,
    prompt: CPP_Q2_PROMPT,
    options: CPP_Q2_OPTIONS,
    hint: CPP_Q2_HINT,
    expected: 30,
  },
  {
    id: 3,
    lines: CPP_Q3_LINES,
    prompt: CPP_Q3_PROMPT,
    options: CPP_Q3_OPTIONS,
    hint: CPP_Q3_HINT,
    expected: 24,
  },
  {
    id: 4,
    lines: CPP_Q4_LINES,
    prompt: CPP_Q4_PROMPT,
    options: CPP_Q4_OPTIONS,
    hint: CPP_Q4_HINT,
    expected: 20,
  },
  {
    id: 5,
    lines: CPP_Q5_LINES,
    prompt: CPP_Q5_PROMPT,
    options: CPP_Q5_OPTIONS,
    hint: CPP_Q5_HINT,
    expected: 12,
  },
  {
    id: 6,
    lines: CPP_Q6_LINES,
    prompt: CPP_Q6_PROMPT,
    options: CPP_Q6_OPTIONS,
    hint: CPP_Q6_HINT,
    expected: 3,
  },
];

/** Total number of diagnostic questions in the terminal. */
export const CPP_TERMINAL_QUESTION_COUNT = CPP_TERMINAL_QUESTIONS.length;

/**
 * Retrieve a question from the bank by 0-based index.
 * Falls back to question 1 if the index is out of range.
 *
 * @param {number} [index=0]
 * @returns {{id:number,lines:string[],prompt:string,options:Array,hint:string,expected:number}}
 */
export function getCppTerminalQuestion(index = 0) {
  const safe = Math.max(0, Math.min(index, CPP_TERMINAL_QUESTIONS.length - 1));
  return CPP_TERMINAL_QUESTIONS[safe];
}

/**
 * Check a submitted answer against the question at a 0-based index.
 * Accepts 'A', 'A) 15', 15, etc.
 *
 * @param {number} index - 0-based index into CPP_TERMINAL_QUESTIONS
 * @param {string|number} answer - the player's answer
 * @returns {{correct:boolean, expected:number, optionId:string}}
 */
export function checkCppTerminalQuestionAnswer(index, answer) {
  const question = getCppTerminalQuestion(index);
  const options = question.options;
  const optionId = options.find((o) => o.correct)?.id ?? 'B';

  let id = null;
  if (typeof answer === 'number') {
    const match = options.find((opt) => opt.value === answer);
    id = match ? match.id : null;
  } else {
    const text = String(answer).trim().toUpperCase();
    const byId = options.find((opt) => opt.id === text);
    if (byId) {
      id = byId.id;
    } else {
      const byLabel = options.find((opt) => opt.label.toUpperCase() === text);
      if (byLabel) {
        id = byLabel.id;
      } else {
        const byNumber = options.find((opt) => String(opt.value) === text);
        if (byNumber) id = byNumber.id;
      }
    }
  }

  return { correct: id === optionId, expected: question.expected, optionId };
}
