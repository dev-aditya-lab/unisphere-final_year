// Bundler loader for the shader files that ship inside sheryjs (src/shaders/*/*.glsl): the module becomes the shader's
// source text. Registered for `*.glsl` in next.config.mjs, so only the landing page's lazily loaded image effects use it.
module.exports = function glslLoader(source) {
  return `export default ${JSON.stringify(String(source))};`;
};
