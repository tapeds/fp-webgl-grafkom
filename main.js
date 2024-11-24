const canvas = document.getElementById("webglCanvas");
const gl = canvas.getContext("webgl", { antialias: true });

if (!gl) {
  alert("WebGL not supported in this browser.");
  throw new Error("WebGL not supported.");
}

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);

const vertexShaderSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  uniform mat4 uNormalMatrix;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vec4 position = uModelViewMatrix * vec4(aPosition, 1.0);
    gl_Position = uProjectionMatrix * position;
    vNormal = (uNormalMatrix * vec4(aNormal, 0.0)).xyz;
    vPosition = position.xyz;
  }
`;

const fragmentShaderSource = `
  precision highp float;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  uniform vec3 uLightPosition;
  uniform vec3 uAmbientColor;
  uniform vec3 uDiffuseColor;
  uniform vec3 uSpecularColor;
  uniform float uShininess;
  
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightPosition - vPosition);
    
    vec3 ambient = uAmbientColor;
    
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * uDiffuseColor;
    
    vec3 viewDir = normalize(-vPosition);
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
    vec3 specular = spec * uSpecularColor;
    
    vec3 result = ambient + diffuse + specular;
    gl_FragColor = vec4(result, 1.0);
  }
`;

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let rotationX = 0;
let rotationY = 0;
let zoomLevel = 5;

function setupMouseControls(canvas) {
    canvas.addEventListener('mousedown', (event) => {
        isDragging = true;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
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
        
        rotationY += deltaX * 0.01;
        rotationX += deltaY * 0.01;
        
        rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationX));
        
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
    });

    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        zoomLevel += event.deltaY * 0.01;
        zoomLevel = Math.max(2, Math.min(20, zoomLevel));
    });
}

function updateModelViewMatrix() {
    const modelViewMatrix = mat4.create();
    mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, -zoomLevel]);
    mat4.rotateX(modelViewMatrix, modelViewMatrix, rotationX);
    mat4.rotateY(modelViewMatrix, modelViewMatrix, rotationY);
    return modelViewMatrix;
}

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
      for (let i = 0; i < 3; i++) {
        const v1 = faceVertices[i];
        const v2 = faceVertices[(i + 1) % 3];
        const v3 = faceVertices[(i + 2) % 3];
        
        const p1 = [positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2]];
        const p2 = [positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2]];
        const p3 = [positions[v3 * 3], positions[v3 * 3 + 1], positions[v3 * 3 + 2]];
        
        const vec1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
        const vec2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
        const normal = [
          vec1[1] * vec2[2] - vec1[2] * vec2[1],
          vec1[2] * vec2[0] - vec1[0] * vec2[2],
          vec1[0] * vec2[1] - vec1[1] * vec2[0]
        ];
        
        for (const vertex of faceVertices) {
          if (!tempNormals.has(vertex)) {
            tempNormals.set(vertex, [0, 0, 0]);
          }
          const n = tempNormals.get(vertex);
          n[0] += normal[0];
          n[1] += normal[1];
          n[2] += normal[2];
        }
      }
      indices.push(...faceVertices);
    }
  }

  tempNormals.forEach((normal, vertex) => {
    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (length > 0) {  // Avoid division by zero
      normal[0] /= length;
      normal[1] /= length;
      normal[2] /= length;
    }
    normals.push(...normal);
  });

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

  return { positions, normals, indices };
}

function createShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Shader program linking failed:", gl.getProgramInfoLog(program));
    return null;
  }

  return program;
}

function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
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

async function main() {
  const obj = await loadOBJ("model.obj");

  const program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
  gl.useProgram(program);

  // Get attribute locations - THIS WAS MISSING
  const attribLocations = {
    position: gl.getAttribLocation(program, 'aPosition'),
    normal: gl.getAttribLocation(program, 'aNormal')
  };

  setupMouseControls(canvas);

  const buffers = createBuffers(gl, obj);

  // Enable attributes and set up vertex attribute pointers - THIS WAS MISSING
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
    uShininess: gl.getUniformLocation(program, "uShininess")
  };

  const projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
  gl.uniformMatrix4fv(uniforms.uProjectionMatrix, false, projectionMatrix);

  gl.uniform3fv(uniforms.uLightPosition, [5.0, 5.0, 5.0]);
  gl.uniform3fv(uniforms.uAmbientColor, [0.2, 0.2, 0.2]);
  gl.uniform3fv(uniforms.uDiffuseColor, [0.8, 0.8, 0.8]);
  gl.uniform3fv(uniforms.uSpecularColor, [1.0, 1.0, 1.0]);
  gl.uniform1f(uniforms.uShininess, 32.0);

  function render() {
    gl.clearColor(0.9, 0.9, 0.9, 1.0);  // Light gray background
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