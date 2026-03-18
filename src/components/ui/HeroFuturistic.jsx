import { ChevronDown } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'

const HeroFuturisticCanvas = lazy(() => import('./HeroFuturisticCanvas'))

function HeroText({ onStartLogin, onStartRegister, onExploreMore }) {
  const titleWords = ['GAMEFLOW', 'STUDIO']
  const subtitle = 'WHAT SHOULD YOU PLAY RIGHT NOW?'
  const supporting = 'Game picks that fit your time, mood, and Steam library.'

  const [visibleWords, setVisibleWords] = useState(0)
  const [subtitleVisible, setSubtitleVisible] = useState(false)
  const [supportVisible, setSupportVisible] = useState(false)

  useEffect(() => {
    if (visibleWords < titleWords.length) {
      const timer = setTimeout(() => setVisibleWords((v) => v + 1), 720)
      return () => clearTimeout(timer)
    }

    const subtitleTimer = setTimeout(() => setSubtitleVisible(true), 420)
    const supportTimer = setTimeout(() => setSupportVisible(true), 860)
    return () => {
      clearTimeout(subtitleTimer)
      clearTimeout(supportTimer)
    }
  }, [visibleWords, titleWords.length])

  const handleExplore = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (typeof onExploreMore === 'function') onExploreMore()
  }

  return (
    <div className="hero-fg hero-fg-center">
      <h1 className="hero-title hero-title-main hero-title-row">
        {titleWords.map((word, index) => (
          <span
            key={word}
            className={index < visibleWords ? 'hero-word visible' : 'hero-word'}
            style={{ transitionDelay: `${index * 0.28}s` }}
          >
            <span className={word === 'STUDIO' ? 'hero-title-secondary' : 'hero-title-primary'}>{word}</span>
          </span>
        ))}
      </h1>

      <p className={subtitleVisible ? 'hero-subtitle hero-subtitle-main visible' : 'hero-subtitle hero-subtitle-main'}>
        {subtitle}
      </p>

      <p className={supportVisible ? 'hero-subtitle hero-subtitle-secondary visible' : 'hero-subtitle hero-subtitle-secondary'}>
        {supporting}
      </p>

      <div className="hero-line" aria-hidden="true" />

      <div className="hero-bottom-cta">
        {onExploreMore ? (
          <button
            type="button"
            className="hero-explore-btn"
            onClick={handleExplore}
            onPointerDown={handleExplore}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') handleExplore(event)
            }}
          >
            Explore More <ChevronDown size={17} />
          </button>
        ) : (
          <>
            <button type="button" className="cta cta-small" onClick={onStartLogin}>
              Login
            </button>
            <button type="button" className="chip intro-secondary-btn" onClick={onStartRegister}>
              Create Account
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function HeroFuturistic({ onStartLogin, onStartRegister, onExploreMore }) {
  const [showCanvas, setShowCanvas] = useState(false)

  useEffect(() => {
    const rafId = requestAnimationFrame(() => setShowCanvas(true))
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <section className="hero-futuristic" aria-label="Introduction hero">
      <div className="hero-canvas-wrap">
        {showCanvas ? (
          <Suspense fallback={<div className="hero-canvas-fallback" aria-hidden="true" />}>
            <HeroFuturisticCanvas />
          </Suspense>
        ) : (
          <div className="hero-canvas-fallback" aria-hidden="true" />
        )}
      </div>
      <HeroText onStartLogin={onStartLogin} onStartRegister={onStartRegister} onExploreMore={onExploreMore} />
    </section>
  )
}

export default HeroFuturistic
