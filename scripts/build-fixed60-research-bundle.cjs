'use strict';
// Deterministic browser packaging for the existing opt-in fixed60 research.
// This script does NOT activate the pilot or alter the shipping HTML.
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'../tests/research');
const MODULES=[
  'fixed-step-dom-input.cjs',
  'fixed-step-browser-events.cjs',
  'fixed-step-browser-capture.cjs',
  'fixed-step-raf-owner.cjs'
];
function buildBrowserBundle(read=name=>fs.readFileSync(path.join(ROOT,name),'utf8')){
  const entries=MODULES.map(name=>{
    const source=read(name);
    if(typeof source!=='string'||!source.trim())throw Error('empty fixed60 module: '+name);
    // All imports must stay inside this explicitly audited four-module graph.
    const imports=[...source.matchAll(/\brequire\s*\(\s*(['"])(.*?)\1\s*\)/g)];
    const calls=source.match(/\brequire\s*\(/g)||[];
    if(calls.length!==imports.length)
      throw Error('dynamic fixed60 browser import in '+name);
    for(const [, ,requested] of imports){
      if(!requested.startsWith('./')||!MODULES.includes(requested.slice(2)))
        throw Error('unapproved fixed60 browser import: '+requested+' in '+name);
    }
    return JSON.stringify(name)+':function(require,module,exports){\n'+source+'\n}';
  });
  return [
    '/* Generated fixed60 research browser bundle. NOT enabled in production. */',
    '(function(root){',
    "'use strict';",
    'const factories={'+entries.join(',\n')+'};',
    'const cache=Object.create(null);',
    'function load(name){',
    "  if(name.startsWith('./'))name=name.slice(2);",
    "  if(!Object.prototype.hasOwnProperty.call(factories,name))throw Error('Unknown fixed60 module: '+name);",
    '  if(cache[name])return cache[name].exports;',
    '  const module={exports:{}};cache[name]=module;',
    '  try{factories[name](load,module,module.exports)}catch(error){delete cache[name];throw error}',
    '  return module.exports;',
    '}',
    "const api=load('fixed-step-raf-owner.cjs');",
    "root.__novaFixed60Research=Object.freeze({",
    '  FixedStepRafOwner:api.FixedStepRafOwner,',
    '  createFixedStepBrowserPilot:api.createFixedStepBrowserPilot,',
    '  STEP_MS:api.STEP_MS',
    '});',
    "})(typeof window!=='undefined'?window:globalThis);",
    ''
  ].join('\n');
}
if(require.main===module){
  const target=path.resolve(__dirname,'../nova-updates/fixed60-research-browser.js');
  fs.writeFileSync(target,buildBrowserBundle(),'utf8');
  console.log('Built opt-in fixed60 browser research bundle');
}
module.exports={buildBrowserBundle,MODULES};
