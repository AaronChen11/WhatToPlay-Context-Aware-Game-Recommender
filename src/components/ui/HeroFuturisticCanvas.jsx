import { Canvas, extend, useFrame } from '@react-three/fiber'
import { useAspect, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'

import {
  abs,
  blendScreen,
  float,
  mod,
  mx_cell_noise_float,
  oneMinus,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl'

const TEXTUREMAP = { src: 'https://i.postimg.cc/XYwvXN8D/img-4.png' }
const DEPTHMAP = { src: 'https://i.postimg.cc/2SHKQh2q/raw-4.webp' }

extend(THREE)

const WIDTH = 300
const HEIGHT = 300

function Scene() {
  const [rawMap, depthMap] = useTexture([TEXTUREMAP.src, DEPTHMAP.src])

  const meshRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (rawMap && depthMap) {
      setVisible(true)
    }
  }, [rawMap, depthMap])

  const { material, uniforms } = useMemo(() => {
    const uPointer = uniform(new THREE.Vector2(0))
    const uProgress = uniform(0)

    const strength = 0.01

    const tDepthMap = texture(depthMap)

    const tMap = texture(rawMap, uv().add(tDepthMap.r.mul(uPointer).mul(strength)))

    const aspect = float(WIDTH).div(HEIGHT)
    const tUv = vec2(uv().x.mul(aspect), uv().y)

    const tiling = vec2(120.0)
    const tiledUv = mod(tUv.mul(tiling), 2.0).sub(1.0)

    const brightness = mx_cell_noise_float(tUv.mul(tiling).div(2))

    const dist = float(tiledUv.length())
    const dot = float(smoothstep(0.5, 0.49, dist)).mul(brightness)

    const depth = tDepthMap

    const flow = oneMinus(smoothstep(0, 0.02, abs(depth.sub(uProgress))))

    const mask = dot.mul(flow).mul(vec3(0.5, 7.2, 10))

    const final = blendScreen(tMap, mask)

    const mat = new THREE.MeshBasicNodeMaterial({
      colorNode: final,
      transparent: true,
      opacity: 0,
    })

    return {
      material: mat,
      uniforms: {
        uPointer,
        uProgress,
      },
    }
  }, [rawMap, depthMap])

  const [w, h] = useAspect(WIDTH, HEIGHT)

  useFrame(({ clock }) => {
    uniforms.uProgress.value = Math.sin(clock.getElapsedTime() * 0.5) * 0.5 + 0.5

    if (meshRef.current && meshRef.current.material) {
      const mat = meshRef.current.material
      if (typeof mat.opacity === 'number') {
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, visible ? 1 : 0, 0.07)
      }
    }
  })

  useFrame(({ pointer }) => {
    uniforms.uPointer.value = pointer
  })

  const scaleFactor = 0.4
  return (
    <mesh ref={meshRef} scale={[w * scaleFactor, h * scaleFactor, 1]} material={material}>
      <planeGeometry />
    </mesh>
  )
}

function HeroFuturisticCanvas() {
  return (
    <Canvas
      flat
      frameloop="always"
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer({ ...props, alpha: true })
        await renderer.init()
        renderer.setClearColor(0x000000, 0)
        return renderer
      }}
      camera={{ position: [0, 0, 2.7], fov: 34 }}
    >
      <Scene />
    </Canvas>
  )
}

export default HeroFuturisticCanvas
