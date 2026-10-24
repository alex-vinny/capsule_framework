export default function handler(params: { name?: string }) {
  return { message: `Hello, ${params?.name ?? 'World'}! (from QuickJS)` }
}
