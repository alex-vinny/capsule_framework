export function GET(req) {
  return {
    status: 200,
    body: JSON.stringify({ status: 'ok', path: req.path }),
    mimeType: 'application/json',
  }
}
