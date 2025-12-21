// --- 1. SHADER CODE ---
// Vertex Shader: Pass through
const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// Fragment Shader: Domain Warping + Noise + Grain
// Creates a "Noir" liquid smoke effect
const fragmentShader = `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    varying vec2 vUv;

    // Simplex Noise Function
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
            + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    // Domain Warping for Liquid Effect
    float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 3; i++) {
            value += amplitude * snoise(p);
            p *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    // Random for Grain
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
        vec2 st = gl_FragCoord.xy / uResolution.xy;
        // Aspect ratio correction
        st.x *= uResolution.x / uResolution.y;

        // Mouse influence (smooth)
        vec2 mouse = uMouse * uResolution.x / uResolution.y;
        float mouseDist = distance(st, mouse);
        
        // Base warping
        vec2 q = vec2(0.0);
        q.x = fbm( st + 0.1 * uTime );
        q.y = fbm( st + vec2(1.0));

        vec2 r = vec2(0.0);
        r.x = fbm( st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * uTime );
        r.y = fbm( st + 1.0 * q + vec2(8.3, 2.8) + 0.126 * uTime);

        float f = fbm(st + r);

        // Mix colors: Deep Black, Charcoal, and a hint of blue/purple tint for luxury depth
        vec3 colorBlack = vec3(0.02, 0.02, 0.02);
        vec3 colorGrey = vec3(0.15, 0.15, 0.16);
        vec3 colorHighlight = vec3(0.1, 0.1, 0.12);

        vec3 color = mix(colorBlack, colorGrey, clamp((f*f)*4.0, 0.0, 1.0));
        color = mix(color, colorHighlight, clamp(length(q), 0.0, 1.0));
        
        // Add fluid brightness based on warp
        color += r.y * 0.05;

        // Noir Grain (Film effect)
        float noise = random(st * uTime);
        color += (noise - 0.5) * 0.08;

        // Mouse reaction: subtle brighten around cursor
        float interaction = 1.0 - smoothstep(0.0, 0.5, mouseDist);
        color += vec3(0.05) * interaction;

        gl_FragColor = vec4(color, 1.0);
    }
`;

// --- 2. THREE.JS SETUP ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({ alpha: false });

// Performance optimization: limit pixel ratio on mobile
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) }
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: uniforms
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// --- 3. EVENT HANDLERS ---
const targetMouse = new THREE.Vector2(0.5, 0.5);

// Resize
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uResolution.value.set(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
});

// Mouse/Touch Move
document.addEventListener('mousemove', (e) => {
    targetMouse.x = e.clientX / window.innerWidth;
    targetMouse.y = 1.0 - (e.clientY / window.innerHeight);
});

// Touch support for mobile interaction
document.addEventListener('touchmove', (e) => {
    if(e.touches.length > 0) {
        targetMouse.x = e.touches[0].clientX / window.innerWidth;
        targetMouse.y = 1.0 - (e.touches[0].clientY / window.innerHeight);
    }
});

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();
    uniforms.uTime.value = elapsedTime;

    // Lerp mouse for smooth liquid feel
    uniforms.uMouse.value.x += (targetMouse.x - uniforms.uMouse.value.x) * 0.05;
    uniforms.uMouse.value.y += (targetMouse.y - uniforms.uMouse.value.y) * 0.05;

    renderer.render(scene, camera);
}
animate();

// --- 4. GSAP ANIMATIONS ---
window.onload = () => {
    // Fake loading line
    const loaderLine = document.getElementById('loader-line');
    const loader = document.getElementById('loader');
    
    // Step 1: Fill line
    loaderLine.style.width = '100%';

    // Step 2: Reveal content
    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            document.body.classList.add('loaded'); // Enable hover effects

            // Staggered reveal of UI elements
            gsap.to('.gsap-reveal', {
                duration: 1.2,
                y: 0,
                opacity: 1,
                stagger: 0.15,
                ease: "power3.out"
            });
        }, 1000);
    }, 1200);
};
