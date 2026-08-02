import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyCQD0VDKp94d6mxMyIABT2-JYGdXGpezF0",
    authDomain: "slopblocks.firebaseapp.com",
    projectId: "slopblocks",
    storageBucket: "slopblocks.firebasestorage.app",
    messagingSenderId: "2703874752",
    appId: "1:2703874752:web:3fe1ec186c06c43a386785",
    measurementId: "G-GGT5W0NXW"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const playerId = Math.random().toString(36).substring(2, 9);
const playerRef = ref(db, 'players/' + playerId);
onDisconnect(playerRef).remove(); // Remove player from DB when they close tab

// --- GLOBAL GAME STATE ---
let myName = "";
let myMode = "";
let myPosition = { x: 0, y: 0.5, z: 0 };
let myCube, camera, scene, renderer;
const otherPlayers = {};

// --- PROFANITY FILTER ---
const badWords = ['shit', 'fuck', 'bitch', 'ass', 'damn', 'crap', 'slut', 'whore', 'dick', 'cock']; 

function checkName(name) {
    const lowerName = name.toLowerCase();
    for (let i = 0; i < badWords.length; i++) {
        if (lowerName.includes(badWords[i])) {
            return false; // Found a bad word
        }
    }
    return true; // Name is clean
}

// --- MENU LOGIC ---
const menuElement = document.getElementById('main-menu');
const nameInput = document.getElementById('playerName');
const errorMsg = document.getElementById('error-msg');

function tryJoinGame(mode) {
    const desiredName = nameInput.value.trim();
    
    if (desiredName.length < 3) {
        errorMsg.innerText = "Name must be at least 3 characters!";
        return;
    }
    if (!checkName(desiredName)) {
        errorMsg.innerText = "No cussing! Choose an appropriate name.";
        return;
    }

    // Success! Set variables and start game.
    myName = desiredName;
    myMode = mode;
    menuElement.style.display = 'none';
    initThreeJS();
}

document.getElementById('btn-obby').addEventListener('click', () => tryJoinGame('obby'));
document.getElementById('btn-void').addEventListener('click', () => tryJoinGame('void'));
document.getElementById('btn-lava').addEventListener('click', () => tryJoinGame('lava'));

// --- HELPER: CREATE NAME TAG ---
function createNameSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Draw text
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    
    // Add a slight black outline to text for readability
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'black';
    ctx.strokeText(text, 128, 64);
    ctx.fillText(text, 128, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 1, 1);
    sprite.position.set(0, 1.2, 0); // Float slightly above the block
    return sprite;
}

// --- THREE.JS INITIALIZATION ---
function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Build the world based on selection
    if (myMode === 'obby') buildObby();
    if (myMode === 'void') buildDarkVoid();
    if (myMode === 'lava') buildLavaSurvival();

    // Create Local Player
    const myGeometry = new THREE.BoxGeometry(1, 1, 1);
    const myMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    myCube = new THREE.Mesh(myGeometry, myMaterial);
    
    // Attach Name Tag to Local Player
    const myNameTag = createNameSprite(myName);
    myCube.add(myNameTag); 
    
    scene.add(myCube);
    updateCamera();

    // Start sending data to Firebase
    set(playerRef, { x: myPosition.x, y: myPosition.y, z: myPosition.z, name: myName, mode: myMode });

    // Start Game Loop
    animate();
    setupControls();
    listenToFirebase();
}

// --- WORLD BUILDERS ---

function buildObby() {
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    // Create a series of floating platforms
    for(let i = 0; i < 10; i++) {
        const platGeo = new THREE.BoxGeometry(3, 0.5, 3);
        const platMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
        const platform = new THREE.Mesh(platGeo, platMat);
        platform.position.set(0, 0, -i * 5);
        scene.add(platform);
    }
    myPosition = { x: 0, y: 1, z: 0 }; // Start on first platform
}

function buildDarkVoid() {
    scene.background = new THREE.Color(0x050505); // Pitch black void
    // Add tall, somewhat fat white buildings scattered around
    for(let i = 0; i < 30; i++) {
        // Height between 10 and 30, Width/Depth between 3 and 6
        const w = 3 + Math.random() * 3;
        const h = 10 + Math.random() * 20; 
        const d = 3 + Math.random() * 3;
        
        const bldgGeo = new THREE.BoxGeometry(w, h, d);
        const bldgMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const building = new THREE.Mesh(bldgGeo, bldgMat);
        
        // Random placement
        building.position.set((Math.random() - 0.5) * 50, h/2 - 1, (Math.random() - 0.5) * 50);
        scene.add(building);
    }
    
    // Tiny starting floor so you don't fall instantly
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    scene.add(floor);
    myPosition = { x: 0, y: 1, z: 0 };
}

function buildLavaSurvival() {
    scene.background = new THREE.Color(0x3a0000); // Dark red sky
    
    // Giant Lava Floor
    const lavaGeo = new THREE.PlaneGeometry(100, 100);
    const lavaMat = new THREE.MeshStandardMaterial({ color: 0xff2200, side: THREE.DoubleSide });
    const lavaFloor = new THREE.Mesh(lavaGeo, lavaMat);
    lavaFloor.rotation.x = Math.PI / 2;
    scene.add(lavaFloor);

    // Add safe zones (black rocks)
    for(let i = 0; i < 15; i++) {
        const rock = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        rock.position.set((Math.random() - 0.5) * 80, 1, (Math.random() - 0.5) * 80);
        scene.add(rock);
    }
    myPosition = { x: 0, y: 2.5, z: 0 }; // Spawn high up
}

// --- MOVEMENT & CAMERA ---
function updateCamera() {
    myCube.position.set(myPosition.x, myPosition.y, myPosition.z);
    camera.position.set(myPosition.x, myPosition.y + 5, myPosition.z + 10);
    camera.lookAt(myCube.position);
}

function setupControls() {
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        const speed = 0.5;

        if (key === 'w') myPosition.z -= speed;
        if (key === 's') myPosition.z += speed;
        if (key === 'a') myPosition.x -= speed;
        if (key === 'd') myPosition.x += speed;

        updateCamera();
        
        // Push new data to Firebase
        set(playerRef, { x: myPosition.x, y: myPosition.y, z: myPosition.z, name: myName, mode: myMode });
    });
}

// --- MULTIPLAYER SYNC ---
function listenToFirebase() {
    const allPlayersRef = ref(db, 'players');
    onValue(allPlayersRef, (snapshot) => {
        const data = snapshot.val() || {};

        // 1. Loop over database to update or add players
        Object.keys(data).forEach((id) => {
            if (id === playerId) return; // Skip yourself

            const pData = data[id];

            // Only show players if they are in the EXACT SAME game mode
            if (pData.mode !== myMode) {
                // If they switched modes, remove them from our screen
                if (otherPlayers[id]) {
                    scene.remove(otherPlayers[id]);
                    delete otherPlayers[id];
                }
                return;
            }

            // Create new player mesh if they don't exist yet
            if (!otherPlayers[id]) {
                const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
                const cubeMat = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red for others
                const pCube = new THREE.Mesh(cubeGeo, cubeMat);
                
                // Add their name tag!
                const nameTag = createNameSprite(pData.name || "Unknown");
                pCube.add(nameTag);

                scene.add(pCube);
                otherPlayers[id] = pCube;
            }

            // Update their position smoothly
            otherPlayers[id].position.set(pData.x, pData.y, pData.z);
        });

        // 2. Remove players who disconnected from the server entirely
        Object.keys(otherPlayers).forEach((id) => {
            if (!data[id]) {
                scene.remove(otherPlayers[id]);
                delete otherPlayers[id];
            }
        });
    });
}

// --- RENDER LOOP ---
window.addEventListener('resize', () => {
    if(!camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}