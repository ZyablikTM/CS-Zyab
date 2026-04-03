// Three.js и аддоны загружаются через <script> теги в index.html
        const PointerLockControls = THREE.PointerLockControls;
        const GLTFLoader = THREE.GLTFLoader;
        const FBXLoader = THREE.FBXLoader;
        const SkeletonUtils = THREE.SkeletonUtils || { clone: (obj) => obj.clone() };

        /* ========== AUDIO ========== */
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        function playSound(type, freq, dur, vol, waveform) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = waveform || 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (type === 'decay') {
                osc.frequency.linearRampToValueAtTime(freq * 0.3, audioCtx.currentTime + dur);
            }
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + dur);
        }

        function playNoise(dur, vol) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const gain = audioCtx.createGain();
            const noise = audioCtx.createBufferSource();
            const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < buffer.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / buffer.length);
            noise.buffer = buffer;
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
            noise.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start();
        }

        function playShotSound(weapon) {
            const w = weaponDefs[weapon];
            if (!w) { playNoise(0.08, 0.25); return; }
            switch (w.soundType || 'rifle') {
                case 'pistol':
                    playNoise(0.06, 0.2);
                    playSound('decay', 600, 0.05, 0.1, 'square');
                    break;
                case 'pistol-heavy':
                    playNoise(0.1, 0.4);
                    playSound('decay', 300, 0.12, 0.2, 'sawtooth');
                    break;
                case 'smg':
                    playNoise(0.05, 0.18);
                    playSound('decay', 500, 0.04, 0.08, 'square');
                    break;
                case 'rifle':
                    playNoise(0.08, 0.25);
                    playSound('decay', 400, 0.06, 0.12, 'sawtooth');
                    break;
                case 'sniper':
                    playNoise(0.15, 0.5);
                    playSound('decay', 200, 0.2, 0.3, 'sawtooth');
                    break;
                case 'sniper-light':
                    playNoise(0.1, 0.35);
                    playSound('decay', 350, 0.12, 0.2, 'sawtooth');
                    break;
                case 'knife':
                    playSound('decay', 1200, 0.08, 0.1, 'triangle');
                    break;
                case 'silenced':
                    playNoise(0.04, 0.08);
                    playSound('decay', 800, 0.03, 0.05, 'sine');
                    break;
            }
        }

        function playHitSound() {
            playSound('static', 800, 0.1, 0.15, 'sine');
        }

        function playExplosionSound() {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(80, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.6);
            gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.7);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.7);
            playNoise(0.3, 0.4);
        }

        function playDeathSound() {
            playSound('decay', 200, 0.5, 0.3, 'sawtooth');
        }

        function playKnifeSwing() {
            playSound('decay', 1500, 0.1, 0.12, 'triangle');
        }

        // Звук шагов
        let _stepTimer = 0;
        function playFootstep(isWalking) {
            const freq = 100 + Math.random() * 60;
            const vol = isWalking ? 0.04 : 0.08;
            const dur = 0.06;
            // Проверяем поверхность — на платформе звук выше
            const onPlatform = footY > 0.1;
            if (onPlatform) {
                playNoise(dur, vol * 0.7);
                playSound('decay', freq + 200, dur, vol * 0.5, 'square');
            } else {
                playNoise(dur, vol);
                playSound('decay', freq, dur, vol * 0.3, 'triangle');
            }
        }

        // Индикатор направления урона
        function showDamageIndicator(fromX, fromZ) {
            const el = document.getElementById('dmg-indicator');
            const dx = fromX - camera.position.x;
            const dz = fromZ - camera.position.z;
            const angleToSource = Math.atan2(dx, dz);
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            const camAngle = Math.atan2(camDir.x, camDir.z);
            const relAngle = angleToSource - camAngle;
            const arrow = document.createElement('div');
            arrow.className = 'dmg-arrow';
            arrow.style.transformOrigin = '50% 90px';
            arrow.style.transform = 'translateX(-50%) rotate(' + (relAngle * 180 / Math.PI) + 'deg)';
            el.appendChild(arrow);
            setTimeout(() => arrow.remove(), 1500);
        }

        // Чат
        let chatOpen = false;
        function addChatMsg(name, msg) {
            const box = document.getElementById('chat-box');
            const el = document.createElement('div');
            el.className = 'chat-msg';
            el.innerHTML = '<span class="chat-name">' + name + ':</span> ' + msg;
            box.appendChild(el);
            setTimeout(() => el.remove(), 8000);
            // Ограничиваем до 8 сообщений
            while (box.children.length > 8) box.removeChild(box.firstChild);
        }

        function openChat() {
            chatOpen = true;
            document.getElementById('chat-input-box').style.display = 'block';
            document.getElementById('chat-input').value = '';
            document.getElementById('chat-input').focus();
            controls.unlock();
        }

        function closeChat() {
            chatOpen = false;
            document.getElementById('chat-input-box').style.display = 'none';
            if (!isDead) controls.lock();
        }

        function sendChat() {
            const input = document.getElementById('chat-input');
            const msg = input.value.trim();
            if (!msg) { closeChat(); return; }
            const name = document.getElementById('player-name')?.value || 'Player';
            addChatMsg(name, msg);
            if (mpActive) { mpSend({ t: 'chat', name, msg });
            }
            closeChat();
        }

        /* ========== WEAPON DEFINITIONS ========== */
        // dmg = урон по телу (BODY, без брони ~базовый)
        // Множители считаются из картинки (с бронёй):
        // head, belt, legs относительно body
        const weaponDefs = {
            knife:  { name: 'Knife',        slot: 'melee', ammo: Infinity, max: Infinity, res: 0,   rate: 400,  auto: false, dmg: 34,  headMult: 4.0, beltMult: 1.2, legMult: 0.75, spread: 0,     range: 3,   reloadTime: 0,    soundType: 'knife',        moveSpeed: 16, cost: 0,    killReward: 1500 },
            usp:    { name: 'USP-S',        slot: 'sec',   ammo: 12, max: 12, res: 36,  rate: 250,  auto: false, dmg: 14,  headMult: 4.14, beltMult: 1.21, legMult: 1.5,  spread: 0.008, range: 200, reloadTime: 1600, soundType: 'silenced',     moveSpeed: 13, cost: 0,    killReward: 300 },
            glock:  { name: 'Glock-18',     slot: 'sec',   ammo: 20, max: 20, res: 120, rate: 150,  auto: false, dmg: 11,  headMult: 4.0,  beltMult: 1.45, legMult: 1.36, spread: 0.012, range: 200, reloadTime: 1400, soundType: 'pistol',       moveSpeed: 13, cost: 200,  killReward: 300 },
            deagle: { name: 'Desert Eagle', slot: 'sec',   ammo: 7,  max: 7,  res: 35,  rate: 450,  auto: false, dmg: 35,  headMult: 4.03, beltMult: 1.26, legMult: 0.97, spread: 0.02,  range: 200, reloadTime: 1800, soundType: 'pistol-heavy', moveSpeed: 12, cost: 700,  killReward: 300 },
            mp5:    { name: 'MP5-SD',       slot: 'pri',   ammo: 30, max: 30, res: 120, rate: 80,   auto: true,  dmg: 27,  headMult: 4.0,  beltMult: 1.2,  legMult: 0.75, spread: 0.018, range: 120, reloadTime: 1800, soundType: 'silenced',     moveSpeed: 13, cost: 1500, killReward: 600 },
            vector: { name: 'Vector',       slot: 'pri',   ammo: 25, max: 25, res: 100, rate: 55,   auto: true,  dmg: 17,  headMult: 4.0,  beltMult: 1.2,  legMult: 0.75, spread: 0.016, range: 90,  reloadTime: 1600, soundType: 'smg',          moveSpeed: 13, cost: 1050, killReward: 600 },
            p90:    { name: 'P90',          slot: 'pri',   ammo: 50, max: 50, res: 100, rate: 70,   auto: true,  dmg: 26,  headMult: 4.0,  beltMult: 1.2,  legMult: 0.75, spread: 0.022, range: 100, reloadTime: 2200, soundType: 'smg',          moveSpeed: 12, cost: 2350, killReward: 600 },
            ak47:   { name: 'AK-47',        slot: 'pri',   ammo: 30, max: 30, res: 90,  rate: 100,  auto: true,  dmg: 27,  headMult: 4.0,  beltMult: 1.22, legMult: 0.96, spread: 0.015, range: 200, reloadTime: 1800, soundType: 'rifle',        moveSpeed: 11, cost: 2700, killReward: 300 },
            m4a4:   { name: 'M4A4',         slot: 'pri',   ammo: 30, max: 30, res: 90,  rate: 90,   auto: true,  dmg: 22,  headMult: 4.05, beltMult: 1.27, legMult: 1.09, spread: 0.012, range: 200, reloadTime: 1800, soundType: 'rifle',        moveSpeed: 11, cost: 3100, killReward: 300 },
            ssg08:  { name: 'SSG 08',       slot: 'pri',   ammo: 10, max: 10, res: 90,  rate: 1200, auto: false, dmg: 88,  headMult: 3.0,  beltMult: 1.2,  legMult: 0.75, spread: 0.003, range: 300, reloadTime: 2500, soundType: 'sniper-light', moveSpeed: 12, cost: 1700, killReward: 300, isSniper: true, zoomFov: 25 },
            awp:    { name: 'AWP',          slot: 'pri',   ammo: 5,  max: 5,  res: 30,  rate: 1500, auto: false, dmg: 111, headMult: 4.0,  beltMult: 1.24, legMult: 0.77, spread: 0.001, range: 500, reloadTime: 3000, soundType: 'sniper',       moveSpeed: 9,  cost: 4750, killReward: 100, isSniper: true, zoomFov: 15 },
        };

        /* ========== GAME STATE ========== */
        let hp = 100, armor = 0, moneyVal = 800, vY = 0, isReloading = false;
        let isOnGround = true;
        let footY = 0; // реальная позиция ног игрока

        /* ========== DOM CACHE ========== */
        // Кэшируем часто используемые DOM элементы чтобы не делать getElementById каждый кадр
        const DOM = {};
        const domIds = ['hp-bar','armor-bar','money','kills-counter','round-timer','w-name','w-count',
                        'ammo-bar','blood-fx','reload-hint','hitmarker','knife-range-indicator',
                        'scope-overlay','crosshair','weapon-slots','bomb-bar','bomb-bar-fill',
                        'defuse-bar','defuse-bar-fill','bomb-indicator','round-label','score-t',
                        'score-ct','team-label','death-screen','death-stats','freeze-screen',
                        'freeze-title','freeze-sub','round-end-screen','round-end-title',
                        'round-end-sub','buy-menu','settings-menu','flash-overlay','smoke-overlay'];
        // Заполняем после загрузки DOM
        document.addEventListener('DOMContentLoaded', () => {
            domIds.forEach(id => { DOM[id] = document.getElementById(id); });
        });
        // Также заполняем сразу (скрипт в конце body)
        domIds.forEach(id => { DOM[id] = document.getElementById(id); });

        /* ========== REUSABLE OBJECTS (избегаем new каждый кадр) ========== */
        const _v3a = new THREE.Vector3();
        const _v3b = new THREE.Vector3();
        const _box3 = new THREE.Box3();
        const EYE_HEIGHT = 1.6;
        let lastShotTime = 0, isMousedown = false, isDead = false, totalKills = 0, totalDeaths = 0;
        let roundTime = 120;
        let ebashMode = false;
        let gameActive = false;
        const _activeTimers = []; // для очистки при выходе в меню
        let lastFrameTime = performance.now();
        let isScoped = false;
        let defaultFov = 75;
        let mouseSensitivity = 1.0;
        let scopeSensitivity = 0.3;

        // ===== ROUND SYSTEM =====
        let scoreT = 0, scoreCT = 0;
        let playerTeam = 'CT'; // 'CT' or 'T'
        let roundNumber = 1;
        let roundPhase = 'live'; // 'live', 'freeze', 'end'
        let freezeTime = 0;
        const MAX_ROUNDS = 24; // MR12: 12 раундов на сторону
        const ROUNDS_PER_HALF = 12;
        const ROUNDS_TO_WIN = 13;
        let lossStreak = 0; // для прогрессивного loss bonus

        // ===== BOMB (C4) =====
        let bombPlanted = false;
        let bombTimer = 0;
        const BOMB_TIME = 40;
        const DEFUSE_TIME = 10;
        let isDefusing = false;
        let defuseProgress = 0;
        let bombMesh = null;
        // Bomb site positions (A and B)
        const bombSites = [
            { name: 'A', x: 65, z: 35 },
            { name: 'B', x: -65, z: 35 }
        ];
        let activeBombSite = null;

        // Inventory: player carries one melee, one secondary, one primary, grenades
        const inv = {
            melee: 'knife',
            sec: 'usp',
            pri: null,
            he: 0,
            flash: 0,
            smoke: 0,
            bomb: false  // T side gets bomb
        };
        let curSlot = 'melee'; // 'melee', 'sec', 'pri', 'he'
        let curWeapon = 'knife'; // key into weaponDefs

        // Per-weapon ammo state (separate from defs so buying resets properly)
        const ammoState = {};
        function initAmmo(wKey) {
            const def = weaponDefs[wKey];
            if (!def) return;
            ammoState[wKey] = { ammo: def.ammo === Infinity ? Infinity : def.ammo, res: def.res };
        }
        initAmmo('knife');
        initAmmo('usp');

        const keys_pressed = {};

        /* ========== PROCEDURAL TEXTURES ========== */
        function makeTexture(drawFn, size = 256) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            drawFn(ctx, size);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            return tex;
        }

        // Генерирует нормал-маппинг из текстуры (рельеф)
        function makeNormalMap(drawFn, size = 256, strength = 2) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            drawFn(ctx, size);
            const imgData = ctx.getImageData(0, 0, size, size);
            const px = imgData.data;
            const out = ctx.createImageData(size, size);
            const od = out.data;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = (y * size + x) * 4;
                    const l = px[i] * 0.3 + px[i+1] * 0.59 + px[i+2] * 0.11;
                    const xp = x < size-1 ? (y * size + x + 1) * 4 : i;
                    const yp = y < size-1 ? ((y+1) * size + x) * 4 : i;
                    const lx = px[xp] * 0.3 + px[xp+1] * 0.59 + px[xp+2] * 0.11;
                    const ly = px[yp] * 0.3 + px[yp+1] * 0.59 + px[yp+2] * 0.11;
                    od[i]   = 128 + (l - lx) * strength;
                    od[i+1] = 128 + (l - ly) * strength;
                    od[i+2] = 255;
                    od[i+3] = 255;
                }
            }
            ctx.putImageData(out, 0, 0);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            return tex;
        }

        /* ========== REAL TEXTURES ========== */
        const texLoader = new THREE.TextureLoader();

        function loadTex(path, repeatX = 1, repeatY = 1) {
            const tex = texLoader.load(path);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeatX, repeatY);
            return tex;
        }

        // Стены (кирпич)
        const texWall = loadTex('textures/wall_color.jpg', 4, 2);
        const nmWall = loadTex('textures/wall_normal.jpg', 4, 2);
        const roughWall = loadTex('textures/wall_roughness.jpg', 4, 2);

        // Пол
        const texFloor = loadTex('textures/floor_color.jpg', 20, 20);
        const nmFloor = loadTex('textures/floor_normal.jpg', 20, 20);
        const roughFloor = loadTex('textures/floor_roughness.jpg', 20, 20);

        // Ящики (дерево)
        const texCrate = loadTex('textures/crate_color.jpg', 1, 1);
        const nmCrate = loadTex('textures/crate_normal.jpg', 1, 1);
        const roughCrate = loadTex('textures/crate_roughness.jpg', 1, 1);

        // Бетон (платформы, металл)
        const texMetal = loadTex('textures/concrete_color.jpg', 2, 2);
        const nmMetal = loadTex('textures/concrete_normal.jpg', 2, 2);
        const roughMetal = loadTex('textures/concrete_roughness.jpg', 2, 2);

        /* ========== THREE.JS SETUP ========== */
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0xc8dff0, 80, 220);

        // Sky gradient via large sphere
        const skyGeo = new THREE.SphereGeometry(500, 16, 8);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: { topColor: { value: new THREE.Color(0x4488cc) }, bottomColor: { value: new THREE.Color(0xd4c4a0) } },
            vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
            fragmentShader: `uniform vec3 topColor, bottomColor; varying vec3 vPos; void main(){ float t = clamp((vPos.y+100.0)/400.0,0.0,1.0); gl_FragColor = vec4(mix(bottomColor,topColor,t),1.0); }`
        });
        scene.add(new THREE.Mesh(skyGeo, skyMat));

        const camera = new THREE.PerspectiveCamera(defaultFov, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        document.body.appendChild(renderer.domElement);

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        const colliders = [], bots = [], nades = [], worldMeshes = [];

        function box(w, h, d, x, z, col = 0x967c5f) {
            let texBase, nmBase, roughBase;
            if (col === C_CRATE) { texBase = 'crate'; }
            else if (col === C_METAL) { texBase = 'concrete'; }
            else if (col === C_FLOOR) { texBase = 'concrete'; }
            else { texBase = 'wall'; }

            // Масштабируем текстуру по размеру объекта (1 repeat = ~4 единицы)
            const texScale = 4;
            const repX = Math.max(1, Math.round(Math.max(w, d) / texScale));
            const repY = Math.max(1, Math.round(h / texScale));

            const tex = loadTex('textures/' + texBase + '_color.jpg', repX, repY);
            const nm = loadTex('textures/' + texBase + '_normal.jpg', repX, repY);
            const rough = loadTex('textures/' + texBase + '_roughness.jpg', repX, repY);

            const mat = new THREE.MeshStandardMaterial({
                color: 0xffffff, map: tex,
                normalMap: nm, normalScale: new THREE.Vector2(1.0, 1.0),
                roughnessMap: rough,
                metalness: col === C_METAL ? 0.1 : 0.0
            });
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, h / 2, z);
            m.castShadow = true;
            m.receiveShadow = true;
            scene.add(m);
            colliders.push(new THREE.Box3().setFromObject(m));
            worldMeshes.push(m);
            return m;
        }

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({
            color: 0xffffff, map: texFloor,
            normalMap: nmFloor, normalScale: new THREE.Vector2(0.8, 0.8),
            roughnessMap: roughFloor
        }));
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        scene.add(new THREE.AmbientLight(0xfff5e0, 1.0));
        const sun = new THREE.DirectionalLight(0xfff0cc, 1.4);
        sun.position.set(30, 50, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 300;
        sun.shadow.camera.left = -150;
        sun.shadow.camera.right = 150;
        sun.shadow.camera.top = 150;
        sun.shadow.camera.bottom = -150;
        sun.shadow.bias = -0.001;
        // Fill light from opposite side
        const fillLight = new THREE.DirectionalLight(0xaaccff, 0.3);
        fillLight.position.set(-20, 20, -30);
        scene.add(sun, fillLight);

        // Точечные источники света на сайтах для атмосферы
        const lightA = new THREE.PointLight(0xffddaa, 0.6, 40);
        lightA.position.set(65, 8, 35);
        scene.add(lightA);
        const lightB = new THREE.PointLight(0xaaddff, 0.6, 40);
        lightB.position.set(-65, 8, 35);
        scene.add(lightB);
        // Свет в мид
        const lightMid = new THREE.PointLight(0xffeedd, 0.4, 30);
        lightMid.position.set(0, 6, 0);
        scene.add(lightMid);

        // ===================== MIRAGE-INSPIRED MAP =====================
        // Colors
        const C_WALL  = 0xb8a898; // sandy wall
        const C_FLOOR = 0x9e8e7e; // floor tile
        const C_CRATE = 0x8B7355; // wood crate
        const C_METAL = 0x778899; // metal
        const C_DARK  = 0x555555; // dark concrete

        // Outer boundary walls (thickness 8, height 12)
        // North wall: z=+105
        box(220, 12, 8,   0,  105, C_WALL);
        // South wall: z=-105
        box(220, 12, 8,   0, -105, C_WALL);
        // West wall: x=-105
        box(8, 12, 220, -105,   0, C_WALL);
        // East wall: x=+105
        box(8, 12, 220,  105,   0, C_WALL);

        // ---- T SPAWN (south area, z: -80 to -60) ----
        // T-spawn back wall
        box(60, 5, 4,   0, -88, C_WALL);
        // T-spawn side barriers
        box(4, 5, 20, -28, -78, C_WALL);
        box(4, 5, 20,  28, -78, C_WALL);

        // ---- CT SPAWN (north area, z: +60 to +85) ----
        // CT-spawn back wall
        box(60, 5, 4,   0,  88, C_WALL);
        // CT-spawn side barriers
        box(4, 5, 20, -28,  78, C_WALL);
        box(4, 5, 20,  28,  78, C_WALL);

        // ---- MID ----
        // Mid top (window room) - left side wall
        box(4, 6, 30, -18,  10, C_WALL);
        // Mid top - right side wall
        box(4, 6, 30,  18,  10, C_WALL);
        // Window ledge (shootable through)
        box(36, 2, 4,   0,  -4, C_METAL);
        // Mid bottom connector wall left
        box(4, 6, 20, -18, -20, C_WALL);
        // Mid bottom connector wall right
        box(4, 6, 20,  18, -20, C_WALL);
        // Short stairs block
        box(10, 3, 10,  30, -10, C_FLOOR);
        // Top mid box (cover)
        box(6, 4, 6,    0,  15, C_CRATE);

        // ---- A SITE (right side, x: +40 to +90, z: +10 to +60) ----
        // A site platform (slightly raised)
        box(50, 1, 50,  65,  35, C_FLOOR);
        // A site back wall (CT side)
        box(50, 8, 4,   65,  60, C_WALL);
        // A site left wall (connects to mid)
        box(4, 8, 50,   40,  35, C_WALL);
        // Ticket booth / short wall on A
        box(12, 4, 4,   55,  15, C_WALL);
        // A site big box (left of site)
        box(8, 6, 8,    50,  30, C_CRATE);
        // A site small box
        box(5, 3, 5,    58,  25, C_CRATE);
        // A site triple stack
        box(8, 8, 8,    80,  45, C_CRATE);
        // Jungle wall (right boundary of A)
        box(4, 8, 50,   90,  35, C_WALL);
        // CT cross wall
        box(20, 5, 4,   75,  55, C_WALL);

        // ---- B SITE (left side, x: -40 to -90, z: +10 to +60) ----
        // B site platform
        box(50, 1, 50, -65,  35, C_FLOOR);
        // B site back wall
        box(50, 8, 4,  -65,  60, C_WALL);
        // B site right wall
        box(4, 8, 50,  -40,  35, C_WALL);
        // B van (big cover)
        box(10, 5, 18, -60,  25, C_METAL);
        // B small box
        box(5, 3, 5,   -72,  20, C_CRATE);
        // B big box
        box(8, 6, 8,   -78,  42, C_CRATE);
        // B left boundary wall
        box(4, 8, 50,  -90,  35, C_WALL);
        // B CT wall
        box(20, 5, 4,  -75,  55, C_WALL);

        // ---- APARTMENTS / T-RAMP to B (left corridor) ----
        // Outer apartment wall
        box(4, 6, 60,  -90, -25, C_WALL);
        // Inner apartment wall
        box(4, 6, 50,  -70, -20, C_WALL);
        // Apartment divider
        box(20, 4, 4,  -80,   5, C_WALL);
        // Apartment crates
        box(6, 4, 6,   -82, -10, C_CRATE);
        box(6, 4, 6,   -82, -30, C_CRATE);

        // ---- PALACE / T-RAMP to A (right corridor) ----
        // Outer palace wall
        box(4, 6, 60,   90, -25, C_WALL);
        // Inner palace wall
        box(4, 6, 50,   70, -20, C_WALL);
        // Palace divider
        box(20, 4, 4,   80,   5, C_WALL);
        // Palace crates
        box(6, 4, 6,    82, -10, C_CRATE);
        box(6, 4, 6,    82, -30, C_CRATE);

        // ---- CATWALK (diagonal connector mid to A) ----
        box(4, 4, 30,   30,  20, C_WALL);
        box(8, 2, 4,    38,   6, C_FLOOR); // catwalk step

        // ---- SHORT (connector mid to A, lower) ----
        box(4, 5, 15,   40, -10, C_WALL);
        box(10, 2, 4,   46,  -2, C_FLOOR);

        // ---- CONNECTOR (mid to B) ----
        box(4, 5, 15,  -40, -10, C_WALL);
        box(10, 2, 4,  -46,  -2, C_FLOOR);

        // ---- EXTRA COVER mid area ----
        box(5, 3, 5,   -8, -35, C_CRATE);
        box(5, 3, 5,    8, -35, C_CRATE);
        box(5, 3, 5,    0,  35, C_CRATE);

        // ---- DECORATIVE COLUMNS (убирают кубичность) ----
        function column(x, z, h = 10) {
            const mat = new THREE.MeshStandardMaterial({ color: C_WALL, map: texWall, roughness: 0.8 });
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, h, 10), mat);
            col.position.set(x, h / 2, z);
            col.castShadow = true; col.receiveShadow = true;
            scene.add(col);
            colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, h/2, z), new THREE.Vector3(1.2, h, 1.2)));
            worldMeshes.push(col);
            const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), mat);
            base.position.set(x, 0.15, z);
            base.castShadow = true; base.receiveShadow = true;
            scene.add(base);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), mat);
            cap.position.set(x, h - 0.15, z);
            cap.castShadow = true; cap.receiveShadow = true;
            scene.add(cap);
        }

        // Колонны только в открытых местах, подальше от стен
        column(-25, 62); column(25, 62);   // CT spawn — по бокам прохода, дальше от игрока
        column(44, 35);  column(44, 55);   // A site левый край
        column(-44, 35); column(-44, 55);  // B site правый край

        // ---- ARCHED DOORWAYS ----
        function arch(x, z, w) {
            const mat = new THREE.MeshStandardMaterial({ color: C_WALL, map: texWall, roughness: 0.85 });
            const pL = new THREE.Mesh(new THREE.BoxGeometry(1.0, 5, 1.0), mat);
            pL.position.set(x - w/2, 2.5, z);
            const pR = new THREE.Mesh(new THREE.BoxGeometry(1.0, 5, 1.0), mat);
            pR.position.set(x + w/2, 2.5, z);
            const top = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 1.0, 1.0), mat);
            top.position.set(x, 5.5, z);
            [pL, pR, top].forEach(m => {
                m.castShadow = true; m.receiveShadow = true;
                scene.add(m); worldMeshes.push(m);
            });
            colliders.push(new THREE.Box3().setFromObject(pL));
            colliders.push(new THREE.Box3().setFromObject(pR));
        }

        // Арка на выходе из CT спавна в мид
        arch(0, 63, 14);

        // ===================== SPAWN POINTS =====================
        // Player (CT) spawn: north area, clear of all walls
        // CT back wall at z=88 (z: 86-90), CT barriers at x=±28 (x: 26-30, -30 to -26)
        // Safe CT spawn: x=0, z=72 — between barriers, away from back wall ✓
        camera.position.set(0, EYE_HEIGHT, 72);
        footY = 0;

        /* ========== WEAPON 3D MODELS ========== */
        const gunG = new THREE.Group();

        const gltfLoader = new GLTFLoader();
        const gltfWeapons = {};

        // Маппинг: наше оружие -> Object3D имя в паке (родитель с мешами)
        const weaponMeshMap = {
            usp:    { obj: 'Usp45_Silenced',  mag: 'Pistol_Magazine_4',    scale: 0.01, pos: [0.12, 0.05, -0.06], rot: [0, Math.PI, 0] },
            glock:  { obj: 'Glock17',          mag: 'Pistol_Magazine_2',    scale: 0.01, pos: [0.12, 0.05, -0.06], rot: [0, Math.PI, 0] },
            deagle: { obj: 'Deagle',           mag: 'Pistol_Magazine_3',    scale: 0.01, pos: [0.12, 0.05, -0.06], rot: [0, Math.PI, 0] },
            mp5:    { obj: 'Mp5K',             mag: 'Mp5K_Magazine',        scale: 0.007, pos: [0.12, 0.02, -0.04], rot: [0.02, Math.PI + 0.06, 0] },
            p90:    { obj: 'P90',              mag: 'P90_Magazine',         scale: 0.007, pos: [0.12, 0.02, -0.04], rot: [0.02, Math.PI + 0.06, 0] },
            vector: { obj: 'Kriss_Vector',     mag: 'Kriss_Vector_Magazine',scale: 0.007, pos: [0.12, 0.02, -0.04], rot: [0.02, Math.PI + 0.06, 0] },
            ssg08:  { obj: 'L115_Awp',         mag: 'L115_Awp_Magazine',    scale: 0.006, pos: [0.15, -0.08, -0.04], rot: [0.05, Math.PI + 0.1, 0.02] },
            awp:    { obj: 'Barett',           mag: 'Barett_Magazine',      scale: 0.006, pos: [0.15, -0.08, -0.04], rot: [0.05, Math.PI + 0.1, 0.02] },
            ak47:   { obj: 'AK47',            mag: 'AK47_Magazine_Out',    scale: 0.006, pos: [0.12, 0.05, 0.0], rot: [0.02, Math.PI + 0.06, 0] },
            m4a4:   { obj: 'M16A4',           mag: 'M16A4_Magazine',       scale: 0.006, pos: [0.12, 0.05, 0.0], rot: [0.02, Math.PI + 0.06, 0] },
            knife:  { obj: null,               mag: null,                   scale: 0.05, pos: [0.1, 0.02, -0.08], rot: [0, Math.PI, Math.PI/3] },
        };

        gltfLoader.load('models/weapons_pack.glb', (gltf) => {
            console.log('[GLTF] Weapons pack loaded');

            // Собираем все Object3D по имени
            const allObjects = {};
            gltf.scene.traverse(child => {
                if (child.name) allObjects[child.name] = child;
            });

            for (const [wKey, mapping] of Object.entries(weaponMeshMap)) {
                const group = new THREE.Group();
                const mainObj = allObjects[mapping.obj];
                const magObj = allObjects[mapping.mag];

                if (mainObj) {
                    // Клонируем оружие (все дочерние меши)
                    const clone = mainObj.clone();
                    clone.position.set(0, 0, 0);
                    group.add(clone);

                    // Магазин — используем его локальную позицию (относительно родителя)
                    if (magObj) {
                        const magClone = magObj.clone();
                        // Магазин уже имеет правильную локальную позицию относительно оружия
                        // Просто добавляем как есть
                        group.add(magClone);
                    }
                }

                if (group.children.length > 0) {
                    gltfWeapons[wKey] = group;
                    console.log('[GLTF] Created weapon:', wKey);
                }
            }

            gltfWeapons._loaded = true;
            applyGltfWeapon(curWeapon);
        }, undefined, (err) => {
            console.warn('[GLTF] Failed to load weapons pack:', err);
        });

        // Загружаем нож отдельно (другой пак)
        gltfLoader.load('models/knife.glb', (gltf) => {
            console.log('[GLTF] Knife loaded. Objects:');
            gltf.scene.traverse(child => {
                if (child.isMesh || child.isObject3D) {
                    console.log('  ', child.type, child.name);
                }
            });
            const group = new THREE.Group();
            gltf.scene.traverse(child => {
                if (child.isMesh) {
                    const clone = child.clone();
                    clone.material = child.material.clone();
                    group.add(clone);
                }
            });
            if (group.children.length > 0) {
                gltfWeapons['knife'] = group;
                gltfWeapons['knife']._separate = true;
                console.log('[GLTF] Knife ready (' + group.children.length + ' meshes)');
                if (curWeapon === 'knife') applyGltfWeapon('knife');
            }
        }, undefined, (err) => {
            console.warn('[GLTF] Failed to load knife:', err);
        });

        // ===== GLTF/FBX CHARACTER MODELS =====
        let charAnimsCT1 = {};
        let charAnimsCT2 = {};
        let charAnimsT1 = {};
        let charAnimsT2 = {};
        let charModelsReady = false;
        let charModelsLoaded = 0;
        const CHAR_MODELS_TOTAL = 4;
        const fbxLoader = new FBXLoader();

        // Удаляем root motion из анимации (позиция/поворот корневой кости)
        function stripRootMotion(clip) {
            clip.tracks = clip.tracks.filter(track => {
                // Убираем треки позиции и поворота для Hips (root bone)
                if (track.name.includes('Hips') && (track.name.includes('.position') || track.name.includes('.quaternion'))) {
                    return false;
                }
                return true;
            });
            return clip;
        }

        // Универсальная загрузка модели с анимациями
        function loadCharModel(folder, modelRef, animsRef, label, onDone, suffix) {
            const s = suffix || '';
            fbxLoader.load(`models/${folder}/${folder}_idle${s}.fbx`, (fbx) => {
                console.log(`[CHAR] ${label} idle loaded. Animations:`, fbx.animations.length);
                fbx.scale.set(0.011, 0.011, 0.011);
                // Blender экспорт может менять ориентацию
                fbx.userData.rotOffset = s ? Math.PI / 3 : 0;
                fbx.traverse(child => {
                    if (child.isMesh || child.isSkinnedMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        const fixMat = (mat) => {
                            if (mat.map) mat.map.encoding = THREE.sRGBEncoding;
                            const newMat = new THREE.MeshStandardMaterial({
                                map: mat.map || null,
                                normalMap: mat.normalMap || null,
                                color: new THREE.Color(0xffffff),
                                roughness: 0.6,
                                metalness: 0.0,
                                emissive: new THREE.Color(0x555555),
                                emissiveIntensity: 1.2
                            });
                            if (mat.map) newMat.emissiveMap = mat.map;
                            return newMat;
                        };
                        if (Array.isArray(child.material)) {
                            child.material = child.material.map(fixMat);
                        } else {
                            child.material = fixMat(child.material);
                        }
                    }
                });
                modelRef.model = fbx;
                if (fbx.animations.length > 0) {
                    animsRef['idle'] = stripRootMotion(fbx.animations[0]);
                }

                fbxLoader.load(`models/${folder}/${folder}_walk${s}.fbx`, (walkFbx) => {
                    if (walkFbx.animations.length > 0) {
                        animsRef['walk'] = stripRootMotion(walkFbx.animations[0]);
                        console.log(`[CHAR] ${label} walk animation loaded`);
                    }

                    fbxLoader.load(`models/${folder}/${folder}_shoot${s}.fbx`, (shootFbx) => {
                        if (shootFbx.animations.length > 0) {
                            animsRef['shoot'] = stripRootMotion(shootFbx.animations[0]);
                            console.log(`[CHAR] ${label} shoot animation loaded`);
                        }
                        charModelsLoaded++;
                        console.log(`[CHAR] ${label} ready (${charModelsLoaded}/${CHAR_MODELS_TOTAL})`);
                        if (charModelsLoaded >= CHAR_MODELS_TOTAL) {
                            charModelsReady = true;
                            console.log('[CHAR] All models ready!');
                        }
                        if (onDone) onDone(fbx);
                    });
                });
            }, undefined, (err) => {
                console.warn(`[CHAR] Failed to load ${label}:`, err);
                charModelsLoaded++;
                if (charModelsLoaded >= CHAR_MODELS_TOTAL) charModelsReady = true;
            });
        }

        // Обёртки для хранения моделей
        const ct1Ref = { model: null };
        const ct2Ref = { model: null };
        const t1Ref = { model: null };
        const t2Ref = { model: null };

        loadCharModel('CT1', ct1Ref, charAnimsCT1, 'CT1', undefined, '1');
        loadCharModel('CT2', ct2Ref, charAnimsCT2, 'CT2', undefined, '1');
        loadCharModel('T1', t1Ref, charAnimsT1, 'T1');
        loadCharModel('T2', t2Ref, charAnimsT2, 'T2');

        function loadCharForBot(team, botIdx, callback) {
            // Выбираем модель по команде (чередуем по индексу бота)
            let sourceModel, anims;
            if (team === 'T') {
                const useFirst = (botIdx % 2 === 0);
                sourceModel = useFirst ? t1Ref.model : t2Ref.model;
                anims = useFirst ? charAnimsT1 : charAnimsT2;
                // Fallback если одна не загрузилась
                if (!sourceModel) { sourceModel = t1Ref.model || t2Ref.model; anims = t1Ref.model ? charAnimsT1 : charAnimsT2; }
            } else {
                const useFirst = (botIdx % 2 === 0);
                sourceModel = useFirst ? ct1Ref.model : ct2Ref.model;
                anims = useFirst ? charAnimsCT1 : charAnimsCT2;
                if (!sourceModel) { sourceModel = ct1Ref.model || ct2Ref.model; anims = ct1Ref.model ? charAnimsCT1 : charAnimsCT2; }
            }
            if (!sourceModel) { callback(null); return; }

            const clone = SkeletonUtils.clone(sourceModel);
            clone.scale.copy(sourceModel.scale);
            clone.traverse(child => {
                if (child.isMesh || child.isSkinnedMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Хитбоксы
            const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
            clone.traverse(child => {
                if (child.isBone) {
                    let hitboxName = null;
                    let size = null;
                    const n = child.name.toLowerCase();
                    if (n.includes('head')) { hitboxName = 'head'; size = [15, 15, 15]; }
                    else if (n.includes('spine')) { hitboxName = 'body'; size = [25, 20, 15]; }
                    else if (n.includes('hips')) { hitboxName = 'body'; size = [25, 15, 15]; }
                    else if ((n.includes('upleg') || n.includes('leg')) && !n.includes('foot')) { hitboxName = 'legs'; size = [10, 30, 10]; }
                    if (hitboxName && size) {
                        const hitbox = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), hitboxMat);
                        hitbox.name = hitboxName;
                        child.add(hitbox);
                    }
                }
            });

            // Найдём кость правой руки для оружия
            let rightHand = null;
            clone.traverse(child => {
                if (child.isBone) {
                    const n = child.name.toLowerCase();
                    if (n.includes('hand') || n.includes('wrist') || n.includes('arm')) {
                        console.log('[BONE]', child.name);
                    }
                    if (n === 'mixamorigrighthand' || child.name === 'mixamorigRightHand') {
                        rightHand = child;
                    }
                }
            });
            clone.userData.rightHand = rightHand;
            console.log('[CHAR] Right hand bone:', rightHand ? rightHand.name : 'NOT FOUND');

            // AnimationMixer
            const mixer = new THREE.AnimationMixer(clone);
            const actions = {};
            if (anims['idle']) {
                actions['idle'] = mixer.clipAction(anims['idle']);
                actions['idle'].play();
            }
            if (anims['walk']) {
                actions['walk'] = mixer.clipAction(anims['walk']);
            }
            if (anims['shoot']) {
                actions['shoot'] = mixer.clipAction(anims['shoot']);
            }
            clone.userData.mixer = mixer;
            clone.userData.actions = actions;
            clone.userData.currentAnim = 'idle';

            callback(clone);
        }

        // Единый масштаб и позиция для всех (один пак = одинаковая ориентация)
        const GUN_SCALE = 0.007;
        const GUN_POS = [0.02, 0.06, -0.08];
        const GUN_ROT = [0, Math.PI, 0];

        function applyGltfWeapon(wKey) {
            if (gunG.userData._gltfModel) {
                gunG.remove(gunG.userData._gltfModel);
                gunG.userData._gltfModel = null;
            }

            if (!gltfWeapons[wKey]) return false;

            Object.keys(weaponModels).forEach(k => (weaponModels[k].visible = false));

            const model = gltfWeapons[wKey].clone();

            // Нож — отдельные настройки
            if (gltfWeapons[wKey]._separate) {
                model.scale.set(0.035, 0.035, 0.035);
                model.position.set(-0.05, -0.12, -0.08);
                model.rotation.set(0.5, 0.3, -0.7);
            } else {
                const mapping = weaponMeshMap[wKey];
                const s = mapping && mapping.scale ? mapping.scale : GUN_SCALE;
                model.scale.set(s, s, s);
                const p = mapping && mapping.pos ? mapping.pos : GUN_POS;
                const r = mapping && mapping.rot ? mapping.rot : GUN_ROT;
                model.position.set(p[0], p[1], p[2]);
                model.rotation.set(r[0], r[1], r[2]);
            }

            gunG.add(model);
            gunG.userData._gltfModel = model;
            return true;
        }

        function makeBoxModel(parts) {
            const g = new THREE.Group();
            parts.forEach(p => {
                const mesh = new THREE.Mesh(
                    new THREE.BoxGeometry(p.s[0], p.s[1], p.s[2]),
                    new THREE.MeshStandardMaterial({ color: p.c, roughness: p.rough ?? 0.7, metalness: p.metal ?? 0.0 })
                );
                mesh.position.set(p.p[0], p.p[1], p.p[2]);
                if (p.r) mesh.rotation.set(p.r[0], p.r[1], p.r[2]);
                g.add(mesh);
            });
            return g;
        }

        const weaponModels = {
            knife: makeBoxModel([
                { s: [0.015, 0.005, 0.28], p: [0, 0.01, -0.02], c: 0xcccccc, metal: 0.8, rough: 0.2 }, // blade flat
                { s: [0.005, 0.04, 0.28],  p: [0, 0, -0.02],    c: 0xaaaaaa, metal: 0.9, rough: 0.1 }, // blade edge
                { s: [0.03, 0.025, 0.005], p: [0, 0, 0.12],     c: 0x888888, metal: 0.5 },             // guard
                { s: [0.025, 0.025, 0.14], p: [0, -0.005, 0.2], c: 0x3a2a1a, rough: 0.9 },             // handle
                { s: [0.028, 0.028, 0.01], p: [0, -0.005, 0.28],c: 0x555555, metal: 0.6 },             // pommel
            ]),
            usp: makeBoxModel([
                { s: [0.055, 0.11, 0.32], p: [0, 0.01, 0],      c: 0x1a1a1a, rough: 0.6 },  // slide
                { s: [0.05, 0.10, 0.18],  p: [0, -0.09, 0.05],  c: 0x222222, rough: 0.8 },  // grip
                { s: [0.035, 0.035, 0.14],p: [0, 0.04, -0.22],  c: 0x2a2a2a, rough: 0.5 },  // silencer
                { s: [0.04, 0.005, 0.28], p: [0, 0.06, 0],      c: 0x333333 },               // top rail
                { s: [0.02, 0.02, 0.06],  p: [0.02, 0.065, -0.1],c: 0x444444 },              // sight rear
                { s: [0.02, 0.02, 0.02],  p: [0.02, 0.065, -0.22],c: 0x444444 },             // sight front
            ]),
            glock: makeBoxModel([
                { s: [0.055, 0.105, 0.28],p: [0, 0.01, 0],      c: 0x111111, rough: 0.5 },
                { s: [0.05, 0.105, 0.16], p: [0, -0.085, 0.04], c: 0x1a1a1a, rough: 0.85 },
                { s: [0.04, 0.005, 0.24], p: [0, 0.06, 0],      c: 0x222222 },
                { s: [0.02, 0.02, 0.04],  p: [0.02, 0.065, -0.1],c: 0x333333 },
            ]),
            p250: makeBoxModel([
                { s: [0.055, 0.11, 0.28], p: [0, 0.01, 0],      c: 0x2a2a2a, rough: 0.6 },
                { s: [0.05, 0.10, 0.15],  p: [0, -0.09, 0.05],  c: 0x333333, rough: 0.85 },
                { s: [0.04, 0.005, 0.24], p: [0, 0.06, 0],      c: 0x3a3a3a },
            ]),
            deagle: makeBoxModel([
                { s: [0.065, 0.135, 0.36],p: [0, 0.01, 0],      c: 0xb0b0b0, metal: 0.7, rough: 0.3 },
                { s: [0.06, 0.125, 0.14], p: [0, -0.105, 0.08], c: 0x888888, rough: 0.7 },
                { s: [0.045, 0.005, 0.32],p: [0, 0.075, 0],     c: 0xcccccc, metal: 0.8 },
                { s: [0.025, 0.025, 0.06],p: [0.025, 0.08, -0.1],c: 0x999999 },
            ]),
            mp5: makeBoxModel([
                { s: [0.065, 0.12, 0.52], p: [0, 0.01, 0],      c: 0x1a1a1a, rough: 0.6 },
                { s: [0.05, 0.15, 0.07],  p: [0, -0.09, 0.1],   c: 0x222222, rough: 0.85 },
                { s: [0.035, 0.035, 0.14],p: [0, 0.04, -0.3],   c: 0x2a2a2a },  // silencer
                { s: [0.055, 0.07, 0.18], p: [0, 0.02, 0.3],    c: 0x111111 },  // stock
                { s: [0.04, 0.005, 0.48], p: [0, 0.065, 0],     c: 0x333333 },  // top rail
                { s: [0.06, 0.04, 0.12],  p: [0, -0.04, -0.05], c: 0x2a2a2a },  // foregrip
            ]),
            p90: makeBoxModel([
                { s: [0.075, 0.13, 0.48], p: [0, 0, 0],         c: 0x2a4a2a, rough: 0.7 },
                { s: [0.065, 0.055, 0.28],p: [0, 0.095, 0.02],  c: 0x3a5a3a },  // top mag
                { s: [0.055, 0.075, 0.14],p: [0, 0.02, 0.28],   c: 0x222222 },  // stock
                { s: [0.04, 0.005, 0.44], p: [0, 0.065, 0],     c: 0x4a6a4a },
            ]),
            ak47: makeBoxModel([
                { s: [0.075, 0.14, 0.65], p: [0, 0.01, 0],      c: 0x1a1a1a, rough: 0.6 },
                { s: [0.06, 0.17, 0.09],  p: [0, -0.11, 0.1],   c: 0x3a2a1a, rough: 0.9 },  // grip
                { s: [0.055, 0.09, 0.22], p: [0, 0.02, 0.38],   c: 0x3a2a1a, rough: 0.9 },  // stock
                { s: [0.06, 0.06, 0.18],  p: [0, -0.04, -0.1],  c: 0x2a2a2a },              // foregrip
                { s: [0.05, 0.005, 0.6],  p: [0, 0.075, 0],     c: 0x333333 },              // top
                { s: [0.025, 0.025, 0.04],p: [0, 0.08, -0.28],  c: 0x444444 },              // sight
            ]),
            m4a4: makeBoxModel([
                { s: [0.065, 0.13, 0.68], p: [0, 0.01, 0],      c: 0x1a1a1a, rough: 0.55 },
                { s: [0.055, 0.15, 0.07], p: [0, -0.1, 0.1],    c: 0x222222, rough: 0.85 },
                { s: [0.055, 0.09, 0.24], p: [0, 0.02, 0.4],    c: 0x1a1a1a },
                { s: [0.06, 0.06, 0.2],   p: [0, -0.04, -0.08], c: 0x2a2a2a },
                { s: [0.045, 0.005, 0.62],p: [0, 0.07, 0],      c: 0x333333 },
                { s: [0.03, 0.04, 0.1],   p: [0, 0.09, 0.02],   c: 0x444444 },  // carry handle
            ]),
            ssg08: makeBoxModel([
                { s: [0.055, 0.11, 0.78], p: [0, 0.01, 0],      c: 0x2a2a2a, rough: 0.6 },
                { s: [0.05, 0.13, 0.07],  p: [0, -0.09, 0.15],  c: 0x3a3a3a, rough: 0.85 },
                { s: [0.065, 0.09, 0.26], p: [0, 0.02, 0.45],   c: 0x3a2a1a, rough: 0.9 },
                { s: [0.04, 0.07, 0.14],  p: [0, 0.1, 0.0],     c: 0x111111 },  // scope body
                { s: [0.025, 0.025, 0.04],p: [0, 0.14, 0.0],    c: 0x222222 },  // scope top
                { s: [0.03, 0.03, 0.02],  p: [0, 0.1, -0.08],   c: 0x333333 },  // scope lens
                { s: [0.03, 0.03, 0.02],  p: [0, 0.1, 0.08],    c: 0x333333 },
            ]),
            awp: makeBoxModel([
                { s: [0.065, 0.12, 0.92], p: [0, 0.01, 0],      c: 0x1a2a1a, rough: 0.6 },
                { s: [0.06, 0.15, 0.08],  p: [0, -0.11, 0.2],   c: 0x2a3a2a, rough: 0.85 },
                { s: [0.075, 0.11, 0.32], p: [0, 0.02, 0.5],    c: 0x2a3a2a, rough: 0.9 },
                { s: [0.06, 0.06, 0.2],   p: [0, -0.04, -0.1],  c: 0x1a2a1a },
                { s: [0.045, 0.08, 0.18], p: [0, 0.11, 0.0],    c: 0x0a0a0a },  // scope
                { s: [0.03, 0.03, 0.04],  p: [0, 0.16, 0.0],    c: 0x111111 },
                { s: [0.035, 0.035, 0.02],p: [0, 0.11, -0.1],   c: 0x222222 },  // lens
                { s: [0.035, 0.035, 0.02],p: [0, 0.11, 0.1],    c: 0x222222 },
            ]),
            he: (() => {
                const g = new THREE.Group();
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.7 }));
                const top = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0x445522 }));
                top.position.y = 0.12;
                const pin = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12), new THREE.MeshStandardMaterial({ color: 0xccaa00, metalness: 0.8 }));
                pin.position.y = 0.16; pin.rotation.x = Math.PI / 2;
                g.add(body, top, pin);
                return g;
            })()
        };

        Object.values(weaponModels).forEach(m => { m.visible = false; gunG.add(m); });
        camera.add(gunG);
        gunG.position.set(0.35, -0.3, -0.6);
        scene.add(camera);
        const flash = new THREE.PointLight(0xffaa00, 0, 3);
        gunG.add(flash);

        /* ========== ENEMIES ========== */
        // Bot spawn points разделены по командам
        const spawnPointsT = [
            {x: -50, z: -70},
            {x:  50, z: -70},
            {x:   0, z: -60},
            {x: -20, z: -50},
            {x:  20, z: -50},
            {x: -60, z: -50},
            {x:  60, z: -50},
        ];
        const spawnPointsCT = [
            {x: -55, z:  72},
            {x:  55, z:  72},
            {x:   0, z:  50},
            {x: -30, z:  60},
            {x:  30, z:  60},
        ];

        // Переиспользуемые объекты для ботов (не создаём new каждый кадр)
        const _botDir = new THREE.Vector3();
        const _botStrafe = new THREE.Vector3();
        const _botMovePos = new THREE.Vector3();
        const _botBox = new THREE.Box3();
        const _botRay = new THREE.Raycaster();
        const _botShootDir = new THREE.Vector3();
        // Переиспользуемые объекты для стрельбы игрока
        const _shootRay = new THREE.Raycaster();
        const _spreadVec = new THREE.Vector2();
        const _animKeys = ['thighL','thighR','shinL','shinR','upperArmL','upperArmR'];
        // 10 скинов CT (синие/зелёные тона)
        const skinsCT = [
            { bodyCol: 0x2a4a6a, vestCol: 0x1a3a5a, pantsCol: 0x1a2a3a, skinCol: 0xd4956a, helmetCol: 0x1a2a3a },
            { bodyCol: 0x3d513d, vestCol: 0x2a3a2a, pantsCol: 0x3a4a3a, skinCol: 0xe8b88a, helmetCol: 0x222222 },
            { bodyCol: 0x4a4a6a, vestCol: 0x333355, pantsCol: 0x2a2a4a, skinCol: 0xc68642, helmetCol: 0x222244 },
            { bodyCol: 0x556b2f, vestCol: 0x3a4a1a, pantsCol: 0x4a5a2a, skinCol: 0xf1c27d, helmetCol: 0x2a3a1a },
            { bodyCol: 0x1a3a5a, vestCol: 0x0a2a4a, pantsCol: 0x0a1a2a, skinCol: 0xdaa520, helmetCol: 0x0a1a2a },
            { bodyCol: 0x5a5a7a, vestCol: 0x3a3a5a, pantsCol: 0x2a2a4a, skinCol: 0xe0ac69, helmetCol: 0x333355 },
            { bodyCol: 0x2a5a4a, vestCol: 0x1a4a3a, pantsCol: 0x1a3a2a, skinCol: 0xd4956a, helmetCol: 0x1a3a2a },
            { bodyCol: 0x3a3a6a, vestCol: 0x2a2a5a, pantsCol: 0x1a1a4a, skinCol: 0xc8a882, helmetCol: 0x222255 },
            { bodyCol: 0x4a6a4a, vestCol: 0x3a5a3a, pantsCol: 0x2a4a2a, skinCol: 0xf0d090, helmetCol: 0x2a4a2a },
            { bodyCol: 0x1a1a4a, vestCol: 0x0a0a3a, pantsCol: 0x0a0a2a, skinCol: 0xe8c090, helmetCol: 0x111133 },
        ];

        // 10 скинов T (коричневые/оранжевые тона)
        const skinsT = [
            { bodyCol: 0x8B4513, vestCol: 0x5a2a0a, pantsCol: 0x4a3020, skinCol: 0xe8b88a, helmetCol: 0x333333 },
            { bodyCol: 0x6b4226, vestCol: 0x4a2a10, pantsCol: 0x3a2010, skinCol: 0xd4956a, helmetCol: 0x2a1a0a },
            { bodyCol: 0x8b6914, vestCol: 0x6a4a0a, pantsCol: 0x5a3a0a, skinCol: 0xc68642, helmetCol: 0x3a2a0a },
            { bodyCol: 0x5a3a1a, vestCol: 0x3a2a0a, pantsCol: 0x2a1a0a, skinCol: 0xf1c27d, helmetCol: 0x1a1a0a },
            { bodyCol: 0x9a6a2a, vestCol: 0x7a4a1a, pantsCol: 0x5a3a1a, skinCol: 0xdaa520, helmetCol: 0x4a2a0a },
            { bodyCol: 0x4a4a2a, vestCol: 0x3a3a1a, pantsCol: 0x2a2a0a, skinCol: 0xe0ac69, helmetCol: 0x2a2a0a },
            { bodyCol: 0x7a3a1a, vestCol: 0x5a2a0a, pantsCol: 0x3a1a0a, skinCol: 0xd4956a, helmetCol: 0x2a1a0a },
            { bodyCol: 0x6a5a2a, vestCol: 0x4a3a1a, pantsCol: 0x3a2a0a, skinCol: 0xc8a882, helmetCol: 0x2a1a0a },
            { bodyCol: 0x3a2a1a, vestCol: 0x2a1a0a, pantsCol: 0x1a0a00, skinCol: 0xf0d090, helmetCol: 0x1a0a00 },
            { bodyCol: 0xaa6a1a, vestCol: 0x8a4a0a, pantsCol: 0x6a3a0a, skinCol: 0xe8c090, helmetCol: 0x4a2a0a },
        ];

        function makeBotModel(variant) {
            const g = new THREE.Group();
            const v = variant;
            const M = (geo, col, rough = 0.85, metal = 0) =>
                new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: metal }));

            // Торс — цилиндр вместо бокса
            const torso = M(new THREE.CylinderGeometry(0.22, 0.2, 0.7, 8), v.bodyCol);
            torso.position.y = 0.15;

            // Бронежилет поверх торса
            const vest = M(new THREE.CylinderGeometry(0.24, 0.22, 0.5, 8), v.vestCol);
            vest.position.y = 0.2;

            // Плечи
            const shoulderL = M(new THREE.SphereGeometry(0.13, 7, 6), v.bodyCol);
            shoulderL.position.set(0.32, 0.38, 0);
            const shoulderR = shoulderL.clone(); shoulderR.position.set(-0.32, 0.38, 0);

            // Руки верхние (цилиндры)
            const upperArmL = M(new THREE.CylinderGeometry(0.09, 0.08, 0.38, 7), v.bodyCol);
            upperArmL.position.set(0.38, 0.12, 0);
            upperArmL.rotation.z = 0.2;
            const upperArmR = upperArmL.clone(); upperArmR.position.set(-0.38, 0.12, 0);
            upperArmR.rotation.z = -0.2;

            // Руки нижние
            const lowerArmL = M(new THREE.CylinderGeometry(0.075, 0.07, 0.34, 7), v.skinCol, 0.7);
            lowerArmL.position.set(0.42, -0.18, 0.05);
            lowerArmL.rotation.set(0.3, 0, 0.25);
            const lowerArmR = lowerArmL.clone(); lowerArmR.position.set(-0.42, -0.18, 0.05);
            lowerArmR.rotation.set(0.3, 0, -0.25);

            // Шея
            const neck = M(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), v.skinCol, 0.7);
            neck.position.y = 0.57;

            // Голова — слегка сплюснутая сфера
            const head = M(new THREE.SphereGeometry(0.19, 10, 8), v.skinCol, 0.75);
            head.scale.set(1, 1.05, 0.95);
            head.position.y = 0.78;
            head.name = 'head';

            // Шлем
            const helmetBase = M(new THREE.SphereGeometry(0.21, 10, 7, 0, Math.PI*2, 0, Math.PI*0.6), v.helmetCol, 0.6);
            helmetBase.position.y = 0.82;
            // Козырёк шлема
            const brim = M(new THREE.BoxGeometry(0.38, 0.04, 0.12), v.helmetCol, 0.6);
            brim.position.set(0, 0.76, -0.16);

            // Таз
            const hip = M(new THREE.CylinderGeometry(0.19, 0.17, 0.22, 8), v.pantsCol);
            hip.position.y = -0.32;

            // Бёдра
            const thighL = M(new THREE.CylinderGeometry(0.1, 0.09, 0.42, 7), v.pantsCol);
            thighL.position.set(0.13, -0.62, 0); thighL.name = 'thighL';
            const thighR = thighL.clone(); thighR.position.set(-0.13, -0.62, 0); thighR.name = 'thighR';

            // Голени
            const shinL = M(new THREE.CylinderGeometry(0.08, 0.07, 0.38, 7), v.pantsCol);
            shinL.position.set(0.13, -0.98, 0); shinL.name = 'shinL';
            const shinR = shinL.clone(); shinR.position.set(-0.13, -0.98, 0); shinR.name = 'shinR';

            // Ботинки
            const bootL = M(new THREE.BoxGeometry(0.18, 0.12, 0.28), 0x1a1a1a, 0.95);
            bootL.position.set(0.13, -1.2, 0.04); bootL.name = 'bootL';
            const bootR = bootL.clone(); bootR.position.set(-0.13, -1.2, 0.04); bootR.name = 'bootR';

            // Оружие (добавляется отдельно в конструкторе)

            g.add(torso, vest, shoulderL, shoulderR, upperArmL, upperArmR,
                  lowerArmL, lowerArmR, neck, head, helmetBase, brim,
                  hip, thighL, thighR, shinL, shinR, bootL, bootR);

            // Сохраняем ссылки для анимации
            g.userData.thighL = thighL;
            g.userData.thighR = thighR;
            g.userData.shinL  = shinL;
            g.userData.shinR  = shinR;
            g.userData.upperArmL = upperArmL;
            g.userData.upperArmR = upperArmR;

            // Включаем тени на всех мешах
            g.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

            return g;
        }

        // Варианты оружий для ботов
        const botWeaponDefs = [
            { key: 'ak47',  rate: 1200, range: 55, color: 0x4a3728 },
            { key: 'm4a4',  rate: 1100, range: 55, color: 0x2a2a2a },
            { key: 'awp',   rate: 3500, range: 80, color: 0x2a4a2a },
            { key: 'deagle',rate: 2000, range: 35, color: 0xb0b0b0 },
            { key: 'mp5',   rate: 900,  range: 30, color: 0x1a1a1a },
            { key: 'p90',   rate: 800,  range: 28, color: 0x3a5a3a },
        ];

        function makeBotGun(wKey) {
            const g = new THREE.Group();
            const M = (geo, col, metal = 0.3) =>
                new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: metal }));

            if (wKey === 'awp') {
                g.add(M(new THREE.BoxGeometry(0.05, 0.09, 0.85), 0x2a4a2a));
                const grip = M(new THREE.BoxGeometry(0.04, 0.13, 0.07), 0x333333);
                grip.position.set(0, -0.1, 0.2); g.add(grip);
                const scope = M(new THREE.BoxGeometry(0.035, 0.06, 0.16), 0x111111);
                scope.position.set(0, 0.08, 0); g.add(scope);
            } else if (wKey === 'ak47') {
                g.add(M(new THREE.BoxGeometry(0.055, 0.12, 0.65), 0x1a1a1a));
                const stock = M(new THREE.BoxGeometry(0.05, 0.09, 0.2), 0x4a3728); stock.position.set(0, 0.01, 0.38); g.add(stock);
                const mag = M(new THREE.BoxGeometry(0.045, 0.16, 0.07), 0x333333); mag.position.set(0, -0.12, 0.1); g.add(mag);
            } else if (wKey === 'm4a4') {
                g.add(M(new THREE.BoxGeometry(0.05, 0.11, 0.65), 0x1a1a1a));
                const stock = M(new THREE.BoxGeometry(0.045, 0.08, 0.22), 0x222222); stock.position.set(0, 0.01, 0.38); g.add(stock);
                const mag = M(new THREE.BoxGeometry(0.04, 0.14, 0.06), 0x333333); mag.position.set(0, -0.11, 0.1); g.add(mag);
            } else if (wKey === 'deagle') {
                g.add(M(new THREE.BoxGeometry(0.055, 0.12, 0.34), 0xb0b0b0, 0.7));
                const grip = M(new THREE.BoxGeometry(0.05, 0.12, 0.06), 0x888888); grip.position.set(0, -0.1, 0.08); g.add(grip);
            } else if (wKey === 'mp5') {
                g.add(M(new THREE.BoxGeometry(0.05, 0.1, 0.5), 0x1a1a1a));
                const sil = M(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), 0x2a2a2a); sil.rotation.x = Math.PI/2; sil.position.set(0, 0.03, -0.3); g.add(sil);
                const mag = M(new THREE.BoxGeometry(0.04, 0.13, 0.06), 0x333333); mag.position.set(0, -0.1, 0.1); g.add(mag);
            } else { // p90
                g.add(M(new THREE.BoxGeometry(0.06, 0.11, 0.46), 0x3a5a3a));
                const topMag = M(new THREE.BoxGeometry(0.055, 0.05, 0.26), 0x4a6a4a); topMag.position.set(0, 0.08, 0.02); g.add(topMag);
            }
            return g;
        }

        class Enemy {
            constructor(idx) {
                // Боты всегда за противоположную команду игрока
                const botTeam = playerTeam === 'CT' ? 'T' : 'CT';
                this.botTeam = botTeam;
                const skins = botTeam === 'CT' ? skinsCT : skinsT;
                const variant = skins[idx % skins.length];

                this.isDead = false; this.idx = idx;
                this.walkPhase = Math.random() * Math.PI * 2;

                // Назначаем оружие ДО загрузки модели
                this.weaponDef = botWeaponDefs[idx % botWeaponDefs.length];

                // Всегда создаём примитивную модель как placeholder
                this.g = makeBotModel(variant);
                this.useGltf = false;

                // Асинхронно загружаем GLTF модель по команде бота
                const self = this;
                const tryLoadGltf = () => {
                    loadCharForBot(self.botTeam, self.idx, (model) => {
                        if (!model) return;
                        const oldG = self.g;
                        const pos = oldG.position.clone();
                        const rot = oldG.rotation.clone();
                        scene.remove(oldG);
                        self.g = model;
                        self.g.position.copy(pos);
                        self.g.position.y = 0;
                        self.g.rotation.copy(rot);
                        self.useGltf = true;

                        // Добавляем модель оружия в руку
                        if (model.userData.rightHand && gltfWeapons._loaded && self.weaponDef) {
                            const wKey = self.weaponDef.key;
                            if (gltfWeapons[wKey]) {
                                const weaponClone = gltfWeapons[wKey].clone();
                                weaponClone.scale.set(0.7, 0.7, 0.7);
                                weaponClone.position.set(5.5, 20, 0);
                                weaponClone.quaternion.identity();
                                const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
                                const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
                                weaponClone.quaternion.copy(qX.multiply(qZ));
                                model.userData.rightHand.add(weaponClone);
                                self.gunMesh = weaponClone;
                                console.log('[CHAR] Weapon attached to:', model.userData.rightHand.name);
                            }
                        }

                        // Убираем box-оружие если было
                        if (self._boxGun) { self.g.remove(self._boxGun); self._boxGun = null; }

                        scene.add(self.g);
                    });
                };
                // Если модели готовы — загружаем сразу, иначе ждём
                if (charModelsReady) {
                    tryLoadGltf();
                } else {
                    const waitInterval = setInterval(() => {
                        if (charModelsReady) {
                            clearInterval(waitInterval);
                            tryLoadGltf();
                        }
                    }, 200);
                }

                // Добавляем box-модель оружия как placeholder
                const gunModel = makeBotGun(this.weaponDef.key);
                gunModel.position.set(0.42, -0.1, -0.3);
                this.g.add(gunModel);
                this.gunMesh = gunModel;
                this._boxGun = gunModel;

                this.g.castShadow = true;
                scene.add(this.g);
                this.respawn();
            }
            respawn() {
                this.isDead = false; this.g.visible = true; this.g.rotation.set(0, 0, 0);
                // Боты спавнятся на стороне противоположной игроку
                const botTeamPoints = playerTeam === 'CT' ? spawnPointsT : spawnPointsCT;
                const sp = botTeamPoints[this.idx % botTeamPoints.length];
                // Try spawn point, then nearby offsets until clear of colliders
                const candidates = [
                    {x: sp.x, z: sp.z},
                    {x: sp.x + 5, z: sp.z}, {x: sp.x - 5, z: sp.z},
                    {x: sp.x, z: sp.z + 5}, {x: sp.x, z: sp.z - 5},
                    {x: sp.x + 8, z: sp.z + 8}, {x: sp.x - 8, z: sp.z + 8},
                ];
                let placed = false;
                for (const c of candidates) {
                    const testBox = new THREE.Box3().setFromCenterAndSize(
                        new THREE.Vector3(c.x, 1.0, c.z),
                        new THREE.Vector3(1.0, 2.0, 1.0)
                    );
                    if (!colliders.some(col => col.intersectsBox(testBox))) {
                        this.g.position.set(c.x, this.useGltf ? 0 : 0.85, c.z);
                        placed = true;
                        break;
                    }
                }
                if (!placed) this.g.position.set(sp.x, this.useGltf ? 0 : 0.85, sp.z); // fallback
                this.hp = 100;
                this.lastS = 0;
                this.strafeTimer = 0;
                this.strafeDir = Math.random() > 0.5 ? 1 : -1;
                this.vY = 0;
            }
            die() {
                if (this.isDead) return;
                this.isDead = true;
                this.g.rotation.x = -Math.PI / 2.2;
                this.g.position.y = this.useGltf ? 0.5 : 0.3;
                // Не респавним автоматически — респавн только при новом раунде
            }
            update(dt) {
                if (this.isDead) return;
                const dist = this.g.position.distanceTo(camera.position);
                const botFloorY = this.useGltf ? 0 : 0.85;
                // Поворот к игроку плавно по Y оси
                const rotOffset = (this.g.userData && this.g.userData.rotOffset) || 0;
                const targetAngle = Math.atan2(
                    camera.position.x - this.g.position.x,
                    camera.position.z - this.g.position.z
                ) - 0.7 + rotOffset;
                // Плавная интерполяция угла
                let angleDiff = targetAngle - this.g.rotation.y;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                this.g.rotation.y += angleDiff * Math.min(1, 8 * dt);

                // Gravity (только для старых моделей — GLTF стоят на y=0)
                if (!this.useGltf) {
                    this.vY -= 22 * dt;
                    this.g.position.y += this.vY * dt;
                    if (this.g.position.y < botFloorY) {
                        this.g.position.y = botFloorY;
                        this.vY = 0;
                    }
                }

                let isMoving = false;
                if (dist > 8 && dist < 150) {
                    const speed = 4.5 * dt;
                    _botDir.subVectors(camera.position, this.g.position).setY(0).normalize();
                    this.strafeTimer -= dt;
                    if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 1.5 + Math.random() * 2; }
                    _botStrafe.set(-_botDir.z, 0, _botDir.x).multiplyScalar(this.strafeDir * 0.3);
                    _botMovePos.copy(this.g.position);
                    _botMovePos.addScaledVector(_botDir, speed);
                    _botMovePos.addScaledVector(_botStrafe, speed);
                    _botBox.setFromCenterAndSize(_botMovePos, _v3a.set(1.0, 2, 1.0));
                    if (!colliders.some(c => c.intersectsBox(_botBox))) {
                        this.g.position.x = _botMovePos.x;
                        this.g.position.z = _botMovePos.z;
                        isMoving = true;
                    }
                    this.g.position.x = THREE.MathUtils.clamp(this.g.position.x, -110, 110);
                    this.g.position.z = THREE.MathUtils.clamp(this.g.position.z, -110, 110);
                }

                // Анимация
                const ud = this.g.userData;
                if (ud.mixer) {
                    ud.mixer.update(dt);
                    const actions = ud.actions;
                    // Возврат из shoot анимации
                    if (ud.currentAnim === 'shoot' && this._shootEndTime && Date.now() > this._shootEndTime) {
                        const targetAnim = isMoving ? 'walk' : 'idle';
                        if (actions[targetAnim]) {
                            actions['shoot'].fadeOut(0.2);
                            actions[targetAnim].reset().fadeIn(0.2).play();
                            ud.currentAnim = targetAnim;
                        }
                        this._shootEndTime = null;
                    }
                    // Переключение idle/walk (не во время стрельбы)
                    if (ud.currentAnim !== 'shoot') {
                        const targetAnim = isMoving ? 'walk' : 'idle';
                        if (actions && ud.currentAnim !== targetAnim && actions[targetAnim]) {
                            const from = actions[ud.currentAnim];
                            const to = actions[targetAnim];
                            if (from) from.fadeOut(0.3);
                            to.reset().fadeIn(0.3).play();
                            ud.currentAnim = targetAnim;
                        }
                    }
                } else {
                    // Fallback: процедурная анимация для старых моделей
                    if (isMoving) {
                        this.walkPhase += dt * 8;
                        const sw = Math.sin(this.walkPhase);
                        const sw2 = Math.sin(this.walkPhase + Math.PI);
                        if (ud.thighL) ud.thighL.rotation.x = sw * 0.4;
                        if (ud.thighR) ud.thighR.rotation.x = sw2 * 0.4;
                        if (ud.shinL)  ud.shinL.rotation.x  = Math.max(0, sw) * 0.5;
                        if (ud.shinR)  ud.shinR.rotation.x  = Math.max(0, sw2) * 0.5;
                        if (ud.upperArmL) ud.upperArmL.rotation.x = sw2 * 0.3;
                        if (ud.upperArmR) ud.upperArmR.rotation.x = sw * 0.3;
                    } else {
                        _animKeys.forEach(k => { if (ud[k]) ud[k].rotation.x *= 0.85; });
                    }
                }

                // Visibility check
                _botShootDir.subVectors(camera.position, this.g.position).normalize();
                _botRay.set(this.g.position.clone().setY(1.2), _botShootDir);
                const hits = _botRay.intersectObjects(worldMeshes);
                const isVisible = hits.length === 0 || hits[0].distance > dist;

                if (dist < this.weaponDef.range && isVisible && Date.now() - this.lastS > this.weaponDef.rate) {
                    // Анимация стрельбы
                    if (ud.mixer && ud.actions && ud.actions['shoot'] && ud.currentAnim !== 'shoot') {
                        const from = ud.actions[ud.currentAnim];
                        if (from) from.fadeOut(0.15);
                        ud.actions['shoot'].reset().fadeIn(0.15).play();
                        ud.currentAnim = 'shoot';
                        // Вернуться к idle через время выстрела
                        this._shootEndTime = Date.now() + 600;
                    }
                    const accuracy = Math.max(0.25, 1 - dist / (this.weaponDef.range * 1.5));
                    if (Math.random() < accuracy) {
                        // Случайная зона попадания с весами
                        const r = Math.random();
                        let zone;
                        if (r < 0.08)       zone = 'head';  // 8% голова
                        else if (r < 0.58)  zone = 'body';  // 50% тело
                        else if (r < 0.78)  zone = 'belt';  // 20% пояс
                        else                zone = 'legs';  // 22% ноги

                        // Используем weaponDefs если оружие бота есть там, иначе botWeaponDefs
                        const wd = weaponDefs[this.weaponDef.key] || this.weaponDef;
                        let dmg;
                        if (wd.headMult) {
                            // Используем calcDmg с нужной зоной
                            const fakeMesh = zone === 'head' ? 'head' : zone === 'belt' ? 'thighL' : zone === 'legs' ? 'shinL' : 'body';
                            dmg = calcDmg(wd, fakeMesh);
                        } else {
                            dmg = wd.dmg;
                        }
                        if (armor > 0) {
                            const absorbed = Math.floor(dmg * 0.6);
                            armor = Math.max(0, armor - absorbed);
                            dmg -= absorbed;
                        }
                        hp -= dmg;
                        hp = Math.max(0, hp);
                        updateUI();
                        DOM['blood-fx'].style.boxShadow = 'inset 0 0 80px rgba(255,0,0,0.6)';
                        setTimeout(() => DOM['blood-fx'].style.boxShadow = 'none', 150);
                        showDamageIndicator(this.g.position.x, this.g.position.z);
                    }
                    this.lastS = Date.now();
                    if (hp <= 0 && !isDead) playerDeath();
                }
            }
        }
        for (let i = 0; i < 5; i++) bots.push(new Enemy(i));

        /* ========== CONTROLS ========== */
        const controls = new PointerLockControls(camera, document.body);
        // Загружаем настройки из localStorage
        const savedSettings = JSON.parse(localStorage.getItem('cs_mirage_settings') || '{}');
        if (savedSettings.sens) mouseSensitivity = savedSettings.sens;
        if (savedSettings.scopeSens) scopeSensitivity = savedSettings.scopeSens;
        if (savedSettings.playerName) {
            const nameEl = document.getElementById('player-name');
            if (nameEl) nameEl.value = savedSettings.playerName;
        }

        function saveSettings() {
            localStorage.setItem('cs_mirage_settings', JSON.stringify({
                sens: mouseSensitivity,
                scopeSens: scopeSensitivity,
                playerName: document.getElementById('player-name')?.value || 'Player'
            }));
        }

        controls.pointerSpeed = mouseSensitivity;

        window.updateSensitivity = (val) => {
            mouseSensitivity = parseFloat(val);
            if (!isScoped) controls.pointerSpeed = mouseSensitivity;
            ['sens-value', 'sens-value-ig'].forEach(id => { const el = document.getElementById(id); if (el) el.innerText = mouseSensitivity.toFixed(1); });
            ['sens-slider', 'sens-slider-ig'].forEach(id => { const el = document.getElementById(id); if (el) el.value = mouseSensitivity; });
            saveSettings();
        };

        window.updateScopeSensitivity = (val) => {
            scopeSensitivity = parseFloat(val);
            if (isScoped) controls.pointerSpeed = scopeSensitivity;
            ['scope-sens-value', 'scope-sens-value-ig'].forEach(id => { const el = document.getElementById(id); if (el) el.innerText = scopeSensitivity.toFixed(1); });
            ['scope-sens-slider', 'scope-sens-slider-ig'].forEach(id => { const el = document.getElementById(id); if (el) el.value = scopeSensitivity; });
            saveSettings();
        };

        window.setQuality = (q) => {
            if (q === 'low') {
                renderer.setPixelRatio(0.5);
                renderer.shadowMap.enabled = false;
                scene.fog.far = 120;
            } else if (q === 'medium') {
                renderer.setPixelRatio(1);
                renderer.shadowMap.enabled = true;
                sun.shadow.mapSize.width = 1024;
                sun.shadow.mapSize.height = 1024;
                scene.fog.far = 220;
            } else {
                renderer.setPixelRatio(window.devicePixelRatio);
                renderer.shadowMap.enabled = true;
                sun.shadow.mapSize.width = 2048;
                sun.shadow.mapSize.height = 2048;
                scene.fog.far = 300;
            }
            renderer.setSize(window.innerWidth, window.innerHeight);
            const saved = JSON.parse(localStorage.getItem('cs_mirage_settings') || '{}');
            saved.quality = q;
            localStorage.setItem('cs_mirage_settings', JSON.stringify(saved));
        };

        // Загружаем качество
        if (savedSettings.quality) {
            setQuality(savedSettings.quality);
            const sel = document.getElementById('quality-select');
            if (sel) sel.value = savedSettings.quality;
        }

        window.toggleMenuSettings = () => {
            const s = document.getElementById('menu-settings');
            const c = document.getElementById('menu-controls');
            s.style.display = s.style.display === 'block' ? 'none' : 'block';
            if (s.style.display === 'block') c.style.display = 'none';
        };

        window.toggleMenuControls = () => {
            const c = document.getElementById('menu-controls');
            const s = document.getElementById('menu-settings');
            c.style.display = c.style.display === 'block' ? 'none' : 'block';
            if (c.style.display === 'block') s.style.display = 'none';
        };

        window.closeSettings = () => {
            document.getElementById('settings-menu').style.display = 'none';
            if (!isDead) controls.lock();
        };

        window.goToMainMenu = () => {
            gameActive = false;
            ebashMode = false;
            document.getElementById('settings-menu').style.display = 'none';
            document.getElementById('team-select').style.display = 'none';
            document.getElementById('mp-click-to-play').style.display = 'none';
            controls.unlock();
            isDead = false;
            isReloading = false;
            bombPlanted = false;
            roundPhase = 'live';

            // Убираем дропнутое оружие со сцены
            droppedWeapons.forEach(dw => scene.remove(dw.mesh));
            droppedWeapons.length = 0;

            // Очищаем все активные таймеры
            _activeTimers.forEach(t => clearInterval(t));
            _activeTimers.length = 0;

            // Очищаем bullet holes
            if (createImpact._holes) {
                createImpact._holes.forEach(h => scene.remove(h));
                createImpact._holes.length = 0;
            }

            // Убираем удалённых игроков
            Object.values(mpRemotePlayers).forEach(rp => scene.remove(rp.mesh));
            mpRemotePlayers = {};
            if (mpPeer) { mpPeer.destroy(); mpPeer = null; }
            mpActive = false; mpConn = null;

            // Сбрасываем UI
            document.getElementById('death-screen').style.display = 'none';
            document.getElementById('buy-menu').style.display = 'none';
            document.getElementById('round-end-screen').style.display = 'none';
            document.getElementById('freeze-screen').style.display = 'none';
            document.getElementById('bomb-bar').style.display = 'none';
            document.getElementById('bomb-indicator').style.display = 'none';
            // Сбрасываем статистику
            totalKills = 0; totalDeaths = 0; lossStreak = 0;
            scoreT = 0; scoreCT = 0; roundNumber = 1;
            hp = 100; armor = 0; moneyVal = 800; vY = 0; footY = 0;
            inv.pri = null; inv.he = 0; inv.flash = 0; inv.smoke = 0;
            ammoState['usp'] = { ammo: weaponDefs.usp.ammo, res: weaponDefs.usp.res };
            switchSlot('sec');
            camera.position.set(0, EYE_HEIGHT, 72);
            document.getElementById('lobby').style.display = 'flex';
        };

        function playerDeath() {
            isDead = true;
            totalDeaths++;
            playDeathSound();
            unscope();

            // Дроп текущего оружия при смерти
            if (inv.pri) dropWeapon(inv.pri, camera.position);
            if (inv.sec && inv.sec !== 'usp') dropWeapon(inv.sec, camera.position);

            controls.unlock();
            document.getElementById('death-screen').style.display = 'flex';
            document.getElementById('death-stats').innerText = `Kills: ${totalKills} | Money: $${moneyVal}`;
        }

        window.respawnPlayer = () => {
            // В онлайн режиме — не респавним кнопкой, ждём новый раунд
            if (mpActive) {
                document.getElementById('death-stats').innerText = 'Waiting for next round...';
                return;
            }
            hp = ebashMode ? 5000 : 100;
            armor = 0; isDead = false;
            moneyVal = ebashMode ? 999999 : 800;
            const spawnZ = playerTeam === 'CT' ? 72 : -72;
            camera.position.set(0, EYE_HEIGHT, spawnZ);
            footY = 0;
            vY = 0;

            // Сбрасываем инвентарь — оставляем только нож и USP-S
            inv.pri = null;
            inv.he = 0; inv.flash = 0; inv.smoke = 0;
            inv.sec = 'usp';
            ammoState['usp'] = { ammo: weaponDefs.usp.ammo, res: weaponDefs.usp.res };
            switchSlot('sec');

            document.getElementById('death-screen').style.display = 'none';
            updateUI();
            controls.lock();
        };

        window.buy = (id) => {
            if (isDead) return;
            const def = weaponDefs[id];

            if (id === 'armor') {
                if (moneyVal >= 1000) { armor = 100; moneyVal -= 1000; }
                updateUI(); return;
            }
            if (id === 'he') {
                if (moneyVal >= 300 && inv.he < 1) { inv.he++; moneyVal -= 300; }
                updateUI(); return;
            }
            if (id === 'flash') {
                if (moneyVal >= 200 && inv.flash < 2) { inv.flash++; moneyVal -= 200; }
                updateUI(); return;
            }
            if (id === 'smoke') {
                if (moneyVal >= 300 && inv.smoke < 1) { inv.smoke++; moneyVal -= 300; }
                updateUI(); return;
            }

            if (!def) return;
            const cost = def.cost;
            if (cost > moneyVal) return;

            const slot = def.slot;
            if (slot === 'sec') {
                if (inv.sec === id) return; // already have it
                inv.sec = id;
                moneyVal -= cost;
                initAmmo(id);
                if (curSlot === 'sec') switchSlot('sec');
            } else if (slot === 'pri') {
                if (inv.pri === id) return;
                inv.pri = id;
                moneyVal -= cost;
                initAmmo(id);
                switchSlot('pri');
            }
            updateUI();
        };

        window.closeBuyMenu = () => {
            document.getElementById('buy-menu').style.display = 'none';
            if (!isDead) controls.lock();
        };

        function getCurrentWeaponKey() {
            if (curSlot === 'melee') return inv.melee;
            if (curSlot === 'sec') return inv.sec;
            if (curSlot === 'pri') return inv.pri;
            if (curSlot === 'he') return 'he';
            if (curSlot === 'flash') return 'flash';
            if (curSlot === 'smoke') return 'smoke';
            return 'knife';
        }

        function unscope() {
            if (isScoped) {
                isScoped = false;
                camera.fov = defaultFov;
                camera.updateProjectionMatrix();
                DOM['scope-overlay'].style.display = 'none';
                DOM['crosshair'].classList.remove('sniper-scope');
                controls.pointerSpeed = mouseSensitivity;
                const wKey = getCurrentWeaponKey();
                // Показываем GLTF модель если есть, иначе box-модель
                if (!applyGltfWeapon(wKey)) {
                    if (weaponModels[wKey]) weaponModels[wKey].visible = true;
                }
            }
        }

        function switchSlot(s) {
            if (isDead || isReloading) return;
            if (s === 'pri' && !inv.pri) return;
            if (s === 'he' && inv.he <= 0) return;
            if (s === 'flash' && inv.flash <= 0) return;
            if (s === 'smoke' && inv.smoke <= 0) return;
            if (s === 'bomb' && !inv.bomb) return;

            unscope();
            curSlot = s;
            curWeapon = getCurrentWeaponKey();

            Object.keys(weaponModels).forEach(k => (weaponModels[k].visible = false));
            if (weaponModels[curWeapon]) weaponModels[curWeapon].visible = true;
            // Применяем GLTF модель
            applyGltfWeapon(curWeapon);
            updateUI();
            updateSlotDisplay();
        }

        function updateSlotDisplay() {
            const container = document.getElementById('weapon-slots');
            container.innerHTML = '';
            const slots = [
                { key: 'melee', label: `3: ${weaponDefs[inv.melee]?.name || 'Knife'}` },
                { key: 'sec', label: `2: ${weaponDefs[inv.sec]?.name || 'None'}` },
            ];
            if (inv.pri) slots.push({ key: 'pri', label: `1: ${weaponDefs[inv.pri]?.name || 'None'}` });
            if (inv.he > 0) slots.push({ key: 'he', label: `4: HE Grenade x${inv.he}` });
            if (inv.flash > 0) slots.push({ key: 'flash', label: `5: Flashbang x${inv.flash}` });
            if (inv.smoke > 0) slots.push({ key: 'smoke', label: `6: Smoke` });
            if (inv.bomb) slots.push({ key: 'bomb', label: `7: C4 Bomb` });

            slots.reverse().forEach(s => {
                const div = document.createElement('div');
                div.className = 'slot-item' + (curSlot === s.key ? ' active' : '');
                div.innerText = s.label;
                container.appendChild(div);
            });
        }

        // Определяем часть тела по имени меша и считаем урон
        function getHitZone(meshName) {
            if (meshName === 'head') return 'head';
            if (meshName === 'thighL' || meshName === 'thighR') return 'belt'; // бёдра = belt зона
            if (meshName === 'shinL'  || meshName === 'shinR'  ||
                meshName === 'bootL'  || meshName === 'bootR') return 'legs';
            return 'body';
        }

        function calcDmg(wDef, hitMeshName) {
            const zone = getHitZone(hitMeshName);
            const base = wDef.dmg;
            if (zone === 'head') return Math.round(base * (wDef.headMult || 4.0));
            if (zone === 'belt') return Math.round(base * (wDef.beltMult || 1.2));
            if (zone === 'legs') return Math.round(base * (wDef.legMult  || 0.75));
            return base; // body
        }

        function showHitmarker() {
            const hm = document.getElementById('hitmarker');
            hm.style.display = 'block';
            playHitSound();
            setTimeout(() => (hm.style.display = 'none'), 100);
        }

        function knifeAttack() {
            if (isDead) return;
            playKnifeSwing();
            if (mpActive) { mpSend({ t: 'sound', weapon: 'knife', x: camera.position.x, z: camera.position.z });
            }

            // Knife swing animation
            const origX = gunG.rotation.y;
            gunG.rotation.y = -0.5;
            gunG.position.z = -0.3;
            setTimeout(() => {
                gunG.rotation.y = origX;
            }, 150);

            // Show slash indicator
            const indicator = document.getElementById('knife-range-indicator');
            indicator.style.display = 'block';
            setTimeout(() => indicator.style.display = 'none', 200);

            // Raycast for knife hit
            const ray = new THREE.Raycaster();
            ray.setFromCamera(new THREE.Vector2(0, 0), camera);
            ray.far = weaponDefs.knife.range;

            const activeBots = bots.filter(b => !b.isDead).map(b => b.g);
            const botH = ray.intersectObjects(activeBots, true);
            const wallH = ray.intersectObjects(worldMeshes);

            if (botH.length > 0 && (wallH.length === 0 || botH[0].distance < wallH[0].distance)) {
                let hitObj = botH[0].object;
                while (hitObj.parent && !bots.some(b => b.g === hitObj)) hitObj = hitObj.parent;
                const target = bots.find(b => b.g === hitObj);
                if (target && !target.isDead) {
                    const isHeadshot = botH[0].object.name === 'head';
                    const dmg = calcDmg(weaponDefs.knife, botH[0].object.name);
                    target.hp -= dmg;
                    showHitmarker();
                    if (target.hp <= 0) {
                        dropWeapon(target.weaponDef ? target.weaponDef.key : null, target.g.position);
                        target.die();
                        totalKills++;
                        moneyVal += weaponDefs.knife.killReward;
                        addMsg('Knife', isHeadshot);
                        updateUI();
                        checkAllBotsDead();
                    }
                }
            }

            // Проверка ножом по удалённым игрокам (MP)
            if (mpActive && Object.keys(mpRemotePlayers).length > 0) {
                const rpMeshes = Object.entries(mpRemotePlayers).map(([pid, rp]) => ({ pid, mesh: rp.mesh }));
                const rpHits = ray.intersectObjects(rpMeshes.map(r => r.mesh), true);
                if (rpHits.length > 0 && (wallH.length === 0 || rpHits[0].distance < wallH[0].distance)) {
                    const dmg = calcDmg(weaponDefs.knife, rpHits[0].object.name);
                    showHitmarker();
                    if (mpActive) { mpSend({ t: 'hit', dmg, sx: camera.position.x, sz: camera.position.z }); }
                }
            }
        }

        function shoot() {
            if (isReloading || isDead) return;

            if (curSlot === 'melee') { knifeAttack(); return; }
            if (curSlot === 'he') { throwHe(); return; }
            if (curSlot === 'flash') { throwFlash(); return; }
            if (curSlot === 'smoke') { throwSmoke(); return; }
            if (curSlot === 'bomb') { plantBomb(); return; }

            const wKey = curWeapon;
            const wDef = weaponDefs[wKey];
            const wAmmo = ammoState[wKey];
            if (!wDef || !wAmmo) return;

            if (wAmmo.ammo <= 0) { reload(); return; }

            wAmmo.ammo--;
            updateUI();
            playShotSound(wKey);
            // Отправляем звук выстрела другому игроку
            if (mpActive) { mpSend({ t: 'sound', weapon: wKey, x: camera.position.x, z: camera.position.z });
            }
            flash.intensity = wDef.soundType === 'silenced' ? 1 : 5;
            setTimeout(() => (flash.intensity = 0), 30);

            // Дым от выстрела
            if (wDef.soundType !== 'silenced') {
                const smokePuff = new THREE.Mesh(
                    new THREE.SphereGeometry(0.01, 3, 3),
                    new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.2 })
                );
                smokePuff.position.copy(camera.position);
                const gunDir = new THREE.Vector3();
                camera.getWorldDirection(gunDir);
                smokePuff.position.addScaledVector(gunDir, -0.5);
                smokePuff.position.y -= 0.1;
                scene.add(smokePuff);
                let smokeLife = 0;
                const smokeTick = setInterval(() => {
                    smokeLife += 0.016;
                    smokePuff.position.y += 0.003;
                    smokePuff.scale.multiplyScalar(1.03);
                    smokePuff.material.opacity -= 0.02;
                    if (smokeLife > 0.25 || smokePuff.material.opacity <= 0 || !gameActive) { clearInterval(smokeTick); scene.remove(smokePuff); _activeTimers.splice(_activeTimers.indexOf(smokeTick), 1); }
                }, 16);
                _activeTimers.push(smokeTick);
            }

            // Recoil
            const recoilZ = wDef.isSniper ? 0.2 : 0.12;
            const recoilX = wDef.isSniper ? 0.06 : 0.03;
            gunG.position.z += recoilZ;
            gunG.rotation.x -= recoilX;

            // Spread (reduced when scoped)
            let spread = wDef.spread;
            if (isScoped) spread *= 0.15;

            const ray = _shootRay;
            _spreadVec.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
            ray.setFromCamera(_spreadVec, camera);
            ray.far = wDef.range;

            const activeBots = bots.filter(b => !b.isDead).map(b => b.g);
            const botH = ray.intersectObjects(activeBots, true);
            const wallH = ray.intersectObjects(worldMeshes);

            if (botH.length > 0 && (wallH.length === 0 || botH[0].distance < wallH[0].distance)) {
                let hitObj = botH[0].object;
                while (hitObj.parent && !bots.some(b => b.g === hitObj)) hitObj = hitObj.parent;
                const target = bots.find(b => b.g === hitObj);
                if (target && !target.isDead) {
                    const isHeadshot = botH[0].object.name === 'head';
                    const dmg = calcDmg(wDef, botH[0].object.name);
                    target.hp -= dmg;
                    showHitmarker();
                    if (target.hp <= 0) {
                        dropWeapon(target.weaponDef ? target.weaponDef.key : null, target.g.position);
                        target.die();
                        totalKills++;
                        moneyVal += wDef.killReward;
                        addMsg(wDef.name, isHeadshot);
                        updateUI();
                        checkAllBotsDead();
                    }
                }
            } else if (wallH.length > 0) {
                createImpact(wallH[0].point);
            }

            // Проверка попадания по удалённым игрокам (MP)
            if (mpActive && Object.keys(mpRemotePlayers).length > 0) {
                const rpMeshes = Object.entries(mpRemotePlayers).map(([pid, rp]) => ({ pid, mesh: rp.mesh }));
                const rpHits = ray.intersectObjects(rpMeshes.map(r => r.mesh), true);
                if (rpHits.length > 0 && (wallH.length === 0 || rpHits[0].distance < wallH[0].distance)) {
                    let hitMesh = rpHits[0].object;
                    while (hitMesh.parent && !rpMeshes.some(r => r.mesh === hitMesh)) hitMesh = hitMesh.parent;
                    const entry = rpMeshes.find(r => r.mesh === hitMesh);
                    if (entry) {
                        const isHeadshot = rpHits[0].object.name === 'head';
                        const dmg = calcDmg(wDef, rpHits[0].object.name);
                        showHitmarker();
                        if (mpActive) { mpSend({ t: 'hit', dmg, sx: camera.position.x, sz: camera.position.z, weapon: wDef.name, headshot: isHeadshot }); }
                    }
                }
            }

            // AWP/Scout: unscope after shot
            if (wDef.isSniper && isScoped) {
                setTimeout(() => unscope(), 80);
            }
        }

        function createImpact(pos) {
            // Muzzle flash spark
            const spark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 5), new THREE.MeshBasicMaterial({ color: 0xffdd44 }));
            spark.position.copy(pos);
            scene.add(spark);
            setTimeout(() => scene.remove(spark), 60);

            // Bullet hole decal (max 50)
            if (!createImpact._holes) createImpact._holes = [];
            const hole = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, depthWrite: false }));
            hole.position.copy(pos);
            hole.position.addScaledVector(new THREE.Vector3().subVectors(camera.position, pos).normalize(), 0.02);
            hole.lookAt(camera.position);
            scene.add(hole);
            createImpact._holes.push(hole);
            if (createImpact._holes.length > 50) {
                scene.remove(createImpact._holes.shift());
            }

            // Debris particles
            const dir = new THREE.Vector3().subVectors(camera.position, pos).normalize();
            for (let i = 0; i < 6; i++) {
                const p = new THREE.Mesh(
                    new THREE.SphereGeometry(0.025 + Math.random() * 0.03, 3, 3),
                    new THREE.MeshBasicMaterial({ color: 0x998877 })
                );
                p.position.copy(pos);
                const vel = new THREE.Vector3(
                    dir.x * 0.5 + (Math.random() - 0.5) * 3,
                    Math.random() * 3 + 1,
                    dir.z * 0.5 + (Math.random() - 0.5) * 3
                );
                scene.add(p);
                let life = 0;
                const tick = setInterval(() => {
                    life += 0.016;
                    p.position.addScaledVector(vel, 0.016);
                    vel.y -= 9.8 * 0.016;
                    if (life > 0.4 || !gameActive) { clearInterval(tick); scene.remove(p); _activeTimers.splice(_activeTimers.indexOf(tick), 1); }
                }, 16);
                _activeTimers.push(tick);
            }
        }

        let _reloadAnim = 0; // 0 = нет, >0 = прогресс анимации

        function reload() {
            if (curSlot === 'melee' || curSlot === 'he') return;
            const wKey = curWeapon;
            const wDef = weaponDefs[wKey];
            const wAmmo = ammoState[wKey];
            if (!wDef || !wAmmo) return;
            if (isReloading || wAmmo.ammo === wDef.max || wAmmo.res <= 0) return;

            unscope();
            isReloading = true;
            _reloadAnim = 0.001;
            document.getElementById('reload-hint').style.display = 'block';
            setTimeout(() => {
                if (curWeapon !== wKey) { isReloading = false; _reloadAnim = 0; document.getElementById('reload-hint').style.display = 'none'; return; }
                const take = Math.min(wDef.max - wAmmo.ammo, wAmmo.res);
                wAmmo.ammo += take;
                wAmmo.res -= take;
                isReloading = false;
                _reloadAnim = 0;
                document.getElementById('reload-hint').style.display = 'none';
                updateUI();
            }, wDef.reloadTime);
        }

        function throwHe() {
            if (inv.he <= 0 || isDead) return;
            inv.he--;
            const pos = camera.position.clone();
            const d = new THREE.Vector3();
            camera.getWorldDirection(d);
            const velocity = d.clone().multiplyScalar(17).add(new THREE.Vector3(0, 4.5, 0));
            spawnHe(pos, velocity);
            // Синхронизация в онлайне
            if (mpActive) { mpSend({ t: 'nade', kind: 'he', x: pos.x, y: pos.y, z: pos.z, vx: velocity.x, vy: velocity.y, vz: velocity.z });
            }
            if (inv.he === 0 && curSlot === 'he') switchSlot(inv.pri ? 'pri' : 'sec');
            updateUI();
        }

        function spawnHe(pos, velocity) {
            const n = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshStandardMaterial({ color: 0x556b2f }));
            n.position.copy(pos);
            n.userData = { v: velocity.clone(), t: 2.1 };
            scene.add(n);
            nades.push(n);
        }

        function toggleScope() {
            const wKey = curWeapon;
            const wDef = weaponDefs[wKey];
            if (!wDef || !wDef.isSniper || isReloading || isDead) return;

            if (isScoped) {
                unscope();
            } else {
                isScoped = true;
                camera.fov = wDef.zoomFov;
                camera.updateProjectionMatrix();
                DOM['scope-overlay'].style.display = 'block';
                DOM['crosshair'].classList.add('sniper-scope');
                // Hide weapon model when scoped
                if (weaponModels[wKey]) weaponModels[wKey].visible = false;
                // Также скрываем GLTF модель
                if (gunG.userData._gltfModel) gunG.userData._gltfModel.visible = false;
            }
        }

        function updateUI() {
            if (ebashMode) {
                moneyVal = 999999;
                if (!isDead) hp = Math.min(5000, hp + 50);
            }
            const wKey = curWeapon;
            const wDef = weaponDefs[wKey];
            const wAmmo = ammoState[wKey];
            let wName = '', wCount = '';
            if (curSlot === 'he') { wName = 'HE GRENADE'; wCount = `${inv.he}`; }
            else if (curSlot === 'melee') { wName = wDef ? wDef.name : 'Knife'; wCount = '—'; }
            else if (wDef && wAmmo) { wName = wDef.name; wCount = `${wAmmo.ammo} / ${wAmmo.res}`; }
            DOM['w-name'].innerText = wName;
            DOM['w-count'].innerText = wCount;
            if (ebashMode) {
                DOM['hp-bar'].innerHTML = `✚ ${hp} <span style="font-size:18px;color:#ff6600">💀ЕБАШЬ</span>`;
            } else {
                DOM['hp-bar'].innerText = `✚ ${hp}`;
            }
            DOM['armor-bar'].innerText = armor > 0 ? `🛡 ${armor}` : '';
            DOM['money'].innerText = `$ ${moneyVal}`;
            DOM['kills-counter'].innerText = `☠ ${totalKills}`;
            updateSlotDisplay();
        }

        function updateTimer() {
            const m = Math.floor(roundTime / 60);
            const s = Math.floor(roundTime % 60);
            document.getElementById('round-timer').innerText = `${m}:${s.toString().padStart(2, '0')}`;
        }

        function addMsg(weaponName, headshot = false, shooter = 'YOU') {
            const f = document.getElementById('kill-feed');
            const m = document.createElement('div');
            m.className = 'kill-msg';
            m.innerText = `${shooter} 🔫 Terrorist [${weaponName}]${headshot ? ' ★ HEADSHOT' : ''}`;
            f.appendChild(m);
            setTimeout(() => m.remove(), 3500);
        }

        /* ========== INPUT ========== */
        function updateScoreboard() {
            const playerName = document.getElementById('player-name')?.value || 'Player';
            document.getElementById('sb-round-label').innerText = `Round ${roundNumber}`;
            document.getElementById('sb-rows').innerHTML = `
                <div class="sb-row player">
                    <div class="sb-name player-name">★ ${playerName}</div>
                    <div class="sb-val sb-kills">${totalKills}</div>
                    <div class="sb-val">${totalDeaths}</div>
                    <div class="sb-val sb-money">$${moneyVal}</div>
                </div>
                ${bots.map((b, i) => `
                <div class="sb-row">
                    <div class="sb-name" style="color:#aaa">Bot ${i+1} <span style="font-size:10px;color:#666">[${b.weaponDef?.key?.toUpperCase() || 'AK47'}]</span></div>
                    <div class="sb-val sb-kills">—</div>
                    <div class="sb-val">—</div>
                    <div class="sb-val" style="color:#555">—</div>
                </div>`).join('')}
            `;
        }

        document.addEventListener('keydown', e => {
            keys_pressed[e.code] = true;
            if (e.code === 'Tab') {
                e.preventDefault();
                updateScoreboard();
                document.getElementById('scoreboard').style.display = 'block';
            }
            if (e.code === 'Backspace') {
                const settingsMenu = document.getElementById('settings-menu');
                if (settingsMenu.style.display === 'block') {
                    closeSettings();
                } else {
                    settingsMenu.style.display = 'block';
                    controls.unlock();
                }
            }
            if (e.code === 'Digit1') switchSlot('pri');
            if (e.code === 'Digit2') switchSlot('sec');
            if (e.code === 'Digit3') switchSlot('melee');
            if (e.code === 'Digit4') switchSlot('he');
            if (e.code === 'Digit5') switchSlot('flash');
            if (e.code === 'Digit6') switchSlot('smoke');
            if (e.code === 'Digit7') switchSlot('bomb');
            if (e.code === 'KeyR') reload();
            if (e.code === 'KeyQ') { /* Quick switch to last weapon */ }
            if (e.code === 'KeyT' && !chatOpen) { e.preventDefault(); openChat(); }
            if (e.code === 'Enter' && chatOpen) { e.preventDefault(); sendChat(); }
            if (e.code === 'Escape' && chatOpen) { closeChat(); return; }
            if (e.code === 'KeyB') {
                const menu = document.getElementById('buy-menu');
                if (menu.style.display === 'block') closeBuyMenu();
                else { menu.style.display = 'block'; controls.unlock(); }
            }
        });
        document.addEventListener('keyup', e => {
            keys_pressed[e.code] = false;
            if (e.code === 'Tab') document.getElementById('scoreboard').style.display = 'none';
        });

        document.addEventListener('mousedown', e => {
            if (!controls.isLocked) return;
            if (isDead) return;
            if (e.button === 0) {
                isMousedown = true;
                shoot();
                lastShotTime = Date.now();
            }
            if (e.button === 2) {
                // Right click: scope for snipers
                toggleScope();
            }
        });
        document.addEventListener('mouseup', e => { if (e.button === 0) isMousedown = false; });
        document.addEventListener('contextmenu', e => e.preventDefault());

        document.body.addEventListener('click', () => {
            const lobby = document.getElementById('lobby');
            const teamSelect = document.getElementById('team-select');
            const onlineLobby = document.getElementById('online-lobby');
            const mpClick = document.getElementById('mp-click-to-play');
            if (lobby.style.display !== 'none') return;
            if (teamSelect.style.display !== 'none') return;
            if (onlineLobby.style.display !== 'none') return;
            if (mpClick.style.display !== 'none') return;
            if (chatOpen) return;
            if (document.getElementById('buy-menu').style.display !== 'block' &&
                document.getElementById('death-screen').style.display !== 'flex' && !isDead) {
                controls.lock();
            }
        });

        /* ========== RADAR ========== */
        const rCtx = document.getElementById('radar').getContext('2d');
        const RADAR_SIZE = 220;
        const RADAR_SCALE = 0.75; // мировые единицы → пиксели
        const MAP_BOUNDS = 115; // половина карты

        // Статичные зоны карты для отрисовки
        const radarZones = [
            { label: 'A',   x: 65,  z: 35,  w: 50, h: 50, col: 'rgba(255,100,50,0.12)' },
            { label: 'B',   x: -65, z: 35,  w: 50, h: 50, col: 'rgba(50,100,255,0.12)' },
            { label: 'MID', x: 0,   z: -5,  w: 36, h: 30, col: 'rgba(255,255,100,0.07)' },
        ];

        function worldToRadar(wx, wz) {
            // Карта фиксирована (не вращается), центр = центр мира
            const cx = RADAR_SIZE / 2;
            const cy = RADAR_SIZE / 2;
            return {
                x: cx + wx * RADAR_SCALE,
                y: cy + wz * RADAR_SCALE
            };
        }

        function drawRadar() {
            const S = RADAR_SIZE;
            rCtx.clearRect(0, 0, S, S);

            // Фон
            rCtx.fillStyle = 'rgba(8,12,8,0.95)';
            rCtx.fillRect(0, 0, S, S);

            // Сетка
            rCtx.strokeStyle = 'rgba(255,255,255,0.04)';
            rCtx.lineWidth = 1;
            for (let i = 0; i <= S; i += 44) {
                rCtx.beginPath(); rCtx.moveTo(i, 0); rCtx.lineTo(i, S); rCtx.stroke();
                rCtx.beginPath(); rCtx.moveTo(0, i); rCtx.lineTo(S, i); rCtx.stroke();
            }

            // Зоны
            radarZones.forEach(z => {
                const p = worldToRadar(z.x - z.w/2, z.z - z.h/2);
                const p2 = worldToRadar(z.x + z.w/2, z.z + z.h/2);
                rCtx.fillStyle = z.col;
                rCtx.fillRect(p.x, p.y, p2.x - p.x, p2.y - p.y);
                rCtx.strokeStyle = z.col.replace('0.12', '0.4').replace('0.07', '0.3');
                rCtx.lineWidth = 1;
                rCtx.strokeRect(p.x, p.y, p2.x - p.x, p2.y - p.y);
                // Название зоны
                rCtx.fillStyle = z.col.replace('0.12', '0.7').replace('0.07', '0.5');
                rCtx.font = 'bold 11px Arial';
                rCtx.textAlign = 'center';
                const lp = worldToRadar(z.x, z.z);
                rCtx.fillText(z.label, lp.x, lp.y + 4);
            });

            // Стены (упрощённо — только крупные)
            rCtx.strokeStyle = 'rgba(180,160,130,0.35)';
            rCtx.lineWidth = 1.5;
            colliders.forEach(c => {
                const w = c.max.x - c.min.x;
                const h = c.max.z - c.min.z;
                if (w < 3 && h < 3) return; // пропускаем мелкие
                const p1 = worldToRadar(c.min.x, c.min.z);
                const p2 = worldToRadar(c.max.x, c.max.z);
                rCtx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            });

            // Дропнутое оружие
            droppedWeapons.forEach(dw => {
                const p = worldToRadar(dw.mesh.position.x, dw.mesh.position.z);
                if (p.x < 4 || p.x > S-4 || p.y < 4 || p.y > S-4) return;
                rCtx.fillStyle = '#ffcc44';
                rCtx.fillRect(p.x - 2, p.y - 2, 4, 4);
            });

            // Боты — показываем только если в поле зрения и не за стеной
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            bots.forEach(b => {
                if (b.isDead) return;
                const p = worldToRadar(b.g.position.x, b.g.position.z);
                if (p.x < 4 || p.x > S-4 || p.y < 4 || p.y > S-4) return;

                // Вектор от игрока к боту
                _v3a.subVectors(b.g.position, camera.position).normalize();
                const dot = camDir.dot(_v3a);
                // FOV ~120° → dot > cos(60°) = 0.5
                if (dot < 0.5) return;

                // Проверка видимости через стены
                const dist = camera.position.distanceTo(b.g.position);
                _botRay.set(camera.position, _v3a);
                const wallHits = _botRay.intersectObjects(worldMeshes);
                if (wallHits.length > 0 && wallHits[0].distance < dist - 0.5) return;

                rCtx.fillStyle = '#ff4444';
                rCtx.beginPath();
                rCtx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                rCtx.fill();
                // Маленький восклицательный знак чтобы было заметнее
                rCtx.fillStyle = '#fff';
                rCtx.font = 'bold 8px Arial';
                rCtx.textAlign = 'center';
                rCtx.fillText('!', p.x, p.y + 3);
            });

            // Удалённые игроки на радаре (MP)
            if (mpActive) {
                Object.values(mpRemotePlayers).forEach(rp => {
                    if (!rp.mesh.visible) return;
                    const p = worldToRadar(rp.mesh.position.x, rp.mesh.position.z);
                    if (p.x < 4 || p.x > S-4 || p.y < 4 || p.y > S-4) return;

                    // Проверка видимости (FOV + стены)
                    _v3a.subVectors(rp.mesh.position, camera.position).normalize();
                    const dot = camDir.dot(_v3a);
                    if (dot < 0.5) return;
                    const dist = camera.position.distanceTo(rp.mesh.position);
                    _botRay.set(camera.position, _v3a);
                    const wallHits = _botRay.intersectObjects(worldMeshes);
                    if (wallHits.length > 0 && wallHits[0].distance < dist - 0.5) return;

                    rCtx.fillStyle = '#ff6622';
                    rCtx.beginPath();
                    rCtx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                    rCtx.fill();
                    rCtx.fillStyle = '#fff';
                    rCtx.font = 'bold 8px Arial';
                    rCtx.textAlign = 'center';
                    rCtx.fillText('P', p.x, p.y + 3);
                });
            }

            // Бомба
            if (bombPlanted && bombMesh) {
                const p = worldToRadar(bombMesh.position.x, bombMesh.position.z);
                rCtx.fillStyle = '#ff8800';
                rCtx.font = 'bold 10px Arial';
                rCtx.textAlign = 'center';
                rCtx.fillText('💣', p.x, p.y + 4);
            }

            // Игрок — треугольник с направлением
            const pp = worldToRadar(camera.position.x, camera.position.z);
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const angle = Math.atan2(dir.z, dir.x) + Math.PI / 2;

            rCtx.save();
            rCtx.translate(pp.x, pp.y);
            rCtx.rotate(angle);
            rCtx.fillStyle = '#00ff88';
            rCtx.strokeStyle = '#004422';
            rCtx.lineWidth = 1;
            rCtx.beginPath();
            rCtx.moveTo(0, -7);
            rCtx.lineTo(4, 5);
            rCtx.lineTo(-4, 5);
            rCtx.closePath();
            rCtx.fill();
            rCtx.stroke();
            rCtx.restore();

            // Рамка
            rCtx.strokeStyle = 'rgba(255,255,255,0.1)';
            rCtx.lineWidth = 1;
            rCtx.strokeRect(0, 0, S, S);

            // Название карты
            rCtx.fillStyle = 'rgba(210,180,140,0.4)';
            rCtx.font = '9px Arial';
            rCtx.textAlign = 'left';
            rCtx.fillText('MIRAGE', 6, S - 6);
        }

        /* ========== MAIN LOOP ========== */
        let _fpsFrames = 0, _fpsLast = performance.now();
        function loop() {
            requestAnimationFrame(loop);
            const now = performance.now();

            // FPS counter
            _fpsFrames++;
            if (now - _fpsLast >= 1000) {
                const fpsEl = document.getElementById('fps-counter');
                if (fpsEl) fpsEl.innerText = _fpsFrames + ' FPS';
                _fpsFrames = 0;
                _fpsLast = now;
            }
            const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
            lastFrameTime = now;

            // Рендерим сцену всегда (для фона в меню), но игровую логику только когда активна игра
            if (!gameActive) {
                renderer.render(scene, camera);
                return;
            }

            if (!isDead) {
                // Freeze phase — тикает даже когда pointer не захвачен (buy menu)
                if (roundPhase === 'freeze') {
                    freezeTime -= dt;
                    // Обновляем таймер подготовки
                    const timerEl = document.getElementById('round-timer');
                    if (timerEl) timerEl.innerText = 'Prep: ' + Math.ceil(freezeTime);
                    if (freezeTime <= 0) {
                        roundPhase = 'live';
                        document.getElementById('freeze-screen').style.display = 'none';
                        document.getElementById('buy-menu').style.display = 'none';
                        controls.lock();
                        // Сразу обновляем таймер на основной
                        const timerEl = document.getElementById('round-timer');
                        const m = Math.floor(roundTime / 60);
                        const s = Math.floor(roundTime % 60);
                        if (timerEl) timerEl.innerText = m + ':' + (s < 10 ? '0' : '') + s;
                    }
                }
            }

            if (controls.isLocked && !isDead) {

                // Во время freeze — не двигаемся, не стреляем
                if (roundPhase === 'freeze') {
                    // Только рендер и радар
                    if (!loop._radarTick) loop._radarTick = 0;
                    if (++loop._radarTick % 3 === 0) drawRadar();
                    renderer.render(scene, camera);
                    return;
                }

                if (roundPhase === 'live') {
                    roundTime -= dt;
                    if (roundTime <= 0 && !bombPlanted) endRound('CT'); // time out = CT win
                }
                updateTimer();

                updateBomb(dt);
                checkWeaponPickup();

                // Smoke cloud lifetime
                for (let i = smokeGrens.length - 1; i >= 0; i--) {
                    smokeGrens[i].life -= dt;
                    if (smokeGrens[i].life <= 0) {
                        scene.remove(smokeGrens[i].mesh);
                        smokeGrens.splice(i, 1);
                    }
                }
                checkSmokeOverlay();

                // Movement speed depends on weapon
                const wDef = weaponDefs[curWeapon];
                const baseSpeed = wDef ? wDef.moveSpeed : 13;
                const moveSpeed = keys_pressed['ShiftLeft'] ? baseSpeed * 0.5 : baseSpeed;

                // Двигаем только X/Z, Y управляется отдельно через footY
                const oldX = camera.position.x, oldZ = camera.position.z;
                if (keys_pressed['KeyW']) controls.moveForward(moveSpeed * dt);
                if (keys_pressed['KeyS']) controls.moveForward(-moveSpeed * dt);
                if (keys_pressed['KeyA']) controls.moveRight(-moveSpeed * dt);
                if (keys_pressed['KeyD']) controls.moveRight(moveSpeed * dt);

                const PW = 0.4, PH = 1.5;
                // Бокс строится от footY вверх — переиспользуем _box3 без new каждый кадр
                const pBox = (x, fy, z) => {
                    _box3.min.set(x - PW/2, fy + 0.05, z - PW/2);
                    _box3.max.set(x + PW/2, fy + PH,   z + PW/2);
                    return _box3;
                };

                // Коллизия X
                if (colliders.some(c => c.intersectsBox(pBox(camera.position.x, footY, oldZ)))) {
                    camera.position.x = oldX;
                }
                // Коллизия Z
                if (colliders.some(c => c.intersectsBox(pBox(camera.position.x, footY, camera.position.z)))) {
                    camera.position.z = oldZ;
                }

                // Гравитация и вертикальное движение (работаем с footY)
                if (!isOnGround) vY -= 22 * dt;
                else vY = 0; // на земле скорость всегда 0

                const dyStep = vY * dt;
                const steps = Math.max(1, Math.ceil(Math.abs(dyStep) / 0.08));
                const stepSize = dyStep / steps;
                let onGround = false;

                // Если стоим на земле — сразу проверяем есть ли поверхность под ногами
                if (isOnGround) {
                    // Проверяем что поверхность всё ещё под нами
                    const bvCheck = pBox(camera.position.x, footY - 0.05, camera.position.z);
                    let stillOnSurface = footY <= 0.01;
                    if (!stillOnSurface) {
                        for (const c of colliders) {
                            if (c.intersectsBox(bvCheck)) { stillOnSurface = true; break; }
                        }
                    }
                    if (stillOnSurface) {
                        onGround = true;
                    }
                    // Если поверхность пропала (шагнули с края) — начинаем падать
                }

                if (!onGround) {
                    for (let s = 0; s < steps; s++) {
                        footY += stepSize;

                        if (footY <= 0) {
                            footY = 0;
                            vY = 0;
                            onGround = true;
                            break;
                        }

                        const bv = pBox(camera.position.x, footY, camera.position.z);
                        let hit = false;
                        for (const c of colliders) {
                            if (!c.intersectsBox(bv)) continue;
                            if (vY <= 0) {
                                footY = c.max.y;
                                vY = 0;
                                onGround = true;
                            } else {
                                footY = c.min.y - PH;
                                vY = 0;
                            }
                            hit = true;
                            break;
                        }
                        if (hit) break;
                    }
                }

                isOnGround = onGround;

                // Двигаем камеру к footY + EYE_HEIGHT
                // На земле — мгновенно (без интерполяции), в воздухе — плавно
                const targetCamY = footY + EYE_HEIGHT;
                if (isOnGround) {
                    camera.position.y = targetCamY;
                } else {
                    camera.position.y += (targetCamY - camera.position.y) * Math.min(1, dt * 20);
                }

                if (isOnGround && keys_pressed['Space']) {
                    vY = 9;
                    isOnGround = false;
                }

                // Auto fire
                if (isMousedown && curSlot !== 'he' && curSlot !== 'melee') {
                    const wDef2 = weaponDefs[curWeapon];
                    if (wDef2 && wDef2.auto && Date.now() - lastShotTime > wDef2.rate) {
                        shoot();
                        lastShotTime = Date.now();
                    }
                }

                // Knife auto-attack when holding mouse
                if (isMousedown && curSlot === 'melee') {
                    if (Date.now() - lastShotTime > weaponDefs.knife.rate) {
                        knifeAttack();
                        lastShotTime = Date.now();
                    }
                }

                // Weapon bob & recoil recovery
                gunG.position.z += (-0.6 - gunG.position.z) * 0.15;
                gunG.rotation.x += (0 - gunG.rotation.x) * 0.15;
                gunG.rotation.y += (0 - gunG.rotation.y) * 0.2;

                // Анимация перезарядки
                if (_reloadAnim > 0) {
                    _reloadAnim += dt;
                    const wDef = weaponDefs[curWeapon];
                    const totalTime = wDef ? wDef.reloadTime / 1000 : 1.5;
                    const t = _reloadAnim / totalTime;
                    if (t < 0.25) {
                        gunG.position.y = -0.3 - t * 2;
                        gunG.rotation.z = t * 1.5;
                    } else if (t < 0.75) {
                        gunG.position.y = -0.8;
                        gunG.rotation.z = 0.375;
                    } else if (t < 1.0) {
                        const rt = (t - 0.75) / 0.25;
                        gunG.position.y = -0.8 + rt * 0.5;
                        gunG.rotation.z = 0.375 * (1 - rt);
                    } else {
                        // Анимация закончилась — сбрасываем
                        gunG.rotation.z = 0;
                    }
                } else {
                    // Сбрасываем rotation.z когда нет перезарядки
                    if (Math.abs(gunG.rotation.z) > 0.001) gunG.rotation.z *= 0.8;
                    else gunG.rotation.z = 0;
                }

                const isMoving = keys_pressed['KeyW'] || keys_pressed['KeyS'] || keys_pressed['KeyA'] || keys_pressed['KeyD'];
                const isWalking = keys_pressed['ShiftLeft'];

                // Звук шагов
                if (isMoving && isOnGround) {
                    const stepInterval = isWalking ? 0.55 : 0.33;
                    _stepTimer += dt;
                    if (_stepTimer >= stepInterval) {
                        _stepTimer = 0;
                        playFootstep(isWalking);
                    }
                } else {
                    _stepTimer = 0.2; // следующий шаг быстрее при начале движения
                }

                if (isMoving && !isScoped) {
                    const bobSpeed = isWalking ? 0.004 : 0.008;
                    const bobAmt = isWalking ? 0.008 : 0.015;
                    gunG.position.y = -0.3 + Math.sin(now * bobSpeed) * bobAmt;
                    gunG.position.x = 0.35 + Math.cos(now * bobSpeed * 0.5) * bobAmt * 0.5;
                    // Camera headbob
                    const hbSpeed = isWalking ? 3 : 6;
                    const hbAmt = isWalking ? 0.012 : 0.022;
                    camera.position.y += Math.sin(now * 0.001 * hbSpeed * Math.PI) * hbAmt * dt * 60;
                } else {
                    gunG.position.y += (-0.3 - gunG.position.y) * 0.1;
                    gunG.position.x += (0.35 - gunG.position.x) * 0.1;
                }

                // Hide gun when scoped
                if (isScoped) {
                    gunG.position.y = -2; // move off screen
                }

                // Update bots (только в оффлайн режиме)
                if (!mpActive) bots.forEach(b => b.update(dt));

                // Update grenades
                for (let i = nades.length - 1; i >= 0; i--) {
                    const n = nades[i];
                    n.position.add(n.userData.v.clone().multiplyScalar(dt));
                    n.userData.v.y -= 9.8 * dt;

                    if (n.position.y < 0.15) {
                        n.position.y = 0.15;
                        n.userData.v.y = Math.abs(n.userData.v.y) * 0.3;
                        n.userData.v.x *= 0.7;
                        n.userData.v.z *= 0.7;
                        if (Math.abs(n.userData.v.y) < 0.5) n.userData.v.set(0, 0, 0);
                    }

                    const nBox = new THREE.Box3().setFromCenterAndSize(n.position, new THREE.Vector3(0.4, 0.4, 0.4));
                    if (colliders.some(c => c.intersectsBox(nBox))) {
                        n.userData.v.x *= -0.5;
                        n.userData.v.z *= -0.5;
                    }

                    n.userData.t -= dt;
                    if (n.userData.t <= 0) {
                        if (n.userData.type === 'flash') {
                            triggerFlash(n.position.clone());
                            // Flash bots
                            bots.forEach(b => {
                                if (!b.isDead && b.g.position.distanceTo(n.position) < 18) b.lastS += 3000;
                            });
                        } else if (n.userData.type === 'smoke') {
                            deploySmoke(n.position.clone());
                        } else {
                            // HE grenade
                            playExplosionSound();
                            const explosion = new THREE.Mesh(
                                new THREE.SphereGeometry(2, 8, 8),
                                new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.7 })
                            );
                            explosion.position.copy(n.position);
                            scene.add(explosion);
                            setTimeout(() => scene.remove(explosion), 300);

                            bots.forEach(b => {
                                if (!b.isDead) {
                                    const d = b.g.position.distanceTo(n.position);
                                    if (d < 15) {
                                        const dmg = Math.ceil(3 * (1 - d / 15));
                                        b.hp -= dmg;
                                        if (b.hp <= 0) {
                                            dropWeapon(b.weaponDef ? b.weaponDef.key : null, b.g.position);
                                            b.die();
                                            totalKills++;
                                            moneyVal += 300;
                                            addMsg('HE');
                                            updateUI();
                                            checkAllBotsDead();
                                        }
                                    }
                                }
                            });

                            const pDist = camera.position.distanceTo(n.position);
                            if (pDist < 15) {
                                let dmg = Math.ceil(50 * (1 - pDist / 15));
                                if (armor > 0) {
                                    const abs = Math.floor(dmg * 0.5);
                                    armor = Math.max(0, armor - abs);
                                    dmg -= abs;
                                }
                                hp -= dmg;
                                hp = Math.max(0, hp);
                                updateUI();
                                document.getElementById('blood-fx').style.boxShadow = 'inset 0 0 80px rgba(255,0,0,0.6)';
                                setTimeout(() => document.getElementById('blood-fx').style.boxShadow = 'none', 150);
                                if (hp <= 0 && !isDead) playerDeath();
                            }
                        }
                        scene.remove(n);
                        nades.splice(i, 1);
                    }
                }
            }

            // Радар обновляем каждые 3 кадра — достаточно для мини-карты
            if (!loop._radarTick) loop._radarTick = 0;
            if (++loop._radarTick % 3 === 0) drawRadar();
            renderer.render(scene, camera);
        }

        /* ========== FLASHBANG ========== */
        function throwFlash() {
            if (inv.flash <= 0 || isDead) return;
            inv.flash--;
            const pos = camera.position.clone();
            const d = new THREE.Vector3(); camera.getWorldDirection(d);
            const velocity = d.clone().multiplyScalar(18).add(new THREE.Vector3(0, 5, 0));
            spawnFlash(pos, velocity);
            if (mpActive) { mpSend({ t: 'nade', kind: 'flash', x: pos.x, y: pos.y, z: pos.z, vx: velocity.x, vy: velocity.y, vz: velocity.z });
            }
            if (inv.flash === 0 && curSlot === 'flash') switchSlot(inv.pri ? 'pri' : 'sec');
            updateUI();
        }

        function spawnFlash(pos, velocity) {
            const n = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffaa }));
            n.position.copy(pos);
            n.userData = { v: velocity.clone(), t: 1.5, type: 'flash' };
            scene.add(n); nades.push(n);
        }

        function triggerFlash(pos) {
            const dist = camera.position.distanceTo(pos);
            if (dist > 20) return;
            // Check if player is looking toward flash
            const dir = new THREE.Vector3().subVectors(pos, camera.position).normalize();
            const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
            const dot = camDir.dot(dir);
            if (dot < 0) return; // behind player
            const intensity = Math.max(0, 1 - dist / 20) * (0.3 + dot * 0.7);
            const overlay = document.getElementById('flash-overlay');
            overlay.style.opacity = intensity;
            setTimeout(() => { overlay.style.transition = 'opacity 2s'; overlay.style.opacity = 0; }, 100);
            setTimeout(() => { overlay.style.transition = 'opacity 0.1s'; }, 2200);
        }

        /* ========== SMOKE ========== */
        const smokeGrens = []; // active smoke clouds

        function throwSmoke() {
            if (inv.smoke <= 0 || isDead) return;
            inv.smoke--;
            const pos = camera.position.clone();
            const d = new THREE.Vector3(); camera.getWorldDirection(d);
            const velocity = d.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4, 0));
            spawnSmoke(pos, velocity);
            if (mpActive) { mpSend({ t: 'nade', kind: 'smoke', x: pos.x, y: pos.y, z: pos.z, vx: velocity.x, vy: velocity.y, vz: velocity.z });
            }
            if (inv.smoke === 0 && curSlot === 'smoke') switchSlot(inv.pri ? 'pri' : 'sec');
            updateUI();
        }

        function spawnSmoke(pos, velocity) {
            const n = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0x888888 }));
            n.position.copy(pos);
            n.userData = { v: velocity.clone(), t: 1.2, type: 'smoke' };
            scene.add(n); nades.push(n);
            if (inv.smoke === 0 && curSlot === 'smoke') switchSlot(inv.pri ? 'pri' : 'sec');
            updateUI();
        }

        function deploySmoke(pos) {
            // Visual smoke sphere
            const sm = new THREE.Mesh(
                new THREE.SphereGeometry(5, 10, 10),
                new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.85 })
            );
            sm.position.copy(pos);
            scene.add(sm);
            smokeGrens.push({ mesh: sm, pos: pos.clone(), life: 18 });
            // Overlay if player is inside
            checkSmokeOverlay();
        }

        function checkSmokeOverlay() {
            const inSmoke = smokeGrens.some(s => camera.position.distanceTo(s.pos) < 5);
            DOM['smoke-overlay'].style.opacity = inSmoke ? 1 : 0;
        }

        /* ========== BOMB (C4) ========== */
        function plantBomb() {
            if (!inv.bomb || isDead || bombPlanted) return;
            // Check if near a bomb site
            const site = bombSites.find(s => {
                const dx = camera.position.x - s.x, dz = camera.position.z - s.z;
                return Math.sqrt(dx*dx + dz*dz) < 8;
            });
            if (!site) { showHint('Move to bomb site (A or B)'); return; }
            // Plant animation — 3 second plant time
            showHint('Planting bomb... [hold LMB]');
            inv.bomb = false;
            bombPlanted = true;
            bombTimer = BOMB_TIME;
            activeBombSite = site;
            // Place bomb mesh
            bombMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
            bombMesh.position.set(site.x, 0.1, site.z);
            scene.add(bombMesh);
            document.getElementById('bomb-indicator').style.display = 'block';
            document.getElementById('bomb-bar').style.display = 'flex';
            playSound('decay', 800, 0.1, 0.3, 'square');
            if (curSlot === 'bomb') switchSlot(inv.pri ? 'pri' : 'sec');
            updateUI();
            // Синхронизация бомбы в онлайне
            if (mpActive) { mpSend({ t: 'bomb', action: 'plant', sx: site.x, sz: site.z });
            }
        }

        function updateBomb(dt) {
            if (!bombPlanted) return;
            bombTimer -= dt;
            const pct = (bombTimer / BOMB_TIME) * 100;
            DOM['bomb-bar-fill'].style.width = pct + '%';
            DOM['bomb-bar-fill'].style.background = bombTimer < 10 ? '#f00' : '#f80';

            // Beep faster as time runs out
            const beepInterval = Math.max(0.2, bombTimer / BOMB_TIME);
            if (!updateBomb._last) updateBomb._last = 0;
            updateBomb._last += dt;
            if (updateBomb._last > beepInterval) {
                updateBomb._last = 0;
                playSound('static', 1200, 0.05, 0.15, 'square');
            }

            // Defuse check — CT player near bomb
            if (playerTeam === 'CT') {
                const dx = camera.position.x - activeBombSite.x;
                const dz = camera.position.z - activeBombSite.z;
                const nearBomb = Math.sqrt(dx*dx + dz*dz) < 4;
                if (nearBomb && keys_pressed['KeyE'] && !isDead) {
                    isDefusing = true;
                    defuseProgress += dt / DEFUSE_TIME;
                    DOM['defuse-bar'].style.display = 'flex';
                    DOM['defuse-bar-fill'].style.width = (defuseProgress * 100) + '%';
                    if (defuseProgress >= 1) {
                        bombDefused();
                    }
                } else {
                    isDefusing = false;
                    defuseProgress = Math.max(0, defuseProgress - dt * 0.5);
                    DOM['defuse-bar-fill'].style.width = (defuseProgress * 100) + '%';
                    if (!nearBomb) DOM['defuse-bar'].style.display = 'none';
                }
            }

            if (bombTimer <= 0) bombExplode();
        }

        function bombExplode() {
            bombPlanted = false;
            document.getElementById('bomb-bar').style.display = 'none';
            document.getElementById('bomb-indicator').style.display = 'none';
            if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
            playExplosionSound();
            // Big explosion visual
            const exp = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 }));
            exp.position.set(activeBombSite.x, 2, activeBombSite.z);
            scene.add(exp);
            setTimeout(() => scene.remove(exp), 600);
            // Damage player if close
            const dist = camera.position.distanceTo(new THREE.Vector3(activeBombSite.x, 1.6, activeBombSite.z));
            if (dist < 20 && !isDead) {
                let dmg = Math.ceil(100 * (1 - dist / 20));
                hp = Math.max(0, hp - dmg);
                updateUI();
                if (hp <= 0) playerDeath();
            }
            endRound('T');
        }

        function bombDefused() {
            bombPlanted = false;
            isDefusing = false;
            defuseProgress = 0;
            document.getElementById('bomb-bar').style.display = 'none';
            document.getElementById('defuse-bar').style.display = 'none';
            document.getElementById('bomb-indicator').style.display = 'none';
            if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
            playSound('static', 600, 0.3, 0.3, 'sine');
            // Синхронизация разминирования
            if (mpActive) { mpSend({ t: 'bomb', action: 'defuse' });
            }
            endRound('CT');
        }

        /* ========== ROUND SYSTEM ========== */
        function updateScoreUI() {
            DOM['score-t'].innerText = 'T: ' + scoreT;
            DOM['score-ct'].innerText = 'CT: ' + scoreCT;
            const half = roundNumber <= ROUNDS_PER_HALF ? '1st Half' : roundNumber <= MAX_ROUNDS ? '2nd Half' : 'OT';
            DOM['round-label'].innerText = 'Round ' + roundNumber + ' | ' + half;
            DOM['team-label'].innerText = playerTeam === 'CT' ? '🔵 CT' : '🔴 T';
            DOM['team-label'].style.color = playerTeam === 'CT' ? '#4af' : '#f84';
        }

        // Проверяем все ли боты мертвы — если да, раунд выигран
        function checkAllBotsDead() {
            if (mpActive) return; // в онлайне не проверяем ботов
            if (roundPhase !== 'live') return;
            const allDead = bots.every(b => b.isDead);
            if (allDead) {
                // Игрок выиграл раунд — его команда побеждает
                endRound(playerTeam);
            }
        }

        function endRound(winner) {
            if (roundPhase === 'end') return;
            roundPhase = 'end';
            roundTime = 0;

            // Сообщаем другому игроку о конце раунда
            if (mpActive) { mpSend({ t: 'round_end', winner });
            }

            if (winner === 'T') scoreT++;
            else scoreCT++;
            updateScoreUI();

            const isWin = winner === playerTeam;

            // CS2 экономика
            if (isWin) {
                moneyVal += 3250;
                lossStreak = 0;
            } else {
                lossStreak = Math.min(lossStreak + 1, 5);
                const lossBonus = [1400, 1900, 2400, 2900, 3400];
                moneyVal += lossBonus[lossStreak - 1];
            }
            moneyVal = Math.min(moneyVal, 16000);

            // Короткое сообщение о победе (2 секунды) и сразу новый раунд
            const screen = document.getElementById('round-end-screen');
            const title = document.getElementById('round-end-title');
            const sub = document.getElementById('round-end-sub');
            title.innerText = isWin ? '🏆 ROUND WIN!' : '💀 ROUND LOST';
            title.style.color = isWin ? '#4f4' : '#f44';
            sub.innerText = winner === 'T' ? 'Terrorists win!' : 'Counter-Terrorists win!';
            screen.style.display = 'flex';

            // Проверяем победу в матче
            if (scoreT >= ROUNDS_TO_WIN || scoreCT >= ROUNDS_TO_WIN) {
                setTimeout(() => { screen.style.display = 'none'; showMatchEnd(); }, 2000);
                return;
            }
            if (scoreT === 12 && scoreCT === 12 && roundNumber === 24) {
                setTimeout(() => { screen.style.display = 'none'; startOvertime(); }, 2000);
                return;
            }

            // Быстрый переход к новому раунду (2 секунды)
            setTimeout(() => { screen.style.display = 'none'; startNewRound(); }, 2000);
        }

        function startNewRound() {
            roundNumber++;
            if (roundNumber > MAX_ROUNDS) { showMatchEnd(); return; }

            // Сообщаем другому игроку о новом раунде
            if (mpActive) { mpSend({ t: 'new_round' });
            }

            // Смена сторон на половине
            if (roundNumber === ROUNDS_PER_HALF + 1) {
                playerTeam = playerTeam === 'CT' ? 'T' : 'CT';
                moneyVal = 800;
                lossStreak = 0;
                inv.pri = null; inv.he = 0; inv.flash = 0; inv.smoke = 0;
                inv.sec = 'usp';
                ammoState['usp'] = { ammo: weaponDefs.usp.ammo, res: weaponDefs.usp.res };
            }

            // Freeze phase — 10 секунд подготовки
            roundPhase = 'freeze';
            freezeTime = 10;
            roundTime = 115;
            bombPlanted = false;
            isDefusing = false;
            defuseProgress = 0;
            document.getElementById('bomb-bar').style.display = 'none';
            document.getElementById('defuse-bar').style.display = 'none';
            document.getElementById('bomb-indicator').style.display = 'none';
            if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }

            // Автоматический респавн игрока
            hp = 100; armor = 0; isDead = false; vY = 0; footY = 0;
            camera.position.set(0, EYE_HEIGHT, playerTeam === 'CT' ? 72 : -72);
            document.getElementById('death-screen').style.display = 'none';

            inv.bomb = playerTeam === 'T';
            inv.he = 0; inv.flash = 0; inv.smoke = 0;

            // Восстанавливаем патроны у всего оружия
            if (inv.sec) initAmmo(inv.sec);
            if (inv.pri) initAmmo(inv.pri);
            initAmmo('knife');

            // Respawn bots (только в оффлайн)
            if (!mpActive) bots.forEach(b => b.respawn());

            updateUI();
            updateScoreUI();

            // Показываем freeze screen — игрок может открыть buy menu кнопкой B
            const fs = document.getElementById('freeze-screen');
            document.getElementById('freeze-title').innerText = roundNumber === ROUNDS_PER_HALF + 1 ? 'HALF TIME' : 'ROUND ' + roundNumber;
            document.getElementById('freeze-sub').innerText = (playerTeam === 'CT' ? '🔵 Counter-Terrorist' : '🔴 Terrorist') + ' — Press B to buy!';
            fs.style.display = 'flex';

            // НЕ открываем buy menu автоматически — игрок сам нажмёт B
            controls.lock();
        }

        // Overtime: MR3, $10000 стартовые
        function startOvertime() {
            moneyVal = 10000;
            lossStreak = 0;
            inv.pri = null; inv.he = 0; inv.flash = 0; inv.smoke = 0;
            inv.sec = 'usp';
            ammoState['usp'] = { ammo: weaponDefs.usp.ammo, res: weaponDefs.usp.res };

            const screen = document.getElementById('round-end-screen');
            const title = document.getElementById('round-end-title');
            const sub = document.getElementById('round-end-sub');
            title.innerText = '⚡ OVERTIME';
            title.style.color = '#ff0';
            sub.innerText = 'MR3 — First to 16 wins!';
            screen.style.display = 'flex';

            setTimeout(() => { screen.style.display = 'none'; startNewRound(); }, 4000);
        }

        function showMatchEnd() {
            const screen = document.getElementById('round-end-screen');
            const title = document.getElementById('round-end-title');
            const sub = document.getElementById('round-end-sub');
            const win = scoreT > scoreCT ? 'T' : scoreCT > scoreT ? 'CT' : null;
            title.innerText = win ? (win === playerTeam ? '🏆 MATCH WIN!' : '💀 MATCH LOST') : '🤝 DRAW!';
            title.style.color = win === playerTeam ? '#4f4' : win ? '#f44' : '#ff0';
            sub.innerText = `Final: T ${scoreT} — CT ${scoreCT}`;
            screen.style.display = 'flex';
        }

        function showHint(msg) {
            const el = document.getElementById('reload-hint');
            el.innerText = msg;
            el.style.display = 'block';
            setTimeout(() => { el.style.display = 'none'; el.innerText = 'RELOADING...'; }, 2000);
        }

        /* ========== WEAPON PICKUP ========== */
        const droppedWeapons = [];

        function dropWeapon(wKey, pos) {
            if (!wKey || wKey === 'knife') return;
            const def = weaponDefs[wKey];
            const col = wKey === 'awp' ? 0x2a4a2a : wKey === 'ak47' ? 0x4a3728 : wKey === 'deagle' ? 0xb0b0b0 : 0x333333;
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.08, def ? Math.min(0.7, 0.3 + def.ammo * 0.01) : 0.5),
                new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.4 })
            );
            mesh.position.set(pos.x, 0.15, pos.z);
            mesh.rotation.y = Math.random() * Math.PI;
            // Подсветка чтобы было видно
            const glow = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 0.6),
                new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.25, depthWrite: false })
            );
            glow.rotation.x = -Math.PI / 2;
            glow.position.y = 0.01;
            mesh.add(glow);
            scene.add(mesh);
            droppedWeapons.push({ mesh, wKey });
        }

        function checkWeaponPickup() {
            for (let i = droppedWeapons.length - 1; i >= 0; i--) {
                const dw = droppedWeapons[i];
                const dist = camera.position.distanceTo(dw.mesh.position);
                if (dist < 2 && keys_pressed['KeyF']) {
                    const def = weaponDefs[dw.wKey];
                    if (!def) continue;
                    if (def.slot === 'pri') {
                        inv.pri = dw.wKey;
                        initAmmo(dw.wKey);
                        switchSlot('pri');
                    } else if (def.slot === 'sec') {
                        inv.sec = dw.wKey;
                        initAmmo(dw.wKey);
                    }
                    scene.remove(dw.mesh);
                    droppedWeapons.splice(i, 1);
                    updateUI();
                    showHint('[F] Picked up ' + def.name);
                }
            }
        }

        /* ========== INIT ROUND ========== */
        switchSlot('melee');
        updateUI();
        updateScoreUI();
        updateTimer();
        // Give T side bomb on first round
        if (playerTeam === 'T') inv.bomb = true;
        loop();

        let _pendingMode = 'solo'; // режим ожидающий выбора команды

        window.startSolo = () => {
            _pendingMode = 'solo';
            document.getElementById('lobby').style.display = 'none';
            document.getElementById('team-select').style.display = 'flex';
            controls.unlock();
        };

        window.startEbash = () => {
            _pendingMode = 'ebash';
            document.getElementById('lobby').style.display = 'none';
            document.getElementById('team-select').style.display = 'flex';
            controls.unlock();
        };

        window.selectTeam = (team) => {
            document.getElementById('team-select').style.display = 'none';
            playerTeam = team;

            // Настраиваем спавн игрока
            const spawnZ = team === 'CT' ? 72 : -72;
            camera.position.set(0, EYE_HEIGHT, spawnZ);
            footY = 0; vY = 0;

            // Настраиваем режим
            if (_pendingMode === 'ebash') {
                ebashMode = true;
                hp = 5000;
                moneyVal = 999999;
            } else {
                ebashMode = false;
                hp = 100;
                moneyVal = 800;
            }

            // Обновляем цвета ботов под противоположную команду
            const botTeam = team === 'CT' ? 'T' : 'CT';
            bots.forEach((b, i) => {
                // T боты — коричневые/оранжевые варианты, CT — зелёные/синие
                b.g.traverse(child => {
                    if (!child.isMesh) return;
                    if (botTeam === 'T') {
                        // Оставляем текущие варианты (уже разные)
                    }
                });
                b.respawn();
            });

            // Пересоздаём ботов для правильной команды
            bots.forEach(b => { scene.remove(b.g); });
            bots.length = 0;
            for (let i = 0; i < 5; i++) bots.push(new Enemy(i));

            gameActive = true;
            inv.bomb = team === 'T';
            updateUI();
            updateScoreUI();
            controls.lock();
        };

        /* ========== MULTIPLAYER (PeerJS + WebSocket) ========== */
        let mpPeer = null, mpConn = null, mpIsHost = false, mpActive = false;
        let mpRemotePlayers = {};
        let _mpRenderPatched = false;
        const PEER_SERVER = null; // null = публичный сервер 0.peerjs.com

        // WebSocket сервер
        const WS_SERVER = 'wss://cs-mirage-server.onrender.com';
        let wsConn = null;
        let wsPlayerId = null;
        let wsRoomCode = null;
        let useWebSocket = false; // true = WebSocket, false = PeerJS

        function mpSetStatus(msg, col = '#fa0') {
            const el = document.getElementById('online-status');
            if (el) { el.innerText = msg; el.style.color = col; }
        }

        function mpMakeRemoteMesh(team, idx) {
            // Сначала создаём примитивную модель как placeholder
            const skins = team === 'CT' ? skinsCT : skinsT;
            const variant = skins[idx % skins.length];
            const g = makeBotModel(variant);
            g.castShadow = true;
            g.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
            scene.add(g);

            // Асинхронно заменяем на FBX модель
            if (charModelsReady) {
                loadCharForBot(team, idx, (model) => {
                    if (!model) return;
                    const pos = g.position.clone();
                    const rot = g.rotation.clone();
                    scene.remove(g);
                    model.position.copy(pos);
                    model.position.y = 0;
                    model.rotation.copy(rot);
                    scene.add(model);
                    // Обновляем ссылку в mpRemotePlayers
                    Object.values(mpRemotePlayers).forEach(rp => {
                        if (rp.mesh === g) {
                            rp.mesh = model;
                            rp.useGltf = true;
                            rp.mixer = model.userData.mixer;
                            rp.actions = model.userData.actions;
                            // Привязываем оружие к руке
                            if (model.userData.rightHand && gltfWeapons._loaded && rp.weapon) {
                                const wKey = rp.weapon;
                                if (gltfWeapons[wKey]) {
                                    const weaponClone = gltfWeapons[wKey].clone();
                                    weaponClone.scale.set(0.7, 0.7, 0.7);
                                    weaponClone.position.set(5.5, 20, 0);
                                    weaponClone.quaternion.identity();
                                    const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
                                    const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
                                    weaponClone.quaternion.copy(qX.multiply(qZ));
                                    model.userData.rightHand.add(weaponClone);
                                    rp.gunMesh = weaponClone;
                                }
                            }
                        }
                    });
                });
            }

            return g;
        }

        function mpBroadcast() {
            if (!mpActive) return;
            _v3a.set(0, 0, 0);
            camera.getWorldDirection(_v3a);
            const stateData = {
                t: 'state',
                x: camera.position.x, y: footY + EYE_HEIGHT, z: camera.position.z,
                dx: _v3a.x, dz: _v3a.z,
                hp, team: playerTeam, dead: isDead,
                weapon: curWeapon
            };
            if (useWebSocket) {
                wsSend(stateData);
            } else if (mpConn && mpConn.open) {
                mpConn.send(stateData);
            }
        }

        function mpPatchRender() {
            if (_mpRenderPatched) return;
            _mpRenderPatched = true;
            let _mpTick = 0;
            const _origRender = renderer.render.bind(renderer);
            renderer.render = (s, c) => {
                _origRender(s, c);
                if (++_mpTick % 2 === 0) mpBroadcast();
            };
        }

        function mpStartLocal(team) {
            // Скрываем ботов
            bots.forEach(b => { b.isDead = true; b.g.visible = false; });
            playerTeam = team;
            const spawnZ = team === 'CT' ? 72 : -72;
            camera.position.set(0, EYE_HEIGHT, spawnZ);
            footY = 0; vY = 0;
            gameActive = true;
            inv.bomb = team === 'T';
            updateUI();
            updateScoreUI();
            document.getElementById('team-select').style.display = 'none';
            document.getElementById('online-lobby').style.display = 'none';
            mpPatchRender();
            // Показываем экран "Click to play" — Pointer Lock требует жест пользователя
            document.getElementById('mp-team-label').innerText = team;
            document.getElementById('mp-click-to-play').style.display = 'flex';
            // Показываем кнопку голосового чата и инициализируем
            document.getElementById('voice-chat-btn').style.display = 'block';
            voiceInit();
        }

        function mpHandleData(pid, data) {
            if (data.t === 'state') {
                if (!mpRemotePlayers[pid]) {
                    console.log('[MP] Creating remote player mesh for', pid, 'team:', data.team);
                    const remoteTeam = data.team || (playerTeam === 'CT' ? 'T' : 'CT');
                    const remoteIdx = Object.keys(mpRemotePlayers).length;
                    const mesh = mpMakeRemoteMesh(remoteTeam, remoteIdx);
                    mpRemotePlayers[pid] = { mesh, weapon: null, gunMesh: null };
                }
                const rp = mpRemotePlayers[pid];
                rp.mesh.visible = !data.dead;

                // Античит: проверка скорости перемещения
                const newPos = new THREE.Vector3(data.x, data.y, data.z);
                if (rp._lastPos) {
                    const dist = rp._lastPos.distanceTo(newPos);
                    const maxSpeed = 15; // макс. допустимое перемещение за тик (~30 units/sec)
                    if (dist > maxSpeed && !data.dead) {
                        console.warn('[ANTICHEAT] Suspicious speed from', pid, 'dist:', dist.toFixed(1));
                        rp._speedWarnings = (rp._speedWarnings || 0) + 1;
                        if (rp._speedWarnings > 10) {
                            showHint('⚠ Suspicious player movement detected');
                        }
                    }
                }
                rp._lastPos = newPos.clone();

                // Для GLTF модели y=0, для примитивной — с offset
                const yPos = rp.useGltf ? 0 : (data.y - EYE_HEIGHT + 0.85);
                // Античит: проверка границ карты
                if (Math.abs(data.x) > 120 || Math.abs(data.z) > 120 || data.y > 30) {
                    console.warn('[ANTICHEAT] Player out of bounds:', pid);
                }

                rp.mesh.position.set(data.x, yPos, data.z);
                rp.mesh.rotation.y = Math.atan2(-data.dx, -data.dz);

                // Обновляем анимации для GLTF модели
                if (rp.mixer) {
                    rp.mixer.update(0.016); // ~60fps
                }

                // Смена оружия
                if (data.weapon && data.weapon !== rp.weapon) {
                    // Для GLTF модели — привязываем к кости руки
                    if (rp.useGltf && rp.mesh.userData && rp.mesh.userData.rightHand && gltfWeapons._loaded) {
                        if (rp.gunMesh) rp.mesh.userData.rightHand.remove(rp.gunMesh);
                        const wKey = data.weapon;
                        if (gltfWeapons[wKey]) {
                            const weaponClone = gltfWeapons[wKey].clone();
                            weaponClone.scale.set(0.7, 0.7, 0.7);
                            weaponClone.position.set(5.5, 20, 0);
                            weaponClone.quaternion.identity();
                            const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
                            const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
                            weaponClone.quaternion.copy(qX.multiply(qZ));
                            rp.mesh.userData.rightHand.add(weaponClone);
                            rp.gunMesh = weaponClone;
                        }
                    } else {
                        // Fallback для примитивной модели
                        if (rp.gunMesh) rp.mesh.remove(rp.gunMesh);
                        if (data.weapon !== 'knife') {
                            rp.gunMesh = makeBotGun(data.weapon);
                        } else {
                            rp.gunMesh = new THREE.Mesh(
                                new THREE.BoxGeometry(0.02, 0.04, 0.25),
                                new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 })
                            );
                        }
                        rp.gunMesh.position.set(0.42, -0.1, -0.3);
                        rp.mesh.add(rp.gunMesh);
                    }
                    rp.weapon = data.weapon;
                }
            } else if (data.t === 'bomb') {
                // Бомба от другого игрока
                if (data.action === 'plant') {
                    bombPlanted = true;
                    bombTimer = BOMB_TIME;
                    const site = bombSites.find(s => Math.abs(s.x - data.sx) < 1 && Math.abs(s.z - data.sz) < 1) || { x: data.sx, z: data.sz };
                    activeBombSite = site;
                    bombMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                    bombMesh.position.set(site.x, 0.1, site.z);
                    scene.add(bombMesh);
                    document.getElementById('bomb-indicator').style.display = 'block';
                    document.getElementById('bomb-bar').style.display = 'flex';
                    playSound('decay', 800, 0.1, 0.3, 'square');
                    showHint('Bomb has been planted!');
                } else if (data.action === 'defuse') {
                    bombPlanted = false;
                    isDefusing = false;
                    defuseProgress = 0;
                    document.getElementById('bomb-bar').style.display = 'none';
                    document.getElementById('defuse-bar').style.display = 'none';
                    document.getElementById('bomb-indicator').style.display = 'none';
                    if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
                    playSound('static', 600, 0.3, 0.3, 'sine');
                    showHint('Bomb has been defused!');
                }
            } else if (data.t === 'nade') {
                // Граната от другого игрока
                const pos = new THREE.Vector3(data.x, data.y, data.z);
                const vel = new THREE.Vector3(data.vx, data.vy, data.vz);
                if (data.kind === 'he') spawnHe(pos, vel);
                else if (data.kind === 'flash') spawnFlash(pos, vel);
                else if (data.kind === 'smoke') spawnSmoke(pos, vel);
            } else if (data.t === 'hit') {
                let dmg = data.dmg;
                if (armor > 0) { const a = Math.floor(dmg * 0.6); armor = Math.max(0, armor - a); dmg -= a; }
                hp = Math.max(0, hp - dmg);
                updateUI();
                DOM['blood-fx'].style.boxShadow = 'inset 0 0 80px rgba(255,0,0,0.6)';
                setTimeout(() => DOM['blood-fx'].style.boxShadow = 'none', 150);
                if (data.sx !== undefined) showDamageIndicator(data.sx, data.sz);
                if (hp <= 0 && !isDead) {
                    playerDeath();
                    // Отправляем подтверждение убийства
                    if (mpActive) { mpSend({ t: 'kill_confirm', weapon: data.weapon || 'Unknown', headshot: data.headshot || false }); }
                }
            } else if (data.t === 'kill_confirm') {
                // Другой игрок подтвердил что умер — раунд выигран
                totalKills++;
                moneyVal += 300;
                addMsg(data.weapon, data.headshot, 'YOU');
                updateUI();
                // В онлайне — убийство = победа в раунде
                if (mpActive && roundPhase === 'live') {
                    endRound(playerTeam);
                }
            } else if (data.t === 'round_end') {
                // Другой игрок сообщает что раунд закончился
                if (roundPhase === 'live') {
                    endRound(data.winner);
                }
            } else if (data.t === 'new_round') {
                // Синхронизация нового раунда
                hp = 100; armor = 0; isDead = false;
                const spawnZ = playerTeam === 'CT' ? 72 : -72;
                camera.position.set(0, EYE_HEIGHT, spawnZ);
                footY = 0; vY = 0;
                document.getElementById('death-screen').style.display = 'none';
                updateUI();
                controls.lock();
            } else if (data.t === 'sound') {
                // Звук выстрела удалённого игрока (с затуханием по расстоянию)
                const dist = Math.sqrt(Math.pow(data.x - camera.position.x, 2) + Math.pow(data.z - camera.position.z, 2));
                if (dist < 100) {
                    const vol = Math.max(0.05, 1 - dist / 100);
                    if (data.weapon === 'knife') {
                        playSound('decay', 1500, 0.1, 0.12 * vol, 'triangle');
                    } else {
                        const w = weaponDefs[data.weapon];
                        if (w) {
                            const st = w.soundType || 'rifle';
                            if (st === 'silenced') { playNoise(0.04, 0.08 * vol); }
                            else if (st === 'sniper') { playNoise(0.15, 0.5 * vol); }
                            else { playNoise(0.08, 0.25 * vol); }
                        }
                    }
                }
            } else if (data.t === 'chat') {
                // Чат сообщение
                addChatMsg(data.name, data.msg);
            } else if (data.t === 'start') {
                // Гость получает противоположную команду от хоста
                const guestTeam = data.hostTeam === 'CT' ? 'T' : 'CT';
                mpActive = true;
                mpStartLocal(guestTeam);
            }
        }

        function mpSetupConn(conn) {
            mpConn = conn;
            conn.on('open', () => {
                console.log('[MP] Connection open with', conn.peer);
                mpSetStatus('Connected! Ready to play.', '#4fc');
                if (!mpIsHost) {
                    document.getElementById('online-start-btn').style.display = 'block';
                }
            });
            conn.on('data', data => {
                console.log('[MP] Received data:', data.t);
                mpHandleData(conn.peer, data);
            });
            conn.on('close', () => {
                console.log('[MP] Connection closed');
                mpSetStatus('Disconnected', '#f44');
                mpActive = false;
                // Обновляем список игроков
                const guestEl = document.getElementById('online-player-guest');
                if (guestEl) { guestEl.innerText = '🔴 Disconnected'; guestEl.style.color = '#f44'; }
                // Убираем меш отключившегося игрока
                if (mpRemotePlayers[conn.peer]) {
                    scene.remove(mpRemotePlayers[conn.peer].mesh);
                    delete mpRemotePlayers[conn.peer];
                }
            });
            conn.on('error', e => { console.error('[MP] Conn error:', e); mpSetStatus('Error: ' + e.message, '#f44'); });
        }

        window.showOnlineLobby = () => {
            document.getElementById('lobby').style.display = 'none';
            document.getElementById('online-lobby').style.display = 'flex';
            mpSetStatus('Not connected');
        };

        window.hideOnlineLobby = () => {
            document.getElementById('online-lobby').style.display = 'none';
            document.getElementById('lobby').style.display = 'flex';
            if (mpPeer) { mpPeer.destroy(); mpPeer = null; }
            mpActive = false; mpConn = null;
        };

        window.copyRoomCode = (btn) => {
            const code = document.getElementById('online-code-display').innerText;
            navigator.clipboard.writeText(code).then(() => {
                btn.innerText = '✓ COPIED!';
                setTimeout(() => btn.innerText = '📋 COPY CODE', 2000);
            });
        };

        window.hostOnline = () => {
            mpSetStatus('Waking up server... please wait', '#fa0');
            mpIsHost = true;
            useWebSocket = true;
            const playerName = document.getElementById('player-name')?.value || 'Player';

            // Сначала будим сервер HTTP запросом (Render засыпает)
            fetch(WS_SERVER.replace('wss://', 'https://'))
                .catch(() => {}) // игнорируем ошибки
                .finally(() => {
                    // Через 2 сек подключаемся по WebSocket
                    setTimeout(() => {
                        mpSetStatus('Connecting...', '#fa0');
                        wsConn = new WebSocket(WS_SERVER);
                        wsConn.onopen = () => {
                            wsConn.send(JSON.stringify({ t: 'create', name: playerName }));
                        };
            wsConn.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.t === 'created') {
                    wsPlayerId = data.id;
                    wsRoomCode = data.code;
                    document.getElementById('online-room-code').style.display = 'block';
                    document.getElementById('online-code-display').innerText = data.code;
                    document.getElementById('online-start-btn').style.display = 'block';
                    document.getElementById('online-players-list').style.display = 'block';
                    mpSetStatus('Room created. Waiting for players...', '#4fc');
                } else if (data.t === 'game_start') {
                    mpActive = true;
                    mpStartLocal(data.team);
                } else if (data.t === 'player_joined') {
                    mpSetStatus(`${data.name} joined! Press START.`, '#4fc');
                    document.getElementById('online-player-guest').innerText = `🟢 ${data.name}`;
                    document.getElementById('online-player-guest').style.color = '#4fc';
                } else if (data.t === 'player_left') {
                    mpSetStatus('Player disconnected', '#f44');
                    if (mpRemotePlayers[data.id]) {
                        scene.remove(mpRemotePlayers[data.id].mesh);
                        delete mpRemotePlayers[data.id];
                    }
                } else if (data.t === 'error') {
                    mpSetStatus(data.msg, '#f44');
                } else {
                    wsHandleGameData(data);
                }
            };
            wsConn.onclose = () => { mpSetStatus('Disconnected. Click HOST to retry.', '#f44'); mpActive = false; };
            wsConn.onerror = () => { mpSetStatus('Server waking up... Click HOST again in 10s', '#fa0'); };
                    }, 2000);
                });
        };

        window.joinOnline = () => {
            const code = document.getElementById('join-code-input').value.trim();
            if (!code) { mpSetStatus('Enter room code', '#f44'); return; }
            mpSetStatus('Connecting...', '#fa0');
            mpIsHost = false;
            useWebSocket = true;
            const playerName = document.getElementById('player-name')?.value || 'Player';
            wsConn = new WebSocket(WS_SERVER);
            wsConn.onopen = () => {
                wsConn.send(JSON.stringify({ t: 'join', code, name: playerName }));
            };
            wsConn.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.t === 'joined') {
                    wsPlayerId = data.id;
                    wsRoomCode = data.code;
                    mpSetStatus(`Joined room ${data.code}`, '#4fc');
                    document.getElementById('online-start-btn').style.display = 'block';
                } else if (data.t === 'game_start') {
                    mpActive = true;
                    mpStartLocal(data.team);
                } else if (data.t === 'player_left') {
                    if (mpRemotePlayers[data.id]) {
                        scene.remove(mpRemotePlayers[data.id].mesh);
                        delete mpRemotePlayers[data.id];
                    }
                } else if (data.t === 'error') {
                    mpSetStatus(data.msg, '#f44');
                } else {
                    wsHandleGameData(data);
                }
            };
            wsConn.onclose = () => { mpSetStatus('Disconnected', '#f44'); mpActive = false; };
            wsConn.onerror = () => { mpSetStatus('Connection error', '#f44'); };
        };

        // Обработка игровых данных от WebSocket сервера
        function wsHandleGameData(data) {
            const pid = data.pid;
            if (!pid) return;
            // Переиспользуем mpHandleData
            mpHandleData(pid, data);
        }

        // Отправка данных через WebSocket
        function wsSend(data) {
            if (wsConn && wsConn.readyState === 1) {
                wsConn.send(JSON.stringify(data));
            }
        }

        // Универсальная отправка — WebSocket или PeerJS
        function mpSend(data) {
            if (useWebSocket) {
                wsSend(data);
            } else if (mpConn && mpConn.open) {
                mpConn.send(data);
            }
        }

        window.mpClickToPlay = () => {
            document.getElementById('mp-click-to-play').style.display = 'none';
            controls.lock();
        };

        /* ========== VOICE CHAT (WebRTC) — Push-to-Talk (V) ========== */
        let voiceEnabled = false;
        let localStream = null;
        let voiceCall = null;
        let voiceTalking = false;

        // Автоматически подключаем микрофон при старте онлайна (замьючен)
        async function voiceInit() {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                // Сразу мьютим — говорить только при зажатии V
                localStream.getAudioTracks().forEach(t => { t.enabled = false; });
                voiceEnabled = true;
                document.getElementById('voice-chat-btn').innerText = '🎤 Push V to talk';
                // Звоним другому игроку
                if (mpPeer && mpConn && mpConn.peer) {
                    voiceCall = mpPeer.call(mpConn.peer, localStream);
                    voiceCall.on('stream', (remoteStream) => {
                        document.getElementById('remote-audio').srcObject = remoteStream;
                    });
                }
            } catch (err) {
                console.warn('[VOICE] Microphone access denied:', err);
                document.getElementById('voice-chat-btn').innerText = '🎤 Mic denied';
            }
        }

        window.toggleVoice = () => {
            if (!voiceEnabled) {
                voiceInit();
            }
        };

        // Push-to-talk: V key
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyV' && voiceEnabled && localStream && !voiceTalking) {
                voiceTalking = true;
                localStream.getAudioTracks().forEach(t => { t.enabled = true; });
                const btn = document.getElementById('voice-chat-btn');
                btn.innerText = '🔊 Talking...';
                btn.style.borderColor = '#f80';
                btn.style.color = '#f80';
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'KeyV' && voiceEnabled && localStream) {
                voiceTalking = false;
                localStream.getAudioTracks().forEach(t => { t.enabled = false; });
                const btn = document.getElementById('voice-chat-btn');
                btn.innerText = '🎤 Push V to talk';
                btn.style.borderColor = 'rgba(50,200,100,0.4)';
                btn.style.color = '#4fc';
            }
        });

        // Принимаем входящий звонок
        function mpSetupVoiceListener() {
            if (!mpPeer) return;
            mpPeer.on('call', async (call) => {
                try {
                    if (!localStream) {
                        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                        localStream.getAudioTracks().forEach(t => { t.enabled = false; });
                        voiceEnabled = true;
                        document.getElementById('voice-chat-btn').innerText = '🎤 Push V to talk';
                    }
                    call.answer(localStream);
                    voiceCall = call;
                    call.on('stream', (remoteStream) => {
                        document.getElementById('remote-audio').srcObject = remoteStream;
                    });
                } catch (err) {
                    console.warn('[VOICE] Failed to answer call:', err);
                }
            });
        }

        window.startOnlineGame = () => {
            if (useWebSocket) {
                if (mpIsHost && wsConn && wsConn.readyState === 1) {
                    wsConn.send(JSON.stringify({ t: 'start_game' }));
                    // Сервер пришлёт game_start с командой — обработается в onmessage
                } else if (!mpIsHost) {
                    mpSetStatus('Waiting for host to start...', '#fa0');
                }
            } else {
                // PeerJS fallback
                if (mpIsHost) {
                    const hostTeam = 'CT';
                    mpSend({ t: 'start', hostTeam });
                    mpActive = true;
                    mpStartLocal(hostTeam);
                } else {
                    mpSetStatus('Waiting for host to start...', '#fa0');
                }
            }
        };


        // ===== EXPORT FUNCTIONS TO WINDOW (for onclick handlers in HTML) =====
        window.respawnPlayer = respawnPlayer;
        window.closeSettings = closeSettings;
        window.goToMainMenu = goToMainMenu;
        window.buy = buy;
        window.closeBuyMenu = closeBuyMenu;
        window.mpClickToPlay = mpClickToPlay;
        window.hostOnline = hostOnline;
        window.joinOnline = joinOnline;
        window.copyRoomCode = copyRoomCode;
        window.startOnlineGame = startOnlineGame;
        window.hideOnlineLobby = hideOnlineLobby;
        window.startSolo = startSolo;
        window.startEbash = startEbash;
        window.showOnlineLobby = showOnlineLobby;
        window.toggleMenuSettings = toggleMenuSettings;
        window.toggleMenuControls = toggleMenuControls;
        window.updateSensitivity = updateSensitivity;
        window.updateScopeSensitivity = updateScopeSensitivity;
        window.setQuality = setQuality;

        // Показываем кнопки меню после загрузки модуля
        const loadingEl = document.getElementById('loading-indicator');
        if (loadingEl) loadingEl.style.display = 'none';
        const menuBtns = document.getElementById('menu-buttons');
        if (menuBtns) menuBtns.style.display = 'block';


