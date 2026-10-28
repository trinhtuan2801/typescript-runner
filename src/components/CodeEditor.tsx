import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import * as monaco from 'monaco-editor'
import { setupMonaco } from '../lib/monacoSetup'
import { formatSource, remapBreakpoints } from '../lib/prettier'

export interface EditorHandle {
  format: () => void
}

interface Props {
  /** Name of the Monaco theme to use, kept in step with the app theme. */
  theme: string
  value: string
  onChange: (value: string) => void
  breakpoints: number[]
  onToggleBreakpoint: (line: number) => void
  pausedLine: number | null
  errorLine: number | null
  onRun: () => void
  onDebug: () => void
  onStep: () => void
  onContinue: () => void
  onFormatError: (message: string) => void
  /** Format when focus leaves the editor. Off while a run is in flight. */
  autoFormat: boolean
  /** Roomier text and a narrower gutter for a phone sized screen. */
  narrow: boolean
  /** Called after a reformat so breakpoints follow the lines they marked. */
  onBreakpointsMoved: (lines: number[]) => void
  ref?: Ref<EditorHandle>
}

export function CodeEditor(props: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const hoverRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const hoverLineRef = useRef<number | null>(null)
  const quietFormatRef = useRef(false)

  // Callbacks live in a ref so that changing them never tears down the editor.
  const handlers = useRef(props)
  handlers.current = props

  useEffect(() => {
    if (!hostRef.current) return
    const m = setupMonaco()

    const model = m.editor.createModel(
      handlers.current.value,
      'typescript',
      m.Uri.parse('file:///solution.ts'),
    )

    const editor = m.editor.create(hostRef.current, {
      model,
      theme: handlers.current.theme,
      automaticLayout: true,
      fontSize: handlers.current.narrow ? 14 : 13,
      lineHeight: handlers.current.narrow ? 22 : 20,
      fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
      glyphMargin: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      tabSize: 2,
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      suggestOnTriggerCharacters: true,
      quickSuggestions: { other: true, comments: false, strings: false },
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'currentDocument',
      parameterHints: { enabled: true },
      bracketPairColorization: { enabled: true },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    })
    editorRef.current = editor
    decorationsRef.current = editor.createDecorationsCollection([])
    hoverRef.current = editor.createDecorationsCollection([])

    // A faded circle follows the pointer down the gutter, so it is obvious that
    // clicking there sets a breakpoint.
    const clearHover = () => {
      if (hoverLineRef.current === null) return
      hoverLineRef.current = null
      hoverRef.current?.set([])
    }

    editor.onMouseMove((event) => {
      if (event.target.type !== m.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        clearHover()
        return
      }
      const line = event.target.position?.lineNumber
      // A line that already carries a breakpoint needs no preview of one.
      if (!line || handlers.current.breakpoints.includes(line)) {
        clearHover()
        return
      }
      if (hoverLineRef.current === line) return
      hoverLineRef.current = line
      hoverRef.current?.set([
        {
          range: new m.Range(line, 1, line, 1),
          options: {
            glyphMarginClassName: 'bp-glyph-hover',
            stickiness: m.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        },
      ])
    })

    editor.onMouseLeave(() => clearHover())

    editor.onDidChangeModelContent(() => {
      handlers.current.onChange(editor.getValue())
    })

    editor.onMouseDown((event) => {
      if (event.target.type !== m.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
      const line = event.target.position?.lineNumber
      if (!line) return
      // The real marker takes over from here.
      hoverLineRef.current = null
      hoverRef.current?.set([])
      handlers.current.onToggleBreakpoint(line)
    })

    editor.addAction({
      id: 'practice.run',
      label: 'Run',
      keybindings: [m.KeyMod.CtrlCmd | m.KeyCode.Enter],
      run: () => handlers.current.onRun(),
    })
    editor.addAction({
      id: 'practice.debug',
      label: 'Run with the debugger',
      keybindings: [m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.Enter],
      run: () => handlers.current.onDebug(),
    })
    editor.addAction({
      id: 'practice.toggleBreakpoint',
      label: 'Toggle breakpoint',
      keybindings: [m.KeyCode.F9],
      run: (ed) => {
        const line = ed.getPosition()?.lineNumber
        if (line) handlers.current.onToggleBreakpoint(line)
      },
    })
    editor.addAction({
      id: 'practice.continue',
      label: 'Next point',
      keybindings: [m.KeyCode.F5],
      run: () => handlers.current.onContinue(),
    })
    editor.addAction({
      id: 'practice.step',
      label: 'Next line',
      keybindings: [m.KeyCode.F10],
      run: () => handlers.current.onStep(),
    })

    // One formatting implementation, shared by the toolbar button, the
    // keyboard shortcut, the context menu and the automatic format on blur.
    const computeFormat = async (quiet: boolean): Promise<string | null> => {
      const target = editor.getModel()
      if (!target) return null
      const before = target.getValue()
      const result = await formatSource(before)
      if (!result.ok) {
        // An automatic format stays quiet: half typed code is not an error
        // worth reporting every time focus moves away.
        if (!quiet) handlers.current.onFormatError(result.message)
        return null
      }
      if (result.code === before) return null
      handlers.current.onBreakpointsMoved(
        await remapBreakpoints(before, result.code, handlers.current.breakpoints),
      )
      return result.code
    }

    const formatter = m.languages.registerDocumentFormattingEditProvider('typescript', {
      async provideDocumentFormattingEdits(target) {
        const text = await computeFormat(quietFormatRef.current)
        return text === null ? [] : [{ range: target.getFullModelRange(), text }]
      },
    })

    // Formatting through the action needs the editor to be focused, so once
    // focus has gone the edit is applied directly instead.
    editor.onDidBlurEditorWidget(() => {
      if (!handlers.current.autoFormat) return
      void computeFormat(true).then((text) => {
        const target = editor.getModel()
        if (text === null || !target) return
        editor.pushUndoStop()
        editor.executeEdits('format-on-blur', [{ range: target.getFullModelRange(), text }])
        editor.pushUndoStop()
      })
    })

    return () => {
      formatter.dispose()
      editor.dispose()
      model.dispose()
      editorRef.current = null
    }
  }, [])

  useImperativeHandle(
    props.ref,
    () => ({
      format: () => {
        void editorRef.current?.getAction('editor.action.formatDocument')?.run()
      },
    }),
    [],
  )

  useEffect(() => {
    monaco.editor.setTheme(props.theme)
  }, [props.theme])

  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize: props.narrow ? 14 : 13,
      lineHeight: props.narrow ? 22 : 20,
      lineNumbersMinChars: props.narrow ? 3 : 5,
      folding: !props.narrow,
      // A phone has no room for the overview ruler beside the scrollbar.
      overviewRulerLanes: props.narrow ? 0 : 3,
    })
  }, [props.narrow])

  // Breakpoint dots, the paused line and the line that threw.
  useEffect(() => {
    const collection = decorationsRef.current
    if (!collection) return
    const decorations: monaco.editor.IModelDeltaDecoration[] = props.breakpoints.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'bp-glyph',
        glyphMarginHoverMessage: { value: 'Breakpoint on line ' + line },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }))

    if (props.pausedLine) {
      decorations.push({
        range: new monaco.Range(props.pausedLine, 1, props.pausedLine, 1),
        options: {
          isWholeLine: true,
          className: 'paused-line',
          glyphMarginClassName: 'paused-glyph',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })
    }

    if (props.errorLine) {
      decorations.push({
        range: new monaco.Range(props.errorLine, 1, props.errorLine, 1),
        options: { isWholeLine: true, className: 'error-line' },
      })
    }

    collection.set(decorations)
  }, [props.breakpoints, props.pausedLine, props.errorLine])

  // Keep the paused line in sight while stepping.
  useEffect(() => {
    if (props.pausedLine && editorRef.current) {
      editorRef.current.revealLineInCenterIfOutsideViewport(props.pausedLine, 0)
    }
  }, [props.pausedLine])

  return <div className="min-h-0 min-w-0 flex-1" ref={hostRef} />
}
