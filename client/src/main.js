import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { Environment } from './Environment.js';
import { LocalPlayer } from './Player.js';
import { NetworkManager } from './Network.js';

const SERVER_URL = 'http://localhost:3000';

const canvas = document.getElementById('game-canvas');
const hud = document.getElementById('hud');
const connectOverlay = document.getElementById('connect-overlay');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const connectStatus = document.getElementById('connect-status');
const onlineCountEl = document.getElementById('online-count');
const pingDisplayEl = document.getElementById('ping-display');
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 4, -8);

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0)
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;

const environment = new Environment(scene, world);
environment.build();

const localPlayer = new LocalPlayer(scene, world, camera, renderer.domElement);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55,
  0.4,
  0.82
);
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

let networkManager = null;
let isConnected = false;

function addChatLine(data) {
  const line = document.createElement('div');
  line.classList.add('chat-line');

  if (data.system) {
    line.classList.add('system');
    line.textContent = data.message;
  } else {
    const userSpan = document.createElement('span');
    userSpan.classList.add('chat-user');
    userSpan.textContent = data.username + ':';
    line.appendChild(userSpan);
    line.appendChild(document.createTextNode(' ' + data.message));
  }

  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;

  while (chatLog.children.length > 50) {
    chatLog.removeChild(chatLog.firstChild);
  }
}

function updateOnlineCount(count) {
  onlineCountEl.textContent = 'Online: ' + count;
}

function updatePing(ms) {
  pingDisplayEl.textContent = 'Ping: ' + ms + ' ms';
}

function startGame(username) {
  connectStatus.textContent = 'Connecting...';
  joinBtn.disabled = true;

  networkManager = new NetworkManager(scene, {
    onConnected: function () {
      isConnected = true;
      connectOverlay.classList.add('hidden');
      hud.classList.remove('hidden');
      addChatLine({ system: true, message: 'Welcome, ' + username + '! You have entered the realm.' });
    },
    onChatMessage: function (data) {
      addChatLine(data);
    },
    onOnlineCount: function (count) {
      updateOnlineCount(count);
    },
    onPing: function (ms) {
      updatePing(ms);
    },
    onError: function (msg) {
      connectStatus.textContent = 'Connection error: ' + msg;
      joinBtn.disabled = false;
    }
  });

  networkManager.connect(username, SERVER_URL);
}

joinBtn.addEventListener('click', function () {
  const name = usernameInput.value.trim();
  if (!name) {
    connectStatus.textContent = 'Please enter a username.';
    return;
  }
  startGame(name);
});

usernameInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    joinBtn.click();
  }
});

window.addEventListener('keydown', function (e) {
  if (!isConnected) return;

  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (document.activeElement !== chatInput) {
      e.preventDefault();
      localPlayer.inputEnabled = false;
      document.exitPointerLock();
      chatInput.focus();
    } else {
      const message = chatInput.value;
      if (message.trim()) {
        networkManager.sendChat(message);
      }
      chatInput.value = '';
      chatInput.blur();
      localPlayer.inputEnabled = true;
      renderer.domElement.requestPointerLock();
    }
  }

  if (e.code === 'Escape' && document.activeElement === chatInput) {
    chatInput.blur();
    chatInput.value = '';
    localPlayer.inputEnabled = true;
  }
});

chatInput.addEventListener('blur', function () {
  localPlayer.inputEnabled = true;
});

window.addEventListener('resize', function () {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
});

const clock = new THREE.Clock();
const FIXED_TIME_STEP = 1 / 60;
const MAX_SUB_STEPS = 5;

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();

  world.step(FIXED_TIME_STEP, delta, MAX_SUB_STEPS);

  localPlayer.update(delta);

  if (networkManager && isConnected) {
    networkManager.sendUpdate(localPlayer.getState(), now);
    networkManager.update();
  }

  composer.render();
}

animate();
