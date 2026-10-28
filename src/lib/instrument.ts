import { parse } from 'acorn'

/**
 * Rewrites user code so that every statement is preceded by a probe call:
 *
 *   __dbg(12, () => ({ i: __v(() => i) }), x => eval(x));
 *
 * The probe is inserted on the same line as the statement it belongs to, so
 * line numbers in the rewritten source still match the editor exactly. That
 * keeps breakpoints and error stacks honest without a source map.
 *
 * Arguments of the probe:
 *   1. the line number
 *   2. a thunk producing a snapshot of every variable visible at that point,
 *      so nothing is evaluated unless we actually stop there
 *   3. a direct eval closure, which is how watch expressions get evaluated
 *      inside the real scope of the paused frame
 */

type Node = any

interface Edit {
  pos: number
  seq: number
  text: string
}
interface Frame {
  fn: boolean
  vars: Set<string>
}

export interface InstrumentResult {
  code: string
  /** Lines that carry a probe, so the UI can reject breakpoints on blank lines. */
  lines: number[]
}

const MAX_SNAPSHOT_VARS = 60

function patternNames(node: Node, out: Set<string>): void {
  if (!node) return
  switch (node.type) {
    case 'Identifier':
      out.add(node.name)
      break
    case 'ObjectPattern':
      for (const prop of node.properties) {
        patternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out)
      }
      break
    case 'ArrayPattern':
      for (const el of node.elements) patternNames(el, out)
      break
    case 'AssignmentPattern':
      patternNames(node.left, out)
      break
    case 'RestElement':
      patternNames(node.argument, out)
      break
  }
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

/** Collects `var` and function declarations hoisted to the current function scope. */
function collectHoisted(node: Node, out: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) collectHoisted(child, out)
    return
  }
  if (typeof node.type !== 'string') return
  if (node.type === 'FunctionDeclaration') {
    if (node.id) out.add(node.id.name)
    return
  }
  if (FUNCTION_TYPES.has(node.type) || node.type === 'ClassDeclaration') return
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const decl of node.declarations) patternNames(decl.id, out)
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    collectHoisted(node[key], out)
  }
}

/** Collects let/const/class/function names declared directly in a statement list. */
function collectBlockScoped(body: Node[], out: Set<string>): void {
  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration' && stmt.kind !== 'var') {
      for (const decl of stmt.declarations) patternNames(decl.id, out)
    } else if (stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') {
      if (stmt.id) out.add(stmt.id.name)
    }
  }
}

export function instrument(source: string): InstrumentResult {
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowHashBang: true,
  }) as Node

  const edits: Edit[] = []
  const probeLines = new Set<number>()
  const stack: Frame[] = []
  let seq = 0

  const visibleNames = (): string[] => {
    const seen = new Set<string>()
    for (const frame of stack) for (const name of frame.vars) seen.add(name)
    return Array.from(seen).slice(0, MAX_SNAPSHOT_VARS)
  }

  const addEdit = (pos: number, text: string) => {
    edits.push({ pos, seq: seq++, text })
  }

  const probe = (stmt: Node) => {
    const line = stmt.loc.start.line
    probeLines.add(line)
    const entries = visibleNames()
      .map((name) => `${JSON.stringify(name)}:__v(()=>${name})`)
      .join(',')
    addEdit(stmt.start, `__dbg(${line},()=>({${entries}}),__x=>eval(__x));`)
  }

  const isDirective = (stmt: Node) =>
    stmt.type === 'ExpressionStatement' && typeof stmt.directive === 'string'

  /** Walks a statement list using the frame already on top of the stack. */
  const visitStatements = (body: Node[], frame: Frame) => {
    collectBlockScoped(body, frame.vars)
    for (const stmt of body) {
      if (
        stmt.type === 'FunctionDeclaration' ||
        isDirective(stmt) ||
        stmt.type === 'EmptyStatement'
      ) {
        visit(stmt)
        continue
      }
      probe(stmt)
      visit(stmt)
    }
  }

  const visitBlock = (block: Node) => {
    const frame: Frame = { fn: false, vars: new Set() }
    stack.push(frame)
    visitStatements(block.body, frame)
    stack.pop()
  }

  /**
   * `if (ok) return 1;` has no block to hang a probe on, so a pair of braces is
   * injected. Both braces land on the same lines as the statement, which keeps
   * the line numbering intact.
   */
  const visitBody = (node: Node) => {
    if (!node) return
    if (node.type === 'BlockStatement') {
      visitBlock(node)
      return
    }
    if (node.type === 'EmptyStatement') return
    addEdit(node.start, '{')
    const frame: Frame = { fn: false, vars: new Set() }
    stack.push(frame)
    probe(node)
    visit(node)
    stack.pop()
    addEdit(node.end, '}')
  }

  const visitFunction = (node: Node) => {
    const frame: Frame = { fn: true, vars: new Set() }
    // Arrow functions inherit `this` from the enclosing frame, so only real
    // functions add it. The worker drops it again when it turns out to be the
    // global object, which is the uninteresting case.
    if (node.type !== 'ArrowFunctionExpression') frame.vars.add('this')
    if (node.id) frame.vars.add(node.id.name)
    for (const param of node.params) patternNames(param, frame.vars)
    if (node.body.type === 'BlockStatement') collectHoisted(node.body, frame.vars)
    stack.push(frame)
    if (node.body.type === 'BlockStatement') {
      visitStatements(node.body.body, frame)
    } else {
      visit(node.body)
    }
    stack.pop()
  }

  const visitChildren = (node: Node, skip?: Set<string>) => {
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
      if (skip && skip.has(key)) continue
      visit(node[key])
    }
  }

  function visit(node: Node): void {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (typeof node.type !== 'string') return

    switch (node.type) {
      case 'Program': {
        const frame: Frame = { fn: true, vars: new Set() }
        collectHoisted(node, frame.vars)
        stack.push(frame)
        visitStatements(node.body, frame)
        stack.pop()
        return
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        visitFunction(node)
        return
      case 'BlockStatement':
        visitBlock(node)
        return
      case 'IfStatement':
        visit(node.test)
        visitBody(node.consequent)
        if (node.alternate) {
          if (node.alternate.type === 'IfStatement') visit(node.alternate)
          else visitBody(node.alternate)
        }
        return
      case 'ForStatement': {
        const frame: Frame = { fn: false, vars: new Set() }
        if (node.init && node.init.type === 'VariableDeclaration' && node.init.kind !== 'var') {
          for (const decl of node.init.declarations) patternNames(decl.id, frame.vars)
        }
        stack.push(frame)
        visit(node.init)
        visit(node.test)
        visit(node.update)
        visitBody(node.body)
        stack.pop()
        return
      }
      case 'ForInStatement':
      case 'ForOfStatement': {
        const frame: Frame = { fn: false, vars: new Set() }
        if (node.left.type === 'VariableDeclaration' && node.left.kind !== 'var') {
          for (const decl of node.left.declarations) patternNames(decl.id, frame.vars)
        }
        stack.push(frame)
        visit(node.right)
        visitBody(node.body)
        stack.pop()
        return
      }
      case 'WhileStatement':
      case 'DoWhileStatement':
        visit(node.test)
        visitBody(node.body)
        return
      case 'LabeledStatement':
        // Deliberately not wrapped in braces: a label in front of a block is a
        // block label, and `continue label` would stop being legal.
        visit(node.body)
        return
      case 'SwitchStatement': {
        visit(node.discriminant)
        const frame: Frame = { fn: false, vars: new Set() }
        stack.push(frame)
        for (const kase of node.cases) collectBlockScoped(kase.consequent, frame.vars)
        for (const kase of node.cases) {
          visit(kase.test)
          for (const stmt of kase.consequent) {
            if (stmt.type === 'FunctionDeclaration' || stmt.type === 'EmptyStatement') {
              visit(stmt)
              continue
            }
            probe(stmt)
            visit(stmt)
          }
        }
        stack.pop()
        return
      }
      case 'CatchClause': {
        const frame: Frame = { fn: false, vars: new Set() }
        if (node.param) patternNames(node.param, frame.vars)
        stack.push(frame)
        visitStatements(node.body.body, frame)
        stack.pop()
        return
      }
      case 'Property':
        if (node.computed) visit(node.key)
        visit(node.value)
        return
      case 'MemberExpression':
        visit(node.object)
        if (node.computed) visit(node.property)
        return
      default:
        visitChildren(node)
    }
  }

  visit(ast)

  edits.sort((a, b) => a.pos - b.pos || a.seq - b.seq)
  let out = ''
  let cursor = 0
  for (const edit of edits) {
    out += source.slice(cursor, edit.pos) + edit.text
    cursor = edit.pos
  }
  out += source.slice(cursor)

  return { code: out, lines: Array.from(probeLines).sort((a, b) => a - b) }
}
