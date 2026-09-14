// Deterministic fixtures. Optical signal simulation, not human accuracy evidence.
export function makeSynthetic({bpm=72, variability=0, noise=0.03, seed=7, duration=600}={}) {
  let state=seed>>>0;
  const rand=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296-0.5;};
  const beats=[0];
  while(beats.at(-1)<duration+3) beats.push(beats.at(-1)+60/bpm+variability*Math.sin(2*Math.PI*0.1*beats.at(-1)));
  let index=0;
  return {beats, sample(t) {
    while(index<beats.length-2 && beats[index+1]<=t) index++;
    const phase=2*Math.PI*(t-beats[index])/(beats[index+1]-beats[index]);
    const pulse=Math.cos(phase)+0.15*Math.cos(2*phase-0.4);
    const rgb=[140+0.7*pulse,120+2*pulse,95+0.3*pulse].map(v=>v+noise*rand());
    return rgb;
  }};
}
