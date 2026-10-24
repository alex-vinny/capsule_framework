// Ambient declaration for `qrcode-terminal` — it ships no types and has no
// published @types package. Declares only the surface the CLI uses
// (`generate(input, { small })`), reachable via both the named and default
// export so `(await import('qrcode-terminal')).default.generate(...)` typechecks.
declare module 'qrcode-terminal' {
  interface GenerateOptions {
    /** Render with the compact half-height block charset. */
    small?: boolean
  }

  export function generate(input: string, options?: GenerateOptions): void

  const qrcodeTerminal: { generate: typeof generate }
  export default qrcodeTerminal
}
