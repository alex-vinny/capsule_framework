import { useState, useCallback } from 'react'

interface DogResult {
  imageUrl: string
  loadedAt: string
  fetchMs: number
}

interface PokemonResult {
  name: string
  sprite: string
  id: number
  fetchMs: number
}

function randomPokemonId() {
  return Math.floor(Math.random() * 151) + 1
}

export default function NetworkTab() {
  const [dog, setDog] = useState<DogResult | null>(null)
  const [dogLoading, setDogLoading] = useState(false)
  const [dogError, setDogError] = useState<string | null>(null)

  const [pokemon, setPokemon] = useState<PokemonResult | null>(null)
  const [pokeLoading, setPokeLoading] = useState(false)
  const [pokeError, setPokeError] = useState<string | null>(null)

  const fetchDog = useCallback(async () => {
    setDogLoading(true)
    setDogError(null)
    const t0 = Date.now()
    try {
      const res = await fetch('https://dog.ceo/api/breeds/image/random')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { message: string } = await res.json()
      setDog({
        imageUrl: data.message,
        loadedAt: new Date().toLocaleTimeString(),
        fetchMs: Date.now() - t0,
      })
    } catch (e) {
      setDogError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setDogLoading(false)
    }
  }, [])

  const fetchPokemon = useCallback(async () => {
    setPokeLoading(true)
    setPokeError(null)
    const id = randomPokemonId()
    const t0 = Date.now()
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { name: string; id: number; sprites: { front_default: string } } =
        await res.json()
      setPokemon({
        name: data.name,
        id: data.id,
        sprite: data.sprites.front_default,
        fetchMs: Date.now() - t0,
      })
    } catch (e) {
      setPokeError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setPokeLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-col gap-5 p-5 max-w-lg mx-auto">
      {/* Dog API */}
      <section className="bg-white rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Dog CEO API
            </h2>
            <p className="text-[10px] text-gray-300 mt-0.5">dog.ceo/api/breeds/image/random</p>
          </div>
          <button
            onClick={fetchDog}
            disabled={dogLoading}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-40"
          >
            {dogLoading ? 'Loading…' : dog ? 'Refresh' : 'Fetch'}
          </button>
        </div>

        {dogError && <p className="text-red-500 text-xs mt-2">Error: {dogError}</p>}

        {dog && !dogError && (
          <>
            <img
              src={dog.imageUrl}
              alt="Random dog"
              className="w-full rounded-lg object-cover max-h-56"
              onError={() => setDogError('Image failed to load')}
            />
            <p className="mt-2 text-[11px] text-gray-400">
              Fetched in <strong className="text-gray-600">{dog.fetchMs} ms</strong> · at{' '}
              {dog.loadedAt}
            </p>
          </>
        )}

        {!dog && !dogError && !dogLoading && (
          <p className="text-gray-400 text-xs">Tap Fetch to load a random dog photo.</p>
        )}
      </section>

      {/* PokéAPI */}
      <section className="bg-white rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              PokéAPI
            </h2>
            <p className="text-[10px] text-gray-300 mt-0.5">pokeapi.co/api/v2/pokemon/:id</p>
          </div>
          <button
            onClick={fetchPokemon}
            disabled={pokeLoading}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-40"
          >
            {pokeLoading ? 'Loading…' : pokemon ? 'Random' : 'Fetch'}
          </button>
        </div>

        {pokeError && <p className="text-red-500 text-xs mt-2">Error: {pokeError}</p>}

        {pokemon && !pokeError && (
          <div className="flex items-center gap-4">
            <img
              src={pokemon.sprite}
              alt={pokemon.name}
              className="w-24 h-24 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
            <div>
              <p className="font-semibold capitalize text-base">{pokemon.name}</p>
              <p className="text-gray-400 text-xs">#{String(pokemon.id).padStart(3, '0')}</p>
              <p className="mt-1 text-[11px] text-gray-400">
                Fetched in <strong className="text-gray-600">{pokemon.fetchMs} ms</strong>
              </p>
            </div>
          </div>
        )}

        {!pokemon && !pokeError && !pokeLoading && (
          <p className="text-gray-400 text-xs">Tap Fetch to load a random Gen I Pokémon.</p>
        )}
      </section>
    </div>
  )
}
