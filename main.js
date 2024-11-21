// Function to initialize WebGL context
function initializeWebGL(canvasId) {
    const canvas = document.getElementById(canvasId);
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); // Prefer WebGL2
    if (!gl) {
        throw new Error('WebGL not supported');
    }
    
    // Enable depth testing and configure viewport
    gl.enable(gl.DEPTH_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    return gl;
}

// Function to compile a shader
function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed: ${error}`);
    }
    
    return shader;
}

// Function to create a WebGL program
function createProgram(gl, vertexShaderSource, fragmentShaderSource) {
    try {
        const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program));
        }
        
        // Clean up individual shaders after linking
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        
        return program;
    } catch (error) {
        console.error('Program creation failed:', error);
        throw error;
    }
}

// Function to create a WebGL buffer and upload data
function createBuffer(gl, data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    
    // Support different array types
    const typedData = data instanceof Float32Array 
        ? data 
        : new Float32Array(data);
    
    gl.bufferData(target, typedData, usage);
    return buffer;
}

// Function to parse an OBJ file
function parseOBJ(objText) {
    const vertices = [];
    const normals = [];
    const texCoords = [];
    const indices = [];
    const vertexNormalIndices = [];
    const vertexTexCoordIndices = [];

    const lines = objText.split('\n');
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const prefix = parts[0];

        switch (prefix) {
            case 'v':
                vertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
                break;
            case 'vn':
                normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
                break;
            case 'vt':
                texCoords.push(parseFloat(parts[1]), parseFloat(parts[2]));
                break;
            case 'f':
                const faceVertices = [];
                const faceNormals = [];
                const faceTexCoords = [];

                for (let i = 1; i < parts.length; i++) {
                    const [v, t, n] = parts[i].split('/').map(x => parseInt(x, 10) - 1);
                    faceVertices.push(v);
                    if (t !== undefined) faceTexCoords.push(t);
                    if (n !== undefined) faceNormals.push(n);
                }

                // Triangulate polygon if more than 3 vertices
                for (let i = 1; i < faceVertices.length - 1; i++) {
                    indices.push(faceVertices[0], faceVertices[i], faceVertices[i + 1]);
                    
                    if (faceNormals.length) {
                        vertexNormalIndices.push(
                            faceNormals[0], faceNormals[i], faceNormals[i + 1]
                        );
                    }
                    
                    if (faceTexCoords.length) {
                        vertexTexCoordIndices.push(
                            faceTexCoords[0], faceTexCoords[i], faceTexCoords[i + 1]
                        );
                    }
                }
                break;
        }
    });

    return { 
        vertices, 
        normals, 
        texCoords, 
        indices, 
        vertexNormalIndices, 
        vertexTexCoordIndices 
    };
}

// Function to parse an MTL file
function parseMTL(mtlText) {
    const materials = {};
    const lines = mtlText.split('\n');
    let currentMaterial = null;

    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const prefix = parts[0];

        switch (prefix) {
            case 'newmtl': // New material
                currentMaterial = parts[1];
                materials[currentMaterial] = {
                    Ns: 0,
                    Ka: [1, 1, 1],
                    Kd: [1, 1, 1],
                    Ks: [0.5, 0.5, 0.5],
                    Ke: [0, 0, 0],
                    Ni: 1,
                    d: 1,
                    illum: 2,
                };
                break;
            case 'Ns': // Specular exponent
                if (currentMaterial) materials[currentMaterial].Ns = parseFloat(parts[1]);
                break;
            case 'Ka': // Ambient color
                if (currentMaterial) materials[currentMaterial].Ka = parts.slice(1, 4).map(Number);
                break;
            case 'Kd': // Diffuse color
                if (currentMaterial) materials[currentMaterial].Kd = parts.slice(1, 4).map(Number);
                break;
            case 'Ks': // Specular color
                if (currentMaterial) materials[currentMaterial].Ks = parts.slice(1, 4).map(Number);
                break;
            case 'Ke': // Emissive color
                if (currentMaterial) materials[currentMaterial].Ke = parts.slice(1, 4).map(Number);
                break;
            case 'Ni': // Optical density
                if (currentMaterial) materials[currentMaterial].Ni = parseFloat(parts[1]);
                break;
            case 'd': // Transparency
                if (currentMaterial) materials[currentMaterial].d = parseFloat(parts[1]);
                break;
            case 'illum': // Illumination model
                if (currentMaterial) materials[currentMaterial].illum = parseInt(parts[1], 10);
                break;
        }
    });

    return materials;
}

// Function to load a texture
function loadTexture(gl, imagePath, callback) {
    const texture = gl.createTexture();
    const image = new Image();
    image.src = imagePath;
    image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        callback(texture);
    };
}

// Function to render the model
function render(gl, program, objData, materials, materialName, matrices) {
    // Configure WebGL
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Verify buffer creation
    if (!objData.vertices.length || !objData.indices.length) {
        console.error('No vertex or index data');
        return;
    }

    // Set matrices
    const projectionLocation = gl.getUniformLocation(program, 'projectionMatrix');
    const modelViewLocation = gl.getUniformLocation(program, 'modelViewMatrix');
    const normalMatrixLocation = gl.getUniformLocation(program, 'normalMatrix');

    gl.uniformMatrix4fv(projectionLocation, false, matrices.projectionMatrix);
    gl.uniformMatrix4fv(modelViewLocation, false, matrices.modelViewMatrix);
    gl.uniformMatrix3fv(normalMatrixLocation, false, matrices.normalMatrix);

    const positionBuffer = createBuffer(gl, objData.vertices, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    const normalBuffer = createBuffer(gl, objData.normals, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    const indexBuffer = createBuffer(gl, objData.indices, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);

    // Get material properties
    const material = materials[materialName] || { Kd: [1,1,1] };
    const kdUniformLocation = gl.getUniformLocation(program, 'uKd');
    const lightDirectionUniformLocation = gl.getUniformLocation(program, 'uLightDirection');
    const lightColorUniformLocation = gl.getUniformLocation(program, 'uLightColor');

    // Set material and light properties
    gl.uniform3fv(kdUniformLocation, material.Kd);
    gl.uniform3fv(lightDirectionUniformLocation, [0.0, 0.0, -1.0]);
    gl.uniform3fv(lightColorUniformLocation, [1.0, 1.0, 1.0]);

    // Enable and configure attributes
    const positionLocation = gl.getAttribLocation(program, 'position');
    const normalLocation = gl.getAttribLocation(program, 'normal');

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionLocation);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(normalLocation);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    // Draw
    gl.drawElements(gl.TRIANGLES, objData.indices.length, gl.UNSIGNED_SHORT, 0);
}

// Main function
async function main() {
    try {
        const gl = initializeWebGL('glCanvas');

        const vertexShaderSource = `#version 300 es
        layout(location = 0) in vec3 position;
        layout(location = 1) in vec3 normal;

        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform mat3 normalMatrix;

        out vec3 vNormal;
        out vec3 vPosition;

        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = vec3(modelViewMatrix * vec4(position, 1.0));
            gl_Position = projectionMatrix * vec4(vPosition, 1.0);
        }
        `;

        const fragmentShaderSource = `#version 300 es
        precision mediump float;
        
        uniform vec3 uKd;
        uniform vec3 uLightDirection;
        uniform vec3 uLightColor;

        in vec3 vNormal;
        in vec3 vPosition;

        out vec4 fragColor;

        void main() {
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(uLightDirection);
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * uKd * uLightColor;
            fragColor = vec4(diffuse, 1.0);
        }
        `;

        const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
        gl.useProgram(program);

        // Perspective and view setup
        const projectionMatrix = mat4.perspective(
            mat4.create(), 
            Math.PI / 4, 
            gl.canvas.width / gl.canvas.height, 
            0.1, 
            100.0
        );
        const modelViewMatrix = mat4.lookAt(
            mat4.create(), 
            [0.0, 0.0, 10.0],  // Camera position
            [0.0, 0.0, 0.0],  // Look at origin
            [0.0, 1.0, 0.0]   // Up vector
        );
        const normalMatrix = mat3.normalFromMat4(mat3.create(), modelViewMatrix);

        // Load model data
        const [objResponse, mtlResponse] = await Promise.all([
            fetch('model.obj'),
            fetch('model.mtl')
        ]);

        const objText = await objResponse.text();
        const mtlText = await mtlResponse.text();

        const objData = parseOBJ(objText);
        const materials = parseMTL(mtlText);

        console.log(objData, materials)

        // Render with first material, passing matrices
        render(gl, program, objData, materials, 'Material.001', {
            projectionMatrix, 
            modelViewMatrix,
            normalMatrix
        });

    } catch (error) {
        console.error('Rendering failed:', error);
    }
}

main()