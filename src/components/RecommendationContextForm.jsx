import { useEffect, useMemo, useState } from 'react'

const GOALS = ['Relax', 'Competitive', 'Story', 'Social']

function RecommendationContextForm({
  timeAvailable,
  handleTimeChange,
  energy,
  setEnergy,
  goal,
  setGoal,
  device,
  setDevice,
  friendsOnline,
  setFriendsOnline,
  dataSource,
  liveFriendsCount,
  steamFriends,
  friendsLoading,
  friendsError,
  onRefreshFriends,
  handleRecommend,
  loading,
  error,
}) {
  const [timeDraft, setTimeDraft] = useState(String(timeAvailable))
  const friendsToRender = useMemo(() => {
    const source = steamFriends || []
    return [...source].sort((a, b) => {
      if (Boolean(a.online) === Boolean(b.online)) return 0
      return a.online ? -1 : 1
    })
  }, [steamFriends])
  const showFriendsLoading = dataSource === 'private' && friendsLoading
  const hasFriends = friendsToRender.length > 0
  const canRefreshFriends = typeof onRefreshFriends === 'function'

  useEffect(() => {
    setTimeDraft(String(timeAvailable))
  }, [timeAvailable])

  const commitTimeInput = (rawValue) => {
    if (!rawValue.trim()) {
      setTimeDraft(String(timeAvailable))
      return
    }

    const numeric = Number(rawValue)
    if (Number.isNaN(numeric)) {
      setTimeDraft(String(timeAvailable))
      return
    }

    handleTimeChange(numeric)
  }

  return (
    <>
      <h1>What should you play right now?</h1>
      <p className="subtitle">Context check-in first. We rank games by time fit, energy match, social context, and device feasibility.</p>

      <div className="time-row">
        <label htmlFor="time-slider">Time Available</label>
        <div className="time-input-wrap">
          <button
            type="button"
            className="time-stepper"
            onClick={() => handleTimeChange(timeAvailable - 5)}
            aria-label="Decrease time available by 5 minutes"
          >
            -
          </button>
          <input
            id="time-input"
            className="time-input"
            type="number"
            min="15"
            max="180"
            step="5"
            value={timeDraft}
            onChange={(event) => setTimeDraft(event.target.value)}
            onBlur={(event) => commitTimeInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitTimeInput(timeDraft)
                event.currentTarget.blur()
              }
            }}
          />
          <button
            type="button"
            className="time-stepper"
            onClick={() => handleTimeChange(timeAvailable + 5)}
            aria-label="Increase time available by 5 minutes"
          >
            +
          </button>
          <span>min</span>
        </div>
      </div>

      <input
        id="time-slider"
        type="range"
        min="15"
        max="180"
        step="5"
        value={timeAvailable}
        onChange={(event) => handleTimeChange(event.target.value)}
      />

      <div className="row-group">
        <div>
          <span>Energy</span>
          <div className="chip-row">
            {['Low', 'High'].map((option) => (
              <button key={option} type="button" className={energy === option ? 'chip active' : 'chip'} onClick={() => setEnergy(option)}>
                {option}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span>Right now I want</span>
          <div className="chip-row wrap">
            {GOALS.map((option) => (
              <button key={option} type="button" className={goal === option ? 'chip active' : 'chip'} onClick={() => setGoal(option)}>
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="device-row">
          <label htmlFor="device">Device</label>
          <select id="device" value={device} onChange={(event) => setDevice(event.target.value)}>
            <option>PC</option>
            <option>Console</option>
            <option>Mobile</option>
          </select>
        </div>

        <div className={friendsOnline ? 'friends-toggle-card is-on' : 'friends-toggle-card'}>
          <div className="friends-toggle-copy">
            <p>Friends Online Priority</p>
            <small>{friendsOnline ? 'Social mode boosted for multiplayer picks.' : 'Solo-first ranking unless you enable this.'}</small>
          </div>
          <label className="switch" htmlFor="friends-online" aria-label="Toggle friends online priority">
            <input
              id="friends-online"
              type="checkbox"
              checked={friendsOnline}
              onChange={(event) => setFriendsOnline(event.target.checked)}
            />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
        </div>

        <div className="friends-presence">
          <div className="friends-header">
            <p>
              Friends {dataSource === 'private' && liveFriendsCount !== null ? `(Online ${liveFriendsCount})` : ''}
            </p>
            {canRefreshFriends && (
              <button type="button" className="chip" onClick={onRefreshFriends} disabled={friendsLoading}>
                {friendsLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>
          {friendsError && <small className="error-note">{friendsError}</small>}
          {showFriendsLoading && <small className="auth-note">Loading Steam friends...</small>}
          {!showFriendsLoading && hasFriends && (
            <ul className="friends-list steam-style">
              {friendsToRender.map((friend, index) => {
                const isInGame = Boolean(friend.game)
                const statusText = isInGame
                  ? 'In-Game'
                  : friend.status || (friend.online ? 'Online' : 'Offline')
                return (
                  <li key={friend.steamid || friend.id || `${friend.name}-${index}`}>
                    <div className="friend-avatar-wrap">
                      {friend.avatar ? (
                        <img
                          src={friend.avatar}
                          alt={friend.name}
                          className="friend-avatar"
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                        />
                      ) : (
                        <div className="friend-avatar placeholder-avatar" />
                      )}
                    </div>
                    <div className="friend-meta">
                      <span>{friend.name}</span>
                      <small className={isInGame ? 'friend-status in-game' : friend.online ? 'friend-status online' : 'friend-status offline'}>
                        {statusText}
                      </small>
                      {friend.game && <small className="friend-game">Playing {friend.game}</small>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {!showFriendsLoading && !hasFriends && !friendsError && dataSource === 'private' && (
            <small className="auth-note">No Steam friends found.</small>
          )}
        </div>
      </div>

      <button className="cta" type="button" onClick={handleRecommend} disabled={loading}>
        {loading ? 'Building your Play Now list...' : 'Generate Play Now List'}
      </button>

      {dataSource === 'private' && <p className="auth-note">Using Steam-authenticated backend ranking.</p>}
      {dataSource === 'public' && <p className="auth-note">Using backend public API catalog ranking.</p>}
      {error && <p className="error-note">{error}</p>}
    </>
  )
}

export default RecommendationContextForm
