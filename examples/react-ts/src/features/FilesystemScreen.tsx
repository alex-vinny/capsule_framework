import { useState } from 'react'
import { filesystem, haptics } from '@capsule/core'
import type { FileEntry, FilesystemDirectory } from '@capsule/core'
import { Button, ErrorNote, Note, Row, SubSection, TextInput } from '../ui'

const DIRECTORIES: FilesystemDirectory[] = ['data', 'cache', 'documents']

export default function FilesystemScreen() {
  const [directory, setDirectory] = useState<FilesystemDirectory>('data')
  const [path, setPath] = useState('notes/hello.txt')
  const [content, setContent] = useState('hello capsule')
  const [read, setRead] = useState<string | null>(null)
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Every demo call clears the last error, vibrates on success, surfaces failures.
  const run = (fn: () => Promise<void>) => {
    setError(null)
    fn()
      .then(() => haptics.vibrate('light'))
      .catch((e: Error) => setError(e.message))
  }

  const opts = { directory }
  const dirOf = (p: string) => p.split('/').slice(0, -1).join('/')

  return (
    <>
      <Row style={{ marginBottom: 8 }}>
        {DIRECTORIES.map((d) => (
          <Button
            key={d}
            variant={directory === d ? 'active' : 'default'}
            onClick={() => setDirectory(d)}
          >
            {d}
          </Button>
        ))}
      </Row>

      <SubSection title="File">
        <Row style={{ marginBottom: 8 }}>
          <TextInput value={path} onChange={setPath} placeholder="relative/path.txt" mono />
        </Row>
        <Row style={{ marginBottom: 8 }}>
          <TextInput value={content} onChange={setContent} placeholder="contents" />
        </Row>
        <Row>
          <Button
            onClick={() => run(() => filesystem.writeFile(path, content, opts).then(() => {}))}
          >
            Write
          </Button>
          <Button onClick={() => run(() => filesystem.appendFile(path, `\n${content}`, opts))}>
            Append
          </Button>
          <Button onClick={() => run(async () => setRead(await filesystem.readFile(path, opts)))}>
            Read
          </Button>
          <Button
            onClick={() =>
              run(async () => {
                const s = await filesystem.stat(path, opts)
                setInfo(`${s.type} · ${s.size} B · ${new Date(s.mtime).toLocaleTimeString()}`)
              })
            }
          >
            Stat
          </Button>
          <Button
            variant="danger"
            onClick={() => run(() => filesystem.deleteFile(path, opts).then(() => setRead(null)))}
          >
            Delete
          </Button>
        </Row>
        {read !== null && (
          <pre
            style={{
              fontSize: 13,
              background: '#f5f5f5',
              borderRadius: 6,
              padding: 10,
              marginTop: 8,
              whiteSpace: 'pre-wrap',
            }}
          >
            {read || '(empty)'}
          </pre>
        )}
        {info && <Note>{info}</Note>}
      </SubSection>

      <SubSection title="Directory">
        <Row>
          <Button onClick={() => run(() => filesystem.mkdir(dirOf(path) || 'new-dir', opts))}>
            Mkdir (parent)
          </Button>
          <Button
            onClick={() => run(async () => setEntries(await filesystem.readdir(dirOf(path), opts)))}
          >
            List
          </Button>
        </Row>
        {entries && (
          <ul style={{ fontSize: 13, marginTop: 8, paddingLeft: 18 }}>
            {entries.length === 0 && <li style={{ color: '#888' }}>(empty)</li>}
            {entries.map((e) => (
              <li key={e.name}>
                {e.type === 'directory' ? '📁' : '📄'} {e.name}
                {e.type === 'file' ? ` · ${e.size} B` : ''}
              </li>
            ))}
          </ul>
        )}
      </SubSection>

      <SubSection title="Download">
        <Row>
          <Button
            onClick={() =>
              run(async () => {
                const dest = 'downloads/README.txt'
                const stat = await filesystem.downloadFile({
                  url: 'https://raw.githubusercontent.com/githubtraining/hellogitworld/master/README.txt',
                  path: dest,
                  directory,
                })
                // Point the File section at what we just downloaded so Read/Stat
                // act on it, and show its contents immediately.
                setPath(dest)
                setRead(await filesystem.readFile(dest, { directory }))
                setInfo(`downloaded ${stat.size} B → ${stat.uri}`)
              })
            }
          >
            Download a file
          </Button>
        </Row>
      </SubSection>

      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}
