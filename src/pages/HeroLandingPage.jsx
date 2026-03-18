import HeroFuturistic from '../components/ui/HeroFuturistic'

function HeroLandingPage({ onExploreMore }) {
  return (
    <div className="intro-page">
      <HeroFuturistic onExploreMore={onExploreMore} />
    </div>
  )
}

export default HeroLandingPage
