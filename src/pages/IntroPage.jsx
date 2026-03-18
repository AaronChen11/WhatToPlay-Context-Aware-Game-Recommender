import HeroFuturistic from '../components/ui/HeroFuturistic'

function IntroPage({ onStartLogin, onStartRegister }) {
  return (
    <div className="intro-page">
      <HeroFuturistic onStartLogin={onStartLogin} onStartRegister={onStartRegister} />

      <div id="intro-features" className="intro-grid">
        <article className="intro-card">
          <p className="auth-title">Context Check-In</p>
          <p className="auth-note">Use time, energy, goal, device, and social signals to generate better recommendations than generic top lists.</p>
        </article>
        <article className="intro-card">
          <p className="auth-title">Steam Integration</p>
          <p className="auth-note">Bind Steam, sync your library, and view friends presence to support social-first recommendations.</p>
        </article>
        <article className="intro-card">
          <p className="auth-title">Actionable Results</p>
          <p className="auth-note">Shuffle, accept, reject, and build a Play Next Queue for quick decision-making during real play sessions.</p>
        </article>
      </div>

      <section id="how-it-works" className="intro-flow">
        <div className="intro-flow-header">
          <p className="eyebrow">How It Works</p>
          <h2>Three steps from check-in to a better pick</h2>
          <p className="subtitle">Built for real moments when you only have limited time and don’t want to scroll your entire library.</p>
        </div>

        <div className="intro-steps">
          <article className="intro-step-card">
            <span className="intro-step-index">01</span>
            <h3>Check In</h3>
            <p>Set your time window, energy, goal, device, and whether friends are online.</p>
          </article>
          <article className="intro-step-card">
            <span className="intro-step-index">02</span>
            <h3>Sync Steam</h3>
            <p>Bind SteamID64 and sync your library so recommendations reflect games you actually own and play.</p>
          </article>
          <article className="intro-step-card">
            <span className="intro-step-index">03</span>
            <h3>Act Fast</h3>
            <p>Review the top pick, compare alternatives, and queue your next game with one click.</p>
          </article>
        </div>

        <div className="intro-bottom-cta">
          <button type="button" className="cta cta-small" onClick={onStartLogin}>
            Start with Login
          </button>
          <button type="button" className="chip intro-secondary-btn" onClick={onStartRegister}>
            Create Account
          </button>
        </div>
      </section>
    </div>
  )
}

export default IntroPage
