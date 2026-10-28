/**
 * Monaco ships its own copy of the TypeScript compiler for the editor's
 * language service. The type stripper borrows that parser, so only the small
 * part of the API it touches is declared here. The `typescript` package in
 * devDependencies is version 7, which no longer publishes these types.
 */
declare module 'monaco-editor/languages/features/typescript/lib/typescriptServices.js' {
  export interface TsNodeArray extends Array<TsNode> {
    pos: number
    end: number
  }

  export interface TsNode {
    kind: number
    pos: number
    end: number
    getStart(file?: TsSourceFile): number
    expression?: TsNode
    type?: TsNode
    token?: number
    isTypeOnly?: boolean
    modifiers?: TsNodeArray
    questionToken?: TsNode
    exclamationToken?: TsNode
    typeParameters?: TsNodeArray
    typeArguments?: TsNodeArray
    body?: TsNode
  }

  export interface TsDiagnostic {
    start: number
    messageText: string | { messageText: string }
  }

  export interface TsSourceFile extends TsNode {
    getLineAndCharacterOfPosition(position: number): { line: number; character: number }
    parseDiagnostics?: TsDiagnostic[]
  }

  export interface TsApi {
    createSourceFile(
      fileName: string,
      text: string,
      target: number,
      setParentNodes: boolean,
      scriptKind: number,
    ): TsSourceFile
    forEachChild(node: TsNode, visit: (child: TsNode) => void): void
    flattenDiagnosticMessageText(
      text: string | { messageText: string } | undefined,
      separator: string,
    ): string
    ScriptTarget: Record<string, number>
    ScriptKind: Record<string, number>
    SyntaxKind: Record<string, number>
  }

  export const typescript: TsApi
}
