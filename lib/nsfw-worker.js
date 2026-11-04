const { parentPort } = require('node:worker_threads');
const tf = require('@tensorflow/tfjs');
const nsfw = require('nsfwjs');
const sharp = require('sharp');
let model;
(async () => {
  await tf.setBackend('cpu'); await tf.ready(); model=await nsfw.load('MobileNetV2');
  parentPort.postMessage({ type:'ready' });
})().catch(e => parentPort.postMessage({ type:'error', error:e.message }));
parentPort.on('message', async ({ id, bytes }) => {
  let tensor;
  try {
    const data=await sharp(Buffer.from(bytes),{limitInputPixels:40000000, animated:false}).resize(224,224,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
    tensor=tf.tensor3d(new Int32Array(data),[224,224,3],'int32');
    const results=await model.classify(tensor);
    parentPort.postMessage({ type:'result', id, results });
  } catch(e) { parentPort.postMessage({ type:'result', id, error:e.message }); }
  finally { if (tensor) tensor.dispose(); }
});
