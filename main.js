const canvas = document.getElementById("webglCanvas");
const gl = canvas.getContext("webgl", { 
  antialias: true,
  preserveDrawingBuffer: true // Helps with screenshots
});

if (!gl) {
  alert("WebGL not supported in this browser.");
  throw new Error("WebGL not supported.");
}

// Handle canvas resize
function resizeCanvas() {
  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Enhanced WebGL state setup
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

// Enhanced vertex shader with view position for specular calculation
const vertexShaderSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  uniform mat4 uNormalMatrix;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  
  void main() {
    vec4 position = uModelViewMatrix * vec4(aPosition, 1.0);
    gl_Position = uProjectionMatrix * position;
    vNormal = (uNormalMatrix * vec4(aNormal, 0.0)).xyz;
    vPosition = position.xyz;
    vViewPosition = -position.xyz; // View position for better specular
  }
`;

// Enhanced fragment shader with improved lighting model
const fragmentShaderSource = `
  precision highp float;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  
  uniform vec3 uLightPosition;
  uniform vec3 uAmbientColor;
  uniform vec3 uDiffuseColor;
  uniform vec3 uSpecularColor;
  uniform float uShininess;
  uniform float uRimLightIntensity;
  uniform vec3 uRimLightColor;
  
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightPosition - vPosition);
    vec3 viewDir = normalize(vViewPosition);
    
    // Ambient
    vec3 ambient = uAmbientColor;
    
    // Diffuse
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * uDiffuseColor;
    
    // Specular (Blinn-Phong)
    vec3 halfwayDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), uShininess);
    vec3 specular = spec * uSpecularColor;
    
    // Rim lighting
    float rimFactor = 1.0 - max(dot(viewDir, normal), 0.0);
    rimFactor = pow(rimFactor, 3.0) * uRimLightIntensity;
    vec3 rim = rimFactor * uRimLightColor;
    
    // Final color
    vec3 result = ambient + diffuse + specular + rim;
    
    // Tone mapping and gamma correction
    result = result / (result + vec3(1.0));
    result = pow(result, vec3(1.0 / 2.2));
    
    gl_FragColor = vec4(result, 1.0);
  }
`;

// Enhanced camera controls
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let rotationX = 0;
let rotationY = 0;
let zoomLevel = 5;
let autoRotate = true;
let autoRotateSpeed = 0.001;

function setupMouseControls(canvas) {
    canvas.addEventListener('mousedown', (event) => {
        isDragging = true;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        autoRotate = false; // Disable auto-rotation when user interacts
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    canvas.addEventListener('mousemove', (event) => {
        if (!isDragging) return;
        
        const deltaX = event.clientX - lastMouseX;
        const deltaY = event.clientY - lastMouseY;
        
        const rotationSpeed = 0.005;
        rotationY += deltaX * rotationSpeed;
        rotationX += deltaY * rotationSpeed;
        
        // Limit vertical rotation to avoid gimbal lock
        rotationX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rotationX));
        
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
    });

    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        const zoomSpeed = 0.001;
        zoomLevel += event.deltaY * zoomSpeed;
        zoomLevel = Math.max(2, Math.min(20, zoomLevel));
    });

    // Double click to reset view
    canvas.addEventListener('dblclick', () => {
        rotationX = 0;
        rotationY = 0;
        zoomLevel = 5;
        autoRotate = true;
    });
}

// Enhanced model view matrix calculation
function updateModelViewMatrix() {
    const modelViewMatrix = mat4.create();
    mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, -zoomLevel]);
    mat4.rotateX(modelViewMatrix, modelViewMatrix, rotationX);
    mat4.rotateY(modelViewMatrix, modelViewMatrix, rotationY + (autoRotate ? performance.now() * autoRotateSpeed : 0));
    return modelViewMatrix;
}

// Enhanced OBJ loader with better normal calculation
async function loadOBJ(url) {
  const response = await fetch(url);
  const objText = await response.text();

  const positions = [];
  const normals = [];
  const indices = [];
  const tempNormals = new Map();

  const lines = objText.split("\n");
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "v") {
      positions.push(...parts.slice(1).map(parseFloat));
    } else if (parts[0] === "f") {
      const faceVertices = parts.slice(1).map(v => parseInt(v.split("/")[0]) - 1);
      
      // Calculate face normal using Newell's method for better accuracy
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < faceVertices.length; i++) {
        const v1 = faceVertices[i];
        const v2 = faceVertices[(i + 1) % faceVertices.length];
        
        const x1 = positions[v1 * 3];
        const y1 = positions[v1 * 3 + 1];
        const z1 = positions[v1 * 3 + 2];
        const x2 = positions[v2 * 3];
        const y2 = positions[v2 * 3 + 1];
        const z2 = positions[v2 * 3 + 2];
        
        nx += (y1 - y2) * (z1 + z2);
        ny += (z1 - z2) * (x1 + x2);
        nz += (x1 - x2) * (y1 + y2);
      }
      
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (length > 0) {
        nx /= length;
        ny /= length;
        nz /= length;
      }
      
      for (const vertex of faceVertices) {
        if (!tempNormals.has(vertex)) {
          tempNormals.set(vertex, [0, 0, 0]);
        }
        const n = tempNormals.get(vertex);
        n[0] += nx;
        n[1] += ny;
        n[2] += nz;
      }
      
      // Triangulate face if necessary
      for (let i = 1; i < faceVertices.length - 1; i++) {
        indices.push(faceVertices[0], faceVertices[i], faceVertices[i + 1]);
      }
    }
  }

  // Normalize accumulated vertex normals
  const normalArray = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const normal = tempNormals.get(i) || [0, 0, 1];
    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (length > 0) {
      normal[0] /= length;
      normal[1] /= length;
      normal[2] /= length;
    }
    normalArray.push(...normal);
  }

  // Center and scale model
  let [minX, minY, minZ] = [Infinity, Infinity, Infinity];
  let [maxX, maxY, maxZ] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }

  const center = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  ];
  
  const scale = 2 / Math.max(maxX - minX, maxY - minY, maxZ - minZ);

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - center[0]) * scale;
    positions[i + 1] = (positions[i + 1] - center[1]) * scale;
    positions[i + 2] = (positions[i + 2] - center[2]) * scale;
  }

  return { positions, normals: normalArray, indices };
}

function createShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);

  if (!vertexShader || !fragmentShader) {
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Shader program linking failed:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  // Clean up shader objects after linking
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(
      `Shader compile error in ${type === gl.VERTEX_SHADER ? "vertex" : "fragment"} shader:`, 
      gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createBuffers(gl, obj) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.positions), gl.STATIC_DRAW);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.normals), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(obj.indices), gl.STATIC_DRAW);

  return { positionBuffer, normalBuffer, indexBuffer };
}

// Rest of the code remains largely the same, but with enhanced uniform setup
async function main() {
  const obj = await loadOBJ("model.obj");
  const program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
  gl.useProgram(program);

  const attribLocations = {
    position: gl.getAttribLocation(program, 'aPosition'),
    normal: gl.getAttribLocation(program, 'aNormal')
  };

  setupMouseControls(canvas);
  const buffers = createBuffers(gl, obj);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer);
  gl.enableVertexAttribArray(attribLocations.position);
  gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normalBuffer);
  gl.enableVertexAttribArray(attribLocations.normal);
  gl.vertexAttribPointer(attribLocations.normal, 3, gl.FLOAT, false, 0, 0);

  const uniforms = {
    uModelViewMatrix: gl.getUniformLocation(program, "uModelViewMatrix"),
    uProjectionMatrix: gl.getUniformLocation(program, "uProjectionMatrix"),
    uNormalMatrix: gl.getUniformLocation(program, "uNormalMatrix"),
    uLightPosition: gl.getUniformLocation(program, "uLightPosition"),
    uAmbientColor: gl.getUniformLocation(program, "uAmbientColor"),
    uDiffuseColor: gl.getUniformLocation(program, "uDiffuseColor"),
    uSpecularColor: gl.getUniformLocation(program, "uSpecularColor"),
    uShininess: gl.getUniformLocation(program, "uShininess"),
    uRimLightIntensity: gl.getUniformLocation(program, "uRimLightIntensity"),
    uRimLightColor: gl.getUniformLocation(program, "uRimLightColor")
  };

  const projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
  gl.uniformMatrix4fv(uniforms.uProjectionMatrix, false, projectionMatrix);

  // Enhanced lighting setup
  gl.uniform3fv(uniforms.uLightPosition, [5.0, 5.0, 5.0]);
  gl.uniform3fv(uniforms.uAmbientColor, [0.2, 0.2, 0.25]); // Slightly blue ambient
  gl.uniform3fv(uniforms.uDiffuseColor, [0.8, 0.8, 0.85]);
  gl.uniform3fv(uniforms.uSpecularColor, [1.0, 1.0, 1.0]);
  gl.uniform1f(uniforms.uShininess, 64.0); // Increased shininess
  gl.uniform1f(uniforms.uRimLightIntensity, 0.7);
  gl.uniform3fv(uniforms.uRimLightColor, [0.5, 0.5, 0.7]); // Subtle blue rim light

  function render() {
    gl.clearColor(0.95, 0.95, 0.95, 1.0); // Slightly lighter background
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const modelViewMatrix = updateModelViewMatrix();
    gl.uniformMatrix4fv(uniforms.uModelViewMatrix, false, modelViewMatrix);

    const normalMatrix = mat4.create();
    mat4.invert(normalMatrix, modelViewMatrix);
    mat4.transpose(normalMatrix, normalMatrix);
    gl.uniformMatrix4fv(uniforms.uNormalMatrix, false, normalMatrix);

    gl.drawElements(gl.TRIANGLES, obj.indices.length, gl.UNSIGNED_SHORT, 0);
    requestAnimationFrame(render);
  }

  render();
}

main();