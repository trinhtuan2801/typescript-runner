import type {
  TsApi,
  TsNode,
  TsNodeArray,
  TsSourceFile,
} from 'monaco-editor/languages/features/typescript/lib/typescriptServices.js'

/**
 * Turns TypeScript into runnable JavaScript by overwriting every piece of type
 * syntax with spaces rather than deleting it. Nothing moves, so a line in the
 * editor is the same line at run time and the debugger needs no source map.
 *
 * The parser comes from the copy of TypeScript that Monaco already ships, so
 * this adds no new dependency. It is loaded on first run and cached after that.
 */

export type StripResult = { ok: true; code: string } | { ok: false; message: string; line?: number }

let api: Promise<TsApi> | null = null

async function loadTypeScript(): Promise<TsApi> {
  const mod = await import('monaco-editor/languages/features/typescript/lib/typescriptServices.js')
  return mod.typescript
}

class Unsupported extends Error {
  readonly line: number

  constructor(message: string, line: number) {
    super(message)
    this.line = line
  }
}

export async function stripTypes(source: string): Promise<StripResult> {
  let ts: TsApi
  try {
    if (!api) api = loadTypeScript()
    ts = await api
  } catch (err) {
    api = null
    return { ok: false, message: `Could not load the TypeScript parser: ${(err as Error).message}` }
  }

  const file: TsSourceFile = ts.createSourceFile(
    'solution.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const out = source.split('')
  const kind = ts.SyntaxKind

  const lineOf = (position: number) => file.getLineAndCharacterOfPosition(position).line + 1

  /** Overwrites a range with spaces, leaving line breaks alone. */
  const blank = (start: number, end: number) => {
    for (let index = Math.max(0, start); index < Math.min(end, out.length); index++) {
      const char = out[index]
      if (char !== '\n' && char !== '\r') out[index] = ' '
    }
  }

  const blankNode = (node: TsNode) => blank(node.getStart(file), node.end)

  /** Blanks a `: Type` annotation along with the colon in front of it. */
  const blankAnnotation = (type: TsNode) => {
    let start = type.pos
    let index = start - 1
    while (index >= 0 && /\s/.test(source[index])) index--
    if (source[index] === ':') start = index
    blank(start, type.end)
  }

  /** Blanks a type parameter or type argument list, angle brackets included. */
  const blankAngles = (list: TsNodeArray) => {
    let start = list.pos - 1
    while (start >= 0 && source[start] !== '<') start--
    let end = list.end
    while (end < source.length && source[end] !== '>') end++
    if (start >= 0 && end < source.length) blank(start, end + 1)
  }

  const TYPE_MODIFIERS = new Set<number>([
    kind.DeclareKeyword,
    kind.PublicKeyword,
    kind.PrivateKeyword,
    kind.ProtectedKeyword,
    kind.ReadonlyKeyword,
    kind.AbstractKeyword,
    kind.OverrideKeyword,
  ])

  const ANNOTATED = new Set<number>([
    kind.Parameter,
    kind.VariableDeclaration,
    kind.PropertyDeclaration,
    kind.PropertySignature,
    kind.FunctionDeclaration,
    kind.FunctionExpression,
    kind.ArrowFunction,
    kind.MethodDeclaration,
    kind.GetAccessor,
    kind.SetAccessor,
    kind.Constructor,
  ])

  const OPTIONAL_HOLDERS = new Set<number>([
    kind.Parameter,
    kind.PropertyDeclaration,
    kind.PropertySignature,
    kind.MethodDeclaration,
    kind.MethodSignature,
  ])

  function visit(node: TsNode): void {
    switch (node.kind) {
      case kind.InterfaceDeclaration:
      case kind.TypeAliasDeclaration:
        blankNode(node)
        return
      case kind.IndexSignature:
        blankNode(node)
        return
      case kind.ModuleDeclaration:
        throw new Unsupported(
          'namespace and module declarations cannot be removed by type stripping',
          lineOf(node.getStart(file)),
        )
      case kind.EnumDeclaration:
        throw new Unsupported(
          'enum is not supported here because it produces real code. Use a plain object instead',
          lineOf(node.getStart(file)),
        )
      case kind.AsExpression:
      case kind.SatisfiesExpression:
        blank((node as Required<TsNode>).expression.end, node.end)
        visit((node as Required<TsNode>).expression)
        return
      case kind.NonNullExpression:
        blank((node as Required<TsNode>).expression.end, node.end)
        visit((node as Required<TsNode>).expression)
        return
      case kind.TypeAssertionExpression: {
        const assertion = node as Required<TsNode>
        blank(node.getStart(file), assertion.expression.getStart(file))
        visit(assertion.expression)
        return
      }
      case kind.HeritageClause:
        if (node.token === kind.ImplementsKeyword) {
          blankNode(node)
          return
        }
        break
      case kind.ImportDeclaration:
      case kind.ExportDeclaration:
      case kind.ImportEqualsDeclaration:
        if ((node as { isTypeOnly?: boolean }).isTypeOnly) {
          blankNode(node)
          return
        }
        break
    }

    if (node.modifiers) {
      // `constructor(private size: number)` declares a field as a side effect,
      // which is real code rather than a type, so it cannot simply be removed.
      if (node.kind === kind.Parameter) {
        const found = node.modifiers.find((modifier) => TYPE_MODIFIERS.has(modifier.kind))
        if (found) {
          throw new Unsupported(
            'a constructor parameter property creates a field, so it cannot be stripped. Assign to this inside the constructor instead',
            lineOf(node.getStart(file)),
          )
        }
      }
      let declared = false
      for (const modifier of node.modifiers) {
        if (!TYPE_MODIFIERS.has(modifier.kind)) continue
        if (modifier.kind === kind.DeclareKeyword || modifier.kind === kind.AbstractKeyword) {
          declared = true
        }
        blankNode(modifier)
      }
      // An abstract or declared member has no body to keep, so the whole member goes.
      if (declared && !node.body && node.kind !== kind.ClassDeclaration) {
        blankNode(node)
        return
      }
    }

    if (node.questionToken && OPTIONAL_HOLDERS.has(node.kind)) blankNode(node.questionToken)
    if (
      node.exclamationToken &&
      (node.kind === kind.VariableDeclaration || node.kind === kind.PropertyDeclaration)
    ) {
      blankNode(node.exclamationToken)
    }
    if (node.type && ANNOTATED.has(node.kind)) blankAnnotation(node.type)
    if (node.typeParameters) blankAngles(node.typeParameters)
    if (node.typeArguments) blankAngles(node.typeArguments)

    ts.forEachChild(node, visit)
  }

  try {
    ts.forEachChild(file, visit)
  } catch (err) {
    if (err instanceof Unsupported) return { ok: false, message: err.message, line: err.line }
    return { ok: false, message: `Could not read the TypeScript: ${(err as Error).message}` }
  }

  const diagnostics = file.parseDiagnostics
  if (diagnostics && diagnostics.length > 0) {
    const first = diagnostics[0]
    return {
      ok: false,
      message: ts.flattenDiagnosticMessageText(first.messageText, ' '),
      line: lineOf(first.start),
    }
  }

  return { ok: true, code: out.join('') }
}
