import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const MOVE_SPEED = 6.5;
const RUN_MULTIPLIER = 1.6;
const JUMP_VELOCITY = 6.5;
const ROTATE_LERP = 0.18;
const CAMERA_LERP = 0.12;
const CAMERA_DISTANCE = 6.5;
const CAMERA_HEIGHT = 2.6;
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_MIN = -0.75;
const PITCH_MAX = 1.0;

export function createNameTagSprite(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 30px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const colorStr = '#' + new THREE.Color(colorHex).getHexString();

  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = colorStr;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.0, 0.5, 1);
  sprite.renderOrder = 999;
  return sprite;
}

export function createCharacterMesh(colorHex) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.55, metalness: 0.05 });
  const capsuleGeo = new THREE.CapsuleGeometry(0.42, 0.9, 6, 12);
  const capsule = new THREE.Mesh(capsuleGeo, bodyMat);
  capsule.position.y = 0.95;
  capsule.castShadow = true;
  capsule.receiveShadow = true;
  group.add(capsule);

  const headMat = new THREE.MeshStandardMaterial({ color: 0xffe0b8, roughness: 0.7 });
  const headGeo = new THREE.SphereGeometry(0.28, 12, 10);
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);

  const markerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333, roughness: 0.4 });
  const markerGeo = new THREE.ConeGeometry(0.12, 0.32, 6);
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.rotation.x = Math.PI / 2;
  marker.position.set(0, 1.0, 0.48);
  marker.castShadow = true;
  group.add(marker);

  return group;
}

export class LocalPlayer {
  constructor(scene, world, camera, domElement) {
    this.scene = scene;
    this.world = world;
    this.camera = camera;
    this.domElement = domElement;

    this.color = 0x55c1ff;
    this.mesh = createCharacterMesh(this.color);
    this.scene.add(this.mesh);

    const shape = new CANNON.Sphere(0.45);
    this.body = new CANNON.Body({
      mass: 5,
      shape: shape,
      position: new CANNON.Vec3(0, 3, 0),
      fixedRotation: true,
      linearDamping: 0.9,
      allowSleep: false,
      material: new CANNON.Material('playerMaterial')
    });
    this.world.addBody(this.body);

    this.inputEnabled = true;
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      run: false
    };

    this.yaw = 0;
    this.pitch = 0.28;
    this.isPointerLocked = false;

    this.grounded = false;
    this.animState = 'idle';

    this._cameraCurrentPos = new THREE.Vector3(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);
    this._raycastFrom = new CANNON.Vec3();
    this._raycastTo = new CANNON.Vec3();
    this._raycastResult = new CANNON.RaycastResult();

    this._bindInput();
  }

  _bindInput() {
    const self = this;

    window.addEventListener('keydown', function (e) {
      self._onKeyDown(e);
    });

    window.addEventListener('keyup', function (e) {
      self._onKeyUp(e);
    });

    this.domElement.addEventListener('click', function () {
      if (self.inputEnabled) {
        self.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', function () {
      self.isPointerLocked = document.pointerLockElement === self.domElement;
    });

    document.addEventListener('mousemove', function (e) {
      if (!self.isPointerLocked || !self.inputEnabled) return;
      self.yaw -= e.movementX * MOUSE_SENSITIVITY;
      self.pitch -= e.movementY * MOUSE_SENSITIVITY;
      self.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, self.pitch));
    });
  }

  _onKeyDown(e) {
    if (!this.inputEnabled) return;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'Space':
        this.keys.jump = true;
        e.preventDefault();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.run = true;
        break;
      default:
        break;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'Space':
        this.keys.jump = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.run = false;
        break;
      default:
        break;
    }
  }

  _checkGrounded() {
    const pos = this.body.position;
    this._raycastFrom.set(pos.x, pos.y, pos.z);
    this._raycastTo.set(pos.x, pos.y - 0.7, pos.z);
    this._raycastResult.reset();
    this.world.raycastClosest(this._raycastFrom, this._raycastTo, {}, this._raycastResult);
    this.grounded = this._raycastResult.hasHit;
  }

  update(delta) {
    if (this.body.sleepState === CANNON.Body.SLEEPING) {
      this.body.wakeUp();
    }

    this._checkGrounded();

    let inputX = 0;
    let inputZ = 0;

    if (this.inputEnabled) {
      if (this.keys.forward) inputZ -= 1;
      if (this.keys.backward) inputZ += 1;
      if (this.keys.left) inputX -= 1;
      if (this.keys.right) inputX += 1;
    }

    const hasInput = inputX !== 0 || inputZ !== 0;
    let moveDirX = 0;
    let moveDirZ = 0;

    if (hasInput) {
      const len = Math.sqrt(inputX * inputX + inputZ * inputZ);
      inputX /= len;
      inputZ /= len;

      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);

      moveDirX = inputX * cosYaw - inputZ * sinYaw;
      moveDirZ = inputX * sinYaw + inputZ * cosYaw;
    }

    const speed = MOVE_SPEED * (this.keys.run ? RUN_MULTIPLIER : 1);
    this.body.velocity.x = moveDirX * speed;
    this.body.velocity.z = moveDirZ * speed;

    if (this.keys.jump && this.grounded) {
      this.body.velocity.y = JUMP_VELOCITY;
      this.grounded = false;
    }

    if (this.body.position.y < -20) {
      this.body.position.set(0, 5, 0);
      this.body.velocity.set(0, 0, 0);
    }

    this.mesh.position.set(this.body.position.x, this.body.position.y - 0.45, this.body.position.z);

    if (hasInput) {
      const targetAngle = Math.atan2(moveDirX, moveDirZ);
      let angleDiff = targetAngle - this.mesh.rotation.y;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      this.mesh.rotation.y += angleDiff * ROTATE_LERP;
    }

    if (!this.grounded) {
      this.animState = this.body.velocity.y > 0.5 ? 'jump' : 'fall';
    } else if (hasInput) {
      this.animState = this.keys.run ? 'run' : 'walk';
    } else {
      this.animState = 'idle';
    }

    this._updateCamera();
  }

  _updateCamera() {
    const targetPos = this.mesh.position.clone();
    targetPos.y += 1.2;

    const offsetX = Math.sin(this.yaw) * -CAMERA_DISTANCE * Math.cos(this.pitch);
    const offsetZ = Math.cos(this.yaw) * -CAMERA_DISTANCE * Math.cos(this.pitch);
    const offsetY = CAMERA_HEIGHT + Math.sin(this.pitch) * CAMERA_DISTANCE;

    const desired = new THREE.Vector3(
      targetPos.x + offsetX,
      targetPos.y + offsetY,
      targetPos.z + offsetZ
    );

    this._cameraCurrentPos.lerp(desired, CAMERA_LERP);

    const rayFrom = new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z);
    const rayTo = new CANNON.Vec3(this._cameraCurrentPos.x, this._cameraCurrentPos.y, this._cameraCurrentPos.z);
    const camResult = new CANNON.RaycastResult();
    this.world.raycastClosest(rayFrom, rayTo, {}, camResult);

    if (camResult.hasHit) {
      const hitDist = rayFrom.distanceTo(camResult.hitPointWorld);
      const dir = new THREE.Vector3(rayTo.x - rayFrom.x, rayTo.y - rayFrom.y, rayTo.z - rayFrom.z).normalize();
      this.camera.position.set(
        rayFrom.x + dir.x * hitDist * 0.9,
        rayFrom.y + dir.y * hitDist * 0.9,
        rayFrom.z + dir.z * hitDist * 0.9
      );
    } else {
      this.camera.position.copy(this._cameraCurrentPos);
    }

    this.camera.lookAt(targetPos);
  }

  getState() {
    return {
      position: {
        x: this.mesh.position.x,
        y: this.mesh.position.y,
        z: this.mesh.position.z
      },
      rotation: this.mesh.rotation.y,
      animState: this.animState
    };
  }
}
