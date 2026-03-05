import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import IntroPage from './pages/IntroPage'
import SignInPage from './pages/SignInPage'
import SteamSetupPage from './pages/SteamSetupPage'
import RecommendationsDashboardPage from './pages/RecommendationsDashboardPage'

const TOKEN_KEY = 'wtp_token'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const FALLBACK_GAMES = [
  {
    id: 1,
    title: 'Stardew Valley',
    genre: 'Simulation',
    platform: 'PC (Windows)',
    thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=60',
    short_description: 'Build your farm, fish, and relax at your own pace.',
    sessionLength: 50,
    reasons: ['Low mental load for your current energy'],
    score: 42,
  },
  {
    id: 2,
    title: 'Hades',
    genre: 'Action RPG',
    platform: 'PC (Windows)',
    thumbnail: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=800&q=60',
    short_description: 'Fast runs with meaningful progress in short bursts.',
    sessionLength: 40,
    reasons: ['High intensity option while you are focused'],
    score: 39,
  },
  {
    id: 3,
    title: 'Minecraft',
    genre: 'Sandbox',
    platform: 'PC (Windows)',
    thumbnail: 'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?auto=format&fit=crop&w=800&q=60',
    short_description: 'Creative or survival mode depending on your energy.',
    sessionLength: 50,
    reasons: ['Great solo flow when friends are offline'],
    score: 43,
  },
]

const clamp = (num, min, max) => Math.max(min, Math.min(max, num))

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const getSessionLengthByGenre = (genre = '') => {
  const key = genre.toLowerCase()
  if (key.includes('battle') || key.includes('moba') || key.includes('shooter')) return 30
  if (key.includes('roguel') || key.includes('action')) return 40
  if (key.includes('racing') || key.includes('sports')) return 35
  if (key.includes('strategy') || key.includes('rpg')) return 75
  if (key.includes('mmo')) return 90
  if (key.includes('adventure') || key.includes('story')) return 60
  if (key.includes('sandbox') || key.includes('simulation')) return 50
  return 45
}

const getIntensityByGenre = (genre = '') => {
  const key = genre.toLowerCase()
  if (key.includes('horror') || key.includes('battle') || key.includes('moba')) return 3
  if (key.includes('shooter') || key.includes('action') || key.includes('sports')) return 2
  if (key.includes('puzzle') || key.includes('adventure') || key.includes('rpg')) return 1
  if (key.includes('sandbox') || key.includes('simulation') || key.includes('casual')) return 0
  return 1
}

const isSocialGenre = (genre = '') => {
  const key = genre.toLowerCase()
  return key.includes('mmo') || key.includes('battle') || key.includes('moba') || key.includes('shooter') || key.includes('sports')
}

const getGoalBoost = (goal, genre = '', socialGame) => {
  const key = genre.toLowerCase()
  if (goal === 'Relax') {
    if (key.includes('simulation') || key.includes('sandbox') || key.includes('casual') || key.includes('puzzle')) return 16
    return -4
  }
  if (goal === 'Competitive') {
    if (key.includes('sports') || key.includes('battle') || key.includes('moba') || key.includes('shooter')) return 16
    return -4
  }
  if (goal === 'Story') {
    if (key.includes('adventure') || key.includes('rpg')) return 16
    return -3
  }
  if (goal === 'Social') return socialGame ? 16 : -6
  return 0
}

const createReasons = ({ game, timeAvailable, energy, goal, friendsOnline, device }) => {
  const reasons = []
  const sessionLength = getSessionLengthByGenre(game.genre)
  const socialGame = isSocialGenre(game.genre)
  const intensity = getIntensityByGenre(game.genre)

  if (Math.abs(sessionLength - timeAvailable) <= 20) reasons.push(`Fits your ${timeAvailable} minute window`)
  if (energy === 'Low' && intensity <= 1) reasons.push('Low mental load for your current energy')
  if (energy === 'High' && intensity >= 2) reasons.push('High intensity option while you are focused')
  if (goal === 'Social' && socialGame) reasons.push('Built for social sessions')
  if (friendsOnline && socialGame) reasons.push('Friends online can make this more fun right now')
  if (!friendsOnline && !socialGame) reasons.push('Great solo flow when friends are offline')
  if (device === 'Mobile' && game.platform?.toLowerCase().includes('browser')) reasons.push('Playable on a lighter device setup')
  if (game.salePrice) reasons.push(`On sale for $${Number(game.salePrice).toFixed(2)}`)

  return reasons.slice(0, 3)
}

const rankGames = ({ games, context }) => {
  return games
    .map((game) => {
      const sessionLength = getSessionLengthByGenre(game.genre)
      const intensity = getIntensityByGenre(game.genre)
      const socialGame = isSocialGenre(game.genre)

      const timeFit = 40 - clamp(Math.abs(context.timeAvailable - sessionLength), 0, 40)
      const energyFit = context.energy === 'Low' ? (intensity <= 1 ? 18 : -10) : intensity >= 2 ? 18 : 2
      const socialFit = context.friendsOnline ? (socialGame ? 14 : -5) : socialGame ? -2 : 8
      const goalBoost = getGoalBoost(context.goal, game.genre, socialGame)

      const platform = game.platform?.toLowerCase() || ''
      const deviceFit =
        context.device === 'PC'
          ? platform.includes('pc')
            ? 10
            : 2
          : context.device === 'Console'
            ? platform.includes('pc')
              ? 4
              : 9
            : platform.includes('browser') || platform.includes('web')
              ? 10
              : 3

      const qualitySignal = clamp((Number(game.steamRatingPercent) || 70) / 10, 0, 10)
      const score = timeFit + energyFit + socialFit + goalBoost + deviceFit + qualitySignal

      return {
        ...game,
        sessionLength,
        score,
        reasons: createReasons({ game, timeAvailable: context.timeAvailable, energy: context.energy, goal: context.goal, friendsOnline: context.friendsOnline, device: context.device }),
      }
    })
    .sort((a, b) => b.score - a.score)
}

async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const url = path.startsWith('/api') && API_BASE_URL ? `${API_BASE_URL}${path}` : path

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }
  return payload
}

async function fetchPublicRecommendations({ timeAvailable, energy, goal, device, friendsOnline }) {
  const payload = await apiRequest('/api/public/recommend', {
    method: 'POST',
    body: {
      timeAvailable,
      energy: energy.toLowerCase(),
      goal: goal.toLowerCase(),
      device: device.toLowerCase(),
      friendsOnline,
    },
  })
  return payload.results || []
}

const normalizePrivateItem = (item, device) => ({
  id: item.appid,
  appid: item.appid,
  title: item.name,
  genre: item.genres || 'Unknown',
  genres: item.genres || '',
  platform: device === 'PC' ? 'PC (Windows)' : device,
  thumbnail: item.header_image,
  thumb: item.header_image,
  short_description: `Steam library recommendation with context-aware score ${Math.round(item.score || 0)}.`,
  sessionLength: item.avg_session_minutes || 45,
  score: item.score || 0,
  reasons: item.why && item.why.length ? item.why : ['Matches your current context'],
})

async function fetchPrivateRecommendations({ token, timeAvailable, energy, goal, device, friendsOnline }) {
  const platformMap = {
    PC: 'windows',
    Console: 'windows',
    Mobile: 'windows',
  }

  const socialMode = friendsOnline || goal === 'Social' ? 'social' : 'solo'

  const payload = await apiRequest('/api/recommend', {
    method: 'POST',
    token,
    body: {
      time_available_min: timeAvailable,
      energy_level: energy.toLowerCase(),
      platform: platformMap[device] || 'windows',
      social_mode: socialMode,
      prefer_installed: true,
      shuffle_seed: 0,
    },
  })

  const combined = []
  if (payload.top_pick) combined.push(payload.top_pick)
  if (payload.alternatives?.length) combined.push(...payload.alternatives)

  return {
    items: combined.map((item) => normalizePrivateItem(item, device)),
    friendsOnlineCount: payload.friends_online_count ?? 0,
  }
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme)
  const [timeAvailable, setTimeAvailable] = useState(45)
  const [energy, setEnergy] = useState('Low')
  const [goal, setGoal] = useState('Relax')
  const [device, setDevice] = useState('PC')
  const [friendsOnline, setFriendsOnline] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rankedGames, setRankedGames] = useState([])
  const [dismissedIds, setDismissedIds] = useState(new Set())
  const [acceptedQueue, setAcceptedQueue] = useState([])
  const [actionMessage, setActionMessage] = useState('')
  const [selectedAlternativeId, setSelectedAlternativeId] = useState(null)
  const [liveFriendsCount, setLiveFriendsCount] = useState(null)
  const [dataSource, setDataSource] = useState('none')
  const [steamFriends, setSteamFriends] = useState([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [friendsError, setFriendsError] = useState('')

  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '')
  const [authMode, setAuthMode] = useState('login')
  const [showIntroPage, setShowIntroPage] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [me, setMe] = useState(null)

  const [steamIdInput, setSteamIdInput] = useState('')
  const [steamBusy, setSteamBusy] = useState(false)
  const [steamMessage, setSteamMessage] = useState('')
  const [librarySyncNotice, setLibrarySyncNotice] = useState('')

  const isAuthed = Boolean(token && me?.user)
  const steamBound = Boolean(me?.steam?.steamid)
  const currentStep = !isAuthed ? 'auth' : !steamBound ? 'steam' : 'dashboard'

  const visibleGames = useMemo(
    () => rankedGames.filter((g) => !dismissedIds.has(g.id || g.appid)),
    [rankedGames, dismissedIds],
  )
  const topPick = visibleGames[0] || null
  const alternatives = useMemo(() => visibleGames.slice(1, 6), [visibleGames])

  const getScoreSummary = (score) => {
    const rounded = Math.round(Number(score) || 0)
    if (rounded >= 50) return 'Excellent context fit'
    if (rounded >= 40) return 'Strong context fit'
    if (rounded >= 30) return 'Good backup pick'
    if (rounded >= 20) return 'Playable option'
    return 'Weak fit right now'
  }

  const handleTimeChange = (value) => {
    if (value === '' || value === null || value === undefined) return
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return
    const stepped = Math.round(numeric / 5) * 5
    const clamped = Math.max(15, Math.min(180, stepped))
    setTimeAvailable(clamped)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const refreshMe = useCallback(async (authToken = token) => {
    if (!authToken) {
      setMe(null)
      return
    }

    try {
      const payload = await apiRequest('/api/auth/me', { token: authToken })
      setMe(payload)
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      setToken('')
      setMe(null)
    }
  }, [token])

  useEffect(() => {
    refreshMe()
  }, [refreshMe])

  const fetchSteamFriends = useCallback(async () => {
    if (!token || !steamBound) return
    setFriendsLoading(true)
    setFriendsError('')
    try {
      const payload = await apiRequest('/api/steam/friends', { token })
      setSteamFriends(payload.friends || [])
      setLiveFriendsCount(payload.online_count ?? 0)
    } catch (err) {
      setFriendsError(err.message || 'Failed to load Steam friends')
    } finally {
      setFriendsLoading(false)
    }
  }, [steamBound, token])

  useEffect(() => {
    if (currentStep === 'dashboard') {
      fetchSteamFriends()
    }
  }, [currentStep, fetchSteamFriends])

  useEffect(() => {
    if (me?.steam?.steamid) {
      setSteamIdInput((prev) => prev || me.steam.steamid)
    }
  }, [me?.steam?.steamid])

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')
    setSteamMessage('')
    setAuthBusy(true)

    try {
      const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const payload = await apiRequest(path, {
        method: 'POST',
        body: { email, password },
      })

      const newToken = payload.access_token
      localStorage.setItem(TOKEN_KEY, newToken)
      setToken(newToken)
      await refreshMe(newToken)
      setPassword('')
    } catch (err) {
      setAuthError(err.message || 'Authentication failed')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setMe(null)
    setShowIntroPage(true)
    setSteamMessage('Logged out')
    setSteamFriends([])
    setDismissedIds(new Set())
    setAcceptedQueue([])
  }

  const handleBindSteam = async () => {
    if (!steamIdInput.trim()) return
    setSteamBusy(true)
    setSteamMessage('')

    try {
      const payload = await apiRequest('/api/account/bind_steam', {
        method: 'POST',
        token,
        body: { steamid: steamIdInput.trim() },
      })
      setSteamMessage(`Steam linked: ${payload.steam?.persona || payload.steam?.steamid}`)
      await refreshMe()
      await fetchSteamFriends()
    } catch (err) {
      setSteamMessage(`Steam bind failed: ${err.message}`)
    } finally {
      setSteamBusy(false)
    }
  }

  const handleSyncSteam = async () => {
    setSteamBusy(true)
    setSteamMessage('')
    setLibrarySyncNotice('')

    try {
      const payload = await apiRequest('/api/steam/sync', {
        method: 'POST',
        token,
      })
      setSteamMessage(`Steam library ownership sync complete. Imported ${payload.synced || 0} games.`)
      setLibrarySyncNotice('Metadata enrichment and index rebuild are still running in the background, so recommendations may update gradually for the next few minutes.')
      await fetchSteamFriends()
    } catch (err) {
      setSteamMessage(`Steam sync failed: ${err.message}`)
    } finally {
      setSteamBusy(false)
    }
  }

  const handleRecommend = async () => {
    setLoading(true)
    setError('')

    try {
      if (isAuthed && steamBound) {
        try {
          const privateResult = await fetchPrivateRecommendations({
            token,
            timeAvailable,
            energy,
            goal,
            device,
            friendsOnline,
          })

          if (privateResult.items.length) {
            setRankedGames(privateResult.items)
            setLiveFriendsCount(privateResult.friendsOnlineCount)
            setDataSource('private')
            setDismissedIds(new Set())
            setSelectedAlternativeId(null)
            setActionMessage('')
            return
          }
        } catch {
          // Fall through to backend public API before local fallback.
        }
      }

      const publicRanked = await fetchPublicRecommendations({ timeAvailable, energy, goal, device, friendsOnline })
      if (!publicRanked.length) throw new Error('No recommendations returned')

      setRankedGames(publicRanked)
      setLiveFriendsCount(null)
      setDataSource('public')
      setDismissedIds(new Set())
      setSelectedAlternativeId(null)
      setActionMessage('')
    } catch {
      const rankedFallback = rankGames({
        games: FALLBACK_GAMES,
        context: { timeAvailable, energy, goal, device, friendsOnline },
      })
      setRankedGames(rankedFallback)
      setLiveFriendsCount(null)
      setDataSource('fallback')
      setDismissedIds(new Set())
      setSelectedAlternativeId(null)
      setError('Backend unavailable, showing local demo data.')
    } finally {
      setLoading(false)
    }
  }

  const moveToFront = (targetId) => {
    setRankedGames((prev) => {
      const idx = prev.findIndex((g) => (g.id || g.appid) === targetId)
      if (idx <= 0) return prev
      const copy = [...prev]
      const [picked] = copy.splice(idx, 1)
      copy.unshift(picked)
      return copy
    })
  }

  const handleShuffle = () => {
    if (visibleGames.length <= 1) return
    const candidatePool = visibleGames.slice(1)
    const randomPick = candidatePool[Math.floor(Math.random() * candidatePool.length)]
    moveToFront(randomPick.id || randomPick.appid)
    setActionMessage(`Shuffled to: ${randomPick.title}`)
  }

  const handlePromoteAlternative = (item) => {
    const id = item?.id || item?.appid
    if (!id) return
    moveToFront(id)
    setSelectedAlternativeId(null)
    setActionMessage(`Promoted "${item.title}" to Top Pick.`)
  }

  const submitFeedback = async (item, action) => {
    if (!isAuthed || dataSource !== 'private' || !item?.appid) return

    try {
      await apiRequest('/api/recommend/feedback', {
        method: 'POST',
        token,
        body: {
          appid: item.appid,
          action,
          genres: item.genres || item.genre || '',
          context: {
            time_available_min: timeAvailable,
            energy_level: energy.toLowerCase(),
            social_mode: friendsOnline ? 'social' : 'solo',
          },
        },
      })
    } catch {
      // Non-blocking in UI
    }
  }

  const handleAccept = async (item) => {
    const id = item?.id || item?.appid
    if (!id) return
    await submitFeedback(item, 'accept')
    setAcceptedQueue((prev) => {
      const queueItem = {
        id,
        title: item.title,
        thumbnail: item.thumbnail || item.thumb || '',
      }
      return [queueItem, ...prev.filter((q) => q.id !== id)].slice(0, 8)
    })
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setSelectedAlternativeId(null)
    setActionMessage(`Accepted "${item.title}" and added to Play Next queue.`)
  }

  const handleReject = async (item) => {
    const id = item?.id || item?.appid
    if (!id) return
    await submitFeedback(item, 'reject')
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setSelectedAlternativeId(null)
    setActionMessage(`Skipped "${item.title}". Showing next candidate.`)
  }

  const handleRemoveFromQueue = (queueItem) => {
    setAcceptedQueue((prev) => prev.filter((item) => item.id !== queueItem.id))
    setActionMessage(`Removed "${queueItem.title}" from Play Next queue.`)
  }

  const handleRefreshQueue = () => {
    setAcceptedQueue([])
    setActionMessage('Play Next queue refreshed.')
  }

  return (
    <main className="app-shell">
      <section className="checkin-panel">
        <div className="panel-header">
          <p className="eyebrow">GameFlow Studio</p>
          <button
            className={theme === 'dark' ? 'theme-toggle is-dark' : 'theme-toggle'}
            type="button"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span className="theme-switch-track">
              <span className="theme-icon sun" aria-hidden="true">☀</span>
              <span className="theme-icon moon" aria-hidden="true">☾</span>
              <span className="theme-knob" aria-hidden="true" />
            </span>
          </button>
        </div>

        {currentStep === 'auth' && (
          showIntroPage ? (
            <IntroPage
              onStartLogin={() => {
                setAuthMode('login')
                setShowIntroPage(false)
              }}
              onStartRegister={() => {
                setAuthMode('register')
                setShowIntroPage(false)
              }}
            />
          ) : (
            <SignInPage
              onBackToIntro={() => setShowIntroPage(true)}
              isAuthed={isAuthed}
              authMode={authMode}
              setAuthMode={setAuthMode}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              authBusy={authBusy}
              authError={authError}
              onSubmit={handleAuthSubmit}
              me={me}
              onLogout={handleLogout}
            />
          )
        )}

        {currentStep === 'steam' && (
          <SteamSetupPage
            me={me}
            onLogout={handleLogout}
            steamBound={steamBound}
            steamIdInput={steamIdInput}
            setSteamIdInput={setSteamIdInput}
            steamBusy={steamBusy}
            steamMessage={steamMessage}
            onBindSteam={handleBindSteam}
            onSyncSteam={handleSyncSteam}
          />
        )}

        {currentStep === 'dashboard' && (
          <RecommendationsDashboardPage
            me={me}
            onLogout={handleLogout}
            onSyncSteam={handleSyncSteam}
            onBindSteam={handleBindSteam}
            steamBusy={steamBusy}
            steamMessage={steamMessage}
            librarySyncNotice={librarySyncNotice}
            steamIdInput={steamIdInput}
            setSteamIdInput={setSteamIdInput}
            timeAvailable={timeAvailable}
            handleTimeChange={handleTimeChange}
            energy={energy}
            setEnergy={setEnergy}
            goal={goal}
            setGoal={setGoal}
            device={device}
            setDevice={setDevice}
            friendsOnline={friendsOnline}
            setFriendsOnline={setFriendsOnline}
            dataSource={dataSource}
            liveFriendsCount={liveFriendsCount}
            steamFriends={steamFriends}
            friendsLoading={friendsLoading}
            friendsError={friendsError}
            onRefreshFriends={fetchSteamFriends}
            handleRecommend={handleRecommend}
            loading={loading}
            error={error}
          />
        )}
      </section>

      <section className="results-panel">
        {currentStep !== 'dashboard' && (
          <div className="auth-box">
            <p className="auth-title">Progress</p>
            <p className="auth-note">
              {currentStep === 'auth' && 'Step 1 of 3: Sign in or register to continue.'}
              {currentStep === 'steam' && 'Step 2 of 3: Bind Steam and sync your library.'}
            </p>
          </div>
        )}

        {currentStep === 'dashboard' && !topPick && <p className="placeholder">Run the check-in to see your ranked recommendations.</p>}

        {currentStep === 'dashboard' && topPick && (
          <>
            <article className="top-pick-card">
              <p className="label">Top Pick</p>
              <img src={topPick.thumbnail || topPick.thumb} alt={topPick.title} />
              <h2>{topPick.title}</h2>
              <p>{topPick.short_description}</p>
              <div className="meta-row">
                <span>{topPick.genre}</span>
                <span>~{topPick.sessionLength} min session</span>
                <span>{topPick.platform}</span>
              </div>
              <p className="top-score-note">
                Context Fit Score: <strong>{Math.round(topPick.score || 0)}</strong>
                <span> Built from time fit, energy fit, social fit, device fit, and quality signal.</span>
              </p>
              <ul>
                {(topPick.reasons || []).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>

              <div className="decision-row">
                <button type="button" onClick={handleShuffle}>Shuffle Pick</button>
                <button type="button" onClick={() => handleAccept(topPick)}>Accept & Queue</button>
                <button type="button" onClick={() => handleReject(topPick)}>Reject & Skip</button>
              </div>

              {actionMessage && <p className="feedback">{actionMessage}</p>}
            </article>

            <section className="alt-list">
              <h3>Alternatives</h3>
              {alternatives.map((game) => (
                <article
                  className={selectedAlternativeId === (game.id || game.appid) ? 'alt-card is-selected' : 'alt-card'}
                  key={game.id}
                  onClick={() => setSelectedAlternativeId((prev) => (prev === (game.id || game.appid) ? null : (game.id || game.appid)))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedAlternativeId((prev) => (prev === (game.id || game.appid) ? null : (game.id || game.appid)))
                    }
                  }}
                >
                  <img src={game.thumbnail || game.thumb} alt={game.title} />
                  <div className="alt-main">
                    <h4>{game.title}</h4>
                    <p>{game.genre}</p>
                    <small>{(game.reasons && game.reasons[0]) || 'Good contextual match'}</small>
                  </div>
                  <div className="alt-score" title="Score combines time, energy, social context, device fit, and quality signal">
                    <strong>{Math.round(game.score || 0)}</strong>
                    <small>{getScoreSummary(game.score)}</small>
                  </div>
                  {selectedAlternativeId === (game.id || game.appid) && (
                    <div className="alt-actions-inline" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => handlePromoteAlternative(game)}>Shuffle Pick</button>
                      <button type="button" onClick={() => handleAccept(game)}>Accept & Queue</button>
                      <button type="button" onClick={() => handleReject(game)}>Reject & Skip</button>
                    </div>
                  )}
                </article>
              ))}
            </section>

            {!!acceptedQueue.length && (
              <section className="alt-list">
                <div className="queue-header">
                  <h3>Play Next Queue</h3>
                  <button type="button" className="chip queue-refresh-btn" onClick={handleRefreshQueue}>
                    Refresh Queue
                  </button>
                </div>
                {acceptedQueue.map((title) => (
                  <article className="queue-card" key={title.id}>
                    <div className="queue-thumb-wrap">
                      {title.thumbnail ? (
                        <img className="queue-thumb" src={title.thumbnail} alt={title.title} loading="lazy" decoding="async" />
                      ) : (
                        <div className="queue-thumb placeholder-avatar" />
                      )}
                    </div>
                    <div className="queue-item-copy">
                      <h4>{title.title}</h4>
                      <small>Accepted recommendation</small>
                    </div>
                    <button type="button" className="chip queue-remove-btn" onClick={() => handleRemoveFromQueue(title)}>
                      Delete
                    </button>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default App
