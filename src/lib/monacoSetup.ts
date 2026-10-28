import * as monaco from 'monaco-editor'
import {
  ModuleResolutionKind,
  ScriptTarget,
  typescriptDefaults,
} from 'monaco-editor/languages/features/typescript/register.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import tsWorker from 'monaco-editor/languages/features/typescript/ts.worker.js?worker'

// Monaco is served from the app itself rather than a CDN, so autocomplete keeps
// working offline and nothing fights with cross origin isolation.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

let configured = false

export function setupMonaco(): typeof monaco {
  if (configured) return monaco
  configured = true

  typescriptDefaults.setCompilerOptions({
    target: ScriptTarget.ESNext,
    moduleResolution: ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    lib: ['esnext'],
    strict: true,
    // Pasted code is often only partly annotated, and flagging every missing
    // annotation buries the errors that matter.
    noImplicitAny: false,
  })
  typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    // Unused locals and similar noise are not helpful while sketching a solution.
    diagnosticCodesToIgnore: [6133, 7027, 80004],
  })
  typescriptDefaults.setEagerModelSync(true)
  // The built in formatter is turned off so Prettier is the only thing that
  // reformats a solution.
  typescriptDefaults.setModeConfiguration({
    ...typescriptDefaults.modeConfiguration,
    documentRangeFormattingEdits: false,
  })

  // The worker provides console and nothing else from a host environment, so
  // that is exactly what the editor is told about. Pulling in the DOM library
  // would promise globals such as document that are not there at run time.
  typescriptDefaults.addExtraLib(
    [
      'declare const console: {',
      '  log(...data: unknown[]): void',
      '  info(...data: unknown[]): void',
      '  warn(...data: unknown[]): void',
      '  error(...data: unknown[]): void',
      '  debug(...data: unknown[]): void',
      '  table(...data: unknown[]): void',
      '}',
      '',
      '/** Runs fn and reports whether it matched expected. */',
      'declare function check(fn: () => unknown, expected: unknown): void',
      '',
      '/** Prints the tally of checks. Called for you at the end if you leave it out. */',
      'declare function summary(): void',
    ].join('\n'),
    'file:///runtime.d.ts',
  )

  monaco.editor.defineTheme('app-dark', {
    base: 'vs-dark',
    inherit: true,
    colors: {
      'editor.background': '#111823',
      'editorGutter.background': '#111823',
      'editor.lineHighlightBackground': '#18212f',
      'editorLineNumber.foreground': '#4a5568',
      'editorLineNumber.activeForeground': '#9fb2c8',
      'editorWidget.background': '#0e141d',
      'editorWidget.border': '#1f2a38',
    },
    rules: [],
  })

  monaco.editor.defineTheme('app-one-dark', {
    base: 'vs-dark',
    inherit: true,
    colors: {
      'editor.background': '#282c34',
      'editorGutter.background': '#282c34',
      'editor.lineHighlightBackground': '#2c313c',
      'editor.selectionBackground': '#3e4451',
      'editorCursor.foreground': '#528bff',
      'editorLineNumber.foreground': '#4b5263',
      'editorLineNumber.activeForeground': '#9da5b4',
      'editorWidget.background': '#21252b',
      'editorWidget.border': '#181a1f',
      'editorSuggestWidget.selectedBackground': '#2c313a',
      'editorIndentGuide.background1': '#3b4048',
    },
    rules: [
      { token: '', foreground: 'abb2bf' },
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'keyword.flow', foreground: 'c678dd' },
      { token: 'string', foreground: '98c379' },
      { token: 'string.escape', foreground: '56b6c2' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'constant', foreground: 'd19a66' },
      { token: 'regexp', foreground: '56b6c2' },
      { token: 'operator', foreground: '56b6c2' },
      { token: 'delimiter', foreground: 'abb2bf' },
      { token: 'type', foreground: 'e5c07b' },
      { token: 'type.identifier', foreground: 'e5c07b' },
      { token: 'identifier', foreground: 'abb2bf' },
      { token: 'tag', foreground: 'e06c75' },
      { token: 'attribute.name', foreground: 'd19a66' },
      { token: 'attribute.value', foreground: '98c379' },
    ],
  })

  monaco.editor.defineTheme('app-dark-modern', {
    base: 'vs-dark',
    inherit: true,
    colors: {
      'editor.background': '#1f1f1f',
      'editorGutter.background': '#1f1f1f',
      'editor.lineHighlightBackground': '#2a2a2a',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#aeafad',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#cccccc',
      'editorWidget.background': '#202020',
      'editorWidget.border': '#454545',
      'editorSuggestWidget.selectedBackground': '#04395e',
      'editorIndentGuide.background1': '#404040',
    },
    rules: [
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'type', foreground: '4EC9B0' },
    ],
  })

  // Warm syntax colours to match the Night Shift palette: no cold blues.
  monaco.editor.defineTheme('app-night-shift', {
    base: 'vs-dark',
    inherit: true,
    colors: {
      'editor.background': '#1c1710',
      'editorGutter.background': '#1c1710',
      'editor.lineHighlightBackground': '#241d13',
      'editor.selectionBackground': '#3a2f1e',
      'editorCursor.foreground': '#ffb454',
      'editorLineNumber.foreground': '#6b5d44',
      'editorLineNumber.activeForeground': '#e8dcc4',
      'editorWidget.background': '#171209',
      'editorWidget.border': '#2e2619',
      'editorSuggestWidget.selectedBackground': '#33281a',
      'editorIndentGuide.background1': '#352c1d',
    },
    rules: [
      { token: '', foreground: 'e8dcc4' },
      { token: 'comment', foreground: '7f7059', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff9e3b' },
      { token: 'keyword.flow', foreground: 'ff9e3b' },
      { token: 'string', foreground: 'a9b665' },
      { token: 'string.escape', foreground: '8ec07c' },
      { token: 'number', foreground: 'e0a44b' },
      { token: 'constant', foreground: 'e0a44b' },
      { token: 'regexp', foreground: 'd3869b' },
      { token: 'operator', foreground: 'd5c4a1' },
      { token: 'delimiter', foreground: 'd5c4a1' },
      { token: 'type', foreground: 'fabd2f' },
      { token: 'type.identifier', foreground: 'fabd2f' },
      { token: 'identifier', foreground: 'e8dcc4' },
      { token: 'tag', foreground: 'fb4934' },
      { token: 'attribute.name', foreground: 'e0a44b' },
      { token: 'attribute.value', foreground: 'a9b665' },
    ],
  })

  // The same warm palette on paper rather than on a dark surface.
  monaco.editor.defineTheme('app-night-shift-light', {
    base: 'vs',
    inherit: true,
    colors: {
      'editor.background': '#fdf6e3',
      'editorGutter.background': '#fdf6e3',
      'editor.lineHighlightBackground': '#f2e8d2',
      'editor.selectionBackground': '#e4d5ae',
      'editorCursor.foreground': '#b5730f',
      'editorLineNumber.foreground': '#b3a284',
      'editorLineNumber.activeForeground': '#6b5d44',
      'editorWidget.background': '#f5ecd7',
      'editorWidget.border': '#ddd0b0',
      'editorSuggestWidget.selectedBackground': '#f0e2bf',
      'editorIndentGuide.background1': '#e4d9bd',
    },
    rules: [
      { token: '', foreground: '4a4034' },
      { token: 'comment', foreground: '9b8e73', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a1521a' },
      { token: 'keyword.flow', foreground: 'a1521a' },
      { token: 'string', foreground: '5a7a16' },
      { token: 'string.escape', foreground: '2a7a72' },
      { token: 'number', foreground: '96620a' },
      { token: 'constant', foreground: '96620a' },
      { token: 'regexp', foreground: '8a4b6b' },
      { token: 'operator', foreground: '6b5d44' },
      { token: 'delimiter', foreground: '6b5d44' },
      { token: 'type', foreground: '8a5a0c' },
      { token: 'type.identifier', foreground: '8a5a0c' },
      { token: 'identifier', foreground: '4a4034' },
      { token: 'tag', foreground: 'b3261e' },
      { token: 'attribute.name', foreground: '96620a' },
      { token: 'attribute.value', foreground: '5a7a16' },
    ],
  })

  monaco.editor.defineTheme('app-light', {
    base: 'vs',
    inherit: true,
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#ffffff',
      'editor.lineHighlightBackground': '#eef2f7',
      'editorLineNumber.foreground': '#9aa7b8',
      'editorLineNumber.activeForeground': '#44546a',
      'editorWidget.background': '#f5f7fa',
      'editorWidget.border': '#d7dee7',
    },
    rules: [],
  })

  return monaco
}
