import { CUTE_HEIGHT, cuteSourceRow, cuteTorsoWidthFactor, getCutePartPose } from '../lib/minefigure/shared/characterProportions.js'
import type { BoxUV, Skin2DRenderOptions } from './skin2dRenderer'

type Point = [number, number, number]
type Vertex = { point: Point; u: number; v: number }
type Face = { vertices: Vertex[]; uv: BoxUV[keyof BoxUV]; short: boolean; depth: number }

/** Canvas-only orthographic preview using the printable model's proportions and pose. */
export function renderCuteSkin(
    canvas: HTMLCanvasElement,
    texture: HTMLCanvasElement,
    slim: boolean,
    parts: { inner: BoxUV; outer: BoxUV }[],
    options: Skin2DRenderOptions,
) {
    const faces: Face[] = []
    const project = ([x, y, z]: Point): Point => [x - z * 0.5, -y + z * 0.25, x * 0.5 + y * 0.25 + z]
    for (const [index, uv] of parts.entries()) {
        const pose = getCutePartPose(index, slim)
        const width = index < 2 ? 8 : index < 4 && slim ? 3 : 4
        const height = index === 0 ? 8 : CUTE_HEIGHT
        const depth = index === 0 ? 8 : 4
        const cos = Math.cos(pose.rotationZ), sin = Math.sin(pose.rotationZ)
        for (const outer of options.showOverlay ? [false, true] : [false]) {
            const inflation = outer && options.overlayInflated ? 1 : 0
            const w = (width + inflation) / 2, h = (height + inflation) / 2, d = (depth + inflation) / 2
            const point = (x: number, y: number, z: number): Point => {
                x *= pose.scale[0] * (index === 1 ? cuteTorsoWidthFactor((y + h) / (2 * h)) : 1)
                y *= pose.scale[1]
                return project([x * cos - y * sin + pose.position[0], x * sin + y * cos + pose.position[1], z + pose.position[2]])
            }
            const layer = outer ? uv.outer : uv.inner
            const add = (name: keyof BoxUV, corners: Point[], short = false) => {
                const vertices = corners.map((p, i) => ({ point: point(...p), u: i === 1 || i === 2 ? 1 : 0, v: i >= 2 ? 1 : 0 }))
                faces.push({ vertices, uv: layer[name], short, depth: vertices.reduce((sum, v) => sum + v.point[2], 0) / 4 })
            }
            const short = index !== 0
            add('front', [[-w, h, d], [w, h, d], [w, -h, d], [-w, -h, d]], short)
            add('left', [[w, h, d], [w, h, -d], [w, -h, -d], [w, -h, d]], short)
            add('top', [[-w, h, -d], [w, h, -d], [w, h, d], [-w, h, d]])
            // Transparent outer texels may reveal the far side of a hat or sleeve.
            if (outer) {
                add('back', [[w, h, -d], [-w, h, -d], [-w, -h, -d], [w, -h, -d]], short)
                add('right', [[-w, h, -d], [-w, h, d], [-w, -h, d], [-w, -h, -d]], short)
                add('bottom', [[-w, -h, d], [w, -h, d], [w, -h, -d], [-w, -h, -d]])
            }
        }
    }
    const points = faces.flatMap(face => face.vertices.map(vertex => vertex.point))
    const minX = Math.min(...points.map(point => point[0])), minY = Math.min(...points.map(point => point[1]))
    const maxX = Math.max(...points.map(point => point[0])), maxY = Math.max(...points.map(point => point[1]))
    canvas.width = Math.ceil((maxX - minX) * options.scale) + 2
    canvas.height = Math.ceil((maxY - minY) * options.scale) + 2
    const context = canvas.getContext('2d'), sourceContext = texture.getContext('2d')
    if (!context || !sourceContext) throw new Error('Failed to create Cute preview context')
    const source = sourceContext.getImageData(0, 0, texture.width, texture.height).data
    const output = context.createImageData(canvas.width, canvas.height)
    const depths = new Float64Array(canvas.width * canvas.height).fill(-Infinity)
    const owners = new Int32Array(depths.length).fill(-1)
    const textureScale = texture.width / 64

    // Pixel sampling keeps cutout overlays crisp and avoids seams between triangles.
    faces.sort((a, b) => a.depth - b.depth)
    for (const [faceId, face] of faces.entries()) {
        const vertices = face.vertices.map(vertex => ({ ...vertex,
            point: [(vertex.point[0] - minX) * options.scale + 1, (vertex.point[1] - minY) * options.scale + 1, vertex.point[2]] as Point }))
        // Slice the tapered torso into texture rows so its pixels taper horizontally
        // without the diagonal UV distortion of a single pair of large triangles.
        const rows = face.short ? CUTE_HEIGHT : 1
        const lerp = (a: Vertex, b: Vertex, t: number): Vertex => ({
            point: a.point.map((value, i) => value + (b.point[i] - value) * t) as Point,
            u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t,
        })
        for (let row = 0; row < rows; row++) {
            const a = lerp(vertices[0], vertices[3], row / rows), b = lerp(vertices[1], vertices[2], row / rows)
            const c = lerp(vertices[1], vertices[2], (row + 1) / rows), d = lerp(vertices[0], vertices[3], (row + 1) / rows)
            triangle(a, b, c, face, faceId)
            triangle(a, c, d, face, faceId)
        }
    }
    context.putImageData(output, 0, 0)

    function triangle(a: Vertex, b: Vertex, c: Vertex, face: Face, faceId: number) {
        const [ax, ay] = a.point, [bx, by] = b.point, [cx, cy] = c.point
        const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if (Math.abs(determinant) < 1e-8) return
        const left = Math.max(0, Math.floor(Math.min(ax, bx, cx))), right = Math.min(canvas.width - 1, Math.ceil(Math.max(ax, bx, cx)))
        const top = Math.max(0, Math.floor(Math.min(ay, by, cy))), bottom = Math.min(canvas.height - 1, Math.ceil(Math.max(ay, by, cy)))
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            const wa = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / determinant
            const wb = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / determinant
            const wc = 1 - wa - wb
            if (Math.min(wa, wb, wc) < -1e-8) continue
            const pixel = y * canvas.width + x
            const depth = wa * a.point[2] + wb * b.point[2] + wc * c.point[2]
            if (owners[pixel] === faceId || depth < depths[pixel] - 1e-8) continue
            const u = Math.max(0, Math.min(1 - 1e-8, wa * a.u + wb * b.u + wc * c.u))
            const v = Math.max(0, Math.min(1 - 1e-8, wa * a.v + wb * b.v + wc * c.v))
            const row = v * CUTE_HEIGHT
            const sourceY = face.short ? cuteSourceRow(Math.floor(row)) + row % 1 : v * (face.uv.v2 - face.uv.v1)
            const sx = Math.floor((face.uv.u1 + u * (face.uv.u2 - face.uv.u1)) * textureScale)
            const sy = Math.floor((face.uv.v1 + sourceY) * textureScale)
            const from = (sy * texture.width + sx) * 4, to = pixel * 4
            const alpha = source[from + 3] / 255
            if (!alpha) continue
            const behind = output.data[to + 3] / 255 * (1 - alpha)
            const combined = alpha + behind
            for (let channel = 0; channel < 3; channel++) output.data[to + channel] = (source[from + channel] * alpha + output.data[to + channel] * behind) / combined
            output.data[to + 3] = combined * 255
            depths[pixel] = depth
            owners[pixel] = faceId
        }
    }
}
