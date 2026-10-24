/**
 * Sky around the scene: a gradient dome that follows the camera, the sun (day) or the moon and stars (night), each
 * with a soft glow, placed in the direction of the scene's directional light.
 */
import * as THREE from 'three';

export interface Sky {
  group: THREE.Group;
  setNight: (night: boolean) => void;
  /** Direction from the scene towards the sun or moon. */
  setDirection: (d: THREE.Vector3) => void;
  dispose: () => void;
}

const R = 1500;

function glowTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, outer);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSky(): Sky {
  const group = new THREE.Group();
  const uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, below: { value: new THREE.Color() } };
  const domeMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; uniform vec3 below; varying vec3 vDir;' +
      'void main() {\n float h = vDir.z; vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, below, clamp(-h * 4.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0);\n' +
      '#include <colorspace_fragment>\n' +
      '}'
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), domeMat);
  dome.renderOrder = -10;
  group.add(dome);

  // sun and moon: discs with glows, a fixed distance in the light direction
  const sunTex = glowTexture('rgba(255,250,225,1)', 'rgba(255,236,170,0.35)');
  const moonTex = glowTexture('rgba(235,240,255,0.9)', 'rgba(170,190,255,0.12)');
  const sun = new THREE.Group();
  sun.add(new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshBasicMaterial({ color: '#fff6dc', depthWrite: false, fog: false })));
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, depthWrite: false, transparent: true, fog: false }));
  sunGlow.scale.set(260, 260, 1);
  sun.add(sunGlow);
  const moon = new THREE.Group();
  moon.add(new THREE.Mesh(new THREE.CircleGeometry(20, 48), new THREE.MeshBasicMaterial({ color: '#e9eef8', depthWrite: false, fog: false })));
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, depthWrite: false, transparent: true, fog: false }));
  moonGlow.scale.set(170, 170, 1);
  moon.add(moonGlow);
  group.add(sun, moon);

  // stars on the upper sky, slightly varied in brightness
  const n = 1400;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let seed = 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const z = 0.08 + rnd() * 0.92, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([Math.cos(a) * r * (R - 20), Math.sin(a) * r * (R - 20), z * (R - 20)], i * 3);
    const b = 0.45 + rnd() * 0.55;
    col.set([b, b, Math.min(1, b * 1.08)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
  group.add(stars);

  const place = (o: THREE.Object3D, d: THREE.Vector3) => {
    o.position.copy(d.clone().normalize().multiplyScalar(R * 0.8));
    o.lookAt(0, 0, 0);
  };
  let dir = new THREE.Vector3(-0.4, -0.6, 0.7);
  const setDirection = (d: THREE.Vector3) => {
    dir = d.clone();
    place(sun, dir);
    place(moon, new THREE.Vector3(dir.x, dir.y, dir.z * 1.25)); // the moon a little higher
  };
  setDirection(dir);
  const setNight = (night: boolean) => {
    uniforms.top.value.set(night ? '#060b18' : '#9fd0f3');
    uniforms.horizon.value.set(night ? '#1a2740' : '#e3f1fb');
    uniforms.below.value.set(night ? '#101722' : '#dfe9ee');
    sun.visible = !night;
    moon.visible = night;
    stars.visible = night;
  };
  setNight(false);
  return {
    group,
    setNight,
    setDirection,
    dispose: () => {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose();
      });
      sunTex.dispose();
      moonTex.dispose();
    }
  };
}
