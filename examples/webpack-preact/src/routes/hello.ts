export default function handler(params) {
  return {
    message: 'Hello, ' + (params && params.name ? params.name : 'World') + '! (from QuickJS)',
  }
}
