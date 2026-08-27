import * as THREE from 'three';
import * as CANNON from 'cannon-es';

function generateGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#3f6b34';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = Math.random();
    if (shade < 0.5) {
      ctx.fillStyle = 'rgba(60, 100, 45, ' + (0.15 + Math.random() * 0.25) + ')';
    } else if (shade < 0.85) {
      ctx.fillStyle = 'rgba(90, 140, 60, ' + (0.1 + Math.random() * 0.2) + ')';
    } else {
      ctx.fillStyle = 'rgba(40, 70, 30, ' + (0.15 + Math.random() * 0.2) + ')';
    }
    const r = 1 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const patchCount = 22;
  for (let i = 0; i < patchCount; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const radius = 12 + Math.random() * 30;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(120, 88, 55, 0.55)');
    gradient.addColorStop(1, 'rgba(120, 88, 55, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 60);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function generateSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0.0, '#6fb3ff');
  gradient.addColorStop(0.35, '#a9d4ff');
  gradient.addColorStop(0.7, '#eaf4ff');
  gradient.addColorStop(1.0, '#fff3dd');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLowPolyTree() {
  const group = new THREE.Group();

  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 1, flatShading: true });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const foliageColors = [0x2f6b34, 0x357a3a, 0x3d8a41];
  const foliageMat = new THREE.MeshStandardMaterial({
    color: foliageColors[Math.floor(Math.random() * foliageColors.length)],
    roughness: 0.9,
    flatShading: true
  });

  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const radius = 1.3 - i * 0.32;
    const height = 1.5 - i * 0.25;
    const coneGeo = new THREE.ConeGeometry(radius, height, 7);
    const cone = new THREE.Mesh(coneGeo, foliageMat);
    cone.position.y = 1.6 + i * 0.85;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
  }

  const scale = 0.85 + Math.random() * 0.5;
  group.scale.setScalar(scale);
  group.rotation.y = Math.random() * Math.PI * 2;

  return group;
}

function createLowPolyRock() {
  const geo = new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.6, 0);
  const positions = geo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + (Math.random() - 0.5) * 0.08;
    const y = positions.getY(i) + (Math.random() - 0.5) * 0.08;
    const z = positions.getZ(i) + (Math.random() - 0.5) * 0.08;
    positions.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  const grayShades = [0x8a8a86, 0x7d7d78, 0x999992];
  const mat = new THREE.MeshStandardMaterial({
    color: grayShades[Math.floor(Math.random() * grayShades.length)],
    roughness: 0.95,
    flatShading: true
  });

  const rock = new THREE.Mesh(geo, mat);
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  return rock;
}

export class Environment {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.groundSize = 300;
    this.exclusionRadius = 8;
  }

  build() {
    this._setupSky();
    this._setupFog();
    this._setupLights();
    this._setupGround();
    this._scatterProps();
  }

  _setupSky() {
    this.scene.background = generateSkyTexture();
  }

  _setupFog() {
    this.scene.fog = new THREE.FogExp2(0xcfe6ff, 0.012);
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0x8fa6c2, 0.45);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xbfdcff, 0x3c5222, 0.65);
    hemi.position.set(0, 50, 0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
    sun.position.set(40, 60, 25);
    sun.castShadow = true;

    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.02;

    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  _setupGround() {
    const texture = generateGroundTexture();
    const geo = new THREE.PlaneGeometry(this.groundSize, this.groundSize, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      metalness: 0
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: new CANNON.Material('groundMaterial')
    });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(groundBody);
    this.groundBody = groundBody;
  }

  _scatterProps() {
    const treeCount = 90;
    const rockCount = 60;
    const half = this.groundSize / 2 - 6;

    for (let i = 0; i < treeCount; i++) {
      const x = (Math.random() - 0.5) * half * 2;
      const z = (Math.random() - 0.5) * half * 2;
      if (Math.sqrt(x * x + z * z) < this.exclusionRadius) continue;
      const tree = createLowPolyTree();
      tree.position.set(x, 0, z);
      this.scene.add(tree);
    }

    for (let i = 0; i < rockCount; i++) {
      const x = (Math.random() - 0.5) * half * 2;
      const z = (Math.random() - 0.5) * half * 2;
      if (Math.sqrt(x * x + z * z) < this.exclusionRadius) continue;
      const rock = createLowPolyRock();
      rock.position.set(x, 0.15, z);
      this.scene.add(rock);
    }
  }
}
