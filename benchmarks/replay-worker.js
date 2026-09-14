import {replayStages} from './replay-engine.js';
self.onmessage=({data})=>{
 try {self.postMessage({result:replayStages(data,p=>self.postMessage({progress:p}))});}
 catch(error){self.postMessage({error:error.message});}
};
