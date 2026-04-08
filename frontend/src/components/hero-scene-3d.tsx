'use client';

import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ═══════════════════════════════════════════
   Data
   ═══════════════════════════════════════════ */

type BT = 'o' | 't' | 'g';
interface BD { x: number; z: number; w: number; d: number; h: number; t: BT }

const B: BD[] = [
  // Back row
  { x: -3.2, z: -2.5, w: 0.7, d: 0.7, h: 1.5, t: 'g' },
  { x: -2.0, z: -2.8, w: 0.8, d: 0.7, h: 2.8, t: 'o' },
  { x: -0.5, z: -2.6, w: 1.0, d: 0.8, h: 3.8, t: 't' },
  { x:  0.9, z: -2.5, w: 1.1, d: 0.9, h: 4.8, t: 'o' },
  { x:  2.4, z: -2.3, w: 0.8, d: 0.7, h: 3.0, t: 'g' },
  { x:  3.5, z: -2.6, w: 0.7, d: 0.6, h: 1.9, t: 't' },
  { x: -2.8, z: -3.5, w: 0.6, d: 0.6, h: 1.2, t: 'o' },
  // Front row
  { x: -3.0, z: -0.6, w: 0.7, d: 0.7, h: 2.1, t: 't' },
  { x: -1.6, z: -0.5, w: 0.9, d: 0.8, h: 3.4, t: 'g' },
  { x: -0.1, z: -0.3, w: 1.2, d: 1.0, h: 5.5, t: 'o' },
  { x:  1.5, z: -0.5, w: 0.9, d: 0.8, h: 4.0, t: 't' },
  { x:  2.8, z: -0.6, w: 0.8, d: 0.7, h: 2.5, t: 'o' },
  { x:  3.8, z: -0.8, w: 0.6, d: 0.6, h: 1.4, t: 'g' },
  { x:  3.2, z: -3.5, w: 0.7, d: 0.7, h: 1.7, t: 't' },
];

const PAL = {
  o: { body: '#2E1A08', win: '#F97316', top: '#4A2A10', glow: '#F97316' },
  t: { body: '#0F2020', win: '#14B8A6', top: '#1A3535', glow: '#14B8A6' },
  g: { body: '#1E2030', win: '#8899BB', top: '#2A3048', glow: '#5566AA' },
};

// Network nodes floating above the city [x, y(up), z]
const NN: [number, number, number][] = [
  [-2.3, 4.5, -3.0], [-0.3, 6.5, -3.2], [1.9, 7.5, -2.8], [3.5, 4.0, -2.7],
  [-2.5, 5.0, -0.8], [0.0, 8.0, -0.5],  [2.3, 6.5, -0.8], [3.8, 3.5, -1.2],
  [-1.3, 5.5, -2.0], [1.0, 7.0, -1.9],  [2.8, 5.0, -1.7],
];

const NE: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6], [3, 7],
  [4, 5], [5, 6], [6, 7], [0, 8], [8, 1], [8, 9], [9, 2],
  [9, 10], [10, 3], [4, 8], [5, 9], [6, 10],
];

// Building top → network node connections
const BN: [number, number][] = [
  [1, 0], [2, 8], [3, 9], [4, 10], [8, 4], [9, 5], [10, 6], [11, 7], [6, 0], [13, 3],
];

/* ═══════════════════════════════════════════
   Procedural window texture
   ═══════════════════════════════════════════ */

function winTex(body: string, win: string, cols: number, rows: number): THREE.CanvasTexture {
  const cw = 16, ch = 20;
  const cvs = document.createElement('canvas');
  cvs.width = cols * cw;
  cvs.height = rows * ch;
  const ctx = cvs.getContext('2d')!;

  ctx.fillStyle = body;
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  const ww = cw * 0.4, wh = ch * 0.45;
  const px = (cw - ww) / 2, py = (ch - wh) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() > 0.15) {
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillStyle = win;
        ctx.fillRect(c * cw + px, r * ch + py, ww, wh);
      }
    }
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(cvs);
}

/* ═══════════════════════════════════════════
   Building
   ═══════════════════════════════════════════ */

function Building({ b }: { b: BD }) {
  const p = PAL[b.t];

  const mats = useMemo(() => {
    const fc = Math.max(2, Math.round(b.w / 0.22));
    const fr = Math.max(3, Math.round(b.h / 0.4));
    const sc = Math.max(1, Math.round(b.d / 0.22));

    const ft = winTex(p.body, p.win, fc, fr);
    const st = winTex(p.body, p.win, sc, fr);

    const mk = (tex: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: new THREE.Color(p.glow),
        emissiveIntensity: 1.2,
      });

    const top = new THREE.MeshStandardMaterial({
      color: p.top,
      emissive: new THREE.Color(p.glow),
      emissiveIntensity: 0.15,
    });
    const dark = new THREE.MeshStandardMaterial({ color: '#0A0A0A' });

    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    return [mk(st), dark, top, dark, mk(ft), dark];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <mesh position={[b.x + b.w / 2, b.h / 2, b.z + b.d / 2]} material={mats}>
      <boxGeometry args={[b.w, b.h, b.d]} />
    </mesh>
  );
}

/* ═══════════════════════════════════════════
   Mars terrain (thicker with edge glow)
   ═══════════════════════════════════════════ */

function Terrain() {
  const mats = useMemo(() => {
    const m = (c: string, e?: string, ei?: number) =>
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.9,
        ...(e ? { emissive: new THREE.Color(e), emissiveIntensity: ei ?? 0.03 } : {}),
      });
    // +x, -x, +y, -y, +z, -z
    return [
      m('#2A1608', '#F97316', 0.06), // right cliff
      m('#3A2210', '#F97316', 0.04), // left cliff
      m('#5C3A1E', '#F97316', 0.05), // top surface - subtle warm glow
      m('#0E0804'),                   // bottom
      m('#3A2210', '#F97316', 0.05), // front cliff
      m('#2A1608', '#F97316', 0.04), // back cliff
    ];
  }, []);

  // Edge glow lines around terrain top perimeter
  const edgeGeo = useMemo(() => {
    const hw = 4.5, hd = 2.5;
    const cx = 0.3, cz = -1.5, cy = 0.01;
    const p = [
      cx - hw, cy, cz - hd,  cx + hw, cy, cz - hd,
      cx + hw, cy, cz - hd,  cx + hw, cy, cz + hd,
      cx + hw, cy, cz + hd,  cx - hw, cy, cz + hd,
      cx - hw, cy, cz + hd,  cx - hw, cy, cz - hd,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, []);

  return (
    <group>
      <mesh position={[0.3, -0.5, -1.5]} material={mats}>
        <boxGeometry args={[9, 1.0, 5]} />
      </mesh>
      {/* Terrain edge glow */}
      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial color="#F97316" transparent opacity={0.35} />
      </lineSegments>
    </group>
  );
}

/* ═══════════════════════════════════════════
   Network wireframe (brighter + bigger nodes)
   ═══════════════════════════════════════════ */

function NetworkWire() {
  const { edgeGeo, b2nGeo } = useMemo(() => {
    const orange = new THREE.Color('#F97316');
    const teal = new THREE.Color('#14B8A6');

    // Network edges
    const ep: number[] = [], ec: number[] = [];
    NE.forEach(([a, b], i) => {
      const c = i % 2 === 0 ? orange : teal;
      ep.push(...NN[a], ...NN[b]);
      ec.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
    eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));

    // Building-to-network connections
    const bp: number[] = [], bc: number[] = [];
    BN.forEach(([bi, ni], i) => {
      const bd = B[bi];
      const c = i % 2 === 0 ? orange : teal;
      bp.push(bd.x + bd.w / 2, bd.h, bd.z + bd.d / 2, ...NN[ni]);
      bc.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));

    return { edgeGeo: eg, b2nGeo: bg };
  }, []);

  // Pulsing network nodes
  const nodesRef = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    nodesRef.current.forEach((m, i) => {
      if (m) m.scale.setScalar(0.85 + Math.sin(t * 2 + i * 0.7) * 0.25);
    });
  });

  return (
    <group>
      {/* Network edges - more visible */}
      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial vertexColors transparent opacity={0.7} />
      </lineSegments>
      {/* Building-to-network connections */}
      <lineSegments geometry={b2nGeo}>
        <lineBasicMaterial vertexColors transparent opacity={0.35} />
      </lineSegments>
      {/* Network node spheres - larger, more glow */}
      {NN.map((pos, i) => (
        <mesh
          key={i}
          position={pos}
          ref={(el) => { nodesRef.current[i] = el; }}
        >
          <sphereGeometry args={[i % 3 === 0 ? 0.18 : 0.12, 16, 16]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? '#F97316' : '#14B8A6'}
            emissive={i % 2 === 0 ? '#F97316' : '#14B8A6'}
            emissiveIntensity={4.0}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════
   Antenna beacons on tallest buildings
   ═══════════════════════════════════════════ */

function Beacons() {
  const tall = [3, 8, 9, 10];
  const refs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((m, i) => {
      if (m) {
        (m.material as THREE.MeshStandardMaterial).emissiveIntensity =
          3 + Math.sin(t * 3 + i * 1.5) * 2;
      }
    });
  });

  return (
    <group>
      {tall.map((bi, i) => {
        const bd = B[bi];
        const cx = bd.x + bd.w / 2, cz = bd.z + bd.d / 2;
        const ah = 0.4 + i * 0.08;
        const color = bd.t === 'o' ? '#F97316' : '#14B8A6';
        return (
          <group key={bi} position={[cx, bd.h, cz]}>
            <mesh position={[0, ah / 2, 0]}>
              <cylinderGeometry args={[0.015, 0.015, ah, 4]} />
              <meshStandardMaterial color="#6B7280" />
            </mesh>
            <mesh
              position={[0, ah + 0.04, 0]}
              ref={(el) => { refs.current[i] = el; }}
            >
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ═══════════════════════════════════════════
   Isometric ground grid (extends far, visible)
   ═══════════════════════════════════════════ */

function FloorGrid() {
  const { geoOrange, geoTeal } = useMemo(() => {
    const po: number[] = [];
    const pt: number[] = [];
    const size = 12;
    const step = 1.0;
    // X-aligned lines
    for (let i = -size; i <= size; i += step) {
      po.push(i, -0.01, -size, i, -0.01, size);
    }
    // Z-aligned lines
    for (let i = -size; i <= size; i += step) {
      pt.push(-size, -0.01, i, size, -0.01, i);
    }
    const go = new THREE.BufferGeometry();
    go.setAttribute('position', new THREE.Float32BufferAttribute(po, 3));
    const gt = new THREE.BufferGeometry();
    gt.setAttribute('position', new THREE.Float32BufferAttribute(pt, 3));
    return { geoOrange: go, geoTeal: gt };
  }, []);

  return (
    <group>
      <lineSegments geometry={geoOrange}>
        <lineBasicMaterial color="#F97316" transparent opacity={0.08} />
      </lineSegments>
      <lineSegments geometry={geoTeal}>
        <lineBasicMaterial color="#14B8A6" transparent opacity={0.06} />
      </lineSegments>
    </group>
  );
}

/* ═══════════════════════════════════════════
   Floating particles (more, varied color)
   ═══════════════════════════════════════════ */

function Particles() {
  const { geoO, geoT } = useMemo(() => {
    const count = 40;
    const posO = new Float32Array(count * 3);
    const posT = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      posO[i * 3] = (Math.random() - 0.5) * 16;
      posO[i * 3 + 1] = Math.random() * 12;
      posO[i * 3 + 2] = (Math.random() - 0.5) * 12;
      posT[i * 3] = (Math.random() - 0.5) * 16;
      posT[i * 3 + 1] = Math.random() * 12;
      posT[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    const go = new THREE.BufferGeometry();
    go.setAttribute('position', new THREE.Float32BufferAttribute(posO, 3));
    const gt = new THREE.BufferGeometry();
    gt.setAttribute('position', new THREE.Float32BufferAttribute(posT, 3));
    return { geoO: go, geoT: gt };
  }, []);

  return (
    <group>
      <points geometry={geoO}>
        <pointsMaterial color="#F97316" size={0.06} transparent opacity={0.5} sizeAttenuation />
      </points>
      <points geometry={geoT}>
        <pointsMaterial color="#14B8A6" size={0.05} transparent opacity={0.4} sizeAttenuation />
      </points>
    </group>
  );
}

/* ═══════════════════════════════════════════
   Data streams rising from buildings
   ═══════════════════════════════════════════ */

function DataStreams() {
  const count = 30;
  const tallIdx = [3, 8, 9, 10, 1, 2];
  const ref = useRef<THREE.Points>(null);

  const { geo, speeds, origins } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    const org = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const bi = tallIdx[i % tallIdx.length];
      const bd = B[bi];
      const cx = bd.x + bd.w / 2 + (Math.random() - 0.5) * 0.2;
      const cz = bd.z + bd.d / 2 + (Math.random() - 0.5) * 0.2;
      pos[i * 3] = cx;
      pos[i * 3 + 1] = bd.h + Math.random() * 3;
      pos[i * 3 + 2] = cz;
      spd[i] = 0.3 + Math.random() * 0.5;
      org[i] = bd.h;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return { geo: g, speeds: spd, origins: org };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    if (!ref.current) return;
    const arr = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * 0.015;
      if (arr[i * 3 + 1] > origins[i] + 4) {
        arr[i * 3 + 1] = origins[i];
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#14B8A6" size={0.05} transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

/* ═══════════════════════════════════════════
   Scene (rotation + mouse follow)
   ═══════════════════════════════════════════ */

function Scene() {
  const group = useRef<THREE.Group>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();

    // Smooth mouse follow
    mouse.current.x += (state.pointer.x * 0.06 - mouse.current.x) * 0.03;
    mouse.current.y += (state.pointer.y * 0.04 - mouse.current.y) * 0.03;

    // Gentle oscillation + mouse
    group.current.rotation.y = Math.sin(t * 0.12) * 0.1 + mouse.current.x;
    group.current.rotation.x = mouse.current.y * 0.5;

    // Subtle breathing
    group.current.position.y = Math.sin(t * 0.25) * 0.08;
  });

  return (
    <group ref={group}>
      <FloorGrid />
      <Terrain />
      {B.map((b, i) => (
        <Building key={i} b={b} />
      ))}
      <NetworkWire />
      <Beacons />
      <Particles />
      <DataStreams />
    </group>
  );
}

/* ═══════════════════════════════════════════
   Main export
   ═══════════════════════════════════════════ */

export default function HeroScene3D() {
  return (
    <div className="relative w-full max-w-[580px] aspect-[16/10]">
      {/* Background glows (behind transparent canvas) */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-primary-500/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-accent-500/8 rounded-full blur-[80px]" />

      <Canvas
        camera={{ position: [9, 7, 7], fov: 32 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        onCreated={({ camera }) => camera.lookAt(0.3, 2.5, -1.5)}
        style={{ position: 'relative', zIndex: 10 }}
      >
        <ambientLight intensity={0.08} />
        <directionalLight position={[5, 10, 5]} intensity={0.3} color="#FFF0DD" />
        <pointLight position={[0, 6, -1]} intensity={0.15} color="#F97316" distance={12} />
        <Suspense fallback={null}>
          <Scene />
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.12}
              intensity={2.0}
              luminanceSmoothing={0.3}
              mipmapBlur
            />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
