/**
 * CodeSheet - the single source of truth for the programming note the player
 * finds on the desk (Phase 5).
 *
 * The same lines are used three ways:
 *   - baked into the paper texture on the desk (`makePaperTexture`)
 *   - rendered as selectable text in the reading panel
 *   - parsed by `evaluateKeypadCode` so the keypad puzzle has a real answer
 *     instead of a duplicated magic number.
 *
 * The puzzle itself (keypad entry) is implemented in a later phase; this
 * module only owns the note and its value.
 */

/** Lines printed on the sheet, exactly as the player reads them. */
export const CODE_SHEET_LINES = [
  'def drill(n):',
  '    if n <= 1:',
  '        return 1',
  '    return n * drill(n - 1)',
  '',
  'keypad = drill(4)',
];

/** Heading drawn on the paper and shown above the panel text. */
export const CODE_SHEET_TITLE = 'LAB NOTE #6 - RECURSION DRILL';

/** Instructions shown under the code in the reading panel. */
export const CODE_SHEET_HINT = 'Keypad lock -> this value';

const RECURSION_DEF = /def\s+(\w+)\s*\(\s*(\w+)\s*\)\s*:/;
const BASE_CASE = /^\s*return\s+(\d+)\s*;?\s*$/;
const RETURN_EXPR = /return\s+(\w+)\s*\*\s*(\w+)\s*\(\s*(\w+)\s*-\s*1\s*\)\s*;?/;
const ASSIGNMENT = /(\w+)\s*=\s*(\w+)\s*\(\s*(\d+)\s*\)/;

/**
 * Evaluate the recursion the sheet describes.
 *
 * Deliberately not a real interpreter - it recognises the single shape of
 * code the note contains (factorial) and returns the value the player should
 * type on the keypad. Unknown input returns null so callers can fail loudly
 * rather than silently unlocking the wrong door.
 *
 * Parsing is line-based: the base case is anchored with `^`/`$`, which without
 * the multiline flag would only ever match the very last line of the note.
 *
 * @param {string[]} [lines] the sheet source
 * @returns {number|null}
 */
export function evaluateKeypadCode(lines = CODE_SHEET_LINES) {
  const defIndex = lines.findIndex((line) => RECURSION_DEF.test(line));
  if (defIndex === -1) return null;
  const fnName = RECURSION_DEF.exec(lines[defIndex])[1];

  const body = lines.slice(defIndex + 1);

  const baseLine = body.find((line) => BASE_CASE.test(line));
  if (!baseLine) return null;
  const baseValue = Number(BASE_CASE.exec(baseLine)[1]);

  const stepLine = body.find((line) => RETURN_EXPR.test(line));
  if (!stepLine) return null;

  const memo = new Map();
  const drill = (n) => {
    if (n <= 1) return baseValue;
    if (memo.has(n)) return memo.get(n);
    const result = n * drill(n - 1);
    memo.set(n, result);
    return result;
  };

  // The call must target the function the note defines.
  let call = null;
  for (const line of lines) {
    const match = ASSIGNMENT.exec(line);
    if (match && match[2] === fnName) call = match;
  }
  if (!call) return null;

  return drill(Number(call[3]));
}