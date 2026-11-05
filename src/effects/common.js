// A plain vertex shader shared by several effects. It does the minimum every
// surface shader needs: position the vertex on screen and pass world-space
// data along to the fragment shader through "varyings".
export const surfaceVertex = /* glsl */ `
varying vec3 vWorldPos;    // where this point is in the world
varying vec3 vWorldNormal; // which way the surface faces, in world space
varying vec3 vObjPos;      // position on the object itself (sticks when it spins)
varying vec2 vUv;          // UV coordinates, like the UV map in Blender

void main() {
  // 1. object space -> world space (applies the object's move/rotate/scale)
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  // 2. rotate the normal the same way (fine because our scale is uniform)
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vObjPos = position;
  vUv = uv;
  // 3. world -> camera -> screen. gl_Position is the required output.
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
