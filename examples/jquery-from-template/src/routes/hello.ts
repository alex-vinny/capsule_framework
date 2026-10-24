export default function handler(params) {
  return { message: `Hello, ${params?.name ?? 'World'}! (from QuickJS)` }
}
