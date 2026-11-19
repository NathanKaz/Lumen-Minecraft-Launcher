import { useEffect, useRef } from 'react'
import { t } from '../lib/i18n'
import type { SkinModel } from '@shared/types'

type Vec3 = [number, number, number]
type UV = [number, number, number, number]
type FaceName = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom'

interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
  uv: Record<FaceName, UV>
}

interface Face {
  corners: [Vec3, Vec3, Vec3, Vec3]
  uv: UV
  normal: Vec3
}

const HEAD_UV: Record<FaceName, UV> = {
  top: [8, 0, 8, 8],
  bottom: [16, 0, 8, 8],
  right: [0, 8, 8, 8],
  front: [8, 8, 8, 8],
  left: [16, 8, 8, 8],
  back: [24, 8, 8, 8]
}

const BODY_UV: Record<FaceName, UV> = {
  top: [20, 16, 8, 4],
  bottom: [24, 16, 8, 4],
  right: [16, 20, 4, 12],
  front: [20, 20, 8, 12],
  left: [36, 20, 4, 12],
  back: [32, 20, 8, 12]
}

const RIGHT_ARM_UV: Record<FaceName, UV> = {
  top: [44, 16, 4, 4],
  bottom: [48, 16, 4, 4],
  right: [40, 20, 4, 12],
  front: [44, 20, 4, 12],
  left: [48, 20, 4, 12],
  back: [52, 20, 4, 12]
}

const LEFT_ARM_UV: Record<FaceName, UV> = {
  top: [36, 48, 4, 4],
  bottom: [40, 48, 4, 4],
  right: [52, 48, 4, 12],
  front: [36, 52, 4, 12],
  left: [44, 52, 4, 12],
  back: [48, 52, 4, 12]
}

const RIGHT_LEG_UV: Record<FaceName, UV> = {
  top: [4, 16, 4, 4],
  bottom: [8, 16, 4, 4],
  right: [0, 20, 4, 12],
  front: [4, 20, 4, 12],
  left: [8, 20, 4, 12],
  back: [12, 20, 4, 12]
}

const LEFT_LEG_UV: Record<FaceName, UV> = {
  top: [20, 48, 4, 4],
  bottom: [24, 48, 4, 4],
  right: [16, 52, 4, 12],
  front: [20, 52, 4, 12],
  left: [24, 52, 4, 12],
  back: [28, 52, 4, 12]
}

function narrowUV(uv: Record<FaceName, UV>): Record<FaceName, UV> {
  const result = {} as Record<FaceName, UV>
  for (const [face, rect] of Object.entries(uv) as Array<[FaceName, UV]>) {
    result[face] = rect[2] === 4 ? [rect[0], rect[1], 3, rect[3]] : rect
  }
  return result
}

function buildBoxes(model: SkinModel): Box[] {
  const armWidth = model === 'slim' ? 3 : 4
  return [
    { x0: -4, x1: 4, y0: 8, y1: 16, z0: -4, z1: 4, uv: HEAD_UV },
    { x0: -4, x1: 4, y0: -4, y1: 8, z0: -2, z1: 2, uv: BODY_UV },
    { x0: -4 - armWidth, x1: -4, y0: -4, y1: 8, z0: -2, z1: 2, uv: model === 'slim' ? narrowUV(RIGHT_ARM_UV) : RIGHT_ARM_UV },
    { x0: 4, x1: 4 + armWidth, y0: -4, y1: 8, z0: -2, z1: 2, uv: model === 'slim' ? narrowUV(LEFT_ARM_UV) : LEFT_ARM_UV },
    { x0: -4, x1: 0, y0: -16, y1: -4, z0: -2, z1: 2, uv: RIGHT_LEG_UV },
    { x0: 0, x1: 4, y0: -16, y1: -4, z0: -2, z1: 2, uv: LEFT_LEG_UV }
  ]
}

function boxFaces(box: Box): Face[] {
  const { x0, x1, y0, y1, z0, z1, uv } = box
  return [
    { corners: [[x0, y1, z1], [x1, y1, z1], [x0, y0, z1], [x1, y0, z1]], uv: uv.front, normal: [0, 0, 1] },
    { corners: [[x1, y1, z0], [x0, y1, z0], [x1, y0, z0], [x0, y0, z0]], uv: uv.back, normal: [0, 0, -1] },
    { corners: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z1], [x1, y0, z0]], uv: uv.right, normal: [1, 0, 0] },
    { corners: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z0], [x0, y0, z1]], uv: uv.left, normal: [-1, 0, 0] },
    { corners: [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]], uv: uv.top, normal: [0, 1, 0] },
    { corners: [[x0, y0, z1], [x1, y0, z1], [x0, y0, z0], [x1, y0, z0]], uv: uv.bottom, normal: [0, -1, 0] }
  ]
}

function rotate(point: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const x = point[0] * cy + point[2] * sy
  const z = -point[0] * sy + point[2] * cy
  return [x, point[1] * cp - z * sp, point[1] * sp + z * cp]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Lightweight, dependency-free Minecraft skin renderer. It samples the skin
 * atlas on a 2D canvas and projects textured boxes with manual rotation and
 * depth sorting, so it also works in the browser demo build.
 */
export function Skin3DPreview({ dataUrl, model, className = '' }: {
  dataUrl: string
  model: SkinModel
  className?: string
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textureRef = useRef<HTMLCanvasElement | null>(null)
  const yawRef = useRef(0.6)
  const pitchRef = useRef(0.12)
  const draggingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!dataUrl) return
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#8b8b8b'
      ctx.fillRect(0, 0, 64, 64)
      ctx.drawImage(image, 0, 0, image.naturalWidth || 64, image.naturalHeight || 64, 0, 0, 64, 64)
      textureRef.current = canvas
    }
    image.src = dataUrl
    return () => {
      cancelled = true
      image.onload = null
    }
  }, [dataUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    const boxes = buildBoxes(model)
    const light: Vec3 = [-0.35, 0.75, 0.55]
    const lightLength = Math.hypot(...light) || 1

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const texture = textureRef.current
      resize()
      const dpr = canvas.width / Math.max(1, canvas.clientWidth)
      const cssWidth = canvas.width / dpr
      const cssHeight = canvas.height / dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false

      // Soft ground shadow.
      const shadow = ctx.createRadialGradient(cssWidth / 2, cssHeight * 0.9, 2, cssWidth / 2, cssHeight * 0.9, cssWidth * 0.22)
      shadow.addColorStop(0, 'rgba(0,0,0,0.45)')
      shadow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shadow
      ctx.beginPath()
      ctx.ellipse(cssWidth / 2, cssHeight * 0.9, cssWidth * 0.22, 10, 0, 0, Math.PI * 2)
      ctx.fill()

      if (!texture) return
      if (!draggingRef.current) yawRef.current += 0.004

      const zoom = Math.min(cssWidth / 22, cssHeight / 38) * 1.05
      const centerX = cssWidth / 2
      const centerY = cssHeight * 0.52
      const project = (point: Vec3): { x: number; y: number; z: number } => {
        const [x, y, z] = rotate(point, yawRef.current, pitchRef.current)
        const perspective = Math.max(0.75, Math.min(1.25, 1 + z * 0.007))
        return { x: centerX + x * zoom * perspective, y: centerY - y * zoom * perspective, z }
      }

      const faces = boxes.flatMap(boxFaces).map((face) => ({
        ...face,
        screen: face.corners.map(project) as Array<ReturnType<typeof project>>,
        depth: face.corners.reduce((sum, corner) => sum + project(corner).z, 0) / 4
      })).sort((a, b) => a.depth - b.depth)

      for (const face of faces) {
        const [tl, tr, bl] = face.screen
        const [u, v, width, height] = face.uv
        const normal = rotate(face.normal, yawRef.current, pitchRef.current)
        const brightness = 0.7 + 0.35 * Math.max(0, dot(normal, light) / lightLength)
        const alpha = brightness < 1 ? (1 - brightness) * 0.85 : 0

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(tl.x, tl.y)
        ctx.lineTo(tr.x, tr.y)
        ctx.lineTo(face.screen[3].x, face.screen[3].y)
        ctx.lineTo(bl.x, bl.y)
        ctx.closePath()
        ctx.clip()
        ctx.transform(
          (tr.x - tl.x) / width,
          (tr.y - tl.y) / width,
          (bl.x - tl.x) / height,
          (bl.y - tl.y) / height,
          tl.x,
          tl.y
        )
        ctx.drawImage(texture, u, v, width, height, 0, 0, width, height)
        ctx.restore()

        if (alpha > 0.01) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(tl.x, tl.y)
          ctx.lineTo(tr.x, tr.y)
          ctx.lineTo(face.screen[3].x, face.screen[3].y)
          ctx.lineTo(bl.x, bl.y)
          ctx.closePath()
          ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`
          ctx.fill()
          ctx.restore()
        }
      }
    }
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [model])

  return (
    <div className={`relative ${className}`} title={t('Перетащите, чтобы повернуть')}>
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          draggingRef.current = true
          lastRef.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return
          yawRef.current += (event.clientX - lastRef.current.x) * 0.012
          pitchRef.current = Math.max(-0.55, Math.min(0.55, pitchRef.current - (event.clientY - lastRef.current.y) * 0.008))
          lastRef.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={(event) => {
          draggingRef.current = false
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => { draggingRef.current = false }}
      />
    </div>
  )
}
