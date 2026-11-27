import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export function mountLandingScene(canvas) {
  const container = canvas.parentElement;
  if (!container) return;
  const authScene = canvas.id === 'auth-security-scene';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    canvas.remove();
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.set(0, 0.1, 8.6);
  camera.lookAt(0, 0, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xa2b4a9, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
  keyLight.position.set(-3, 5, 7);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x9b91ee, 1.1);
  fillLight.position.set(5, 1, 4);
  scene.add(fillLight);

  const composition = new THREE.Group();
  scene.add(composition);
  const material = (color, roughness = 0.58, metalness = 0.02) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const navy = material('#17263a', 0.38, 0.12);
  const screen = material('#f7faf7');
  const screenLine = material('#d9e3dd');
  const teal = material('#19b8a5', 0.38);
  const lavender = material('#a99af7', 0.36, 0.08);
  const pale = material('#dfe9e2');
  const platformMaterial = material(authScene ? '#26364a' : '#ccd8d0');

  const platform = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.16, 2.8), platformMaterial);
  platform.position.set(0, -1.76, -0.32);
  platform.visible = !authScene;
  composition.add(platform);

  const handset = new THREE.Group();
  handset.position.set(-1.45, 0.05, 0.15);
  handset.rotation.z = -0.065;
  handset.rotation.y = -0.1;
  composition.add(handset);
  const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(1.48, 2.95, 0.17), navy);
  handset.add(phoneBody);
  const phoneScreen = new THREE.Mesh(new THREE.BoxGeometry(1.34, 2.74, 0.025), screen);
  phoneScreen.position.z = 0.1;
  handset.add(phoneScreen);
  const speaker = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.035, 0.018), navy);
  speaker.position.set(0, 1.28, 0.12);
  handset.add(speaker);

  const messagePanel = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.7, 0.025), pale);
  messagePanel.position.set(0.08, 0.28, 0.13);
  handset.add(messagePanel);
  const linkPanel = new THREE.Mesh(new THREE.BoxGeometry(0.83, 0.13, 0.03), lavender);
  linkPanel.position.set(0.08, -0.12, 0.15);
  handset.add(linkPanel);
  const alertPanel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 0.03), material('#eaf4ef'));
  alertPanel.position.set(0.02, -0.72, 0.15);
  handset.add(alertPanel);
  const scanBar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.23, 0.03), material('#d7eee7'));
  scanBar.position.set(0.02, -1.08, 0.15);
  handset.add(scanBar);

  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(0, 0.93);
  shieldShape.lineTo(0.75, 0.68);
  shieldShape.lineTo(0.66, -0.18);
  shieldShape.quadraticCurveTo(0.52, -0.62, 0, -0.96);
  shieldShape.quadraticCurveTo(-0.52, -0.62, -0.66, -0.18);
  shieldShape.lineTo(-0.75, 0.68);
  shieldShape.closePath();
  const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(shieldShape, { depth: 0.19, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.045, bevelThickness: 0.045 }), lavender);
  shield.position.set(1.52, 0.03, 0.44);
  shield.rotation.y = -0.18;
  composition.add(shield);

  const checkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.18, 0.02, 0.7),
    new THREE.Vector3(1.4, -0.2, 0.76),
    new THREE.Vector3(1.82, 0.33, 0.76),
  ]);
  const check = new THREE.Mesh(new THREE.TubeGeometry(checkCurve, 24, 0.055, 8, false), material('#ffffff', 0.3));
  composition.add(check);

  const orbitCurve = new THREE.EllipseCurve(0, 0.05, 2.68, 1.28, 0, Math.PI * 2, false, -0.42);
  const orbitPoints = orbitCurve.getPoints(120).map((point) => new THREE.Vector3(point.x, point.y, -0.1));
  const orbit = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(orbitPoints, true), 120, 0.018, 6, true), teal);
  orbit.rotation.z = -0.1;
  composition.add(orbit);

  const tileOne = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.48, 0.16), material('#ffffff'));
  tileOne.position.set(2.45, 1.15, 0.1);
  tileOne.rotation.z = 0.14;
  composition.add(tileOne);
  const tileTwo = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.15), material('#e6f4ef'));
  tileTwo.position.set(-2.45, -0.92, 0.15);
  tileTwo.rotation.z = -0.16;
  composition.add(tileTwo);
  const statusDot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), teal);
  statusDot.position.set(2.45, 1.15, 0.22);
  composition.add(statusDot);

  if (authScene) {
    composition.scale.setScalar(0.58);
    composition.position.y = -0.72;
  }

  const resize = () => {
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.position.z = bounds.width < 520 ? 9.6 : bounds.width < 760 ? 9.1 : 8.6;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  const animate = (time) => {
    if (!canvas.isConnected) {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      return;
    }
    const seconds = time * 0.001;
    camera.position.x = Math.sin(seconds * 0.22) * 0.22;
    camera.position.y = 0.1 + Math.cos(seconds * 0.18) * 0.07;
    camera.lookAt(0, 0, 0);
    composition.rotation.y = Math.sin(seconds * 0.2) * 0.045;
    composition.rotation.x = Math.cos(seconds * 0.16) * 0.018;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  };
  if (!reducedMotion.matches) frame = requestAnimationFrame(animate);
}