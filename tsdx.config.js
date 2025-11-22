const replace = require('@rollup/plugin-replace');

module.exports = {
  rollup(config, options) {
    // tsdx uses replace plugin for process.env.NODE_ENV replacement
    // We need to replace it with one that has preventAssignment: true
    if (config.plugins) {
      // Find the replace plugin and replace it
      // tsdx creates it as: replace({ 'process.env.NODE_ENV': JSON.stringify(env) })
      const env = options.env || process.env.NODE_ENV || 'development';
      
      config.plugins = config.plugins.map((plugin) => {
        // Check if this is the replace plugin
        // Rollup plugins are typically objects with a name property after resolution
        if (plugin && typeof plugin === 'object' && plugin.name === 'replace') {
          // Replace with a new instance that has preventAssignment: true
          // Preserve the original NODE_ENV replacement
          return replace({
            'process.env.NODE_ENV': JSON.stringify(env),
            preventAssignment: true,
          });
        }
        return plugin;
      });
    }

    return config;
  },
};

