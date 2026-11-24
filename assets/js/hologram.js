import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/**
 * Color themes for the Holographic AI Projection
 */
const THEMES = {
  cyan: {
    primary: new THREE.Color('#00f0ff'),
    secondary: new THREE.Color('#0066ff'),
    accent: new THREE.Color('#7df9ff'),
    bgGlow: '#041a2b',
  },
  violet: {
    primary: new THREE.Color('#c084fc'),
    secondary: new THREE.Color('#6366f1'),
    accent: new THREE.Color('#f0abfc'),
    bgGlow: '#170a2e',
  },
  emerald: {
    primary: new THREE.Color('#34d399'),
    secondary: new THREE.Color('#059669'),
    accent: new THREE.Color('#a7f3d0'),
    bgGlow: '#04221b',
  },
  gold: {
    primary: new THREE.Color('#fbbf24'),
    secondary: new THREE.Color('#ea580c'),
    accent: new THREE.Color('#fef08a'),
    bgGlow: '#241504',
  },
};

const HOLOGRAM_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uGlitch;
  uniform float uAudio;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    vec3 pos = position;
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);

    // Subtle holographic glitch horizontal slice
    float glitchTime = floor(uTime * 8.0);
    float band = sin(worldPosition.y * 22.0 + uTime * 9.0);
    float glitchChance = step(0.94 - uGlitch * 0.12, hash(glitchTime + floor(worldPosition.y * 6.0)));
    worldPosition.x += glitchChance * band * (0.018 + uAudio * 0.025);

    vec4 mvPosition = viewMatrix * worldPosition;
    vNormal = normalize(normalMatrix * normal);
    vViewPos = -mvPosition.xyz;
    vWorldPos = worldPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const HOLOGRAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uPrimaryColor;
  uniform vec3 uSecondaryColor;
  uniform float uAudio;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPos);
    float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.2);

    // Moving horizontal hologram scanlines
    float fineScan = sin(vWorldPos.y * 95.0 - uTime * 5.5) * 0.5 + 0.5;
    float sweepBand = smoothstep(0.0, 1.0, sin(vWorldPos.y * 4.5 - uTime * 2.2) * 0.5 + 0.5);
    float scanMask = mix(0.65, 1.0, fineScan) + sweepBand * 0.28;

    vec3 baseColor = mix(uSecondaryColor, uPrimaryColor, fresnel * 0.85 + sweepBand * 0.25);
    vec3 finalColor = baseColor * (0.75 + fresnel * 1.45 + uAudio * 0.45) * scanMask;

    float alpha = clamp((0.20 + fresnel * 0.78) * uOpacity * (0.82 + fineScan * 0.18), 0.08, 0.96);
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export class HologramEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'idle'; // idle | listening | thinking | speaking
    this.emotion = 'neutral'; // neutral | happy | thinking | alert
    this.themeName = 'cyan';
    this.theme = THEMES.cyan;
    this.audioLevel = 0;
    this.targetAudioLevel = 0;
    this.viseme = 'aa';
    this.peppersGhost = false;
    this.vrmHologramShader = true;

    this.mouse = { x: 0, y: 0 };
    this.blinkTimer = 2.5;
    this.blinkValue = 0;
    this.clock = new THREE.Clock();

    this.vrm = null;
    this.vrmOriginalMaterials = new Map();
    this.proceduralRig = null;
    this.holoMaterials = [];
    this.audioBars = [];
    this.emitterRings = [];
    this.particles = null;

    this._initScene();
    this._initEmitterAndEnvironment();
    this._buildProceduralHumanoid();
    this._bindEvents();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020814, 0.14);

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    this.camera.position.set(0, 1.42, 3.05);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 1.25, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 5.2;
    this.controls.minPolarAngle = Math.PI * 0.25;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.update();

    // Lighting (important for VRM natural mode & specular highlights)
    this.ambientLight = new THREE.AmbientLight(0x88ccff, 0.75);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xbbeeff, 1.6);
    this.keyLight.position.set(1.5, 2.8, 2.5);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.PointLight(this.theme.primary, 2.5, 8);
    this.rimLight.position.set(0, 0.3, 0.4);
    this.scene.add(this.rimLight);

    this.backLight = new THREE.PointLight(this.theme.secondary, 2.2, 8);
    this.backLight.position.set(0, 1.8, -1.6);
    this.scene.add(this.backLight);

    // Root container for avatar (either procedural or VRM)
    this.avatarRoot = new THREE.Group();
    this.scene.add(this.avatarRoot);
  }

  _createHologramMaterial(opacity = 0.92) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: HOLOGRAM_VERT,
      fragmentShader: HOLOGRAM_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPrimaryColor: { value: this.theme.primary.clone() },
        uSecondaryColor: { value: this.theme.secondary.clone() },
        uAudio: { value: 0 },
        uGlitch: { value: 0.15 },
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.holoMaterials.push(mat);
    return mat;
  }

  _initEmitterAndEnvironment() {
    this.emitterGroup = new THREE.Group();
    this.emitterGroup.position.set(0, 0.02, 0);
    this.scene.add(this.emitterGroup);

    // Base dark metallic projector pad
    const padGeo = new THREE.CylinderGeometry(0.85, 1.02, 0.08, 48);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x091322,
      metalness: 0.85,
      roughness: 0.25,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = -0.04;
    this.emitterGroup.add(pad);

    // Glowing holographic concentric rings
    const ringConfigs = [
      { inner: 0.52, outer: 0.55, speed: 0.45, y: 0.02, opacity: 0.85 },
      { inner: 0.72, outer: 0.745, speed: -0.32, y: 0.04, opacity: 0.65 },
      { inner: 0.96, outer: 0.985, speed: 0.22, y: 0.01, opacity: 0.45 },
      { inner: 1.25, outer: 1.265, speed: -0.15, y: -0.01, opacity: 0.25 },
    ];

    ringConfigs.forEach((cfg, idx) => {
      const geo = new THREE.RingGeometry(cfg.inner, cfg.outer, 64, 1, 0, Math.PI * (idx % 2 === 0 ? 1.65 : 1.35));
      const mat = new THREE.MeshBasicMaterial({
        color: this.theme.primary,
        transparent: true,
        opacity: cfg.opacity,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = cfg.y;
      mesh.userData.speed = cfg.speed;
      this.emitterGroup.add(mesh);
      this.emitterRings.push(mesh);
    });

    // Vertical holographic projection light beam cone
    const coneGeo = new THREE.CylinderGeometry(0.95, 0.48, 2.35, 48, 1, true);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: this.theme.primary,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeo, this.beamMat);
    cone.position.y = 1.18;
    this.emitterGroup.add(cone);

    // Subtle sci-fi floor grid
    this.gridHelper = new THREE.PolarGridHelper(3.4, 12, 6, 64, 0x0c3452, 0x071d33);
    this.gridHelper.position.y = -0.08;
    this.scene.add(this.gridHelper);

    // 3D Circular Audio Visualizer Bars around the pedestal
    const barCount = 48;
    const radius = 0.88;
    const barGeo = new THREE.BoxGeometry(0.022, 0.14, 0.022);
    barGeo.translate(0, 0.07, 0);

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const mat = new THREE.MeshBasicMaterial({
        color: this.theme.primary,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const bar = new THREE.Mesh(barGeo, mat);
      bar.position.set(Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius);
      bar.rotation.y = -angle;
      bar.userData.phase = i * 0.42;
      this.emitterGroup.add(bar);
      this.audioBars.push(bar);
    }

    // Floating holographic rising particles
    const pCount = 140;
    const positions = new Float32Array(pCount * 3);
    const speeds = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      const r = 0.25 + Math.random() * 1.15;
      const a = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * 2.4;
      positions[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 0.12 + Math.random() * 0.28;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.userData.speeds = speeds;

    this.particleMat = new THREE.PointsMaterial({
      color: this.theme.accent,
      size: 0.024,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particles = new THREE.Points(pGeo, this.particleMat);
    this.scene.add(this.particles);
  }

  /**
   * Builds a sculpted, expressive, articulated holographic human upper-body avatar
   * as the built-in default so the app looks iconic even without uploading a VRM.
   */
  _buildProceduralHumanoid() {
    const group = new THREE.Group();
    const holoMat = this._createHologramMaterial(0.92);
    const wireMat = new THREE.MeshBasicMaterial({
      color: this.theme.accent,
      wireframe: true,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: this.theme.accent,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Core dark silhouette inside so hologram has crisp 3D depth
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: 0x031120,
      transparent: true,
      opacity: 0.45,
    });

    const bodyPivot = new THREE.Group();
    bodyPivot.position.set(0, 0.26, 0);
    group.add(bodyPivot);

    // Lower fade-out holographic torso / waist
    const waistGeo = new THREE.CylinderGeometry(0.15, 0.11, 0.42, 32, 8, true);
    const waist = new THREE.Mesh(waistGeo, holoMat);
    waist.position.y = 0.56;
    bodyPivot.add(waist);

    // Sculpted chest / upper torso
    const chestGroup = new THREE.Group();
    chestGroup.position.set(0, 0.88, 0);
    bodyPivot.add(chestGroup);

    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.15, 0.42, 36, 12);
    torsoGeo.scale(1.08, 1.0, 0.68);
    const torso = new THREE.Mesh(torsoGeo, holoMat);
    const torsoInner = new THREE.Mesh(torsoGeo, innerCoreMat);
    torsoInner.scale.setScalar(0.94);
    const torsoWire = new THREE.Mesh(torsoGeo, wireMat);
    torsoWire.scale.setScalar(1.02);
    chestGroup.add(torso, torsoInner, torsoWire);

    // Collarbone / Shoulder bridge
    const shoulderBarGeo = new THREE.CapsuleGeometry(0.085, 0.34, 12, 24);
    shoulderBarGeo.rotateZ(Math.PI / 2);
    shoulderBarGeo.scale(1, 0.78, 0.72);
    const shoulderBar = new THREE.Mesh(shoulderBarGeo, holoMat);
    shoulderBar.position.set(0, 0.19, 0);
    chestGroup.add(shoulderBar);

    // Glowing AI Neural Core on Chest
    const coreRingGeo = new THREE.TorusGeometry(0.062, 0.008, 16, 40);
    const coreRing = new THREE.Mesh(coreRingGeo, glowMat);
    coreRing.position.set(0, 0.05, 0.152);
    chestGroup.add(coreRing);

    const coreCenterGeo = new THREE.CircleGeometry(0.032, 24);
    const coreCenter = new THREE.Mesh(coreCenterGeo, glowMat);
    coreCenter.position.set(0, 0.05, 0.155);
    chestGroup.add(coreCenter);

    // Orbiting data halo behind shoulders
    const haloGeo = new THREE.TorusGeometry(0.42, 0.004, 12, 80);
    const haloMat = new THREE.MeshBasicMaterial({
      color: this.theme.primary,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const backHalo = new THREE.Mesh(haloGeo, haloMat);
    backHalo.position.set(0, 0.36, -0.18);
    chestGroup.add(backHalo);

    // Articulated Arms (Left & Right)
    const buildArm = (side) => {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(side * 0.27, 0.17, 0);
      chestGroup.add(shoulderPivot);

      const upperArmGeo = new THREE.CapsuleGeometry(0.055, 0.24, 10, 20);
      const upperArm = new THREE.Mesh(upperArmGeo, holoMat);
      upperArm.position.y = -0.15;
      shoulderPivot.add(upperArm);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.30, 0);
      shoulderPivot.add(elbowPivot);

      const forearmGeo = new THREE.CapsuleGeometry(0.044, 0.23, 10, 20);
      const forearm = new THREE.Mesh(forearmGeo, holoMat);
      forearm.position.y = -0.14;
      elbowPivot.add(forearm);

      const handGeo = new THREE.SphereGeometry(0.042, 16, 16);
      handGeo.scale(0.8, 1.25, 0.55);
      const hand = new THREE.Mesh(handGeo, glowMat);
      hand.position.y = -0.29;
      elbowPivot.add(hand);

      // Default relaxed posture
      shoulderPivot.rotation.z = side * 0.14;
      elbowPivot.rotation.x = -0.24;

      return { shoulderPivot, elbowPivot };
    };

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);

    // Neck & Head Group
    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 0.25, 0);
    chestGroup.add(neckPivot);

    const neckGeo = new THREE.CylinderGeometry(0.055, 0.068, 0.14, 24);
    const neck = new THREE.Mesh(neckGeo, holoMat);
    neck.position.y = 0.05;
    neckPivot.add(neck);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.13, 0);
    neckPivot.add(headPivot);

    // Sculpted human head (cranium + tapered jawline)
    const craniumGeo = new THREE.SphereGeometry(0.145, 36, 36);
    craniumGeo.scale(0.88, 1.06, 0.94);
    const cranium = new THREE.Mesh(craniumGeo, holoMat);
    cranium.position.set(0, 0.13, 0);

    const craniumInner = new THREE.Mesh(craniumGeo, innerCoreMat);
    craniumInner.position.set(0, 0.13, 0);
    craniumInner.scale.set(0.83, 1.01, 0.89);

    const craniumWire = new THREE.Mesh(craniumGeo, wireMat);
    craniumWire.position.set(0, 0.13, 0);
    craniumWire.scale.set(0.91, 1.09, 0.97);

    // Chin / Jawline sculpt
    const jawGeo = new THREE.ConeGeometry(0.095, 0.12, 24);
    jawGeo.rotateX(Math.PI);
    jawGeo.scale(0.85, 0.72, 0.78);
    const jaw = new THREE.Mesh(jawGeo, holoMat);
    jaw.position.set(0, 0.025, 0.03);

    // Stylized sleek holographic hair crest / neural crown
    const hairGeo = new THREE.SphereGeometry(0.152, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.56);
    hairGeo.scale(0.92, 1.06, 0.99);
    const hair = new THREE.Mesh(hairGeo, holoMat);
    hair.position.set(0, 0.148, -0.015);
    hair.rotation.x = -0.18;

    headPivot.add(cranium, craniumInner, craniumWire, jaw, hair);

    // Expressive Glowing Eyes (Left & Right)
    const eyeGeo = new THREE.SphereGeometry(0.017, 16, 16);
    eyeGeo.scale(1.25, 0.75, 0.5);
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
    });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.046, 0.135, 0.126);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.046, 0.135, 0.126);

    // Subtle eyebrows for emotion
    const browGeo = new THREE.BoxGeometry(0.042, 0.006, 0.008);
    const leftBrow = new THREE.Mesh(browGeo, glowMat);
    leftBrow.position.set(-0.046, 0.164, 0.128);
    const rightBrow = new THREE.Mesh(browGeo, glowMat);
    rightBrow.position.set(0.046, 0.164, 0.128);

    headPivot.add(leftEye, rightEye, leftBrow, rightBrow);

    // Expressive Holographic Lip-Sync Mouth
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, 0.068, 0.128);
    headPivot.add(mouthGroup);

    const upperLipGeo = new THREE.CapsuleGeometry(0.0055, 0.042, 8, 16);
    upperLipGeo.rotateZ(Math.PI / 2);
    const upperLip = new THREE.Mesh(upperLipGeo, glowMat);
    upperLip.position.y = 0.004;

    const lowerLipGeo = new THREE.CapsuleGeometry(0.005, 0.036, 8, 16);
    lowerLipGeo.rotateZ(Math.PI / 2);
    const lowerLip = new THREE.Mesh(lowerLipGeo, glowMat);
    lowerLip.position.y = -0.004;

    // Inner vocal glow core inside mouth when speaking
    const mouthCoreGeo = new THREE.PlaneGeometry(0.046, 0.022);
    const mouthCoreMat = new THREE.MeshBasicMaterial({
      color: this.theme.accent,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mouthCore = new THREE.Mesh(mouthCoreGeo, mouthCoreMat);
    mouthCore.position.z = -0.002;

    mouthGroup.add(upperLip, lowerLip, mouthCore);

    // Holographic ear-node accents
    const earGeo = new THREE.TorusGeometry(0.024, 0.004, 10, 24);
    const leftEar = new THREE.Mesh(earGeo, glowMat);
    leftEar.position.set(-0.128, 0.13, 0.0);
    leftEar.rotation.y = Math.PI / 2;
    const rightEar = new THREE.Mesh(earGeo, glowMat);
    rightEar.position.set(0.128, 0.13, 0.0);
    rightEar.rotation.y = Math.PI / 2;
    headPivot.add(leftEar, rightEar);

    this.avatarRoot.add(group);
    this.proceduralRig = {
      group,
      bodyPivot,
      chestGroup,
      neckPivot,
      headPivot,
      leftArm,
      rightArm,
      leftEye,
      rightEye,
      leftBrow,
      rightBrow,
      upperLip,
      lowerLip,
      mouthCore,
      mouthCoreMat,
      coreRing,
      coreCenter,
      backHalo,
      wireMat,
      glowMat,
      haloMat,
    };
  }

  /**
   * Loads a user-provided .VRM 3D human avatar file and integrates it into the Hologram Stage!
   */
  async loadVrmFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      await this.loadVrmFromUrl(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async loadVrmFromUrl(url) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) {
      throw new Error('File tidak berisi data avatar VRM yang valid.');
    }

    // Cleanup old VRM if exists
    if (this.vrm) {
      this.avatarRoot.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
      this.vrmOriginalMaterials.clear();
    }

    // Hide procedural avatar
    if (this.proceduralRig) {
      this.proceduralRig.group.visible = false;
    }

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);

    // Rotate VRM 0.x to face camera cleanly
    VRMUtils.rotateVRM0(vrm);

    // Normalize scale & position on emitter pedestal
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetHeight = 1.65;
    if (size.y > 0.01) {
      const scale = targetHeight / size.y;
      vrm.scene.scale.setScalar(scale);
    }
    const scaledBox = new THREE.Box3().setFromObject(vrm.scene);
    vrm.scene.position.y = 0.08 - scaledBox.min.y;

    // Store original materials so user can toggle Hologram Shader <-> Natural 3D
    vrm.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.frustumCulled = false;
        this.vrmOriginalMaterials.set(obj, obj.material);
      }
    });

    this.vrm = vrm;
    this.avatarRoot.add(vrm.scene);
    this.setVrmHologramShader(this.vrmHologramShader);

    // Adjust camera slightly for full VRM upper-body focus
    this.controls.target.set(0, 1.32, 0);
    this.camera.position.set(0, 1.44, 2.75);
    this.controls.update();

    return true;
  }

  resetToDefaultAvatar() {
    if (this.vrm) {
      this.avatarRoot.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
      this.vrmOriginalMaterials.clear();
    }
    if (this.proceduralRig) {
      this.proceduralRig.group.visible = true;
    }
    this.controls.target.set(0, 1.25, 0);
    this.camera.position.set(0, 1.42, 3.05);
    this.controls.update();
  }

  setVrmHologramShader(enabled) {
    this.vrmHologramShader = enabled;
    if (!this.vrm) return;

    const holoMat = this._createHologramMaterial(0.86);
    this.vrm.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      if (enabled) {
        obj.material = holoMat;
      } else {
        const orig = this.vrmOriginalMaterials.get(obj);
        if (orig) obj.material = orig;
      }
    });
  }

  setState(state) {
    this.state = state;
  }

  setEmotion(emotion) {
    this.emotion = emotion || 'neutral';
  }

  setAudioLevel(level, viseme = 'aa') {
    this.targetAudioLevel = Math.max(0, Math.min(1, level));
    if (viseme) this.viseme = viseme;
  }

  setTheme(themeName) {
    if (!THEMES[themeName]) return;
    this.themeName = themeName;
    this.theme = THEMES[themeName];

    this.holoMaterials.forEach((m) => {
      m.uniforms.uPrimaryColor.value.copy(this.theme.primary);
      m.uniforms.uSecondaryColor.value.copy(this.theme.secondary);
    });
    this.emitterRings.forEach((r) => r.material.color.copy(this.theme.primary));
    this.audioBars.forEach((b) => b.material.color.copy(this.theme.primary));
    if (this.beamMat) this.beamMat.color.copy(this.theme.primary);
    if (this.particleMat) this.particleMat.color.copy(this.theme.accent);
    if (this.rimLight) this.rimLight.color.copy(this.theme.primary);
    if (this.backLight) this.backLight.color.copy(this.theme.secondary);
    if (this.proceduralRig) {
      this.proceduralRig.wireMat.color.copy(this.theme.accent);
      this.proceduralRig.glowMat.color.copy(this.theme.accent);
      this.proceduralRig.haloMat.color.copy(this.theme.primary);
      this.proceduralRig.mouthCoreMat.color.copy(this.theme.accent);
    }
  }

  setPeppersGhostMode(enabled) {
    this.peppersGhost = enabled;
    if (this.gridHelper) this.gridHelper.visible = !enabled;
    if (this.emitterGroup) this.emitterGroup.visible = !enabled;
    if (!enabled) {
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
  }

  _onResize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _updateBlink(dt) {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkValue = 1;
      this.blinkTimer = 2.6 + Math.random() * 3.4;
    } else {
      this.blinkValue = Math.max(0, this.blinkValue - dt * 9.5);
    }
  }

  _updateProceduralAvatar(t, dt) {
    const rig = this.proceduralRig;
    if (!rig || !rig.group.visible) return;

    const speaking = this.state === 'speaking';
    const listening = this.state === 'listening';
    const thinking = this.state === 'thinking';

    // Gentle floating & breathing
    rig.bodyPivot.position.y = 0.26 + Math.sin(t * 1.8) * 0.018;
    rig.chestGroup.scale.set(
      1 + Math.sin(t * 2.1) * 0.012,
      1 + Math.sin(t * 2.1) * 0.015,
      1 + Math.sin(t * 2.1) * 0.012
    );

    // Head tracking + expressive posture
    let targetHeadY = this.mouse.x * 0.28 + Math.sin(t * 0.7) * 0.05;
    let targetHeadX = -this.mouse.y * 0.14 + Math.cos(t * 0.9) * 0.03;
    let targetHeadZ = 0;

    if (listening) {
      targetHeadX += 0.06;
      targetHeadZ = 0.08;
    } else if (thinking) {
      targetHeadY = Math.sin(t * 1.5) * 0.18;
      targetHeadX = -0.09;
      targetHeadZ = -0.10;
    } else if (speaking) {
      targetHeadX += Math.sin(t * 5.2) * 0.055 * (0.4 + this.audioLevel);
      targetHeadY += Math.sin(t * 2.3) * 0.07;
    }

    rig.headPivot.rotation.y += (targetHeadY - rig.headPivot.rotation.y) * Math.min(1, dt * 6);
    rig.headPivot.rotation.x += (targetHeadX - rig.headPivot.rotation.x) * Math.min(1, dt * 6);
    rig.headPivot.rotation.z += (targetHeadZ - rig.headPivot.rotation.z) * Math.min(1, dt * 5);

    // Expressive arm gestures
    const gestureAmp = speaking ? 0.18 + this.audioLevel * 0.25 : thinking ? 0.12 : 0.03;
    const lTargetX = speaking ? -0.35 + Math.sin(t * 3.1) * gestureAmp : thinking ? -0.42 : -0.06 + Math.sin(t * 1.2) * 0.03;
    const rTargetX = speaking ? -0.38 + Math.cos(t * 2.8) * gestureAmp : listening ? -0.18 : -0.06 + Math.cos(t * 1.1) * 0.03;

    rig.leftArm.shoulderPivot.rotation.x += (lTargetX - rig.leftArm.shoulderPivot.rotation.x) * dt * 5;
    rig.rightArm.shoulderPivot.rotation.x += (rTargetX - rig.rightArm.shoulderPivot.rotation.x) * dt * 5;
    rig.leftArm.elbowPivot.rotation.x = -0.26 - (speaking ? Math.abs(Math.sin(t * 3.5)) * 0.35 : 0);
    rig.rightArm.elbowPivot.rotation.x = -0.26 - (speaking ? Math.abs(Math.cos(t * 3.2)) * 0.35 : thinking ? 0.55 : 0);

    // Eye blinking & emotion
    const eyeScaleY = Math.max(0.08, 0.75 * (1 - this.blinkValue));
    rig.leftEye.scale.y = eyeScaleY;
    rig.rightEye.scale.y = eyeScaleY;

    // Eyebrows based on emotion
    if (this.emotion === 'happy') {
      rig.leftBrow.rotation.z = 0.12;
      rig.rightBrow.rotation.z = -0.12;
      rig.leftBrow.position.y = 0.17;
      rig.rightBrow.position.y = 0.17;
    } else if (this.emotion === 'alert') {
      rig.leftBrow.rotation.z = -0.16;
      rig.rightBrow.rotation.z = 0.16;
      rig.leftBrow.position.y = 0.16;
      rig.rightBrow.position.y = 0.16;
    } else if (this.emotion === 'thinking' || thinking) {
      rig.leftBrow.rotation.z = 0.08;
      rig.rightBrow.rotation.z = 0.14;
      rig.leftBrow.position.y = 0.168;
      rig.rightBrow.position.y = 0.162;
    } else {
      rig.leftBrow.rotation.z = 0;
      rig.rightBrow.rotation.z = 0;
      rig.leftBrow.position.y = 0.164;
      rig.rightBrow.position.y = 0.164;
    }

    // Lip-sync mouth animation
    const mouthOpen = speaking ? this.audioLevel * 0.022 : 0;
    rig.upperLip.position.y = 0.004 + mouthOpen * 0.38;
    rig.lowerLip.position.y = -0.004 - mouthOpen * 0.72;
    rig.mouthCoreMat.opacity = speaking ? Math.min(0.85, this.audioLevel * 0.9) : 0;
    rig.mouthCore.scale.y = Math.max(0.15, mouthOpen * 45);

    // Chest neural core pulse & back halo rotation
    const corePulse = 1 + (speaking ? this.audioLevel * 0.28 : Math.sin(t * 3.0) * 0.07);
    rig.coreRing.scale.setScalar(corePulse);
    rig.coreRing.rotation.z = t * (thinking ? 2.4 : 0.6);
    rig.backHalo.rotation.z = -t * (thinking ? 1.5 : 0.35);
    rig.backHalo.rotation.x = Math.sin(t * 0.6) * 0.12;
  }

  _updateVrmAvatar(t, dt) {
    if (!this.vrm) return;
    const speaking = this.state === 'speaking';
    const thinking = this.state === 'thinking';

    const humanoid = this.vrm.humanoid;
    if (humanoid) {
      const head = humanoid.getNormalizedBoneNode('head');
      const spine = humanoid.getNormalizedBoneNode('spine');
      const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
      const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
      const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
      const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');

      if (spine) {
        spine.rotation.x = Math.sin(t * 1.7) * 0.025;
        spine.rotation.z = Math.sin(t * 0.8) * 0.015;
      }
      if (head) {
        head.rotation.y = this.mouse.x * 0.25 + (speaking ? Math.sin(t * 2.4) * 0.06 : 0);
        head.rotation.x = -this.mouse.y * 0.12 + (speaking ? Math.sin(t * 4.8) * 0.04 * this.audioLevel : thinking ? -0.08 : 0);
      }
      // Relaxed arms down from T-pose + subtle speaking gestures
      if (leftUpperArm) {
        leftUpperArm.rotation.z = 1.18 + (speaking ? Math.sin(t * 2.8) * 0.08 : 0);
        leftUpperArm.rotation.x = speaking ? 0.25 + Math.sin(t * 3.1) * 0.14 * this.audioLevel : 0.08;
      }
      if (rightUpperArm) {
        rightUpperArm.rotation.z = -1.18 - (speaking ? Math.cos(t * 2.6) * 0.08 : 0);
        rightUpperArm.rotation.x = speaking ? 0.25 + Math.cos(t * 2.9) * 0.14 * this.audioLevel : 0.08;
      }
      if (leftLowerArm) leftLowerArm.rotation.y = -0.22;
      if (rightLowerArm) rightLowerArm.rotation.y = 0.22;
    }

    // Expressions & Lip-sync
    const expr = this.vrm.expressionManager;
    if (expr) {
      expr.setValue('blink', this.blinkValue);
      expr.setValue('happy', this.emotion === 'happy' ? 0.65 : 0);
      expr.setValue('surprised', this.emotion === 'alert' ? 0.45 : 0);

      const visemes = ['aa', 'ih', 'ou', 'ee', 'oh'];
      visemes.forEach((v) => {
        const val = speaking && v === this.viseme ? Math.min(0.95, this.audioLevel * 1.1) : 0;
        expr.setValue(v, val);
      });
    }

    this.vrm.update(dt);
  }

  _updateEnvironment(t, dt) {
    const speedMult = this.state === 'thinking' ? 3.2 : this.state === 'listening' ? 2.1 : this.state === 'speaking' ? 1.8 : 1.0;

    // Update hologram shader uniforms
    this.holoMaterials.forEach((m) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uAudio.value = this.audioLevel;
      m.uniforms.uGlitch.value = this.state === 'thinking' ? 0.55 : this.state === 'speaking' ? 0.28 : 0.12;
    });

    // Spin emitter rings
    this.emitterRings.forEach((ring) => {
      ring.rotation.z += ring.userData.speed * speedMult * dt;
    });

    // Animate 3D audio bars
    this.audioBars.forEach((bar) => {
      const idleWave = 0.22 + Math.sin(t * 2.6 + bar.userData.phase) * 0.12;
      const activeWave = this.audioLevel > 0.02
        ? (0.4 + Math.abs(Math.sin(t * 11.0 + bar.userData.phase)) * 2.6) * this.audioLevel
        : (this.state === 'listening' ? 0.45 + Math.abs(Math.sin(t * 7.0 + bar.userData.phase)) * 0.75 : 0);
      const targetScale = Math.max(0.12, idleWave + activeWave);
      bar.scale.y += (targetScale - bar.scale.y) * Math.min(1, dt * 14);
    });

    // Drift particles upward
    if (this.particles) {
      const posAttr = this.particles.geometry.getAttribute('position');
      const speeds = this.particles.geometry.userData.speeds;
      for (let i = 0; i < speeds.length; i++) {
        let y = posAttr.getY(i) + speeds[i] * speedMult * dt;
        if (y > 2.45) y = 0.05;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
      this.particles.rotation.y = t * 0.08;
    }

    // Dynamic glow light intensity
    this.rimLight.intensity = 2.2 + this.audioLevel * 2.4 + Math.sin(t * 3.0) * 0.25;
  }

  _renderPeppersGhost() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const size = Math.floor(Math.min(w, h) * 0.34);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const offset = Math.floor(size * 0.62);

    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.setScissorTest(true);

    const views = [
      { x: cx - size / 2, y: cy + offset - size / 2, rot: 0, camPos: [0, 1.35, 3.0] }, // Top
      { x: cx - size / 2, y: cy - offset - size / 2, rot: Math.PI, camPos: [0, 1.35, -3.0] }, // Bottom
      { x: cx - offset - size / 2, y: cy - size / 2, rot: Math.PI / 2, camPos: [-3.0, 1.35, 0] }, // Left
      { x: cx + offset - size / 2, y: cy - size / 2, rot: -Math.PI / 2, camPos: [3.0, 1.35, 0] }, // Right
    ];

    const savedPos = this.camera.position.clone();
    const savedUp = this.camera.up.clone();

    views.forEach((v) => {
      this.renderer.setViewport(v.x, v.y, size, size);
      this.renderer.setScissor(v.x, v.y, size, size);
      this.camera.aspect = 1;
      this.camera.position.set(...v.camPos);
      this.camera.up.set(Math.sin(v.rot), Math.cos(v.rot), 0);
      this.camera.lookAt(0, 1.25, 0);
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    });

    this.camera.position.copy(savedPos);
    this.camera.up.copy(savedUp);
    this.renderer.setScissorTest(false);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    // Smooth audio envelope
    this.audioLevel += (this.targetAudioLevel - this.audioLevel) * Math.min(1, dt * 16);

    this._updateBlink(dt);
    this._updateProceduralAvatar(t, dt);
    this._updateVrmAvatar(t, dt);
    this._updateEnvironment(t, dt);

    if (this.peppersGhost) {
      this._renderPeppersGhost();
    } else {
      this.controls.update();
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.render(this.scene, this.camera);
    }
  }
}
