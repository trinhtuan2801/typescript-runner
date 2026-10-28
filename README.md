# TypeScript Runner

A local scratchpad for working through coding problems. Paste the description on the
left, write TypeScript in the middle, and run it or step through it with a real
debugger. Nothing is stored on a server and there are no built in exercises: the app is
just a runner and a debugger.

## Getting started

This project uses pnpm, which is what the lockfile was built with.

```bash
pnpm install
pnpm dev
```

Then open the address Vite prints, normally http://localhost:5173.

## What you get

**Problem pane.** Paste the description straight from LeetCode and the formatting
comes with it: headings, bold, inline code, example blocks, bullet lists, tables and
images. The source page's own colours and fonts are dropped so it reads as part of this
app, and the text stays editable afterwards so you can add your own notes. Nothing here
is parsed or run, and it is kept between sessions.

Pasted markup is cleaned before it is shown or stored. Scripts, event handlers and
`javascript:` links are removed, which matters because the description is saved in the
browser and put back on the page when you return.

**Editor.** Monaco, the same editor that powers VS Code, served from the app itself so
it keeps working offline. You write TypeScript, with autocomplete, parameter hints and
real type checking as you type.

**Running.** Press Run in the Code header, or Cmd and Enter. Your code runs in a Web
Worker and anything you log appears in the Console, which has a column of its own, with
arrays, maps, sets and nested objects rendered readably rather than as `[object
Object]`. A runaway loop cannot freeze the page, and a run that goes quiet for too long
is stopped with a message.

Every button is an icon. Hover one to see what it does and its shortcut.

**Checking answers.** Two helpers, `check` and `summary`, are always in scope. No
import is needed.

```ts
check(() => removeOuterParentheses('(()())(())'), '()()()')
check(() => removeOuterParentheses('()()'), '')
```

```
PASS  removeOuterParentheses('(()())(())')
FAIL  removeOuterParentheses('()()')
      expected: ""
      actual:   "()"

1 passed, 1 failed
```

`check` runs the function, compares the result against what you expected with
`JSON.stringify`, and prints the call itself as the label. A call that throws is
reported as a failure with the error rather than stopping the run. `summary()` prints
the tally, and is called for you at the end if you leave it out. The counts start again
on every run.

The output is coloured with ordinary terminal escape codes, which the Console
understands, so the same code prints the same way here and under Node.

**Themes.** The selector in the Code header offers Dark Modern, which is VS Code's
current default and the one used here, along with Atom One Dark, Slate, Light, and two
warm low blue themes in the spirit of the display mode of the same name, Night Shift
and Night Shift Light. System follows your operating system and changes with it. Each
theme covers the whole app and the editor together, including the syntax colours and
the terminal colours in the Console, and the choice is applied before the first paint on
a reload so the page never flashes the wrong one.

**Formatting.** Press Format, or Shift and Alt and F, to run Prettier over your code.
Breakpoints follow the lines they were marking.

**Debugger.** Hover the gutter and a faded circle shows where a breakpoint would go;
click to set one. Then press Debug, which sits in the Debugger header along with the
rest of the run controls. Execution stops on that line and you can read every variable
in scope, step forward, and add watch expressions that are evaluated right inside the
paused frame. Next line runs the next statement. Next point runs on until the next
breakpoint. Pressing Debug with no breakpoints set stops at the first statement so you
can walk the whole thing.

The Watch and Variables lists both collapse, and their rows can be dragged into the
order you want. A variable keeps its place by name, so the one you care about stays at
the top as you step. Reset order puts them back the way the debugger reported them.

Your code, notes, breakpoints, watch list, panel sizes, collapsed sections and variable
order are all saved in the browser, so closing the tab loses nothing.

## Keyboard shortcuts

| Shortcut                        | Action                                  |
| ------------------------------- | --------------------------------------- |
| Cmd or Ctrl and Enter           | Run                                     |
| Cmd or Ctrl and Shift and Enter | Run with the debugger                   |
| Shift and Alt and F             | Format with Prettier                    |
| F9                              | Toggle a breakpoint on the current line |
| F5                              | Next point                              |
| F10                             | Next line                               |
| Shift and F5                    | Stop                                    |

## How TypeScript is handled

Types are removed before your code runs, by overwriting every piece of type syntax with
spaces rather than deleting it. Nothing shifts position, so line 20 in the editor is
line 20 at run time and the debugger needs no source map. The parser is the copy of
TypeScript that Monaco already ships, so this costs no extra dependency.

Type errors are reported in the editor but do not stop a run, in the same way as
running TypeScript with transpile only. Plain JavaScript works too, since JavaScript is
valid TypeScript.

Three things cannot be removed by stripping alone because they produce real code, so
they are refused with a message naming the line:

- `enum`, which builds an object at run time. Use a plain object instead.
- `namespace` and `module` declarations.
- Constructor parameter properties such as `constructor(private size: number)`, which
  quietly declare a field. Assign to `this` in the constructor body instead.

## How the debugger works

Your code runs in a Web Worker. For debugging, it is parsed with acorn and a probe is
inserted in front of every statement, on the same line, which is why line numbers stay
exactly as you typed them. When a probe hits a breakpoint the worker blocks on
`Atomics.wait` against a `SharedArrayBuffer` while the page stays responsive. Next
point, Next line and new watch expressions are sent back through that same buffer,
which is how a watch you add while paused is evaluated immediately in the live scope.

`SharedArrayBuffer` is only available to a cross origin isolated page, so the dev and
preview servers send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless`. The second one is deliberately
`credentialless` rather than `require-corp`: both give the isolation the debugger needs,
but `require-corp` blocks every outside image, which would leave the diagrams in a
pasted description broken. Chrome and Firefox support it.

If you host the build somewhere that does not send these headers, the app notices and
falls back to recording each breakpoint hit, which you can walk through once the run
finishes. Keep both headers in your host config to keep live pausing.

## Styling

The interface is built with Tailwind, wired up through `@tailwindcss/vite`. The colour
palettes stay in `src/index.css` as plain custom properties, one block per theme, and an
`@theme inline` block hands those same values to Tailwind. That is what lets a utility
such as `bg-panel` or `text-muted` follow whichever theme is active, with no dark mode
variants anywhere in the markup.

Class strings used by more than one component live in `src/components/ui.ts`, so the
panes stay identical without repeating long utility lists.

Three things stay as hand written CSS, for good reason:

- The classes Monaco puts on its own elements, such as the breakpoint dots and the
  highlight on the paused line.
- The typography for a pasted description, since that markup arrives from another site
  and cannot carry utility classes.
- The base layer: page background, fonts and scrollbars.

## Formatting the project itself

The same Prettier settings cover the repository source.

```bash
pnpm format        # rewrite files in place
pnpm format:check  # report anything unformatted, useful in CI
```

The rules live in `.prettierrc`, and `src/lib/prettier.ts` holds the matching set used
by the editor. Keep the two in step when you change either.

## Known issue inherited from the template

`pnpm lint` fails because the template pairs TypeScript 7 with typescript-eslint 8,
which does not support it yet. Installing prints unmet peer warnings for the same
reason. `pnpm build` and `pnpm dev` are unaffected. To get linting back, either wait for
typescript-eslint to support TypeScript 7 or move the project to TypeScript 6.
